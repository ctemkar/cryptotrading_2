// components/Dashboard/TradingControls.jsx
import React from 'react';

const TradingControls = ({
  startingValue,
  stopLoss,
  profitTarget,
  isTrading,
  selectedModels,
  handleStartingValueChange,
  handleStopLossChange,
  handleProfitTargetChange,
  handleStartTrading,
  handleStopTrading,
  handleReset,
  isResetting,
  startValue,
  trades,
  stopReason,
  finalProfitLoss,
  showMonitoringPanel,
  modelsLatest,
  getNormalizedValue,
  handleModelSelection,
  availableModels,
  nonSelectedModels,
  setSelectedModels,
  nonSelectedModelsMetrics,  // ✅ ADD THIS
}) => {
  return (
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
              disabled={false}
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
              disabled={false}
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

        {(isTrading || stopReason) && (
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

      <div style={{ marginTop: '15px' }}>
        <div
          style={{
            padding: '10px',
            borderRadius: '4px',
            backgroundColor: isTrading
              ? '#e8f5e9'
              : stopReason
              ? '#ffebee'
              : '#fff3e0',
            border: `2px solid ${
              isTrading ? '#4CAF50' : stopReason ? '#f44336' : '#ff9800'
            }`
          }}
        >
          <strong>Status: </strong>
          {isTrading
            ? '🟢 Trading Active (Persisted across refresh)'
            : stopReason
            ? '🔴 Trading Stopped'
            : '🟡 Ready to Trade'}
        </div>

        {showMonitoringPanel && (
          <>
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
                  if (!model) {
                    console.warn(`⚠️ Model ${modelId} not found in modelsLatest`);
                    return null;
                  }

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
          </>
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
          <div style={{
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '12px',
  flexWrap: 'wrap',
  gap: '10px'
}}>
  <h3 style={{ margin: 0 }}>
    Other Models Overview
    <span style={{ fontSize: '14px', fontWeight: 'normal', color: '#666', marginLeft: '10px' }}>
      ({nonSelectedModelsMetrics?.count ?? 0} not selected)
    </span>
  </h3>

  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>

    {/* ✅ Non-selected combined P/L badge */}
    {isTrading && (nonSelectedModelsMetrics?.count ?? 0) > 0 && (
      <div style={{
        padding: '8px 16px',
        borderRadius: '6px',
        backgroundColor: '#ffffff',
        border: `2px solid ${(nonSelectedModelsMetrics?.totalPL ?? 0) >= 0 ? '#4caf50' : '#f44336'}`,
        boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
        fontWeight: 'bold',
        fontSize: '16px',
        color: (nonSelectedModelsMetrics?.totalPL ?? 0) >= 0 ? '#2e7d32' : '#c62828'
      }}>
        <div style={{ fontSize: '11px', color: '#666', marginBottom: '2px', fontWeight: 'normal' }}>
          Non-Selected Combined P/L
        </div>
        {(nonSelectedModelsMetrics?.totalPL ?? 0) >= 0 ? '+' : ''}
        ${Math.abs(Math.round(nonSelectedModelsMetrics?.totalPL ?? 0)).toLocaleString()} ({nonSelectedModelsMetrics?.plPercentage ?? '0.00'}%)
      </div>
    )}

    {/* Existing Select All / Deselect All button */}
    <button
      onClick={() => {
        if (selectedModels.length === availableModels.length) {
          setSelectedModels([]);
        } else {
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
      onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#e3f2fd'; }}
      onMouseOut={(e) => { e.currentTarget.style.backgroundColor = '#ffffff'; }}
    >
      {selectedModels.length === availableModels.length ? 'Deselect All' : 'Select All'}
    </button>
  </div>
</div>

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
                if (isTrading && modelsLatest[modelId] && modelsLatest[modelId].accountValue != null) {
                  pnl = currentValue - startValue;
                  pnlPercent = ((pnl / startValue) * 100).toFixed(2);
                }

                return (
                  <div
                    key={modelId}
                    onClick={() => {
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

                    <div style={{ fontSize: '20px', fontWeight: 'bold', color }}>
                      ${currentValue.toLocaleString()}
                    </div>

                    {isTrading && modelsLatest[modelId] && modelsLatest[modelId].accountValue != null && (
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

                    {!isTrading && (
                      <div style={{ fontSize: '11px', color: '#4CAF50', fontWeight: 'bold' }}>
                        🔴 LIVE
                      </div>
                    )}

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
  );
};

export default TradingControls;