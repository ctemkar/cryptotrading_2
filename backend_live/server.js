// backend/server.js
console.log('##########################################');
console.log('##   SERVER STARTING - VERSION: 5.0     ##');
console.log('##   TIMESTAMP: ' + new Date().toISOString() + '  ##');
console.log('##########################################');
require('dotenv').config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const mysql = require("mysql2/promise");
const crypto = require("crypto");
const axios = require("axios");

const app = express();

const activeTradeIntervals = new Map();

// ========================================
// 1. MIDDLEWARE (FIRST)
// ========================================
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

/* ----------------------------------------
   SOCKET TRACKING FOR BROADCAST EXCLUSION
-----------------------------------------*/
const socketsById = new Map(); // Track all connected sockets by socket.id
const userSockets = new Map(); // Track userId -> Set of socket.id

const PORT = process.env.PORT ? Number(process.env.PORT) : 3002;
const BACKEND_HOST = '127.0.0.1';
const BACKEND_BASE = `http://${BACKEND_HOST}:${PORT}`;

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
        user_id VARCHAR(255),
        model_id VARCHAR(50) NOT NULL,
        model_name VARCHAR(100) NOT NULL,
        action ENUM('BUY', 'SELL') NOT NULL,
        crypto_symbol VARCHAR(20) NOT NULL,
        crypto_price DECIMAL(15, 2) NOT NULL,
        quantity DECIMAL(15, 4) NOT NULL,
        total_value DECIMAL(15, 2) NOT NULL,
        timestamp BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_timestamp (timestamp DESC)
      )
    `);

    // Create user_app_state table
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_app_state (
        user_id VARCHAR(255) PRIMARY KEY,
        state_json LONGTEXT NOT NULL,
        version INT DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Create user_trading_session table
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_trading_session (
        user_id VARCHAR(255) PRIMARY KEY,
        is_active TINYINT(1) DEFAULT 0,
        started_at TIMESTAMP NULL,
        session_json TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Create trade_logs_archive table
    await db.query(`
      CREATE TABLE IF NOT EXISTS trade_logs_archive (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        session_id VARCHAR(255),
        message TEXT NOT NULL,
        type VARCHAR(50),
        metadata JSON,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_session (user_id, session_id),
        INDEX idx_timestamp (timestamp)
      )
    `);

    // Create user_gemini_credentials table
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_gemini_credentials (
        user_id VARCHAR(255) PRIMARY KEY,
        api_key VARCHAR(255) NOT NULL,
        api_secret_enc TEXT NOT NULL,
        iv VARCHAR(255) NOT NULL,
        auth_tag VARCHAR(255) NOT NULL,
        env VARCHAR(20) DEFAULT 'live',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create gemini_open_positions table
    await db.query(`
      CREATE TABLE IF NOT EXISTS gemini_open_positions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        model_id VARCHAR(100),
        model_name VARCHAR(100),
        symbol VARCHAR(20) NOT NULL,
        side VARCHAR(10) NOT NULL,
        amount VARCHAR(50) NOT NULL,
        entry_price VARCHAR(50),
        opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_model (user_id, model_id)
      )
    `);

    console.log("✅ MySQL connected and all tables ready");
  } catch (error) {
    console.error("❌ MySQL connection failed:", error.message);
    process.exit(1);
  }
}

/* ------------------------------
   GEMINI MARKET TRADES CACHE
--------------------------------*/
const geminiMarketTradesCache = {
  btcusd: [],
  ethusd: [],
  solusd: []
};

// ========================================
// ENCRYPTION SETUP
// ========================================
const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY || '', 'base64');

if (ENCRYPTION_KEY.length !== 32) {
  console.error('❌ ENCRYPTION_KEY must be 32 bytes (base64 encoded)');
  process.exit(1);
}

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  let enc = cipher.update(text, 'utf8', 'hex');
  enc += cipher.final('hex');
  return { enc, iv: iv.toString('hex'), authTag: cipher.getAuthTag().toString('hex') };
}

function decrypt(enc, iv, authTag) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  let str = decipher.update(enc, 'hex', 'utf8');
  str += decipher.final('utf8');
  return str;
}

/* ------------------------------
   GEMINI API HELPER FUNCTIONS
--------------------------------*/

/**
 * Normalize symbol to Gemini format (btcusd, ethusd, solusd)
 */
function normalizeSymbolForGemini(symbol) {
  if (!symbol) return 'btcusd';
  
  const cleaned = symbol.toLowerCase().replace(/[^a-z]/g, '');

  // Remove 'T' suffix from USDT variants
  const normalized = cleaned.replace(/usdt$/i, 'usd');

  // Validate against supported symbols
  const supported = ['btcusd', 'ethusd', 'solusd'];
  if (supported.includes(normalized)) {
    return normalized;
  }
  
  // Map common variants to Gemini format
  // Fallback: try to match by prefix
  if (normalized.includes('btc')) return 'btcusd';
  if (normalized.includes('eth')) return 'ethusd';
  if (normalized.includes('sol')) return 'solusd';
  
  return 'btcusd'; // default
  
}

async function geminiRequest(apiKey, apiSecret, path, payload = {}) {
  const env = payload.env === 'sandbox' ? 'sandbox' : 'live';

  const baseUrl =
    env === 'sandbox'
      ? 'https://api.sandbox.gemini.com'
      : 'https://api.gemini.com';

  const { env: _ignoreEnv, ...restPayload } = payload;

  const url = baseUrl + path;
  const nonce = Date.now().toString();

  const requestPayload = {
    request: path,
    nonce: Date.now().toString(),
};

// Only copy specific allowed fields to avoid sending 'env' or other junk to Gemini
if (payload.symbol) requestPayload.symbol = payload.symbol;
if (payload.amount) requestPayload.amount = payload.amount;
if (payload.price) requestPayload.price = payload.price;
if (payload.side) requestPayload.side = payload.side;
if (payload.type) requestPayload.type = payload.type;
if (payload.client_order_id) requestPayload.client_order_id = payload.client_order_id;
if (payload.options) requestPayload.options = payload.options;

// Keep the account logic for balances
if (path === '/v1/balances' || path === '/v1/order/new') {
    requestPayload.account = payload.account || 'primary';
}
  //if (path === '/v1/order/new') {
  //  requestPayload.account = requestPayload.account || 'primary';
  //}

  const encodedPayload = Buffer.from(JSON.stringify(requestPayload)).toString('base64');

  const signature = crypto
    .createHmac('sha384', apiSecret)
    .update(encodedPayload)
    .digest('hex');

  const headers = {
    //'Content-Type': 'text/plain',
    'Content-Length': '0',
    'X-GEMINI-APIKEY': apiKey,
    'X-GEMINI-PAYLOAD': encodedPayload,
    'X-GEMINI-SIGNATURE': signature,
    'Cache-Control': 'no-cache',
  };

  console.log('🔍 Gemini request', { path, env, requestPayload });

  //const response = await axios.post(url, {}, { headers, timeout: 10000 });
  const response = await axios.post(url, null, { headers, timeout: 10000 });
  return response.data;
}

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
  return (Math.round(Number(n) * 100) / 100).toFixed(2);
}

/* -----------------------------------------
   LIVE GEMINI POSITION TRACKING (IN-MEMORY)
------------------------------------------*/
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
    side: side.toUpperCase(),
    amount: parseFloat(amount),
    entryPrice: parseFloat(price),
    openedAt: Date.now(),
  };
  console.log('📌 [LIVE] Opened Gemini position:', liveGeminiPositions[key]);

  io.emit('position_opened', {
    ...liveGeminiPositions[key],
  });
}

// ✅ Added userId to the parameters
async function closeLiveGeminiPositionAndRecord({
  userId,
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

  let pnl;
  if (pos.side === 'LONG') {
    pnl = (exit - entryPrice) * qtyExecuted;
  } else if (pos.side === 'SHORT') {
    pnl = (entryPrice - exit) * qtyExecuted;
  } else {
    pnl = 0;
  }

  // ✅ NEW: Calculate P&L percentage
  const pnlPercent = entryPrice > 0
    ? ((pnl / (entryPrice * qtyExecuted)) * 100).toFixed(2)
    : '0.00';

  const timestamp = Date.now();
  const totalValue = (exit * qtyExecuted).toFixed(2);
  const closingAction = pos.side === 'LONG' ? 'SELL' : 'BUY';

  // ✅ UPDATED: INSERT now includes pnl and pnl_percent
  // Make sure you've run this on your DB first:
  // ALTER TABLE trades ADD COLUMN pnl DECIMAL(15,2), ADD COLUMN pnl_percent DECIMAL(10,2);
  await db.query(
    `INSERT INTO trades (user_id, model_id, model_name, action, crypto_symbol, crypto_price, quantity, total_value, timestamp, pnl, pnl_percent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, modelId, modelName, closingAction, symbol.toUpperCase(), exit, qtyExecuted, totalValue, timestamp, pnl.toFixed(2), pnlPercent]
  );

  const remaining = pos.amount - qtyExecuted;

  if (remaining <= 0.00000001) {
    delete liveGeminiPositions[key];
    console.log(
      `✅ [LIVE] Fully closed ${pos.side} position for ${modelName} on ${symbol}: entry ${entryPrice}, exit ${exit}, qty ${qtyExecuted}, P&L = ${pnl.toFixed(2)} (${pnlPercent}%)`
    );
  } else {
    liveGeminiPositions[key].amount = remaining;
    console.log(
      `✅ [LIVE] Partially closed ${pos.side} position for ${modelName} on ${symbol}: entry ${entryPrice}, exit ${exit}, closed qty ${qtyExecuted}, remaining qty ${remaining}, P&L on closed = ${pnl.toFixed(2)} (${pnlPercent}%)`
    );
  }

  // ✅ UPDATED: Single emit with pnl and pnl_percent included
  io.to(`user:${userId}`).emit('gemini_transaction', {
    user_id: userId,
    model_id: modelId,
    model_name: modelName,
    action: closingAction,
    crypto_symbol: symbol.toUpperCase(),
    crypto_price: exit,
    quantity: qtyExecuted,
    total_value: totalValue,
    pnl: pnl.toFixed(2),
    pnl_percent: pnlPercent,
    timestamp,
  });

  // ✅ UPDATED: position_closed also includes pnl_percent
  io.emit('position_closed', {
    model_id: modelId,
    model_name: modelName,
    symbol: symbol.toUpperCase(),
    side: pos.side,
    entryPrice,
    exitPrice: exit,
    quantity: qtyExecuted,
    pnl,
    pnl_percent: pnlPercent,
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
    pnl_percent: pnlPercent,
    timestamp,
  };
}

