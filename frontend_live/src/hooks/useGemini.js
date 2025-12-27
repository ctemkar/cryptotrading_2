import { useState, useEffect } from 'react';
import axios from 'axios';

export function useGemini() {
  const [balances, setBalances] = useState([]);
  const [marketTrades, setMarketTrades] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  // Load saved credentials from localStorage
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('geminiApiKey') || '');
  const [apiSecret, setApiSecret] = useState(() => localStorage.getItem('geminiApiSecret') || '');

  // Function to fetch balances
  /*const fetchBalances = async (key, secret) => {
    try {
     /* const response = await axios.post('http://localhost:3001/api/gemini/balances', {
        apiKey: key || apiKey,
        apiSecret: secret || apiSecret
      });*/
        /*const response = await axios.post('/api/gemini/balances', {
            apiKey: key || apiKey,
            apiSecret: secret || apiSecret
        });

      if (response.data.success) {
        setBalances(response.data.balance);
        setIsConnected(true);
        return { success: true, data: response.data.balance };
      } else {
        throw new Error(response.data.error || 'Failed to fetch balances');
      }
    } catch (err) {
      console.error('Error fetching Gemini balances:', err);
      setError(err.response?.data?.error || err.message || 'Failed to fetch balances');
      setIsConnected(false);
      return { success: false, error: err.response?.data?.error || err.message };
    }
  };*/

  const fetchBalances = async (key, secret) => {
  try {
    const response = await axios.post(
      '/api/gemini/balances',
      {
        apiKey: key || apiKey,
        apiSecret: secret || apiSecret,
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
    console.error('Error fetching Gemini balances:', err);
    setError(
      err.response?.data?.error || err.message || 'Failed to fetch balances'
    );
    setIsConnected(false);
    return { success: false, error: err.response?.data?.error || err.message };
  }
};

  // Function to fetch market trades
  const fetchMarketTrades = async (symbol = 'btcusd', limit = 20) => {
    try {
      const response = await axios.get('/api/gemini/market-trades', {
        params: { symbol, limit }
      }); 

      if (response.data.success) {
        setMarketTrades(response.data.trades);
        return { success: true, data: response.data.trades };
      } else {
        throw new Error(response.data.error || 'Failed to fetch market trades');
      }
    } catch (err) {
      console.error('Error fetching market trades:', err);
      setError(err.response?.data?.error || err.message || 'Failed to fetch market trades');
      return { success: false, error: err.response?.data?.error || err.message };
    }
  };

  // Function to place an order
  /*const placeOrder = async (orderData) => {
    try {
      setLoading(true);
      const response = await axios.post('/api/gemini/order', {
        apiKey,
        apiSecret,
        ...orderData
      });

      if (response.data.success) {
        // Refresh balances after successful order
        await fetchBalances();
        return { success: true, data: response.data.order };
      } else {
        throw new Error(response.data.error || 'Failed to place order');
      }
    } catch (err) {
      console.error('Error placing order:', err);
      const errorMsg = err.response?.data?.error || err.message || 'Failed to place order';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setLoading(false);
    }
  }; */

  // Function to place an order
// orderData can include: symbol, side, amount, price, type, modelId, modelName, closePosition
const placeOrder = async (orderData) => {
    try {
      setLoading(true);
      const response = await axios.post('/api/gemini/order', {
        apiKey,
        apiSecret,
        ...orderData,   // <-- passes modelId, modelName, closePosition, type, etc.
      });

      if (response.data.success) {
        // Refresh balances after successful order
        await fetchBalances();
        return { success: true, data: response.data.order };
      } else {
        throw new Error(response.data.error || 'Failed to place order');
      }
    } catch (err) {
      console.error('Error placing order:', err);
      const errorMsg = err.response?.data?.error || err.message || 'Failed to place order';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setLoading(false);
    }
  };

  // Function to connect (save credentials and fetch initial data)
  // Function to connect (save credentials and fetch initial data)
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
    // Also fetch initial market trades for the specified symbol
    await fetchMarketTrades(symbol); // ✅ NOW USES SYMBOL PARAMETER
  }

  setLoading(false);
  return result;
};

  // Function to disconnect
  const disconnect = () => {
    setApiKey('');
    setApiSecret('');
    setBalances([]);
    setMarketTrades([]);
    setIsConnected(false);
    setError(null);
    localStorage.removeItem('geminiApiKey');
    localStorage.removeItem('geminiApiSecret');
  };

  // Auto-connect on mount if credentials exist
  useEffect(() => {
    if (apiKey && apiSecret) {
      fetchBalances();
      fetchMarketTrades('btcusd'); // ✅ Default to BTC on initial load;
    }
  }, []);

  return {
    balances,
    marketTrades,
    loading,
    error,
    isConnected,
    connect,
    disconnect,
    fetchBalances,
    fetchMarketTrades,
    placeOrder,
    setError
  };
}