import mqtt, { MqttClient } from 'mqtt';
import { ENV } from '../config/env';
import prisma from '../config/prisma';
import { EMCService } from './emc.service';
import { RuleEngineService } from './ruleEngine.service';
import { SocketService } from './socket.service';
import { TelegramService } from './telegram.service';
import { AuditService } from './audit.service';
import { LifecycleState, CommandStatus, AlertType, AlertSeverity } from '@prisma/client';

export class MQTTService {
  private static client: MqttClient | null = null;
  private static pendingCommandTimers: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Khởi động MQTT Ingestion Worker
   */
  static initialize(): void {
    console.log(`[MQTTService] Đang kết nối tới MQTT Broker: ${ENV.MQTT_BROKER_URL}...`);

    this.client = mqtt.connect(ENV.MQTT_BROKER_URL, {
      username: ENV.MQTT_USERNAME || undefined,
      password: ENV.MQTT_PASSWORD || undefined,
      reconnectPeriod: 3000,
      connectTimeout: 5000,
    });

    this.client.on('connect', () => {
      console.log('✅ [MQTTService] Đã kết nối thành công tới Mosquitto MQTT Broker!');

      // Đăng ký nhận tin nhắn trên toàn bộ các topic quy hoạch
      const topics = [
        'grain/devices/+/telemetry',
        'grain/devices/+/status',
        'grain/devices/+/ack',
      ];

      this.client?.subscribe(topics, { qos: 1 }, (err) => {
        if (err) {
          console.error('[MQTTService] Lỗi khi subscribe topics:', err);
        } else {
          console.log(`📡 [MQTTService] Đã subscribe các topics: ${topics.join(', ')}`);
        }
      });
    });

    this.client.on('message', async (topic: string, messageBuffer: Buffer) => {
      const messageStr = messageBuffer.toString();
      try {
        const payload = JSON.parse(messageStr);
        await this.routeMessage(topic, payload);
      } catch (err) {
        console.warn(`[MQTTService] Bản tin không phải JSON hợp lệ trên topic ${topic}: ${messageStr}`);
      }
    });

    this.client.on('error', (err) => {
      console.error('[MQTTService] MQTT Client Error:', err.message);
    });

    this.client.on('offline', () => {
      console.warn('[MQTTService] MQTT Broker connection went OFFLINE');
    });

    this.client.on('reconnect', () => {
      console.log('[MQTTService] Đang thử kết nối lại MQTT Broker...');
    });

    // Khởi động trình giám sát Heartbeat ngầm (Mục 4.3 Bước 6)
    this.startHeartbeatMonitor();
  }

  /**
   * Điều hướng xử lý bản tin theo topic
   */
  private static async routeMessage(topic: string, payload: any): Promise<void> {
    const parts = topic.split('/');
    if (parts.length < 4 || parts[0] !== 'grain' || parts[1] !== 'devices') {
      return;
    }

    const deviceCode = parts[2];
    const channel = parts[3];

    switch (channel) {
      case 'telemetry':
        await this.handleTelemetry(deviceCode, payload);
        break;
      case 'status':
        await this.handleStatus(deviceCode, payload);
        break;
      case 'ack':
        await this.handleAck(deviceCode, payload);
        break;
      default:
        break;
    }
  }

