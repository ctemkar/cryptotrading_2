// backend/server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const mysql = require("mysql2/promise");
const crypto = require("crypto");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

/* ------------------------------
   GEMINI MINIMUM ORDER SIZES
--------------------------------*/
const GEMINI_MIN_ORDER_SIZE = {
  btcusd: 0.00001,
  ethusd: 0.001,
  solusd: 0.01,
  // Add more as needed
};

const GEMINI_TICK_SIZE = {
  btcusd: 0.00000001,
  ethusd: 0.000001,
  solusd: 0.000001,
};

/**
 * Validate if order amount meets Gemini's minimum requirements
 */
function validateOrderAmount(symbol, amount) {
  const symbolKey = symbol.toLowerCase();
  const minSize = GEMINI_MIN_ORDER_SIZE[symbolKey];
  
  if (!minSize) {
    return {
      valid: false,
      error: `Unknown symbol: ${symbol}`,
    };
  }
  
  const amountNum = parseFloat(amount);
  
  if (amountNum < minSize) {
    return {
      valid: false,
      error: `Amount ${amountNum} ${symbol.toUpperCase()} is below minimum ${minSize}`,
      minRequired: minSize,
      attempted: amountNum,
    };
  }
  
  return { valid: true };
}

/* ------------------------------
   MYSQL DATABASE CONNECTION
--------------------------------*/
let db;

