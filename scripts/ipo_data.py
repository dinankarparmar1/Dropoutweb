"""
IPO details for ipo-gmp.html, pulled from NSE's public IPO pages.

Writes data/ipo-details.json. It is called from fetch_market_data.py, so it
runs on the same GitHub Actions schedule and reuses the same NSE session.

Sources (the same JSON calls NSE's own "All Upcoming Issues" page makes):
  /api/ipo-current-issue                  -> IPOs open right now (+ live subscription)
  /api/all-upcoming-issues?category=ipo   -> IPOs announced but not yet open
  /api/ipo-detail?symbol=X&series=EQ|SME  -> price band, lot size, issue size
  /api/holiday-master?type=trading        -> trading holidays, for the listing estimate

GMP is NOT here. NSE does not publish it -- it is filled in by hand in
data/ipo-gmp.json and the page joins the two by symbol.

Safety rules:
  * If NSE fails or answers with nothing usable, the last good file is kept.
  * IPOs that have closed stay on the list until their (expected) listing day,
    because that is exactly when people look up GMP.
  * NSE is only asked every REFRESH_MINUTES, not on every 15-minute market run.

Run on its own (prints instead of writing):
    python3 scripts/ipo_data.py --debug --dry-run
"""

import json
import re
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_FILE = REPO_ROOT / "data" / "ipo-details.json"

IST = timezone(timedelta(hours=5, minutes=30))
REFRESH_MINUTES = 110          # ~ every 2 hours during the market-data runs
MAX_DETAIL_CALLS = 25          # never hammer NSE with per-IPO requests
KEEP_DAYS_AFTER_LISTING = 1    # drop an IPO the day after it lists
IPO_PAGE = "https://www.nseindia.com/market-data/all-upcoming-issues-ipo"

# ---------------------------------------------------------------------------
# small parsers (pure functions -- covered by tests/test_ipo_data.py)
# ---------------------------------------------------------------------------

_DATE_FORMATS = ("%d-%b-%Y", "%d-%B-%Y", "%d %b %Y", "%d/%m/%Y", "%Y-%m-%d")


def parse_date(value):
    """'21-May-2026' / '21-MAY-2026' / '2026-05-21' -> date, else None."""
    if not value:
        return None
    s = str(value).strip()
    m = re.search(r"\d{1,2}[-/ ][A-Za-z]{3,9}[-/ ]\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{4}", s)
    if m:
        s = m.group(0)
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _num(value):
    if value is None:
        return None
    try:
        n = float(str(value).replace(",", "").strip())
    except (TypeError, ValueError):
        return None
    return int(n) if n.is_integer() else n


def parse_price_band(value):
    """'Rs.290 to Rs.302' -> (290, 302); 'Rs.55' -> (55, 55); junk -> (None, None)."""
    if not value:
        return None, None
    nums = [_num(n) for n in re.findall(r"\d[\d,]*(?:\.\d+)?", str(value))]
    nums = [n for n in nums if n]
    if len(nums) >= 2:
        lo, hi = nums[0], nums[1]
        return (lo, hi) if lo <= hi else (hi, lo)
    if len(nums) == 1:
        return nums[0], nums[0]
    return None, None


def parse_lot_size(value):
    """'59 Equity Shares and in multiples thereof' -> 59."""
    if not value:
        return None
    m = re.search(r"(\d[\d,]*)\s*(?:equity\s*)?shares?", str(value), re.IGNORECASE)
    if not m:
        m = re.search(r"^\s*(\d[\d,]*)\s*$", str(value))
    return _num(m.group(1)) if m else None


def parse_issue_size_cr(value):
    """'Rs.1,150.00 crore' -> 1150.0 ; 'Rs.425.5 million' -> 42.55 ; 'Rs.95 lakh' -> 0.95."""
    if not value:
        return None
    m = re.search(r"(\d[\d,]*(?:\.\d+)?)\s*(crores?|cr\b|millions?|mn\b|lakhs?|lacs?|billions?|bn\b)",
                  str(value), re.IGNORECASE)
    if not m:
        return None
    v = float(m.group(1).replace(",", ""))
    unit = m.group(2).lower()
    if unit.startswith(("m",)):
        v = v / 10
    elif unit.startswith(("l",)):
        v = v / 100
    elif unit.startswith(("b",)):
        v = v * 100
    return round(v, 2)


def board_of(series):
    return "SME" if "SME" in str(series or "").upper() else "Mainboard"


def add_trading_days(start, days, holidays):
    """T+N exchange working days after `start`, skipping weekends and holidays."""
    d = start
    left = days
    while left > 0:
        d += timedelta(days=1)
        if d.weekday() < 5 and d not in holidays:
            left -= 1
    return d


