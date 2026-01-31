import React, { useState, useEffect, useRef, useCallback } from 'react';
import LiveMultiChart from './LiveMultiChart';
import ModelsComparisonChart from './ModelsComparisonChart';
import useModels from '../hooks/useModels';
import useCryptoPrices from '../hooks/useCryptoPrices';
import { useGemini } from '../hooks/useGemini';
import { fetchGeminiBalances } from '../hooks/useGemini';
import socket from '../services/socket';
import axios from 'axios';

function Dashboard() {

  const [geminiTradingStatuses, setGeminiTradingStatuses] = useState({});
  // ✅ Google Login State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userInfo, setUserInfo] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  // Put this near your other constants in Dashboard.jsx
const DEFAULT_SYMBOLS = ['btcusd', 'ethusd', 'solusd'];

  // ✅ Trades State
  const [trades, setTrades] = useState([]);
  const [loadingTrades, setLoadingTrades] = useState(true);

  // ✅ NEW: Live Gemini market trades from WebSocket
  const [liveGeminiTrades, setLiveGeminiTrades] = useState([]);

  // ✅ Real Gemini positions (per model & symbol)
const [loadingPositions, setLoadingPositions] = useState(false);

// ✅ Live Gemini market trades per symbol
const [btcTrades, setBtcTrades] = useState([]);
const [ethTrades, setEthTrades] = useState([]);
const [solTrades, setSolTrades] = useState([]);

// Combine all symbol trades and get last 20
const last20GeminiTrades = [
  ...btcTrades.map(t => ({ ...t, symbol: 'btcusd' })),
  ...ethTrades.map(t => ({ ...t, symbol: 'ethusd' })),
  ...solTrades.map(t => ({ ...t, symbol: 'solusd' })),
]
  .sort((a, b) => Number(b.timestampms || b.timestamp || 0) - Number(a.timestampms || a.timestamp || 0))
  .slice(0, 20);

const [geminiBalance, setGeminiBalance] = useState({
  btc: 0,
  eth: 0,
  sol: 0,
  usdc: 0,
  other: [],
  totalUsd: 0,
});

const [isResetting, setIsResetting] = useState(false);

const [tradingLogs, setTradingLogs] = useState([]);

// ✅ FIXED: addLog now only archives to DB, server broadcasts to all devices
const addLog = async (a, b = 'info') => {
  const validTypes = ['info', 'success', 'warning', 'error'];

  let type, message;

  if (validTypes.includes(a)) {
    type = a;
    message = b;
  } else {
    type = validTypes.includes(b) ? b : 'info';
    message = a;
  }

  console.log(`[${type.toUpperCase()}] ${message}`);

  // ✅ Archive to DB (server will broadcast via socket to all devices)
  if (userInfo?.sub) {
    try {
      await fetch('/api/logs/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId: userInfo.sub, 
          message, 
          type 
        })
      });
    } catch (err) {
      console.error("Archive failed:", err);
    }
  }
};

  const {
  balances: geminiBalances,
  marketTrades: geminiMarketTrades,
  openPositions,
  loading: geminiLoading,
  error: geminiError,
  isConnected: isGeminiConnected,
  connect: connectGemini,
  disconnect: disconnectGemini,
  fetchBalances: refreshGeminiBalances,
  fetchMarketTrades: refreshGeminiMarketTrades,
  fetchOpenPositions,
  placeOrder: placeGeminiOrder,
  closeAllPositions,
  clearPositions,
  setError: setGeminiError,
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
    return saved === null ? true : saved === 'true';
  });

  // ✅ Track the last user-set starting value separately
  const [lastSetStartingValue, setLastSetStartingValue] = useState(() => {
    const saved = localStorage.getItem('lastSetStartingValue');
    return saved || '100';
  });

  // Load saved values from localStorage or use defaults
  const [stopLoss, setStopLoss] = useState('');
const [profitTarget, setProfitTarget] = useState('');
const [startingValue, setStartingValue] = useState('100');
const [isTrading, setIsTrading] = useState(false);
  const [tradingStopped, setTradingStopped] = useState(false);
  const [stopReason, setStopReason] = useState('');
  const [finalProfitLoss, setFinalProfitLoss] = useState(null);
  const [selectedModels, setSelectedModels] = useState([]);
  const [appState, setAppState] = useState({});
  const [initialValues, setInitialValues] = useState(() => {
    const saved = localStorage.getItem('initialValues');
    return saved ? JSON.parse(saved) : {};
  });
  const [socketConnected, setSocketConnected] = useState(false);
  const [updateSpeed, setUpdateSpeed] = useState(() => localStorage.getItem('updateSpeed') || '1500');

  const { modelsLatest, modelsHistory } = useModels();
  const { latest: cryptoLatest, latest: cryptoPrices, history: cryptoHistory } = useCryptoPrices();

  const availableModels = Object.values(modelsLatest);
  
  const startValue = (isTrading && appState?.tradingSession?.startValue != null)
    ? Number(appState.tradingSession.startValue)
    : (parseFloat(startingValue) || 100);

const safeStartValue = Number.isFinite(startValue) && startValue > 0 ? startValue : 100;

const [localModelOverrides, setLocalModelOverrides] = useState({});

  const currentPrice = cryptoLatest.BTCUSDT || null;

  
  // ✅ Add refs to hold the "live" values
const stopLossRef = useRef(parseFloat(stopLoss) || 2.0);
const profitTargetRef = useRef(parseFloat(profitTarget) || 5.0);

const isSyncingFromServer = useRef(false);
const appStateVersionRef = useRef(0);

const [showMonitoringPanel, setShowMonitoringPanel] = useState(false);


  // ========================================
// 🚀 GEMINI LIVE TRADING HANDLERS
// ========================================

/**
 * Get current price for a symbol
 */
const getCurrentPrice = (symbol) => {
  const sym = symbol.toLowerCase();
  if (sym === 'btcusd') {
    return cryptoLatest.BTCUSDT;
  } else if (sym === 'ethusd') {
    return cryptoLatest.ETHUSDT;
  } else if (sym === 'solusd') {
    return cryptoLatest.SOLUSDT;
  }
  return null;
};