/* ------------------------------
   MODELS INITIAL STATE
--------------------------------*/
const MODELS = [
  { id: "gemini-3-pro", name: "Gemini-3-pro", color: "#1f77b4", volatility: 0.5 },
  { id: "qwen-3-next", name: "Qwen3-Next", color: "#ff7f0e", volatility: 0.3 },
  { id: "gpt-5.2", name: "GPT-5.2", color: "#2ca02c", volatility: 0.7 },
  { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", color: "#d62728", volatility: 0.4 },
  { id: "mystery-model", name: "Mystery Model", color: "#9467bd", volatility: 1.0 },
  { id: "deepseek", name: "DeepSeek-V3.2-Speciale", color: "#8e24aa", volatility: 0.6 },
  { id: "grok", name: "Grok", color: "#ff9800", volatility: 0.7 }
];

const STARTING_VALUE = 100;
const MAX_HISTORY = 200;

let modelState = {};
let modelHistory = {};

MODELS.forEach(m => {
  modelState[m.id] = {
    id: m.id,
    name: m.name,
    color: m.color,
    accountValue: STARTING_VALUE,   // ✅ constant, safe at boot
    initialValue: STARTING_VALUE,   // ✅ constant, safe at boot
    volatility: m.volatility
  };
  modelHistory[m.id] = [{ time: Date.now(), accountValue: STARTING_VALUE }];
});

/* ------------------------------
   CRYPTO PRICES INITIAL STATE
--------------------------------*/
const CRYPTO_SYMBOLS = [
  { symbol: "BTCUSD", name: "Bitcoin", startPrice: 95000, volatility: 0.002 },
  { symbol: "ETHUSD", name: "Ethereum", startPrice: 3500, volatility: 0.003 },
  { symbol: "SOLUSD", name: "Solana", startPrice: 180, volatility: 0.004 }
];

let cryptoPrices = {};
let cryptoHistory = {};

CRYPTO_SYMBOLS.forEach(c => {
  cryptoPrices[c.symbol] = c.startPrice;
  cryptoHistory[c.symbol] = [{ time: Date.now(), price: c.startPrice }];
});

/* ----------------------------------------
   AUTO-GENERATE TRADES (SIMPLE STRATEGY)
-----------------------------------------*/
async function executeRealGeminiTrade(userId, modelId, modelName, symbol, action, amountUSD) {
  try {
    console.log(`🚀 [REAL TRADE] ${modelName} is executing ${action} on ${symbol}`);

    // 1. Get Keys
    const [rows] = await db.query('SELECT api_key, api_secret_enc, iv, auth_tag FROM user_gemini_credentials WHERE user_id = ?', [userId]);
    if (!rows.length) throw new Error("No API keys found for user");

    const apiSecret = decrypt(rows[0].api_secret_enc, rows[0].iv, rows[0].auth_tag);
    const price = await getGeminiPrice(symbol, 'live');
    const quantity = (amountUSD / price).toFixed(6);
    const totalValue = (price * parseFloat(quantity)).toFixed(2);

    // 2. ✅ CHECK BALANCE BEFORE PLACING ORDER
    const balances = await geminiRequest(rows[0].api_key, apiSecret, '/v1/balances', { env: 'live' });

    const cryptoCurrency = symbol.replace('USD', ''); // e.g. 'BTC' from 'BTCUSD'
    const usdBalance = parseFloat(balances.find(b => b.currency === 'USD')?.available || '0');
    const cryptoBalance = parseFloat(balances.find(b => b.currency === cryptoCurrency)?.available || '0');

    console.log(`💰 Balances — USD: $${usdBalance} | ${cryptoCurrency}: ${cryptoBalance}`);

    // Auto-switch if insufficient balance
    let finalAction = action.toUpperCase();
    if (finalAction === 'SELL' && cryptoBalance < parseFloat(quantity)) {
      console.log(`⚠️ Not enough ${cryptoCurrency} to SELL (have: ${cryptoBalance}, need: ${quantity}). Switching to BUY.`);
      finalAction = 'BUY';
    }
    if (finalAction === 'BUY' && usdBalance < parseFloat(totalValue)) {
      console.log(`⚠️ Not enough USD to BUY (have: $${usdBalance}, need: $${totalValue}). Switching to SELL.`);
      finalAction = 'SELL';
    }

    // 3. Double-check after switch — if STILL can't afford either side, abort
    if (finalAction === 'SELL' && cryptoBalance < parseFloat(quantity)) {
      throw new Error(`Insufficient funds: Cannot SELL ${quantity} ${cryptoCurrency} (balance: ${cryptoBalance})`);
    }
    if (finalAction === 'BUY' && usdBalance < parseFloat(totalValue)) {
      throw new Error(`Insufficient funds: Cannot BUY $${totalValue} worth of ${cryptoCurrency} (balance: $${usdBalance})`);
    }

    // 4. Marketable Limit Order
    const limitPrice = finalAction === 'BUY'
      ? (price * 1.005).toFixed(2)
      : (price * 0.995).toFixed(2);

    const orderPayload = {
      symbol: symbol.toLowerCase(),
      amount: quantity.toString(),
      side: finalAction.toLowerCase(),
      type: 'exchange limit',
      price: limitPrice,
      client_order_id: `live_${modelId}_${Date.now()}`
    };

    console.log('📤 Sending to Gemini API...');
    const geminiResponse = await geminiRequest(rows[0].api_key, apiSecret, '/v1/order/new', { ...orderPayload, env: 'live' });

    // 5. ✅ IMMEDIATELY PUSH TO FRONTEND (Before DB write!)
    // 5. Extract ACTUAL execution price from Gemini response
    const actualPrice = parseFloat(geminiResponse.avg_execution_price) || parseFloat(geminiResponse.price) || price;
    const actualQty = parseFloat(geminiResponse.executed_amount) || parseFloat(quantity);
    const actualTotal = (actualPrice * actualQty).toFixed(2);
    const timestamp = Date.now();

    console.log(`💰 Actual fill price: $${actualPrice} (requested: $${price})`);

    if (io) {
      io.to(`user:${userId}`).emit('gemini_transaction', {
        user_id: userId,
        model_id: modelId,
        model_name: modelName,
        action: finalAction,
        crypto_symbol: symbol.toUpperCase(),
        crypto_price: actualPrice,   // ✅ ACTUAL price
        quantity: actualQty,
        total_value: actualTotal,
        timestamp,
      });

      io.to(`user:${userId}`).emit('log_entry', {
        message: `💎 Gemini Trade Confirmed: ${finalAction} ${symbol.toUpperCase()} @ $${actualPrice.toFixed(2)}`,
        type: 'success',
        time: timestamp
      });
    }

    // 6. SAVE TO DB with ACTUAL price
    db.query(
      `INSERT INTO trades (user_id, model_id, model_name, action, crypto_symbol, crypto_price, quantity, total_value, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, modelId, modelName, finalAction, symbol.toUpperCase(), actualPrice, actualQty, actualTotal, timestamp]
    ).catch(dbErr => {
      console.error('❌ DB Insert Failed:', dbErr.message);
    });

    console.log(`✅ [DONE] ${modelName} ${finalAction} ${symbol} @ $${actualPrice} | Qty: ${actualQty}`);
    return geminiResponse;
  } catch (err) {
    console.error('❌ REAL TRADE FAILED:', err.message);

    // Notify frontend of failure
    if (io) {
      io.to(`user:${userId}`).emit('log_entry', {
        message: `❌ Trade Failed for ${modelName}: ${err.message}`,
        type: 'error',
        time: Date.now()
      });
    }

    throw err;
  }
}

async function generateTrade(userId, modelId, modelName, symbol) {
  try {
    // 1. Get Real Price
    const price = await getGeminiPrice(symbol, 'live');
    const action = Math.random() > 0.5 ? 'BUY' : 'SELL';
    const quantity = (Math.random() * 0.01).toFixed(6);
    const totalValue = (price * quantity).toFixed(2);

    console.log(`🤖 [STRATEGY] ${modelName} decided to ${action} ${symbol}`);

    // 2. GET KEYS FOR REAL TRADE
    const [rows] = await db.query('SELECT api_key, api_secret_enc, iv, auth_tag FROM user_gemini_credentials WHERE user_id = ?', [userId]);

    if (rows.length === 0) {
      console.warn(`⚠️ No credentials found for user ${userId}`);
      return null;
    }

    const apiSecret = decrypt(rows[0].api_secret_enc, rows[0].iv, rows[0].auth_tag);

    // 3. CHECK BALANCE BEFORE PLACING ORDER
    const balances = await geminiRequest(rows[0].api_key, apiSecret, '/v1/balances', { env: 'live' });

    const cryptoCurrency = symbol.replace('USD', ''); // e.g. 'BTC' from 'BTCUSD'
    const usdBalance = parseFloat(balances.find(b => b.currency === 'USD')?.available || '0');
    const cryptoBalance = parseFloat(balances.find(b => b.currency === cryptoCurrency)?.available || '0');

    // Auto-switch action if insufficient balance
    let finalAction = action;
    if (action === 'SELL' && cryptoBalance < parseFloat(quantity)) {
      console.log(`⚠️ Not enough ${cryptoCurrency} to SELL. Switching to BUY.`);
      finalAction = 'BUY';
    }
    if (action === 'BUY' && usdBalance < parseFloat(totalValue)) {
      console.log(`⚠️ Not enough USD to BUY. Switching to SELL.`);
      finalAction = 'SELL';
    }

    const finalLimitPrice = finalAction === 'BUY'
      ? (price * 1.005).toFixed(2)
      : (price * 0.995).toFixed(2);

    const orderPayload = {
      symbol: symbol.toLowerCase(),
      amount: quantity.toString(),
      side: finalAction.toLowerCase(),
      type: 'exchange limit',
      price: finalLimitPrice,
      client_order_id: `live_${modelId}_${Date.now()}`
    };

    // 4. PLACE REAL ORDER
    console.log('📤 [AUTOMATED] Sending Real Order to Gemini...');
    await geminiRequest(rows[0].api_key, apiSecret, '/v1/order/new', { ...orderPayload, env: 'live' });

    // 5. ✅ IMMEDIATELY PUSH TO FRONTEND VIA SOCKET (Before DB write!)
  // 5. ✅ Extract ACTUAL execution price from Gemini response
    const actualPrice = parseFloat(order?.avg_execution_price) || parseFloat(order?.price) || price;
    const actualQty = parseFloat(order?.executed_amount) || parseFloat(quantity);
    const actualTotal = (actualPrice * actualQty).toFixed(2);
    const timestamp = Date.now();

    console.log(`💰 Actual fill price: $${actualPrice} (requested: $${price})`);

    if (io) {
      // Update the transactions table instantly
      io.to(`user:${userId}`).emit('gemini_transaction', {
        model_name: modelName,
        action: finalAction,
        crypto_symbol: symbol,
        crypto_price: actualPrice,       // ✅ actual fill price
        quantity: actualQty,
        total_value: actualTotal,
        timestamp: timestamp
      });

      // Update the log panel instantly
      io.to(`user:${userId}`).emit('log_entry', {
        message: `💎 Gemini Trade Confirmed: ${finalAction} ${symbol} @ $${actualPrice.toFixed(2)}`,
        type: 'success',
        time: timestamp
      });
    }

    // 6. SAVE TO DB IN BACKGROUND (Non-blocking — UI already updated above)
    db.query(
      `INSERT INTO trades (user_id, model_id, model_name, action, crypto_symbol, crypto_price, quantity, total_value, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, modelId, modelName, finalAction, symbol.toUpperCase(), actualPrice, actualQty, actualTotal, timestamp]
    ).catch(dbErr => {
      console.error('❌ DB Insert Failed (trade already executed on Gemini):', dbErr.message);
    });

    console.log(`✅ [DONE] ${modelName} ${finalAction} ${symbol} @ $${actualPrice} | Qty: ${actualQty}`);
    return { modelName, action: finalAction, symbol, price: actualPrice, quantity: actualQty, timestamp };

  } catch (error) {
    console.error('❌ Automated Trade Failed:', error.message);

    // Notify frontend of failure too
    if (io) {
      io.to(`user:${userId}`).emit('log_entry', {
        message: `❌ Trade Failed for ${modelName}: ${error.message}`,
        type: 'error',
        time: Date.now()
      });
    }

    return null;
  }
}
/* ----------------------------------------
   CONFIGURABLE UPDATE INTERVAL
-----------------------------------------*/
let UPDATE_INTERVAL = 1500;
let updateIntervalId = null;
let tradeIntervalId = null;
let geminiTradesIntervalId = null;

function updateModels() { 
  const now = Date.now();
  const updates = [];

  MODELS.forEach(m => {
    const state = modelState[m.id];
    const prev = state.accountValue;

    const change = (Math.random() * 2 - 1) * state.volatility * 50;
    let updated = prev + change;

    if (updated < 1) updated = 1;

    const intValue = Math.round(updated);

    state.accountValue = intValue;

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
      initialValue: state.initialValue,   // ✅ ADD THIS
      time: now
    });
  });

  io.emit("models_update", updates);
}

