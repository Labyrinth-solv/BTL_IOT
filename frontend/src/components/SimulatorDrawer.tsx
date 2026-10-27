import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import {
  Cpu,
  X,
  Play,
  RotateCcw,
  Zap,
  Flame,
  CloudRain,
  WifiOff,
  ShieldAlert,
  Activity,
  CheckCircle2,
} from 'lucide-react';

interface SimulatorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SimulatorDrawer: React.FC<SimulatorDrawerProps> = ({ isOpen, onClose }) => {
  const { showToast } = useAuth();
  const { latestTelemetry, deviceStatus } = useSocket();
  const [activeScenario, setActiveScenario] = useState<string>('NORMAL');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('Bộ giả lập đang chạy chế độ: NORMAL (An toàn)');

  // Tra cứu dữ liệu thời gian thực của DEV_SILO_01
  const dev01Data = latestTelemetry['DEV_SILO_01'];
  const dev01Status = deviceStatus['DEV_SILO_01'];

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await api.getSimulatorStatus();
        if (res.currentScenario) {
          setActiveScenario(res.currentScenario);
        }
      } catch (e) {}
    };

    if (isOpen) {
      fetchStatus();
    }
  }, [isOpen]);

  const handleSelectScenario = async (scenario: string, name: string) => {
    setIsLoading(true);
    try {
      const res = await api.setSimulatorScenario(scenario);
      if (res.success) {
        setActiveScenario(scenario);
        setStatusMessage(`Đã kích hoạt: ${name}`);
        showToast(`Đã kích hoạt kịch bản: ${name}`, 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi kích hoạt kịch bản', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReconnect = async () => {
    setIsLoading(true);
    try {
      const res = await api.reconnectSimulator();
      if (res.success) {
        setActiveScenario('NORMAL');
        setStatusMessage('Đã kết nối lại MQTT Broker thành công');
        showToast('Đã kết nối lại thiết bị vào MQTT Broker!', 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi kết nối lại', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col">
          {/* Header */}
          <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <Cpu className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h3 className="font-bold text-slate-100 flex items-center gap-2">
                  Hardware Simulator Drawer
                </h3>
                <p className="text-xs text-slate-400">Điều khiển giả lập vi điều khiển ESP32</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Device Realtime Status Preview */}
          <div className="p-4 bg-slate-950/40 border-b border-slate-800/80">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-slate-400 font-medium">Thiết bị mẫu: DEV_SILO_01</span>
              <span
                className={`inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded text-[10px] ${
                  dev01Status?.state === 'OFFLINE'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    dev01Status?.state === 'OFFLINE' ? 'bg-rose-400' : 'bg-emerald-400 animate-ping'
                  }`}
                />
                {dev01Status?.state || 'ONLINE'}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              <div className="bg-slate-800/60 p-2 rounded-lg border border-slate-700/50">
                <div className="text-[10px] text-slate-400">Nhiệt độ</div>
                <div className="font-bold text-amber-300 mt-0.5">
                  {dev01Data ? `${dev01Data.temperature}°C` : '23.5°C'}
                </div>
              </div>
              <div className="bg-slate-800/60 p-2 rounded-lg border border-slate-700/50">
                <div className="text-[10px] text-slate-400">Độ ẩm RH</div>
                <div className="font-bold text-blue-300 mt-0.5">
                  {dev01Data ? `${dev01Data.humidity_air}%` : '60.2%'}
                </div>
              </div>
              <div className="bg-slate-800/60 p-2 rounded-lg border border-slate-700/50">
                <div className="text-[10px] text-slate-400">Khí Gas</div>
                <div className="font-bold text-purple-300 mt-0.5">
                  {dev01Data ? `${dev01Data.gas_ppm}` : '405'} ppm
                </div>
              </div>
              <div className="bg-slate-800/60 p-2 rounded-lg border border-slate-700/50">
                <div className="text-[10px] text-slate-400">Quạt gió</div>
                <div
                  className={`font-bold mt-0.5 ${
                    dev01Data?.fan_state === 'ON' ? 'text-emerald-400' : 'text-slate-400'
                  }`}
                >
                  {dev01Data?.fan_state || 'OFF'}
                </div>
              </div>
            </div>
          </div>

          {/* Scenarios List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-amber-400" />
              Chọn kịch bản demo (Mục 5.2):
            </div>

            {/* Scenario 1 */}
            <button
              disabled={isLoading}
              onClick={() => handleSelectScenario('NORMAL', 'Kịch bản 1: Kho An toàn')}
              className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                activeScenario === 'NORMAL'
                  ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-200 ring-1 ring-emerald-500/40 shadow-lg shadow-emerald-950/30'
                  : 'bg-slate-800/40 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:border-slate-600'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                  </span>
                  1. Kho An Toàn (Normal Safe)
                </span>
                {activeScenario === 'NORMAL' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/30 text-emerald-300">
                    ĐANG CHẠY
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                T: 22-24°C, RH: 58-62%, Gas: 400 ppm, EMC: 12.5%. Quạt tắt, mức rủi ro SAFE.
              </p>
            </button>

            {/* Scenario 2 */}
            <button
              disabled={isLoading}
              onClick={() =>
                handleSelectScenario('HUMIDITY_SPIKE', 'Kịch bản 2: Nồm ẩm đột ngột >72% RH')
              }
              className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                activeScenario === 'HUMIDITY_SPIKE'
                  ? 'bg-blue-950/40 border-blue-500/60 text-blue-200 ring-1 ring-blue-500/40 shadow-lg shadow-blue-950/30'
                  : 'bg-slate-800/40 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:border-slate-600'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400">
                    <CloudRain className="w-4 h-4" />
                  </span>
                  2. Nồm Ẩm Đột Ngột (RH &gt; 72%)
                </span>
                {activeScenario === 'HUMIDITY_SPIKE' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/30 text-blue-300">
                    ĐANG CHẠY
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                RH vọt lên &gt;74%, EMC &gt;14.8%. Rule Engine tự động phát lệnh bật quạt thông gió & nhận ACK sau 300ms.
              </p>
            </button>

            {/* Scenario 3 */}
            <button
              disabled={isLoading}
              onClick={() =>
                handleSelectScenario('FERMENTATION_SPIKE', 'Kịch bản 3: Hạt lên men sinh nhiệt & khí')
              }
              className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                activeScenario === 'FERMENTATION_SPIKE'
                  ? 'bg-rose-950/40 border-rose-500/60 text-rose-200 ring-1 ring-rose-500/40 shadow-lg shadow-rose-950/30'
                  : 'bg-slate-800/40 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:border-slate-600'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-rose-500/20 text-rose-400">
                    <Flame className="w-4 h-4" />
                  </span>
                  3. Hạt Lên Men Sinh Khí (&gt;850 ppm)
                </span>
                {activeScenario === 'FERMENTATION_SPIKE' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/30 text-rose-300">
                    ĐANG CHẠY
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                T: 32°C, Gas: 880 ppm (vượt ngưỡng 700). Kích hoạt còi Buzzer, quạt MAX và gửi cảnh báo Telegram.
              </p>
            </button>

            {/* Scenario 4 */}
            <button
              disabled={isLoading}
              onClick={() =>
                handleSelectScenario('DISCONNECT_LWT', 'Kịch bản 4: Đứt kết nối đột ngột (LWT)')
              }
              className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                activeScenario === 'DISCONNECT_LWT'
                  ? 'bg-amber-950/40 border-amber-500/60 text-amber-200 ring-1 ring-amber-500/40 shadow-lg shadow-amber-950/30'
                  : 'bg-slate-800/40 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:border-slate-600'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
                    <WifiOff className="w-4 h-4" />
                  </span>
                  4. Đứt Mạng Đột Ngột (LWT Offline)
                </span>
                {activeScenario === 'DISCONNECT_LWT' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/30 text-amber-300">
                    ĐANG CHẠY
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                Hủy socket ngột ngạt không gửi DISCONNECT. Broker phát LWT chuyển thiết bị sang OFFLINE màu đỏ tức thì.
              </p>
            </button>

            {/* Scenario 5 */}
            <button
              disabled={isLoading}
              onClick={() =>
                handleSelectScenario(
                  'REVOKED_DEVICE_ATTACK',
                  'Kịch bản 5: Tấn công bằng thiết bị bị khóa'
                )
              }
              className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                activeScenario === 'REVOKED_DEVICE_ATTACK'
                  ? 'bg-purple-950/40 border-purple-500/60 text-purple-200 ring-1 ring-purple-500/40 shadow-lg shadow-purple-950/30'
                  : 'bg-slate-800/40 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:border-slate-600'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-purple-500/20 text-purple-400">
                    <ShieldAlert className="w-4 h-4" />
                  </span>
                  5. Tấn Công Thiết Bị Đã Bị Khóa
                </span>
                {activeScenario === 'REVOKED_DEVICE_ATTACK' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-500/30 text-purple-300">
                    ĐANG CHẠY
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                Gửi telemetry từ thiết bị bị khóa (SUSPENDED). Backend chặn đứng và ghi nhật ký kiểm toán vào Audit Log.
              </p>
            </button>
          </div>

          {/* Footer Controls */}
          <div className="p-4 border-t border-slate-800 bg-slate-950/60 space-y-3">
            <div className="text-[11px] text-slate-400 bg-slate-900 p-2.5 rounded-lg border border-slate-800 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{statusMessage}</span>
            </div>

            <button
              disabled={isLoading}
              onClick={handleReconnect}
              className="w-full py-2.5 px-4 rounded-xl font-medium text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center justify-center gap-2 transition-colors"
            >
              <RotateCcw className="w-4 h-4 text-emerald-400" />
              Tái kết nối MQTT (Sau khi test Kịch bản 4)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
