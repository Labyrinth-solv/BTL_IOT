import mqtt, { MqttClient } from 'mqtt';
import http from 'http';
import dotenv from 'dotenv';
import { validateDeviceConfig } from '../backend/src/services/deviceConfig';
import { RuleEngineService } from '../backend/src/services/ruleEngine.service';
import { randomUUID } from 'crypto';
import * as fs from 'node:fs';
import { resolve } from 'node:path';

dotenv.config();

// =============================================================================
// CẤU HÌNH BỘ GIẢ LẬP (SIMULATOR CONFIGURATION)
// =============================================================================
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const SIMULATOR_PORT = parseInt(process.env.SIMULATOR_PORT || '4001', 10);

export type ScenarioType =
  | 'NORMAL'
  | 'HUMIDITY_SPIKE'
  | 'FERMENTATION_SPIKE'
  | 'DISCONNECT_LWT'
  | 'REVOKED_DEVICE_ATTACK';

interface SimulatedDevice {
  device_id: string;
  name: string;
  ip_address: string;
  fw_version: string;
  hw_version: string;
  fan_state: 'ON' | 'OFF';
  buzzer_state: 'ON' | 'OFF';
  control_mode: 'AUTO' | 'MANUAL';
  sampling_interval_ms: number;
}

// =============================================================================
// TRẠNG THÁI HIỆN TẠI CỦA THIẾT BỊ GIẢ LẬP
// =============================================================================
let currentScenario: ScenarioType = 'NORMAL';
let isRunning = true;
let isConnected = false;
let client: MqttClient | null = null;
let telemetryTimer: NodeJS.Timeout | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;
const startTime = Date.now();

const primaryDevice: SimulatedDevice = {
  device_id: process.env.SIMULATOR_DEVICE_ID || 'DEV_SILO_01',
  name: 'Cảm biến & Quạt Kho Silo A1',
  ip_address: '192.168.1.105',
  fw_version: 'sim-1.1.3',
  hw_version: 'ESP32-WROOM-32-v1',
  fan_state: 'OFF',
  buzzer_state: 'OFF',
  control_mode: 'AUTO',
  sampling_interval_ms: 3000,
};

let latestMetrics = {
  temperature: 23.5,
  humidity_air: 60.2,
  gas_ppm: 405.0,
  estimated_emc: 12.5,
};

let buzzerAuto = true;
let buzzerManualOverride = false;
let buzzerSilencedByUser = false;
let deviceConfig = validateDeviceConfig({});
let customRelayStates: Record<string, 'ON' | 'OFF'> = {};
const commandAcks = new Map<string, any>();
let currentRiskLevel: 'SAFE' | 'WARNING' | 'HIGH_RISK' = 'SAFE';
let outputsInhibited = false;
let registrationId = '';
const lifecyclePath = resolve(`runtime-simulator-${encodeURIComponent(primaryDevice.device_id)}-lifecycle.log`);

function persistLifecycle(nextRegistration: string, inhibited: boolean, config = deviceConfig) {
  const temporaryPath = `${lifecyclePath}.tmp.log`;
  fs.writeFileSync(temporaryPath, JSON.stringify({ registration_id: nextRegistration, outputs_inhibited: inhibited, config_json: config }));
  fs.renameSync(temporaryPath, lifecyclePath);
}

if (fs.existsSync(lifecyclePath)) {
  try {
    const saved = JSON.parse(fs.readFileSync(lifecyclePath, 'utf8'));
    if (typeof saved.outputs_inhibited !== 'boolean' || typeof saved.registration_id !== 'string') throw new Error('Invalid lifecycle');
    registrationId = saved.registration_id;
    outputsInhibited = saved.outputs_inhibited;
    deviceConfig = validateDeviceConfig(saved.config_json || {});
  } catch { outputsInhibited = true; }
}
primaryDevice.control_mode = deviceConfig.peripherals.fan_auto ? 'AUTO' : 'MANUAL';
primaryDevice.sampling_interval_ms = deviceConfig.sampling_interval_ms;
buzzerAuto = deviceConfig.peripherals.buzzer_auto;

