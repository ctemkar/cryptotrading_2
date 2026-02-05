// frontend/src/services/socket.js
import { io } from "socket.io-client";

// Use the environment variable or fallback to the current window origin
const SOCKET_URL = import.meta.env.VITE_BACKEND_URL || window.location.origin;

const socket = io(SOCKET_URL, {
  transports: ["websocket"], // Force WebSocket for better performance in trading
  path: "/socket.io/",
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
});

// --- Connection Lifecycle Logs ---

socket.on('connect', () => {
  console.log('✅ Socket connected:', socket.id);
});

socket.on('reconnect', (attemptNumber) => {
  console.log('🔄 Socket reconnected after', attemptNumber, 'attempts');
  // IMPORTANT: When we reconnect, we need to tell the Dashboard to re-emit 'join_user_room'
  // We can do this by dispatching a custom event or just letting the Dashboard's 
  // useEffect handle it via the 'socket' dependency.
});

socket.on('disconnect', (reason) => {
  console.log('❌ Socket disconnected:', reason);
  if (reason === "io server disconnect") {
    // the disconnection was initiated by the server, you need to reconnect manually
    socket.connect();
  }
});

socket.on('connect_error', (error) => {
  console.error('⚠️ Socket connection error:', error.message);
});

// --- Trading Specific Debugging ---

socket.on('app_state_sync', (data) => {
  console.log('🔄 Global State Sync Received:', data);
});

export default socket;