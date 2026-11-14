"""
IPO details for ipo-gmp.html, pulled from NSE and BSE's public IPO pages.

Writes data/ipo-details.json. It is called from fetch_market_data.py, so it
runs on the same GitHub Actions schedule and reuses the same NSE session.

NSE (primary -- has symbols, lot size, issue size and live subscription):
  /api/ipo-current-issue                  -> IPOs open right now (+ subscription)
  /api/all-upcoming-issues?category=ipo   -> IPOs announced but not yet open
  /api/ipo-detail?symbol=X&series=EQ|SME  -> price band, lot size, issue size
  /api/holiday-master?type=trading        -> trading holidays, for the listing estimate

BSE (second source -- adds BSE SME IPOs that never appear on NSE, and is the
backup for mainboard IPOs when NSE blocks the GitHub runner):
  1. api.bseindia.com .../GetPublicIssue_par_updated/w   (JSON; often refused to cloud IPs)
  2. beta.bseindia.com/markets/PublicIssues/IPOIssues_new.aspx?id=1&Type=p
     -- BSE's own public-issues page. A plain GET lists live issues; posting
        its form with "Forthcoming" lists upcoming ones. Parsed with the
        standard library only, so the workflow needs no new packages.

GMP is NOT here. No exchange publishes it -- it is filled in by hand in
data/ipo-gmp.json and the page joins the two by each IPO's "key".

Safety rules:
  * If BOTH exchanges fail, the last good file is kept untouched.
  * If ONE fails, its IPOs from the last good file are carried over, so a
    blocked exchange never makes live IPOs disappear from the page.
  * IPOs that have closed stay on the list until their (expected) listing
    day, because that is exactly when people look up GMP.
  * The exchanges are only asked every REFRESH_MINUTES, not on every
    15-minute market run. A failed attempt does not reset that clock, so
    the next run (15 min later in market hours) simply tries again.

Run on its own (prints instead of writing):
    python3 scripts/ipo_data.py --debug --dry-run
"""

import json
import re
import sys
import time
from datetime import date, datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_FILE = REPO_ROOT / "data" / "ipo-details.json"

IST = timezone(timedelta(hours=5, minutes=30))
REFRESH_MINUTES = 110          # ~ every 2 hours during the market-data runs
MAX_DETAIL_CALLS = 25          # never hammer NSE with per-IPO requests
KEEP_DAYS_AFTER_LISTING = 1    # drop an IPO the day after it lists

NSE = "https://www.nseindia.com"
NSE_IPO_PAGE = NSE + "/market-data/all-upcoming-issues-ipo"
BSE_API = "https://api.bseindia.com/BseIndiaAPI/api/GetPublicIssue_par_updated/w"
BSE_PAGE = "https://beta.bseindia.com/markets/PublicIssues/IPOIssues_new.aspx?id=1&Type=p"
BROWSER_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

# ---------------------------------------------------------------------------
# small parsers (pure functions -- covered by tests/test_ipo_data.py)
# ---------------------------------------------------------------------------

_DATE_FORMATS = ("%d-%b-%Y", "%d-%B-%Y", "%d %b %Y", "%d %B %Y", "%d-%m-%Y", "%d/%m/%Y", "%Y-%m-%d")


def parse_date(value):
    """'21-May-2026' / '21-MAY-2026' / '21-05-2026' / '2026-05-21T00:00:00' -> date, else None."""
    if not value:
        return None
    s = str(value).strip()
    m = re.search(r"\d{4}-\d{2}-\d{2}|\d{1,2}[-/ ][A-Za-z]{3,9}[-/ ]\d{4}|\d{1,2}[-/]\d{1,2}[-/]\d{4}", s)
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
    """'Rs.290 to Rs.302' / '62.00 - 66.00' / '95-100' -> (lo, hi); 'Rs.55' -> (55, 55)."""
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
    if unit.startswith("m"):
        v = v / 10
    elif unit.startswith("l"):
        v = v / 100
    elif unit.startswith("b"):
        v = v * 100
    return round(v, 2)


def board_of(value):
    return "SME" if "SME" in str(value or "").upper() else "Mainboard"


_NAME_DROP = {"limited", "ltd", "pvt", "private", "the", "co", "company", "corp", "corporation", "inc"}


def norm_name(name):
    """'Sona Selection India Ltd.' and 'SONA SELECTION INDIA LIMITED' -> 'sona selection india'."""
    s = str(name or "").lower().replace("&", " and ")
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    return " ".join(w for w in s.split() if w not in _NAME_DROP)


