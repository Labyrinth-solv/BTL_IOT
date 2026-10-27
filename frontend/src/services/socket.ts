import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    // In dev, connects to proxy or window.location.origin
    socket = io('/', {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    socket.on('connect', () => {
      console.log('⚡ [Socket.IO] Đã kết nối thời gian thực tới Backend!');
    });

    socket.on('disconnect', () => {
      console.warn('⚠️ [Socket.IO] Mất kết nối tới máy chủ');
    });
  }

  return socket;
};
