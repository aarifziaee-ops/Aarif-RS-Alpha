import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fetch from "node-fetch";
import YahooFinance from "yahoo-finance2";
import { GoogleGenAI } from "@google/genai";
const yahooFinance = new YahooFinance();

async function startServer() {
  const app = express();
  app.use(express.json());
  const PORT = 3000;

  // Simple in-memory cache to avoid hitting Yahoo Finance rate limits
  const cache = new Map<string, any>();

  // API Route to fetch historical data reliably (Proxying Yahoo Finance)
  app.get("/api/historical", async (req, res) => {
    const symbol = req.query.symbol as string;
    const range = (req.query.range as string) || "10y";
    const interval = (req.query.interval as string) || "1d";

    if (!symbol) {
      return res.status(400).json({ error: "Missing symbol" });
    }

    const cacheKey = `${symbol}-${range}-${interval}`;
    if (cache.has(cacheKey)) {
      return res.json(cache.get(cacheKey));
    }

    try {
      const queryOptions: any = { interval };
      // Map '10y', 'max', etc to period1
      const now = new Date();
      if (range === '1mo') { now.setMonth(now.getMonth() - 1); queryOptions.period1 = now; }
      else if (range === '3mo') { now.setMonth(now.getMonth() - 3); queryOptions.period1 = now; }
      else if (range === '6mo') { now.setMonth(now.getMonth() - 6); queryOptions.period1 = now; }
      else if (range === '1y') { now.setFullYear(now.getFullYear() - 1); queryOptions.period1 = now; }
      else if (range === '2y') { now.setFullYear(now.getFullYear() - 2); queryOptions.period1 = now; }
      else if (range === '5y') { now.setFullYear(now.getFullYear() - 5); queryOptions.period1 = now; }
      else if (range === '10y') { now.setFullYear(now.getFullYear() - 10); queryOptions.period1 = now; }
      else if (range === 'max') { queryOptions.period1 = new Date('1990-01-01'); }
      else { queryOptions.period1 = new Date('1990-01-01'); }

      const result = await yahooFinance.chart(symbol, queryOptions);
      const rawData = result.quotes as any[];
      
      if (!rawData || rawData.length === 0) {
         throw new Error("No data found for symbol");
      }

      // Map to the format `scanner.ts` expects
      const timestamps = [];
      const opens = [];
      const highs = [];
      const lows = [];
      const closes = [];
      const volumes = [];

      for (const bar of rawData) {
        timestamps.push(Math.floor(bar.date.getTime() / 1000));
        opens.push(bar.open);
        highs.push(bar.high);
        lows.push(bar.low);
        closes.push(bar.close);
        volumes.push(bar.volume);
      }

      const data = {
        chart: {
          result: [{
            timestamp: timestamps,
            indicators: {
              quote: [{
                open: opens,
                high: highs,
                low: lows,
                close: closes,
                volume: volumes
              }]
            }
          }]
        }
      };

      cache.set(cacheKey, data);
      return res.json(data);

    } catch (error: any) {
      console.error(`Error fetching proxy data for ${symbol}:`, error?.name || 'Error');
      res.status(500).json({ error: "Failed to fetch data", details: error?.name || 'Error' });
    }
  });

  // API Route to fetch real-time quote data (CMP)

  app.get("/api/sectors", async (req, res) => {
    const symbolStr = req.query.symbols as string;
    if (!symbolStr) return res.status(400).json({ error: "Missing symbols" });
    
    const symbols = symbolStr.split(',').map(s => s.trim());
    const results: Record<string, string> = {};
    
    try {
      await Promise.all(symbols.map(async (symbol) => {
        try {
          const result = await yahooFinance.quoteSummary(symbol, { modules: ['assetProfile'] });
          if (result && result.assetProfile && result.assetProfile.sector) {
            results[symbol] = result.assetProfile.sector;
          }
        } catch (e) {
          // ignore individual symbol errors
        }
      }));
      res.json(results);
    } catch (e: any) {
      console.error("Sectors error:", e?.name || 'Error');
      res.status(500).json({ error: "Failed to fetch sectors" });
    }
  });

  app.get("/api/market-overview", async (req, res) => {
    const symbols = ['^NSEI', 'GC=F', 'SI=F', 'BTC-USD', 'CL=F'];
    try {
      const data: Record<string, { price: number, change: number, changePct: number }> = {};
      
      await Promise.all(symbols.map(async (symbol) => {
        try {
          const result = await yahooFinance.quote(symbol);
          if (result && result.regularMarketPrice !== undefined) {
            data[symbol] = {
              price: result.regularMarketPrice,
              change: result.regularMarketChange || 0,
              changePct: result.regularMarketChangePercent || 0
            };
          }
        } catch (e: any) {
          // Ignore individual fetch errors which frequently happen
        }
      }));

      return res.json(data);
    } catch (err: any) {
      console.error("Market overview error:", err?.name || 'Error');
      res.status(500).json({ error: "Failed to fetch market overview" });
    }
  });

  app.post("/api/quote", async (req, res) => {
    console.log("POST /api/quote accessed");
    const symbols = req.body?.symbols;
    if (!symbols || !Array.isArray(symbols)) return res.status(400).json({ error: "Missing or invalid symbols array" });
    
    try {
      const prices: Record<string, number> = {};
      
      try {
        // Try batch request first (much faster, 1 HTTP call)
        const results = await yahooFinance.quote(symbols);
        for (const result of results) {
           if (result && result.symbol) {
              prices[result.symbol] = result.regularMarketPrice || 0;
           }
        }
      } catch (batchErr: any) {
        // Fallback to individual requests if batch fails
        const results = await Promise.allSettled(
           symbols.map(s => yahooFinance.quote(s))
        );
        
        results.forEach((result, idx) => {
           if (result.status === 'fulfilled' && result.value) {
               const sym = symbols[idx];
               const val = result.value as any;
               prices[sym] = (Array.isArray(val) ? val[0]?.regularMarketPrice : val.regularMarketPrice) || 0;
           }
        });
      }
      
      return res.json(prices);
    } catch (err: any) {
      console.error(`Error fetching proxy quote for array:`, err?.name || 'Error');
      res.status(500).json({ error: "Failed to fetch quote", details: err?.name || 'Error' });
    }
  });

  app.get("/api/quote", async (req, res) => {
    const symbol = req.query.symbol as string;
    if (!symbol) return res.status(400).json({ error: "Missing symbol" });
    
    // Support multiple symbols comma separated
    const symbols = symbol.split(',').map(s => s.trim()).filter(s => s);
    
    try {
      const prices: Record<string, number> = {};
      
      try {
        // Try batch request first (much faster, 1 HTTP call)
        const results = await yahooFinance.quote(symbols);
        for (const result of results) {
           if (result && result.symbol) {
              prices[result.symbol] = result.regularMarketPrice || 0;
           }
        }
      } catch (batchErr: any) {
        // Fallback to individual requests if batch fails
        const results = await Promise.allSettled(
           symbols.map(s => yahooFinance.quote(s))
        );
        
        results.forEach((result, idx) => {
           if (result.status === 'fulfilled' && result.value) {
               const sym = symbols[idx];
               const val = result.value as any;
               prices[sym] = (Array.isArray(val) ? val[0]?.regularMarketPrice : val.regularMarketPrice) || 0;
           }
        });
      }
      
      return res.json(prices);
    } catch (err: any) {
      console.error(`Error fetching proxy quote for ${symbol}:`, err?.name || 'Error');
      res.status(500).json({ error: "Failed to fetch quote", details: err?.name || 'Error' });
    }
  });

  app.post("/api/analyze", async (req, res) => {
    const symbol = req.body?.symbol;
    const type = req.body?.type;
    if (!symbol || !type) return res.status(400).json({ error: "Missing symbol or type" });
    
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      
      let prompt = "";
      if (type === 'fa') {
        prompt = `You are a senior equity research analyst at Goldman Sachs with 20 years of experience evaluating companies for the firm's $2T+ asset management division.

I need a complete fundamental analysis of a stock as if you're writing a research report for institutional investors.

Please ensure the analysis uses the most current data available up to today's date (${new Date().toLocaleDateString()}).
Mention the application name "Aarif RS Alpha" in the report introduction or footer.

Analyze the stock with symbol ${symbol}:
- Business model breakdown: how the company makes money explained simply
- Revenue streams: each segment with percentage contribution and growth trajectory
- Profitability analysis: gross margin, operating margin, net margin trends over 5 years
- Balance sheet health: debt-to-equity, current ratio, cash position vs total debt
- Free cash flow analysis: FCF yield, FCF growth rate, and capital allocation priorities
- Competitive advantages: pricing power, brand strength, switching costs, network effects rated 1-10
- Management quality: capital allocation track record, insider ownership, and compensation alignment
- Valuation snapshot: current P/E, P/S, EV/EBITDA vs 5-year average and sector peers
- Bull case and bear case with 12-month price targets for each
- One-paragraph verdict: buy, hold, or avoid with conviction level

Format as a Goldman Sachs-style equity research note with a summary rating box at the top.`;
      } else if (type === 'ta') {
        prompt = `You are a senior technical strategist at Morgan Stanley who advises the firm's largest trading desk on chart patterns, momentum signals, and optimal entry and exit points.

I need a complete technical analysis breakdown of a stock covering every major indicator.

Please ensure the analysis uses the most current data available up to today's date (${new Date().toLocaleDateString()}).
Mention the application name "Aarif RS Alpha" in the report introduction or footer.

Analyze the stock with symbol ${symbol}:
- Trend analysis: primary trend direction on daily, weekly, and monthly timeframes
- Support and resistance: exact price levels where the stock is likely to bounce or stall
- Moving averages: 20-day, 50-day, 100-day, 200-day positions and crossover signals
- RSI reading: current value with interpretation (overbought, oversold, or neutral)
- MACD analysis: signal line crossovers, histogram momentum, and divergence detection
- Bollinger Bands: current position within bands and squeeze or expansion status
- Volume analysis: is volume confirming or contradicting the current price move
- Fibonacci retracement: key pullback levels from the most recent significant swing
- Chart pattern identification: head and shoulders, double tops, cup and handle, or flags
- Trade setup: specific entry price, stop-loss level, and two profit targets with risk-reward ratio

Format as a Morgan Stanley-style technical analysis note with a clear trade plan summary at the top.`;
      } else if (type === 'qa') {
        prompt = `You are a senior quantitative researcher at Renaissance Technologies who builds systematic stock screening models using statistical patterns, factor analysis, and anomaly detection to find mispriced securities.

I need a multi-factor stock screening system that identifies the best opportunities based on data for the following market/segment: ${symbol}.

Please ensure the analysis uses the most current data available up to today's date (${new Date().toLocaleDateString()}).
Mention the application name "Aarif RS Alpha" in the report introduction or footer.

Screen:
- Value factors: P/E below sector median, P/FCF under 15, EV/EBITDA in bottom quartile
- Quality factors: ROE above 15%, stable margins, low debt-to-equity, high interest coverage
- Momentum factors: price above 200-day MA, relative strength rank in top 20%, positive earnings revisions
- Growth factors: revenue growth above 10%, EPS growth accelerating, expanding margins
- Sentiment factors: insider buying, institutional accumulation, short interest declining
- Custom composite score: blend all factors into a single ranking score from 1-100
- Top 20 stocks: highest composite scores with individual factor breakdown for each
- Sector distribution: ensure the screen isn't accidentally concentrated in one sector
- Backtest context: how this factor combination has historically performed vs the S&P 500 (or local benchmark)
- Watch list: next 20 stocks that almost made the cut and what would push them in

CRITICAL: The "Top 20 stocks" and "Watch list" MUST be presented in properly formatted Markdown tables with columns like Rank | Symbol | Company Name | Composite Score | Value Score | Quality Score | Momentum Score | Sector. Do not use plain text lists for these sections.

Format as a Renaissance-style quantitative screening report with a ranked stock table and factor score breakdown for ${symbol} stocks. If the user specified a specific market in their query, prioritize that market (e.g. Indian market, US market).`;
      } else {
        return res.status(400).json({ error: "Invalid type. Must be 'fa', 'ta', or 'qa'." });
      }

      let response;
      let retries = 3;
      let delay = 1000;
      
      while (retries > 0) {
        try {
          response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt
          });
          break; // Success, exit retry loop
        } catch (err: any) {
          if (err?.status === 503 || err?.status === 'UNAVAILABLE' || err?.message?.includes('503') || err?.message?.includes('high demand')) {
            retries--;
            if (retries === 0) throw err;
            console.log(`Model high demand, retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2; // Exponential backoff
          } else {
            throw err; // Re-throw non-503 errors immediately
          }
        }
      }

      return res.json({ result: response?.text });
    } catch (err: any) {
      console.error("AI analysis error:", err?.name || 'Error');
      res.status(500).json({ error: "Failed to generate analysis", details: err?.name || 'Error' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production mode
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // Support dynamic client side routing
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
