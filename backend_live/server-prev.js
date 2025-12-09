// backend/server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const WebSocket = require("ws");
const cors = require("cors");

const app = express();
app.use(cors());
app.get("/", (req, res) => res.send("Crypto backend running"));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// CHANGE / ADD symbols here (lowercase); Binance symbols must be lowercase in streams
const SYMBOLS = ["btcusdt", "ethusdt", "solusdt", "lunausdt"]; // example list

// Build combined stream URL for Binance
const streams = SYMBOLS.map(s => `${s}@trade`).join("/");
const BINANCE_WS = `wss://stream.binance.com:9443/stream?streams=${streams}`;

let binanceSocket;

function connectBinance() {
  binanceSocket = new WebSocket(BINANCE_WS);

  binanceSocket.on("open", () => {
    console.log("Connected to Binance combined stream:", BINANCE_WS);
  });

  binanceSocket.on("message", (msg) => {
    try {
      const parsed = JSON.parse(msg);
      // Binance combined stream sends { stream, data }
      // data object for trade has e === 'trade'
      const data = parsed.data;
      if (!data) return;
      if (data.e === "trade") {
        const out = {
          symbol: data.s,                 // e.g., "BTCUSDT"
          price: parseFloat(data.p),     // trade price
          qty: parseFloat(data.q),
          tradeId: data.t,
          time: data.T
        };
        // broadcast to all connected clients
        io.emit("crypto_update", out);
      }
    } catch (err) {
      console.error("Error parsing binance message:", err);
    }
  });

  binanceSocket.on("close", () => {
    console.log("Binance socket closed. Reconnecting in 2s...");
    setTimeout(connectBinance, 2000);
  });

  binanceSocket.on("error", (err) => {
    console.error("Binance socket error:", err);
    binanceSocket.close();
  });
}

io.on("connection", (socket) => {
  console.log("Frontend connected", socket.id);

  // optional: client can send subscribe message to change symbols (not implemented here)
  socket.on("disconnect", () => {
    console.log("Frontend disconnected", socket.id);
  });
});

// start everything
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
  connectBinance();
});
