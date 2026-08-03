#!/usr/bin/env python3
"""
Fetches FII/DII trading activity, insider-trading (SEBI PIT) disclosures,
market-breadth (advances/declines), and Nifty 50 / Bank Nifty / sector
heatmap data from NSE India's own public reports and writes clean JSON
files that market-intelligence.html reads client-side:
  data/fii-dii.json
  data/insider-trading.json
  data/market-breadth.json
  data/heatmap.json

Run manually:
    python3 scripts/fetch_market_data.py --debug

Runs automatically on a daily schedule via:
    .github/workflows/market-data.yml

Why the homepage visit first: NSE's public /api/* endpoints sit behind a
light bot-check that just wants a real browser User-Agent and a session
cookie picked up from a normal page load first -- exactly what happens
when you click "Download (.csv)" on nseindia.com yourself. This script
does the same two steps a browser does: load the homepage once, then
request the data with the cookies that gives you.

If NSE tweaks their anti-bot behaviour or a response shape, this is the
file to fix. Run with --debug to print the raw payloads in the logs.

=== 2026 fix notes (read this if insider-trading.json is empty again) ===
The original version of this script called
  /api/corporate-filings-insider-trading
which never returned data -- it silently failed on every scheduled run
(the try/except in main() swallowed the error, so data/insider-trading.json
sat at {"updated": null, "rows": []} since the file was created).

This version fixes that by using NSE's own published RSS feed for this
exact report as the primary source, since it's a static file (no session
dance, less likely to be bot-gated) and it's the same feed linked from
the "Click here for RSS" link on:
  https://www.nseindia.com/companies-listing/corporate-filings-insider-trading
  -> https://nsearchives.nseindia.com/content/RSS/InsiderTrading.xml

The RSS <title>/<description> text isn't a clean structured record (it's
prose), so we parse it best-effort with regex and always keep the raw
disclosure text as a fallback so a row is never blank. If NSE changes the
RSS item wording, adjust the KEYWORDS lists and QTY_RE below -- run with
--debug to see exactly what NSE is sending before you change the regex.

As a second line of defence, we also try two JSON API path variants
NSE has used for this report historically. If RSS ever goes away, remove
the "raise" at the end of build_insider_trading and let the JSON variants
carry it alone.
"""

import argparse
import json
import re
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime, date, timedelta
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"

BASE = "https://www.nseindia.com"
ARCHIVES = "https://nsearchives.nseindia.com"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.nseindia.com/",
}


def get_session() -> requests.Session:
    """Pick up the cookies NSE expects before an /api/* call will answer."""
    s = requests.Session()
    s.headers.update(HEADERS)
    s.get(BASE, timeout=15)
    time.sleep(1)
    # A second, more specific page load makes the session look more like
    # a real visit and helps avoid an occasional empty first response.
    s.get(f"{BASE}/market-data/live-equity-market", timeout=15)
    time.sleep(1)
    return s


def fetch_json(session: requests.Session, path: str):
    r = session.get(f"{BASE}{path}", timeout=15)
    r.raise_for_status()
    return r.json()


def build_fii_dii(session: requests.Session, debug: bool):
    raw = fetch_json(session, "/api/fiidiiTradeReact")
    if debug:
        print("RAW /api/fiidiiTradeReact:", json.dumps(raw[:4], indent=2))

    rows = []
    for entry in raw:
        rows.append({
            "date": entry.get("date"),
            "category": (entry.get("category") or "").strip(),
            "buyValue": entry.get("buyValue"),
            "sellValue": entry.get("sellValue"),
            "netValue": entry.get("netValue"),
        })

    return {"updated": datetime.utcnow().isoformat() + "Z", "rows": rows}


# ---------------------------------------------------------------------------
# INSIDER TRADING (SEBI PIT disclosures)
# ---------------------------------------------------------------------------

