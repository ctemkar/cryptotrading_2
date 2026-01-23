// frontend/src/services/socket.js
import { io } from "socket.io-client";

// If VITE_BACKEND_URL is set, use it. Otherwise use current origin (same domain).
const SOCKET_URL = import.meta.env.VITE_BACKEND_URL || window.location.origin;

console.log('Connecting to socket server:', SOCKET_URL);

const socket = io(SOCKET_URL, {                                                               
  transports: ["websocket", "polling"],
  path: "/socket.io/"       // important when behind Nginx
});

socket.on('connect', () => {
  console.log('✅ Socket connected successfully:', socket.id);
});

socket.on('disconnect', () => {
  console.log('❌ Socket disconnected');
});

socket.on('connect_error', (error) => {
  console.error('❌ Socket connection error:', error);
});

// Debug: Log all crypto events
socket.on('crypto_snapshot', (data) => {
  console.log('📊 crypto_snapshot event received:', data);
});

socket.on('crypto_update', (data) => {
  console.log('📈 crypto_update event received:', data);
});

export default socket;