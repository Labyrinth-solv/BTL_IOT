import http from 'http';
import app from './app';
import { ENV } from './config/env';
import { SocketService } from './services/socket.service';
import { MQTTService } from './services/mqtt.service';
import prisma from './config/prisma';

const httpServer = http.createServer(app);

// 1. Khởi tạo Socket.IO Gateway
SocketService.initialize(httpServer);

// 2. Khởi tạo MQTT Ingestion Worker & Rule Engine
MQTTService.initialize();

// 3. Khởi chạy HTTP Server
const PORT = ENV.PORT;
httpServer.listen(PORT, () => {
  console.log('================================================================');
  console.log(`🌾 SMART GRAIN STORAGE MONITORING SYSTEM - BACKEND SERVER 🌾`);
  console.log(`🚀 REST API Server chạy tại: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket Gateway (Socket.IO) sẵn sàng tại port: ${PORT}`);
  console.log(`📡 Kết nối MQTT Broker tới: ${ENV.MQTT_BROKER_URL}`);
  console.log(`🌐 Môi trường: ${ENV.NODE_ENV}`);
  console.log('================================================================');
});

// Xử lý đóng kết nối an toàn khi tắt server (Graceful shutdown)
const gracefulShutdown = async () => {
  console.log('\n🛑 Đang tắt hệ thống an toàn...');
  try {
    await prisma.$disconnect();
    console.log('✅ Đã ngắt kết nối cơ sở dữ liệu Prisma.');
    httpServer.close(() => {
      console.log('✅ HTTP Server đã dừng hoàn toàn.');
      process.exit(0);
    });
  } catch (err) {
    console.error('❌ Lỗi khi tắt server:', err);
    process.exit(1);
  }
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

