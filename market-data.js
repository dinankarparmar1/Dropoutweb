/**
 * market-data.js — TraderOS Simulator data layer
 * -------------------------------------------------------------------------
 * This file is the ONLY place that knows where historical market data
 * comes from. The simulator UI (simulator.html) never talks to Yahoo
 * Finance, or any data provider, directly — it only calls the two
 * functions exposed on window.MarketData below.
 *
 * CURRENT PROVIDER: Yahoo Finance's free, unofficial chart endpoint,
 * proxied through the Cloudflare Worker at /market/history (browsers can't
 * call Yahoo directly — it blocks cross-origin requests). This is a real
 * data source, not randomly generated data, but it has real limits:
 *   - Daily/weekly candles: available for years of history.
 *   - Intraday candles (1m/5m/15m/30m/60m): Yahoo only serves a recent
 *     window (roughly the last 1–60 days depending on interval — this is
 *     Yahoo's own restriction, not a limit added here). Requesting an
 *     older date at a fine intraday interval will return no data, and
 *     getHistory() below returns an explicit error you can show the user
 *     rather than silently failing or fabricating candles.
 *
 * TO SWITCH TO A REAL NSE/BSE PROVIDER LATER:
 * Replace the body of getHistory() (and the WORKER_URL fetch inside it)
 * with a call to your real provider's API, keeping the same function
 * signature and the same returned shape:
 *   { candles: [{ time, open, high, low, close, volume }, ...], error: null }
 * Nothing in simulator.html needs to change if you keep that contract.
 */

const WORKER_URL = 'https://ivaan.dinankarparmar12345.workers.dev';

// ── The 50 stocks ──────────────────────────────────────────────────────
// Real NSE-listed companies. Symbols use the ".NS" suffix Yahoo Finance
// expects for NSE-listed tickers.
const STOCK_LIST = [
  { symbol: 'RELIANCE.NS', name: 'Reliance Industries' },
  { symbol: 'TCS.NS', name: 'Tata Consultancy Services' },
  { symbol: 'HDFCBANK.NS', name: 'HDFC Bank' },
  { symbol: 'INFY.NS', name: 'Infosys' },
  { symbol: 'ICICIBANK.NS', name: 'ICICI Bank' },
  { symbol: 'HINDUNILVR.NS', name: 'Hindustan Unilever' },
  { symbol: 'SBIN.NS', name: 'State Bank of India' },
  { symbol: 'BHARTIARTL.NS', name: 'Bharti Airtel' },
  { symbol: 'ITC.NS', name: 'ITC Limited' },
  { symbol: 'KOTAKBANK.NS', name: 'Kotak Mahindra Bank' },
  { symbol: 'LT.NS', name: 'Larsen & Toubro' },
  { symbol: 'AXISBANK.NS', name: 'Axis Bank' },
  { symbol: 'BAJFINANCE.NS', name: 'Bajaj Finance' },
  { symbol: 'ASIANPAINT.NS', name: 'Asian Paints' },
  { symbol: 'MARUTI.NS', name: 'Maruti Suzuki' },
  { symbol: 'SUNPHARMA.NS', name: 'Sun Pharmaceutical' },
  { symbol: 'TITAN.NS', name: 'Titan Company' },
  { symbol: 'ULTRACEMCO.NS', name: 'UltraTech Cement' },
  { symbol: 'NESTLEIND.NS', name: 'Nestle India' },
  { symbol: 'WIPRO.NS', name: 'Wipro' },
  { symbol: 'HCLTECH.NS', name: 'HCL Technologies' },
  { symbol: 'ONGC.NS', name: 'Oil & Natural Gas Corporation' },
  { symbol: 'NTPC.NS', name: 'NTPC Limited' },
  { symbol: 'POWERGRID.NS', name: 'Power Grid Corporation' },
  { symbol: 'M&M.NS', name: 'Mahindra & Mahindra' },
  { symbol: 'TATAMOTORS.NS', name: 'Tata Motors' },
  { symbol: 'TATASTEEL.NS', name: 'Tata Steel' },
  { symbol: 'JSWSTEEL.NS', name: 'JSW Steel' },
  { symbol: 'ADANIENT.NS', name: 'Adani Enterprises' },
  { symbol: 'ADANIPORTS.NS', name: 'Adani Ports & SEZ' },
  { symbol: 'BAJAJFINSV.NS', name: 'Bajaj Finserv' },
  { symbol: 'BAJAJ-AUTO.NS', name: 'Bajaj Auto' },
  { symbol: 'HINDALCO.NS', name: 'Hindalco Industries' },
  { symbol: 'COALINDIA.NS', name: 'Coal India' },
  { symbol: 'INDUSINDBK.NS', name: 'IndusInd Bank' },
  { symbol: 'GRASIM.NS', name: 'Grasim Industries' },
  { symbol: 'DRREDDY.NS', name: "Dr. Reddy's Laboratories" },
  { symbol: 'CIPLA.NS', name: 'Cipla' },
  { symbol: 'DIVISLAB.NS', name: "Divi's Laboratories" },
  { symbol: 'EICHERMOT.NS', name: 'Eicher Motors' },
  { symbol: 'BRITANNIA.NS', name: 'Britannia Industries' },
  { symbol: 'HEROMOTOCO.NS', name: 'Hero MotoCorp' },
  { symbol: 'SHREECEM.NS', name: 'Shree Cement' },
  { symbol: 'UPL.NS', name: 'UPL Limited' },
  { symbol: 'APOLLOHOSP.NS', name: 'Apollo Hospitals' },
  { symbol: 'BPCL.NS', name: 'Bharat Petroleum' },
  { symbol: 'TECHM.NS', name: 'Tech Mahindra' },
  { symbol: 'SBILIFE.NS', name: 'SBI Life Insurance' },
  { symbol: 'HDFCLIFE.NS', name: 'HDFC Life Insurance' },
  { symbol: 'LTIM.NS', name: 'LTIMindtree' },
];

