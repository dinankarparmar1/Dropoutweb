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

// ── The 100 stocks ─────────────────────────────────────────────────────
// Real NSE-listed companies (Nifty 50 + Nifty Next 50 style large caps).
// Symbols use the ".NS" suffix Yahoo Finance expects for NSE tickers.
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
  { symbol: 'TMPV.NS', name: 'Tata Motors (Passenger Vehicles)' },
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
  { symbol: 'TRENT.NS', name: 'Trent' },
  { symbol: 'TATACONSUM.NS', name: 'Tata Consumer Products' },
  { symbol: 'TATAPOWER.NS', name: 'Tata Power' },
  { symbol: 'BEL.NS', name: 'Bharat Electronics' },
  { symbol: 'HAL.NS', name: 'Hindustan Aeronautics' },
  { symbol: 'BHEL.NS', name: 'Bharat Heavy Electricals' },
  { symbol: 'GAIL.NS', name: 'GAIL (India)' },
  { symbol: 'IOC.NS', name: 'Indian Oil Corporation' },
  { symbol: 'VEDL.NS', name: 'Vedanta' },
  { symbol: 'HINDZINC.NS', name: 'Hindustan Zinc' },
  { symbol: 'ADANIGREEN.NS', name: 'Adani Green Energy' },
  { symbol: 'ADANIPOWER.NS', name: 'Adani Power' },
  { symbol: 'AMBUJACEM.NS', name: 'Ambuja Cements' },
  { symbol: 'ACC.NS', name: 'ACC Limited' },
  { symbol: 'SHRIRAMFIN.NS', name: 'Shriram Finance' },
  { symbol: 'CHOLAFIN.NS', name: 'Cholamandalam Investment' },
  { symbol: 'BANKBARODA.NS', name: 'Bank of Baroda' },
  { symbol: 'PNB.NS', name: 'Punjab National Bank' },
  { symbol: 'CANBK.NS', name: 'Canara Bank' },
  { symbol: 'IDFCFIRSTB.NS', name: 'IDFC First Bank' },
  { symbol: 'ICICIPRULI.NS', name: 'ICICI Prudential Life' },
  { symbol: 'ICICIGI.NS', name: 'ICICI Lombard General Insurance' },
  { symbol: 'SBICARD.NS', name: 'SBI Cards' },
  { symbol: 'LICI.NS', name: 'Life Insurance Corporation' },
  { symbol: 'DLF.NS', name: 'DLF' },
  { symbol: 'GODREJPROP.NS', name: 'Godrej Properties' },
  { symbol: 'INDIGO.NS', name: 'InterGlobe Aviation (IndiGo)' },
  { symbol: 'TVSMOTOR.NS', name: 'TVS Motor' },
  { symbol: 'MOTHERSON.NS', name: 'Samvardhana Motherson' },
  { symbol: 'BOSCHLTD.NS', name: 'Bosch' },
  { symbol: 'IRCTC.NS', name: 'IRCTC' },
  { symbol: 'IRFC.NS', name: 'Indian Railway Finance Corp' },
  { symbol: 'NAUKRI.NS', name: 'Info Edge (Naukri)' },
  { symbol: 'JIOFIN.NS', name: 'Jio Financial Services' },
  { symbol: 'PFC.NS', name: 'Power Finance Corporation' },
  { symbol: 'RECLTD.NS', name: 'REC Limited' },
  { symbol: 'TORNTPHARM.NS', name: 'Torrent Pharmaceuticals' },
  { symbol: 'LUPIN.NS', name: 'Lupin' },
  { symbol: 'ZYDUSLIFE.NS', name: 'Zydus Lifesciences' },
  { symbol: 'MUTHOOTFIN.NS', name: 'Muthoot Finance' },
  { symbol: 'POLYCAB.NS', name: 'Polycab India' },
  { symbol: 'PERSISTENT.NS', name: 'Persistent Systems' },
  { symbol: 'COFORGE.NS', name: 'Coforge' },
  { symbol: 'PIDILITIND.NS', name: 'Pidilite Industries' },
  { symbol: 'HAVELLS.NS', name: 'Havells India' },
  { symbol: 'DABUR.NS', name: 'Dabur India' },
  { symbol: 'GODREJCP.NS', name: 'Godrej Consumer Products' },
  { symbol: 'SIEMENS.NS', name: 'Siemens' },
  { symbol: 'ABB.NS', name: 'ABB India' },
  { symbol: 'DMART.NS', name: 'Avenue Supermarts (DMart)' },
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

const IST_OFFSET = 19800; // +05:30 in seconds
function istDate(t){ return new Date((t + IST_OFFSET) * 1000).toISOString().slice(0, 10); }

