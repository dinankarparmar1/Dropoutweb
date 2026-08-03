#!/usr/bin/env python3
"""
Fetches FII/DII trading activity, insider-trading (SEBI PIT) disclosures, and
market-breadth (advances/declines, 52-week highs/lows, % above 200-DMA) and
writes clean JSON files that market-intelligence.html reads client-side:
  data/fii-dii.json
  data/insider-trading.json
  data/market-breadth.json

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

=== 52-week highs/lows and % above 200-DMA ===
Getting these "properly" would mean maintaining our own ~252-trading-day
price history cache for all ~500 Nifty 500 stocks (backfilling months of
daily bhavcopy files, then updating it incrementally forever). Instead we
lean on TradingView's public screener/scanner endpoint, which already
computes SMA200 and the rolling 52-week high/low server-side per symbol --
the same endpoint TradingView's own website screener uses, no auth needed
(see https://github.com/AnalyzerREST/python-tradingview-ta for a working
reference implementation of this exact call). We batch the Nifty 500
constituent list (from NSE's own published CSV) through it and compute
the breadth stats from the results. This avoids us ever needing to store
or reconstruct historical prices ourselves.
"""

import argparse
import csv
import io
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


def _strip_ns(tag: str) -> str:
    """'{http://some/namespace}item' -> 'item'. NSE's feed may or may not
    declare a default xmlns; ElementTree's .find('item') silently matches
    nothing if the document declares one, which is the most likely reason
    this returned 0 rows in production. Stripping namespaces up front makes
    tag lookups work either way."""
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


# Fallback used only if proper XML parsing finds zero items despite a
# non-trivial response body -- pulls <title>/<description>/<pubDate> pairs
# directly out of the raw text with regex, ignoring namespaces, encoding
# quirks, or malformed XML entirely. Cruder, but nothing to mis-parse.
ITEM_BLOCK_RE = re.compile(r"<item\b.*?</item>", re.IGNORECASE | re.DOTALL)
TAG_RE = re.compile(r"<title>(.*?)</title>|<description>(.*?)</description>|<pubDate>(.*?)</pubDate>", re.IGNORECASE | re.DOTALL)
CDATA_RE = re.compile(r"<!\[CDATA\[(.*?)\]\]>", re.DOTALL)


def _clean_text(raw: str) -> str:
    m = CDATA_RE.search(raw)
    text = m.group(1) if m else raw
    return re.sub(r"<[^>]+>", "", text).strip()


def parse_insider_rss_regex(xml_text: str, debug: bool = False):
    """Brute-force fallback: regex out title/description/pubDate per <item>
    block without going through an XML parser at all."""
    rows = []
    blocks = ITEM_BLOCK_RE.findall(xml_text)
    if debug:
        print(f"Regex fallback <item> blocks found: {len(blocks)}")
    for block in blocks:
        title = desc = pub = ""
        tm = re.search(r"<title>(.*?)</title>", block, re.IGNORECASE | re.DOTALL)
        dm = re.search(r"<description>(.*?)</description>", block, re.IGNORECASE | re.DOTALL)
        pm = re.search(r"<pubDate>(.*?)</pubDate>", block, re.IGNORECASE | re.DOTALL)
        if tm: title = _clean_text(tm.group(1))
        if dm: desc = _clean_text(dm.group(1))
        if pm: pub = _clean_text(pm.group(1))
        row = _row_from_title_desc(title, desc, pub)
        if row:
            rows.append(row)
    return rows


def _row_from_title_desc(title: str, desc: str, pub: str):
    combined = f"{title} {desc}".strip()
    if not combined:
        return None

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

    return {
        "date": pub or "—",
        "company": company,
        "personCategory": category,
        "transactionType": transaction_display or "—",
        "quantity": qty or "—",
    }


