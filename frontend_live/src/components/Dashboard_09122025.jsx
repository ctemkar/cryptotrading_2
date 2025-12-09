// src/components/Dashboard.jsx
import React from "react";
import useModels from "../hooks/useModels";
import ModelsComparisonChart from "./ModelsComparisonChart";
import useCryptoPrices from "../hooks/useCryptoPrices"; // optional: prices

const MODEL_META = [
  { id: "gemini-3-pro", name: "Gemini-3-pro" },
  { id: "qwen-3-max", name: "Qwen-3-max" },
  { id: "gpt-5.1", name: "gpt-5.1" },
  { id: "claude-sonnet-4-5", name: "claude-sonnet-4-5" },
  { id: "mystery-model", name: "Mystery Model" }
];

export default function Dashboard(){
  const { modelsLatest, modelsHistory } = useModels();
  // optional useCryptoPrices can still populate crypto lines if you want both
  // const { latest: cryptoLatest, history: cryptoHistory } = useCryptoPrices();

  return (
    <div style={{ padding: 12, maxWidth: 1200, margin: "0 auto" }}>
      <h2>Model Performance Comparison</h2>

      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        {MODEL_META.map(m => (
          <div key={m.id} style={{ padding: 8, background: "#fff", borderRadius: 8, minWidth: 140 }}>
            <div style={{ fontSize: 12, color: "#666" }}>{m.name}</div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>
              {modelsLatest[m.id]?.accountValue ? `$${modelsLatest[m.id].accountValue}` : "—"}
            </div>
          </div>
        ))}
      </div>

      <div style={{ background: "#fff", padding: 12, borderRadius: 8 }}>
        <ModelsComparisonChart modelsHistory={modelsHistory} modelsMeta={MODEL_META} />
      </div>
    </div>
  );
}
