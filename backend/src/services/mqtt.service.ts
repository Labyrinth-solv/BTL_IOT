import mqtt, { MqttClient } from 'mqtt';
import { ENV } from '../config/env';
import prisma from '../config/prisma';
import { EMCService } from './emc.service';
import { RuleEngineService } from './ruleEngine.service';
import { SocketService } from './socket.service';
import { TelegramService } from './telegram.service';
import { AuditService } from './audit.service';
import { DeviceCommandError, validateDeviceConfig } from './deviceConfig';
import { LifecycleState, CommandStatus, AlertType, AlertSeverity } from '@prisma/client';

export interface DeviceDiagnostics {
  sensor_health: any;
  door_open?: boolean;
  control_mode?: string;
  fan_state?: 'ON' | 'OFF';
  buzzer_state?: 'ON' | 'OFF';
  outputs_inhibited?: boolean;
  registration_id?: string;
  custom_peripherals?: any[];
  ip_address?: string;
  mac_address?: string;
  chip_id?: string;
  rssi?: number;
  fw_version?: string;
  hw_version?: string;
  updated_at: number;
}

export interface UnregisteredNodeInfo {
  device_code: string;
  ip_address?: string;
  mac_address?: string;
  chip_id?: string;
  rssi?: number;
  fw_version?: string;
  hw_version?: string;
  sensor_health?: any;
  first_seen_at: number;
  last_seen_at: number;
  last_channel: 'telemetry' | 'status';
}

export class MQTTService {
  private static client: MqttClient | null = null;
  private static pendingDeviceCommands = new Map<string, string>();
  private static synchronizedDevices = new Set<string>();
  private static messageQueues = new Map<string, Promise<void>>();
  private static pendingCommandTimers: Map<string, NodeJS.Timeout> = new Map();
  private static deviceDiagnostics: Map<string, DeviceDiagnostics> = new Map();
  private static unregisteredNodes: Map<string, UnregisteredNodeInfo> = new Map();
  private static removingNodes = new Set<string>();
  private static shutdownWaiters = new Map<string, (error?: DeviceCommandError) => void>();

  // Hold the node lock until the database deletion has completed, including after ACK.
  static async withDeactivatedNode(device: any, actorId: string, remove: () => Promise<void>): Promise<void> {
    const code = device.device_code;
    if (this.removingNodes.has(code)) throw new DeviceCommandError('Node đang được xóa; vui lòng chờ', 409);
    this.removingNodes.add(code);
    let timer: NodeJS.Timeout | undefined;
    try {
      const outcome = new Promise<DeviceCommandError | undefined>(resolve => this.shutdownWaiters.set(code, resolve));
      await this.publishCommand(device.id, code, 'DEACTIVATE_NODE', {}, actorId);
      timer = setTimeout(() => this.shutdownWaiters.get(code)?.(
        new DeviceCommandError('Chưa xác nhận được mạch đã tắt đầu ra; chưa xóa node', 504)), 28000);
      const error = await outcome;
      if (error) throw error;
      await remove();
    } finally {
      clearTimeout(timer);
      this.shutdownWaiters.delete(code);
      this.removingNodes.delete(code);
    }
  }

  static getDeviceDiagnostics(deviceCode: string): DeviceDiagnostics | null {
    return this.deviceDiagnostics.get(deviceCode) || null;
  }

  static clearDeviceDiagnostics(deviceCode: string): void {
    this.deviceDiagnostics.delete(deviceCode);
    this.synchronizedDevices.delete(deviceCode);
  }

  static getDiscoveredNodes(): UnregisteredNodeInfo[] {
    return Array.from(this.unregisteredNodes.values()).sort(
      (a, b) => b.last_seen_at - a.last_seen_at
    );
  }

  static removeDiscoveredNode(deviceCode: string): void {
    this.unregisteredNodes.delete(deviceCode);
  }

