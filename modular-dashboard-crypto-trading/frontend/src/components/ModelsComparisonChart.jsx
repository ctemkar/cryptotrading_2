// src/components/ModelsComparisonChart.jsx
import React, { useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid
} from "recharts";

/*
 props:
  - modelsHistory: { modelId: [{time, accountValue}, ...], ... }
  - modelsMeta: [{ id, name, color }, ...] optional for ordering/labels
*/

export default function ModelsComparisonChart({ modelsHistory, modelsMeta = [] }) {
  //const modelIds = modelsMeta.length ? modelsMeta.map(m=>m.id) : Object.keys(modelsHistory);
  const safeHistory = modelsHistory || {};
  const modelIds = modelsMeta.length
    ? modelsMeta.map(m => m.id)
    : Object.keys(safeHistory);

  const chartData = useMemo(() => {
    // collect union of times
    const timesSet = new Set();
    modelIds.forEach(id => {
      (modelsHistory[id] || []).forEach(pt => timesSet.add(pt.time));
    });
    const times = Array.from(timesSet).sort((a,b)=>a-b);

    // create time-aligned points
    return times.map(t => {
      const point = { time: new Date(t).toLocaleTimeString() };
      modelIds.forEach(id => {
        const arr = modelsHistory[id] || [];
        // find last accountValue at or before t
        let found = null;
        for (let i = arr.length - 1; i >= 0; i--) {
          if (arr[i].time <= t) { found = arr[i].accountValue; break; }
        }
        if (found != null) point[id] = Number(found.toFixed(2));
      });
      return point;
    });
  }, [modelsHistory, modelIds]);

  const palette = ["#2b8a3e","#1f77b4","#ff7f0e","#9467bd","#000000","#d62728"];

  return (
    <div style={{ width: "100%", height: 440 }}>
      <ResponsiveContainer>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time" minTickGap={20} />
          <YAxis domain={["auto","auto"]} />
          <Tooltip />
          <Legend />
          {modelIds.map((id, idx) => (
            <Line
              key={id}
              type="monotone"
              dataKey={id}
              stroke={(modelsMeta.find(m=>m.id===id)?.color) || palette[idx%palette.length]}
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