def parse_insider_rss(xml_text: str, debug: bool = False):
    """Best-effort parse of NSE's InsiderTrading.xml RSS feed into rows.

    RSS items are prose, not a clean schema, so every field below is a
    heuristic extraction with a safe fallback to the raw text -- a row is
    never dropped just because we couldn't categorise it perfectly.

    Tries a real XML parse first (handles CDATA/entities correctly); if
    that yields nothing -- most likely because the feed declares a default
    xmlns and ElementTree's unqualified .find() then matches nothing -- it
    falls back to a namespace-blind regex pass over the raw text.
    """
    if debug:
        print(f"RSS response length: {len(xml_text)} chars; first 300: {xml_text[:300]!r}")

    rows = []
    try:
        root = ET.fromstring(xml_text)
        items = [el for el in root.iter() if _strip_ns(el.tag) == "item"]
        if debug:
            print(f"RSS <item> count (namespace-agnostic): {len(items)}")

        for item in items:
            children = {_strip_ns(c.tag): (c.text or "") for c in item}
            title = children.get("title", "").strip()
            desc = children.get("description", "").strip()
            pub = children.get("pubDate", "").strip()
            row = _row_from_title_desc(title, desc, pub)
            if row:
                rows.append(row)
    except ET.ParseError as e:
        if debug:
            print(f"RSS XML parse error: {e}")

    if not rows and xml_text.strip():
        if debug:
            print("XML parse produced 0 rows; trying regex fallback")
        rows = parse_insider_rss_regex(xml_text, debug)

    if debug and rows:
        print("Sample parsed RSS row:", json.dumps(rows[0], indent=2))
    return rows


