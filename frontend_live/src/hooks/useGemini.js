import { useState, useEffect } from 'react';
import axios from 'axios';

export function useGemini() {
  const [balances, setBalances] = useState([]);
  const [marketTrades, setMarketTrades] = useState({}); // ✅ CHANGED: now an object { btcusd: [...], ethusd: [...], solusd: [...] }
  const [openPositions, setOpenPositions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  // Load saved credentials from localStorage
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('geminiApiKey') || '');
  const [apiSecret, setApiSecret] = useState(() => localStorage.getItem('geminiApiSecret') || '');

  // ✅ Default symbols to trade
  const DEFAULT_SYMBOLS = ['btcusd', 'ethusd', 'solusd'];

  // ✅ Function to fetch balances
  const fetchBalances = async (key, secret) => {
    try {
      const response = await axios.post(
        '/api/gemini/balances',
        {
          apiKey: key || apiKey,
          apiSecret: secret || apiSecret,
          env: 'live',
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data.success) {
        setBalances(response.data.balance);
        setIsConnected(true);
        return { success: true, data: response.data.balance };
      } else {
        throw new Error(response.data.error || 'Failed to fetch balances');
      }
    } catch (err) {
      console.error('❌ Error fetching Gemini balances:', err);
      setError(
        err.response?.data?.error || err.message || 'Failed to fetch balances'
      );
      setIsConnected(false);
      return { success: false, error: err.response?.data?.error || err.message };
    }
  };

  // ✅ Function to fetch market trades for multiple symbols
  const fetchMarketTrades = async (symbols = DEFAULT_SYMBOLS, limit = 20) => {
    try {
      const symbolArray = Array.isArray(symbols) ? symbols : [symbols];
      const tradesData = {};

      // Fetch trades for each symbol in parallel
      const promises = symbolArray.map(async (symbol) => {
        const response = await axios.get('/api/gemini/market-trades', {
          params: { symbol, limit, env: 'live' }
        });

        if (response.data.success) {
          tradesData[symbol] = response.data.trades;
        } else {
          console.warn(`⚠️ Failed to fetch trades for ${symbol}`);
          tradesData[symbol] = [];
        }
      });

      await Promise.all(promises);
      setMarketTrades(tradesData);
      return { success: true, data: tradesData };
    } catch (err) {
      console.error('❌ Error fetching market trades:', err);
      setError(err.response?.data?.error || err.message || 'Failed to fetch market trades');
      return { success: false, error: err.response?.data?.error || err.message };
    }
  };

  // ✅ Function to fetch open Gemini positions
  const fetchOpenPositions = async () => {
    try {
      const response = await axios.get('/api/gemini/open-positions');
      
      if (response.data.success) {
        setOpenPositions(response.data.positions || []);
        return { success: true, data: response.data.positions };
      } else {
        throw new Error(response.data.error || 'Failed to fetch open positions');
      }
    } catch (err) {
      console.error('❌ Error fetching open positions:', err);
      return { success: false, error: err.response?.data?.error || err.message };
    }
  };

  // ✅ Function to place an order (BUY or SELL)
  // orderData should include: symbol, side, amount, price, type, modelId, modelName, closePosition
  const placeOrder = async (orderData) => {
    try {
      setLoading(true);
      setError(null);

      console.log('📤 placeOrder called with:', orderData);

      const payload = {
        apiKey,
        apiSecret,
        env: 'live',
        ...orderData,
      };

      console.log('📦 POST /api/gemini/order payload:', payload);

      const response = await axios.post('/api/gemini/order', payload);

      console.log('✅ Gemini order response:', response.data);

      if (response.data.success) {
        console.log('✅ Gemini order placed successfully:', response.data.order);
        
        // Refresh balances and positions after successful order
        await fetchBalances();
        await fetchOpenPositions();
        
        return { 
          success: true, 
          order: response.data.order,
          positionClose: response.data.positionClose
        };
      } else {
        return {
          success: false,
          error: response.data.error || 'Failed to place order',
          reason: response.data.reason,
          details: response.data.details,
          geminiReason: response.data.geminiReason,
          geminiMessage: response.data.geminiMessage,
        };
      }
    } catch (err) {
      console.error('❌ Error placing order:', err);
      const errorData = err.response?.data || {};
      return {
        success: false,
        error: errorData.error || err.message || 'Failed to place order',
        reason: errorData.reason,
        details: errorData.details,
        geminiReason: errorData.geminiReason,
        geminiMessage: errorData.geminiMessage,
      };
    } finally {
      setLoading(false);
    }
  };

  // ✅ Function to close all open positions
  const closeAllPositions = async (modelId = null) => {
    try {
      setLoading(true);
      setError(null);

      console.log('🛑 Closing all Gemini positions...', { modelId });

      const response = await axios.post('/api/gemini/close-open-positions', {
        apiKey,
        apiSecret,
        env: 'live',
        modelId,
      });

      if (response.data.success) {
        console.log('✅ Close all positions result:', response.data);
        
        await fetchBalances();
        await fetchOpenPositions();
        
        return {
          success: true,
          closed: response.data.closed,
          failed: response.data.failed,
          errors: response.data.errors || [],
        };
      } else {
        throw new Error(response.data.error || 'Failed to close positions');
      }
    } catch (err) {
      console.error('❌ Error closing all positions:', err);
      const errorMsg = err.response?.data?.error || err.message || 'Failed to close positions';
      setError(errorMsg);
      return {
        success: false,
        error: errorMsg,
        closed: 0,
        failed: 0,
        errors: [],
      };
    } finally {
      setLoading(false);
    }
  };

  // ✅ Function to clear position tracking (for reset)
  const clearPositions = async (modelId = null) => {
    try {
      const response = await axios.post('/api/gemini/clear-positions', {
        modelId,
      });

      if (response.data.success) {
        console.log('✅ Positions cleared from backend');
        await fetchOpenPositions();
        return { success: true };
      } else {
        throw new Error(response.data.error || 'Failed to clear positions');
      }
    } catch (err) {
      console.error('❌ Error clearing positions:', err);
      return {
        success: false,
        error: err.response?.data?.error || err.message || 'Failed to clear positions',
      };
    }
  };

  // ✅ Function to connect (save credentials and fetch initial data)
  const connect = async (key, secret) => {
    setLoading(true);
    setError(null);

    setApiKey(key);
    setApiSecret(secret);
    localStorage.setItem('geminiApiKey', key);
    localStorage.setItem('geminiApiSecret', secret);

    const result = await fetchBalances(key, secret);

    if (result.success) {
      // Fetch market trades for all default symbols
      await fetchMarketTrades(DEFAULT_SYMBOLS);
      await fetchOpenPositions();
      console.log('✅ Connected to Gemini successfully');
    }

    setLoading(false);
    return result;
  };

  // ✅ Function to disconnect
  const disconnect = () => {
    setApiKey('');
    setApiSecret('');
    setBalances([]);
    setMarketTrades({});
    setOpenPositions([]);
    setIsConnected(false);
    setError(null);
    localStorage.removeItem('geminiApiKey');
    localStorage.removeItem('geminiApiSecret');
    console.log('🔌 Disconnected from Gemini');
  };

  // ✅ Auto-connect on mount if credentials exist
  useEffect(() => {
    if (apiKey && apiSecret) {
      console.log('🔄 Auto-connecting to Gemini...');
      fetchBalances();
      fetchMarketTrades(DEFAULT_SYMBOLS);
      fetchOpenPositions();
    }
  }, []);

  // ✅ Poll open positions every 5 seconds when connected
  useEffect(() => {
    if (!isConnected) return;

    const interval = setInterval(() => {
      fetchOpenPositions();
    }, 5000);

    return () => clearInterval(interval);
  }, [isConnected]);

  // ✅ Poll market trades every 10 seconds when connected
  useEffect(() => {
    if (!isConnected) return;

    const interval = setInterval(() => {
      fetchMarketTrades(DEFAULT_SYMBOLS);
    }, 10000);

    return () => clearInterval(interval);
  }, [isConnected]);

  return {
    // State
    balances,
    marketTrades,
    openPositions,
    loading,
    error,
    isConnected,
    DEFAULT_SYMBOLS, // ✅ NEW: expose default symbols
    
    // Functions
    connect,
    disconnect,
    fetchBalances,
    fetchMarketTrades,
    fetchOpenPositions,
    placeOrder,
    placeGeminiOrder: placeOrder,
    closeAllPositions,
    clearPositions,
    setError,
  };
}