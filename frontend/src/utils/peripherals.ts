import { CustomPeripheralConfig, CustomPeripheralType, PeripheralConfig } from '../types';

export type PeripheralId = 'aht20' | 'mq135' | 'door' | 'fan' | 'buzzer';

export interface PeripheralDefinition {
  id: PeripheralId;
  name: string;
  shortName: string;
  category: 'SENSOR' | 'ACTUATOR';
  enabledKey: keyof PeripheralConfig;
  pinLabel: string;
  autoKey?: keyof PeripheralConfig;
  autoLabel?: string;
  description: string;
}

export const PERIPHERAL_CATALOG: PeripheralDefinition[] = [
  {
    id: 'aht20',
    name: 'Cảm biến Nhiệt độ & Độ ẩm (AHT20)',
    shortName: 'Nhiệt & Ẩm (AHT20)',
    category: 'SENSOR',
    enabledKey: 'aht20_enabled',
    pinLabel: 'GPIO 21 / 22 (I2C)',
    description: 'Đo nhiệt độ, độ ẩm không khí và tính độ ẩm hạt',
  },
  {
    id: 'mq135',
    name: 'Cảm biến Khí Gas (MQ-135)',
    shortName: 'Khí Gas (MQ-135)',
    category: 'SENSOR',
    enabledKey: 'mq135_enabled',
    pinLabel: 'GPIO 34 (Analog)',
    description: 'Phát hiện khí gas phát sinh khi hạt bị lên men',
  },
  {
    id: 'door',
    name: 'Cảm biến Cửa Kho',
    shortName: 'Cửa kho',
    category: 'SENSOR',
    enabledKey: 'door_enabled',
    pinLabel: 'GPIO 27',
    description: 'Theo dõi trạng thái cửa kho đang đóng hay mở',
  },
  {
    id: 'fan',
    name: 'Quạt Thông Gió',
    shortName: 'Quạt thông gió',
    category: 'ACTUATOR',
    enabledKey: 'fan_enabled',
    pinLabel: 'GPIO 25',
    autoKey: 'fan_auto',
    autoLabel: 'Tự động bật quạt khi vượt ngưỡng',
    description: 'Làm mát và giảm ẩm không khí trong kho',
  },
  {
    id: 'buzzer',
    name: 'Còi Báo Động',
    shortName: 'Còi báo động',
    category: 'ACTUATOR',
    enabledKey: 'buzzer_enabled',
    pinLabel: 'GPIO 33',
    autoKey: 'buzzer_auto',
    autoLabel: 'Tự động hú còi khi ở mức nguy hiểm',
    description: 'Cảnh báo âm thanh tại kho khi có sự cố',
  },
];

export const DEFAULT_PERIPHERAL_CONFIG: Required<PeripheralConfig> = {
  aht20_enabled: true,
  aht20_sda_gpio: 21,
  aht20_scl_gpio: 22,
  mq135_enabled: true,
  mq135_gpio: 34,
  door_enabled: true,
  door_gpio: 27,
  fan_enabled: true,
  fan_gpio: 25,
  fan_auto: true,
  buzzer_enabled: true,
  buzzer_gpio: 33,
  buzzer_auto: true,
};

export function normalizePeripherals(raw?: Partial<PeripheralConfig> | null): Required<PeripheralConfig> {
  return {
    aht20_enabled: raw?.aht20_enabled !== false,
    aht20_sda_gpio: typeof raw?.aht20_sda_gpio === 'number' ? raw.aht20_sda_gpio : 21,
    aht20_scl_gpio: typeof raw?.aht20_scl_gpio === 'number' ? raw.aht20_scl_gpio : 22,
    mq135_enabled: raw?.mq135_enabled !== false,
    mq135_gpio: typeof raw?.mq135_gpio === 'number' ? raw.mq135_gpio : 34,
    door_enabled: raw?.door_enabled !== false,
    door_gpio: typeof raw?.door_gpio === 'number' ? raw.door_gpio : 27,
    fan_enabled: raw?.fan_enabled !== false,
    fan_gpio: typeof raw?.fan_gpio === 'number' ? raw.fan_gpio : 25,
    fan_auto: raw?.fan_auto !== false,
    buzzer_enabled: raw?.buzzer_enabled !== false,
    buzzer_gpio: typeof raw?.buzzer_gpio === 'number' ? raw.buzzer_gpio : 33,
    buzzer_auto: raw?.buzzer_auto !== false,
  };
}

