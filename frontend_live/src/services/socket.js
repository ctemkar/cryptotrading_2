// frontend/src/services/socket.js
//import { io } from "socket.io-client";
//const SOCKET_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
//const socket = io(SOCKET_URL, { transports: ["websocket", "polling"] });
//export default socket;
import { io } from "socket.io-client";

// If VITE_BACKEND_URL is set, use it. Otherwise use current origin (same domain).
const SOCKET_URL = import.meta.env.VITE_BACKEND_URL || window.location.origin;

const socket = io(SOCKET_URL, {
  transports: ["websocket", "polling"],
  path: "/socket.io/"       // important when behind Nginx
});

export default socket;