# Keyword buckets used to pull a rough person-category / transaction-mode out
# of the free-text RSS title+description. Order matters -- first match wins.
# These are informed guesses about NSE's usual disclosure wording; widen them
# if --debug output shows real phrasings slipping through uncategorised.
PERSON_CATEGORY_KEYWORDS = [
    "Promoter Group", "Promoter", "Director", "Designated Person",
    "Key Managerial Personnel", "KMP", "Immediate Relative", "Employee",
]
TRANSACTION_KEYWORDS = [
    "Market Purchase", "Market Sale", "Off Market", "Inter-se Transfer",
    "Preferential Allotment", "ESOP Exercise", "ESOP", "Gift",
    "Pledge Invocation", "Pledge", "Acquisition", "Disposal",
    "Purchase", "Sale", "Subscription",
]
QTY_RE = re.compile(
    r"([\d][\d,]*)\s*(?:equity\s*)?shares?\b|"
    r"([\d][\d,]*)\s*securities\b",
    re.IGNORECASE,
)


def _first_keyword(text: str, keywords):
    lowered = text.lower()
    for kw in keywords:
        if kw.lower() in lowered:
            return kw
    return ""


def parse_insider_rss(xml_text: str, debug: bool = False):
    """Best-effort parse of NSE's InsiderTrading.xml RSS feed into rows.

    RSS items are prose, not a clean schema, so every field below is a
    heuristic extraction with a safe fallback to the raw text -- a row is
    never dropped just because we couldn't categorise it perfectly.
    """
    rows = []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as e:
        if debug:
            print(f"RSS parse error: {e}")
        return rows

    items = root.findall(".//item")
    if debug:
        print(f"RSS <item> count: {len(items)}")

    for item in items:
        title = (item.findtext("title") or "").strip()
        desc = (item.findtext("description") or "").strip()
        pub = (item.findtext("pubDate") or "").strip()
        combined = f"{title} {desc}".strip()
        if not combined:
            continue

        # Company name is usually the leading segment before a " - " or "-".
        company = ""
        for sep in (" - ", " – ", "-"):
            if sep in title:
                company = title.split(sep)[0].strip()
                break
        if not company:
            company = title[:60].strip() or "—"

        qty = ""
        m = QTY_RE.search(combined)
        if m:
            qty = m.group(1) or m.group(2) or ""

        category = _first_keyword(combined, PERSON_CATEGORY_KEYWORDS) or "—"
        mode = _first_keyword(combined, TRANSACTION_KEYWORDS)
        transaction_display = mode if mode else (desc or title)[:90]

        rows.append({
            "date": pub or "—",
            "company": company,
            "personCategory": category,
            "transactionType": transaction_display or "—",
            "quantity": qty or "—",
        })

    if debug and rows:
        print("Sample parsed RSS row:", json.dumps(rows[0], indent=2))
    return rows


def build_insider_trading(session: requests.Session, debug: bool):
    # --- Strategy 1: NSE's own published RSS feed for this exact report ---
    # This is the feed linked as "Click here for RSS" on NSE's insider
    # trading page. It's a static file on the archives subdomain, so it
    # generally doesn't need the /api/* session dance -- but we already
    # have a warmed-up session at this point, so use it anyway.
    try:
        r = session.get(f"{ARCHIVES}/content/RSS/InsiderTrading.xml", timeout=15)
        r.raise_for_status()
        rows = parse_insider_rss(r.text, debug)
        if rows:
            return {
                "updated": datetime.utcnow().isoformat() + "Z",
                "rows": rows[:25],
                "source": "rss",
            }
        elif debug:
            print("RSS feed reachable but produced 0 rows; falling back to JSON API")
    except Exception as e:
        print(f"Insider trading RSS fetch failed: {e}", file=sys.stderr)

    # --- Strategy 2: JSON API path variants ---
    # NSE renames/reshapes this endpoint periodically. If both of these
    # fail, open the insider trading page in a browser, DevTools > Network
    # > XHR, click "Download (.csv)", copy the exact request URL, and add
    # it to this list.
    today = date.today().strftime("%d-%m-%Y")
    from_date = (date.today() - timedelta(days=14)).strftime("%d-%m-%Y")
    candidate_paths = [
        f"/api/corporate-filings-pit?index=equities&from_date={from_date}&to_date={today}",
        f"/api/corporate-filings-insider-trading?index=equities&from_date={from_date}&to_date={today}",
    ]

    last_error = None
    for path in candidate_paths:
        try:
            raw = fetch_json(session, path)
            if debug:
                print(f"RAW {path}:", json.dumps(raw, indent=2)[:2000])
            data = raw.get("data", raw) if isinstance(raw, dict) else raw
            rows = []
            for entry in (data or [])[:25]:
                rows.append({
                    "date": entry.get("date") or entry.get("acqfromDt") or entry.get("intimDt") or entry.get("broadcastDate"),
                    "company": entry.get("company") or entry.get("companyName") or entry.get("symbol"),
                    "personCategory": entry.get("personCategory") or entry.get("category"),
                    "transactionType": entry.get("acqMode") or entry.get("transactionType") or entry.get("secType"),
                    "quantity": entry.get("secAcq") or entry.get("securitiesAcquired") or entry.get("secVal"),
                })
            if rows:
                return {
                    "updated": datetime.utcnow().isoformat() + "Z",
                    "rows": rows,
                    "source": path,
                }
        except Exception as e:
            last_error = e
            print(f"Insider trading fetch failed for {path}: {e}", file=sys.stderr)

    raise RuntimeError(
        f"All insider-trading sources failed (RSS + {len(candidate_paths)} JSON variants). "
        f"Last error: {last_error}"
    )


