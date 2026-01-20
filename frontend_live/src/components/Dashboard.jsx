import React, { useState, useEffect, useRef } from 'react';
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

  // ✅ Symbol selection state
//const [selectedSymbol, setSelectedSymbol] = useState('btcusd');

// Add state for order side selection
//const [orderSide, setOrderSide] = useState('buy'); // 'buy' or 'sell'

// ✅ Available symbols
//const AVAILABLE_SYMBOLS = [
  //{ value: 'btcusd', label: 'BTC / USD' },
  //{ value: 'ethusd', label: 'ETH / USD' },
  //{ value: 'solusd', label: 'SOL / USD' },
//];

// Put this near your other constants in Dashboard.jsx
const DEFAULT_SYMBOLS = ['btcusd', 'ethusd', 'solusd'];

  // ✅ Trades State
  const [trades, setTrades] = useState([]);
  const [loadingTrades, setLoadingTrades] = useState(true);

  // ✅ NEW: Live Gemini market trades from WebSocket
  const [liveGeminiTrades, setLiveGeminiTrades] = useState([]);

  // ✅ Real Gemini positions (per model & symbol)
//const [openPositions, setOpenPositions] = useState([]);
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

// Helper function to add logs
// ✅ REPLACE THIS
// ✅ FINAL SAFE addLog (handles both orders)
const addLog = (a, b = 'info') => {
  const validTypes = ['info', 'success', 'warning', 'error'];

  let type, message;

  if (validTypes.includes(a)) {
    // addLog('success', 'message')
    type = a;
    message = b;
  } else {
    // addLog('message', 'success')
    type = validTypes.includes(b) ? b : 'info';
    message = a;
  }

  const timestamp = new Date().toLocaleTimeString();

  // 1. Update local UI state (The "Live" view)
  setTradingLogs(prev => [
    { timestamp, type, message },
    ...prev
  ].slice(0, 50));

  console.log(`[${type.toUpperCase()}] ${message}`);

  // 2. Archive to Database in the background
  if (userInfo?.sub) {
    fetch('/api/logs/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        userId: userInfo.sub, 
        message, 
        type 
      })
    }).catch(err => console.error("Archive failed:", err));
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
  closeAllPositions,  // ✅ Already there
  clearPositions,     // ✅ ADD THIS LINE
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
    return saved === null ? true : saved === 'true'; // Default to true (mock mode)
  });

  // ✅ Track the last user-set starting value separately
  const [lastSetStartingValue, setLastSetStartingValue] = useState(() => {
    const saved = localStorage.getItem('lastSetStartingValue');
    return saved || '100';
  });

  // Load saved values from localStorage or use defaults
  const [stopLoss, setStopLoss] = useState(() => localStorage.getItem('stopLoss') || '');
  const [profitTarget, setProfitTarget] = useState(() => localStorage.getItem('profitTarget') || '');
  const [startingValue, setStartingValue] = useState(() => {
    const saved = localStorage.getItem('startingValue');
    return saved || '100';
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
  const [appState, setAppState] = useState({}); // ✅ ADD THIS LINE
  const [initialValues, setInitialValues] = useState(() => {
    const saved = localStorage.getItem('initialValues');
    return saved ? JSON.parse(saved) : {};
  });
  const [socketConnected, setSocketConnected] = useState(false);
  const [updateSpeed, setUpdateSpeed] = useState(() => localStorage.getItem('updateSpeed') || '1500');

  const { modelsLatest, modelsHistory } = useModels();
  // We map 'latest' to both 'cryptoLatest' and 'cryptoPrices' so your existing code doesn't break
  const { latest: cryptoLatest, latest: cryptoPrices, history: cryptoHistory } = useCryptoPrices();

  const availableModels = Object.values(modelsLatest);
  // ✅ Replace your old 'const startValue = ...' with this:
const startValue = (isTrading && appState?.tradingSession?.startValue != null)
  ? Number(appState.tradingSession.startValue)
  : (parseFloat(startingValue) || 100);

const safeStartValue = Number.isFinite(startValue) && startValue > 0 ? startValue : 100;

const [localModelOverrides, setLocalModelOverrides] = useState({});

  const currentPrice = cryptoLatest.BTCUSDT || null;

  
  // ✅ Add refs to hold the "live" values
const stopLossRef = useRef(parseFloat(stopLoss) || 2.0);
const profitTargetRef = useRef(parseFloat(profitTarget) || 5.0);

const isSyncingFromServer = useRef(false); // ✅ Add this line



  // ========================================
// 🚀 GEMINI LIVE TRADING HANDLERS - ADD HERE
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

/**
 * Start Gemini Live Trading for a specific model
 */
/**
 * Start Gemini Live Trading for a specific model and symbol
 */
/**
 * ✅ NEW: Model decides symbol AND direction automatically
 */

// ✅ Helper to check if there's ANY open position
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
    
    // AI Logic (Replace with your actual model prediction)
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

  // ✅ BLOCK SELL (SHORT) IF NO POSITION EXISTS
  if (direction === 'sell' && !hasOpenPosition) {
    addLog('🚫 Skipping SHORT signal (Spot trading only supports BUY to open)', 'info');
    return;
  }

  let amount = symbol === 'btcusd' ? 0.001 : symbol === 'ethusd' ? 0.01 : 0.1;

  // ✅ Log model decision BEFORE placing order
  addLog(
    `🤖 ${model.name} decided to ${direction.toUpperCase()} ${symbol.toUpperCase()} @ $${price.toFixed(2)}`,
    direction === 'buy' ? 'success' : 'warning'
  );

  try {
    const result = await placeGeminiOrder({
      userId: userInfo?.sub,  // ✅ ADDED userId
      modelId: model.id,
      modelName: model.name,
      symbol: symbol.toLowerCase(),
      amount: amount,
      side: direction,
      price: price,
      type: 'exchange limit',
      closePosition: false,
    });

    // ✅ ENHANCED ERROR LOGGING
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

    // ✅ Extract actual data from the Gemini response
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
      // This log shows the REAL trade data from Gemini
      addLog(
        `💎 GEMINI TRADE: ${side.toUpperCase()} ${actualAmount} ${orderSymbol.toUpperCase()} @ $${actualPrice.toFixed(2)} (ID: ${order_id})`,
        'success'
      );
    } else {
      addLog(`⏳ Order placed but not yet filled: ${side.toUpperCase()} ${orderSymbol.toUpperCase()} @ $${limitPrice}`, 'info');
    }
    
    await fetchOpenPositions();
    
  } catch (err) {
    addLog(`❌ Execution Error: ${err.message}`, 'error');
  }
};

