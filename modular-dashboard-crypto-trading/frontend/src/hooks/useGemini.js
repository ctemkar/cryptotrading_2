// frontend/hooks/useGemini.js
import { useState, useEffect } from 'react';
import axios from 'axios';

// ========================================
// ✅ STANDALONE EXPORT: fetchGeminiBalances
// ========================================
export const fetchGeminiBalances = async (userId) => {
  try {
    if (!userId) {
      console.error('❌ No userId provided for fetching balances');
      return { success: false, error: 'Missing userId for Gemini balances' };
    }

    console.log('💰 Fetching Gemini balances for userId:', userId);

    const response = await axios.post(
      '/api/gemini/balances',
      { userId, env: 'live' },
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (response.data.success) {
      console.log('✅ Balances fetched successfully');
      return { success: true, data: response.data.balance };
    } else {
      throw new Error(response.data.error || 'Failed to fetch balances');
    }
  } catch (err) {
    console.error('❌ Error fetching Gemini balances:', err);
    const errorMsg = err.response?.data?.error || err.message || 'Failed to fetch balances';
    return { success: false, error: errorMsg };
  }
};

// ========================================
// ✅ MAIN HOOK: useGemini
// ========================================
export function useGemini() {
  // ✅ State: no localStorage initialization (server is source of truth)
  const [balances, setBalances] = useState({});
  const [marketTrades, setMarketTrades] = useState({}); // { btcusd: [...], ethusd: [...], solusd: [...] }
  const [openPositions, setOpenPositions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  // ✅ connectedUserId: defaults to empty string (no localStorage init)
  const [connectedUserId, setConnectedUserId] = useState('');

  // ✅ Default symbols to trade
  const DEFAULT_SYMBOLS = ['btcusd', 'ethusd', 'solusd'];

  // ========================================
  // FETCH BALANCES (uses userId) - Internal version
  // ========================================
  const fetchBalances = async (userId) => {
    const effectiveUserId = userId || connectedUserId;

    if (!effectiveUserId) {
      console.error('❌ No userId available for fetching balances');
      setIsConnected(false);
      return { success: false, error: 'Missing userId for Gemini balances' };
    }

    // Use the standalone function
    const result = await fetchGeminiBalances(effectiveUserId);

    if (result.success) {
      setBalances(result.data);
      setIsConnected(true);
    } else {
      setError(result.error);
      setIsConnected(false);
    }

    return result;
  };

  // ========================================
  // FETCH MARKET TRADES (public endpoint)
  // ========================================
  const fetchMarketTrades = async (symbols = DEFAULT_SYMBOLS, limit = 20) => {
    try {
      const symbolArray = Array.isArray(symbols) ? symbols : [symbols];
      const tradesData = {};

      const promises = symbolArray.map(async (symbol) => {
        const response = await axios.get('/api/gemini/market-trades', {
          params: { symbol, limit, env: 'live' },
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
      const errorMsg = err.response?.data?.error || err.message || 'Failed to fetch market trades';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }
  };

  // ========================================
  // FETCH OPEN POSITIONS
  // ========================================
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

  // ========================================
  // PLACE ORDER (uses userId)
  // ========================================
  const placeOrder = async (orderData) => {
    try {
      setLoading(true);
      setError(null);

      console.log('📤 placeOrder called with:', orderData);

      const effectiveUserId = orderData.userId || connectedUserId;

      if (!effectiveUserId) {
        console.error('❌ No userId available for placing order');
        return {
          success: false,
          error: 'Missing userId. Please reconnect to Gemini.',
          reason: 'no_user_id',
        };
      }

      const payload = {
        userId: effectiveUserId,
        env: 'live',
        ...orderData,
      };

      console.log('📦 POST /api/gemini/order payload:', {
        ...payload,
        userId: '[provided]',
      });

      const response = await axios.post('/api/gemini/order', payload);

      console.log('✅ Gemini order response:', response.data);

      if (response.data.success) {
        console.log('✅ Gemini order placed successfully:', response.data.order);

        // Refresh balances and positions after successful order
        await fetchBalances(effectiveUserId);
        await fetchOpenPositions();

        return {
          success: true,
          order: response.data.order,
          positionClose: response.data.positionClose,
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

  // ========================================
  // CLOSE ALL POSITIONS (uses userId)
  // ========================================
  const closeAllPositions = async (modelId = null) => {
    try {
      setLoading(true);
      setError(null);

      console.log('🛑 Closing all Gemini positions...', { modelId });

      if (!connectedUserId) {
        console.error('❌ No userId available for closing positions');
        return {
          success: false,
          error: 'Missing userId. Please reconnect to Gemini.',
          reason: 'no_user_id',
        };
      }

      const response = await axios.post('/api/gemini/close-all', {
        userId: connectedUserId,
        env: 'live',
        modelId,
      });

      if (response.data.success) {
        console.log('✅ Close all positions result:', response.data);

        await fetchBalances(connectedUserId);
        await fetchOpenPositions();

        return {
          success: true,
          results: response.data.results || [],
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
        results: [],
        errors: err.response?.data?.errors || [],
      };
    } finally {
      setLoading(false);
    }
  };

  // ========================================
  // CLEAR POSITIONS (for reset)
  // ========================================
  const clearPositions = async (modelId = null) => {
    try {
      const response = await axios.post('/api/gemini/clear-positions', { modelId });

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

  // ========================================
  // CONNECT (save userId and fetch initial data)
  // ========================================
  const connect = async (userId) => {
    setLoading(true);
    setError(null);

    if (!userId) {
      console.error('❌ connect() called without userId');
      setLoading(false);
      return { success: false, error: 'Missing userId' };
    }

    setConnectedUserId(userId);
    console.log('🔗 Connecting to Gemini with userId:', userId);

    const result = await fetchBalances(userId);

    if (result.success) {
      await fetchMarketTrades(DEFAULT_SYMBOLS);
      await fetchOpenPositions();
      console.log('✅ Connected to Gemini successfully');
    } else {
      setConnectedUserId('');
      console.error('❌ Failed to connect to Gemini:', result.error);
    }

    setLoading(false);
    return result;
  };

  // ========================================
  // DISCONNECT
  // ========================================
  const disconnect = () => {
    setIsConnected(false);
    setConnectedUserId('');
    setBalances({});
    setMarketTrades({});
    setOpenPositions([]);
    setError(null);

    console.log('✅ Disconnected from Gemini');
  };

  // ========================================
  // POLLING: Open positions every 5s
  // ========================================
  useEffect(() => {
    if (!isConnected) return;

    const interval = setInterval(() => {
      fetchOpenPositions();
    }, 5000);

    return () => clearInterval(interval);
  }, [isConnected]);

  // ========================================
  // POLLING: Market trades every 10s
  // ========================================
  useEffect(() => {
    if (!isConnected) return;

    const interval = setInterval(() => {
      fetchMarketTrades(DEFAULT_SYMBOLS);
    }, 10000);

    return () => clearInterval(interval);
  }, [isConnected]);

  // ========================================
  // RETURN API
  // ========================================
  return {
    // State
    balances,
    marketTrades,
    openPositions,
    loading,
    error,
    isConnected,
    connectedUserId,
    DEFAULT_SYMBOLS,

    // Functions
    connect,
    disconnect,
    fetchBalances,
    fetchMarketTrades,
    fetchOpenPositions,
    placeOrder,
    placeGeminiOrder: placeOrder, // alias
    closeAllPositions,
    clearPositions,
    setError,
  };
}