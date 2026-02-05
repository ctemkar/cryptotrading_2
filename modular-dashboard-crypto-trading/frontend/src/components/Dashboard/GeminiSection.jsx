// components/Dashboard/GeminiSection.jsx
import React from 'react';

const GeminiSection = ({ 
  isGeminiConnected, 
  geminiBalances, 
  refreshGeminiBalances, 
  handleOpenGeminiModal, 
  handleGeminiDisconnect 
}) => {
  return (
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
                  onClick={refreshGeminiBalances}
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
  );
};

export default GeminiSection;