/**
 * Stop Gemini Live Trading for a specific model
 */
/**
 * Stop Gemini Live Trading for a specific model and symbol
 */
/**
 * ✅ NEW: Stop trading = Close position + Calculate P&L + Auto-restart
 */
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
    // ✅ ADD THIS DEBUG LOG HERE (right before placeGeminiOrder)
    console.log('🔍 Closing position with userId:', userInfo?.sub || user?.sub);

    const result = await placeGeminiOrder({
      userId: userInfo?.sub || user?.sub,  // ✅ Fallback to user.sub if userInfo is undefined
      symbol,
      side: closingSide,
      amount: position.amount,
      price: currentPrice,
      type: 'exchange limit',
      modelId: model.id,
      modelName: model.name,
      closePosition: true,
    });

    // ✅ ENHANCED ERROR LOGGING
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

    // ✅ SUCCESS: Extract P&L and order details
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

    // Log the actual closing trade
    addLog(
      `💎 POSITION CLOSED: ${side?.toUpperCase() || closingSide.toUpperCase()} ${actualAmount} ${(orderSymbol || symbol).toUpperCase()} @ $${actualPrice.toFixed(2)} (ID: ${order_id || 'N/A'})`,
      'success'
    );

    // Log P&L
    addLog(`💰 P&L: $${pnl.toFixed(2)}`, pnl >= 0 ? 'success' : 'error');
    
    await fetchOpenPositions();
    await refreshGeminiBalances();

    // ✅ AUTO-RESTART LOOP
    addLog(`🔄 Strategy continuing... searching for next opportunity.`, 'info');
    setTimeout(() => handleStartGeminiTrading(model), 3000); 

  } catch (error) {
    addLog(`❌ Error during stop: ${error.message}`, 'error');
  }
};

