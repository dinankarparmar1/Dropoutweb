"""Offline tests for scripts/ipo_data.py -- no network needed.

    python3 -m unittest discover -s tests -v

The fake payloads mirror the shapes NSE's and BSE's IPO sources return:
  NSE  ipo-current-issue / all-upcoming-issues: companyName, symbol, series,
       issueStartDate, issueEndDate, issuePrice, noOfTime, isBse
  NSE  ipo-detail: issueInfo.dataList[{title, value}]
  BSE  GetPublicIssue_par_updated: {"Table": [{LONG_NAME, Scrip_Name, IR_flag,
       Start_Dt, End_Dt, Price_Band, eXCHANGE_PLATFORM, ...}]}
  BSE  IPOIssues_new.aspx: an ASP.NET page whose data table sits inside layout
       tables; columns Security Name | Exchange Platform | Start | End |
       Offer Price | Face Value | Type of Issue | Issue Status
"""

import json
import sys
import tempfile
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import ipo_data as m  # noqa: E402

m.time.sleep = lambda *_: None

NSE_CURRENT = [
    {"symbol": "SAMPINFRA", "companyName": "Sample Infra Projects Limited", "series": "EQ",
     "issueStartDate": "12-Nov-2026", "issueEndDate": "17-NOV-2026", "status": "Active",
     "issuePrice": "Rs.240 to Rs.252", "noOfSharesOffered": "3772000",
     "noOfsharesBid": "28553040", "noOfTime": "7.57", "isBse": "1"},
    {"symbol": "EXTECH", "companyName": "Example Tech Solutions Limited", "series": "SME",
     "issueStartDate": "13-Nov-2026", "issueEndDate": "18-Nov-2026", "status": "Active",
     "noOfSharesOffered": "4472000", "noOfsharesBid": "3263000", "noOfTime": "0.73"},
]
NSE_UPCOMING = [
    # NSE's upcoming feed also repeats open issues -- must be de-duplicated
    {"symbol": "SAMPINFRA", "companyName": "Sample Infra Projects Limited", "series": "EQ",
     "issueStartDate": "12-Nov-2026", "issueEndDate": "17-Nov-2026",
     "issuePrice": "Rs.240 to Rs.252", "status": "Forthcoming"},
    {"symbol": "DEMOFOOD", "companyName": "Demo Foods India Limited", "series": "EQ",
     "issueStartDate": "19-Nov-2026", "issueEndDate": "23-Nov-2026",
     "issuePrice": "Rs.405 to Rs.426", "status": "Forthcoming", "isBse": "1"},
]
NSE_DETAIL = {
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
    "DEMOFOOD": {"issueInfo": {"dataList": [{"title": "Bid Lot", "value": "35 Equity Shares"}]}},
}
HOLIDAYS = {"CM": [{"tradingDate": "24-Nov-2026", "weekDay": "Tuesday", "description": "Guru Nanak Jayanti"}]}

BSE_API = {"Table": [
    {"IPO_NO": 8101, "Scrip_cd": "544601", "Scrip_Name": "SAMPINFRA", "LONG_NAME": "SAMPLE INFRA PROJECTS LTD",
     "IR_flag": "IPO", "Start_Dt": "2026-11-12T00:00:00", "End_Dt": "2026-11-17T00:00:00",
     "Price_Band": "240-252", "Face_Val": "10", "Status": "Open", "FLAG": "L", "eXCHANGE_PLATFORM": "MAINBOARD"},
    {"IPO_NO": 8105, "Scrip_cd": "544605", "Scrip_Name": "MOCKTEX", "LONG_NAME": "Mock Textiles Limited",
     "IR_flag": "IPO", "Start_Dt": "2026-11-16T00:00:00", "End_Dt": "2026-11-18T00:00:00",
     "Price_Band": "55", "Face_Val": "10", "Status": "Open", "FLAG": "L", "eXCHANGE_PLATFORM": "SME"},
    {"IPO_NO": 8110, "Scrip_cd": "500325", "Scrip_Name": "BIGCO", "LONG_NAME": "Big Co Ltd",
     "IR_flag": "OTB", "Start_Dt": "2026-11-10T00:00:00", "End_Dt": "2026-11-24T00:00:00",
     "Price_Band": "3000", "eXCHANGE_PLATFORM": "MAINBOARD"},
]}