def pretty_name(name):
    """BSE writes names in capitals: 'MOCK TEXTILES LIMITED' -> 'Mock Textiles Limited'."""
    name = re.sub(r"\s+", " ", str(name or "")).strip()
    return name.title() if name.isupper() else name


def slug(name):
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", norm_name(name))).strip("-")


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


def _blank(name, board):
    return {
        "key": None, "symbol": None, "bseCode": None, "name": name, "type": board,
        "series": "SME" if board == "SME" else "EQ",
        "priceLow": None, "priceHigh": None, "lotSize": None, "issueSizeCr": None,
        "open": None, "close": None, "listing": None, "subscriptionTimes": None,
        "exchanges": [], "sources": [],
    }


# --- NSE ------------------------------------------------------------------

def parse_nse_detail(raw):
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


def nse_row_to_ipo(row, from_current):
    name = (row.get("companyName") or row.get("company") or "").strip()
    if not name:
        return None
    board = board_of(row.get("series") or row.get("securityType"))
    ipo = _blank(name, board)
    lo, hi = parse_price_band(row.get("issuePrice") or row.get("priceBand"))
    ipo.update({
        "symbol": (row.get("symbol") or "").strip().upper() or None,
        "priceLow": lo, "priceHigh": hi,
        "lotSize": parse_lot_size(row.get("lotSize") or row.get("minBidQuantity")),
        "issueSizeCr": parse_issue_size_cr(row.get("issueSize")),
        "open": parse_date(row.get("issueStartDate") or row.get("ipoStartDate")),
        "close": parse_date(row.get("issueEndDate") or row.get("ipoEndDate")),
        "subscriptionTimes": _num(row.get("noOfTime")) if from_current else None,
        "exchanges": ["NSE"] + (["BSE"] if str(row.get("isBse") or "").strip() == "1" else []),
        "sources": ["NSE"],
    })
    return ipo


def merge_nse_feeds(current, upcoming):
    """Current wins over upcoming (NSE's upcoming feed also lists open issues)."""
    by_key = {}
    for from_current, rows in ((False, upcoming), (True, current)):
        for row in rows or []:
            if not isinstance(row, dict):
                continue
            ipo = nse_row_to_ipo(row, from_current)
            if not ipo:
                continue
            key = ipo["symbol"] or norm_name(ipo["name"])
            prev = by_key.get(key)
            if prev:
                for k, v in ipo.items():
                    if v not in (None, [], ""):
                        prev[k] = v
            else:
                by_key[key] = ipo
    return list(by_key.values())


# --- BSE ------------------------------------------------------------------

BSE_KINDS = {"IPO"}            # book-built public issue
BSE_FIXED = {"FPO"}            # "Public Issue-Fixed Price": SME IPOs are usually fixed price


def _bse_is_ipo(kind, platform):
    k = str(kind or "").strip().upper()
    return k in BSE_KINDS or (k in BSE_FIXED and board_of(platform) == "SME")


def bse_json_to_ipos(data):
    table = data.get("Table") if isinstance(data, dict) else data
    if not isinstance(table, list):
        raise ValueError("BSE API: no Table list")
    out = []
    for r in table:
        if not isinstance(r, dict) or not _bse_is_ipo(r.get("IR_flag") or r.get("IR_FLAG"), r.get("eXCHANGE_PLATFORM")):
            continue
        name = pretty_name(r.get("LONG_NAME") or r.get("Scrip_Name"))
        if not name:
            continue
        ipo = _blank(name, board_of(r.get("eXCHANGE_PLATFORM")))
        lo, hi = parse_price_band(r.get("Price_Band"))
        ipo.update({
            "bseCode": (str(r.get("Scrip_Name") or "").strip().upper() or None),
            "priceLow": lo, "priceHigh": hi,
            "open": parse_date(r.get("Start_Dt")), "close": parse_date(r.get("End_Dt")),
            "exchanges": ["BSE"], "sources": ["BSE"],
        })
        if ipo["open"] or ipo["close"]:
            out.append(ipo)
    return out


