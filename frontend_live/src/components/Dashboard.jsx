/*import React, { useState, useEffect } from 'react';
import LiveMultiChart from './LiveMultiChart';
import ModelsComparisonChart from './ModelsComparisonChart';
import useModels from './useModels';
import useCryptoPrices from './useCryptoPrices';*/

import React, { useState, useEffect } from 'react';
import LiveMultiChart from './LiveMultiChart';
import ModelsComparisonChart from './ModelsComparisonChart';
import useModels from '../hooks/useModels';
import useCryptoPrices from '../hooks/useCryptoPrices';

function Dashboard() {
  const [stopLoss, setStopLoss] = useState('');
  const [profitTarget, setProfitTarget] = useState('');
  const [isTrading, setIsTrading] = useState(false);
  const [tradingStopped, setTradingStopped] = useState(false);
  const [stopReason, setStopReason] = useState('');
  const [initialPrice, setInitialPrice] = useState(null);

  const models = useModels();
  const cryptoPrices = useCryptoPrices();

  // Monitor prices when trading is active
  useEffect(() => {
    if (!isTrading || !initialPrice || cryptoPrices.length === 0) return;

    const latestPrice = cryptoPrices[cryptoPrices.length - 1];
    const currentPrice = latestPrice.BTC; // Adjust based on which crypto you're monitoring

    const stopLossValue = parseFloat(stopLoss);
    const profitTargetValue = parseFloat(profitTarget);

    // Check if stop loss is hit
    if (stopLossValue && currentPrice <= stopLossValue) {
      setIsTrading(false);
      setTradingStopped(true);
      setStopReason(`Stop Loss Hit! Price fell to $${currentPrice.toFixed(2)}`);
    }

    // Check if profit target is hit
    if (profitTargetValue && currentPrice >= profitTargetValue) {
      setIsTrading(false);
      setTradingStopped(true);
      setStopReason(`Profit Target Hit! Price reached $${currentPrice.toFixed(2)}`);
    }
  }, [cryptoPrices, isTrading, stopLoss, profitTarget, initialPrice]);

  const handleStartTrading = () => {
    if (!stopLoss && !profitTarget) {
      alert('Please enter at least one value (Stop Loss or Profit Target)');
      return;
    }

    const stopLossValue = parseFloat(stopLoss);
    const profitTargetValue = parseFloat(profitTarget);

    if (stopLoss && isNaN(stopLossValue)) {
      alert('Please enter a valid Stop Loss value');
      return;
    }

    if (profitTarget && isNaN(profitTargetValue)) {
      alert('Please enter a valid Profit Target value');
      return;
    }

    // Get current price as initial price
    if (cryptoPrices.length > 0) {
      const latestPrice = cryptoPrices[cryptoPrices.length - 1];
      setInitialPrice(latestPrice.BTC); // Adjust based on which crypto you're monitoring
    }

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
    setInitialPrice(null);
  };

  const currentPrice = cryptoPrices.length > 0 
    ? cryptoPrices[cryptoPrices.length - 1].BTC 
    : null;

  return (
    <div className="dashboard">
      <h1>Crypto Trading Dashboard</h1>
      
      {/* Trading Controls */}
      <div className="trading-controls" style={{
        background: '#f5f5f5',
        padding: '20px',
        borderRadius: '8px',
        marginBottom: '20px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <h2>Trading Controls</h2>
        
        <div style={{ display: 'flex', gap: '20px', marginBottom: '15px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1', minWidth: '200px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Stop Loss ($):
            </label>
            <input
              type="number"
              value={stopLoss}
              onChange={(e) => setStopLoss(e.target.value)}
              disabled={isTrading}
              placeholder="Enter stop loss price"
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '16px',
                borderRadius: '4px',
                border: '1px solid #ccc'
              }}
            />
          </div>
          
          <div style={{ flex: '1', minWidth: '200px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Profit Target ($):
            </label>
            <input
              type="number"
              value={profitTarget}
              onChange={(e) => setProfitTarget(e.target.value)}
              disabled={isTrading}
              placeholder="Enter profit target price"
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '16px',
                borderRadius: '4px',
                border: '1px solid #ccc'
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
          <button
            onClick={handleStartTrading}
            disabled={isTrading}
            style={{
              padding: '12px 24px',
              fontSize: '16px',
              fontWeight: 'bold',
              backgroundColor: isTrading ? '#ccc' : '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isTrading ? 'not-allowed' : 'pointer'
            }}
          >
            Start Trading
          </button>
          
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

        {/* Status Display */}
        <div style={{ marginTop: '15px' }}>
          <div style={{ 
            padding: '10px', 
            borderRadius: '4px',
            backgroundColor: isTrading ? '#e8f5e9' : tradingStopped ? '#ffebee' : '#fff3e0',
            border: `2px solid ${isTrading ? '#4CAF50' : tradingStopped ? '#f44336' : '#ff9800'}`
          }}>
            <strong>Status: </strong>
            {isTrading ? '🟢 Trading Active' : tradingStopped ? '🔴 Trading Stopped' : '🟡 Ready to Trade'}
          </div>
          
          {currentPrice && (
            <div style={{ marginTop: '10px', fontSize: '18px' }}>
              <strong>Current BTC Price: </strong>${currentPrice.toFixed(2)}
            </div>
          )}
          
          {stopReason && (
            <div style={{ 
              marginTop: '10px', 
              padding: '10px', 
              backgroundColor: '#ffebee',
              borderRadius: '4px',
              color: '#c62828',
              fontWeight: 'bold'
            }}>
              {stopReason}
            </div>
          )}
        </div>
      </div>

      {/* Charts */}
      <div className="charts-container">
        <LiveMultiChart data={cryptoPrices} />
        <ModelsComparisonChart data={models} />
      </div>
    </div>
  );
}

export default Dashboard;