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
    // initialize historyRef arrays for symbols
    symbols.forEach(s => { historyRef.current[s] = historyRef.current[s] || []; });

    function onUpdate(data) {
      // data: { symbol, price, qty, time }
      const sym = data.symbol;
      if (!sym) return;
      // store latest
      setLatest(prev => ({ ...prev, [sym]: data.price }));

      // push into history
      const arr = historyRef.current[sym] || [];
      arr.push({ time: data.time, price: data.price });
      if (arr.length > MAX_POINTS) arr.shift();
      historyRef.current[sym] = arr;

      // occasionally force render (reduce render rate)
      // use mod to render every 4th update
      if ((Math.random()*4|0) === 0) tick(n => n + 1);
    }

    socket.on("crypto_update", onUpdate);

    return () => {
      socket.off("crypto_update", onUpdate);
    };
  }, [symbols]);

  // convert historyRef to plain object for consumers
  const history = {};
  symbols.forEach(s => history[s] = (historyRef.current[s] || []).slice());

  return { latest, history };
}