  /**
   * 1. XỬ LÝ BẢN TIN TELEMETRY
   */
  private static async handleTelemetry(deviceCode: string, payload: any): Promise<void> {
    const { msg_id, metrics, actuators } = payload;

    if (!msg_id || !metrics) {
      return;
    }

    // A. Kiểm tra tính hợp lệ và trạng thái thiết bị trong DB
    const device = await prisma.device.findUnique({
      where: { device_code: deviceCode },
      include: { zone: true },
    });

    if (!device) {
      console.warn(`[MQTTService] Telemetry từ thiết bị chưa đăng ký: ${deviceCode}`);
      return;
    }

    // B. Chặn dữ liệu từ thiết bị đã bị SUSPENDED hoặc DECOMMISSIONED (Yêu cầu bảo mật Prompt 2)
    if (
      device.lifecycle_state === LifecycleState.SUSPENDED ||
      device.lifecycle_state === LifecycleState.DECOMMISSIONED
    ) {
      console.warn(`🛡️ [MQTTService] ĐÃ CHẶN dữ liệu từ thiết bị bị khóa/thu hồi: ${deviceCode} (${device.lifecycle_state})`);

      await AuditService.log({
        action: 'UNAUTHORIZED_TELEMETRY_BLOCKED',
        target_type: 'DEVICE',
        target_id: device.id,
        details_json: {
          device_code: deviceCode,
          lifecycle_state: device.lifecycle_state,
          msg_id,
          reason: 'Thiết bị đang bị tạm khóa hoặc ngừng sử dụng vĩnh viễn',
        },
      });
      return;
    }

    // C. Kiểm tra chống trùng lặp qua msg_id (Deduplication)
    const existingLog = await prisma.telemetryLog.findUnique({
      where: { msg_id },
    });
    if (existingLog) {
      // Đã lưu bản tin này trước đó (do QoS 1 retry), bỏ qua không xử lý lại
      return;
    }

    // D. Trích xuất chỉ số & Kiểm tra giới hạn vật lý cảm biến (SEC-04 Input Validator)
    const temp = metrics.temperature?.value ?? 25.0;
    const rh = metrics.humidity_air?.value ?? 60.0;
    const gas = metrics.gas_ppm?.value ?? 400.0;

    // SEC-04: Từ chối gói tin nằm ngoài dải đo vật lý của SHT31 (-40 đến +125°C, 0-100% RH) và MQ-135 (>= 0)
    if (temp < -40.0 || temp > 125.0 || rh < 0.0 || rh > 100.0 || gas < 0.0 || gas > 10000.0) {
      console.warn(`🛡️ [SEC-04] Từ chối telemetry dị thường ngoài giới hạn vật lý từ ${deviceCode}: Temp=${temp}, RH=${rh}, Gas=${gas}`);
      await AuditService.log({
        action: 'INVALID_SENSOR_DATA_REJECTED',
        target_type: 'DEVICE',
        target_id: device.id,
        details_json: {
          device_code: deviceCode,
          msg_id,
          metrics,
          reason: 'Giá trị cảm biến nằm ngoài dải đo vật lý của cảm biến SHT31 / MQ-135',
        },
      });
      return;
    }

    const estimatedEmc = metrics.estimated_emc?.value ?? EMCService.calculate(temp, rh);

    // E. Đánh giá qua Rule Engine
    const ruleResult = RuleEngineService.evaluate({
      temperature: temp,
      humidity_air: rh,
      gas_ppm: gas,
      estimated_emc: estimatedEmc,
      custom_config: device.config_json,
    });

    const isFanOn = actuators?.fan_state === 'ON' || ruleResult.should_turn_on_fan;

    // F. Lưu vào bảng telemetry_logs
    const telemetryRecord = await prisma.telemetryLog.create({
      data: {
        device_id: device.id,
        msg_id,
        temperature: temp,
        humidity_air: rh,
        gas_ppm: gas,
        estimated_emc: estimatedEmc,
        fan_state: isFanOn,
        risk_level: ruleResult.risk_level,
      },
    });

    // G. Cập nhật trạng thái thiết bị sang ACTIVE & ONLINE
    const updatedLifecycle =
      device.lifecycle_state === LifecycleState.PROVISIONED ||
      device.lifecycle_state === LifecycleState.OFFLINE
        ? LifecycleState.ACTIVE
        : device.lifecycle_state;

    await prisma.device.update({
      where: { id: device.id },
      data: {
        last_seen_at: new Date(),
        is_online: true,
        lifecycle_state: updatedLifecycle,
      },
    });

    // H. Xử lý Cảnh báo (Alerts) nếu vượt ngưỡng
    if (ruleResult.alert_needed && ruleResult.alert_type && ruleResult.alert_severity) {
      // Tránh spam cảnh báo: kiểm tra cảnh báo tương tự trong 5 phút qua
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const recentAlert = await prisma.alert.findFirst({
        where: {
          device_id: device.id,
          alert_type: ruleResult.alert_type,
          status: 'NEW',
          created_at: { gte: fiveMinutesAgo },
        },
      });

      if (!recentAlert) {
        const newAlert = await prisma.alert.create({
          data: {
            device_id: device.id,
            zone_id: device.zone_id,
            alert_type: ruleResult.alert_type,
            severity: ruleResult.alert_severity,
            message: ruleResult.alert_message || 'Cảnh báo vi khí hậu vượt ngưỡng an toàn',
            trigger_value: ruleResult.trigger_value ?? 0,
          },
          include: {
            device: { select: { device_code: true, name: true } },
            zone: { select: { name: true } },
          },
        });

        // Đẩy sự kiện cảnh báo qua WebSocket
        SocketService.emitNewAlert(newAlert);

        // Gửi Telegram nếu ở mức CRITICAL (HIGH_RISK)
        if (ruleResult.alert_severity === AlertSeverity.CRITICAL) {
          const teleMsg = `Kho: ${device.zone.name} | Thiết bị: ${device.device_code}\n` +
                          `Nhiệt độ: ${temp}°C | RH: ${rh}% | Gas: ${gas} ppm | EMC: ${estimatedEmc}%\n` +
                          `Nội dung: ${ruleResult.alert_message}`;
          await TelegramService.sendAlert(teleMsg);
        }
      }
    }

    // I. Tự động điều khiển quạt ở chế độ AUTO khi vượt ngưỡng
    const controlMode = actuators?.control_mode || 'AUTO';
    if (controlMode === 'AUTO' && ruleResult.should_turn_on_fan && actuators?.fan_state !== 'ON') {
      console.log(`⚡ [RuleEngine Auto-Fan] Tự động phát lệnh BẬT QUẠT cho thiết bị ${deviceCode}`);
      await this.publishCommand(device.id, deviceCode, 'ACTUATOR_CONTROL', {
        target: 'VENTILATION_FAN',
        action: 'TURN_ON',
        control_mode: 'AUTO',
        duration_sec: 300,
      });
    }

    // J. Đẩy dữ liệu thời gian thực qua WebSocket lên Dashboard
    SocketService.emitTelemetry({
      device_id: deviceCode,
      device_db_id: device.id,
      zone_name: device.zone.name,
      temperature: temp,
      humidity_air: rh,
      gas_ppm: gas,
      estimated_emc: estimatedEmc,
      fan_state: isFanOn ? 'ON' : 'OFF',
      buzzer_state: ruleResult.risk_level === 'HIGH_RISK' ? 'ON' : 'OFF',
      risk_level: ruleResult.risk_level,
      timestamp: Date.now(),
    });

    SocketService.emitDeviceStatus({
      device_id: deviceCode,
      device_db_id: device.id,
      state: 'ONLINE',
      lifecycle_state: updatedLifecycle,
      is_online: true,
      last_seen_at: new Date().toISOString(),
    });
  }

