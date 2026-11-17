import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
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
import { SensorHealthPanel } from '../components/SensorHealthPanel';
import {
  PERIPHERAL_CATALOG,
  DEFAULT_PERIPHERAL_CONFIG,
  normalizePeripherals,
  PeripheralDefinition,
  CreatePeripheralKind,
  getAvailableGpios,
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
  Trash2,
  Plus,
  Power,
  Gauge,
  ToggleRight,
  X,
} from 'lucide-react';

export const DeviceDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin, isViewer, showToast } = useAuth();
  const { latestTelemetry, latestAck } = useSocket();

  const [device, setDevice] = useState<Device | null>(null);
  const [telemetryHistory, setTelemetryHistory] = useState<TelemetryLog[]>([]);
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
  const [showAddPeripheralMenu, setShowAddPeripheralMenu] = useState(false);

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
        if (res.data.telemetry_logs) setTelemetryHistory([...res.data.telemetry_logs].reverse());
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
    fetchDeviceData();
  }, [id]);

  useEffect(() => {
    if (!device) return;
    const update = latestTelemetry[device.device_code];
    if (update) {
      setTelemetryHistory((prev) => {
        const item: TelemetryLog = {
          id: Date.now(),
          device_id: device.id,
          msg_id: `msg_${Date.now()}`,
          temperature: update.temperature,
          humidity_air: update.humidity_air,
          gas_ppm: update.gas_ppm,
          estimated_emc: update.estimated_emc,
          fan_state: update.fan_state === 'ON',
          risk_level: update.risk_level,
          recorded_at: new Date(update.timestamp).toISOString(),
        };
        return [...prev.slice(-29), item];
      });
    }
  }, [latestTelemetry, device]);

  useEffect(() => {
    Object.values(latestAck).forEach((ack: any) => {
      setCommands((prev) =>
        prev.map((cmd) => (cmd.cmd_id === ack.cmd_id ? { ...cmd, status: ack.status } : cmd))
      );
    });
  }, [latestAck]);

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

    const prevPeripherals = peripherals;
    const prevCustom = customPeripherals;
    setPeripherals(nextPeripherals);
    setCustomPeripherals(nextCustom);
    setDevice((prev) =>
      prev
        ? {
            ...prev,
            config_json: {
              ...(prev.config_json || {}),
              peripherals: nextPeripherals,
              custom_peripherals: nextCustom,
            },
          }
        : prev
    );

    setIsConfiguring(true);
    try {
      const res = await api.updateConfig(device.id, {
        peripherals: nextPeripherals,
        custom_peripherals: nextCustom,
      });
      if (res.success) {
        showToast(successMsg, 'success');
      }
    } catch (err: any) {
      setPeripherals(prevPeripherals);
      setCustomPeripherals(prevCustom);
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

  const handleAddPeripheral = (item: PeripheralDefinition) => {
    const next: Required<PeripheralConfig> = {
      ...peripherals,
      [item.enabledKey]: true,
    };
    setShowAddPeripheralMenu(false);
    applyPeripheralsUpdate(next, customPeripherals, `Đã thêm lại "${item.shortName}" vào node.`);
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
    const initialType: CreatePeripheralKind = !peripherals.aht20_enabled
      ? 'BUILTIN_AHT20'
      : !peripherals.mq135_enabled
      ? 'BUILTIN_MQ135'
      : !peripherals.door_enabled
      ? 'BUILTIN_DOOR'
      : !peripherals.fan_enabled
      ? 'BUILTIN_FAN'
      : !peripherals.buzzer_enabled
      ? 'BUILTIN_BUZZER'
      : 'RELAY_OUTPUT';

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
      pull_up: true,
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
    try {
      const res = await api.controlActuator(device.id, {
        target: 'CUSTOM_PERIPHERAL',
        peripheral_id: cp.id,
        action,
      });
      if (res.success) {
        showToast(
          `Đã gửi lệnh ${action === 'TURN_ON' ? 'BẬT' : 'TẮT'} "${cp.name}".`,
          'warning'
        );
      }
    } catch (err: any) {
      showToast(err.message || `Lỗi điều khiển ${cp.name}`, 'error');
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
        showToast('Đã lưu ngưỡng cảnh báo và đồng bộ xuống ESP32!', 'success');
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

    try {
      const res = await api.controlActuator(device.id, {
        target,
        action,
        ...(isFan ? { control_mode: 'MANUAL' } : {}),
      });
      if (res.success) {
        showToast(`Đã gửi lệnh ${action === 'TURN_ON' ? 'BẬT' : 'TẮT'} ${label}.`, 'warning');
      }
    } catch (err: any) {
      showToast(err.message || `Lỗi gửi lệnh điều khiển ${label}`, 'error');
    }
  };

  if (isLoading || !device) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-slate-500">
        Đang tải thông tin thiết bị...
      </div>
    );
  }

  const validAhtLogs = telemetryHistory.filter((t) => !(t.temperature === 0 && t.humidity_air === 0));
  const temps = validAhtLogs.map((t) => t.temperature);
  const rhs = validAhtLogs.map((t) => t.humidity_air);
  const emcs = validAhtLogs.map((t) => t.estimated_emc);

  const validGasLogs = telemetryHistory.filter((t) => typeof t.gas_ppm === 'number' && t.gas_ppm > 0);
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

  const wsData = latestTelemetry[device.device_code];
  const latestLog = telemetryHistory[telemetryHistory.length - 1];
  const sensorHealth = wsData?.sensor_health ?? device.sensor_health;
  const doorOpen = wsData?.door_open ?? device.door_open;
  const currentRisk = wsData?.risk_level ?? latestLog?.risk_level ?? 'SAFE';
  const currentFanState = wsData
    ? wsData.fan_state === 'ON'
    : latestLog?.fan_state ?? false;
  const currentFanMode =
    wsData?.control_mode ??
    device.control_mode ??
    (peripherals.fan_auto !== false ? 'AUTO' : 'MANUAL');
  const currentBuzzerState = wsData ? wsData.buzzer_state === 'ON' : false;
  const runtimeCustomList: CustomPeripheralRuntimeState[] =
    wsData?.custom_peripherals ?? device.custom_peripherals ?? [];

  const ahtEnabled = peripherals.aht20_enabled !== false;
  const mqEnabled = peripherals.mq135_enabled !== false;
  const fanEnabled = peripherals.fan_enabled !== false;
  const buzzerEnabled = peripherals.buzzer_enabled !== false;

  const aht20Ok = !ahtEnabled || (sensorHealth?.aht20 ? sensorHealth.aht20.ok : true);
  const mq135Ok = !mqEnabled || (sensorHealth?.mq135 ? sensorHealth.mq135.ok : true);
  const liveTemp = wsData ? wsData.temperature : latestLog?.temperature ?? null;
  const liveRH = wsData ? wsData.humidity_air : latestLog?.humidity_air ?? null;
  const liveEMC = wsData ? wsData.estimated_emc : latestLog?.estimated_emc ?? null;
  const liveGas = wsData ? wsData.gas_ppm : latestLog?.gas_ppm ?? null;

  const attachedPeripherals = PERIPHERAL_CATALOG.filter((p) => peripherals[p.enabledKey] !== false);
  const removedPeripherals = PERIPHERAL_CATALOG.filter((p) => peripherals[p.enabledKey] === false);
  const availableI2cPairsForModal = getAvailableI2cPairs(peripherals, customPeripherals);
  const availableGpiosForModal = getAvailableGpios(cpType, peripherals, customPeripherals);

  const chartData = telemetryHistory.map((item) => ({
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
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="p-2 rounded-xl bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 shadow-sm transition-colors"
            title="Quay lại Tổng quan"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900">{device.name}</h1>
              <LifecycleBadge state={device.lifecycle_state} />
              <RiskBadge risk={currentRisk} />
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {device.zone?.name || 'Chưa phân khu vực'} &middot; Mã thiết bị: {device.device_code}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {fanEnabled && (
            <button
              onClick={() => handleControlActuator('VENTILATION_FAN', currentFanState)}
              disabled={isViewer}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
                isViewer
                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                  : currentFanState
                  ? 'bg-amber-500 text-white border-amber-500 shadow-sm cursor-pointer'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 cursor-pointer'
              }`}
            >
              <Fan className={`w-4 h-4 ${currentFanState ? 'animate-spin' : ''}`} />
              <span>
                Quạt: {currentFanState ? 'Đang bật' : 'Đang tắt'} (
                {currentFanMode === 'MANUAL' ? 'Thủ công' : 'Tự động'})
              </span>
            </button>
          )}

          {buzzerEnabled && (
            <button
              onClick={() => handleControlActuator('ALARM_BUZZER', currentBuzzerState)}
              disabled={isViewer}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
                isViewer
                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                  : currentBuzzerState
                  ? 'bg-rose-600 text-white border-rose-600 shadow-sm cursor-pointer'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 cursor-pointer'
              }`}
            >
              <Volume2 className={`w-4 h-4 ${currentBuzzerState ? 'animate-bounce' : 'text-rose-500'}`} />
              <span>{currentBuzzerState ? 'Còi đang kêu (Tắt)' : 'Bật thử còi'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Quản Lý Thiết Bị Ngoại Vi (Gắn sẵn + Tạo mới tùy chọn GPIO) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                Thiết bị ngoại vi &amp; Cảm biến ({attachedPeripherals.length + customPeripherals.length})
              </h3>
              <p className="text-xs text-slate-500">
                {isAdmin
                  ? 'Xóa hoặc thêm lại cảm biến/quạt/còi, hoặc tạo thiết bị ngoại vi mới gắn vào chân GPIO trên ESP32.'
                  : 'Danh sách cảm biến và thiết bị đang gắn trên node (Chỉ Chủ kho mới được thêm/xóa ngoại vi).'}
              </p>
            </div>
          </div>

          {isAdmin && (
            <div className="flex flex-wrap items-center gap-2">
              {removedPeripherals.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAddPeripheralMenu((prev) => !prev)}
                  disabled={isConfiguring}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white hover:bg-slate-50 text-emerald-700 border border-emerald-200 shadow-sm transition disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm lại mặc định ({removedPeripherals.length})</span>
                </button>
              )}

              <button
                type="button"
                onClick={openCreateCustomModal}
                disabled={isConfiguring || customPeripherals.length >= 8}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                <span>Tạo ngoại vi mới</span>
              </button>
            </div>
          )}
        </div>

        {/* Khung chọn thêm lại thiết bị mặc định đã xóa */}
        {isAdmin && showAddPeripheralMenu && removedPeripherals.length > 0 && (
          <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-3">
            <div className="text-xs font-semibold text-emerald-900">
              Chọn thiết bị mặc định muốn thêm lại:
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {removedPeripherals.map((item) => (
                <div
                  key={item.id}
                  className="bg-white border border-emerald-200 rounded-xl p-3 flex items-center justify-between gap-2"
                >
                  <div>
                    <div className="text-xs font-bold text-slate-800">{item.shortName}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{item.description}</div>
                    <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-semibold">
                      <Cpu className="w-3 h-3 text-slate-500" />
                      Chân: {getPeripheralPinLabel(item.id, peripherals)}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isConfiguring}
                    onClick={() => handleAddPeripheral(item)}
                    className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Thêm
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Danh sách ngoại vi ĐANG GẮN (mặc định + tạo mới) */}
        {attachedPeripherals.length === 0 && customPeripherals.length === 0 ? (
          <div className="p-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center text-xs text-slate-500">
            Node hiện chưa có cảm biến hay thiết bị ngoại vi nào. Bấm &ldquo;Tạo ngoại vi mới&rdquo; hoặc &ldquo;Thêm lại mặc định&rdquo; ở trên.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {attachedPeripherals.map((item) => {
              let connLabel = 'Mạch ngoại tuyến';
              let connClass = 'bg-slate-100 text-slate-600 border-slate-200';
              let connNote: string | undefined;

              if (!device.is_online) {
                connLabel = 'Mạch ngoại tuyến';
                connClass = 'bg-slate-100 text-slate-600 border-slate-200';
                connNote = 'ESP32 đang mất kết nối mạng.';
              } else if (item.id === 'aht20') {
                const aht = sensorHealth?.aht20;
                if (!aht) {
                  connLabel = 'Đang chờ dữ liệu';
                } else if (aht.ok && aht.status === 'SIMULATED') {
                  connLabel = 'Mô phỏng';
                  connClass = 'bg-amber-50 text-amber-700 border-amber-200';
                } else if (aht.ok) {
                  connLabel = 'Đang kết nối';
                  connClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                } else {
                  connLabel = aht.status === 'READ_ERROR' ? 'Lỗi đọc dữ liệu' : 'Mất kết nối';
                  connClass = 'bg-rose-50 text-rose-700 border-rose-200';
                  connNote = aht.message;
                }
              } else if (item.id === 'mq135') {
                const mq = sensorHealth?.mq135;
                if (!mq) {
                  connLabel = 'Đang chờ dữ liệu';
                } else if (mq.ok && mq.status === 'SIMULATED') {
                  connLabel = 'Mô phỏng';
                  connClass = 'bg-amber-50 text-amber-700 border-amber-200';
                } else if (mq.ok) {
                  connLabel = 'Đang kết nối';
                  connClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                } else {
                  connLabel = mq.status === 'OUT_OF_RANGE' ? 'Vượt ngưỡng ADC' : 'Mất kết nối';
                  connClass = 'bg-rose-50 text-rose-700 border-rose-200';
                  connNote = mq.message;
                }
              } else if (item.id === 'door') {
                connLabel = 'Digital 1-bit';
                connClass = 'bg-sky-50 text-sky-700 border-sky-200';
                connNote =
                  typeof doorOpen === 'boolean'
                    ? `Hiện tại: ${doorOpen ? 'Đang mở' : 'Đang đóng'} (không tự báo rút dây)`
                    : 'Không tự phát hiện rút dây';
              } else {
                connLabel = 'Mạch trực tuyến';
                connClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                connNote =
                  item.id === 'fan'
                    ? `Chế độ: ${currentFanMode === 'MANUAL' ? 'Thủ công' : 'Tự động'} · Không hồi tiếp dây`
                    : 'Relay ngõ ra · Không hồi tiếp dây';
              }

              return (
              <div
                key={item.id}
                className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        {item.category === 'SENSOR' ? 'Cảm biến' : 'Thiết bị điều khiển'}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700 text-[10px] font-semibold">
                        <Cpu className="w-3 h-3 text-emerald-600" />
                        {getPeripheralPinLabel(item.id, peripherals)}
                      </span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${connClass}`}
                      >
                        {connLabel}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-slate-900 mt-1">{item.name}</div>
                    <div className="text-[11px] text-slate-500 mt-1">{item.description}</div>
                    {connNote && (
                      <div
                        className={`text-[11px] mt-1 ${
                          connClass.includes('rose') ? 'text-rose-600 font-medium' : 'text-slate-500'
                        }`}
                      >
                        {connNote}
                      </div>
                    )}
                  </div>

                  {isAdmin && (
                    <button
                      type="button"
                      disabled={isConfiguring}
                      onClick={() => handleRemovePeripheral(item)}
                      className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-700 bg-white hover:bg-rose-50 border border-rose-200 transition disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Xóa</span>
                    </button>
                  )}
                </div>

                {item.autoKey && (
                  <label className="flex items-center justify-between text-xs text-slate-600 pt-2.5 border-t border-slate-200 cursor-pointer">
                    <span>{item.autoLabel}</span>
                    <input
                      type="checkbox"
                      checked={peripherals[item.autoKey] !== false}
                      disabled={!isAdmin || isConfiguring}
                      onChange={() => handleToggleAutoMode(item)}
                      className="accent-emerald-600 w-4 h-4"
                    />
                  </label>
                )}
              </div>
              );
            })}

            {/* Các thiết bị ngoại vi TẠO MỚI (Custom GPIO Peripherals) */}
            {customPeripherals.map((cp) => {
              const live = runtimeCustomList.find((r) => r.id === cp.id);
              const isRelayOn = live?.state === 'ON' || live?.value === 1;
              const isDigitalActive = live?.state === 'ACTIVE' || live?.value === 1;

              let cpConnLabel = 'Mạch ngoại tuyến';
              let cpConnClass = 'bg-slate-100 text-slate-600 border-slate-200';
              if (!device.is_online) {
                cpConnLabel = 'Mạch ngoại tuyến';
                cpConnClass = 'bg-slate-100 text-slate-600 border-slate-200';
              } else if (cp.type === 'RELAY_OUTPUT') {
                cpConnLabel = 'Mạch trực tuyến';
                cpConnClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
              } else if (!live) {
                cpConnLabel = 'Chờ dữ liệu';
                cpConnClass = 'bg-slate-100 text-slate-600 border-slate-200';
              } else if (cp.type === 'ANALOG_INPUT' && live.raw_adc !== undefined && live.raw_adc < 25) {
                cpConnLabel = `Tín hiệu thấp (ADC ${live.raw_adc})`;
                cpConnClass = 'bg-amber-50 text-amber-700 border-amber-200';
              } else if (cp.type === 'DIGITAL_INPUT') {
                cpConnLabel = 'Digital 1-bit';
                cpConnClass = 'bg-sky-50 text-sky-700 border-sky-200';
              } else {
                cpConnLabel = 'Đang kết nối';
                cpConnClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
              }

              return (
                <div
                  key={cp.id}
                  className="p-4 rounded-xl bg-sky-50/50 border border-sky-200 flex flex-col justify-between gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-sky-700">
                          Tự tạo
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-sky-200 text-sky-800 text-[10px] font-semibold">
                          <Cpu className="w-3 h-3 text-sky-600" />
                          GPIO {cp.gpio}
                        </span>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cpConnClass}`}
                        >
                          {cpConnLabel}
                        </span>
                      </div>
                      <div className="text-xs font-bold text-slate-900 mt-1 flex items-center gap-1.5">
                        {cp.type === 'RELAY_OUTPUT' ? (
                          <Power className="w-3.5 h-3.5 text-amber-600" />
                        ) : cp.type === 'ANALOG_INPUT' ? (
                          <Gauge className="w-3.5 h-3.5 text-sky-600" />
                        ) : (
                          <ToggleRight className="w-3.5 h-3.5 text-emerald-600" />
                        )}
                        <span>{cp.name}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        {cp.type === 'RELAY_OUTPUT'
                          ? 'Thiết bị bật / tắt qua Relay'
                          : cp.type === 'ANALOG_INPUT'
                          ? 'Cảm biến đo mức (Analog)'
                          : 'Cảm biến đóng / mở (Digital)'}
                      </div>
                    </div>

                    {isAdmin && (
                      <button
                        type="button"
                        disabled={isConfiguring}
                        onClick={() => handleRemoveCustomPeripheral(cp)}
                        className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-700 bg-white hover:bg-rose-50 border border-rose-200 transition disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Xóa</span>
                      </button>
                    )}
                  </div>

                  <div className="pt-2.5 border-t border-sky-200/70 flex items-center justify-between text-xs">
                    {cp.type === 'RELAY_OUTPUT' ? (
                      <>
                        <span className="text-slate-600">
                          Trạng thái:{' '}
                          <strong className={isRelayOn ? 'text-amber-700' : 'text-slate-500'}>
                            {isRelayOn ? 'Đang bật' : 'Đang tắt'}
                          </strong>
                        </span>
                        <button
                          type="button"
                          disabled={isViewer}
                          onClick={() => handleControlCustomRelay(cp, isRelayOn)}
                          className={`px-3 py-1 rounded-lg text-xs font-semibold border transition ${
                            isViewer
                              ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                              : isRelayOn
                              ? 'bg-amber-500 text-white border-amber-500'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {isRelayOn ? 'Tắt' : 'Bật'}
                        </button>
                      </>
                    ) : cp.type === 'ANALOG_INPUT' ? (
                      <>
                        <span className="text-slate-600">Giá trị đo:</span>
                        <strong className="text-sky-800 text-sm">
                          {live?.value !== undefined ? `${live.value}${cp.unit || '%'}` : '--'}
                        </strong>
                      </>
                    ) : (
                      <>
                        <span className="text-slate-600">Trạng thái:</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                            live
                              ? isDigitalActive
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-white text-slate-500 border-slate-200'
                          }`}
                        >
                          {live ? (isDigitalActive ? 'Đang kích hoạt' : 'Bình thường') : 'Chờ tín hiệu'}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Trạng thái cảm biến đang gắn */}
      <SensorHealthPanel
        sensorHealth={sensorHealth}
        peripherals={peripherals}
        doorOpen={doorOpen}
        isOnline={device.is_online}
        variant="detailed"
      />

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
          {ahtEnabled && (
            <>
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <Thermometer className="w-4 h-4 text-amber-500" />
                    <span>Nhiệt độ</span>
                  </span>
                  <span className="text-[11px] text-slate-400">Báo: &ge;{tempWarn}°C</span>
                </div>
                <div className="text-2xl font-bold text-slate-900 mt-2">
                  {aht20Ok && liveTemp !== null ? `${liveTemp}°C` : '--'}
                </div>
                <div className="text-xs text-slate-500 mt-1.5">
                  TB: {avgTemp}°C ({minTemp}–{maxTemp}°C)
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <Droplets className="w-4 h-4 text-sky-500" />
                    <span>Độ ẩm không khí</span>
                  </span>
                  <span className="text-[11px] text-slate-400">Báo: &ge;{humWarn}%</span>
                </div>
                <div className="text-2xl font-bold text-slate-900 mt-2">
                  {aht20Ok && liveRH !== null ? `${liveRH}%` : '--'}
                </div>
                <div className="text-xs text-slate-500 mt-1.5">
                  TB: {avgRH}% ({minRH}–{maxRH}%)
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <Wind className="w-4 h-4 text-emerald-600" />
                    <span>Độ ẩm hạt (EMC)</span>
                  </span>
                  <span className="text-[11px] text-slate-400">Báo: &ge;{emcWarn}%</span>
                </div>
                <div className="text-2xl font-bold text-emerald-700 mt-2">
                  {aht20Ok && liveEMC !== null ? `${liveEMC}%` : '--'}
                </div>
                <div className="text-xs text-slate-500 mt-1.5">
                  TB: {avgEMC}% &middot; An toàn &le; {emcWarn}%
                </div>
              </div>
            </>
          )}

          {mqEnabled && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span className="flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-purple-600" />
                  <span>Khí Gas (MQ-135)</span>
                </span>
                <span className="text-[11px] text-slate-400">Báo: &ge;{gasWarn} ppm</span>
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-2">
                {mq135Ok && liveGas !== null ? (
                  <>
                    {liveGas} <span className="text-xs font-medium text-slate-500">ppm</span>
                  </>
                ) : (
                  '--'
                )}
              </div>
              <div className="text-xs text-slate-500 mt-1.5">
                TB: {avgGas} ppm ({minGas}–{maxGas} ppm)
              </div>
            </div>
          )}
        </div>
      )}

      {/* Biểu đồ xu hướng */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-600" />
            <h3 className="font-bold text-slate-900 text-sm">Biểu đồ theo dõi gần đây</h3>
          </div>
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Tự động cập nhật</span>
          </div>
        </div>

        <div className="h-72 w-full">
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
                <h2 className="text-base font-bold text-slate-900">Tạo Thiết Bị Ngoại Vi Mới</h2>
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
                    <option value="RELAY_OUTPUT">Thiết bị bật / tắt (Quạt, Đèn, Còi, Bơm...)</option>
                    <option value="DIGITAL_INPUT">Cảm biến đóng / mở (0 / 1)</option>
                    <option value="ANALOG_INPUT">Cảm biến đo mức (Analog 0–100%)</option>
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
                    isConfiguring ||
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
