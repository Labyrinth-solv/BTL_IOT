import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import prisma from '../backend/src/config/prisma';
import { MQTTService } from '../backend/src/services/mqtt.service';
import { DeviceController } from '../backend/src/controllers/device.controller';
import { SocketService } from '../backend/src/services/socket.service';
import { AuditService } from '../backend/src/services/audit.service';
import { validateDeviceConfig } from '../backend/src/services/deviceConfig';

const service = MQTTService as any;
let device: any;
let commands: Map<string, any>;
let packets: any[];
let events: any[];
function setup() {
  device = { id: 'node-db', device_code: 'DEV_SILO_01', zone_id: 'zone', zone: { name: 'Kho' },
    is_online: true, lifecycle_state: 'ACTIVE', config_json: validateDeviceConfig({}) };
  commands = new Map(); packets = []; events = [];
  service.pendingDeviceCommands.clear(); service.synchronizedDevices.clear(); service.deviceDiagnostics.clear();
  service.removingNodes.clear(); service.shutdownWaiters.clear();
  service.client = { connected: true, publish: (topic: string, body: string) => packets.push({ topic, ...JSON.parse(body) }) };
  (prisma.device as any).findUnique = async () => ({ ...device });
  (prisma.device as any).findFirst = async () => ({ ...device });
  (prisma.device as any).update = async ({ data }: any) => { Object.assign(device, data); return { ...device }; };
  (prisma.deviceCommand as any).create = async ({ data }: any) => { commands.set(data.cmd_id, { ...data }); return data; };
  (prisma.deviceCommand as any).findUnique = async ({ where }: any) => commands.get(where.cmd_id) || null;
  (prisma.deviceCommand as any).update = async ({ where, data }: any) => Object.assign(commands.get(where.cmd_id), data);
  (prisma.deviceCommand as any).updateMany = async ({ where, data }: any) => {
    const command = commands.get(where.cmd_id);
    if (!command || command.status !== where.status) return { count: 0 };
    Object.assign(command, data); return { count: 1 };
  };
  (prisma.telemetryLog as any).findUnique = async () => null;
  (prisma.telemetryLog as any).create = async ({ data }: any) => data;
  (prisma.alert as any).findFirst = async () => ({ id: 'existing-alert' });
  (prisma.alert as any).findMany = async () => [];
  (prisma.alert as any).updateMany = async () => ({ count: 0 });
  (prisma as any).$transaction = async (callback: any) => callback(prisma);
  AuditService.log = async () => undefined;
  for (const method of ['emitTelemetry', 'emitDeviceStatus', 'emitCommandUpdate', 'emitNewAlert', 'emitAlertUpdate']) {
    (SocketService as any)[method] = (value: any) => events.push({ method, ...value });
  }
}
afterEach(() => {
  for (const timer of service.pendingCommandTimers.values()) clearTimeout(timer);
  service.pendingCommandTimers.clear();
});

function shutdownAck(cmdId: string, overrides: any = {}) {
  return { cmd_id: cmdId, device_id: device.device_code, registration_id: device.id, status: 'SUCCESS',
    current_actuators: { outputs_inhibited: true, fan_state: 'OFF', buzzer_state: 'OFF', custom_peripherals: {} }, ...overrides };
}

function mockDeletion() {
  const calls: string[] = [];
  for (const table of ['telemetryLog', 'alert', 'deviceCommand']) {
    (prisma as any)[table].deleteMany = async () => { calls.push(table); return { count: 1 }; };
  }
  (prisma.device as any).delete = async () => { calls.push('device'); return device; };
  return calls;
}

function deleteRequest() {
  const res = response();
  const done = DeviceController.remove({ params: { id: device.id }, user: { id: 'admin' } } as any, res as any);
  return { res, done };
}

test('node deletion waits for verified OFF ACK, blocks concurrent deletion/control, then deletes records', async () => {
  setup(); const deletes = mockDeletion();
  const first = deleteRequest();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(first.res.code, 0); assert.deepEqual(deletes, []);
  assert.equal(packets[0].type, 'DEACTIVATE_NODE'); assert.equal(packets[0].registration_id, device.id);
  const second = deleteRequest(); await second.done;
  assert.equal(second.res.code, 409); assert.equal(packets.length, 1);
  await assert.rejects(service.publishCommand(device.id, device.device_code, 'ACTUATOR_CONTROL', {}, 'admin'), /khóa/);
  await service.handleAck(device.device_code, shutdownAck(packets[0].cmd_id));
  await first.done;
  assert.equal(first.res.code, 200);
  assert.deepEqual(deletes, ['telemetryLog', 'alert', 'deviceCommand', 'device']);
  assert.equal(service.removingNodes.size, 0); assert.equal(service.shutdownWaiters.size, 0);
});

