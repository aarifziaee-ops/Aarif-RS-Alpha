import React from 'react';
import { ScanResult } from '../lib/types';
import { cn } from './StockTable';

interface SectorHeatmapProps {
  results: ScanResult[];
  onSelect: (sectorSymbol: string) => void;
}

export function SectorHeatmap({ results, onSelect }: SectorHeatmapProps) {
  // We only want to show sectors, which have symbol starting with ^
  const sectorResults = results.filter(r => r?.symbol?.startsWith('^') || r?.sector);

  // Group by some performance metric or just show a grid with colored boxes.
  // Using todayChange for color
  const sorted = [...sectorResults].sort((a, b) => b.todayChange - a.todayChange);

  return (
    <div className="flex-1 w-full p-4 overflow-y-auto bg-[#0d1017]">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {sorted.map(result => {
          const isUp = result.todayChange >= 0;
          const heatLevel = Math.min(Math.abs(result.todayChange) / 2, 1); // Max intensity at 2% change
          
          let bgColor;
          if (isUp) {
            bgColor = `rgba(0, 255, 157, ${0.1 + heatLevel * 0.4})`;
          } else {
            bgColor = `rgba(244, 67, 54, ${0.1 + heatLevel * 0.4})`;
          }

          return (
            <div
              key={result.symbol}
              onClick={() => onSelect(result.symbol)}
              style={{ backgroundColor: bgColor }}
              className="cursor-pointer rounded-lg border border-[#1e222d] shadow-lg flex flex-col items-center justify-center p-4 h-32 hover:scale-105 transition-transform"
            >
              <span className="text-white font-bold text-sm text-center mb-2 line-clamp-2">{result.name}</span>
              <span className="text-white/80 font-mono text-xs">{result.weeklyClose.toFixed(2)}</span>
              <span className={cn(
                "font-mono text-xs font-bold mt-1 px-2 py-0.5 rounded",
                isUp ? "text-[#00ff9d] bg-black/30" : "text-[#f44336] bg-black/30"
              )}>
                {isUp ? '+' : ''}{result.todayChange.toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