// =============================================================================
// HÀM TÍNH TOÁN ĐỘ ẨM CÂN BẰNG (EMC) THEO HALSEY / TCVN 8370
// =============================================================================
function calculateEMC(tempC: number, rhPercent: number): number {
  const rhClamped = Math.max(1.0, Math.min(99.0, rhPercent));
  const rhDecimal = rhClamped / 100.0;
  try {
    const num = -Math.log(1 - rhDecimal);
    const den = 0.000105 * (tempC + 35.0);
    const emc = Math.pow(num / den, 1 / 2.0);
    return Math.round(emc * 10) / 10;
  } catch (e) {
    return Math.round((0.15 * rhPercent + 0.1 * tempC) * 10) / 10;
  }
}

// =============================================================================
// SINH DỮ LIỆU TELEMETRY THEO KỊCH BẢN
// =============================================================================
function generateMetrics(scenario: ScenarioType) {
  // Thêm độ nhiễu ngẫu nhiên thực tế (random noise)
  const noise = (min: number, max: number) => min + Math.random() * (max - min);

  switch (scenario) {
    case 'HUMIDITY_SPIKE':
      // Kịch bản 2: Nồm ẩm đột ngột >72% RH (Nguy cơ mốc cao)
      latestMetrics.temperature = Math.round(noise(24.0, 25.5) * 10) / 10;
      latestMetrics.humidity_air = Math.round(noise(74.0, 77.5) * 10) / 10;
      latestMetrics.gas_ppm = Math.round(noise(430.0, 480.0) * 10) / 10;
      latestMetrics.estimated_emc = calculateEMC(latestMetrics.temperature, latestMetrics.humidity_air);
      break;

    case 'FERMENTATION_SPIKE':
      // Kịch bản 3: Hạt ẩm lên men sinh nhiệt & khí >850 ppm
      latestMetrics.temperature = Math.round(noise(31.0, 33.5) * 10) / 10;
      latestMetrics.humidity_air = Math.round(noise(71.0, 73.5) * 10) / 10;
      latestMetrics.gas_ppm = Math.round(noise(860.0, 930.0) * 10) / 10;
      latestMetrics.estimated_emc = calculateEMC(latestMetrics.temperature, latestMetrics.humidity_air);
      break;

    case 'REVOKED_DEVICE_ATTACK':
      // Kịch bản 5: Dữ liệu gửi từ thiết bị bị thu hồi / khóa
      latestMetrics.temperature = Math.round(noise(23.0, 24.5) * 10) / 10;
      latestMetrics.humidity_air = Math.round(noise(60.0, 63.0) * 10) / 10;
      latestMetrics.gas_ppm = Math.round(noise(410.0, 440.0) * 10) / 10;
      latestMetrics.estimated_emc = calculateEMC(latestMetrics.temperature, latestMetrics.humidity_air);
      break;

    case 'NORMAL':
    default:
      // Kịch bản 1: Kho An toàn (22-24°C, 58-62% RH, Gas ~400 ppm)
      latestMetrics.temperature = Math.round(noise(22.2, 23.8) * 10) / 10;
      latestMetrics.humidity_air = Math.round(noise(58.5, 61.8) * 10) / 10;
      latestMetrics.gas_ppm = Math.round(noise(390.0, 420.0) * 10) / 10;
      latestMetrics.estimated_emc = calculateEMC(latestMetrics.temperature, latestMetrics.humidity_air);
      break;
  }

  return latestMetrics;
}

