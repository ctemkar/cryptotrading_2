import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import LiveMultiChart from '../LiveMultiChart';
import ModelsComparisonChart from '../ModelsComparisonChart';
import useModels from '../../hooks/useModels';
import useCryptoPrices from '../../hooks/useCryptoPrices';
import { useGemini } from '../../hooks/useGemini';
import { startTrading } from '../../services/tradingService';
import useGeminiSocket from '../../hooks/useGeminiSocket';
import socket from '../../services/socket';
import axios from 'axios';
import AuthSection from './AuthSection';
// Removed import GeminiSection since we replace it inline
import TradingControls from './TradingControls';
import SystemLogs from './SystemLogs';
//import PositionsTable from './PositionsTable';
//import MarketTradesTable from './MarketTradesTable';
import TransactionsTable from './TransactionsTable';

// Import your Gemini UI components
import GeminiLoginModal from './GeminiLoginModal';  // New Gemini login modal
import GeminiBalances from './GeminiBalances';
//import GeminiOrderForm from './GeminiOrderForm';
import GeminiInfo from './GeminiInfo'; // <-- ensure GeminiInfo.jsx is in the same folder

// *** NEW IMPORT ***
import GeminiLoginPanel from './GeminiLoginPanel';


const DEFAULT_SYMBOLS = ['btcusd', 'ethusd', 'solusd'];

