// components/Dashboard/MarketTradesTable.jsx
import React from 'react';

const MarketTradesTable = ({ btcTrades, ethTrades, solTrades }) => {
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
      <h2 style={{ marginTop: 0, marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '24px' }}>💎</span> 
        Last 20 Market Trades (Gemini)
      </h2>
      
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
              <th style={{ padding: '12px', textAlign: 'left' }}>Time</th>
              <th style={{ padding: '12px', textAlign: 'left' }}>Model</th>
              <th style={{ padding: '12px', textAlign: 'left' }}>Symbol</th>
              <th style={{ padding: '12px', textAlign: 'center' }}>Type</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>Price</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              const combinedTrades = [
                ...btcTrades.map(t => ({ ...t, symbol: 'BTCUSD' })),
                ...ethTrades.map(t => ({ ...t, symbol: 'ETHUSD' })),
                ...solTrades.map(t => ({ ...t, symbol: 'SOLUSD' }))
              ];

              const sortedTrades = combinedTrades
                .sort((a, b) => b.timestampms - a.timestampms)
                .slice(0, 20);

              if (sortedTrades.length === 0) {
                return (
                  <tr>
                    <td colSpan="6" style={{ padding: '20px', textAlign: 'center', color: '#999', fontStyle: 'italic' }}>
                      Waiting for market data...
                    </td>
                  </tr>
                );
              }

              return sortedTrades.map((trade, index) => (
                <tr 
                  key={trade.tid || index} 
                  style={{ 
                    borderBottom: '1px solid #eee',
                    backgroundColor: index % 2 === 0 ? '#ffffff' : '#fafafa' 
                  }}
                >
                  <td style={{ padding: '10px', color: '#666' }}>
                    {new Date(trade.timestampms).toLocaleTimeString()}
                  </td>
                  <td style={{ padding: '10px', fontWeight: 'bold', color: '#333' }}>
                    Gemini Market
                  </td>
                  <td style={{ padding: '10px', fontWeight: '600' }}>
                    {trade.symbol}
                  </td>
                  <td style={{ padding: '10px', textAlign: 'center' }}>
                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        backgroundColor: trade.type === 'buy' ? '#e8f5e9' : '#ffebee',
                        color: trade.type === 'buy' ? '#2e7d32' : '#c62828',
                      }}
                    >
                      {trade.type.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 'bold' }}>
                    ${parseFloat(trade.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right', fontFamily: 'monospace' }}>
                    {parseFloat(trade.amount).toFixed(4)}
                  </td>
                </tr>
              ));
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MarketTradesTable;