async function initDatabase() {
  try {
    db = await mysql.createPool({
      host: "87.106.214.100",
      user: "crypto_trader",
      password: "CryptoTrader@2025",
      database: "crypto_trading",
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    // Create trades table if it doesn't exist
    await db.query(`
      CREATE TABLE IF NOT EXISTS trades (
        id INT AUTO_INCREMENT PRIMARY KEY,
        model_id VARCHAR(50) NOT NULL,
        model_name VARCHAR(100) NOT NULL,
        action ENUM('BUY', 'SELL') NOT NULL,
        crypto_symbol VARCHAR(20) NOT NULL,
        crypto_price DECIMAL(15, 2) NOT NULL,
        quantity DECIMAL(15, 4) NOT NULL,
        total_value DECIMAL(15, 2) NOT NULL,
        timestamp BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_timestamp (timestamp DESC)
      )
    `);

    console.log("✅ MySQL connected and trades table ready");
  } catch (error) {
    console.error("❌ MySQL connection failed:", error.message);
    process.exit(1);
  }
}

/* ------------------------------
   GEMINI MARKET TRADES CACHE
--------------------------------*/
// --- Gemini public trades cache (per symbol) ---
const geminiMarketTradesCache = {
  btcusd: [],
  ethusd: [],
  solusd: []
};

/* ------------------------------
   GEMINI API HELPER FUNCTIONS
--------------------------------*/
/*async function geminiRequest(apiKey, apiSecret, path, payload = {}) {
  const url = "https://api.gemini.com" + path;
  const nonce = Date.now().toString();
  
  const requestPayload = {
    request: path,
    nonce,
    ...payload
  };

  const encodedPayload = Buffer.from(JSON.stringify(requestPayload)).toString("base64");
  const signature = crypto
    .createHmac("sha384", apiSecret)
    .update(encodedPayload)
    .digest("hex");

  const headers = {
    "Content-Type": "text/plain",
    "X-GEMINI-APIKEY": apiKey,
    "X-GEMINI-PAYLOAD": encodedPayload,
    "X-GEMINI-SIGNATURE": signature,
    "Cache-Control": "no-cache"
  };

  const response = await axios.post(url, {}, { headers, timeout: 10000 });
  return response.data;
} */

/*async function geminiRequest(apiKey, apiSecret, path, payload = {}) {
  const url = "https://api.gemini.com" + path;
  const nonce = Date.now().toString();
  
  const requestPayload = {
    request: path,
    nonce,
    ...payload
  };

  // ✅ FIX: For /v1/balances, add account parameter
  if (path === "/v1/balances") {
    requestPayload.account = "primary";  // Add this line
  }

  const encodedPayload = Buffer.from(JSON.stringify(requestPayload)).toString("base64");
  
  // ✅ FIX: Ensure apiSecret is treated as a string (no extra encoding)
  const signature = crypto
    //.createHmac("sha384", Buffer.from(apiSecret, 'utf-8'))  // Changed this line
    .createHmac("sha384", apiSecret)  // ✅ Use apiSecret directly as string
    .update(encodedPayload)
    .digest("hex");

  const headers = {
    "Content-Type": "text/plain",
    "Content-Length": "0",  // ✅ Added this required header
    "X-GEMINI-APIKEY": apiKey,
    "X-GEMINI-PAYLOAD": encodedPayload,
    "X-GEMINI-SIGNATURE": signature,
    "Cache-Control": "no-cache"
  };

  console.log("🔍 Debug - Request details:");
  console.log("  Path:", path);
  console.log("  API Key (first 10 chars):", apiKey.substring(0, 10) + "...");
  console.log("  Payload:", JSON.stringify(requestPayload));
  console.log("  Encoded Payload:", encodedPayload);
  console.log("  Signature:", signature);

  const response = await axios.post(url, {}, { headers, timeout: 10000 });
  return response.data;
} */

async function geminiRequest(apiKey, apiSecret, path, payload = {}) {
  // ✅ Choose base URL based on payload.env (default = live)
  const env = payload.env === 'sandbox' ? 'sandbox' : 'live';
  
  const baseUrl =
    env === 'sandbox'
      ? 'https://api.sandbox.gemini.com'
      : 'https://api.gemini.com';

  // Remove env from the actual Gemini payload – we only used it to choose URL
  const { env: _ignoreEnv, ...restPayload } = payload;

  const url = baseUrl + path;
  const nonce = Date.now().toString();

  const requestPayload = {
    request: path,
    nonce,
    ...restPayload,
  };

  // For balances and order/new, ensure account is present
  if (path === '/v1/balances') {
    requestPayload.account = requestPayload.account || 'primary';
  }
  if (path === '/v1/order/new') {
    requestPayload.account = requestPayload.account || 'primary';
  }

  const encodedPayload = Buffer.from(JSON.stringify(requestPayload)).toString(
    'base64'
  );

  const signature = crypto
    .createHmac('sha384', apiSecret)
    .update(encodedPayload)
    .digest('hex');

  const headers = {
    'Content-Type': 'text/plain',
    'Content-Length': '0',
    'X-GEMINI-APIKEY': apiKey,
    'X-GEMINI-PAYLOAD': encodedPayload,
    'X-GEMINI-SIGNATURE': signature,
    'Cache-Control': 'no-cache',
  };

  console.log('🔍 Gemini request', { path, env, requestPayload });

  const response = await axios.post(url, {}, { headers, timeout: 10000 });
  return response.data;
}

/* ------------------------------
   GEMINI PRICE HELPER
--------------------------------*/
async function getGeminiPrice(symbol, env = 'live') {
  try {
    const baseUrl =
      env === 'sandbox'
        ? 'https://api.sandbox.gemini.com'
        : 'https://api.gemini.com';

    const url = `${baseUrl}/v1/pubticker/${symbol}`;
    const res = await axios.get(url, { timeout: 8000 });
    return parseFloat(res.data.last);
  } catch (error) {
    console.error(`Failed to fetch ${symbol} price (${env}):`, error.message);
    return null;
  }
}

async function getGeminiTicker(symbol, env = 'live') {
  const baseUrl =
    env === 'sandbox'
      ? 'https://api.sandbox.gemini.com'
      : 'https://api.gemini.com';

  const url = `${baseUrl}/v1/pubticker/${symbol}`;
  const res = await axios.get(url, { timeout: 8000 });

  return {
    bid: parseFloat(res.data.bid),
    ask: parseFloat(res.data.ask),
    last: parseFloat(res.data.last),
  };
}

function toUsdPrice2(n) {
  // Gemini USD pairs typically accept 2 decimals; keep it simple.
  return (Math.round(Number(n) * 100) / 100).toFixed(2);
}

/* -----------------------------------------
   LIVE GEMINI POSITION TRACKING (IN-MEMORY)
------------------------------------------*/

// { [modelId_symbol]: { modelId, modelName, symbol, side, amount, entryPrice, openedAt } }
const liveGeminiPositions = {};

function livePosKey(modelId, symbol) {
  return `${modelId}_${symbol.toLowerCase()}`;
}

function hasOpenPosition(modelId, symbol) {
  const key = livePosKey(modelId, symbol);
  return !!liveGeminiPositions[key];
}

function openLiveGeminiPosition({ modelId, modelName, symbol, amount, price, side }) {
  const key = livePosKey(modelId, symbol);
  liveGeminiPositions[key] = {
    modelId,
    modelName,
    symbol: symbol.toLowerCase(),
    side: side.toUpperCase(), // 'LONG',
    amount: parseFloat(amount),
    entryPrice: parseFloat(price),
    openedAt: Date.now(),
  };
  console.log('📌 [LIVE] Opened Gemini position:', liveGeminiPositions[key]);

  // ✅ NEW: notify all clients that a position was opened
  io.emit('position_opened', {
    ...liveGeminiPositions[key],
  });
}

async function closeLiveGeminiPositionAndRecord({
  modelId,
  modelName,
  symbol,
  amount,
  exitPrice,
}) {
  const key = livePosKey(modelId, symbol);
  const pos = liveGeminiPositions[key];

  if (!pos) {
    console.warn('⚠️ [LIVE] No open Gemini position found for', key);
    return null;
  }

  const qtyExecuted = amount ? parseFloat(amount) : pos.amount;
  const entryPrice = pos.entryPrice;
  const exit = parseFloat(exitPrice);

  // ✅ Calculate P&L based on position side and executed qty
  let pnl;
  if (pos.side === 'LONG') {
    pnl = (exit - entryPrice) * qtyExecuted; // Profit when price rises
  } else if (pos.side === 'SHORT') {
    pnl = (entryPrice - exit) * qtyExecuted; // Profit when price falls
  } else {
    pnl = 0;
  }

  const timestamp = Date.now();
  const totalValue = (exit * qtyExecuted).toFixed(2);

  // ✅ Determine closing action based on position side
  const closingAction = pos.side === 'LONG' ? 'SELL' : 'BUY';

  await db.query(
    `INSERT INTO trades (model_id, model_name, action, crypto_symbol, crypto_price, quantity, total_value, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      modelId,
      modelName,
      closingAction,
      symbol.toUpperCase(),
      exit,
      qtyExecuted,
      totalValue,
      timestamp,
    ]
  );

  // ✅ Update in‑memory position for partial closes
  const remaining = pos.amount - qtyExecuted;

  if (remaining <= 0.00000001) {
    // Fully closed
    delete liveGeminiPositions[key];
    console.log(
      `✅ [LIVE] Fully closed ${pos.side} position for ${modelName} on ${symbol}: entry ${entryPrice}, exit ${exit}, qty ${qtyExecuted}, P&L = ${pnl.toFixed(2)}`
    );
  } else {
    // Partial close: reduce remaining amount
    liveGeminiPositions[key].amount = remaining;
    console.log(
      `✅ [LIVE] Partially closed ${pos.side} position for ${modelName} on ${symbol}: entry ${entryPrice}, exit ${exit}, closed qty ${qtyExecuted}, remaining qty ${remaining}, P&L on closed = ${pnl.toFixed(2)}`
    );
  }

  io.emit('position_closed', {
    model_id: modelId,
    model_name: modelName,
    symbol: symbol.toUpperCase(),
    side: pos.side,
    entryPrice,
    exitPrice: exit,
    quantity: qtyExecuted,
    pnl,
    remainingAmount: remaining > 0 ? remaining : 0,
    timestamp,
  });

  return {
    side: pos.side,
    entryPrice,
    exitPrice: exit,
    quantity: qtyExecuted,
    remaining,
    pnl,
    timestamp,
  };
}

// ✅ NEW: API to get all current live Gemini positions (per model & symbol)
app.get('/api/gemini/open-positions', (req, res) => {
  try {
    const positions = Object.values(liveGeminiPositions);
    return res.json({
      success: true,
      positions,
    });
  } catch (err) {
    console.error('❌ Error getting open positions:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to get open positions',
    });
  }
});

/**
 * Close all open Gemini positions for a given model (or all models)
 * Body: { apiKey, apiSecret, env, modelId? }
 */
/**
 * Close all open Gemini positions for a given model (or all models)
 * Body: { apiKey, apiSecret, env, modelId? }
 */

/**
 * Close all open Gemini positions for a given model (or all models)
 * Body: { apiKey, apiSecret, env='live', modelId? }
 */
app.post('/api/gemini/close-all', async (req, res) => {
  try {
    const { apiKey, apiSecret, env = 'live', modelId } = req.body || {};

    // Validate credentials
    if (!apiKey || !apiSecret) {
      return res.status(400).json({
        success: false,
        error: 'API Key and API Secret are required',
        reason: 'missing_credentials',
      });
    }

    // Collect positions to close
    const allPositions = Object.values(liveGeminiPositions);
    const positionsToClose = modelId
      ? allPositions.filter(p => p.modelId === modelId)
      : allPositions;

    if (!positionsToClose.length) {
      return res.status(400).json({
        success: false,
        error: modelId
          ? `No open positions found for model ${modelId}`
          : 'No open positions found',
        reason: 'no_open_positions',
      });
    }

    const results = [];
    const errors = [];

    for (const pos of positionsToClose) {
      try {
        const symbol = pos.symbol.toLowerCase(); // stored lower already
        const closeSide = pos.side === 'LONG' ? 'sell' : 'buy';

        // ✅ IOC LIMIT close (Gemini rejects exchange market for you)
        const t = await getGeminiTicker(symbol, env);

        const isSell = closeSide === 'sell'; // sell closes LONG, buy closes SHORT
        const basePx = isSell ? (t.bid || t.last) : (t.ask || t.last);

        if (!basePx || basePx <= 0) {
          throw new Error(`No valid ticker price for ${symbol} (${env})`);
        }

        // ✅ Nudge price with 3% slippage so it fills immediately like a market order
        const px = isSell ? basePx * 0.97 : basePx * 1.03;

        const orderPayload = {
          symbol,
          amount: String(pos.amount),
          side: closeSide,
          type: 'exchange limit',
          price: toUsdPrice2(px),
          options: ['immediate-or-cancel'],
          env,
          account: 'primary',
        };

        console.log(
          `🔻 Closing ${pos.modelName} ${symbol.toUpperCase()} ${pos.side} (${closeSide.toUpperCase()}) @ ${orderPayload.price} (bid=${t.bid}, ask=${t.ask})`
        );

        const order = await geminiRequest(apiKey, apiSecret, '/v1/order/new', orderPayload);

        const executed = parseFloat(order.executed_amount || '0');
        const isLive = !!order.is_live;

        if (isLive || executed <= 0) {
          // Gemini accepted but didn't fill yet (or filled 0)
          errors.push({
            modelId: pos.modelId,
            modelName: pos.modelName,
            symbol: symbol.toUpperCase(),
            error: `Close order not filled yet (is_live=${isLive}, executed=${executed})`,
            reason: 'not_filled',
            details: {
              order_id: order.order_id,
              is_live: order.is_live,
              executed_amount: order.executed_amount,
              remaining_amount: order.remaining_amount,
            },
          });
          continue;
        }

        const exitPrice = parseFloat(order.avg_execution_price || order.price || '0');

        const closingInfo = await closeLiveGeminiPositionAndRecord({
          modelId: pos.modelId,
          modelName: pos.modelName,
          symbol,
          amount: executed,     // use executed for accurate P&L
          exitPrice: exitPrice,
        });

        results.push({
          modelId: pos.modelId,
          modelName: pos.modelName,
          symbol: symbol.toUpperCase(),
          side: pos.side,
          closingAction: closeSide.toUpperCase(),
          entryPrice: closingInfo?.entryPrice,
          exitPrice: closingInfo?.exitPrice,
          quantity: closingInfo?.quantity,
          pnl: closingInfo?.pnl,
          timestamp: closingInfo?.timestamp,
          order_id: order.order_id,
        });
      } catch (err) {
        const data = err.response?.data || {};
        errors.push({
          modelId: pos.modelId,
          modelName: pos.modelName,
          symbol: String(pos.symbol || '').toUpperCase(),
          error: data.message || data.reason || err.message || 'Failed to close position',
          reason: data.reason || 'close_failed',
          details: data,
        });
      }
    }

    // If everything failed, surface as error
    if (!results.length) {
      return res.status(500).json({
        success: false,
        error: errors[0]?.error || 'Failed to close positions',
        reason: 'all_failed',
        results: [],
        errors,
      });
    }

    // Partial success is still success=true, but return errors too
    return res.json({
      success: true,
      message: `Closed ${results.length} position(s)`,
      results,
      errors, // <-- important for your UI logs
    });
  } catch (err) {
    console.error('❌ /api/gemini/close-all error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to close positions',
      reason: 'server_error',
    });
  }
}); 

/**
 * ✅ NEW: Clear all in-memory Gemini positions (for reset/cleanup)
 * This does NOT place orders, just clears tracking
 */
app.post('/api/gemini/clear-positions', (req, res) => {
  try {
    const { modelId } = req.body;

    if (modelId) {
      // Clear positions for specific model
      const keysToDelete = Object.keys(liveGeminiPositions).filter(key =>
        key.startsWith(`${modelId}_`)
      );
      keysToDelete.forEach(key => delete liveGeminiPositions[key]);
      console.log(`🧹 Cleared ${keysToDelete.length} positions for model ${modelId}`);
    } else {
      // Clear ALL positions
      const count = Object.keys(liveGeminiPositions).length;
      Object.keys(liveGeminiPositions).forEach(key => delete liveGeminiPositions[key]);
      console.log(`🧹 Cleared all ${count} positions`);
    }

    return res.json({
      success: true,
      message: 'Positions cleared from memory',
    });
  } catch (err) {
    console.error('❌ Error clearing positions:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to clear positions',
    });
  }
});

/* ------------------------------
   MODELS INITIAL STATE
--------------------------------*/
const MODELS = [
  { id: "gemini-3-pro",      name: "Gemini-3-pro",            color: "#1f77b4", volatility: 0.5 },
  { id: "qwen-3-next",       name: "Qwen3-Next",              color: "#ff7f0e", volatility: 0.3 },
  { id: "gpt-5.2",           name: "GPT-5.2",                 color: "#2ca02c", volatility: 0.7 },
  { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5",       color: "#d62728", volatility: 0.4 },
  { id: "mystery-model",     name: "Mystery Model",           color: "#9467bd", volatility: 1.0 },
  { id: "deepseek",          name: "DeepSeek-V3.2-Speciale",  color: "#8e24aa", volatility: 0.6 },
  { id: "grok",              name: "Grok",                    color: "#ff9800", volatility: 0.7 }
];

const STARTING_VALUE = 100;
const MAX_HISTORY = 200;

let modelState = {};
let modelHistory = {};

// Initialize all models at the same starting value
MODELS.forEach(m => {
  modelState[m.id] = {
    id: m.id,
    name: m.name,
    color: m.color,
    accountValue: STARTING_VALUE,
    volatility: m.volatility
  };
  modelHistory[m.id] = [{ time: Date.now(), accountValue: STARTING_VALUE }];
});

/* ------------------------------
   CRYPTO PRICES INITIAL STATE
--------------------------------*/
const CRYPTO_SYMBOLS = [
  { symbol: "BTCUSDT", name: "Bitcoin", startPrice: 95000, volatility: 0.002 },
  { symbol: "ETHUSDT", name: "Ethereum", startPrice: 3500, volatility: 0.003 },
  { symbol: "SOLUSDT", name: "Solana", startPrice: 180, volatility: 0.004 }
];

let cryptoPrices = {};
let cryptoHistory = {};

// Initialize crypto prices
CRYPTO_SYMBOLS.forEach(c => {
  cryptoPrices[c.symbol] = c.startPrice;
  cryptoHistory[c.symbol] = [{ time: Date.now(), price: c.startPrice }];
});

/* ----------------------------------------
   AUTO-GENERATE TRADES (SIMPLE STRATEGY)
-----------------------------------------*/
async function generateTrade(modelId, modelName) {
  try {
    // Random: pick a crypto
    const crypto = CRYPTO_SYMBOLS[Math.floor(Math.random() * CRYPTO_SYMBOLS.length)];
    const cryptoPrice = cryptoPrices[crypto.symbol];

    // Random: BUY or SELL
    const action = Math.random() > 0.5 ? "BUY" : "SELL";

    // Random quantity between 0.01 and 0.5
    const quantity = (Math.random() * 0.49 + 0.01).toFixed(4);

    // Total value
    const totalValue = (cryptoPrice * quantity).toFixed(2);

    const timestamp = Date.now();

    // Insert into database
    await db.query(
      `INSERT INTO trades (model_id, model_name, action, crypto_symbol, crypto_price, quantity, total_value, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [modelId, modelName, action, crypto.symbol, cryptoPrice, quantity, totalValue, timestamp]
    );

    console.log(`📊 TRADE: ${modelName} ${action} ${quantity} ${crypto.symbol} @ $${cryptoPrice}`);

    // Emit to all clients
    io.emit("new_trade", {
      model_id: modelId,
      model_name: modelName,
      action,
      crypto_symbol: crypto.symbol,
      crypto_price: cryptoPrice,
      quantity,
      total_value: totalValue,
      timestamp
    });

  } catch (error) {
    console.error("Error generating trade:", error.message);
  }
}

/* ----------------------------------------
   CONFIGURABLE UPDATE INTERVAL
-----------------------------------------*/
let UPDATE_INTERVAL = 1500; // Default 1.5 seconds
let updateIntervalId = null;
let tradeIntervalId = null;
let geminiTradesIntervalId = null; // NEW: for auto-polling Gemini trades

// Function to update model values
function updateModels() {
  const now = Date.now();
  const updates = [];

  MODELS.forEach(m => {
    const state = modelState[m.id];
    const prev = state.accountValue;

    // Random walk: add a small random change scaled by volatility
    const change = (Math.random() * 2 - 1) * state.volatility * 50;
    let updated = prev + change;

    // Keep value positive
    if (updated < 100) updated = 100;

    // Round to integer (no decimals)
    const intValue = Math.round(updated);

    // Store latest
    state.accountValue = intValue;

    // Store history
    modelHistory[m.id].push({
      time: now,
      accountValue: intValue
    });

    if (modelHistory[m.id].length > MAX_HISTORY) {
      modelHistory[m.id].shift();
    }

    console.log("MODEL VALUE", m.id, intValue);

    updates.push({
      id: m.id,
      name: m.name,
      color: m.color,
      accountValue: intValue,
      time: now
    });
  });

  // Send to all clients
  io.emit("models_update", updates);
}

// Function to update crypto prices
function updateCryptoPrices() {
  const now = Date.now();
  const updates = {};

  CRYPTO_SYMBOLS.forEach(c => {
    const prev = cryptoPrices[c.symbol];

    // Random walk for crypto prices
    const change = (Math.random() * 2 - 1) * prev * c.volatility;
    let updated = prev + change;

    // Keep price positive and reasonable
    if (updated < prev * 0.5) updated = prev * 0.5;
    if (updated > prev * 1.5) updated = prev * 1.5;

    // Round to 2 decimals
    const newPrice = Math.round(updated * 100) / 100;

    // Store latest
    cryptoPrices[c.symbol] = newPrice;

    // Store history
    cryptoHistory[c.symbol].push({
      time: now,
      price: newPrice
    });

    if (cryptoHistory[c.symbol].length > MAX_HISTORY) {
      cryptoHistory[c.symbol].shift();
    }

    console.log("CRYPTO PRICE", c.symbol, newPrice);

    updates[c.symbol] = newPrice;
  });

  // Send to all clients
  io.emit("crypto_update", {
    latest: updates,
    time: now
  });
}

// Function to start the update interval
function startUpdateInterval() {
  if (updateIntervalId) {
    clearInterval(updateIntervalId);
  }
  
  updateIntervalId = setInterval(() => {
    updateModels();
    updateCryptoPrices();
  }, UPDATE_INTERVAL);
  
  console.log(`Update interval set to ${UPDATE_INTERVAL}ms`);
}

// Function to start auto-trade generation (every 5-10 seconds per model)
function startTradeGeneration() {
  if (tradeIntervalId) {
    clearInterval(tradeIntervalId);
  }

  tradeIntervalId = setInterval(() => {
    // Randomly pick a model to generate a trade
    const randomModel = MODELS[Math.floor(Math.random() * MODELS.length)];
    generateTrade(randomModel.id, randomModel.name);
  }, 7000); // Generate a trade every 7 seconds

  console.log("✅ Auto-trade generation started");
}

// NEW: Function to auto-poll Gemini market trades and broadcast via WebSocket
// NEW: Function to auto-poll Gemini market trades and broadcast via WebSocket
function startGeminiTradesPolling() {
  if (geminiTradesIntervalId) {
    clearInterval(geminiTradesIntervalId);
  }

  geminiTradesIntervalId = setInterval(async () => {
    // ✅ Poll all three symbols
    const symbols = ['btcusd', 'ethusd', 'solusd'];
    
    for (const symbol of symbols) {
      try {
        await axios.get('http://localhost:3001/api/gemini/market-trades', {
          params: { symbol, limit: 20 },
          timeout: 10000,
        });
        console.log(`🔄 Auto-polled Gemini market trades (${symbol})`);
      } catch (e) {
        console.error(`❌ Failed to poll Gemini trades for ${symbol}:`, e.message);
      }
    }
  }, 5000); // Poll every 5 seconds

  console.log("✅ Gemini market trades auto-polling started for BTC, ETH, SOL (every 5s)");
}

/* ----------------------------------------
   API ENDPOINT: GET LAST 20 TRADES
-----------------------------------------*/
app.get("/api/trades", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT * FROM trades ORDER BY timestamp DESC LIMIT 20`
    );
    res.json(rows);
  } catch (error) {
    console.error("Error fetching trades:", error.message);
    res.status(500).json({ error: "Failed to fetch trades" });
  }
});

/* ----------------------------------------
   API ENDPOINT: GET GEMINI BALANCES
-----------------------------------------*/
/*app.post("/api/gemini/balances", async (req, res) => {
  try {
    console.log("📥 Received request body:", req.body);
    const { apiKey, apiSecret } = req.body;

    // Validate input
    if (!apiKey || !apiSecret) {
      return res.status(400).json({ 
        success: false, 
        error: "API Key and API Secret are required" 
      });
    }

    console.log("🔗 Connecting to Gemini API for balances...");
    
    // Call Gemini API
    const balances = await geminiRequest(apiKey, apiSecret, "/v1/balances");
    console.log("🔍 Raw Gemini balances:", JSON.stringify(balances, null, 2)); // <-- add this
    console.log("✅ Gemini API response received");

    // Calculate total USD value and organize balances
    let totalUsd = 0;
    const balanceData = {
      btc: 0,
      eth: 0,
      usdc: 0,
      sol: 0,
      other: []
    };

    // Get current crypto prices for USD conversion
    const btcPrice = cryptoPrices["BTCUSDT"] || 95000;
    const ethPrice = cryptoPrices["ETHUSDT"] || 3500;
    const solPrice = cryptoPrices["SOLUSDT"] || 180;

    balances.forEach(balance => {
      const currency = balance.currency.toLowerCase();
      const amount = parseFloat(balance.available) || 0;

      if (amount > 0) {
        switch(currency) {
          case "btc":
            balanceData.btc = amount;
            totalUsd += amount * btcPrice;
            break;
          case "eth":
            balanceData.eth = amount;
            totalUsd += amount * ethPrice;
            break;
          case "sol":
            balanceData.sol = amount;
            totalUsd += amount * solPrice;
            break;
          case "usdc":
          case "usd":
          case "gusd":
            balanceData.usdc += amount;
            totalUsd += amount;
            break;
          default:
            balanceData.other.push({
              currency: balance.currency,
              amount: amount
            });
        }
      }
    });

    balanceData.totalUsd = parseFloat(totalUsd.toFixed(2));

    console.log("💰 Processed balance data:", balanceData);

    res.json({
      success: true,
      balance: balanceData,
      message: "Successfully fetched Gemini balance"
    });

  } catch (error) {
    console.error("❌ Gemini connection error:", error.message);
    console.error("❌ Full error:", error.response?.data);  // ✅ ADD THIS LINE HERE   
  
    // Handle specific error cases
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      if (status === 400) {
        return res.status(400).json({
          success: false,
          error: "Invalid API credentials or malformed request"
        });
      } else if (status === 403) {
        return res.status(403).json({
          success: false,
          error: "Invalid API Key or Secret. Please check your credentials."
        });
      } else {
        return res.status(status).json({
          success: false,
          error: data.message || "Gemini API error"
        });
      }
    } else if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      return res.status(504).json({
        success: false,
        error: "Connection to Gemini timed out. Please try again."
      });
    } else {
      return res.status(500).json({
        success: false,
        error: "Failed to connect to Gemini. Please try again later."
      });
    }
  }
}); */

app.post("/api/gemini/balances", async (req, res) => {
  try {
    console.log("📥 Received request body:", req.body);
    //const { apiKey, apiSecret } = req.body;
    const { apiKey, apiSecret, env = 'live' } = req.body; // ✅ env from frontend

    // Validate input
    if (!apiKey || !apiSecret) {
      return res.status(400).json({ 
        success: false, 
        error: "API Key and API Secret are required" 
      });
    }

    //console.log("🔗 Connecting to Gemini API for balances...");
    console.log("🔗 Connecting to Gemini API for balances...", { env });
    
    // Call Gemini API
    //const balances = await geminiRequest(apiKey, apiSecret, "/v1/balances");
    const balances = await geminiRequest(apiKey, apiSecret, "/v1/balances", { env });

    console.log("✅ Gemini API response received");
    console.log("🔍 Raw Gemini balances:", JSON.stringify(balances, null, 2));

    // ✅ Get REAL prices from Gemini
    /*const [btcPrice, ethPrice, solPrice] = await Promise.all([
      getGeminiPrice("btcusd"),
      getGeminiPrice("ethusd"),
      getGeminiPrice("solusd")
    ]); */

    const [
        btcPrice, ethPrice, solPrice,
        xrpPrice, avaxPrice, linkPrice, daiPrice, ampPrice,
        shibPrice, atomPrice, dogePrice, polPrice, rndrPrice,
        hntPrice, dotPrice, ftmPrice, skyPrice
      ] = await Promise.all([
        getGeminiPrice("btcusd", env),
        getGeminiPrice("ethusd", env),
        getGeminiPrice("solusd", env),
        getGeminiPrice("xrpusd", env),
        getGeminiPrice("avaxusd", env),
        getGeminiPrice("linkusd", env),
        getGeminiPrice("daiusd", env),
        getGeminiPrice("ampusd", env),
        getGeminiPrice("shibusd", env),
        getGeminiPrice("atomusd", env),
        getGeminiPrice("dogeusd", env),
        getGeminiPrice("polusd", env),
        getGeminiPrice("rndrusd", env),
        getGeminiPrice("hntusd", env),
        getGeminiPrice("dotusd", env),
        getGeminiPrice("ftmusd", env),
        getGeminiPrice("skyusd", env)
      ]);

    //console.log("💵 Real Gemini prices:", { btcPrice, ethPrice, solPrice });

    console.log("💵 Real Gemini prices:", {
      btcPrice, ethPrice, solPrice,
      xrpPrice, avaxPrice, linkPrice, daiPrice, ampPrice,
      shibPrice, atomPrice, dogePrice, polPrice, rndrPrice,
      hntPrice, dotPrice, ftmPrice, skyPrice
    });

    // Calculate total USD value and organize balances
    let totalUsd = 0;
    const balanceData = {
      btc: 0,
      eth: 0,
      usdc: 0,
      sol: 0,
      other: []
    };

    balances.forEach(balance => {
      const currency = balance.currency.toLowerCase();
      const amount = parseFloat(balance.available) || 0;

      if (amount <= 0) return;

      /*if (amount > 0) {
        switch(currency) {
          case "btc":
            balanceData.btc = amount;
            if (btcPrice) totalUsd += amount * btcPrice;
            break;
          case "eth":
            balanceData.eth = amount;
            if (ethPrice) totalUsd += amount * ethPrice;
            break;
          case "sol":
            balanceData.sol = amount;
            if (solPrice) totalUsd += amount * solPrice;
            break;
          case "usdc":
          case "usd":
          case "gusd":
            balanceData.usdc += amount;
            totalUsd += amount;
            break;
          default:
            balanceData.other.push({
              currency: balance.currency,
              amount: amount
            });
        }
      }*/

      switch (currency) {
          case "btc":
            balanceData.btc = amount;
            if (btcPrice) totalUsd += amount * btcPrice;
            break;
          case "eth":
            balanceData.eth = amount;
            if (ethPrice) totalUsd += amount * ethPrice;
            break;
          case "sol":
            balanceData.sol = amount;
            if (solPrice) totalUsd += amount * solPrice;
            break;
          case "xrp":
            if (xrpPrice) totalUsd += amount * xrpPrice;
            break;
          case "avax":
            if (avaxPrice) totalUsd += amount * avaxPrice;
            break;
          case "link":
            if (linkPrice) totalUsd += amount * linkPrice;
            break;
          case "dai":
            if (daiPrice) totalUsd += amount * daiPrice;
            break;
          case "amp":
            if (ampPrice) totalUsd += amount * ampPrice;
            break;
          case "shib":
            if (shibPrice) totalUsd += amount * shibPrice;
            break;
          case "atom":
            if (atomPrice) totalUsd += amount * atomPrice;
            break;
          case "doge":
            if (dogePrice) totalUsd += amount * dogePrice;
            break;
          case "pol": // Polygon in your screenshot
            if (polPrice) totalUsd += amount * polPrice;
            break;
          case "rndr":
            if (rndrPrice) totalUsd += amount * rndrPrice;
            break;
          case "hnt":
            if (hntPrice) totalUsd += amount * hntPrice;
            break;
          case "dot":
            if (dotPrice) totalUsd += amount * dotPrice;
            break;
          case "ftm":
            if (ftmPrice) totalUsd += amount * ftmPrice;
            break;
          case "sky":
            if (skyPrice) totalUsd += amount * skyPrice;
            break;
          case "usdc":
          case "usd":
          case "gusd":
            balanceData.usdc += amount;
            totalUsd += amount;      // cash added 1:1
            break;

          default:
            // Keep for display, but also try to value later if you wish
            balanceData.other.push({
              currency: balance.currency,
              amount: amount
            });
        }
    });

    balanceData.totalUsd = parseFloat(totalUsd.toFixed(2));

    console.log("💰 Processed balance data:", balanceData);

    res.json({
      success: true,
      balance: balanceData,
      message: "Successfully fetched Gemini balance"
    });

  } catch (error) {
    console.error("❌ Gemini connection error:", error.message);
    console.error("❌ Full error:", error.response?.data);
    
    // Handle specific error cases
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      if (status === 400) {
        return res.status(400).json({
          success: false,
          error: "Invalid API credentials or malformed request"
        });
      } else if (status === 403) {
        return res.status(403).json({
          success: false,
          error: "Invalid API Key or Secret. Please check your credentials."
        });
      } else {
        return res.status(status).json({
          success: false,
          error: data.message || "Gemini API error"
        });
      }
    } else if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      return res.status(504).json({
        success: false,
        error: "Connection to Gemini timed out. Please try again."
      });
    } else {
      return res.status(500).json({
        success: false,
        error: "Failed to connect to Gemini. Please try again later."
      });
    }
  }
});

/* ----------------------------------------
   API ENDPOINT: GET GEMINI MARKET TRADES
   (NOW WITH WEBSOCKET BROADCAST)
-----------------------------------------*/
app.get("/api/gemini/market-trades", async (req, res) => {
  try {
    //const { symbol = 'btcusd', limit = 20 } = req.query;
    const { symbol = 'btcusd', limit = 20, env = 'live' } = req.query;

    console.log(`🔗 Fetching market trades for ${symbol}...`);

    // Public endpoint - no authentication required
    /*const response = await axios.get(
      `https://api.gemini.com/v1/trades/${symbol}`,
      {
        params: { limit_trades: limit },
        timeout: 10000
      }
    );*/

    const baseUrl =
      env === 'sandbox'
        ? 'https://api.sandbox.gemini.com'
        : 'https://api.gemini.com';

    const response = await axios.get(
      `${baseUrl}/v1/trades/${symbol}`,
      { params: { limit_trades: limit }, timeout: 10000 }
    );

    const trades = response.data || [];
    console.log(`✅ Fetched ${trades.length} market trades`);

    // --- NEW: update cache ---
    const symbolKey = symbol.toLowerCase();
    geminiMarketTradesCache[symbolKey] = trades.slice(0, limit);

    // --- NEW: broadcast to all connected clients over WebSocket ---
    io.emit('gemini_market_trades', {
      symbol: symbolKey,
      trades: geminiMarketTradesCache[symbolKey],
    });

    // existing HTTP response
    res.json({
      success: true,
      trades,
      symbol
    });

  } catch (error) {
    console.error("❌ Error fetching market trades:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to fetch market trades"
    });
  }
});

