// src/components/ModelsComparisonChart.jsx
import React, { useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid
} from "recharts";

/*
 props:
  - modelsHistory: { modelId: [{time, accountValue}, ...], ... }  ← already normalized
  - modelsMeta: [{ id, name, color }, ...] optional for ordering/labels
  - startingValue: number (e.g. 10) — user's entered start value
*/

export default function ModelsComparisonChart({ modelsHistory, modelsMeta = [], startingValue = 10 }) {
  const safeHistory = modelsHistory || {};
  const modelIds = modelsMeta.length
    ? modelsMeta.map(m => m.id)
    : Object.keys(safeHistory);

  const chartData = useMemo(() => {
    // collect union of times
    const timesSet = new Set();
    modelIds.forEach(id => {
      (safeHistory[id] || []).forEach(pt => timesSet.add(pt.time));
    });
    const times = Array.from(timesSet).sort((a, b) => a - b);

    // create time-aligned points
    return times.map(t => {
      const point = { time: new Date(t).toLocaleTimeString() };
      modelIds.forEach(id => {
        const arr = safeHistory[id] || [];
        // find last accountValue at or before t
        let found = null;
        for (let i = arr.length - 1; i >= 0; i--) {
          if (arr[i].time <= t) { found = arr[i].accountValue; break; }
        }
        if (found != null) point[id] = Number(found.toFixed(2));
      });
      return point;
    });
  }, [safeHistory, modelIds]);

  const palette = ["#2b8a3e", "#1f77b4", "#ff7f0e", "#9467bd", "#000000", "#d62728"];

  // ✅ FIX: Y-axis starts at user's startingValue, not auto
  const base = Number(startingValue) || 10;
  const yMin = parseFloat((base * 0.85).toFixed(2)); // 15% below start
  const yMax = parseFloat((base * 1.15).toFixed(2)); // 15% above start

  return (
    <div style={{ width: "100%", height: 440 }}>
      <ResponsiveContainer>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time" minTickGap={20} />

          {/* ✅ FIX: Y-axis anchored to user's startingValue */}
          <YAxis
            domain={[yMin, yMax]}
            tickFormatter={(v) => `$${v.toFixed(2)}`}
          />

          <Tooltip
            formatter={(value, name) => {
              const meta = modelsMeta.find(m => m.id === name);
              const label = meta?.name || name;
              const pl = parseFloat((value - base).toFixed(2));
              const plSign = pl >= 0 ? "+" : "";
              return [`$${value.toFixed(2)} (P/L: ${plSign}$${pl})`, label];
            }}
          />
          <Legend
            formatter={(value) => modelsMeta.find(m => m.id === value)?.name || value}
          />
          {modelIds.map((id, idx) => (
            <Line
              key={id}
              type="monotone"
              dataKey={id}
              stroke={(modelsMeta.find(m => m.id === id)?.color) || palette[idx % palette.length]}
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