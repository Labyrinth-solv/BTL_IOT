import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import {
  Cpu,
  X,
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
  const [statusMessage, setStatusMessage] = useState<string>('Đang chạy chế độ an toàn');

  const activeDeviceCode =
    latestTelemetry['DEV_SILO_01']
      ? 'DEV_SILO_01'
      : Object.keys(latestTelemetry)[0] || Object.keys(deviceStatus)[0] || 'DEV_SILO_01';
  const dev01Data = latestTelemetry[activeDeviceCode];
  const dev01Status = deviceStatus[activeDeviceCode];

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await api.getSimulatorStatus();
        if (res.currentScenario) {
          setActiveScenario(res.currentScenario);
        }
      } catch {}
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
        setStatusMessage(`Đang chạy: ${name}`);
        showToast(`Đã chọn kịch bản: ${name}`, 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi kích hoạt kịch bản', 'error');
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
        setStatusMessage('Đã kết nối lại bộ giả lập');
        showToast('Đã kết nối lại thiết bị giả lập!', 'success');
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
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white border-l border-slate-200 shadow-2xl flex flex-col">
          <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-600">
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">Bộ giả lập phần cứng</h3>
                <p className="text-xs text-slate-500">Chọn kịch bản mô phỏng để kiểm thử</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 bg-slate-50/70 border-b border-slate-200">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-slate-600 font-medium">Node: {activeDeviceCode}</span>
              <span
                className={`inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded-full text-[10px] border ${
                  dev01Status?.state === 'OFFLINE'
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}
              >
                {dev01Status?.state === 'OFFLINE' ? 'Ngoại tuyến' : 'Trực tuyến'}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              <div className="bg-white p-2 rounded-lg border border-slate-200">
                <div className="text-[10px] text-slate-500">Nhiệt độ</div>
                <div className="font-bold text-slate-900 mt-0.5">
                  {dev01Data ? `${dev01Data.temperature}°C` : '--'}
                </div>
              </div>
              <div className="bg-white p-2 rounded-lg border border-slate-200">
                <div className="text-[10px] text-slate-500">Độ ẩm</div>
                <div className="font-bold text-slate-900 mt-0.5">
                  {dev01Data ? `${dev01Data.humidity_air}%` : '--'}
                </div>
              </div>
              <div className="bg-white p-2 rounded-lg border border-slate-200">
                <div className="text-[10px] text-slate-500">Khí Gas</div>
                <div className="font-bold text-slate-900 mt-0.5">
                  {dev01Data ? `${dev01Data.gas_ppm}` : '--'}
                </div>
              </div>
              <div className="bg-white p-2 rounded-lg border border-slate-200">
                <div className="text-[10px] text-slate-500">Quạt</div>
                <div
                  className={`font-bold mt-0.5 ${
                    dev01Data?.fan_state === 'ON' ? 'text-amber-600' : 'text-slate-500'
                  }`}
                >
                  {dev01Data?.fan_state === 'ON' ? 'Bật' : 'Tắt'}
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-amber-600" />
              Kịch bản kiểm thử:
            </div>

            <button
              disabled={isLoading}
              onClick={() => handleSelectScenario('NORMAL', 'Kho an toàn')}
              className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                activeScenario === 'NORMAL'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  1. Kho an toàn
                </span>
                {activeScenario === 'NORMAL' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white">
                    Đang chạy
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Nhiệt độ và độ ẩm nằm trong ngưỡng an toàn.
              </p>
            </button>

            <button
              disabled={isLoading}
              onClick={() => handleSelectScenario('HUMIDITY_SPIKE', 'Nồm ẩm tăng cao')}
              className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                activeScenario === 'HUMIDITY_SPIKE'
                  ? 'bg-sky-50 border-sky-300 text-sky-900'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm flex items-center gap-2">
                  <CloudRain className="w-4 h-4 text-sky-600" />
                  2. Độ ẩm tăng cao (&gt; 72%)
                </span>
                {activeScenario === 'HUMIDITY_SPIKE' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-600 text-white">
                    Đang chạy
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Mô phỏng độ ẩm tăng vượt ngưỡng để bật quạt thông gió.
              </p>
            </button>

            <button
              disabled={isLoading}
              onClick={() => handleSelectScenario('FERMENTATION_SPIKE', 'Hạt lên men sinh khí')}
              className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                activeScenario === 'FERMENTATION_SPIKE'
                  ? 'bg-rose-50 border-rose-300 text-rose-900'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm flex items-center gap-2">
                  <Flame className="w-4 h-4 text-rose-600" />
                  3. Hạt lên men sinh khí
                </span>
                {activeScenario === 'FERMENTATION_SPIKE' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-600 text-white">
                    Đang chạy
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Nhiệt độ và khí gas tăng cao, bật quạt và còi cảnh báo.
              </p>
            </button>

            <button
              disabled={isLoading}
              onClick={() => handleSelectScenario('DISCONNECT_LWT', 'Mất kết nối đột ngột')}
              className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                activeScenario === 'DISCONNECT_LWT'
                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm flex items-center gap-2">
                  <WifiOff className="w-4 h-4 text-amber-600" />
                  4. Mất kết nối đột ngột
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Ngắt kết nối mô phỏng thiết bị bị mất điện / mất mạng.
              </p>
            </button>

            <button
              disabled={isLoading}
              onClick={() => handleSelectScenario('REVOKED_DEVICE_ATTACK', 'Thiết bị bị đình chỉ')}
              className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                activeScenario === 'REVOKED_DEVICE_ATTACK'
                  ? 'bg-purple-50 border-purple-300 text-purple-900'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-purple-600" />
                  5. Giả lập thiết bị bị khóa gửi tin
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Kiểm tra cơ chế chặn và ghi nhật ký bảo mật.
              </p>
            </button>
          </div>

          <div className="p-4 border-t border-slate-200 bg-slate-50 space-y-3">
            <div className="text-xs text-slate-600 bg-white p-2.5 rounded-lg border border-slate-200 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500 shrink-0" />
              <span>{statusMessage}</span>
            </div>

            <button
              disabled={isLoading}
              onClick={handleReconnect}
              className="w-full py-2.5 px-4 rounded-xl font-semibold text-xs bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center gap-2 transition-colors"
            >
              <RotateCcw className="w-4 h-4 text-emerald-600" />
              Kết nối lại bộ giả lập
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