def parse_holidays(raw):
    """NSE holiday-master payload -> set of dates (any segment list is accepted)."""
    out = set()
    if isinstance(raw, dict):
        lists = [v for v in raw.values() if isinstance(v, list)]
    elif isinstance(raw, list):
        lists = [raw]
    else:
        lists = []
    for rows in lists:
        for row in rows:
            if isinstance(row, dict):
                d = parse_date(row.get("tradingDate") or row.get("date"))
                if d:
                    out.add(d)
    return out


def parse_detail(raw):
    """/api/ipo-detail payload -> dict with whatever we could read from issueInfo."""
    info = {}
    rows = (((raw or {}).get("issueInfo") or {}).get("dataList")) or []
    for row in rows:
        if isinstance(row, dict) and row.get("title"):
            info[str(row["title"]).strip()] = str(row.get("value") or "")

    def pick(*keys):
        for k in info:
            if any(key.lower() in k.lower() for key in keys):
                return info[k]
        return None

    out = {}
    lo, hi = parse_price_band(pick("Price Range", "Price Band", "Issue Price"))
    if hi:
        out["priceLow"], out["priceHigh"] = lo, hi
    lot = parse_lot_size(pick("Bid Lot", "Market Lot", "Lot Size"))
    if lot:
        out["lotSize"] = lot
    size = parse_issue_size_cr(pick("Issue Size"))
    if size:
        out["issueSizeCr"] = size
    period = pick("Issue Period")
    if period:
        dates = re.findall(r"\d{1,2}-[A-Za-z]{3,9}-\d{4}", period)
        if len(dates) >= 2:
            out["open"] = parse_date(dates[0])
            out["close"] = parse_date(dates[1])
    listing = pick("Listing Date", "Date of Listing")
    if listing and parse_date(listing):
        out["listing"] = parse_date(listing)
    return out


def row_to_ipo(row, status_hint):
    """One row of ipo-current-issue / all-upcoming-issues -> our record (dates as date objects)."""
    name = (row.get("companyName") or row.get("company") or "").strip()
    symbol = (row.get("symbol") or "").strip().upper()
    if not name:
        return None
    lo, hi = parse_price_band(row.get("issuePrice") or row.get("priceBand"))
    ipo = {
        "symbol": symbol or None,
        "name": name,
        "type": board_of(row.get("series") or row.get("securityType")),
        "series": "SME" if board_of(row.get("series")) == "SME" else "EQ",
        "priceLow": lo,
        "priceHigh": hi,
        "lotSize": parse_lot_size(row.get("lotSize") or row.get("minBidQuantity")),
        "issueSizeCr": parse_issue_size_cr(row.get("issueSize")),
        "open": parse_date(row.get("issueStartDate") or row.get("ipoStartDate")),
        "close": parse_date(row.get("issueEndDate") or row.get("ipoEndDate")),
        "listing": None,
        "subscriptionTimes": _num(row.get("noOfTime")) if status_hint == "current" else None,
        "isBse": str(row.get("isBse") or "").strip() == "1",
    }
    return ipo


def merge_feeds(current, upcoming):
    """Current wins over upcoming (NSE's upcoming feed also lists open issues)."""
    by_key = {}
    for status_hint, rows in (("upcoming", upcoming), ("current", current)):
        for row in rows or []:
            if not isinstance(row, dict):
                continue
            ipo = row_to_ipo(row, status_hint)
            if not ipo:
                continue
            key = ipo["symbol"] or ipo["name"].lower()
            prev = by_key.get(key)
            if prev:
                for k, v in ipo.items():
                    if v is not None and v is not False:
                        prev[k] = v
            else:
                by_key[key] = ipo
    return list(by_key.values())


def status_of(ipo, today):
    o, c, l = ipo.get("open"), ipo.get("close"), ipo.get("listing")
    if l and today >= l:
        return "Listed"
    if c and today > c:
        return "Closed"
    if o and today >= o:
        return "Open"
    return "Upcoming"


def _serialise(ipo, today):
    out = dict(ipo)
    for k in ("open", "close", "listing"):
        out[k] = ipo[k].isoformat() if isinstance(ipo.get(k), date) else ipo.get(k)
    out["status"] = status_of(ipo, today)
    return out


def _deserialise(ipo):
    out = dict(ipo)
    for k in ("open", "close", "listing"):
        out[k] = parse_date(out.get(k))
    return out


def finalise(fresh, previous, holidays, today):
    """Fill listing estimates, carry over recently-closed IPOs, drop stale ones, sort."""
    fresh_keys = {(i["symbol"] or i["name"].lower()) for i in fresh}
    carried = []
    for old in previous or []:
        old = _deserialise(old)
        key = old.get("symbol") or (old.get("name") or "").lower()
        # Only carry IPOs that have closed (NSE drops them from its feeds
        # after the last bid day). An upcoming one that vanished was most
        # likely withdrawn or postponed, so it goes.
        if key and key not in fresh_keys and old.get("close") and old["close"] <= today:
            carried.append(old)

    out = []
    for ipo in fresh + carried:
        if ipo.get("close") and not ipo.get("listing"):
            ipo["listing"] = add_trading_days(ipo["close"], 3, holidays)   # SEBI T+3
            ipo["listingEstimated"] = True
        elif ipo.get("listing") and "listingEstimated" not in ipo:
            ipo["listingEstimated"] = False
        if ipo.get("listing") and today > ipo["listing"] + timedelta(days=KEEP_DAYS_AFTER_LISTING):
            continue
        if not ipo.get("listing") and ipo.get("close") and today > ipo["close"] + timedelta(days=10):
            continue
        out.append(ipo)

    order = {"Open": 0, "Upcoming": 1, "Closed": 2, "Listed": 3}
    out.sort(key=lambda i: (order[status_of(i, today)], i.get("open") or date.max, i["name"]))
    return [_serialise(i, today) for i in out]


