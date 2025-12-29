import React, { useState, useEffect } from 'react';
import LiveMultiChart from './LiveMultiChart';
import ModelsComparisonChart from './ModelsComparisonChart';
import useModels from '../hooks/useModels';
import useCryptoPrices from '../hooks/useCryptoPrices';
import { useGemini } from '../hooks/useGemini';
import socket from '../services/socket';

function Dashboard() {
  // ✅ Google Login State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userInfo, setUserInfo] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  // ✅ Symbol selection state
const [selectedSymbol, setSelectedSymbol] = useState('btcusd');

// ✅ Available symbols
const AVAILABLE_SYMBOLS = [
  { value: 'btcusd', label: 'BTC / USD' },
  { value: 'ethusd', label: 'ETH / USD' },
  { value: 'solusd', label: 'SOL / USD' },
];

  // ✅ Trades State
  const [trades, setTrades] = useState([]);
  const [loadingTrades, setLoadingTrades] = useState(true);

  // ✅ NEW: Live Gemini market trades from WebSocket
  const [liveGeminiTrades, setLiveGeminiTrades] = useState([]);

  // ✅ useGemini hook for enhanced Gemini integration
  const {
    balances: geminiBalances,
    marketTrades: geminiMarketTrades,
    loading: geminiLoading,
    error: geminiError,
    isConnected: isGeminiConnected,
    connect: connectGemini,
    disconnect: disconnectGemini,
    fetchBalances: refreshGeminiBalances,
    fetchMarketTrades: refreshGeminiMarketTrades,
    placeOrder: placeGeminiOrder,
    setError: setGeminiError,
    mode: geminiMode,           // ✅ 'live' | 'sandbox'
    setMode: setGeminiMode,     // ✅
  } = useGemini();

  // ✅ Manual trading state
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [tradeSymbol, setTradeSymbol] = useState('btcusd');
  const [tradeSide, setTradeSide] = useState('buy');
  const [tradeAmount, setTradeAmount] = useState('');
  const [tradePrice, setTradePrice] = useState('');
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);

  // ✅ Gemini modal state
  const [showGeminiModal, setShowGeminiModal] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState(() => localStorage.getItem('geminiApiKey') || '');
  const [geminiApiSecret, setGeminiApiSecret] = useState(() => localStorage.getItem('geminiApiSecret') || '');
  const [isGeminiConnecting, setIsGeminiConnecting] = useState(false);
  const [geminiStep, setGeminiStep] = useState(1);

  // ✅ Mock trading state
  const [isMockTrading, setIsMockTrading] = useState(() => {
    const saved = localStorage.getItem('isMockTrading');
    return saved === null ? true : saved === 'true'; // Default to true (mock mode)
  });

  // ✅ Track the last user-set starting value separately
  const [lastSetStartingValue, setLastSetStartingValue] = useState(() => {
    const saved = localStorage.getItem('lastSetStartingValue');
    return saved || '1000';
  });

  // Load saved values from localStorage or use defaults
  const [stopLoss, setStopLoss] = useState(() => localStorage.getItem('stopLoss') || '');
  const [profitTarget, setProfitTarget] = useState(() => localStorage.getItem('profitTarget') || '');
  const [startingValue, setStartingValue] = useState(() => {
    const saved = localStorage.getItem('startingValue');
    return saved || '1000';
  });
  const [isTrading, setIsTrading] = useState(() => {
    const saved = localStorage.getItem('isTrading');
    return saved === 'true';
  });
  const [tradingStopped, setTradingStopped] = useState(false);
  const [stopReason, setStopReason] = useState('');
  const [finalProfitLoss, setFinalProfitLoss] = useState(null);
  const [selectedModels, setSelectedModels] = useState(() => {
    const saved = localStorage.getItem('selectedModels');
    return saved ? JSON.parse(saved) : [];
  });
  const [initialValues, setInitialValues] = useState(() => {
    const saved = localStorage.getItem('initialValues');
    return saved ? JSON.parse(saved) : {};
  });
  const [socketConnected, setSocketConnected] = useState(false);
  const [updateSpeed, setUpdateSpeed] = useState(() => localStorage.getItem('updateSpeed') || '1500');

  const { modelsLatest, modelsHistory } = useModels();
  const { latest: cryptoLatest, history: cryptoHistory } = useCryptoPrices();

  const availableModels = Object.values(modelsLatest);
  const startValue = parseFloat(startingValue) || 1000;
  const currentPrice = cryptoLatest.BTCUSDT || null;

  // Speed presets
  const speedPresets = [
    { label: 'Very Fast (0.5s)', value: '500' },
    { label: 'Fast (1s)', value: '1000' },
    { label: 'Normal (1.5s)', value: '1500' },
    { label: 'Slow (3s)', value: '3000' },
    { label: 'Very Slow (5s)', value: '5000' }
  ];

  // ✅ Fetch trades from backend
  const fetchTrades = async () => {
    try {
      const response = await fetch('/api/trades');
      const data = await response.json();
      setTrades(data);
      setLoadingTrades(false);
    } catch (error) {
      console.error('Error fetching trades:', error);
      setLoadingTrades(false);
    }
  };

  // ✅ Listen for real-time trade updates
  useEffect(() => {
    fetchTrades();

    socket.on('new_trade', (trade) => {
      console.log('📊 New trade received:', trade);
      setTrades((prev) => [trade, ...prev].slice(0, 20));
    });

    return () => {
      socket.off('new_trade');
    };
  }, []);

  // ✅ NEW: Listen for real-time Gemini market trades
/*useEffect(() => {
  const handleGeminiTrades = (payload) => {
    console.log('💎 Live Gemini trades update:', payload);
    setLiveGeminiTrades(payload.trades || []);
  };

  socket.on('gemini_market_trades', handleGeminiTrades);

  return () => {
    socket.off('gemini_market_trades', handleGeminiTrades);
  };
}, []);*/

