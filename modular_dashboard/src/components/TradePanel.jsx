import React from 'react';

function TradePanel() {
  return (
    <div className="trade-panel">
      <h3>Trade</h3>
      <input type="number" placeholder="Amount" />
      <button>Buy BTC</button>
      <button>Sell BTC</button>
    </div>
  );
}

export default TradePanel;