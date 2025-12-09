// frontend/src/components/Dashboard.jsx
import React from "react";
import useCryptoPrices from "../hooks/useCryptoPrices";
import LiveMultiChart from "./LiveMultiChart";

const SYMBOLS = ["BTCUSDT","ETHUSDT","SOLUSDT","LUNAUSDT"];

export default function Dashboard(){
  const { latest, history } = useCryptoPrices(SYMBOLS);

  return (
    <div className="app">
      <div className="header">
        <h1>Live Crypto Dashboard</h1>
        <div style={{fontSize:14,color:"#666"}}>Source: Binance WS (via backend)</div>
      </div>

      <div className="price-grid">
        {SYMBOLS.map(sym => (
          <div key={sym} className="price-item card">
            <div style={{fontSize:12,color:"#888"}}>{sym}</div>
            <div style={{fontSize:20,fontWeight:700}}>{latest[sym] ?? "—"}</div>
            <div style={{fontSize:12,color:"#666"}}>latest</div>
          </div>
        ))}
      </div>

      <div className="card">
        <LiveMultiChart history={history} symbols={SYMBOLS} />
      </div>
    </div>
  );
}
