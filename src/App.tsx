/**
 * README: Nifty 500 Stock Scanner
 * 
 * HOW TO USE:
 * 1. Open the application.
 * 2. Click the "Run Scan" button in the top right to start fetching and analyzing data.
 * 3. A loading indicator will show the progress as it fetches data for the Nifty 500 constituents.
 * 4. Once fetching is complete, the table will populate with stocks that meet ALL criteria by default.
 * 5. You can toggle the "Showing Passes Only" filter to see all scanned stocks, or search for specific symbols.
 * 6. Click on any row in the table to view the interactive chart for that stock, which plots the price and EMAs.
 * 
 * TECHNICAL INDICATORS USED:
 * - Weekly EMAs (20, 50, 100, 200): The scanner calculates Exponential Moving Averages on the weekly close prices.
 * - RS(123) (Relative Strength): Computes the ratio of the stock's daily close price to the Nifty 50 (^NSEI) daily close price, 
 *   then calculates a 123-period EMA of that ratio line.
 * 
 * SCAN CRITERIA:
 * 1. Bullish Structure: The 20 EMA must be greater than the 50 EMA, 100 EMA, and 200 EMA on the weekly timeframe.
 * 2. Outperformance: The Daily RS value must be greater than its 123-day EMA.
 * 
 * HOW TO MODIFY CRITERIA:
 * - To change the symbols scanned, edit the `NIFTY_500_SYMBOLS` array in `src/lib/types.ts`.
 * - To change the EMA periods or logic, look at `src/lib/scanner.ts` -> `RunScan` function.
 *   - You can update `calculateEMA(weeklyCloses, X)` to your preferred period.
 *   - You can update the `emaBullish` boolean condition to use different comparisons.
 * - To change the RS reference index, change `'^NSEI'` to your preferred ticker in `fetchYahooData('^NSEI', ...)` in `scanner.ts`.
 * 
 * Note: Data is fetched via a local Express proxy (`server.ts`) which completely eliminates the CORS errors and "Failed to fetch" issues from free proxies. While the data source is Yahoo Finance (for highly reliable 10-year historical data which NSE does not provide via its public unauth API), it seamlessly analyzes NSE stocks.
 */
import React, { useState, useEffect } from 'react';
import { Play, Search, AlertCircle, RefreshCw, X, Download, Menu, Plus, Upload, Trash2, Edit2 } from 'lucide-react';
import { NIFTY_500_SYMBOLS, CRYPTO_SYMBOLS, US_STOCKS, HALAL_US_STOCKS, HALAL_IN_STOCKS, SECTOR_INDICES, ScanResult } from './lib/types';
import { runScan } from './lib/scanner';
import { StockTable } from './components/StockTable';
import { StockChart } from './components/Chart';
import { Portfolio } from './components/Portfolio';
import { AnalysisPanel } from './components/AnalyzePanel';
import { cn } from './components/StockTable';
import { SectorHeatmap } from './components/SectorHeatmap';