class _TableRows(HTMLParser):
    """Collects every <tr>'s DIRECT cells (BSE nests its data table inside layout tables)."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rows = []
        self._stack = []          # one entry per open <table>: the row being built in it, or None
        self._cell = None         # [text parts, hrefs] of the open direct cell

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self._stack.append(None)
        elif tag == "tr" and self._stack:
            self._stack[-1] = []
        elif tag in ("td", "th") and self._stack and self._stack[-1] is not None:
            self._cell = [[], []]
            self._stack[-1].append(self._cell)
        elif tag == "a" and self._cell is not None:
            href = dict(attrs).get("href")
            if href:
                self._cell[1].append(href)

    def handle_endtag(self, tag):
        if tag in ("td", "th"):
            self._cell = None
        elif tag == "tr" and self._stack and self._stack[-1] is not None:
            row = self._stack[-1]
            self.rows.append([(re.sub(r"\s+", " ", "".join(c[0])).strip(), c[1]) for c in row])
            self._stack[-1] = None
        elif tag == "table" and self._stack:
            self._stack.pop()
            self._cell = None

    def handle_data(self, data):
        if self._cell is not None:
            self._cell[0].append(data)


def parse_bse_page(html):
    """BSE public-issues table -> IPO records.
    Columns: 0 Security Name | 1 Exchange Platform | 2 Start | 3 End | 4 Offer Price |
             5 Face Value | 6 Type of Issue | 7 Issue Status"""
    p = _TableRows()
    p.feed(html or "")
    out, seen = [], set()
    for cells in p.rows:
        if len(cells) < 8:
            continue
        name, platform, start, end, price, _fv, kind, status = (c[0] for c in cells[:8])
        if not name or name.lower() in ("security name", "security", "company name"):
            continue
        if not _bse_is_ipo(kind, platform) or "withdraw" in status.lower():
            continue
        o, c = parse_date(start), parse_date(end)
        if not (o or c):
            continue
        key = (norm_name(name), o, c)
        if key in seen:
            continue
        seen.add(key)
        ipo = _blank(pretty_name(name), board_of(platform))
        lo, hi = parse_price_band(price)
        m = re.search(r"IPONo=(\d+)", " ".join(cells[0][1]), re.IGNORECASE)
        ipo.update({"priceLow": lo, "priceHigh": hi, "open": o, "close": c,
                    "bseIpoNo": m.group(1) if m else None,
                    "exchanges": ["BSE"], "sources": ["BSE"]})
        out.append(ipo)
    return out


def bse_form_state(html):
    """Hidden ASP.NET fields the page's own Submit button posts back."""
    fields = {}
    for tag in re.findall(r"<input[^>]+>", html or "", re.IGNORECASE):
        if 'type="hidden"' not in tag.lower():
            continue
        n = re.search(r'name="([^"]+)"', tag)
        v = re.search(r'value="([^"]*)"', tag)
        if n:
            fields[n.group(1)] = v.group(1) if v else ""
    if "__VIEWSTATE" not in fields:
        raise ValueError("BSE page: no form state (page layout changed?)")
    return fields


def bse_form_post(state, status):
    data = dict(state)
    p = "ctl00$ContentPlaceHolder1$"
    data.update({
        p + "ddlExchPlatform": "0",     # All
        p + "ddlIssueType": "0",        # All (we filter IPOs ourselves)
        p + "rblIssueStatus": status,   # L = live, F = forthcoming
        p + "ScripName": "", p + "txtFromDate": "", p + "txtIssuetype": "",
        p + "btnSubmit": "Submit",
    })
    return data


# --- merging --------------------------------------------------------------

def _same_issue(a, b):
    na, nb = norm_name(a["name"]), norm_name(b["name"])
    if na and na == nb:
        return True
    # names differ slightly between exchanges ("XYZ Infra Projects" vs "XYZ Infraprojects")
    if a.get("open") and a.get("open") == b.get("open") and a.get("type") == b.get("type"):
        wa, wb = na.split(), nb.split()
        return bool(wa and wb and wa[0] == wb[0] and (len(wa[0]) >= 4 or wa[:2] == wb[:2]))
    return False


def merge_sources(nse_ipos, bse_ipos):
    """NSE record wins; BSE only fills gaps and adds BSE-only issues."""
    out = [dict(i) for i in nse_ipos]
    for b in bse_ipos:
        match = next((n for n in out if _same_issue(n, b)), None)
        if match is None:
            out.append(dict(b))
            continue
        for k in ("priceLow", "priceHigh", "open", "close", "bseCode", "bseIpoNo"):
            if match.get(k) in (None, "") and b.get(k) not in (None, ""):
                match[k] = b[k]
        match["exchanges"] = sorted(set(match.get("exchanges", [])) | {"BSE"}, key=["NSE", "BSE"].index)
        match["sources"] = sorted(set(match.get("sources", [])) | {"BSE"}, key=["NSE", "BSE"].index)
    for i in out:
        i["key"] = i.get("symbol") or i.get("bseCode") or slug(i["name"]).upper()
    return out


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


