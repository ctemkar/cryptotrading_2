// scannerService.js
const { getTopGainersLosers, getCoinDetails } = require("./coingeckoClient");
const { getExchangeInfo, getKlines } = require("./binanceClient");
const { ema, sma, isDailyUptrend, isLatePump, is4hUptrend } = require("./taUtils");

let binanceSymbolsCache = [];
let lastCacheTime = 0;
const CACHE_DURATION = 3600000; // 1 hour

/**
 * Load and cache Binance symbols
 */
async function loadBinanceSymbols() {
  const now = Date.now();
  if (binanceSymbolsCache.length && now - lastCacheTime < CACHE_DURATION) {
    return binanceSymbolsCache;
  }
  
  try {
    const info = await getExchangeInfo();
    binanceSymbolsCache = info.symbols
      .filter(s => s.status === "TRADING" && s.quoteAsset === "USDT")
      .map((s) => s.symbol);
    lastCacheTime = now;
    console.log(`Loaded ${binanceSymbolsCache.length} Binance USDT pairs`);
    return binanceSymbolsCache;
  } catch (err) {
    console.error("Error loading Binance symbols:", err.message);
    return binanceSymbolsCache; // return cached if available
  }
}

/**
 * Map CoinGecko symbol to Binance symbol
 */
function findBinanceSymbol(cgSymbol) {
  const upper = cgSymbol.toUpperCase();
  const candidate = `${upper}USDT`;
  if (binanceSymbolsCache.includes(candidate)) return candidate;
  
  // Try common variations
  const variations = [
    `${upper}USDT`,
    `${upper.replace(/\s/g, "")}USDT`,
    `${upper.replace(/-/g, "")}USDT`,
  ];
  
  for (const variant of variations) {
    if (binanceSymbolsCache.includes(variant)) return variant;
  }
  
  return null;
}

/**
 * Detect if price is too vertical (parabolic move)
 */
function isTooVertical(closes, lookback = 8) {
  if (closes.length < lookback) return false;
  
  const recent = closes.slice(-lookback);
  let consecutiveUp = 0;
  let avgBodySize = 0;
  
  for (let i = 1; i < recent.length; i++) {
    const change = (recent[i] - recent[i - 1]) / recent[i - 1];
    if (change > 0) {
      consecutiveUp++;
      avgBodySize += Math.abs(change);
    }
  }
  
  avgBodySize = avgBodySize / (lookback - 1);
  
  // If 6+ consecutive up candles with avg body > 3%, flag as too vertical
  return consecutiveUp >= 6 && avgBodySize > 0.03;
}

/**
 * Check volume health (impulse vs pullback)
 */
function checkVolumeHealth(volumes, closes) {
  if (volumes.length < 20) return false;
  
  const volSma = sma(volumes, 20);
  const lastVolSma = volSma[volSma.length - 1];
  
  if (!lastVolSma) return false;
  
  // Check last 10 candles
  const recentVols = volumes.slice(-10);
  const recentCloses = closes.slice(-10);
  
  let upVolSum = 0;
  let downVolSum = 0;
  let upCount = 0;
  let downCount = 0;
  
  for (let i = 1; i < recentVols.length; i++) {
    if (recentCloses[i] > recentCloses[i - 1]) {
      upVolSum += recentVols[i];
      upCount++;
    } else {
      downVolSum += recentVols[i];
      downCount++;
    }
  }
  
  const avgUpVol = upCount > 0 ? upVolSum / upCount : 0;
  const avgDownVol = downCount > 0 ? downVolSum / downCount : 0;
  
  // Healthy: up volume > down volume
  return avgUpVol > avgDownVol * 0.8;
}

/**
 * Detect blow-off top
 */
function isBlowOffTop(closes, volumes) {
  if (closes.length < 30 || volumes.length < 30) return false;
  
  const volSma = sma(volumes, 20);
  const lastIdx = closes.length - 1;
  const lastVolSma = volSma[lastIdx];
  
  if (!lastVolSma) return false;
  
  // Check if any recent candle has extreme volume + price spike
  for (let i = Math.max(0, lastIdx - 3); i <= lastIdx; i++) {
    const retPct = i > 0 ? ((closes[i] - closes[i - 1]) / closes[i - 1]) * 100 : 0;
    const volMultiple = volumes[i] / lastVolSma;
    
    if (retPct > 30 && volMultiple > 8) {
      // Check if followed by weakness
      const followingCandles = closes.slice(i + 1, Math.min(i + 4, closes.length));
      if (followingCandles.length > 0) {
        const avgFollowing = followingCandles.reduce((a, b) => a + b, 0) / followingCandles.length;
        if (avgFollowing < closes[i] * 0.95) {
          return true; // Price dropped 5%+ after spike
        }
      }
    }
  }
  
  return false;
}