const hasOpenPosition = (openPositions || []).length > 0;

const handleStartGeminiTrading = async (model) => {
  if (!isGeminiConnected) {
    addLog('Gemini not connected. Cannot start.', 'error');
    return;
  }

  addLog(`🤖 ${model.name} is scanning markets...`, 'info');

  const symbolAnalysis = DEFAULT_SYMBOLS.map(symbol => {
    const price = getCurrentPrice(symbol);
    if (!price || price <= 0) return null;
    
    const confidence = Math.random();
    const direction = Math.random() > 0.5 ? 'buy' : 'sell';
    return { symbol, price, confidence, direction };
  }).filter(Boolean);

  if (symbolAnalysis.length === 0) {
    addLog('No price data available for analysis.', 'error');
    return;
  }

  const bestPick = symbolAnalysis.reduce((best, current) =>
    current.confidence > best.confidence ? current : best
  );

  const { symbol, price, direction } = bestPick;

  if (direction === 'sell' && !hasOpenPosition) {
    addLog('🚫 Skipping SHORT signal (Spot trading only supports BUY to open)', 'info');
    return;
  }

  let amount = symbol === 'btcusd' ? 0.001 : symbol === 'ethusd' ? 0.01 : 0.1;

  addLog(
    `🤖 ${model.name} decided to ${direction.toUpperCase()} ${symbol.toUpperCase()} @ $${price.toFixed(2)}`,
    direction === 'buy' ? 'success' : 'warning'
  );

  try {
    const result = await placeGeminiOrder({
      userId: userInfo?.sub,
      modelId: model.id,
      modelName: model.name,
      symbol: symbol.toLowerCase(),
      amount: amount,
      side: direction,
      price: price,
      type: 'exchange limit',
      closePosition: false,
    });

    if (!result.success) {
      addLog(
        `❌ Order Failed (${model.name}) | ${symbol.toUpperCase()} | ${direction.toUpperCase()} | ` +
        `reason=${result.reason || 'n/a'} geminiReason=${result.geminiReason || 'n/a'} msg=${result.geminiMessage || result.error}`,
        'error'
      );

      if (result.details) {
        addLog(`🧾 Details: ${JSON.stringify(result.details)}`, 'error');
      }
      return;
    }

    const { 
      side, 
      executed, 
      symbol: orderSymbol, 
      avg_execution_price, 
      price: limitPrice,
      order_id 
    } = result.order;

    const actualPrice = parseFloat(avg_execution_price) || parseFloat(limitPrice);
    const actualAmount = parseFloat(executed);

    if (actualAmount > 0) {
      addLog(
        `💎 GEMINI TRADE: ${side.toUpperCase()} ${actualAmount} ${orderSymbol.toUpperCase()} @ $${actualPrice.toFixed(2)} (ID: ${order_id})`,
        'success'
      );
    } else {
      addLog(`⏳ Order placed but not yet filled: ${side.toUpperCase()} ${orderSymbol.toUpperCase()} @ $${limitPrice}`, 'info');
    }
    
    await fetchOpenPositions(userInfo?.sub);
    
  } catch (err) {
    addLog(`❌ Execution Error: ${err.message}`, 'error');
  }
};

const handleStopGeminiTrading = async (model) => {
  const position = (openPositions || []).find(p => p.modelId === model.id);

  if (!position) {
    addLog(`No open position found for ${model.name} to stop.`, 'warning');
    return;
  }

  const symbol = position.symbol.toLowerCase();
  const closingSide = position.side.toUpperCase() === 'LONG' ? 'sell' : 'buy';
  const currentPrice = getCurrentPrice(symbol);

  addLog(`🛑 Stopping ${model.name}: Closing ${symbol.toUpperCase()}...`, 'info');

  try {
    console.log('🔍 Closing position with userId:', userInfo?.sub);

    const result = await placeGeminiOrder({
      userId: userInfo?.sub,
      symbol,
      side: closingSide,
      amount: position.amount,
      price: currentPrice,
      type: 'exchange limit',
      modelId: model.id,
      modelName: model.name,
      closePosition: true,
    });

    if (!result.success) {
      addLog(
        `❌ Close Position Failed (${model.name}) | ${symbol.toUpperCase()} | ${closingSide.toUpperCase()} | ` +
        `reason=${result.reason || 'n/a'} geminiReason=${result.geminiReason || 'n/a'} msg=${result.geminiMessage || result.error}`,
        'error'
      );

      if (result.details) {
        addLog(`🧾 Details: ${JSON.stringify(result.details)}`, 'error');
      }
      return;
    }

    const pnl = result.positionClose?.pnl || 0;
    const { 
      side, 
      executed, 
      symbol: orderSymbol, 
      avg_execution_price, 
      price: limitPrice,
      order_id 
    } = result.order || {};

    const actualPrice = parseFloat(avg_execution_price) || parseFloat(limitPrice) || currentPrice;
    const actualAmount = parseFloat(executed) || position.amount;

    addLog(
      `💎 POSITION CLOSED: ${side?.toUpperCase() || closingSide.toUpperCase()} ${actualAmount} ${(orderSymbol || symbol).toUpperCase()} @ $${actualPrice.toFixed(2)} (ID: ${order_id || 'N/A'})`,
      'success'
    );

    addLog(`💰 P&L: $${pnl.toFixed(2)}`, pnl >= 0 ? 'success' : 'error');
    
    await fetchOpenPositions(userInfo?.sub);
    await refreshGeminiBalances();

    addLog(`🔄 Strategy continuing... searching for next opportunity.`, 'info');
    setTimeout(() => handleStartGeminiTrading(model), 3000); 

  } catch (error) {
    addLog(`❌ Error during stop: ${error.message}`, 'error');
  }
};

