// components/Dashboard/index.jsx
import React, { useState, useEffect, useRef } from 'react';
import LiveMultiChart from '../LiveMultiChart';
import ModelsComparisonChart from '../ModelsComparisonChart';
import useModels from '../../hooks/useModels';
import useCryptoPrices from '../../hooks/useCryptoPrices';
import { useGemini } from '../../hooks/useGemini';
import socket from '../../services/socket';
import axios from 'axios';
import AuthSection from './AuthSection';
import GeminiSection from './GeminiSection';
import TradingControls from './TradingControls';
import SystemLogs from './SystemLogs';
import PositionsTable from './PositionsTable';
import MarketTradesTable from './MarketTradesTable';
import TransactionsTable from './TransactionsTable';

const DEFAULT_SYMBOLS = ['btcusd', 'ethusd', 'solusd'];

function Dashboard() {
  // State declarations (all your original ones)
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
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [tradeSymbol, setTradeSymbol] = useState('btcusd');
  const [tradeSide, setTradeSide] = useState('buy');
  const [tradeAmount, setTradeAmount] = useState('');
  const [tradePrice, setTradePrice] = useState('');
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [showGeminiModal, setShowGeminiModal] = useState(false);
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

  // Hooks
  const { modelsLatest, modelsHistory } = useModels();
  const { latest: cryptoLatest, latest: cryptoPrices, history: cryptoHistory } = useCryptoPrices();
  const availableModels = Object.values(modelsLatest);
  const startValue = (isTrading && appState?.tradingSession?.startValue != null)
    ? Number(appState.tradingSession.startValue)
    : (parseFloat(startingValue) || 100);
  const safeStartValue = Number.isFinite(startValue) && startValue > 0 ? startValue : 100;
  const currentPrice = cryptoLatest.BTCUSDT || null;
  const stopLossRef = useRef(parseFloat(stopLoss) || 2.0);
  const profitTargetRef = useRef(parseFloat(profitTarget) || 5.0);
  const isSyncingFromServer = useRef(false);

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

  // --- handleGoogleCallback implementation ---
  const handleGoogleCallback = async (token) => {
    setIsLoadingAuth(true);
    try {
      const response = await axios.post('/api/auth/google', { token });
      if (response.data.success) {
        setUserInfo(response.data.user);
        setIsAuthenticated(true);
      } else {
        console.error('Google auth failed:', response.data.error);
        setIsAuthenticated(false);
        setUserInfo(null);
      }
    } catch (error) {
      console.error('Google auth error:', error);
      setIsAuthenticated(false);
      setUserInfo(null);
    } finally {
      setIsLoadingAuth(false);
    }
  };

  // --- handleGeminiDisconnect implementation ---
  const handleGeminiDisconnect = () => {
    if (window.confirm("Disconnect from Gemini?")) {
      disconnectGemini();
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
      return cryptoLatest.BTCUSDT;
    } else if (sym === 'ethusd') {
      return cryptoLatest.ETHUSDT;
    } else if (sym === 'solusd') {
      return cryptoLatest.SOLUSDT;
    }
    return null;
  };

  // --- getNormalizedValue helper ---
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

  // --- handleModelSelection helper ---
  const handleModelSelection = (modelId) => {
    console.log('Card clicked for model:', modelId);

    setSelectedModels(prevSelected => {
      const isAlreadySelected = prevSelected.includes(modelId);

      if (isAlreadySelected) {
        return prevSelected.filter(id => id !== modelId);
      } else {
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
              [modelId]: model.accountValue
            };
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

        return [...prevSelected, modelId];
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
      }
    }
  };

  // --- handleStopLossChange ---
  const handleStopLossChange = (e) => {
    const value = e.target.value;
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setStopLoss(value);
    }
  };

  // --- handleProfitTargetChange ---
  const handleProfitTargetChange = (e) => {
    const value = e.target.value;
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setProfitTarget(value);
    }
  };

  // --- handleUpdateSpeedChange ---
  const handleUpdateSpeedChange = (e) => {
    setUpdateSpeed(e.target.value);
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
    console.log('✅ User logged out');
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
      addLog('🔗 Gemini is connected. Initializing model strategies...', 'info');

      for (const modelId of selectedModels) {
        const modelObj = availableModels.find(m => m.id === modelId);

        if (modelObj) {
          console.log(`🎯 Triggering trade for: ${modelObj.name} (ID: ${modelObj.id})`);
          addLog(`🤖 Activating ${modelObj.name}...`, 'info');

          try {
            // Assuming you have a function handleStartGeminiTrading
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

  // --- handleStopTrading ---
  const handleStopTrading = async () => {
    console.log("🛑 Stopping trade... keeping models:", selectedModels);
    
    const totalProfit = selectedModels.reduce((sum, modelId) => {
      const currentValue = getNormalizedValue(modelId);
      return sum + (currentValue - startValue);
    }, 0);

    setIsTrading(false);
    setTradingStopped(true);
    setFinalProfitLoss(totalProfit);
    setStopReason('Trading stopped manually');
    
    console.log("✅ Trading stopped. Models still selected:", selectedModels.length);
    
    if (isGeminiConnected) {
      // Assuming you have a function handleCloseAllGeminiTrading
      await handleCloseAllGeminiTrading();
    }
  };

  // --- handleReset ---
  const handleReset = async () => {
    if (isGeminiConnected && openPositions.length > 0) {
      const confirmed = window.confirm(
        `Reset will close all ${openPositions.length} open Gemini positions.\n\nContinue?`
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
      setUserInfo(JSON.parse(savedUser));
      setIsAuthenticated(true);
    }
    setIsLoadingAuth(false);
  }, []);

  // --- useEffect for socket connection ---
  useEffect(() => {
    socket.on('connect', () => setSocketConnected(true));
    socket.on('disconnect', () => setSocketConnected(false));
    return () => {
      socket.off('connect');
      socket.off('disconnect');
    };
  }, []);

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

      <GeminiSection 
        isGeminiConnected={isGeminiConnected}
        geminiBalances={geminiBalances}
        refreshGeminiBalances={refreshGeminiBalances}
        handleOpenGeminiModal={() => setShowGeminiModal(true)}
        handleGeminiDisconnect={handleGeminiDisconnect}
      />

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
        getNormalizedValue={getNormalizedValue}
        handleModelSelection={handleModelSelection}
        availableModels={availableModels}
        nonSelectedModels={nonSelectedModels}
        setSelectedModels={setSelectedModels}
      />

      <SystemLogs tradingLogs={tradingLogs} />

      {isGeminiConnected && (
        <PositionsTable 
          loadingPositions={loadingPositions}
          openPositions={openPositions}
        />
      )}

      {isGeminiConnected && (
        <MarketTradesTable 
          btcTrades={btcTrades}
          ethTrades={ethTrades}
          solTrades={solTrades}
        />
      )}

      <div className="charts-container">
        <LiveMultiChart history={cryptoHistory} symbols={['BTCUSDT', 'ETHUSDT', 'SOLUSDT']} />
        <ModelsComparisonChart
          modelsHistory={modelsHistory}
          selectedModels={selectedModels}
          startingValue={startValue}
          initialValues={initialValues}
        />
      </div>

      <TransactionsTable 
        loadingTrades={loadingTrades}
        trades={trades}
        formatTimestamp={formatTimestamp}
      />
    </div>
  );
}

export default Dashboard;