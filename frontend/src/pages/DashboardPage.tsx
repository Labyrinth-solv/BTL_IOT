import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { Device, DashboardKPI } from '../types';
import { RiskBadge } from '../components/RiskBadge';
import {
  Thermometer,
  Droplets,
  Wind,
  Flame,
  AlertTriangle,
  Fan,
  CheckCircle2,
  Clock,
  ArrowRight,
  RefreshCw,
  Warehouse,
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { isViewer, showToast, user } = useAuth();
  const { latestTelemetry, deviceStatus, latestAck } = useSocket();

  const [devices, setDevices] = useState<Device[]>([]);
  const [kpi, setKpi] = useState<DashboardKPI | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingCommands, setPendingCommands] = useState<Record<string, { targetState: string; timestamp: number }>>({});

  const fetchData = async () => {
    try {
      const [devRes, kpiRes] = await Promise.all([
        api.getDevices(),
        api.getDashboardKPI(),
      ]);

      if (devRes.success) setDevices(devRes.data);
      if (kpiRes.success) setKpi(kpiRes.data.kpi);
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
    Object.values(latestAck).forEach((ack: any) => {
      const devCode = ack.device_id;
      if (devCode && pendingCommands[devCode]) {
        // Đã nhận ACK thành công!
        showToast(`Nhận ACK từ ${devCode}: Quạt thông gió đã chuyển sang ${ack.current_actuators?.fan_state || 'mới'}!`, 'success');
        setPendingCommands((prev) => {
          const updated = { ...prev };
          delete updated[devCode];
          return updated;
        });
      }
    });
  }, [latestAck]);

  const handleToggleFan = async (device: Device, currentFanState: boolean) => {
    const action = currentFanState ? 'TURN_OFF' : 'TURN_ON';
    setPendingCommands((prev) => ({
      ...prev,
      [device.device_code]: { targetState: action === 'TURN_ON' ? 'ON' : 'OFF', timestamp: Date.now() },
    }));

    try {
      const res = await api.controlActuator(device.id, {
        target: 'VENTILATION_FAN',
        action,
        control_mode: 'MANUAL',
      });

      if (res.success) {
        showToast(`Đã phát lệnh ${action === 'TURN_ON' ? 'BẬT' : 'TẮT'} quạt. Đang chờ ACK từ thiết bị...`, 'warning');
      }
    } catch (err: any) {
      setPendingCommands((prev) => {
        const copy = { ...prev };
        delete copy[device.device_code];
        return copy;
      });
      showToast(err.message || 'Lỗi gửi lệnh điều khiển quạt', 'error');
    }
  };

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
        <button
          onClick={fetchData}
          className="self-start sm:self-auto flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Làm mới</span>
        </button>
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

        {/* KPI 2 */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Cảnh Báo Chưa Xử Lý</span>
            <span className="p-2 rounded-xl bg-rose-500/10 text-rose-400">
              <AlertTriangle className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-bold text-rose-400 mt-2">
            {kpi?.new_alerts_count || 0}{' '}
            <span className="text-xs font-normal text-slate-400">mới</span>
          </div>
          <div className="text-xs text-slate-400 mt-2">
            Yêu cầu Thủ kho xác nhận &amp; xử lý
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

        {devices.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center text-slate-400">
            <Warehouse className="w-12 h-12 mx-auto text-slate-600 mb-3" />
            <div className="font-semibold text-slate-200 text-base">Chưa tải được danh sách Silo</div>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Hệ thống chưa tìm thấy thiết bị nào được gán hoặc phiên làm việc vừa thay đổi. Bấm nút dưới đây để làm mới.
            </p>
            <button
              onClick={fetchData}
              className="mt-4 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition"
            >
              Tải lại danh sách thiết bị
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {devices.map((device) => {
            // Lấy telemetry mới nhất từ WebSocket nếu có, fallback vào DB
            const wsData = latestTelemetry[device.device_code];
            const wsStatus = deviceStatus[device.device_code];
            const isOnline = wsStatus ? wsStatus.state !== 'OFFLINE' : device.is_online;

            const temp = wsData ? wsData.temperature : device.telemetry_logs?.[0]?.temperature ?? 24.0;
            const rh = wsData ? wsData.humidity_air : device.telemetry_logs?.[0]?.humidity_air ?? 60.0;
            const gas = wsData ? wsData.gas_ppm : device.telemetry_logs?.[0]?.gas_ppm ?? 400.0;
            const emc = wsData ? wsData.estimated_emc : device.telemetry_logs?.[0]?.estimated_emc ?? 12.5;

            const fanActive = wsData
              ? wsData.fan_state === 'ON'
              : device.telemetry_logs?.[0]?.fan_state ?? false;

            const currentRisk = wsData
              ? wsData.risk_level
              : device.telemetry_logs?.[0]?.risk_level ?? 'SAFE';

            const pending = pendingCommands[device.device_code];

            return (
              <div
                key={device.id}
                className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg relative overflow-hidden flex flex-col justify-between"
              >
                {/* Header card */}
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-slate-100 text-base">{device.name}</h3>
                        <span className="text-xs font-mono text-slate-400">({device.device_code})</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Khu vực: <span className="text-slate-300 font-medium">{device.zone?.name}</span>
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
                      <RiskBadge risk={currentRisk} />
                    </div>
                  </div>

                  {/* 4 Sensor Metric Boxes */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-5">
                    {/* Nhiệt độ */}
                    <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800/80">
                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <Thermometer className="w-3.5 h-3.5 text-amber-400" />
                        <span>Nhiệt độ</span>
                      </div>
                      <div className="text-xl font-bold text-slate-100 mt-1">
                        {temp}°C
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Mục tiêu &le; 25°C</div>
                    </div>

                    {/* Độ ẩm không khí */}
                    <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800/80">
                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <Droplets className="w-3.5 h-3.5 text-blue-400" />
                        <span>Độ ẩm RH</span>
                      </div>
                      <div className="text-xl font-bold text-slate-100 mt-1">
                        {rh}%
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Giới hạn &le; 65%</div>
                    </div>

                    {/* Độ ẩm cân bằng EMC */}
                    <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800/80">
                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <Wind className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Độ ẩm EMC</span>
                      </div>
                      <div className="text-xl font-bold text-emerald-300 mt-1">
                        {emc}%
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">TCVN &le; 14.0%</div>
                    </div>

                    {/* Khí Gas MQ-135 */}
                    <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800/80">
                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <Flame className="w-3.5 h-3.5 text-purple-400" />
                        <span>Khí Gas</span>
                      </div>
                      <div className="text-xl font-bold text-slate-100 mt-1">
                        {gas}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">&lt; 600 ppm</div>
                    </div>
                  </div>
                </div>

                {/* Footer Controls: Fan toggle with Pending ACK state & Details button */}
                <div className="mt-5 pt-4 border-t border-slate-800/80 flex items-center justify-between">
                  {/* Fan Switch */}
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleToggleFan(device, fanActive)}
                      className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors cursor-pointer focus:outline-none border border-slate-600/50 ${
                        fanActive ? 'bg-amber-500' : 'bg-slate-700'
                      }`}
                      title={fanActive ? 'Bấm để Tắt quạt' : 'Bấm để Bật quạt'}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
                          fanActive ? 'translate-x-8' : 'translate-x-1'
                        }`}
                      />
                    </button>

                    <div className="text-xs">
                      <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                        <Fan className={`w-3.5 h-3.5 ${fanActive ? 'text-amber-400 animate-spin' : 'text-slate-500'}`} />
                        <span>Quạt thông gió:</span>
                        <span className={fanActive ? 'text-amber-300 font-bold' : 'text-slate-400'}>
                          {fanActive ? 'BẬT (ON)' : 'TẮT (OFF)'}
                        </span>
                      </div>

                      {/* Hiển thị hiệu ứng chờ Pending ACK... (Mục 5.1 & Bước 5) */}
                      {pending && (
                        <div className="text-[11px] text-amber-400 animate-pulse flex items-center gap-1 mt-0.5 font-medium">
                          <Clock className="w-3 h-3 animate-spin" />
                          <span>Chờ phản hồi Pending ACK... &rarr; Active</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* View Details */}
                  <button
                    onClick={() => navigate(`/devices/${device.id}`)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-3 py-2 rounded-xl transition-colors border border-amber-500/20"
                  >
                    <span>Chi tiết &amp; Biểu đồ</span>
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