export function getPeripheralPinLabel(id: PeripheralId, peripherals?: PeripheralConfig | null): string {
  switch (id) {
    case 'aht20':
      return `GPIO ${peripherals?.aht20_sda_gpio ?? 21} / ${peripherals?.aht20_scl_gpio ?? 22} (I2C)`;
    case 'mq135':
      return `GPIO ${peripherals?.mq135_gpio ?? 34} (Analog)`;
    case 'door':
      return `GPIO ${peripherals?.door_gpio ?? 27}`;
    case 'fan':
      return `GPIO ${peripherals?.fan_gpio ?? 25}`;
    case 'buzzer':
      return `GPIO ${peripherals?.buzzer_gpio ?? 33}`;
  }
}

export type CreatePeripheralKind =
  | 'BUILTIN_AHT20'
  | 'BUILTIN_MQ135'
  | 'BUILTIN_DOOR'
  | 'BUILTIN_FAN'
  | 'BUILTIN_BUZZER'
  | CustomPeripheralType;

export interface I2cPinPairOption {
  id: string;
  sda: number;
  scl: number;
  label: string;
}

export const ESP32_I2C_PIN_PAIRS: I2cPinPairOption[] = [
  {
    id: '21-22',
    sda: 21,
    scl: 22,
    label: 'GPIO 21 (SDA) / GPIO 22 (SCL) — Bus I2C mặc định (AHT20)',
  },
  {
    id: '16-17',
    sda: 16,
    scl: 17,
    label: 'GPIO 16 (SDA) / GPIO 17 (SCL) — Bus I2C dự phòng',
  },
];

export interface SafeGpioOption {
  gpio: number;
  label: string;
  supportsOutput: boolean;
  supportsAdcWithWifi: boolean;
  hasInternalPullup: boolean;
}

export const ESP32_SAFE_GPIOS: SafeGpioOption[] = [
  { gpio: 26, label: 'GPIO 26 (Chân trống mở rộng - Khuyên dùng)', supportsOutput: true, supportsAdcWithWifi: false, hasInternalPullup: true },
  { gpio: 16, label: 'GPIO 16 (Chân trống mở rộng)', supportsOutput: true, supportsAdcWithWifi: false, hasInternalPullup: true },
  { gpio: 17, label: 'GPIO 17 (Chân trống mở rộng)', supportsOutput: true, supportsAdcWithWifi: false, hasInternalPullup: true },
  { gpio: 18, label: 'GPIO 18 (Chân trống mở rộng)', supportsOutput: true, supportsAdcWithWifi: false, hasInternalPullup: true },
  { gpio: 19, label: 'GPIO 19 (Chân trống mở rộng)', supportsOutput: true, supportsAdcWithWifi: false, hasInternalPullup: true },
  { gpio: 23, label: 'GPIO 23 (Chân trống mở rộng)', supportsOutput: true, supportsAdcWithWifi: false, hasInternalPullup: true },
  { gpio: 13, label: 'GPIO 13 (Chân trống mở rộng)', supportsOutput: true, supportsAdcWithWifi: false, hasInternalPullup: true },
  { gpio: 14, label: 'GPIO 14 (Chân trống mở rộng)', supportsOutput: true, supportsAdcWithWifi: false, hasInternalPullup: true },
  { gpio: 4, label: 'GPIO 4 (Chân trống mở rộng)', supportsOutput: true, supportsAdcWithWifi: false, hasInternalPullup: true },
  { gpio: 5, label: 'GPIO 5 (Chân trống mở rộng)', supportsOutput: true, supportsAdcWithWifi: false, hasInternalPullup: true },
  { gpio: 32, label: 'GPIO 32 (Chân trống mở rộng - Hỗ trợ Analog ADC1)', supportsOutput: true, supportsAdcWithWifi: true, hasInternalPullup: true },
  { gpio: 25, label: 'GPIO 25 (Chân Quạt mặc định - đã gỡ)', supportsOutput: true, supportsAdcWithWifi: false, hasInternalPullup: true },
  { gpio: 33, label: 'GPIO 33 (Chân Còi mặc định - đã gỡ, ADC1)', supportsOutput: true, supportsAdcWithWifi: true, hasInternalPullup: true },
  { gpio: 27, label: 'GPIO 27 (Chân Cảm biến cửa - đã gỡ)', supportsOutput: true, supportsAdcWithWifi: false, hasInternalPullup: true },
  { gpio: 35, label: 'GPIO 35 (Chân trống mở rộng - Chỉ đọc Analog/Digital)', supportsOutput: false, supportsAdcWithWifi: true, hasInternalPullup: false },
  { gpio: 36, label: 'GPIO 36 / VP (Chân trống mở rộng - Chỉ đọc Analog/Digital)', supportsOutput: false, supportsAdcWithWifi: true, hasInternalPullup: false },
  { gpio: 39, label: 'GPIO 39 / VN (Chân trống mở rộng - Chỉ đọc Analog/Digital)', supportsOutput: false, supportsAdcWithWifi: true, hasInternalPullup: false },
  { gpio: 34, label: 'GPIO 34 (Chân MQ-135 mặc định - đã gỡ, ADC1)', supportsOutput: false, supportsAdcWithWifi: true, hasInternalPullup: false },
];