def finalise(fresh, previous, holidays, today, failed_sources=()):
    """Fill listing estimates, carry over IPOs we must not lose, drop stale ones, sort.

    An IPO from the last file that is missing now is carried over when
      * it has closed (exchanges drop issues from their live lists after the
        last bid day, but people still want its GMP until listing), or
      * every exchange it came from failed this run (blocked != withdrawn).
    An upcoming IPO that a working exchange no longer lists was most likely
    withdrawn or postponed, so it goes."""
    failed = set(failed_sources)
    previous = [_deserialise(p) for p in (previous or []) if isinstance(p, dict) and p.get("name")]

    # Same IPO seen last time: keep its key (GMP in data/ipo-gmp.json is
    # entered against it) and refill what this run's source can't give --
    # e.g. NSE blocked, BSE answered: BSE has no symbol or lot size.
    for ipo in fresh:
        old = next((p for p in previous if _same_issue(p, ipo)), None)
        if old is None:
            continue
        for k in ("symbol", "bseCode", "bseIpoNo", "lotSize", "issueSizeCr", "priceLow", "priceHigh"):
            if ipo.get(k) in (None, "") and old.get(k) not in (None, ""):
                ipo[k] = old[k]
        ipo["exchanges"] = sorted(set(ipo.get("exchanges") or []) | set(old.get("exchanges") or []),
                                  key=lambda x: ["NSE", "BSE"].index(x) if x in ("NSE", "BSE") else 9)
        if old.get("key"):
            ipo["key"] = old["key"]

    carried = []
    for old in previous:
        if any(_same_issue(old, f) for f in fresh):
            continue
        closed = bool(old.get("close") and old["close"] <= today)
        srcs = set(old.get("sources") or ["NSE"])
        if closed or (srcs and srcs <= failed):
            old.setdefault("key", old.get("symbol") or old.get("bseCode") or slug(old["name"]).upper())
            carried.append(old)

    out = []
    for ipo in list(fresh) + carried:
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

def _nse_get(session, path, debug=False):
    r = session.get(NSE + path, timeout=20,
                    headers={"Referer": NSE_IPO_PAGE, "Accept": "application/json, text/plain, */*"})
    r.raise_for_status()
    data = r.json()
    if debug:
        print(f"RAW NSE {path}:", json.dumps(data, indent=2)[:1500])
    return data


def fetch_nse(session, debug=False):
    """Raises if NSE's lists can't be read."""
    try:   # warm the session on the IPO page itself -- NSE checks Referer/cookies
        session.get(NSE_IPO_PAGE, timeout=20, headers={"Accept": "text/html,application/xhtml+xml"})
        time.sleep(1)
    except Exception as e:
        print(f"NSE IPO page warm-up failed (continuing): {e}", file=sys.stderr)

    current = _nse_get(session, "/api/ipo-current-issue", debug)
    upcoming = _nse_get(session, "/api/all-upcoming-issues?category=ipo", debug)
    if not isinstance(current, list) or not isinstance(upcoming, list):
        raise ValueError("NSE IPO feeds did not return lists")
    ipos = merge_nse_feeds(current, upcoming)

    for ipo in ipos[:MAX_DETAIL_CALLS]:
        if not ipo.get("symbol"):
            continue
        for series in (ipo["series"], "SME" if ipo["series"] == "EQ" else "EQ"):
            try:
                detail = parse_nse_detail(_nse_get(session, f"/api/ipo-detail?symbol={ipo['symbol']}&series={series}", debug))
            except Exception as e:
                if debug:
                    print(f"NSE ipo-detail {ipo['symbol']}/{series} failed: {e}", file=sys.stderr)
                continue
            if detail:
                for k, v in detail.items():
                    if v and not (k in ("open", "close") and ipo.get(k)):
                        ipo[k] = v
                break
        time.sleep(0.5)
    return ipos


def new_bse_session():
    import requests
    s = requests.Session()
    s.headers.update({
        "User-Agent": BROWSER_UA,
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.bseindia.com/",
        "Origin": "https://www.bseindia.com",
    })
    return s


