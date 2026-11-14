"""Offline tests for scripts/ipo_data.py -- no network needed.

    python3 -m unittest discover -s tests -v

The fake payloads mirror the shapes NSE's IPO endpoints return
(field names: companyName, symbol, series, issueStartDate, issueEndDate,
issuePrice, noOfTime, isBse; ipo-detail -> issueInfo.dataList[title/value]).
"""

import json
import sys
import tempfile
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import ipo_data as m  # noqa: E402


CURRENT = [
    {"symbol": "SAMPINFRA", "companyName": "Sample Infra Projects Limited", "series": "EQ",
     "issueStartDate": "12-Nov-2026", "issueEndDate": "17-NOV-2026", "status": "Active",
     "issuePrice": "Rs.240 to Rs.252", "noOfSharesOffered": "3772000",
     "noOfsharesBid": "28553040", "noOfTime": "7.57", "isBse": "1"},
    {"symbol": "EXTECH", "companyName": "Example Tech Solutions Limited", "series": "SME",
     "issueStartDate": "13-Nov-2026", "issueEndDate": "18-Nov-2026", "status": "Active",
     "noOfSharesOffered": "4472000", "noOfsharesBid": "3263000", "noOfTime": "0.73"},
]
UPCOMING = [
    # NSE's upcoming feed also repeats open issues -- must be de-duplicated
    {"symbol": "SAMPINFRA", "companyName": "Sample Infra Projects Limited", "series": "EQ",
     "issueStartDate": "12-Nov-2026", "issueEndDate": "17-Nov-2026",
     "issuePrice": "Rs.240 to Rs.252", "status": "Forthcoming"},
    {"symbol": "DEMOFOOD", "companyName": "Demo Foods India Limited", "series": "EQ",
     "issueStartDate": "19-Nov-2026", "issueEndDate": "23-Nov-2026",
     "issuePrice": "Rs.405 to Rs.426", "status": "Forthcoming"},
]
DETAIL = {
    "SAMPINFRA": {"issueInfo": {"dataList": [
        {"title": "Issue Period", "value": "12-Nov-2026 to 17-Nov-2026"},
        {"title": "Price Range", "value": "Rs.240 to Rs.252"},
        {"title": "Bid Lot", "value": "59 Equity Shares and in multiples thereof"},
        {"title": "Issue Size", "value": "Aggregating up to Rs.1,150.00 Crores"},
    ]}},
    "EXTECH": {"issueInfo": {"dataList": [
        {"title": "Price Range", "value": "Rs.88 to Rs.92"},
        {"title": "Bid Lot", "value": "1,200 Equity Shares"},
        {"title": "Issue Size", "value": "Rs.420.5 million"},
    ]}},
    "DEMOFOOD": {"issueInfo": {"dataList": [
        {"title": "Bid Lot", "value": "35 Equity Shares"},
    ]}},
}
HOLIDAYS = {"CM": [{"tradingDate": "24-Nov-2026", "weekDay": "Tuesday", "description": "Guru Nanak Jayanti"}]}


class Resp:
    def __init__(self, data, status=200):
        self._d, self.status_code = data, status

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self):
        return self._d


class FakeSession:
    def __init__(self, routes):
        self.routes, self.calls = routes, []

    def get(self, url, timeout=None, headers=None):
        self.calls.append(url)
        for key, val in self.routes.items():
            if key in url:
                if isinstance(val, Exception):
                    raise val
                return Resp(val(url) if callable(val) else val)
        return Resp("<html></html>")


def detail_route(url):
    sym = url.split("symbol=")[1].split("&")[0]
    if sym not in DETAIL:
        return Resp({}, 404)  # never reached: raise via status below
    return DETAIL[sym]


