import React, { useState, useEffect, useRef } from 'react';
import LiveMultiChart from './LiveMultiChart';
import ModelsComparisonChart from './ModelsComparisonChart';
import useModels from '../hooks/useModels';
import useCryptoPrices from '../hooks/useCryptoPrices';
import { useGemini, fetchGeminiBalances } from '../hooks/useGemini';
import socket from "../services/socket";
import { useNavigate } from "react-router-dom";
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

  const [loadingPositions, setLoadingPositions] = useState(false);

  // ✅ Live Gemini market trades per symbol
  const [btcTrades, setBtcTrades] = useState([]);
  const [ethTrades, setEthTrades] = useState([]);
  const [solTrades, setSolTrades] = useState([]);

  // ✅ FIXED: Combine all symbol trades and get last 20 (with safe array defaults)
  const last20GeminiTrades = [
    ...(btcTrades || []).map(t => ({ ...t, symbol: 'btcusd' })),
    ...(ethTrades || []).map(t => ({ ...t, symbol: 'ethusd' })),
    ...(solTrades || []).map(t => ({ ...t, symbol: 'solusd' })),
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

  // ✅ FIXED: Use safe defaults - NEVER initialize from localStorage
  const [isMockTrading, setIsMockTrading] = useState(true);
  const [lastSetStartingValue, setLastSetStartingValue] = useState('100');
  const [stopLoss, setStopLoss] = useState('');
  const [profitTarget, setProfitTarget] = useState('');
  const [startingValue, setStartingValue] = useState('100');
  const [isTrading, setIsTrading] = useState(false);
  const [tradingStopped, setTradingStopped] = useState(false);
  const [stopReason, setStopReason] = useState('');
  const [finalProfitLoss, setFinalProfitLoss] = useState(null);
  const [selectedModels, setSelectedModels] = useState([]);
  const [appState, setAppState] = useState({});
  const [initialValues, setInitialValues] = useState({});
  const [socketConnected, setSocketConnected] = useState(false);
  const [updateSpeed, setUpdateSpeed] = useState('1500');
  

  const { modelsLatest, modelsHistory } = useModels();
  const { latest: cryptoLatest, latest: cryptoPrices, history: cryptoHistory } = useCryptoPrices();

  const availableModels = Object.values(modelsLatest);
  
  // ✅ Replace your old 'const startValue = ...' with this:
  const startValue = (isTrading && appState?.tradingSession?.startValue != null)
    ? Number(appState?.tradingSession?.startValue)
    : (parseFloat(startingValue) || 100);

  const safeStartValue = Number.isFinite(startValue) && startValue > 0 ? startValue : 100;

  const [localModelOverrides, setLocalModelOverrides] = useState({});

  const currentPrice = cryptoLatest.BTCUSDT || null;

  // ✅ Add refs to hold the "live" values
  const stopLossRef = useRef(parseFloat(stopLoss) || 2.0);
  const profitTargetRef = useRef(parseFloat(profitTarget) || 5.0);

  const isSyncingFromServer = useRef(false);

  // 🔥 ADD CONSOLE LOGS RIGHT HERE (after all useState)
  console.log("appState on render:", appState);
  console.log("selectedModels on render:", selectedModels);
  console.log("isTrading on render:", isTrading);
  console.log("geminiTradingStatuses on render:", geminiTradingStatuses);

  // ✅ Update refs when state changes
  useEffect(() => {
    stopLossRef.current = parseFloat(stopLoss) || 2.0;
  }, [stopLoss]);

  useEffect(() => {
    profitTargetRef.current = parseFloat(profitTarget) || 5.0;
  }, [profitTarget]);

  // ✅ Google Login: Handle callback
  const handleGoogleCallback = async (response) => {
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: response.credential }),
      });

      const data = await res.json();
      if (data.user) {
        setUserInfo(data.user);
        setIsAuthenticated(true);
        localStorage.setItem('userInfo', JSON.stringify(data.user));
      }
    } catch (error) {
      console.error('Google login error:', error);
    }
  };

  // ✅ FIXED: Google Login with proper timing and element checks
  useEffect(() => {
    // Check if user is already logged in first
    const storedUser = localStorage.getItem('userInfo');
    if (storedUser) {
      try {
        setUserInfo(JSON.parse(storedUser));
        setIsAuthenticated(true);
        setIsLoadingAuth(false);
        return;
      } catch (e) {
        console.error('Failed to parse stored user:', e);
        localStorage.removeItem('userInfo');
      }
    }

    // If already authenticated, no need to load Google SDK
    if (isAuthenticated) {
      setIsLoadingAuth(false);
      return;
    }

    // Check if Google SDK already loaded
    if (window.google?.accounts?.id) {
      console.log('✅ Google SDK already loaded');
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        const buttonElement = document.getElementById('google-signin-button');
        if (buttonElement) {
          try {
            window.google.accounts.id.initialize({
              client_id: '1027088187936-rvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv.apps.googleusercontent.com',
              callback: handleGoogleCallback,
            });
            window.google.accounts.id.renderButton(buttonElement, {
              theme: 'outline',
              size: 'large',
            });
            console.log('✅ Google button rendered successfully');
          } catch (error) {
            console.error('❌ Error rendering Google button:', error);
          }
        } else {
          console.error('❌ Google sign-in button element not found');
        }
        setIsLoadingAuth(false);
      }, 100);
      return;
    }

    // Load Google SDK
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;

    script.onload = () => {
      if (!window.google?.accounts?.id) {
        console.error('❌ Google SDK failed to load');
        setIsLoadingAuth(false);
        return;
      }

      // Wait for DOM to be ready
      setTimeout(() => {
        const buttonElement = document.getElementById('google-signin-button');
        
        if (buttonElement) {
          try {
            window.google.accounts.id.initialize({
              client_id: '1027088187936-rvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv.apps.googleusercontent.com',
              callback: handleGoogleCallback,
            });
            window.google.accounts.id.renderButton(buttonElement, {
              theme: 'outline',
              size: 'large',
            });
            console.log('✅ Google button rendered successfully');
          } catch (error) {
            console.error('❌ Error initializing Google Sign-In:', error);
          }
        } else {
          console.error('❌ Google sign-in button element not found in DOM');
        }
        setIsLoadingAuth(false);
      }, 100);
    };

    script.onerror = () => {
      console.error('❌ Failed to load Google Sign-In script');
      setIsLoadingAuth(false);
    };

    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, [isAuthenticated]);

  // ✅ Logout handler (FIXED - removed useNavigate)
  const handleLogout = () => {
    setIsAuthenticated(false);
    setUserInfo(null);
    localStorage.removeItem('userInfo');
    window.location.href = '/';
  };

  // ✅ Fetch trades from backend
  useEffect(() => {
    if (!userInfo?.sub) return;

    const fetchTrades = async () => {
      try {
        const response = await fetch(`/api/trades?userId=${userInfo.sub}`);
        const data = await response.json();
        setTrades(data);
      } catch (error) {
        console.error('Error fetching trades:', error);
      } finally {
        setLoadingTrades(false);
      }
    };

    fetchTrades();
  }, [userInfo]);

  // ✅ HYDRATE APP STATE FROM SERVER ON LOGIN
  useEffect(() => {
    if (!userInfo?.sub) return;

    const fetchAppState = async () => {
      try {
        const response = await fetch(`/api/app-state?userId=${userInfo.sub}`);
        const data = await response.json();

        if (data.state) {
          isSyncingFromServer.current = true;

          // Hydrate all state from server
          setSelectedModels(data.state.selectedModels || []);
          setStartingValue(data.state.startingValue || '100');
          setStopLoss(data.state.stopLoss || '');
          setProfitTarget(data.state.profitTarget || '');
          setIsTrading(data.state.isTrading || false);
          setTradingStopped(data.state.tradingStopped || false);
          setStopReason(data.state.stopReason || '');
          setFinalProfitLoss(data.state.finalProfitLoss || null);
          setInitialValues(data.state.initialValues || {});
          setAppState(data.state.appState || {});
          setUpdateSpeed(data.state.updateSpeed || '1500');
          setIsMockTrading(data.state.isMockTrading !== undefined ? data.state.isMockTrading : true);
          setLastSetStartingValue(data.state.lastSetStartingValue || '100');

          // Cache to localStorage for offline fallback
          localStorage.setItem('selectedModels', JSON.stringify(data.state.selectedModels || []));
          localStorage.setItem('startingValue', data.state.startingValue || '100');
          localStorage.setItem('stopLoss', data.state.stopLoss || '');
          localStorage.setItem('profitTarget', data.state.profitTarget || '');
          localStorage.setItem('isTrading', String(data.state.isTrading || false));
          localStorage.setItem('updateSpeed', data.state.updateSpeed || '1500');
          localStorage.setItem('isMockTrading', String(data.state.isMockTrading !== undefined ? data.state.isMockTrading : true));
          localStorage.setItem('lastSetStartingValue', data.state.lastSetStartingValue || '100');

          setTimeout(() => {
            isSyncingFromServer.current = false;
          }, 100);
        }
      } catch (error) {
        console.error('Error fetching app state:', error);
      }
    };

    fetchAppState();
  }, [userInfo?.sub]);

  // ✅ SYNC APP STATE TO SERVER (DEBOUNCED)
  useEffect(() => {
    if (!userInfo?.sub) return;
    if (isSyncingFromServer.current) return;

    const timeoutId = setTimeout(() => {
      const stateToSync = {
        selectedModels,
        startingValue,
        stopLoss,
        profitTarget,
        isTrading,
        tradingStopped,
        stopReason,
        finalProfitLoss,
        initialValues,
        appState,
        updateSpeed,
        isMockTrading,
        lastSetStartingValue,
      };

      fetch('/api/app-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userInfo.sub,
          state: stateToSync,
        }),
      }).catch(err => console.error('Failed to sync app state:', err));

      // Also cache to localStorage
      localStorage.setItem('selectedModels', JSON.stringify(selectedModels));
      localStorage.setItem('startingValue', startingValue);
      localStorage.setItem('stopLoss', stopLoss);
      localStorage.setItem('profitTarget', profitTarget);
      localStorage.setItem('isTrading', String(isTrading));
      localStorage.setItem('updateSpeed', updateSpeed);
      localStorage.setItem('isMockTrading', String(isMockTrading));
      localStorage.setItem('lastSetStartingValue', lastSetStartingValue);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [
    selectedModels,
    startingValue,
    stopLoss,
    profitTarget,
    isTrading,
    tradingStopped,
    stopReason,
    finalProfitLoss,
    initialValues,
    appState,
    updateSpeed,
    isMockTrading,
    lastSetStartingValue,
    userInfo?.sub,
  ]);

  // ✅ LISTEN FOR APP STATE SYNC FROM OTHER DEVICES
  useEffect(() => {
    if (!userInfo?.sub) return;

    const handleAppStateSync = (data) => {
      if (data.userId === userInfo.sub) {
        isSyncingFromServer.current = true;

        setSelectedModels(data.state.selectedModels || []);
        setStartingValue(data.state.startingValue || '100');
        setStopLoss(data.state.stopLoss || '');
        setProfitTarget(data.state.profitTarget || '');
        setIsTrading(data.state.isTrading || false);
        setTradingStopped(data.state.tradingStopped || false);
        setStopReason(data.state.stopReason || '');
        setFinalProfitLoss(data.state.finalProfitLoss || null);
        setInitialValues(data.state.initialValues || {});
        setAppState(data.state.appState || {});
        setUpdateSpeed(data.state.updateSpeed || '1500');
        setIsMockTrading(data.state.isMockTrading !== undefined ? data.state.isMockTrading : true);
        setLastSetStartingValue(data.state.lastSetStartingValue || '100');

        setTimeout(() => {
          isSyncingFromServer.current = false;
        }, 100);
      }
    };

    socket.on('app_state_sync', handleAppStateSync);

    return () => {
      socket.off('app_state_sync', handleAppStateSync);
    };
  }, [userInfo?.sub]);

  // ✅ JOIN USER-SPECIFIC SOCKET ROOM (IMPROVED - HANDLES RECONNECTIONS)
  useEffect(() => {
    if (!userInfo?.sub) return;

    const joinRoom = () => {
      console.log("📢 Emitting join_user_room for:", userInfo.sub);
      socket.emit('join_user_room', { userId: userInfo.sub });
    };

    // Join immediately if already connected
    if (socket.connected) {
      joinRoom();
    }

    // Re-join on every successful connection/reconnection
    socket.on('connect', joinRoom);

    return () => {
      socket.off('connect', joinRoom);
    };
  }, [userInfo?.sub]);

  // ✅ Socket connection status
  useEffect(() => {
    const handleConnect = () => setSocketConnected(true);
    const handleDisconnect = () => setSocketConnected(false);

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    setSocketConnected(socket.connected);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, []);

  // ✅ Listen for new trades from WebSocket
  useEffect(() => {
    const handleNewTrade = (trade) => {
      setTrades((prev) => [trade, ...prev].slice(0, 100));
    };

    socket.on('new_trade', handleNewTrade);

    return () => {
      socket.off('new_trade', handleNewTrade);
    };
  }, []);

  // ✅ Listen for clear session logs event
  useEffect(() => {
    const handleClearLogs = () => {
      setTradingLogs([]);
    };

    socket.on('clear_session_logs', handleClearLogs);

    return () => {
      socket.off('clear_session_logs', handleClearLogs);
    };
  }, []);

  // ✅ Listen for Gemini market trades
  useEffect(() => {
    const handleGeminiTrades = (data) => {
      const { symbol, trades: newTrades } = data;

      if (symbol === 'btcusd') {
        setBtcTrades(newTrades);
      } else if (symbol === 'ethusd') {
        setEthTrades(newTrades);
      } else if (symbol === 'solusd') {
        setSolTrades(newTrades);
      }
    };

    socket.on('gemini_market_trades', handleGeminiTrades);

    return () => {
      socket.off('gemini_market_trades', handleGeminiTrades);
    };
  }, []);

  // ✅ Listen for models reset event
  useEffect(() => {
    const handleModelsReset = () => {
      setLocalModelOverrides({});
    };

    socket.on('models_reset', handleModelsReset);

    return () => {
      socket.off('models_reset', handleModelsReset);
    };
  }, []);

  // ✅ Listen for position opened/closed events
  useEffect(() => {
    const handlePositionOpened = (data) => {
      addLog(`success`, `Position opened: ${data.model} ${data.symbol} ${data.side}`);
    };

    const handlePositionClosed = (data) => {
      addLog(`success`, `Position closed: ${data.model} ${data.symbol} P&L: $${data.pnl}`);
    };

    socket.on('position_opened', handlePositionOpened);
    socket.on('position_closed', handlePositionClosed);

    return () => {
      socket.off('position_opened', handlePositionOpened);
      socket.off('position_closed', handlePositionClosed);
    };
  }, []);

  // ✅ Emit update speed to server
  useEffect(() => {
    if (socketConnected) {
      socket.emit('setUpdateSpeed', { speed: parseInt(updateSpeed) });
    }
  }, [updateSpeed, socketConnected]);

  // ✅ Toggle model selection
  const toggleModel = (modelName) => {
    setSelectedModels((prev) =>
      prev.includes(modelName)
        ? prev.filter((m) => m !== modelName)
        : [...prev, modelName]
    );
  };

  // ✅ Start trading handler
  const handleStartTrading = async () => {
    if (selectedModels.length === 0) {
      alert('Please select at least one model to start trading.');
      return;
    }

    // Clear UI logs
    setTradingLogs([]);

    // Emit event to clear logs on other devices
    if (userInfo?.sub) {
      socket.emit('request_clear_logs', { userId: userInfo.sub });
    }

    const sessionId = `session_${Date.now()}`;
    const startTime = new Date().toISOString();
    const startVal = parseFloat(startingValue) || 100;

    // Capture entry prices for all selected models
    const entryPrices = {};
    selectedModels.forEach(modelName => {
      const modelData = modelsLatest[modelName];
      if (modelData?.value != null) {
        entryPrices[modelName] = Number(modelData.value);
      }
    });

    const newAppState = {
      ...appState,
      tradingSession: {
        sessionId,
        startTime,
        startValue: startVal,
        entryPrices,
      },
    };

    setAppState(newAppState);
    setIsTrading(true);
    setTradingStopped(false);
    setStopReason('');
    setFinalProfitLoss(null);
    setLocalModelOverrides({});

    addLog('Trading started!', 'success');

    // If Gemini is connected and in live mode, start Gemini trading for selected models
    if (isGeminiConnected && !isMockTrading) {
      for (const modelName of selectedModels) {
        await handleStartGeminiTrading(modelName);
      }
    }
  };

  // ✅ Stop trading handler
  const handleStopTrading = () => {
    const totalPL = calculateTotalProfitLoss();
    setIsTrading(false);
    setTradingStopped(true);
    setStopReason('Manually stopped by user');
    setFinalProfitLoss(totalPL);

    addLog(`Trading stopped. Final P/L: $${totalPL.toFixed(2)}`, 'warning');

    // If Gemini is connected, close all positions
    if (isGeminiConnected && !isMockTrading) {
      handleCloseAllGeminiTrading();
    }
  };

  // ✅ Reset handler
  const handleReset = async () => {
    if (isResetting) return;

    const confirmReset = window.confirm(
      'Are you sure you want to reset? This will clear all trading data and close any open Gemini positions.'
    );

    if (!confirmReset) return;

    setIsResetting(true);

    try {
      // Close all Gemini positions first
      if (isGeminiConnected && openPositions.length > 0) {
        addLog('Closing all open Gemini positions...', 'warning');
        await closeAllPositions();
        addLog('All Gemini positions closed.', 'success');
      }

      // Clear UI state
      setIsTrading(false);
      setTradingStopped(false);
      setStopReason('');
      setFinalProfitLoss(null);
      setSelectedModels([]);
      setStartingValue('100');
      setStopLoss('');
      setProfitTarget('');
      setInitialValues({});
      setAppState({});
      setLocalModelOverrides({});
      setTradingLogs([]);

      // Emit reset event to other devices
      if (userInfo?.sub) {
        socket.emit('models_reset', { userId: userInfo.sub });
      }

      addLog('Dashboard reset successfully.', 'success');
    } catch (error) {
      console.error('Error during reset:', error);
      addLog('Error during reset. Please try again.', 'error');
    } finally {
      setIsResetting(false);
    }
  };

  // ✅ Calculate total profit/loss
  const calculateTotalProfitLoss = () => {
    let total = 0;

    selectedModels.forEach((modelName) => {
      const currentVal = getNormalizedValue(modelName);
      const diff = currentVal - safeStartValue;
      total += diff;
    });

    return total;
  };

  // ✅ Get normalized value for a model
  const getNormalizedValue = (modelName) => {
    // Check for local override first (for immediate UI feedback)
    if (localModelOverrides[modelName] != null) {
      return localModelOverrides[modelName];
    }

    const modelData = modelsLatest[modelName];
    if (!modelData || modelData.value == null) return safeStartValue;

    const currentVal = Number(modelData.value);
    if (!Number.isFinite(currentVal)) return safeStartValue;

    // Use session start value from appState
    const sessionStartValue = appState?.tradingSession?.startValue;
    const baseValue = sessionStartValue != null ? Number(sessionStartValue) : safeStartValue;

    const entryPrice = appState?.tradingSession?.entryPrices?.[modelName];
    if (entryPrice == null || entryPrice <= 0) return baseValue;

    const percentChange = ((currentVal - entryPrice) / entryPrice) * 100;
    const normalizedValue = baseValue * (1 + percentChange / 100);

    return Number.isFinite(normalizedValue) ? normalizedValue : baseValue;
  };

  // ✅ Check risk management
  useEffect(() => {
    if (!isTrading || tradingStopped) return;

    const checkRiskManagement = () => {
      const totalPL = calculateTotalProfitLoss();
      const totalValue = safeStartValue * selectedModels.length + totalPL;

      const stopLossValue = parseFloat(stopLoss);
      const profitTargetValue = parseFloat(profitTarget);

      if (stopLossValue && totalValue <= stopLossValue) {
        setIsTrading(false);
        setTradingStopped(true);
        setStopReason('Stop loss triggered');
        setFinalProfitLoss(totalPL);
        addLog(`Stop loss triggered at $${totalValue.toFixed(2)}`, 'error');

        if (isGeminiConnected && !isMockTrading) {
          handleCloseAllGeminiTrading();
        }
      } else if (profitTargetValue && totalValue >= profitTargetValue) {
        setIsTrading(false);
        setTradingStopped(true);
        setStopReason('Profit target reached');
        setFinalProfitLoss(totalPL);
        addLog(`Profit target reached at $${totalValue.toFixed(2)}`, 'success');

        if (isGeminiConnected && !isMockTrading) {
          handleCloseAllGeminiTrading();
        }
      }
    };

    const interval = setInterval(checkRiskManagement, 1000);

    return () => clearInterval(interval);
  }, [isTrading, tradingStopped, selectedModels, stopLoss, profitTarget, safeStartValue, isGeminiConnected, isMockTrading]);

  // ✅ Gemini: Start trading for a specific model
  const handleStartGeminiTrading = async (modelName) => {
    if (!isGeminiConnected) {
      addLog('Gemini not connected. Please connect first.', 'error');
      return;
    }

    if (isMockTrading) {
      addLog('Cannot start Gemini trading in mock mode.', 'warning');
      return;
    }

    const modelData = modelsLatest[modelName];
    if (!modelData) {
      addLog(`Model ${modelName} not found.`, 'error');
      return;
    }

    const decision = modelData.decision;
    if (!decision || !decision.action || !decision.symbol) {
      addLog(`Model ${modelName} has no valid decision.`, 'warning');
      return;
    }

    const { action, symbol, confidence } = decision;

    // Check if already trading
    const existingPosition = openPositions.find(
      (p) => p.model === modelName && p.symbol.toLowerCase() === symbol.toLowerCase()
    );

    if (existingPosition) {
      addLog(`Model ${modelName} already has an open position on ${symbol}.`, 'warning');
      return;
    }

    try {
      setGeminiTradingStatuses((prev) => ({ ...prev, [modelName]: 'starting' }));

      const amount = 0.001; // Fixed amount for now
      const side = action.toLowerCase() === 'buy' ? 'buy' : 'sell';

      addLog(`Starting Gemini trading for ${modelName}: ${side.toUpperCase()} ${amount} ${symbol}`, 'info');

      const result = await placeGeminiOrder(symbol, side, amount, modelName);

      if (result.success) {
        addLog(`Gemini order placed for ${modelName}: ${side.toUpperCase()} ${amount} ${symbol}`, 'success');
        setGeminiTradingStatuses((prev) => ({ ...prev, [modelName]: 'active' }));
      } else {
        addLog(`Failed to place Gemini order for ${modelName}: ${result.error}`, 'error');
        setGeminiTradingStatuses((prev) => ({ ...prev, [modelName]: 'error' }));
      }
    } catch (error) {
      console.error(`Error starting Gemini trading for ${modelName}:`, error);
      addLog(`Error starting Gemini trading for ${modelName}: ${error.message}`, 'error');
      setGeminiTradingStatuses((prev) => ({ ...prev, [modelName]: 'error' }));
    }
  };

  // ✅ Gemini: Stop trading for a specific model
  const handleStopGeminiTrading = async (modelName) => {
    const position = openPositions.find((p) => p.model === modelName);

    if (!position) {
      addLog(`No open position found for ${modelName}.`, 'warning');
      return;
    }

    const { symbol, side, amount, entryPrice } = position;
    const currentPrice = cryptoLatest[symbol.toUpperCase().replace('USD', 'USDT')] || entryPrice;

    const pnl = side === 'buy'
      ? (currentPrice - entryPrice) * amount
      : (entryPrice - currentPrice) * amount;

    const pnlPercent = ((pnl / (entryPrice * amount)) * 100).toFixed(2);

    const confirmClose = window.confirm(
      `Stop Gemini Live Trading?\n\n` +
      `Model: ${modelName}\n` +
      `Symbol: ${symbol.toUpperCase()}\n` +
      `Side: ${side === 'buy' ? 'SELL (Close Long)' : 'BUY (Close Short)'}\n` +
      `Amount: ${amount}\n` +
      `Entry Price: $${entryPrice.toFixed(2)}\n` +
      `Current Price: $${currentPrice.toFixed(2)}\n` +
      `Estimated P&L: $${pnl.toFixed(2)} (${pnlPercent}%)`
    );

    if (!confirmClose) return;

    try {
      setGeminiTradingStatuses((prev) => ({ ...prev, [modelName]: 'closing' }));

      const closeSide = side === 'buy' ? 'sell' : 'buy';
      const result = await placeGeminiOrder(symbol, closeSide, amount, modelName);

      if (result.success) {
        addLog(`Gemini ${closeSide.toUpperCase()} order placed & position closed!`, 'success');
        addLog(`Model: ${modelName}`, 'info');
        addLog(`Symbol: ${symbol.toUpperCase()}`, 'info');
        addLog(`Position: ${side.toUpperCase()}`, 'info');
        addLog(`Entry: $${entryPrice.toFixed(2)}`, 'info');
        addLog(`Exit: $${currentPrice.toFixed(2)}`, 'info');
        addLog(`P&L: $${pnl.toFixed(2)} (${pnlPercent}%)`, pnl >= 0 ? 'success' : 'error');

        setGeminiTradingStatuses((prev) => ({ ...prev, [modelName]: 'closed' }));

        // Refresh positions
        await fetchOpenPositions();
      } else {
        addLog(`Failed to close position for ${modelName}: ${result.error}`, 'error');
        setGeminiTradingStatuses((prev) => ({ ...prev, [modelName]: 'error' }));
      }
    } catch (error) {
      console.error(`Error closing position for ${modelName}:`, error);
      addLog(`Error closing position for ${modelName}: ${error.message}`, 'error');
      setGeminiTradingStatuses((prev) => ({ ...prev, [modelName]: 'error' }));
    }
  };

  // ✅ Gemini: Close all positions
  const handleCloseAllGeminiTrading = async () => {
    if (openPositions.length === 0) {
      addLog('No open Gemini positions to close.', 'warning');
      return;
    }

    const confirmCloseAll = window.confirm(
      `Close ALL ${openPositions.length} open Gemini positions?\n\n` +
      `This will place REAL ${openPositions[0]?.side === 'buy' ? 'SELL' : 'BUY'} orders for:\n` +
      openPositions.map((p) => `• ${p.model} - ${p.symbol.toUpperCase()} (${p.amount})`).join('\n') +
      `\n\nThis action cannot be undone.`
    );

    if (!confirmCloseAll) return;

    try {
      addLog('Closing all Gemini positions...', 'warning');

      const results = await closeAllPositions();

      const successCount = results.filter((r) => r.success).length;
      const failCount = results.length - successCount;

      if (successCount > 0) {
        addLog(`Successfully closed ${successCount} position(s).`, 'success');
      }

      if (failCount > 0) {
        addLog(`Failed to close ${failCount} position(s).`, 'error');
      }

      // Refresh positions
      await fetchOpenPositions();
    } catch (error) {
      console.error('Error closing all positions:', error);
      addLog(`Error closing all positions: ${error.message}`, 'error');
    }
  };

  // ✅ Gemini: Connect handler
  const handleGeminiConnect = async () => {
    if (!geminiApiKey || !geminiApiSecret) {
      alert('Please enter both API Key and API Secret.');
      return;
    }

    setIsGeminiConnecting(true);

    try {
      // Save credentials to backend
      const response = await fetch('/api/gemini/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userInfo.sub,
          apiKey: geminiApiKey,
          apiSecret: geminiApiSecret,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save Gemini credentials.');
      }

      // Connect to Gemini
      await connectGemini(geminiApiKey, geminiApiSecret);

      // Save to localStorage for quick access
      localStorage.setItem('geminiApiKey', geminiApiKey);
      localStorage.setItem('geminiApiSecret', geminiApiSecret);

      setShowGeminiModal(false);
      setGeminiStep(1);
      addLog('Gemini connected successfully!', 'success');
    } catch (error) {
      console.error('Gemini connection error:', error);
      alert(`Failed to connect to Gemini: ${error.message}`);
    } finally {
      setIsGeminiConnecting(false);
    }
  };

  // ✅ Gemini: Disconnect handler
  const handleGeminiDisconnect = () => {
    disconnectGemini();
    clearPositions();
    setGeminiApiKey('');
    setGeminiApiSecret('');
    localStorage.removeItem('geminiApiKey');
    localStorage.removeItem('geminiApiSecret');
    addLog('Gemini disconnected.', 'warning');
  };

  // ✅ Gemini: Manual order placement
  const handlePlaceOrder = async () => {
    if (!tradeAmount || !tradeSymbol || !tradeSide) {
      alert('Please fill in all fields.');
      return;
    }

    // ✅ Validate price for limit orders
    if (!tradePrice || parseFloat(tradePrice) <= 0) {
      alert('Please enter a valid price.');
      return;
    }

    setIsPlacingOrder(true);

    try {
      // ✅ FIX: Pass an object, not individual arguments
      const orderData = {
        symbol: tradeSymbol,
        side: tradeSide,
        amount: parseFloat(tradeAmount).toString(),
        price: parseFloat(tradePrice).toString(),
        type: 'exchange limit', // Use limit orders for manual trades
        userId: userInfo?.sub, // Include userId for credential lookup
      };

      console.log('📤 Placing manual order:', orderData);

      const result = await placeGeminiOrder(orderData);

      console.log('📥 Order result:', result);

      if (result.success) {
        addLog(`Order placed: ${tradeSide.toUpperCase()} ${tradeAmount} ${tradeSymbol.toUpperCase()} @ $${tradePrice}`, 'success');
        setShowTradeModal(false);
        setTradeAmount('');
        setTradePrice('');
        await fetchOpenPositions();
      } else {
        // ✅ Safe error extraction
        const errorMsg = typeof result.error === 'string' 
          ? result.error 
          : (result.geminiMessage || result.details?.message || 'Failed to place order');
        
        addLog(`Order failed: ${errorMsg}`, 'error');
        alert(`Failed to place order: ${errorMsg}`);
      }
    } catch (error) {
      console.error('❌ Error placing order:', error);
      const errorMsg = error.response?.data?.error || error.message || 'Unknown error';
      addLog(`Order error: ${errorMsg}`, 'error');
      alert(`Error placing order: ${errorMsg}`);
    } finally {
      setIsPlacingOrder(false);
    }
  };

  // ✅ Calculate trading summary
  const tradingSummary = {
    totalProfitLoss: calculateTotalProfitLoss(),
    totalTrades: trades.length,
    winningTrades: trades.filter((t) => t.profitLoss > 0).length,
    losingTrades: trades.filter((t) => t.profitLoss < 0).length,
    winRate: trades.length > 0 ? ((trades.filter((t) => t.profitLoss > 0).length / trades.length) * 100).toFixed(1) : '0.0',
  };

  // ✅ Render loading state
  if (isLoadingAuth) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h2>Loading...</h2>
      </div>
    );
  }

  // ✅ FIXED: Render login screen with proper div containers
  if (!isAuthenticated) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', maxWidth: '400px', margin: '0 auto' }}>
        <h1>Crypto Trading Dashboard</h1>
        <p>Please sign in with Google to continue</p>
        {/* ✅ FIXED: Added both required divs for Google Sign-In */}
        <div id="g_id_onload"></div>
        <div id="google-signin-button" style={{ marginTop: '20px' }}></div>
      </div>
    );
  }

  // ✅ Main dashboard render
  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1>Crypto Trading Dashboard</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 'bold' }}>{userInfo.name}</div>
            <div style={{ fontSize: '12px', color: '#666' }}>{userInfo.email}</div>
          </div>
          <button onClick={handleLogout} style={{ padding: '8px 16px', cursor: 'pointer' }}>
            Logout
          </button>
        </div>
      </div>

      {/* Connection Status */}
      <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: '#f0f0f0', borderRadius: '5px' }}>
        <div><strong>Connection Status</strong></div>
        <div>Socket: {socketConnected ? '✅ Connected' : '❌ Disconnected'}</div>
        <div>BTC Price: ${currentPrice ? currentPrice.toFixed(2) : 'Loading...'}</div>
        <div>Models Loaded: {availableModels.length > 0 ? `✅ ${availableModels.length} models` : '⏳ Loading...'}</div>
        <div>Selected Models: {selectedModels.length > 0 ? `✅ ${selectedModels.length} selected` : '⚠️ None selected'}</div>
        <div>Update Speed: {updateSpeed}ms</div>
        <div>Trading Mode: {isMockTrading ? '🎮 Mock (Simulated)' : '💎 Gemini (Live)'}</div>
        <div>Trading Status: {isTrading ? '🟢 Active' : '⚪ Inactive'}</div>
      </div>

      {/* Gemini Connection Section */}
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '5px', border: '1px solid #ddd' }}>
        <h3 style={{ marginTop: 0 }}>💎 Gemini Exchange Integration</h3>
        
        {!isGeminiConnected ? (
          <div>
            <p>Connect to Gemini to enable live trading with real funds.</p>
            <button 
              onClick={() => setShowGeminiModal(true)}
              style={{ 
                padding: '10px 20px', 
                backgroundColor: '#4CAF50', 
                color: 'white', 
                border: 'none', 
                borderRadius: '5px', 
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Connect Gemini Account
            </button>
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: '10px' }}>
              <strong>Status:</strong> ✅ Connected to Gemini
            </div>
            
            {/* Gemini Balances */}
            <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: 'white', borderRadius: '5px' }}>
              <strong>Balances:</strong>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginTop: '10px' }}>
                {geminiBalances && Object.entries(geminiBalances).map(([currency, balance]) => (
                  <div key={currency} style={{ padding: '8px', backgroundColor: '#f0f0f0', borderRadius: '3px' }}>
                    <div style={{ fontWeight: 'bold', textTransform: 'uppercase' }}>{currency}</div>
                    <div>{typeof balance === 'number' ? balance.toFixed(4) : balance}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Open Positions */}
            {openPositions && openPositions.length > 0 && (
              <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: 'white', borderRadius: '5px' }}>
                <strong>Open Positions ({openPositions.length}):</strong>
                <div style={{ marginTop: '10px' }}>
                  {openPositions.map((position, idx) => {
                    const currentPrice = cryptoLatest[position.symbol.toUpperCase().replace('USD', 'USDT')] || position.entryPrice;
                    const pnl = position.side === 'buy'
                      ? (currentPrice - position.entryPrice) * position.amount
                      : (position.entryPrice - currentPrice) * position.amount;
                    const pnlPercent = ((pnl / (position.entryPrice * position.amount)) * 100).toFixed(2);

                    return (
                      <div key={idx} style={{ 
                        padding: '10px', 
                        marginBottom: '8px', 
                        backgroundColor: '#f9f9f9', 
                        borderRadius: '5px',
                        border: `2px solid ${pnl >= 0 ? '#4CAF50' : '#f44336'}`
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div><strong>{position.model}</strong> - {position.symbol.toUpperCase()}</div>
                            <div style={{ fontSize: '12px', color: '#666' }}>
                              {position.side.toUpperCase()} {position.amount} @ ${position.entryPrice.toFixed(2)}
                            </div>
                            <div style={{ fontSize: '12px', marginTop: '5px' }}>
                              Current: ${currentPrice.toFixed(2)} | 
                              P&L: <span style={{ color: pnl >= 0 ? '#4CAF50' : '#f44336', fontWeight: 'bold' }}>
                                ${pnl.toFixed(2)} ({pnlPercent}%)
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => handleStopGeminiTrading(position.model)}
                            style={{
                              padding: '8px 16px',
                              backgroundColor: '#f44336',
                              color: 'white',
                              border: 'none',
                              borderRadius: '5px',
                              cursor: 'pointer',
                              fontSize: '12px'
                            }}
                          >
                            Close Position
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button
                  onClick={handleCloseAllGeminiTrading}
                  style={{
                    marginTop: '10px',
                    padding: '10px 20px',
                    backgroundColor: '#f44336',
                    color: 'white',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    width: '100%'
                  }}
                >
                  Close All Positions
                </button>
              </div>
            )}

            {/* Last 20 Gemini Market Trades */}
            <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: 'white', borderRadius: '5px' }}>
              <strong>Last 20 Market Trades:</strong>
              <div style={{ maxHeight: '200px', overflowY: 'auto', marginTop: '10px' }}>
                {last20GeminiTrades.length > 0 ? (
                  <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f0f0f0' }}>
                        <th style={{ padding: '5px', textAlign: 'left' }}>Symbol</th>
                        <th style={{ padding: '5px', textAlign: 'left' }}>Type</th>
                        <th style={{ padding: '5px', textAlign: 'right' }}>Price</th>
                        <th style={{ padding: '5px', textAlign: 'right' }}>Amount</th>
                        <th style={{ padding: '5px', textAlign: 'left' }}>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {last20GeminiTrades.map((trade, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                          <td style={{ padding: '5px' }}>{trade.symbol?.toUpperCase()}</td>
                          <td style={{ padding: '5px', color: trade.type === 'buy' ? '#4CAF50' : '#f44336' }}>
                            {trade.type?.toUpperCase()}
                          </td>
                          <td style={{ padding: '5px', textAlign: 'right' }}>${parseFloat(trade.price).toFixed(2)}</td>
                          <td style={{ padding: '5px', textAlign: 'right' }}>{parseFloat(trade.amount).toFixed(4)}</td>
                          <td style={{ padding: '5px' }}>
                            {new Date(parseInt(trade.timestampms || trade.timestamp)).toLocaleTimeString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ textAlign: 'center', color: '#999', padding: '20px' }}>
                    No market trades available
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setShowTradeModal(true)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#2196F3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  flex: 1
                }}
              >
                Place Manual Order
              </button>
              <button
                onClick={handleGeminiDisconnect}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#f44336',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Disconnect
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Trading Mode Toggle */}
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#fff3cd', borderRadius: '5px', border: '1px solid #ffc107' }}>
        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={isMockTrading}
            onChange={(e) => setIsMockTrading(e.target.checked)}
            disabled={isTrading}
            style={{ marginRight: '10px', width: '20px', height: '20px', cursor: 'pointer' }}
          />
          <span style={{ fontSize: '16px', fontWeight: 'bold' }}>
            {isMockTrading ? '🎮 Mock Trading Mode (Simulated)' : '💎 Live Trading Mode (Real Funds)'}
          </span>
        </label>
        <p style={{ margin: '10px 0 0 30px', fontSize: '14px', color: '#856404' }}>
          {isMockTrading 
            ? 'Trades are simulated. No real funds will be used.' 
            : '⚠️ WARNING: Live mode uses REAL funds on Gemini. Ensure you understand the risks.'}
        </p>
      </div>

      {/* Trading Controls */}
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: 'white', borderRadius: '5px', border: '1px solid #ddd' }}>
        <h3 style={{ marginTop: 0 }}>Trading Controls</h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '15px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Starting Value ($)</label>
            <input
              type="number"
              value={startingValue}
              onChange={(e) => setStartingValue(e.target.value)}
              disabled={isTrading}
              style={{ width: '100%', padding: '8px', borderRadius: '5px', border: '1px solid #ddd' }}
            />
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Stop Loss ($)</label>
            <input
              type="number"
              value={stopLoss}
              onChange={(e) => setStopLoss(e.target.value)}
              disabled={isTrading}
              style={{ width: '100%', padding: '8px', borderRadius: '5px', border: '1px solid #ddd' }}
              placeholder="Optional"
            />
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Profit Target ($)</label>
            <input
              type="number"
              value={profitTarget}
              onChange={(e) => setProfitTarget(e.target.value)}
              disabled={isTrading}
              style={{ width: '100%', padding: '8px', borderRadius: '5px', border: '1px solid #ddd' }}
              placeholder="Optional"
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Update Speed (ms)</label>
            <select
              value={updateSpeed}
              onChange={(e) => setUpdateSpeed(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: '5px', border: '1px solid #ddd' }}
            >
              <option value="500">500ms (Fast)</option>
              <option value="1000">1000ms (Normal)</option>
              <option value="1500">1500ms (Default)</option>
              <option value="2000">2000ms (Slow)</option>
              <option value="3000">3000ms (Very Slow)</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          {!isTrading ? (
            <button
              onClick={handleStartTrading}
              disabled={selectedModels.length === 0 || (!isMockTrading && !isGeminiConnected)}
              style={{
                padding: '12px 24px',
                backgroundColor: selectedModels.length === 0 || (!isMockTrading && !isGeminiConnected) ? '#ccc' : '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: selectedModels.length === 0 || (!isMockTrading && !isGeminiConnected) ? 'not-allowed' : 'pointer',
                fontSize: '16px',
                fontWeight: 'bold',
                flex: 1
              }}
            >
              Start Trading
            </button>
          ) : (
            <button
              onClick={handleStopTrading}
              style={{
                padding: '12px 24px',
                backgroundColor: '#f44336',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: 'bold',
                flex: 1
              }}
            >
              Stop Trading
            </button>
          )}
          
          <button
            onClick={handleReset}
            disabled={isTrading || isResetting}
            style={{
              padding: '12px 24px',
              backgroundColor: isTrading || isResetting ? '#ccc' : '#ff9800',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: isTrading || isResetting ? 'not-allowed' : 'pointer',
              fontSize: '16px',
              fontWeight: 'bold'
            }}
          >
            {isResetting ? 'Resetting...' : 'Reset'}
          </button>
        </div>

        {tradingStopped && (
          <div style={{ 
            marginTop: '15px', 
            padding: '15px', 
            backgroundColor: finalProfitLoss >= 0 ? '#d4edda' : '#f8d7da',
            borderRadius: '5px',
            border: `1px solid ${finalProfitLoss >= 0 ? '#c3e6cb' : '#f5c6cb'}`
          }}>
            <strong>Trading Stopped:</strong> {stopReason}
            <br />
            <strong>Final P/L:</strong> <span style={{ color: finalProfitLoss >= 0 ? '#155724' : '#721c24', fontWeight: 'bold' }}>
              ${finalProfitLoss?.toFixed(2)}
            </span>
          </div>
        )}
      </div>

      {/* Model Selection */}
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: 'white', borderRadius: '5px', border: '1px solid #ddd' }}>
        <h3 style={{ marginTop: 0 }}>Select Models ({selectedModels.length} selected)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
          {availableModels.map((model) => {
            const isSelected = selectedModels.includes(model.name);
            const tradingStatus = geminiTradingStatuses[model.name];
            
            return (
              <div
                key={model.name}
                onClick={() => !isTrading && toggleModel(model.name)}
                style={{
                  padding: '12px',
                  backgroundColor: isSelected ? '#e3f2fd' : '#f5f5f5',
                  border: `2px solid ${isSelected ? '#2196F3' : '#ddd'}`,
                  borderRadius: '5px',
                  cursor: isTrading ? 'not-allowed' : 'pointer',
                  opacity: isTrading ? 0.6 : 1,
                  position: 'relative'
                }}
              >
                <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>{model.name}</div>
                <div style={{ fontSize: '12px', color: '#666' }}>
                  Value: ${model.value?.toFixed(2) || 'N/A'}
                </div>
                {isSelected && isTrading && (
                  <div style={{ fontSize: '12px', marginTop: '5px' }}>
                    Current: ${getNormalizedValue(model.name).toFixed(2)}
                    <br />
                    P/L: <span style={{ 
                      color: getNormalizedValue(model.name) >= safeStartValue ? '#4CAF50' : '#f44336',
                      fontWeight: 'bold'
                    }}>
                      ${(getNormalizedValue(model.name) - safeStartValue).toFixed(2)}
                    </span>
                  </div>
                )}
                {tradingStatus && (
                  <div style={{ 
                    position: 'absolute', 
                    top: '5px', 
                    right: '5px',
                    fontSize: '10px',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    backgroundColor: 
                      tradingStatus === 'active' ? '#4CAF50' :
                      tradingStatus === 'starting' ? '#ff9800' :
                      tradingStatus === 'closing' ? '#f44336' :
                      tradingStatus === 'error' ? '#f44336' :
                      '#9e9e9e',
                    color: 'white',
                    fontWeight: 'bold'
                  }}>
                    {tradingStatus.toUpperCase()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Trading Summary */}
      {isTrading && (
        <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: 'white', borderRadius: '5px', border: '1px solid #ddd' }}>
          <h3 style={{ marginTop: 0 }}>Trading Summary</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' }}>
            <div>
              <div style={{ fontSize: '12px', color: '#666' }}>Total P/L</div>
              <div style={{ 
                fontSize: '24px', 
                fontWeight: 'bold',
                color: tradingSummary.totalProfitLoss >= 0 ? '#4CAF50' : '#f44336'
              }}>
                ${tradingSummary.totalProfitLoss.toFixed(2)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#666' }}>Total Value</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                ${(safeStartValue * selectedModels.length + tradingSummary.totalProfitLoss).toFixed(2)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#666' }}>Win Rate</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                {tradingSummary.winRate}%
              </div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#666' }}>Total Trades</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                {tradingSummary.totalTrades}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Charts */}
      <div style={{ marginBottom: '20px' }}>
        <LiveMultiChart 
          selectedModels={selectedModels}
          isTrading={isTrading}
          startValue={safeStartValue}
        />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <ModelsComparisonChart 
          selectedModels={selectedModels}
          isTrading={isTrading}
        />
      </div>

      {/* Trading Logs */}
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: 'white', borderRadius: '5px', border: '1px solid #ddd' }}>
        <h3 style={{ marginTop: 0 }}>Trading Logs</h3>
        <div style={{ 
          maxHeight: '300px', 
          overflowY: 'auto', 
          backgroundColor: '#f9f9f9', 
          padding: '10px', 
          borderRadius: '5px',
          fontFamily: 'monospace',
          fontSize: '12px'
        }}>
          {tradingLogs.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#999', padding: '20px' }}>
              No logs yet. Start trading to see activity.
            </div>
          ) : (
            tradingLogs.map((log, idx) => (
              <div 
                key={idx} 
                style={{ 
                  padding: '5px',
                  marginBottom: '3px',
                  borderLeft: `3px solid ${
                    log.type === 'success' ? '#4CAF50' :
                    log.type === 'error' ? '#f44336' :
                    log.type === 'warning' ? '#ff9800' :
                    '#2196F3'
                  }`,
                  paddingLeft: '10px',
                  backgroundColor: 'white'
                }}
              >
                <span style={{ color: '#666' }}>[{log.timestamp}]</span>{' '}
                <span style={{ 
                  color: 
                    log.type === 'success' ? '#4CAF50' :
                    log.type === 'error' ? '#f44336' :
                    log.type === 'warning' ? '#ff9800' :
                    '#2196F3',
                  fontWeight: 'bold'
                }}>
                  {log.type.toUpperCase()}
                </span>
                : {log.message}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Recent Trades */}
      <div style={{ padding: '15px', backgroundColor: 'white', borderRadius: '5px', border: '1px solid #ddd' }}>
        <h3 style={{ marginTop: 0 }}>Recent Trades</h3>
        {loadingTrades ? (
          <div style={{ textAlign: 'center', padding: '20px' }}>Loading trades...</div>
        ) : trades.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#999', padding: '20px' }}>
            No trades yet. Start trading to see your history.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f0f0f0' }}>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Time</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Model</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Action</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Symbol</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>Price</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>Amount</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>P/L</th>
                </tr>
              </thead>
              <tbody>
                {trades.slice(0, 20).map((trade, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '10px' }}>
                      {new Date(trade.timestamp).toLocaleString()}
                    </td>
                    <td style={{ padding: '10px' }}>{trade.model}</td>
                    <td style={{ 
                      padding: '10px',
                      color: trade.action === 'BUY' ? '#4CAF50' : '#f44336',
                      fontWeight: 'bold'
                    }}>
                      {trade.action}
                    </td>
                    <td style={{ padding: '10px' }}>{trade.symbol}</td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>
                      ${trade.price?.toFixed(2)}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>
                      {trade.amount?.toFixed(4)}
                    </td>
                    <td style={{ 
                      padding: '10px', 
                      textAlign: 'right',
                      color: trade.profitLoss >= 0 ? '#4CAF50' : '#f44336',
                      fontWeight: 'bold'
                    }}>
                      ${trade.profitLoss?.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Gemini Connection Modal */}
      {showGeminiModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '30px',
            borderRadius: '10px',
            maxWidth: '500px',
            width: '90%',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <h2 style={{ marginTop: 0 }}>Connect to Gemini</h2>
            
            {geminiStep === 1 && (
              <div>
                <p>To connect to Gemini, you'll need to create API credentials:</p>
                <ol style={{ lineHeight: '1.8' }}>
                  <li>Go to <a href="https://exchange.gemini.com/settings/api" target="_blank" rel="noopener noreferrer">Gemini API Settings</a></li>
                  <li>Create a new API key with "Trading" permissions</li>
                  <li>Copy your API Key and API Secret</li>
                  <li>Paste them below</li>
                </ol>
                <button
                  onClick={() => setGeminiStep(2)}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#4CAF50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    width: '100%',
                    fontSize: '16px'
                  }}
                >
                  I have my API credentials
                </button>
              </div>
            )}

            {geminiStep === 2 && (
              <div>
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                    API Key
                  </label>
                  <input
                    type="text"
                    value={geminiApiKey}
                    onChange={(e) => setGeminiApiKey(e.target.value)}
                    placeholder="Enter your Gemini API Key"
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '5px',
                      border: '1px solid #ddd',
                      fontSize: '14px'
                    }}
                  />
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                    API Secret
                  </label>
                  <input
                    type="password"
                    value={geminiApiSecret}
                    onChange={(e) => setGeminiApiSecret(e.target.value)}
                    placeholder="Enter your Gemini API Secret"
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '5px',
                      border: '1px solid #ddd',
                      fontSize: '14px'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => setGeminiStep(1)}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: '#9e9e9e',
                      color: 'white',
                      border: 'none',
                      borderRadius: '5px',
                      cursor: 'pointer',
                      fontSize: '16px'
                    }}
                  >
                    Back
                  </button>
                  <button
                    onClick={handleGeminiConnect}
                    disabled={isGeminiConnecting || !geminiApiKey || !geminiApiSecret}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: isGeminiConnecting || !geminiApiKey || !geminiApiSecret ? '#ccc' : '#4CAF50',
                      color: 'white',
                      border: 'none',
                      borderRadius: '5px',
                      cursor: isGeminiConnecting || !geminiApiKey || !geminiApiSecret ? 'not-allowed' : 'pointer',
                      fontSize: '16px',
                      flex: 1
                    }}
                  >
                    {isGeminiConnecting ? 'Connecting...' : 'Connect'}
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={() => {
                setShowGeminiModal(false);
                setGeminiStep(1);
              }}
              style={{
                marginTop: '15px',
                padding: '10px 20px',
                backgroundColor: '#f44336',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
                width: '100%',
                fontSize: '16px'
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Manual Trade Modal */}
      {showTradeModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '30px',
            borderRadius: '10px',
            maxWidth: '400px',
            width: '90%'
          }}>
            <h2 style={{ marginTop: 0 }}>Place Manual Order</h2>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                Symbol
              </label>
              <select
                value={tradeSymbol}
                onChange={(e) => setTradeSymbol(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '5px',
                  border: '1px solid #ddd',
                  fontSize: '14px'
                }}
              >
                <option value="btcusd">BTC/USD</option>
                <option value="ethusd">ETH/USD</option>
                <option value="solusd">SOL/USD</option>
              </select>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                Side
              </label>
              <select
                value={tradeSide}
                onChange={(e) => setTradeSide(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '5px',
                  border: '1px solid #ddd',
                  fontSize: '14px'
                }}
              >
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                Amount
              </label>
              <input
                type="number"
                value={tradeAmount}
                onChange={(e) => setTradeAmount(e.target.value)}
                placeholder="0.001"
                step="0.001"
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '5px',
                  border: '1px solid #ddd',
                  fontSize: '14px'
                }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                Price ($)
              </label>
              <input
                type="number"
                value={tradePrice}
                onChange={(e) => setTradePrice(e.target.value)}
                placeholder="Current market price"
                step="0.01"
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '5px',
                  border: '1px solid #ddd',
                  fontSize: '14px'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => {
                  setShowTradeModal(false);
                  setTradeAmount('');
                  setTradePrice('');
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#9e9e9e',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontSize: '16px'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handlePlaceOrder}
                disabled={isPlacingOrder || !tradeAmount || !tradePrice}
                style={{
                  padding: '10px 20px',
                  backgroundColor: isPlacingOrder || !tradeAmount || !tradePrice ? '#ccc' : '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: isPlacingOrder || !tradeAmount || !tradePrice ? 'not-allowed' : 'pointer',
                  fontSize: '16px',
                  flex: 1
                }}
              >
                {isPlacingOrder ? 'Placing...' : 'Place Order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;