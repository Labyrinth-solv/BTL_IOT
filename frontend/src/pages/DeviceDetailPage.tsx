import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { Device, TelemetryLog, DeviceCommand } from '../types';
import { RiskBadge } from '../components/RiskBadge';
import { LifecycleBadge } from '../components/LifecycleBadge';
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
} from 'lucide-react';

export const DeviceDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isViewer, showToast } = useAuth();
  const { latestTelemetry, latestAck } = useSocket();

  const [device, setDevice] = useState<Device | null>(null);
  const [telemetryHistory, setTelemetryHistory] = useState<TelemetryLog[]>([]);
  const [commands, setCommands] = useState<DeviceCommand[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Cấu hình từ xa
  const [samplingInterval, setSamplingInterval] = useState(3000);
  const [tempWarn, setTempWarn] = useState(25.0);
  const [humWarn, setHumWarn] = useState(65.0);
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
        if (cfg.hum_warn_threshold) setHumWarn(cfg.hum_warn_threshold);
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
      showToast('Tài khoản VIEWER không có quyền đổi cấu hình thiết bị! (403 Forbidden)', 'error');
      return;
    }

    setIsConfiguring(true);
    try {
      const payload = {
        sampling_interval_ms: Number(samplingInterval),
        temp_warn_threshold: Number(tempWarn),
        hum_warn_threshold: Number(humWarn),
      };
      const res = await api.updateConfig(device.id, payload);
      if (res.success) {
        showToast('Đã phát lệnh cập nhật cấu hình xuống thiết bị (/cmd)!', 'success');
        fetchDeviceData();
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi lưu cấu hình', 'error');
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

  if (isLoading || !device) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-slate-400">
        Đang tải dữ liệu chi tiết thiết bị...
      </div>
    );
  }

  // Tính Min / Max / Avg cho số liệu lịch sử
  const temps = telemetryHistory.map((t) => t.temperature);
  const rhs = telemetryHistory.map((t) => t.humidity_air);
  const emcs = telemetryHistory.map((t) => t.estimated_emc);

  const avgTemp = temps.length ? (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1) : 0;
  const maxTemp = temps.length ? Math.max(...temps).toFixed(1) : 0;
  const minTemp = temps.length ? Math.min(...temps).toFixed(1) : 0;

  const avgRH = rhs.length ? (rhs.reduce((a, b) => a + b, 0) / rhs.length).toFixed(1) : 0;
  const maxRH = rhs.length ? Math.max(...rhs).toFixed(1) : 0;
  const minRH = rhs.length ? Math.min(...rhs).toFixed(1) : 0;

  const avgEMC = emcs.length ? (emcs.reduce((a, b) => a + b, 0) / emcs.length).toFixed(1) : 0;

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
            <p className="text-xs text-slate-400">
              Khu vực: <span className="text-slate-200 font-medium">{device.zone?.name}</span> | Phần cứng:{' '}
              {device.hw_version} | Firmware: v{device.fw_version}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <LifecycleBadge state={device.lifecycle_state} />
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 transition-all"
          >
            <Download className="w-4 h-4" />
            <span>Xuất Báo Cáo CSV</span>
          </button>
        </div>
      </div>

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

      {/* Row 2 Cột: Cấu Hình Từ Xa & Lịch Sử Lệnh Điều Khiển */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cấu Hình Từ Xa */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="w-4 h-4 text-amber-400" />
            <h3 className="font-bold text-slate-100 text-sm">Cấu Hình Thiết Bị Từ Xa (Remote Config)</h3>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            Phát bản tin cập nhật cấu hình ngưỡng nhiệt ẩm và chu kỳ gửi dữ liệu xuống topic /cmd.
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
                <label className="block text-xs font-medium text-slate-300 mb-1">Ngưỡng cảnh báo Temp (°C)</label>
                <input
                  type="number"
                  step="0.5"
                  value={tempWarn}
                  onChange={(e) => setTempWarn(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Ngưỡng cảnh báo RH (%)</label>
                <input
                  type="number"
                  step="0.5"
                  value={humWarn}
                  onChange={(e) => setHumWarn(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isConfiguring}
              className="w-full py-2.5 px-4 rounded-xl font-semibold text-xs bg-amber-500 hover:bg-amber-600 text-slate-950 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isConfiguring ? 'Đang gửi lệnh...' : 'Lưu & Phát Lệnh Xuống Thiết Bị'}</span>
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
