// ScannerDashboard.jsx
import React, { useState, useEffect } from "react";
import TickerBar from "./TickerBar";
import ChartPanel from "./ChartPanel";
import SetupsFeed from "./SetupsFeed";
import FilterBar from "./FilterBar";
import "../styles/scanner.css";

function ScannerDashboard() {
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [setups, setSetups] = useState([]);
  const [topMovers, setTopMovers] = useState([]);
  const [filter, setFilter] = useState("ALL");
  const [timeRange, setTimeRange] = useState("ALL");

  const runScan = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/scan?accountSize=10000&riskPct=0.02");
      const data = await res.json();
      setCandidates(data.candidates || []);
      setSetups(data.setups || []);
      setTopMovers(data.topMovers || []);
    } catch (err) {
      console.error(err);
      alert("Scan failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runScan();
    const interval = setInterval(runScan, 300000); // Refresh every 5 min
    return () => clearInterval(interval);
  }, []);

  const filteredSetups = setups.filter((s) => {
    if (filter === "ALL") return true;
    return s.strategyLabel === filter;
  });

  return (
    <div className="scanner-dashboard">
      {/* Header */}
      <header className="dashboard-header">
        <div className="logo">
          <h1>Crypto Scanner</h1>
          <span className="subtitle">by Alpha Arena</span>
        </div>
        <nav className="nav-links">
          <a href="#live">LIVE</a>
          <a href="#leaderboard">LEADERBOARD</a>
          <a href="#blog">BLOG</a>
          <a href="#models">MODELS</a>
        </nav>
      </header>

      {/* Ticker Bar */}
      <TickerBar topMovers={topMovers} />

      {/* Main Content */}
      <div className="main-content">
        {/* Left Panel */}
        <div className="left-panel">
          <FilterBar
            filter={filter}
            setFilter={setFilter}
            timeRange={timeRange}
            setTimeRange={setTimeRange}
            onScan={runScan}
            loading={loading}
          />
          <ChartPanel candidates={candidates} setups={setups} />
        </div>

        {/* Right Panel */}
        <div className="right-panel">
          <SetupsFeed setups={filteredSetups} filter={filter} setFilter={setFilter} />
        </div>
      </div>
    </div>
  );
}

export default ScannerDashboard;