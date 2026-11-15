import React from 'react';
import { useAuth } from '../context/AuthContext';
import { getRoleDisplayName } from '../types';
import { LogOut, Cpu, User, Shield, Warehouse } from 'lucide-react';

interface NavbarProps {
  onToggleSimulator: () => void;
  isSimulatorOpen: boolean;
  showSimulator: boolean;
  isRealDeviceMode: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  onToggleSimulator,
  isSimulatorOpen,
  showSimulator,
  isRealDeviceMode,
}) => {
  const { user, logout, quickLogin } = useAuth();

  const getRoleBadge = (role?: string) => {
    switch (role) {
      case 'ADMIN':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
      case 'OPERATOR':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
      case 'VIEWER':
      default:
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    }
  };

  return (
    <header className="h-16 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-6 flex items-center justify-between sticky top-0 z-30">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-xl shadow-inner">
          🌾
        </div>
        <div>
          <div className="text-base font-bold text-slate-100 flex items-center gap-2">
            Smart Grain Storage IoT
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase tracking-wider">
              TCVN 8370
            </span>
          </div>
          <div className="text-xs text-slate-400">Hệ thống Giám sát & Bảo quản Vi khí hậu Kho Ngũ cốc</div>
        </div>
      </div>

      {/* Center / Right controls */}
      <div className="flex items-center gap-4">
        {/* Quick Role Switch Buttons for Easy Demo */}
        <div className="hidden lg:flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
          <span className="text-slate-400 px-2 py-1 font-medium">Đổi vai trò:</span>
          <button
            onClick={() => quickLogin('ADMIN')}
            title="Chủ kho / Quản trị toàn hệ thống (ADMIN)"
            className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
              user?.role === 'ADMIN'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Chủ kho (Admin)
          </button>
          <button
            onClick={() => quickLogin('OPERATOR')}
            title="Nhân viên kỹ thuật & vận hành kho (OPERATOR)"
            className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
              user?.role === 'OPERATOR'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Vận hành
          </button>
          <button
            onClick={() => quickLogin('VIEWER')}
            title="Bộ phận kiểm định chất lượng / Chỉ xem (VIEWER)"
            className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
              user?.role === 'VIEWER'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Giám sát QC
          </button>
        </div>

        {/* Simulator Drawer Trigger Button (ẩn khi dùng thiết bị thực / không chạy simulator) */}
        {showSimulator ? (
          <button
            onClick={onToggleSimulator}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
              isSimulatorOpen
                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/20'
                : 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20 hover:border-amber-500/50'
            }`}
          >
            <Cpu className="w-4 h-4 animate-pulse" />
            <span>Hardware Simulator</span>
          </button>
        ) : (
          isRealDeviceMode && (
            <div
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30"
              title="Đang nhận dữ liệu trực tiếp từ phần cứng ESP32 qua MQTT"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Thiết bị thực (Live)</span>
            </div>
          )
        )}

        {/* User Profile */}
        <div className="flex items-center gap-3 pl-2 border-l border-slate-800">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-semibold text-slate-200">{user?.full_name}</div>
            <div className="flex items-center justify-end gap-1.5 mt-0.5">
              <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${getRoleBadge(user?.role)}`}>
                {getRoleDisplayName(user?.role)}
              </span>
            </div>
          </div>

          <button
            onClick={logout}
            title="Đăng xuất"
            className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
