// frontend/src/hooks/useCryptoPrices.js
import { useEffect, useRef, useState } from "react";
import socket from "../services/socket";

/*
  returns:
   - latest: { SYMBOL: price, ... }
   - history: { SYMBOL: [{time, price}, ...], ... }  // last N points
*/
export default function useCryptoPrices(symbols = ["BTCUSDT","ETHUSDT","SOLUSDT"]) {
  const [latest, setLatest] = useState({});
  const historyRef = useRef({});
  const [, tick] = useState(0); // for occasional re-render
  const MAX_POINTS = 80;

  useEffect(() => {
    console.log('useCryptoPrices: Setting up listeners for symbols:', symbols);
    
    // initialize historyRef arrays for symbols
    symbols.forEach(s => { historyRef.current[s] = historyRef.current[s] || []; });

    // Handle initial snapshot from backend
    function onSnapshot(data) {
      console.log('Crypto snapshot received:', data);
      
      // data: { latest: { BTCUSDT: 95000, ... }, history: { BTCUSDT: [{time, price}, ...], ... }, time }
      if (data.latest) {
        setLatest(data.latest);
        console.log('Latest crypto prices set:', data.latest);
      }
      
      if (data.history) {
        // Load history from backend
        Object.keys(data.history).forEach(sym => {
          if (symbols.includes(sym)) {
            historyRef.current[sym] = data.history[sym].slice(-MAX_POINTS);
          }
        });
        tick(n => n + 1); // Force re-render
      }
    }

    // Handle real-time updates from backend
    function onUpdate(data) {
      console.log('Crypto update received:', data);
      
      // data: { latest: { BTCUSDT: 95123.45, ETHUSDT: 3501.23, ... }, time: 1234567890 }
      if (data.latest) {
        setLatest(data.latest);
        
        // Update history for each symbol
        Object.keys(data.latest).forEach(sym => {
          if (symbols.includes(sym)) {
            const arr = historyRef.current[sym] || [];
            arr.push({ time: data.time, price: data.latest[sym] });
            if (arr.length > MAX_POINTS) arr.shift();
            historyRef.current[sym] = arr;
          }
        });
        
        // occasionally force render (reduce render rate)
        if ((Math.random()*4|0) === 0) tick(n => n + 1);
      }
    }

    socket.on("crypto_snapshot", onSnapshot);
    socket.on("crypto_update", onUpdate);

    // Request snapshot if socket is already connected
    if (socket.connected) {
      console.log('Socket already connected, waiting for snapshot...');
    }

    return () => {
      socket.off("crypto_snapshot", onSnapshot);
      socket.off("crypto_update", onUpdate);
    };
  }, [symbols.join(',')]); // Only re-run if symbols change

  // convert historyRef to plain object for consumers
  const history = {};
  symbols.forEach(s => history[s] = (historyRef.current[s] || []).slice());

  console.log('useCryptoPrices current state - latest:', latest, 'history keys:', Object.keys(history));

  return { latest, history };
}