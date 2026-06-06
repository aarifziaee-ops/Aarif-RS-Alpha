import React, { useState, useRef } from 'react';
import { Search, Loader2, FileText, TrendingUp, Printer, Activity, Globe } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useReactToPrint } from 'react-to-print';
import { cn } from './StockTable';

export function AnalysisPanel() {
  const [symbol, setSymbol] = useState('');
  const [type, setType] = useState<'fa' | 'ta' | 'qa'>('fa');
  const [qaMarket, setQaMarket] = useState<'indian' | 'us'>('indian');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const reactToPrintFn = useReactToPrint({ contentRef });

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (type !== 'qa' && !symbol) return;

    setLoading(true);
    setResult(null);
    setError(null);

    const querySymbol = type === 'qa' ? (qaMarket === 'indian' ? 'INDIAN MARKET' : 'US MARKET') : symbol.toUpperCase();

    try {
      const baseUrl = typeof window === 'undefined' ? 'http://localhost:3000' : '';
      const res = await fetch(`${baseUrl}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: querySymbol, type })
      });
      
      const data = await res.json();
      if (!res.ok) {
        let msg = data.details || data.error || 'Failed to generate analysis';
        if (msg.includes('503') || msg.includes('high demand') || msg.includes('UNAVAILABLE')) {
          msg = "The analysis model is currently experiencing extremely high demand. We are trying our best, but please try again in a few moments.";
        }
        throw new Error(msg);
      }
      
      setResult(data.result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-4 md:p-8 lg:p-12 overflow-y-auto w-full">
      <div className="w-full max-w-5xl mx-auto flex flex-col">
        <div className="mb-8">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">Aarif's Fundamental and Technical Analysis Report</h2>
          <p className="text-sm text-[#848e9c]">
            F/A is based on Goldman Sachs Fundamental Analysis<br />
            T/A is based on Morgan Stanley Technical Analysis<br />
            Q/A is based on Renaissance Technologies Quantitative Scanner
          </p>
        </div>

        <div className="bg-[#1e222d] border border-[#2a2e39] rounded-xl p-6 lg:p-8 mb-10 w-full shrink-0 shadow-lg">
          <form onSubmit={handleAnalyze} className="flex flex-col gap-6">
            <div>
              <label className="block text-xs font-bold text-[#848e9c] uppercase mb-3 tracking-wider">Analysis Type</label>
              <div className="flex flex-col sm:flex-row bg-[#131722] border border-[#2a2e39] rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setType('fa')}
                  className={cn(
                    "flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 transition-colors",
                    type === 'fa' ? "bg-[#2962ff] text-white" : "text-[#848e9c] hover:bg-[#2a2e39] hover:text-white"
                  )}
                >
                  <FileText className="w-4 h-4" /> Fundamental Analysis (F/A)
                </button>
                <button
                  type="button"
                  onClick={() => setType('ta')}
                  className={cn(
                    "flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 transition-colors sm:border-l border-[#2a2e39]",
                    type === 'ta' ? "bg-[#2962ff] text-white" : "text-[#848e9c] hover:bg-[#2a2e39] hover:text-white"
                  )}
                >
                  <TrendingUp className="w-4 h-4" /> Technical Analysis (T/A)
                </button>
                <button
                  type="button"
                  onClick={() => setType('qa')}
                  className={cn(
                    "flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 transition-colors sm:border-l border-[#2a2e39]",
                    type === 'qa' ? "bg-[#2962ff] text-white" : "text-[#848e9c] hover:bg-[#2a2e39] hover:text-white"
                  )}
                >
                  <Activity className="w-4 h-4" /> Quantitative Scanner (Q/A)
                </button>
              </div>
            </div>

          {type === 'qa' ? (
            <div>
              <label className="block text-xs font-bold text-[#848e9c] uppercase mb-3 tracking-wider">
                Select Market
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex bg-[#131722] border border-[#2a2e39] rounded-lg overflow-hidden flex-1">
                  <button
                    type="button"
                    onClick={() => setQaMarket('indian')}
                    className={cn(
                      "flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 transition-colors",
                      qaMarket === 'indian' ? "bg-[#2962ff] text-white" : "text-[#848e9c] hover:bg-[#2a2e39] hover:text-white"
                    )}
                  >
                    <Globe className="w-4 h-4" /> Indian Market
                  </button>
                  <button
                    type="button"
                    onClick={() => setQaMarket('us')}
                    className={cn(
                      "flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 transition-colors sm:border-l border-[#2a2e39]",
                      qaMarket === 'us' ? "bg-[#2962ff] text-white" : "text-[#848e9c] hover:bg-[#2a2e39] hover:text-white"
                    )}
                  >
                    <Globe className="w-4 h-4" /> US Market
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-[#00ff9d] hover:bg-[#00e68d] disabled:opacity-50 text-black font-bold px-8 py-4 rounded-lg tracking-wider flex items-center justify-center gap-2 transition-colors"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'SCAN'}
                </button>
              </div>
            </div>
          ) : (
            <div>
               <label className="block text-xs font-bold text-[#848e9c] uppercase mb-3 tracking-wider">
                 Symbol / Script Name
               </label>
               <div className="flex flex-col sm:flex-row gap-3">
                 <div className="relative flex-1">
                   <Search className="w-5 h-5 text-[#848e9c] absolute left-4 top-1/2 -translate-y-1/2" />
                   <input
                     type="text"
                     value={symbol}
                     onChange={e => setSymbol(e.target.value.toUpperCase())}
                     placeholder="e.g. RELIANCE.NS, AAPL"
                     className="w-full bg-[#131722] border border-[#2a2e39] rounded-lg pl-12 pr-4 py-4 text-white focus:outline-none focus:border-[#2962ff] uppercase transition-colors"
                     required
                   />
                 </div>
                 <button
                   type="submit"
                   disabled={loading || !symbol}
                   className="bg-[#00ff9d] hover:bg-[#00e68d] disabled:opacity-50 text-black font-bold px-8 py-4 rounded-lg tracking-wider flex items-center justify-center gap-2 transition-colors"
                 >
                   {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'ANALYZE'}
                 </button>
               </div>
            </div>
          )}
          </form>
        </div>

        {error && (
          <div className="bg-[#f44336]/10 border border-[#f44336]/20 text-[#f44336] p-5 rounded-lg mb-8 shadow-sm">
            <p className="font-bold mb-1 flex items-center gap-2"><Activity className="w-4 h-4" /> Analysis Failed</p>
            <p className="text-sm opacity-90">{error}</p>
          </div>
        )}

        {result && (
          <div className="flex flex-col w-full">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-[#00ff9d] font-bold text-lg flex items-center gap-2"><Activity className="w-5 h-5" /> Analysis Complete</h3>
              <button
                 onClick={() => reactToPrintFn()}
                 className="bg-[#2962ff] hover:bg-[#1e4eb8] text-white px-5 py-2.5 rounded-lg font-bold text-sm flex items-center gap-2 transition-colors shadow-sm"
                 title="Print or Save as PDF"
              >
                <Printer className="w-4 h-4" /> Print / Save PDF
              </button>
            </div>
            
            <div className="bg-[#1e222d] print:bg-white print:text-black border border-[#2a2e39] print:border-none print:shadow-none rounded-xl p-6 md:p-8 lg:p-12 flex-1 shrink-0 shadow-xl" ref={contentRef}>
              {/* Header visible only on print */}
              <div className="hidden print:block mb-8 border-b print:border-gray-300 pb-4">
                 <h1 className="text-3xl font-bold text-black uppercase">{type === 'qa' ? (qaMarket === 'indian' ? 'INDIAN MARKET' : 'US MARKET') : symbol}</h1>
                 <p className="text-gray-600 font-bold mt-1 uppercase tracking-widest">{type === 'fa' ? 'Fundamental Analysis Report' : type === 'qa' ? 'Quantitative Screening Report' : 'Technical Analysis Report'}</p>
                 <p className="text-gray-500 text-sm mt-2">{new Date().toLocaleDateString()} | {new Date().toLocaleTimeString()}</p>
              </div>

              <div className="prose prose-invert print:prose-neutral max-w-none prose-headings:text-white print:prose-headings:text-black prose-a:text-[#2962ff] prose-strong:text-white print:prose-strong:text-black prose-table:w-full prose-table:border-collapse prose-table:border-[#2a2e39] print:prose-table:border-gray-300 prose-td:px-4 prose-td:py-3 prose-th:px-4 prose-th:py-3 prose-td:border prose-th:border prose-th:bg-[#131722] print:prose-th:bg-gray-100 prose-th:text-[#848e9c] print:prose-th:text-black prose-td:border-[#2a2e39] print:prose-td:border-gray-300">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown>
              </div>
              
              {/* Footer visible only on print */}
              <div className="hidden print:block mt-16 pt-6 border-t border-gray-300 text-center text-sm font-bold text-gray-500 uppercase tracking-widest">
                 Generated by Aarif Rs Alpha
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