test('old firmware, stale registration, missing relay, or any ON output cannot authorize deletion', async () => {
  for (const change of [
    { current_actuators: { fan_state: 'OFF', buzzer_state: 'OFF' } },
    { registration_id: 'old-registration' },
    { current_actuators: { outputs_inhibited: true, fan_state: 'ON', buzzer_state: 'OFF', custom_peripherals: { extra: 'OFF' } } },
    { current_actuators: { outputs_inhibited: true, fan_state: 'OFF', buzzer_state: 'OFF', custom_peripherals: { extra: 'ON' } } },
    {},
  ]) {
    setup(); const deletes = mockDeletion();
    device.config_json = validateDeviceConfig({ custom_peripherals: [{ id: 'extra', name: 'Relay', type: 'RELAY_OUTPUT', gpio: 26 }] });
    const request = deleteRequest(); await new Promise(resolve => setImmediate(resolve));
    await service.handleAck(device.device_code, shutdownAck(packets[0].cmd_id, change));
    await request.done;
    assert.equal(request.res.code, 409); assert.deepEqual(deletes, []);
    assert.equal(commands.get(packets[0].cmd_id).status, 'FAILED');
  }
});

test('deletion timeout and unavailable MQTT retain the node', async t => {
  setup(); const deletes = mockDeletion();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const request = deleteRequest(); await new Promise(resolve => setImmediate(resolve));
  for (let attempt = 0; attempt < 3; attempt++) {
    t.mock.timers.tick(8000); await new Promise(resolve => setImmediate(resolve));
  }
  await request.done;
  assert.equal(request.res.code, 504); assert.deepEqual(deletes, []);
  service.client.connected = false;
  const disconnected = deleteRequest(); await disconnected.done;
  assert.equal(disconnected.res.code, 503); assert.deepEqual(deletes, []);
});

test('database deletion failure keeps outputs locked; retry may finish deletion without reactivation', async () => {
  setup(); mockDeletion();
  (prisma.device as any).delete = async () => { throw new Error('Database unavailable'); };
  const request = deleteRequest(); await new Promise(resolve => setImmediate(resolve));
  await service.handleAck(device.device_code, shutdownAck(packets[0].cmd_id)); await request.done;
  assert.equal(request.res.code, 500);
  assert.equal(service.getDeviceDiagnostics(device.device_code).outputs_inhibited, true);
  const count = packets.length;
  await service.handleStatus(device.device_code, { state: 'ONLINE', outputs_inhibited: true, registration_id: device.id });
  assert.equal(packets.length, count);
  await assert.rejects(service.publishCommand(device.id, device.device_code, 'ACTUATOR_CONTROL', {}, 'admin'), /khóa/);
  mockDeletion();
  const retry = deleteRequest(); await new Promise(resolve => setImmediate(resolve));
  await service.handleAck(device.device_code, shutdownAck(packets.at(-1).cmd_id)); await retry.done;
  assert.equal(retry.res.code, 200);
});

test('suspended/offline database nodes can still be stopped if their physical node responds', async () => {
  setup(); const deletes = mockDeletion(); device.lifecycle_state = 'SUSPENDED'; device.is_online = false;
  const request = deleteRequest(); await new Promise(resolve => setImmediate(resolve));
  await service.handleAck(device.device_code, shutdownAck(packets[0].cmd_id)); await request.done;
  assert.equal(request.res.code, 200); assert.equal(deletes.at(-1), 'device');
});

function response() {
  return { code: 0, body: null as any, status(code: number) { this.code = code; return this; }, json(body: any) { this.body = body; return this; } };
}

