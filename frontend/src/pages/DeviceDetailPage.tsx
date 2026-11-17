import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { waitForCommandAck } from '../services/socket';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import {
  CustomPeripheralConfig,
  CustomPeripheralRuntimeState,
  CustomPeripheralType,
  Device,
  DeviceCommand,
  PeripheralConfig,
  TelemetryLog,
} from '../types';
import { RiskBadge } from '../components/RiskBadge';
import { LifecycleBadge } from '../components/LifecycleBadge';
import { PeripheralPanel, type PeripheralItem } from '../components/PeripheralPanel';
import {
  PERIPHERAL_CATALOG,
  DEFAULT_PERIPHERAL_CONFIG,
  normalizePeripherals,
  PeripheralDefinition,
  CreatePeripheralKind,
  getAvailableGpios,
  ESP32_SAFE_GPIOS,
  getAvailableI2cPairs,
  getPeripheralPinLabel,
} from '../utils/peripherals';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  ArrowLeft,
  Settings,
  History,
  Activity,
  Fan,
  Thermometer,
  Droplets,
  Wind,
  Flame,
  Send,
  Volume2,
  Cpu,
  Plus,
  Power,
  Gauge,
  ToggleRight,
  X,
} from 'lucide-react';

type MetricStatus = 'SAFE' | 'WARNING' | 'CRITICAL' | 'ERROR' | 'NO_DATA';