// =============================================================================
// KHỞI TẠO KẾT NỐI MQTT BROKER VÀ ĐĂNG KÝ LAST WILL (LWT)
// =============================================================================
function connectMqtt(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (client) {
      try {
        client.end(true);
      } catch (e) {}
    }

    console.log(`🔌 [Simulator] Đang kết nối tới MQTT Broker: ${MQTT_BROKER_URL}...`);

    // Chuẩn bị LWT Payload cho DEV_SILO_01 (Mục 3.2.B)
    const lwtPayload = JSON.stringify({
      device_id: primaryDevice.device_id,
      state: 'OFFLINE',
      reason: 'LWT_TIMEOUT',
    });

    client = mqtt.connect(MQTT_BROKER_URL, {
      clientId: `simulator_${primaryDevice.device_id}_${Math.random().toString(36).substring(2, 6)}`,
      clean: true,
      connectTimeout: 5000,
      reconnectPeriod: 0, // Không tự động reconnect nếu đang test Kịch bản 4
      will: {
        topic: `grain/devices/${primaryDevice.device_id}/status`,
        payload: Buffer.from(lwtPayload),
        qos: 1,
        retain: true,
      },
    });

    client.on('connect', () => {
      isConnected = true;
      console.log(`✅ [Simulator] Đã kết nối MQTT Broker thành công với định danh: ${primaryDevice.device_id}!`);


      // Đăng ký nhận lệnh từ Backend (/cmd) và lệnh điều khiển kịch bản (grain/simulator/control)
      const cmdTopic = `grain/devices/${primaryDevice.device_id}/cmd`;
      const ctrlTopic = `grain/simulator/control`;

      client?.subscribe([cmdTopic, ctrlTopic], { qos: 1 }, (err) => {
        if (!err) {
          console.log(`📡 [Simulator] Đã subscribe: ${cmdTopic} & ${ctrlTopic}`);
          sendHeartbeat();
        }
      });

      // Bắt đầu chu kỳ gửi telemetry và heartbeat
      startTimers();
      resolve();
    });

    client.on('message', (topic, messageBuffer) => {
      try {
        const payload = JSON.parse(messageBuffer.toString());
        if (topic === `grain/devices/${primaryDevice.device_id}/cmd`) {
          handleIncomingCommand(payload);
        } else if (topic === 'grain/simulator/control') {
          handleSimulatorControl(payload);
        }
      } catch (e) {
        console.warn(`[Simulator] Tin nhắn không phải JSON hợp lệ: ${messageBuffer.toString()}`);
      }
    });

    client.on('error', (err) => {
      console.error('[Simulator] Lỗi kết nối MQTT:', err.message);
      isConnected = false;
    });

    client.on('close', () => {
      isConnected = false;
      console.log('[Simulator] Kết nối MQTT đã đóng.');
    });
  });
}

// =============================================================================
// GỬI BẢN TIN TRẠNG THÁI & HEARTBEAT (/status)
// =============================================================================
function sendHeartbeat() {
  if (!client || !isConnected) return;

  const uptimeSec = Math.floor((Date.now() - startTime) / 1000);
  const statusPayload = {
    device_id: primaryDevice.device_id,
    state: 'ONLINE',
    registration_id: registrationId,
    outputs_inhibited: outputsInhibited,
    ip_address: primaryDevice.ip_address,
    fw_version: primaryDevice.fw_version,
    hw_version: primaryDevice.hw_version,
    uptime_sec: uptimeSec,
    timestamp: Date.now(),
  };

  client.publish(
    `grain/devices/${primaryDevice.device_id}/status`,
    JSON.stringify(statusPayload),
    { qos: 1, retain: true }
  );
}