// ── Timeframe → real Yahoo interval mapping ────────────────────────────
// Yahoo natively supports: 1m,2m,5m,15m,30m,60m/1h,1d,1wk (among others).
// It does NOT have native "3m" or "4H" candles. Those two are built by
// aggregating real base-interval candles (1m → 3m, 60m → 4H) — this is
// real data grouped into larger buckets, never invented data.
const TIMEFRAME_CONFIG = {
  '1m':  { yahooInterval: '1m',  aggregate: 1, kind: 'intraday' },
  '3m':  { yahooInterval: '1m',  aggregate: 3, kind: 'intraday' },
  '5m':  { yahooInterval: '5m',  aggregate: 1, kind: 'intraday' },
  '15m': { yahooInterval: '15m', aggregate: 1, kind: 'intraday' },
  '30m': { yahooInterval: '30m', aggregate: 1, kind: 'intraday' },
  '1H':  { yahooInterval: '60m', aggregate: 1, kind: 'intraday' },
  '4H':  { yahooInterval: '60m', aggregate: 4, kind: 'intraday' },
  '1D':  { yahooInterval: '1d',  aggregate: 1, kind: 'daily' },
  '1W':  { yahooInterval: '1wk', aggregate: 1, kind: 'daily' },
};

function aggregateCandles(candles, factor){
  if (factor <= 1) return candles;
  const grouped = [];
  for (let i = 0; i < candles.length; i += factor){
    const chunk = candles.slice(i, i + factor);
    if (!chunk.length) continue;
    grouped.push({
      time: chunk[0].time,
      open: chunk[0].open,
      high: Math.max(...chunk.map(c => c.high)),
      low: Math.min(...chunk.map(c => c.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((sum, c) => sum + (c.volume || 0), 0),
    });
  }
  return grouped;
}

/**
 * Fetch real historical candles for one stock, one timeframe, ending at
 * (or centered around) a chosen historical date.
 *
 * @param {string} symbol   e.g. "RELIANCE.NS"
 * @param {string} timeframe one of the keys in TIMEFRAME_CONFIG
 * @param {string} dateStr  "YYYY-MM-DD" — the historical session to replay
 * @returns {Promise<{candles: Array, error: string|null}>}
 */
async function getHistory(symbol, timeframe, dateStr){
  const config = TIMEFRAME_CONFIG[timeframe];
  if (!config) return { candles: [], error: `Unknown timeframe: ${timeframe}` };

  const chosenDate = new Date(dateStr + 'T00:00:00Z');
  if (isNaN(chosenDate.getTime())) return { candles: [], error: 'Invalid date.' };

  let period1, period2;
  if (config.kind === 'intraday') {
    // A single trading session: the chosen date, start to end (UTC-based;
    // Yahoo returns whatever session data exists in that window).
    period1 = Math.floor(chosenDate.getTime() / 1000);
    period2 = period1 + 24 * 60 * 60;
  } else {
    // Daily/weekly: pull a meaningful lookback window ending at the chosen
    // date, so there's real context to replay through, not just one point.
    const lookbackDays = timeframe === '1W' ? 3 * 365 : 180;
    period1 = Math.floor(chosenDate.getTime() / 1000) - lookbackDays * 24 * 60 * 60;
    period2 = Math.floor(chosenDate.getTime() / 1000) + 24 * 60 * 60;
  }

  const url = `${WORKER_URL}/market/history?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(config.yahooInterval)}&period1=${period1}&period2=${period2}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.error || !data.candles) {
      return { candles: [], error: data.error || 'No data returned.' };
    }
    if (data.candles.length === 0) {
      const hint = config.kind === 'intraday'
        ? 'Yahoo Finance only keeps intraday data for a limited recent window — try a more recent date, or switch to the 1D/1W timeframe for older dates.'
        : 'No trading data found for this date range — it may be outside the stock\'s listed history.';
      return { candles: [], error: hint };
    }
    const aggregated = aggregateCandles(data.candles, config.aggregate);
    return { candles: aggregated, error: null };
  } catch (err) {
    return { candles: [], error: 'Could not reach the data server — try again.' };
  }
}

function listStocks(){
  return STOCK_LIST;
}

window.MarketData = { listStocks, getHistory, TIMEFRAME_CONFIG };
