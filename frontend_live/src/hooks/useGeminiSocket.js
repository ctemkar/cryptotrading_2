// frontend/hooks/useGeminiSocket.js
import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

// Vite: use import.meta.env. Provide fallback to localhost dev server.
const BACKEND_WS_URL =
  import.meta.env.VITE_BACKEND_WS_URL || import.meta.env.VITE_BACKEND_URL || 'http://localhost:3002';

// module-level singleton socket so multiple components share same connection
let socket;

function getSocket() {
  if (!socket) {
    console.log('[useGeminiSocket] connecting to', BACKEND_WS_URL);
    socket = io(BACKEND_WS_URL, {
      transports: ['websocket', 'polling'], // include polling as fallback if needed
      path: '/socket.io', // ensure this matches your backend socket path
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });
  }
  return socket;
}

export default function useGeminiSocket(userId, handlers = {}) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!userId) return;

    const sock = getSocket();

    function onConnect() {
      sock.emit('join_user_room', userId);
    }

    // capture handler references so we can detach the exact same refs
    const attached = [];

    sock.on('connect', onConnect);
    attached.push(['connect', onConnect]);

    if (handlersRef.current.onPositionOpened) {
      const fn = handlersRef.current.onPositionOpened;
      sock.on('position_opened', fn);
      attached.push(['position_opened', fn]);
    }
    if (handlersRef.current.onPositionClosed) {
      const fn = handlersRef.current.onPositionClosed;
      sock.on('position_closed', fn);
      attached.push(['position_closed', fn]);
    }
    if (handlersRef.current.onMarketTrades) {
      const fn = handlersRef.current.onMarketTrades;
      sock.on('gemini_market_trades', fn);
      attached.push(['gemini_market_trades', fn]);
    }
    if (handlersRef.current.onModelsUpdate) {
      const fn = handlersRef.current.onModelsUpdate;
      sock.on('models_update', fn);
      attached.push(['models_update', fn]);
    }
    if (handlersRef.current.onCryptoUpdate) {
      const fn = handlersRef.current.onCryptoUpdate;
      sock.on('crypto_update', fn);
      attached.push(['crypto_update', fn]);
    }

    return () => {
      // detach listeners we attached
      attached.forEach(([event, fn]) => {
        sock.off(event, fn);
      });

      // NOTE: do not socket.disconnect() here if you want the shared connection to persist
    };
  }, [userId]);
}