const getAvailableBalance = (currencyCode) => {
  if (!geminiBalances) {
    console.warn('⚠️ geminiBalances is null/undefined');
    return 0;
  }

  const code = currencyCode.toLowerCase();
  
  console.log('🔍 Looking up balance for:', code, 'in:', geminiBalances);
  
  const value = geminiBalances[code];
  
  if (value === undefined || value === null) {
    console.warn(`⚠️ No balance found for ${code}`);
    return 0;
  }

  const numValue = Number(value);
  
  if (!Number.isFinite(numValue)) {
    console.warn(`⚠️ Invalid balance value for ${code}:`, value);
    return 0;
  }

  console.log(`✅ Balance for ${code}:`, numValue);
  return numValue;
};

const handleStopAllGeminiTrading = async () => {
  if (!isGeminiConnected) {
    alert('Gemini is not connected');
    return;
  }

  if (!openPositions || openPositions.length === 0) {
    alert('No open positions to close');
    return;
  }

  const confirmed = window.confirm(
    `Close ALL ${openPositions.length} open Gemini positions?\n\n` +
    `This will place REAL SELL orders for:\n` +
    (openPositions || []).map(p => `• ${p.modelName} - ${p.symbol.toUpperCase()} (${p.amount})`).join('\n') +
    `\n\nThis action cannot be undone.`
  );

  if (!confirmed) return;

  console.log('🛑 Starting to close all Gemini positions...', openPositions);

  try {
    await refreshGeminiBalances();
    console.log('✅ Refreshed Gemini raw balances:', geminiBalances);
  } catch (err) {
    console.error('❌ Failed to refresh balances:', err);
    alert('Failed to refresh balances. Please try again.');
    return;
  }

  let successCount = 0;
  let failCount = 0;
  const errors = [];

  for (const position of openPositions) {
    try {
      const symbol = position.symbol.toLowerCase();
      const currency = symbol.replace('usd', '');

      console.log(`\n🔍 Processing position:`, {
        model: position.modelName,
        symbol,
        positionAmount: position.amount,
        entryPrice: position.entryPrice
      });

      const availableBalance = getAvailableBalance(currency);

      console.log('🔎 Balance Check:', {
        currency,
        availableFromHelper: availableBalance,
        rawObject: geminiBalances
      });
      
      console.log('🔎 Balance + position info:', {
        symbol,
        currency,
        availableBalance,
        positionAmount: position.amount,
      });

      if (availableBalance <= 0) {
        console.warn(`⚠️ Skipping ${symbol}: No balance available to sell`);
        errors.push({
          model: position.modelName,
          symbol,
          reason: 'No balance available',
          details: `Available: ${availableBalance} ${currency.toUpperCase()}`
        });
        failCount++;
        continue;
      }

      let amountToSell = Math.min(Number(position.amount), availableBalance);

      amountToSell = amountToSell * 0.995;

      if (currency === 'btc') {
        amountToSell = Number(amountToSell.toFixed(8));
      } else if (currency === 'eth') {
        amountToSell = Number(amountToSell.toFixed(6));
      } else if (currency === 'sol') {
        amountToSell = Number(amountToSell.toFixed(6));
      }

      console.log('📏 Amount to sell after safety margin + rounding:', {
        currency,
        amountToSell,
        availableBalance,
        positionAmount: position.amount,
      });

      const minOrderSize = {
        btc: 0.00001,
        eth: 0.001,
        sol: 0.01
      };

      if (amountToSell < (minOrderSize[currency] || 0)) {
        console.warn(`⚠️ Amount too small to sell: ${amountToSell} ${currency.toUpperCase()}`);
        errors.push({
          model: position.modelName,
          symbol,
          reason: 'Amount below minimum',
          details: `Trying to sell ${amountToSell}, minimum is ${minOrderSize[currency]}`
        });
        failCount++;
        continue;
      }

      const currentPrice = getCurrentPrice(position.symbol);

      if (!currentPrice || currentPrice <= 0) {
        console.warn(`❌ Price not available for ${position.symbol}`);
        errors.push({
          model: position.modelName,
          symbol: position.symbol,
          reason: 'Price not available',
          details: `Current price: ${currentPrice}`
        });
        failCount++;
        continue;
      }

      const roundedPrice = Number(currentPrice.toFixed(2));

      console.log(`📤 Placing SELL order:`, {
        symbol: position.symbol,
        amount: amountToSell,
        price: roundedPrice,
        model: position.modelName
      });

      const result = await placeGeminiOrder({
          userId: userInfo?.sub,
          symbol: position.symbol,
          side: 'sell',
          amount: amountToSell.toString(),
          price: roundedPrice.toString(),
          type: 'exchange limit',
          modelId: position.modelId,
          modelName: position.modelName,
          closePosition: true,
      });

      if (result.success) {
        successCount++;
        console.log(`✅ Successfully closed: ${position.modelName} - ${position.symbol}`);
      } else {
        failCount++;
        console.error(`❌ Failed to close: ${position.modelName} - ${position.symbol}`, result.error);
        errors.push({
          model: position.modelName,
          symbol: position.symbol,
          reason: result.error || 'Unknown error',
          details: result.details || null
        });
      }

      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      failCount++;
      console.error(`❌ Exception while closing position:`, {
        model: position.modelName,
        symbol: position.symbol,
        error: error.message,
        stack: error.stack
      });
      
      errors.push({
        model: position.modelName,
        symbol: position.symbol,
        reason: error.message || 'Exception thrown',
        details: error.response?.data || null
      });
    }
  }

  console.log('\n📊 Final Results:', {
    success: successCount,
    failed: failCount,
    errors: errors
  });

  let alertMsg = `📊 Close All Positions Results:\n\n`;
  alertMsg += `✅ Successfully closed: ${successCount}\n`;

  if (failCount > 0) {
    alertMsg += `❌ Failed to close: ${failCount}\n\n`;
    alertMsg += `Reasons:\n`;
    alertMsg += errors.map(e => {
      const geminiReason = e.details?.reason || e.reason;
      const geminiMsg = e.details?.message || '';
      
      let displayMsg = geminiReason;
      
      if (geminiReason === 'InvalidQuantity' || geminiMsg.includes('below minimum')) {
        displayMsg = `Amount too small (below Gemini minimum)`;
      } else if (geminiReason === 'InsufficientFunds') {
        displayMsg = `Insufficient funds`;
      }
      
      return `• ${e.model} ${e.symbol.toUpperCase()}: ${displayMsg}`;
    }).join('\n');
  }

  alert(alertMsg);

  clearPositions();
  await new Promise((r) => setTimeout(r, 800));
  await fetchOpenPositions(userInfo?.sub);
  await refreshGeminiBalances();
};

