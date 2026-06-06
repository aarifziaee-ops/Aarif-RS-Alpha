import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, CandlestickSeries, LineSeries, HistogramSeries } from 'lightweight-charts';
import { ScanResult } from '../lib/types';
import { getChartData } from '../lib/fetchChartData';
import { BacktestPanel } from './BacktestPanel';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ChartProps {
  data: ScanResult | null;
  defaultTimeframe?: string;
  strategy?: string;
  market?: string;
}

const TIMEFRAMES = ['1H', '1D', '1W', '1M'];

export function StockChart({ data, defaultTimeframe = '1W', strategy = 'alpha', market = 'stocks' }: ChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const rsChartContainerRef = useRef<HTMLDivElement>(null);
  const momChartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const rsChartRef = useRef<IChartApi | null>(null);
  const momChartRef = useRef<IChartApi | null>(null);

  const [timeframe, setTimeframe] = useState(defaultTimeframe);
  const [view, setView] = useState<'chart' | 'backtest'>('chart');
  const [hoverData, setHoverData] = useState<any>(null);

  useEffect(() => {
    setTimeframe(defaultTimeframe);
  }, [defaultTimeframe, data?.symbol]);
  const [chartData, setChartData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (data?.symbol) {
      setLoading(true);
      getChartData(data.symbol, timeframe).then(res => {
        setChartData(res);
        setLoading(false);
      }).catch(err => {
        console.error("Failed to load chart data:", err);
        setLoading(false);
      });
    } else {
      setChartData(null);
    }
  }, [data?.symbol, timeframe]);

  useEffect(() => {
    if (!chartContainerRef.current || !rsChartContainerRef.current || !chartData) return;

    // Create main chart
    const chart = createChart(chartContainerRef.current, {
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#848e9c' },
      grid: { vertLines: { color: 'transparent' }, horzLines: { color: 'transparent' } },
      timeScale: { timeVisible: timeframe === '1H', borderColor: '#1e222d', rightOffset: 5, fixLeftEdge: true, visible: false },
      crosshair: { mode: 0 },
      rightPriceScale: { borderColor: '#1e222d' },
      autoSize: true,
    });
    chartRef.current = chart;

    // Create RS indicator chart
    const rsChart = createChart(rsChartContainerRef.current, {
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#848e9c' },
      grid: { vertLines: { color: 'transparent' }, horzLines: { color: 'transparent' } },
      timeScale: { timeVisible: false, borderColor: '#1e222d', rightOffset: 5, fixLeftEdge: true },
      crosshair: { mode: 0 },
      rightPriceScale: { borderColor: '#1e222d' },
      autoSize: true,
    });
    rsChartRef.current = rsChart;

    let momChart: IChartApi | null = null;
    if (momChartContainerRef.current) {
      momChart = createChart(momChartContainerRef.current, {
        layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#848e9c' },
        grid: { vertLines: { color: 'transparent' }, horzLines: { color: 'transparent' } },
        timeScale: { timeVisible: timeframe === '1H', borderColor: '#1e222d', rightOffset: 5, fixLeftEdge: true },
        crosshair: { mode: 0 },
        rightPriceScale: { borderColor: '#1e222d' },
        autoSize: true,
      });
      momChartRef.current = momChart;
    }

    // Candlestick Series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#00ff9d', downColor: '#f44336',
      borderVisible: false, wickUpColor: '#00ff9d', wickDownColor: '#f44336',
    });
    candleSeries.setData(chartData.candleData);

    // Support and Resistance Levels
    const findPivots = (data: any[], type: 'high' | 'low', leftLen: number, rightLen: number) => {
      const pivots = [];
      for (let i = leftLen; i < data.length - rightLen; i++) {
        let isPivot = true;
        const currentVal = type === 'high' ? data[i].high : data[i].low;
        
        for (let j = i - leftLen; j <= i + rightLen; j++) {
          if (i === j) continue;
          const compareVal = type === 'high' ? data[j].high : data[j].low;
          if (type === 'high' && compareVal > currentVal) isPivot = false;
          if (type === 'low' && compareVal < currentVal) isPivot = false;
        }
        
        if (isPivot) {
          pivots.push({ time: data[i].time, value: currentVal });
        }
      }
      return pivots;
    };

    const swingHighs = findPivots(chartData.candleData, 'high', 20, 20);
    const swingLows = findPivots(chartData.candleData, 'low', 20, 20);

    const latestPrice = chartData.candleData[chartData.candleData.length - 1].close;

    // Filter to significant levels near current price
    const nearbyHighs = swingHighs.filter(p => p.value > latestPrice).slice(-2);
    const nearbyLows = swingLows.filter(p => p.value < latestPrice).slice(-2);

    [...nearbyHighs, ...nearbyLows].forEach((pivot, idx) => {
        candleSeries.createPriceLine({
            price: pivot.value,
            color: pivot.value > latestPrice ? 'rgba(244, 67, 54, 0.4)' : 'rgba(0, 255, 157, 0.4)',
            lineWidth: 1 as any,
            lineStyle: 2 as any, // dashed
            axisLabelVisible: true,
            title: pivot.value > latestPrice ? 'Res' : 'Sup',
        });
    });

    // Auto Trendlines
    if (swingHighs.length >= 2) {
       const p1 = swingHighs[swingHighs.length - 2];
       const p2 = swingHighs[swingHighs.length - 1];
       const trendSeries = chart.addSeries(LineSeries, {
           color: 'rgba(244, 67, 54, 0.6)', 
           lineWidth: 1 as any, 
           crosshairMarkerVisible: false, 
           priceLineVisible: false
       });
       trendSeries.setData([p1, p2]);
    }

    if (swingLows.length >= 2) {
       const p1 = swingLows[swingLows.length - 2];
       const p2 = swingLows[swingLows.length - 1];
       const trendSeries = chart.addSeries(LineSeries, {
           color: 'rgba(0, 255, 157, 0.6)', 
           lineWidth: 1 as any, 
           crosshairMarkerVisible: false, 
           priceLineVisible: false
       });
       trendSeries.setData([p1, p2]);
    }

    const addLineSeries = (targetChart: IChartApi, color: string, seriesData: any[], width = 2) => {
        const s = targetChart.addSeries(LineSeries, {
          color, lineWidth: width as any, crosshairMarkerVisible: true, priceLineVisible: false
        });
        s.setData(seriesData);
    };

    // Add EMAs to main
    if (strategy !== 'ema50') {
      addLineSeries(chart, '#2962ff', chartData.ema20); // blue
    }
    
    if (strategy === 'alpha') {
      addLineSeries(chart, '#9c27b0', chartData.ema5, 1);  // purple
      addLineSeries(chart, '#00bcd4', chartData.ema10, 1); // cyan
      addLineSeries(chart, '#ff9800', chartData.ema50); // amber
      addLineSeries(chart, '#ec4899', chartData.ema100); // pink
      addLineSeries(chart, '#f44336', chartData.ema200, 2); // red
    } else if (strategy === 'sangam') {
      addLineSeries(chart, '#ff9800', chartData.ema30); // amber
      addLineSeries(chart, '#ec4899', chartData.ema40); // pink
    } else if (strategy === 'sangam2') {
      addLineSeries(chart, '#ff9800', chartData.ema50); // amber
    } else if (strategy === 'ema50') {
      addLineSeries(chart, '#ff9800', chartData.ema50); // amber
    } else if (strategy === 'sma9') {
      addLineSeries(chart, '#00e676', chartData.sma9Series); // green for sma9
    } else {
      addLineSeries(chart, '#ff9800', chartData.ema50); // amber
      addLineSeries(chart, '#f44336', chartData.ema200, 2); // red
    }

    // Add RS and RS EMA to indicator chart
    const rsSeries = rsChart.addSeries(LineSeries, { color: '#00ff9d', lineWidth: 2, priceLineVisible: false });
    rsSeries.setData(chartData.rsSeries);

    addLineSeries(rsChart, '#ffeb3b', chartData.rsEma, 1);

    let momSeries: any = null;
    if (momChart) {
      momSeries = momChart.addSeries(HistogramSeries, { 
        color: '#2962ff', priceLineVisible: false 
      });
      const momData = chartData.rsMom.map((d: any) => ({
        time: d.time,
        value: d.value,
        color: d.value >= 0 ? 'rgba(0, 255, 157, 0.5)' : 'rgba(244, 67, 54, 0.5)'
      }));
      momSeries.setData(momData);
      momChart.timeScale().fitContent();
    }

    chart.timeScale().fitContent();
    rsChart.timeScale().fitContent();

    // Sync scales (basic)
    chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (range) {
          rsChart.timeScale().setVisibleLogicalRange(range);
          if (momChart) momChart.timeScale().setVisibleLogicalRange(range);
        }
    });
    rsChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (range) {
          chart.timeScale().setVisibleLogicalRange(range);
          if (momChart) momChart.timeScale().setVisibleLogicalRange(range);
        }
    });
    if (momChart) {
      momChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
          if (range) {
            chart.timeScale().setVisibleLogicalRange(range);
            rsChart.timeScale().setVisibleLogicalRange(range);
          }
      });
    }

    chart.subscribeCrosshairMove(param => {
      if (param.time && param.seriesData.get(candleSeries)) {
        const data: any = param.seriesData.get(candleSeries);
        setHoverData(data);
      } else {
        setHoverData(null);
      }
      
      if (param.time === undefined || param.point === undefined || param.point.x < 0 || param.point.y < 0) {
        rsChart.clearCrosshairPosition();
        if (momChart) momChart.clearCrosshairPosition();
      } else {
        rsChart.setCrosshairPosition(param.point.x, param.time, rsSeries);
        if (momChart && momSeries) momChart.setCrosshairPosition(param.point.x, param.time, momSeries);
      }
    });
    
    rsChart.subscribeCrosshairMove(param => {
      if (param.time === undefined || param.point === undefined || param.point.x < 0 || param.point.y < 0) {
        chart.clearCrosshairPosition();
        if (momChart) momChart.clearCrosshairPosition();
      } else {
        chart.setCrosshairPosition(param.point.x, param.time, candleSeries);
        if (momChart && momSeries) momChart.setCrosshairPosition(param.point.x, param.time, momSeries);
      }
    });

    if (momChart) {
      momChart.subscribeCrosshairMove(param => {
        if (param.time === undefined || param.point === undefined || param.point.x < 0 || param.point.y < 0) {
          chart.clearCrosshairPosition();
          rsChart.clearCrosshairPosition();
        } else {
          chart.setCrosshairPosition(param.point.x, param.time, candleSeries);
          rsChart.setCrosshairPosition(param.point.x, param.time, rsSeries);
        }
      });
    }

    return () => {
      chart.remove();
      rsChart.remove();
      if (momChart) momChart.remove();
    };
  }, [chartData, timeframe]);

  if (!data) {
    return (
      <div className="w-full h-full flex items-center justify-center text-[#848e9c] text-sm">
        Select a stock to view its chart
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col relative bg-[#131722]">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0d1017]/50 backdrop-blur-sm">
           <span className="text-[#00ff9d] text-sm font-mono animate-pulse">Loading Data...</span>
        </div>
      )}
      
      <div className="absolute top-2 left-3 z-10 flex items-center gap-4">
        <div className="flex items-center gap-1 bg-[#1e222d] p-1 rounded">
          {TIMEFRAMES.map(tf => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-2 py-0.5 text-xs font-mono rounded ${
                timeframe === tf 
                  ? 'bg-[#00ff9d] text-black font-bold' 
                  : 'text-[#848e9c] hover:text-white hover:bg-[#2a2e39]'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
        
        <div className="flex items-center gap-1 bg-[#1e222d] p-1 rounded">
          <button
            onClick={() => setView('chart')}
            className={`px-3 py-0.5 text-xs font-mono rounded ${
              view === 'chart' ? 'bg-[#2962ff] text-white font-bold' : 'text-[#848e9c] hover:text-white hover:bg-[#2a2e39]'
            }`}
          >
            Chart
          </button>
          <button
            onClick={() => setView('backtest')}
            className={`px-3 py-0.5 text-xs font-mono rounded ${
              view === 'backtest' ? 'bg-[#2962ff] text-white font-bold' : 'text-[#848e9c] hover:text-white hover:bg-[#2a2e39]'
            }`}
          >
            Performance Backtest
          </button>
        </div>
      </div>

      {view === 'backtest' && chartData && data ? (
        <div className="w-full h-full pt-12 overflow-hidden">
          <BacktestPanel chartData={chartData} timeframe={timeframe} selectedStock={data} />
        </div>
      ) : (
        <>
          {hoverData && (
            <div className="absolute top-[48px] left-3 z-10 flex gap-4 text-[10px] font-mono text-[#848e9c] bg-[#1e222d]/80 px-2 py-1 rounded backdrop-blur-sm pointer-events-none">
              <span>O <span className="text-white">{hoverData.open.toFixed(2)}</span></span>
              <span>H <span className="text-white">{hoverData.high.toFixed(2)}</span></span>
              <span>L <span className="text-white">{hoverData.low.toFixed(2)}</span></span>
              <span>C <span className={hoverData.close >= hoverData.open ? "text-[#00ff9d]" : "text-[#f44336]"}>{hoverData.close.toFixed(2)}</span></span>
            </div>
          )}
          <div ref={chartContainerRef} className="w-full flex-[2] min-h-[150px]" />
          
          <div className="px-3 py-1.5 border-t border-b border-[#1e222d] bg-[#0d1017]/80 flex items-center gap-4 shrink-0 shadow-inner">
              <span className="text-[9px] font-bold text-[#d1d4dc] uppercase tracking-wider">Indicator: RS(123) vs {market === 'crypto' ? 'BTC-USD' : 'NIFTY'}</span>
              {chartData && (
                <>
                  <span className="text-[9px] text-[#00ff9d] font-mono">Line: {chartData.latestRs?.toFixed(4) || 'N/A'}</span>
                  <span className="text-[9px] text-[#ffeb3b] font-mono">EMA: {chartData.latestRsEma?.toFixed(4) || 'N/A'}</span>
                </>
              )}
          </div>
          
          <div ref={rsChartContainerRef} className="w-full flex-[0.75] min-h-[60px]" />
          
          <div className="px-3 py-1.5 border-t border-b border-[#1e222d] bg-[#0d1017]/80 flex items-center gap-4 shrink-0 shadow-inner">
              <span className="text-[9px] font-bold text-[#d1d4dc] uppercase tracking-wider">Indicator: RS Momentum</span>
          </div>
          <div ref={momChartContainerRef} className="w-full flex-[0.5] min-h-[40px]" />
        </>
      )}
    </div>
  );
}