// =============================================================================
// GỬI BẢN TIN TELEMETRY (/telemetry)
// =============================================================================
function sendTelemetry() {
  if (!client || !isConnected || !isRunning) return;

  // Nếu đang ở Kịch bản 4 (Disconnect), không gửi tin
  if (currentScenario === 'DISCONNECT_LWT') return;

  const metrics = { ...generateMetrics(currentScenario) };
  const p = deviceConfig.peripherals;
  if (!p.aht20_enabled) { metrics.temperature = 0; metrics.humidity_air = 0; metrics.estimated_emc = 0; }
  if (!p.mq135_enabled) metrics.gas_ppm = 0;
  const now = Date.now();
  const msgId = `sim_${randomUUID()}`;

  const riskLevel = RuleEngineService.evaluate({
    ...metrics, custom_config: deviceConfig, aht20_ok: p.aht20_enabled, mq135_ok: p.mq135_enabled,
  }).risk_level;
  currentRiskLevel = riskLevel;

  // Đồng bộ trạng thái Còi & Quạt giống logic trên ESP32 thật
  if (outputsInhibited || !p.buzzer_enabled) {
    primaryDevice.buzzer_state = 'OFF';
  } else if (buzzerManualOverride) {
    primaryDevice.buzzer_state = 'ON';
  } else if (buzzerAuto && riskLevel === 'HIGH_RISK' && !buzzerSilencedByUser) {
    primaryDevice.buzzer_state = 'ON';
  } else {
    if (riskLevel !== 'HIGH_RISK') buzzerSilencedByUser = false;
    primaryDevice.buzzer_state = 'OFF';
  }

  if (outputsInhibited || !p.fan_enabled) primaryDevice.fan_state = 'OFF';
  else if (primaryDevice.control_mode === 'AUTO') {
    primaryDevice.fan_state = riskLevel === 'WARNING' || riskLevel === 'HIGH_RISK' ? 'ON' : 'OFF';
  }

  // Tùy theo Kịch bản 5: Có thể gửi dưới device_id bị khóa hoặc device_id chuẩn
  const targetDeviceId = primaryDevice.device_id;

  const telemetryPayload = {
    msg_id: msgId,
    device_id: targetDeviceId,
    registration_id: registrationId,
    fw_version: primaryDevice.fw_version,
    timestamp: now,
    metrics: {
      temperature: { value: metrics.temperature, unit: 'C' },
      humidity_air: { value: metrics.humidity_air, unit: '%RH' },
      gas_ppm: { value: metrics.gas_ppm, unit: 'ppm' },
      estimated_emc: { value: metrics.estimated_emc, unit: '%MC' },
    },
    actuators: {
      outputs_inhibited: outputsInhibited,
      fan_state: primaryDevice.fan_state,
      buzzer_state: primaryDevice.buzzer_state,
      control_mode: primaryDevice.control_mode,
      risk_level: riskLevel,
    },
    sensor_health: {
      aht20: { enabled: p.aht20_enabled, ok: p.aht20_enabled, status: p.aht20_enabled ? 'SIMULATED' : 'DISABLED' },
      mq135: { enabled: p.mq135_enabled, ok: p.mq135_enabled, status: p.mq135_enabled ? 'SIMULATED' : 'DISABLED' },
      door_sensor: { enabled: p.door_enabled, ok: p.door_enabled, status: p.door_enabled ? 'DIGITAL_INPUT' : 'DISABLED' },
    },
    custom_peripherals: deviceConfig.custom_peripherals.map((cp: any) => ({
      id: cp.id, type: cp.type, gpio: cp.gpio,
      state: cp.type === 'RELAY_OUTPUT' ? customRelayStates[cp.id] || 'OFF' : 'INACTIVE',
      value: customRelayStates[cp.id] === 'ON' ? 1 : 0,
    })),
    rssi: Math.floor(-60 - Math.random() * 8),
  };

  const topic = `grain/devices/${targetDeviceId}/telemetry`;
  client.publish(topic, JSON.stringify(telemetryPayload), { qos: 1, retain: false });

  console.log(
    `📡 [${new Date().toLocaleTimeString()}] Telemetry [${currentScenario}]: ` +
    `T=${metrics.temperature}°C | RH=${metrics.humidity_air}% | Gas=${metrics.gas_ppm}ppm | ` +
    `EMC=${metrics.estimated_emc}% | Quạt=${primaryDevice.fan_state} | Còi=${primaryDevice.buzzer_state}`
  );
}