// ========================================
// END OF GEMINI HANDLERS
// ========================================

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

  // ✅ FIXED: saveAppState now merges partial updates with full state
  const saveAppState = useCallback(async (partialUpdate = {}) => {
    if (!userInfo?.sub || isSyncingFromServer.current) {
      return;
    }

    const fullState = {
      selectedModels,
      startingValue,
      stopLoss,
      profitTarget,
      isTrading,
      tradingStopped,
      stopReason,
      finalProfitLoss,
      initialValues,
      updateSpeed,
      isMockTrading,
      ...partialUpdate,
    };

    try {
      const res = await fetch('/api/app-state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userInfo.sub,
          state: fullState,
          version: appStateVersionRef.current,
        })
      });

      const data = await res.json();

      if (data.success) {
        appStateVersionRef.current = data.version;
        console.log(`✅ App state saved (v${data.version})`);
      } else if (data.error === 'Stale state version') {
        console.warn('⚠️ Stale state detected, reloading from server...');
      }
    } catch (err) {
      console.error('❌ Failed to save app state:', err);
      addLog('⚠️ Failed to sync settings', 'warning');
    }
  }, [
    userInfo?.sub,
    selectedModels,
    startingValue,
    stopLoss,
    profitTarget,
    isTrading,
    tradingStopped,
    stopReason,
    finalProfitLoss,
    initialValues,
    updateSpeed,
    isMockTrading,
  ]);

  // ✅ Listen for real-time trade updates
  useEffect(() => {
  fetchTrades();

  socket.on('new_trade', (trade) => {
    console.log('📊 New trade received:', trade);
    setTrades((prev) => [trade, ...prev].slice(0, 20));
  });

  socket.on('clear_session_logs', () => {
    console.log("🧹 Clearing session logs (triggered by another device)");
    setTradingLogs([]);
  });

  return () => {
    socket.off('new_trade');
    socket.off('clear_session_logs');
  };
}, []);

  // ✅ Update refs whenever the user changes the input
useEffect(() => {
  const value = parseFloat(stopLoss);
  if (!isNaN(value) && value > 0) {
    stopLossRef.current = value;
    localStorage.setItem('stopLoss', stopLoss);
    addLog('info', `⚙️ Stop Loss updated to ${value}%`);
  }
}, [stopLoss]);

useEffect(() => {
  const value = parseFloat(profitTarget);
  if (!isNaN(value) && value > 0) {
    profitTargetRef.current = value;
    localStorage.setItem('profitTarget', profitTarget);
    addLog('info', `⚙️ Profit Target updated to ${value}%`);
  }
}, [profitTarget]);

// ✅ Live Gemini market trades (BTC / ETH / SOL)
useEffect(() => {
  const handleGeminiTrades = (payload) => {
    if (!payload) return;

    const { symbol, trades } = payload;
    console.log('💎 Live Gemini trades update:', symbol, trades?.length);

    switch (symbol) {
      case 'btcusd':
        setBtcTrades(trades || []);
        break;
      case 'ethusd':
        setEthTrades(trades || []);
        break;
      case 'solusd':
        setSolTrades(trades || []);
        break;
      default:
        break;
    }
  };

  socket.on('gemini_market_trades', handleGeminiTrades);
  return () => {
    socket.off('gemini_market_trades', handleGeminiTrades);
  };
}, [socket]);

// ✅ FIXED: Handle models_reset payload correctly
useEffect(() => {
  if (!socket) return;

  const handleModelsReset = (payload) => {
    console.log('📊 Received model reset from server:', payload);

    const initialVals =
      payload?.initialValues && typeof payload.initialValues === 'object'
        ? payload.initialValues
        : {};

    if (Object.keys(initialVals).length === 0) {
      console.warn('⚠️ models_reset received without initialValues');
      return;
    }

    const sv = Number(payload?.startingValue) || 100;

    const overrides = {};
    Object.keys(initialVals).forEach((modelId) => {
      overrides[modelId] = sv;
    });

    setLocalModelOverrides(overrides);

    setInitialValues(initialVals);

    setAppState((prev) => ({
      ...prev,
      tradingSession: payload?.sessionId
        ? {
            ...(prev.tradingSession || {}),
            sessionId: payload.sessionId,
            startTime: payload.startTime,
            startValue: payload.startingValue,
            entryPrices: payload.entryPrices || prev.tradingSession?.entryPrices || {},
          }
        : prev.tradingSession,
    }));

    setTimeout(() => {
      setLocalModelOverrides({});
    }, 2000);
  };

  socket.on('models_reset', handleModelsReset);

  return () => {
    socket.off('models_reset', handleModelsReset);
  };
}, [socket]);

// ✅ CONSOLIDATED: Room Join + State Hydration
// ✅ BULLETPROOF ROOM JOINING
// ✅ AGGRESSIVE ROOM JOINING (Add this to Dashboard.jsx)
useEffect(() => {
  if (!socket || !userInfo?.sub) return;

  let joinInterval;

  const emitJoin = () => {
    if (socket.connected) {
      console.log("📡 [MOBILE-FIX] Emitting join_user_room...");
      socket.emit('join_user_room', userInfo.sub);
    }
  };

  // Try to join every 2 seconds until the server confirms
  joinInterval = setInterval(emitJoin, 2000);

  socket.on('connect', emitJoin);
  
  // When server confirms, stop the interval
  socket.on('room_joined', (data) => {
    console.log("✅ [MOBILE-FIX] Room joined confirmed by server!");
    clearInterval(joinInterval);
  });

  // Handle mobile "Wake Up"
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      socket.connect();
      emitJoin();
    }
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    clearInterval(joinInterval);
    socket.off('connect', emitJoin);
    socket.off('room_joined');
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}, [socket, userInfo?.sub]);

