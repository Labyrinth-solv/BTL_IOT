import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Execute the real simulator handler without starting its HTTP/MQTT connections.
function simulator(files = new Map<string, string>()) {
  const packets: any[] = [];
  const callbacks: (() => void)[] = [];
  const exports: any = {};
  const code = ts.transpileModule(readFileSync('tests/simulator.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const seam = `
    client = { publish: (topic, body) => packets.push({topic, ...JSON.parse(body)}) };
    isConnected = true;
    exports.command = handleIncomingCommand;
    exports.scenario = name => currentScenario = name;
    exports.tick = sendTelemetry;
  `;
  runInNewContext(code + seam, {
    exports, module: { exports }, require: (name: string) => name === 'node:fs' ? {
      existsSync: (path: string) => files.has(path),
      readFileSync: (path: string) => files.get(path),
      writeFileSync: (path: string, body: string) => files.set(path, body),
      renameSync: (from: string, to: string) => { files.set(to, files.get(from)!); files.delete(from); },
    } : createRequire(resolve('tests/simulator.ts'))(name),
    process, Buffer, packets, setTimeout: (fn: () => void) => callbacks.push(fn),
    setInterval: () => 0, clearInterval: () => {}, console: { log() {}, warn() {}, error() {} },
  });
  return {
    packets, scenario: exports.scenario, tick: exports.tick,
    command(type: string, payload: any, id = String(packets.length), registration_id = 'registration-1') {
      exports.command({ cmd_id: id, type, payload, registration_id });
      while (callbacks.length) callbacks.shift()!();
      return packets.filter(packet => packet.topic.endsWith('/ack')).at(-1);
    },
  };
}

test('simulator applies configured thresholds and leaves MQ135 disabled', () => {
  const sim = simulator(); sim.scenario('HUMIDITY_SPIKE');
  const ack = sim.command('UPDATE_CONFIG', {
    temp_warn_threshold: 80, temp_crit_threshold: 85,
    hum_warn_threshold: 90, hum_crit_threshold: 95,
    emc_warn_threshold: 99, emc_crit_threshold: 100,
  });
  assert.equal(ack.status, 'SUCCESS');
  assert.equal(ack.current_actuators.fan_state, 'OFF');
  const telemetry = sim.packets.find(packet => packet.topic.endsWith('/telemetry'));
  assert.equal(telemetry.actuators.risk_level, 'SAFE');
  assert.equal(telemetry.metrics.gas_ppm.value, 0);
  assert.equal(telemetry.sensor_health.mq135.status, 'DISABLED');
});

test('deactivation persists across restart and blocks AUTO, cached commands and old enrollment until re-added', () => {
  const files = new Map<string, string>();
  let sim = simulator(files); sim.scenario('HUMIDITY_SPIKE');
  const config = { custom_peripherals: [{ id: 'extra', name: 'Relay active low', type: 'RELAY_OUTPUT', gpio: 26, active_high: false }] };
  sim.command('UPDATE_CONFIG', config, 'config-old');
  const before = sim.command('ACTUATOR_CONTROL', { target: 'CUSTOM_PERIPHERAL', peripheral_id: 'extra', action: 'TURN_ON' }, 'turn-on-old');
  assert.equal(before.current_actuators.fan_state, 'ON');
  assert.equal(before.current_actuators.buzzer_state, 'ON');
  assert.equal(before.current_actuators.custom_peripherals.extra, 'ON');
  const stop = sim.command('DEACTIVATE_NODE', {}, 'stop');
  assert.equal(stop.status, 'SUCCESS'); assert.equal(stop.current_actuators.outputs_inhibited, true);
  for (const state of [stop.current_actuators.fan_state, stop.current_actuators.buzzer_state, stop.current_actuators.custom_peripherals.extra]) assert.equal(state, 'OFF');
  assert.equal(sim.command('ACTUATOR_CONTROL', { target: 'CUSTOM_PERIPHERAL', peripheral_id: 'extra', action: 'TURN_ON' }, 'turn-on-old').status, 'FAILED');
  assert.equal(sim.command('UPDATE_CONFIG', config, 'config-old').status, 'FAILED');
  assert.equal(sim.command('DEACTIVATE_NODE', {}, 'stop').status, 'SUCCESS');
  sim = simulator(files); sim.scenario('HUMIDITY_SPIKE'); sim.tick();
  const telemetry = sim.packets.at(-1);
  assert.equal(telemetry.actuators.outputs_inhibited, true);
  assert.equal(telemetry.actuators.fan_state, 'OFF'); assert.equal(telemetry.actuators.buzzer_state, 'OFF');
  assert.equal(sim.command('ACTUATOR_CONTROL', { target: 'ALARM_BUZZER', action: 'TURN_ON' }).status, 'FAILED');
  assert.equal(sim.command('UPDATE_CONFIG', config).status, 'FAILED');
  const resumed = sim.command('UPDATE_CONFIG', config, 'config-new', 'registration-2');
  assert.equal(resumed.status, 'SUCCESS'); assert.equal(resumed.current_actuators.outputs_inhibited, false);
  assert.equal(resumed.current_actuators.fan_state, 'ON'); assert.equal(resumed.current_actuators.buzzer_state, 'ON');
  assert.equal(sim.command('DEACTIVATE_NODE', {}, 'late-old-stop').status, 'FAILED');
  assert.equal(sim.command('UPDATE_CONFIG', config, 'late-old-config').status, 'FAILED');
});

test('simulator controls and removes a custom relay on a freed builtin GPIO', () => {
  const sim = simulator();
  assert.equal(sim.command('UPDATE_CONFIG', { peripherals: { fan_enabled: false },
    custom_peripherals: [{ id: 'custom', name: 'Relay', gpio: 25, type: 'RELAY_OUTPUT' }] }).status, 'SUCCESS');
  const ack = sim.command('ACTUATOR_CONTROL', { target: 'CUSTOM_PERIPHERAL', peripheral_id: 'custom', action: 'TURN_ON' });
  assert.equal(ack.current_actuators.custom_peripherals.custom, 'ON');
  const removed = sim.command('UPDATE_CONFIG', { custom_peripherals: [] });
  assert.equal(removed.current_actuators.custom_peripherals.custom, undefined);
});

test('simulator rejects invalid config/actions and retries do not execute a command twice', () => {
  const sim = simulator();
  assert.equal(sim.command('UPDATE_CONFIG', { sampling_interval_ms: 500 }).status, 'FAILED');
  assert.equal(sim.command('ACTUATOR_CONTROL', { target: 'ALARM_BUZZER', action: 'INVALID' }).status, 'FAILED');
  sim.command('ACTUATOR_CONTROL', { target: 'ALARM_BUZZER', action: 'TURN_ON' }, 'same-id');
  const count = sim.packets.filter(packet => packet.topic.endsWith('/telemetry')).length;
  sim.command('ACTUATOR_CONTROL', { target: 'ALARM_BUZZER', action: 'TURN_ON' }, 'same-id');
  assert.equal(sim.packets.filter(packet => packet.topic.endsWith('/telemetry')).length, count);
});