  /**
   * 2. XỬ LÝ BẢN TIN STATUS & LWT HEARTBEAT
   */
  private static async handleStatus(deviceCode: string, payload: any): Promise<void> {
    const { state, fw_version, hw_version, reason } = payload;

    const device = await prisma.device.findUnique({
      where: { device_code: deviceCode },
      include: { zone: true },
    });

    if (!device) return;

    if (state === 'OFFLINE') {
      console.warn(`⚠️ [MQTTService] Thiết bị OFFLINE qua LWT: ${deviceCode} (Lý do: ${reason || 'Mất kết nối'})`);

      await prisma.device.update({
        where: { id: device.id },
        data: {
          is_online: false,
          lifecycle_state: device.lifecycle_state === LifecycleState.ACTIVE ? LifecycleState.OFFLINE : device.lifecycle_state,
        },
      });

      // Tạo cảnh báo mất kết nối
      const offlineAlert = await prisma.alert.create({
        data: {
          device_id: device.id,
          zone_id: device.zone_id,
          alert_type: AlertType.DEVICE_OFFLINE,
          severity: AlertSeverity.WARNING,
          message: `Thiết bị ${deviceCode} mất kết nối mạng (LWT Timeout / Disconnect)`,
          trigger_value: 0,
        },
        include: {
          device: { select: { device_code: true, name: true } },
          zone: { select: { name: true } },
        },
      });

      SocketService.emitNewAlert(offlineAlert);
      SocketService.emitDeviceStatus({
        device_id: deviceCode,
        device_db_id: device.id,
        state: 'OFFLINE',
        is_online: false,
        lifecycle_state: LifecycleState.OFFLINE,
      });
    } else if (state === 'ONLINE') {
      await prisma.device.update({
        where: { id: device.id },
        data: {
          is_online: true,
          last_seen_at: new Date(),
          fw_version: fw_version || device.fw_version,
          hw_version: hw_version || device.hw_version,
          lifecycle_state: device.lifecycle_state === LifecycleState.OFFLINE ? LifecycleState.ACTIVE : device.lifecycle_state,
        },
      });

      SocketService.emitDeviceStatus({
        device_id: deviceCode,
        device_db_id: device.id,
        state: 'ONLINE',
        is_online: true,
        fw_version: fw_version || device.fw_version,
        hw_version: hw_version || device.hw_version,
        last_seen_at: new Date().toISOString(),
      });
    } else if (state === 'FAULT') {
      console.warn(`⚠️ [MQTTService] Thiết bị báo lỗi cảm biến/phần cứng (FAULT): ${deviceCode} - ${reason || 'Lỗi I2C SHT31'}`);
      await prisma.device.update({
        where: { id: device.id },
        data: { lifecycle_state: LifecycleState.FAULT },
      });

      const faultAlert = await prisma.alert.create({
        data: {
          device_id: device.id,
          zone_id: device.zone_id,
          alert_type: AlertType.DEVICE_OFFLINE,
          severity: AlertSeverity.CRITICAL,
          message: `Thiết bị ${deviceCode} gặp sự cố phần cứng (FAULT): ${reason || 'Lỗi cảm biến I2C/SHT31'}`,
          trigger_value: 0,
        },
        include: {
          device: { select: { device_code: true, name: true } },
          zone: { select: { name: true } },
        },
      });

      SocketService.emitNewAlert(faultAlert);
      SocketService.emitDeviceStatus({
        device_id: deviceCode,
        device_db_id: device.id,
        state: 'FAULT',
        lifecycle_state: LifecycleState.FAULT,
        reason: reason || 'Lỗi cảm biến',
      });
    }
  }