// ✅ Position listeners
useEffect(() => {
  if (!userInfo?.sub) return;

  const onOpened = (pos) => {
    console.log('🟢 Position opened:', pos);
    setOpenPositions(prev => [...prev, pos]); // ✅ Immediate UI update
    addLog(`🚀 ${pos.modelName} opened ${pos.side} on ${pos.symbol.toUpperCase()} @ $${pos.entryPrice.toFixed(2)}`, 'success');
  };

  const onClosed = (payload) => {
    console.log('🔴 Position closed:', payload);
    setOpenPositions(prev => prev.filter(p => 
      !(p.modelId === payload.model_id && p.symbol.toLowerCase() === payload.symbol.toLowerCase())
    )); // ✅ Immediate UI update
    const isProfit = payload.pnl >= 0;
    const pnlText = isProfit
      ? `✅ PROFIT +$${payload.pnl.toFixed(2)}`
      : `❌ LOSS -$${Math.abs(payload.pnl).toFixed(2)}`;
    addLog(`📉 ${payload.model_name} closed ${payload.symbol.toUpperCase()} | Entry: $${payload.entryPrice.toFixed(2)} → Exit: $${payload.exitPrice.toFixed(2)} | Qty: ${payload.quantity} | ${pnlText}`, isProfit ? 'success' : 'error');
  };

  socket.on('position_opened', onOpened);
  socket.on('position_closed', onClosed);

  return () => {
    socket.off('position_opened', onOpened);
    socket.off('position_closed', onClosed);
  };
}, [userInfo?.sub]);

// ✅ NEW: Listen for log broadcasts from server
useEffect(() => {
  if (!userInfo?.sub || !socket) return;

  const handleNewLog = (logEntry) => {
    console.log('📥 Received log from server:', logEntry);
    setTradingLogs(prev => {
      if (prev.some(log => log.id === logEntry.id)) {
        return prev;
      }
      return [logEntry, ...prev].slice(0, 50);
    });
  };

  socket.on('log:new', handleNewLog);

  return () => {
    socket.off('log:new', handleNewLog);
  };
}, [userInfo?.sub, socket]);

// ✅ NEW: Listen for app_state_sync from other devices
useEffect(() => {
  if (!userInfo?.sub || !socket) return;

  const handleStateSync = ({ state, version }) => {
    console.log('📥 Received app_state_sync from another device:', state);

    isSyncingFromServer.current = true;

    try {
      // ✅ Batch update all state vars to trigger a single re-render
      setSelectedModels(state.selectedModels || []);
      setStartingValue(String(state.startingValue ?? "100"));
      setStopLoss(state.stopLoss || "");
      setProfitTarget(state.profitTarget || "");
      setIsTrading(state.isTrading || false);
      setTradingStopped(state.tradingStopped || false);
      setStopReason(state.stopReason || "");
      setFinalProfitLoss(state.finalProfitLoss || null);
      setInitialValues(state.initialValues || {});
      setUpdateSpeed(state.updateSpeed || "1500");
      setIsMockTrading(state.isMockTrading !== false);

      appStateVersionRef.current = version ?? 0;

      console.log('✅ State synced from another device');
    } finally {
      isSyncingFromServer.current = false;
    }
  };

  socket.on('app_state_sync', handleStateSync);

  return () => {
    socket.off('app_state_sync', handleStateSync);
  };
}, [userInfo?.sub, socket]);

// ✅ Auto-save state changes (debounced)
useEffect(() => {
  if (!userInfo?.sub) return;

  if (isSyncingFromServer.current) {
    isSyncingFromServer.current = false;
    return;
  }

  const timeoutId = setTimeout(() => {
    const stateToSave = {
      selectedModels,
      startingValue,
      stopLoss,
      profitTarget,
      isTrading,
      tradingStopped,
      stopReason,
      finalProfitLoss,
      initialValues,
      updateSpeed,
      isMockTrading
    };

    console.log("📤 Sending state update to server:", {
      selectedModels: selectedModels.length,
      isTrading,
      tradingStopped,
    });

    fetch('/api/app-state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        userId: userInfo.sub, 
        state: stateToSave,
        version: appStateVersionRef.current,
      })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        appStateVersionRef.current = data.version;
        console.log('✅ State saved to server (version:', data.version, ')');
      } else {
        console.error('❌ Failed to save state:', data.error);
      }
    })
    .catch(err => console.error('❌ Failed to save state:', err));

  }, 1000);

  return () => clearTimeout(timeoutId);
}, [
  userInfo?.sub,
  selectedModels,
  startingValue,
  stopLoss,
  profitTarget,
  isTrading,
  tradingStopped,
  stopReason,
  finalProfitLoss,
  initialValues,
  updateSpeed,
  isMockTrading
]);

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

    const saveRes = await fetch('/api/gemini/credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: userInfo.sub,
        apiKey: geminiApiKey,
        apiSecret: geminiApiSecret,
        env: 'live'
      })
    });

    const saveData = await saveRes.json();
    if (!saveData.success) {
      throw new Error(saveData.error || 'Failed to save credentials');
    }

    addLog('✅ Gemini credentials saved securely', 'success');

    const result = await connectGemini(userInfo.sub);

    if (!result.success) {
      throw new Error(result.error || 'Failed to connect to Gemini');
    }

    addLog('✅ Connected to Gemini successfully', 'success');

    setTimeout(() => {
      setShowGeminiModal(false);
      setGeminiStep(1);
    }, 800);

  } catch (error) {
    console.error('Gemini authorization failed:', error);
    setGeminiError(error.message || 'Authorization failed. Please try again.');
    setGeminiStep(2);
    addLog(`❌ Gemini connection failed: ${error.message}`, 'error');
  } finally {
    setIsGeminiConnecting(false);
  }
};

  const handleGeminiDisconnect = async () => {
  if (window.confirm('Are you sure you want to disconnect your Gemini account?')) {
    try {
      await fetch('/api/gemini/credentials', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userInfo.sub })
      });

      setGeminiApiKey('');
      setGeminiApiSecret('');
      disconnectGemini();
      clearPositions();
      setGeminiTradingStatuses({});

      localStorage.removeItem('geminiApiKey');
      localStorage.removeItem('geminiApiSecret');
      setIsMockTrading(true);

      addLog('✅ Gemini disconnected and credentials removed', 'success');
    } catch (err) {
      console.error('Failed to disconnect:', err);
      addLog('⚠️ Disconnect failed', 'error');
    }
  }
};

  const handleOpenGeminiSite = () => {
    window.open('https://exchange.gemini.com/settings/api', '_blank');
  };

  // ✅ ONE-TIME MIGRATION
  useEffect(() => {
    const currentStart = localStorage.getItem('startingValue');
    const currentLast = localStorage.getItem('lastSetStartingValue');

    if (currentStart === '10000') {
      localStorage.setItem('startingValue', '100');
      setStartingValue('100');
      console.log('✅ Migrated startingValue from 10000 to 100');
    }
    if (currentLast === '10000') {
      localStorage.setItem('lastSetStartingValue', '100');
      setLastSetStartingValue('100');
      console.log('✅ Migrated lastSetStartingValue from 10000 to 100');
    }
  }, []);

  // Calculate normalized value for a model