/* ----------------------------------------
   API ENDPOINT: PLACE GEMINI ORDER
-----------------------------------------*/
/*app.post("/api/gemini/order", async (req, res) => {
  try {
    const { apiKey, apiSecret, symbol, side, amount, price, type = 'exchange limit' } = req.body;

    // Validate input
    if (!apiKey || !apiSecret) {
      return res.status(400).json({
        success: false,
        error: "API Key and API Secret are required"
      });
    }

    if (!symbol || !side || !amount) {
      return res.status(400).json({
        success: false,
        error: "Symbol, side (buy/sell), and amount are required"
      });
    }

    // Validate side
    if (side !== 'buy' && side !== 'sell') {
      return res.status(400).json({
        success: false,
        error: "Side must be 'buy' or 'sell'"
      });
    }

    // Validate amount
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return res.status(400).json({
        success: false,
        error: "Amount must be a positive number"
      });
    }

    // Validate price for limit orders
    if (type.includes('limit')) {
      const priceNum = parseFloat(price);
      if (!price || isNaN(priceNum) || priceNum <= 0) {
        return res.status(400).json({
          success: false,
          error: "Price is required for limit orders and must be a positive number"
        });
      }
    }

    console.log(`🔗 Placing ${side} order: ${amount} ${symbol} @ $${price}...`);

    // Prepare order payload
    const orderPayload = {
      symbol: symbol.toLowerCase(),
      amount: amount.toString(),
      price: price.toString(),
      side: side.toLowerCase(),
      type: type,
      options: ['maker-or-cancel'] // Prevents immediate execution, safer for testing
      // NOTE: account is added inside geminiRequest for /v1/order/new
    };

    // Call Gemini API to place order
    const order = await geminiRequest(apiKey, apiSecret, "/v1/order/new", orderPayload);

    console.log("✅ Order placed successfully:", order.order_id);

    res.json({
      success: true,
      order: {
        order_id: order.order_id,
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        price: order.price,
        amount: order.original_amount,
        remaining: order.remaining_amount,
        executed: order.executed_amount,
        timestamp: order.timestamp
      },
      message: "Order placed successfully"
    });

  } catch (error) {
    console.error("❌ Error placing order:", error.message);
    console.error("❌ Full error:", error.response?.data || error);

    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      return res.status(status).json({
        success: false,
        error: data.message || data.reason || "Failed to place order",
        details: data
      });
    } else {
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to place order"
      });
    }
  }
}); */