// =============================================================================
// XỬ LÝ LỆNH TỪ BACKEND (/cmd) VÀ PHẢN HỒI ACK SAU 300MS (Yêu cầu Prompt 3)
// =============================================================================
function handleIncomingCommand(cmd: any) {
  console.log(`📥 [Simulator] Nhận lệnh từ Backend (/cmd):`, JSON.stringify(cmd));

  const { cmd_id, type, payload } = cmd;
  if (!cmd_id) return;

  let status = 'SUCCESS';
  let message = 'Thiết bị giả lập đã áp dụng lệnh';
  try {
    if (cmd.device_id && cmd.device_id !== primaryDevice.device_id) return;
    const incomingRegistration = cmd.registration_id || '';
    const resuming = type === 'UPDATE_CONFIG' && outputsInhibited && incomingRegistration && incomingRegistration !== registrationId;
    if ((registrationId && incomingRegistration !== registrationId && !resuming) ||
        (outputsInhibited && type !== 'DEACTIVATE_NODE' && !resuming) ||
        (type === 'DEACTIVATE_NODE' && !incomingRegistration)) throw new Error('Node đã khóa đầu ra hoặc lệnh thuộc lần đăng ký cũ; cần đăng ký lại node');
    const cached = commandAcks.get(cmd_id);
    if (cached) {
      client?.publish(`grain/devices/${primaryDevice.device_id}/ack`, JSON.stringify(cached), { qos: 1 });
      return;
    }
    if (type === 'DEACTIVATE_NODE') {
      outputsInhibited = true;
      registrationId = incomingRegistration;
      primaryDevice.fan_state = primaryDevice.buzzer_state = 'OFF';
      buzzerManualOverride = buzzerSilencedByUser = false;
      for (const cp of deviceConfig.custom_peripherals) if (cp.type === 'RELAY_OUTPUT') customRelayStates[cp.id] = 'OFF';
      persistLifecycle(registrationId, true);
      message = 'Đã tắt và lưu khóa đầu ra; chờ đăng ký lại node';
    } else if (type === 'UPDATE_CONFIG') {
      const next = validateDeviceConfig(payload, deviceConfig);
      persistLifecycle(incomingRegistration || registrationId, false, next);
      registrationId = incomingRegistration || registrationId;
      outputsInhibited = false;
      const previous = deviceConfig;
      const nextStates: typeof customRelayStates = {};
      for (const cp of next.custom_peripherals) {
        if (previous.custom_peripherals.some((old: any) => old.id === cp.id && old.gpio === cp.gpio && old.type === cp.type && old.active_high === cp.active_high)) {
          nextStates[cp.id] = customRelayStates[cp.id] || 'OFF';
        }
        if (cp.type === 'RELAY_OUTPUT' && !nextStates[cp.id]) nextStates[cp.id] = 'OFF';
      }
      customRelayStates = nextStates;
      deviceConfig = next;
      primaryDevice.control_mode = next.peripherals.fan_auto ? 'AUTO' : 'MANUAL';
      primaryDevice.sampling_interval_ms = next.sampling_interval_ms;
      if (!buzzerAuto && next.peripherals.buzzer_auto) buzzerSilencedByUser = false;
      buzzerAuto = next.peripherals.buzzer_auto;
      if (!next.peripherals.buzzer_enabled) buzzerManualOverride = false;
      restartTelemetryTimer();
    } else if (type === 'ACTUATOR_CONTROL') {
      const { target, action, control_mode, peripheral_id } = payload || {};
      if (!['TURN_ON', 'TURN_OFF', 'SET_AUTO'].includes(action) ||
          !['VENTILATION_FAN', 'ALARM_BUZZER', 'CUSTOM_PERIPHERAL'].includes(target) ||
          (action === 'SET_AUTO' && target !== 'VENTILATION_FAN') ||
          (control_mode !== undefined && !['AUTO', 'MANUAL'].includes(control_mode))) throw new Error('Lệnh không hợp lệ');
      if (target === 'VENTILATION_FAN') {
        if (!deviceConfig.peripherals.fan_enabled) throw new Error('Quạt đang bị vô hiệu hóa');
        primaryDevice.control_mode = action === 'SET_AUTO' ? 'AUTO' : control_mode || 'MANUAL';
        deviceConfig.peripherals.fan_auto = primaryDevice.control_mode === 'AUTO';
        if (action !== 'SET_AUTO') primaryDevice.fan_state = action === 'TURN_ON' ? 'ON' : 'OFF';
      } else if (target === 'ALARM_BUZZER') {
        if (!deviceConfig.peripherals.buzzer_enabled) throw new Error('Còi đang bị vô hiệu hóa');
        buzzerManualOverride = action === 'TURN_ON';
        buzzerSilencedByUser = action === 'TURN_OFF' && currentRiskLevel === 'HIGH_RISK';
        primaryDevice.buzzer_state = action === 'TURN_ON' ? 'ON' : 'OFF';
      } else {
        if (!deviceConfig.custom_peripherals.some((cp: any) => cp.id === peripheral_id && cp.type === 'RELAY_OUTPUT')) throw new Error('Không tìm thấy relay');
        customRelayStates[peripheral_id] = action === 'TURN_ON' ? 'ON' : 'OFF';
      }
    } else throw new Error('Loại lệnh không được hỗ trợ');
    sendTelemetry();
  } catch (error) { status = 'FAILED'; message = (error as Error).message; }
  const ack = {
    cmd_id, device_id: primaryDevice.device_id, registration_id: registrationId, status, executed_at: Date.now(), message,
    current_actuators: {
      outputs_inhibited: outputsInhibited,
      fan_state: primaryDevice.fan_state, buzzer_state: primaryDevice.buzzer_state,
      control_mode: primaryDevice.control_mode, custom_peripherals: { ...customRelayStates },
    },
  };
  commandAcks.set(cmd_id, ack);
  if (commandAcks.size > 100) commandAcks.delete(commandAcks.keys().next().value!);
  setTimeout(() => {
    if (!client || !isConnected) return;
    client.publish(`grain/devices/${primaryDevice.device_id}/ack`, JSON.stringify(ack), { qos: 1 });
  }, 300);
}

