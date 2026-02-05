// frontend/src/components/LiveMultiChart.jsx
import React, { useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid
} from "recharts";

/*
 props:
  - history: { SYMBOL: [{time, price}, ...], ... }
  - symbols: ["BTCUSDT","ETHUSDT"]
*/

export default function LiveMultiChart({ history, symbols = [] }) {
  // Build one combined time axis:
  // We'll take the union of times (most recent from BTC as baseline)
  const chartData = useMemo(() => {
    // collect unique times (last MAX_POINTS)
    const timesSet = new Set();
    symbols.forEach(sym => {
      (history[sym] || []).forEach(pt => timesSet.add(pt.time));
    });
    const times = Array.from(timesSet).sort((a,b)=>a-b);

    // build objects keyed by time
    const data = times.map(t => {
      const point = { time: new Date(t).toLocaleTimeString() };
      symbols.forEach(sym => {
        const arr = history[sym] || [];
        // find last price for time <= t
        let found = null;
        for (let i = arr.length - 1; i >= 0; i--) {
          if (arr[i].time <= t) { found = arr[i].price; break; }
        }
        if (found != null) point[sym] = Number(found.toFixed(2));
      });
      return point;
    });

    return data;
  }, [history, symbols]);

  const colorPalette = ["#2b8a3e","#1f77b4","#ff7f0e","#9467bd","#d62728","#17becf"];

  return (
    <div style={{ width: "100%", height: 420 }}>
      <ResponsiveContainer>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time" minTickGap={20} />
          <YAxis domain={["auto","auto"]} />
          <Tooltip />
          <Legend />
          {symbols.map((s, idx) => (
            <Line
              key={s}
              type="monotone"
              dataKey={s}
              stroke={colorPalette[idx % colorPalette.length]}
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