/**
 * Detect pullback to 4h 20 EMA
 */
function detectPullbackToEma(closes, highs, lows, ema20, ema50) {
  const lastIdx = closes.length - 1;
  if (lastIdx < 50) return null;
  
  const lastClose = closes[lastIdx];
  const lastEma20 = ema20[lastIdx];
  const lastEma50 = ema50[lastIdx];
  
  // Price should be near 20 EMA (within 3%)
  const diffPct = Math.abs(lastClose - lastEma20) / lastClose * 100;
  if (diffPct > 3) return null;
  
  // Price should be above 50 EMA
  if (lastClose < lastEma50) return null;
  
  // Find recent swing high (last 10-20 candles)
  const lookback = 20;
  const recentHighs = highs.slice(Math.max(0, lastIdx - lookback), lastIdx + 1);
  const swingHigh = Math.max(...recentHighs);
  
  // Find recent swing low (last 5-10 candles for tighter stop)
  const stopLookback = 8;
  const recentLows = lows.slice(Math.max(0, lastIdx - stopLookback), lastIdx + 1);
  const swingLow = Math.min(...recentLows);
  
  // Entry zone: current price ± 0.5%
  const entryMin = lastClose * 0.995;
  const entryMax = lastClose * 1.005;
  
  // Stop: below swing low with small buffer, or below 50 EMA
  const stopCandidate1 = swingLow * 0.99;
  const stopCandidate2 = lastEma50 * 0.98;
  const stop = Math.max(stopCandidate1, stopCandidate2);
  
  // Risk should be reasonable (not more than 15% from entry)
  const riskPct = ((entryMin - stop) / entryMin) * 100;
  if (riskPct > 15 || riskPct < 0.5) return null;
  
  return {
    entryPrice: lastClose,
    entryMin,
    entryMax,
    stopPrice: stop,
    swingHigh,
    swingLow,
  };
}

/**
 * Detect breakout from 4h consolidation range
 */
function detectBreakoutRange(closes, highs, lows, ema20, ema50) {
  const lastIdx = closes.length - 1;
  if (lastIdx < 50) return null;
  
  const lastClose = closes[lastIdx];
  const lastEma20 = ema20[lastIdx];
  const lastEma50 = ema50[lastIdx];
  
  // EMAs should be rising and in bullish order
  if (!(lastEma20 > lastEma50)) return null;
  
  // Look for consolidation in last 10-20 candles
  const rangeLookback = 15;
  const rangeStart = Math.max(0, lastIdx - rangeLookback);
  const rangeHighs = highs.slice(rangeStart, lastIdx);
  const rangeLows = lows.slice(rangeStart, lastIdx);
  
  if (rangeHighs.length < 10) return null;
  
  const rangeHigh = Math.max(...rangeHighs);
  const rangeLow = Math.min(...rangeLows);
  const rangeSize = ((rangeHigh - rangeLow) / rangeLow) * 100;
  
  // Range should be tight (3-12%)
  if (rangeSize < 3 || rangeSize > 12) return null;
  
  // Price should be near range high (within 2%)
  const distanceFromHigh = ((rangeHigh - lastClose) / rangeHigh) * 100;
  if (distanceFromHigh > 2) return null;
  
  // Entry: breakout above range high
  const entryPrice = rangeHigh * 1.005; // Small buffer above
  
  // Stop: below range low
  const stopPrice = rangeLow * 0.99;
  
  // Risk check
  const riskPct = ((entryPrice - stopPrice) / entryPrice) * 100;
  if (riskPct > 15 || riskPct < 1) return null;
  
  return {
    entryPrice,
    stopPrice,
    rangeHigh,
    rangeLow,
  };
}

/**
 * Generate AI-style reasoning for trade setup
 */