test('configuration rejects invalid thresholds, interval, GPIO ownership and ADC/pull-up combinations', () => {
  assert.equal(validateDeviceConfig({}).peripherals.mq135_enabled, false);
  for (const config of [
    { sampling_interval_ms: 500 }, { sampling_interval_ms: 1000.5 },
    { temp_warn_threshold: 80, temp_crit_threshold: 20 }, { hum_warn_threshold: NaN },
    { peripherals: { fan_gpio: 33 } }, { peripherals: { aht20_sda_gpio: 34 } },
    { peripherals: { door_gpio: 35 } },
    { custom_peripherals: [{ id: 'x', name: 'ADC', type: 'ANALOG_INPUT', gpio: 26 }] },
    { custom_peripherals: [{ id: 'x', name: 'Input', type: 'DIGITAL_INPUT', gpio: 35 }] },
    { custom_peripherals: [{ id: 'x', name: 'Relay', type: 'RELAY_OUTPUT', gpio: 25 }] },
  ]) assert.throws(() => validateDeviceConfig(config));
  assert.doesNotThrow(() => validateDeviceConfig({ peripherals: { fan_enabled: false },
    custom_peripherals: [{ id: 'x', name: 'Relay', type: 'RELAY_OUTPUT', gpio: 25 }] }));
  assert.doesNotThrow(() => validateDeviceConfig({
    custom_peripherals: [{ id: 'x', name: 'Input', type: 'DIGITAL_INPUT', gpio: 35, pull_up: false }] }));
});

test('config remains unchanged until a matching ACK; wrong-device and duplicate ACKs cannot apply it', async () => {
  setup();
  const before = JSON.stringify(device.config_json);
  const res = response();
  await DeviceController.updateConfig({ params: { id: device.id }, body: { temp_warn_threshold: 26 }, user: { id: 'admin', role: 'ADMIN' } } as any, res as any);
  assert.equal(res.code, 200); assert.equal(res.body.data.status, 'PENDING');
  assert.equal(JSON.stringify(device.config_json), before);
  const cmdId = res.body.data.cmd_id;
  device.id = 'different-node';
  await service.handleAck('OTHER', { cmd_id: cmdId, status: 'SUCCESS' });
  assert.equal(commands.get(cmdId).status, 'PENDING');
  assert.ok(service.pendingCommandTimers.has(cmdId));
  device.id = 'node-db';
  await service.handleAck(device.device_code, { cmd_id: cmdId, status: 'SUCCESS', current_actuators: { buzzer_state: 'ON', fan_state: 'OFF', control_mode: 'AUTO' } });
  assert.equal(device.config_json.temp_warn_threshold, 26);
  assert.equal(service.getDeviceDiagnostics(device.device_code).buzzer_state, 'ON');
  assert.equal(commands.get(cmdId).status, 'SUCCESS');
  const count = events.length;
  await service.handleAck(device.device_code, { cmd_id: cmdId, status: 'SUCCESS' });
  assert.equal(events.length, count);
});

test('failed ACK and offline/MQTT failures never save requested configuration', async () => {
  setup();
  const before = JSON.stringify(device.config_json);
  const cmdId = await service.publishCommand(device.id, device.device_code, 'UPDATE_CONFIG', validateDeviceConfig({ temp_warn_threshold: 26 }), 'admin');
  await service.handleAck(device.device_code, { cmd_id: cmdId, status: 'FAILED' });
  assert.equal(JSON.stringify(device.config_json), before);
  device.is_online = false;
  await assert.rejects(service.publishCommand(device.id, device.device_code, 'UPDATE_CONFIG', {}, 'admin'), /ngoại tuyến/);
  service.client.connected = false;
  await assert.rejects(service.publishCommand(device.id, device.device_code, 'UPDATE_CONFIG', {}, 'admin'), /MQTT/);
});

test('one pending command per node, and manual mode persists only after ACK', async () => {
  setup();
  const res = response();
  await DeviceController.controlActuator({ params: { id: device.id }, body: { target: 'VENTILATION_FAN', action: 'TURN_ON', control_mode: 'MANUAL' }, user: { id: 'admin' } } as any, res as any);
  assert.equal(res.code, 200); assert.equal(device.config_json.peripherals.fan_auto, true);
  await assert.rejects(service.publishCommand(device.id, device.device_code, 'UPDATE_CONFIG', {}, 'admin'), /ACK/);
  await service.handleAck(device.device_code, { cmd_id: res.body.data.cmd_id, status: 'SUCCESS', current_actuators: { fan_state: 'ON', control_mode: 'MANUAL' } });
  assert.equal(device.config_json.peripherals.fan_auto, false);
});