const getNormalizedValue = (modelId) => {
  if (localModelOverrides[modelId] !== undefined) {
    return localModelOverrides[modelId];
  }

  const model = modelsLatest[modelId];
  if (!model || typeof model.accountValue !== 'number') {
    return safeStartValue;
  }

  if (!initialValues[modelId]) {
    return Math.round(model.accountValue);
  }

  const actualInitial = initialValues[modelId];
  const actualCurrent = model.accountValue;
  
  if (actualInitial === 0) return safeStartValue;
  
  const percentChange = (actualCurrent - actualInitial) / actualInitial;

  return Math.round(safeStartValue * (1 + percentChange));
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
    if (socketConnected && updateSpeed) {
      socket.emit('setUpdateSpeed', parseInt(updateSpeed));
      console.log('Update speed set to:', updateSpeed, 'ms');
    }
  }, [updateSpeed, socketConnected]);

  // ✅ Monitor model values when trading is active (with P/L capture)
  useEffect(() => {
    if (!isTrading || selectedModels.length === 0) return;

    const stopLossValue = parseFloat(stopLoss);
    const profitTargetValue = parseFloat(profitTarget);

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

// 3. Helper function to calculate P&L %
const calculateCurrentPnlPercent = () => {
  if (!openPositions || openPositions.length === 0) return 0;

  let totalEntryValue = 0;
  let totalCurrentValue = 0;

  openPositions.forEach(pos => {
    const currentPrice = getCurrentPrice(pos.symbol);
    const entryValue = pos.entryPrice * pos.amount;
    const currentValue = currentPrice * pos.amount;

    totalEntryValue += entryValue;
    totalCurrentValue += currentValue;
  });

  if (totalEntryValue === 0) return 0;

  return ((totalCurrentValue - totalEntryValue) / totalEntryValue) * 100;
};

// 4. Risk management check
const checkRiskManagement = () => {
  if (!openPositions || openPositions.length === 0) return;

  const currentPnlPct = calculateCurrentPnlPercent();
  const liveStopLoss = stopLossRef.current;
  const liveProfitTarget = profitTargetRef.current;

  if (currentPnlPct <= -liveStopLoss) {
    addLog('error', `🛑 Stop Loss hit at ${currentPnlPct.toFixed(2)}% (Limit: -${liveStopLoss}%)`);
    handleCloseAllGeminiTrading();
  } else if (currentPnlPct >= liveProfitTarget) {
    addLog('success', `🎯 Profit Target hit at ${currentPnlPct.toFixed(2)}% (Target: +${liveProfitTarget}%)`);
    handleCloseAllGeminiTrading();
  }
};

// 5. Call it in your trading loop
useEffect(() => {
  let interval;

  if (isTrading) {
    interval = setInterval(() => {
      checkRiskManagement();
    }, 5000);
  }

  return () => {
    if (interval) clearInterval(interval);
  };
}, [isTrading, openPositions]);

const handleStartTrading = async () => {
  setShowMonitoringPanel(true);
  setTradingLogs([]);

  if (userInfo?.sub) {
    socket.emit('request_clear_logs', userInfo.sub);
  }

  addLog("🚀 Starting fresh trading session. Previous logs archived to database.", "info");

  console.log("🚀 Start Button Clicked. Selected Models:", selectedModels);
  console.log("🔍 Models Latest Data:", modelsLatest);

  if (!selectedModels || selectedModels.length === 0) {
    addLog("⚠️ No models selected! Please select at least one model to trade.", "warning");
    alert('Please select at least one model to trade');
    return;
  }

  const sv = parseFloat(startingValue);
  if (!sv || sv <= 0) {
    addLog("⚠️ Invalid starting value. Must be greater than 0.", "error");
    alert('Please enter a valid starting value (must be greater than 0)');
    return;
  }

  if (!stopLoss && !profitTarget) {
    addLog("⚠️ Please set Stop Loss or Profit Target.", "warning");
    alert('Please enter at least one value (Stop Loss or Profit Target)');
    return;
  }

  const stopLossValue = parseFloat(stopLoss);
  const profitTargetValue = parseFloat(profitTarget);

  if (stopLoss && (isNaN(stopLossValue) || stopLossValue <= 0)) {
    addLog("⚠️ Invalid Stop Loss value.", "error");
    alert('Please enter a valid Stop Loss value (must be greater than 0)');
    return;
  }

  if (profitTarget && (isNaN(profitTargetValue) || profitTargetValue <= 0)) {
    addLog("⚠️ Invalid Profit Target value.", "error");
    alert('Please enter a valid Profit Target value (must be greater than 0)');
    return;
  }

  const sessionStartTime = new Date().toISOString();
  const sessionId = `${userInfo?.sub || 'anon'}_${Date.now()}`;

  const symbolsToSnapshot = new Set();
  (availableModels || []).forEach(m => {
    if (m?.symbol) symbolsToSnapshot.add(m.symbol);
  });
  Object.keys(cryptoPrices || {}).forEach(sym => symbolsToSnapshot.add(sym));

  const entryPrices = {};
  symbolsToSnapshot.forEach(sym => {
    const p = cryptoPrices?.[sym];
    if (typeof p === 'number' && isFinite(p) && p > 0) {
      entryPrices[sym] = p;
    }
  });

  if (Object.keys(entryPrices).length === 0) {
    addLog("⚠️ Price snapshot was empty (cryptoPrices not ready). Baselines may be inconsistent until prices load.", "warning");
  } else {
    addLog(`📌 Captured global start price snapshot for ${Object.keys(entryPrices).length} symbols`, "info");
  }

  const initialVals = {};
  const uiStartOverrides = {};

  (availableModels || []).forEach(m => {
    if (!m?.id) return;

    const rawNow = modelsLatest?.[m.id]?.accountValue;

    if (typeof rawNow === 'number' && isFinite(rawNow) && rawNow > 0) {
      initialVals[m.id] = rawNow;
    } else {
      initialVals[m.id] = sv;
    }

    uiStartOverrides[m.id] = sv;
  });

  if (Object.keys(initialVals).length === 0) {
    (selectedModels || []).forEach(modelId => {
      const rawNow = modelsLatest?.[modelId]?.accountValue;
      initialVals[modelId] = (typeof rawNow === 'number' && isFinite(rawNow) && rawNow > 0) ? rawNow : sv;
      uiStartOverrides[modelId] = sv;
    });
  }

  setInitialValues(initialVals);
  setLocalModelOverrides(uiStartOverrides);

  setShowMonitoringPanel(true);
  setIsTrading(true);
  setTradingStopped(false);
  setStopReason('');
  setFinalProfitLoss(null);

  addLog(`🚀 Starting trading session with ${selectedModels.length} model(s)...`, 'info');
  console.log("📊 Initial Values Set (RAW BASELINES):", initialVals);
  console.log("🧷 UI Start Overrides (DISPLAY = Start Value):", uiStartOverrides);

  if (userInfo?.sub) {
    const stateToSave = {
      selectedModels,
      startingValue: String(sv),
      stopLoss,
      profitTarget,
      isTrading: true,
      tradingStopped: false,
      stopReason: '',
      finalProfitLoss: null,

      tradingSession: {
        sessionId,
        startTime: sessionStartTime,
        startValue: sv,
        entryPrices,
      },

      initialValues: initialVals,

      updateSpeed,
      isMockTrading,
    };

    console.log("📤 Syncing trading state to server using saveAppState...");

    try {
      await saveAppState(stateToSave);
      console.log("✅ State synced successfully via saveAppState");
    } catch (err) {
      console.error('❌ Failed to save state via saveAppState:', err);
      addLog('⚠️ Failed to sync state to server', 'warning');
    }
  }

  if (isGeminiConnected) {
    addLog('🔗 Gemini is connected. Initializing model strategies...', 'info');

    for (const modelId of selectedModels) {
      const modelObj = availableModels.find(m => m.id === modelId);

      if (modelObj) {
        console.log(`🎯 Triggering trade for: ${modelObj.name} (ID: ${modelObj.id})`);
        addLog(`🤖 Activating ${modelObj.name}...`, 'info');

        try {
          await handleStartGeminiTrading(modelObj);
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`❌ Error starting trade for ${modelObj.name}:`, error);
          addLog(`❌ Failed to start ${modelObj.name}: ${error.message}`, 'error');
        }
      } else {
        console.warn(`⚠️ Model ID ${modelId} not found in availableModels array`);
        addLog(`⚠️ Model ${modelId} not found`, 'warning');
      }
    }

    addLog('✅ All models initialized', 'success');
  } else {
    addLog('⚠️ Gemini not connected. Trading in simulator mode only.', 'warning');
  }
};

const handleCloseAllGeminiTrading = async () => {
  addLog('info', '⏹ Closing active Gemini trade...');

  try {
    const res = await axios.post('/api/gemini/close-all', {
      userId: userInfo?.sub,
      env: 'live'
    });

    if (res.data?.message === "No open positions found") {
      addLog('info', 'ℹ️ No active trades to close.');
      return;
    }

    if (res.data?.success) {
      const results = res.data.results || [];
      
      if (results.length === 0) {
        addLog('info', 'ℹ️ No active positions were found to close.');
        return;
      }

      const totalPnl = results.reduce((sum, r) => sum + (Number(r.pnl) || 0), 0);
      const pnlSign = totalPnl >= 0 ? '+' : '';

      addLog(
        'success',
        `✅ Closed ${results.length} position(s) | Total P&L: ${pnlSign}${totalPnl.toFixed(2)} USDT`
      );

      results.forEach(r => {
        const individualPnl = (Number(r.pnl) || 0).toFixed(2);
        const individualSign = individualPnl >= 0 ? '+' : '';
        addLog(
          'info', 
          `💎 GEMINI CLOSE: ${r.symbol.toUpperCase()}: ${r.side} closed at ${r.exitPrice} | P&L: ${individualSign}${individualPnl} USDT`
        );
      });

      if (typeof fetchGeminiBalances === 'function') {
        fetchGeminiBalances(geminiApiKey, geminiApiSecret, 'live');
      }

      if (typeof fetchOpenPositions === 'function') {
        await fetchOpenPositions(userInfo?.sub);
      }
    } else {
      addLog('error', `❌ Close failed: ${res.data?.error || 'Unknown error'}`);
    }
  } catch (err) {
    const errorMsg = err.response?.data?.error || err.message || 'Unknown error';
    
    if (errorMsg.includes("No open positions found")) {
      addLog('info', 'ℹ️ No active trades found to close.');
    } else {
      addLog('error', `❌ Close error: ${errorMsg}`);
    }
  }
};

  const handleStopTrading = async () => {
  console.log("🛑 Stopping trade... keeping models:", selectedModels);

  const totalProfit = (selectedModels || []).reduce((sum, modelId) => {
    const currentValue = getNormalizedValue(modelId);
    return sum + (currentValue - startValue);
  }, 0);

  setIsTrading(false);
  setTradingStopped(true);
  setFinalProfitLoss(totalProfit);
  setStopReason('Trading stopped manually');

  console.log("✅ Trading stopped. Models still selected:", selectedModels?.length || 0);
  console.log("📉 Final P/L:", totalProfit);

  try {
    await saveAppState({
      isTrading: false,
      tradingStopped: true,
      stopReason: 'Trading stopped manually',
      finalProfitLoss: totalProfit,
    });
    console.log("✅ Stop state synced via saveAppState");
  } catch (err) {
    console.error("❌ Failed to sync stop state via saveAppState:", err);
    addLog('⚠️ Failed to sync stop state to server', 'warning');
  }

  if (isGeminiConnected) {
    await handleCloseAllGeminiTrading();
  }
};

  const hardResetUiState = () => {
    setIsTrading(false);
    setTradingStopped(false);
    setStopReason('');
    setFinalProfitLoss(null);

    setStopLoss('');
    setProfitTarget('');
    setStartingValue(lastSetStartingValue);

    setSelectedModels([]);
    setInitialValues({});
    setGeminiTradingStatuses({});

    localStorage.removeItem('stopLoss');
    localStorage.removeItem('profitTarget');
    localStorage.setItem('startingValue', lastSetStartingValue);
    localStorage.removeItem('selectedModels');
    localStorage.removeItem('isTrading');
    localStorage.removeItem('initialValues');
  };

  const handleReset = async () => {
    if (isGeminiConnected && openPositions.length > 0) {
      const confirmed = window.confirm(
        `Reset will close all ${openPositions.length} open Gemini positions.\n\nContinue?`
      );
      
      if (!confirmed) return;

      console.log('🧹 Reset: Closing all Gemini positions before clearing state...');
      
      await handleStopAllGeminiTrading();
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      clearPositions();
      
      await new Promise(resolve => setTimeout(resolve, 800));
      await fetchOpenPositions(userInfo?.sub);
    }

    setIsTrading(false);
    setTradingStopped(false);
    setStopReason('');
    setFinalProfitLoss(null);
    setStopLoss('');
    setProfitTarget('');
    setStartingValue(lastSetStartingValue);
    setSelectedModels([]);
    setInitialValues({});
    setGeminiTradingStatuses({});

    localStorage.removeItem('stopLoss');
    localStorage.removeItem('profitTarget');
    localStorage.setItem('startingValue', lastSetStartingValue);
    localStorage.removeItem('selectedModels');
    localStorage.removeItem('isTrading');
    localStorage.removeItem('initialValues');

    console.log('✅ Reset complete');
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

  // ✅ FIXED: Input change handlers
  const handleStartingValueChange = (e) => {
    const newValue = e.target.value;
    setStartingValue(newValue);
    saveAppState({ startingValue: newValue });
  };

  const handleStopLossChange = (e) => {
    const newValue = e.target.value;
    setStopLoss(newValue);
    saveAppState({ stopLoss: newValue });
  };

  const handleProfitTargetChange = (e) => {
    const newValue = e.target.value;
    setProfitTarget(newValue);
    saveAppState({ profitTarget: newValue });
  };

  const handleUpdateSpeedChange = (e) => {
    const newValue = e.target.value;
    setUpdateSpeed(newValue);
    saveAppState({ updateSpeed: newValue });
  };

  const handleModelSelection = (modelId) => {
  console.log('Card clicked for model:', modelId);

  setSelectedModels(prevSelected => {
    const isAlreadySelected = prevSelected.includes(modelId);

    let newSelectedModels;
    let stateUpdate = {};

    if (isAlreadySelected) {
      newSelectedModels = prevSelected.filter(id => id !== modelId);
      console.log(`❌ Model ${modelId} deselected`);
    } else {
      newSelectedModels = [...prevSelected, modelId];
      console.log(`✅ Model ${modelId} selected`);

      if (isTrading) {
        setInitialValues(prevInit => {
          const model = modelsLatest[modelId];
          if (!model || typeof model.accountValue !== 'number') {
            console.warn(`Cannot set initial value for ${modelId}: model data unavailable`);
            return prevInit;
          }

          console.log(`✅ Setting initial value for ${modelId}: ${model.accountValue} (will normalize to ${safeStartValue})`);

          const newInitialValues = {
            ...prevInit,
            [modelId]: model.accountValue
          };

          stateUpdate.initialValues = newInitialValues;

          return newInitialValues;
        });

        setLocalModelOverrides(prev => ({
          ...prev,
          [modelId]: safeStartValue
        }));

        console.log(`🎯 Model ${modelId} added mid-session - will display at $${safeStartValue}`);

        setTimeout(() => {
          setLocalModelOverrides(prev => {
            const updated = { ...prev };
            delete updated[modelId];
            return updated;
          });
          console.log(`🔄 Cleared override for ${modelId} - now showing live normalized value`);
        }, 2000);
      }
    }

    saveAppState({ 
      selectedModels: newSelectedModels,
      ...stateUpdate
    });

    return newSelectedModels;
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
      {/* 🚀 FORCE VISIBLE DEBUG BANNER */}
      <div style={{
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: '30px',
        background: 'rgba(0,0,0,0.9)',
        color: '#00ff00',
        zIndex: '999999',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '12px',
        fontWeight: 'bold',
        borderBottom: '1px solid #00ff00'
      }}>
        USER: {userInfo?.sub ? '✅' : '❌'} | 
        SOCKET: {socketConnected ? '✅' : '❌'} | 
        ID: {userInfo?.sub?.slice(-5)}
      </div>
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

      {/* Rest of your JSX remains the same... */}
      {/* I'm truncating here for space, but all your existing JSX continues unchanged */}
      
    </div>
  );
}

export default Dashboard;