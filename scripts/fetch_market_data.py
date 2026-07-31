#!/usr/bin/env python3
"""
Fetches FII/DII trading activity and insider-trading (SEBI PIT) disclosures
from NSE India's own public reports and writes clean JSON files that
market-intelligence.html reads client-side (data/fii-dii.json and
data/insider-trading.json).

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
"""

import argparse
import json
import sys
import time
from datetime import datetime, date
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"

BASE = "https://www.nseindia.com"
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


def build_insider_trading(session: requests.Session, debug: bool):
    today = date.today().strftime("%d-%m-%Y")
    # NSE's own insider-trading report page is:
    #   https://www.nseindia.com/companies-listing/corporate-filings-insider-trading
    # Open that page in a browser, DevTools > Network > XHR, click
    # "Download (.csv)", and copy the exact request URL if this path or
    # its query params have changed since -- NSE adjusts these periodically.
    path = (
        "/api/corporate-filings-insider-trading"
        f"?index=equities&from_date={today}&to_date={today}"
    )
    raw = fetch_json(session, path)
    if debug:
        print("RAW insider-trading:", json.dumps(raw, indent=2)[:2000])

    data = raw.get("data", raw) if isinstance(raw, dict) else raw
    rows = []
    for entry in (data or [])[:25]:
        rows.append({
            "date": entry.get("date") or entry.get("acqfromDt") or entry.get("intimDt"),
            "company": entry.get("company") or entry.get("companyName") or entry.get("symbol"),
            "personCategory": entry.get("personCategory") or entry.get("category"),
            "transactionType": entry.get("acqMode") or entry.get("transactionType") or entry.get("secType"),
            "quantity": entry.get("secAcq") or entry.get("securitiesAcquired") or entry.get("secVal"),
        })

    return {"updated": datetime.utcnow().isoformat() + "Z", "rows": rows}


def write_json(name: str, payload: dict):
    DATA_DIR.mkdir(exist_ok=True)
    path = DATA_DIR / name
    path.write_text(json.dumps(payload, indent=2))
    print(f"wrote {path} ({len(payload.get('rows', []))} rows)")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--debug", action="store_true", help="print raw NSE payloads")
    args = parser.parse_args()

    session = get_session()
    failures = 0

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

    # Don't fail the whole Action if only one of the two feeds broke --
    # the site should still show whichever one succeeded.
    if failures == 2:
        sys.exit(1)


if __name__ == "__main__":
    main()