useEffect(() => {
  const handleGeminiTrades = (payload) => {
    // Only show BTC in this table
    if (payload.symbol !== 'btcusd') return;

    console.log('💎 Live Gemini BTC trades update:', payload);
    setLiveGeminiTrades(payload.trades || []);
  };

  socket.on('gemini_market_trades', handleGeminiTrades);

  return () => {
    socket.off('gemini_market_trades', handleGeminiTrades);
  };
}, [socket]);

  // ✅ Initialize Google Sign-In
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);

    script.onload = () => {
      const savedUser = localStorage.getItem('googleUser');
      if (savedUser) {
        try {
          const user = JSON.parse(savedUser);
          setUserInfo(user);
          setIsAuthenticated(true);
        } catch (e) {
          console.error('Failed to parse saved user:', e);
        }
      }
      setIsLoadingAuth(false);

      if (window.google) {
        window.google.accounts.id.initialize({
          client_id: '157143841270-n05ehn5d303vaije4bgg8gp3392l64ve.apps.googleusercontent.com',
          callback: handleGoogleCallback
        });
      }
    };

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  // ✅ Handle Google Sign-In callback
  const handleGoogleCallback = (response) => {
    try {
      const payload = JSON.parse(atob(response.credential.split('.')[1]));
      const user = {
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
        sub: payload.sub
      };

      setUserInfo(user);
      setIsAuthenticated(true);
      localStorage.setItem('googleUser', JSON.stringify(user));
      console.log('✅ User logged in:', user.email);
    } catch (error) {
      console.error('Failed to decode Google token:', error);
      alert('Login failed. Please try again.');
    }
  };

  // ✅ Render Google Sign-In button
  const renderGoogleButton = () => {
    if (window.google) {
      window.google.accounts.id.renderButton(
        document.getElementById('googleSignInButton'),
        {
          theme: 'filled_blue',
          size: 'large',
          text: 'signin_with',
          shape: 'rectangular',
          width: 280
        }
      );
    }
  };

  // ✅ Trigger button render after auth check
  useEffect(() => {
    if (!isLoadingAuth && !isAuthenticated) {
      setTimeout(renderGoogleButton, 100);
    }
  }, [isLoadingAuth, isAuthenticated]);

  // ✅ Handle Logout
  const handleLogout = () => {
    setIsAuthenticated(false);
    setUserInfo(null);
    localStorage.removeItem('googleUser');

    setIsTrading(false);
    setTradingStopped(false);
    setStopReason('');
    setSelectedModels([]);
    setInitialValues({});

    console.log('✅ User logged out');
  };

  // ✅ Persist Gemini connection
  useEffect(() => {
    if (geminiApiKey) localStorage.setItem('geminiApiKey', geminiApiKey);
    else localStorage.removeItem('geminiApiKey');
  }, [geminiApiKey]);

  useEffect(() => {
    if (geminiApiSecret) localStorage.setItem('geminiApiSecret', geminiApiSecret);
    else localStorage.removeItem('geminiApiSecret');
  }, [geminiApiSecret]);

  // ✅ Persist mock trading state
  useEffect(() => {
    localStorage.setItem('isMockTrading', isMockTrading.toString());
  }, [isMockTrading]);

  // ✅ Stop mock trading when Gemini connects
  useEffect(() => {
    if (isGeminiConnected) {
      setIsMockTrading(false);
      if (isTrading) {
        setIsTrading(false);
        setTradingStopped(true);
        setStopReason('Switched to Gemini live trading. Mock trading stopped.');
      }
      console.log('✅ Mock trading disabled - Gemini connected');
    }
  }, [isGeminiConnected]);

  // ✅ OAuth-like Gemini connection handlers
  const handleOpenGeminiModal = () => {
    setShowGeminiModal(true);
    setGeminiError(null);
    
    // If user has credentials stored or already typed, go to step 2
    if (geminiApiKey || geminiApiSecret) {
      setGeminiStep(2);
    } else {
      setGeminiStep(1);
    }
  };

  const handleCloseGeminiModal = () => {
    setShowGeminiModal(false);
    setGeminiError(null);
  };

  const handleGeminiAuthorize = async () => {
    if (!geminiApiKey || !geminiApiSecret) {
      setGeminiError('Please enter both API Key and API Secret');
      return;
    }

    if (geminiApiKey.length < 10 || geminiApiSecret.length < 10) {
      setGeminiError('API credentials appear invalid. Please check and try again.');
      return;
    }

    try {
      setIsGeminiConnecting(true);
      setGeminiError(null);
      setGeminiStep(3);

      // Use the connectGemini function from useGemini hook
      const result = await connectGemini(geminiApiKey, geminiApiSecret);

      if (!result.success) {
        throw new Error(result.error || 'Failed to connect to Gemini');
      }

      // Close modal after success
      setTimeout(() => {
        setShowGeminiModal(false);
        setGeminiStep(1);
      }, 800);

    } catch (error) {
      console.error('Gemini authorization failed:', error);
      setGeminiError(error.message || 'Authorization failed. Please try again.');
      setGeminiStep(2);
    } finally {
      setIsGeminiConnecting(false);
    }
  };

  const handleGeminiDisconnect = () => {
    if (window.confirm('Are you sure you want to disconnect your Gemini account?')) {
      setGeminiApiKey('');
      setGeminiApiSecret('');
      disconnectGemini();
      localStorage.removeItem('geminiApiKey');
      localStorage.removeItem('geminiApiSecret');
      setIsMockTrading(true); // Re-enable mock trading
    }
  };

  const handleOpenGeminiSite = () => {
    // Open Gemini in new tab
    window.open('https://exchange.gemini.com/settings/api', '_blank');
  };

  // ✅ ONE-TIME MIGRATION
  useEffect(() => {
    const currentStart = localStorage.getItem('startingValue');
    const currentLast = localStorage.getItem('lastSetStartingValue');

    if (currentStart === '10000') {
      localStorage.setItem('startingValue', '1000');
      setStartingValue('1000');
      console.log('✅ Migrated startingValue from 10000 to 1000');
    }
    if (currentLast === '10000') {
      localStorage.setItem('lastSetStartingValue', '1000');
      setLastSetStartingValue('1000');
      console.log('✅ Migrated lastSetStartingValue from 10000 to 1000');
    }
  }, []);

  // Save to localStorage whenever values change
  useEffect(() => {
    localStorage.setItem('stopLoss', stopLoss);
  }, [stopLoss]);

  useEffect(() => {
    localStorage.setItem('profitTarget', profitTarget);
  }, [profitTarget]);

  useEffect(() => {
    localStorage.setItem('startingValue', startingValue);
  }, [startingValue]);

  useEffect(() => {
    localStorage.setItem('selectedModels', JSON.stringify(selectedModels));
  }, [selectedModels]);

  useEffect(() => {
    localStorage.setItem('updateSpeed', updateSpeed);
  }, [updateSpeed]);

  useEffect(() => {
    localStorage.setItem('isTrading', isTrading.toString());
  }, [isTrading]);

  useEffect(() => {
    localStorage.setItem('initialValues', JSON.stringify(initialValues));
  }, [initialValues]);

  useEffect(() => {
    localStorage.setItem('lastSetStartingValue', lastSetStartingValue);
  }, [lastSetStartingValue]);

  // Calculate normalized value for a model
  const getNormalizedValue = (modelId) => {
    const model = modelsLatest[modelId];
    if (!model || typeof model.accountValue !== 'number') {
      return startValue;
    }

    if (!initialValues[modelId]) {
      return Math.round(model.accountValue);
    }

    const actualInitial = initialValues[modelId];
    const actualCurrent = model.accountValue;
    const percentChange = (actualCurrent - actualInitial) / actualInitial;

    return Math.round(startValue * (1 + percentChange));
  };

  // Debug logs
  useEffect(() => {
    console.log('Available models:', availableModels);
    console.log('Models latest values:', modelsLatest);
  }, [availableModels, modelsLatest]);

  useEffect(() => {
    console.log('Selected models:', selectedModels);
  }, [selectedModels]);

  // Monitor socket connection
  useEffect(() => {
    const handleConnect = () => {
      console.log('Socket connected');
      setSocketConnected(true);
    };
    const handleDisconnect = () => {
      console.log('Socket disconnected');
      setSocketConnected(false);
    };
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    setSocketConnected(socket.connected);
    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, []);

  // Send update speed to backend when it changes
  useEffect(() => {
    if (socketConnected) {
      socket.emit('setUpdateSpeed', parseInt(updateSpeed));
      console.log('Update speed set to:', updateSpeed, 'ms');
    }
  }, [updateSpeed, socketConnected]);

  // ✅ Monitor model values when trading is active (with P/L capture)
  useEffect(() => {
    if (!isTrading || selectedModels.length === 0) return;

    const stopLossValue = parseFloat(stopLoss);
    const profitTargetValue = parseFloat(profitTarget);

    // Calculate total current P/L
    const totalProfit = selectedModels.reduce((sum, modelId) => {
      const currentValue = getNormalizedValue(modelId);
      return sum + (currentValue - startValue);
    }, 0);

    selectedModels.forEach(modelId => {
      const model = modelsLatest[modelId];
      if (!model) return;

      const normalizedValue = getNormalizedValue(modelId);

      if (stopLossValue && normalizedValue <= stopLossValue) {
        setIsTrading(false);
        setTradingStopped(true);
        setFinalProfitLoss(totalProfit);
        setStopReason(
          `Stop Loss Hit! ${model.name || modelId} value fell to $${normalizedValue}`
        );
      }

      if (profitTargetValue && normalizedValue >= profitTargetValue) {
        setIsTrading(false);
        setTradingStopped(true);
        setFinalProfitLoss(totalProfit);
        setStopReason(
          `Profit Target Hit! ${model.name || modelId} value reached $${normalizedValue}`
        );
      }
    });
  }, [modelsLatest, isTrading, stopLoss, profitTarget, selectedModels, initialValues, startValue]);

  const handleStartingValueChange = (e) => {
    const value = e.target.value;
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setStartingValue(value);
      if (value !== '') {
        setLastSetStartingValue(value);
      }
    }
  };

  const handleStopLossChange = (e) => {
    const value = e.target.value;
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setStopLoss(value);
    }
  };

  const handleProfitTargetChange = (e) => {
    const value = e.target.value;
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setProfitTarget(value);
    }
  };

  const handleUpdateSpeedChange = (e) => {
    setUpdateSpeed(e.target.value);
  };

  const handleModelSelection = (modelId) => {
    console.log('Card clicked for model:', modelId);

    setSelectedModels(prevSelected => {
      const isAlreadySelected = prevSelected.includes(modelId);

      if (isAlreadySelected) {
        // Deselect: remove from monitoring models
        return prevSelected.filter(id => id !== modelId);
      } else {
        // Select: add to monitoring models
        // If trading is active, reset the baseline so this model starts at startingValue now
        if (isTrading) {
          setInitialValues(prevInit => {
            const model = modelsLatest[modelId];
            if (!model || typeof model.accountValue !== 'number') {
              return prevInit;
            }

            return {
              ...prevInit,
              // Set the "initial" actual account value to the current one,
              // so normalized value becomes exactly startingValue at this moment
              [modelId]: model.accountValue
            };
          });
        }

        return [...prevSelected, modelId];
      }
    });
  };

  /*const handleStartTrading = () => {
    if (selectedModels.length === 0) {
      alert('Please select at least one model to trade');
      return;
    }

    const sv = parseFloat(startingValue);
    if (!sv || sv <= 0) {
      alert('Please enter a valid starting value (must be greater than 0)');
      return;
    }

    if (!stopLoss && !profitTarget) {
      alert('Please enter at least one value (Stop Loss or Profit Target)');
      return;
    }

    const stopLossValue = parseFloat(stopLoss);
    const profitTargetValue = parseFloat(profitTarget);

    if (stopLoss && (isNaN(stopLossValue) || stopLossValue <= 0)) {
      alert('Please enter a valid Stop Loss value (must be greater than 0)');
      return;
    }

    if (profitTarget && (isNaN(profitTargetValue) || profitTargetValue <= 0)) {
      alert('Please enter a valid Profit Target value (must be greater than 0)');
      return;
    }

    const initVals = {};
    Object.keys(modelsLatest).forEach((id) => {
      const m = modelsLatest[id];
      initVals[id] = m?.accountValue || sv;
    });
    setInitialValues(initVals);

    setIsTrading(true);
    setTradingStopped(false);
    setStopReason('');
    setFinalProfitLoss(null);
  };*/

  const handleStartTrading = async () => {
  if (selectedModels.length === 0) {
    alert('Please select at least one model to trade');
    return;
  }

  const sv = parseFloat(startingValue);
  if (!sv || sv <= 0) {
    alert('Please enter a valid starting value (must be greater than 0)');
    return;
  }

  if (!stopLoss && !profitTarget) {
    alert('Please enter at least one value (Stop Loss or Profit Target)');
    return;
  }

  const stopLossValue = parseFloat(stopLoss);
  const profitTargetValue = parseFloat(profitTarget);

  if (stopLoss && (isNaN(stopLossValue) || stopLossValue <= 0)) {
    alert('Please enter a valid Stop Loss value (must be greater than 0)');
    return;
  }

  if (profitTarget && (isNaN(profitTargetValue) || profitTargetValue <= 0)) {
    alert('Please enter a valid Profit Target value (must be greater than 0)');
    return;
  }

  // --- existing simulator init ---
  const initVals = {};
  Object.keys(modelsLatest).forEach((id) => {
    const m = modelsLatest[id];
    initVals[id] = m?.accountValue || sv;
  });
  setInitialValues(initVals);

  setIsTrading(true);
  setTradingStopped(false);
  setStopReason('');
  setFinalProfitLoss(null);

  // --- NEW: open a small live BTC position on Gemini for the primary model ---
  if (!isGeminiConnected) {
    console.log('Gemini not connected, skipping live BUY at start.');
    return;
  }

  try {
    // Primary model = first selected model
    const primaryModelId = selectedModels[0];
    const primaryModel = modelsLatest[primaryModelId];
    const primaryModelName = primaryModel?.name || primaryModelId;

    // Choose a very small, safe amount to start with
    const amountToBuy = '0.0001'; // ~$8.93 at current BTC price

    //console.log(
    //  `[LIVE] Start Trading -> Buying ${amountToBuy} BTC on Gemini for primary model ${primaryModelName}`
    //);

    console.log(
      `[${geminiMode.toUpperCase()}] Start Trading -> Buying ${amountToBuy} BTC on Gemini for primary model ${primaryModelName}`
    );

    const result = await placeGeminiOrder({
      symbol: selectedSymbol, //'btcusd',
      side: 'buy',
      amount: amountToBuy,
      type: 'exchange market',  // market BUY
      modelId: primaryModelId,
      modelName: primaryModelName,
      closePosition: false,      // this is an opening trade, not closing
    });

    if (!result.success) {
      console.error('Failed to place initial BUY on Gemini:', result.error || result);
      setGeminiError(
        result.error || 'Failed to place initial BUY on Gemini when starting trading'
      );
    } else {
      console.log('✅ Initial BUY order placed on Gemini:', result.data || result);
      // Refresh Gemini panels so you see it immediately
      refreshGeminiBalances();
      refreshGeminiMarketTrades();
    }
  } catch (err) {
    console.error('Error while placing initial BUY on Gemini:', err);
    setGeminiError(
      err.message || 'Error while placing initial BUY on Gemini when starting trading'
    );
  }
};


 /* const handleStopTrading = () => {
    // Calculate final P/L before stopping
    const totalProfit = selectedModels.reduce((sum, modelId) => {
      const currentValue = getNormalizedValue(modelId);
      return sum + (currentValue - startValue);
    }, 0);

    setIsTrading(false);
    setTradingStopped(true);
    setFinalProfitLoss(totalProfit);
    setStopReason('Trading stopped manually');
  };*/

  const handleStopTrading = async () => {
    // 1) Existing simulator stop + P/L logic (unchanged)
    const totalProfit = selectedModels.reduce((sum, modelId) => {
      const currentValue = getNormalizedValue(modelId);
      return sum + (currentValue - startValue);
    }, 0);

    setIsTrading(false);
    setTradingStopped(true);
    setFinalProfitLoss(totalProfit);
    setStopReason('Trading stopped manually');

    // 2) LIVE GEMINI CLOSE: sell all BTC for the primary model at market

    // If Gemini isn't connected, we stop here (simulator-only stop)
    if (!isGeminiConnected) {
      console.log('Gemini not connected, skipping live BTC close.');
      return;
    }

    // Need at least one selected model to treat as "primary"
    if (!selectedModels || selectedModels.length === 0) {
      console.log('No selected models; skipping live BTC close.');
      return;
    }

    try {
      // Primary model = first in selectedModels at time of stop
      const primaryModelId = selectedModels[0];
      const primaryModel = modelsLatest[primaryModelId];
      const primaryModelName = primaryModel?.name || primaryModelId;

      // Find BTC balance from Gemini balances
      const btcBalanceEntry = geminiBalances.find(
        (b) =>
          b.currency === 'BTC' ||
          b.currency === 'btc' ||
          b.currency === 'XBT' ||
          b.currency === 'xbt'
      );

      if (!btcBalanceEntry) {
        console.log('No BTC balance found on Gemini; nothing to sell.');
        return;
      }

      const btcAmountRaw =
        btcBalanceEntry.amount || btcBalanceEntry.available || btcBalanceEntry.availableForWithdrawal;

      const btcAmount = typeof btcAmountRaw === 'number'
        ? btcAmountRaw
        : parseFloat(String(btcAmountRaw));

      if (!btcAmount || btcAmount <= 0) {
        console.log('BTC balance is zero or invalid; nothing to sell.');
        return;
      }

      // Gemini expects a string amount with correct precision
      const amountToSell = btcAmount.toString();

      //console.log(
      //  `[LIVE] Stop Trading -> Selling ALL BTC on Gemini: ${amountToSell} BTC (btcusd) for primary model ${primaryModelName}`
      //);

      console.log(
       `[${geminiMode.toUpperCase()}] Start Trading -> Buying ${amountToBuy} BTC on Gemini for primary model ${primaryModelName}`
      );

      // Market order: type = 'exchange market', no price needed
      const result = await placeGeminiOrder({
        symbol: selectedSymbol, //'btcusd',
        side: 'sell',
        amount: amountToSell,
        type: 'exchange market',
        modelId: primaryModelId,
        modelName: primaryModelName,
        closePosition: true, // tells backend to treat this as closing the position & log P&L
      });

      if (!result.success) {
        console.error('Failed to place BTC close order on Gemini:', result.error || result);
        setGeminiError(
          result.error || 'Failed to place BTC close order on Gemini when stopping trading'
        );
      } else {
        console.log('✅ BTC close order placed on Gemini:', result.data || result);
        // Optional: refresh balances and market trades right after closing
        refreshGeminiBalances();
        refreshGeminiMarketTrades();
      }
    } catch (err) {
      console.error('Error while closing BTC position on Gemini:', err);
      setGeminiError(
        err.message || 'Error while closing BTC position on Gemini when stopping trading'
      );
    }
  };

  const handleReset = () => {
    setIsTrading(false);
    setTradingStopped(false);
    setStopReason('');
    setFinalProfitLoss(null);
    setStopLoss('');
    setProfitTarget('');
    setStartingValue(lastSetStartingValue);
    setSelectedModels([]);
    setInitialValues({});

    localStorage.removeItem('stopLoss');
    localStorage.removeItem('profitTarget');
    localStorage.setItem('startingValue', lastSetStartingValue);
    localStorage.removeItem('selectedModels');
    localStorage.removeItem('isTrading');
    localStorage.removeItem('initialValues');
  };

  const nonSelectedModels = availableModels.filter((model, idx) => {
    const modelId = model.id || model.name || `model_${idx}`;
    return !selectedModels.includes(modelId);
  });

  // ✅ Format timestamp for trades table
  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  if (isLoadingAuth) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        backgroundColor: '#f5f5f5'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', marginBottom: '20px' }}>🔄</div>
          <div style={{ fontSize: '18px', color: '#666' }}>Loading...</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        fontFamily: 'Arial, sans-serif'
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '50px 40px',
          borderRadius: '16px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
          textAlign: 'center',
          maxWidth: '400px',
          width: '90%'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>📈</div>
          <h1 style={{ fontSize: '28px', marginBottom: '10px', color: '#333' }}>
            Crypto Trading Dashboard
          </h1>
          <p style={{ fontSize: '16px', color: '#666', marginBottom: '30px' }}>
            Sign in with Google to access your trading dashboard
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
            <div id="googleSignInButton"></div>
          </div>

          <div style={{ fontSize: '12px', color: '#999', marginTop: '30px', lineHeight: '1.6' }}>
            By signing in, you agree to our Terms of Service and Privacy Policy
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard" style={{ minHeight: '100vh', paddingBottom: '40px' }}>
      {/* User Info Header with Logout */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '15px 20px',
        backgroundColor: '#667eea',
        color: 'white',
        borderRadius: '8px',
        marginBottom: '20px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <h1 style={{ margin: 0, fontSize: '24px' }}>Crypto Trading Dashboard</h1>

        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <img
            src={userInfo?.picture}
            alt={userInfo?.name}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              border: '2px solid white'
            }}
          />
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{userInfo?.name}</div>
            <div style={{ fontSize: '12px', opacity: 0.9 }}>{userInfo?.email}</div>
          </div>
          <button
            onClick={handleLogout}
            style={{
              padding: '8px 16px',
              backgroundColor: 'rgba(255,255,255,0.2)',
              color: 'white',
              border: '1px solid white',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => e.target.style.backgroundColor = 'rgba(255,255,255,0.3)'}
            onMouseOut={(e) => e.target.style.backgroundColor = 'rgba(255,255,255,0.2)'}
          >
            Logout
          </button>
        </div>
      </div>

      {/* ✅ Trading Summary Panel */}
      <div
        style={{
          background: 'linear-gradient(135deg, #4CAF50 0%, #2e7d32 100%)',
          padding: '25px',
          borderRadius: '12px',
          marginBottom: '20px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          color: 'white'
        }}
      >
        <h2 style={{ margin: 0, marginBottom: '20px', fontSize: '22px', display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '28px' }}>📊</span>
            Trading Summary
          </span>
          <span style={{ fontSize: '13px', opacity: 0.9 }}>
            Selected Models: {selectedModels.length > 0 ? selectedModels.length : 'None'}
          </span>
        </h2>

        {/* ✅ Selected Models Display */}
        {selectedModels.length > 0 && (
          <div style={{ marginBottom: '15px', padding: '12px', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: '8px', backdropFilter: 'blur(10px)' }}>
            <div style={{ fontSize: '12px', marginBottom: '8px', opacity: 0.9 }}>Active Trading Models</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {selectedModels.map(modelId => {
                const model = modelsLatest[modelId];
                return (
                  <div
                    key={modelId}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: 'rgba(255,255,255,0.25)',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <span style={{ fontSize: '16px' }}>🤖</span>
                    {model?.name || modelId}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
          {/* Total Profit/Loss */}
          <div style={{ backgroundColor: 'rgba(255,255,255,0.15)', padding: '15px', borderRadius: '8px', backdropFilter: 'blur(10px)' }}>
            <div style={{ fontSize: '12px', marginBottom: '6px', opacity: 0.9 }}>Total Profit/Loss</div>
            <div style={{ fontSize: '22px', fontWeight: 'bold', color: finalProfitLoss !== null && finalProfitLoss >= 0 ? '#a5d6a7' : '#ef9a9a' }}>
              {finalProfitLoss !== null ? `${finalProfitLoss >= 0 ? '+' : ''}$${finalProfitLoss.toFixed(2)}` : '$0.00'}
            </div>
          </div>

          {/* Win Rate */}
          <div style={{ backgroundColor: 'rgba(255,255,255,0.15)', padding: '15px', borderRadius: '8px', backdropFilter: 'blur(10px)' }}>
            <div style={{ fontSize: '12px', marginBottom: '6px', opacity: 0.9 }}>Win Rate</div>
            <div style={{ fontSize: '22px', fontWeight: 'bold' }}>
              {(() => {
                const totalTrades = trades.length;
                const winningTrades = trades.filter(t => t.profit > 0).length;
                return totalTrades > 0 ? `${((winningTrades / totalTrades) * 100).toFixed(1)}%` : '0.0%';
              })()}
            </div>
          </div>

          {/* Total Trades */}
          <div style={{ backgroundColor: 'rgba(255,255,255,0.15)', padding: '15px', borderRadius: '8px', backdropFilter: 'blur(10px)' }}>
            <div style={{ fontSize: '12px', marginBottom: '6px', opacity: 0.9 }}>Total Trades</div>
            <div style={{ fontSize: '22px', fontWeight: 'bold' }}>
              {trades.length}
            </div>
          </div>

          {/* Winning Trades */}
          <div style={{ backgroundColor: 'rgba(255,255,255,0.15)', padding: '15px', borderRadius: '8px', backdropFilter: 'blur(10px)' }}>
            <div style={{ fontSize: '12px', marginBottom: '6px', opacity: 0.9 }}>Winning Trades</div>
            <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#a5d6a7' }}>
              {trades.filter(t => t.profit > 0).length}
            </div>
          </div>

          {/* Losing Trades */}
          <div style={{ backgroundColor: 'rgba(255,255,255,0.15)', padding: '15px', borderRadius: '8px', backdropFilter: 'blur(10px)' }}>
            <div style={{ fontSize: '12px', marginBottom: '6px', opacity: 0.9 }}>Losing Trades</div>
            <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#ef9a9a' }}>
              {trades.filter(t => t.profit < 0).length}
            </div>
          </div>
        </div>

        {/* Stop Reason */}
        {stopReason && (
          <div style={{ marginTop: '15px', padding: '12px', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: '8px', backdropFilter: 'blur(10px)' }}>
            <div style={{ fontSize: '12px', marginBottom: '6px', opacity: 0.9 }}>Stop Reason</div>
            <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{stopReason}</div>
          </div>
        )}
      </div>

      {/* ✅ Gemini Connection Panel */}
      <div
        style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: '20px',
          borderRadius: '12px',
          marginBottom: '20px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          color: 'white'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
          <div style={{ flex: 1, minWidth: '250px' }}>
            <h3 style={{ margin: 0, marginBottom: '8px', fontSize: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '28px' }}>💎</span>
              Gemini Trading Account
            </h3>

           {/* Mode toggle */}
            <div style={{ marginTop: '8px', marginBottom: '10px', fontSize: '13px' }}>
              <span style={{ marginRight: '8px', fontWeight: 'bold' }}>Environment:</span>
              <label style={{ marginRight: '10px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="geminiEnv"
                  value="live"
                  checked={geminiMode === 'live'}
                  onChange={() => {
                    setGeminiMode('live');
                    // Optional: refresh balances/trades when switching
                    if (isGeminiConnected) {
                      refreshGeminiBalances();
                      refreshGeminiMarketTrades(selectedSymbol);
                    }
                  }}
                  style={{ marginRight: '4px' }}
                />
                Live
              </label>
              <label style={{ cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="geminiEnv"
                  value="sandbox"
                  checked={geminiMode === 'sandbox'}
                  onChange={() => {
                    setGeminiMode('sandbox');
                    if (isGeminiConnected) {
                      refreshGeminiBalances();
                      refreshGeminiMarketTrades(selectedSymbol);
                    }
                  }}
                  style={{ marginRight: '4px' }}
                />
                Sandbox
              </label>
            </div> 

            {!isGeminiConnected ? (
              <>
                <p style={{ margin: 0, fontSize: '14px', opacity: 0.9, marginBottom: '12px' }}>
                  Connect your Gemini account to view your real balance and place trades
                </p>
                <button
                  onClick={handleOpenGeminiModal}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: 'white',
                    color: '#667eea',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '15px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                    transition: 'transform 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                  onMouseOver={(e) => e.target.style.transform = 'translateY(-2px)'}
                  onMouseOut={(e) => e.target.style.transform = 'translateY(0)'}
                >
                  <span style={{ fontSize: '18px' }}>🔗</span>
                  Connect Gemini Account
                </button>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <span style={{ fontSize: '20px' }}>✅</span>
                  <span style={{ fontSize: '15px', fontWeight: 'bold' }}>Connected Successfully</span>
                  {geminiMode === 'live' ? (
                    <span
                      style={{
                        marginLeft: '10px',
                        padding: '4px 12px',
                        backgroundColor: '#e8f5e9',
                        color: '#2e7d32',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        border: '1px solid #66bb6a',
                      }}
                    >
                        🔵 LIVE
                      </span>
                    ) : (
                    <span
                      style={{
                        marginLeft: '10px',
                        padding: '4px 12px',
                        backgroundColor: '#fff3e0',
                        color: '#f57c00',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        border: '1px solid #ff9800',
                      }}
                    >
                      🧪 SANDBOX
                    </span>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: '13px', opacity: 0.9, marginBottom: '12px' }}>
                  Your Gemini account is connected. Viewing real balance.
                </p>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => refreshGeminiBalances()}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: 'rgba(255,255,255,0.2)',
                      color: 'white',
                      border: '1px solid white',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseOver={(e) => e.target.style.backgroundColor = 'rgba(255,255,255,0.3)'}
                    onMouseOut={(e) => e.target.style.backgroundColor = 'rgba(255,255,255,0.2)'}
                  >
                    🔄 Refresh
                  </button>
                  
                  <button
                    onClick={handleGeminiDisconnect}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: 'rgba(255,255,255,0.2)',
                      color: 'white',
                      border: '1px solid white',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseOver={(e) => e.target.style.backgroundColor = 'rgba(255,255,255,0.3)'}
                    onMouseOut={(e) => e.target.style.backgroundColor = 'rgba(255,255,255,0.2)'}
                  >
                    Disconnect
                  </button>
                </div>
              </>
            )}
          </div>

          {isGeminiConnected && geminiBalances && (
            <div
              style={{
                backgroundColor: 'rgba(255,255,255,0.15)',
                padding: '15px 20px',
                borderRadius: '10px',
                minWidth: '220px',
                backdropFilter: 'blur(10px)'
              }}
            >
              <div style={{ fontSize: '13px', marginBottom: '8px', opacity: 0.9 }}>Account Balance</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '10px' }}>
                ${geminiBalances.totalUsd?.toLocaleString() || '0'}
              </div>
              <div style={{ fontSize: '12px', opacity: 0.85, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <div>BTC: {geminiBalances.btc || '0'}</div>
                <div>ETH: {geminiBalances.eth || '0'}</div>
                <div>SOL: {geminiBalances.sol || '0'}</div>
                <div>USDC: ${geminiBalances.usdc?.toLocaleString() || '0'}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ✅ Gemini Connection Modal */}
      {showGeminiModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999,
            backdropFilter: 'blur(4px)'
          }}
          onClick={handleCloseGeminiModal}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '16px',
              padding: '30px',
              maxWidth: '520px',
              width: '90%',
              boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleCloseGeminiModal}
              style={{
                position: 'absolute',
                top: '15px',
                right: '15px',
                background: 'none',
                border: 'none',
                fontSize: '24px',
                cursor: 'pointer',
                color: '#999',
                lineHeight: 1
              }}
            >
              ×
            </button>

            <div style={{ textAlign: 'center', marginBottom: '25px' }}>
              <div style={{ fontSize: '48px', marginBottom: '10px' }}>💎</div>
              <h2 style={{ margin: 0, marginBottom: '8px', color: '#333' }}>Connect to Gemini</h2>
              <p style={{ margin: 0, fontSize: '14px', color: '#666' }}>
                View your real Gemini balance and place trades
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '25px' }}>
              {[1, 2, 3].map((step) => (
                <div
                  key={step}
                  style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '50%',
                    backgroundColor: geminiStep >= step ? '#667eea' : '#e0e0e0',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    transition: 'all 0.3s'
                  }}
                >
                  {geminiStep > step ? '✓' : step}
                </div>
              ))}
            </div>

            {geminiStep === 1 && (
              <div>
                <h3 style={{ fontSize: '16px', marginBottom: '15px', color: '#333' }}>
                  Step 1: Get Your API Credentials
                </h3>
                <ol style={{ paddingLeft: '20px', fontSize: '14px', color: '#555', lineHeight: '1.8' }}>
                  <li>Click the button below to open Gemini in a new tab</li>
                  <li>Login to your Gemini account</li>
                  <li>Go to <strong>Settings → API</strong></li>
                  <li>Create a new API key with <strong>Trading</strong> permissions</li>
                  <li>Copy both the <strong>API Key</strong> and <strong>Secret</strong></li>
                </ol>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '15px' }}>
                  <button
                    onClick={handleOpenGeminiSite}
                    style={{
                      width: '100%',
                      padding: '12px',
                      backgroundColor: '#667eea',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '15px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseOver={(e) => e.target.style.backgroundColor = '#5568d3'}
                    onMouseOut={(e) => e.target.style.backgroundColor = '#667eea'}
                  >
                    <span>🔗</span>
                    Open Gemini API Settings
                  </button>

                  <button
                    onClick={() => setGeminiStep(2)}
                    style={{
                      width: '100%',
                      padding: '12px',
                      backgroundColor: '#ffffff',
                      color: '#333',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      transition: 'all 0.2s'
                    }}
                    onMouseOver={(e) => {
                      e.target.style.backgroundColor = '#f9fafb';
                      e.target.style.borderColor = '#9ca3af';
                    }}
                    onMouseOut={(e) => {
                      e.target.style.backgroundColor = '#ffffff';
                      e.target.style.borderColor = '#d1d5db';
                    }}
                  >
                    <span style={{ fontSize: '16px' }}>⏭️</span>
                    I already have my API Key & Secret
                  </button>
                </div>
              </div>
            )}

            {geminiStep === 2 && (
              <div>
                <h3 style={{ fontSize: '16px', marginBottom: '15px', color: '#333' }}>
                  Step 2: Enter Your Credentials
                </h3>
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 'bold', color: '#555' }}>
                    API Key
                  </label>
                  <input
                    type="text"
                    value={geminiApiKey}
                    onChange={(e) => setGeminiApiKey(e.target.value.trim())}
                    placeholder="Enter your Gemini API Key"
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '2px solid #e0e0e0',
                      borderRadius: '6px',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 'bold', color: '#555' }}>
                    API Secret
                  </label>
                  <input
                    type="password"
                    value={geminiApiSecret}
                    onChange={(e) => setGeminiApiSecret(e.target.value.trim())}
                    placeholder="Enter your Gemini API Secret"
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '2px solid #e0e0e0',
                      borderRadius: '6px',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {geminiError && (
                  <div style={{
                    padding: '10px',
                    backgroundColor: '#ffebee',
                    color: '#c62828',
                    borderRadius: '6px',
                    fontSize: '13px',
                    marginBottom: '15px'
                  }}>
                    {geminiError}
                  </div>
                )}

                <button
                  onClick={handleGeminiAuthorize}
                  disabled={isGeminiConnecting}
                  style={{
                    width: '100%',
                    padding: '12px',
                    backgroundColor: isGeminiConnecting ? '#b0b0b0' : '#4caf50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '15px',
                    fontWeight: 'bold',
                    cursor: isGeminiConnecting ? 'wait' : 'pointer'
                  }}
                >
                  {isGeminiConnecting ? 'Authorizing...' : 'Authorize Connection'}
                </button>
              </div>
            )}

            {geminiStep === 3 && (
              <div style={{ textAlign: 'center', padding: '30px 0' }}>
                <div style={{ fontSize: '48px', marginBottom: '15px' }}>🔄</div>
                <h3 style={{ fontSize: '18px', marginBottom: '10px', color: '#333' }}>
                  Connecting to Gemini...
                </h3>
                <p style={{ fontSize: '14px', color: '#666' }}>
                  Please wait while we fetch your balance
                </p>
              </div>
            )}

            <div style={{
              marginTop: '20px',
              padding: '12px',
              backgroundColor: '#f5f5f5',
              borderRadius: '8px',
              fontSize: '11px',
              color: '#666',
              lineHeight: '1.5'
            }}>
              🔒 <strong>Security Note:</strong> Your credentials are stored in your browser only.
              Use API keys with appropriate permissions for your needs.
            </div>
          </div>
        </div>
      )}

      {/* ✅ Manual Trading Modal */}
      {showTradeModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999,
            backdropFilter: 'blur(4px)'
          }}
          onClick={() => setShowTradeModal(false)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '16px',
              padding: '30px',
              maxWidth: '500px',
              width: '90%',
              boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0, marginBottom: '20px' }}>Place Manual Order</h2>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>
                Symbol
              </label>
              <select
                value={tradeSymbol}
                onChange={(e) => setTradeSymbol(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '2px solid #e0e0e0',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              >
                <option value="btcusd">BTC/USD</option>
                <option value="ethusd">ETH/USD</option>
                <option value="solusd">SOL/USD</option>
              </select>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>
                Side
              </label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => setTradeSide('buy')}
                  style={{
                    flex: 1,
                    padding: '10px',
                    backgroundColor: tradeSide === 'buy' ? '#4caf50' : '#f5f5f5',
                    color: tradeSide === 'buy' ? 'white' : '#333',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  BUY
                </button>
                <button
                  onClick={() => setTradeSide('sell')}
                  style={{
                    flex: 1,
                    padding: '10px',
                    backgroundColor: tradeSide === 'sell' ? '#f44336' : '#f5f5f5',
                    color: tradeSide === 'sell' ? 'white' : '#333',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  SELL
                </button>
              </div>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>
                Amount
              </label>
              <input
                type="number"
                step="0.0001"
                value={tradeAmount}
                onChange={(e) => setTradeAmount(e.target.value)}
                placeholder="e.g., 0.001"
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '2px solid #e0e0e0',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>
                Price (USD)
              </label>
              <input
                type="number"
                step="0.01"
                value={tradePrice}
                onChange={(e) => setTradePrice(e.target.value)}
                placeholder="e.g., 95000"
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '2px solid #e0e0e0',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              />
            </div>

            {geminiError && (
              <div style={{
                padding: '10px',
                backgroundColor: '#ffebee',
                color: '#c62828',
                borderRadius: '6px',
                fontSize: '13px',
                marginBottom: '15px'
              }}>
                {geminiError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={async () => {
                  setIsPlacingOrder(true);
                  setGeminiError(null);

                  const result = await placeGeminiOrder({
                    symbol: tradeSymbol,
                    side: tradeSide,
                    amount: tradeAmount,
                    price: tradePrice
                  });

                  setIsPlacingOrder(false);

                  if (result.success) {
                    alert(`Order placed successfully! Order ID: ${result.data.order_id}`);
                    setShowTradeModal(false);
                    setTradeAmount('');
                    setTradePrice('');
                    refreshGeminiBalances();
                    refreshGeminiMarketTrades();
                  }
                }}
                disabled={isPlacingOrder || !tradeAmount || !tradePrice}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: isPlacingOrder || !tradeAmount || !tradePrice ? '#b0b0b0' : '#4caf50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '15px',
                  fontWeight: 'bold',
                  cursor: isPlacingOrder || !tradeAmount || !tradePrice ? 'not-allowed' : 'pointer'
                }}
              >
                {isPlacingOrder ? 'Placing Order...' : 'Place Order'}
              </button>
              <button
                onClick={() => setShowTradeModal(false)}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: '#f5f5f5',
                  color: '#333',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '15px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>

            <div style={{
              marginTop: '15px',
              padding: '10px',
              backgroundColor: '#fff3e0',
              borderRadius: '6px',
              fontSize: '11px',
              color: '#666'
            }}>
              ⚠️ <strong>Warning:</strong> This will place a 
              {geminiMode === 'live' ? ' real order on Gemini with real money.' : ' test order on Gemini Sandbox (no real money).'}
              Double-check all values before confirming.
            </div>
          </div>
        </div>
      )}

      

      {/* Debug Info Panel */}
      <div
        style={{
          background: socketConnected ? '#e8f5e9' : '#ffebee',
          padding: '15px',
          borderRadius: '8px',
          marginBottom: '20px',
          border: `2px solid ${socketConnected ? '#4CAF50' : '#f44336'}`
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: '10px' }}>Connection Status</h3>
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', fontSize: '14px' }}>
          <div>
            <strong>Socket:</strong> {socketConnected ? '🟢 Connected' : '🔴 Disconnected'}
          </div>
          <div>
            <strong>BTC Price:</strong>{' '}
            {currentPrice ? `$${currentPrice.toFixed(2)}` : '❌ Not Available'}
          </div>
          <div>
            <strong>Models Loaded:</strong>{' '}
            {availableModels.length > 0 ? `✅ ${availableModels.length} models` : '❌ No models'}
          </div>
          <div>
            <strong>Selected Models:</strong>{' '}
            {selectedModels.length > 0 ? `✅ ${selectedModels.length} selected` : '⚠️ None selected'}
          </div>
          <div>
            <strong>Update Speed:</strong> {parseInt(updateSpeed) / 1000}s
          </div>
          <div>
            <strong>Trading Mode:</strong>{' '}
            {isGeminiConnected ? '💎 Gemini (Live)' : isMockTrading ? '🎮 Mock' : '⚪ Inactive'}
          </div>
          <div>
            <strong>Trading Status:</strong>{' '}
            {isTrading ? '🟢 Active' : '⚪ Inactive'}
          </div>
        </div>
      </div>

      {/* Update Speed Control */}
      <div
        style={{
          background: '#fff3e0',
          padding: '15px',
          borderRadius: '8px',
          marginBottom: '20px',
          border: '2px solid #ff9800'
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: '10px' }}>⚡ Trading Speed Control</h3>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontWeight: 'bold' }}>Update Interval:</label>
          <select
            value={updateSpeed}
            onChange={handleUpdateSpeedChange}
            style={{
              padding: '8px 12px',
              fontSize: '14px',
              borderRadius: '4px',
              border: '2px solid #ff9800',
              backgroundColor: 'white',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            {speedPresets.map(preset => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </select>
          <span style={{ fontSize: '13px', color: '#666' }}>
            Models and prices will update every {parseInt(updateSpeed) / 1000} second{parseInt(updateSpeed) !== 1000 ? 's' : ''}
          </span>
          <span style={{ fontSize: '12px', color: '#4CAF50', fontWeight: 'bold', marginLeft: 'auto' }}>
            ✓ Settings saved automatically
          </span>
        </div>
      </div>

      {/* MODEL SELECTION */}
      {availableModels.length > 0 && (
        <div
          style={{
            background: '#f0f4ff',
            padding: '20px',
            borderRadius: '8px',
            marginBottom: '20px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}
        >
          <h2 style={{ marginTop: 0 }}>Select Trading Models</h2>
          <div style={{ fontSize: '14px', color: '#666', marginBottom: '15px' }}>
            Click on a card to select/deselect models for trading. Watch the live values change in real-time!
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            {availableModels.map((model, index) => {
              const modelId = model.id || model.name || `model_${index}`;
              const isSelected = selectedModels.includes(modelId);
              const color = model.color || '#1976d2';

              const currentValue = getNormalizedValue(modelId);

              let pnl = 0;
              let pnlPercent = 0;
              if (isTrading && initialValues[modelId]) {
                pnl = currentValue - startValue;
                pnlPercent = ((pnl / startValue) * 100).toFixed(2);
              }

              return (
                <div
                  key={modelId}
                  onClick={() => handleModelSelection(modelId)}
                  style={{
                    padding: '15px',
                    borderRadius: '10px',
                    backgroundColor: isSelected ? '#e3f2fd' : '#ffffff',
                    border: `3px solid ${isSelected ? color : '#cccccc'}`,
                    minWidth: '200px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: isSelected
                      ? '0 4px 10px rgba(25, 118, 210, 0.3)'
                      : '0 1px 3px rgba(0,0,0,0.15)',
                    transform: isSelected ? 'translateY(-2px)' : 'translateY(0)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        backgroundColor: isSelected ? color : '#eeeeee',
                        border: `1px solid ${isSelected ? color : '#bdbdbd'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        flexShrink: 0
                      }}
                    >
                      {isSelected ? '✓' : ''}
                    </div>
                    <div style={{ fontWeight: 'bold', fontSize: '15px', color: '#333' }}>
                      {model.name || modelId}
                    </div>
                  </div>

                  <div style={{ fontSize: '20px', fontWeight: 'bold', color }}>
                    ${currentValue.toLocaleString()}
                  </div>

                  {isTrading && initialValues[modelId] != null && (
                    <div
                      style={{
                        fontSize: '12px',
                        marginTop: '2px',
                        color: pnl >= 0 ? '#2e7d32' : '#c62828'
                      }}
                    >
                      {pnl >= 0 ? '▲' : '▼'} ${Math.abs(pnl).toLocaleString()} ({pnlPercent}%)
                    </div>
                  )}

                  {!isTrading && (
                    <div style={{ fontSize: '11px', color: '#4CAF50', fontWeight: 'bold' }}>
                      🔴 LIVE
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TRADING CONTROLS */}
      <div
        className="trading-controls"
        style={{
          background: '#f5f5f5',
          padding: '20px',
          borderRadius: '8px',
          marginBottom: '20px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}
      >
        <h2>Trading Controls</h2>

        <div style={{ display: 'flex', gap: '20px', marginBottom: '15px', flexWrap: 'wrap' }}>
          {/* ✅ NEW: Symbol Selection Dropdown */}
          <div style={{ flex: '1', minWidth: '200px' }}>
       pbb     <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Trading Symbol:
            </label>
            <select
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
              disabled={isTrading}
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '16px',
                borderRadius: '4px',
                border: '1px solid #ccc',
                backgroundColor: isTrading ? '#f5f5f5' : 'white',
                cursor: isTrading ? 'not-allowed' : 'pointer'
              }}
            >
              {AVAILABLE_SYMBOLS.map((symbol) => (
                <option key={symbol.value} value={symbol.value}>
                  {symbol.label}
                </option>
              ))}
            </select>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
              Select which cryptocurrency to trade
            </div>
          </div>
          <div style={{ flex: '1', minWidth: '200px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Starting Value ($):
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={startingValue}
              onChange={handleStartingValueChange}
              disabled={isTrading}
              placeholder="e.g., 1000"
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '16px',
                borderRadius: '4px',
                border: '1px solid #ccc',
                backgroundColor: isTrading ? '#f5f5f5' : 'white'
              }}
            />
            <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
              All models will start from this value when trading begins
            </div>
          </div>

          <div style={{ flex: '1', minWidth: '200px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Stop Loss ($):
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={stopLoss}
              onChange={handleStopLossChange}
              disabled={isTrading}
              placeholder="e.g., 950"
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '16px',
                borderRadius: '4px',
                border: '1px solid #ccc'
              }}
            />
            <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
              Suggested: ${(startValue * 0.98).toFixed(0)} (2% below starting value)
            </div>
          </div>

          <div style={{ flex: '1', minWidth: '200px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Profit Target ($):
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={profitTarget}
              onChange={handleProfitTargetChange}
              disabled={isTrading}
              placeholder="e.g., 1050"
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '16px',
                borderRadius: '4px',
                border: '1px solid #ccc'
              }}
            />
            <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
              Suggested: ${(startValue * 1.03).toFixed(0)} (3% above starting value)
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: '10px',
            marginBottom: '15px',
            flexWrap: 'wrap',
            alignItems: 'center'
          }}
        >
          <button
            onClick={handleStartTrading}
            disabled={isTrading || selectedModels.length === 0}
            style={{
              padding: '12px 24px',
              fontSize: '16px',
              fontWeight: 'bold',
              backgroundColor:
                isTrading || selectedModels.length === 0 ? '#ccc' : '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor:
                isTrading || selectedModels.length === 0 ? 'not-allowed' : 'pointer'
            }}
          >
            Start Trading
          </button>

          {selectedModels.length === 0 && !isTrading && (
            <span
              style={{
                fontSize: '14px',
                color: '#f57c00',
                fontWeight: 'bold',
                backgroundColor: '#fff3e0',
                padding: '8px 12px',
                borderRadius: '4px',
                border: '1px solid #ff9800'
              }}
            >
              👈 Select models first to enable
            </span>
          )}

          <button
            onClick={handleStopTrading}
            disabled={!isTrading}
            style={{
              padding: '12px 24px',
              fontSize: '16px',
              fontWeight: 'bold',
              backgroundColor: !isTrading ? '#ccc' : '#f44336',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: !isTrading ? 'not-allowed' : 'pointer'
            }}
          >
            Stop Trading
          </button>

          {(tradingStopped || (isTrading && selectedModels.length > 0)) && (
            <button
              onClick={handleReset}
              style={{
                padding: '12px 24px',
                fontSize: '16px',
                fontWeight: 'bold',
                backgroundColor: '#2196F3',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Reset
            </button>
          )}
        </div>

        {selectedModels.length === 0 && !isTrading && (
          <div
            style={{
              padding: '10px',
              backgroundColor: '#fff3e0',
              borderRadius: '4px',
              border: '1px solid #ff9800',
              marginBottom: '15px'
            }}
          >
            ⚠️ Please select at least one model to start trading
          </div>
        )}

        {/* Status Display */}
        <div style={{ marginTop: '15px' }}>
          <div
            style={{
              padding: '10px',
              borderRadius: '4px',
              backgroundColor: isTrading
                ? '#e8f5e9'
                : tradingStopped
                ? '#ffebee'
                : '#fff3e0',
              border: `2px solid ${
                isTrading ? '#4CAF50' : tradingStopped ? '#f44336' : '#ff9800'
              }`
            }}
          >
            <strong>Status: </strong>
            {isTrading
              ? '🟢 Trading Active (Persisted across refresh)'
              : tradingStopped
              ? '🔴 Trading Stopped'
              : '🟡 Ready to Trade'}
          </div>

          {isTrading && (
            <div
              style={{
                marginTop: '10px',
                fontSize: '14px',
                padding: '12px',
                backgroundColor: '#e3f2fd',
                borderRadius: '4px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
                <strong>Monitoring Models (All started at ${startValue.toLocaleString()}):</strong>

                {(() => {
                  const totalProfit = selectedModels.reduce((sum, modelId) => {
                    const currentValue = getNormalizedValue(modelId);
                    return sum + (currentValue - startValue);
                  }, 0);
                  const totalProfitPercent = ((totalProfit / (startValue * selectedModels.length)) * 100).toFixed(2);

                  return (
                    <div
                      style={{
                        padding: '10px 20px',
                        borderRadius: '6px',
                        backgroundColor: '#ffffff',
                        border: '2px solid #1976d2',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
                      }}
                    >
                      <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
                        {selectedModels.length > 1 ? 'Total Profit/Loss' : 'Profit/Loss'}
                      </div>
                      <div
                        style={{
                          fontSize: '20px',
                          fontWeight: 'bold',
                          color: totalProfit >= 0 ? '#2e7d32' : '#c62828'
                        }}
                      >
                        {totalProfit >= 0 ? '+' : ''}${totalProfit.toLocaleString()} ({totalProfitPercent}%)
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                {selectedModels.map(modelId => {
                  const model = modelsLatest[modelId];
                  if (!model) return null;

                  const normalizedValue = getNormalizedValue(modelId);
                  const pnl = normalizedValue - startValue;
                  const pnlPercent = ((pnl / startValue) * 100).toFixed(2);
                  const color = model.color || '#1976d2';

                  return (
                    <div
                      key={modelId}
                      onClick={() => handleModelSelection(modelId)}
                      style={{
                        padding: '15px',
                        borderRadius: '10px',
                        backgroundColor: '#ffffff',
                        border: `3px solid ${color}`,
                        minWidth: '200px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        boxShadow: '0 4px 10px rgba(25, 118, 210, 0.3)',
                        transform: 'translateY(0)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 6px 14px rgba(25, 118, 210, 0.4)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 4px 10px rgba(25, 118, 210, 0.3)';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div
                          style={{
                            width: '22px',
                            height: '22px',
                            borderRadius: '50%',
                            backgroundColor: color,
                            border: `1px solid ${color}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            fontSize: '14px',
                            fontWeight: 'bold',
                            flexShrink: 0
                          }}
                        >
                          ✓
                        </div>
                        <div style={{ fontWeight: 'bold', fontSize: '15px', color: '#333' }}>
                          {model.name || modelId}
                        </div>
                      </div>

                      <div style={{ fontSize: '20px', fontWeight: 'bold', color }}>
                        ${normalizedValue.toLocaleString()}
                      </div>

                      <div
                        style={{
                          fontSize: '12px',
                          marginTop: '2px',
                          color: pnl >= 0 ? '#2e7d32' : '#c62828'
                        }}
                      >
                        {pnl >= 0 ? '▲' : '▼'} ${Math.abs(pnl).toLocaleString()} ({pnlPercent}%)
                      </div>

                      <div style={{ fontSize: '11px', color: '#4CAF50', fontWeight: 'bold' }}>
                        🔴 LIVE
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {stopReason && (
            <div
              style={{
                marginTop: '10px',
                padding: '12px',
                backgroundColor: '#ffebee',
                borderRadius: '4px',
                border: '2px solid #f44336'
              }}
            >
              <div style={{ color: '#c62828', fontWeight: 'bold', marginBottom: '8px' }}>
                {stopReason}
              </div>
              {finalProfitLoss !== null && (
                <div
                  style={{
                    fontSize: '18px',
                    fontWeight: 'bold',
                    color: finalProfitLoss >= 0 ? '#2e7d32' : '#c62828',
                    marginTop: '8px'
                  }}
                >
                  Final Profit/Loss: {finalProfitLoss >= 0 ? '+' : ''}${finalProfitLoss.toFixed(2)} USD
                </div>
              )}
            </div>
          )}
        </div>

        {/* Other Models Overview */}
        {availableModels.length > 0 && (
          <div
            style={{
              marginTop: '20px',
              padding: '15px',
              borderRadius: '8px',
              backgroundColor: '#f0f4ff',
              border: '1px solid #90caf9'
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: '12px' }}>
              Other Models Overview (Live Values)
              {selectedModels.length > 0 && (
                <span style={{ fontSize: '14px', fontWeight: 'normal', color: '#666', marginLeft: '10px' }}>
                  ({nonSelectedModels.length} not selected)
                </span>
              )}
            </h3>

            {isTrading && nonSelectedModels.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '10px',
                  marginBottom: '12px'
                }}
              >
                <div style={{ fontSize: '13px', color: '#555', fontWeight: 'bold' }}>
                  Total P/L for Other Models:
                </div>

                {(() => {
                  const otherTotalProfit = nonSelectedModels.reduce((sum, model, idx) => {
                    const modelId = model.id || model.name || `model_${idx}`;
                    const currentValue = getNormalizedValue(modelId);
                    return sum + (currentValue - startValue);
                  }, 0);

                  const denom = startValue * nonSelectedModels.length;
                  const otherTotalProfitPercent = denom > 0 ? ((otherTotalProfit / denom) * 100).toFixed(2) : '0.00';

                  return (
                    <div
                      style={{
                        padding: '10px 16px',
                        borderRadius: '6px',
                        backgroundColor: '#ffffff',
                        border: '2px solid #90caf9',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
                        fontWeight: 'bold',
                        fontSize: '18px',
                        color: otherTotalProfit >= 0 ? '#2e7d32' : '#c62828'
                      }}
                    >
                      {otherTotalProfit >= 0 ? '+' : ''}${Math.abs(Math.round(otherTotalProfit)).toLocaleString()} ({otherTotalProfitPercent}%)
                    </div>
                  );
                })()}
              </div>
            )}

            {nonSelectedModels.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#666', fontSize: '14px', fontStyle: 'italic' }}>
                All models are currently selected for trading
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                {nonSelectedModels.map((model, idx) => {
                  const modelId = model.id || model.name || `model_${idx}`;
                  const currentValue = getNormalizedValue(modelId);
                  const color = model.color || '#1976d2';

                  let pnl = 0;
                  let pnlPercent = '0.00';
                  if (isTrading && initialValues[modelId] != null) {
                    pnl = currentValue - startValue;
                    pnlPercent = ((pnl / startValue) * 100).toFixed(2);
                  }

                  return (
                    <div
                      key={modelId}
                      onClick={() => handleModelSelection(modelId)}
                      style={{
                        padding: '15px',
                        borderRadius: '10px',
                        backgroundColor: '#ffffff',
                        border: `3px solid #cccccc`,
                        minWidth: '200px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                        transform: 'translateY(0)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 4px 10px rgba(0,0,0,0.25)';
                        e.currentTarget.style.border = `3px solid ${color}`;
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.15)';
                        e.currentTarget.style.border = '3px solid #cccccc';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div
                          style={{
                            width: '22px',
                            height: '22px',
                            borderRadius: '50%',
                            backgroundColor: '#eeeeee',
                            border: '1px solid #bdbdbd',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            fontSize: '14px',
                            fontWeight: 'bold',
                            flexShrink: 0
                          }}
                        >
                        </div>
                        <div style={{ fontWeight: 'bold', fontSize: '15px', color: '#333' }}>
                          {model.name || modelId}
                        </div>
                      </div>

                      <div style={{ fontSize: '20px', fontWeight: 'bold', color }}>
                        ${currentValue.toLocaleString()}
                      </div>

                      {isTrading && initialValues[modelId] != null && (
                        <div
                          style={{
                            fontSize: '12px',
                            marginTop: '2px',
                            color: pnl >= 0 ? '#2e7d32' : '#c62828'
                          }}
                        >
                          {pnl >= 0 ? '▲' : '▼'} ${Math.abs(pnl).toLocaleString()} ({pnlPercent}%)
                        </div>
                      )}

                      {!isTrading && (
                        <div style={{ fontSize: '11px', color: '#4CAF50', fontWeight: 'bold' }}>
                          🔴 LIVE
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ✅ Last 20 Market Trades from Gemini */}
      {isGeminiConnected && (
        <div
          style={{
            background: '#ffffff',
            padding: '20px',
            borderRadius: '8px',
            marginBottom: '20px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h2 style={{ margin: 0 }}>💎 Last 20 Market Trades (Gemini)</h2>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => refreshGeminiMarketTrades(selectedSymbol)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#667eea',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                🔄 Refresh
              </button>
              
            </div>
          </div>

          {geminiLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
              Loading market trades...
            </div>
          ) : (liveGeminiTrades.length === 0 && geminiMarketTrades.length === 0) ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#666', fontStyle: 'italic' }}>
              No market trades available
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f5f5f5', borderBottom: '2px solid #ddd' }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Time</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Model</th>
                    <th style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold' }}>Type</th>
                    <th style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold' }}>Price</th>
                    <th style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold' }}>Amount</th>
                    <th style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(liveGeminiTrades.length > 0 ? liveGeminiTrades : geminiMarketTrades).map((trade, index) => (
                    <tr
                      key={trade.tid || index}
                      style={{ borderBottom: '1px solid #eee' }}
                    >
                      <td style={{ padding: '12px', color: '#666' }}>
                        {new Date(trade.timestampms).toLocaleTimeString()}
                      </td>
                      <td>{trade.modelName || trade.modelId || '-'}</td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <span
                          style={{
                            padding: '4px 12px',
                            borderRadius: '4px',
                            fontWeight: 'bold',
                            fontSize: '12px',
                            backgroundColor: trade.type === 'buy' ? '#e8f5e9' : '#ffebee',
                            color: trade.type === 'buy' ? '#2e7d32' : '#c62828'
                          }}
                        >
                          {trade.type.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace' }}>
                        ${parseFloat(trade.price).toLocaleString()}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace' }}>
                        {parseFloat(trade.amount).toFixed(4)}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', fontFamily: 'monospace' }}>
                        ${(parseFloat(trade.price) * parseFloat(trade.amount)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Charts */}
      <div className="charts-container">
        <LiveMultiChart history={cryptoHistory} symbols={['BTCUSDT', 'ETHUSDT', 'SOLUSDT']} />
        <ModelsComparisonChart
          modelsHistory={modelsHistory}
          selectedModels={selectedModels}
          startingValue={startValue}
          initialValues={initialValues}
        />
      </div>

      {/* ✅ Last 20 Transactions Table */}
      <div
        style={{
          background: '#ffffff',
          padding: '20px',
          borderRadius: '8px',
          marginTop: '20px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: '15px' }}>📊 Last 20 Transactions</h2>

        {loadingTrades ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
            Loading transactions...
          </div>
        ) : trades.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#666', fontStyle: 'italic' }}>
            No transactions yet. Trades will appear here automatically.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '14px'
              }}
            >
              <thead>
                <tr style={{ backgroundColor: '#f5f5f5', borderBottom: '2px solid #ddd' }}>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Time</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Model</th>
                  <th style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold' }}>Action</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Crypto</th>
                  <th style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold' }}>Price</th>
                  <th style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold' }}>Quantity</th>
                  <th style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold' }}>Total Value</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade, index) => (
                  <tr
                    key={trade.id || index}
                    style={{
                      borderBottom: '1px solid #eee',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f9f9f9'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <td style={{ padding: '12px', color: '#666' }}>
                      {formatTimestamp(trade.timestamp)}
                    </td>
                    <td style={{ padding: '12px', fontWeight: 'bold' }}>
                      {trade.model_name}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <span
                        style={{
                          padding: '4px 12px',
                          borderRadius: '4px',
                          fontWeight: 'bold',
                          fontSize: '12px',
                          backgroundColor: trade.action === 'BUY' ? '#e8f5e9' : '#ffebee',
                          color: trade.action === 'BUY' ? '#2e7d32' : '#c62828'
                        }}
                      >
                        {trade.action}
                      </span>
                    </td>
                    <td style={{ padding: '12px' }}>{trade.crypto_symbol}</td>
                    <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace' }}>
                      ${parseFloat(trade.crypto_price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace' }}>
                      {parseFloat(trade.quantity).toFixed(4)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', fontFamily: 'monospace' }}>
                      ${parseFloat(trade.total_value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;