function updateCryptoPrices() {
  const now = Date.now();
  const updates = {};

  CRYPTO_SYMBOLS.forEach(c => {
    const prev = cryptoPrices[c.symbol];

    const change = (Math.random() * 2 - 1) * prev * c.volatility;
    let updated = prev + change;

    if (updated < prev * 0.5) updated = prev * 0.5;
    if (updated > prev * 1.5) updated = prev * 1.5;

    const newPrice = Math.round(updated * 100) / 100;

    cryptoPrices[c.symbol] = newPrice;

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

  io.emit("crypto_update", {
    latest: updates,
    time: now
  });
}

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

/*function startTradeGeneration() {
  if (tradeIntervalId) {
    clearInterval(tradeIntervalId);
  }

  tradeIntervalId = setInterval(() => {
    const randomModel = MODELS[Math.floor(Math.random() * MODELS.length)];
    generateTrade(randomModel.id, randomModel.name);
  }, 7000);

  console.log("✅ Auto-trade generation started");
} */

/*function startTradeGeneration() {
  if (tradeIntervalId) {
    clearInterval(tradeIntervalId);
  }

  // YOUR ACTUAL USER ID FROM THE LOGS
  const MY_USER_ID = '114079031009411052320'; 

  tradeIntervalId = setInterval(async () => {
    const randomModel = MODELS[Math.floor(Math.random() * MODELS.length)];
    const symbols = ['BTCUSD', 'ETHUSD', 'SOLUSD'];
    const randomSymbol = symbols[Math.floor(Math.random() * symbols.length)];

    console.log(`🎲 [SCHEDULER] Triggering trade for ${randomModel.name} on ${randomSymbol}`);
    
    // FIX: Pass the User ID first!
    await generateTrade(MY_USER_ID, randomModel.id, randomModel.name, randomSymbol);
    
  }, 30000); // I changed this to 30 seconds so you don't get banned by Gemini for spamming

  console.log("✅ Real Gemini Auto-trade generation started for User:", MY_USER_ID);
} */

function startTradeGenerationForUser(userId) {
  // Clear existing interval for this user if already running
  if (activeTradeIntervals.has(userId)) {
    clearInterval(activeTradeIntervals.get(userId));
  }

  const intervalId = setInterval(async () => {
    try {
      const randomModel = MODELS[Math.floor(Math.random() * MODELS.length)];
      const symbols = ['BTCUSD', 'ETHUSD', 'SOLUSD'];
      const randomSymbol = symbols[Math.floor(Math.random() * symbols.length)];

      console.log(`🎲 [SCHEDULER] ${userId} → ${randomModel.name} → ${randomSymbol}`);

      await generateTrade(userId, randomModel.id, randomModel.name, randomSymbol);
    } catch (err) {
      console.error(`❌ Scheduler error for user ${userId}:`, err.message);
    }
  }, 30000);

  activeTradeIntervals.set(userId, intervalId);
  console.log(`✅ Auto-trade scheduler started for user: ${userId}`);
}

function stopTradeGenerationForUser(userId) {
  if (activeTradeIntervals.has(userId)) {
    clearInterval(activeTradeIntervals.get(userId));
    activeTradeIntervals.delete(userId);
    console.log(`🛑 Scheduler stopped for user: ${userId}`);
  }
}  

function startGeminiTradesPolling() {
  if (geminiTradesIntervalId) {
    clearInterval(geminiTradesIntervalId);
  }

  const symbols = ['btcusd', 'ethusd', 'solusd'];
  const POLL_INTERVAL = 5000;

  geminiTradesIntervalId = setInterval(async () => {
    for (const symbol of symbols) {
      try {
        const env = 'live'; // change if you want sandboxable behavior
        const baseUrl = env === 'sandbox' ? 'https://api.sandbox.gemini.com' : 'https://api.gemini.com';
        const url = `${baseUrl}/v1/trades/${symbol}`;

        const response = await axios.get(url, { params: { limit_trades: 20 }, timeout: 10000 });
        const trades = Array.isArray(response.data) ? response.data : [];
        geminiMarketTradesCache[symbol] = trades.slice(0, 20);

        // Emit to sockets once we have new data
        io.emit('gemini_market_trades', {
          symbol,
          trades: geminiMarketTradesCache[symbol]
        });

        console.log(`🔄 Auto-polled Gemini market trades (${symbol}) — fetched ${trades.length}`);
      } catch (e) {
        // Log full error context but don't kill the loop
        console.error(`❌ Failed to poll Gemini trades for ${symbol}:`, {
          message: e.message,
          status: e.response?.status,
          responseData: e.response?.data,
          code: e.code
        });
        // keep previous cache (if any). UI will receive cached results via /api/gemini/market-trades fallback
      }
    }
  }, POLL_INTERVAL);

  console.log(`✅ Gemini market trades auto-polling started for ${symbols.join(', ')} (every ${POLL_INTERVAL}ms)`);
}

// ========================================
// 2. API ROUTES (BEFORE STATIC FILES)
// ========================================

app.post("/api/auth/google", async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, error: "Missing token" });
    }

    // Verify token with Google
    const response = await axios.get(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${token}`,
      { timeout: 8000 }
    );

    // tokeninfo returns fields like: sub, email, name, picture, aud, iss, exp, etc.
    return res.json({
      success: true,
      user: {
        sub: response.data.sub,
        email: response.data.email,
        name: response.data.name,
        picture: response.data.picture,
      },
    });
  } catch (error) {
    const data = error.response?.data;
    console.error("❌ Google token verification failed:", data || error.message);

    return res.status(401).json({
      success: false,
      error: "Invalid token",
      details: data || error.message,
    });
  }
});

// APP STATE ENDPOINTS
app.get('/api/app-state', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ success: false, error: 'Missing userId' });

    const [rows] = await db.query(
      'SELECT state_json, version FROM user_app_state WHERE user_id = ?',
      [userId]
    );

    if (!rows.length) {
      const defaultState = {
        selectedModels: [],
        startingValue: "100",
        stopLoss: "",
        profitTarget: "",
        isTrading: false,
        tradingStopped: false,
        stopReason: "",
        finalProfitLoss: null,
        initialValues: {},
        updateSpeed: "1500",
        isMockTrading: true
      };
      return res.json({ success: true, state: defaultState, version: 0 });
    }

    // ✅ FIX: state_json is stored as a JSON string, parse it before returning
    let parsedState;
    try {
      parsedState = JSON.parse(rows[0].state_json);
    } catch (e) {
      console.error(`❌ Failed to parse state_json for user ${userId}`, e);
      parsedState = null;
    }

    if (!parsedState || typeof parsedState !== 'object') {
      // fallback to default so UI doesn't get nuked
      parsedState = {
        selectedModels: [],
        startingValue: "100",
        stopLoss: "",
        profitTarget: "",
        isTrading: false,
        tradingStopped: false,
        stopReason: "",
        finalProfitLoss: null,
        initialValues: {},
        updateSpeed: "1500",
        isMockTrading: true
      };
    }

    return res.json({ success: true, state: parsedState, version: rows[0].version });
  } catch (err) {
    console.error('❌ Error fetching app state:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch app state' });
  }
});

app.put('/api/app-state', async (req, res) => {
  try {
    const { userId, state, socketId, version } = req.body;

    if (!userId || state == null) {
      return res.status(400).json({ success: false, error: 'Missing userId or state' });
    }

    // ✅ FIX 2: Ensure state is an object (not a JSON string)
    let finalState = state;
    if (typeof finalState === 'string') {
      try {
        finalState = JSON.parse(finalState);
      } catch (e) {
        return res.status(400).json({
          success: false,
          error: 'state must be a valid JSON object (received string but failed to parse)',
        });
      }
    }

    // Optional hard guard: if it’s still not an object, reject
    if (typeof finalState !== 'object' || Array.isArray(finalState)) {
      return res.status(400).json({
        success: false,
        error: 'state must be an object',
      });
    }

    const clientVersion = version || 0;

    const [rows] = await db.query(
      'SELECT version FROM user_app_state WHERE user_id = ?',
      [userId]
    );

    let currentVersion = 0;
    if (rows.length > 0) {
      currentVersion = rows[0].version;
    }

    if (clientVersion < currentVersion) {
      console.warn(
        `⚠️ Stale state update rejected for user ${userId} (client v${clientVersion}, server v${currentVersion})`
      );
      return res.status(409).json({
        success: false,
        error: 'Stale state version',
        currentVersion,
      });
    }

    const newVersion = currentVersion + 1;

    await db.query(
      'INSERT INTO user_app_state (user_id, state_json, version) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE state_json = ?, version = ?',
      [userId, JSON.stringify(finalState), newVersion, JSON.stringify(finalState), newVersion]
    );

    if (socketId && socketsById.has(socketId)) {
      const senderSocket = socketsById.get(socketId);
      senderSocket.to(`user:${userId}`).emit('app_state_sync', { state: finalState, version: newVersion });
    } else {
      io.to(`user:${userId}`).emit('app_state_sync', { state: finalState, version: newVersion });
    }

    if (finalState.isTrading && finalState.initialValues) {
      const startValue = parseFloat(finalState.startingValue) || 100;

      console.log(`🚀 Trading started for user ${userId}. Resetting all models to $${startValue}`);

      io.to(`user:${userId}`).emit('models_reset', {
        initialValues: finalState.initialValues,
        startingValue: startValue,
        sessionId: finalState.tradingSession?.sessionId,
        startTime: finalState.tradingSession?.startTime,
        entryPrices: finalState.tradingSession?.entryPrices || {}
      });

      MODELS.forEach(m => {
        modelState[m.id].accountValue = startValue;
        modelState[m.id].initialValue = startValue;   // ✅ ADD THIS
        modelHistory[m.id] = [{ time: Date.now(), accountValue: startValue }];
      });

      console.log(`✅ Backend modelState reset to $${startValue} for user ${userId}`);
    }

    res.json({ success: true, version: newVersion });
  } catch (err) {
    console.error('❌ Error saving app state:', err);
    return res.status(500).json({ success: false, error: 'Failed to save app state' });
  }
});

// --- Gemini Trading Start Route ---
// PUT/REPLACE this whole route in backend/server.js
// DEBUG helper: paste temporarily into backend/server.js replacing the existing /api/gemini/start-trading handler
app.post('/api/gemini/start-trading', async (req, res) => {
  try {
    const {
      userId,
      modelId,
      modelName,
      startValue,
      stopLoss,
      profitTarget,
      isMockTrading = true
    } = req.body;

    if (!userId || !modelId || !modelName) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const now = Date.now();

    // ✅ Step 2: capture REAL Gemini start balance (only for real trading)
    let startBalanceUsd = null;
    let geminiEnv = 'live';

    if (!isMockTrading) {
      try {
        const [credRows] = await db.query(
          'SELECT api_key, api_secret_enc, iv, auth_tag, env FROM user_gemini_credentials WHERE user_id = ?',
          [userId]
        );

        if (credRows.length) {
          const cred = credRows[0];
          geminiEnv = cred.env || 'live';

          const apiSecret = decrypt(cred.api_secret_enc, cred.iv, cred.auth_tag);

          // Gemini balances = list of currencies with amounts
          const balances = await geminiRequest(
            cred.api_key,
            apiSecret,
            '/v1/balances',
            { env: geminiEnv }
          );

          const stable = new Set(['usd', 'usdc', 'gusd']);

          // Build list of non-stable currencies we actually hold
          const heldCurrencies = Array.from(
            new Set(
              (balances || [])
                .map(b => (b.currency || '').toLowerCase())
                .filter(c => c && !stable.has(c))
            )
          );

          // Fetch USD prices for each held currency in parallel: e.g. btc -> btcusd
          const priceMap = {};
          await Promise.all(
            heldCurrencies.map(async (cur) => {
              try {
                const symbol = `${cur}usd`; // gemini symbols look like "btcusd"
                const px = await getGeminiPrice(symbol, geminiEnv);
                if (typeof px === 'number' && Number.isFinite(px)) priceMap[cur] = px;
              } catch (e) {
                // If Gemini doesn't have curusd or request fails, skip
              }
            })
          );

          // Compute total equity in USD (this will match portfolio-style math way closer)
          let totalUsd = 0;
          for (const b of (balances || [])) {
            const cur = (b.currency || '').toLowerCase();
            // Prefer total "amount" (equity) if present; fallback to available
            const amt = parseFloat(b.amount ?? b.available ?? 0);

            if (!cur || !Number.isFinite(amt) || amt <= 0) continue;

            if (stable.has(cur)) {
              totalUsd += amt;
            } else {
              const px = priceMap[cur];
              if (typeof px === 'number' && Number.isFinite(px)) {
                totalUsd += amt * px;
              }
            }
          }

          startBalanceUsd = parseFloat(totalUsd.toFixed(2));
        } else {
          // No creds on file — real trading will likely fail later, but don't hard-crash start
          startBalanceUsd = null;
        }
      } catch (balErr) {
        console.error('⚠️ Failed to capture Gemini start balance:', balErr.message);
        startBalanceUsd = null;
      }
    }

    const sessionJson = JSON.stringify({
      modelId,
      modelName,
      startValue,
      stopLoss,
      profitTarget,
      isMockTrading,
      startedAt: now,
      geminiEnv,
      startBalanceUsd
    });

    // Update session
    // NOTE: If you've added `start_balance_usd` column, this will store it.
    // If you haven't, it will gracefully fallback to your old schema.
    try {
      await db.query(
        `INSERT INTO user_trading_session (user_id, is_active, started_at, session_json, start_balance_usd, updated_at)
         VALUES (?, 1, NOW(), ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           is_active = 1,
           started_at = NOW(),
           session_json = ?,
           start_balance_usd = ?,
           updated_at = NOW()`,
        [userId, sessionJson, startBalanceUsd, sessionJson, startBalanceUsd]
      );
    } catch (e) {
      // Fallback if column doesn't exist yet
      if (e && e.code === 'ER_BAD_FIELD_ERROR') {
        await db.query(
          `INSERT INTO user_trading_session (user_id, is_active, started_at, session_json, updated_at)
           VALUES (?, 1, NOW(), ?, NOW())
           ON DUPLICATE KEY UPDATE
             is_active = 1,
             started_at = NOW(),
             session_json = ?,
             updated_at = NOW()`,
          [userId, sessionJson, sessionJson]
        );
      } else {
        throw e;
      }
    }

    // Log start
    await db.query(
      'INSERT INTO trade_logs_archive (user_id, message, type, metadata, timestamp) VALUES (?, ?, ?, ?, NOW())',
      [
        userId,
        !isMockTrading
          ? `Started trading (REAL): ${modelName}${startBalanceUsd != null ? ` | Start Equity: $${startBalanceUsd}` : ''}`
          : `Started trading (MOCK): ${modelName}`,
        'info',
        sessionJson
      ]
    );

    // ✅ Mock Trade Logic should only run in mock mode
    if (isMockTrading) {
      const side = Math.random() > 0.5 ? 'BUY' : 'SELL';
      const entryPrice = cryptoPrices['BTCUSD'] || 50000;
      const quantity = (parseFloat(startValue) / entryPrice).toFixed(6);

      await db.query(
        `INSERT INTO trades (user_id, model_id, model_name, action, crypto_symbol, crypto_price, quantity, total_value, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, modelId, modelName, side, 'BTCUSD', entryPrice, quantity, startValue, now]
      );

      if (io) {
        io.to(`user:${userId}`).emit('log_entry', {
          message: `Model ${modelName} executed ${side} @ ${entryPrice}`,
          type: 'trade',
          time: now
        });
      }
    }

    // ✅ Start REAL per-user Gemini scheduler (only if NOT mock trading)
    if (!isMockTrading) {
      startTradeGenerationForUser(userId);
      console.log(`🚀 Real Gemini scheduler started for user: ${userId}`);
    } else {
      console.log(`🧪 Mock trading mode — scheduler not started for user: ${userId}`);
    }

    return res.json({
      success: true,
      message: 'Trading started',
      startBalanceUsd
    });
  } catch (err) {
    console.error('ERROR:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/gemini/session-pnl', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ success: false, error: 'Missing userId' });

    // 1. Get session start balance
    const [sessionRows] = await db.query(
      'SELECT start_balance_usd, started_at FROM user_trading_session WHERE user_id = ?',
      [userId]
    );

    const startBalanceUsd = sessionRows[0]?.start_balance_usd ?? null;
    const sessionStartedAt = sessionRows[0]?.started_at ?? null;

    // 2. Get realized P/L from closed trades (SELL actions with pnl recorded)
    const [closedTrades] = await db.query(
      `SELECT SUM(pnl) as total_realized_pnl, COUNT(*) as trade_count
       FROM trades 
       WHERE user_id = ? AND action = 'SELL' AND pnl IS NOT NULL
       AND created_at >= ?`,
      [userId, sessionStartedAt || new Date(0)]
    );

    const realizedPnl = parseFloat(closedTrades[0]?.total_realized_pnl || 0);

    // 3. Get current Gemini balance for unrealized P/L
    let currentBalanceUsd = null;
    let unrealizedPnl = null;
    let totalPnl = realizedPnl;

    try {
      const [credRows] = await db.query(
        'SELECT api_key, api_secret_enc, iv, auth_tag, env FROM user_gemini_credentials WHERE user_id = ?',
        [userId]
      );

      if (credRows.length && startBalanceUsd !== null) {
        const apiSecret = decrypt(credRows[0].api_secret_enc, credRows[0].iv, credRows[0].auth_tag);
        const balances = await geminiRequest(credRows[0].api_key, apiSecret, '/v1/balances', { env: credRows[0].env || 'live' });

        const [btcPrice, ethPrice, solPrice] = await Promise.all([
          getGeminiPrice('btcusd', credRows[0].env || 'live'),
          getGeminiPrice('ethusd', credRows[0].env || 'live'),
          getGeminiPrice('solusd', credRows[0].env || 'live'),
        ]);

        let totalUsd = 0;
        balances.forEach(b => {
          const amt = parseFloat(b.available || 0);
          if (amt <= 0) return;
          const cur = b.currency.toLowerCase();
          if (cur === 'usd' || cur === 'usdc' || cur === 'gusd') totalUsd += amt;
          else if (cur === 'btc' && btcPrice) totalUsd += amt * btcPrice;
          else if (cur === 'eth' && ethPrice) totalUsd += amt * ethPrice;
          else if (cur === 'sol' && solPrice) totalUsd += amt * solPrice;
        });

        currentBalanceUsd = parseFloat(totalUsd.toFixed(2));
        // ✅ THIS is the real P/L — matches Gemini exactly
        totalPnl = parseFloat((currentBalanceUsd - startBalanceUsd).toFixed(2));
        unrealizedPnl = parseFloat((totalPnl - realizedPnl).toFixed(2));
      }
    } catch (balErr) {
      console.error('⚠️ Failed to fetch current balance for P/L:', balErr.message);
    }

    return res.json({
      success: true,
      pnl: {
        startBalanceUsd,
        currentBalanceUsd,
        totalPnl,           // ✅ matches Gemini portfolio
        realizedPnl,        // from closed trades
        unrealizedPnl,      // from open positions (mark-to-market)
        tradeCount: parseInt(closedTrades[0]?.trade_count || 0),
        sessionStartedAt,
      }
    });
  } catch (err) {
    console.error('❌ /api/gemini/session-pnl error:', err);
    return res.status(500).json({ success: false, error: 'Failed to compute P/L' });
  }
});

