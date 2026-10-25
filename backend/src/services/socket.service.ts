import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { ENV } from '../config/env';

export class SocketService {
  private static io: SocketIOServer | null = null;

  static initialize(httpServer: HttpServer): SocketIOServer {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: [ENV.CLIENT_URL, 'http://localhost:5173', 'http://127.0.0.1:5173'],
        methods: ['GET', 'POST'],
        credentials: true,
      },
    });

    this.io.on('connection', (socket: Socket) => {
      console.log(`[SocketService] Web Client connected: ${socket.id}`);

      socket.on('disconnect', () => {
        console.log(`[SocketService] Web Client disconnected: ${socket.id}`);
      });
    });

    return this.io;
  }

  static getIO(): SocketIOServer {
    if (!this.io) {
      throw new Error('[SocketService] Socket.IO is not initialized yet!');
    }
    return this.io;
  }

  /**
   * Broadcast live telemetry data to all connected clients
   */
  static emitTelemetry(data: any): void {
    if (this.io) {
      this.io.emit('telemetry', data);
    }
  }

  /**
   * Broadcast device status update (ONLINE / OFFLINE)
   */
  static emitDeviceStatus(data: any): void {
    if (this.io) {
      this.io.emit('device_status', data);
    }
  }

  /**
   * Broadcast new alert
   */
  static emitNewAlert(data: any): void {
    if (this.io) {
      this.io.emit('alert_new', data);
    }
  }

  /**
   * Broadcast alert status update (ACK / RESOLVE)
   */
  static emitAlertUpdate(data: any): void {
    if (this.io) {
      this.io.emit('alert_updated', data);
    }
  }

  /**
   * Broadcast command update (PENDING, SUCCESS, FAILED)
   */
  static emitCommandUpdate(data: any): void {
    if (this.io) {
      this.io.emit('command_ack', data);
    }
  }
}
