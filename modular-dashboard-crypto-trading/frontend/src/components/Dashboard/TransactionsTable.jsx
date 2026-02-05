// components/Dashboard/TransactionsTable.jsx
import React from 'react';

const TransactionsTable = ({ loadingTrades, trades, formatTimestamp }) => {
  return (
    <div
      style={{
        background: '#ffffff',
        padding: '20px',
        borderRadius: '8px',
        marginTop: '20px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}
    >
      <h2 style={{ marginTop: 0, marginBottom: '15px' }}>📊 Last 20 Transactions</h2>

      {loadingTrades ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          Loading transactions...
        </div>
      ) : trades.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666', fontStyle: 'italic' }}>
          No transactions yet. Trades will appear here automatically.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '14px'
            }}
          >
            <thead>
              <tr style={{ backgroundColor: '#f5f5f5', borderBottom: '2px solid #ddd' }}>
                <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Time</th>
                <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Model</th>
                <th style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold' }}>Action</th>
                <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Crypto</th>
                <th style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold' }}>Price</th>
                <th style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold' }}>Quantity</th>
                <th style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold' }}>Total Value</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((trade, index) => (
                <tr
                  key={trade.id || index}
                  style={{
                    borderBottom: '1px solid #eee',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f9f9f9'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <td style={{ padding: '12px', color: '#666' }}>
                    {formatTimestamp(trade.timestamp)}
                  </td>
                  <td style={{ padding: '12px', fontWeight: 'bold' }}>
                    {trade.model_name}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <span
                      style={{
                        padding: '4px 12px',
                        borderRadius: '4px',
                        fontWeight: 'bold',
                        fontSize: '12px',
                        backgroundColor: trade.action === 'BUY' ? '#e8f5e9' : '#ffebee',
                        color: trade.action === 'BUY' ? '#2e7d32' : '#c62828'
                      }}
                    >
                      {trade.action}
                    </span>
                  </td>
                  <td style={{ padding: '12px' }}>{trade.crypto_symbol}</td>
                  <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace' }}>
                    ${parseFloat(trade.crypto_price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace' }}>
                    {parseFloat(trade.quantity).toFixed(4)}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', fontFamily: 'monospace' }}>
                    ${parseFloat(trade.total_value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

export default TransactionsTable;