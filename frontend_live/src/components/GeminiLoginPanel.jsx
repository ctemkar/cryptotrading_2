import React, { useState } from 'react';
import GeminiLoginModal from './GeminiLoginModal';

function GeminiLoginPanel({ userId, onLogin }) {
  const [showModal, setShowModal] = useState(false);
  const [balances, setBalances] = useState(null);

  const handleLoginSuccess = (data) => {
    if (data?.balances) {
      setBalances(data.balances);
      console.log('[GeminiLoginPanel] balances received:', data.balances);
    }
    setShowModal(false);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '20px',
        padding: '24px',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        borderRadius: '16px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
        border: '1px solid #334155',
        marginBottom: '25px',
        maxWidth: '920px',
        color: '#ffffff'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '18px', minWidth: '280px' }}>
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '12px',
            background: 'rgba(56, 189, 248, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
            border: '1px solid rgba(56, 189, 248, 0.2)'
          }}
        >
          💎
        </div>

        <div>
          <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: '#38bdf8', letterSpacing: '0.5px' }}>
            GEMINI LIVE TRADING
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#94a3b8' }}>
            Secure API Connection Active
          </p>

          <button
            onClick={() => setShowModal(true)}
            style={{
              marginTop: '14px',
              padding: '10px 18px',
              background: '#38bdf8',
              color: '#0f172a',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '700',
              fontSize: '14px',
              boxShadow: '0 4px 12px rgba(56, 189, 248, 0.3)'
            }}
          >
            Update API Details
          </button>
        </div>
      </div>

      {/* Dynamic Balances Section */}
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(10px)',
          padding: '18px',
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          minWidth: '320px',
          flex: '1'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
          <h4 style={{ margin: 0, fontSize: '12px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Account Portfolio
          </h4>
          <span style={{ fontSize: '10px', color: '#22c55e', background: 'rgba(34, 197, 94, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>LIVE</span>
        </div>

        {balances ? (
          <div>
            {/* Header for the list */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', fontSize: '11px', color: '#64748b', fontWeight: '700', marginBottom: '8px', paddingBottom: '4px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div>ASSET</div>
              <div style={{ textAlign: 'right' }}>TOTAL</div>
              <div style={{ textAlign: 'right' }}>AVAILABLE</div>
            </div>

            {/* Main Assets */}
            {[
              { sym: 'BTC', val: balances.btc, avail: balances.btcAvailable },
              { sym: 'ETH', val: balances.eth, avail: balances.ethAvailable },
              { sym: 'USDC', val: balances.usdc, avail: balances.usdcAvailable },
              { sym: 'SOL', val: balances.sol, avail: balances.solAvailable }
            ].map((item) => (
              <div key={item.sym} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', fontSize: '14px', padding: '4px 0' }}>
                <div style={{ color: '#38bdf8', fontWeight: '700' }}>{item.sym}</div>
                <div style={{ textAlign: 'right', color: '#f8fafc' }}>{item.val ?? '0.00'}</div>
                <div style={{ textAlign: 'right', color: '#94a3b8' }}>{item.avail ?? item.val ?? '0.00'}</div>
              </div>
            ))}

            {/* Other Assets */}
            {Array.isArray(balances.other) && balances.other.length > 0 && (
              <div style={{ marginTop: '10px' }}>
                {balances.other.map((item, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', fontSize: '13px', padding: '4px 0', opacity: 0.8 }}>
                    <div style={{ color: '#94a3b8' }}>{item.currency}</div>
                    <div style={{ textAlign: 'right' }}>{item.amount}</div>
                    <div style={{ textAlign: 'right' }}>{item.available || item.amount}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Total Value */}
            <div style={{
              marginTop: '15px',
              paddingTop: '12px',
              borderTop: '2px solid rgba(56, 189, 248, 0.3)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600' }}>NET ACCOUNT VALUE</div>
                <div style={{ fontSize: '10px', color: '#64748b' }}>Includes all held assets</div>
              </div>
              <span style={{ fontSize: '22px', fontWeight: '900', color: '#22c55e', textShadow: '0 0 10px rgba(34, 197, 94, 0.2)' }}>
                ${Number(balances.totalUsd ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: '14px', color: '#64748b', textAlign: 'center', padding: '20px 0' }}>
            Connect Gemini to view portfolio
          </div>
        )}
      </div>

      {/* Render modal (was missing in your snippet) */}
      {showModal && (
        <GeminiLoginModal
          userId={userId}
          onClose={() => setShowModal(false)}
          onLogin={onLogin}
          onLoginSuccess={handleLoginSuccess}
        />
      )}
    </div>
  );
}

export default GeminiLoginPanel;