class ParserTests(unittest.TestCase):
    def test_dates(self):
        self.assertEqual(m.parse_date("21-May-2026"), date(2026, 5, 21))
        self.assertEqual(m.parse_date("21-MAY-2026"), date(2026, 5, 21))
        self.assertEqual(m.parse_date("2026-05-21"), date(2026, 5, 21))
        self.assertIsNone(m.parse_date("TBA"))
        self.assertIsNone(m.parse_date(None))

    def test_price_band(self):
        self.assertEqual(m.parse_price_band("Rs.290 to Rs.302"), (290, 302))
        self.assertEqual(m.parse_price_band("Rs. 1,045 to Rs. 1,100"), (1045, 1100))
        self.assertEqual(m.parse_price_band("Rs.55"), (55, 55))
        self.assertEqual(m.parse_price_band(""), (None, None))

    def test_lot_and_size(self):
        self.assertEqual(m.parse_lot_size("59 Equity Shares and in multiples thereof"), 59)
        self.assertEqual(m.parse_lot_size("1,200 Equity Shares"), 1200)
        self.assertEqual(m.parse_issue_size_cr("Aggregating up to Rs.1,150.00 Crores"), 1150.0)
        self.assertEqual(m.parse_issue_size_cr("Rs.420.5 million"), 42.05)
        self.assertEqual(m.parse_issue_size_cr("Rs.95 lakh"), 0.95)
        self.assertIsNone(m.parse_issue_size_cr("37,72,000 Equity Shares"))

    def test_trading_days(self):
        hol = m.parse_holidays(HOLIDAYS)
        self.assertIn(date(2026, 11, 24), hol)
        # Fri 20 Nov close -> Mon 23, (Tue 24 holiday), Wed 25, Thu 26
        self.assertEqual(m.add_trading_days(date(2026, 11, 20), 3, hol), date(2026, 11, 26))
        self.assertEqual(m.add_trading_days(date(2026, 11, 17), 3, set()), date(2026, 11, 20))

    def test_merge_dedupes_and_prefers_current(self):
        ipos = m.merge_feeds(CURRENT, UPCOMING)
        syms = sorted(i["symbol"] for i in ipos)
        self.assertEqual(syms, ["DEMOFOOD", "EXTECH", "SAMPINFRA"])
        samp = next(i for i in ipos if i["symbol"] == "SAMPINFRA")
        self.assertEqual(samp["subscriptionTimes"], 7.57)
        self.assertEqual((samp["priceLow"], samp["priceHigh"]), (240, 252))
        ext = next(i for i in ipos if i["symbol"] == "EXTECH")
        self.assertEqual(ext["type"], "SME")

    def test_status(self):
        ipo = {"open": date(2026, 11, 12), "close": date(2026, 11, 17), "listing": date(2026, 11, 20)}
        self.assertEqual(m.status_of(ipo, date(2026, 11, 11)), "Upcoming")
        self.assertEqual(m.status_of(ipo, date(2026, 11, 17)), "Open")
        self.assertEqual(m.status_of(ipo, date(2026, 11, 18)), "Closed")
        self.assertEqual(m.status_of(ipo, date(2026, 11, 20)), "Listed")


class BuildTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        m.OUT_FILE = Path(self.tmp.name) / "ipo-details.json"

    def tearDown(self):
        self.tmp.cleanup()

    def routes(self, **over):
        def detail(url):
            sym = url.split("symbol=")[1].split("&")[0]
            series = url.split("series=")[1]
            # SME detail only answers on series=SME, like NSE
            if sym == "EXTECH" and series != "SME":
                raise RuntimeError("404")
            return DETAIL.get(sym, {})
        r = {
            "/api/ipo-current-issue": CURRENT,
            "/api/all-upcoming-issues": UPCOMING,
            "/api/holiday-master": HOLIDAYS,
        }
        r.update(over)
        return r, detail

    def session(self, **over):
        routes, detail = self.routes(**over)
        s = FakeSession(routes)
        orig_get = s.get

        def get(url, timeout=None, headers=None):
            if "/api/ipo-detail" in url:
                s.calls.append(url)
                return Resp(detail(url))
            return orig_get(url, timeout, headers)
        s.get = get
        return s

    def test_full_build(self):
        m.time.sleep = lambda *_: None
        payload = m.build_ipo_details(self.session(), force=True)
        by = {i["symbol"]: i for i in payload["ipos"]}
        self.assertEqual(set(by), {"SAMPINFRA", "EXTECH", "DEMOFOOD"})
        self.assertEqual(by["SAMPINFRA"]["lotSize"], 59)
        self.assertEqual(by["SAMPINFRA"]["issueSizeCr"], 1150.0)
        self.assertEqual(by["SAMPINFRA"]["close"], "2026-11-17")
        self.assertEqual(by["SAMPINFRA"]["listing"], "2026-11-20")
        self.assertTrue(by["SAMPINFRA"]["listingEstimated"])
        self.assertEqual(by["EXTECH"]["lotSize"], 1200)
        self.assertEqual(by["EXTECH"]["issueSizeCr"], 42.05)
        self.assertEqual(by["EXTECH"]["priceHigh"], 92)
        # DEMOFOOD closes Mon 23 Nov; Tue 24 is a holiday -> 25, 26, 27
        self.assertEqual(by["DEMOFOOD"]["listing"], "2026-11-27")
        json.dumps(payload)  # must be JSON-serialisable

    def test_feed_failure_raises_so_old_file_is_kept(self):
        with self.assertRaises(Exception):
            m.build_ipo_details(self.session(**{"/api/ipo-current-issue": RuntimeError("403")}), force=True)

    def test_non_list_response_raises(self):
        with self.assertRaises(ValueError):
            m.build_ipo_details(self.session(**{"/api/ipo-current-issue": {"msg": "blocked"}}), force=True)

    def test_holiday_failure_is_not_fatal(self):
        m.time.sleep = lambda *_: None
        payload = m.build_ipo_details(self.session(**{"/api/holiday-master": RuntimeError("x")}), force=True)
        self.assertEqual(len(payload["ipos"]), 3)

    def test_throttle(self):
        recent = {"updated": datetime.now(timezone.utc).isoformat(), "ipos": []}
        m.OUT_FILE.write_text(json.dumps(recent))
        self.assertIsNone(m.build_ipo_details(self.session()))
        old = {"updated": (datetime.now(timezone.utc) - timedelta(hours=3)).isoformat(), "ipos": []}
        self.assertTrue(m.due_for_refresh(old))

    def test_closed_ipo_is_carried_until_listing(self):
        today = date(2026, 11, 18)
        prev = [{"symbol": "OLDCO", "name": "Old Co Limited", "type": "Mainboard", "series": "EQ",
                 "open": "2026-11-12", "close": "2026-11-16", "listing": "2026-11-19",
                 "listingEstimated": True, "status": "Closed"}]
        out = m.finalise([], prev, set(), today)
        self.assertEqual([i["symbol"] for i in out], ["OLDCO"])
        self.assertEqual(out[0]["status"], "Closed")
        self.assertEqual(m.finalise([], prev, set(), date(2026, 11, 21)), [])

    def test_vanished_upcoming_ipo_is_dropped(self):
        prev = [{"symbol": "GONE", "name": "Withdrawn Co", "open": "2026-11-25", "close": "2026-11-27"}]
        self.assertEqual(m.finalise([], prev, set(), date(2026, 11, 18)), [])

    def test_empty_feeds_with_live_previous_is_suspicious(self):
        future = (datetime.now(m.IST).date() + timedelta(days=5)).strftime("%Y-%m-%d")
        prev = {"updated": "2000-01-01T00:00:00Z", "ipos": [
            {"symbol": "LIVE", "name": "Live Co", "open": future, "close": future}]}
        m.OUT_FILE.write_text(json.dumps(prev))
        with self.assertRaises(ValueError):
            m.build_ipo_details(self.session(**{"/api/ipo-current-issue": [], "/api/all-upcoming-issues": []}))


if __name__ == "__main__":
    unittest.main()
