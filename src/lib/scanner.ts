import { startOfWeek, format } from 'date-fns';
import { NIFTY_500_SYMBOLS, DailyData, WeeklyBar, ScanResult } from './types';

// Cache for historical data to avoid repeating Nifty fetches
const cache = new Map<string, any>();

async function fetchYahooData(symbol: string, range = '10y', interval = '1d') {
  const cacheKey = `${symbol}-${range}-${interval}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  // Fetch from our local caching Express proxy
  try {
    const baseUrl = typeof window === 'undefined' ? 'http://localhost:3000' : '';
    const res = await fetch(`${baseUrl}/api/historical?symbol=${encodeURIComponent(symbol)}&range=${range}&interval=${interval}`);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.indexOf("application/json") === -1) throw new Error("API returned HTML");
    const json = await res.json();
    if (!json?.chart?.result?.[0]) throw new Error("Invalid data format");
    
    const result = json.chart.result[0];
    const timestamps = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};
    
    const data = [];
    for (let i = 0; i < timestamps.length; i++) {
        if (quote.close[i] != null) {
            data.push({
                timestamp: timestamps[i],
                open: quote.open[i],
                high: quote.high[i],
                low: quote.low[i],
                close: quote.close[i],
                volume: quote.volume[i] || 0
            });
        }
    }
    
    cache.set(cacheKey, data);
    return data;
  } catch (err) {
    console.warn(`Failed to fetch for ${symbol}`, err);
    return null;
  }
}

function calculateSMA(values: number[], period: number): number[] {
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

function calculateEMA(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema = new Array(values.length).fill(null);
  
  // Need enough data points
  if (values.length < period) return ema;

  // SMA for first value
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  ema[period - 1] = sum / period;

  // EMA for rest
  for (let i = period; i < values.length; i++) {
    ema[i] = (values[i] - ema[i - 1]) * k + ema[i - 1];
  }
  
  return ema;
}

function aggregateWeekly(dailyData: any[]): WeeklyBar[] {
  const weeks = new Map<string, WeeklyBar>();
  
  dailyData.forEach(d => {
    // Start of week (Monday)
    const date = new Date(d.timestamp * 1000);
    const startObj = startOfWeek(date, { weekStartsOn: 1 });
    const weekKey = format(startObj, 'yyyy-MM-dd');
    
    if (!weeks.has(weekKey)) {
      weeks.set(weekKey, {
        time: weekKey,
        timestamp: Math.floor(startObj.getTime() / 1000),
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
        volume: d.volume
      });
    } else {
      const w = weeks.get(weekKey)!;
      w.high = Math.max(w.high, d.high);
      w.low = Math.min(w.low, d.low);
      w.close = d.close; // latest close in the week
      w.volume += d.volume;
    }
  });

  return Array.from(weeks.values()).sort((a, b) => a.timestamp - b.timestamp);
}

export async function runScan(onProgress: (scanned: number, total: number) => void, timeframe: '1W' | '1D' = '1W', market: string = 'stocks', sectorSymbol?: string): Promise<ScanResult[]> {
  let benchmarkSymbol = '^NSEI';
  if (market === 'crypto') benchmarkSymbol = 'BTC-USD';
  else if (market === 'us_stocks' || market === 'halal_us') benchmarkSymbol = '^GSPC';
  
  const types = await import('./types');
  const symbolsList = market === 'crypto' ? types.CRYPTO_SYMBOLS : market === 'us_stocks' ? types.US_STOCKS : market === 'halal_us' ? types.HALAL_US_STOCKS : market === 'halal_in' ? types.HALAL_IN_STOCKS : market === 'sectors' ? types.SECTOR_INDICES : (market === 'sector_constituents' && sectorSymbol) ? (types.SECTOR_CONSTITUENTS[sectorSymbol] || []) : types.NIFTY_500_SYMBOLS;

  // First, fetch Benchmark for the RS calculation
  const benchmarkData = await fetchYahooData(benchmarkSymbol, '10y', '1d');
  if (!benchmarkData) {
    throw new Error(`Failed to fetch benchmark index data (${benchmarkSymbol}).`);
  }

  // Create a quick lookup for benchmark daily closes
  const benchmarkLookup = new Map<string, number>();
  // To avoid timezone/hour mismatch, use the YYYY-MM-DD
  benchmarkData.forEach((d: any) => {
    const key = format(new Date(d.timestamp * 1000), 'yyyy-MM-dd');
    benchmarkLookup.set(key, d.close);
  });

  const results: ScanResult[] = [];
  let scannedCount = 0;

  // We batch requests to not bombard the API instantly.
  const BATCH_SIZE = 10;
  for (let i = 0; i < symbolsList.length; i += BATCH_SIZE) {
    const batch = symbolsList.slice(i, i + BATCH_SIZE);
    
    const promises = batch.map(async (symbol) => {
      const data = await fetchYahooData(symbol, '10y', '1d');
      if (!data || data.length < 250) {
        // Need at least roughly 1-2 years of daily data to have reliable 200 EMA weekly
        return null; 
      }

      // 1. Calculate Daily RS
      const dailyRsValues: number[] = [];
      const dailyRsDates: number[] = [];
      
      data.forEach((d: any) => {
        const key = format(new Date(d.timestamp * 1000), 'yyyy-MM-dd');
        const benchmarkClose = benchmarkLookup.get(key);
        if (benchmarkClose) {
          dailyRsValues.push(d.close / benchmarkClose);
          dailyRsDates.push(d.timestamp);
        }
      });

      const rsEmaArray = calculateEMA(dailyRsValues, 123);
      
      // Formatting daily RS series for the chart
      const dailyRs: DailyData[] = [];
      const dailyRsEma: DailyData[] = [];
      for (let j = 0; j < dailyRsValues.length; j++) {
         dailyRs.push({ time: dailyRsDates[j], close: dailyRsValues[j] });
         if (rsEmaArray[j] !== null) {
            dailyRsEma.push({ time: dailyRsDates[j], close: rsEmaArray[j] });
         }
      }

      // Check Condition B) RS line > 123-period EMA of RS line (on the latest day)
      const latestRs = dailyRsValues[dailyRsValues.length - 1];
      const latestRsEma = rsEmaArray[rsEmaArray.length - 1];
      const rsPositive = latestRsEma !== null && latestRs > latestRsEma;

      // Extract true today % change and daily volume before timeframe aggregation
      const dailyCloses = data.map((d: any) => d.close);
      const prevDailyPrice = dailyCloses.length > 1 ? dailyCloses[dailyCloses.length - 2] : dailyCloses[0];
      const todayChange = ((dailyCloses[dailyCloses.length - 1] - prevDailyPrice) / prevDailyPrice) * 100;
      const dailyVolume = data[data.length - 1].volume || 0;

      // 2. Format Bars according to Timeframe
      const bars = timeframe === '1W' ? aggregateWeekly(data) : data;
      if (bars.length < 200) return null; // We need at least 200 periods for 200 EMA

      const closes = bars.map((b: any) => b.close);
      const sma9Arr = calculateSMA(closes, 9);
      const ema20Arr = calculateEMA(closes, 20);
      const ema30Arr = calculateEMA(closes, 30);
      const ema40Arr = calculateEMA(closes, 40);
      const ema50Arr = calculateEMA(closes, 50);
      const ema100Arr = calculateEMA(closes, 100);
      const ema200Arr = calculateEMA(closes, 200);

      // Formatting EMA series for chart
      const ema20Series: DailyData[] = [];
      const ema30Series: DailyData[] = [];
      const ema40Series: DailyData[] = [];
      const ema50Series: DailyData[] = [];
      const ema100Series: DailyData[] = [];
      const ema200Series: DailyData[] = [];
      const sma9Series: DailyData[] = [];
      
      for(let w = 0; w < bars.length; w++) {
          const t = bars[w].timestamp;
          if (ema20Arr[w] !== null) ema20Series.push({ time: t, close: ema20Arr[w] });
          if (ema30Arr[w] !== null) ema30Series.push({ time: t, close: ema30Arr[w] });
          if (ema40Arr[w] !== null) ema40Series.push({ time: t, close: ema40Arr[w] });
          if (ema50Arr[w] !== null) ema50Series.push({ time: t, close: ema50Arr[w] });
          if (ema100Arr[w] !== null) ema100Series.push({ time: t, close: ema100Arr[w] });
          if (ema200Arr[w] !== null) ema200Series.push({ time: t, close: ema200Arr[w] });
          if (sma9Arr[w] !== null) sma9Series.push({ time: t, close: sma9Arr[w] as number });
      }

      const ema20Latest = ema20Arr[ema20Arr.length - 1];
      const ema30Latest = ema30Arr[ema30Arr.length - 1];
      const ema40Latest = ema40Arr[ema40Arr.length - 1];
      const ema50Latest = ema50Arr[ema50Arr.length - 1];
      const ema100Latest = ema100Arr[ema100Arr.length - 1];
      const ema200Latest = ema200Arr[ema200Arr.length - 1];
      const sma9Latest = sma9Arr[sma9Arr.length - 1] as number | null;

      if (ema20Latest == null || ema50Latest == null || ema100Latest == null || ema200Latest == null) return null;

      // Check Condition A) 20 EMA > 50 EMA && 20 EMA > 100 && 20 EMA > 200
      const emaBullish = (ema20Latest > ema50Latest) && (ema20Latest > ema100Latest) && (ema20Latest > ema200Latest);

      let sangamPassed = false;
      if (ema20Latest != null && ema30Latest != null && ema40Latest != null) {
        const maxEma = Math.max(ema20Latest, ema30Latest, ema40Latest);
        const minEma = Math.min(ema20Latest, ema30Latest, ema40Latest);
        const rangePct = ((maxEma - minEma) / minEma) * 100;
        
        const latestBar = bars[bars.length - 1];
        const isGreen = latestBar.close > latestBar.open;
        const closedAbove = latestBar.close > maxEma;
        
        // Let's say rangePct <= 2.0% is considered clustered.
        sangamPassed = rangePct <= 2.0 && isGreen && closedAbove;
      }

      let reversalPassed = false;
      if (ema20Latest != null && ema50Latest != null) {
        const latestBar = bars[bars.length - 1];
        const isGreen = latestBar.close > latestBar.open;
        // Reversal: RS Positive (TRL proxy), breaking out above short/medium term MA, but still in long term downtrend/early cycle
        reversalPassed = rsPositive && isGreen && (latestBar.close > ema20Latest) && (latestBar.close > ema50Latest) && (ema50Latest < ema200Latest);
      }

      let insideBarPassed = false;
      if (bars.length >= 2) {
        const prevBar = bars[bars.length - 2];
        const latestBar = bars[bars.length - 1];
        const isInside = latestBar.high <= prevBar.high && latestBar.low >= prevBar.low;
        // Require inside bar plus bullish close and it needs to be above 20 EMA for short-term swing entry
        insideBarPassed = isInside && latestBar.close > latestBar.open && latestBar.close > ema20Latest;
      }

      let rs52wPassed = false;
      if (closes.length >= 252) {
        // Find 52 week high (last 252 daily bars approx)
        const periodsPerYear = timeframe === '1W' ? 52 : 252;
        const slicePrice = closes.slice(closes.length - periodsPerYear);
        const high52w = Math.max(...slicePrice);
        const latestBar = bars[bars.length - 1];
        const isGreen = latestBar.close > latestBar.open;
        const distFromHigh = ((high52w - latestBar.close) / high52w) * 100;
        rs52wPassed = rsPositive && isGreen && latestBar.close >= (ema50Latest || 0) && distFromHigh <= 5;
      }

      const periodLength = bars.length;
      const periodsPerYear = timeframe === '1W' ? 52 : 252;
      const periodsPerQuarter = timeframe === '1W' ? 13 : 63;
      const periodsPerMonth = timeframe === '1W' ? 4 : 21;
      
      let yearlyPositive = true;
      let quarterlyPositive = true;
      let monthlyPositive = true;
      
      const latestBar = bars[bars.length - 1];

      if (periodLength > periodsPerYear) {
        yearlyPositive = latestBar.close > closes[periodLength - 1 - periodsPerYear];
      }
      if (periodLength > periodsPerQuarter) {
        quarterlyPositive = latestBar.close > closes[periodLength - 1 - periodsPerQuarter];
      }
      if (periodLength > periodsPerMonth) {
        monthlyPositive = latestBar.close > closes[periodLength - 1 - periodsPerMonth];
      }

      let sangam2Passed = false;
      if (ema20Latest != null && ema50Latest != null) {
        // Sangam 2.0: TRL (RS) positive + MTF long-term alignment (Yearly, Quarterly, Monthly positive) + Reversal/Uptrend
        // Ensure price is consolidating or breaking out with RS confirmation
        const isGreen = latestBar.close > latestBar.open;
        sangam2Passed = rsPositive && yearlyPositive && quarterlyPositive && monthlyPositive && isGreen && latestBar.close > ema20Latest;
      }

      let rsBoPassed = false;
      if (rsPositive && dailyRsValues.length >= 252) {
          const sliceRs = dailyRsValues.slice(dailyRsValues.length - 253, dailyRsValues.length - 1);
          const maxRs = Math.max(...sliceRs);
          rsBoPassed = latestRs > maxRs;
      }

      let rsMomPassed = false;
      if (dailyRsValues.length > 20) {
          const rsMom1 = latestRs - dailyRsValues[dailyRsValues.length - 11];
          const rsMom2 = dailyRsValues[dailyRsValues.length - 2] - dailyRsValues[dailyRsValues.length - 12];
          rsMomPassed = rsPositive && rsMom1 > 0 && rsMom1 > rsMom2;
      }

      let sectorRsPassed = false;
      if (dailyRsValues.length >= 21) {
          const shortRsMom = latestRs - dailyRsValues[dailyRsValues.length - 21];
          sectorRsPassed = rsPositive && shortRsMom > 0 && emaBullish;
      }

      let mtfRsPassed = false;
      if (dailyRsValues.length >= 200) {
          const rs20Mom = latestRs - dailyRsValues[dailyRsValues.length - 21];
          const rs50Mom = latestRs - dailyRsValues[dailyRsValues.length - 51];
          const rs200Mom = latestRs - dailyRsValues[dailyRsValues.length - 201];
          mtfRsPassed = rsPositive && rs20Mom > 0 && rs50Mom > 0 && rs200Mom > 0;
      }

      let mansfieldPassed = false;
      if (dailyRsValues.length >= 200) {
          const rsSma200Arr = calculateSMA(dailyRsValues, 200);
          const rsSma200Latest = rsSma200Arr[rsSma200Arr.length - 1];
          if (rsSma200Latest !== null) {
              const mansfieldRS = (latestRs / rsSma200Latest) - 1;
              const isGreen = latestBar.close > latestBar.open;
              mansfieldPassed = mansfieldRS > 0 && isGreen && latestBar.close >= (ema50Latest || 0) && emaBullish;
          }
      }

      let minerviniPassed = false;
      if (closes.length >= 250 && ema200Latest) {
          const price = latestBar.close;
          const low52w = Math.min(...closes.slice(-250));
          const high52w = Math.max(...closes.slice(-250));
          const sma150 = calculateSMA(closes, 150).pop() || 0;
          
          minerviniPassed = price > ema50Latest && 
                            price > sma150 && 
                            ema50Latest > sma150 && 
                            sma150 > ema200Latest && 
                            price > low52w * 1.30 && 
                            price > high52w * 0.75 && 
                            rsPositive;
      }

      const passed = rsPositive && emaBullish;

      return {
        symbol,
        name: symbol.replace('.NS', '').replace('-USD', ''), // Clean up crypto names too
        passed,
        weeklyClose: closes[closes.length - 1],
        todayChange,
        volume: dailyVolume,
        ema20: ema20Latest,
        ema30: ema30Latest,
        ema40: ema40Latest,
        ema50: ema50Latest,
        ema100: ema100Latest,
        ema200: ema200Latest,
        sma9: sma9Latest as number,
        rsValue: latestRs,
        rsEma: latestRsEma,
        sangamPassed,
        sangam2Passed,
        reversalPassed,
        insideBarPassed,
        rs52wPassed,
        mansfieldPassed,
        minerviniPassed,
        rsBoPassed,
        rsMomPassed,
        sectorRsPassed,
        mtfRsPassed,
        weeklyBars: bars,
        dailyRs,
        dailyRsEma,
        ema20Series,
        ema30Series,
        ema40Series,
        ema50Series,
        ema100Series,
        ema200Series,
        sma9Series
      } as ScanResult;
    });

    const batchResults = await Promise.all(promises);
    batchResults.forEach(res => { if (res) results.push(res); });
    
    scannedCount += batch.length;
    onProgress(scannedCount, symbolsList.length);
  }

  // Return all results for the table, or maybe just `passed` ones? 
  // User says "Scanner Output: Table showing... Only stocks meeting both are displayed."
  // Actually, we'll return all so the UI can filter them, or we can just filter here.
  // The user requirement: "Only stocks meeting both (a) and (b) are displayed."
  // But maybe we want to see the others if we disable a filter. 
  // Let's just return all and let the UI filter it.
  return results;
}