function Dashboard() {
  // Your existing state declarations (unchanged)
  const [geminiTradingStatuses, setGeminiTradingStatuses] = useState({});
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userInfo, setUserInfo] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [trades, setTrades] = useState([]);
  const [loadingTrades, setLoadingTrades] = useState(true);
  const [liveGeminiTrades, setLiveGeminiTrades] = useState([]);
  const [loadingPositions, setLoadingPositions] = useState(false);
  const [btcTrades, setBtcTrades] = useState([]);
  const [ethTrades, setEthTrades] = useState([]);
  const [solTrades, setSolTrades] = useState([]);

  // FIX: use plural 'geminiBalances' and setter 'setGeminiBalances' (was missing)
  const [geminiBalances, setGeminiBalances] = useState({
    btc: 0,
    eth: 0,
    sol: 0,
    usdc: 0,
    other: [],
    totalUsd: 0,
  });

  const [isResetting, setIsResetting] = useState(false);
  const [tradingLogs, setTradingLogs] = useState([]);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [tradeSymbol, setTradeSymbol] = useState('btcusd');
  const [tradeSide, setTradeSide] = useState('buy');
  const [tradeAmount, setTradeAmount] = useState('');
  const [tradePrice, setTradePrice] = useState('');
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState(() => localStorage.getItem('geminiApiKey') || '');
  const [geminiApiSecret, setGeminiApiSecret] = useState(() => localStorage.getItem('geminiApiSecret') || '');
  const [isGeminiConnecting, setIsGeminiConnecting] = useState(false);
  const [geminiStep, setGeminiStep] = useState(1);
  const [isMockTrading, setIsMockTrading] = useState(() => {
    const saved = localStorage.getItem('isMockTrading');
    return saved === null ? true : saved === 'true';
  });
  const [lastSetStartingValue, setLastSetStartingValue] = useState(() => {
    const saved = localStorage.getItem('lastSetStartingValue');
    return saved || '100';
  });
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
  const [appState, setAppState] = useState({});
  const [initialValues, setInitialValues] = useState(() => {
    const saved = localStorage.getItem('initialValues');
    return saved ? JSON.parse(saved) : {};
  });
  const [socketConnected, setSocketConnected] = useState(false);
  const [updateSpeed, setUpdateSpeed] = useState(() => localStorage.getItem('updateSpeed') || '1500');
  const [localModelOverrides, setLocalModelOverrides] = useState({});
  const [showMonitoringPanel, setShowMonitoringPanel] = useState(false);
  const [openPositions, setOpenPositions] = useState([]);
  const [geminiMarketTrades, setGeminiMarketTrades] = useState([]);
  const [geminiTransactions, setGeminiTransactions] = useState([]);

  // SMALL FIXES: states referenced by Gemini handlers (avoid future ReferenceErrors)
  const [showGeminiLoginModal, setShowGeminiLoginModal] = useState(false);
  const [localGeminiError, setLocalGeminiError] = useState(null);

  // Ref to track pending simulated trade timers so we can clear them on stop
  const tradeTimeoutsRef = useRef([]);

  // Hooks
  const { modelsLatest, modelsHistory } = useModels();
  const { latest: cryptoLatest, latest: cryptoPrices, history: cryptoHistory } = useCryptoPrices();
  const availableModels = Object.values(modelsLatest);
  // ✅ ADD THIS RIGHT HERE
  console.log('Current BTC Price:', cryptoLatest.BTCUSD, 'Model 1 Value:', modelsLatest[Object.keys(modelsLatest)[0]]?.accountValue);
  const startValue = (isTrading && appState?.tradingSession?.startValue != null)
    ? Number(appState.tradingSession.startValue)
    : (parseFloat(startingValue) || 100);
  const safeStartValue = Number.isFinite(startValue) && startValue > 0 ? startValue : 100;
  const currentPrice = cryptoLatest.BTCUSD || null;
  const stopLossRef = useRef(parseFloat(stopLoss) || 2.0);
  const profitTargetRef = useRef(parseFloat(profitTarget) || 5.0);
  const isSyncingFromServer = useRef(false);

  // Gemini hook destructure
  const {
    balances: geminiBalancesFromHook,
    marketTrades: geminiMarketTradesFromHook,
    openPositions: openPositionsFromHook,
    loading: geminiLoading,
    error: geminiErrorFromHook,
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

  // Sync hook state with local state
  useEffect(() => {
    setOpenPositions(openPositionsFromHook);
  }, [openPositionsFromHook]);

  // ✅ ADD THIS RIGHT HERE — Live P&L calculation on every price tick
  useEffect(() => {
    if (!openPositions.length || !cryptoPrices) return;

    const updated = openPositions.map(pos => {
      const symbol = (pos.symbol || pos.crypto_symbol || '').toUpperCase();
      const currentPrice = cryptoPrices[symbol];
      
      if (!currentPrice || !pos.entryPrice) return pos;

      const quantity = Number(pos.amount || pos.quantity || 0);
      const pnl = (currentPrice - pos.entryPrice) * quantity;
      const pnl_pct = ((currentPrice / pos.entryPrice) - 1) * 100;

      return { ...pos, live_pnl: pnl, live_pnl_pct: pnl_pct };
    });

    if (JSON.stringify(updated) !== JSON.stringify(openPositions)) {
      setOpenPositions(updated);
    }
  }, [cryptoPrices]); // ⚠️ Only depend on cryptoPrices — NOT openPositions (avoids infinite loop)

  useEffect(() => {
    setGeminiMarketTrades(geminiMarketTradesFromHook);
  }, [geminiMarketTradesFromHook]);

  // Sync balances from hook to local state
  useEffect(() => {
    // Now setGeminiBalances is defined above
    setGeminiBalances(geminiBalancesFromHook);
  }, [geminiBalancesFromHook]);

  // Socket event handlers for Gemini real-time updates
  const handlePositionOpened = useCallback((pos) => {
    setOpenPositions(prev => [pos, ...prev]);
    addLog(`Position opened: ${pos.modelName || pos.modelId} ${pos.symbol}`, 'success');
  }, []);

  const handlePositionClosed = useCallback((closed) => {
    // Remove from open positions
    setOpenPositions(prev => prev.filter(p => !(p.modelId === closed.model_id && p.symbol === closed.symbol)));

    const modelName = closed.model_name || closed.modelId || closed.model || 'Unknown Model';
    const symbol = (closed.symbol || closed.crypto_symbol || '').toUpperCase();

    // Normalize possible field names
    const exitPrice = Number(closed.exit_price ?? closed.exitPrice ?? closed.price ?? closed.close_price ?? 0);
    const entryPrice = Number(closed.entry_price ?? closed.entryPrice ?? closed.entry ?? 0);
    // server might send pnl or profit fields
    const pnl = Number(closed.pnl ?? closed.profit ?? closed.profit_loss ?? (exitPrice && entryPrice ? (exitPrice - entryPrice) * (closed.amount || 1) : NaN));
    const pnlPct = closed.pnl_pct ?? closed.profit_pct ?? closed.pnlPercent ?? null;

    const pnlLabel = Number.isFinite(pnl) ? (pnl >= 0 ? 'Profit' : 'Loss') : 'P/L';
    const pnlAbs = Number.isFinite(pnl) ? Math.abs(pnl).toFixed(2) : 'N/A';

    const parts = [`${modelName} closed the trade by SELLING ${symbol}`];
    if (exitPrice) parts.push(`at $${exitPrice.toFixed(2)}`);
    if (Number.isFinite(entryPrice) && entryPrice > 0) parts.push(`(entry: $${entryPrice.toFixed(2)})`);
    if (Number.isFinite(pnl)) parts.push(`${pnlLabel}: $${pnlAbs}`);
    if (pnlPct != null) parts.push(`(${Number(pnlPct).toFixed(2)}%)`);

    addLog(parts.join(' '), pnl >= 0 ? 'success' : 'warning');
  }, []);

  const handleMarketTradesUpdate = useCallback(({ symbol, trades }) => {
    setGeminiMarketTrades(trades);
  }, []);

  // Use the Gemini socket hook
  useGeminiSocket(userInfo?.sub, {
    onPositionOpened: handlePositionOpened,
    onPositionClosed: handlePositionClosed,
    onMarketTrades: handleMarketTradesUpdate,
  });

  const speedPresets = [
    { label: 'Very Fast (0.5s)', value: '500' },
    { label: 'Fast (1s)', value: '1000' },
    { label: 'Normal (1.5s)', value: '1500' },
    { label: 'Slow (3s)', value: '3000' },
    { label: 'Very Slow (5s)', value: '5000' }
  ];

  const nonSelectedModels = availableModels.filter((model, idx) => {
    const modelId = model.id || model.name || `model_${idx}`;
    return !selectedModels.includes(modelId);
  });

  // Helper: fetch and apply server app-state for a user
  const fetchAndApplyAppState = useCallback(async (userId) => {
    if (!userId) return;
    try {
      isSyncingFromServer.current = true;
      const resp = await axios.get('/api/app-state', { params: { userId } });
      if (resp.data && resp.data.success && resp.data.state) {
        const serverState = resp.data.state;
        setAppState(serverState || {});
        // Apply fields safely
        if (Array.isArray(serverState.selectedModels)) {
          setSelectedModels(serverState.selectedModels);
          localStorage.setItem('selectedModels', JSON.stringify(serverState.selectedModels));
        }
        if (serverState.startingValue != null) {
          setStartingValue(String(serverState.startingValue));
          localStorage.setItem('startingValue', String(serverState.startingValue));
        }
        if (serverState.stopLoss != null) {
          setStopLoss(serverState.stopLoss);
          localStorage.setItem('stopLoss', serverState.stopLoss || '');
        }
        if (serverState.profitTarget != null) {
          setProfitTarget(serverState.profitTarget);
          localStorage.setItem('profitTarget', serverState.profitTarget || '');
        }
        if (serverState.updateSpeed != null) {
          setUpdateSpeed(String(serverState.updateSpeed));
          localStorage.setItem('updateSpeed', String(serverState.updateSpeed));
        }
        if (typeof serverState.isMockTrading === 'boolean') {
          setIsMockTrading(serverState.isMockTrading);
          localStorage.setItem('isMockTrading', String(serverState.isMockTrading));
        }
        if (serverState.initialValues && typeof serverState.initialValues === 'object') {
          setInitialValues(serverState.initialValues || {});
          localStorage.setItem('initialValues', JSON.stringify(serverState.initialValues || {}));
        }
        if (typeof serverState.isTrading === 'boolean') {
          setIsTrading(!!serverState.isTrading);
          localStorage.setItem('isTrading', serverState.isTrading ? 'true' : 'false');
        }
        console.log('✅ Synchronized app state from server for user', userId);
      } else {
        console.log('ℹ️ No server app state found or empty for user', userId);
      }
    } catch (err) {
      console.error('❌ Failed to fetch/apply server app state:', err);
    } finally {
      isSyncingFromServer.current = false;
    }
  }, []);

  // --- Updated handleGoogleCallback using useCallback ---
  const handleGoogleCallback = useCallback(async (token) => {
    // token is the ID token (credential) from Google
    setIsLoadingAuth(true);
    try {
      const response = await axios.post('/api/auth/google', { token });
      if (response.data && response.data.success && response.data.user) {
        const user = response.data.user;
        setUserInfo(user);
        setIsAuthenticated(true);
        localStorage.setItem('googleUser', JSON.stringify(user));

        // Fetch and apply server-side app state for this user
        await fetchAndApplyAppState(user.sub);

        // If socket is connected, join the user room
        if (socket && socket.connected) {
          try {
            socket.emit('join_user_room', user.sub);
            console.log('✅ Emitted join_user_room for', user.sub);
          } catch (err) {
            console.warn('⚠️ Failed to emit join_user_room:', err);
          }
        }

        console.log('✅ Google auth successful. User set.');
        addLog('✅ Google login successful', 'success');
      } else {
        console.error('❌ Google auth failed (server response):', response.data);
        setIsAuthenticated(false);
        setUserInfo(null);
        localStorage.removeItem('googleUser');
      }
    } catch (error) {
      console.error('❌ Google auth error:', error);
      setIsAuthenticated(false);
      setUserInfo(null);
      localStorage.removeItem('googleUser');
    } finally {
      setIsLoadingAuth(false);
    }
  }, [fetchAndApplyAppState]);

  // --- handleGeminiDisconnect implementation ---
  const handleGeminiDisconnect = () => {
    if (window.confirm("Disconnect from Gemini?")) {
      disconnectGemini();
      addLog('🔌 Disconnected from Gemini', 'info');
      setGeminiApiKey('');
      setGeminiApiSecret('');
      setGeminiBalances(null);
      setShowGeminiLoginModal(true);
    }
  };

  // --- ADD THIS MISSING FUNCTION ---
  const handleClosePosition = async (symbol) => {
    if (!window.confirm(`Are you sure you want to close your ${symbol.toUpperCase()} position?`)) return;

    try {
      addLog(`Closing position for ${symbol}...`, 'info');
      // Assuming your useGemini hook provides a way to close a specific position
      // If not, we use the general closeAllPositions or a specific API call
      await closeAllPositions(); // Or a specific closePosition(symbol) if available
      addLog(`✅ Position closed for ${symbol}`, 'success');
      refreshOpenPositions();
    } catch (err) {
      addLog(`❌ Failed to close position: ${err.message}`, 'error');
    }
  };

  // --- Gemini login handler ---
  // Replace your existing handleGeminiLogin with this
  // Inside index.jsx - Update handleGeminiLogin
  const handleGeminiLogin = async (apiKey, apiSecret) => {
    setLocalGeminiError(null);
    setIsGeminiConnecting(true);

    const userId = userInfo?.sub;
    if (!userId) {
      const msg = "User ID not found. Please ensure you are logged in via Google.";
      setLocalGeminiError(msg);
      addLog(msg, 'error');
      setIsGeminiConnecting(false);
      return { success: false, error: msg };
    }

    try {
      addLog(`Attempting to save Gemini credentials for user: ${userId}`, 'info');
      const saveResp = await axios.post('/api/gemini/credentials', {
        userId,
        apiKey,
        apiSecret,
        env: 'live'
      });

      if (!saveResp?.data?.success) {
        const errMsg = saveResp?.data?.error || 'Failed to save credentials to server.';
        console.error('[handleGeminiLogin] save failed:', errMsg);
        throw new Error(errMsg);
      }

      addLog('✅ Gemini credentials saved to server', 'success');

      await connectGemini(userId);
      addLog(`🔗 Requested connectGemini for user: ${userId}`, 'info');

      try {
        if (socket && socket.connected) {
          socket.emit('join_user_room', userId);
          console.log('[handleGeminiLogin] socket emit join_user_room', userId);
        }
      } catch (sockErr) {
        console.warn('[handleGeminiLogin] socket join failed:', sockErr);
      }

      const result = await refreshGeminiBalances(userId);
      if (!result?.success) {
        const errMsg = result?.error || 'Failed to fetch balances after saving credentials';
        console.error('[handleGeminiLogin] refreshGeminiBalances failed:', errMsg);
        setLocalGeminiError(errMsg);
        addLog(`❌ Failed to refresh balances: ${errMsg}`, 'error');
      } else {
        setGeminiBalances(result.data);
        addLog('✅ Gemini balances updated', 'success');
        console.log('[handleGeminiLogin] balances:', result.data);
      }

      // Fetch trades robustly: try hook-based fetch, fallback to API path
      /*const symbols = ['btcusd', 'ethusd', 'solusd'];

      const normalize = (t) => ({
        symbol: (t.crypto_symbol || t.symbol || '').toUpperCase(),
        side: (t.action || t.side || '').toLowerCase(),
        price: Number(t.crypto_price ?? t.price ?? 0),
        amount: Number(t.quantity ?? t.amount ?? 0),
        timestamp: t.timestamp ?? t.timestampms ?? Date.now()
      });

      const tradesPromises = symbols.map(async (sym) => {
        // 1) Try hook method if available
        try {
          if (typeof refreshGeminiMarketTrades === 'function') {
            const hookResp = await refreshGeminiMarketTrades(userId, sym, 20);
            if (hookResp) {
              if (Array.isArray(hookResp)) return hookResp.map(normalize);
              if (hookResp.success && Array.isArray(hookResp.data)) return hookResp.data.map(normalize);
              if (Array.isArray(hookResp.data)) return hookResp.data.map(normalize);
            }
          }
        } catch (hookErr) {
          console.warn(`[handleGeminiLogin] refreshGeminiMarketTrades failed for ${sym}:`, hookErr?.message || hookErr);
        }

        // 2) Fallback to API endpoint
        try {
          // prefer the explicit gemini market trades endpoint
          const resp = await axios.get('/api/gemini/market-trades', { params: { symbol: sym.toUpperCase(), limit: 20 } });
          const payload = resp.data;
          const tradesArr = payload?.trades || payload || [];
          if (Array.isArray(tradesArr) && tradesArr.length) {
            return tradesArr.map(normalize);
          }
        } catch (apiErr) {
          console.warn(`[handleGeminiLogin] fallback /api/gemini/market-trades failed for ${sym}:`, apiErr?.response?.status || apiErr?.message || apiErr);
        }

        // older fallback path if still exists
        try {
          const resp2 = await axios.post('/api/trades', { symbol: sym, limit: 20, userId });
          const payload2 = resp2.data;
          const tradesArr2 = payload2?.trades || payload2 || [];
          if (Array.isArray(tradesArr2) && tradesArr2.length) {
            return tradesArr2.map(normalize);
          }
        } catch (apiErr2) {
          console.warn(`[handleGeminiLogin] fallback /api/trades failed for ${sym}:`, apiErr2?.response?.status || apiErr2?.message || apiErr2);
        }

        return [];
      });

      const tradesArrays = await Promise.all(tradesPromises);
      const combinedTrades = tradesArrays.flat()
        .sort((a, b) => (new Date(b.timestamp) - new Date(a.timestamp)))
        .slice(0, 20);

      setGeminiTransactions(combinedTrades);
      console.log('[handleGeminiLogin] combinedTrades length:', combinedTrades.length);*/

      await fetchGeminiTransactions();

      return {
        success: true,
        balances: result?.success ? result.data : null,
        transactions: [] // ✅ Just return an empty array or remove this line
      };
    } catch (error) {
      console.error('Gemini Login Flow Error:', error);
      const msg = error.response?.data?.error || error.message || 'Connection failed';
      setLocalGeminiError(msg);
      addLog(`❌ Gemini Error: ${msg}`, 'error');
      return { success: false, error: msg };
    } finally {
      setIsGeminiConnecting(false);
    }
  };

  // --- formatTimestamp implementation ---
  const formatTimestamp = (ts) => {
    return new Date(ts).toLocaleString();
  };

  // --- addLog helper ---
  const addLog = (a, b = 'info') => {
    const validTypes = ['info', 'success', 'warning', 'error'];
    let type, message;

    if (validTypes.includes(a)) {
      type = a;
      message = b;
    } else {
      type = validTypes.includes(b) ? b : 'info';
      message = a;
    }

    const timestamp = new Date().toLocaleTimeString();
    setTradingLogs(prev => [
      { timestamp, type, message },
      ...prev
    ].slice(0, 50));

    console.log(`[${type.toUpperCase()}] ${message}`);

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

  // --- getCurrentPrice helper ---
  const getCurrentPrice = (symbol) => {
    const sym = symbol.toLowerCase();
    if (sym === 'btcusd') {
      return cryptoLatest.BTCUSD;
    } else if (sym === 'ethusd') {
      return cryptoLatest.ETHUSD;
    } else if (sym === 'solusd') {
      return cryptoLatest.SOLUSD;
    }
    return null;
  };

  // --- normalizeGeminiTrade helper ---
  // Place near addLog/getCurrentPrice helpers
  const normalizeGeminiTrade = (rawTrade, requestedSymbol = 'UNKNOWN') => {
    const side = (rawTrade.type || rawTrade.side || rawTrade.action || '').toString().toLowerCase() || 'buy';
    const price = Number(rawTrade.price ?? rawTrade.crypto_price ?? rawTrade.price_usd ?? 0);
    const amount = Number(rawTrade.amount ?? rawTrade.quantity ?? rawTrade.size ?? 0);
    const timestamp = Number(rawTrade.timestampms ?? rawTrade.timestamp ?? rawTrade.time ?? Date.now());

    // If the server didn't include a symbol, fall back to the symbol we requested
    const symbol = (rawTrade.symbol || rawTrade.crypto_symbol || rawTrade.pair || requestedSymbol || '').toString().toUpperCase();

    return {
      id: rawTrade.tid ?? rawTrade.trade_id ?? rawTrade.id ?? `${symbol}_${timestamp}_${Math.random().toString(36).slice(2,9)}`,
      raw: rawTrade,
      symbol,
      side,
      price,
      amount,
      timestamp,
      isGemini: !!(rawTrade.exchange?.toString().toLowerCase().includes('gemini') || rawTrade.source === 'gemini' || rawTrade.is_real === true || rawTrade.real === true)
    };
  };

  // ✅ NEW: Sync UI initialValues with Backend initialValues automatically
  useEffect(() => {
    const backendInitials = {};
    let hasNewData = false;

    Object.values(modelsLatest).forEach(m => {
      if (m.initialValue && !initialValues[m.id]) {
        backendInitials[m.id] = m.initialValue;
        hasNewData = true;
      }
    });

    if (hasNewData) {
      setInitialValues(prev => ({ ...prev, ...backendInitials }));
    }
  }, [modelsLatest, initialValues]);

  // --- getNormalizedValue helper ---
  const getNormalizedValue = (modelId) => {
    // 1. Handle manual overrides first
    if (localModelOverrides[modelId] !== undefined) {
      return parseFloat(localModelOverrides[modelId].toFixed(2));
    }

    // 2. Get the base starting value (e.g., 10)
    const baseStart = Number(startingValue) || 10;

    // 3. Get the model data
    const model = modelsLatest[modelId];

    if (!model) return baseStart;

    const actualInitial = Number(initialValues[modelId]) || Number(model.initialValue) || 100;
    const actualCurrent = Number(model.accountValue);

    if (actualInitial === 0) return baseStart;

    // --- THE MATH ---
    const modelChangePercent = (actualCurrent - actualInitial) / actualInitial;

    const btcNow = Number(cryptoLatest?.BTCUSD) || 0;
    const btcAtStart = Number(appState?.tradingSession?.entryPrices?.BTCUSD) || 0;

    let btcChangePercent = 0;
    if (btcAtStart > 0 && btcNow > 0) {
      btcChangePercent = (btcNow - btcAtStart) / btcAtStart;
    }

    // Blend the performance: 70% Model logic + 30% Market volatility
    const blendedChange = (modelChangePercent * 0.7) + (btcChangePercent * 0.3);

    // Apply the blended % change to your base starting value
    let finalValue = baseStart * (1 + blendedChange);

    // ✅ STEP 2: Add live Gemini P&L for this model's open position
    const activePos = openPositions.find(p => p.modelId === modelId);
    if (activePos?.live_pnl) {
      // Scale the P&L relative to the model's initial value so it's proportional to baseStart
      const pnlScaled = (activePos.live_pnl / actualInitial) * baseStart;
      finalValue += pnlScaled;
    }

    return parseFloat(finalValue.toFixed(2));
  };
  
  const nonSelectedModelsMetrics = useMemo(() => {
    if (!isTrading || nonSelectedModels.length === 0) {
      return { totalPL: 0, plPercentage: '0.00', count: nonSelectedModels.length };
    }

    const totalPL = nonSelectedModels.reduce((sum, model) => {
      const modelId = model.id || model.name;
      const currentValue = getNormalizedValue(modelId);
      // Use startingValue (same source as baseStart) to avoid mismatch
      const base = Number(startingValue) || 10;
      return sum + (currentValue - base);
    }, 0);

    const base = Number(startingValue) || 10;
    const denom = base * nonSelectedModels.length;
    const plPercentage = denom > 0 ? ((totalPL / denom) * 100).toFixed(2) : '0.00';

    return { totalPL: parseFloat(totalPL.toFixed(2)), plPercentage, count: nonSelectedModels.length };
  }, [nonSelectedModels, isTrading, startingValue, modelsLatest, localModelOverrides, cryptoLatest]);

  const normalizedModelsHistory = useMemo(() => {
  const result = {};

  Object.keys(modelsHistory).forEach(modelId => {
    const history = modelsHistory[modelId];
    if (!history || history.length === 0) return;

    const backendInitial = Number(initialValues[modelId]) 
      || Number(modelsLatest[modelId]?.initialValue) 
      || 100;

    const baseStart = Number(startingValue) || 10;

    result[modelId] = history.map(point => ({
      ...point,
      accountValue: parseFloat(((point.accountValue / backendInitial) * baseStart).toFixed(2))
    }));
  });

  return result;
}, [modelsHistory, initialValues, modelsLatest, startingValue]);
  
  // --- handleModelSelection helper ---
  const handleModelSelection = (modelId) => {
    console.log('Card clicked for model:', modelId);

    setSelectedModels(prevSelected => {
      const isAlreadySelected = prevSelected.includes(modelId);

      if (isAlreadySelected) {
        const updated = prevSelected.filter(id => id !== modelId);
        localStorage.setItem('selectedModels', JSON.stringify(updated));
        return updated;
      } else {
        if (isTrading) {
          setInitialValues(prevInit => {
            const model = modelsLatest[modelId];
            if (!model || typeof model.accountValue !== 'number') {
              console.warn(`Cannot set initial value for ${modelId}: model data unavailable`);
              return prevInit;
            }

            console.log(`✅ Setting initial value for ${modelId}: ${model.accountValue} (will normalize to ${safeStartValue})`);

            const next = {
              ...prevInit,
              [modelId]: model.accountValue
            };
            localStorage.setItem('initialValues', JSON.stringify(next));
            return next;
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

        const newSelected = [...prevSelected, modelId];
        localStorage.setItem('selectedModels', JSON.stringify(newSelected));
        return newSelected;
      }
    });
  };

  // --- handleStartingValueChange ---
  const handleStartingValueChange = (e) => {
    const value = e.target.value;
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setStartingValue(value);
      if (value !== '') {
        setLastSetStartingValue(value);
        localStorage.setItem('lastSetStartingValue', value);
        addLog(`Start Value set to: ${value}`, 'info'); // 👈 Added log
      }
      localStorage.setItem('startingValue', value);
    }
  };

  // --- handleStopLossChange ---
  const handleStopLossChange = (e) => {
    const value = e.target.value;
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setStopLoss(value);
      localStorage.setItem('stopLoss', value || '');
      addLog(`Stop Loss set to: ${value || 'unset'}`, 'info'); // 👈 Added log
    }
  };

  // --- handleProfitTargetChange ---
  const handleProfitTargetChange = (e) => {
    const value = e.target.value;
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setProfitTarget(value);
      localStorage.setItem('profitTarget', value || '');
      addLog(`Profit Target set to: ${value || 'unset'}`, 'info'); // 👈 Added log
    }
  };

  // --- handleUpdateSpeedChange ---
  const handleUpdateSpeedChange = (e) => {
    setUpdateSpeed(e.target.value);
    localStorage.setItem('updateSpeed', e.target.value);
  };

  // --- handleLogout ---
  const handleLogout = () => {
    setIsAuthenticated(false);
    setUserInfo(null);
    localStorage.removeItem('googleUser');
    setIsLoadingAuth(false);
    setIsTrading(false);
    setTradingStopped(false);
    setStopReason('');
    setSelectedModels([]);
    setInitialValues({});
    localStorage.removeItem('selectedModels');
    localStorage.removeItem('initialValues');
    console.log('✅ User logged out');

    // Optionally notify server or socket to leave room (not strictly required)
    try {
      if (userInfo?.sub && socket && socket.connected) {
        socket.emit('leave_user_room', userInfo.sub);
      }
    } catch (err) {
      // ignore
    }
  };

  // --- handleStartTrading ---
  const handleStartTrading = async () => {
    setShowMonitoringPanel(true);
    setTradingLogs([]);

    if (userInfo?.sub) {
      socket.emit('request_clear_logs', userInfo.sub);
    }

    addLog("🚀 Starting fresh trading session. Previous logs archived to database.", "info");

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
    localStorage.setItem('initialValues', JSON.stringify(initialVals));
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

      console.log("📤 Syncing trading state to server...");

      try {
        const response = await fetch('/api/app-state', {
          method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: userInfo.sub,
            state: stateToSave,
            socketId: socket.id,
          }),
        });

        const result = await response.json();

        if (result.success) {
          console.log("✅ State synced successfully (version:", result.version, ")");
        } else {
          console.error('❌ Failed to save state:', result.error);
          addLog('⚠️ Failed to sync state to server', 'warning');
        }
      } catch (err) {
        console.error('❌ Failed to save state:', err);
        addLog('⚠️ Failed to sync state to server', 'warning');
      }
    }

    if (isGeminiConnected) {
      addLog('🔗 Gemini is connected. Executing real trades...', 'info');

      for (const modelId of selectedModels) {
        const modelObj = availableModels.find(m => m.id === modelId);
        if (!modelObj) {
          addLog(`⚠️ Model ${modelId} not found`, 'warning');
          continue;
        }

        const executeStrategy = async () => {
          try {
            const action = Math.random() > 0.5 ? 'BUY' : 'SELL';
            const symbol = 'BTCUSD';

            addLog(`🤖 ${modelObj.name} executing ${action} on ${symbol}...`, 'info');

            const response = await axios.post('/api/gemini/execute-strategy-trade', {
              userId: userInfo.sub,
              modelId: modelObj.id,
              modelName: modelObj.name,
              symbol: symbol,
              action: action,
              amountUSD: 10
            });

            if (response.data.success) {
              addLog(`✅ Real trade executed for ${modelObj.name}`, 'success');
              fetchGeminiTransactions();
            } else {
              addLog(`❌ Trade rejected for ${modelObj.name}: ${response.data.error}`, 'error');
            }
          } catch (err) {
            addLog(`❌ Trade failed for ${modelObj.name}: ${err.message}`, 'error');
          }
        };

        // Execute immediately on start
        await executeStrategy();

        // Keep trading every 5 minutes
        const strategyInterval = setInterval(executeStrategy, 60000 * 5);
        tradeTimeoutsRef.current.push(strategyInterval);
      }

      addLog('✅ All models initialized with real Gemini trading', 'success');
    } else {
      addLog('⚠️ Gemini not connected. Trading in simulator mode only.', 'warning');
    }
  };

  // --- handleStopTrading ---
  const handleStopTrading = async () => {
    console.log("🛑 Stopping trade... keeping models:", selectedModels);

    // calculate final profit/loss safely
    const totalProfit = selectedModels.reduce((sum, modelId) => {
      let currentValue = 0;
      try {
        currentValue = typeof getNormalizedValue === "function" ? getNormalizedValue(modelId) : 0;
      } catch (e) {
        console.warn("getNormalizedValue error for", modelId, e);
        currentValue = 0;
      }
      const sv = typeof startValue === "number" ? startValue : Number(startValue) || 0;
      return sum + (currentValue - sv);
    }, 0);

    // stop trading flags / state
    try {
      setIsTrading(false);
      setTradingStopped(true);
      setFinalProfitLoss(totalProfit);
      setStopReason("Trading stopped manually");
    } catch (err) {
      console.warn("Error setting trading state:", err);
    }

    // Immediate log for UX
    if (typeof addLog === "function") {
      addLog("Trading stopped manually", "info");
      addLog(
        `Final P/L: $${Number(totalProfit).toFixed(2)} (${Number(totalProfit) >= 0 ? "Profit" : "Loss"})`,
        Number(totalProfit) >= 0 ? "success" : "error"
      );
    } else {
      console.log("Final P/L:", totalProfit);
    }

    // Tell server (if socket exists) to stop trading too
    try {
      if (socket && typeof socket.emit === "function") {
        socket.emit("stop_trading", { userId: userInfo?.sub });
      }
    } catch (err) {
      console.warn("Error emitting stop_trading", err);
    }

    // Clear any pending simulated trade timers (if you keep them in a ref)
    try {
      if (tradeTimeoutsRef?.current && tradeTimeoutsRef.current.length) {
        tradeTimeoutsRef.current.forEach((tid) => {
          clearTimeout(tid);
          clearInterval(tid); // Also clear strategy intervals
        });
        tradeTimeoutsRef.current = [];
        if (typeof addLog === "function") addLog("Cleared pending trade timers", "info");
        console.log("Cleared pending trade timers");
      }
    } catch (err) {
      console.warn("Error clearing trade timers:", err);
    }

    console.log("✅ Trading stopped. Models still selected:", selectedModels?.length ?? 0);

    // Helper to timeout long-running operations
    const withTimeout = (p, ms) =>
      Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

    // Close Gemini positions (if connected)
    if (isGeminiConnected) {
      try {
        if (typeof addLog === "function") addLog("Closing all Gemini trades...", "info");

        // Prefer local helper if exists, otherwise call backend endpoint
        if (typeof handleStopAllGeminiTrading === "function") {
          await withTimeout(handleStopAllGeminiTrading(), 30_000); // 30s timeout
        } else {
          // fallback to API endpoint
          try {
            await withTimeout(
              axios.post('/api/gemini/close-all', { userId: userInfo?.sub }, { timeout: 25_000 }),
              30_000
            );
          } catch (apiErr) {
            console.warn("Fallback /api/gemini/close-all failed:", apiErr?.message || apiErr);
            throw apiErr;
          }
        }

        if (typeof addLog === "function") addLog("All Gemini trades closed", "success");
        console.log("All Gemini trades closed");
      } catch (err) {
        console.error("Error closing Gemini trades:", err);
        if (typeof addLog === "function") addLog(`Error closing Gemini trades: ${err?.message ?? err}`, "error");
      }
    }
  };

  // --- Gemini Trading Logic ---

  const handleStartGeminiTrading = async (modelObj) => {
    try {
      const userId = userInfo?.sub;
      if (!userId) throw new Error("User not authenticated");

      addLog(`🤖 Initializing live strategy for ${modelObj.name}...`, 'info');

      // Ensure user gets socket events
      try {
        if (socket && socket.connected) socket.emit('join_user_room', userId);
      } catch (e) {
        console.warn('Socket join_user_room emit failed (non-fatal):', e);
      }

      const payload = {
        userId,
        modelId: modelObj.id,
        modelName: modelObj.name,
        symbol: modelObj.symbol || 'btcusd',
        startValue: startingValue,
        stopLoss,
        profitTarget,
        isMockTrading
      };

      const response = await axios.post('/api/gemini/start-trading', payload, { timeout: 20000 });
      const data = response?.data || {};

      if (!data.success) {
        const errMsg = data.error || 'Backend failed to start strategy';
        addLog(`❌ Failed to start ${modelObj.name}: ${errMsg}`, 'error');
        throw new Error(errMsg);
      }

      addLog(`✅ Live trading active for ${modelObj.name}`, 'success');
      setGeminiTradingStatuses(prev => ({ ...prev, [modelObj.id]: 'active' }));

      // Local normalize helper (falls back to requestedSymbol when server omits symbol)
      const normalizeTradeForUI = (t, requestedSymbol = payload.symbol) => {
        const symbol = (t.crypto_symbol || t.symbol || t.pair || requestedSymbol || '').toString().toUpperCase();
        const side = (t.type || t.action || t.side || '').toString().toLowerCase() || 'buy';
        const price = Number(t.crypto_price ?? t.price ?? t.price_usd ?? 0) || 0;
        const amount = Number(t.quantity ?? t.amount ?? t.size ?? 0) || 0;
        const timestamp = Number(t.timestampms ?? t.timestamp ?? t.time ?? Date.now());
        const isGemini = !!(
          (t.exchange && String(t.exchange).toLowerCase().includes('gemini')) ||
          t.source === 'gemini' ||
          t.is_real === true ||
          t.real === true ||
          (typeof t.isGemini !== 'undefined' && t.isGemini)
        );

        return {
          id: t.tid ?? t.trade_id ?? t.id ?? `${symbol}_${timestamp}_${Math.random().toString(36).slice(2,9)}`,
          raw: t,
          symbol,
          side,
          price,
          amount,
          timestamp,
          isGemini
        };
      };

      // If server returned a single trade object
      if (data.trade) {
        try {
          const nt = normalizeTradeForUI(data.trade, payload.symbol);

          // push normalized into both lists (keeps legacy behavior)
          setTrades(prev => [nt, ...prev].slice(0, 20));
          setGeminiTransactions(prev => [nt, ...prev].slice(0, 20));
        } catch (err) {
          console.warn('normalize single trade failed', err);
          // fallback: push raw if normalization fails
          setTrades(prev => [data.trade, ...prev].slice(0, 20));
          setGeminiTransactions(prev => [data.trade, ...prev].slice(0, 20));
        }
      } else {
        // server might return an array under recentTrades, trades, or data.trades
        const rawArr = Array.isArray(data.recentTrades) ? data.recentTrades
          : (Array.isArray(data.trades) ? data.trades
          : (Array.isArray(data.data) ? data.data : []));

        if (Array.isArray(rawArr) && rawArr.length) {
          const normalized = rawArr.map(t => {
            try {
              return normalizeTradeForUI(t, payload.symbol);
            } catch (err) {
              console.warn('normalizeTradeForUI error for one trade', err);
              // best-effort fallback
              return {
                id: t.tid ?? t.trade_id ?? t.id ?? `UNK_${Date.now()}`,
                raw: t,
                symbol: (t.crypto_symbol || t.symbol || payload.symbol || '').toUpperCase(),
                side: (t.type || t.action || t.side || 'buy').toString().toLowerCase(),
                price: Number(t.crypto_price ?? t.price ?? 0) || 0,
                amount: Number(t.quantity ?? t.amount ?? 0) || 0,
                timestamp: Number(t.timestampms ?? t.timestamp ?? Date.now()),
                isGemini: !!((t.exchange && String(t.exchange).toLowerCase().includes('gemini')) || t.source === 'gemini')
              };
            }
          });

          // save full normalized trades list (mixed)
          setTrades(prev => {
            // merge new ones on top and keep up to 20
            const merged = [...normalized, ...prev].slice(0, 20);
            return merged;
          });

          // set gemini-specific table to only gemini trades
          const geminiOnly = normalized.filter(t => t.isGemini).slice(0, 20);
          setGeminiTransactions(prev => {
            // prefer to prepend geminiOnly; keep unique ids (avoid duplicates)
            const existingIds = new Set(prev.map(p => p.id));
            const toAdd = geminiOnly.filter(g => !existingIds.has(g.id));
            const next = [...toAdd, ...prev].slice(0, 20);
            return next;
          });
        } else {
          addLog('ℹ️ No immediate trade returned; waiting for realtime socket updates', 'info');
        }
      }

      return { success: true, data };
    } catch (error) {
      const serverMsg = error?.response?.data || error.message || String(error);
      console.error(`Error starting Gemini trade for ${modelObj.name}:`, serverMsg);
      addLog(`❌ Failed to start ${modelObj.name}: ${serverMsg}`, 'error');
      return { success: false, error: serverMsg };
    }
  };

  const handleStopAllGeminiTrading = async () => {
    try {
      const userId = userInfo?.sub;
      
      if (!userId) {
        addLog('❌ User ID not found. Please ensure you are logged in.', 'error');
        return;
      }

      addLog('🛑 Requesting stop for all live Gemini strategies...', 'warning');

      const response = await axios.post('/api/gemini/close-all', { userId }, { timeout: 25000 });

      if (response.data.success) {
        const results = response.data.results || [];
        const errors = response.data.errors || [];
        
        if (results.length > 0) {
          addLog(`✅ Successfully closed ${results.length} position(s)`, 'success');
          
          // Log each closed position
          results.forEach(result => {
            addLog(
              `✅ Closed ${result.modelName} ${result.symbol} ${result.side} - P&L: ${result.pnl?.toFixed(2) || 'N/A'}`,
              'success'
            );
          });
        } else {
          addLog('ℹ️ No open positions found to close.', 'info');
        }

        if (errors.length > 0) {
          addLog(`⚠️ ${errors.length} position(s) failed to close`, 'warning');
          errors.forEach(err => {
            addLog(`⚠️ ${err.modelName} ${err.symbol}: ${err.error}`, 'warning');
          });
        }

        setGeminiTradingStatuses({});
      }
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.message;
      const errorReason = error.response?.data?.reason;
      
      // Handle specific error cases gracefully
      if (error.response?.status === 400) {
        if (errorReason === 'no_open_positions') {
          addLog('ℹ️ No open positions found to close.', 'info');
        } else if (errorReason === 'no_credentials') {
          addLog('❌ Gemini credentials not found. Please connect Gemini first.', 'error');
        } else {
          addLog(`❌ Error stopping strategies: ${errorMsg}`, 'error');
        }
      } else if (error.code === 'ECONNABORTED') {
        addLog('❌ Request timeout. The server took too long to respond.', 'error');
      } else {
        addLog(`❌ Error stopping strategies: ${errorMsg}`, 'error');
      }
    }
  };

  // --- handleReset ---
  const handleReset = async () => {
    if (isGeminiConnected && openPositions.length > 0) {
      const confirmed = window.confirm(
        `Reset will close all ${openPositions.length} open Gemini positions.

Continue?`
      );

      if (!confirmed) return;

      console.log('🧹 Reset: Closing all Gemini positions before clearing state...');
      // Assuming you have a function handleStopAllGeminiTrading
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

  // --- useEffect for auth on mount ---
  useEffect(() => {
    const savedUser = localStorage.getItem('googleUser');
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        setUserInfo(parsed);
        setIsAuthenticated(true);
        // Fetch server state for saved user
        if (parsed?.sub) fetchAndApplyAppState(parsed.sub);
        // join socket room if connected
        if (socket && socket.connected && parsed?.sub) {
          socket.emit('join_user_room', parsed.sub);
        }
      } catch (e) {
        console.error('Failed to parse saved user:', e);
        localStorage.removeItem('googleUser');
      }
    }
    setIsLoadingAuth(false);
  }, [fetchAndApplyAppState]);

  // ==========================================
  // POINT 2: NEW FETCH LOGIC FOR GEMINI TRADES
  // ==========================================
  const fetchGeminiTransactions = useCallback(async () => {
    if (!userInfo?.sub) return;

    try {
      const resp = await axios.get('/api/gemini/transactions', {
        params: { userId: userInfo.sub, limit: 20 }
      });

      const raw = resp.data?.transactions || [];

      const normalized = raw.map(tx => ({
        id: tx.id,
        model_name: tx.model_name || 'Manual',
        model: tx.model_name || 'Manual',
        crypto_symbol: (tx.crypto_symbol || 'UNKNOWN').toUpperCase(),
        action: (tx.action || 'BUY').toUpperCase(),
        crypto_price: Number(tx.crypto_price || 0),
        quantity: Number(tx.quantity || 0),
        total_value: Number(tx.total_value || 0),
        pnl: tx.pnl ?? null,
        pnl_percent: tx.pnl_percent ?? null,
        timestamp: tx.timestamp || tx.created_at
      }));

      setGeminiTransactions(normalized);
      console.log('Normalized Transactions:', normalized);
    } catch (err) {
      console.error('❌ Failed to fetch transactions:', err);
    } finally {
      setLoadingTrades(false); // ✅ THIS IS THE FIX — always runs after fetch
    }
  }, [userInfo?.sub]);

  useEffect(() => {
    if (!isAuthenticated || !userInfo?.sub) return;

    fetchGeminiTransactions(); // Initial fetch

    const interval = setInterval(() => {
      fetchGeminiTransactions();
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(interval);
  }, [isAuthenticated, userInfo?.sub, fetchGeminiTransactions]);

  // --- useEffect for socket connection ---
  useEffect(() => {
    socket.on('connect', () => setSocketConnected(true));
    socket.on('disconnect', () => setSocketConnected(false));
    return () => {
      socket.off('connect');
      socket.off('disconnect');
    };
  }, []);

  // join user room when authenticated and socket connects
  useEffect(() => {
    if (isAuthenticated && userInfo?.sub && socket && socket.connected) {
      try {
        socket.emit('join_user_room', userInfo.sub);
        console.log('✅ join_user_room emitted after auth');
      } catch (err) {
        console.warn('⚠️ join_user_room emit error:', err);
      }
    }
  }, [isAuthenticated, userInfo, socketConnected]);

  // -------- socket listeners for trades & logs (REPLACED) ----------
  useEffect(() => {
    if (!socket) return;
    let mounted = true;

    // normalize helper (falls back to requestedSymbol when server omits symbol)
    const normalize = (trade, requestedSymbol = 'UNKNOWN') => {
      const symbolRaw = trade.crypto_symbol || trade.symbol || trade.pair || requestedSymbol || '';
      const symbol = String(symbolRaw).toUpperCase();
      const side = String(trade.type || trade.action || trade.side || '').toLowerCase() || 'buy';
      const price = Number(trade.crypto_price ?? trade.price ?? trade.price_usd ?? 0);
      const amount = Number(trade.quantity ?? trade.amount ?? trade.size ?? 0);
      const timestamp = Number(trade.timestampms ?? trade.timestamp ?? trade.time ?? Date.now());
      const isGemini = !!(
        (trade.exchange && String(trade.exchange).toLowerCase().includes('gemini')) ||
        trade.source === 'gemini' ||
        trade.is_real === true ||
        trade.real === true ||
        (typeof trade.isGemini !== 'undefined' && trade.isGemini)
      );

      return {
        id: trade.tid ?? trade.trade_id ?? trade.id ?? `${symbol}_${timestamp}_${Math.random().toString(36).slice(2,9)}`,
        raw: trade,
        symbol,
        side,
        price,
        amount,
        timestamp,
        isGemini,
      };
    };

    const safeSetTradingLogs = (entry) => {
      if (!mounted) return;
      try {
        setTradingLogs(prev => [{ timestamp: entry.time || Date.now(), type: entry.type || 'info', message: entry.message }, ...prev].slice(0, 200));
      } catch (err) {
        console.warn('safeSetTradingLogs error', err);
      }
    };

    const handleLogEntry = (log) => {
      try {
        safeSetTradingLogs(log);
      } catch (err) {
        console.warn('handleLogEntry error', err);
      }
    };

    // Central incoming-trade handler
    const handleIncomingTrade = (rawTrade, sourceLabel = 'TRADE') => {
      try {
        const requestedSymbol = rawTrade.requestedSymbol || rawTrade.requested_symbol || rawTrade.symbol || rawTrade.pair || 'UNKNOWN';
        const nt = normalize(rawTrade, requestedSymbol);

        if (!mounted) return;

        if (nt.isGemini) {
          setGeminiTransactions(prev => [nt, ...prev].slice(0, 20));
        } else {
          setTrades(prev => [nt, ...prev].slice(0, 20));
        }

        const action = (nt.side || 'TRADE').toUpperCase();
        const priceLabel = nt.price ? `$${nt.price.toFixed(2)}` : 'N/A';
        const label = nt.isGemini ? 'Gemini' : sourceLabel;
        if (typeof addLog === 'function') addLog(`New ${label} ${action} ${nt.symbol} @ ${priceLabel}`, 'info');

      } catch (err) {
        console.warn('handleIncomingTrade error', err);
      }
    };

    // Bulk trades update handler
    const handleTradesUpdate = (payload) => {
      try {
        const serverTrades = Array.isArray(payload) ? payload : (payload?.trades ?? payload?.data ?? []);
        if (!Array.isArray(serverTrades) || serverTrades.length === 0) return;

        const normalized = serverTrades.map(t => normalize(t, t.symbol || t.pair || 'UNKNOWN'));

        if (!mounted) return;

        // ❌ REMOVED: const gemini = normalized.filter(t => t.isGemini).slice(0, 20);
        const mock = normalized.filter(t => !t.isGemini).slice(0, 20);

        // ❌ REMOVED: setGeminiTransactions(gemini);
        setTrades(mock); // ✅ Only update mock trades

        if (typeof addLog === 'function') {
          addLog(`Bulk trades update: ${mock.length} mock`, 'info');
        }
      } catch (err) {
        console.warn('handleTradesUpdate error', err);
      }
    };

    // Named handlers for registration/cleanup
    const onConnect = () => setSocketConnected(true);
    const onDisconnect = () => setSocketConnected(false);
    const onLogEntry = handleLogEntry;
    const onNewTrade = (t) => handleIncomingTrade(t, 'Mock');
    const onMockTrade = (t) => handleIncomingTrade(t, 'Mock');
    const onTrade = (t) => handleIncomingTrade(t, 'Mock');
    const onGeminiTrade = (t) => handleIncomingTrade(t, 'Gemini');
    const onNewGeminiTrade = (t) => handleIncomingTrade(t, 'Gemini');
    //const onTradesUpdate = handleTradesUpdate;
    //const onMarketTrades = handleTradesUpdate;

    // Bind socket events
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    socket.on('log_entry', onLogEntry);
    socket.on('new_trade', onNewTrade);
    socket.on('mock_trade', onMockTrade);
    socket.on('trade', onTrade);
    //socket.on('gemini_trade', onGeminiTrade);
    //socket.on('new_gemini_trade', onNewGeminiTrade);
    socket.on('gemini_transaction', (tx) => {
      const normalizedTx = {
        id: tx.id || Date.now(),
        model: tx.model_name || 'Manual',
        symbol: (tx.crypto_symbol || tx.symbol || 'UNKNOWN').toUpperCase(),
        side: (tx.action || tx.side || 'buy').toLowerCase(),
        price: Number(tx.crypto_price || tx.price || 0),
        amount: Number(tx.quantity || tx.amount || 0),
        total_value: Number(tx.total_value || 0),
        timestamp: tx.created_at || tx.timestamp || new Date().toISOString()
      };
      setGeminiTransactions(prev => [normalizedTx, ...prev].slice(0, 20));
      addLog(`💎 Gemini Trade: ${normalizedTx.side.toUpperCase()} ${normalizedTx.symbol} @ $${normalizedTx.price.toFixed(2)}`, 'success');
      fetchGeminiTransactions(); // Refresh table from DB
    });
    //socket.on('trades_update', onTradesUpdate);
    //socket.on('market_trades', onMarketTrades);
    //socket.on('initial_trades', onTradesUpdate);
    //socket.on('trades', onTradesUpdate);

    // defensive initial request
    try {
      if (typeof socket.emit === 'function') {
        socket.emit('request_trades');
        //socket.emit('request_market_trades');
      }
    } catch (err) {
      // ignore
    }

    // optional: small raw-debug endpoint if you want to inspect raw payloads temporarily
    const debugRawHandler = (raw) => console.debug('raw trade payload:', raw);
    socket.on('debug_trade_raw', debugRawHandler);

    return () => {
      mounted = false;

      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);

      socket.off('log_entry', onLogEntry);
      socket.off('new_trade', onNewTrade);
      socket.off('mock_trade', onMockTrade);
      socket.off('trade', onTrade);
      socket.off('gemini_trade', onGeminiTrade);
      socket.off('new_gemini_trade', onNewGeminiTrade);

      //socket.off('trades_update', onTradesUpdate);
      //socket.off('market_trades', onMarketTrades);
      //socket.off('initial_trades', onTradesUpdate);
      //socket.off('trades', onTradesUpdate);

      socket.off('debug_trade_raw', debugRawHandler);
    };
  }, [socket, addLog]);

  // --- NEW: explicit fetch for /api/gemini/market-trades to populate last 20 gemini transactions on login/mount ---
  /*useEffect(() => {
    let mounted = true;
    if (!userInfo?.sub) return;

    const fetchMarketTrades = async () => {
      try {
        const symbols = ['BTCUSD', 'ETHUSD', 'SOLUSD']; // uppercase for the endpoint
        const all = [];

        for (const symbol of symbols) {
          try {
            const resp = await axios.get('/api/gemini/market-trades', {
              params: { symbol, limit: 20 }
            });

            if (resp?.data?.success && Array.isArray(resp.data.trades)) {
              const raw = resp.data.trades;
              const normalized = raw.map(t => ({
                symbol: (t.crypto_symbol || t.symbol || symbol).toUpperCase(),
                side: (t.action || t.type || t.side || '').toLowerCase(),
                price: Number(t.crypto_price ?? t.price ?? 0),
                amount: Number(t.quantity ?? t.amount ?? 0),
                timestamp: Number(t.timestampms ?? t.timestamp ?? Date.now())
              }));
              all.push(...normalized);
            } else {
              // maybe older shape: resp.data.trades may be under resp.data
              const maybeArr = resp?.data ?? [];
              if (Array.isArray(maybeArr) && maybeArr.length) {
                const normalized = maybeArr.map(t => ({
                  symbol: (t.crypto_symbol || t.symbol || symbol).toUpperCase(),
                  side: (t.action || t.type || t.side || '').toLowerCase(),
                  price: Number(t.crypto_price ?? t.price ?? 0),
                  amount: Number(t.quantity ?? t.amount ?? 0),
                  timestamp: Number(t.timestampms ?? t.timestamp ?? Date.now())
                }));
                all.push(...normalized);
              }
            }
          } catch (err) {
            console.warn('fetchMarketTrades error for', symbol, err?.message || err);
          }
        }

        if (!mounted) return;

        // sort and keep the most recent 20
        all.sort((a, b) => b.timestamp - a.timestamp);
        const latest20 = all.slice(0, 20);
        setGeminiTransactions(latest20);

        // debug log
        console.log('[fetchMarketTrades] got', latest20.length, 'trades');
      } catch (err) {
        console.error('Failed to fetch Gemini market trades:', err);
      }
    };

    fetchMarketTrades();

    return () => {
      mounted = false;
    };
  }, [userInfo?.sub]); */

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
    return <AuthSection
      handleGoogleCallback={handleGoogleCallback}
      setIsAuthenticated={setIsAuthenticated}
      setUserInfo={setUserInfo}
      setIsLoadingAuth={setIsLoadingAuth}
    />;
  }

  //console.log('geminiTransactions:', geminiTransactions);
  console.log('geminiTransactions:', geminiTransactions);
  console.log('geminiTransactions length:', geminiTransactions.length);

  return (
    <div className="dashboard" style={{ minHeight: '100vh', paddingBottom: '40px' }}>
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

      {/* Connection Status */}
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

      {/* Gemini Login Panel inserted here */}
      <div style={{ marginBottom: '20px' }}>
        <GeminiLoginPanel userId={userInfo?.sub} onLogin={handleGeminiLogin} />
      </div>

      {/* Trading Speed Control */}
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

      <TradingControls
        startingValue={startingValue}
        stopLoss={stopLoss}
        profitTarget={profitTarget}
        isTrading={isTrading}
        selectedModels={selectedModels}
        handleStartingValueChange={handleStartingValueChange}
        handleStopLossChange={handleStopLossChange}
        handleProfitTargetChange={handleProfitTargetChange}
        handleStartTrading={handleStartTrading}
        handleStopTrading={handleStopTrading}
        handleReset={handleReset}
        isResetting={isResetting}
        startValue={startValue}
        trades={trades}
        stopReason={stopReason}
        finalProfitLoss={finalProfitLoss}
        showMonitoringPanel={showMonitoringPanel}
        modelsLatest={modelsLatest}
        cryptoLatest={cryptoLatest} // <--- Add this to force re-renders on price ticks
        getNormalizedValue={getNormalizedValue}
        handleModelSelection={handleModelSelection}
        availableModels={availableModels}
        nonSelectedModels={nonSelectedModels}
        setSelectedModels={setSelectedModels}
        nonSelectedModelsMetrics={nonSelectedModelsMetrics}
      />

      <SystemLogs tradingLogs={tradingLogs} />

      {/* Gemini Transactions Table */}
      {/* Place this after SystemLogs and before charts */}
      {/* 💎 Real Gemini Transactions Table (Restored & Fixed) */}
      
      <TransactionsTable
        trades={geminiTransactions}
        loadingTrades={loadingTrades}
        formatTimestamp={formatTimestamp}
        currentPrices={cryptoPrices}  // 👈 make sure this is passed
      />
      

      

      <div className="charts-container">
        <ModelsComparisonChart
          modelsHistory={normalizedModelsHistory}
          modelsMeta={Object.values(modelsLatest)}
          startingValue={Number(startingValue) || Number(startValue) || 10}
        />
      </div>
      
    </div>
  );
}

export default Dashboard;