# ---------------------------------------------------------------------------
# network
# ---------------------------------------------------------------------------

def _get(session, path, debug=False):
    r = session.get(f"https://www.nseindia.com{path}", timeout=20,
                    headers={"Referer": IPO_PAGE, "Accept": "application/json, text/plain, */*"})
    r.raise_for_status()
    data = r.json()
    if debug:
        print(f"RAW {path}:", json.dumps(data, indent=2)[:1500])
    return data


def _load_previous():
    try:
        return json.loads(OUT_FILE.read_text())
    except Exception:
        return None


def due_for_refresh(previous, now=None, force=False):
    if force or not previous or not previous.get("updated"):
        return True
    try:
        last = datetime.fromisoformat(previous["updated"].replace("Z", "+00:00"))
    except ValueError:
        return True
    now = now or datetime.now(timezone.utc)
    return (now - last) >= timedelta(minutes=REFRESH_MINUTES)


def build_ipo_details(session, debug=False, force=False):
    """Returns the payload to write, or None when no refresh is due."""
    previous = _load_previous()
    if not due_for_refresh(previous, force=force):
        print("IPO details: refreshed recently, skipping this run")
        return None

    # Warm the session on the IPO page itself -- NSE checks the Referer/cookies.
    try:
        session.get(IPO_PAGE, timeout=20, headers={"Accept": "text/html,application/xhtml+xml"})
        time.sleep(1)
    except Exception as e:  # the API call below will tell us if this mattered
        print(f"IPO page warm-up failed (continuing): {e}", file=sys.stderr)

    current = _get(session, "/api/ipo-current-issue", debug)
    upcoming = _get(session, "/api/all-upcoming-issues?category=ipo", debug)
    if not isinstance(current, list) or not isinstance(upcoming, list):
        raise ValueError("NSE IPO feeds did not return lists")

    fresh = merge_feeds(current, upcoming)

    for ipo in fresh[:MAX_DETAIL_CALLS]:
        if not ipo.get("symbol"):
            continue
        for series in (ipo["series"], "SME" if ipo["series"] == "EQ" else "EQ"):
            try:
                detail = parse_detail(_get(session, f"/api/ipo-detail?symbol={ipo['symbol']}&series={series}", debug))
            except Exception as e:
                if debug:
                    print(f"ipo-detail {ipo['symbol']}/{series} failed: {e}", file=sys.stderr)
                continue
            if detail:
                for k, v in detail.items():
                    if v and not (k in ("open", "close") and ipo.get(k)):
                        ipo[k] = v
                break
        time.sleep(0.5)

    holidays = set()
    try:
        holidays = parse_holidays(_get(session, "/api/holiday-master?type=trading", debug))
    except Exception as e:
        print(f"Holiday list unavailable, listing estimate skips weekends only: {e}", file=sys.stderr)

    today = datetime.now(IST).date()
    if not fresh and previous and previous.get("ipos"):
        # Both feeds came back empty while we still had IPOs that should be
        # open or upcoming -- more likely a blocked/empty response than a
        # genuinely empty market. Keep the last good file.
        still_live = [i for i in previous["ipos"] if status_of(_deserialise(i), today) in ("Open", "Upcoming")]
        if still_live:
            raise ValueError("NSE returned no IPOs but the last file still has open/upcoming ones; keeping it")

    ipos = finalise(fresh, (previous or {}).get("ipos"), holidays, today)

    return {
        "updated": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": "NSE India (nseindia.com) public IPO data",
        "ipos": ipos,
    }


if __name__ == "__main__":
    import argparse
    import requests

    ap = argparse.ArgumentParser()
    ap.add_argument("--debug", action="store_true")
    ap.add_argument("--dry-run", action="store_true", help="print instead of writing the file")
    args = ap.parse_args()

    s = requests.Session()
    s.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
    })
    s.get("https://www.nseindia.com", timeout=20)
    payload = build_ipo_details(s, debug=args.debug, force=True)
    text = json.dumps(payload, indent=2)
    if args.dry_run:
        print(text)
    else:
        OUT_FILE.parent.mkdir(exist_ok=True)
        OUT_FILE.write_text(text)
        print(f"wrote {OUT_FILE} (ipos={len(payload['ipos'])})")