# ---------------------------------------------------------------------------
# MARKET BREADTH (advances / declines / unchanged)
# ---------------------------------------------------------------------------

def build_market_breadth(session: requests.Session, debug: bool):
    """Advances/declines/unchanged from NSE's all-indices snapshot.

    /api/allIndices returns a "data" array with one entry per index; each
    entry includes advances/declines/unchanged counts for that index's
    constituents. NIFTY 500 is used as the broadest liquid-market breadth
    proxy (falls back to NIFTY 50 if NIFTY 500 isn't present that day).

    Note: this endpoint gives us 2 of the 3 breadth stats shown on the page
    (advances/declines is wired up here). "New 52-week highs vs lows" and
    "% of Nifty 500 above 200-DMA" need different NSE endpoints (and, for
    the 200-DMA one, a rolling historical-price computation across ~500
    stocks) that aren't included in this pass -- see market-intelligence.html
    for the honest "not yet connected" state left on those two cards.
    """
    raw = fetch_json(session, "/api/allIndices")
    data = raw.get("data", []) if isinstance(raw, dict) else (raw or [])
    if debug:
        print("RAW /api/allIndices sample:", json.dumps(data[:2], indent=2))

    target = None
    for wanted in ("NIFTY 500", "NIFTY 50"):
        for entry in data:
            if (entry.get("index") or "").strip().upper() == wanted:
                target = entry
                break
        if target:
            break

    if target is None:
        raise RuntimeError("Could not find NIFTY 500 or NIFTY 50 in /api/allIndices response")

    return {
        "updated": datetime.utcnow().isoformat() + "Z",
        "index": target.get("index"),
        "advances": target.get("advances"),
        "declines": target.get("declines"),
        "unchanged": target.get("unchanged"),
    }


# ---------------------------------------------------------------------------
# HEATMAP DATA (Nifty 50 / Bank Nifty / sector indices)
# ---------------------------------------------------------------------------
# Why this replaces the TradingView Stock Heatmap widget: that widget's
# "dataSource"/"exchanges" options (tried "NIFTY50", "BANKNIFTY", "India",
# and exchange filters for both NSE and BSE) never returned real data for
# India in the free public embed -- either a silent fallback to unrelated
# US mega-caps or an empty "No data match your criteria" state. NSE's own
# /api/equity-stockIndices endpoint is the same one this script already
# uses successfully for FII/DII and market breadth, so it uses the same
# proven session-warming approach instead of depending on a third-party
# widget's undocumented, apparently-unlicensed-for-India behaviour.
SECTOR_INDICES = [
    ("Banking", "NIFTY BANK"),
    ("IT", "NIFTY IT"),
    ("Auto", "NIFTY AUTO"),
    ("Pharma", "NIFTY PHARMA"),
    ("FMCG", "NIFTY FMCG"),
    ("Metals", "NIFTY METAL"),
    ("Energy", "NIFTY ENERGY"),
    ("Realty", "NIFTY REALTY"),
    ("Media", "NIFTY MEDIA"),
    ("Financial Services", "NIFTY FIN SERVICE"),
    ("Healthcare", "NIFTY HEALTHCARE INDEX"),
    ("Consumer Durables", "NIFTY CONSUMER DURABLES"),
    ("PSU Banks", "NIFTY PSU BANK"),
]


