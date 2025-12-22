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

async function geminiRequest(apiKey, apiSecret, path, payload = {}) {
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
    .createHmac("sha384", Buffer.from(apiSecret, 'utf-8'))  // Changed this line
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
}  

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

const STARTING_VALUE = 1000;
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
app.post("/api/gemini/balances", async (req, res) => {
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
});

/* ----------------------------------------
   API ENDPOINT: GET GEMINI MARKET TRADES
-----------------------------------------*/
app.get("/api/gemini/market-trades", async (req, res) => {
  try {
    const { symbol = 'btcusd', limit = 20 } = req.query;

    console.log(`🔗 Fetching market trades for ${symbol}...`);

    // Public endpoint - no authentication required
    const response = await axios.get(
      `https://api.gemini.com/v1/trades/${symbol}`,
      {
        params: { limit_trades: limit },
        timeout: 10000
      }
    );

    console.log(`✅ Fetched ${response.data.length} market trades`);

    res.json({
      success: true,
      trades: response.data,
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
app.post("/api/gemini/order", async (req, res) => {
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
    
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      return res.status(status).json({
        success: false,
        error: data.message || "Failed to place order"
      });
    } else {
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to place order"
      });
    }
  }
});

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
  startTradeGeneration();

  server.listen(3001, () => {
    console.log("🚀 Backend running on port 3001");
    console.log("📊 Models initialized:", MODELS.map(m => m.name).join(", "));
    console.log("💰 Crypto prices initialized:", CRYPTO_SYMBOLS.map(c => `${c.symbol}: $${c.startPrice}`).join(", "));
    console.log("💎 Gemini API endpoints ready");
  });
}

startServer();