// =============================================================================
// ĐIỀU KHIỂN KỊCH BẢN (TỪ HTTP API HOẶC TOPIC CONTROL)
// =============================================================================
export function switchScenario(newScenario: ScenarioType): { success: boolean; scenario: ScenarioType; message: string } {
  console.log(`\n🔀 [Simulator] CHUYỂN KỊCH BẢN: ${currentScenario} ➔ ${newScenario}`);
  currentScenario = newScenario;

  if (newScenario === 'DISCONNECT_LWT') {
    // Kịch bản 4: Đột ngột ngắt kết nối socket không gửi DISCONNECT packet -> Kích hoạt LWT
    console.log('⚡ [Kịch bản 4] Ngắt kết nối socket MQTT đột ngột (Kích hoạt LWT trên Mosquitto)...');
    if (client && (client as any).stream) {
      (client as any).stream.destroy(); // Hủy kết nối TCP thô bạo
    }
    isConnected = false;
    return {
      success: true,
      scenario: newScenario,
      message: 'Đã ngắt socket đột ngột! Mosquitto Broker sẽ phát tin LWT chuyển thiết bị sang OFFLINE.',
    };
  }

  if (newScenario === 'REVOKED_DEVICE_ATTACK') {
    console.log('🛡️ [Kịch bản 5] Bắt đầu gửi telemetry từ thiết bị bị khóa để kiểm thử bảo mật...');
    // Đảm bảo client đang kết nối
    if (!isConnected) {
      connectMqtt();
    }
    return {
      success: true,
      scenario: newScenario,
      message: 'Đang gửi telemetry từ thiết bị bị thu hồi quyền (Backend sẽ từ chối và ghi audit log).',
    };
  }

  // Nếu đang bị mất mạng từ kịch bản 4 thì tự kết nối lại
  if (!isConnected) {
    console.log('🔄 Đang tự động kết nối lại MQTT Broker...');
    connectMqtt();
  }

  return {
    success: true,
    scenario: newScenario,
    message: `Đã kích hoạt kịch bản: ${newScenario}`,
  };
}

function handleSimulatorControl(msg: any) {
  if (msg?.scenario) {
    switchScenario(msg.scenario as ScenarioType);
  }
}

// =============================================================================
// QUẢN LÝ TIMERS (TELEMETRY VÀ HEARTBEAT)
// =============================================================================
function startTimers() {
  if (telemetryTimer) clearInterval(telemetryTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);

  // Gửi telemetry mỗi 3 giây (mặc định)
  telemetryTimer = setInterval(() => {
    sendTelemetry();
  }, primaryDevice.sampling_interval_ms);

  // Gửi Heartbeat mỗi 30 giây
  heartbeatTimer = setInterval(() => {
    sendHeartbeat();
  }, 30000);
}

function restartTelemetryTimer() {
  if (telemetryTimer) clearInterval(telemetryTimer);
  telemetryTimer = setInterval(() => {
    sendTelemetry();
  }, primaryDevice.sampling_interval_ms);
}

