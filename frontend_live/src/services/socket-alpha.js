import { io } from 'socket.io-client';

// ✅ Use explicit backend URL
const BACKEND_URL = 'https://cryptotradinglive.lovehappyhours.com';

const socket = io(BACKEND_URL, {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5,
});

// Connection lifecycle logs
socket.on('connect', () => {
  console.log('✅ Socket connected:', socket.id);
  console.log('🔗 Backend URL:', BACKEND_URL);
  window.dispatchEvent(new CustomEvent('socket_connected'));
});

socket.on('disconnect', (reason) => {
  console.log('❌ Socket disconnected:', reason);
});

socket.on('reconnect', (attemptNumber) => {
  console.log('🔄 Socket reconnected after', attemptNumber, 'attempts');
  window.dispatchEvent(new CustomEvent('socket_reconnected'));
});

socket.on('connect_error', (error) => {
  console.error('⚠️ Socket connection error:', error.message);
});

export default socket;