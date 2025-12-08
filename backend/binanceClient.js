// binanceClient.js
const axios = require("axios");

const BINANCE_BASE = "https://api.binance.com";

async function getExchangeInfo() {
  const res = await axios.get(`${BINANCE_BASE}/api/v3/exchangeInfo`);
  return res.data;
}

async function getKlines(symbol, interval, limit = 500) {
  const res = await axios.get(`${BINANCE_BASE}/api/v3/klines`, {
    params: { symbol, interval, limit },
  });
  return res.data.map((k) => ({
    openTime: k[0],
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]),
    closeTime: k[6],
  }));
}

module.exports = {
  getExchangeInfo,
  getKlines,
};