def fetch_index_constituents(session: requests.Session, index_name: str, debug: bool = False):
    """One call to /api/equity-stockIndices returns every constituent of the
    named NSE index with its live price and % change. Used for NIFTY 50,
    NIFTY BANK, and each sector index in SECTOR_INDICES."""
    from urllib.parse import quote
    path = f"/api/equity-stockIndices?index={quote(index_name)}"
    raw = fetch_json(session, path)
    rows = raw.get("data", []) if isinstance(raw, dict) else (raw or [])
    if debug:
        print(f"RAW {path} sample:", json.dumps(rows[:2], indent=2))

    out = []
    for entry in rows:
        symbol = entry.get("symbol")
        # The index summary row itself (symbol == the index name) isn't a
        # constituent stock -- skip it.
        if not symbol or symbol.strip().upper() == index_name.strip().upper():
            continue
        out.append({
            "symbol": symbol,
            "price": entry.get("lastPrice"),
            "pChange": entry.get("pChange"),
            # ffmc = free-float market cap, when NSE includes it; used as a
            # rough weight for box sizing. Falls back to equal sizing
            # client-side if missing.
            "weight": entry.get("ffmc"),
        })
    return out


def build_heatmap(session: requests.Session, debug: bool):
    nifty50 = fetch_index_constituents(session, "NIFTY 50", debug)
    bank_nifty = fetch_index_constituents(session, "NIFTY BANK", debug)

    sectors = []
    for label, index_name in SECTOR_INDICES:
        try:
            stocks = fetch_index_constituents(session, index_name, debug)
            if stocks:
                sectors.append({"name": label, "stocks": stocks})
            time.sleep(0.5)  # be polite between the extra sector calls
        except Exception as e:
            print(f"Sector fetch failed for {index_name}: {e}", file=sys.stderr)

    if not nifty50 and not bank_nifty and not sectors:
        raise RuntimeError("Heatmap fetch returned nothing for Nifty 50, Bank Nifty, or any sector")

    return {
        "updated": datetime.utcnow().isoformat() + "Z",
        "nifty50": nifty50,
        "bankNifty": bank_nifty,
        "sectors": sectors,
    }


def write_json(name: str, payload: dict):
    DATA_DIR.mkdir(exist_ok=True)
    path = DATA_DIR / name
    path.write_text(json.dumps(payload, indent=2))
    row_count = len(payload.get("rows", [])) if "rows" in payload else "n/a"
    print(f"wrote {path} (rows={row_count})")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--debug", action="store_true", help="print raw NSE payloads")
    args = parser.parse_args()

    session = get_session()
    failures = 0
    total = 4

    try:
        write_json("heatmap.json", build_heatmap(session, args.debug))
    except Exception as e:
        failures += 1
        print(f"Heatmap fetch failed, leaving last good file in place: {e}", file=sys.stderr)

    try:
        write_json("fii-dii.json", build_fii_dii(session, args.debug))
    except Exception as e:
        failures += 1
        print(f"FII/DII fetch failed, leaving last good file in place: {e}", file=sys.stderr)

    try:
        write_json("insider-trading.json", build_insider_trading(session, args.debug))
    except Exception as e:
        failures += 1
        print(f"Insider trading fetch failed, leaving last good file in place: {e}", file=sys.stderr)

    try:
        write_json("market-breadth.json", build_market_breadth(session, args.debug))
    except Exception as e:
        failures += 1
        print(f"Market breadth fetch failed, leaving last good file in place: {e}", file=sys.stderr)

    # Don't fail the whole Action unless every feed broke -- the site should
    # still show whichever ones succeeded.
    if failures == total:
        sys.exit(1)


if __name__ == "__main__":
    main()
