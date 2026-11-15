import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { Device, DashboardKPI } from '../types';
import { RiskBadge } from '../components/RiskBadge';
import { SensorHealthPanel } from '../components/SensorHealthPanel';
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
  AlertOctagon,
  Cpu,
} from 'lucide-react';

type ActuatorTarget = 'VENTILATION_FAN' | 'ALARM_BUZZER';

interface PendingCommandEntry {
  cmdId?: string;
  target: ActuatorTarget;
  targetState: string;
  timestamp: number;
}

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { isViewer, showToast, user } = useAuth();
  const { latestTelemetry, deviceStatus, latestAck, discoveredDevices } = useSocket();

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
      showToast(e.message || 'Lỗi tải dữ liệu Dashboard', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [user]);

  // Lắng nghe phản hồi ACK từ Socket để cập nhật trạng thái "Pending ACK... -> Active"
  useEffect(() => {
    const matchedKeys: string[] = [];

    Object.entries(pendingCommands).forEach(([key, pending]) => {
      const ack = Object.values(latestAck).find((a: any) =>
        pending.cmdId ? a.cmd_id === pending.cmdId : a.device_id === key.split(':')[0]
      ) as any;

      if (!ack) return;
      matchedKeys.push(key);

      const devCode = ack.device_id;
      if (ack.status === 'SUCCESS') {
        if (pending.target === 'ALARM_BUZZER') {
          const buzzerState = ack.current_actuators?.buzzer_state || pending.targetState;
          showToast(`Nhận ACK từ ${devCode}: Còi báo động đã ${buzzerState === 'ON' ? 'BẬT (Test)' : 'TẮT'}!`, 'success');
        } else {
          showToast(
            `Nhận ACK từ ${devCode}: Quạt thông gió đã chuyển sang ${ack.current_actuators?.fan_state || 'mới'}!`,
            'success'
          );
        }
      } else {
        showToast(`${devCode}: ${ack.message || 'Lệnh điều khiển hết thời gian chờ (TIMEOUT)'}`, 'error');
      }
    });

    if (matchedKeys.length > 0) {
      setPendingCommands((prev) => {
        const updated = { ...prev };
        matchedKeys.forEach((k) => delete updated[k]);
        return updated;
      });
    }
  }, [latestAck]);

  const handleToggleActuator = async (
    device: Device,
    target: ActuatorTarget,
    currentState: boolean
  ) => {
    if (isViewer) {
      showToast('Vai trò Giám sát / QC chỉ có quyền xem, không được điều khiển thiết bị! (403 Forbidden)', 'error');
      return;
    }

    const action = currentState ? 'TURN_OFF' : 'TURN_ON';
    const pendingKey = `${device.device_code}:${target}`;
    const isFan = target === 'VENTILATION_FAN';
    const label = isFan ? 'quạt thông gió' : 'còi test';

    setPendingCommands((prev) => ({
      ...prev,
      [pendingKey]: {
        target,
        targetState: action === 'TURN_ON' ? 'ON' : 'OFF',
        timestamp: Date.now(),
      },
    }));

    try {
      const res = await api.controlActuator(device.id, {
        target,
        action,
        ...(isFan ? { control_mode: 'MANUAL' } : {}),
      });

      if (res.success) {
        if (res.data?.cmd_id) {
          setPendingCommands((prev) =>
            prev[pendingKey]
              ? { ...prev, [pendingKey]: { ...prev[pendingKey], cmdId: res.data.cmd_id } }
              : prev
          );
        }
        showToast(`Đã phát lệnh ${action === 'TURN_ON' ? 'BẬT' : 'TẮT'} ${label}. Đang chờ ACK từ thiết bị...`, 'warning');
      }
    } catch (err: any) {
      setPendingCommands((prev) => {
        const copy = { ...prev };
        delete copy[pendingKey];
        return copy;
      });
      showToast(err.message || `Lỗi gửi lệnh điều khiển ${label}`, 'error');
    }
  };

  const registeredCodes = new Set(devices.map((d) => d.device_code));
  const socketUnregisteredCount = Object.values(discoveredDevices).filter(
    (n) => !registeredCodes.has(n.device_code)
  ).length;
  const totalDiscoveredCount = Math.max(discoveredCount, socketUnregisteredCount);

  const activeDashboardDevices = devices.filter((d) => d.lifecycle_state !== 'DECOMMISSIONED');
  const decommissionedCount = devices.length - activeDashboardDevices.length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            Dashboard Giám Sát Thời Gian Thực
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Theo dõi vi khí hậu silo thóc tẻ TCVN 8370:2018 &amp; điều khiển quạt đối lưu
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => navigate('/devices')}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 transition-colors"
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Quản lý Thiết bị</span>
            {totalDiscoveredCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950 animate-pulse">
                +{totalDiscoveredCount} mới
              </span>
            )}
          </button>
          <button
            onClick={fetchData}
            className="self-start sm:self-auto flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      {/* 4 KPI Cards (Mục 5.1 & Bước 4) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Thiết Bị Giám Sát</span>
            <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
              <Warehouse className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-bold text-slate-100 mt-2">
            {kpi?.total_devices || devices.length}{' '}
            <span className="text-xs font-medium text-slate-400 font-normal">nodes</span>
          </div>
          <div className="flex items-center gap-3 mt-2 text-xs">
            <span className="text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              {kpi?.online_devices || 0} Online
            </span>
            <span className="text-slate-500">|</span>
            <span className="text-rose-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
              {kpi?.offline_devices || 0} Offline
            </span>
          </div>
        </div>

        {/* KPI 2: Cảnh Báo Chưa Xử Lý - Bấm vào để sang ngay tab /alerts */}
        <div
          onClick={() => navigate('/alerts')}
          className="bg-slate-900 border border-slate-800 hover:border-rose-500/60 hover:bg-slate-800/70 rounded-2xl p-4 shadow-sm cursor-pointer transition-all duration-200 group flex flex-col justify-between"
          title="Nhấn để chuyển sang Trung tâm Cảnh báo"
        >
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="group-hover:text-rose-300 font-medium transition">Cảnh Báo Chưa Xử Lý</span>
              <span className="p-2 rounded-xl bg-rose-500/10 text-rose-400 group-hover:bg-rose-500/20 group-hover:scale-105 transition">
                <AlertTriangle className="w-4 h-4" />
              </span>
            </div>
            <div className="text-2xl font-bold text-rose-400 mt-2 flex items-baseline gap-1.5">
              <span>{kpi?.new_alerts_count || 0}</span>
              <span className="text-xs font-normal text-slate-400">mới</span>
            </div>
          </div>
          <div className="text-xs text-slate-400 mt-2 flex items-center justify-between">
            <span>Yêu cầu xác nhận &amp; xử lý</span>
            <span className="text-rose-400 group-hover:translate-x-1 transition flex items-center gap-0.5 text-[11px] font-semibold">
              Xem ngay &rarr;
            </span>
          </div>
        </div>

        {/* KPI 3 */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Độ Ẩm TB (RH / EMC)</span>
            <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <Droplets className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-bold text-slate-100 mt-2">
            {kpi?.avg_humidity || 0}%{' '}
            <span className="text-sm font-semibold text-emerald-400">
              / {kpi?.avg_emc || 0}% MC
            </span>
          </div>
          <div className="text-xs text-slate-400 mt-2">
            Giới hạn an toàn TCVN: &le; 14.0% MC
          </div>
        </div>

        {/* KPI 4 */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Quạt Thông Gió</span>
            <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
              <Fan className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-bold text-amber-400 mt-2">
            {kpi?.active_fans_count || 0}{' '}
            <span className="text-xs font-normal text-slate-400">đang chạy</span>
          </div>
          <div className="text-xs text-slate-400 mt-2">
            Tự động đối lưu khi vượt ngưỡng EMC
          </div>
        </div>
      </div>

      {/* Grid Danh Sách Thiết Bị Vi Khí Hậu */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
          <Warehouse className="w-4 h-4 text-amber-400" />
          <span>Danh Sách Silo &amp; Node Cảm Biến Thời Gian Thực</span>
        </h2>

        {activeDashboardDevices.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center text-slate-400">
            <Warehouse className="w-12 h-12 mx-auto text-slate-600 mb-3" />
            <div className="font-semibold text-slate-200 text-base">
              {devices.length === 0 ? 'Chưa có thiết bị nào được đăng ký' : 'Không có thiết bị đang hoạt động'}
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Bấm vào &ldquo;Quản lý Thiết bị&rdquo; để Onboard node mới hoặc khôi phục node đã thu hồi.
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                onClick={() => navigate('/devices')}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition"
              >
                Đi tới Quản lý Thiết bị
              </button>
              <button
                onClick={fetchData}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 transition"
              >
                Tải lại
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {activeDashboardDevices.map((device) => {
            // Lấy telemetry mới nhất từ WebSocket nếu có, fallback vào DB
            const wsData = latestTelemetry[device.device_code];
            const wsStatus = deviceStatus[device.device_code];
            const isOnline = wsStatus ? wsStatus.state !== 'OFFLINE' : device.is_online;
            const liveIp = wsData?.ip_address ?? wsStatus?.ip_address ?? device.ip_address;
            const liveMac = wsData?.mac_address ?? wsStatus?.mac_address ?? device.mac_address;

            const latestDbLog = device.telemetry_logs?.[0];
            const hasTelemetry = Boolean(wsData || latestDbLog);

            const temp: number | null = wsData ? wsData.temperature : latestDbLog?.temperature ?? null;
            const rh: number | null = wsData ? wsData.humidity_air : latestDbLog?.humidity_air ?? null;
            const gas: number | null = wsData ? wsData.gas_ppm : latestDbLog?.gas_ppm ?? null;
            const emc: number | null = wsData ? wsData.estimated_emc : latestDbLog?.estimated_emc ?? null;

            const fanActive = wsData
              ? wsData.fan_state === 'ON'
              : latestDbLog?.fan_state ?? false;

            const currentRisk = wsData
              ? wsData.risk_level
              : latestDbLog?.risk_level ?? 'SAFE';

            const buzzerActive = wsData
              ? wsData.buzzer_state === 'ON'
              : currentRisk === 'HIGH_RISK';

            const fanPending = pendingCommands[`${device.device_code}:VENTILATION_FAN`];
            const buzzerPending = pendingCommands[`${device.device_code}:ALARM_BUZZER`];

            const periph = (device.config_json as any)?.peripherals || {};
            const ahtEnabled =
              periph.aht20_enabled !== false && wsData?.sensor_health?.aht20?.status !== 'DISABLED';
            const mqEnabled =
              periph.mq135_enabled !== false && wsData?.sensor_health?.mq135?.status !== 'DISABLED';
            const fanEnabled = periph.fan_enabled !== false;
            const buzzerEnabled = periph.buzzer_enabled !== false;

            const sensorHealth = wsData?.sensor_health ?? device.sensor_health;
            const doorOpen = wsData?.door_open ?? device.door_open;
            const aht20Ok = !ahtEnabled || (sensorHealth?.aht20 ? sensorHealth.aht20.ok : true);
            const mq135Ok = !mqEnabled || (sensorHealth?.mq135 ? sensorHealth.mq135.ok : true);
            const aht20Sim = ahtEnabled && sensorHealth?.aht20?.status === 'SIMULATED';
            const mq135Sim = mqEnabled && sensorHealth?.mq135?.status === 'SIMULATED';
            const sensorFaultCount =
              sensorHealth?.fault_count ??
              ((ahtEnabled && !aht20Ok ? 1 : 0) + (mqEnabled && !mq135Ok ? 1 : 0));

            const lastTelemetryTime = latestDbLog?.recorded_at || device.last_seen_at;
            const formattedLastSeen = lastTelemetryTime
              ? new Date(lastTelemetryTime).toLocaleString('vi-VN', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  day: '2-digit',
                  month: '2-digit',
                })
              : null;

            return (
              <div
                key={device.id}
                className={`border rounded-3xl p-5 shadow-lg relative overflow-hidden flex flex-col justify-between transition-all ${
                  !isOnline
                    ? 'bg-slate-900/65 border-slate-800/80 opacity-80'
                    : sensorFaultCount > 0
                    ? 'bg-slate-900 border-rose-500/40'
                    : 'bg-slate-900 border-slate-800'
                }`}
              >
                {/* Header card */}
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-slate-100 text-base">{device.name}</h3>
                        <span className="text-xs font-mono text-slate-400">({device.device_code})</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-2">
                        <span>
                          Khu vực: <span className="text-slate-300 font-medium">{device.zone?.name}</span>
                        </span>
                        {(liveIp || liveMac) && (
                          <span className="font-mono text-[11px] text-sky-300/90">
                            | {liveIp ? `IP ${liveIp}` : ''}{liveIp && liveMac ? ' · ' : ''}{liveMac || ''}
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                          isOnline
                            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                            : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
                          }`}
                        />
                        {isOnline ? 'ONLINE' : 'OFFLINE'}
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {sensorFaultCount > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
                            <AlertOctagon className="w-3 h-3" />
                            LỖI CẢM BIẾN ({sensorFaultCount})
                          </span>
                        )}
                        <RiskBadge risk={currentRisk} />
                      </div>
                    </div>
                  </div>

                  {/* 4 Sensor Metric Boxes với chuyển màu Đỏ (CRITICAL) / Vàng (WARNING) theo ngưỡng TCVN 8370 */}
                  {!isOnline && hasTelemetry && (
                    <div className="mt-4 px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-2 text-[11px] text-slate-400">
                      <span className="flex items-center gap-1.5 font-medium text-amber-300/90">
                        <Clock className="w-3.5 h-3.5 text-amber-400/90 shrink-0" />
                        <span>Thiết bị đang OFFLINE — Dữ liệu lưu lần cuối</span>
                      </span>
                      {formattedLastSeen && (
                        <span className="font-mono text-slate-300 shrink-0">{formattedLastSeen}</span>
                      )}
                    </div>
                  )}

                  {(() => {
                    const isTempCrit = isOnline && hasTelemetry && ahtEnabled && aht20Ok && temp !== null && temp > 28.0;
                    const isTempWarn = isOnline && hasTelemetry && ahtEnabled && aht20Ok && temp !== null && temp > 25.0;

                    const isRhCrit = isOnline && hasTelemetry && ahtEnabled && aht20Ok && rh !== null && rh > 70.0;
                    const isRhWarn = isOnline && hasTelemetry && ahtEnabled && aht20Ok && rh !== null && rh > 65.0;

                    const isEmcCrit = isOnline && hasTelemetry && ahtEnabled && aht20Ok && emc !== null && emc > 14.8;
                    const isEmcWarn = isOnline && hasTelemetry && ahtEnabled && aht20Ok && emc !== null && emc > 14.0;

                    const isGasCrit = isOnline && hasTelemetry && mqEnabled && mq135Ok && gas !== null && gas >= 700.0;
                    const isGasWarn = isOnline && hasTelemetry && mqEnabled && mq135Ok && gas !== null && gas >= 600.0;

                    return (
                      <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2.5 ${!isOnline && hasTelemetry ? 'mt-2.5' : 'mt-5'}`}>
                        {/* Nhiệt độ */}
                        <div
                          className={`p-3 rounded-2xl border transition-all duration-300 ${
                            !ahtEnabled
                              ? 'bg-slate-950/40 border-slate-800/60 border-dashed opacity-70'
                              : !aht20Ok
                              ? 'bg-rose-950/20 border-rose-500/50 border-dashed'
                              : isTempCrit
                              ? 'bg-rose-500/15 border-rose-500/60 shadow-lg shadow-rose-500/20'
                              : isTempWarn
                              ? 'bg-amber-500/10 border-amber-500/50'
                              : 'bg-slate-950/60 border-slate-800/80'
                          }`}
                        >
                          <div className="flex items-center justify-between text-xs text-slate-400">
                            <div className="flex items-center gap-1.5">
                              <Thermometer
                                className={`w-3.5 h-3.5 ${
                                  !ahtEnabled
                                    ? 'text-slate-500'
                                    : !aht20Ok || isTempCrit
                                    ? 'text-rose-400'
                                    : isTempWarn
                                    ? 'text-amber-400'
                                    : 'text-slate-400'
                                }`}
                              />
                              <span>Nhiệt độ</span>
                            </div>
                            {!ahtEnabled ? (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                                ĐÃ TẮT
                              </span>
                            ) : !aht20Ok ? (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                LỖI AHT20
                              </span>
                            ) : aht20Sim ? (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300">
                                MÔ PHỎNG
                              </span>
                            ) : isTempCrit ? (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-500 text-slate-950 animate-pulse">
                                NGUY CẤP
                              </span>
                            ) : isTempWarn ? (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                BÁO ĐỘNG
                              </span>
                            ) : null}
                          </div>
                          <div
                            className={`text-xl font-bold mt-1 ${
                              !ahtEnabled
                                ? 'text-slate-500'
                                : !aht20Ok
                                ? 'text-rose-400'
                                : isTempCrit
                                ? 'text-rose-400 font-extrabold animate-pulse'
                                : isTempWarn
                                ? 'text-amber-400'
                                : 'text-slate-100'
                            }`}
                          >
                            {ahtEnabled && aht20Ok && temp !== null ? `${temp}°C` : '--°C'}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {!ahtEnabled
                              ? 'Đã tắt theo dõi module'
                              : !aht20Ok
                              ? 'Không nhận I2C 0x38'
                              : temp === null
                              ? 'Chờ gói tin từ node'
                              : 'Mục tiêu ≤ 25°C'}
                          </div>
                        </div>

                        {/* Độ ẩm không khí RH */}
                        <div
                          className={`p-3 rounded-2xl border transition-all duration-300 ${
                            !ahtEnabled
                              ? 'bg-slate-950/40 border-slate-800/60 border-dashed opacity-70'
                              : !aht20Ok
                              ? 'bg-rose-950/20 border-rose-500/50 border-dashed'
                              : isRhCrit
                              ? 'bg-rose-500/15 border-rose-500/60 shadow-lg shadow-rose-500/20'
                              : isRhWarn
                              ? 'bg-amber-500/10 border-amber-500/50'
                              : 'bg-slate-950/60 border-slate-800/80'
                          }`}
                        >
                          <div className="flex items-center justify-between text-xs text-slate-400">
                            <div className="flex items-center gap-1.5">
                              <Droplets
                                className={`w-3.5 h-3.5 ${
                                  !ahtEnabled
                                    ? 'text-slate-500'
                                    : !aht20Ok || isRhCrit
                                    ? 'text-rose-400'
                                    : isRhWarn
                                    ? 'text-amber-400'
                                    : 'text-blue-400'
                                }`}
                              />
                              <span>Độ ẩm RH</span>
                            </div>
                            {!ahtEnabled ? (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                                ĐÃ TẮT
                              </span>
                            ) : !aht20Ok ? (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                LỖI AHT20
                              </span>
                            ) : isRhCrit ? (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-500 text-slate-950 animate-pulse">
                                ẨM TRẦN
                              </span>
                            ) : isRhWarn ? (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                CẢNH BÁO
                              </span>
                            ) : null}
                          </div>
                          <div
                            className={`text-xl font-bold mt-1 ${
                              !ahtEnabled
                                ? 'text-slate-500'
                                : !aht20Ok
                                ? 'text-rose-400'
                                : isRhCrit
                                ? 'text-rose-400 font-extrabold animate-pulse'
                                : isRhWarn
                                ? 'text-amber-400'
                                : 'text-slate-100'
                            }`}
                          >
                            {ahtEnabled && aht20Ok && rh !== null ? `${rh}%` : '--%'}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {!ahtEnabled
                              ? 'Đã tắt theo dõi module'
                              : !aht20Ok
                              ? 'Chờ kết nối AHT20'
                              : rh === null
                              ? 'Chờ gói tin từ node'
                              : 'Giới hạn ≤ 65%'}
                          </div>
                        </div>

                        {/* Độ ẩm cân bằng thóc EMC */}
                        <div
                          className={`p-3 rounded-2xl border transition-all duration-300 ${
                            !ahtEnabled
                              ? 'bg-slate-950/40 border-slate-800/60 border-dashed opacity-70'
                              : !aht20Ok
                              ? 'bg-rose-950/20 border-rose-500/50 border-dashed'
                              : isEmcCrit
                              ? 'bg-rose-500/15 border-rose-500/60 shadow-lg shadow-rose-500/20'
                              : isEmcWarn
                              ? 'bg-amber-500/10 border-amber-500/50'
                              : 'bg-slate-950/60 border-slate-800/80'
                          }`}
                        >
                          <div className="flex items-center justify-between text-xs text-slate-400">
                            <div className="flex items-center gap-1.5">
                              <Wind
                                className={`w-3.5 h-3.5 ${
                                  !ahtEnabled
                                    ? 'text-slate-500'
                                    : !aht20Ok || isEmcCrit
                                    ? 'text-rose-400'
                                    : isEmcWarn
                                    ? 'text-amber-400'
                                    : 'text-emerald-400'
                                }`}
                              />
                              <span>Độ ẩm EMC</span>
                            </div>
                            {!ahtEnabled ? (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                                ĐÃ TẮT
                              </span>
                            ) : !aht20Ok ? (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                THIẾU AHT20
                              </span>
                            ) : isEmcCrit ? (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-500 text-slate-950 animate-pulse">
                                NGUY HẠI
                              </span>
                            ) : isEmcWarn ? (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                CHÚ Ý
                              </span>
                            ) : null}
                          </div>
                          <div
                            className={`text-xl font-bold mt-1 ${
                              !ahtEnabled
                                ? 'text-slate-500'
                                : !aht20Ok
                                ? 'text-rose-400'
                                : isEmcCrit
                                ? 'text-rose-400 font-extrabold animate-pulse'
                                : isEmcWarn
                                ? 'text-amber-400'
                                : 'text-emerald-300'
                            }`}
                          >
                            {ahtEnabled && aht20Ok && emc !== null ? `${emc}%` : '--%'}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {!ahtEnabled
                              ? 'Đã tắt theo dõi module'
                              : !aht20Ok
                              ? 'Cần dữ liệu AHT20'
                              : emc === null
                              ? 'Chờ gói tin từ node'
                              : 'TCVN ≤ 14.0%'}
                          </div>
                        </div>

                        {/* Khí Gas MQ-135 */}
                        <div
                          className={`p-3 rounded-2xl border transition-all duration-300 ${
                            !mqEnabled
                              ? 'bg-slate-950/40 border-slate-800/60 border-dashed opacity-70'
                              : !mq135Ok
                              ? 'bg-rose-950/20 border-rose-500/50 border-dashed'
                              : isGasCrit
                              ? 'bg-rose-500/15 border-rose-500/60 shadow-lg shadow-rose-500/20'
                              : isGasWarn
                              ? 'bg-amber-500/10 border-amber-500/50'
                              : 'bg-slate-950/60 border-slate-800/80'
                          }`}
                        >
                          <div className="flex items-center justify-between text-xs text-slate-400">
                            <div className="flex items-center gap-1.5">
                              <Flame
                                className={`w-3.5 h-3.5 ${
                                  !mqEnabled
                                    ? 'text-slate-500'
                                    : !mq135Ok || isGasCrit
                                    ? 'text-rose-400'
                                    : isGasWarn
                                    ? 'text-amber-400'
                                    : 'text-purple-400'
                                }`}
                              />
                              <span>Khí Gas</span>
                            </div>
                            {!mqEnabled ? (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                                ĐÃ TẮT
                              </span>
                            ) : !mq135Ok ? (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                LỖI MQ-135
                              </span>
                            ) : mq135Sim ? (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300">
                                MÔ PHỎNG
                              </span>
                            ) : isGasCrit ? (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-500 text-slate-950 animate-pulse">
                                LÊN MEN
                              </span>
                            ) : isGasWarn ? (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                BÁO ĐỘNG
                              </span>
                            ) : null}
                          </div>
                          <div
                            className={`text-xl font-bold mt-1 ${
                              !mqEnabled
                                ? 'text-slate-500'
                                : !mq135Ok
                                ? 'text-rose-400'
                                : isGasCrit
                                ? 'text-rose-400 font-extrabold animate-pulse'
                                : isGasWarn
                                ? 'text-amber-400'
                                : 'text-slate-100'
                            }`}
                          >
                            {mqEnabled && mq135Ok && gas !== null ? gas : '--'}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {!mqEnabled
                              ? 'Đã tắt theo dõi module'
                              : !mq135Ok
                              ? `ADC: ${sensorHealth?.mq135?.raw_adc ?? 0} (Mất tín hiệu)`
                              : gas === null
                              ? 'Chờ gói tin từ node'
                              : '< 600 ppm'}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Bảng chẩn đoán phần cứng từng cảm biến */}
                  <SensorHealthPanel
                    sensorHealth={sensorHealth}
                    doorOpen={doorOpen}
                    isOnline={isOnline}
                    variant="compact"
                  />
                </div>

                {/* Footer Controls: Fan toggle, Buzzer test & Details button */}
                <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
                  {/* Fan Switch */}
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={!fanEnabled || !isOnline || isViewer}
                      onClick={() => handleToggleActuator(device, 'VENTILATION_FAN', fanActive)}
                      className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors focus:outline-none border border-slate-600/50 ${
                        !fanEnabled || !isOnline || isViewer
                          ? 'bg-slate-800 opacity-50 cursor-not-allowed'
                          : fanActive
                          ? 'bg-amber-500 cursor-pointer'
                          : 'bg-slate-700 cursor-pointer'
                      }`}
                      title={
                        isViewer
                          ? 'Vai trò Giám sát / QC chỉ có quyền xem'
                          : !isOnline
                          ? 'Thiết bị đang OFFLINE, không thể điều khiển'
                          : !fanEnabled
                          ? 'Quạt đang bị tắt trong Quản lý Module'
                          : fanActive
                          ? 'Bấm để Tắt quạt'
                          : 'Bấm để Bật quạt'
                      }
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
                          fanEnabled && fanActive ? 'translate-x-8' : 'translate-x-1'
                        }`}
                      />
                    </button>

                    <div className="text-xs">
                      <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                        <Fan className={`w-3.5 h-3.5 ${isOnline && fanEnabled && fanActive ? 'text-amber-400 animate-spin' : 'text-slate-500'}`} />
                        <span>Quạt thông gió:</span>
                        <span className={!fanEnabled ? 'text-slate-500' : !isOnline ? 'text-slate-400' : fanActive ? 'text-amber-300 font-bold' : 'text-slate-400'}>
                          {!fanEnabled ? 'ĐÃ TẮT MODULE' : fanActive ? 'BẬT (ON)' : 'TẮT (OFF)'}
                        </span>
                      </div>

                      {/* Hiển thị hiệu ứng chờ Pending ACK... (Mục 5.1 & Bước 5) */}
                      {fanPending && (
                        <div className="text-[11px] text-amber-400 animate-pulse flex items-center gap-1 mt-0.5 font-medium">
                          <Clock className="w-3 h-3 animate-spin" />
                          <span>Chờ phản hồi Pending ACK... &rarr; Active</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Actions: Test Buzzer + View Details */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!buzzerEnabled || !isOnline || isViewer}
                      onClick={() => handleToggleActuator(device, 'ALARM_BUZZER', buzzerActive)}
                      className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl transition-all border ${
                        !buzzerEnabled || !isOnline || isViewer
                          ? 'bg-slate-900 text-slate-500 border-slate-800 cursor-not-allowed opacity-60'
                          : buzzerActive
                          ? 'bg-rose-500 text-white border-rose-400 shadow-lg shadow-rose-500/25 animate-pulse cursor-pointer'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 cursor-pointer'
                      }`}
                      title={
                        isViewer
                          ? 'Vai trò Giám sát / QC chỉ có quyền xem'
                          : !isOnline
                          ? 'Thiết bị đang OFFLINE, không thể điều khiển'
                          : !buzzerEnabled
                          ? 'Còi đang bị tắt trong Quản lý Module'
                          : buzzerActive
                          ? 'Bấm để Tắt còi'
                          : 'Bấm để kích hoạt Bật còi (Test Relay 2)'
                      }
                    >
                      <Volume2 className={`w-3.5 h-3.5 ${isOnline && buzzerEnabled && buzzerActive ? 'animate-bounce' : isOnline && buzzerEnabled ? 'text-rose-400' : 'text-slate-500'}`} />
                      <span>
                        {!buzzerEnabled
                          ? 'Còi: Tắt'
                          : buzzerPending
                          ? 'Đang chờ ACK...'
                          : buzzerActive
                          ? 'Tắt Còi (Đang kêu)'
                          : 'Test Còi'}
                      </span>
                    </button>

                    <button
                      onClick={() => navigate(`/devices/${device.id}`)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-3 py-2 rounded-xl transition-colors border border-amber-500/20"
                    >
                      <span>Chi tiết &amp; Biểu đồ</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
            </div>
            {decommissionedCount > 0 && (
              <div className="text-xs text-slate-400 bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-2.5 flex items-center justify-between">
                <span>
                  Đang ẩn <strong className="text-slate-200">{decommissionedCount}</strong> thiết bị đã thu hồi (DECOMMISSIONED) khỏi bảng giám sát.
                </span>
                <button
                  onClick={() => navigate('/devices')}
                  className="text-amber-400 hover:text-amber-300 font-semibold"
                >
                  Xem trong Quản lý Thiết bị &rarr;
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