export default function App() {
  const [results, setResults] = useState<ScanResult[]>([]);
  const [filteredResults, setFilteredResults] = useState<ScanResult[]>([]);
  const [scanning, setScanning] = useState(false);
  const [market, setMarket] = useState<string>('stocks');
  const [sectorViewMode, setSectorViewMode] = useState<'table' | 'heatmap'>('heatmap');
  const [activeSectorToScan, setActiveSectorToScan] = useState<string | null>(null);
  const [progress, setProgress] = useState({ scanned: 0, total: 500 });
  
  useEffect(() => {
    // Only update initial total if not scanning sector constituents
    if (market !== 'sector_constituents') {
       setProgress({ scanned: 0, total: market === 'sectors' ? SECTOR_INDICES.length : market === 'crypto' ? CRYPTO_SYMBOLS.length : market === 'us_stocks' ? US_STOCKS.length : market === 'halal_us' ? HALAL_US_STOCKS.length : market === 'halal_in' ? HALAL_IN_STOCKS.length : NIFTY_500_SYMBOLS.length });
    }
  }, [market]);
  const [selectedStock, setSelectedStock] = useState<ScanResult | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [scannerTimeframe, setScannerTimeframe] = useState<'1W' | '1D'>('1D');
  const [strategy, setStrategy] = useState<string>('minervini');
  
  const [showOnlyPassed, setShowOnlyPassed] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  interface CustomWatchlist {
    id: string;
    name: string;
    items: any[];
  }

  const [watchlists, setWatchlists] = useState<CustomWatchlist[]>(() => {
    const defaultLists = [
      { id: 'default', name: 'MAIN', items: [] },
      { id: 'insidebar', name: 'INSIDE BAR', items: [] },
      { id: 'sangam', name: 'SANGAM', items: [] },
      { id: 'sangam2', name: 'SANGAM 2.0', items: [] }
    ];
    
    const savedRaw = localStorage.getItem('trader_custom_watchlists');
    if (savedRaw) {
        const parsed = JSON.parse(savedRaw);
        // Ensure default lists exist in parsed data
        defaultLists.forEach(dl => {
           if (!parsed.find((p: any) => p.name.toLowerCase() === dl.name.toLowerCase() || p.id === dl.id)) {
               parsed.push(dl);
           }
        });
        return parsed;
    }
    const legacySaved = localStorage.getItem('trader_watchlist');
    if (legacySaved) {
        const legacyItems = JSON.parse(legacySaved);
        if (legacyItems && legacyItems.length > 0) {
            defaultLists[0].items = legacyItems;
            return defaultLists;
        }
    }
    return defaultLists;
  });
  const [activeWatchlistId, setActiveWatchlistId] = useState<string>('default');

  const watchlist = watchlists.find(w => w.id === activeWatchlistId)?.items || [];
  
  const setWatchlist = (updater: any) => {
      setWatchlists(prev => prev.map(list => {
          if (list.id === activeWatchlistId) {
              const newItems = typeof updater === 'function' ? updater(list.items) : updater;
              return { ...list, items: newItems };
          }
          return list;
      }));
  }

  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [isNamingWatchlist, setIsNamingWatchlist] = useState(false);
  const [newWatchlistName, setNewWatchlistName] = useState('');
  const [sidebarTab, setSidebarTab] = useState<'scanner' | 'watchlist' | 'calls'>('scanner');
  const [mainView, setMainView] = useState<'scan' | 'portfolio' | 'analyze'>('scan');
  const [marketOverview, setMarketOverview] = useState<Record<string, { price: number, change: number, changePct: number }> | null>(null);

  useEffect(() => {
    const fetchOverview = async () => {
      try {
        const baseUrl = typeof window === 'undefined' ? 'http://localhost:3000' : '';
        const res = await fetch(`${baseUrl}/api/market-overview`, {
          headers: { 'Accept': 'application/json' }
        });
        if (!res.ok) throw new Error('Failed to fetch market overview');
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") === -1) return;
        const data = await res.json();
        setMarketOverview(data);
      } catch (err) {
        console.warn('Market overview error:', err);
      }
    };
    
    fetchOverview();
    const intervalId = setInterval(fetchOverview, 30000);
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    localStorage.setItem('trader_custom_watchlists', JSON.stringify(watchlists));
    // Keep legacy updated optionally or just drop it. Better to drop legacy tracking 
    // but just let it be superseded by custom watchlists.
  }, [watchlists]);

  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission();
      }
    }
  }, []);

  const alertedTargets = React.useRef<Set<string>>(new Set());

  useEffect(() => {
    if (watchlist.length === 0) return;

    
    // Refresh quotes every 15 seconds
    const intervalId = setInterval(async () => {
      try {
        const symbolsArray = watchlist.map(w => w.symbol);
        const batchSize = 200;
        const data: Record<string, number> = {};
        const baseUrl = typeof window === 'undefined' ? 'http://localhost:3000' : '';
        
        for (let i = 0; i < symbolsArray.length; i += batchSize) {
           const batch = symbolsArray.slice(i, i + batchSize);
           const res = await fetch(`${baseUrl}/api/quote`, {
             method: 'POST',
             headers: {
               'Content-Type': 'application/json',
               'Accept': 'application/json'
             },
             body: JSON.stringify({ symbols: batch })
           });
           
           const contentType = res.headers.get("content-type");
           if (contentType && contentType.indexOf("application/json") === -1) {
                // Return gracefully if HTML is received (usually happens during dev server restart)
                console.warn(`API returned HTML instead of JSON. Server may be restarting.`);
                continue;
           }

           if (!res.ok) {
               const text = await res.text();
               throw new Error(`Network response was not ok: ${res.status} ${text}`);
           }
           const batchData = await res.json();
           Object.assign(data, batchData);
        }
        
        setWatchlist(prev => prev.map(w => {
           if (data[w.symbol]) {
               const currentPrice = data[w.symbol];
               // Check alerts
               if (currentPrice > 0 && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                 if (w.targetPrice && currentPrice >= w.targetPrice) {
                   const alertKey = `${w.symbol}-target-${w.targetPrice}`;
                   if (!alertedTargets.current.has(alertKey)) {
                     new Notification('Target Reached', { body: `${w.symbol} has reached your target of ${w.targetPrice}!` });
                     alertedTargets.current.add(alertKey);
                   }
                 }
                 if (w.stopLoss && currentPrice <= w.stopLoss) {
                   const alertKey = `${w.symbol}-sl-${w.stopLoss}`;
                   if (!alertedTargets.current.has(alertKey)) {
                     new Notification('Stop Loss Triggered', { body: `${w.symbol} has dropped to or below your stop loss of ${w.stopLoss}!` });
                     alertedTargets.current.add(alertKey);
                   }
                 }
               }
               
               return { ...w, currentPrice };
           }
           return w;
        }));
      } catch (err: any) {
        if (err?.message?.includes('Failed to fetch') || err?.name === 'TypeError') {
            // Silently ignore network failures on background polling
            return;
        }
        console.error("Failed to fetch live quotes for watchlist:", err);
      }
    }, 15000); // 15 seconds
    
    return () => clearInterval(intervalId);
  }, [watchlist.length]);

  const handleScan = async (overrideMarket?: string | any, overrideSector?: string) => {
    if (scanning) return;
    const currentMarket = typeof overrideMarket === 'string' ? overrideMarket : market;
    const currentSector = typeof overrideSector === 'string' ? overrideSector : activeSectorToScan;
    
    setScanning(true);
    setErrorMsg('');
    
    if (currentMarket === 'sector_constituents' && currentSector) {
      import('./lib/types').then(types => {
        const len = types.SECTOR_CONSTITUENTS[currentSector]?.length || 0;
        setProgress({ scanned: 0, total: len });
      });
    } else {
      setProgress({ scanned: 0, total: currentMarket === 'sectors' ? SECTOR_INDICES.length : currentMarket === 'crypto' ? CRYPTO_SYMBOLS.length : currentMarket === 'us_stocks' ? US_STOCKS.length : currentMarket === 'halal_us' ? HALAL_US_STOCKS.length : currentMarket === 'halal_in' ? HALAL_IN_STOCKS.length : NIFTY_500_SYMBOLS.length });
    }
    
    try {
      const scanResults = await runScan((scanned, total) => {
        setProgress({ scanned, total });
      }, scannerTimeframe, currentMarket, currentSector || undefined);
      setResults(scanResults);
      setLastUpdated(new Date());

      // Try adjusting watchlist CMP prices if they were scanned
      setWatchlist(prev => prev.map(w => {
        const found = scanResults.find(r => r.symbol === w.symbol);
        if (found) {
            return { ...w, currentPrice: found.weeklyClose };
        }
        return w;
      }));
    } catch (err: any) {
      console.error("Scan error details:", err);
      setErrorMsg(err.message || 'Error occurred during scanning');
    } finally {
      setScanning(false);
    }
  };

  const handleScanSectorConstituents = (sectorSymbol: string) => {
    setMarket('sector_constituents');
    setActiveSectorToScan(sectorSymbol);
    handleScan('sector_constituents', sectorSymbol);
  };

  const handleCreateWatchlist = () => {
    if (!newWatchlistName.trim()) return;
    const newId = 'wl_' + Date.now();
    setWatchlists(prev => [...prev, { id: newId, name: newWatchlistName.trim(), items: [] }]);
    setActiveWatchlistId(newId);
    setNewWatchlistName('');
    setIsNamingWatchlist(false);
  };

  const handleDeleteWatchlist = () => {
    if (watchlists.length <= 1) return;
    setWatchlists(prev => prev.filter(w => w.id !== activeWatchlistId));
    setActiveWatchlistId(watchlists.find(w => w.id !== activeWatchlistId)?.id || 'default');
  };

  const handleImportWatchlist = () => {
    if (!importText.trim()) return;
    const symbols = importText.split(/[\s,]+/).map(s => s.trim().toUpperCase()).filter(s => s.length > 0);
    const uniqueSymbols = Array.from(new Set(symbols));
    
    // Instead of doing full API resolution, just add them. When standard scan runs, it will populate details.
    setWatchlist(prev => {
        const existingSymbols = new Set(prev.map(w => w.symbol));
        const newItems = uniqueSymbols.filter(s => !existingSymbols.has(s)).map(s => ({
            symbol: s,
            name: s,
            addedDate: Date.now(),
            addedPrice: 0,
            currentPrice: 0
        }));
        return [...prev, ...newItems];
    });
    setImportText('');
    setShowImportModal(false);
  };

  const handleExportWatchlist = () => {
    if (watchlist.length === 0) return;
    const symbols = watchlist.map(w => w.symbol).join('\n');
    const blob = new Blob([symbols], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${watchlists.find(w => w.id === activeWatchlistId)?.name || 'watchlist'}_export.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const toggleWatchlist = (stock: ScanResult) => {
      setWatchlist(prev => {
          const exists = prev.find(w => w.symbol === stock.symbol);
          if (exists) {
              return prev.filter(w => w.symbol !== stock.symbol);
          } else {
              return [...prev, {
                  symbol: stock.symbol,
                  name: stock.name,
                  addedDate: Date.now(),
                  addedPrice: stock.weeklyClose,
                  currentPrice: stock.weeklyClose
              }];
          }
      });
  };

  useEffect(() => {
    let filtered = results;
    if (showOnlyPassed && market !== 'sectors') {
      filtered = filtered.filter(r => {
        if (strategy === 'alpha') return r.passed;
        if (strategy === 'sangam') return r.sangamPassed;
        if (strategy === 'sangam2') return r.sangam2Passed;
        if (strategy === 'reversal') return r.reversalPassed;
        if (strategy === 'rs52w') return r.rs52wPassed;
        if (strategy === 'rsBo') return r.rsBoPassed;
        if (strategy === 'rsMom') return r.rsMomPassed;
        if (strategy === 'sectorRs') return r.sectorRsPassed;
        if (strategy === 'mtfRs') return r.mtfRsPassed;
        if (strategy === 'minervini') return r.minerviniPassed;
        if (strategy === 'mansfield') return r.mansfieldPassed;
        if (strategy === 'insideBar') return r.insideBarPassed;
        return false;
      });
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(r => r.name.toLowerCase().includes(q) || r.symbol.toLowerCase().includes(q));
    }

    filtered = filtered.map(r => {
      const entry = r.weeklyClose;
      let rawSl = r.ema50;
      if (['alpha', 'reversal', 'sangam'].includes(strategy) && r.ema20 < entry) rawSl = r.ema20;
      const sl = rawSl * 0.98;
      const risk = entry - sl;
      const riskPct = ((risk) / entry) * 100;
      const target = risk > 0 && risk < entry * 0.2 ? entry + (risk * 2) : entry * 1.15;
      const rewardPct = ((target - entry) / entry) * 100;
      const rewardRiskRatio = riskPct > 0 ? rewardPct / riskPct : 0;
      return { ...r, dynamicSl: sl, riskPct, targetPrice: target, rewardRiskRatio };
    });

    setFilteredResults(filtered);
  }, [results, showOnlyPassed, searchQuery, strategy]);

  // Fetch sectors for filtered results
  useEffect(() => {
    if (filteredResults.length === 0) return;
    
    const missingSectors = filteredResults.filter(r => !r.sector).map(r => r.symbol);
    if (missingSectors.length === 0) return;

    // chunk into 20s to avoid URL too long
    const CHUNK_SIZE = 20;
    const fetchSectors = async () => {
      for (let i = 0; i < missingSectors.length; i += CHUNK_SIZE) {
        const chunk = missingSectors.slice(i, i + CHUNK_SIZE);
        try {
          const baseUrl = typeof window === 'undefined' ? 'http://localhost:3000' : '';
          const res = await fetch(`${baseUrl}/api/sectors?symbols=${encodeURIComponent(chunk.join(','))}`, {
            headers: { 'Accept': 'application/json' }
          });
          if (!res.ok) continue;
          const contentType = res.headers.get("content-type");
          if (contentType && contentType.indexOf("application/json") === -1) continue;
          const sectorData = await res.json();
          
          setResults(prev => prev.map(r => {
             if (sectorData[r.symbol]) {
                 return { ...r, sector: sectorData[r.symbol] };
             }
             return r;
          }));
        } catch (e) {
          console.warn("Failed to fetch sectors", e);
        }
      }
    };
    
    fetchSectors();
  }, [filteredResults]);

  const exportToCSV = () => {
    if (filteredResults.length === 0) return;
    
    // Define headers
    let headers = ['Symbol', 'Name', 'Sector', 'Close Price', 'Target', 'SL', 'Risk %'];
    if (strategy === 'alpha') {
      headers.push('EMA 20', 'EMA 50', 'EMA 200', 'RS Value', 'RS EMA');
    } else if (strategy === 'sangam') {
      headers.push('EMA 20', 'EMA 30', 'EMA 40');
    } else if (strategy === 'sangam2') {
      headers.push('EMA 20', 'EMA 50');
    } else if (strategy === 'rs52w') {
      headers.push('EMA 50');
    } else if (strategy === 'mansfield') {
      headers.push('EMA 50');
    } else if (strategy === 'minervini') {
      headers.push('EMA 50', 'EMA 200');
    } else {
      headers.push('EMA 20', 'EMA 50', 'EMA 200', 'RS Value');
    }
    
    // Map data
    const rows = filteredResults.map(r => {
      let isPassed = false;
      if (strategy === 'alpha') isPassed = r.passed;
      else if (strategy === 'sangam') isPassed = r.sangamPassed;
      else if (strategy === 'sangam2') isPassed = r.sangam2Passed;
      else if (strategy === 'reversal') isPassed = r.reversalPassed;
      else if (strategy === 'rs52w') isPassed = r.rs52wPassed;
      else if (strategy === 'mansfield') isPassed = r.mansfieldPassed;
      else if (strategy === 'minervini') isPassed = r.minerviniPassed;
      else if (strategy === 'rsBo') isPassed = r.rsBoPassed;
      else if (strategy === 'rsMom') isPassed = r.rsMomPassed;
      else if (strategy === 'sectorRs') isPassed = r.sectorRsPassed;
      else if (strategy === 'mtfRs') isPassed = r.mtfRsPassed;
      else if (strategy === 'insideBar') isPassed = r.insideBarPassed;

      const riskPct = r.riskPct || 0;
      const sl = r.dynamicSl || 0;
      const target = r.weeklyClose > sl ? r.weeklyClose + ((r.weeklyClose - sl) * 2) : 0;
      
      const baseColumns = [
        r.symbol,
        r.name,
        r.sector || 'N/A',
        r.weeklyClose.toFixed(2),
        target.toFixed(2),
        sl.toFixed(2),
        riskPct.toFixed(2) + '%'
      ];

      if (strategy === 'alpha') {
        return [
          ...baseColumns,
          r.ema20.toFixed(2),
          r.ema50.toFixed(2),
          r.ema200.toFixed(2),
          r.rsValue.toFixed(4),
          r.rsEma.toFixed(4)
        ];
      } else if (strategy === 'sangam') {
        return [
          ...baseColumns,
          r.ema20.toFixed(2),
          r.ema30?.toFixed(2) || '0.00',
          r.ema40?.toFixed(2) || '0.00'
        ];
      } else if (strategy === 'sangam2') {
        return [
          ...baseColumns,
          r.ema20.toFixed(2),
          r.ema50.toFixed(2)
        ];
      } else if (strategy === 'rs52w' || strategy === 'mansfield') {
        return [
          ...baseColumns,
          r.ema50.toFixed(2)
        ];
      } else if (strategy === 'minervini') {
        return [
          ...baseColumns,
          r.ema50.toFixed(2),
          r.ema200.toFixed(2)
        ];
      } else {
        return [
          ...baseColumns,
          r.ema20.toFixed(2),
          r.ema50.toFixed(2),
          r.ema200.toFixed(2),
          r.rsValue.toFixed(4)
        ];
      }
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(e => e.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `scanner_results_${strategy}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-[#0a0c0f] text-[#d1d4dc] font-sans h-screen w-screen overflow-hidden flex flex-col">
      {/* Header */}
      <header className="h-14 border-b border-[#1e222d] bg-[#131722] flex items-center gap-2 justify-between px-2 md:px-6 shrink-0 relative z-20">
        <div className="flex items-center gap-2 md:gap-4 flex-1 min-w-0 pr-2">
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="lg:hidden text-[#848e9c] hover:text-white p-1 shrink-0">
             <Menu className="w-5 h-5" />
          </button>
          <div className="w-8 h-8 bg-[#00ff9d] rounded flex items-center justify-center shadow-[0_0_15px_rgba(0,255,157,0.3)] hidden sm:flex shrink-0">
            <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>
          </div>
          <h1 className="text-sm md:text-lg font-bold tracking-tight text-white shrink-0 hidden sm:block">Aarif RS <span className="text-[#00ff9d] text-sm ml-1 font-mono hidden sm:inline">ALPHA</span></h1>
          <div className="hidden lg:block h-6 w-px bg-[#1e222d] mx-1 md:mx-2 shrink-0"></div>
          
          <div className="flex items-center bg-[#1e222d] border border-[#2a2e39] rounded overflow-hidden mr-2 shrink-0">
            <button 
              onClick={() => setMainView('scan')}
              className={cn("px-3 lg:px-4 py-1.5 md:py-2 text-[10px] md:text-sm font-bold transition-colors whitespace-nowrap", mainView === 'scan' ? "bg-[#2962ff] text-white" : "text-[#848e9c] hover:text-white hover:bg-[#2a2e39]")}
            >
              Scanner
            </button>
            <button 
              onClick={() => setMainView('portfolio')}
              className={cn("px-3 lg:px-4 py-1.5 md:py-2 text-[10px] md:text-sm font-bold transition-colors whitespace-nowrap", mainView === 'portfolio' ? "bg-[#2962ff] text-white" : "text-[#848e9c] hover:text-white hover:bg-[#2a2e39]")}
            >
              Portfolio
            </button>
            <button 
              onClick={() => setMainView('analyze')}
              className={cn("px-3 lg:px-4 py-1.5 md:py-2 text-[10px] md:text-sm font-bold transition-colors whitespace-nowrap border-l border-[#2a2e39]", mainView === 'analyze' ? "bg-[#2962ff] text-white" : "text-[#848e9c] hover:text-white hover:bg-[#2a2e39]")}
            >
              F/A & T/A
            </button>
          </div>

          <div className="flex items-center gap-1 bg-[#1e222d] rounded shadow-inner overflow-x-auto scrollbar-hide shrink-0 flex-1 sm:flex-none">
             <button 
                onClick={() => setMarket('stocks')}
                className={cn("px-2 md:px-3 py-1 font-mono text-[9px] md:text-xs transition-colors whitespace-nowrap", market === 'stocks' ? "bg-[#2962ff] text-white" : "text-[#848e9c] hover:bg-[#2a2e39]")}
              >IN</button>
              <button 
                onClick={() => setMarket('crypto')}
                className={cn("px-2 md:px-3 py-1 font-mono text-[9px] md:text-xs transition-colors whitespace-nowrap", market === 'crypto' ? "bg-[#00ff9d] text-black" : "text-[#848e9c] hover:bg-[#2a2e39]")}
              >CRYPTO</button>
              <button 
                onClick={() => setMarket('us_stocks')}
                className={cn("px-2 md:px-3 py-1 font-mono text-[9px] md:text-xs transition-colors whitespace-nowrap", market === 'us_stocks' ? "bg-[#ffaa00] text-black" : "text-[#848e9c] hover:bg-[#2a2e39]")}
              >US</button>
              <button 
                onClick={() => setMarket('halal_us')}
                className={cn("px-2 md:px-3 py-1 font-mono text-[9px] md:text-xs transition-colors whitespace-nowrap", market === 'halal_us' ? "bg-[#8a2be2] text-white" : "text-[#848e9c] hover:bg-[#2a2e39]")}
              >US HALAL</button>
              <button 
                onClick={() => setMarket('halal_in')}
                className={cn("px-2 md:px-3 py-1 font-mono text-[9px] md:text-xs transition-colors whitespace-nowrap", market === 'halal_in' ? "bg-[#e22b8a] text-white" : "text-[#848e9c] hover:bg-[#2a2e39]")}
              >IN HALAL</button>
              <button 
                onClick={() => { setMarket('sectors'); setActiveSectorToScan(null); }}
                className={cn("px-2 md:px-3 py-1 font-mono text-[9px] md:text-xs transition-colors whitespace-nowrap", (market === 'sectors' || market === 'sector_constituents') ? "bg-[#ffaa00] text-black" : "text-[#848e9c] hover:bg-[#2a2e39]")}
              >SECTORS</button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 relative">
        {/* Mobile Menu Overlay */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 bg-black/60 z-10 lg:hidden" onClick={() => setMobileMenuOpen(false)} />
        )}
        
        {/* Sidebar Controls */}
        <aside className={cn(
          "w-64 border-r border-[#1e222d] bg-[#131722] flex-col shrink-0 overflow-hidden absolute lg:static left-0 top-0 bottom-0 z-20 transition-transform flex",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}>
          <div className="flex border-b border-[#1e222d] shrink-0">
            <button 
              onClick={() => setSidebarTab('scanner')}
              className={cn("flex-1 py-3 text-[10px] font-bold uppercase tracking-wider relative", sidebarTab === 'scanner' ? "text-[#00ff9d]" : "text-[#848e9c] hover:text-white")}
            >
              Scan
              {sidebarTab === 'scanner' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#00ff9d]"></div>}
            </button>
            <button 
              onClick={() => setSidebarTab('calls')}
              className={cn("flex-1 py-3 text-[10px] font-bold uppercase tracking-wider relative", sidebarTab === 'calls' ? "text-[#00ff9d]" : "text-[#848e9c] hover:text-white")}
            >
              Calls
              {sidebarTab === 'calls' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#00ff9d]"></div>}
            </button>
            <button 
              onClick={() => setSidebarTab('watchlist')}
              className={cn("flex-1 py-3 text-[10px] font-bold uppercase tracking-wider relative", sidebarTab === 'watchlist' ? "text-[#00ff9d]" : "text-[#848e9c] hover:text-white")}
            >
              Watch
              {sidebarTab === 'watchlist' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#00ff9d]"></div>}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 pb-0 flex flex-col gap-6">
            {sidebarTab === 'scanner' ? (
              <>
                <div>
                  <h2 className="text-xs font-bold text-[#848e9c] uppercase mb-3 tracking-widest">Scan Summary</h2>
                  <div className="space-y-3">
              <div className="bg-[#1e222d] p-3 rounded border border-[#2a2e39]">
                <div className="text-[10px] text-[#848e9c] uppercase mb-1">Stocks Scanned</div>
                <div className="text-xl font-bold font-mono text-white">{progress.scanned}</div>
              </div>
              <div className="bg-[#1e222d] p-3 rounded border border-[#2a2e39] border-l-4 border-l-[#00ff9d]">
                <div className="text-[10px] text-[#848e9c] uppercase mb-1">Buy Candidates</div>
                <div className="text-xl font-bold font-mono text-[#00ff9d]">
                  {results.filter(r => {
                    if (strategy === 'alpha') return r.passed;
                    if (strategy === 'sangam') return r.sangamPassed;
                    if (strategy === 'sangam2') return r.sangam2Passed;
                    if (strategy === 'reversal') return r.reversalPassed;
                    if (strategy === 'rs52w') return r.rs52wPassed;
                    if (strategy === 'mansfield') return r.mansfieldPassed;
                    if (strategy === 'minervini') return r.minerviniPassed;
                    if (strategy === 'rsBo') return r.rsBoPassed;
                    if (strategy === 'rsMom') return r.rsMomPassed;
                    if (strategy === 'sectorRs') return r.sectorRsPassed;
                    if (strategy === 'mtfRs') return r.mtfRsPassed;
                    if (strategy === 'insideBar') return r.insideBarPassed;
                    return false;
                  }).length}
                </div>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-xs font-bold text-[#848e9c] uppercase mb-3 tracking-widest">Filter Settings</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs pb-3 border-b border-[#1e222d] mb-3">
                <span className="text-[#b2b5be]">Timeframe</span>
                <div className="flex bg-[#1e222d] rounded overflow-hidden shadow-inner">
                  <button 
                    onClick={() => setScannerTimeframe('1D')}
                    className={cn("px-3 py-1 font-mono transition-colors", scannerTimeframe === '1D' ? "bg-[#2962ff] text-white" : "text-[#848e9c] hover:bg-[#2a2e39]")}
                  >1D</button>
                  <button 
                    onClick={() => setScannerTimeframe('1W')}
                    className={cn("px-3 py-1 font-mono transition-colors", scannerTimeframe === '1W' ? "bg-[#2962ff] text-white" : "text-[#848e9c] hover:bg-[#2a2e39]")}
                  >1W</button>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs pb-3 border-b border-[#1e222d] mb-3 mt-3">
                <span className="text-[#b2b5be]">Show Only Passed</span>
                <button
                  onClick={() => setShowOnlyPassed(!showOnlyPassed)}
                  className={cn(
                    "w-8 h-4 rounded-full relative transition-colors",
                    showOnlyPassed ? "bg-[#00ff9d]" : "bg-[#2a2e39]"
                  )}
                >
                  <div className={cn("absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform", showOnlyPassed ? "translate-x-4" : "translate-x-0")}></div>
                </button>
              </div>
            </div>
          </div>

          <div className="mt-auto pb-5">
            <div className="bg-[#1e222d]/50 p-4 rounded-xl border border-[#2a2e39] text-center">
              <div className="text-[11px] font-bold text-[#848e9c] mb-2 uppercase tracking-wide">Strategy Overview</div>
              <div className="text-[10px] text-[#b2b5be] leading-relaxed">
                Seeking stocks in structural uptrends (Weekly EMAs) with relative outperformance against benchmark (RS).
              </div>
            </div>
          </div>
          </>
            ) : sidebarTab === 'calls' ? (
              <div className="flex-1 flex flex-col gap-3 pb-5">
                <h2 className="text-xs font-bold text-[#848e9c] uppercase mb-1 tracking-widest px-1">Generated Calls</h2>
                {results.length === 0 ? (
                  <div className="text-[#848e9c] text-xs px-1">Run a scan first to generate trading calls.</div>
                ) : (
                  filteredResults.filter(r => {
                    let passed = false;
                    if (strategy === 'alpha') passed = r.passed;
                    else if (strategy === 'sangam') passed = r.sangamPassed;
                    else if (strategy === 'sangam2') passed = r.sangam2Passed;
                    else if (strategy === 'reversal') passed = r.reversalPassed;
                    else if (strategy === 'rs52w') passed = r.rs52wPassed;
                    else if (strategy === 'mansfield') passed = r.mansfieldPassed;
                    else if (strategy === 'minervini') passed = r.minerviniPassed;
                    else if (strategy === 'rsBo') passed = r.rsBoPassed;
                    else if (strategy === 'rsMom') passed = r.rsMomPassed;
                    else if (strategy === 'sectorRs') passed = r.sectorRsPassed;
                    else if (strategy === 'mtfRs') passed = r.mtfRsPassed;
                    else if (strategy === 'insideBar') passed = r.insideBarPassed;
                    return passed;
                  }).slice(0, 15).map(r => {
                     const entry = r.weeklyClose;
                     // Set SL dynamically based on nearest EMA logic
                     let rawSl = r.ema50;
                     if (['alpha', 'reversal', 'sangam'].includes(strategy) && r.ema20 < entry) rawSl = r.ema20;
                     
                     // Buffer SL by 2%
                     const sl = rawSl * 0.98;
                     const risk = entry - sl;
                     // Safe-guard targets
                     const target = risk > 0 && risk < entry * 0.2 ? entry + (risk * 2) : entry * 1.15;
                     const riskPct = ((risk / entry) * 100);
                     const rewardPct = ((target - entry) / entry) * 100;
                     
                     return (
                      <div key={r.symbol} className="bg-[#1e222d] p-3 rounded border border-[#2a2e39] flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-white">{r.symbol}</span>
                          <span className="bg-[#00ff9d]/20 text-[#00ff9d] px-2 py-0.5 rounded text-[9px] tracking-wider font-bold">BUY</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-[#b2b5be]">
                          <span>Entry: <b className="text-white">{entry.toFixed(2)}</b></span>
                          <span className="text-[#00ff9d]">Tgt: <b>{target.toFixed(2)}</b></span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-[#b2b5be]">
                          <span className="text-[#f44336]">SL: {sl.toFixed(2)}</span>
                          <span className="text-[#848e9c]">1:{(rewardPct/riskPct).toFixed(1)} RR</span>
                        </div>
                      </div>
                     );
                  })
                )}
                {filteredResults.length > 0 && (
                   <div className="text-[9px] text-[#848e9c] text-center mt-2 px-2 leading-relaxed">
                     Showing top {Math.min(15, filteredResults.filter(r=>r.passed||r.minerviniPassed||r.mansfieldPassed||r.rs52wPassed||r.sangamPassed||r.reversalPassed||r.rsBoPassed||r.mtfRsPassed).length)} calls based on selected strategy. SL is dynamically buffered below key support logic. Target assumes 1:2 R:R.
                   </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col gap-3 pb-5">
                <div className="flex flex-col gap-2 px-1 mb-1">
                  <div className="flex flex-col items-stretch gap-2 mb-2">
                     <div className="flex w-full overflow-x-auto scrollbar-hide bg-[#1e222d] border border-[#2a2e39] rounded">
                       {watchlists.map(w => (
                         <button 
                           key={w.id}
                           onClick={() => setActiveWatchlistId(w.id)}
                           className={cn(
                             "px-3 py-2 text-[10px] md:text-xs font-bold uppercase whitespace-nowrap transition-colors flex-1 text-center border-b-2",
                             activeWatchlistId === w.id 
                               ? "border-[#00ff9d] text-[#00ff9d] bg-[#2a2e39]" 
                               : "border-transparent text-[#848e9c] hover:text-white hover:bg-[#2a2e39]"
                           )}
                         >
                           {w.name}
                         </button>
                       ))}
                     </div>
                     <div className="flex gap-1 justify-end shrink-0">
                        <button onClick={() => setIsNamingWatchlist(!isNamingWatchlist)} className="p-1.5 text-[#848e9c] hover:text-white hover:bg-[#2a2e39] rounded transition-colors" title="New Watchlist">
                           <Plus className="w-4 h-4" />
                        </button>
                        <button onClick={() => setShowImportModal(true)} className="p-1.5 text-[#848e9c] hover:text-white hover:bg-[#2a2e39] rounded transition-colors" title="Import Symbols">
                           <Upload className="w-4 h-4" />
                        </button>
                        <button onClick={handleExportWatchlist} className="p-1.5 text-[#848e9c] hover:text-white hover:bg-[#2a2e39] rounded transition-colors" title="Export Watchlist">
                           <Download className="w-4 h-4" />
                        </button>
                        {watchlists.length > 1 && (
                          <button onClick={handleDeleteWatchlist} className="p-1.5 text-[#848e9c] hover:text-[#f44336] hover:bg-[#2a2e39] rounded transition-colors" title="Delete Watchlist">
                             <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                     </div>
                  </div>
                  {isNamingWatchlist && (
                     <div className="flex gap-2">
                        <input 
                          type="text" 
                          value={newWatchlistName}
                          onChange={e => setNewWatchlistName(e.target.value)}
                          placeholder="List Name..."
                          className="flex-1 bg-[#1e222d] border border-[#2a2e39] text-xs px-2 py-1.5 rounded focus:outline-none focus:border-[#00ff9d] text-white"
                          autoFocus
                          onKeyDown={(e) => e.key === 'Enter' && handleCreateWatchlist()}
                        />
                        <button onClick={handleCreateWatchlist} className="bg-[#00ff9d] text-black px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider">Save</button>
                     </div>
                  )}
                  {typeof Notification !== 'undefined' && Notification.permission !== 'granted' && Notification.permission !== 'denied' && (
                     <button onClick={() => Notification.requestPermission()} className="text-[10px] bg-[#2a2e39] text-[#848e9c] hover:text-white px-2 py-1 rounded w-full flex items-center justify-center gap-2 mt-1">
                        Enable Browser Alerts
                     </button>
                  )}
                </div>
                {watchlist.length === 0 ? (
                  <div className="text-[#848e9c] text-xs px-1">Your watchlist is empty. Scan and add stocks.</div>
                ) : (
                  watchlist.map(w => {
                    const daysHeld = Math.floor((Date.now() - w.addedDate) / (1000 * 60 * 60 * 24));
                    const pnlPct = ((w.currentPrice - w.addedPrice) / w.addedPrice) * 100;
                    return (
                      <div 
                        key={w.symbol} 
                        className="bg-[#1e222d] p-3 rounded border border-[#2a2e39] flex flex-col gap-2 cursor-pointer hover:bg-[#2a2e39] transition-colors"
                        onClick={() => {
                          // Try to find the full ScanResult if we have it in results
                          const found = results.find(r => r.symbol === w.symbol) || filteredResults.find(r => r.symbol === w.symbol);
                          if (found) {
                            setSelectedStock(found);
                          } else {
                            // Provide a skeletal ScanResult just to render the chart
                            setSelectedStock({
                               symbol: w.symbol,
                               name: w.name || w.symbol,
                               passed: false,
                               weeklyClose: w.currentPrice || w.addedPrice,
                               ema20: 0, ema50: 0, ema100: 0, ema200: 0, ema30: 0, ema40: 0,
                               rsValue: 0, rsEma: 0,
                               sangamPassed: false, sangam2Passed: false, reversalPassed: false,
                               rsBoPassed: false, rsMomPassed: false, sectorRsPassed: false, mtfRsPassed: false,
                               rs52wPassed: false, mansfieldPassed: false, minerviniPassed: false, insideBarPassed: false,
                               todayChange: 0, volume: 0,
                               weeklyBars: [], dailyRs: [], dailyRsEma: [], ema20Series: [],
                               ema30Series: [], ema40Series: [], sma9Series: [], ema50Series: [], ema100Series: [], ema200Series: []
                            });
                          }
                          setMobileMenuOpen(false);
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-white">{w.symbol}</span>
                          <span className={cn("text-xs font-bold font-mono", pnlPct >= 0 ? "text-[#00ff9d]" : "text-[#f44336]")}>
                            {pnlPct > 0 ? '+' : ''}{pnlPct.toFixed(2)}%
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-[#b2b5be]">
                          <span>Entry: {w.addedPrice.toFixed(2)}</span>
                          <span>CMP: {w.currentPrice.toFixed(2)}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <input 
                            type="number" 
                            placeholder="Target"
                            value={w.targetPrice || ''}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const val = e.target.value ? parseFloat(e.target.value) : undefined;
                              setWatchlist((prev: any[]) => prev.map((item: any) => item.symbol === w.symbol ? { ...item, targetPrice: val } : item));
                            }}
                            className="bg-[#131722] border border-[#2a2e39] text-[#b2b5be] text-[10px] px-2 py-1 rounded w-full focus:outline-none focus:border-[#00ff9d]"
                          />
                          <input 
                            type="number" 
                            placeholder="Stop Loss"
                            value={w.stopLoss || ''}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const val = e.target.value ? parseFloat(e.target.value) : undefined;
                              setWatchlist((prev: any[]) => prev.map((item: any) => item.symbol === w.symbol ? { ...item, stopLoss: val } : item));
                            }}
                            className="bg-[#131722] border border-[#2a2e39] text-[#b2b5be] text-[10px] px-2 py-1 rounded w-full focus:outline-none focus:border-[#00ff9d]"
                          />
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-[#848e9c]">
                          <span>Held: {daysHeld}d</span>
                          <button 
                             onClick={(e) => {
                                e.stopPropagation();
                                setWatchlist((prev: any[]) => prev.filter((item: any) => item.symbol !== w.symbol));
                             }} 
                             className="text-[#f44336] hover:text-[#ff7961]"
                          >Remove</button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </div>
        </aside>

        {/* Main Content Grid */}
        <main className="flex-1 flex flex-col min-w-0">
          
          {mainView === 'portfolio' ? (
             <Portfolio onTrade={(symbol) => {
               setSearchQuery(symbol);
               setMainView('scan'); // return to scan to see the chart
             }} />
          ) : mainView === 'analyze' ? (
             <AnalysisPanel />
          ) : (
            <>
              {/* Top Section: Data Table */}
              <section className={cn("flex-1 p-2 md:p-4 flex flex-col min-h-0 overflow-hidden", selectedStock ? "hidden lg:flex lg:flex-none lg:h-1/3 xl:h-1/2" : "")}>
                {errorMsg && (
                  <div className="bg-[#f44336]/10 border border-[#f44336]/20 text-[#f44336] p-3 mb-4 rounded flex items-center gap-2 text-xs shrink-0">
                    <AlertCircle className="w-4 h-4" />
                    {errorMsg}
                  </div>
                )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 shrink-0 gap-4 w-full">
              {marketOverview && (
                <div className="flex gap-3 items-center shrink-0 overflow-x-auto scrollbar-hide pb-1 max-w-full">
                   {[
                     { id: '^NSEI', name: 'NIFTY' },
                     { id: 'GC=F', name: 'GOLD' },
                     { id: 'SI=F', name: 'SILVER' },
                     { id: 'BTC-USD', name: 'BTC' },
                     { id: 'CL=F', name: 'CRUDE' },
                   ].map(asset => {
                             const data = marketOverview[asset.id];
                             if (!data) return null;
                             const isUp = data.change >= 0;
                             return (
                               <div key={asset.id} className={cn("flex flex-col items-center justify-center p-2 rounded-lg border w-[88px] h-[88px] shrink-0 shadow-lg", isUp ? "bg-[#00ff9d]/5 border-[#00ff9d]/30" : "bg-[#f44336]/5 border-[#f44336]/30")}>
                                 <span className={cn("font-bold text-[10px] uppercase tracking-wider mb-1.5", isUp ? "text-[#00ff9d]/70" : "text-[#f44336]/70")}>{asset.name}</span>
                                 <span className="text-white font-mono text-[15px] font-bold leading-none mb-1.5">{data.price.toFixed(asset.id === 'BTC-USD' ? 0 : 2)}</span>
                                 <span className={cn("font-mono text-[10px] font-medium px-1.5 py-0.5 rounded border", isUp ? "text-[#00ff9d] bg-[#00ff9d]/10 border-[#00ff9d]/20" : "text-[#f44336] bg-[#f44336]/10 border-[#f44336]/20")}>{isUp ? '+' : ''}{data.changePct.toFixed(2)}%</span>
                               </div>
                             );
                           })}
                </div>
              )}
              
              <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 w-full sm:w-auto">
                <div className="relative flex-1 sm:flex-none">
                  <input 
                    type="text" 
                    placeholder="Search Symbol..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full sm:w-[140px] md:w-[200px] bg-[#1e222d] border border-[#2a2e39] rounded px-8 py-2 text-xs text-white focus:outline-none focus:border-[#2962ff] transition-colors placeholder:text-[#848e9c]" 
                  />
                  <Search className="w-4 h-4 absolute left-2.5 top-2 text-[#848e9c]" />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {market === 'sectors' && !activeSectorToScan && (
                    <div className="flex bg-[#1e222d] rounded border border-[#2a2e39] overflow-hidden">
                      <button
                        onClick={() => setSectorViewMode('heatmap')}
                        className={cn(
                          "px-3 py-1.5 text-[10px] font-bold uppercase transition-colors",
                          sectorViewMode === 'heatmap' ? "bg-[#2962ff] text-white" : "text-[#848e9c] hover:text-white"
                        )}
                      >
                        Heatmap
                      </button>
                      <button
                        onClick={() => setSectorViewMode('table')}
                        className={cn(
                          "px-3 py-1.5 text-[10px] font-bold uppercase transition-colors",
                          sectorViewMode === 'table' ? "bg-[#2962ff] text-white" : "text-[#848e9c] hover:text-white"
                        )}
                      >
                        Table
                      </button>
                    </div>
                  )}
                  <button 
                    onClick={exportToCSV}
                    className="bg-[#1e222d] text-[#848e9c] hover:text-white hover:bg-[#2a2e39] p-2 rounded transition-colors border border-[#2a2e39]"
                    title="Export to CSV"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <div className="lg:hidden flex items-center">
                    <button
                       onClick={() => setShowOnlyPassed(!showOnlyPassed)}
                       className={cn(
                         "text-[10px] px-2 py-2 rounded font-bold uppercase whitespace-nowrap", 
                         showOnlyPassed ? "bg-[#00ff9d]/20 text-[#00ff9d]" : "bg-[#1e222d] text-[#848e9c]"
                       )}
                    >
                       {showOnlyPassed ? 'Passes' : 'All'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Table Component */}
            {market === 'sectors' && !activeSectorToScan ? (
              <div className="overflow-y-auto w-full flex-1 md:h-full rounded-md border border-[#1e222d] shadow-[0_0_15px_rgba(0,0,0,0.5)]">
                {sectorViewMode === 'heatmap' ? (
                  <SectorHeatmap
                    results={filteredResults}
                    onSelect={(stock) => {
                      if (stock?.symbol?.startsWith('^')) {
                        handleScanSectorConstituents(stock.symbol);
                      }
                      setMobileMenuOpen(false);
                    }}
                  />
                ) : (
                  <StockTable 
                    results={filteredResults} 
                    onSelect={(stock) => {
                      if (market === 'sectors' && stock?.symbol?.startsWith('^')) {
                        handleScanSectorConstituents(stock.symbol);
                      } else {
                        setSelectedStock(stock);
                      }
                      setMobileMenuOpen(false);
                    }}
                    selectedSymbol={selectedStock?.symbol || null}
                    strategy={strategy}
                    watchlist={watchlist}
                    onToggleWatchlist={toggleWatchlist}
                  />
                )}
              </div>
            ) : (
              <StockTable 
                results={filteredResults} 
                onSelect={(stock) => {
                  if (market === 'sectors' && stock?.symbol?.startsWith('^')) {
                    handleScanSectorConstituents(stock.symbol);
                  } else {
                    setSelectedStock(stock);
                  }
                  setMobileMenuOpen(false);
                }}
                selectedSymbol={selectedStock?.symbol || null}
                strategy={strategy}
                watchlist={watchlist}
                onToggleWatchlist={toggleWatchlist}
              />
            )}
          </section>

          {/* Chart Section */}
          {selectedStock && (
            <section className="flex-1 bg-[#0d1017] p-2 md:p-4 relative shrink-0 flex flex-col animate-in fade-in zoom-in-95 duration-200 lg:border-t lg:border-[#1e222d]">
               <div className="flex justify-end absolute top-1 md:top-2 right-2 md:right-4 z-20 gap-2 items-center">
                 <div className="flex bg-[#1e222d] rounded overflow-hidden shadow-md mr-1 md:mr-2">
                   <button 
                     onClick={() => {
                        const idx = filteredResults.findIndex(r => r.symbol === selectedStock.symbol);
                        if (idx > 0) setSelectedStock(filteredResults[idx - 1]);
                     }} 
                     disabled={filteredResults.findIndex(r => r.symbol === selectedStock.symbol) <= 0}
                     className="text-[#848e9c] hover:text-white disabled:opacity-30 disabled:hover:text-[#848e9c] bg-[#1e222d] hover:bg-[#2a2e39] px-2 md:px-3 py-1 transition-colors border-r border-[#2a2e39]"
                     title="Previous Stock"
                   >
                     ←
                   </button>
                   <button 
                     onClick={() => {
                        const idx = filteredResults.findIndex(r => r.symbol === selectedStock.symbol);
                        if (idx !== -1 && idx < filteredResults.length - 1) setSelectedStock(filteredResults[idx + 1]);
                     }}
                     disabled={filteredResults.findIndex(r => r.symbol === selectedStock.symbol) === -1 || filteredResults.findIndex(r => r.symbol === selectedStock.symbol) >= filteredResults.length - 1} 
                     className="text-[#848e9c] hover:text-white disabled:opacity-30 disabled:hover:text-[#848e9c] bg-[#1e222d] hover:bg-[#2a2e39] px-2 md:px-3 py-1 transition-colors"
                     title="Next Stock"
                   >
                     →
                   </button>
                 </div>
                 <button onClick={() => setSelectedStock(null)} className="text-[#848e9c] hover:text-white bg-[#1e222d] hover:bg-[#f44336] p-1 rounded transition-colors shadow-md">
                   <X className="w-5 h-5 md:w-4 md:h-4" />
                 </button>
               </div>
              <div className="flex items-center justify-between mb-2 shrink-0">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-bold text-white uppercase">{selectedStock.name} <span className="text-[10px] text-[#848e9c] font-normal tracking-wide ml-1">{scannerTimeframe === '1W' ? 'Weekly' : 'Daily'}</span></span>
                  <div className="hidden sm:flex gap-3 text-[10px] font-mono">
                    {strategy === 'alpha' ? (
                      <>
                        <span className="text-[#2962ff]">EMA 20: {selectedStock.ema20.toFixed(2)}</span>
                        <span className="text-[#ff9800]">EMA 50: {selectedStock.ema50.toFixed(2)}</span>
                        <span className="text-[#ec4899]">EMA 100: {selectedStock.ema100.toFixed(2)}</span>
                        <span className="text-[#f44336]">EMA 200: {selectedStock.ema200.toFixed(2)}</span>
                      </>
                    ) : strategy === 'sangam' ? (
                      <>
                        <span className="text-[#2962ff]">EMA 20: {selectedStock.ema20.toFixed(2)}</span>
                        <span className="text-[#ff9800]">EMA 30: {selectedStock.ema30?.toFixed(2)}</span>
                        <span className="text-[#ec4899]">EMA 40: {selectedStock.ema40?.toFixed(2)}</span>
                      </>
                    ) : strategy === 'sangam2' ? (
                      <>
                        <span className="text-[#2962ff]">EMA 20: {selectedStock.ema20.toFixed(2)}</span>
                        <span className="text-[#ff9800]">EMA 50: {selectedStock.ema50.toFixed(2)}</span>
                      </>
                    ) : strategy === 'ema50' ? (
                      <>
                        <span className="text-[#ff9800]">EMA 50: {selectedStock.ema50.toFixed(2)}</span>
                      </>
                    ) : (
                      <>
                        <span className="text-[#2962ff]">EMA 20: {selectedStock.ema20.toFixed(2)}</span>
                        <span className="text-[#ff9800]">EMA 50: {selectedStock.ema50.toFixed(2)}</span>
                        <span className="text-[#f44336]">EMA 200: {selectedStock.ema200.toFixed(2)}</span>
                      </>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setMainView('portfolio')}
                  className="bg-[#2962ff] hover:bg-[#3d7eff] text-white text-[10px] uppercase font-bold px-3 py-1 rounded transition-colors shadow-blue-900/20 shadow-lg shrink-0 ml-4 hidden sm:block"
                >
                  PAPER TRADE
                </button>
                {(market === 'sectors' && selectedStock?.symbol?.startsWith('^')) && (
                   <button
                     onClick={() => handleScanSectorConstituents(selectedStock.symbol)}
                     className="bg-[#ffaa00] hover:bg-[#ffaa00]/80 text-black text-[10px] uppercase font-bold px-3 py-1 rounded transition-colors shadow-[0_0_15px_rgba(255,170,0,0.3)] shrink-0 ml-4"
                   >
                     SCAN STOCKS IN {selectedStock.name}
                   </button>
                )}
              </div>
              
              <div className="flex-1 w-full bg-[#131722] rounded border border-[#1e222d] overflow-hidden flex flex-col relative min-h-0 shadow-lg">
                <StockChart data={selectedStock} defaultTimeframe={scannerTimeframe} strategy={strategy} market={market} />
              </div>
            </section>
          )}
          </>
          )}
        </main>
      </div>

      {/* Excel Sheet Tabs for Strategies */}
      <div className="flex items-end gap-1 bg-[#131722] px-4 pt-2 shrink-0 border-t border-[#2a2e39] overflow-x-auto" style={{ marginBottom: '-1px', zIndex: 10 }}>
        {(['minervini', 'rs52w', 'mansfield', 'rsBo', 'mtfRs', 'rsMom', 'sectorRs', 'reversal', 'alpha', 'sangam', 'sangam2', 'insideBar'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStrategy(s)}
            className={cn(
              "px-3 py-1.5 text-xs font-bold transition-colors border border-b-0 rounded-t-md relative outline-none whitespace-nowrap",
              strategy === s
                ? "bg-[#1e222d] border-[#2a2e39] text-[#00ff9d] z-20"
                : "bg-[#0d1017] border-transparent text-[#848e9c] hover:bg-[#1e222d]/50 hover:text-[#d1d4dc] z-0"
            )}
            style={strategy === s ? { borderBottomColor: '#1e222d' } : {}}
          >
            {s === 'alpha' ? 'Alpha' : s === 'sangam' ? 'Sangam' : s === 'sangam2' ? 'Sangam 2.0' : s === 'reversal' ? 'Reversal' : s === 'minervini' ? 'Minervini Trend' : s === 'rs52w' ? 'RS 52W High' : s === 'mansfield' ? 'Mansfield RS' : s === 'rsBo' ? 'RS B/O' : s === 'rsMom' ? 'RS Mom' : s === 'sectorRs' ? 'Sector RS' : s === 'insideBar' ? 'Inside Bar' : 'MTF RS'}
          </button>
        ))}
      </div>

      <button
        onClick={() => handleScan()}
        disabled={scanning}
        style={{ zIndex: 9999 }}
        className={cn(
          "fixed bottom-12 right-6 px-4 py-3 md:px-6 md:py-4 rounded-full text-xs md:text-sm font-bold flex items-center justify-center gap-2 md:gap-3 transition-all min-w-[120px] md:min-w-[150px] shadow-2xl",
          scanning
            ? "bg-[#1e222d] text-[#848e9c] cursor-not-allowed border border-[#2a2e39]"
            : "bg-[#2962ff] hover:bg-[#3d7eff] hover:scale-105 hover:-translate-y-1 text-white shadow-[0_0_20px_rgba(41,98,255,0.4)] hover:shadow-[0_0_30px_rgba(41,98,255,0.6)]"
        )}
      >
        {scanning ? (
          <RefreshCw className="w-4 h-4 md:w-5 md:h-5 animate-spin shrink-0" />
        ) : (
          <Play className="w-4 h-4 md:w-5 md:h-5 shrink-0" fill="currentColor" />
        )}
        <span className="hidden sm:inline whitespace-nowrap uppercase tracking-wider">{scanning ? 'Scanning...' : 'Run Scan'}</span>
        <span className="sm:hidden whitespace-nowrap uppercase tracking-wider">{scanning ? 'Scanning...' : 'Scan'}</span>
      </button>

      {/* Footer Status Bar */}
      <footer className="h-8 bg-[#1e222d] border-t border-[#2a2e39] flex items-center justify-between px-4 text-[10px] text-[#848e9c] shrink-0 relative z-10">
        <div className="flex gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-[#00ff9d] animate-pulse"></div>
            <span>Scanner Ready</span>
          </div>
        </div>
        <div>
          Data provided by Yahoo Finance via local proxy
        </div>
      </footer>

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-[#1e222d] rounded shadow-2xl border border-[#2a2e39] p-5 w-full max-w-md flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <h3 className="text-white font-bold uppercase tracking-widest text-sm">Import Symbols</h3>
              <button onClick={() => setShowImportModal(false)} className="text-[#848e9c] hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-[#848e9c] text-xs leading-relaxed">
              Paste comma-separated, space-separated, or newline-separated symbols.
              Symbols not recognized will simply show N/A until proper data is found.
            </p>
            <textarea
              value={importText}
              onChange={e => setImportText(e.target.value)}
              className="w-full h-32 bg-[#131722] border border-[#2a2e39] rounded p-3 text-white text-xs focus:outline-none focus:border-[#00ff9d] font-mono resize-none selection:bg-[#00ff9d]/30"
              placeholder="AAPL, TSLA, NVDA&#10;MSFT&#10;GOOG"
              autoFocus
            />
            <div className="flex justify-end gap-3 mt-2">
              <button 
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 text-xs font-bold text-[#848e9c] hover:text-white transition-colors"
              >
                CANCEL
              </button>
              <button 
                onClick={handleImportWatchlist}
                className="px-6 py-2 bg-[#00ff9d] text-black text-xs font-bold rounded uppercase tracking-widest hover:bg-[#00cc7d] transition-colors"
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