app.post("/api/gemini/order", async (req, res) => {
  try {
    // LOG 1: raw body
    console.log('📥 /api/gemini/order RAW body:', req.body);

    const {
      apiKey,
      apiSecret,
      symbol,
      side,
      amount,
      price,
      type = 'exchange limit',
      modelId,
      modelName,
      closePosition,
      env = 'live',
    } = req.body;

    const isClosing = (closePosition === true || closePosition === 'true');

    // LOG 2: parsed fields
    console.log('📥 /api/gemini/order parsed:', {
      apiKey: apiKey ? '[provided]' : '[missing]',
      apiSecret: apiSecret ? '[provided]' : '[missing]',
      symbol,
      side,
      amount,
      price,
      type,
      modelId,
      modelName,
      closePosition,
      isClosing,
      env,
    });

    // Validate input
    if (!apiKey || !apiSecret) {
      console.error('❌ Validation failed: Missing API credentials');
      return res.status(400).json({
        success: false,
        error: "API Key and API Secret are required"
      });
    }

    if (!symbol || !side || !amount) {
      console.error('❌ Validation failed: Missing required fields', { symbol, side, amount });
      return res.status(400).json({
        success: false,
        error: "Symbol, side (buy/sell), and amount are required"
      });
    }

    // Validate side
    if (!['buy', 'sell'].includes(side.toLowerCase())) {
      console.error('❌ Validation failed: Invalid side', { side });
      return res.status(400).json({
        success: false,
        error: "Side must be 'buy' or 'sell'"
      });
    }

    // Validate amount
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      console.error('❌ Validation failed: Invalid amount', { amount, amountNum });
      return res.status(400).json({
        success: false,
        error: "Amount must be a positive number"
      });
    }

    // ✅ NEW: Check if model already has an open position for this symbol (when NOT closing)
    if (!isClosing && modelId && hasOpenPosition(modelId, symbol)) {
      const existingPos = liveGeminiPositions[livePosKey(modelId, symbol)];
      console.warn(`⚠️ ${modelName} already has an open ${existingPos.side} position for ${symbol.toUpperCase()}`);
      return res.status(400).json({
        success: false,
        error: `${modelName} already has an open position for ${symbol.toUpperCase()}`,
        reason: 'duplicate_position',
        details: {
          existingPosition: existingPos
        }
      });
    }

    // ✅ Check minimum order size BEFORE calling Gemini
    console.log('🔍 Validating order amount:', { symbol, amount });
    const validation = validateOrderAmount(symbol, amount);
    console.log('🔍 Validation result:', validation);

    if (!validation.valid) {
      console.warn(`⚠️ Order rejected: ${validation.error}`);
      return res.status(400).json({
        success: false,
        error: validation.error,
        reason: 'amount_below_minimum',
        details: {
          symbol: symbol.toUpperCase(),
          attempted: validation.attempted,
          minimum: validation.minRequired,
        }
      });
    }

    // ✅ Validate price for limit orders (ONLY when opening)
    if (!isClosing && type.includes('limit')) {
      const priceNum = parseFloat(price);
      if (!price || isNaN(priceNum) || priceNum <= 0) {
        console.error('❌ Validation failed: Invalid price for limit order', { price, priceNum });
        return res.status(400).json({
          success: false,
          error: "Price is required for limit orders and must be a positive number"
        });
      }
    }

    console.log(
      `🔗 [${env.toUpperCase()}] Placing ${side} order: ${amount} ${symbol} @ $${price} (model: ${
        modelName || 'N/A'
      }, close=${isClosing})`
    );

    // ✅ Prepare order payload (Gemini fields)
    const orderPayload = {
      symbol: symbol.toLowerCase(),
      amount: amount.toString(),
      side: side.toLowerCase(),
    };

    // ✅ CLOSING: Use IOC LIMIT to simulate market (Gemini rejects exchange market for you)
    if (isClosing) {
      const t = await getGeminiTicker(symbol, env);

      const isSell = side.toLowerCase() === 'sell'; // sell closes LONG, buy closes SHORT
      const basePx = isSell ? (t.bid || t.last) : (t.ask || t.last);

      if (!basePx || basePx <= 0) {
        throw new Error(`No valid ticker price for ${symbol} (${env})`);
      }

      // Nudge price so it fills immediately like a market order:
      // SELL => below bid; BUY => above ask.
      const px = isSell ? basePx * 0.97 : basePx * 1.03;

      orderPayload.type = 'exchange limit';
      orderPayload.price = toUsdPrice2(px);

      // ✅ IOC ONLY when closing
      orderPayload.options = ['immediate-or-cancel'];

      console.log(
        `🔻 Using IOC LIMIT to close position (${isSell ? 'SELL' : 'BUY'}) @ ${orderPayload.price} (bid=${t.bid}, ask=${t.ask}, last=${t.last})`
      );
    } else {
      // ✅ OPENING: Use limit order WITHOUT IOC (prevents "IOC canceled" emails on opens)
      orderPayload.type = type || 'exchange limit';

      if (orderPayload.type.includes('limit')) {
        const numericPrice = Number(price);

        if (!numericPrice || numericPrice <= 0) {
          throw new Error(`Price is required for limit orders and must be positive (got: ${price})`);
        }

        orderPayload.price = numericPrice.toString();

        // ❌ IMPORTANT: do NOT set orderPayload.options = ['immediate-or-cancel'] here
        console.log(`🔺 Using LIMIT order to open position (NO IOC) (price: ${numericPrice})`);
      }
    }

    console.log('📤 Sending to Gemini:', orderPayload);

    // Call Gemini API to place order
    const order = await geminiRequest(apiKey, apiSecret, "/v1/order/new", {
      ...orderPayload,
      env,
    });

    console.log(`✅ [${env.toUpperCase()}] Order placed:`, {
      order_id: order.order_id,
      symbol: order.symbol,
      side: order.side,
      executed: order.executed_amount,
      is_live: order.is_live,
    });

    // ====== POSITION OPEN / CLOSE LOGIC ======

    // ✅ When we BUY and NOT closing => open LONG position
    if (side.toLowerCase() === 'buy' && !isClosing && modelId && modelName) {
      const executed = parseFloat(order.executed_amount || '0');
      const isLive = !!order.is_live;

      console.log('📋 Buy (open LONG) order execution status:', {
        order_id: order.order_id,
        is_live: isLive,
        executed_amount: executed,
        original_amount: order.original_amount,
        avg_execution_price: order.avg_execution_price,
      });

      if (!isLive && executed > 0) {
        const actualPrice = parseFloat(order.avg_execution_price || order.price || price);
        openLiveGeminiPosition({
          modelId,
          modelName,
          symbol,
          amount: executed,
          price: actualPrice,
          side: 'LONG',
        });
        console.log(`✅ LONG position opened: ${modelName} ${symbol}, amount: ${executed}, price: ${actualPrice}`);
      } else {
        console.warn(
          `⚠️ Buy order for ${symbol} not filled (is_live=${isLive}, executed=${executed}). LONG position NOT opened.`
        );
      }
    }

    // ✅ When we SELL and NOT closing => open SHORT position
    if (side.toLowerCase() === 'sell' && !isClosing && modelId && modelName) {
      const executed = parseFloat(order.executed_amount || '0');
      const isLive = !!order.is_live;

      console.log('📋 Sell (open SHORT) order execution status:', {
        order_id: order.order_id,
        is_live: isLive,
        executed_amount: executed,
        original_amount: order.original_amount,
        avg_execution_price: order.avg_execution_price,
      });

      if (!isLive && executed > 0) {
        const actualPrice = parseFloat(order.avg_execution_price || order.price || price);
        openLiveGeminiPosition({
          modelId,
          modelName,
          symbol,
          amount: executed,
          price: actualPrice,
          side: 'SHORT',
        });
        console.log(`✅ SHORT position opened: ${modelName} ${symbol}, amount: ${executed}, price: ${actualPrice}`);
      } else {
        console.warn(
          `⚠️ Sell order for ${symbol} not filled (is_live=${isLive}, executed=${executed}). SHORT position NOT opened.`
        );
      }
    }

    // ✅ When closing => close live position + log P&L
    let closingInfo = null;
    if (isClosing && modelId && modelName) {
      const executed = parseFloat(order.executed_amount || '0');
      const isLive = !!order.is_live;

      console.log('📋 Close position order execution status:', {
        order_id: order.order_id,
        is_live: isLive,
        executed_amount: executed,
        original_amount: order.original_amount,
        avg_execution_price: order.avg_execution_price || order.price,
        side_used_to_close: side.toLowerCase(),
      });

      if (!isLive && executed > 0) {
        const qtyForPnl = executed;
        const exitPrice = parseFloat(order.avg_execution_price || order.price || price);

        closingInfo = await closeLiveGeminiPositionAndRecord({
          modelId,
          modelName,
          symbol,
          amount: qtyForPnl,
          exitPrice: exitPrice,
        });

        console.log(
          `✅ Position closed and recorded: ${modelName} ${symbol}, ` +
          `qty=${qtyForPnl}, exit=${exitPrice}, P&L: ${closingInfo?.pnl ?? 'N/A'}`
        );
      } else {
        console.warn(
          `⚠️ Close order for ${symbol} not filled yet (is_live=${isLive}, executed=${executed}). ` +
          `Position NOT marked as closed.`
        );
      }
    }

    // ====== END POSITION OPEN / CLOSE LOGIC ======

    // ✅ Return detailed order response
    res.json({
      success: true,
      order: {
        order_id: order.order_id,
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        price: order.price,
        avg_execution_price: order.avg_execution_price,
        amount: order.original_amount,
        remaining: order.remaining_amount,
        executed: order.executed_amount,
        is_live: order.is_live,
        timestamp: order.timestamp
      },
      positionClose: closingInfo,
      message: "Order placed successfully"
    });

  } catch (error) {
    console.error('❌ /api/gemini/order UNCAUGHT ERROR:', error);
    console.error(`❌ [${req.body?.env?.toUpperCase() || 'LIVE'}] Error placing order:`, error.message);

    const geminiError = error.response?.data;
    console.error("❌ Full Gemini error:", geminiError);

    if (error.response) {
      const status = error.response.status;
      const data = error.response.data || {};

      let userFriendlyError = data.message || data.reason || "Failed to place order";
      let errorReason = data.reason || 'unknown';

      if (data.reason === 'InsufficientFunds') {
        userFriendlyError = `Insufficient funds to place this order. Please check your ${req.body.symbol?.toUpperCase()} balance.`;
      } else if (data.reason === 'InvalidQuantity' || data.message?.includes('below minimum')) {
        userFriendlyError = `Order amount is below Gemini's minimum for ${req.body.symbol?.toUpperCase()}`;
        errorReason = 'amount_below_minimum';
      } else if (data.reason === 'InvalidSignature') {
        userFriendlyError = 'Invalid API credentials. Please reconnect your Gemini account.';
      } else if (data.reason === 'InvalidPrice' || data.message?.includes('price')) {
        userFriendlyError = `Invalid price for ${req.body.symbol?.toUpperCase()}: ${data.message || 'Price must be positive'}`;
        errorReason = 'invalid_price';
      }

      return res.status(status).json({
        success: false,
        error: userFriendlyError,
        reason: errorReason,
        details: data,
        geminiReason: data.reason,
        geminiMessage: data.message,
      });
    } else {
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to place order",
        reason: 'network_error',
      });
    }
  }
});

  /*   console.log("✅ [LIVE] Order placed on Gemini:", order.order_id);

    // When we BUY and the order is linked to a model => open live position
    if (side.toLowerCase() === 'buy' && modelId && modelName) {
      openLiveGeminiPosition({
        modelId,
        modelName,
        symbol,
        amount,
        price,
      });
    }

    // When we SELL with closePosition=true => close live position + log P&L
    let closingInfo = null;
    if (side.toLowerCase() === 'sell' && closePosition && modelId && modelName) {
      closingInfo = await closeLiveGeminiPositionAndRecord({
        modelId,
        modelName,
        symbol,
        amount,
        exitPrice: price,
      });
    }

    res.json({
      success: true,
      order: {
        order_id: order.order_id,
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        price: order.price,
        amount: order.original_amount,
        remaining: order.remaining_amount,
        executed: order.executed_amount,
        timestamp: order.timestamp
      },
      positionClose: closingInfo,
      message: "Order placed successfully"
    });

  } catch (error) {
    console.error("❌ [LIVE] Error placing Gemini order:", error.message);
    console.error("❌ [LIVE] Full error:", error.response?.data || error);

    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      return res.status(status).json({
        success: false,
        error: data.message || data.reason || "Failed to place order",
        details: data
      });
    } else {
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to place order"
      });
    }
  }
});*/

