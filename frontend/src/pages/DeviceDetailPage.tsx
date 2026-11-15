import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { Device, TelemetryLog, DeviceCommand, PeripheralConfig } from '../types';
import { RiskBadge } from '../components/RiskBadge';
import { LifecycleBadge } from '../components/LifecycleBadge';
import { SensorHealthPanel } from '../components/SensorHealthPanel';
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
  Download,
  Settings,
  History,
  Activity,
  Fan,
  Thermometer,
  Droplets,
  Wind,
  Flame,
  Clock,
  CheckCircle,
  AlertCircle,
  Send,
  Volume2,
  Cpu,
} from 'lucide-react';

export const DeviceDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isViewer, showToast } = useAuth();
  const { latestTelemetry, deviceStatus, latestAck } = useSocket();

  const [device, setDevice] = useState<Device | null>(null);
  const [telemetryHistory, setTelemetryHistory] = useState<TelemetryLog[]>([]);
  const [commands, setCommands] = useState<DeviceCommand[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Cấu hình từ xa & ngưỡng NVS
  const [samplingInterval, setSamplingInterval] = useState(3000);
  const [tempWarn, setTempWarn] = useState(25.0);
  const [tempCrit, setTempCrit] = useState(28.0);
  const [humWarn, setHumWarn] = useState(65.0);
  const [humCrit, setHumCrit] = useState(70.0);
  const [gasWarn, setGasWarn] = useState(600);
  const [gasCrit, setGasCrit] = useState(700);
  const [peripherals, setPeripherals] = useState<PeripheralConfig>({
    aht20_enabled: true,
    mq135_enabled: true,
    door_enabled: true,
    fan_enabled: true,
    fan_auto: true,
    buzzer_enabled: true,
    buzzer_auto: true,
  });
  const [isConfiguring, setIsConfiguring] = useState(false);

  const fetchDeviceData = async () => {
    if (!id) return;
    try {
      const res = await api.getDeviceById(id);
      if (res.success && res.data) {
        setDevice(res.data);
        if (res.data.telemetry_logs) setTelemetryHistory(res.data.telemetry_logs.reverse());
        if (res.data.commands) setCommands(res.data.commands);

        const cfg = res.data.config_json || {};
        if (cfg.sampling_interval_ms) setSamplingInterval(cfg.sampling_interval_ms);
        if (cfg.temp_warn_threshold) setTempWarn(cfg.temp_warn_threshold);
        if (cfg.temp_crit_threshold) setTempCrit(cfg.temp_crit_threshold);
        if (cfg.hum_warn_threshold) setHumWarn(cfg.hum_warn_threshold);
        if (cfg.hum_crit_threshold) setHumCrit(cfg.hum_crit_threshold);
        if (cfg.gas_warn_threshold) setGasWarn(cfg.gas_warn_threshold);
        if (cfg.gas_crit_threshold) setGasCrit(cfg.gas_crit_threshold);
        if (cfg.peripherals) {
          setPeripherals({
            aht20_enabled: cfg.peripherals.aht20_enabled !== false,
            mq135_enabled: cfg.peripherals.mq135_enabled !== false,
            door_enabled: cfg.peripherals.door_enabled !== false,
            fan_enabled: cfg.peripherals.fan_enabled !== false,
            fan_auto: cfg.peripherals.fan_auto !== false,
            buzzer_enabled: cfg.peripherals.buzzer_enabled !== false,
            buzzer_auto: cfg.peripherals.buzzer_auto !== false,
          });
        }
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

  // Cập nhật biểu đồ theo thời gian thực khi có telemetry mới từ WebSocket
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
        const updated = [...prev.slice(-29), item];
        return updated;
      });
    }
  }, [latestTelemetry, device]);

  // Cập nhật trạng thái lệnh trong bảng khi có ACK
  useEffect(() => {
    Object.values(latestAck).forEach((ack: any) => {
      setCommands((prev) =>
        prev.map((cmd) => (cmd.cmd_id === ack.cmd_id ? { ...cmd, status: ack.status } : cmd))
      );
    });
  }, [latestAck]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!device) return;

    if (isViewer) {
      showToast('Vai trò Giám sát / QC không có quyền đổi cấu hình thiết bị! (403 Forbidden)', 'error');
      return;
    }

    setIsConfiguring(true);
    try {
      const payload = {
        sampling_interval_ms: Number(samplingInterval),
        temp_warn_threshold: Number(tempWarn),
        temp_crit_threshold: Number(tempCrit),
        hum_warn_threshold: Number(humWarn),
        hum_crit_threshold: Number(humCrit),
        gas_warn_threshold: Number(gasWarn),
        gas_crit_threshold: Number(gasCrit),
        peripherals,
      };
      const res = await api.updateConfig(device.id, payload);
      if (res.success) {
        showToast('Đã đồng bộ cấu hình & trạng thái module xuống Flash (NVS) thiết bị!', 'success');
        fetchDeviceData();
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi lưu cấu hình', 'error');
    } finally {
      setIsConfiguring(false);
    }
  };

  const handleTogglePeripheral = (key: keyof PeripheralConfig) => {
    setPeripherals((prev) => ({
      ...prev,
      [key]: !(prev[key] !== false),
    }));
  };

  const handleSavePeripheralsOnly = async () => {
    if (!device) return;
    if (isViewer) {
      showToast('Vai trò Giám sát / QC không có quyền đổi cấu hình thiết bị! (403 Forbidden)', 'error');
      return;
    }

    setIsConfiguring(true);
    try {
      const res = await api.updateConfig(device.id, { peripherals });
      if (res.success) {
        showToast('Đã lưu & phát cấu hình bật/tắt Module xuống ESP32!', 'success');
        fetchDeviceData();
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi cập nhật module ngoại vi', 'error');
    } finally {
      setIsConfiguring(false);
    }
  };

  const handleExportCSV = () => {
    if (!device) return;
    const url = api.getExportUrl(device.id);
    window.open(url, '_blank');
    showToast('Đang tải xuống báo cáo lịch sử CSV...', 'success');
  };

  const handleControlActuator = async (
    target: 'VENTILATION_FAN' | 'ALARM_BUZZER',
    currentState: boolean
  ) => {
    if (!device) return;

    const action = currentState ? 'TURN_OFF' : 'TURN_ON';
    const isFan = target === 'VENTILATION_FAN';
    const label = isFan ? 'quạt thông gió' : 'còi test';

    try {
      const res = await api.controlActuator(device.id, {
        target,
        action,
        ...(isFan ? { control_mode: 'MANUAL' } : {}),
      });
      if (res.success) {
        showToast(`Đã gửi lệnh ${action === 'TURN_ON' ? 'BẬT' : 'TẮT'} ${label}. Đang chờ phản hồi ACK...`, 'warning');
      }
    } catch (err: any) {
      showToast(err.message || `Lỗi gửi lệnh điều khiển ${label}`, 'error');
    }
  };

  if (isLoading || !device) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-slate-400">
        Đang tải dữ liệu chi tiết thiết bị...
      </div>
    );
  }

  // Tính Min / Max / Avg cho số liệu lịch sử (lọc bỏ điểm 0/0 khi mất cảm biến AHT20)
  const validAhtLogs = telemetryHistory.filter((t) => !(t.temperature === 0 && t.humidity_air === 0));
  const temps = validAhtLogs.map((t) => t.temperature);
  const rhs = validAhtLogs.map((t) => t.humidity_air);
  const emcs = validAhtLogs.map((t) => t.estimated_emc);

  const avgTemp = temps.length ? (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1) : '--';
  const maxTemp = temps.length ? Math.max(...temps).toFixed(1) : '--';
  const minTemp = temps.length ? Math.min(...temps).toFixed(1) : '--';

  const avgRH = rhs.length ? (rhs.reduce((a, b) => a + b, 0) / rhs.length).toFixed(1) : '--';
  const maxRH = rhs.length ? Math.max(...rhs).toFixed(1) : '--';
  const minRH = rhs.length ? Math.min(...rhs).toFixed(1) : '--';

  const avgEMC = emcs.length ? (emcs.reduce((a, b) => a + b, 0) / emcs.length).toFixed(1) : '--';

  const wsData = latestTelemetry[device.device_code];
  const wsStatus = deviceStatus[device.device_code];
  const liveIp = wsData?.ip_address ?? wsStatus?.ip_address ?? device.ip_address;
  const liveMac = wsData?.mac_address ?? wsStatus?.mac_address ?? device.mac_address;
  const liveRssi = wsData?.rssi ?? wsStatus?.rssi ?? device.rssi;
  const sensorHealth = wsData?.sensor_health ?? device.sensor_health;
  const doorOpen = wsData?.door_open ?? device.door_open;
  const currentFanState = wsData
    ? wsData.fan_state === 'ON'
    : (telemetryHistory[telemetryHistory.length - 1]?.fan_state ?? false);
  const currentBuzzerState = wsData ? wsData.buzzer_state === 'ON' : false;
  const fanEnabled = (device.config_json?.peripherals?.fan_enabled ?? peripherals.fan_enabled) !== false;
  const buzzerEnabled =
    (device.config_json?.peripherals?.buzzer_enabled ?? peripherals.buzzer_enabled) !== false;

  // Định dạng dữ liệu cho biểu đồ Recharts
  const chartData = telemetryHistory.map((item) => ({
    time: new Date(item.recorded_at).toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
    Nhiệt_độ: item.temperature,
    Độ_ẩm_RH: item.humidity_air,
    Độ_ẩm_EMC: item.estimated_emc,
    Khí_Gas: item.gas_ppm,
  }));

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-100">{device.name}</h1>
              <span className="font-mono text-xs text-slate-400">({device.device_code})</span>
            </div>
            <p className="text-xs text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span>
                Khu vực: <span className="text-slate-200 font-medium">{device.zone?.name}</span>
              </span>
              <span>| Phần cứng: {device.hw_version} | FW: v{device.fw_version}</span>
              {liveIp && (
                <span className="font-mono text-sky-300">| IP: {liveIp}</span>
              )}
              {liveMac && (
                <span className="font-mono text-slate-300">| MAC: {liveMac}</span>
              )}
              {typeof liveRssi === 'number' && (
                <span className="font-mono text-emerald-300">| {liveRssi} dBm</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <LifecycleBadge state={device.lifecycle_state} />

          {/* Công Tắc Quạt Thông Gió Nhanh */}
          <button
            onClick={() => handleControlActuator('VENTILATION_FAN', currentFanState)}
            disabled={!fanEnabled || isViewer}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
              !fanEnabled || isViewer
                ? 'bg-slate-900 text-slate-500 border-slate-800 opacity-60 cursor-not-allowed'
                : currentFanState
                ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-lg shadow-amber-500/20 cursor-pointer'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 cursor-pointer'
            }`}
            title={
              isViewer
                ? 'Vai trò Giám sát / QC chỉ có quyền xem'
                : !fanEnabled
                ? 'Quạt thông gió (Relay K1) đã bị tắt trong cấu hình Module'
                : currentFanState
                ? 'Bấm để Tắt quạt thông gió'
                : 'Bấm để Bật quạt thông gió'
            }
          >
            <Fan className={`w-4 h-4 ${fanEnabled && currentFanState ? 'animate-spin' : ''}`} />
            <span>
              {!fanEnabled
                ? 'Quạt: ĐÃ VÔ HIỆU'
                : currentFanState
                ? 'Quạt: BẬT (ON)'
                : 'Quạt: TẮT (OFF)'}
            </span>
          </button>

          {/* Nút Kích Hoạt Bật Còi Test */}
          <button
            onClick={() => handleControlActuator('ALARM_BUZZER', currentBuzzerState)}
            disabled={!buzzerEnabled || isViewer}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
              !buzzerEnabled || isViewer
                ? 'bg-slate-900 text-slate-500 border-slate-800 opacity-60 cursor-not-allowed'
                : currentBuzzerState
                ? 'bg-rose-500 text-white border-rose-400 font-bold shadow-lg shadow-rose-500/25 animate-pulse cursor-pointer'
                : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700 cursor-pointer'
            }`}
            title={
              isViewer
                ? 'Vai trò Giám sát / QC chỉ có quyền xem'
                : !buzzerEnabled
                ? 'Còi báo động (Relay K2) đã bị tắt trong cấu hình Module'
                : currentBuzzerState
                ? 'Bấm để Tắt còi báo động'
                : 'Bấm để kích hoạt Bật còi (Test Relay K2)'
            }
          >
            <Volume2
              className={`w-4 h-4 ${
                !buzzerEnabled
                  ? 'text-slate-500'
                  : currentBuzzerState
                  ? 'animate-bounce'
                  : 'text-rose-400'
              }`}
            />
            <span>
              {!buzzerEnabled
                ? 'Còi: ĐÃ VÔ HIỆU'
                : currentBuzzerState
                ? 'Còi: ĐANG BẬT (Tắt)'
                : 'Test Còi'}
            </span>
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 transition-all"
          >
            <Download className="w-4 h-4" />
            <span>Xuất Báo Cáo CSV</span>
          </button>
        </div>
      </div>

      {/* Chẩn đoán trạng thái cảm biến phần cứng realtime */}
      <SensorHealthPanel
        sensorHealth={sensorHealth}
        doorOpen={doorOpen}
        isOnline={device.is_online}
        variant="detailed"
      />

      {/* Thống kê nhanh Min / Max / Avg */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Thermometer className="w-4 h-4 text-amber-400" />
            <span>Nhiệt Độ Khối Hạt (°C)</span>
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-bold text-slate-100">{avgTemp}°C</span>
            <span className="text-xs text-slate-400">
              Min: <span className="text-slate-200">{minTemp}</span> | Max:{' '}
              <span className="text-amber-400 font-bold">{maxTemp}</span>
            </span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Droplets className="w-4 h-4 text-blue-400" />
            <span>Độ Ẩm Không Khí (%RH)</span>
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-bold text-slate-100">{avgRH}%</span>
            <span className="text-xs text-slate-400">
              Min: <span className="text-slate-200">{minRH}</span> | Max:{' '}
              <span className="text-blue-400 font-bold">{maxRH}</span>
            </span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Wind className="w-4 h-4 text-emerald-400" />
            <span>Độ Ẩm Cân Bằng Hạt (EMC %MC)</span>
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-bold text-emerald-300">{avgEMC}% MC</span>
            <span className="text-xs text-slate-400">Mô hình Halsey &le; 14.0%</span>
          </div>
        </div>
      </div>

      {/* Biểu đồ thời gian thực Recharts */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-amber-400" />
            <h3 className="font-bold text-slate-100 text-sm">Biểu Đồ Xu Hướng Vi Khí Hậu Thời Gian Thực</h3>
          </div>
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Cập nhật trực tiếp qua WebSocket</span>
          </div>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 11 }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} domain={['dataMin - 5', 'dataMax + 5']} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#334155',
                  borderRadius: '1rem',
                  fontSize: '12px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
              <Line
                type="monotone"
                dataKey="Nhiệt_độ"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="Độ_ẩm_RH"
                stroke="#38bdf8"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="Độ_ẩm_EMC"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Quản Lý Từng Module & Ngoại Vi Gắn Trên ESP32 */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <Cpu className="w-4 h-4 text-sky-400" />
            <div>
              <h3 className="font-bold text-slate-100 text-sm">
                Quản Lý Từng Module &amp; Ngoại Vi Trên ESP32
              </h3>
              <p className="text-xs text-slate-400">
                Bật/tắt theo dõi cảm biến và cho phép kích hoạt Relay K1/K2 (lưu vào NVS Flash của ESP32). Tắt cảm biến nếu node không gắn module đó để không báo lỗi giả.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSavePeripheralsOnly}
            disabled={isConfiguring || isViewer}
            className="shrink-0 px-4 py-2 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white shadow-lg shadow-sky-600/20 transition-all disabled:opacity-50 cursor-pointer"
          >
            {isConfiguring ? 'Đang đồng bộ...' : 'Lưu Trạng Thái Module'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* AHT20 */}
          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-slate-200">Cảm biến AHT20 (Nhiệt &amp; Ẩm)</div>
              <div className="text-[11px] text-slate-400 mt-0.5 font-mono">I2C 0x38 (SDA21 / SCL22)</div>
            </div>
            <button
              type="button"
              onClick={() => handleTogglePeripheral('aht20_enabled')}
              disabled={isViewer}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                peripherals.aht20_enabled !== false
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {peripherals.aht20_enabled !== false ? 'ĐANG BẬT' : 'ĐÃ TẮT'}
            </button>
          </div>

          {/* MQ-135 */}
          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-slate-200">Cảm biến Khí Gas MQ-135</div>
              <div className="text-[11px] text-slate-400 mt-0.5 font-mono">ADC GPIO34</div>
            </div>
            <button
              type="button"
              onClick={() => handleTogglePeripheral('mq135_enabled')}
              disabled={isViewer}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                peripherals.mq135_enabled !== false
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {peripherals.mq135_enabled !== false ? 'ĐANG BẬT' : 'ĐÃ TẮT'}
            </button>
          </div>

          {/* Door Sensor */}
          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-slate-200">Cảm biến Từ Cửa Kho</div>
              <div className="text-[11px] text-slate-400 mt-0.5 font-mono">Digital GPIO27</div>
            </div>
            <button
              type="button"
              onClick={() => handleTogglePeripheral('door_enabled')}
              disabled={isViewer}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                peripherals.door_enabled !== false
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {peripherals.door_enabled !== false ? 'ĐANG BẬT' : 'ĐÃ TẮT'}
            </button>
          </div>

          {/* Relay K1: Fan */}
          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2.5 md:col-span-1">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-slate-200">Relay K1 - Quạt Thông Gió</div>
                <div className="text-[11px] text-slate-400 mt-0.5 font-mono">GPIO26 (Active HIGH)</div>
              </div>
              <button
                type="button"
                onClick={() => handleTogglePeripheral('fan_enabled')}
                disabled={isViewer}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                  peripherals.fan_enabled !== false
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                {peripherals.fan_enabled !== false ? 'CHO PHÉP' : 'VÔ HIỆU'}
              </button>
            </div>
            <label className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800/80 cursor-pointer">
              <span>Tự động bật quạt khi vượt ngưỡng (AUTO)</span>
              <input
                type="checkbox"
                checked={peripherals.fan_auto !== false}
                disabled={isViewer || peripherals.fan_enabled === false}
                onChange={() => handleTogglePeripheral('fan_auto')}
                className="accent-amber-500 w-3.5 h-3.5"
              />
            </label>
          </div>

          {/* Relay K2: Buzzer */}
          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2.5 md:col-span-2 lg:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-slate-200">Relay K2 - Còi Báo Động (Buzzer)</div>
                <div className="text-[11px] text-slate-400 mt-0.5 font-mono">GPIO25 (Active HIGH)</div>
              </div>
              <button
                type="button"
                onClick={() => handleTogglePeripheral('buzzer_enabled')}
                disabled={isViewer}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                  peripherals.buzzer_enabled !== false
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                {peripherals.buzzer_enabled !== false ? 'CHO PHÉP' : 'VÔ HIỆU'}
              </button>
            </div>
            <label className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800/80 cursor-pointer">
              <span>Tự động hú còi khi chạm ngưỡng NGUY CẤP (Critical)</span>
              <input
                type="checkbox"
                checked={peripherals.buzzer_auto !== false}
                disabled={isViewer || peripherals.buzzer_enabled === false}
                onChange={() => handleTogglePeripheral('buzzer_auto')}
                className="accent-rose-500 w-3.5 h-3.5"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Row 2 Cột: Cấu Hình Từ Xa & Lịch Sử Lệnh Điều Khiển */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cấu Hình Từ Xa */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="w-4 h-4 text-amber-400" />
            <h3 className="font-bold text-slate-100 text-sm">Cấu Hình Ngưỡng &amp; Đồng Bộ NVS (Remote Config)</h3>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            Cập nhật chu kỳ lấy mẫu và ngưỡng cảnh báo/nguy cấp xuống topic /cmd (ESP32 lưu vào Flash NVS, giữ nguyên sau mất điện).
          </p>

          <form onSubmit={handleSaveConfig} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Chu kỳ gửi dữ liệu Telemetry (ms)
              </label>
              <input
                type="number"
                min="1000"
                step="500"
                value={samplingInterval}
                onChange={(e) => setSamplingInterval(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
              />
              <span className="text-[10px] text-slate-500">Mặc định: 3000ms (3 giây)</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Nhiệt cảnh báo (°C)</label>
                <input
                  type="number"
                  step="0.5"
                  value={tempWarn}
                  onChange={(e) => setTempWarn(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-rose-300 mb-1">Nhiệt nguy cấp (°C)</label>
                <input
                  type="number"
                  step="0.5"
                  value={tempCrit}
                  onChange={(e) => setTempCrit(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-200 focus:outline-none focus:border-rose-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Độ ẩm RH cảnh báo (%)</label>
                <input
                  type="number"
                  step="0.5"
                  value={humWarn}
                  onChange={(e) => setHumWarn(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-rose-300 mb-1">Độ ẩm RH nguy cấp (%)</label>
                <input
                  type="number"
                  step="0.5"
                  value={humCrit}
                  onChange={(e) => setHumCrit(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-200 focus:outline-none focus:border-rose-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Gas cảnh báo (ppm)</label>
                <input
                  type="number"
                  step="10"
                  value={gasWarn}
                  onChange={(e) => setGasWarn(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-rose-300 mb-1">Gas nguy cấp (ppm)</label>
                <input
                  type="number"
                  step="10"
                  value={gasCrit}
                  onChange={(e) => setGasCrit(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-200 focus:outline-none focus:border-rose-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isConfiguring || isViewer}
              className="w-full py-2.5 px-4 rounded-xl font-semibold text-xs bg-amber-500 hover:bg-amber-600 text-slate-950 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isConfiguring ? 'Đang gửi lệnh...' : 'Lưu & Đồng Bộ Cấu Hình Xuống Thiết Bị'}</span>
            </button>
          </form>
        </div>

        {/* Lịch Sử Lệnh Điều Khiển (device_commands) */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <History className="w-4 h-4 text-blue-400" />
            <h3 className="font-bold text-slate-100 text-sm">Lịch Sử Lệnh Điều Khiển (/cmd &amp; /ack)</h3>
          </div>

          <div className="flex-1 overflow-y-auto max-h-72">
            <table className="w-full text-left text-xs">
              <thead className="text-[11px] text-slate-400 uppercase border-b border-slate-800">
                <tr>
                  <th className="py-2">Mã Lệnh</th>
                  <th className="py-2">Loại Lệnh</th>
                  <th className="py-2">Trạng Thái</th>
                  <th className="py-2">Thời Gian</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {commands.map((cmd) => (
                  <tr key={cmd.id} className="hover:bg-slate-800/30">
                    <td className="py-2.5 font-mono text-slate-300">{cmd.cmd_id}</td>
                    <td className="py-2.5 text-slate-300">{cmd.command_type}</td>
                    <td className="py-2.5">
                      <span
                        className={`inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded text-[10px] ${
                          cmd.status === 'SUCCESS'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : cmd.status === 'PENDING'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        {cmd.status}
                      </span>
                    </td>
                    <td className="py-2.5 text-slate-400 font-mono text-[11px]">
                      {new Date(cmd.created_at).toLocaleTimeString('vi-VN')}
                    </td>
                  </tr>
                ))}
                {commands.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-500">
                      Chưa có lệnh điều khiển nào được phát.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
