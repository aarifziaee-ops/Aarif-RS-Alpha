import { DailyData } from './types';

// Same EMA calculation from scanner
export function calculateSMA(values: number[], period: number): number[] {
  const sma = new Array(values.length).fill(null);
  if (values.length < period) return sma;

  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += values[i - j];
    }
    sma[i] = sum / period;
  }
  return sma;
}

export function calculateEMA(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema = new Array(values.length).fill(null);
  if (values.length < period) return ema;

  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  ema[period - 1] = sum / period;

  for (let i = period; i < values.length; i++) {
    ema[i] = (values[i] - ema[i - 1]) * k + ema[i - 1];
  }
  return ema;
}

export async function fetchRawData(symbol: string, range: string, interval: string) {
  const baseUrl = typeof window === 'undefined' ? 'http://localhost:3000' : '';
  const res = await fetch(`${baseUrl}/api/historical?symbol=${encodeURIComponent(symbol)}&range=${range}&interval=${interval}`);
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  const json = await res.json();
  if (!json?.chart?.result?.[0]) throw new Error("Invalid data format");
  
  const result = json.chart.result[0];
  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  
  const data = [];
  for (let i = 0; i < timestamps.length; i++) {
      if (quote.close[i] != null) {
          // Adjust timestamp for timezone offsets if needed, but Yahoo generally returns UTC timestamps.
          // lightweight-charts needs UNIX timestamps in seconds for exact time, or YYYY-MM-DD for daily.
          data.push({
              time: timestamps[i],
              open: quote.open[i],
              high: quote.high[i],
              low: quote.low[i],
              close: quote.close[i],
              volume: quote.volume[i] || 0
          });
      }
  }
  return data;
}

export async function getChartData(symbol: string, timeframe: string) {
  let range = '10y';
  let interval = '1d';
  
  if (timeframe === '1M') { range = '10y'; interval = '1mo'; }
  else if (timeframe === '1W') { range = '10y'; interval = '1wk'; }
  else if (timeframe === '1D') { range = '5y'; interval = '1d'; }
  else if (timeframe === '1H') { range = '2y'; interval = '1h'; }

  const [stock, nifty] = await Promise.all([
    fetchRawData(symbol, range, interval),
    fetchRawData('^NSEI', range, interval)
  ]);

  // Align Nifty data by timestamp
  const niftyLookup = new Map<number, number>();
  for (const n of nifty) {
      niftyLookup.set(n.time, n.close);
  }

  const closes = stock.map(s => s.close);
  const sma9Arr = calculateSMA(closes, 9);
  const ema5Arr = calculateEMA(closes, 5);
  const ema10Arr = calculateEMA(closes, 10);
  const ema20Arr = calculateEMA(closes, 20);
  const ema30Arr = calculateEMA(closes, 30);
  const ema40Arr = calculateEMA(closes, 40);
  const ema50Arr = calculateEMA(closes, 50);
  const ema100Arr = calculateEMA(closes, 100);
  const ema200Arr = calculateEMA(closes, 200);

  const rsValues: number[] = [];
  for (const s of stock) {
      const nClose = niftyLookup.get(s.time);
      if (nClose) {
          rsValues.push(s.close / nClose);
      } else {
          // fallback if exactly matching timestamp is missing
          // simply carry forward last value or use null.
          rsValues.push(rsValues.length > 0 ? rsValues[rsValues.length - 1] : 0);
      }
  }

  const rsEmaArr = calculateEMA(rsValues, 123); // or whatever period we want, standard is 123

  const rsMomArr = rsValues.map((v, i) => {
    if (i < 10) return null;
    return v - rsValues[i - 10];
  });

  // Format data for lightweight charts
  const formatTime = (ts: number) => {
    if (interval === '1h') {
        return ts; // unix timestamp in seconds
    }
    // For 1d, 1wk, 1mo use UTC YYYY-MM-DD
    return new Date(ts * 1000).toISOString().split('T')[0];
  };

  const candleData = stock.map(s => ({
      time: formatTime(s.time),
      open: s.open,
      high: s.high,
      low: s.low,
      close: s.close
  })).filter((v, i, a) => i === 0 || v.time !== a[i-1].time);

  const formatSeries = (arr: number[]) => {
      return stock.map((s, i) => {
          if (arr[i] === null) return null;
          return { time: formatTime(s.time), value: arr[i] };
      }).filter(x => x !== null).filter((v, i, a) => i === 0 || v!.time !== a[i-1]!.time);
  };

  return {
      candleData,
      ema5: formatSeries(ema5Arr),
      ema10: formatSeries(ema10Arr),
      ema20: formatSeries(ema20Arr),
      ema30: formatSeries(ema30Arr),
      ema40: formatSeries(ema40Arr),
      ema50: formatSeries(ema50Arr),
      ema100: formatSeries(ema100Arr),
      ema200: formatSeries(ema200Arr),
      sma9Series: formatSeries(sma9Arr),
      rsSeries: formatSeries(rsValues),
      rsEma: formatSeries(rsEmaArr),
      rsMom: formatSeries(rsMomArr as any),
      latestRs: rsValues[rsValues.length - 1],
      latestRsEma: rsEmaArr[rsEmaArr.length - 1]
  }
}