  private static recordUnregisteredNode(
    deviceCode: string,
    payload: any,
    channel: 'telemetry' | 'status'
  ): void {
    const prev = this.unregisteredNodes.get(deviceCode);
    const now = Date.now();
    const info: UnregisteredNodeInfo = {
      device_code: deviceCode,
      ip_address: payload?.ip_address || prev?.ip_address,
      mac_address: payload?.mac_address || prev?.mac_address,
      chip_id: payload?.chip_id || prev?.chip_id,
      rssi: typeof payload?.rssi === 'number' ? payload.rssi : prev?.rssi,
      fw_version: payload?.fw_version || prev?.fw_version,
      hw_version: payload?.hw_version || prev?.hw_version,
      sensor_health: payload?.sensor_health || prev?.sensor_health,
      first_seen_at: prev?.first_seen_at || now,
      last_seen_at: now,
      last_channel: channel,
    };
    this.unregisteredNodes.set(deviceCode, info);
    SocketService.emitDeviceDiscovered(info);
  }

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

    this.client.on('message', (topic: string, messageBuffer: Buffer, packet) => {
      let payload: any;
      try { payload = JSON.parse(messageBuffer.toString()); }
      catch { console.warn(`[MQTTService] JSON không hợp lệ trên ${topic}`); return; }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;
      // A retained ONLINE message is not proof that a node is currently connected.
      if (packet.retain && topic.endsWith('/status') && payload.state === 'ONLINE') return;
      const key = topic.split('/')[2];
      const task = (this.messageQueues.get(key) || Promise.resolve())
        .then(() => this.routeMessage(topic, payload))
        .catch(err => console.error(`[MQTTService] Xử lý ${topic} thất bại:`, err));
      this.messageQueues.set(key, task);
      void task.then(() => { if (this.messageQueues.get(key) === task) this.messageQueues.delete(key); });
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
    if (this.removingNodes.has(deviceCode)) return;
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
      this.recordUnregisteredNode(deviceCode, payload, 'telemetry');
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

    // D2. Trích xuất trạng thái nhận diện cảm biến (sensor_health), module đang bật/tắt & cửa kho
    const cfg = (device.config_json as any) || {};
    const periph = cfg.peripherals || {};
    const ahtEnabled = periph.aht20_enabled !== false;
    const mqEnabled = periph.mq135_enabled === true;
    const doorEnabled = periph.door_enabled !== false;
    const fanEnabled = periph.fan_enabled !== false;
    const fanAuto = periph.fan_auto !== false;
    const buzzerEnabled = periph.buzzer_enabled !== false;

    const rawHealth = payload.sensor_health || null;
    const aht20Disabled = !ahtEnabled || rawHealth?.aht20?.status === 'DISABLED';
    const mq135Disabled = !mqEnabled || rawHealth?.mq135?.status === 'DISABLED';

    const aht20Ok: boolean = !aht20Disabled && (rawHealth?.aht20?.ok ?? true);
    const mq135Ok: boolean = !mq135Disabled && (rawHealth?.mq135?.ok ?? true);
    const doorOpen: boolean = doorEnabled
      ? metrics.door_sensor?.is_open ??
        (actuators?.door_state === 'OPEN' || actuators?.door_open === 'OPEN')
      : false;

    const normalizedHealth = rawHealth
      ? {
          ...rawHealth,
          aht20: rawHealth.aht20
            ? {
                ...rawHealth.aht20,
                enabled: ahtEnabled,
                ok: aht20Ok,
                status: !ahtEnabled ? 'DISABLED' : rawHealth.aht20.status,
              }
            : undefined,
          mq135: rawHealth.mq135
            ? {
                ...rawHealth.mq135,
                enabled: mqEnabled,
                ok: mq135Ok,
                status: !mqEnabled ? 'DISABLED' : rawHealth.mq135.status,
              }
            : undefined,
          door_sensor: rawHealth.door_sensor
            ? {
                ...rawHealth.door_sensor,
                enabled: doorEnabled,
                ok: doorEnabled,
                status: !doorEnabled ? 'DISABLED' : rawHealth.door_sensor.status,
              }
            : undefined,
          fault_count:
            (aht20Disabled || aht20Ok ? 0 : 1) + (mq135Disabled || mq135Ok ? 0 : 1),
          updated_at: Date.now(),
        }
      : null;

    const prevDiag = this.deviceDiagnostics.get(deviceCode);
    const resolvedIp = payload.ip_address || prevDiag?.ip_address;
    const resolvedMac = payload.mac_address || prevDiag?.mac_address;
    const resolvedChipId = payload.chip_id || prevDiag?.chip_id;
    const resolvedRssi = typeof payload.rssi === 'number' ? payload.rssi : prevDiag?.rssi;
    const customPeripherals = Array.isArray(payload.custom_peripherals)
      ? payload.custom_peripherals
      : [];

    this.deviceDiagnostics.set(deviceCode, {
      sensor_health: normalizedHealth,
      door_open: doorOpen,
      control_mode: actuators?.control_mode || 'AUTO',
      fan_state: actuators?.fan_state,
      buzzer_state: actuators?.buzzer_state,
      outputs_inhibited: actuators?.outputs_inhibited,
      registration_id: payload.registration_id,
      custom_peripherals: customPeripherals,
      ip_address: resolvedIp,
      mac_address: resolvedMac,
      chip_id: resolvedChipId,
      rssi: resolvedRssi,
      fw_version: payload.fw_version || prevDiag?.fw_version,
      hw_version: payload.hw_version || prevDiag?.hw_version,
      updated_at: Date.now(),
    });

    // E. Đánh giá qua Rule Engine (chỉ tính ngưỡng trên cảm biến đang bật & hoạt động bình thường)
    const ruleResult = RuleEngineService.evaluate({
      temperature: temp,
      humidity_air: rh,
      gas_ppm: gas,
      estimated_emc: estimatedEmc,
      custom_config: device.config_json,
      aht20_ok: aht20Ok,
      mq135_ok: mq135Ok,
    });

    const isFanOn =
      fanEnabled && actuators?.fan_state === 'ON';

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
      device.lifecycle_state === LifecycleState.REGISTERED ||
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
      // Tránh spam cảnh báo: trong môi trường dev/demo giãn cách 30 giây (production là 5 phút)
      const antiSpamWindowMs = process.env.NODE_ENV === 'production' ? 5 * 60 * 1000 : 30 * 1000;
      const recentWindow = new Date(Date.now() - antiSpamWindowMs);
      const recentAlert = await prisma.alert.findFirst({
        where: {
          device_id: device.id,
          alert_type: ruleResult.alert_type,
          status: 'NEW',
          created_at: { gte: recentWindow },
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

    // H2. Tạo / Tự động đóng cảnh báo lỗi phần cứng cảm biến nếu có sensor_health
    if (normalizedHealth) {
      await this.handleSensorHealthAlerts(device, deviceCode, normalizedHealth);
    }

    // AUTO belongs to the edge. The server must not countermand local safety logic.
    const controlMode = actuators?.control_mode || (fanAuto ? 'AUTO' : 'MANUAL');

    const isBuzzerOn =
      buzzerEnabled && actuators?.buzzer_state === 'ON';

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
      buzzer_state: isBuzzerOn ? 'ON' : 'OFF',
      door_open: doorOpen,
      control_mode: controlMode,
      sensor_health: normalizedHealth,
      custom_peripherals: customPeripherals,
      ip_address: resolvedIp,
      mac_address: resolvedMac,
      chip_id: resolvedChipId,
      rssi: resolvedRssi,
      risk_level: ruleResult.risk_level,
      timestamp: Date.now(),
    });

    SocketService.emitDeviceStatus({
      device_id: deviceCode,
      device_db_id: device.id,
      state: 'ONLINE',
      lifecycle_state: updatedLifecycle,
      is_online: true,
      ip_address: resolvedIp,
      mac_address: resolvedMac,
      chip_id: resolvedChipId,
      rssi: resolvedRssi,
      last_seen_at: new Date().toISOString(),
    });
    await this.synchronizeConfig(device);
  }

  /**
   * Tự động tạo hoặc đóng cảnh báo khi phát hiện cảm biến không nhận diện được / kết nối lại
   */
  private static async handleSensorHealthAlerts(
    device: any,
    deviceCode: string,
    sensorHealth: any
  ): Promise<void> {
    const failures: string[] = [];

    if (
      sensorHealth.aht20 &&
      sensorHealth.aht20.enabled !== false &&
      sensorHealth.aht20.status !== 'DISABLED' &&
      sensorHealth.aht20.ok === false
    ) {
      failures.push(
        `AHT20 (${sensorHealth.aht20.status || 'ERROR'}): ${
          sensorHealth.aht20.message || 'Không nhận diện được cảm biến nhiệt ẩm I2C 0x38'
        }`
      );
    }

    if (
      sensorHealth.mq135 &&
      sensorHealth.mq135.enabled !== false &&
      sensorHealth.mq135.status !== 'DISABLED' &&
      sensorHealth.mq135.ok === false
    ) {
      const adcInfo =
        sensorHealth.mq135.raw_adc !== undefined ? `, ADC=${sensorHealth.mq135.raw_adc}` : '';
      failures.push(
        `MQ-135 (${sensorHealth.mq135.status || 'ERROR'}${adcInfo}): ${
          sensorHealth.mq135.message || 'Không nhận diện được tín hiệu cảm biến gas'
        }`
      );
    }

    const prefix = `[Lỗi cảm biến] ${deviceCode}`;

    if (failures.length > 0) {
      const fullMessage = `${prefix}: ${failures.join(' | ')}`;

      const activeAlert = await prisma.alert.findFirst({
        where: {
          device_id: device.id,
          alert_type: AlertType.DEVICE_OFFLINE,
          status: { in: ['NEW', 'ACKNOWLEDGED'] },
          message: { startsWith: prefix },
        },
        orderBy: { created_at: 'desc' },
      });

      if (!activeAlert) {
        const recentResolvedWindow = new Date(Date.now() - 2 * 60 * 1000);
        const recentlyResolved = await prisma.alert.findFirst({
          where: {
            device_id: device.id,
            alert_type: AlertType.DEVICE_OFFLINE,
            message: { startsWith: prefix },
            created_at: { gte: recentResolvedWindow },
          },
        });

        if (!recentlyResolved) {
          console.warn(`⚠️ [SensorHealth] ${fullMessage}`);
          const sensorAlert = await prisma.alert.create({
            data: {
              device_id: device.id,
              zone_id: device.zone_id,
              alert_type: AlertType.DEVICE_OFFLINE,
              severity: AlertSeverity.CRITICAL,
              message: fullMessage,
              trigger_value: failures.length,
            },
            include: {
              device: { select: { device_code: true, name: true } },
              zone: { select: { name: true } },
            },
          });
          SocketService.emitNewAlert(sensorAlert);
        }
      } else if (activeAlert.status === 'NEW' && activeAlert.message !== fullMessage) {
        const updatedAlert = await prisma.alert.update({
          where: { id: activeAlert.id },
          data: { message: fullMessage, trigger_value: failures.length },
          include: {
            device: { select: { device_code: true, name: true } },
            zone: { select: { name: true } },
          },
        });
        SocketService.emitAlertUpdate(updatedAlert);
      }
      return;
    }

    // Tất cả cảm biến đều OK -> tự động đóng cảnh báo lỗi cảm biến đang mở (NEW)
    const openSensorAlerts = await prisma.alert.findMany({
      where: {
        device_id: device.id,
        alert_type: AlertType.DEVICE_OFFLINE,
        status: 'NEW',
        message: { startsWith: prefix },
      },
    });

    for (const openAlert of openSensorAlerts) {
      const resolved = await prisma.alert.update({
        where: { id: openAlert.id },
        data: {
          status: 'RESOLVED',
          resolved_at: new Date(),
          ack_note: 'Cảm biến đã được nhận diện lại bình thường',
        },
        include: {
          device: { select: { device_code: true, name: true } },
          zone: { select: { name: true } },
        },
      });
      SocketService.emitAlertUpdate(resolved);
    }
  }

  /**
   * 2. XỬ LÝ BẢN TIN STATUS & LWT HEARTBEAT
   */
  private static async handleStatus(deviceCode: string, payload: any): Promise<void> {
    if (this.removingNodes.has(deviceCode)) return;
    const { state, fw_version, hw_version, reason } = payload;

    const device = await prisma.device.findUnique({
      where: { device_code: deviceCode },
      include: { zone: true },
    });

    if (!device) {
      if (state !== 'OFFLINE') {
        console.warn(`[MQTTService] Heartbeat từ thiết bị chưa đăng ký: ${deviceCode}`);
        this.recordUnregisteredNode(deviceCode, payload, 'status');
      }
      return;
    }

    if ([LifecycleState.SUSPENDED, LifecycleState.DECOMMISSIONED].includes(device.lifecycle_state as any)) {
      this.clearDeviceDiagnostics(deviceCode);
      return;
    }

    if (state === 'OFFLINE') {
      console.warn(`⚠️ [MQTTService] Thiết bị OFFLINE qua LWT: ${deviceCode} (Lý do: ${reason || 'Mất kết nối'})`);

      this.clearDeviceDiagnostics(deviceCode);

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
        lifecycle_state: device.lifecycle_state === LifecycleState.ACTIVE ? LifecycleState.OFFLINE : device.lifecycle_state,
      });
    } else if (state === 'ONLINE') {
      const prevDiag = this.deviceDiagnostics.get(deviceCode);
      const resolvedIp = payload.ip_address || prevDiag?.ip_address;
      const resolvedMac = payload.mac_address || prevDiag?.mac_address;
      const resolvedChipId = payload.chip_id || prevDiag?.chip_id;
      const resolvedRssi = typeof payload.rssi === 'number' ? payload.rssi : prevDiag?.rssi;

      this.deviceDiagnostics.set(deviceCode, {
        sensor_health: prevDiag?.sensor_health ?? null,
        door_open: prevDiag?.door_open,
        control_mode: prevDiag?.control_mode,
        fan_state: prevDiag?.fan_state,
        buzzer_state: prevDiag?.buzzer_state,
        outputs_inhibited: payload.outputs_inhibited ?? prevDiag?.outputs_inhibited,
        registration_id: payload.registration_id ?? prevDiag?.registration_id,
        custom_peripherals: prevDiag?.custom_peripherals,
        ip_address: resolvedIp,
        mac_address: resolvedMac,
        chip_id: resolvedChipId,
        rssi: resolvedRssi,
        fw_version: fw_version || prevDiag?.fw_version,
        hw_version: hw_version || prevDiag?.hw_version,
        updated_at: Date.now(),
      });

      const updatedLifecycle =
        device.lifecycle_state === LifecycleState.REGISTERED ||
        device.lifecycle_state === LifecycleState.PROVISIONED ||
        device.lifecycle_state === LifecycleState.OFFLINE
          ? LifecycleState.ACTIVE
          : device.lifecycle_state;

      await prisma.device.update({
        where: { id: device.id },
        data: {
          is_online: true,
          last_seen_at: new Date(),
          fw_version: fw_version || device.fw_version,
          hw_version: hw_version || device.hw_version,
          lifecycle_state: updatedLifecycle,
        },
      });

      SocketService.emitDeviceStatus({
        device_id: deviceCode,
        device_db_id: device.id,
        state: 'ONLINE',
        is_online: true,
        lifecycle_state: updatedLifecycle,
        fw_version: fw_version || device.fw_version,
        hw_version: hw_version || device.hw_version,
        ip_address: resolvedIp,
        mac_address: resolvedMac,
        chip_id: resolvedChipId,
        rssi: resolvedRssi,
        last_seen_at: new Date().toISOString(),
      });
      await this.synchronizeConfig({ ...device, is_online: true });
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
    const { cmd_id, current_actuators } = payload;
    let { status, message } = payload;
    if (!cmd_id || !['SUCCESS', 'FAILED'].includes(status)) return;
    const command = await prisma.deviceCommand.findUnique({ where: { cmd_id } });
    const device = await prisma.device.findUnique({ where: { device_code: deviceCode } });
    if (!command || !device || command.device_id !== device.id || command.status !== CommandStatus.PENDING ||
        this.pendingDeviceCommands.get(deviceCode) !== cmd_id ||
        (payload.device_id && payload.device_id !== deviceCode) ||
        (command.command_type !== 'DEACTIVATE_NODE' &&
          [LifecycleState.SUSPENDED, LifecycleState.DECOMMISSIONED].includes(device.lifecycle_state as any))) return;

    if (command.command_type === 'DEACTIVATE_NODE' && status === 'SUCCESS') {
      const relays = current_actuators?.custom_peripherals;
      const expectedRelays = (device.config_json as any)?.custom_peripherals?.filter((cp: any) => cp.type === 'RELAY_OUTPUT') || [];
      if (payload.registration_id !== device.id || current_actuators?.outputs_inhibited !== true ||
          current_actuators?.fan_state !== 'OFF' || current_actuators?.buzzer_state !== 'OFF' ||
          !relays || typeof relays !== 'object' || Array.isArray(relays) ||
          Object.values(relays).some(state => state !== 'OFF') ||
          expectedRelays.some((cp: any) => relays[cp.id] !== 'OFF')) {
        status = 'FAILED';
        message = 'Mạch chưa xác nhận đã tắt và khóa toàn bộ đầu ra; cần firmware hỗ trợ DEACTIVATE_NODE. Chưa xóa node';
      }
    }

    let config: any = device.config_json;
    if (status === 'SUCCESS') {
      if (command.command_type === 'UPDATE_CONFIG') config = validateDeviceConfig(command.payload_json);
      else if ((command.payload_json as any)?.target === 'VENTILATION_FAN') {
        const mode = current_actuators?.control_mode;
        if (mode === 'AUTO' || mode === 'MANUAL') config = {
          ...config, peripherals: { ...config?.peripherals, fan_auto: mode === 'AUTO' },
        };
      }
    }
    const applied = await prisma.$transaction(async tx => {
      const changed = await tx.deviceCommand.updateMany({
        where: { cmd_id, status: CommandStatus.PENDING },
        data: { status, executed_at: new Date() },
      });
      if (!changed.count) return false;
      if (status === 'SUCCESS') await tx.device.update({ where: { id: device.id }, data: { config_json: config } });
      return true;
    });
    if (!applied) return;
    clearTimeout(this.pendingCommandTimers.get(cmd_id));
    this.pendingCommandTimers.delete(cmd_id);
    if (this.pendingDeviceCommands.get(deviceCode) === cmd_id) this.pendingDeviceCommands.delete(deviceCode);
    if (status === 'FAILED') this.synchronizedDevices.delete(deviceCode);
    else if (command.command_type === 'UPDATE_CONFIG') this.synchronizedDevices.add(deviceCode);
    if (status === 'SUCCESS') {
      const previous = this.deviceDiagnostics.get(deviceCode);
      this.deviceDiagnostics.set(deviceCode, {
        ...previous, sensor_health: previous?.sensor_health ?? null,
        fan_state: current_actuators?.fan_state ?? previous?.fan_state,
        buzzer_state: current_actuators?.buzzer_state ?? previous?.buzzer_state,
        outputs_inhibited: current_actuators?.outputs_inhibited ?? previous?.outputs_inhibited,
        registration_id: payload.registration_id ?? previous?.registration_id,
        control_mode: current_actuators?.control_mode ?? previous?.control_mode,
        custom_peripherals: previous?.custom_peripherals?.map(cp => {
          const state = current_actuators?.custom_peripherals?.[cp.id];
          return state ? { ...cp, state, value: state === 'ON' ? 1 : 0 } : cp;
        }),
        updated_at: Date.now(),
      });
    }
    SocketService.emitCommandUpdate({
      cmd_id, device_id: deviceCode, status, message: message || '',
      current_actuators: status === 'SUCCESS' ? current_actuators || {} : {},
      ...(status === 'SUCCESS' ? { config_json: config } : {}),
    });
    if (command.command_type === 'DEACTIVATE_NODE') {
      this.shutdownWaiters.get(deviceCode)?.(status === 'SUCCESS' ? undefined :
        new DeviceCommandError(message || 'Mạch từ chối tắt đầu ra; chưa xóa node', 409));
    }
  }

  private static async synchronizeConfig(device: any): Promise<void> {
    const diag = this.deviceDiagnostics.get(device.device_code);
    if (this.removingNodes.has(device.device_code) || this.synchronizedDevices.has(device.device_code) ||
        this.pendingDeviceCommands.has(device.device_code) ||
        (diag?.outputs_inhibited && diag.registration_id === device.id)) return;
    try {
      await this.publishCommand(device.id, device.device_code, 'UPDATE_CONFIG', validateDeviceConfig({}, device.config_json));
    } catch (error) {
      console.warn(`[MQTTService] Chưa đồng bộ được ${device.device_code}: ${(error as Error).message}`);
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
    if (!this.client?.connected) throw new DeviceCommandError('MQTT chưa kết nối; chưa gửi lệnh xuống mạch', 503);
    const device = await prisma.device.findUnique({ where: { id: deviceDbId } });
    if (!device || (commandType !== 'DEACTIVATE_NODE' && (!device.is_online ||
        [LifecycleState.SUSPENDED, LifecycleState.DECOMMISSIONED].includes(device.lifecycle_state as any)))) {
      throw new DeviceCommandError('Thiết bị đang ngoại tuyến hoặc bị khóa', 409);
    }
    if (commandType !== 'DEACTIVATE_NODE' && (this.removingNodes.has(deviceCode) || this.deviceDiagnostics.get(deviceCode)?.outputs_inhibited)) {
      // Re-enrollment uses a new database UUID. Only its configuration may release the latch.
      const diag = this.deviceDiagnostics.get(deviceCode);
      if (this.removingNodes.has(deviceCode) || commandType !== 'UPDATE_CONFIG' || diag?.registration_id === deviceDbId) {
        throw new DeviceCommandError('Đầu ra node đã bị khóa để xóa; cần đăng ký lại node trước khi điều khiển', 409);
      }
    }
    if (this.pendingDeviceCommands.has(deviceCode)) throw new DeviceCommandError('Thiết bị đang xử lý lệnh trước; vui lòng chờ ACK', 409);
    const cmdId = `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    this.pendingDeviceCommands.set(deviceCode, cmdId);
    try {
      // Mặc định issued_by là tài khoản admin hệ thống nếu chạy tự động từ Rule Engine
      let actorId = issuedById;
      if (!actorId) {
        const systemAdmin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
        if (!systemAdmin) throw new DeviceCommandError('Chưa có tài khoản Admin hệ thống', 503);
        actorId = systemAdmin.id;
      }

      const commandMessage = {
        cmd_id: cmdId,
        device_id: deviceCode,
        registration_id: deviceDbId,
        issued_by: actorId,
        timestamp: Date.now(),
        type: commandType,
        payload: payloadData,
      };

      const topic = `grain/devices/${deviceCode}/cmd`;
      if (Buffer.byteLength(JSON.stringify(commandMessage)) + Buffer.byteLength(topic) + 7 > 8192) {
        throw new DeviceCommandError('Cấu hình quá lớn cho bộ đệm MQTT của ESP32');
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

      this.client?.publish(topic, JSON.stringify(commandMessage), { qos: 1 });

      // Thiết lập cơ chế kiểm tra Timeout (8 giây không nhận được ACK)
      this.setupCommandTimeout(cmdId, deviceDbId, deviceCode, topic, commandMessage, 0);

      return cmdId;
    } catch (error) {
      this.pendingDeviceCommands.delete(deviceCode);
      throw error;
    }
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
      try {
        if (this.pendingDeviceCommands.get(deviceCode) !== cmdId) return;
        const changes = await prisma.deviceCommand.updateMany({
          where: { cmd_id: cmdId, status: CommandStatus.PENDING },
          data: retryCount < MAX_RETRIES
            ? { retry_count: retryCount + 1 }
            : { status: CommandStatus.TIMEOUT },
        });
        // An ACK can complete the command while this timer awaits the database.
        if (!changes.count || this.pendingDeviceCommands.get(deviceCode) !== cmdId) return;
        if (retryCount < MAX_RETRIES) {
          this.client?.publish(topic, JSON.stringify(message), { qos: 1 });
          this.setupCommandTimeout(cmdId, deviceDbId, deviceCode, topic, message, retryCount + 1);
        } else {
          this.pendingDeviceCommands.delete(deviceCode);
          this.synchronizedDevices.delete(deviceCode);
          SocketService.emitCommandUpdate({ cmd_id: cmdId, device_id: deviceCode,
            status: CommandStatus.TIMEOUT, message: 'Lệnh hết thời gian chờ ACK sau 2 lần thử lại' });
          this.shutdownWaiters.get(deviceCode)?.(new DeviceCommandError('Không nhận được ACK tắt đầu ra; chưa xóa node. Kiểm tra kết nối mạch', 504));
        }
      } catch (error) {
        console.error(`[MQTTService] Lỗi theo dõi lệnh ${cmdId}:`, error);
        this.pendingDeviceCommands.delete(deviceCode);
        this.synchronizedDevices.delete(deviceCode);
        SocketService.emitCommandUpdate({ cmd_id: cmdId, device_id: deviceCode,
          status: CommandStatus.FAILED, message: 'Máy chủ không xác minh được kết quả lệnh; vui lòng thử lại' });
        this.shutdownWaiters.get(deviceCode)?.(new DeviceCommandError('Máy chủ chưa xác minh được mạch đã tắt; chưa xóa node', 503));
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
            lifecycle_state: { notIn: [LifecycleState.SUSPENDED, LifecycleState.DECOMMISSIONED] },
            last_seen_at: { lt: timeoutLimit },
          },
          include: { zone: true },
        });

        for (const dev of staleDevices) {
          console.warn(`⚠️ [MQTTService] Thiết bị ${dev.device_code} quá 45s không có tín hiệu -> Chuyển OFFLINE`);

          this.clearDeviceDiagnostics(dev.device_code);

          await prisma.device.update({
            where: { id: dev.id },
            data: { is_online: false, lifecycle_state: dev.lifecycle_state === LifecycleState.ACTIVE ? LifecycleState.OFFLINE : dev.lifecycle_state },
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
            lifecycle_state: dev.lifecycle_state === LifecycleState.ACTIVE ? LifecycleState.OFFLINE : dev.lifecycle_state,
          });
        }
      } catch (err) {
        console.error('[MQTTService] Lỗi quét Heartbeat Timeout:', err);
      }
    }, 15000); // Quét mỗi 15 giây
  }
}

