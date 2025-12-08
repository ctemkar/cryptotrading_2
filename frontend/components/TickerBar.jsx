// TickerBar.jsx
import React from "react";

function TickerBar({ topMovers }) {
  return (
    <div className="ticker-bar">
      {topMovers.map((coin, idx) => (
        <div key={idx} className="ticker-item">
          <span className="ticker-symbol">{coin.symbol}</span>
          <span className="ticker-price">${coin.price.toFixed(2)}</span>
          <span className={`ticker-change ${coin.change24h > 0 ? "positive" : "negative"}`}>
            {coin.change24h > 0 ? "▲" : "▼"} {Math.abs(coin.change24h).toFixed(2)}%
          </span>
        </div>
      ))}
    </div>
  );
}

export default TickerBar;