// Groups real base candles into bigger ones, never across two trading days
// (so a 4H candle never mixes yesterday's close with today's open).
function aggregateCandles(candles, factor){
  if (factor <= 1) return candles;
  const grouped = [];
  let chunk = [];
  const flush = () => {
    if (!chunk.length) return;
    grouped.push({
      time: chunk[0].time,
      open: chunk[0].open,
      high: Math.max(...chunk.map(c => c.high)),
      low: Math.min(...chunk.map(c => c.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((sum, c) => sum + (c.volume || 0), 0),
    });
    chunk = [];
  };
  candles.forEach(c => {
    if (chunk.length && (chunk.length >= factor || istDate(c.time) !== istDate(chunk[0].time))) flush();
    chunk.push(c);
  });
  flush();
  return grouped;
}

/**
 * Latest date that has a COMPLETE trading session: today once NSE has
 * closed (after 3:30 PM IST on a weekday), otherwise the previous weekday.
 * Exchange holidays are handled when loading (see getHistory's fallback).
 */
function latestSessionDate(){
  const nowIst = new Date(Date.now() + IST_OFFSET * 1000);
  const mins = nowIst.getUTCHours() * 60 + nowIst.getUTCMinutes();
  const d = new Date(Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate()));
  const isWeekday = d.getUTCDay() >= 1 && d.getUTCDay() <= 5;
  if (!(isWeekday && mins >= 15 * 60 + 35)) d.setUTCDate(d.getUTCDate() - 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function fetchCandles(symbol, interval, period1, period2){
  const url = `${WORKER_URL}/market/history?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&period1=${period1}&period2=${period2}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.error || !data.candles) return { candles: [], error: data.error || 'No data returned.' };
    // Drop empty/partial rows Yahoo sometimes sends (null prices).
    const clean = data.candles.filter(c => [c.open, c.high, c.low, c.close].every(v => typeof v === 'number' && isFinite(v) && v > 0));
    return { candles: clean, error: null };
  } catch (err) {
    return { candles: [], error: 'Could not reach the data server — try again.', network: true };
  }
}

/**
 * Fetch real candles for one stock and one session.
 *
 * Intraday: returns the chosen day's session to replay, plus up to the two
 * previous sessions as already-visible context (like a real chart, where
 * yesterday is still on screen when today opens).
 * Daily/weekly: returns a lookback window ending on the chosen date.
 *
 * @returns {Promise<{candles, replayFrom, error}>} replayFrom = index of the
 *          first candle that is hidden and gets replayed.
 */
async function getHistory(symbol, timeframe, dateStr){
  const config = TIMEFRAME_CONFIG[timeframe];
  if (!config) return { candles: [], replayFrom: 0, error: `Unknown timeframe: ${timeframe}` };

  const chosenDate = new Date(dateStr + 'T00:00:00Z');
  if (isNaN(chosenDate.getTime())) return { candles: [], replayFrom: 0, error: 'Invalid date.' };
  const day0 = Math.floor(chosenDate.getTime() / 1000);
  const DAY = 86400;

  if (config.kind === 'intraday') {
    // Try with ~5 days of context first; if Yahoo refuses (its intraday
    // window is limited), fall back to just the chosen day.
    let r = await fetchCandles(symbol, config.yahooInterval, day0 - 5 * DAY, day0 + DAY);
    if (r.error && !r.network || (!r.error && !r.candles.some(c => istDate(c.time) === dateStr))) {
      const only = await fetchCandles(symbol, config.yahooInterval, day0, day0 + DAY);
      if (!only.error) r = only;
    }
    if (r.error) return { candles: [], replayFrom: 0, error: r.error };
    const all = aggregateCandles(r.candles.filter(c => istDate(c.time) <= dateStr), config.aggregate);
    const session = all.filter(c => istDate(c.time) === dateStr);
    if (!session.length) {
      return { candles: [], replayFrom: 0, noSession: true, error: 'No trading on this date (weekend or market holiday), or it is outside Yahoo Finance\'s intraday window — try a more recent date, or switch to 1D/1W for older dates.' };
    }
    const prevDays = [...new Set(all.filter(c => istDate(c.time) < dateStr).map(c => istDate(c.time)))].slice(-2);
    const context = all.filter(c => prevDays.includes(istDate(c.time)));
    return { candles: context.concat(session), replayFrom: context.length, error: null };
  }

  const lookbackDays = timeframe === '1W' ? 3 * 365 : 270;
  const r = await fetchCandles(symbol, config.yahooInterval, day0 - lookbackDays * DAY, day0 + DAY);
  if (r.error) return { candles: [], replayFrom: 0, error: r.error };
  const candles = aggregateCandles(r.candles, config.aggregate);
  if (!candles.length) return { candles: [], replayFrom: 0, error: 'No trading data found for this date range — it may be outside the stock\'s listed history.' };
  const replayCount = timeframe === '1W' ? 26 : 40;
  return { candles, replayFrom: Math.max(Math.min(15, candles.length - 1), candles.length - replayCount), error: null };
}

function listStocks(){
  return STOCK_LIST;
}

window.MarketData = { listStocks, getHistory, latestSessionDate, istDate, TIMEFRAME_CONFIG, IST_OFFSET };