def fetch_bse(session, debug=False):
    """BSE IPOs: JSON API first, BSE's public-issues page if the API is refused. Raises if both fail."""
    errors = []
    try:
        r = session.get(BSE_API, timeout=20, params={"flag": "1", "status": "", "exchange": "", "ir_flag": "IPO"},
                        headers={"Accept": "application/json, text/plain, */*"})
        r.raise_for_status()
        data = r.json()
        if debug:
            print("RAW BSE API:", json.dumps(data, indent=2)[:1500])
        return bse_json_to_ipos(data)
    except Exception as e:
        errors.append(f"api: {e}")

    try:
        r = session.get(BSE_PAGE, timeout=25, headers={"Accept": "text/html,application/xhtml+xml",
                                                        "Referer": "https://beta.bseindia.com/"})
        r.raise_for_status()
        page = r.text
        live = parse_bse_page(page)
        upcoming = []
        try:
            r2 = session.post(BSE_PAGE, data=bse_form_post(bse_form_state(page), "F"), timeout=25,
                              headers={"Referer": BSE_PAGE, "Content-Type": "application/x-www-form-urlencoded"})
            r2.raise_for_status()
            upcoming = parse_bse_page(r2.text)
        except Exception as e:
            print(f"BSE forthcoming list failed (live list still used): {e}", file=sys.stderr)
        if debug:
            print(f"BSE page: {len(live)} live, {len(upcoming)} forthcoming IPO rows")
        if "Security Name" not in page and not live:
            raise ValueError("BSE page did not contain the public-issues table")
        return live + upcoming
    except Exception as e:
        errors.append(f"page: {e}")
    raise RuntimeError("BSE failed (" + "; ".join(errors) + ")")


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


def build_ipo_details(session, debug=False, force=False, bse_session=None):
    """Returns the payload to write, or None when no refresh is due. Raises when
    nothing usable came back, so the caller keeps the last good file."""
    previous = _load_previous()
    if not due_for_refresh(previous, force=force):
        print("IPO details: refreshed recently, skipping this run")
        return None

    health, failed = {}, []
    nse_ipos, bse_ipos = [], []
    try:
        nse_ipos = fetch_nse(session, debug)
        health["NSE"] = {"ok": True, "ipos": len(nse_ipos)}
    except Exception as e:
        failed.append("NSE")
        health["NSE"] = {"ok": False, "error": str(e)[:200]}
        print(f"IPO details: NSE failed: {e}", file=sys.stderr)
    try:
        bse_ipos = fetch_bse(bse_session or new_bse_session(), debug)
        health["BSE"] = {"ok": True, "ipos": len(bse_ipos)}
    except Exception as e:
        failed.append("BSE")
        health["BSE"] = {"ok": False, "error": str(e)[:200]}
        print(f"IPO details: BSE failed: {e}", file=sys.stderr)

    if len(failed) == 2:
        raise RuntimeError("both NSE and BSE failed; keeping the last good file")

    fresh = merge_sources(nse_ipos, bse_ipos)
    today = datetime.now(IST).date()

    if not fresh and previous and previous.get("ipos"):
        # Everything that answered came back empty while the last file still
        # has open/upcoming IPOs -- more likely a blocked/empty response than a
        # genuinely empty market. Keep the last good file.
        still_live = [i for i in previous["ipos"] if status_of(_deserialise(i), today) in ("Open", "Upcoming")]
        if still_live:
            raise ValueError("exchanges returned no IPOs but the last file still has open/upcoming ones; keeping it")

    holidays = set()
    if "NSE" not in failed:
        try:
            holidays = parse_holidays(_nse_get(session, "/api/holiday-master?type=trading", debug))
        except Exception as e:
            print(f"Holiday list unavailable, listing estimate skips weekends only: {e}", file=sys.stderr)
    if not holidays and previous and previous.get("holidays"):
        holidays = {d for d in (parse_date(x) for x in previous["holidays"]) if d}

    ipos = finalise(fresh, (previous or {}).get("ipos"), holidays, today, failed)

    return {
        "updated": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "sources": health,
        "holidays": sorted(d.isoformat() for d in holidays if d >= today - timedelta(days=7)),
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
    s.headers.update({"User-Agent": BROWSER_UA, "Accept-Language": "en-US,en;q=0.9"})
    try:
        s.get(NSE, timeout=20)
    except Exception as e:
        print(f"NSE homepage failed (continuing): {e}", file=sys.stderr)
    payload = build_ipo_details(s, debug=args.debug, force=True)
    text = json.dumps(payload, indent=2)
    if args.dry_run:
        print(text)
    else:
        OUT_FILE.parent.mkdir(exist_ok=True)
        OUT_FILE.write_text(text)
        print(f"wrote {OUT_FILE} (ipos={len(payload['ipos'])})")