  /**
   * 3. XỬ LÝ PHẢN HỒI LỆNH (ACK)
   */
  private static async handleAck(deviceCode: string, payload: any): Promise<void> {
    const { cmd_id, status, message, current_actuators } = payload;

    if (!cmd_id) return;

    // Hủy bỏ bộ hẹn giờ timeout retry
    if (this.pendingCommandTimers.has(cmd_id)) {
      clearTimeout(this.pendingCommandTimers.get(cmd_id)!);
      this.pendingCommandTimers.delete(cmd_id);
    }

    const command = await prisma.deviceCommand.findUnique({
      where: { cmd_id },
    });

    if (command) {
      const updatedCommand = await prisma.deviceCommand.update({
        where: { cmd_id },
        data: {
          status: status === 'SUCCESS' ? CommandStatus.SUCCESS : CommandStatus.FAILED,
          executed_at: new Date(),
        },
      });

      console.log(`✅ [MQTTService] Nhận ACK cho lệnh ${cmd_id} từ ${deviceCode}: ${status}`);

      // Bắn WebSocket thông báo lên Web Dashboard
      SocketService.emitCommandUpdate({
        cmd_id,
        device_id: deviceCode,
        status: updatedCommand.status,
        message: message || '',
        current_actuators: current_actuators || {},
      });
    }
  }