export function getOccupiedGpios(
  peripherals: PeripheralConfig,
  customPeripherals: CustomPeripheralConfig[]
): Set<number> {
  const occupied = new Set<number>();
  if (peripherals.aht20_enabled !== false) {
    occupied.add(Number(peripherals.aht20_sda_gpio ?? 21));
    occupied.add(Number(peripherals.aht20_scl_gpio ?? 22));
  }
  if (peripherals.fan_enabled !== false) occupied.add(Number(peripherals.fan_gpio ?? 25));
  if (peripherals.buzzer_enabled !== false) occupied.add(Number(peripherals.buzzer_gpio ?? 33));
  if (peripherals.door_enabled !== false) occupied.add(Number(peripherals.door_gpio ?? 27));
  if (peripherals.mq135_enabled !== false) occupied.add(Number(peripherals.mq135_gpio ?? 34));
  customPeripherals.forEach((cp) => occupied.add(Number(cp.gpio)));
  return occupied;
}

export function getAvailableI2cPairs(
  peripherals: PeripheralConfig,
  customPeripherals: CustomPeripheralConfig[]
): I2cPinPairOption[] {
  const occupied = getOccupiedGpios(peripherals, customPeripherals);
  return ESP32_I2C_PIN_PAIRS.filter((pair) => !occupied.has(pair.sda) && !occupied.has(pair.scl));
}

export function getAvailableGpios(
  type: CreatePeripheralKind,
  peripherals: PeripheralConfig,
  customPeripherals: CustomPeripheralConfig[]
): SafeGpioOption[] {
  const occupied = getOccupiedGpios(peripherals, customPeripherals);
  const filtered = ESP32_SAFE_GPIOS.filter((opt) => {
    if (occupied.has(opt.gpio)) return false;
    if (type === 'RELAY_OUTPUT' || type === 'BUILTIN_FAN' || type === 'BUILTIN_BUZZER') {
      return opt.supportsOutput;
    }
    if (type === 'ANALOG_INPUT' || type === 'BUILTIN_MQ135') {
      return opt.supportsAdcWithWifi;
    }
    return true;
  });

  // Đưa chân phần cứng mặc định lên đầu danh sách tương ứng khi thêm lại thiết bị chuẩn
  const preferredPinMap: Partial<Record<CreatePeripheralKind, number>> = {
    BUILTIN_MQ135: 34,
    BUILTIN_DOOR: 27,
    BUILTIN_FAN: 25,
    BUILTIN_BUZZER: 33,
  };
  const preferred = preferredPinMap[type];
  if (preferred !== undefined) {
    return [...filtered].sort((a, b) => (a.gpio === preferred ? -1 : b.gpio === preferred ? 1 : 0));
  }
  return filtered;
}