// In Dashboard.jsx, above handleStopAllGeminiTrading
const getAvailableBalance = (currencyCode) => {
  if (!geminiBalances) {
    console.warn('⚠️ geminiBalances is null/undefined');
    return 0;
  }

  const code = currencyCode.toLowerCase();
  
  console.log('🔍 Looking up balance for:', code, 'in:', geminiBalances);
  
  // geminiBalances structure from useGemini: { btc: 0.0002, eth: 0.01, ... }
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

/**
 * Stop ALL Gemini Live Trading
 */
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

  // ✅ Step 1: Refresh balances to get actual available amounts
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
      const symbol = position.symbol.toLowerCase();      // e.g. 'btcusd'
      const currency = symbol.replace('usd', '');        // 'btcusd' -> 'btc'

      console.log(`\n🔍 Processing position:`, {
        model: position.modelName,
        symbol,
        positionAmount: position.amount,
        entryPrice: position.entryPrice
      });

      // ✅ Step 2: Get actual available balance from Gemini
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

      // ✅ Step 3: Sell the smaller of (position amount) vs (actual balance)
      let amountToSell = Math.min(Number(position.amount), availableBalance);

      // ✅ Apply a small safety margin to avoid "insufficient funds"
      amountToSell = amountToSell * 0.995; // sell 99.5% of that

      // ✅ Step 4: Apply Gemini's precision rules
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

      // ✅ Step 5: Check minimum order size
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

      // ✅ Step 6: Get current market price
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

      // ✅ Step 7: Place the sell order
      const result = await placeGeminiOrder({
          symbol: position.symbol,
          side: 'sell',
          amount: amountToSell.toString(),
          // price is NOT required for market orders; we keep it only for logging if backend ignores it
          price: roundedPrice.toString(),
          type: 'exchange limit',   // 🔑 use MARKET order so it actually fills
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

      // Small delay to avoid rate limiting
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

  // ✅ Step 9: Show detailed results
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

  // ✅ Step 9: Refresh UI
  clearPositions();                 // ✅ NEW: immediate UI clear
  await new Promise((r) => setTimeout(r, 800));  // ✅ NEW: small delay
  await fetchOpenPositions();
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

  // ✅ Listen for real-time trade updates
  useEffect(() => {
  fetchTrades();

  socket.on('new_trade', (trade) => {
    console.log('📊 New trade received:', trade);
    setTrades((prev) => [trade, ...prev].slice(0, 20));
  });

  // ✅ FIX: Clear logs listener with correct state setter
  socket.on('clear_session_logs', () => {
    console.log("🧹 Clearing session logs (triggered by another device)");
    setTradingLogs([]); // ✅ CORRECT
  });

  return () => {
    socket.off('new_trade');
    socket.off('clear_session_logs');
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

    /**
     * Backend payload shape:
     * {
     *   initialValues: { modelId: number, ... },  // ← RAW baselines
     *   startingValue,                             // ← UI Start Value ($100, $500, etc.)
     *   sessionId,
     *   startTime,
     *   entryPrices
     * }
     */

    const initialVals =
      payload?.initialValues && typeof payload.initialValues === 'object'
        ? payload.initialValues
        : {};

    if (Object.keys(initialVals).length === 0) {
      console.warn('⚠️ models_reset received without initialValues');
      return;
    }

    // ✅ Patch 2: Extract the Start Value from payload
    const sv = Number(payload?.startingValue) || 100;

    // ✅ Create overrides that force ALL models to display the Start Value
    // (NOT the raw initialValues which are baseline snapshots)
    const overrides = {};
    Object.keys(initialVals).forEach((modelId) => {
      overrides[modelId] = sv;  // ← Use Start Value, not raw baseline
    });

    // ✅ Force UI to start at Starting Value immediately
    setLocalModelOverrides(overrides);

    // ✅ Store the raw baselines for percentage calculations
    setInitialValues(initialVals);

    // ✅ Optional: keep session info synced (safe no-op if unused)
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

    // ✅ Let live data take over after short delay
    setTimeout(() => {
      setLocalModelOverrides({});
    }, 2000);
  };

  socket.on('models_reset', handleModelsReset);

  return () => {
    socket.off('models_reset', handleModelsReset);
  };
}, [socket]);

/*useEffect(() => {
  if (!isGeminiConnected) {
    setOpenPositions([]);
    return;
  }

  const fetchPositions = async () => {
    try {
      setLoadingPositions(true);
      const res = await fetch('/api/gemini/open-positions');
      const data = await res.json();
      if (!data.success) {
        console.error('Error fetching open positions:', data.error);
        return;
      }
      setOpenPositions(data.positions || []);
    } catch (err) {
      console.error('Error fetching open positions:', err.message);
    } finally {
      setLoadingPositions(false);
    }
  };

  // initial + every 5s
  fetchPositions();
  const id = setInterval(fetchPositions, 5000);
  return () => clearInterval(id);
}, [isGeminiConnected]); */

useEffect(() => {
  const onOpened = (pos) => {
    console.log('🟢 Position opened:', pos);
    
    // ✅ Log the opening event
    addLog(
      `🚀 ${pos.modelName} opened ${pos.side} on ${pos.symbol.toUpperCase()} @ $${pos.entryPrice.toFixed(2)}`, 
      'success'
    );
    
    fetchOpenPositions(); // refresh from backend
  };

  const onClosed = (payload) => {
    console.log('🔴 Position closed:', payload);
    
    // ✅ STEP 3 FIX: Extract data and log P&L
    const {
      model_name,
      symbol,
      pnl,
      entryPrice,
      exitPrice,
      quantity
    } = payload;

    // Format the P&L text and color
    const isProfit = pnl >= 0;
    const pnlText = isProfit
      ? `✅ PROFIT +$${pnl.toFixed(2)}`
      : `❌ LOSS -$${Math.abs(pnl).toFixed(2)}`;

    // Add the detailed log to the System Logs panel
    addLog(
      `📉 ${model_name} closed ${symbol.toUpperCase()} | Entry: $${entryPrice.toFixed(2)} → Exit: $${exitPrice.toFixed(2)} | Qty: ${quantity} | ${pnlText}`,
      isProfit ? 'success' : 'error'
    );

    fetchOpenPositions(); // refresh from backend
  };

  socket.on('position_opened', onOpened);
  socket.on('position_closed', onClosed);

  return () => {
    socket.off('position_opened', onOpened);
    socket.off('position_closed', onClosed);
  };
}, []); // Keep empty dependency array so it only mounts once

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
 /* useEffect(() => {
    if (geminiApiKey) localStorage.setItem('geminiApiKey', geminiApiKey);
    else localStorage.removeItem('geminiApiKey');
  }, [geminiApiKey]);

  useEffect(() => {
    if (geminiApiSecret) localStorage.setItem('geminiApiSecret', geminiApiSecret);
    else localStorage.removeItem('geminiApiSecret');
  }, [geminiApiSecret]);
  */

  // ✅ Persist mock trading state
  /*useEffect(() => {
    localStorage.setItem('isMockTrading', isMockTrading.toString());
  }, [isMockTrading]);
  */

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

    // ✅ Step 1: Save credentials to server (encrypted)
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

    // ✅ Step 2: Test connection
    //const result = await connectGemini(geminiApiKey, geminiApiSecret);
    const result = await connectGemini(userInfo.sub);

    if (!result.success) {
      throw new Error(result.error || 'Failed to connect to Gemini');
    }

    addLog('✅ Connected to Gemini successfully', 'success');

    // Close modal after success
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
      // Delete credentials from server
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
    // Open Gemini in new tab
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

  // Save to localStorage whenever values change
 /* useEffect(() => {
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
  */

  // Calculate normalized value for a model
  // Calculate normalized value for a model
// 1. Update the normalization logic to use the session's start value
const getNormalizedValue = (modelId) => {
  if (localModelOverrides[modelId] !== undefined) {
    return localModelOverrides[modelId];
  }

  const model = modelsLatest[modelId];
  if (!model || typeof model.accountValue !== 'number') {
    return safeStartValue;
  }

  // Use safeStartValue which is derived from appState.tradingSession.startValue
  if (!initialValues[modelId]) {
    return Math.round(model.accountValue);
  }

  const actualInitial = initialValues[modelId];
  const actualCurrent = model.accountValue;
  
  if (actualInitial === 0) return safeStartValue;
  
  const percentChange = (actualCurrent - actualInitial) / actualInitial;

  // ✅ All models now scale based on the value you entered
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

  // ========================================
// STATE HYDRATION FROM SERVER
// ========================================
useEffect(() => {
  if (!userInfo?.sub) return;

  // Join Socket.IO room
  socket.emit('join_user_room', userInfo.sub);

  // Fetch saved state from server
  fetch(`/api/app-state?userId=${userInfo.sub}`)
    .then(res => res.json())
    .then(data => {
      if (data.success && data.state) {
        const savedState = data.state;

        // ✅ Patch 1: hydrate appState so session startValue logic works
        setAppState(savedState);

        // Hydrate all UI state
        setSelectedModels(savedState.selectedModels || []);
        setStartingValue(String(savedState.startingValue ?? "100")); // ✅ normalize to string
        setStopLoss(savedState.stopLoss || "");
        setProfitTarget(savedState.profitTarget || "");
        setIsTrading(savedState.isTrading || false);
        setTradingStopped(savedState.tradingStopped || false);
        setStopReason(savedState.stopReason || "");
        setFinalProfitLoss(savedState.finalProfitLoss || null);
        setInitialValues(savedState.initialValues || {});
        setUpdateSpeed(savedState.updateSpeed || "1500");
        setIsMockTrading(savedState.isMockTrading !== false);

        addLog('✅ Settings synced from server', 'success');
      }
    })
    .catch(err => {
      console.error('❌ Failed to load app state:', err);
      addLog('⚠️ Failed to sync settings', 'warning');
    });

  // Check if user has Gemini credentials
  fetch(`/api/gemini/credentials/status?userId=${userInfo.sub}`)
    .then(res => res.json())
    .then(data => {
      if (data.success && data.hasCredentials) {
        addLog('💎 Gemini credentials found on server', 'info');
        // Note: We don't auto-connect here - user must click "Connect" button
      }
    })
    .catch(err => console.error('Failed to check Gemini credentials:', err));

}, [userInfo?.sub]);

// ========================================
// STATE SYNCING TO SERVER (DEBOUNCED)
// ========================================
useEffect(() => {
  if (!userInfo?.sub) return;

  // ✅ If this state change was caused by a sync from another device, 
  // reset the flag and STOP here. Do not send back to server.
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

    console.log("📤 Sending state update to server...");

    fetch('/api/app-state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: userInfo.sub, state: stateToSave })
    }).catch(err => console.error('Failed to save state:', err));

  }, 1000); // Debounce 1 second

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

// ========================================
// REAL-TIME SYNC FROM OTHER DEVICES
// ========================================
useEffect(() => {
  socket.on('app_state_sync', (newState) => {
    // ✅ Set the flag to true so the outgoing sync effect ignores this update
    isSyncingFromServer.current = true;

    // ✅ Patch 3: Update appState so startValue calculation works correctly
    setAppState(newState);

    setSelectedModels(newState.selectedModels || []);
    setStartingValue(String(newState.startingValue ?? "100")); // ✅ normalize to string
    setStopLoss(newState.stopLoss || "");
    setProfitTarget(newState.profitTarget || "");
    setIsTrading(newState.isTrading || false);
    setTradingStopped(newState.tradingStopped || false);
    setStopReason(newState.stopReason || "");
    setFinalProfitLoss(newState.finalProfitLoss || null);
    setInitialValues(newState.initialValues || {});
    setUpdateSpeed(newState.updateSpeed || "1500");
    setIsMockTrading(newState.isMockTrading !== false);

    //addLog('🔄 Settings synced from another device', 'info');
  });

  return () => socket.off('app_state_sync');
}, []);

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
            console.warn(`Cannot set initial value for ${modelId}: model data unavailable`);
            return prevInit;
          }

          console.log(`✅ Setting initial value for ${modelId}: ${model.accountValue} (will normalize to ${safeStartValue})`);

          return {
            ...prevInit,
            // Set the "initial" actual account value to the current one,
            // so normalized value becomes exactly startingValue at this moment
            [modelId]: model.accountValue
          };
        });

        // ✅ FIX: Force UI to show startingValue immediately
        setLocalModelOverrides(prev => ({
          ...prev,
          [modelId]: safeStartValue
        }));

        console.log(`🎯 Model ${modelId} added mid-session - will display at $${safeStartValue}`);

        // ✅ Clear the override after 2 seconds so live data takes over
        setTimeout(() => {
          setLocalModelOverrides(prev => {
            const updated = { ...prev };
            delete updated[modelId];
            return updated;
          });
          console.log(`🔄 Cleared override for ${modelId} - now showing live normalized value`);
        }, 2000);
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

  /*const handleStartTrading = async () => {
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
}; */

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
  if (!isTrading) return;

  const interval = setInterval(() => {
    checkRiskManagement(); // ✅ Check every tick
  }, 5000);

  return () => clearInterval(interval);
}, [isTrading, openPositions]);

