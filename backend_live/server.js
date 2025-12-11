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

/* ----------------------------------------
   SEND SNAPSHOT ON CONNECT
-----------------------------------------*/
io.on("connection", socket => {
  console.log("Client connected:", socket.id);

  const snapshot = MODELS.map(m => ({
    id: m.id,
    name: m.name,
    color: m.color,
    accountValue: modelState[m.id].accountValue,
    history: modelHistory[m.id]
  }));

  socket.emit("models_snapshot", snapshot);

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

/* ----------------------------------------
   UPDATE EVERY 1.5 SECONDS
-----------------------------------------*/
setInterval(() => {
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

}, 1500);

server.listen(3001, () => {
  console.log("Backend running on port 3001");
});
