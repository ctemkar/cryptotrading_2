// coingeckoClient.js
const axios = require("axios");

// If using Pro:
const CG_BASE = "https://pro-api.coingecko.com/api/v3";
const CG_KEY = process.env.CG_API_KEY; // set in your .env / environment

const client = axios.create({
  baseURL: CG_BASE,
  headers: { "x-cg-pro-api-key": CG_KEY },
});

async function getTopGainersLosers(timeframe = "24h") {
  const res = await client.get("/coins/top_gainers_losers", {
    params: { duration: timeframe },
  });
  return res.data;
}

async function getCoinDetails(id) {
  const res = await axios.get(`https://api.coingecko.com/api/v3/coins/${id}`);
  return res.data;
}

module.exports = {
  getTopGainersLosers,
  getCoinDetails,
};