const handleStartTrading = async () => {
  // ✅ 1. Clear the UI logs for a fresh session
  setTradingLogs([]);

  // ✅ 2. Tell other devices to clear their UI logs too
  if (userInfo?.sub) {
    socket.emit('request_clear_logs', userInfo.sub);
  }

  // ✅ 3. Start the fresh session log
  addLog("🚀 Starting fresh trading session. Previous logs archived to database.", "info");

  console.log("🚀 Start Button Clicked. Selected Models:", selectedModels);
  console.log("🔍 Models Latest Data:", modelsLatest);

  // Validation: Check if models are selected
  if (!selectedModels || selectedModels.length === 0) {
    addLog("⚠️ No models selected! Please select at least one model to trade.", "warning");
    alert('Please select at least one model to trade');
    return;
  }

  // Validation: Check starting value
  const sv = parseFloat(startingValue);
  if (!sv || sv <= 0) {
    addLog("⚠️ Invalid starting value. Must be greater than 0.", "error");
    alert('Please enter a valid starting value (must be greater than 0)');
    return;
  }

  // Validation: Check if at least one risk parameter is set
  if (!stopLoss && !profitTarget) {
    addLog("⚠️ Please set Stop Loss or Profit Target.", "warning");
    alert('Please enter at least one value (Stop Loss or Profit Target)');
    return;
  }

  const stopLossValue = parseFloat(stopLoss);
  const profitTargetValue = parseFloat(profitTarget);

  // Validation: Stop Loss
  if (stopLoss && (isNaN(stopLossValue) || stopLossValue <= 0)) {
    addLog("⚠️ Invalid Stop Loss value.", "error");
    alert('Please enter a valid Stop Loss value (must be greater than 0)');
    return;
  }

  // Validation: Profit Target
  if (profitTarget && (isNaN(profitTargetValue) || profitTargetValue <= 0)) {
    addLog("⚠️ Invalid Profit Target value.", "error");
    alert('Please enter a valid Profit Target value (must be greater than 0)');
    return;
  }

  // ✅ 4. Create a GLOBAL "Start Trading" snapshot
  // This is what makes Overview + Monitored start at the same baseline everywhere.
  const sessionStartTime = new Date().toISOString();
  const sessionId = `${userInfo?.sub || 'anon'}_${Date.now()}`;

  // Snapshot entry prices for *all* symbols we care about (MODELS + whatever is in cryptoPrices)
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
    // Not fatal, but it means UI won't be able to compute consistent P&L baselines yet
    addLog("⚠️ Price snapshot was empty (cryptoPrices not ready). Baselines may be inconsistent until prices load.", "warning");
  } else {
    addLog(`📌 Captured global start price snapshot for ${Object.keys(entryPrices).length} symbols`, "info");
  }

  // ✅ 5. Initial values:
  // IMPORTANT FIX:
  // - `initialValues` must store the *RAW* model accountValue at session start (baseline for percent change).
  // - The *DISPLAY* should start at `sv` for ALL models (done via local overrides).
  const initialVals = {};
  const uiStartOverrides = {};

  (availableModels || []).forEach(m => {
    if (!m?.id) return;

    const rawNow = modelsLatest?.[m.id]?.accountValue;

    // Baseline raw value for normalization math
    if (typeof rawNow === 'number' && isFinite(rawNow) && rawNow > 0) {
      initialVals[m.id] = rawNow;
    } else {
      // Fallback so we don't end up with undefined / 0
      initialVals[m.id] = sv;
    }

    // Force UI to show the start value immediately
    uiStartOverrides[m.id] = sv;
  });

  // Fallback: if availableModels somehow empty, at least set selected models
  if (Object.keys(initialVals).length === 0) {
    (selectedModels || []).forEach(modelId => {
      const rawNow = modelsLatest?.[modelId]?.accountValue;
      initialVals[modelId] = (typeof rawNow === 'number' && isFinite(rawNow) && rawNow > 0) ? rawNow : sv;
      uiStartOverrides[modelId] = sv;
    });
  }

  setInitialValues(initialVals);
  setLocalModelOverrides(uiStartOverrides); // Set locally for instant UI feedback

  // ✅ 5.5 CRITICAL: Force modelsLatest to start at the Starting Value
  // This ensures the UI displays $10 (or whatever Starting Value is) immediately
  //setModelsLatest(initialVals);

  // ✅ 6. Set trading state locally
  setIsTrading(true);
  setTradingStopped(false);
  setStopReason('');
  setFinalProfitLoss(null);

  addLog(`🚀 Starting trading session with ${selectedModels.length} model(s)...`, 'info');
  console.log("📊 Initial Values Set (RAW BASELINES):", initialVals);
  console.log("🧷 UI Start Overrides (DISPLAY = Start Value):", uiStartOverrides);

  // ✅ 7. Sync state to backend (multi-device consistency)
  if (userInfo?.sub) {
    const stateToSave = {
      selectedModels,
      startingValue: sv, // store as number (cleaner than string)
      stopLoss,
      profitTarget,
      isTrading: true,
      initialValues: initialVals, // 🔥 This triggers the backend reset
      tradingStopped: false,
      stopReason: '',
      finalProfitLoss: null,

      // 🔥 The important new part:
      tradingSession: {
        sessionId,
        startTime: sessionStartTime,
        startValue: sv,
        entryPrices, // symbol -> price at the instant Start Trading was clicked
      },

      // Used by UI to ensure Overview + Monitored start at the same Start Value
      initialValues: initialVals,

      updateSpeed,
      isMockTrading,
    };

    console.log("📤 Syncing trading state to server...");

    try {
      await fetch('/api/app-state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userInfo.sub,
          state: stateToSave,
          socketId: socket.id, // ✅ Exclude this device from broadcast
        }),
      });
      console.log("✅ State synced successfully");
    } catch (err) {
      console.error('❌ Failed to save state:', err);
      addLog('⚠️ Failed to sync state to server', 'warning');
    }
  }

  // ✅ 8. Trigger Gemini Trading if connected (only for selected models)
  if (isGeminiConnected) {
    addLog('🔗 Gemini is connected. Initializing model strategies...', 'info');

    for (const modelId of selectedModels) {
      // ✅ FIX: Use availableModels instead of MODELS
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

  /*const handleStopTrading = async () => {
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
  }; */

  // ✅ Close all active Gemini trades (reused by Stop Trading button)
const handleCloseAllGeminiTrading = async () => {
  addLog('info', '⏹ Closing active Gemini trade...');

  try {
    const res = await axios.post('/api/gemini/close-all', {
      apiKey: geminiApiKey,
      apiSecret: geminiApiSecret,
      env: 'live'
    });

    // ✅ Check if backend explicitly said no positions found
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

      // Calculate total P&L across all closed positions
      const totalPnl = results.reduce((sum, r) => sum + (Number(r.pnl) || 0), 0);
      const pnlSign = totalPnl >= 0 ? '+' : '';

      // Log the summary
      addLog(
        'success',
        `✅ Closed ${results.length} position(s) | Total P&L: ${pnlSign}${totalPnl.toFixed(2)} USDT`
      );

      // Log each specific trade detail
      results.forEach(r => {
        const individualPnl = (Number(r.pnl) || 0).toFixed(2);
        const individualSign = individualPnl >= 0 ? '+' : '';
        addLog(
          'info', 
          `💎 GEMINI CLOSE: ${r.symbol.toUpperCase()}: ${r.side} closed at ${r.exitPrice} | P&L: ${individualSign}${individualPnl} USDT`
        );
      });

      // Refresh balances
      if (typeof fetchGeminiBalances === 'function') {
        fetchGeminiBalances(geminiApiKey, geminiApiSecret, 'live');
      }

      // Refresh positions list
      if (typeof fetchOpenPositions === 'function') {
        await fetchOpenPositions();
      }
    } else {
      addLog('error', `❌ Close failed: ${res.data?.error || 'Unknown error'}`);
    }
  } catch (err) {
    const errorMsg = err.response?.data?.error || err.message || 'Unknown error';
    
    // ✅ Gracefully handle "No open positions found" error
    if (errorMsg.includes("No open positions found")) {
      addLog('info', 'ℹ️ No active trades found to close.');
    } else {
      addLog('error', `❌ Close error: ${errorMsg}`);
    }
  }
};

  const handleStopTrading = async () => {
      // Calculate final P/L
      const totalProfit = selectedModels.reduce((sum, modelId) => {
        const currentValue = getNormalizedValue(modelId);
        return sum + (currentValue - startValue);
      }, 0);

      setIsTrading(false);
      setTradingStopped(true);
      setFinalProfitLoss(totalProfit);
      setStopReason('Trading stopped manually');

      // ✅ Stop Trading should run the SAME logic as the old "CloseAllGeminiTrading" button
      if (isGeminiConnected) {
        await handleCloseAllGeminiTrading(); // <-- whatever your close-all button was calling
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
    setGeminiTradingStatuses({}); // ✅ important: per-model status UI

    // Optional: clear symbol-specific trade tables if you want a "fresh screen"
    // setBtcTrades([]);
    // setEthTrades([]);
    // setSolTrades([]);

    localStorage.removeItem('stopLoss');
    localStorage.removeItem('profitTarget');
    localStorage.setItem('startingValue', lastSetStartingValue);
    localStorage.removeItem('selectedModels');
    localStorage.removeItem('isTrading');
    localStorage.removeItem('initialValues');
  };

  const handleReset = async () => {
    // ✅ STEP 1: Close all open Gemini positions FIRST
    if (isGeminiConnected && openPositions.length > 0) {
      const confirmed = window.confirm(
        `Reset will close all ${openPositions.length} open Gemini positions.\n\nContinue?`
      );
      
      if (!confirmed) return;

      console.log('🧹 Reset: Closing all Gemini positions before clearing state...');
      
      // Close all positions
      await handleStopAllGeminiTrading();
      
      // Wait a moment for positions to close
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // ✅ NEW: Hard-clear stale position UI immediately after closing
      clearPositions();
      
      // ✅ NEW: Small delay, then re-sync truth from Gemini
      await new Promise(resolve => setTimeout(resolve, 800));
      await fetchOpenPositions();
    }

    // ✅ STEP 2: Clear UI state
    setIsTrading(false);
    setTradingStopped(false);
    setStopReason('');
    setFinalProfitLoss(null);
    setStopLoss('');
    setProfitTarget('');
    setStartingValue(lastSetStartingValue);
    setSelectedModels([]);
    setInitialValues({});
    setGeminiTradingStatuses({}); // ✅ NEW: Clear per-model Gemini status UI

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
      {/*{availableModels.length > 0 && (
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

              // ✅ NEW: Check if this model has an open Gemini position
              const hasGeminiPosition = (openPositions || []).some(
                p => p.modelId === modelId 
                //&& p.symbol.toLowerCase() === (selectedSymbol || 'btcusd').toLowerCase()
              );

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

                  {/* ✅ Model will auto-select symbol - no manual buttons needed */}
                  {/*{isGeminiConnected && isSelected && (
                    <div
                      style={{
                        marginTop: '8px',
                        padding: '8px',
                        backgroundColor: 'rgba(76, 175, 80, 0.1)',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        color: '#2e7d32',
                        textAlign: 'center',
                      }}
                    >
                      🤖 Model will auto-select best symbol & direction
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        </div>
      )} */}

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
              placeholder="e.g., 100"
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="text"
                inputMode="decimal"
                value={stopLoss}
                onChange={handleStopLossChange}
                disabled={false} // ✅ Changed from {isTrading} to {false}
                placeholder="e.g., 950"
                style={{
                  width: '100%',
                  padding: '10px',
                  fontSize: '16px',
                  borderRadius: '4px',
                  border: '1px solid #ccc'
                }}
              />
              {isTrading && (
                <span style={{
                  fontSize: '11px',
                  fontWeight: 'bold',
                  backgroundColor: '#10b981',
                  color: 'white',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  whiteSpace: 'nowrap'
                }}>
                  LIVE
                </span>
              )}
            </div>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
              Suggested: ${(startValue * 0.98).toFixed(0)} (2% below starting value)
            </div>
          </div>

          <div style={{ flex: '1', minWidth: '200px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Profit Target ($):
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="text"
                inputMode="decimal"
                value={profitTarget}
                onChange={handleProfitTargetChange}
                disabled={false} // ✅ Changed from {isTrading} to {false}
                placeholder="e.g., 1050"
                style={{
                  width: '100%',
                  padding: '10px',
                  fontSize: '16px',
                  borderRadius: '4px',
                  border: '1px solid #ccc'
                }}
              />
              {isTrading && (
                <span style={{
                  fontSize: '11px',
                  fontWeight: 'bold',
                  backgroundColor: '#10b981',
                  color: 'white',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  whiteSpace: 'nowrap'
                }}>
                  LIVE
                </span>
              )}
            </div>
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
              disabled={isResetting}
              style={{
                padding: '12px 24px',
                fontSize: '16px',
                fontWeight: 'bold',
                backgroundColor: isResetting ? '#90caf9' : '#2196F3',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: isResetting ? 'not-allowed' : 'pointer'
              }}
            >
              {isResetting ? 'Resetting...' : 'Reset'}
            </button>
          )}

          {/* ✅ NEW: Stop All Gemini button */}
          {/*{isGeminiConnected && openPositions.length > 0 && (
            <button
              onClick={handleStopAllGeminiTrading}
              style={{
                padding: '12px 24px',
                fontSize: '16px',
                fontWeight: 'bold',
                backgroundColor: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              🛑 Stop All Gemini Trading ({openPositions.length})
            </button>
          )} */}
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

        {/* Other Models Overview - Now with Direct Selection */}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0 }}>
                Models Overview (Click to Select/Deselect)
                {selectedModels.length > 0 && (
                  <span style={{ fontSize: '14px', fontWeight: 'normal', color: '#666', marginLeft: '10px' }}>
                    ({selectedModels.length} selected)
                  </span>
                )}
              </h3>
              
              {/* Select All / Deselect All Button */}
              <button
                onClick={() => {
                  if (selectedModels.length === availableModels.length) {
                    // Deselect all
                    setSelectedModels([]);
                  } else {
                    // Select all
                    setSelectedModels(availableModels.map(m => m.id || m.name));
                  }
                }}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #90caf9',
                  backgroundColor: '#ffffff',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 'bold',
                  color: '#1976d2',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = '#e3f2fd';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = '#ffffff';
                }}
              >
                {selectedModels.length === availableModels.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            {/* Total P/L for Selected Models */}
            {isTrading && selectedModels.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '10px',
                  marginBottom: '12px',
                  padding: '12px',
                  borderRadius: '6px',
                  backgroundColor: '#e8f5e9',
                  border: '1px solid #4caf50'
                }}
              >
                <div style={{ fontSize: '13px', color: '#2e7d32', fontWeight: 'bold' }}>
                  Total P/L for Selected Models:
                </div>

                {(() => {
                  const selectedTotalProfit = selectedModels.reduce((sum, modelId) => {
                    const currentValue = getNormalizedValue(modelId);
                    return sum + (currentValue - startValue);
                  }, 0);

                  const denom = startValue * selectedModels.length;
                  const selectedTotalProfitPercent = denom > 0 ? ((selectedTotalProfit / denom) * 100).toFixed(2) : '0.00';

                  return (
                    <div
                      style={{
                        padding: '10px 16px',
                        borderRadius: '6px',
                        backgroundColor: '#ffffff',
                        border: '2px solid #4caf50',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
                        fontWeight: 'bold',
                        fontSize: '18px',
                        color: selectedTotalProfit >= 0 ? '#2e7d32' : '#c62828'
                      }}
                    >
                      {selectedTotalProfit >= 0 ? '+' : ''}${Math.abs(Math.round(selectedTotalProfit)).toLocaleString()} ({selectedTotalProfitPercent}%)
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Models Grid */}
            {nonSelectedModels.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#666', fontSize: '14px', fontStyle: 'italic' }}>
                No models available
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                {nonSelectedModels.map((model, idx) => {
                  const modelId = model.id || model.name || `model_${idx}`;
                  const isSelected = selectedModels.includes(modelId);
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
                      onClick={() => {
                        // Toggle selection
                        if (isSelected) {
                          setSelectedModels(prev => prev.filter(id => id !== modelId));
                        } else {
                          setSelectedModels(prev => [...prev, modelId]);
                        }
                      }}
                      style={{
                        padding: '15px',
                        borderRadius: '10px',
                        backgroundColor: isSelected ? '#e3f2fd' : '#ffffff',
                        border: isSelected ? `3px solid ${color}` : '3px solid #cccccc',
                        minWidth: '200px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        boxShadow: isSelected ? '0 4px 10px rgba(0,0,0,0.25)' : '0 1px 3px rgba(0,0,0,0.15)',
                        transform: 'translateY(0)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        position: 'relative'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 4px 10px rgba(0,0,0,0.25)';
                        if (!isSelected) {
                          e.currentTarget.style.border = `3px solid ${color}`;
                          e.currentTarget.style.backgroundColor = '#f5f5f5';
                        }
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = isSelected ? '0 4px 10px rgba(0,0,0,0.25)' : '0 1px 3px rgba(0,0,0,0.15)';
                        if (!isSelected) {
                          e.currentTarget.style.border = '3px solid #cccccc';
                          e.currentTarget.style.backgroundColor = '#ffffff';
                        }
                      }}
                    >
                      {/* Selection Indicator */}
                      <div
                        style={{
                          position: 'absolute',
                          top: '10px',
                          right: '10px',
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          backgroundColor: isSelected ? color : '#eeeeee',
                          border: isSelected ? `2px solid ${color}` : '2px solid #bdbdbd',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontSize: '14px',
                          fontWeight: 'bold',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        {isSelected && '✓'}
                      </div>

                      {/* Model Name */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingRight: '30px' }}>
                        <div
                          style={{
                            width: '12px',
                            height: '12px',
                            borderRadius: '50%',
                            backgroundColor: color,
                            flexShrink: 0
                          }}
                        />
                        <div style={{ fontWeight: 'bold', fontSize: '15px', color: '#333' }}>
                          {model.name || modelId}
                        </div>
                      </div>

                      {/* Current Value */}
                      <div style={{ fontSize: '20px', fontWeight: 'bold', color }}>
                        ${currentValue.toLocaleString()}
                      </div>

                      {/* P/L Display (when trading) */}
                      {isTrading && initialValues[modelId] != null && (
                        <div
                          style={{
                            fontSize: '12px',
                            marginTop: '2px',
                            fontWeight: 'bold',
                            color: pnl >= 0 ? '#2e7d32' : '#c62828'
                          }}
                        >
                          {pnl >= 0 ? '▲' : '▼'} ${Math.abs(pnl).toLocaleString()} ({pnlPercent}%)
                        </div>
                      )}

                      {/* Live Indicator (when not trading) */}
                      {!isTrading && (
                        <div style={{ fontSize: '11px', color: '#4CAF50', fontWeight: 'bold' }}>
                          🔴 LIVE
                        </div>
                      )}

                      {/* Model Description (if available) */}
                      {model.description && (
                        <div style={{ fontSize: '11px', color: '#666', fontStyle: 'italic', marginTop: '4px', lineHeight: '1.3' }}>
                          {model.description}
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

      {/* ✅ SYSTEM LOGS PANEL - ADD THIS ENTIRE BLOCK */}
        <div style={{
          height: '150px',
          overflowY: 'auto',
          backgroundColor: '#1e1e1e',
          color: '#00ff00',
          padding: '10px',
          fontFamily: 'monospace',
          fontSize: '12px',
          borderRadius: '8px',
          marginTop: '20px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <div style={{ borderBottom: '1px solid #333', marginBottom: '5px', fontWeight: 'bold', paddingBottom: '5px' }}>
            SYSTEM LOGS
          </div>
          {tradingLogs.map((log, i) => (
            <div key={i} style={{ 
              marginBottom: '2px', 
              color: log.type === 'error' ? '#ff4444' : log.type === 'success' ? '#00ff00' : log.type === 'warning' ? '#ffaa00' : '#aaa' 
            }}>
              [{log.timestamp}] {log.message}
            </div>
          ))}
        </div>

      {/* ✅ My Real Gemini Positions */}
        {isGeminiConnected && (
          <div
            style={{
              background: '#ffffff',
              padding: '20px',
              borderRadius: '8px',
              marginBottom: '20px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: '15px' }}>📌 My Real Gemini Positions</h2>

            {loadingPositions ? (
              <div style={{ textAlign: 'center', padding: '30px', color: '#666' }}>
                Loading positions…
              </div>
            ) : openPositions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px', color: '#666', fontStyle: 'italic' }}>
                No open positions. Start trading to open a position.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '14px',
                  }}
                >
                  <thead>
                    <tr style={{ backgroundColor: '#f5f5f5', borderBottom: '2px solid #ddd' }}>
                      <th style={{ padding: '10px', textAlign: 'left' }}>Model</th>
                      <th style={{ padding: '10px', textAlign: 'left' }}>Symbol</th>
                      <th style={{ padding: '10px', textAlign: 'left' }}>Side</th>
                      <th style={{ padding: '10px', textAlign: 'right' }}>Entry Price</th>
                      <th style={{ padding: '10px', textAlign: 'right' }}>Amount</th>
                      <th style={{ padding: '10px', textAlign: 'left' }}>Opened At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(openPositions || []).map((p, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '10px', fontWeight: 'bold' }}>
                          {p.modelName || p.modelId}
                        </td>
                        <td style={{ padding: '10px' }}>{p.symbol?.toUpperCase()}</td>
                        <td style={{ padding: '10px' }}>{p.side}</td>
                        <td style={{ padding: '10px', textAlign: 'right', fontFamily: 'monospace' }}>
                          ${Number(p.entryPrice).toLocaleString()}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'right', fontFamily: 'monospace' }}>
                          {Number(p.amount)}
                        </td>
                        <td style={{ padding: '10px', color: '#666' }}>
                          {p.openedAt
                            ? new Date(p.openedAt).toLocaleTimeString()
                            : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )} 

      {/* ✅ Unified Last 20 Market Trades from Gemini */}
      {isGeminiConnected && (
        <div
          style={{
            background: '#ffffff',
            padding: '20px',
            borderRadius: '8px',
            marginBottom: '20px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>💎</span> 
            Last 20 Market Trades (Gemini)
          </h2>
          
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '14px',
              }}
            >
              <thead>
                <tr style={{ backgroundColor: '#f5f5f5', borderBottom: '2px solid #ddd' }}>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Time</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Model</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Symbol</th>
                  <th style={{ padding: '12px', textAlign: 'center' }}>Type</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>Price</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // Merge all trades into one array and add symbol info
                  const combinedTrades = [
                    ...btcTrades.map(t => ({ ...t, symbol: 'BTCUSD' })),
                    ...ethTrades.map(t => ({ ...t, symbol: 'ETHUSD' })),
                    ...solTrades.map(t => ({ ...t, symbol: 'SOLUSD' }))
                  ];

                  // Sort by timestamp descending (newest first) and take top 20
                  const sortedTrades = combinedTrades
                    .sort((a, b) => b.timestampms - a.timestampms)
                    .slice(0, 20);

                  if (sortedTrades.length === 0) {
                    return (
                      <tr>
                        <td colSpan="6" style={{ padding: '20px', textAlign: 'center', color: '#999', fontStyle: 'italic' }}>
                          Waiting for market data...
                        </td>
                      </tr>
                    );
                  }

                  return sortedTrades.map((trade, index) => (
                    <tr 
                      key={trade.tid || index} 
                      style={{ 
                        borderBottom: '1px solid #eee',
                        backgroundColor: index % 2 === 0 ? '#ffffff' : '#fafafa' 
                      }}
                    >
                      <td style={{ padding: '10px', color: '#666' }}>
                        {new Date(trade.timestampms).toLocaleTimeString()}
                      </td>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: '#333' }}>
                        Gemini Market
                      </td>
                      <td style={{ padding: '10px', fontWeight: '600' }}>
                        {trade.symbol}
                      </td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <span
                          style={{
                            padding: '4px 10px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            backgroundColor: trade.type === 'buy' ? '#e8f5e9' : '#ffebee',
                            color: trade.type === 'buy' ? '#2e7d32' : '#c62828',
                          }}
                        >
                          {trade.type.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 'bold' }}>
                        ${parseFloat(trade.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right', fontFamily: 'monospace' }}>
                        {parseFloat(trade.amount).toFixed(4)}
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
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