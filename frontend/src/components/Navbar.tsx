import React from 'react';
import { useAuth } from '../context/AuthContext';
import { getRoleDisplayName } from '../types';
import { LogOut, Cpu } from 'lucide-react';

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
  const { user, logout } = useAuth();

  const getRoleBadge = (role?: string) => {
    switch (role) {
      case 'ADMIN':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'OPERATOR':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'VIEWER':
      default:
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
  };

  return (
    <header className="h-16 bg-white/95 backdrop-blur-md border-b border-slate-200 px-3 sm:px-6 flex items-center justify-between sticky top-0 z-30 shadow-sm">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-xl">
          🌾
        </div>
        <div>
          <div className="text-base font-bold text-slate-900">
            Smart Grain Storage
          </div>
          <div className="hidden md:block text-xs text-slate-500">Giám sát &amp; bảo quản kho ngũ cốc thông minh</div>
        </div>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-3">
        {showSimulator ? (
          <button
            onClick={onToggleSimulator}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
              isSimulatorOpen
                ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>Bộ giả lập</span>
          </button>
        ) : (
          isRealDeviceMode && (
            <div
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"
              title="Đang nhận dữ liệu trực tiếp từ mạch ESP32"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Đang kết nối mạch thực</span>
            </div>
          )
        )}

        {/* User Profile */}
        <div className="flex items-center gap-3 pl-3 border-l border-slate-200">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-semibold text-slate-800">{user?.full_name}</div>
            <div className="flex items-center justify-end gap-1.5 mt-0.5">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${getRoleBadge(user?.role)}`}>
                {getRoleDisplayName(user?.role)}
              </span>
            </div>
          </div>

          <button
            onClick={logout}
            title="Đăng xuất"
            className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-medium text-slate-600 hover:text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden md:inline">Đăng xuất</span>
          </button>
        </div>
      </div>
    </header>
  );
};
