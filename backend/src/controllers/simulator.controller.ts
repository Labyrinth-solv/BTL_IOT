import { Request, Response } from 'express';
import mqtt from 'mqtt';
import { ENV } from '../config/env';

const SIMULATOR_HTTP_URL = 'http://localhost:4001/api/simulator';

export class SimulatorController {
  /**
   * Lấy trạng thái hiện tại của bộ giả lập thiết bị
   */
  static async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const response = await fetch(`${SIMULATOR_HTTP_URL}/status`, {
        signal: AbortSignal.timeout(2000),
      });

      if (!response.ok) {
        res.status(200).json({
          success: false,
          isRunning: false,
          message: 'Bộ giả lập chưa khởi chạy trên cổng 4001',
        });
        return;
      }

      const data = await response.json();
      res.status(200).json(data);
    } catch (e) {
      // Nếu simulator chưa bật trên cổng 4001
      res.status(200).json({
        success: false,
        isRunning: false,
        message: 'Bộ giả lập hiện đang tắt. Bạn có thể khởi động bằng lệnh: npm run simulator',
      });
    }
  }

  /**
   * Chuyển đổi giữa 5 kịch bản kiểm thử (Hardware Simulator Drawer)
   */
  static async setScenario(req: Request, res: Response): Promise<void> {
    try {
      const { scenario } = req.body;

      if (!scenario) {
        res.status(400).json({ success: false, message: 'Thiếu tham số scenario' });
        return;
      }

      // Đường truyền 1: Gửi qua HTTP API tới Simulator Server (Port 4001)
      let httpResult = null;
      try {
        const httpResp = await fetch(`${SIMULATOR_HTTP_URL}/scenario`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scenario }),
          signal: AbortSignal.timeout(2000),
        });
        if (httpResp.ok) {
          httpResult = await httpResp.json();
        }
      } catch (err) {
        // Fallback qua MQTT
      }

      // Đường truyền 2: Bắn qua MQTT Control Topic 'grain/simulator/control' (đảm bảo tính tin cậy)
      try {
        const client = mqtt.connect(ENV.MQTT_BROKER_URL, { connectTimeout: 3000 });
        client.on('connect', () => {
          client.publish(
            'grain/simulator/control',
            JSON.stringify({ scenario, timestamp: Date.now() }),
            { qos: 1 },
            () => client.end()
          );
        });
      } catch (mqttErr) {
        console.warn('[SimulatorController] MQTT broadcast error:', mqttErr);
      }

      res.status(200).json({
        success: true,
        message: `Đã phát lệnh kích hoạt kịch bản: ${scenario}`,
        data: httpResult || { scenario, status: 'TRIGGERED_VIA_MQTT' },
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Lỗi khi kích hoạt kịch bản giả lập' });
    }
  }

  /**
   * Tái kết nối MQTT sau khi kiểm thử LWT Disconnect
   */
  static async reconnect(req: Request, res: Response): Promise<void> {
    try {
      const response = await fetch(`${SIMULATOR_HTTP_URL}/reconnect`, {
        method: 'POST',
        signal: AbortSignal.timeout(2000),
      });
      const data = await response.json();
      res.status(200).json(data);
    } catch (e) {
      res.status(500).json({
        success: false,
        message: 'Không thể kết nối tới Simulator HTTP API. Vui lòng kiểm tra lại terminal chạy simulator.',
      });
    }
  }
}
