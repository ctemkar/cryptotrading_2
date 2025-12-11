import React, { useState, useEffect } from 'react';
import LiveMultiChart from './LiveMultiChart';
import ModelsComparisonChart from './ModelsComparisonChart';
import useModels from '../hooks/useModels';
import useCryptoPrices from '../hooks/useCryptoPrices';
import socket from '../services/socket';

function Dashboard() {
  const [stopLoss, setStopLoss] = useState('');
  const [profitTarget, setProfitTarget] = useState('');
  const [startingValue, setStartingValue] = useState('10000');
  const [isTrading, setIsTrading] = useState(false);
  const [tradingStopped, setTradingStopped] = useState(false);
  const [stopReason, setStopReason] = useState('');
  const [selectedModels, setSelectedModels] = useState([]);
  const [initialValues, setInitialValues] = useState({});
  const [socketConnected, setSocketConnected] = useState(false);

  const { modelsLatest, modelsHistory } = useModels();
  const { latest: cryptoLatest, history: cryptoHistory } = useCryptoPrices();

  const availableModels = Object.values(modelsLatest);
  const startValue = parseFloat(startingValue) || 10000;
  const currentPrice = cryptoLatest.BTCUSDT || null;

  // Calculate normalized value for a model
  const getNormalizedValue = (modelId) => {
    const model = modelsLatest[modelId];
    if (!model || typeof model.accountValue !== 'number') {
      return startValue;
    }
    
    // If trading hasn't started, show the actual current value
    if (!initialValues[modelId]) {
      return Math.round(model.accountValue);
    }
    
    // If trading has started, normalize based on starting value
    const actualInitial = initialValues[modelId];
    const actualCurrent = model.accountValue;
    
    // Calculate percentage change from the model's actual initial value
    const percentChange = (actualCurrent - actualInitial) / actualInitial;
    
    // Apply that percentage change to our starting value
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

  // Monitor model values when trading is active
  useEffect(() => {
    if (!isTrading || selectedModels.length === 0) return;

    const stopLossValue = parseFloat(stopLoss);
    const profitTargetValue = parseFloat(profitTarget);

    selectedModels.forEach(modelId => {
      const model = modelsLatest[modelId];
      if (!model) return;

      const normalizedValue = getNormalizedValue(modelId);

      if (stopLossValue && normalizedValue <= stopLossValue) {
        setIsTrading(false);
        setTradingStopped(true);
        setStopReason(
          `Stop Loss Hit! ${model.name || modelId} value fell to $${normalizedValue}`
        );
      }

      if (profitTargetValue && normalizedValue >= profitTargetValue) {
        setIsTrading(false);
        setTradingStopped(true);
        setStopReason(
          `Profit Target Hit! ${model.name || modelId} value reached $${normalizedValue}`
        );
      }
    });
  }, [modelsLatest, isTrading, stopLoss, profitTarget, selectedModels, initialValues, startValue]);

  // Numeric-only handlers
  const handleStartingValueChange = (e) => {
    const value = e.target.value;
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setStartingValue(value);
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

  // Selection handler
  const handleModelSelection = (modelId) => {
    if (isTrading) return;
    console.log('Card clicked for model:', modelId);
    setSelectedModels(prev =>
      prev.includes(modelId) ? prev.filter(id => id !== modelId) : [...prev, modelId]
    );
  };

  // Trading handlers
  const handleStartTrading = () => {
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

    // Store the actual current values as initial values for each model
    const initVals = {};
    selectedModels.forEach(id => {
      const model = modelsLatest[id];
      // Store the actual accountValue at the moment trading starts
      initVals[id] = model?.accountValue || sv;
    });
    setInitialValues(initVals);

    setIsTrading(true);
    setTradingStopped(false);
    setStopReason('');
  };

  const handleStopTrading = () => {
    setIsTrading(false);
    setTradingStopped(true);
    setStopReason('Trading stopped manually');
  };

  const handleReset = () => {
    setIsTrading(false);
    setTradingStopped(false);
    setStopReason('');
    setStopLoss('');
    setProfitTarget('');
    setStartingValue('10000');
    setSelectedModels([]);
    setInitialValues({});
  };

  return (
    <div className="dashboard">
      <h1>Crypto Trading Dashboard</h1>

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
        </div>
      </div>

      {/* MODEL SELECTION (clickable cards) */}
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
              
              // Show live value (normalized if trading, actual if not)
              const currentValue = getNormalizedValue(modelId);

              // Calculate P&L if trading
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
                    cursor: isTrading ? 'not-allowed' : 'pointer',
                    opacity: isTrading ? 0.6 : 1,
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
                  {/* Top row: checkmark + name */}
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

                  {/* Current live value */}
                  <div
                    style={{
                      fontSize: '20px',
                      fontWeight: 'bold',
                      color
                    }}
                  >
                    ${currentValue.toLocaleString()}
                  </div>

                  {/* P&L when trading */}
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

                  {/* Show "Live" indicator when not trading */}
                  {!isTrading && (
                    <div
                      style={{
                        fontSize: '11px',
                        color: '#4CAF50',
                        fontWeight: 'bold'
                      }}
                    >
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
              placeholder="e.g., 10000"
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
              placeholder="e.g., 9500"
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
              placeholder="e.g., 10500"
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

          {tradingStopped && (
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
              ? '🟢 Trading Active'
              : tradingStopped
              ? '🔴 Trading Stopped'
              : '🟡 Ready to Trade'}
          </div>

          {isTrading && selectedModels.length > 0 && (
            <div
              style={{
                marginTop: '10px',
                fontSize: '14px',
                padding: '12px',
                backgroundColor: '#e3f2fd',
                borderRadius: '4px'
              }}
            >
              <strong>Monitoring Models (All started at ${startValue}):</strong>
              <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {selectedModels.map(modelId => {
                  const model = modelsLatest[modelId];
                  if (!model) return null;

                  const normalizedValue = getNormalizedValue(modelId);
                  const pnl = normalizedValue - startValue;
                  const pnlPercent = ((pnl / startValue) * 100).toFixed(2);

                  return (
                    <div
                      key={modelId}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: 'white',
                        borderRadius: '4px',
                        borderLeft: `4px solid ${model.color || '#1976d2'}`,
                        minWidth: '150px'
                      }}
                    >
                      <div style={{ fontWeight: 'bold', fontSize: '13px' }}>
                        {model.name || modelId}
                      </div>
                      <div style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '4px' }}>
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
                padding: '10px',
                backgroundColor: '#ffebee',
                borderRadius: '4px',
                color: '#c62828',
                fontWeight: 'bold'
              }}
            >
              {stopReason}
            </div>
          )}
        </div>

        {/* Models Overview (read-only display) */}
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
            <h3 style={{ marginTop: 0, marginBottom: '12px' }}>All Models Overview (Live Values)</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {availableModels.map((model, idx) => {
                const modelId = model.id || model.name || `model_${idx}`;
                const currentValue = getNormalizedValue(modelId);
                
                return (
                  <div
                    key={modelId}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '6px',
                      backgroundColor: 'white',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                      minWidth: '160px',
                      borderLeft: `4px solid ${model.color || '#1976d2'}`
                    }}
                  >
                    <div style={{ fontWeight: 'bold', marginBottom: '4px', fontSize: '14px' }}>
                      {model.name || modelId}
                    </div>
                    <div style={{ fontSize: '16px' }}>
                      Value: <strong>${currentValue.toLocaleString()}</strong>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

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
    </div>
  );
}

export default Dashboard;