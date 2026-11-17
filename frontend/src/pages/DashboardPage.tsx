import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { waitForCommandAck } from '../services/socket';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { CustomPeripheralConfig, CustomPeripheralRuntimeState, Device, DashboardKPI } from '../types';
import { RiskBadge } from '../components/RiskBadge';
import { SensorHealthPanel } from '../components/SensorHealthPanel';
import { normalizePeripherals } from '../utils/peripherals';
import {
  Thermometer,
  Droplets,
  Wind,
  Flame,
  AlertTriangle,
  Fan,
  Clock,
  ArrowRight,
  RefreshCw,
  Warehouse,
  Volume2,
  Cpu,
  Plus,
  Power,
  Gauge,
  ToggleRight,
} from 'lucide-react';

type ActuatorTarget = 'VENTILATION_FAN' | 'ALARM_BUZZER' | 'CUSTOM_PERIPHERAL';

interface PendingCommandEntry {
  cmdId?: string;
  target: ActuatorTarget;
  label?: string;
  targetState: string;
  timestamp: number;
}

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAdmin, isViewer, showToast, user } = useAuth();
  const { latestTelemetry, deviceStatus, discoveredDevices } = useSocket();

  const [devices, setDevices] = useState<Device[]>([]);
  const [kpi, setKpi] = useState<DashboardKPI | null>(null);
  const [discoveredCount, setDiscoveredCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingCommands, setPendingCommands] = useState<Record<string, PendingCommandEntry>>({});

  const fetchData = async () => {
    try {
      const [devRes, kpiRes, discRes] = await Promise.all([
        api.getDevices(),
        api.getDashboardKPI(),
        api.getDiscoveredDevices().catch(() => ({ success: false, data: [] })),
      ]);

      if (devRes.success) setDevices(devRes.data);
      if (kpiRes.success) setKpi(kpiRes.data.kpi);
      if (discRes?.success && Array.isArray(discRes.data)) {
        const regCodes = new Set((devRes.data || []).map((d: Device) => d.device_code));
        setDiscoveredCount(
          discRes.data.filter((n: any) => !regCodes.has(n.device_code)).length
        );
      }
    } catch (e: any) {
      showToast(e.message || 'Lỗi tải dữ liệu tổng quan', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [user]);

  const sendActuatorCommand = async (device: Device, target: ActuatorTarget, action: string, custom?: CustomPeripheralConfig) => {
    if (isViewer) return;
    const key = target === 'CUSTOM_PERIPHERAL' ? `${device.device_code}:CP:${custom?.id}` : `${device.device_code}:${target}`;
    if (pendingCommands[key]) return;
    setPendingCommands(prev => ({ ...prev, [key]: { target, targetState: action, timestamp: Date.now() } }));
    try {
      const res = await api.controlActuator(device.id, {
        target, action,
        ...(custom ? { peripheral_id: custom.id } : {}),
        ...(target === 'VENTILATION_FAN' ? { control_mode: action === 'SET_AUTO' ? 'AUTO' : 'MANUAL' } : {}),
      });
      await waitForCommandAck(res.data?.cmd_id);
      await fetchData();
      showToast('Thiết bị đã xác nhận áp dụng lệnh.', 'success');
    } catch (error: any) {
      showToast(error.message || 'Thiết bị chưa xác nhận lệnh', 'error');
    } finally {
      setPendingCommands(prev => { const next = { ...prev }; delete next[key]; return next; });
    }
  };

  const handleToggleActuator = (device: Device, target: ActuatorTarget, currentState: boolean, custom?: CustomPeripheralConfig) =>
    sendActuatorCommand(device, target, currentState ? 'TURN_OFF' : 'TURN_ON', custom);
  const handleSwitchFanAuto = (device: Device) => sendActuatorCommand(device, 'VENTILATION_FAN', 'SET_AUTO');

  const registeredCodes = new Set(devices.map((d) => d.device_code));
  const socketUnregisteredCount = Object.values(discoveredDevices).filter(
    (n) => !registeredCodes.has(n.device_code)
  ).length;
  const totalDiscoveredCount = Math.max(discoveredCount, socketUnregisteredCount);

  const activeDashboardDevices = devices.filter((d) => d.lifecycle_state !== 'DECOMMISSIONED');

  const liveOnlineCount = activeDashboardDevices.filter((dev) => {
    const st = deviceStatus[dev.device_code];
    return st ? st.is_online ?? st.state === 'ONLINE' : dev.is_online;
  }).length;
  const liveOfflineCount = activeDashboardDevices.length - liveOnlineCount;

  const liveActiveFansCount = activeDashboardDevices.filter((dev) => {
    const st = deviceStatus[dev.device_code];
    const online = st ? st.is_online ?? st.state === 'ONLINE' : dev.is_online;
    if (!online) return false;
    const periphCfg = normalizePeripherals((dev.config_json as any)?.peripherals);
    if (!periphCfg.fan_enabled) return false;
    const wsD = latestTelemetry[dev.device_code];
    return (wsD?.fan_state ?? dev.fan_state) === 'ON';
  }).length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tổng Quan Kho Ngũ Cốc</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Theo dõi nhiệt độ, độ ẩm, khí gas và điều khiển thiết bị trong kho
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => navigate('/devices')}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-sm transition-colors"
          >
            <Cpu className="w-4 h-4 text-emerald-600" />
            <span>Quản lý Thiết bị</span>
            {totalDiscoveredCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white">
                +{totalDiscoveredCount} mới
              </span>
            )}
          </button>
          <button
            onClick={fetchData}
            disabled={isLoading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-sm transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      {/* 3 KPI Cards - Simple & Clear */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Thiết bị theo dõi</span>
            <span className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <Warehouse className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2">
            {activeDashboardDevices.length > 0 || !kpi ? activeDashboardDevices.length : kpi.total_devices}
          </div>
          <div className="flex items-center gap-3 mt-2 text-xs text-slate-600">
            <span className="text-emerald-700 font-medium flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {devices.length > 0 || !kpi ? liveOnlineCount : kpi.online_devices} trực tuyến
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-slate-500">
              {devices.length > 0 || !kpi ? liveOfflineCount : kpi.offline_devices} ngoại tuyến
            </span>
          </div>
        </div>

        <div
          onClick={() => navigate('/alerts')}
          className="bg-white border border-slate-200 hover:border-rose-300 rounded-2xl p-4 shadow-sm cursor-pointer transition-all group flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span className="group-hover:text-rose-700 transition">Cảnh báo chưa xử lý</span>
              <span className="p-2 rounded-xl bg-rose-50 text-rose-600">
                <AlertTriangle className="w-4 h-4" />
              </span>
            </div>
            <div className="text-2xl font-bold text-rose-600 mt-2">
              {kpi?.new_alerts_count || 0}
            </div>
          </div>
          <div className="text-xs text-slate-500 mt-2 flex items-center justify-between">
            <span>Nhấn để xem chi tiết</span>
            <span className="text-rose-600 font-semibold group-hover:translate-x-0.5 transition">
              Xem &rarr;
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Quạt đang hoạt động</span>
            <span className="p-2 rounded-xl bg-amber-50 text-amber-600">
              <Fan className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-bold text-amber-600 mt-2">
            {devices.length > 0 || !kpi ? liveActiveFansCount : kpi.active_fans_count}
          </div>
          <div className="text-xs text-slate-500 mt-2">Tự động chạy khi độ ẩm tăng</div>
        </div>
      </div>

      {/* Device Cards List */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Warehouse className="w-4 h-4 text-emerald-600" />
            <span>Các khu vực &amp; thiết bị giám sát</span>
          </h2>
          {isAdmin && (
            <span className="text-xs text-slate-500">
              Bấm vào &ldquo;Chi tiết &amp; Ngoại vi&rdquo; để xóa hoặc thêm cảm biến, quạt, còi
            </span>
          )}
        </div>

        {activeDashboardDevices.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-3xl p-8 text-center text-slate-500 shadow-sm">
            <Warehouse className="w-12 h-12 mx-auto text-slate-300 mb-3" />
            <div className="font-semibold text-slate-800 text-base">
              Chưa có thiết bị nào đang hoạt động
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Vào mục Quản lý Thiết bị để thêm mạch mới hoặc kích hoạt lại thiết bị.
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                onClick={() => navigate('/devices')}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-sm transition"
              >
                Đi tới Quản lý Thiết bị
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {activeDashboardDevices.map((device) => {
              const wsData = latestTelemetry[device.device_code];
              const wsStatus = deviceStatus[device.device_code];
              const isOnline = wsStatus ? wsStatus.is_online ?? wsStatus.state === 'ONLINE' : device.is_online;

              const latestDbLog = device.telemetry_logs?.[0];
              const hasTelemetry = Boolean(wsData || latestDbLog);

              const temp: number | null = wsData ? wsData.temperature : latestDbLog?.temperature ?? null;
              const rh: number | null = wsData ? wsData.humidity_air : latestDbLog?.humidity_air ?? null;
              const gas: number | null = wsData ? wsData.gas_ppm : latestDbLog?.gas_ppm ?? null;
              const emc: number | null = wsData ? wsData.estimated_emc : latestDbLog?.estimated_emc ?? null;

              const fanActive = isOnline ? ((wsData?.fan_state ?? device.fan_state) === 'ON') : false;
              const currentRisk = wsData ? wsData.risk_level : latestDbLog?.risk_level ?? 'SAFE';
              const fanStateKnown = Boolean(wsData?.fan_state ?? device.fan_state);
              const buzzerStateKnown = Boolean(wsData?.buzzer_state ?? device.buzzer_state);
              const buzzerActive = isOnline ? ((wsData?.buzzer_state ?? device.buzzer_state) === 'ON') : false;

              const fanPending = pendingCommands[`${device.device_code}:VENTILATION_FAN`];
              const buzzerPending = pendingCommands[`${device.device_code}:ALARM_BUZZER`];

              const periph = normalizePeripherals((device.config_json as any)?.peripherals);
              const fanMode =
                wsData?.control_mode ??
                device.control_mode ??
                (periph.fan_auto !== false ? 'AUTO' : 'MANUAL');
              const ahtEnabled = periph.aht20_enabled && wsData?.sensor_health?.aht20?.status !== 'DISABLED';
              const mqEnabled = periph.mq135_enabled && wsData?.sensor_health?.mq135?.status !== 'DISABLED';
              const fanEnabled = periph.fan_enabled;
              const buzzerEnabled = periph.buzzer_enabled;

              const sensorHealth = wsData?.sensor_health ?? device.sensor_health;
              const doorOpen = wsData?.door_open ?? device.door_open;
              const aht20Ok = !ahtEnabled || (sensorHealth?.aht20 ? sensorHealth.aht20.ok : true);
              const mq135Ok = !mqEnabled || (sensorHealth?.mq135 ? sensorHealth.mq135.ok : true);

              const lastTelemetryTime = latestDbLog?.recorded_at || device.last_seen_at;
              const formattedLastSeen = lastTelemetryTime
                ? new Date(lastTelemetryTime).toLocaleString('vi-VN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    day: '2-digit',
                    month: '2-digit',
                  })
                : null;

              const cfg = (device.config_json as any) || {};
              const tempWarnThreshold =
                typeof cfg.temp_warn_threshold === 'number' ? cfg.temp_warn_threshold : 25.0;
              const tempCritThreshold =
                typeof cfg.temp_crit_threshold === 'number' ? cfg.temp_crit_threshold : 28.0;
              const humWarnThreshold =
                typeof cfg.hum_warn_threshold === 'number' ? cfg.hum_warn_threshold : 65.0;
              const humCritThreshold =
                typeof cfg.hum_crit_threshold === 'number' ? cfg.hum_crit_threshold : 70.0;
              const emcWarnThreshold =
                typeof cfg.emc_warn_threshold === 'number' ? cfg.emc_warn_threshold : 14.0;
              const emcCritThreshold =
                typeof cfg.emc_crit_threshold === 'number' ? cfg.emc_crit_threshold : 14.8;
              const gasWarnThreshold =
                typeof cfg.gas_warn_threshold === 'number' ? cfg.gas_warn_threshold : 600;
              const gasCritThreshold =
                typeof cfg.gas_crit_threshold === 'number' ? cfg.gas_crit_threshold : 700;

              const isTempCrit =
                isOnline && hasTelemetry && ahtEnabled && aht20Ok && temp !== null && temp >= tempCritThreshold;
              const isTempWarn =
                isOnline && hasTelemetry && ahtEnabled && aht20Ok && temp !== null && temp >= tempWarnThreshold;
              const isRhCrit =
                isOnline && hasTelemetry && ahtEnabled && aht20Ok && rh !== null && rh >= humCritThreshold;
              const isRhWarn =
                isOnline && hasTelemetry && ahtEnabled && aht20Ok && rh !== null && rh >= humWarnThreshold;
              const isEmcCrit =
                isOnline && hasTelemetry && ahtEnabled && aht20Ok && emc !== null && emc >= emcCritThreshold;
              const isEmcWarn =
                isOnline && hasTelemetry && ahtEnabled && aht20Ok && emc !== null && emc >= emcWarnThreshold;
              const isGasCrit =
                isOnline && hasTelemetry && mqEnabled && mq135Ok && gas !== null && gas >= gasCritThreshold;
              const isGasWarn =
                isOnline && hasTelemetry && mqEnabled && mq135Ok && gas !== null && gas >= gasWarnThreshold;

              const customConfigs: CustomPeripheralConfig[] = Array.isArray(
                (device.config_json as any)?.custom_peripherals
              )
                ? (device.config_json as any).custom_peripherals
                : [];
              const customRuntimeList: CustomPeripheralRuntimeState[] =
                wsData?.custom_peripherals ?? device.custom_peripherals ?? [];
              const customSensors = customConfigs.filter((c) => c.type !== 'RELAY_OUTPUT');
              const customRelays = customConfigs.filter((c) => c.type === 'RELAY_OUTPUT');

              const metricCount = (ahtEnabled ? 3 : 0) + (mqEnabled ? 1 : 0) + customSensors.length;
              const metricsGridClass =
                metricCount <= 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2';

              const hiddenCount = [
                !periph.aht20_enabled,
                !periph.door_enabled,
                !periph.fan_enabled,
                !periph.buzzer_enabled,
              ].filter(Boolean).length;

              return (
                <div
                  key={device.id}
                  className={`bg-white border rounded-3xl p-5 shadow-sm flex flex-col justify-between transition-all ${
                    !isOnline
                      ? 'border-slate-200 bg-slate-50/70 opacity-85'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div>
                    {/* Header Card */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-bold text-slate-900 text-base">{device.name}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {device.zone?.name || 'Chưa gán khu vực'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                            isOnline
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isOnline ? 'bg-emerald-500' : 'bg-slate-400'
                            }`}
                          />
                          {isOnline ? 'Trực tuyến' : 'Ngoại tuyến'}
                        </span>
                        {isOnline && <RiskBadge risk={currentRisk} />}
                      </div>
                    </div>

                    {!isOnline ? (
                      <div className="mt-4 p-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50/90 text-center space-y-1.5">
                        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                          <Clock className="w-4 h-4 text-slate-400" />
                          <span>Thiết bị đang ngoại tuyến</span>
                        </div>
                        <p className="text-xs text-slate-500">
                          Chưa có dữ liệu đo. Đang chờ thiết bị kết nối lại.
                        </p>
                        <div className={`grid ${metricsGridClass} gap-3 pt-3 text-left`}>
                          {[
                            ...(periph.aht20_enabled ? ['Nhiệt độ', 'Độ ẩm không khí', 'Độ ẩm hạt (EMC)'] : []),
                            ...(periph.mq135_enabled ? ['Khí Gas (MQ-135)'] : []),
                            ...customSensors.map(sensor => sensor.name),
                          ].map((label, index) => (
                            <div key={`${label}-${index}`} className="rounded-xl border border-slate-200 bg-white/60 p-3.5">
                              <div className="text-xs text-slate-500">{label}</div>
                              <div className="text-2xl font-bold text-slate-400 mt-1.5">--</div>
                            </div>
                          ))}
                        </div>
                        {formattedLastSeen && (
                          <p className="text-[11px] text-slate-400">
                            Kết nối gần nhất: {formattedLastSeen}
                          </p>
                        )}
                      </div>
                    ) : (
                      <>
                        {/* Temperature Threshold Alert Banner */}
                        {(isTempCrit || isTempWarn) && (
                          <div
                            className={`mt-4 px-3 py-2 rounded-xl border flex items-center justify-between gap-2 text-xs font-medium ${
                              isTempCrit
                                ? 'bg-rose-50 border-rose-200 text-rose-800'
                                : 'bg-amber-50 border-amber-200 text-amber-800'
                            }`}
                          >
                            <span className="flex items-center gap-1.5">
                              <Thermometer
                                className={`w-3.5 h-3.5 shrink-0 ${
                                  isTempCrit ? 'text-rose-600' : 'text-amber-600'
                                }`}
                              />
                              <span>
                                {isTempCrit
                                  ? `Nhiệt độ đạt ngưỡng nguy hiểm (${temp}°C ≥ ${tempCritThreshold}°C)`
                                  : `Nhiệt độ đạt ngưỡng cảnh báo (${temp}°C ≥ ${tempWarnThreshold}°C)`}
                              </span>
                            </span>
                          </div>
                        )}

                        {/* Visible Sensor Metrics (Chỉ hiện các cảm biến đang gắn) */}
                        {metricCount === 0 ? (
                          <div className="mt-4 p-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 flex items-center justify-between gap-3 text-xs text-slate-500">
                            <span>Node này hiện đã gỡ hết cảm biến đo lường.</span>
                            <button
                              onClick={() => navigate(`/devices/${device.id}`)}
                              className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:text-emerald-800 shrink-0"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Thêm cảm biến
                            </button>
                          </div>
                        ) : (
                          <div className={`grid ${metricsGridClass} gap-3 mt-5`}>
                        {ahtEnabled && (
                          <>
                            {/* Nhiệt độ */}
                            <div
                              className={`p-3.5 rounded-2xl border transition-all ${
                                !aht20Ok
                                  ? 'bg-rose-50/70 border-rose-200'
                                  : isTempCrit
                                  ? 'bg-rose-50 border-rose-300'
                                  : isTempWarn
                                  ? 'bg-amber-50 border-amber-300'
                                  : 'bg-slate-50 border-slate-200'
                              }`}
                            >
                              <div className="flex items-center justify-between text-xs text-slate-500">
                                <span className="flex items-center gap-1.5 font-medium">
                                  <Thermometer className="w-3.5 h-3.5 text-amber-500" />
                                  Nhiệt độ
                                </span>
                                {!aht20Ok ? (
                                  <span className="text-[10px] font-bold text-rose-600">Lỗi</span>
                                ) : (
                                  <span className="text-[11px] font-medium text-slate-400">
                                    Báo: &ge;{tempWarnThreshold}°C
                                  </span>
                                )}
                              </div>
                              <div
                                className={`text-2xl font-bold mt-1.5 ${
                                  !aht20Ok || isTempCrit
                                    ? 'text-rose-600'
                                    : isTempWarn
                                    ? 'text-amber-600'
                                    : 'text-slate-900'
                                }`}
                              >
                                {aht20Ok && temp !== null ? `${temp}°C` : '--'}
                              </div>
                              {(isTempCrit || isTempWarn || !aht20Ok) && (
                                <div
                                  className={`text-[11px] mt-1 font-semibold ${
                                    !aht20Ok || isTempCrit ? 'text-rose-700' : 'text-amber-700'
                                  }`}
                                >
                                  {!aht20Ok
                                    ? 'Chưa nhận AHT20'
                                    : isTempCrit
                                    ? `Đạt ngưỡng nguy hiểm (≥${tempCritThreshold}°C)`
                                    : `Đạt ngưỡng cảnh báo (≥${tempWarnThreshold}°C)`}
                                </div>
                              )}
                            </div>

                            {/* Độ ẩm không khí */}
                            <div
                              className={`p-3.5 rounded-2xl border transition-all ${
                                !aht20Ok
                                  ? 'bg-rose-50/70 border-rose-200'
                                  : isRhCrit
                                  ? 'bg-rose-50 border-rose-300'
                                  : isRhWarn
                                  ? 'bg-amber-50 border-amber-300'
                                  : 'bg-slate-50 border-slate-200'
                              }`}
                            >
                              <div className="flex items-center justify-between text-xs text-slate-500">
                                <span className="flex items-center gap-1.5 font-medium">
                                  <Droplets className="w-3.5 h-3.5 text-sky-500" />
                                  Độ ẩm
                                </span>
                                {!aht20Ok && (
                                  <span className="text-[10px] font-bold text-rose-600">Lỗi</span>
                                )}
                              </div>
                              <div
                                className={`text-2xl font-bold mt-1.5 ${
                                  !aht20Ok || isRhCrit
                                    ? 'text-rose-600'
                                    : isRhWarn
                                    ? 'text-amber-600'
                                    : 'text-slate-900'
                                }`}
                              >
                                {aht20Ok && rh !== null ? `${rh}%` : '--'}
                              </div>
                              {(isRhCrit || isRhWarn || !aht20Ok) && (
                                <div className="text-[11px] mt-1 font-medium text-rose-600">
                                  {!aht20Ok ? 'Chưa nhận AHT20' : isRhCrit ? 'Ẩm cao' : 'Cần chú ý'}
                                </div>
                              )}
                            </div>

                            {/* Độ ẩm hạt EMC */}
                            <div
                              className={`p-3.5 rounded-2xl border transition-all ${
                                !aht20Ok
                                  ? 'bg-rose-50/70 border-rose-200'
                                  : isEmcCrit
                                  ? 'bg-rose-50 border-rose-300'
                                  : isEmcWarn
                                  ? 'bg-amber-50 border-amber-300'
                                  : 'bg-slate-50 border-slate-200'
                              }`}
                            >
                              <div className="flex items-center justify-between text-xs text-slate-500">
                                <span className="flex items-center gap-1.5 font-medium">
                                  <Wind className="w-3.5 h-3.5 text-emerald-600" />
                                  Ẩm hạt
                                </span>
                                {aht20Ok && (
                                  <span className="text-[11px] font-medium text-slate-400">
                                    Báo: &ge;{emcWarnThreshold}%
                                  </span>
                                )}
                              </div>
                              <div
                                className={`text-2xl font-bold mt-1.5 ${
                                  !aht20Ok || isEmcCrit
                                    ? 'text-rose-600'
                                    : isEmcWarn
                                    ? 'text-amber-600'
                                    : 'text-emerald-700'
                                }`}
                              >
                                {aht20Ok && emc !== null ? `${emc}%` : '--'}
                              </div>
                              {(isEmcCrit || isEmcWarn) && (
                                <div
                                  className={`text-[11px] mt-1 font-semibold ${
                                    isEmcCrit ? 'text-rose-700' : 'text-amber-700'
                                  }`}
                                >
                                  {isEmcCrit
                                    ? `Đạt ngưỡng nguy hiểm (≥${emcCritThreshold}%)`
                                    : `Đạt ngưỡng cảnh báo (≥${emcWarnThreshold}%)`}
                                </div>
                              )}
                            </div>
                          </>
                        )}

                        {mqEnabled && (
                          <div
                            className={`p-3.5 rounded-2xl border transition-all ${
                              !mq135Ok
                                ? 'bg-rose-50/70 border-rose-200'
                                : isGasCrit
                                ? 'bg-rose-50 border-rose-300'
                                : isGasWarn
                                ? 'bg-amber-50 border-amber-300'
                                : 'bg-slate-50 border-slate-200'
                            }`}
                          >
                            <div className="flex items-center justify-between text-xs text-slate-500">
                              <span className="flex items-center gap-1.5 font-medium">
                                <Flame className="w-3.5 h-3.5 text-purple-600" />
                                Khí Gas
                              </span>
                              {!mq135Ok && (
                                <span className="text-[10px] font-bold text-rose-600">Lỗi</span>
                              )}
                            </div>
                            <div
                              className={`text-2xl font-bold mt-1.5 ${
                                !mq135Ok || isGasCrit
                                  ? 'text-rose-600'
                                  : isGasWarn
                                  ? 'text-amber-600'
                                  : 'text-slate-900'
                              }`}
                            >
                              {mq135Ok && gas !== null ? `${gas}` : '--'}
                              {mq135Ok && gas !== null && (
                                <span className="text-xs font-medium text-slate-500 ml-1">ppm</span>
                              )}
                            </div>
                            {(!mq135Ok || isGasCrit || isGasWarn) && (
                              <div className="text-[11px] mt-1 font-medium text-rose-600">
                                {!mq135Ok ? 'Mất tín hiệu' : isGasCrit ? 'Khí cao!' : 'Cảnh báo'}
                              </div>
                            )}
                          </div>
                        )}

                        {customSensors.map((cs) => {
                          const live = customRuntimeList.find((r) => r.id === cs.id);
                          const isAnalog = cs.type === 'ANALOG_INPUT';
                          const isActive = live?.state === 'ACTIVE' || live?.value === 1;

                          return (
                            <div
                              key={cs.id}
                              className="p-3.5 rounded-2xl border bg-sky-50/50 border-sky-200 transition-all"
                            >
                              <div className="flex items-center justify-between text-xs text-slate-500">
                                <span className="flex items-center gap-1.5 font-medium truncate">
                                  {isAnalog ? (
                                    <Gauge className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                                  ) : (
                                    <ToggleRight className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  )}
                                  <span className="truncate">{cs.name}</span>
                                </span>
                              </div>
                              <div className="text-xl font-bold mt-1.5 text-slate-900">
                                {isAnalog ? (
                                  live?.value !== undefined ? (
                                    <>
                                      {live.value}
                                      <span className="text-xs font-medium text-slate-500 ml-1">
                                        {cs.unit || '%'}
                                      </span>
                                    </>
                                  ) : (
                                    '--'
                                  )
                                ) : live ? (
                                  <span className={isActive ? 'text-amber-700' : 'text-emerald-700'}>
                                    {isActive ? 'Kích hoạt' : 'Bình thường'}
                                  </span>
                                ) : (
                                  '--'
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Compact Sensor Health & Door Badge */}
                    <SensorHealthPanel
                      sensorHealth={sensorHealth}
                      peripherals={periph}
                      doorOpen={doorOpen}
                      isOnline={isOnline}
                      variant="compact"
                    />
                      </>
                    )}
                  </div>

                  {/* Footer Controls (Đồng bộ Ngoại tuyến khi ESP32 mất kết nối) */}
                  <div className="mt-5 pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                      {!isOnline ? (
                        <>
                          {fanEnabled && (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl bg-slate-100 text-slate-500 border border-slate-200">
                              <Fan className="w-3.5 h-3.5 text-slate-400" />
                              <span>Quạt: Ngoại tuyến</span>
                            </span>
                          )}
                          {buzzerEnabled && (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl bg-slate-100 text-slate-500 border border-slate-200">
                              <Volume2 className="w-3.5 h-3.5 text-slate-400" />
                              <span>Còi: Ngoại tuyến</span>
                            </span>
                          )}
                          {customRelays.map((cr) => (
                            <span
                              key={cr.id}
                              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl bg-slate-100 text-slate-500 border border-slate-200"
                            >
                              <Power className="w-3.5 h-3.5 text-slate-400" />
                              <span>{cr.name}: Ngoại tuyến</span>
                            </span>
                          ))}
                          {!fanEnabled && !buzzerEnabled && customRelays.length === 0 && (
                            <span className="text-xs text-slate-400">
                              Đã ẩn Quạt &amp; Còi
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                      {fanEnabled && (
                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            disabled={!isOnline || isViewer || !fanStateKnown || Object.keys(pendingCommands).some(key => key.startsWith(`${device.device_code}:`))}
                            onClick={() => handleToggleActuator(device, 'VENTILATION_FAN', fanActive)}
                            className={`relative inline-flex h-6 w-12 items-center rounded-full transition-colors focus:outline-none ${
                              !isOnline || isViewer
                                ? 'bg-slate-200 cursor-not-allowed opacity-60'
                                : fanActive
                                ? 'bg-amber-500 cursor-pointer'
                                : 'bg-slate-300 cursor-pointer'
                            }`}
                            title={
                              isViewer
                                ? 'Chỉ xem'
                                : !isOnline
                                ? 'Thiết bị đang ngoại tuyến'
                                : fanActive
                                ? 'Bấm để Tắt quạt'
                                : 'Bấm để Bật quạt'
                            }
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                                fanActive ? 'translate-x-7' : 'translate-x-1'
                              }`}
                            />
                          </button>

                          <div className="text-xs">
                            <div className="font-semibold text-slate-700 flex items-center gap-1.5">
                              <Fan
                                className={`w-3.5 h-3.5 ${
                                  isOnline && fanActive ? 'text-amber-600 animate-spin' : 'text-slate-400'
                                }`}
                              />
                              <span>Quạt:</span>
                              <span className={fanActive ? 'text-amber-700 font-bold' : 'text-slate-500'}>
                                {fanPending ? 'Đang chờ xác nhận...' : !fanStateKnown ? 'Chờ trạng thái' : fanActive ? 'Đang bật' : 'Đang tắt'}
                              </span>
                              {fanMode === 'MANUAL' && !isViewer ? (
                                <button
                                  type="button"
                                  disabled={Boolean(fanPending)}
                                  onClick={() => handleSwitchFanAuto(device)}
                                  title="Bấm để chuyển quạt về chế độ Tự động"
                                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 border border-slate-200 hover:border-emerald-200 transition cursor-pointer"
                                >
                                  Thủ công &middot; Bật Tự động
                                </button>
                              ) : (
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                                  {fanMode === 'MANUAL' ? 'Thủ công' : 'Tự động'}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {buzzerEnabled && (
                        <button
                          type="button"
                          disabled={!isOnline || isViewer || !buzzerStateKnown || Object.keys(pendingCommands).some(key => key.startsWith(`${device.device_code}:`))}
                          onClick={() => handleToggleActuator(device, 'ALARM_BUZZER', buzzerActive)}
                          className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all border ${
                            !isOnline || isViewer
                              ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                              : buzzerActive
                              ? 'bg-rose-600 text-white border-rose-600 shadow-sm cursor-pointer'
                              : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 cursor-pointer'
                          }`}
                        >
                          <Volume2 className={`w-3.5 h-3.5 ${isOnline && buzzerActive ? 'animate-bounce' : 'text-rose-500'}`} />
                          <span>
                            {buzzerPending
                              ? 'Đang chờ xác nhận...'
                              : !buzzerStateKnown ? 'Còi: Chờ trạng thái'
                              : buzzerActive
                              ? 'Còi đang kêu (Tắt)'
                              : 'Bật còi báo động'}
                          </span>
                        </button>
                      )}

                      {customRelays.map((cr) => {
                        const live = customRuntimeList.find((r) => r.id === cr.id);
                        const crActive = live?.state === 'ON' || live?.value === 1;
                        const crPending = pendingCommands[`${device.device_code}:CP:${cr.id}`];

                        return (
                          <button
                            key={cr.id}
                            type="button"
                            disabled={!isOnline || isViewer || Object.keys(pendingCommands).some(key => key.startsWith(`${device.device_code}:`))}
                            onClick={() =>
                              handleToggleActuator(device, 'CUSTOM_PERIPHERAL', crActive, cr)
                            }
                            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all border ${
                              !isOnline || isViewer
                                ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                                : crActive
                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm cursor-pointer'
                                : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 cursor-pointer'
                            }`}
                          >
                            <Power className="w-3.5 h-3.5" />
                            <span>
                              {cr.name}:{' '}
                              {crPending ? 'Đang gửi...' : crActive ? 'Bật' : 'Tắt'}
                            </span>
                          </button>
                        );
                      })}

                      {!fanEnabled && !buzzerEnabled && customRelays.length === 0 && (
                        <span className="text-xs text-slate-400">
                          Đã ẩn Quạt &amp; Còi
                        </span>
                      )}
                        </>
                      )}
                    </div>

                    <button
                      onClick={() => navigate(`/devices/${device.id}`)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-3 py-2 rounded-xl transition-colors border border-emerald-200"
                    >
                      <span>
                        {hiddenCount > 0 ? `Chi tiết (+${hiddenCount} đã gỡ)` : 'Chi tiết & Ngoại vi'}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
