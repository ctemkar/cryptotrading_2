// ChartPanel.jsx
import React from "react";

function ChartPanel({ candidates, setups }) {
  return (
    <div className="chart-panel">
      <div className="chart-header">
        <h3>SCAN RESULTS</h3>
        <p className="chart-subtitle">
          This panel displays the top crypto gainers matching your scan criteria
        </p>
      </div>

      <div className="stats-summary">
        <div className="stat-box">
          <span className="stat-label">Candidates</span>
          <span className="stat-value">{candidates.length}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Trade Setups</span>
          <span className="stat-value">{setups.length}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Avg 24h Change</span>
          <span className="stat-value">
            {candidates.length > 0
              ? (
                  candidates.reduce((sum, c) => sum + c.change24h, 0) /
                  candidates.length
                ).toFixed(2)
              : 0}
            %
          </span>
        </div>
      </div>

      <div className="candidates-list">
        <h4>Top Candidates</h4>
        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Name</th>
              <th>24h Change</th>
              <th>24h Volume</th>
            </tr>
          </thead>
          <tbody>
            {candidates.slice(0, 10).map((c, idx) => (
              <tr key={idx}>
                <td className="symbol-cell">{c.symbol}</td>
                <td>{c.name}</td>
                <td className="positive">+{c.change24h.toFixed(2)}%</td>
                <td>${(c.vol24hUsd / 1_000_000).toFixed(2)}M</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ChartPanel;