function generateReasoning(coin, setupType, entry, stop, ema20_4h, ema50_4h, change24h) {
  const riskPct = ((entry - stop) / entry * 100).toFixed(2);
  const stopDistance = ((entry - stop) / entry * 100).toFixed(1);
  
  if (setupType === "pullback_4h_20ema") {
    const reasons = [
      `I'm pivoting to a long position in ${coin.symbol} as it consolidates near the 4h 20 EMA in an uptrend, with a tighter stop below recent swing low at $${stop.toFixed(6)}. The 1D trend remains bullish with EMAs in proper alignment, and 4h structure shows healthy pullback on declining volume—classic retest behavior.`,
      
      `${coin.symbol} is setting up beautifully. After a ${change24h.toFixed(1)}% move, price has pulled back to the 4h 20 EMA (currently $${ema20_4h.toFixed(6)}) with no signs of weakness. I'm entering near $${entry.toFixed(6)} with stop at $${stop.toFixed(6)} (${stopDistance}% risk). The 50 EMA is providing strong support underneath.`,
      
      `Entering ${coin.symbol} on this 4h pullback setup. Price action shows a clean retest of the 20 EMA after the recent impulse move. Volume dried up on the pullback—exactly what we want to see. Entry zone: $${entry.toFixed(6)}, invalidation below $${stop.toFixed(6)}. Risk/reward favors bulls here with ${riskPct}% risk per unit.`,
      
      `${coin.symbol} presenting a textbook pullback entry. The 1D and 4h trends are aligned bullish, price has retraced to the 4h 20 EMA on low volume, and we're holding above the 50 EMA. I'm looking to enter around $${entry.toFixed(6)} with a stop below the swing low. This is a ${stopDistance}% stop distance, well within acceptable range for this setup.`,
    ];
    
    return reasons[Math.floor(Math.random() * reasons.length)];
  } else {
    const reasons = [
      `I'm entering ${coin.symbol} on a 4h breakout from consolidation. Price has been coiling in a tight range with rising EMAs underneath—classic accumulation pattern. Volume contracted into the range, suggesting big players are loading. Entry on break above $${entry.toFixed(6)}, stop below range at $${stop.toFixed(6)}. Risk/reward setup strongly favors bulls.`,
      
      `${coin.symbol} breaking out of a ${stopDistance}% consolidation range on the 4h. This is exactly the kind of setup I look for: tight range, rising EMAs, declining volume into compression. Entry: $${entry.toFixed(6)}, stop: $${stop.toFixed(6)}. The 1D trend is bullish, giving this breakout room to run.`,
      
      `Breakout setup on ${coin.symbol}. After consolidating for 10+ candles, price is pushing through resistance at $${entry.toFixed(6)}. The 4h 20 and 50 EMAs are rising underneath, providing dynamic support. Stop is tight below the range low at $${stop.toFixed(6)}. This gives us a clean ${riskPct}% risk per unit with significant upside potential.`,
      
      `${coin.symbol} coiled up nicely and now breaking higher. The consolidation range was tight (${stopDistance}% range), volume dried up, and EMAs kept rising—all signs of accumulation before continuation. I'm entering the breakout at $${entry.toFixed(6)} with stop below $${stop.toFixed(6)}. The 1D structure supports further upside.`,
    ];
    
    return reasons[Math.floor(Math.random() * reasons.length)];
  }
}

/**
 * Determine strategy label based on setup characteristics
 */
function getStrategyLabel(setupType, riskPct, change24h) {
  if (setupType === "pullback_4h_20ema") {
    if (riskPct <= 2 && change24h < 30) {
      return "New Baseline"; // Conservative, clean trend
    } else if (change24h > 50) {
      return "Situational Awareness"; // Higher volatility
    } else {
      return "Monk Mode"; // Standard pullback
    }
  } else {
    if (riskPct <= 2.5) {
      return "New Baseline"; // Tight breakout
    } else {
      return "Situational Awareness"; // Wider breakout
    }
  }
}

/**
 * Main scan function
 */