app.post('/api/gemini/execute-strategy-trade', async (req, res) => {
  try {
    const { userId, modelId, modelName, symbol, action, amountUSD } = req.body;

    if (!userId || !modelId || !modelName || !symbol || !action) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    console.log(`🎯 [STRATEGY] ${modelName} wants to ${action} ${symbol}`);

    const result = await executeRealGeminiTrade(userId, modelId, modelName, symbol, action, amountUSD || 10);

    res.json({ success: true, order: result });
  } catch (err) {
    console.error('❌ Strategy Trade Failed:', err.response?.data || err.message);
    // Send the actual Gemini reason back to the frontend
    const errorMessage = err.response?.data?.message || err.message;
    res.status(500).json({ success: false, error: errorMessage });
  }
});

// TRADING SESSION ENDPOINTS
app.get('/api/trading-session', async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ success: false, error: 'Missing userId' });
  }

  try {
    const [rows] = await db.query(
      'SELECT is_active, started_at, session_json FROM user_trading_session WHERE user_id = ?',
      [userId]
    );

    if (rows.length === 0) {
      return res.json({ success: true, session: null });
    }

    const session = {
      isActive: rows[0].is_active === 1,
      startedAt: rows[0].started_at,
      ...JSON.parse(rows[0].session_json || '{}'),
    };

    console.log(`✅ Fetched trading session for user ${userId}`);
    res.json({ success: true, session });
  } catch (error) {
    console.error('❌ Error fetching trading session:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/trading-session', async (req, res) => {
  const { userId, isActive, sessionData } = req.body;

  if (!userId) {
    return res.status(400).json({ success: false, error: 'Missing userId' });
  }

  try {
    const sessionJson = JSON.stringify(sessionData || {});

    await db.query(
      `INSERT INTO user_trading_session (user_id, is_active, started_at, session_json, updated_at)
       VALUES (?, ?, NOW(), ?, NOW())
       ON DUPLICATE KEY UPDATE is_active = ?, session_json = ?, updated_at = NOW()`,
      [userId, isActive ? 1 : 0, sessionJson, isActive ? 1 : 0, sessionJson]
    );

    console.log(`✅ Saved trading session for user ${userId} (active: ${isActive})`);

    io.to(`user:${userId}`).emit('trading_session_sync', { isActive, sessionData });

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Error saving trading session:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// LOGS ARCHIVE ENDPOINTS
app.post('/api/logs/archive', async (req, res) => {
  try {
    const { userId, sessionId, message, type, metadata } = req.body;

    // ✅ Add validation
    if (!userId) {
      console.warn('⚠️ Log archive called without userId, skipping');
      return res.status(400).json({ success: false, error: 'Missing userId' });
    }

    if (!message) {
      console.warn('⚠️ Log archive called without message, skipping');
      return res.status(400).json({ success: false, error: 'Missing message' });
    }

    const metadataJson = JSON.stringify(metadata || {});

    // ✅ Check if db exists
    if (!db) {
      console.error('❌ Database not initialized');
      return res.status(500).json({ success: false, error: 'Database not ready' });
    }

    await db.query(
      'INSERT INTO trade_logs_archive (user_id, message, type, metadata, timestamp) VALUES (?, ?, ?, ?, NOW())',
      [userId, message, type || 'info', metadataJson]
    );

    console.log(`✅ Archived log for user ${userId}: ${message}`);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Archiving error:', err.message);
    console.error('❌ Full error:', err);

    // Don't crash - just log and return error
    res.status(500).json({
      success: false,
      error: 'Failed to archive log',
      details: err.message
    });
  }
});

app.post('/api/logs/archive', async (req, res) => {
  try {
    const { userId, sessionId, message, type, metadata } = req.body;
    if (!userId) return res.status(400).json({ success: false, error: 'Missing userId' });

    const metadataJson = JSON.stringify(metadata || {});

    await db.query(
      'INSERT INTO trade_logs_archive (user_id, message, type, metadata, timestamp) VALUES (?, ?, ?, ?, NOW())',
      [userId, message, type, metadataJson]
    );

    console.log(`✅ Archived log for user ${userId}`);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Archiving error:', err);
    res.status(500).json({ success: false, error: 'Failed to archive log' });
  }
});

app.get('/api/logs/archive', async (req, res) => {
  try {
    const { userId, limit = 100 } = req.query;
    let q = 'SELECT id, user_id, session_id, message, type, metadata, timestamp FROM trade_logs_archive';
    const params = [];
    if (userId) {
      q += ' WHERE user_id = ?';
      params.push(userId);
    }
    q += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(Number(limit));
    const [rows] = await db.query(q, params);
    return res.json({ success: true, logs: rows });
  } catch (err) {
    console.error('❌ Error fetching logs:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch logs' });
  }
});

// GEMINI CREDENTIALS ENDPOINTS
app.post('/api/gemini/credentials', async (req, res) => {
  try {
    const { userId, apiKey, apiSecret, env } = req.body;

    if (!userId || !apiKey || !apiSecret) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const { enc, iv, authTag } = encrypt(apiSecret);

    await db.query(
      `INSERT INTO user_gemini_credentials (user_id, api_key, api_secret_enc, iv, auth_tag, env) 
       VALUES (?, ?, ?, ?, ?, ?) 
       ON DUPLICATE KEY UPDATE 
         api_key = VALUES(api_key), 
         api_secret_enc = VALUES(api_secret_enc), 
         iv = VALUES(iv), 
         auth_tag = VALUES(auth_tag), 
         env = VALUES(env)`,
      [userId, apiKey, enc, iv, authTag, env || 'live']
    );

    console.log(`✅ Securely stored Gemini keys for: ${userId}`);
    return res.json({ success: true });
  } catch (err) {
    console.error('❌ DB Error saving credentials:', err);
    return res.status(500).json({ success: false, error: 'Database error Failed to save credentials' });
  }
});

app.get('/api/gemini/credentials/status', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ success: false, error: 'Missing userId' });

    const [rows] = await db.query('SELECT env FROM user_gemini_credentials WHERE user_id = ?', [userId]);

    return res.json({
      success: true,
      hasCredentials: rows.length > 0,
      env: rows[0]?.env || 'live'
    });
  } catch (err) {
    console.error('❌ Error checking credentials status:', err);
    return res.status(500).json({ success: false, error: 'Failed to check credentials' });
  }
});