  /**
   * 4. PHÁT LỆNH ĐIỀU KHIỂN XUỐNG THIẾT BỊ VÀ QUẢN LÝ RETRY / TIMEOUT
   */
  static async publishCommand(
    deviceDbId: string,
    deviceCode: string,
    commandType: string,
    payloadData: any,
    issuedById?: string
  ): Promise<string> {
    const cmdId = `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // Mặc định issued_by là tài khoản admin hệ thống nếu chạy tự động từ Rule Engine
    let actorId = issuedById;
    if (!actorId) {
      const systemAdmin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
      actorId = systemAdmin ? systemAdmin.id : '';
    }

    // Lưu bản ghi vào bảng device_commands ở trạng thái PENDING
    await prisma.deviceCommand.create({
      data: {
        cmd_id: cmdId,
        device_id: deviceDbId,
        issued_by_id: actorId,
        command_type: commandType,
        payload_json: payloadData,
        status: CommandStatus.PENDING,
        retry_count: 0,
      },
    });

    const commandMessage = {
      cmd_id: cmdId,
      device_id: deviceCode,
      issued_by: actorId,
      timestamp: Date.now(),
      type: commandType,
      payload: payloadData,
    };

    const topic = `grain/devices/${deviceCode}/cmd`;
    this.client?.publish(topic, JSON.stringify(commandMessage), { qos: 1 });

    // Thiết lập cơ chế kiểm tra Timeout (8 giây không nhận được ACK)
    this.setupCommandTimeout(cmdId, deviceDbId, deviceCode, topic, commandMessage, 0);

    return cmdId;
  }

  /**
   * Hẹn giờ kiểm tra ACK và tự động Retry tối đa 2 lần
   */
  private static setupCommandTimeout(
    cmdId: string,
    deviceDbId: string,
    deviceCode: string,
    topic: string,
    message: any,
    retryCount: number
  ): void {
    const MAX_RETRIES = 2;
    const TIMEOUT_MS = 8000;

    const timer = setTimeout(async () => {
      this.pendingCommandTimers.delete(cmdId);

      const cmd = await prisma.deviceCommand.findUnique({ where: { cmd_id: cmdId } });
      if (!cmd || cmd.status !== CommandStatus.PENDING) return;

      if (retryCount < MAX_RETRIES) {
        console.warn(`🔄 [MQTTService] Lệnh ${cmdId} hết hạn chờ ACK. Đang thử lại lần ${retryCount + 1}...`);
        await prisma.deviceCommand.update({
          where: { cmd_id: cmdId },
          data: { retry_count: retryCount + 1 },
        });

        this.client?.publish(topic, JSON.stringify(message), { qos: 1 });
        this.setupCommandTimeout(cmdId, deviceDbId, deviceCode, topic, message, retryCount + 1);
      } else {
        console.error(`❌ [MQTTService] Lệnh ${cmdId} quá hạn phản hồi (TIMEOUT) sau ${MAX_RETRIES} lần thử lại.`);
        await prisma.deviceCommand.update({
          where: { cmd_id: cmdId },
          data: { status: CommandStatus.TIMEOUT },
        });

        SocketService.emitCommandUpdate({
          cmd_id: cmdId,
          device_id: deviceCode,
          status: CommandStatus.TIMEOUT,
          message: 'Lệnh điều khiển hết thời gian chờ phản hồi (TIMEOUT)',
        });
      }
    }, TIMEOUT_MS);

    this.pendingCommandTimers.set(cmdId, timer);
  }

  /**
   * 5. ĐỊNH KỲ QUÉT PHÁT HIỆN MẤT HEARTBEAT (Mục 4.3 Bước 6)
   * Tự động chuyển thiết bị sang OFFLINE nếu quá 45 giây không nhận được tin nhắn
   */
  private static startHeartbeatMonitor(): void {
    setInterval(async () => {
      try {
        const timeoutLimit = new Date(Date.now() - 45 * 1000); // 45 giây trước

        const staleDevices = await prisma.device.findMany({
          where: {
            is_online: true,
            lifecycle_state: LifecycleState.ACTIVE,
            last_seen_at: { lt: timeoutLimit },
          },
          include: { zone: true },
        });

        for (const dev of staleDevices) {
          console.warn(`⚠️ [MQTTService] Thiết bị ${dev.device_code} quá 45s không có tín hiệu -> Chuyển OFFLINE`);

          await prisma.device.update({
            where: { id: dev.id },
            data: { is_online: false, lifecycle_state: LifecycleState.OFFLINE },
          });

          const offlineAlert = await prisma.alert.create({
            data: {
              device_id: dev.id,
              zone_id: dev.zone_id,
              alert_type: AlertType.DEVICE_OFFLINE,
              severity: AlertSeverity.WARNING,
              message: `Thiết bị ${dev.device_code} không gửi Heartbeat quá 45 giây (OFFLINE)`,
              trigger_value: 0,
            },
            include: {
              device: { select: { device_code: true, name: true } },
              zone: { select: { name: true } },
            },
          });

          SocketService.emitNewAlert(offlineAlert);
          SocketService.emitDeviceStatus({
            device_id: dev.device_code,
            device_db_id: dev.id,
            state: 'OFFLINE',
            is_online: false,
            lifecycle_state: LifecycleState.OFFLINE,
          });
        }
      } catch (err) {
        console.error('[MQTTService] Lỗi quét Heartbeat Timeout:', err);
      }
    }, 15000); // Quét mỗi 15 giây
  }
}

