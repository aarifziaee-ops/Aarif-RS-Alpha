import React, { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Cell } from 'recharts';
import { runBacktest, BacktestResult } from '../lib/backtest';
import { ScanResult } from '../lib/types';
import { cn } from './StockTable';

interface BacktestPanelProps {
  chartData: any;
  timeframe: string;
  selectedStock: ScanResult;
}

const STRATEGIES = [
  { id: 'alpha', name: 'Alpha' },
  { id: 'sangam', name: 'Sangam' },
  { id: 'sangam2', name: 'Sangam 2.0' },
  { id: 'reversal', name: 'Reversal' },
  { id: 'rs52w', name: 'RS 52W High' },
  { id: 'rsBo', name: 'RS B/O' },
  { id: 'rsMom', name: 'RS Mom' },
  { id: 'sectorRs', name: 'Sector RS' },
  { id: 'mtfRs', name: 'MTF RS' },
];

export function BacktestPanel({ chartData, timeframe, selectedStock }: BacktestPanelProps) {
  const [activeStrategy, setActiveStrategy] = React.useState('alpha');

  const backtestResults = useMemo(() => {
    if (!chartData) return null;
    return runBacktest(chartData, timeframe);
  }, [chartData, timeframe]);

  if (!backtestResults) return null;

  const currentResult = backtestResults[activeStrategy];

  return (
    <div className="w-full h-full flex flex-col p-4 overflow-y-auto bg-[#0d1017]">
      <h2 className="text-xl font-bold text-white mb-4">Strategy Performance: {selectedStock.name} ({timeframe})</h2>
      
      {/* Strategy selector */}
      <div className="flex bg-[#1e222d] p-1 rounded-lg mb-6 max-w-full overflow-x-auto shrink-0">
        {STRATEGIES.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveStrategy(s.id)}
            className={cn(
              "px-4 py-2 font-mono text-sm transition-colors rounded whitespace-nowrap",
              activeStrategy === s.id ? "bg-[#2962ff] text-white" : "text-[#848e9c] hover:bg-[#2a2e39]"
            )}
          >
            {s.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 shrink-0">
        <MetricCard title="Total Return" value={`${currentResult.totalProfitPct.toFixed(2)}%`} isPositive={currentResult.totalProfitPct > 0} />
        <MetricCard title="Win Rate" value={`${currentResult.winRate.toFixed(1)}%`} isPositive={currentResult.winRate > 50} />
        <MetricCard title="Total Trades" value={currentResult.totalTrades} />
        <MetricCard title="Max Drawdown" value={`${currentResult.maxDrawdown.toFixed(2)}%`} isPositive={false} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[300px]">
        {/* Equity Curve */}
        <div className="bg-[#1e222d] border border-[#2a2e39] rounded-lg p-4 flex flex-col">
          <h3 className="text-sm font-bold text-[#b2b5be] mb-4">Equity Curve (Initial: 100k)</h3>
          <div className="flex-1 w-full min-h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={currentResult.capitalCurve}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2962ff" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#2962ff" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" stroke="#2a2e39" tick={{fill: '#848e9c', fontSize: 10}} minTickGap={30} />
                <YAxis domain={['auto', 'auto']} stroke="#2a2e39" tick={{fill: '#848e9c', fontSize: 10}} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#131722', border: '1px solid #2a2e39', color: '#fff' }}
                  itemStyle={{ color: '#00ff9d' }}
                  labelStyle={{ color: '#848e9c' }}
                  formatter={(value: number) => [`₹${value.toFixed(2)}`, 'Capital']}
                />
                <Area type="monotone" dataKey="value" stroke="#2962ff" fillOpacity={1} fill="url(#colorValue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Trades Distribution */}
        <div className="bg-[#1e222d] border border-[#2a2e39] rounded-lg p-4 flex flex-col">
          <h3 className="text-sm font-bold text-[#b2b5be] mb-4">Trade PNL %</h3>
          <div className="flex-1 w-full min-h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={currentResult.trades}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2e39" vertical={false} />
                <XAxis dataKey="entryDate" stroke="#2a2e39" tick={{fill: '#848e9c', fontSize: 10}} minTickGap={30} />
                <YAxis stroke="#2a2e39" tick={{fill: '#848e9c', fontSize: 10}} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#131722', border: '1px solid #2a2e39', color: '#fff' }}
                  formatter={(value: number) => [`${value.toFixed(2)}%`, 'Profit / Loss']}
                  labelStyle={{ color: '#848e9c' }}
                />
                <Bar dataKey="profitPct" radius={[2, 2, 0, 0]}>
                  {currentResult.trades.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.profitPct >= 0 ? '#00ff9d' : '#f44336'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value, isPositive }: { title: string, value: string | number, isPositive?: boolean }) {
  return (
    <div className="bg-[#1e222d] border border-[#2a2e39] rounded-lg p-4 flex flex-col justify-center items-center">
      <span className="text-xs text-[#848e9c] mb-1 font-mono uppercase tracking-wider">{title}</span>
      <span className={cn(
        "text-2xl font-bold font-mono",
        isPositive === true ? "text-[#00ff9d]" : isPositive === false ? "text-[#f44336]" : "text-white"
      )}>
        {value}
      </span>
    </div>
  );
}