/* ----------------------------------------
   SEND SNAPSHOT ON CONNECT
-----------------------------------------*/
io.on("connection", socket => {
  console.log("Client connected:", socket.id);

  // Send models snapshot
  const modelsSnapshot = MODELS.map(m => ({
    id: m.id,
    name: m.name,
    color: m.color,
    accountValue: modelState[m.id].accountValue,
    history: modelHistory[m.id]
  }));

  socket.emit("models_snapshot", modelsSnapshot);

  // Send crypto prices snapshot
  const cryptoSnapshot = {
    latest: cryptoPrices,
    history: cryptoHistory,
    time: Date.now()
  };

  socket.emit("crypto_snapshot", cryptoSnapshot);

  // ✅ Send last known Gemini trades snapshot for ALL symbols
  ['btcusd', 'ethusd', 'solusd'].forEach(symbol => {
    const trades = geminiMarketTradesCache[symbol] || [];
    if (trades.length > 0) {
      socket.emit('gemini_market_trades', {
        symbol,
        trades,
      });
    }
  });

  // Handle update speed changes from client
  socket.on("setUpdateSpeed", (newSpeed) => {
    console.log(`Update speed changed to: ${newSpeed}ms`);
    UPDATE_INTERVAL = newSpeed;
    startUpdateInterval();
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

/* ----------------------------------------
   START SERVER
-----------------------------------------*/
async function startServer() {
  await initDatabase();
  
  // Start the update intervals
  startUpdateInterval();
  //startTradeGeneration();
  startGeminiTradesPolling(); // NEW: auto-poll Gemini trades every 5s

  server.listen(3001, () => {
    console.log("🚀 Backend running on port 3001");
    console.log("📊 Models initialized:", MODELS.map(m => m.name).join(", "));
    console.log("💰 Crypto prices initialized:", CRYPTO_SYMBOLS.map(c => `${c.symbol}: $${c.startPrice}`).join(", "));
    console.log("💎 Gemini API endpoints ready");
    console.log("🔄 Gemini market trades WebSocket broadcasting enabled");
  });
}

startServer();