def bse_page(rows, hidden=True):
    """A page shaped like BSE's: the data table nested inside layout tables."""
    body = "".join(
        f'<tr class="highlight-today"> <td class="TTRow_left"><a class=\'tablebluelink\' '
        f'href=/markets/publicIssues/DisplayIPO.aspx?id=1&type={r[5]}&IPONo={r[7]}>{r[0]}</a></td>'
        f'<td class="TTRow">{r[1]}</td><td class="TTRow">{r[2]}</td><td class="TTRow">{r[3]}</td>'
        f'<td class="TTRow_right">{r[4]}</td><td class="TTRow_right">10.00</td>'
        f'<td class="TTRow">{r[5]}</td><td class="TTRow">{r[6]}</td> </tr>'
        for r in rows)
    form = ('<input type="hidden" name="__VIEWSTATE" id="__VIEWSTATE" value="abc+/=" />'
            '<input type="hidden" name="__EVENTVALIDATION" id="__EVENTVALIDATION" value="xyz" />') if hidden else ""
    return (f'<html><body><form method="post" id="aspnetForm">{form}'
            '<table><tr><td><select name="x"><option value="0">All</option></select></td></tr></table>'
            '<table width="100%"><tr><td bgcolor="#d6d6d6"><div>'
            '<table id="ctl00_ContentPlaceHolder1_tblID" class="tablesorter"><thead><tr>'
            '<th class="TTHeader">Security Name</th><th class="TTHeader">Exchange Platform</th>'
            '<th class="TTHeader">Start Date</th><th class="TTHeader">End Date</th>'
            '<th class="TTHeader">Offer Price (<img src=\'rs.gif\' />)</th><th class="TTHeader">Face Value</th>'
            '<th class="TTHeader">Type of Issue</th><th class="TTHeader">Issue Status</th></tr></thead><tbody>'
            f'{body}</tbody></table></div></td></tr></table></form></body></html>')


BSE_LIVE_ROWS = [
    ("SAMPLE INFRA PROJECTS LIMITED", "MainBoard", "12-11-2026", "17-11-2026", "240.00 - 252.00", "IPO", "Live", 8101),
    ("MOCK TEXTILES LIMITED", "SME", "16-11-2026", "18-11-2026", "55.00", "FPO", "Live", 8105),
    ("SOME FINCORP LIMITED", "Debt", "10-11-2026", "20-11-2026", "", "DPI", "Live", 8090),
    ("OLD RIGHTS LTD", "MainBoard", "06-11-2026", "26-11-2026", "30.00", "RI", "Live", 8091),
]
BSE_FORTHCOMING_ROWS = [
    ("NEWAGE AGRO LIMITED", "SME", "20-11-2026", "24-11-2026", "120.00 - 126.00", "IPO", "Forthcoming", 8120),
]


class Resp:
    def __init__(self, data=None, status=200, text=None):
        self._d, self.status_code = data, status
        self.text = text if text is not None else (json.dumps(data) if data is not None else "")

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self):
        if self._d is None:
            raise ValueError("not json")
        return self._d


class FakeNSE:
    """Routes by URL substring; a value may be data, an Exception or a callable(url)."""

    def __init__(self, **over):
        self.routes = {
            "/api/ipo-current-issue": NSE_CURRENT,
            "/api/all-upcoming-issues": NSE_UPCOMING,
            "/api/holiday-master": HOLIDAYS,
            "/api/ipo-detail": self._detail,
        }
        self.routes.update(over)
        self.calls = []

    @staticmethod
    def _detail(url):
        sym = url.split("symbol=")[1].split("&")[0]
        series = url.split("series=")[1]
        if sym == "EXTECH" and series != "SME":     # SME detail only answers on series=SME, like NSE
            raise RuntimeError("404")
        return NSE_DETAIL.get(sym, {})

    def get(self, url, timeout=None, headers=None, params=None):
        self.calls.append(url)
        for key, val in self.routes.items():
            if key in url:
                if isinstance(val, Exception):
                    raise val
                return Resp(val(url) if callable(val) else val)
        return Resp(text="<html></html>")


