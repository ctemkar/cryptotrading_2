import { useState, useEffect } from 'react';
import axios from 'axios';

export function useGemini() {
  const [balances, setBalances] = useState([]);
  const [marketTrades, setMarketTrades] = useState([]);
  const [openPositions, setOpenPositions] = useState([]); // ✅ NEW: track open positions
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  // Load saved credentials from localStorage
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('geminiApiKey') || '');
  const [apiSecret, setApiSecret] = useState(() => localStorage.getItem('geminiApiSecret') || '');

  // ✅ Function to fetch balances
  const fetchBalances = async (key, secret) => {
    try {
      const response = await axios.post(
        '/api/gemini/balances',
        {
          apiKey: key || apiKey,
          apiSecret: secret || apiSecret,
          env: 'live', // ✅ Always live
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

  // ✅ Function to fetch market trades
  const fetchMarketTrades = async (symbol = 'btcusd', limit = 20) => {
    try {
      const response = await axios.get('/api/gemini/market-trades', {
        params: { symbol, limit, env: 'live' }
      });

      if (response.data.success) {
        setMarketTrades(response.data.trades);
        return { success: true, data: response.data.trades };
      } else {
        throw new Error(response.data.error || 'Failed to fetch market trades');
      }
    } catch (err) {
      console.error('❌ Error fetching market trades:', err);
      setError(err.response?.data?.error || err.message || 'Failed to fetch market trades');
      return { success: false, error: err.response?.data?.error || err.message };
    }
  };

  // ✅ NEW: Function to fetch open Gemini positions
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

      console.log('📤 Placing Gemini order:', orderData);

      const response = await axios.post('/api/gemini/order', {
        apiKey,
        apiSecret,
        env: 'live',   // ✅ Always live
        ...orderData,  // passes modelId, modelName, closePosition, type, etc.
      });

      if (response.data.success) {
        console.log('✅ Gemini order placed successfully:', response.data.order);
        
        // Refresh balances and positions after successful order
        await fetchBalances();
        await fetchOpenPositions();
        
        return { 
          success: true, 
          data: response.data.order,
          positionClose: response.data.positionClose // P&L info if closing
        };
      } else {
        throw new Error(response.data.error || 'Failed to place order');
      }
    } catch (err) {
      console.error('❌ Error placing order:', err);
      const errorMsg = err.response?.data?.error || err.message || 'Failed to place order';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setLoading(false);
    }
  };

  // ✅ Function to connect (save credentials and fetch initial data)
  const connect = async (key, secret, symbol = 'btcusd') => {
    setLoading(true);
    setError(null);

    // Save to state and localStorage
    setApiKey(key);
    setApiSecret(secret);
    localStorage.setItem('geminiApiKey', key);
    localStorage.setItem('geminiApiSecret', secret);

    // Fetch balances to verify connection
    const result = await fetchBalances(key, secret);

    if (result.success) {
      // Also fetch initial market trades and open positions
      await fetchMarketTrades(symbol);
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
    setMarketTrades([]);
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
      fetchMarketTrades('btcusd');
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

  return {
    // State
    balances,
    marketTrades,
    openPositions,      // ✅ NEW: expose open positions
    loading,
    error,
    isConnected,
    
    // Functions
    connect,
    disconnect,
    fetchBalances,
    fetchMarketTrades,
    fetchOpenPositions, // ✅ NEW: expose fetch function
    placeOrder,
    setError,
  };
}