app.delete('/api/gemini/credentials', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, error: 'Missing userId' });

    await db.query('DELETE FROM user_gemini_credentials WHERE user_id = ?', [userId]);

    console.log(`🗑️ Deleted Gemini credentials for user ${userId}`);
    return res.json({ success: true });
  } catch (err) {
    console.error('❌ Error deleting credentials:', err);
    return res.status(500).json({ success: false, error: 'Failed to delete credentials' });
  }
});

// TRADES ENDPOINT
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

// GEMINI BALANCES ENDPOINT
app.post("/api/gemini/balances", async (req, res) => {
  try {
    console.log("📥 Received request body:", req.body);

    const { userId, env = 'live' } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID is required"
      });
    }

    console.log("🔗 Fetching Gemini credentials for user:", userId);

    const [rows] = await db.query(
      'SELECT api_key, api_secret_enc, iv, auth_tag, env FROM user_gemini_credentials WHERE user_id = ?',
      [userId]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'No Gemini credentials found. Please connect your Gemini account first.'
      });
    }

    const { api_key, api_secret_enc, iv, auth_tag } = rows[0];
    const storedEnv = rows[0].env || 'live';

    let apiSecret;
    try {
      apiSecret = decrypt(api_secret_enc, iv, auth_tag);
    } catch (decryptError) {
      console.error('❌ Failed to decrypt API secret:', decryptError);
      return res.status(500).json({
        success: false,
        error: 'Failed to decrypt credentials. Please reconnect your Gemini account.'
      });
    }

    console.log("🔗 Connecting to Gemini API for balances...", { env: env || storedEnv });

    const balances = await geminiRequest(api_key, apiSecret, "/v1/balances", { env: env || storedEnv });

    console.log("✅ Gemini API response received");
    console.log("🔍 Raw Gemini balances:", JSON.stringify(balances, null, 2));

    const [
      btcPrice, ethPrice, solPrice,
      xrpPrice, avaxPrice, linkPrice, daiPrice, ampPrice,
      shibPrice, atomPrice, dogePrice, polPrice, rndrPrice,
      hntPrice, dotPrice, ftmPrice, skyPrice
    ] = await Promise.all([
      getGeminiPrice("btcusd", env || storedEnv),
      getGeminiPrice("ethusd", env || storedEnv),
      getGeminiPrice("solusd", env || storedEnv),
      getGeminiPrice("xrpusd", env || storedEnv),
      getGeminiPrice("avaxusd", env || storedEnv),
      getGeminiPrice("linkusd", env || storedEnv),
      getGeminiPrice("daiusd", env || storedEnv),
      getGeminiPrice("ampusd", env || storedEnv),
      getGeminiPrice("shibusd", env || storedEnv),
      getGeminiPrice("atomusd", env || storedEnv),
      getGeminiPrice("dogeusd", env || storedEnv),
      getGeminiPrice("polusd", env || storedEnv),
      getGeminiPrice("rndrusd", env || storedEnv),
      getGeminiPrice("hntusd", env || storedEnv),
      getGeminiPrice("dotusd", env || storedEnv),
      getGeminiPrice("ftmusd", env || storedEnv),
      getGeminiPrice("skyusd", env || storedEnv)
    ]);

    console.log("💵 Real Gemini prices:", {
      btcPrice, ethPrice, solPrice,
      xrpPrice, avaxPrice, linkPrice, daiPrice, ampPrice,
      shibPrice, atomPrice, dogePrice, polPrice, rndrPrice,
      hntPrice, dotPrice, ftmPrice, skyPrice
    });

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
        case "pol":
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
          totalUsd += amount;
          break;

        default:
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