// =============================================================================
// HTTP CONTROL API (DÀNH CHO WEB SIMULATOR DRAWER & POSTMAN)
// =============================================================================
function startHttpControlServer() {
  const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    // GET /api/simulator/status
    if (req.method === 'GET' && url.pathname === '/api/simulator/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          isRunning,
          isConnected,
          currentScenario,
          device: primaryDevice,
          registration_id: registrationId,
          outputs_inhibited: outputsInhibited,
          custom_relays: customRelayStates,
          latestMetrics,
        })
      );
      return;
    }

    // POST /api/simulator/scenario
    if (req.method === 'POST' && url.pathname === '/api/simulator/scenario') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          const scenario = parsed.scenario as ScenarioType;
          if (!scenario) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Thiếu trường scenario' }));
            return;
          }
          const result = switchScenario(scenario);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'JSON body không hợp lệ' }));
        }
      });
      return;
    }

    // POST /api/simulator/reconnect
    if (req.method === 'POST' && url.pathname === '/api/simulator/reconnect') {
      connectMqtt().then(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Đã kết nối lại MQTT Broker thành công' }));
      });
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, message: 'Không tìm thấy API endpoint' }));
  });

  server.listen(SIMULATOR_PORT, () => {
    console.log(`🌐 [Simulator API] Máy chủ điều khiển kịch bản đang lắng nghe tại: http://localhost:${SIMULATOR_PORT}`);
  });
}

// =============================================================================
// GIAO DIỆN DÒNG LỆNH CLI TƯƠNG TÁC (INTERACTIVE CLI)
// =============================================================================
function setupInteractiveCli() {
  console.log('\n================================================================');
  console.log('🌾 BỘ GIẢ LẬP THIẾT BỊ IOT KHO NGŨ CỐC (DEVICE SIMULATOR) 🌾');
  console.log('================================================================');
  console.log('📌 Bấm các phím số trên bàn phím để chuyển đổi nhanh kịch bản:');
  console.log('   [1] Kịch bản 1: Bình thường an toàn (Normal Safe)');
  console.log('   [2] Kịch bản 2: Tăng độ ẩm đột ngột >72% RH (Humidity Spike)');
  console.log('   [3] Kịch bản 3: Hạt lên men sinh nhiệt & khí >850 ppm (Fermentation)');
  console.log('   [4] Kịch bản 4: Ngắt kết nối socket đột ngột (Simulate LWT Offline)');
  console.log('   [5] Kịch bản 5: Gửi dữ liệu bằng thiết bị bị khóa (Revoked Attack)');
  console.log('   [r] Tái kết nối MQTT (Reconnect)');
  console.log('   [q] Thoát bộ giả lập');
  console.log('================================================================\n');

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    process.stdin.on('data', (key: string) => {
      if (key === '1') switchScenario('NORMAL');
      else if (key === '2') switchScenario('HUMIDITY_SPIKE');
      else if (key === '3') switchScenario('FERMENTATION_SPIKE');
      else if (key === '4') switchScenario('DISCONNECT_LWT');
      else if (key === '5') switchScenario('REVOKED_DEVICE_ATTACK');
      else if (key === 'r') {
        console.log('🔄 Đang kết nối lại MQTT...');
        connectMqtt();
      } else if (key === 'q' || key === '\u0003') {
        console.log('\n🛑 Đang dừng bộ giả lập...');
        if (client) client.end(true);
        process.exit(0);
      }
    });
  }
}

// =============================================================================
// XỬ LÝ THAM SỐ DÒNG LỆNH (CLI ARGUMENTS)
// =============================================================================
function parseCliArgs() {
  const args = process.argv.slice(2);
  for (const arg of args) {
    if (arg.startsWith('--scenario=')) {
      const sc = arg.split('=')[1].toUpperCase();
      if (sc.includes('NORM')) currentScenario = 'NORMAL';
      else if (sc.includes('HUM')) currentScenario = 'HUMIDITY_SPIKE';
      else if (sc.includes('FERM')) currentScenario = 'FERMENTATION_SPIKE';
      else if (sc.includes('DISC') || sc.includes('LWT')) currentScenario = 'DISCONNECT_LWT';
      else if (sc.includes('REVOK')) currentScenario = 'REVOKED_DEVICE_ATTACK';
    }
  }
}

// =============================================================================
// MAIN ENTRYPOINT
// =============================================================================
async function main() {
  parseCliArgs();
  startHttpControlServer();
  await connectMqtt();
  setupInteractiveCli();
}

if (require.main === module) main().catch((err) => {
  console.error('❌ Lỗi khởi động bộ giả lập:', err);
});
