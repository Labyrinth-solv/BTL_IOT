export const DEFAULT_DEVICE_CONFIG = {
  sampling_interval_ms: 3000,
  temp_warn_threshold: 25, temp_crit_threshold: 28,
  hum_warn_threshold: 65, hum_crit_threshold: 70,
  gas_warn_threshold: 600, gas_crit_threshold: 700,
  emc_warn_threshold: 14, emc_crit_threshold: 14.8,
  peripherals: {
    aht20_enabled: true, aht20_sda_gpio: 21, aht20_scl_gpio: 22,
    mq135_enabled: false, mq135_gpio: 34,
    door_enabled: true, door_gpio: 27,
    fan_enabled: true, fan_gpio: 25, fan_auto: true,
    buzzer_enabled: true, buzzer_gpio: 33, buzzer_auto: true,
  },
  custom_peripherals: [] as any[],
};

export class DeviceCommandError extends Error {
  constructor(message: string, public statusCode = 400) { super(message); }
}

const GPIO = new Set([4, 5, 13, 14, 16, 17, 18, 19, 23, 25, 26, 27, 32, 33, 34, 35, 36, 39]);
const ADC1 = new Set([32, 33, 34, 35, 36, 39]);
const OUTPUT = new Set([...GPIO].filter(pin => pin < 34));
const I2C = new Set([...OUTPUT, 21, 22]);

/** Shared contract for the API and simulator; firmware validates the same constraints. */
export function validateDeviceConfig(patch: any, previous: any = {}) {
  const fail = (message: string): never => { throw new DeviceCommandError(message); };
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) fail('Cấu hình phải là object');
  for (const key of Object.keys(patch)) {
    if (!(key in DEFAULT_DEVICE_CONFIG)) fail(`Trường cấu hình không được hỗ trợ: ${key}`);
  }
  if (patch.peripherals !== undefined &&
      (!patch.peripherals || typeof patch.peripherals !== 'object' || Array.isArray(patch.peripherals))) {
    fail('peripherals phải là object');
  }
  const config = {
    ...DEFAULT_DEVICE_CONFIG, ...previous, ...patch,
    peripherals: { ...DEFAULT_DEVICE_CONFIG.peripherals, ...previous?.peripherals, ...patch.peripherals },
    custom_peripherals: patch.custom_peripherals ?? previous?.custom_peripherals ?? [],
  };
  const interval = config.sampling_interval_ms;
  if (!Number.isInteger(interval) || interval < 1000 || interval > 3600000) {
    fail('Chu kỳ lấy mẫu phải là số nguyên từ 1000 đến 3600000 ms');
  }
  for (const [prefix, min, max] of [['temp', -40, 85], ['hum', 0, 100], ['gas', 0, 10000], ['emc', 0, 100]] as const) {
    const warn = config[`${prefix}_warn_threshold`];
    const crit = config[`${prefix}_crit_threshold`];
    if (!Number.isFinite(warn) || !Number.isFinite(crit) || warn < min || crit > max || warn >= crit) {
      fail(`Ngưỡng ${prefix}: yêu cầu ${min} ≤ cảnh báo < nguy hiểm ≤ ${max}`);
    }
  }
  const p = config.peripherals;
  for (const key of Object.keys(p)) {
    if (!(key in DEFAULT_DEVICE_CONFIG.peripherals)) fail(`Cấu hình ngoại vi không được hỗ trợ: ${key}`);
    if ((key.endsWith('_enabled') || key.endsWith('_auto')) && typeof p[key] !== 'boolean') {
      fail(`${key} phải là boolean`);
    }
  }
  const used = new Set<number>();
  const reserve = (pin: number, allowed: Set<number>, name: string) => {
    if (!Number.isInteger(pin) || !allowed.has(pin)) fail(`GPIO ${pin} không hợp lệ cho ${name}`);
    if (used.has(pin)) fail(`GPIO ${pin} đang được thiết bị khác sử dụng`);
    used.add(pin);
  };
  if (p.aht20_enabled) {
    reserve(p.aht20_sda_gpio, I2C, 'AHT20 SDA');
    reserve(p.aht20_scl_gpio, I2C, 'AHT20 SCL');
  }
  if (p.mq135_enabled) reserve(p.mq135_gpio, ADC1, 'MQ-135');
  if (p.door_enabled) reserve(p.door_gpio, OUTPUT, 'cảm biến cửa dùng pull-up');
  if (p.fan_enabled) reserve(p.fan_gpio, OUTPUT, 'quạt');
  if (p.buzzer_enabled) reserve(p.buzzer_gpio, OUTPUT, 'còi');
  if (!Array.isArray(config.custom_peripherals) || config.custom_peripherals.length > 8) fail('Tối đa 8 ngoại vi tùy chỉnh');
  const ids = new Set<string>();
  config.custom_peripherals = config.custom_peripherals.map((item: any) => {
    if (!item || typeof item.id !== 'string' || !item.id.trim() || item.id.length > 32 || ids.has(item.id) ||
        typeof item.name !== 'string' || !item.name.trim() || item.name.length > 48) {
      fail('ID/tên ngoại vi không hợp lệ hoặc ID bị trùng');
    }
    ids.add(item.id);
    if (!['RELAY_OUTPUT', 'DIGITAL_INPUT', 'ANALOG_INPUT'].includes(item.type)) fail('Loại ngoại vi không hợp lệ');
    reserve(item.gpio, item.type === 'RELAY_OUTPUT' ? OUTPUT : item.type === 'ANALOG_INPUT' ? ADC1 : GPIO, item.name);
    if (item.type === 'DIGITAL_INPUT' && item.gpio >= 34 && item.pull_up !== false) {
      fail(`GPIO ${item.gpio} không có pull-up nội; cần điện trở kéo ngoài và pull_up=false`);
    }
    for (const key of ['active_high', 'pull_up']) {
      if (item[key] !== undefined && typeof item[key] !== 'boolean') fail(`${key} phải là boolean`);
    }
    return {
      id: item.id, name: item.name.trim(), type: item.type, gpio: item.gpio,
      active_high: item.active_high !== false, pull_up: item.pull_up !== false,
      unit: typeof item.unit === 'string' ? item.unit.slice(0, 12) : '',
    };
  });
  return config;
}
