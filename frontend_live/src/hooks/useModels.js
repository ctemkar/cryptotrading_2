// src/hooks/useModels.js
import { useEffect, useRef, useState } from "react";
import socket from "../services/socket";

/*
 returns:
  - modelsLatest: { modelId: { id, name, color, accountValue } ...}
  - modelsHistory: { modelId: [{time, accountValue}, ...], ... }
*/
export default function useModels() {
  const [modelsLatest, setModelsLatest] = useState({});
  const historyRef = useRef({}); // { modelId: [ {time, accountValue}, ... ] }
  const [, tick] = useState(0);

  useEffect(() => {
    function handleSnapshot(snapshot) {
      // snapshot: [{id,name,color,accountValue,history}]
      snapshot.forEach(m => {
        setModelsLatest(prev => ({ ...prev, [m.id]: {
          id: m.id,
          name: m.name,
          color: m.color,
          accountValue: m.accountValue,
          initialValue: m.initialValue // ✅ ADD THIS LINE
        } }));
        historyRef.current[m.id] = m.history ? m.history.slice(-200) : (historyRef.current[m.id]||[]);
      });
      tick(n => n+1);
    }

    function handleUpdate(modelsOut) {
      // modelsOut: [{id,name,color,accountValue,time}, ...]
      modelsOut.forEach(m => {
        setModelsLatest(prev => ({ ...prev, [m.id]: {
          id: m.id,
          name: m.name,
          color: m.color,
          accountValue: m.accountValue,
          initialValue: m.initialValue ?? prev[m.id]?.initialValue
        } }));
        const arr = historyRef.current[m.id] || [];
        arr.push({ time: m.time, accountValue: m.accountValue });
        if (arr.length > 200) arr.shift();
        historyRef.current[m.id] = arr;
      });
      // ✅ FIX: Always trigger re-render (not random 1-in-3)
      tick(n => n + 1);
    }

    socket.on("models_snapshot", handleSnapshot);
    socket.on("models_update", handleUpdate);

    return () => {
      socket.off("models_snapshot", handleSnapshot);
      socket.off("models_update", handleUpdate);
    };
  }, []);

  // produce a plain history object for consumers
  const modelsHistory = {};
  //Object.keys(historyRef.current).forEach(k => modelsHistory[k] = historyRef.current[k].slice());
  const history = historyRef.current || {};

  Object.keys(history).forEach(k => {
    modelsHistory[k] = (history[k] || []).slice();
  });
  return { modelsLatest, modelsHistory };
}
