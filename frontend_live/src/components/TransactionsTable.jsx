// components/Dashboard/TransactionsTable.jsx
import React from 'react';

const TransactionsTable = ({ loadingTrades, trades, formatTimestamp, currentPrices }) => {
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
      <h2 style={{ marginTop: 0, marginBottom: '15px' }}>
        <span style={{ color: '#4F8EF7', fontSize: '1.2em' }}>💎</span>
          Last 20 Market Trades (Gemini)
      </h2>

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
                <th style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold' }}>Live P&L</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((trade, index) => {
                const price = parseFloat(trade.crypto_price || trade.price || 0);
                const qty = parseFloat(trade.quantity || trade.amount || 0);
                const total = parseFloat(trade.total_value || (price * qty) || 0);
                const action = (trade.action || trade.side || 'BUY').toUpperCase();
                const symbol = (trade.crypto_symbol || trade.symbol || '???').toUpperCase();
                const model = trade.model_name || trade.model || 'Manual';
                const time = trade.timestamp || trade.created_at;

                // Get current live price for this symbol
                const currentPrice = currentPrices ? parseFloat(currentPrices[symbol]) : null;

                // P&L logic
                let displayPnl = null;
                let displayPnlPct = null;

                if (trade.pnl !== undefined && trade.pnl !== null) {
                  // Closed trade (SELL) — use stored P&L from DB
                  displayPnl = parseFloat(trade.pnl);
                  displayPnlPct = parseFloat(trade.pnl_percent);
                } else if (currentPrice && price > 0 && qty > 0) {
                  // Open trade (BUY) — calculate unrealized P&L using live price
                  if (action === 'BUY') {
                    displayPnl = (currentPrice - price) * qty;
                    displayPnlPct = ((currentPrice - price) / price) * 100;
                  } else if (action === 'SELL') {
                    displayPnl = (price - currentPrice) * qty;
                    displayPnlPct = ((price - currentPrice) / price) * 100;
                  }
                }

                const isProfit = displayPnl !== null && displayPnl >= 0;

                return (
                  <tr key={trade.id || index} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '12px', color: '#666' }}>
                      {formatTimestamp ? formatTimestamp(time) : new Date(time).toLocaleString()}
                    </td>
                    <td style={{ padding: '12px', fontWeight: 'bold' }}>{model}</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <span style={{
                        padding: '4px 12px',
                        borderRadius: '4px',
                        fontWeight: 'bold',
                        fontSize: '12px',
                        backgroundColor: action === 'BUY' ? '#e8f5e9' : '#ffebee',
                        color: action === 'BUY' ? '#2e7d32' : '#c62828'
                      }}>
                        {action}
                      </span>
                    </td>
                    <td style={{ padding: '12px' }}>{symbol}</td>
                    <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace' }}>
                      ${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace' }}>
                      {qty.toFixed(4)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', fontFamily: 'monospace' }}>
                      ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>

                    {/* P&L Cell */}
                    <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace' }}>
                      {displayPnl !== null ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px' }}>
                          <span style={{
                            fontWeight: 'bold',
                            color: isProfit ? '#2e7d32' : '#c62828'
                          }}>
                            {isProfit ? '▲' : '▼'} {isProfit ? '+' : '-'}${Math.abs(displayPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 'bold',
                            color: isProfit ? '#388e3c' : '#d32f2f',
                            backgroundColor: isProfit ? '#e8f5e9' : '#ffebee',
                            padding: '1px 5px',
                            borderRadius: '3px'
                          }}>
                            {isProfit ? '+' : ''}{displayPnlPct.toFixed(2)}%
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: '#ccc', fontSize: '16px' }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default TransactionsTable;