// GEMINI MARKET TRADES ENDPOINT
// GEMINI MARKET TRADES ENDPOINT (robust normalization + cached fallback)
app.get("/api/gemini/market-trades", async (req, res) => {
  try {
    // Accept multiple possible query param names because frontends vary
    let symbolRaw = (req.query.symbol || req.query.t || req.query.pair || req.query.s || '').toString();
    let limitRaw = req.query.limit || req.query.limit_trades || req.query.l || '20';
    const env = (req.query.env || 'live').toString().toLowerCase();

    // Normalize inputs
    symbolRaw = symbolRaw.trim();
    let limit = Math.min(Math.max(parseInt(limitRaw, 10) || 20, 1), 200);

    // sanitize symbol: remove non-alphanum, lowercase
    const cleaned = symbolRaw.replace(/[^a-z0-9]/gi, '').toLowerCase();

    // map common variants -> gemini supported pair names
    // Gemini uses e.g. btcusd, ethusd, solusd (no trailing t for USDT)
    let symbol = cleaned;
    if (!symbol) {
      symbol = 'btcusd';
    } else {
      // convert usdt -> usd (common frontend sends BTCUSDT)
      symbol = symbol.replace(/usdt$/i, 'usd');
      // some frontends might send pairs like btc_usdt, btc-usd, etc. cleaned above
      // ensure we map usdc/usdt/usd variants consistently
      symbol = symbol.replace(/usd(c)?$/i, 'usd');
    }

    const allowed = new Set(['btcusd', 'ethusd', 'solusd']); // extend if needed

    // defensive: if symbol not in allowed, try a last-ditch mapping based on prefix
    if (!allowed.has(symbol)) {
      // try mapping by prefix (btc, eth, sol)
      if (symbol.startsWith('btc')) symbol = 'btcusd';
      else if (symbol.startsWith('eth')) symbol = 'ethusd';
      else if (symbol.startsWith('sol')) symbol = 'solusd';
    }

    if (!allowed.has(symbol)) {
      console.warn('Unsupported/invalid symbol requested for market-trades:', { original: symbolRaw, cleaned, mapped: symbol });
      return res.status(400).json({
        success: false,
        error: `Unsupported symbol: ${symbolRaw}`,
        normalized: symbol,
      });
    }

    console.log(`🔗 Fetching market trades for ${symbol} (limit=${limit}, env=${env})...`);

    const baseUrl = env === 'sandbox' ? 'https://api.sandbox.gemini.com' : 'https://api.gemini.com';
    const url = `${baseUrl}/v1/trades/${symbol}`;

    try {
      const response = await axios.get(url, { params: { limit_trades: limit }, timeout: 10000 });
      const trades = Array.isArray(response.data) ? response.data : [];
      geminiMarketTradesCache[symbol] = trades.slice(0, limit);

      // broadcast to sockets
      io.emit('gemini_market_trades', {
        symbol,
        trades: geminiMarketTradesCache[symbol],
      });

      console.log(`✅ Fetched ${trades.length} market trades for ${symbol}`);
      return res.json({ success: true, trades: geminiMarketTradesCache[symbol], symbol, isCached: false });
    } catch (err) {
      // log details for debugging
      console.error("❌ Error fetching market trades (external):", {
        message: err.message,
        status: err.response?.status,
        data: err.response?.data,
        code: err.code
      });

      // fallback to cached trades if available
      const cached = geminiMarketTradesCache[symbol] || [];
      if (cached.length) {
        console.warn(`⚠️ Returning ${cached.length} cached trades for ${symbol} due to external API failure`);
        return res.status(200).json({
          success: true,
          warning: 'Returned cached results due to external API failure',
          trades: cached,
          symbol,
          isCached: true,
          details: {
            status: err.response?.status,
            message: err.message,
          }
        });
      }

      // no cache -> return useful error
      return res.status(502).json({
        success: false,
        error: 'Failed to fetch market trades from Gemini and no cached data available',
        symbol,
        details: {
          status: err.response?.status,
          message: err.message,
        }
      });
    }
  } catch (err) {
    console.error('❌ /api/gemini/market-trades UNCAUGHT ERROR:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ✅ NEW ENDPOINT: Real Gemini transactions from DB
app.get('/api/gemini/transactions', async (req, res) => {
  try {
    const { userId, limit = 20 } = req.query;
    if (!userId) return res.status(400).json({ success: false, error: 'Missing userId' });

    const lim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 200);

    const query = `
      SELECT 
        id, 
        model_name, 
        action, 
        crypto_symbol, 
        crypto_price, 
        quantity, 
        (crypto_price * quantity) AS total_value,
        pnl,
        pnl_percent,
        created_at AS timestamp
      FROM trades
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 20
    `;

    const [rows] = await db.query(query, [userId]);

    return res.json({ success: true, transactions: rows });
  } catch (err) {
    console.error('❌ /api/gemini/transactions error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch transactions' });
  }
});

// GEMINI OPEN POSITIONS ENDPOINT
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

// GEMINI CLOSE ALL POSITIONS ENDPOINT
app.post('/api/gemini/close-all', async (req, res) => {
  try {
    const { apiKey, apiSecret, env = 'live', modelId, userId } = req.body || {};

    let finalApiKey = apiKey;
    let finalApiSecret = apiSecret;
    let finalEnv = env;

    if ((!finalApiKey || !finalApiSecret) && userId) {
      console.log('🔐 /api/gemini/close-all using userId credentials lookup:', userId);

      const [rows] = await db.query(
        'SELECT api_key, api_secret_enc, iv, auth_tag, env FROM user_gemini_credentials WHERE user_id = ?',
        [userId]
      );

      if (!rows.length) {
        return res.status(401).json({
          success: false,
          error: 'No Gemini credentials found for this user. Please connect Gemini first.',
          reason: 'no_credentials',
        });
      }

      const { api_key, api_secret_enc, iv, auth_tag } = rows[0];
      const storedEnv = rows[0].env || 'live';

      let decryptedSecret;
      try {
        decryptedSecret = decrypt(api_secret_enc, iv, auth_tag);
      } catch (e) {
        console.error('❌ Failed to decrypt API secret:', e);
        return res.status(500).json({
          success: false,
          error: 'Failed to decrypt Gemini credentials. Please reconnect Gemini.',
          reason: 'decrypt_failed',
        });
      }

      finalApiKey = api_key;
      finalApiSecret = decryptedSecret;
      finalEnv = finalEnv || storedEnv;

      console.log('✅ Credentials loaded from database for user:', userId);
    }

    if (!finalApiKey || !finalApiSecret) {
      return res.status(400).json({
        success: false,
        error: 'API Key and API Secret are required',
        reason: 'missing_credentials',
      });
    }

    // ✅ STEP 3: Stop the per-user Gemini scheduler when closing all positions
    if (userId) {
      stopTradeGenerationForUser(userId);
      console.log(`🛑 Auto-trade scheduler stopped for user: ${userId}`);
    }

    const allPositions = Object.values(liveGeminiPositions);
    const positionsToClose = modelId
      ? allPositions.filter(p => p.modelId === modelId)
      : allPositions;

    if (!positionsToClose.length) {
      return res.json({
        success: true,
        message: 'No open positions to close.',
        results: [],
        errors: []
      });
    }

    const results = [];
    const errors = [];

    for (const pos of positionsToClose) {
      try {
        const symbol = pos.symbol.toLowerCase();
        const closeSide = pos.side === 'LONG' ? 'sell' : 'buy';

        const t = await getGeminiTicker(symbol, finalEnv);

        const isSell = closeSide === 'sell';
        const basePx = isSell ? (t.bid || t.last) : (t.ask || t.last);

        if (!basePx || basePx <= 0) {
          throw new Error(`No valid ticker price for ${symbol} (${finalEnv})`);
        }

        const px = isSell ? basePx * 0.97 : basePx * 1.03;

        const orderPayload = {
          symbol,
          amount: String(pos.amount),
          side: closeSide,
          type: 'exchange limit',
          price: toUsdPrice2(px),
          options: ['immediate-or-cancel'],
          env: finalEnv,
          account: 'primary',
        };

        console.log(
          `🔻 Closing ${pos.modelName} ${symbol.toUpperCase()} ${pos.side} (${closeSide.toUpperCase()}) @ ${orderPayload.price} (bid=${t.bid}, ask=${t.ask})`
        );

        const order = await geminiRequest(finalApiKey, finalApiSecret, '/v1/order/new', orderPayload);

        console.log("📦 ORDER RESPONSE:", JSON.stringify(order, null, 2));

        const executed = parseFloat(order.executed_amount || '0');
        const isLive = !!order.is_live;

        if (isLive || executed <= 0) {
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
          userId: userId,
          modelId: pos.modelId,
          modelName: pos.modelName,
          symbol,
          amount: executed,
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

    if (!results.length) {
      return res.status(500).json({
        success: false,
        error: errors[0]?.error || 'Failed to close positions',
        reason: 'all_failed',
        results: [],
        errors,
      });
    }

    return res.json({
      success: true,
      message: `Closed ${results.length} position(s)`,
      results,
      errors,
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

// GEMINI CLEAR POSITIONS ENDPOINT
app.post('/api/gemini/clear-positions', (req, res) => {
  try {
    const { modelId } = req.body;

    if (modelId) {
      const keysToDelete = Object.keys(liveGeminiPositions).filter(key =>
        key.startsWith(`${modelId}_`)
      );
      keysToDelete.forEach(key => delete liveGeminiPositions[key]);
      console.log(`🧹 Cleared ${keysToDelete.length} positions for model ${modelId}`);
    } else {
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

// GEMINI ORDER ENDPOINT (WITH FIXED ORDER TYPE NORMALIZATION)
app.post("/api/gemini/order", async (req, res) => {
  // BIG LOUD LOGS
  console.log('\n\n*****************************************');
  console.log('🚨🚨🚨 MANUAL TRADE ENDPOINT TRIGGERED 🚨🚨🚨');
  console.log('*****************************************\n\n');
  console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
  console.log("!!! TRIGGERED: /api/gemini/order ENDPOINT !!!");
  console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
  try {
    console.log('📥 /api/gemini/order RAW body:', req.body);

    let effectiveApiKey = req.body.apiKey;
    let effectiveApiSecret = req.body.apiSecret;
    let effectiveEnv = req.body.env || 'live';

    if ((!effectiveApiKey || !effectiveApiSecret) && req.body?.userId) {
      const userId = req.body.userId;

      console.log('🔐 /api/gemini/order using userId credentials lookup:', userId);

      const [rows] = await db.query(
        'SELECT api_key, api_secret_enc, iv, auth_tag, env FROM user_gemini_credentials WHERE user_id = ?',
        [userId]
      );

      if (!rows.length) {
        return res.status(401).json({
          success: false,
          error: 'No Gemini credentials found for this user. Please connect Gemini first.',
          reason: 'no_credentials',
        });
      }

      const { api_key, api_secret_enc, iv, auth_tag } = rows[0];
      const storedEnv = rows[0].env || 'live';

      let decryptedSecret;
      try {
        decryptedSecret = decrypt(api_secret_enc, iv, auth_tag);
      } catch (e) {
        console.error('❌ Failed to decrypt API secret:', e);
        return res.status(500).json({
          success: false,
          error: 'Failed to decrypt Gemini credentials. Please reconnect Gemini.',
          reason: 'decrypt_failed',
        });
      }

      effectiveApiKey = api_key;
      effectiveApiSecret = decryptedSecret;
      effectiveEnv = req.body.env || storedEnv || 'live';

      console.log('✅ Credentials loaded from database for user:', userId);
    }

    const {
      symbol: rawSymbol,
      side,
      amount,
      price,
      type,
      modelId,
      modelName,
      closePosition,
    } = req.body;

    // ✅ Normalize symbol to Gemini format
    const symbol = normalizeSymbolForGemini(rawSymbol);
    console.log(`🔄 Symbol normalized: ${rawSymbol} → ${symbol}`);

    const isClosing = (closePosition === true || closePosition === 'true');

    const normalizeGeminiOrderType = (requestedType, orderSide) => {
      const t = (requestedType ?? '').toString().toLowerCase().trim();
      const s = (orderSide ?? '').toString().toLowerCase().trim();

      if (!['buy', 'sell'].includes(s)) {
        throw new Error(`Invalid side: ${orderSide}`);
      }

      if (
        t === 'exchange market' ||
        t === 'market' ||
        t === 'market buy' ||
        t === 'market sell' ||
        t.includes('market')
      ) {
        return s === 'buy' ? 'market buy' : 'market sell';
      }

      if (!t || t === 'exchange limit' || t === 'limit' || t.includes('limit')) {
        return 'exchange limit';
      }

      throw new Error(`Invalid/unsupported order type requested: ${requestedType}`);
    };

    const normalizedOpenType = !isClosing ? normalizeGeminiOrderType(type, side) : null;

    console.log('📥 /api/gemini/order parsed:', {
      apiKey: effectiveApiKey ? '[provided]' : '[missing]',
      apiSecret: effectiveApiSecret ? '[provided]' : '[missing]',
      symbol,
      side,
      amount,
      price,
      typeRaw: type,
      typeNormalized: normalizedOpenType,
      modelId,
      modelName,
      closePosition,
      isClosing,
      env: effectiveEnv,
    });

    if (!effectiveApiKey || !effectiveApiSecret) {
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

    if (!['buy', 'sell'].includes(side.toLowerCase())) {
      console.error('❌ Validation failed: Invalid side', { side });
      return res.status(400).json({
        success: false,
        error: "Side must be 'buy' or 'sell'"
      });
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      console.error('❌ Validation failed: Invalid amount', { amount, amountNum });
      return res.status(400).json({
        success: false,
        error: "Amount must be a positive number"
      });
    }

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

    if (!isClosing && normalizedOpenType === 'exchange limit') {
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
      `🔗 [${effectiveEnv.toUpperCase()}] Placing ${side} order: ${amount} ${symbol}` +
      (price ? ` @ $${price}` : '') +
      ` (model: ${modelName || 'N/A'}, close=${isClosing})`
    );

    // 🔥 NEW: Get current market price to create a "marketable limit order"
    let marketPrice = parseFloat(price);

    // If no price provided, fetch current market price from Gemini
    if (!marketPrice || marketPrice <= 0) {
      try {
        const tickerUrl = `https://api.gemini.com/v1/pubticker/${symbol.toLowerCase()}`;
        const tickerResp = await axios.get(tickerUrl);
        marketPrice = parseFloat(tickerResp.data.last);
        console.log(`📊 Fetched current market price for ${symbol}: $${marketPrice}`);
      } catch (err) {
        console.error('❌ Failed to fetch market price:', err.message);
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch current market price for limit order'
        });
      }
    }

    // 🔥 Calculate a "marketable" limit price (guaranteed to fill + triggers emails)
    const isBuy = side.toLowerCase() === 'buy';
    const limitPrice = isBuy 
      ? (marketPrice * 1.005).toFixed(2)  // Buy 0.5% above market (guaranteed fill)
      : (marketPrice * 0.995).toFixed(2); // Sell 0.5% below market (guaranteed fill)

    const orderPayload = {
      symbol: symbol.toLowerCase(),
      amount: amount.toString(),
      side: side.toLowerCase(),
      type: 'exchange limit', // 👈 THIS IS THE KEY CHANGE
      price: limitPrice,      // 👈 THIS TRIGGERS THE EMAILS
      client_order_id: `trade_${modelId || 'manual'}_${Date.now()}`
    };

    console.log(`📤 Sending ${side.toUpperCase()} limit order to Gemini:`, {
      symbol: orderPayload.symbol,
      side: orderPayload.side,
      amount: orderPayload.amount,
      type: orderPayload.type,
      price: orderPayload.price,
      marketPrice: marketPrice,
      spread: isBuy ? '+0.5%' : '-0.5%'
    });

    // 1. Add this right BEFORE the request
    console.log('DEBUG: Sending Payload to Gemini:', JSON.stringify(orderPayload, null, 2));

    const order = await geminiRequest(effectiveApiKey, effectiveApiSecret, "/v1/order/new", {
      ...orderPayload,
      env: effectiveEnv,
    });

    // 2. Add this right AFTER the request
    console.log('DEBUG: Gemini Raw Response:', JSON.stringify(order, null, 2));

    console.log(`✅ [${effectiveEnv.toUpperCase()}] Order placed:`, {
      order_id: order.order_id,
      symbol: order.symbol,
      side: order.side,
      executed: order.executed_amount,
      is_live: order.is_live,
    });

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
        // ✅ ADD THIS BLOCK HERE
        const totalValue = (actualPrice * executed).toFixed(2);
        const timestamp = Date.now();

        // ✅ INSERT INTO DATABASE
        await db.query(
          `INSERT INTO trades 
          (user_id, model_id, model_name, action, crypto_symbol, crypto_price, quantity, total_value, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            req.body.userId,
            modelId,
            modelName,
            'BUY',
            symbol.toUpperCase(),
            actualPrice,
            executed,
            totalValue,
            timestamp
          ]
        );
              
        io.to(`user:${req.body.userId}`).emit('gemini_transaction', {
          user_id: req.body.userId,
          model_id: modelId,
          model_name: modelName,
          action: 'BUY',
          crypto_symbol: symbol.toUpperCase(),
          crypto_price: actualPrice,
          quantity: executed,
          total_value: totalValue,
          timestamp,
        });
        // ✅ END OF NEW CODE
      } else {
        console.warn(
          `⚠️ Buy order for ${symbol} not filled (is_live=${isLive}, executed=${executed}). LONG position NOT opened.`
        );
      }
    }

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
        // ✅ ADD THIS BLOCK HERE
        const totalValue = (actualPrice * executed).toFixed(2);
        const timestamp = Date.now();

        // ✅ INSERT INTO DATABASE
        await db.query(
          `INSERT INTO trades 
          (user_id, model_id, model_name, action, crypto_symbol, crypto_price, quantity, total_value, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            req.body.userId,
            modelId,
            modelName,
            'SELL',
            symbol.toUpperCase(),
            actualPrice,
            executed,
            totalValue,
            timestamp
          ]
        );
        
        io.to(`user:${req.body.userId}`).emit('gemini_transaction', {
          user_id: req.body.userId,
          model_id: modelId,
          model_name: modelName,
          action: 'SELL',
          crypto_symbol: symbol.toUpperCase(),
          crypto_price: actualPrice,
          quantity: executed,
          total_value: totalValue,
          timestamp,
        });
        // ✅ END OF NEW CODE
      } else {
        console.warn(
          `⚠️ Sell order for ${symbol} not filled (is_live=${isLive}, executed=${executed}). SHORT position NOT opened.`
        );
      }
    }

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
          userId: req.body.userId,  // ✅ ADD THIS LINE
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

// ✅ NEW ENDPOINT: Real Gemini transactions from DB
/*app.get('/api/gemini/transactions', async (req, res) => {
  try {
    const { userId, limit = 20 } = req.query;
    if (!userId) return res.status(400).json({ success: false, error: 'Missing userId' });

    const lim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 200);

    const [rows] = await db.query(
      `
      SELECT
        id,
        user_id,
        model_id,
        model_name,
        action,
        crypto_symbol,
        crypto_price,
        quantity,
        total_value,
        timestamp
      FROM trades
      WHERE user_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
      `,
      [userId, lim]
    );

    return res.json({ success: true, transactions: rows });
  } catch (err) {
    console.error('❌ /api/gemini/transactions error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch transactions' });
  }
}); */

// ========================================
// 3. SOCKET.IO CONNECTION HANDLING
// ========================================
io.on("connection", socket => {
  console.log("✅ Client connected:", socket.id);

  socketsById.set(socket.id, socket);

  socket.on('join_user_room', (userId) => {
    if (!userId) {
      console.error('❌ join_user_room called without userId');
      return;
    }

    socket.join(`user:${userId}`);

    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId).add(socket.id);

    console.log(`✅ Socket ${socket.id} joined room user:${userId}`);
    console.log(`📊 User ${userId} now has ${userSockets.get(userId).size} connected socket(s)`);
  });

  socket.on('request_clear_logs', (userId) => {
    io.to(`user:${userId}`).emit('clear_session_logs');
  });

  const modelsSnapshot = MODELS.map(m => ({
    id: m.id,
    name: m.name,
    color: m.color,
    accountValue: modelState[m.id].accountValue,
    history: modelHistory[m.id]
  }));

  socket.emit("models_snapshot", modelsSnapshot);

  const cryptoSnapshot = {
    latest: cryptoPrices,
    history: cryptoHistory,
    time: Date.now()
  };

  socket.emit("crypto_snapshot", cryptoSnapshot);

  ['btcusd', 'ethusd', 'solusd'].forEach(symbol => {
    const trades = geminiMarketTradesCache[symbol] || [];
    if (trades.length > 0) {
      socket.emit('gemini_market_trades', {
        symbol,
        trades,
      });
    }
  });

  socket.on("setUpdateSpeed", (newSpeed) => {
    console.log(`Update speed changed to: ${newSpeed}ms`);
    UPDATE_INTERVAL = newSpeed;
    startUpdateInterval();
  });

  socket.on("disconnect", () => {
    console.log("❌ Socket disconnected:", socket.id);

    socketsById.delete(socket.id);

    for (const [userId, sockets] of userSockets.entries()) {
      if (sockets.has(socket.id)) {
        sockets.delete(socket.id);
        console.log(`📊 User ${userId} now has ${sockets.size} connected socket(s)`);

        if (sockets.size === 0) {
          userSockets.delete(userId);
          console.log(`🗑️ User ${userId} has no more connected sockets`);
        }
        break;
      }
    }
  });
});

// ========================================
// 4. START SERVER
// ========================================
async function startServer() {
  await initDatabase();

  startUpdateInterval();
  startGeminiTradesPolling();

  /*server.listen(3001, () => {
    console.log("🚀 Backend running on port 3001");
    console.log("📊 Models initialized:", MODELS.map(m => m.name).join(", "));
    console.log("💰 Crypto prices initialized:", CRYPTO_SYMBOLS.map(c => `${c.symbol}: $${c.startPrice}`).join(", "));
    console.log("💎 Gemini API endpoints ready");
    console.log("🔄 Gemini market trades WebSocket broadcasting enabled");
  });*/
  /*server.listen(3002, () => {
    console.log("🚀 Backend running on port 3002");
    console.log("📊 Models initialized:", MODELS.map(m => m.name).join(", "));
    console.log("💰 Crypto prices initialized:", CRYPTO_SYMBOLS.map(c => `${c.symbol}: $${c.startPrice}`).join(", "));
    console.log("💎 Gemini API endpoints ready");
    console.log("🔄 Gemini market trades WebSocket broadcasting enabled");
  });*/
  server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Backend running on port ${PORT}`);
  console.log("📊 Models initialized:", MODELS.map(m => m.name).join(", "));
  console.log("💰 Crypto prices initialized:", CRYPTO_SYMBOLS.map(c => `${c.symbol}: $${c.startPrice}`).join(", "));
  console.log("💎 Gemini API endpoints ready");
  console.log("🔄 Gemini market trades WebSocket broadcasting enabled");
});
}
startServer();