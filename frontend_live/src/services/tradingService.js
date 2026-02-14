// src/services/tradingService.js
import axios from 'axios';

export async function startTrading(payload) {
  // payload: { userId, modelId, modelName, startValue, stopLoss, profitTarget, ... }
  const res = await axios.post('/api/gemini/start-trading', payload, { timeout: 20000 });
  return res.data;
}