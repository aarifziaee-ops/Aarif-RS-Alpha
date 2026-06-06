import React, { useState } from 'react';
import { ChevronUp, ChevronDown, ArrowRight } from 'lucide-react';
import { ScanResult } from '../lib/types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface StockTableProps {
  results: ScanResult[];
  onSelect: (result: ScanResult) => void;
  selectedSymbol: string | null;
  strategy: string;
  watchlist?: any[];
  onToggleWatchlist?: (stock: ScanResult) => void;
}

type SortKey = 'name' | 'weeklyClose' | 'rsValue' | 'emaBullish' | 'rsPositive' | 'todayChange' | 'volume' | 'riskPct' | 'rewardRiskRatio';

type SortState = {
  key: SortKey;
  dir: 'asc' | 'desc';
};

export function StockTable({ results, onSelect, selectedSymbol, strategy, watchlist = [], onToggleWatchlist }: StockTableProps) {
  const [sort, setSort] = useState<SortState>({ key: 'name', dir: 'asc' });

  const sorted = [...results].sort((a, b) => {
    let valA: any = a[sort.key as keyof ScanResult];
    let valB: any = b[sort.key as keyof ScanResult];
    
    if (sort.key === 'riskPct') {
       valA = valA ?? Infinity;
       valB = valB ?? Infinity;
    }
    
    if (sort.key === 'rewardRiskRatio') {
       valA = valA ?? 0;
       valB = valB ?? 0;
    }

    if (sort.key === 'emaBullish' && strategy === 'alpha') {
       valA = (a.ema20 > a.ema50 && a.ema20 > a.ema100 && a.ema20 > a.ema200) ? 1 : 0;
       valB = (b.ema20 > b.ema50 && b.ema20 > b.ema100 && b.ema20 > b.ema200) ? 1 : 0;
    } else if (sort.key === 'emaBullish' && strategy === 'sangam') {
       valA = a.sangamPassed ? 1 : 0;
       valB = b.sangamPassed ? 1 : 0;
    } else if (sort.key === 'emaBullish' && strategy === 'reversal') {
       valA = a.reversalPassed ? 1 : 0;
       valB = b.reversalPassed ? 1 : 0;
    } else if (sort.key === 'emaBullish' && strategy === 'rs52w') {
       valA = a.rs52wPassed ? 1 : 0;
       valB = b.rs52wPassed ? 1 : 0;
    } else if (sort.key === 'emaBullish' && strategy === 'sangam2') {
       valA = a.sangam2Passed ? 1 : 0;
       valB = b.sangam2Passed ? 1 : 0;
    } else if (sort.key === 'emaBullish' && strategy === 'rsBo') {
       valA = a.rsBoPassed ? 1 : 0;
       valB = b.rsBoPassed ? 1 : 0;
    } else if (sort.key === 'emaBullish' && strategy === 'rsMom') {
       valA = a.rsMomPassed ? 1 : 0;
       valB = b.rsMomPassed ? 1 : 0;
    } else if (sort.key === 'emaBullish' && strategy === 'sectorRs') {
       valA = a.sectorRsPassed ? 1 : 0;
       valB = b.sectorRsPassed ? 1 : 0;
    } else if (sort.key === 'emaBullish' && strategy === 'mtfRs') {
       valA = a.mtfRsPassed ? 1 : 0;
       valB = b.mtfRsPassed ? 1 : 0;
    } else if (sort.key === 'emaBullish' && strategy === 'insideBar') {
       valA = a.insideBarPassed ? 1 : 0;
       valB = b.insideBarPassed ? 1 : 0;
    } else if (sort.key === 'rsPositive') {
       valA = (a.rsValue > a.rsEma) ? 1 : 0;
       valB = (b.rsValue > b.rsEma) ? 1 : 0;
    }

    if (valA < valB) return sort.dir === 'asc' ? -1 : 1;
    if (valA > valB) return sort.dir === 'asc' ? 1 : -1;
    return 0;
  });

  const handleSort = (key: SortKey) => {
    setSort(prev => ({
      key,
      dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc'
    }));
  };

  const SortIcon = ({ colKey }: { colKey: SortKey }) => {
    if (sort.key !== colKey) return <ChevronDown className="w-3 h-3 opacity-20" />;
    return sort.dir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
  };

  return (
    <div className="flex-1 w-full bg-[#131722] border border-[#1e222d] rounded overflow-auto shadow-2xl relative">
      <table className="w-full text-left text-xs border-collapse">
        <thead className="bg-[#1e222d] text-[#848e9c] uppercase font-semibold sticky top-0 z-10 border-b border-[#2a2e39]">
          <tr>
            <th className="p-3 font-medium cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('name')}>
              <div className="flex items-center gap-1">Symbol <SortIcon colKey="name" /></div>
            </th>
            <th className="p-3 font-medium cursor-pointer hover:text-white transition-colors text-right" onClick={() => handleSort('weeklyClose')}>
              <div className="flex items-center justify-end gap-1">Price <SortIcon colKey="weeklyClose" /></div>
            </th>
            <th className="p-3 font-medium text-right">
              Sector
            </th>
            <th className="p-3 font-medium cursor-pointer hover:text-white transition-colors text-right" onClick={() => handleSort('todayChange')}>
               <div className="flex items-center justify-end gap-1">Today % <SortIcon colKey="todayChange" /></div>
            </th>
            <th className="p-3 font-medium cursor-pointer hover:text-white transition-colors text-right" onClick={() => handleSort('volume')}>
               <div className="flex items-center justify-end gap-1">Vol <SortIcon colKey="volume" /></div>
            </th>
            <th className="p-3 font-medium cursor-pointer hover:text-white transition-colors text-right" onClick={() => handleSort('riskPct')}>
               <div className="flex items-center justify-end gap-1">Risk % <SortIcon colKey="riskPct" /></div>
            </th>
            <th className="p-3 font-medium cursor-pointer hover:text-white transition-colors text-right" onClick={() => handleSort('rewardRiskRatio')}>
               <div className="flex items-center justify-end gap-1">R:R <SortIcon colKey="rewardRiskRatio" /></div>
            </th>
            <th className="p-3 font-medium text-right">
              Action
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#1e222d] text-white">
          {sorted.map(result => {
            const emaBullish = strategy === 'alpha' 
               ? (result.ema20 > result.ema50 && result.ema20 > result.ema100 && result.ema20 > result.ema200)
               : (strategy === 'sangam' ? result.sangamPassed : (strategy === 'rs52w' ? result.rs52wPassed : (strategy === 'minervini' ? result.minerviniPassed : (strategy === 'mansfield' ? result.mansfieldPassed : (strategy === 'sangam2' ? result.sangam2Passed : (strategy === 'rsBo' ? result.rsBoPassed : (strategy === 'rsMom' ? result.rsMomPassed : (strategy === 'sectorRs' ? result.sectorRsPassed : (strategy === 'mtfRs' ? result.mtfRsPassed : (strategy === 'insideBar' ? result.insideBarPassed : result.reversalPassed))))))))));
            
            const rsPositive = result.rsValue > result.rsEma;
            const isSelected = selectedSymbol === result.symbol;
            const passed = strategy === 'alpha' ? result.passed : (strategy === 'sangam' ? result.sangamPassed : (strategy === 'rs52w' ? result.rs52wPassed : (strategy === 'minervini' ? result.minerviniPassed : (strategy === 'mansfield' ? result.mansfieldPassed : (strategy === 'sangam2' ? result.sangam2Passed : (strategy === 'rsBo' ? result.rsBoPassed : (strategy === 'rsMom' ? result.rsMomPassed : (strategy === 'sectorRs' ? result.sectorRsPassed : (strategy === 'mtfRs' ? result.mtfRsPassed : (strategy === 'insideBar' ? result.insideBarPassed : result.reversalPassed))))))))));
            
            const isHighConviction = (strategy === 'insideBar' || strategy === 'reversal') && passed && (result.riskPct ?? Infinity) <= 4 && (result.rewardRiskRatio ?? 0) >= 2.5;

            return (
              <tr 
                key={result.symbol} 
                onClick={() => onSelect(result)}
                className={cn(
                  "cursor-pointer transition-colors",
                  isSelected ? "bg-[#1e222d]" : (isHighConviction ? "bg-[#ffaa00]/10 hover:bg-[#ffaa00]/20" : "bg-[#171b26] hover:bg-[#1e222d]")
                )}
              >
                <td className="p-3 font-bold border-l-2" style={{ borderLeftColor: passed ? (isHighConviction ? '#ffaa00' : '#00ff9d') : 'transparent' }}>
                  <div className="flex items-start gap-2">
                    <button 
                      onClick={(e) => { e.stopPropagation(); onToggleWatchlist?.(result); }}
                      className={cn("mt-0.5 p-1 rounded transition-colors flex-shrink-0", watchlist.find(w => w.symbol === result.symbol) ? "text-[#ffeb3b]" : "text-[#848e9c] hover:text-white")}
                    >
                      <svg className="w-4 h-4" fill={watchlist.find(w => w.symbol === result.symbol) ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"></path></svg>
                    </button>
                    <div>
                      <div className="flex items-center gap-2">
                        <span>{result.name}</span>
                        {isHighConviction && <span className="text-[10px] bg-[#ffaa00]/20 text-[#ffaa00] px-1.5 py-0.5 rounded font-mono border border-[#ffaa00]/30 shadow-[#ffaa00]/20 shadow-sm" title="High Conviction Setup">⭐ HIGH R:R</span>}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="p-3 text-right font-mono text-lg font-bold">
                  {result.weeklyClose.toFixed(2)}
                </td>
                <td className="p-3 text-right font-mono text-[10px] text-[#b2b5be] max-w-[120px] truncate">
                  {result.sector || '-'}
                </td>
                <td className="p-3 text-right font-mono text-base">
                   <span className={cn(result.todayChange > 0 ? "text-[#00ff9d]" : result.todayChange < 0 ? "text-[#f44336]" : "text-[#b2b5be]")}>
                     {result.todayChange > 0 ? '+' : ''}{result.todayChange.toFixed(2)}%
                   </span>
                </td>
                <td className="p-3 text-right font-mono text-base font-semibold text-[#b2b5be]">
                   {result.volume > 1000000 ? (result.volume / 1000000).toFixed(2) + 'M' : (result.volume / 1000).toFixed(1) + 'K'}
                </td>
                <td className="p-3 text-right font-mono text-base font-semibold">
                   <span className={cn("px-2 py-1 rounded", result.riskPct && result.riskPct < 5 ? "bg-[#00ff9d]/20 text-[#00ff9d]" : result.riskPct && result.riskPct > 10 ? "bg-[#f44336]/20 text-[#f44336]" : "bg-[#1e222d] text-[#848e9c]")}>
                     {result.riskPct ? result.riskPct.toFixed(1) + '%' : '-'}
                   </span>
                </td>
                <td className="p-3 text-right font-mono text-base font-semibold">
                   <span className={cn("px-2 py-1 rounded", result.rewardRiskRatio && result.rewardRiskRatio >= 2 ? "bg-[#00ff9d]/20 text-[#00ff9d]" : "bg-[#1e222d] text-[#848e9c]")}>
                     {result.rewardRiskRatio ? result.rewardRiskRatio.toFixed(1) : '-'}
                   </span>
                </td>
                <td className="p-3 text-right text-[#2962ff] font-medium text-[11px] group-hover:text-[#3d7eff]">
                  <div className="flex items-center justify-end gap-1">
                    Chart <ArrowRight className="w-3 h-3" />
                  </div>
                </td>
              </tr>
            );
          })}
          {results.length === 0 && (
            <tr>
              <td colSpan={8} className="p-8 text-center text-[#848e9c]">
                Run the scan to see results
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
