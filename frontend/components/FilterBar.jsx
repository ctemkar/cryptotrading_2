// FilterBar.jsx
import React from "react";

function FilterBar({ filter, setFilter, timeRange, setTimeRange, onScan, loading }) {
  return (
    <div className="filter-bar">
      <div className="filter-tabs">
        <button className="tab active">Aggregate Index</button>
        <button className="tab">1: New Baseline</button>
        <button className="tab">2: Monk Mode</button>
        <button className="tab">3: Situational Awareness</button>
      </div>
      <div className="time-filters">
        <button
          className={`time-btn ${timeRange === "ALL" ? "active" : ""}`}
          onClick={() => setTimeRange("ALL")}
        >
          ALL
        </button>
        <button
          className={`time-btn ${timeRange === "72h" ? "active" : ""}`}
          onClick={() => setTimeRange("72h")}
        >
          72h
        </button>
      </div>
      <button className="scan-btn" onClick={onScan} disabled={loading}>
        {loading ? "Scanning..." : "Run Scan"}
      </button>
    </div>
  );
}

export default FilterBar;