const METRIC_STYLES: Record<MetricStatus, { card: string; text: string; badge: string; label: string }> = {
  SAFE: { card: 'bg-slate-50 border-slate-200', text: 'text-slate-900', badge: 'bg-white text-slate-600 border-slate-200', label: 'Bình thường' },
  WARNING: { card: 'bg-amber-50 border-amber-300', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-800 border-amber-300', label: 'Cảnh báo' },
  CRITICAL: { card: 'bg-rose-50 border-rose-300', text: 'text-rose-700', badge: 'bg-rose-100 text-rose-800 border-rose-300', label: 'Nguy hiểm' },
  ERROR: { card: 'bg-rose-50/70 border-rose-200', text: 'text-rose-700', badge: 'bg-white text-rose-700 border-rose-200', label: 'Lỗi cảm biến' },
  NO_DATA: { card: 'bg-slate-50 border-slate-200', text: 'text-slate-400', badge: 'bg-white text-slate-500 border-slate-200', label: 'Chờ dữ liệu' },
};

function getMetricStatus(value: number | null, warn: number, critical: number, healthy: boolean, online: boolean): MetricStatus {
  if (!online) return 'NO_DATA';
  if (!healthy) return 'ERROR';
  if (value === null || !Number.isFinite(value)) return 'NO_DATA';
  if (value >= critical) return 'CRITICAL';
  if (value >= warn) return 'WARNING';
  return 'SAFE';
}

export const DeviceDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin, isViewer, showToast } = useAuth();
  const { latestTelemetry, deviceStatus, latestAck } = useSocket();

  const [device, setDevice] = useState<Device | null>(null);
  const [telemetryHistory, setTelemetryHistory] = useState<TelemetryLog[]>([]);
  const historyInitializedFor = useRef<string | null>(null);
  const sessionWasReset = useRef(false);
  const lastChartSample = useRef<string>('');
  const [commands, setCommands] = useState<DeviceCommand[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [samplingInterval, setSamplingInterval] = useState(3000);
  const [tempWarn, setTempWarn] = useState(25.0);
  const [tempCrit, setTempCrit] = useState(28.0);
  const [humWarn, setHumWarn] = useState(65.0);
  const [humCrit, setHumCrit] = useState(70.0);
  const [emcWarn, setEmcWarn] = useState(14.0);
  const [emcCrit, setEmcCrit] = useState(14.8);
  const [gasWarn, setGasWarn] = useState(600);
  const [gasCrit, setGasCrit] = useState(700);
  const [peripherals, setPeripherals] = useState<Required<PeripheralConfig>>(
    DEFAULT_PERIPHERAL_CONFIG
  );
  const [customPeripherals, setCustomPeripherals] = useState<CustomPeripheralConfig[]>([]);
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [isControlling, setIsControlling] = useState(false);

  // Modal tạo thiết bị ngoại vi mới hoàn toàn (thiết bị chuẩn hoặc GPIO tùy chọn)
  const [isCreateCustomOpen, setIsCreateCustomOpen] = useState(false);
  const [cpName, setCpName] = useState('');
  const [cpType, setCpType] = useState<CreatePeripheralKind>('RELAY_OUTPUT');
  const [cpGpio, setCpGpio] = useState<number>(26);
  const [cpI2cPairId, setCpI2cPairId] = useState<string>('21-22');
  const [cpUnit, setCpUnit] = useState('%');

  const fetchDeviceData = async () => {
    if (!id) return;
    try {
      const res = await api.getDeviceById(id);
      if (res.success && res.data) {
        setDevice(res.data);
        // Load the initial history once. Refreshing config/commands must not restore
        // pre-disconnect samples after the live chart has been reset.
        if (historyInitializedFor.current !== id) {
          setTelemetryHistory(res.data.is_online ? [...(res.data.telemetry_logs || [])].reverse() : []);
          historyInitializedFor.current = id;
        }
        if (res.data.commands) setCommands(res.data.commands);

        const cfg = res.data.config_json || {};
        if (typeof cfg.sampling_interval_ms === 'number') setSamplingInterval(cfg.sampling_interval_ms);
        if (typeof cfg.temp_warn_threshold === 'number') setTempWarn(cfg.temp_warn_threshold);
        if (typeof cfg.temp_crit_threshold === 'number') setTempCrit(cfg.temp_crit_threshold);
        if (typeof cfg.hum_warn_threshold === 'number') setHumWarn(cfg.hum_warn_threshold);
        if (typeof cfg.hum_crit_threshold === 'number') setHumCrit(cfg.hum_crit_threshold);
        if (typeof cfg.emc_warn_threshold === 'number') setEmcWarn(cfg.emc_warn_threshold);
        if (typeof cfg.emc_crit_threshold === 'number') setEmcCrit(cfg.emc_crit_threshold);
        if (typeof cfg.gas_warn_threshold === 'number') setGasWarn(cfg.gas_warn_threshold);
        if (typeof cfg.gas_crit_threshold === 'number') setGasCrit(cfg.gas_crit_threshold);
        setPeripherals(normalizePeripherals(cfg.peripherals));
        setCustomPeripherals(Array.isArray(cfg.custom_peripherals) ? cfg.custom_peripherals : []);
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi tải thông tin thiết bị', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    historyInitializedFor.current = null;
    sessionWasReset.current = false;
    lastChartSample.current = '';
    setTelemetryHistory([]);
    fetchDeviceData();
  }, [id]);

  const selectedCode = device?.device_code;
  const selectedUpdate = selectedCode ? latestTelemetry[selectedCode] : undefined;
  const selectedStatus = selectedCode ? deviceStatus[selectedCode] : undefined;
  const selectedOnline = selectedStatus
    ? selectedStatus.is_online ?? selectedStatus.state === 'ONLINE'
    : device?.is_online === true;
  useEffect(() => {
    if (selectedCode && !selectedOnline) {
      sessionWasReset.current = true;
      lastChartSample.current = '';
      setTelemetryHistory([]);
    }
  }, [selectedCode, selectedOnline]);
  useEffect(() => {
    if (!selectedOnline || !selectedUpdate || !selectedCode || !id) return;
    const sampleKey = `${selectedCode}:${selectedUpdate.timestamp}`;
    if (lastChartSample.current === sampleKey) return;
    lastChartSample.current = sampleKey;
    const item: TelemetryLog = {
      id: sampleKey, device_id: id, msg_id: sampleKey,
      temperature: selectedUpdate.temperature, humidity_air: selectedUpdate.humidity_air,
      gas_ppm: selectedUpdate.gas_ppm, estimated_emc: selectedUpdate.estimated_emc,
      fan_state: selectedUpdate.fan_state === 'ON', risk_level: selectedUpdate.risk_level,
      recorded_at: new Date(selectedUpdate.timestamp).toISOString(),
    };
    setTelemetryHistory(prev => [...prev.slice(-29), item]);
  }, [selectedUpdate, selectedCode, selectedOnline, id]);

  const handledAckIds = useRef(new Set(Object.keys(latestAck)));
  useEffect(() => {
    const acks = (Object.values(latestAck) as any[]).filter(ack => !handledAckIds.current.has(ack.cmd_id));
    acks.forEach(ack => handledAckIds.current.add(ack.cmd_id));
    setCommands(prev => prev.map(cmd => {
      const ack = latestAck[cmd.cmd_id];
      return ack ? { ...cmd, status: ack.status } : cmd;
    }));
    const ack = [...acks].reverse().find(a => a.device_id === selectedCode && a.status === 'SUCCESS' && a.config_json);
    if (ack) {
      setDevice(prev => prev ? { ...prev, config_json: ack.config_json,
        control_mode: ack.current_actuators?.control_mode ?? prev.control_mode,
        fan_state: ack.current_actuators?.fan_state ?? prev.fan_state,
        buzzer_state: ack.current_actuators?.buzzer_state ?? prev.buzzer_state,
      } : prev);
      setPeripherals(normalizePeripherals(ack.config_json.peripherals));
      setCustomPeripherals(ack.config_json.custom_peripherals || []);
    }
  }, [latestAck, selectedCode]);

  const applyPeripheralsUpdate = async (
    nextPeripherals: Required<PeripheralConfig>,
    nextCustom: CustomPeripheralConfig[],
    successMsg: string
  ) => {
    if (!device) return;
    if (!isAdmin) {
      showToast('Chỉ Chủ kho (Admin) mới có quyền thêm, xóa hoặc thay đổi ngoại vi!', 'error');
      return;
    }

    setIsConfiguring(true);
    try {
      const res = await api.updateConfig(device.id, {
        peripherals: nextPeripherals,
        custom_peripherals: nextCustom,
      });
      if (res.success) {
        await waitForCommandAck(res.data?.cmd_id);
        await fetchDeviceData();
        showToast(successMsg, 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi cập nhật thiết bị ngoại vi', 'error');
    } finally {
      setIsConfiguring(false);
    }
  };

  const handleRemovePeripheral = (item: PeripheralDefinition) => {
    const next: Required<PeripheralConfig> = {
      ...peripherals,
      [item.enabledKey]: false,
    };
    applyPeripheralsUpdate(next, customPeripherals, `Đã xóa "${item.shortName}" khỏi node.`);
  };

  const handleToggleAutoMode = (item: PeripheralDefinition) => {
    if (!item.autoKey) return;
    const nextValue = !peripherals[item.autoKey];
    const next: Required<PeripheralConfig> = {
      ...peripherals,
      [item.autoKey]: nextValue,
    };
    applyPeripheralsUpdate(
      next,
      customPeripherals,
      `${item.shortName}: ${nextValue ? 'Đã bật tự động' : 'Đã chuyển thủ công'}.`
    );
  };

  const openCreateCustomModal = () => {
    const builtinKinds: Record<PeripheralDefinition['id'], CreatePeripheralKind> = {
      aht20: 'BUILTIN_AHT20', mq135: 'BUILTIN_MQ135', door: 'BUILTIN_DOOR', fan: 'BUILTIN_FAN', buzzer: 'BUILTIN_BUZZER',
    };
    const firstRemoved = customPeripherals.length >= 8 ? removedPeripherals[0] : undefined;
    const initialType: CreatePeripheralKind = firstRemoved ? builtinKinds[firstRemoved.id] : 'RELAY_OUTPUT';

    setCpName('');
    setCpType(initialType);
    setCpUnit('%');
    if (initialType === 'BUILTIN_AHT20') {
      const i2cPairs = getAvailableI2cPairs(peripherals, customPeripherals);
      setCpI2cPairId(i2cPairs[0]?.id ?? '21-22');
    } else {
      const avail = getAvailableGpios(initialType, peripherals, customPeripherals);
      setCpGpio(avail[0]?.gpio ?? 26);
    }
    setIsCreateCustomOpen(true);
  };

  const handleCustomTypeChange = (nextType: CreatePeripheralKind) => {
    setCpType(nextType);
    if (nextType === 'BUILTIN_AHT20') {
      const i2cPairs = getAvailableI2cPairs(peripherals, customPeripherals);
      setCpI2cPairId(i2cPairs[0]?.id ?? '21-22');
    } else {
      const avail = getAvailableGpios(nextType, peripherals, customPeripherals);
      setCpGpio(avail[0]?.gpio ?? 26);
    }
  };

  const handleCreateCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (cpType === 'BUILTIN_AHT20') {
      const i2cPairs = getAvailableI2cPairs(peripherals, customPeripherals);
      const selectedPair = i2cPairs.find((p) => p.id === cpI2cPairId);
      if (!selectedPair) {
        showToast('Chưa chọn cặp chân I2C hợp lệ còn trống (SDA/SCL)!', 'warning');
        return;
      }
      const next: Required<PeripheralConfig> = {
        ...peripherals,
        aht20_enabled: true,
        aht20_sda_gpio: selectedPair.sda,
        aht20_scl_gpio: selectedPair.scl,
      };
      setIsCreateCustomOpen(false);
      applyPeripheralsUpdate(
        next,
        customPeripherals,
        `Đã thêm Cảm biến Nhiệt & Ẩm (AHT20) vào GPIO ${selectedPair.sda}/${selectedPair.scl} (I2C) và đồng bộ xuống ESP32.`
      );
      return;
    }

    const avail = getAvailableGpios(cpType, peripherals, customPeripherals);
    if (avail.length === 0 || !avail.some((a) => a.gpio === cpGpio)) {
      showToast('Chưa chọn chân GPIO hợp lệ còn trống!', 'warning');
      return;
    }

    if (cpType === 'BUILTIN_MQ135') {
      const next: Required<PeripheralConfig> = { ...peripherals, mq135_enabled: true, mq135_gpio: cpGpio };
      setIsCreateCustomOpen(false);
      applyPeripheralsUpdate(
        next,
        customPeripherals,
        `Đã thêm Cảm biến Khí Gas (MQ-135) vào GPIO ${cpGpio} và đồng bộ xuống ESP32.`
      );
      return;
    }
    if (cpType === 'BUILTIN_DOOR') {
      const next: Required<PeripheralConfig> = { ...peripherals, door_enabled: true, door_gpio: cpGpio };
      setIsCreateCustomOpen(false);
      applyPeripheralsUpdate(
        next,
        customPeripherals,
        `Đã thêm Cảm biến Cửa Kho vào GPIO ${cpGpio} và đồng bộ xuống ESP32.`
      );
      return;
    }
    if (cpType === 'BUILTIN_FAN') {
      const next: Required<PeripheralConfig> = { ...peripherals, fan_enabled: true, fan_gpio: cpGpio };
      setIsCreateCustomOpen(false);
      applyPeripheralsUpdate(
        next,
        customPeripherals,
        `Đã thêm Quạt Thông Gió vào GPIO ${cpGpio} và đồng bộ xuống ESP32.`
      );
      return;
    }
    if (cpType === 'BUILTIN_BUZZER') {
      const next: Required<PeripheralConfig> = { ...peripherals, buzzer_enabled: true, buzzer_gpio: cpGpio };
      setIsCreateCustomOpen(false);
      applyPeripheralsUpdate(
        next,
        customPeripherals,
        `Đã thêm Còi Báo Động vào GPIO ${cpGpio} và đồng bộ xuống ESP32.`
      );
      return;
    }

    const trimmed = cpName.trim();
    if (!trimmed) {
      showToast('Vui lòng nhập tên thiết bị ngoại vi!', 'warning');
      return;
    }

    const newItem: CustomPeripheralConfig = {
      id: `cp_${Date.now().toString(36)}`,
      name: trimmed,
      type: cpType,
      gpio: cpGpio,
      active_high: true,
      pull_up: ESP32_SAFE_GPIOS.find(pin => pin.gpio === cpGpio)?.hasInternalPullup ?? false,
      ...(cpType === 'ANALOG_INPUT' ? { unit: cpUnit.trim() || '%' } : {}),
    };

    const nextCustom = [...customPeripherals, newItem];
    setIsCreateCustomOpen(false);
    applyPeripheralsUpdate(
      peripherals,
      nextCustom,
      `Đã thêm thiết bị mới "${newItem.name}" (GPIO ${newItem.gpio}) và đồng bộ xuống ESP32.`
    );
  };

  const handleRemoveCustomPeripheral = (cp: CustomPeripheralConfig) => {
    const nextCustom = customPeripherals.filter((item) => item.id !== cp.id);
    applyPeripheralsUpdate(peripherals, nextCustom, `Đã xóa "${cp.name}" khỏi node.`);
  };

  const handleControlCustomRelay = async (cp: CustomPeripheralConfig, currentOn: boolean) => {
    if (!device || isViewer) return;
    const action = currentOn ? 'TURN_OFF' : 'TURN_ON';
    setIsControlling(true);
    try {
      const res = await api.controlActuator(device.id, {
        target: 'CUSTOM_PERIPHERAL',
        peripheral_id: cp.id,
        action,
      });
      if (res.success) {
        await waitForCommandAck(res.data?.cmd_id);
        showToast(`Thiết bị đã xác nhận ${action === 'TURN_ON' ? 'BẬT' : 'TẮT'} "${cp.name}".`, 'success');
      }
    } catch (err: any) {
      showToast(err.message || `Lỗi điều khiển ${cp.name}`, 'error');
    } finally {
      setIsControlling(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!device) return;
    if (isViewer) {
      showToast('Vai trò Giám sát QC không có quyền đổi cấu hình.', 'error');
      return;
    }

    setIsConfiguring(true);
    try {
      const payload: Record<string, any> = {
        sampling_interval_ms: Number(samplingInterval),
        temp_warn_threshold: Number(tempWarn),
        temp_crit_threshold: Number(tempCrit),
        hum_warn_threshold: Number(humWarn),
        hum_crit_threshold: Number(humCrit),
        emc_warn_threshold: Number(emcWarn),
        emc_crit_threshold: Number(emcCrit),
        gas_warn_threshold: Number(gasWarn),
        gas_crit_threshold: Number(gasCrit),
      };
      if (isAdmin) {
        payload.peripherals = peripherals;
        payload.custom_peripherals = customPeripherals;
      }
      const res = await api.updateConfig(device.id, payload);
      if (res.success) {
        await waitForCommandAck(res.data?.cmd_id);
        showToast('ESP32 đã xác nhận áp dụng cấu hình!', 'success');
        fetchDeviceData();
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi lưu cấu hình', 'error');
    } finally {
      setIsConfiguring(false);
    }
  };

  const handleControlActuator = async (
    target: 'VENTILATION_FAN' | 'ALARM_BUZZER',
    currentState: boolean
  ) => {
    if (!device) return;
    const action = currentState ? 'TURN_OFF' : 'TURN_ON';
    const isFan = target === 'VENTILATION_FAN';
    const label = isFan ? 'quạt thông gió' : 'còi báo động';

    setIsControlling(true);
    try {
      const res = await api.controlActuator(device.id, {
        target,
        action,
        ...(isFan ? { control_mode: 'MANUAL' } : {}),
      });
      if (res.success) {
        await waitForCommandAck(res.data?.cmd_id);
        await fetchDeviceData();
        showToast(`Thiết bị đã xác nhận ${action === 'TURN_ON' ? 'BẬT' : 'TẮT'} ${label}.`, 'success');
      }
    } catch (err: any) {
      showToast(err.message || `Lỗi gửi lệnh điều khiển ${label}`, 'error');
    } finally {
      setIsControlling(false);
    }
  };

  const handleSwitchFanAuto = async () => {
    if (!device || isViewer) return;
    setIsControlling(true);
    try {
      const res = await api.controlActuator(device.id, {
        target: 'VENTILATION_FAN',
        action: 'SET_AUTO',
        control_mode: 'AUTO',
      });
      if (res.success) {
        await waitForCommandAck(res.data?.cmd_id);
        await fetchDeviceData();
        showToast('Thiết bị đã xác nhận chế độ Tự động.', 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Không chuyển được quạt về chế độ tự động', 'error');
    } finally {
      setIsControlling(false);
    }
  };

  if (isLoading || !device) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-slate-500">
        Đang tải thông tin thiết bị...
      </div>
    );
  }

  const visibleHistory = selectedOnline ? telemetryHistory : [];
  const validAhtLogs = visibleHistory.filter((t) => !(t.temperature === 0 && t.humidity_air === 0));
  const temps = validAhtLogs.map((t) => t.temperature);
  const rhs = validAhtLogs.map((t) => t.humidity_air);
  const emcs = validAhtLogs.map((t) => t.estimated_emc);

  const validGasLogs = visibleHistory.filter((t) => typeof t.gas_ppm === 'number' && t.gas_ppm > 0);
  const gases = validGasLogs.map((t) => t.gas_ppm);

  const avgTemp = temps.length ? (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1) : '--';
  const maxTemp = temps.length ? Math.max(...temps).toFixed(1) : '--';
  const minTemp = temps.length ? Math.min(...temps).toFixed(1) : '--';

  const avgRH = rhs.length ? (rhs.reduce((a, b) => a + b, 0) / rhs.length).toFixed(1) : '--';
  const maxRH = rhs.length ? Math.max(...rhs).toFixed(1) : '--';
  const minRH = rhs.length ? Math.min(...rhs).toFixed(1) : '--';

  const avgEMC = emcs.length ? (emcs.reduce((a, b) => a + b, 0) / emcs.length).toFixed(1) : '--';

  const avgGas = gases.length ? Math.round(gases.reduce((a, b) => a + b, 0) / gases.length) : '--';
  const maxGas = gases.length ? Math.round(Math.max(...gases)) : '--';
  const minGas = gases.length ? Math.round(Math.min(...gases)) : '--';

  const isOnline = selectedOnline;
  const liveLifecycle = (deviceStatus[device.device_code]?.lifecycle_state as Device['lifecycle_state']) ?? device.lifecycle_state;
  const wsData = isOnline ? latestTelemetry[device.device_code] : undefined;
  const latestLog = visibleHistory[visibleHistory.length - 1];
  const canUseSnapshot = isOnline && !sessionWasReset.current;
  const sensorHealth = wsData?.sensor_health ?? (canUseSnapshot ? device.sensor_health : null);
  const doorOpen = wsData?.door_open ?? (canUseSnapshot ? device.door_open : null);
  const currentRisk = wsData?.risk_level ?? latestLog?.risk_level ?? 'SAFE';
  const currentFanState = isOnline
    ? wsData
      ? wsData.fan_state === 'ON'
      : canUseSnapshot && device.fan_state === 'ON'
    : false;
  const currentFanMode =
    wsData?.control_mode ??
    device.control_mode ??
    (peripherals.fan_auto !== false ? 'AUTO' : 'MANUAL');
  const fanStateKnown = Boolean(wsData?.fan_state ?? (canUseSnapshot ? device.fan_state : null));
  const buzzerStateKnown = Boolean(wsData?.buzzer_state ?? (canUseSnapshot ? device.buzzer_state : null));
  const currentBuzzerState = isOnline && (wsData?.buzzer_state ?? (canUseSnapshot ? device.buzzer_state : null)) === 'ON';
  const runtimeCustomList: CustomPeripheralRuntimeState[] =
    isOnline ? wsData?.custom_peripherals ?? (canUseSnapshot ? device.custom_peripherals ?? [] : []) : [];

  const ahtEnabled = peripherals.aht20_enabled !== false;
  const mqEnabled = peripherals.mq135_enabled !== false;

  const aht20Ok = !ahtEnabled || (sensorHealth?.aht20 ? sensorHealth.aht20.ok : true);
  const mq135Ok = !mqEnabled || (sensorHealth?.mq135 ? sensorHealth.mq135.ok : true);
  const liveTemp = isOnline ? wsData ? wsData.temperature : latestLog?.temperature ?? null : null;
  const liveRH = isOnline ? wsData ? wsData.humidity_air : latestLog?.humidity_air ?? null : null;
  const liveEMC = isOnline ? wsData ? wsData.estimated_emc : latestLog?.estimated_emc ?? null : null;
  const liveGas = isOnline ? wsData ? wsData.gas_ppm : latestLog?.gas_ppm ?? null : null;

  // Use confirmed device thresholds, so unsaved form edits never change live alert colors.
  const cfg = device.config_json || {};
  const metricCards = [
    { id: 'temperature', sensor: 'aht20', label: 'Nhiệt độ', icon: Thermometer, iconClass: 'text-amber-500', enabled: ahtEnabled,
      value: liveTemp, unit: '°C', healthy: aht20Ok, warn: cfg.temp_warn_threshold ?? 25, critical: cfg.temp_crit_threshold ?? 28,
      summary: `TB: ${avgTemp}°C (${minTemp}–${maxTemp}°C)` },
    { id: 'humidity', sensor: 'aht20', label: 'Độ ẩm không khí', icon: Droplets, iconClass: 'text-sky-500', enabled: ahtEnabled,
      value: liveRH, unit: '%RH', healthy: aht20Ok, warn: cfg.hum_warn_threshold ?? 65, critical: cfg.hum_crit_threshold ?? 70,
      summary: `TB: ${avgRH}% (${minRH}–${maxRH}%)` },
    { id: 'emc', sensor: 'aht20', label: 'Độ ẩm hạt (EMC)', icon: Wind, iconClass: 'text-emerald-600', enabled: ahtEnabled,
      value: liveEMC, unit: '%MC', healthy: aht20Ok, warn: cfg.emc_warn_threshold ?? 14, critical: cfg.emc_crit_threshold ?? 14.8,
      summary: `TB: ${avgEMC}%` },
    { id: 'gas', sensor: 'mq135', label: 'Khí Gas (MQ-135)', icon: Flame, iconClass: 'text-purple-600', enabled: mqEnabled,
      value: liveGas, unit: 'ppm', healthy: mq135Ok, warn: cfg.gas_warn_threshold ?? 600, critical: cfg.gas_crit_threshold ?? 700,
      summary: `TB: ${avgGas} ppm (${minGas}–${maxGas} ppm)` },
  ].filter(metric => metric.enabled).map(metric => ({
    ...metric, status: getMetricStatus(metric.value, metric.warn, metric.critical, metric.healthy, isOnline),
  }));

  const attachedPeripherals = PERIPHERAL_CATALOG.filter((p) => peripherals[p.enabledKey] !== false);
  const removedPeripherals = PERIPHERAL_CATALOG.filter((p) => peripherals[p.enabledKey] === false);
  const availableI2cPairsForModal = getAvailableI2cPairs(peripherals, customPeripherals);
  const availableGpiosForModal = getAvailableGpios(cpType, peripherals, customPeripherals);

  const builtinItems = attachedPeripherals.map((item): PeripheralItem => {
    const base: PeripheralItem = {
      id: `builtin-${item.id}`, name: item.shortName, pin: getPeripheralPinLabel(item.id, peripherals),
      icon: item.id === 'aht20' ? Thermometer : item.id === 'mq135' ? Flame : item.id === 'door' ? ToggleRight : item.id === 'fan' ? Fan : Volume2,
      status: 'Ngoại tuyến', tone: 'neutral', onRemove: () => handleRemovePeripheral(item),
    };
    if (item.id === 'aht20' || item.id === 'mq135') {
      const metrics = metricCards.filter(metric => metric.sensor === item.id);
      const status = (['ERROR', 'CRITICAL', 'WARNING', 'SAFE', 'NO_DATA'] as MetricStatus[])
        .find(level => metrics.some(metric => metric.status === level)) || 'NO_DATA';
      const health = item.id === 'aht20' ? sensorHealth?.aht20 : sensorHealth?.mq135;
      return { ...base,
        pin: `${base.pin}${isOnline && health?.status === 'SIMULATED' ? ' · Mô phỏng' : ''}`,
        status: !isOnline ? 'Ngoại tuyến' : METRIC_STYLES[status].label,
        tone: status === 'CRITICAL' || status === 'ERROR' ? 'danger' : status === 'WARNING' ? 'warning' : status === 'SAFE' ? 'success' : 'neutral',
        note: !isOnline ? undefined : status === 'ERROR' ? health?.message || 'Chưa nhận được tín hiệu cảm biến.' :
          metrics.filter(metric => metric.status === 'WARNING' || metric.status === 'CRITICAL')
            .map(metric => `${metric.label}: ${metric.value} ${metric.unit}`).join(' · ') || undefined,
      };
    }
    if (item.id === 'door') return { ...base,
      status: !isOnline ? 'Ngoại tuyến' : typeof doorOpen !== 'boolean' ? '--' : doorOpen ? 'Đang mở' : 'Đang đóng',
      tone: !isOnline || typeof doorOpen !== 'boolean' ? 'neutral' : doorOpen ? 'warning' : 'success',
    };
    const isFan = item.id === 'fan';
    const known = isFan ? fanStateKnown : buzzerStateKnown;
    const on = isFan ? currentFanState : currentBuzzerState;
    const auto = isFan ? currentFanMode === 'AUTO' : peripherals.buzzer_auto;
    return { ...base,
      status: !isOnline ? 'Ngoại tuyến' : !known ? 'Chờ trạng thái' : on ? 'Đang bật' : 'Đang tắt',
      tone: isOnline && known && on ? 'success' : 'neutral',
      mode: auto ? 'Tự động' : 'Thủ công',
      action: { label: on ? 'Tắt' : 'Bật', disabled: isViewer || !known,
        onClick: () => handleControlActuator(isFan ? 'VENTILATION_FAN' : 'ALARM_BUZZER', on) },
      auto: isAdmin ? { checked: auto, disabled: false, onChange: () => handleToggleAutoMode(item) } : undefined,
      autoAction: isFan && !auto && !isViewer && !isAdmin ? handleSwitchFanAuto : undefined,
    };
  });
  const customItems = customPeripherals.map((cp): PeripheralItem => {
    const live = runtimeCustomList.find(value => value.id === cp.id);
    const known = isOnline && live !== undefined;
    const relay = cp.type === 'RELAY_OUTPUT';
    const analog = cp.type === 'ANALOG_INPUT';
    const on = live?.state === 'ON' || live?.state === 'ACTIVE' || live?.value === 1;
    const lowSignal = known && analog && live.raw_adc !== undefined && live.raw_adc < 25;
    return {
      id: `custom-${cp.id}`, name: cp.name,
      pin: `GPIO ${cp.gpio} · ${relay ? 'Relay' : analog ? 'Analog' : 'Digital'}`,
      icon: relay ? Power : analog ? Gauge : ToggleRight,
      status: !isOnline ? 'Ngoại tuyến' : !known ? '--' : analog ? `${live.value ?? '--'} ${cp.unit || '%'}` : relay ? on ? 'Đang bật' : 'Đang tắt' : on ? 'Kích hoạt' : 'Bình thường',
      tone: !known || (relay && !on) ? 'neutral' : lowSignal || (!relay && !analog && on) ? 'warning' : 'success',
      note: lowSignal ? 'Tín hiệu analog thấp' : undefined,
      action: relay ? { label: on ? 'Tắt' : 'Bật', disabled: isViewer || !known, onClick: () => handleControlCustomRelay(cp, on) } : undefined,
      onRemove: () => handleRemoveCustomPeripheral(cp),
    };
  });
  const sensorItems = [...builtinItems.filter(item => attachedPeripherals.find(p => `builtin-${p.id}` === item.id)?.category === 'SENSOR'),
    ...customItems.filter(item => customPeripherals.find(cp => `custom-${cp.id}` === item.id)?.type !== 'RELAY_OUTPUT')];
  const actuatorItems = [...builtinItems.filter(item => attachedPeripherals.find(p => `builtin-${p.id}` === item.id)?.category === 'ACTUATOR'),
    ...customItems.filter(item => customPeripherals.find(cp => `custom-${cp.id}` === item.id)?.type === 'RELAY_OUTPUT')];

  const chartData = visibleHistory.map((item) => ({
    time: new Date(item.recorded_at).toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    'Nhiệt độ (°C)': item.temperature,
    'Độ ẩm (%RH)': item.humidity_air,
    'Ẩm hạt (%MC)': item.estimated_emc,
    'Khí Gas (ppm)': item.gas_ppm,
  }));

  const formatCommandType = (type: string, payload?: any) => {
    if (type === 'UPDATE_CONFIG') return 'Cập nhật cấu hình';
    if (type === 'ACTUATOR_CONTROL') {
      if (payload?.target === 'CUSTOM_PERIPHERAL') {
        const match = customPeripherals.find((c) => c.id === payload?.peripheral_id);
        const action = payload?.action === 'TURN_ON' ? 'Bật' : 'Tắt';
        return `${action} ${match ? match.name : 'thiết bị'}`;
      }
      if (payload?.action === 'SET_AUTO') return 'Chuyển quạt sang Tự động';
      const target = payload?.target === 'ALARM_BUZZER' ? 'còi' : 'quạt';
      const action = payload?.action === 'TURN_ON' ? 'Bật' : 'Tắt';
      return `${action} ${target}`;
    }
    return type;
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/')}
            className="p-2 rounded-xl bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 shadow-sm transition-colors"
            title="Quay lại Tổng quan"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900 break-words">{device.name}</h1>
              <LifecycleBadge state={liveLifecycle} />
              {isOnline && (wsData || latestLog) ? (
                <RiskBadge risk={currentRisk} />
              ) : !isOnline && liveLifecycle === 'OFFLINE' ? null : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                  {isOnline ? 'Chờ dữ liệu' : 'Ngoại tuyến'}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {device.zone?.name || 'Chưa phân khu vực'} &middot; Mã thiết bị: {device.device_code}
            </p>
          </div>
        </div>

      </div>

      {/* Thông số hiện tại & Thống kê */}
      {(ahtEnabled || mqEnabled) && (
        <div
          className={`grid grid-cols-1 gap-4 ${
            ahtEnabled && mqEnabled
              ? 'sm:grid-cols-2 lg:grid-cols-4'
              : ahtEnabled
              ? 'sm:grid-cols-3'
              : 'sm:grid-cols-1'
          }`}
        >
          {metricCards.map(metric => {
            const style = METRIC_STYLES[metric.status];
            const Icon = metric.icon;
            const hasValue = metric.status !== 'ERROR' && metric.status !== 'NO_DATA';
            return (
              <div key={metric.id} className={`border rounded-2xl p-4 shadow-sm transition-colors ${style.card}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <Icon className={`w-4 h-4 ${metric.status === 'WARNING' || metric.status === 'CRITICAL' ? style.text : metric.iconClass}`} />
                    <span>{metric.label}</span>
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${style.badge}`}>
                    {isOnline ? style.label : 'Ngoại tuyến'}
                  </span>
                </div>
                <div className={`text-2xl font-bold mt-2 ${style.text}`}>
                  {hasValue ? <>{metric.value}<span className="ml-1 text-xs font-medium">{metric.unit}</span></> : '--'}
                </div>
                <div className="text-[11px] text-slate-600 mt-1.5">
                  Cảnh báo: ≥{metric.warn} {metric.unit} · Nguy hiểm: ≥{metric.critical} {metric.unit}
                </div>
                <div className="text-xs text-slate-500 mt-1.5">{isOnline ? metric.summary : 'TB: -- · Thấp nhất: -- · Cao nhất: --'}</div>
              </div>
            );
          })}
        </div>
      )}

      <PeripheralPanel key={device.id} sensors={sensorItems} actuators={actuatorItems} isAdmin={isAdmin}
        isOnline={isOnline} busy={isConfiguring || isControlling} onAdd={openCreateCustomModal} />

      {/* Biểu đồ xu hướng */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-600" />
            <h3 className="font-bold text-slate-900 text-sm">Biểu đồ theo dõi gần đây</h3>
          </div>
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
            <span>{isOnline ? 'Tự động cập nhật' : 'Ngừng cập nhật · Ngoại tuyến'}</span>
          </div>
        </div>

        <div className="h-72 w-full">
          {isOnline && chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 11 }} />
              <YAxis
                yAxisId="climate"
                stroke="#64748b"
                tick={{ fontSize: 11 }}
                domain={['dataMin - 5', 'dataMax + 5']}
              />
              {mqEnabled && (
                <YAxis
                  yAxisId="gas"
                  orientation="right"
                  stroke="#9333ea"
                  tick={{ fontSize: 11 }}
                  domain={[0, 'dataMax + 100']}
                />
              )}
              <Tooltip
                contentStyle={{
                  backgroundColor: '#ffffff',
                  borderColor: '#e2e8f0',
                  borderRadius: '0.75rem',
                  fontSize: '12px',
                  color: '#0f172a',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
              {ahtEnabled && (
                <>
                  <Line
                    yAxisId="climate"
                    type="monotone"
                    dataKey="Nhiệt độ (°C)"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="climate"
                    type="monotone"
                    dataKey="Độ ẩm (%RH)"
                    stroke="#0ea5e9"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="climate"
                    type="monotone"
                    dataKey="Ẩm hạt (%MC)"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </>
              )}
              {mqEnabled && (
                <Line
                  yAxisId="gas"
                  type="monotone"
                  dataKey="Khí Gas (ppm)"
                  stroke="#9333ea"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 text-slate-400">
              <Activity className="w-7 h-7" />
              <span className="text-2xl font-semibold">--</span>
              <span className="text-sm">{isOnline ? 'Đang chờ dữ liệu mới từ thiết bị' : 'Thiết bị ngoại tuyến · Biểu đồ đã được đặt lại'}</span>
            </div>
          )}
        </div>
      </div>

      {/* Ngưỡng cảnh báo & Lịch sử điều khiển */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Settings className="w-4 h-4 text-amber-600" />
            <h3 className="font-bold text-slate-900 text-sm">Cài đặt ngưỡng cảnh báo</h3>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Thiết lập ngưỡng cảnh báo và thời gian gửi dữ liệu cho thiết bị.
          </p>

          <form onSubmit={handleSaveConfig} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Chu kỳ cập nhật (ms)
              </label>
              <input
                type="number"
                min="1000"
                step="500"
                value={samplingInterval}
                onChange={(e) => setSamplingInterval(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nhiệt cảnh báo (°C)</label>
                <input
                  type="number"
                  step="0.5"
                  value={tempWarn}
                  onChange={(e) => setTempWarn(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-rose-700 mb-1">Nhiệt nguy hiểm (°C)</label>
                <input
                  type="number"
                  step="0.5"
                  value={tempCrit}
                  onChange={(e) => setTempCrit(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:border-rose-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Độ ẩm cảnh báo (%)</label>
                <input
                  type="number"
                  step="0.5"
                  value={humWarn}
                  onChange={(e) => setHumWarn(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-rose-700 mb-1">Độ ẩm nguy hiểm (%)</label>
                <input
                  type="number"
                  step="0.5"
                  value={humCrit}
                  onChange={(e) => setHumCrit(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:border-rose-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Ẩm hạt cảnh báo (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={emcWarn}
                  onChange={(e) => setEmcWarn(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-rose-700 mb-1">Ẩm hạt nguy hiểm (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={emcCrit}
                  onChange={(e) => setEmcCrit(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:border-rose-500"
                />
              </div>
              {mqEnabled && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Gas cảnh báo (ppm)</label>
                    <input
                      type="number"
                      step="10"
                      value={gasWarn}
                      onChange={(e) => setGasWarn(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-rose-700 mb-1">Gas nguy hiểm (ppm)</label>
                    <input
                      type="number"
                      step="10"
                      value={gasCrit}
                      onChange={(e) => setGasCrit(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:border-rose-500"
                    />
                  </div>
                </>
              )}
            </div>

            <button
              type="submit"
              disabled={isConfiguring || isViewer}
              className="w-full py-2.5 px-4 rounded-xl font-semibold text-xs bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isConfiguring ? 'Đang lưu...' : 'Lưu cài đặt ngưỡng'}</span>
            </button>
          </form>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <History className="w-4 h-4 text-blue-600" />
            <h3 className="font-bold text-slate-900 text-sm">Lịch sử điều khiển gần đây</h3>
          </div>

          <div className="flex-1 overflow-y-auto max-h-80">
            <table className="w-full text-left text-xs">
              <thead className="text-[11px] text-slate-500 uppercase border-b border-slate-200">
                <tr>
                  <th className="py-2">Thao tác</th>
                  <th className="py-2">Trạng thái</th>
                  <th className="py-2 text-right">Thời gian</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {commands.map((cmd) => (
                  <tr key={cmd.id} className="hover:bg-slate-50">
                    <td className="py-2.5 font-medium text-slate-800">
                      {formatCommandType(cmd.command_type, cmd.payload_json)}
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`inline-flex items-center font-semibold px-2 py-0.5 rounded-full text-[10px] border ${
                          cmd.status === 'SUCCESS'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : cmd.status === 'PENDING'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        {cmd.status === 'SUCCESS'
                          ? 'Thành công'
                          : cmd.status === 'PENDING'
                          ? 'Đang chờ'
                          : 'Thất bại'}
                      </span>
                    </td>
                    <td className="py-2.5 text-slate-500 text-right">
                      {new Date(cmd.created_at).toLocaleTimeString('vi-VN', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                  </tr>
                ))}
                {commands.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-slate-400">
                      Chưa có lệnh điều khiển nào.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* MODAL: TẠO THIẾT BỊ NGOẠI VI MỚI (TÙY CHỌN CHÂN GPIO ESP32) */}
      {isCreateCustomOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-emerald-600" />
                <h2 className="text-base font-bold text-slate-900">Thêm ngoại vi</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateCustomOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Loại thiết bị *
                </label>
                <select
                  value={cpType}
                  onChange={(e) => handleCustomTypeChange(e.target.value as CreatePeripheralKind)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500"
                >
                  {removedPeripherals.length > 0 && (
                    <optgroup label="Thiết bị chuẩn của mạch (đang gỡ)">
                      {!peripherals.aht20_enabled && (
                        <option value="BUILTIN_AHT20">
                          Cảm biến Nhiệt &amp; Ẩm (AHT20 — I2C 2 chân 21/22)
                        </option>
                      )}
                      {!peripherals.mq135_enabled && (
                        <option value="BUILTIN_MQ135">
                          Cảm biến Khí Gas (MQ-135 — Analog)
                        </option>
                      )}
                      {!peripherals.door_enabled && (
                        <option value="BUILTIN_DOOR">
                          Cảm biến Cửa Kho (Digital)
                        </option>
                      )}
                      {!peripherals.fan_enabled && (
                        <option value="BUILTIN_FAN">
                          Quạt Thông Gió (Relay)
                        </option>
                      )}
                      {!peripherals.buzzer_enabled && (
                        <option value="BUILTIN_BUZZER">
                          Còi Báo Động (Relay)
                        </option>
                      )}
                    </optgroup>
                  )}
                  <optgroup label="Ngoại vi mở rộng tự tạo (GPIO đơn)">
                    <option value="RELAY_OUTPUT" disabled={customPeripherals.length >= 8}>Thiết bị bật / tắt (Quạt, Đèn, Còi, Bơm...)</option>
                    <option value="DIGITAL_INPUT" disabled={customPeripherals.length >= 8}>Cảm biến đóng / mở (0 / 1)</option>
                    <option value="ANALOG_INPUT" disabled={customPeripherals.length >= 8}>Cảm biến đo mức (Analog 0–100%)</option>
                  </optgroup>
                </select>
              </div>

              {!cpType.startsWith('BUILTIN_') && (
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Tên thiết bị *
                  </label>
                  <input
                    type="text"
                    placeholder="VD: Đèn cảnh báo, Quạt hút 2, Cảm biến chuyển động..."
                    value={cpName}
                    onChange={(e) => setCpName(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Chân cắm trên ESP32 *
                </label>
                {cpType === 'BUILTIN_AHT20' ? (
                  availableI2cPairsForModal.length === 0 ? (
                    <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700">
                      Cặp chân I2C (21/22 hoặc 16/17) đang bị thiết bị khác chiếm dụng.
                    </div>
                  ) : (
                    <select
                      value={cpI2cPairId}
                      onChange={(e) => setCpI2cPairId(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500"
                    >
                      {availableI2cPairsForModal.map((pair) => (
                        <option key={pair.id} value={pair.id}>
                          {pair.label}
                        </option>
                      ))}
                    </select>
                  )
                ) : availableGpiosForModal.length === 0 ? (
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700">
                    Không còn chân GPIO trống phù hợp cho loại thiết bị này.
                  </div>
                ) : (
                  <select
                    value={cpGpio}
                    onChange={(e) => setCpGpio(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500"
                  >
                    {availableGpiosForModal.map((g) => (
                      <option key={g.gpio} value={g.gpio}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {cpType === 'ANALOG_INPUT' && (
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Đơn vị hiển thị
                  </label>
                  <input
                    type="text"
                    placeholder="VD: %, lux, ppm..."
                    value={cpUnit}
                    onChange={(e) => setCpUnit(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              )}

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateCustomOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  disabled={
                    isConfiguring || !isOnline ||
                    (!cpType.startsWith('BUILTIN_') && customPeripherals.length >= 8) ||
                    (cpType === 'BUILTIN_AHT20'
                      ? availableI2cPairsForModal.length === 0
                      : availableGpiosForModal.length === 0)
                  }
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs disabled:opacity-50"
                >
                  Thêm vào thiết bị
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
