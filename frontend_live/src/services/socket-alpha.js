import { io } from 'socket.io-client';

//const BACKEND_URL = 'https://cryptotradinglive.lovehappyhours.com';

const BACKEND_URL = "http://192.168.0.103:3002";

/*const socket = io(BACKEND_URL, {
  transports: ['polling', 'websocket'], // Polling first is safer for mobile
  forceNew: true,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: Infinity, 
  timeout: 20000,
  rejectUnauthorized: false // Helps if there are SSL certificate issues on mobile
}); */

const socket = io(BACKEND_URL, {
  path: '/socket.io/', // Explicitly define the path
  transports: ['polling', 'websocket'],
  reconnection: true,
  reconnectionAttempts: 5
});

export default socket;