test('live heartbeat synchronizes saved config including disabled MQ135; blocked nodes stay blocked', async () => {
  setup();
  (prisma.user as any).findFirst = async () => ({ id: 'admin' });
  await service.handleStatus(device.device_code, { state: 'ONLINE' });
  assert.equal(packets.length, 1); assert.equal(packets[0].type, 'UPDATE_CONFIG');
  assert.equal(packets[0].payload.peripherals.mq135_enabled, false);
  await service.handleStatus(device.device_code, { state: 'ONLINE' });
  assert.equal(packets.length, 1);
  device.lifecycle_state = 'SUSPENDED'; device.is_online = false;
  await service.handleStatus(device.device_code, { state: 'ONLINE' });
  assert.equal(device.is_online, false); assert.equal(device.lifecycle_state, 'SUSPENDED');
});

test('server never sends a competing AUTO actuator command', async () => {
  setup(); service.synchronizedDevices.add(device.device_code);
  await service.handleTelemetry(device.device_code, {
    msg_id: 'gas-test', metrics: { temperature: { value: 23 }, humidity_air: { value: 60 }, gas_ppm: { value: 950 }, estimated_emc: { value: 12.3 } },
    sensor_health: { aht20: { ok: true, status: 'OK' }, mq135: { ok: true, status: 'OK' } },
    actuators: { fan_state: 'ON', buzzer_state: 'ON', control_mode: 'AUTO', risk_level: 'HIGH_RISK' },
  });
  assert.equal(packets.length, 0);
  const telemetry = events.find(event => event.method === 'emitTelemetry');
  assert.equal(telemetry.risk_level, 'SAFE');
  assert.equal(telemetry.buzzer_state, 'ON'); // Physical output, not inferred from risk.
});

test('maximum allowed UTF-8 config fits the new MQTT buffer', () => {
  const config = validateDeviceConfig({ custom_peripherals: [4, 5, 13, 14, 16, 17, 18, 19].map((gpio, i) => ({
    id: `${i}`.padEnd(32, 'x'), name: 'ệ'.repeat(48), type: 'RELAY_OUTPUT', gpio,
  })) });
  const size = Buffer.byteLength(JSON.stringify({ cmd_id: 'x'.repeat(32), device_id: 'DEV_SILO_01', issued_by: 'x'.repeat(36), timestamp: Date.now(), type: 'UPDATE_CONFIG', payload: config })) + 64;
  assert.ok(size > 2048); assert.ok(size < 8192);
});

test('two retries then TIMEOUT preserve the applied config and ignore a late ACK', async t => {
  setup();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const before = JSON.stringify(device.config_json);
  const cmdId = await service.publishCommand(device.id, device.device_code, 'UPDATE_CONFIG', validateDeviceConfig({ temp_warn_threshold: 26 }), 'admin');
  for (let attempt = 0; attempt < 3; attempt++) {
    t.mock.timers.tick(8000);
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(packets.length, 3);
  assert.equal(commands.get(cmdId).status, 'TIMEOUT');
  assert.equal(service.pendingDeviceCommands.has(device.device_code), false);
  assert.equal(events.at(-1).status, 'TIMEOUT');
  await service.handleAck(device.device_code, { cmd_id: cmdId, status: 'SUCCESS' });
  assert.equal(JSON.stringify(device.config_json), before);
});

test('ACK cannot overwrite a TIMEOUT that wins the database race', async () => {
  setup();
  const before = JSON.stringify(device.config_json);
  const cmdId = await service.publishCommand(device.id, device.device_code, 'UPDATE_CONFIG', validateDeviceConfig({ temp_warn_threshold: 26 }), 'admin');
  (prisma as any).$transaction = async (callback: any) => {
    commands.get(cmdId).status = 'TIMEOUT';
    return callback(prisma);
  };
  await service.handleAck(device.device_code, { cmd_id: cmdId, status: 'SUCCESS' });
  assert.equal(JSON.stringify(device.config_json), before);
  assert.equal(events.length, 0);
});

test('suspending through an unbound Express handler immediately broadcasts the real lifecycle', async () => {
  setup();
  const res = response();
  const handler = DeviceController.suspend;
  await handler({ params: { id: device.id }, body: {}, user: { id: 'admin' } } as any, res as any);
  assert.equal(res.code, 200);
  assert.equal(device.is_online, false);
  assert.equal(events.at(-1).lifecycle_state, 'SUSPENDED');
  assert.equal(events.at(-1).state, 'OFFLINE');
});
