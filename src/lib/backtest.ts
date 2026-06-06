export interface Trade {
  entryIndex: number;
  exitIndex: number;
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  profitPct: number;
  durationBars: number;
}

export interface BacktestResult {
  strategy: string;
  totalTrades: number;
  winRate: number;
  totalProfitPct: number;
  avgProfitPct: number;
  avgDurationBars: number;
  maxDrawdown: number;
  trades: Trade[];
  capitalCurve: { time: string; value: number }[];
}

export function runBacktest(chartData: any, timeframe: string): Record<string, BacktestResult> {
  const strategies = ['alpha', 'sangam', 'sangam2', 'reversal', 'rs52w', 'rsBo', 'rsMom', 'sectorRs', 'mtfRs'];
  const results: Record<string, BacktestResult> = {};

  const closes = chartData.candleData.map((c: any) => c.close);
  const times = chartData.candleData.map((c: any) => c.time);
  
  // Strategy evaluation maps
  strategies.forEach(strategy => {
    let inTrade = false;
    let entryPrice = 0;
    let entryIndex = 0;
    let capital = 100000;
    const trades: Trade[] = [];
    const capitalCurve = [];

    let peakValue = capital;
    let maxDrawdown = 0;

    for (let i = 252; i < closes.length; i++) { // Start after enough data
      
      const currentClose = closes[i];
      const prevClose = closes[i-1];
      const isGreen = currentClose > (chartData.candleData[i].open || prevClose);
      
      let isEntry = false;
      let isExit = false;

      // Extract values at i
      const ema20 = chartData.ema20[i]?.value;
      const ema30 = chartData.ema30[i]?.value;
      const ema40 = chartData.ema40[i]?.value;
      const ema50 = chartData.ema50[i]?.value;
      const ema100 = chartData.ema100[i]?.value;
      const ema200 = chartData.ema200[i]?.value;
      const sma9 = chartData.sma9Series[i]?.value;
      const rsValue = chartData.rsSeries[i]?.value;
      const rsEma = chartData.rsEma[i]?.value;

      const rsPositive = rsValue != null && rsEma != null && rsValue > rsEma;

      if (!inTrade) {
        if (strategy === 'alpha') {
          if (ema20 > ema50 && ema20 > ema100 && ema20 > ema200 && rsPositive) isEntry = true;
        } else if (strategy === 'sangam') {
          if (ema20 && ema30 && ema40) {
            const minEma = Math.min(ema20, ema30, ema40);
            const maxEma = Math.max(ema20, ema30, ema40);
            const rangePct = ((maxEma - minEma) / minEma) * 100;
            if (rangePct <= 2.0 && isGreen && currentClose > maxEma && rsPositive) isEntry = true;
          }
        } else if (strategy === 'sangam2') {
          if (ema20 && ema50) {
             const periodsPerYear = timeframe === '1W' ? 52 : 252;
             let yearlyPositive = i > periodsPerYear && currentClose > closes[i - periodsPerYear];
             if (rsPositive && yearlyPositive && isGreen && currentClose > ema20) isEntry = true;
          }
        } else if (strategy === 'rs52w') {
           const periodsPerYear = timeframe === '1W' ? 52 : 252;
           if (i >= periodsPerYear) {
             const slicePrice = closes.slice(Math.max(0, i - periodsPerYear), i);
             const high52w = Math.max(...slicePrice);
             const distFromHigh = ((high52w - currentClose) / high52w) * 100;
             if (rsPositive && isGreen && ema50 && currentClose >= ema50 && distFromHigh <= 5) isEntry = true;
           }
        } else if (strategy === 'reversal') {
           if (ema20 && ema50 && ema200 && rsPositive && isGreen && currentClose > ema20 && currentClose > ema50 && ema50 < ema200) {
             isEntry = true;
           }
        } else if (strategy === 'rsBo') {
           if (rsPositive) {
             const sliceRs = chartData.rsSeries.slice(i - 253, i - 1).map((r: any) => r?.value).filter(Boolean);
             const maxRs = sliceRs.length > 0 ? Math.max(...sliceRs) : 0;
             if (rsValue > maxRs && isGreen) isEntry = true;
           }
        } else if (strategy === 'rsMom') {
           if (rsPositive && chartData.rsSeries[i-11]) {
             const rsMom1 = rsValue - chartData.rsSeries[i-11].value;
             const rsMom2 = chartData.rsSeries[i-2]?.value - chartData.rsSeries[i-12]?.value;
             // Ensure proper trailing check
             if (rsMom1 > 0 && rsMom1 > (rsMom2 || 0) && isGreen) isEntry = true;
           }
        } else if (strategy === 'sectorRs') {
           if (rsPositive && chartData.rsSeries[i-21]) {
             const shortRsMom = rsValue - chartData.rsSeries[i-21].value;
             if (shortRsMom > 0 && isGreen && ema20 && ema50 && ema20 > ema50) isEntry = true;
           }
        } else if (strategy === 'mtfRs') {
           if (rsPositive && chartData.rsSeries[i-201]) {
             const rs20Mom = rsValue - chartData.rsSeries[i-21].value;
             const rs50Mom = rsValue - chartData.rsSeries[i-51].value;
             const rs200Mom = rsValue - chartData.rsSeries[i-201].value;
             if (rs20Mom > 0 && rs50Mom > 0 && rs200Mom > 0 && isGreen) isEntry = true;
           }
        }

        if (isEntry) {
          inTrade = true;
          entryPrice = currentClose;
          entryIndex = i;
        }
      } else {
        // Exit conditions
        if (strategy === 'alpha') {
          if (ema20 < ema50) isExit = true;
        } else if (strategy === 'sangam') {
          if (currentClose < ema40) isExit = true;
        } else if (strategy === 'sangam2') {
          if (currentClose < ema50) isExit = true;
        } else if (strategy === 'rs52w') {
          if (currentClose < (ema50 || 0)) isExit = true;
        } else if (strategy === 'reversal') {
          if (currentClose < ema20) isExit = true;
        } else if (['rsBo', 'rsMom', 'sectorRs', 'mtfRs'].includes(strategy)) {
          // Trailing exit for momentum strategies based on breaking EMA 50
           if (currentClose < (ema50 || 0)) isExit = true;
        }

        if (isExit || i === closes.length - 1) { // Exit on last bar natively
          inTrade = false;
          const exitPrice = currentClose;
          const profitPct = ((exitPrice - entryPrice) / entryPrice) * 100;
          capital = capital * (1 + profitPct / 100);
          
          trades.push({
            entryIndex,
            exitIndex: i,
            entryDate: times[entryIndex],
            exitDate: times[i],
            entryPrice,
            exitPrice,
            profitPct,
            durationBars: i - entryIndex
          });
        }
      }

      // Record capital curve
      const currentValue = inTrade ? capital * (currentClose / entryPrice) : capital;
      capitalCurve.push({ time: times[i], value: currentValue });

      if (currentValue > peakValue) peakValue = currentValue;
      const drawdown = ((peakValue - currentValue) / peakValue) * 100;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    const winTrades = trades.filter(t => t.profitPct > 0);
    const winRate = trades.length > 0 ? (winTrades.length / trades.length) * 100 : 0;
    const avgProfit = trades.length > 0 ? trades.reduce((sum, t) => sum + t.profitPct, 0) / trades.length : 0;
    const avgDur = trades.length > 0 ? trades.reduce((sum, t) => sum + t.durationBars, 0) / trades.length : 0;
    const totalProfitPct = ((capital - 100000) / 100000) * 100;

    results[strategy] = {
      strategy,
      totalTrades: trades.length,
      winRate,
      totalProfitPct,
      avgProfitPct: avgProfit,
      avgDurationBars: avgDur,
      maxDrawdown,
      trades,
      capitalCurve
    };
  });

  return results;
}
