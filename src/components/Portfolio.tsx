import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Briefcase, Plus, X } from 'lucide-react';
import { cn } from './StockTable';

export interface Position {
  symbol: string;
  qty: number;
  avgPrice: number;
}

export interface Trade {
  id: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  qty: number;
  price: number;
  date: number;
}

export interface PortfolioData {
  cash: number;
  positions: Position[];
  history: Trade[];
}

export function Portfolio({
  onTrade
}: {
  onTrade?: (symbol: string) => void;
}) {
  const [data, setData] = useState<PortfolioData>(() => {
    const saved = localStorage.getItem('trader_portfolio');
    if (saved) return JSON.parse(saved);
    return { cash: 1000000, positions: [], history: [] }; // 10L default
  });

  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const [loadingPrices, setLoadingPrices] = useState(false);

  useEffect(() => {
    localStorage.setItem('trader_portfolio', JSON.stringify(data));
  }, [data]);

  // Fetch prices for active positions
  useEffect(() => {
    if (data.positions.length === 0) return;
    
    let isMounted = true;
    const fetchPrices = async () => {
      setLoadingPrices(true);
      try {
        const symbols = data.positions.map(p => p.symbol);
        const baseUrl = typeof window === 'undefined' ? 'http://localhost:3000' : '';
        const res = await fetch(`${baseUrl}/api/quote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ symbols })
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Failed to fetch quote: ${res.status} ${text}`);
        }
        const prices = await res.json();
        if (isMounted) setLivePrices(prices);
      } catch (err) {
        console.error(err);
      } finally {
        if (isMounted) setLoadingPrices(false);
      }
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 15000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [data.positions]);

  const [tradeForm, setTradeForm] = useState<{symbol: string, type: 'BUY'|'SELL', qty: string, price: string} | null>(null);

  const handleExecuteTrade = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tradeForm) return;

    const symbol = tradeForm.symbol.toUpperCase();
    const qty = parseFloat(tradeForm.qty);
    const price = parseFloat(tradeForm.price);
    
    if (!symbol || isNaN(qty) || isNaN(price) || qty <= 0 || price <= 0) {
      alert("Invalid trade details");
      return;
    }

    const tradeValue = qty * price;
    
    setData(prev => {
      const isBuy = tradeForm.type === 'BUY';
      
      // Check cash for buy
      if (isBuy && prev.cash < tradeValue) {
        alert("Insufficient cash for this trade!");
        return prev;
      }

      // Check qty for sell
      const existingPos = prev.positions.find(p => p.symbol === symbol);
      if (!isBuy && (!existingPos || existingPos.qty < qty)) {
        alert("Insufficient quantity to sell!");
        return prev;
      }

      let newCash = prev.cash;
      let newPositions = [...prev.positions];

      if (isBuy) {
        newCash -= tradeValue;
        if (existingPos) {
          const totalQty = existingPos.qty + qty;
          const totalCost = (existingPos.qty * existingPos.avgPrice) + (qty * price);
          existingPos.qty = totalQty;
          existingPos.avgPrice = totalCost / totalQty;
        } else {
          newPositions.push({ symbol, qty, avgPrice: price });
        }
      } else {
        newCash += tradeValue;
        if (existingPos) {
          existingPos.qty -= qty;
          if (existingPos.qty === 0) {
            newPositions = newPositions.filter(p => p.symbol !== symbol);
          }
        }
      }

      const newHistory = [...prev.history, {
        id: Math.random().toString(36).substr(2, 9),
        symbol,
        type: tradeForm.type,
        qty,
        price,
        date: Date.now()
      }];

      setTradeForm(null);
      return { cash: newCash, positions: newPositions, history: newHistory };
    });
  };

  const totalInvested = data.positions.reduce((acc, p) => acc + (p.qty * p.avgPrice), 0);
  const totalCurrentValue = data.positions.reduce((acc, p) => acc + (p.qty * (livePrices[p.symbol] || p.avgPrice)), 0);
  const totalUnrealizedPnL = totalCurrentValue - totalInvested;
  const portfolioValue = data.cash + totalCurrentValue;

  return (
    <div className="flex-1 flex flex-col p-4 md:p-6 overflow-y-auto">
      {tradeForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1e222d] border border-[#2a2e39] rounded-lg p-6 w-full max-w-sm shrink-0 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <button onClick={() => setTradeForm(null)} className="absolute top-4 right-4 text-[#848e9c] hover:text-white"><X className="w-4 h-4" /></button>
            <h3 className="text-lg font-bold text-white mb-4">Execute Paper Trade</h3>
            <form onSubmit={handleExecuteTrade} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs text-[#848e9c] uppercase font-bold mb-1">Action</label>
                <select 
                  value={tradeForm.type}
                  onChange={(e) => setTradeForm({...tradeForm, type: e.target.value as 'BUY'|'SELL'})}
                  className="w-full bg-[#131722] border border-[#2a2e39] rounded px-3 py-2 text-white focus:border-[#2962ff] focus:outline-none"
                >
                  <option value="BUY">BUY</option>
                  <option value="SELL">SELL</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#848e9c] uppercase font-bold mb-1">Symbol</label>
                <input 
                  type="text" 
                  value={tradeForm.symbol}
                  onChange={(e) => setTradeForm({...tradeForm, symbol: e.target.value.toUpperCase()})}
                  placeholder="e.g. RELIANCE.NS"
                  className="w-full bg-[#131722] border border-[#2a2e39] rounded px-3 py-2 text-white placeholder:text-[#848e9c]/50 focus:border-[#2962ff] focus:outline-none" 
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#848e9c] uppercase font-bold mb-1">Quantity</label>
                  <input 
                    type="number" 
                    value={tradeForm.qty}
                    onChange={(e) => setTradeForm({...tradeForm, qty: e.target.value})}
                    placeholder="100"
                    min="1"
                    className="w-full bg-[#131722] border border-[#2a2e39] rounded px-3 py-2 text-white placeholder:text-[#848e9c]/50 focus:border-[#2962ff] focus:outline-none font-mono" 
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#848e9c] uppercase font-bold mb-1">Price Limit</label>
                  <input 
                    type="number" 
                    step="0.05"
                    value={tradeForm.price}
                    onChange={(e) => setTradeForm({...tradeForm, price: e.target.value})}
                    placeholder="2500.50"
                    min="0.05"
                    className="w-full bg-[#131722] border border-[#2a2e39] rounded px-3 py-2 text-white placeholder:text-[#848e9c]/50 focus:border-[#2962ff] focus:outline-none font-mono" 
                    required
                  />
                </div>
              </div>
              <div className="pt-2 mt-2 border-t border-[#2a2e39] flex items-center justify-between">
                 <span className="text-xs text-[#848e9c]">Total Value</span>
                 <span className="font-bold text-white font-mono">₹{((parseFloat(tradeForm.qty)||0) * (parseFloat(tradeForm.price)||0)).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
              </div>
              <button 
                type="submit"
                className={cn(
                  "w-full py-2.5 rounded font-bold uppercase tracking-wider transition-colors shadow-lg mt-2", 
                  tradeForm.type === 'BUY' ? "bg-[#00ff9d] text-black hover:bg-[#00ff9d]/80" : "bg-[#f44336] text-white hover:bg-[#f44336]/80"
                )}
              >
                {tradeForm.type} NOW
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-2">
        <div>
          <h2 className="text-xl font-bold text-white mb-1">Paper Trading Portfolio</h2>
          <p className="text-xs text-[#848e9c]">Practice trading strategies with simulated capital.</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setTradeForm({ symbol: '', type: 'BUY', qty: '', price: '' })}
            className="text-[10px] uppercase font-bold text-white bg-[#2962ff] px-3 py-1.5 rounded hover:bg-[#3d7eff] transition flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> New Trade
          </button>
          <button 
            onClick={() => {
              if (confirm('Are you sure you want to reset your portfolio to default ₹1,000,000? All history will be lost.')) {
                setData({ cash: 1000000, positions: [], history: [] });
              }
            }}
            className="text-[10px] uppercase font-bold text-[#f44336] bg-[#f44336]/10 px-3 py-1.5 rounded hover:bg-[#f44336]/20 transition"
          >
            Reset Account
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-[#1e222d] border border-[#2a2e39] rounded-lg p-4">
          <div className="text-[10px] text-[#848e9c] font-bold uppercase mb-1">Total Value</div>
          <div className="text-2xl font-bold font-mono text-white">₹{portfolioValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
        </div>
        <div className="bg-[#1e222d] border border-[#2a2e39] rounded-lg p-4">
          <div className="text-[10px] text-[#848e9c] font-bold uppercase mb-1">Available Cash</div>
          <div className="text-2xl font-bold font-mono text-white">₹{data.cash.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
        </div>
        <div className="bg-[#1e222d] border border-[#2a2e39] rounded-lg p-4">
          <div className="text-[10px] text-[#848e9c] font-bold uppercase mb-1">Invested Value</div>
          <div className="text-2xl font-bold font-mono text-white">₹{totalInvested.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
        </div>
        <div className="bg-[#1e222d] border border-[#2a2e39] rounded-lg p-4">
          <div className="text-[10px] text-[#848e9c] font-bold uppercase mb-1">Unrealized P&L</div>
          <div className={cn("text-2xl font-bold font-mono", totalUnrealizedPnL >= 0 ? "text-[#00ff9d]" : "text-[#f44336]")}>
            {totalUnrealizedPnL >= 0 ? '+' : ''}₹{totalUnrealizedPnL.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      <h3 className="text-sm font-bold text-white uppercase mb-3">Active Positions</h3>
      <div className="bg-[#1e222d] border border-[#2a2e39] rounded-lg overflow-hidden mb-8">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#131722] text-[#848e9c] text-xs uppercase tracking-wider">
            <tr>
              <th className="p-3 font-semibold">Symbol</th>
              <th className="p-3 font-semibold text-right">Qty</th>
              <th className="p-3 font-semibold text-right">Avg Price</th>
              <th className="p-3 font-semibold text-right">LTP</th>
              <th className="p-3 font-semibold text-right">Invested</th>
              <th className="p-3 font-semibold text-right">Current</th>
              <th className="p-3 font-semibold text-right">P&L</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2a2e39]">
            {data.positions.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-[#848e9c]">No active positions. View a chart to start paper trading.</td>
              </tr>
            ) : (
                data.positions.map(p => {
                    const ltp = livePrices[p.symbol] || p.avgPrice;
                    const invested = p.qty * p.avgPrice;
                    const current = p.qty * ltp;
                    const pnl = current - invested;
                    const pnlPct = (pnl / invested) * 100;

                    return (
                        <tr key={p.symbol} className="hover:bg-[#2a2e39]/50 transition-colors">
                            <td className="p-3 font-bold text-white">{p.symbol}</td>
                            <td className="p-3 font-mono text-right text-[#b2b5be]">{p.qty}</td>
                            <td className="p-3 font-mono text-right text-[#b2b5be]">₹{p.avgPrice.toFixed(2)}</td>
                            <td className="p-3 font-mono text-right text-white">₹{ltp.toFixed(2)}</td>
                            <td className="p-3 font-mono text-right text-[#b2b5be]">₹{invested.toFixed(2)}</td>
                            <td className="p-3 font-mono text-right text-white">₹{current.toFixed(2)}</td>
                            <td className={cn("p-3 font-mono text-right font-bold", pnl >= 0 ? "text-[#00ff9d]" : "text-[#f44336]")}>
                                {pnl >= 0 ? '+' : ''}₹{pnl.toFixed(2)} ({pnlPct.toFixed(2)}%)
                            </td>
                        </tr>
                    );
                })
            )}
          </tbody>
        </table>
      </div>

      <h3 className="text-sm font-bold text-white uppercase mb-3">Trade History</h3>
      <div className="bg-[#1e222d] border border-[#2a2e39] rounded-lg overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#131722] text-[#848e9c] text-xs uppercase tracking-wider">
            <tr>
              <th className="p-3 font-semibold">Date</th>
              <th className="p-3 font-semibold">Symbol</th>
              <th className="p-3 font-semibold">Type</th>
              <th className="p-3 font-semibold text-right">Qty</th>
              <th className="p-3 font-semibold text-right">Price</th>
              <th className="p-3 font-semibold text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2a2e39]">
            {data.history.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-[#848e9c]">No trade history</td>
              </tr>
            ) : (
                [...data.history].sort((a,b) => b.date - a.date).map(t => (
                    <tr key={t.id} className="hover:bg-[#2a2e39]/50 transition-colors">
                        <td className="p-3 text-[#b2b5be] text-xs">{new Date(t.date).toLocaleString()}</td>
                        <td className="p-3 font-bold text-white">{t.symbol}</td>
                        <td className={cn("p-3 font-bold text-xs", t.type === 'BUY' ? 'text-[#00ff9d]' : 'text-[#f44336]')}>{t.type}</td>
                        <td className="p-3 font-mono text-right text-[#b2b5be]">{t.qty}</td>
                        <td className="p-3 font-mono text-right text-[#b2b5be]">₹{t.price.toFixed(2)}</td>
                        <td className="p-3 font-mono text-right text-white">₹{(t.qty * t.price).toFixed(2)}</td>
                    </tr>
                ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
