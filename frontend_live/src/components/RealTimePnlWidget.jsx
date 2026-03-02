import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

export default function RealTimePnlWidget({ userId, isTrading, onStopLoss, onTakeProfit }) {
  const [pnl, setPnl] = useState(null);
  const [loading, setLoading] = useState(true);
  const triggeredRef = useRef(false);

  useEffect(() => {
    if (!userId || !isTrading) return;

    // Reset trigger on fresh session
    triggeredRef.current = false;

    const fetchPnl = async () => {
      try {
        const resp = await axios.get('/api/gemini/session-pnl', { params: { userId } });
        if (resp.data?.success && resp.data.pnl) {
          const data = resp.data.pnl;
          setPnl(data);

          // ✅ Auto-stop if thresholds hit (only trigger once per session)
          if (!triggeredRef.current) {
            if (data.shouldStopLoss) {
              triggeredRef.current = true;
              console.warn('🛑 Stop loss triggered!', data);
              if (typeof onStopLoss === 'function') onStopLoss(data);
            } else if (data.shouldTakeProfit) {
              triggeredRef.current = true;
              console.log('🎯 Profit target hit!', data);
              if (typeof onTakeProfit === 'function') onTakeProfit(data);
            }
          }
        }
      } catch (e) {
        console.error('P/L fetch failed:', e.message);
      } finally {
        setLoading(false);
      }
    };

    fetchPnl();
    const interval = setInterval(fetchPnl, 15000);
    return () => clearInterval(interval);
  }, [userId, isTrading]);

  if (loading || !pnl) return null;

  const isProfit = (pnl.totalPnl ?? 0) >= 0;
  const pct = pnl.startBalanceUsd > 0
    ? ((pnl.totalPnl / pnl.startBalanceUsd) * 100).toFixed(2)
    : '0.00';

  return (
    <div style={{
      background: isProfit ? '#e8f5e9' : '#ffebee',
      border: `2px solid ${isProfit ? '#4CAF50' : '#f44336'}`,
      borderRadius: '8px',
      padding: '15px 20px',
      marginBottom: '20px',
      display: 'flex',
      gap: '30px',
      alignItems: 'center',
      flexWrap: 'wrap'
    }}>
      <div>
        <div style={{ fontSize: '12px', color: '#666' }}>Session P/L (matches Gemini)</div>
        <div style={{ fontSize: '24px', fontWeight: 'bold', color: isProfit ? '#2e7d32' : '#c62828' }}>
          {isProfit ? '+' : ''}${pnl.totalPnl?.toFixed(2)} ({isProfit ? '+' : ''}{pct}%)
        </div>
      </div>
      <div>
        <div style={{ fontSize: '12px', color: '#666' }}>Start Balance</div>
        <div style={{ fontSize: '16px', fontWeight: 'bold' }}>${pnl.startBalanceUsd?.toFixed(2)}</div>
      </div>
      <div>
        <div style={{ fontSize: '12px', color: '#666' }}>Current Balance</div>
        <div style={{ fontSize: '16px', fontWeight: 'bold' }}>${pnl.currentBalanceUsd?.toFixed(2)}</div>
      </div>
      <div>
        <div style={{ fontSize: '12px', color: '#666' }}>Realized P/L</div>
        <div style={{ fontSize: '16px', fontWeight: 'bold', color: pnl.realizedPnl >= 0 ? '#2e7d32' : '#c62828' }}>
          ${pnl.realizedPnl?.toFixed(2)}
        </div>
      </div>
      {pnl.stopLoss && (
        <div>
          <div style={{ fontSize: '12px', color: '#666' }}>Stop Loss</div>
          <div style={{ fontSize: '14px', color: '#f44336', fontWeight: 'bold' }}>${pnl.stopLoss}</div>
        </div>
      )}
      {pnl.profitTarget && (
        <div>
          <div style={{ fontSize: '12px', color: '#666' }}>Profit Target</div>
          <div style={{ fontSize: '14px', color: '#2e7d32', fontWeight: 'bold' }}>${pnl.profitTarget}</div>
        </div>
      )}
    </div>
  );
}