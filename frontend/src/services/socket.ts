import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;
const commandResults = new Map<string, any>();

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
    socket.on('command_ack', (ack: any) => {
      if (!ack.cmd_id) return;
      commandResults.set(ack.cmd_id, ack);
      if (commandResults.size > 100) commandResults.delete(commandResults.keys().next().value!);
    });
  }

  return socket;
};

// Also handles an ACK arriving before the HTTP request has returned its cmd_id.
export function waitForCommandAck(cmdId: string, timeoutMs = 28000): Promise<any> {
  if (!cmdId) return Promise.reject(new Error('Máy chủ chưa cấp mã lệnh'));
  return new Promise((resolve, reject) => {
    const connection = getSocket();
    const complete = (ack: any) => {
      clearTimeout(timer);
      connection.off('command_ack', onAck);
      if (ack.status === 'SUCCESS') resolve(ack);
      else reject(new Error(ack.message || 'Thiết bị chưa xác nhận áp dụng lệnh'));
    };
    const onAck = (ack: any) => { if (ack.cmd_id === cmdId) complete(ack); };
    const timer = setTimeout(() => {
      connection.off('command_ack', onAck);
      reject(new Error('Chưa nhận được xác nhận từ thiết bị. Vui lòng kiểm tra kết nối và thử lại.'));
    }, timeoutMs);
    connection.on('command_ack', onAck);
    const cached = commandResults.get(cmdId);
    if (cached) complete(cached);
  });
}
