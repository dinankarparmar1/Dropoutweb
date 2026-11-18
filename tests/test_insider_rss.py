"""Offline tests for the insider-trading RSS parser in scripts/fetch_market_data.py.

    python3 -m unittest discover -s tests -v
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import fetch_market_data as f  # noqa: E402

FEED = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Insider Trading</title>
<item>
  <title>CONTROL PRINT LIMITED</title>
  <link>https://nsearchives.nseindia.com/corporate/xbrl/IT_13947_WebXMLFile_20261117_183351.xml</link>
  <description>CONTROLPR|CONTROL PRINT LIMITED|Original|Regulation 7 (2)|IT_13947_WebXMLFile_20261117_183351.xml</description>
  <pubDate>17-Nov-2026 18:33:51</pubDate>
</item>
<item>
  <title>TAMILNAD MERCANTILE BANK LIMITED</title>
  <description>TMB|TAMILNAD MERCANTILE BANK LIMITED|Revised|Regulation 7(2)|IT_19961_WebXMLFile.xml</description>
  <pubDate>17-Nov-2026 18:13:10</pubDate>
</item>
</channel></rss>"""


class PitPipeTests(unittest.TestCase):
    def test_pipe_record(self):
        r = f._parse_pit_pipe("CONTROLPR|CONTROL PRINT LIMITED|Original|Regulation 7 (2)|IT_1.xml")
        self.assertEqual(r, {"symbol": "CONTROLPR", "company": "CONTROL PRINT LIMITED",
                             "filing": "Reg 7(2) disclosure"})

    def test_revised(self):
        r = f._parse_pit_pipe("TMB|TMB LTD|Revised|Regulation 7(2)|x")
        self.assertEqual(r["filing"], "Reg 7(2) disclosure (revised)")

    def test_not_pipe(self):
        self.assertIsNone(f._parse_pit_pipe("Promoter bought 1,000 shares by market purchase"))
        self.assertIsNone(f._parse_pit_pipe(""))


class InsiderRssTests(unittest.TestCase):
    def test_feed_rows_are_clean(self):
        rows = f.parse_insider_rss(FEED)
        self.assertEqual(len(rows), 2)
        a, b = rows
        self.assertEqual(a["company"], "CONTROL PRINT LIMITED")
        self.assertEqual(a["symbol"], "CONTROLPR")
        self.assertEqual(a["transactionType"], "Reg 7(2) disclosure")
        self.assertEqual(a["date"], "17-Nov-2026 18:33:51")
        self.assertTrue(a["link"].startswith("https://"))
        self.assertNotIn("|", a["transactionType"])
        self.assertEqual(b["transactionType"], "Reg 7(2) disclosure (revised)")
        self.assertNotIn("link", b)


if __name__ == "__main__":
    unittest.main()