def build_insider_trading(session: requests.Session, debug: bool):
    # --- Strategy 1: NSE's own published RSS feed for this exact report ---
    # This is the feed linked as "Click here for RSS" on NSE's insider
    # trading page. It's a static file on the archives subdomain, so it
    # generally doesn't need the /api/* session dance -- but we already
    # have a warmed-up session at this point, so use it anyway. We
    # override Accept here since the session's default header asks for
    # JSON, and some servers content-negotiate strictly.
    try:
        r = session.get(
            f"{ARCHIVES}/content/RSS/InsiderTrading.xml",
            timeout=15,
            headers={"Accept": "application/rss+xml, application/xml, text/xml, */*"},
        )
        r.raise_for_status()
        if debug:
            print(f"RSS HTTP status: {r.status_code}, content-type: {r.headers.get('content-type')}")
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
    # NSE renames/reshapes this endpoint periodically. If all of these
    # fail, open the insider trading page in a browser, DevTools > Network
    # > XHR, click "Download (.csv)", copy the exact request URL, and add
    # it to this list.
    today = date.today().strftime("%d-%m-%Y")
    from_date = (date.today() - timedelta(days=14)).strftime("%d-%m-%Y")
    candidate_paths = [
        f"/api/corporate-filings-pit?index=equities&from_date={from_date}&to_date={today}",
        f"/api/corporate-filings-insider-trading?index=equities&from_date={from_date}&to_date={today}",
        f"/api/corporate-filings-pit?symbol=&from_date={from_date}&to_date={today}",
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
# TECHNICAL BREADTH (52-week highs/lows, % above 200-DMA)
# ---------------------------------------------------------------------------

TV_SCAN_URL = "https://scanner.tradingview.com/india/scan"
TV_COLUMNS = ["close", "SMA200", "price_52_week_high", "price_52_week_low"]
TV_BATCH_SIZE = 150


def fetch_nifty500_symbols(session: requests.Session, debug: bool):
    """NSE publishes each index's constituent list as a plain CSV -- this is
    the same file format/URL pattern used for every Nifty index (e.g.
    ind_nifty50list.csv for Nifty 50), just swapping in "500"."""
    r = session.get(f"{ARCHIVES}/content/indices/ind_nifty500list.csv", timeout=20)
    r.raise_for_status()
    reader = csv.DictReader(io.StringIO(r.text))
    symbols = []
    for row in reader:
        # Be defensive about header casing/whitespace ("Symbol" vs " Symbol").
        sym = None
        for key, val in row.items():
            if key and key.strip().lower() == "symbol":
                sym = (val or "").strip()
                break
        if sym:
            symbols.append(sym)
    if debug:
        print(f"Nifty 500 constituent count: {len(symbols)}")
    return symbols


def fetch_tv_scanner_batch(tickers: list, debug: bool):
    payload = {
        "symbols": {"tickers": tickers, "query": {"types": []}},
        "columns": TV_COLUMNS,
    }
    headers = {
        "User-Agent": HEADERS["User-Agent"],
        "Content-Type": "application/json",
    }
    r = requests.post(TV_SCAN_URL, json=payload, headers=headers, timeout=20)
    r.raise_for_status()
    data = r.json().get("data", [])
    if debug:
        print(f"TV scanner batch of {len(tickers)} tickers -> {len(data)} rows")
    return data


def build_technical_breadth(session: requests.Session, debug: bool):
    """New 52-week highs/lows and % of Nifty 500 above its 200-day moving
    average, computed from TradingView's scanner rather than a
    self-maintained price history (see module docstring for why)."""
    symbols = fetch_nifty500_symbols(session, debug)
    if not symbols:
        raise RuntimeError("Nifty 500 constituent list was empty")

    all_rows = []
    last_error = None
    for i in range(0, len(symbols), TV_BATCH_SIZE):
        batch = symbols[i:i + TV_BATCH_SIZE]
        tickers = [f"NSE:{s}" for s in batch]
        try:
            all_rows.extend(fetch_tv_scanner_batch(tickers, debug))
        except Exception as e:
            last_error = e
            print(f"TV scanner batch starting at {i} failed: {e}", file=sys.stderr)
        time.sleep(1)  # be polite between batches

    if not all_rows:
        raise RuntimeError(f"TradingView scanner returned no data for any batch. Last error: {last_error}")

    total = 0
    above_dma = 0
    new_highs = 0
    new_lows = 0
    for entry in all_rows:
        d = entry.get("d") or []
        if len(d) < 4:
            continue
        close, sma200, hi52, lo52 = d[0], d[1], d[2], d[3]
        if close is None:
            continue
        total += 1
        if sma200 is not None and close > sma200:
            above_dma += 1
        # price_52_week_high/low already include today's session, so a
        # close essentially equal to it means today set (or matched) the
        # 52-week extreme -- a small epsilon absorbs float rounding only.
        if hi52 is not None and close >= hi52 - 0.01:
            new_highs += 1
        if lo52 is not None and close <= lo52 + 0.01:
            new_lows += 1

    if total == 0:
        raise RuntimeError("No valid entries with a close price in TradingView scanner response")

    return {
        "scanned": total,
        "newHighs": new_highs,
        "newLows": new_lows,
        "aboveDma200": above_dma,
        "pctAboveDma200": round(100 * above_dma / total, 1),
    }


def read_existing_json(name: str):
    path = DATA_DIR / name
    if path.exists():
        try:
            return json.loads(path.read_text())
        except Exception:
            return {}
    return {}


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
        write_json("fii-dii.json", build_fii_dii(session, args.debug))
    except Exception as e:
        failures += 1
        print(f"FII/DII fetch failed, leaving last good file in place: {e}", file=sys.stderr)

    try:
        write_json("insider-trading.json", build_insider_trading(session, args.debug))
    except Exception as e:
        failures += 1
        print(f"Insider trading fetch failed, leaving last good file in place: {e}", file=sys.stderr)

    # Market breadth has two independent sources feeding one file. Start
    # from whatever's already on disk and only overwrite the keys that
    # succeeded this run, so a failure in one half doesn't blank out a
    # working other half.
    breadth_payload = read_existing_json("market-breadth.json")
    breadth_touched = False

    try:
        breadth_payload.update(build_market_breadth(session, args.debug))
        breadth_touched = True
    except Exception as e:
        failures += 1
        print(f"Market breadth (advances/declines) fetch failed: {e}", file=sys.stderr)

    try:
        breadth_payload.update(build_technical_breadth(session, args.debug))
        breadth_touched = True
    except Exception as e:
        failures += 1
        print(f"Market breadth (52wk high/low, 200-DMA) fetch failed: {e}", file=sys.stderr)

    if breadth_touched:
        breadth_payload["updated"] = datetime.utcnow().isoformat() + "Z"
        write_json("market-breadth.json", breadth_payload)
    else:
        print("Market breadth fetch failed entirely, leaving last good file in place", file=sys.stderr)

    # Don't fail the whole Action unless every feed broke -- the site should
    # still show whichever ones succeeded.
    if failures == total:
        sys.exit(1)


if __name__ == "__main__":
    main()