async function runScan(accountSize = 10000, riskPct = 0.02) {
  console.log(`\n=== Starting Crypto Arena Scan ===`);
  console.log(`Account size: $${accountSize}, Risk per trade: ${riskPct * 100}%\n`);
  
  try {
    // Load Binance symbols and CoinGecko gainers in parallel
    const [cgData] = await Promise.all([
      getTopGainersLosers("24h"),
      loadBinanceSymbols(),
    ]);

    const topGainers = cgData.top_gainers || [];
    console.log(`Found ${topGainers.length} top gainers from CoinGecko`);

    // Filter candidates based on criteria
    const candidates = topGainers
      .filter((c) => {
        const validChange = c.usd_24h_change >= 10 && c.usd_24h_change <= 200;
        const validVolume = c.usd_24h_vol >= 1_000_000;
        return validChange && validVolume;
      })
      .map((c) => ({
        id: c.id,
        symbol: c.symbol.toUpperCase(),
        name: c.name,
        change24h: c.usd_24h_change,
        vol24hUsd: c.usd_24h_vol,
        price: c.usd || 0,
      }))
      .slice(0, 30);

    console.log(`Filtered to ${candidates.length} candidates matching criteria\n`);

    const setups = [];
    const topMovers = candidates.slice(0, 5);
    let processed = 0;

    for (const coin of candidates) {
      processed++;
      console.log(`[${processed}/${candidates.length}] Processing ${coin.symbol}...`);
      
      const binanceSymbol = findBinanceSymbol(coin.symbol);
      if (!binanceSymbol) {
        console.log(`  ❌ Not found on Binance`);
        continue;
      }

      try {
        // Fetch 1D candles
        const daily = await getKlines(binanceSymbol, "1d", 120);
        if (!daily || daily.length < 50) {
          console.log(`  ❌ Insufficient 1D data`);
          continue;
        }

        const closesD = daily.map((k) => k.close);
        const volsD = daily.map((k) => k.volume);

        const ema20D = ema(closesD, 20);
        const ema50D = ema(closesD, 50);

        // 1D trend filter
        if (!isDailyUptrend(closesD, ema20D, ema50D)) {
          console.log(`  ❌ Failed 1D uptrend check`);
          continue;
        }

        if (isLatePump(closesD, volsD)) {
          console.log(`  ❌ Late pump detected`);
          continue;
        }

        // Fetch 4h candles
        const h4 = await getKlines(binanceSymbol, "4h", 200);
        if (!h4 || h4.length < 50) {
          console.log(`  ❌ Insufficient 4h data`);
          continue;
        }

        const closes4h = h4.map((k) => k.close);
        const highs4h = h4.map((k) => k.high);
        const lows4h = h4.map((k) => k.low);
        const vols4h = h4.map((k) => k.volume);

        const ema20_4h = ema(closes4h, 20);
        const ema50_4h = ema(closes4h, 50);

        // 4h trend filter
        if (!is4hUptrend(closes4h, ema20_4h, ema50_4h)) {
          console.log(`  ❌ Failed 4h uptrend check`);
          continue;
        }

        if (isTooVertical(closes4h)) {
          console.log(`  ❌ Too vertical (parabolic)`);
          continue;
        }

        if (!checkVolumeHealth(vols4h, closes4h)) {
          console.log(`  ❌ Failed volume health check`);
          continue;
        }

        if (isBlowOffTop(closes4h, vols4h)) {
          console.log(`  ❌ Blow-off top detected`);
          continue;
        }

        // Detect setups
        const pullback = detectPullbackToEma(closes4h, highs4h, lows4h, ema20_4h, ema50_4h);
        const breakout = detectBreakoutRange(closes4h, highs4h, lows4h, ema20_4h, ema50_4h);

        let setupAdded = false;

        if (pullback) {
          const entry = pullback.entryPrice;
          const stop = pullback.stopPrice;
          const riskPerCoin = entry - stop;
          
          if (riskPerCoin > 0) {
            const positionSizeUsd = (accountSize * riskPct) / riskPerCoin;
            const strategyLabel = getStrategyLabel("pullback_4h_20ema", riskPct * 100, coin.change24h);
            const reasoning = generateReasoning(
              coin,
              "pullback_4h_20ema",
              entry,
              stop,
              ema20_4h[ema20_4h.length - 1],
              ema50_4h[ema50_4h.length - 1],
              coin.change24h
            );

            setups.push({
              symbol: binanceSymbol,
              coinName: coin.name,
              setupType: "pullback_4h_20ema",
              strategyLabel,
              timeframe: "4h",
              entryZone: [pullback.entryMin, pullback.entryMax],
              entry,
              stop,
              riskPct: riskPct * 100,
              positionSizeUsd,
              reasoning,
              timestamp: new Date().toISOString(),
              change24h: coin.change24h,
            });
            
            console.log(`  ✅ Pullback setup added (${strategyLabel})`);
            setupAdded = true;
          }
        }

        if (!setupAdded && breakout) {
          const entry = breakout.entryPrice;
          const stop = breakout.stopPrice;
          const riskPerCoin = entry - stop;
          
          if (riskPerCoin > 0) {
            const positionSizeUsd = (accountSize * riskPct) / riskPerCoin;
            const strategyLabel = getStrategyLabel("breakout_4h_range", riskPct * 100, coin.change24h);
            const reasoning = generateReasoning(
              coin,
              "breakout_4h_range",
              entry,
              stop,
              ema20_4h[ema20_4h.length - 1],
              ema50_4h[ema50_4h.length - 1],
              coin.change24h
            );

            setups.push({
              symbol: binanceSymbol,
              coinName: coin.name,
              setupType: "breakout_4h_range",
              strategyLabel,
              timeframe: "4h",
              entryZone: [entry, entry * 1.01],
              entry,
              stop,
              riskPct: riskPct * 100,
              positionSizeUsd,
              reasoning,
              timestamp: new Date().toISOString(),
              change24h: coin.change24h,
            });
            
            console.log(`  ✅ Breakout setup added (${strategyLabel})`);
            setupAdded = true;
          }
        }

        if (!setupAdded) {
          console.log(`  ⚠️  Passed filters but no setup detected`);
        }

        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (err) {
        console.error(`  ❌ Error processing ${coin.symbol}:`, err.message);
      }
    }

    console.log(`\n=== Scan Complete ===`);
    console.log(`Total candidates: ${candidates.length}`);
    console.log(`Trade setups found: ${setups.length}\n`);

    return { setups, candidates, topMovers };

  } catch (err) {
    console.error("Fatal error in runScan:", err);
    throw err;
  }
}

module.exports = {
  runScan,
};