class FakeBSE:
    def __init__(self, api=BSE_API, live=None, forthcoming=None, page_status=200, post_fails=False):
        self.api = api
        self.live = bse_page(BSE_LIVE_ROWS) if live is None else live
        self.forthcoming = bse_page(BSE_FORTHCOMING_ROWS) if forthcoming is None else forthcoming
        self.page_status, self.post_fails = page_status, post_fails
        self.posted = None

    def get(self, url, timeout=None, headers=None, params=None):
        if "api.bseindia.com" in url:
            if isinstance(self.api, Exception):
                raise self.api
            return Resp(self.api)
        return Resp(status=self.page_status, text=self.live)

    def post(self, url, data=None, timeout=None, headers=None):
        self.posted = data
        if self.post_fails:
            raise RuntimeError("timeout")
        return Resp(text=self.forthcoming)


# ---------------------------------------------------------------------------

class ParserTests(unittest.TestCase):
    def test_dates(self):
        self.assertEqual(m.parse_date("21-May-2026"), date(2026, 5, 21))
        self.assertEqual(m.parse_date("21-MAY-2026"), date(2026, 5, 21))
        self.assertEqual(m.parse_date("2026-05-21"), date(2026, 5, 21))
        self.assertEqual(m.parse_date("2026-11-12T00:00:00"), date(2026, 11, 12))
        self.assertEqual(m.parse_date("05-11-2026"), date(2026, 11, 5))      # BSE page: dd-mm-yyyy
        self.assertIsNone(m.parse_date("TBA"))
        self.assertIsNone(m.parse_date(None))

    def test_price_band(self):
        self.assertEqual(m.parse_price_band("Rs.290 to Rs.302"), (290, 302))
        self.assertEqual(m.parse_price_band("Rs. 1,045 to Rs. 1,100"), (1045, 1100))
        self.assertEqual(m.parse_price_band("62.00 - 66.00"), (62, 66))
        self.assertEqual(m.parse_price_band("95-100"), (95, 100))
        self.assertEqual(m.parse_price_band("Rs.55"), (55, 55))
        self.assertEqual(m.parse_price_band(""), (None, None))

    def test_lot_and_size(self):
        self.assertEqual(m.parse_lot_size("59 Equity Shares and in multiples thereof"), 59)
        self.assertEqual(m.parse_lot_size("1,200 Equity Shares"), 1200)
        self.assertEqual(m.parse_issue_size_cr("Aggregating up to Rs.1,150.00 Crores"), 1150.0)
        self.assertEqual(m.parse_issue_size_cr("Rs.420.5 million"), 42.05)
        self.assertEqual(m.parse_issue_size_cr("Rs.95 lakh"), 0.95)
        self.assertIsNone(m.parse_issue_size_cr("37,72,000 Equity Shares"))

    def test_names(self):
        self.assertEqual(m.norm_name("Sona Selection India Ltd."), "sona selection india")
        self.assertEqual(m.norm_name("SONA SELECTION INDIA LIMITED"), "sona selection india")
        self.assertEqual(m.slug("Mock Textiles (SME) Limited"), "mock-textiles-sme")

    def test_trading_days(self):
        hol = m.parse_holidays(HOLIDAYS)
        self.assertIn(date(2026, 11, 24), hol)
        self.assertEqual(m.add_trading_days(date(2026, 11, 20), 3, hol), date(2026, 11, 26))
        self.assertEqual(m.add_trading_days(date(2026, 11, 17), 3, set()), date(2026, 11, 20))

    def test_nse_merge_dedupes_and_prefers_current(self):
        ipos = m.merge_nse_feeds(NSE_CURRENT, NSE_UPCOMING)
        self.assertEqual(sorted(i["symbol"] for i in ipos), ["DEMOFOOD", "EXTECH", "SAMPINFRA"])
        samp = next(i for i in ipos if i["symbol"] == "SAMPINFRA")
        self.assertEqual(samp["subscriptionTimes"], 7.57)
        self.assertEqual((samp["priceLow"], samp["priceHigh"]), (240, 252))
        self.assertEqual(samp["exchanges"], ["NSE", "BSE"])
        self.assertEqual(next(i for i in ipos if i["symbol"] == "EXTECH")["type"], "SME")

    def test_bse_page_parser(self):
        ipos = m.parse_bse_page(bse_page(BSE_LIVE_ROWS))
        names = [i["name"] for i in ipos]
        # IPO kept, fixed-price SME issue kept, debt and rights issues dropped, header skipped
        self.assertEqual(names, ["Sample Infra Projects Limited", "Mock Textiles Limited"])
        samp, mock = ipos
        self.assertEqual((samp["open"], samp["close"]), (date(2026, 11, 12), date(2026, 11, 17)))
        self.assertEqual((samp["priceLow"], samp["priceHigh"]), (240, 252))
        self.assertEqual(samp["bseIpoNo"], "8101")
        self.assertEqual((mock["type"], mock["priceLow"], mock["priceHigh"]), ("SME", 55, 55))

    def test_bse_page_empty_and_garbage(self):
        self.assertEqual(m.parse_bse_page(bse_page([])), [])
        self.assertEqual(m.parse_bse_page("<html>Access Denied</html>"), [])
        self.assertEqual(m.parse_bse_page(""), [])

    def test_bse_form(self):
        state = m.bse_form_state(bse_page([]))
        self.assertEqual(state["__VIEWSTATE"], "abc+/=")
        post = m.bse_form_post(state, "F")
        self.assertEqual(post["ctl00$ContentPlaceHolder1$rblIssueStatus"], "F")
        self.assertEqual(post["__EVENTVALIDATION"], "xyz")
        with self.assertRaises(ValueError):
            m.bse_form_state(bse_page([], hidden=False))

    def test_bse_json(self):
        ipos = m.bse_json_to_ipos(BSE_API)
        self.assertEqual([i["bseCode"] for i in ipos], ["SAMPINFRA", "MOCKTEX"])   # buyback dropped
        self.assertEqual(ipos[1]["type"], "SME")

    def test_merge_sources(self):
        nse = m.merge_nse_feeds(NSE_CURRENT, NSE_UPCOMING)
        bse = m.parse_bse_page(bse_page(BSE_LIVE_ROWS)) + m.parse_bse_page(bse_page(BSE_FORTHCOMING_ROWS))
        out = {i["key"]: i for i in m.merge_sources(nse, bse)}
        self.assertEqual(set(out), {"SAMPINFRA", "EXTECH", "DEMOFOOD", "MOCK-TEXTILES", "NEWAGE-AGRO"})
        self.assertEqual(out["SAMPINFRA"]["sources"], ["NSE", "BSE"])      # matched across exchanges
        self.assertEqual(out["SAMPINFRA"]["name"], "Sample Infra Projects Limited")   # NSE wins
        self.assertEqual(out["MOCK-TEXTILES"]["sources"], ["BSE"])          # BSE-only SME

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

    def build(self, nse=None, bse=None, force=True):
        return m.build_ipo_details(nse or FakeNSE(), force=force, bse_session=bse or FakeBSE())

    def save(self, payload):
        m.OUT_FILE.write_text(json.dumps(payload))

    def test_full_build_both_sources(self):
        payload = self.build()
        by = {i["key"]: i for i in payload["ipos"]}
        self.assertEqual(set(by), {"SAMPINFRA", "EXTECH", "DEMOFOOD", "MOCKTEX"})
        self.assertEqual(payload["sources"]["NSE"]["ok"], True)
        self.assertEqual(payload["sources"]["BSE"]["ok"], True)
        s = by["SAMPINFRA"]
        self.assertEqual((s["lotSize"], s["issueSizeCr"], s["close"], s["listing"]), (59, 1150.0, "2026-11-17", "2026-11-20"))
        self.assertTrue(s["listingEstimated"])
        self.assertEqual(s["bseCode"], "SAMPINFRA")
        self.assertEqual((by["EXTECH"]["lotSize"], by["EXTECH"]["issueSizeCr"]), (1200, 42.05))
        self.assertEqual(by["DEMOFOOD"]["listing"], "2026-11-27")   # Tue 24 Nov is a holiday
        self.assertEqual(by["MOCKTEX"]["sources"], ["BSE"])
        self.assertIn("2026-11-24", payload["holidays"])
        json.dumps(payload)

    def test_bse_api_refused_falls_back_to_page(self):
        bse = FakeBSE(api=RuntimeError("403 Access Denied"))
        payload = self.build(bse=bse)
        keys = {i["key"] for i in payload["ipos"]}
        self.assertIn("MOCK-TEXTILES", keys)        # live, from the page
        self.assertIn("NEWAGE-AGRO", keys)          # forthcoming, from the posted form
        self.assertEqual(bse.posted["ctl00$ContentPlaceHolder1$rblIssueStatus"], "F")

    def test_bse_forthcoming_post_failing_keeps_live_rows(self):
        payload = self.build(bse=FakeBSE(api=RuntimeError("403"), post_fails=True))
        keys = {i["key"] for i in payload["ipos"]}
        self.assertIn("MOCK-TEXTILES", keys)
        self.assertNotIn("NEWAGE-AGRO", keys)
        self.assertTrue(payload["sources"]["BSE"]["ok"])

    def test_bse_fully_down_nse_still_written(self):
        payload = self.build(bse=FakeBSE(api=RuntimeError("403"), page_status=403))
        self.assertFalse(payload["sources"]["BSE"]["ok"])
        self.assertEqual({i["key"] for i in payload["ipos"]}, {"SAMPINFRA", "EXTECH", "DEMOFOOD"})

    def test_nse_blocked_bse_carries_and_keeps_keys(self):
        first = self.build()
        self.save(first)
        payload = self.build(nse=FakeNSE(**{"/api/ipo-current-issue": RuntimeError("403")}))
        self.assertFalse(payload["sources"]["NSE"]["ok"])
        by = {i["key"]: i for i in payload["ipos"]}
        # NSE-only IPOs are carried over instead of vanishing ...
        self.assertIn("EXTECH", by)
        self.assertIn("DEMOFOOD", by)
        # ... and the IPO BSE still lists keeps its NSE key, lot size and symbol for the GMP join
        self.assertEqual(by["SAMPINFRA"]["symbol"], "SAMPINFRA")
        self.assertEqual(by["SAMPINFRA"]["lotSize"], 59)
        # holidays come from the last file when NSE is down
        self.assertEqual(by["DEMOFOOD"]["listing"], "2026-11-27")

    def test_both_down_raises_so_old_file_is_kept(self):
        with self.assertRaises(RuntimeError):
            self.build(nse=FakeNSE(**{"/api/ipo-current-issue": RuntimeError("403")}),
                       bse=FakeBSE(api=RuntimeError("403"), page_status=403))

    def test_nse_non_list_counts_as_failure(self):
        payload = self.build(nse=FakeNSE(**{"/api/ipo-current-issue": {"msg": "blocked"}}))
        self.assertFalse(payload["sources"]["NSE"]["ok"])

    def test_holiday_failure_is_not_fatal(self):
        payload = self.build(nse=FakeNSE(**{"/api/holiday-master": RuntimeError("x")}))
        self.assertEqual(len(payload["ipos"]), 4)

    def test_throttle(self):
        self.save({"updated": datetime.now(timezone.utc).isoformat(), "ipos": []})
        self.assertIsNone(self.build(force=False))
        old = {"updated": (datetime.now(timezone.utc) - timedelta(hours=3)).isoformat(), "ipos": []}
        self.assertTrue(m.due_for_refresh(old))

    def test_closed_ipo_is_carried_until_listing(self):
        prev = [{"key": "OLDCO", "symbol": "OLDCO", "name": "Old Co Limited", "type": "Mainboard", "series": "EQ",
                 "open": "2026-11-12", "close": "2026-11-16", "listing": "2026-11-19",
                 "listingEstimated": True, "status": "Closed", "sources": ["NSE"]}]
        out = m.finalise([], prev, set(), date(2026, 11, 18))
        self.assertEqual([i["key"] for i in out], ["OLDCO"])
        self.assertEqual(out[0]["status"], "Closed")
        self.assertEqual(m.finalise([], prev, set(), date(2026, 11, 21)), [])

    def test_vanished_upcoming_ipo_is_dropped_only_if_its_source_worked(self):
        prev = [{"key": "GONE", "name": "Withdrawn Co", "open": "2026-11-25", "close": "2026-11-27", "sources": ["NSE"]}]
        self.assertEqual(m.finalise([], prev, set(), date(2026, 11, 18)), [])
        kept = m.finalise([], prev, set(), date(2026, 11, 18), failed_sources=["NSE"])
        self.assertEqual([i["key"] for i in kept], ["GONE"])

    def test_empty_answers_with_live_previous_is_suspicious(self):
        future = (datetime.now(m.IST).date() + timedelta(days=5)).isoformat()
        self.save({"updated": "2000-01-01T00:00:00Z", "ipos": [
            {"key": "LIVE", "symbol": "LIVE", "name": "Live Co", "open": future, "close": future}]})
        with self.assertRaises(ValueError):
            self.build(nse=FakeNSE(**{"/api/ipo-current-issue": [], "/api/all-upcoming-issues": []}),
                       bse=FakeBSE(api={"Table": []}), force=False)


if __name__ == "__main__":
    unittest.main()
