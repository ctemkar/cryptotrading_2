// SetupsFeed.jsx
import React from "react";

function SetupsFeed({ setups, filter, setFilter }) {
  return (
    <div className="setups-feed">
      <div className="feed-header">
        <button className="tab-btn active">SETUPS</button>
        <button className="tab-btn">DETAILS</button>
      </div>

      <div className="filter-section">
        <label>FILTER:</label>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="ALL">ALL SETUPS</option>
          <option value="New Baseline">New Baseline</option>
          <option value="Situational Awareness">Situational Awareness</option>
          <option value="Monk Mode">Monk Mode</option>
        </select>
      </div>

      <div className="feed-list">
        {setups.length === 0 && (
          <div className="no-setups">No trade setups found. Run a scan.</div>
        )}
        {setups.map((setup, idx) => (
          <div key={idx} className="setup-card">
            <div className="setup-header">
              <div className="setup-title">
                <span className="setup-symbol">{setup.symbol}</span>
                <span className={`setup-badge ${setup.strategyLabel.toLowerCase().replace(" ", "-")}`}>
                  {setup.strategyLabel}
                </span>
              </div>
              <span className="setup-time">
                {new Date(setup.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <div className="setup-body">
              <p className="setup-reasoning">{setup.reasoning}</p>
              <div className="setup-metrics">
                <div className="metric">
                  <span className="metric-label">Entry:</span>
                  <span className="metric-value">${setup.entry.toFixed(6)}</span>
                </div>
                <div className="metric">
                  <span className="metric-label">Stop:</span>
                  <span className="metric-value">${setup.stop.toFixed(6)}</span>
                </div>
                <div className="metric">
                  <span className="metric-label">Risk:</span>
                  <span className="metric-value">{setup.riskPct}%</span>
                </div>
                <div className="metric">
                  <span className="metric-label">Size:</span>
                  <span className="metric-value">${setup.positionSizeUsd.toFixed(0)}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default SetupsFeed;