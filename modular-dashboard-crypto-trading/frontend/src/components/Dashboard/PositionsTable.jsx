// components/Dashboard/PositionsTable.jsx
import React from 'react';

const PositionsTable = ({ loadingPositions, openPositions }) => {
  return (
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
  );
};

export default PositionsTable;