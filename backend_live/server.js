// backend/server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

/* ------------------------------
   MODELS INITIAL STATE
--------------------------------*/
const MODELS = [
  { id: "gemini-3-pro",      name: "Gemini-3-pro",      color: "#1f77b4", volatility: 0.5 },
  { id: "qwen-3-max",        name: "Qwen-3-max",        color: "#ff7f0e", volatility: 0.3 },
  { id: "gpt-5.1",           name: "GPT-5.1",           color: "#2ca02c", volatility: 0.7 },
  { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", color: "#d62728", volatility: 0.4 },
  { id: "mystery-model",     name: "Mystery Model",     color: "#9467bd", volatility: 1.0 },
  { id: "deepseek",          name: "DeepSeek",          color: "#8e24aa", volatility: 0.6 }
];

const STARTING_VALUE = 10000;
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
   CONFIGURABLE UPDATE INTERVAL
-----------------------------------------*/
let UPDATE_INTERVAL = 1500; // Default 1.5 seconds
let updateIntervalId = null;

// Function to update model values
function updateModels() {
  const now = Date.now();
  const updates = [];

  MODELS.forEach(m => {
    const state = modelState[m.id];
    const prev = state.accountValue;

    // Random walk: add a small random change scaled by volatility
    // Change is between -volatility*50 and +volatility*50
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
    if (updated < prev * 0.5) updated = prev * 0.5; // Don't drop below 50%
    if (updated > prev * 1.5) updated = prev * 1.5; // Don't rise above 150%

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
    startUpdateInterval(); // Restart interval with new speed
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

// Start the update interval when server starts
startUpdateInterval();

server.listen(3001, () => {
  console.log("Backend running on port 3001");
  console.log("Models initialized:", MODELS.map(m => m.name).join(", "));
  console.log("Crypto prices initialized:", CRYPTO_SYMBOLS.map(c => `${c.symbol}: $${c.startPrice}`).join(", "));
});