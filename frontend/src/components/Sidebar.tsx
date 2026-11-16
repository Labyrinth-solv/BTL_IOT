import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  Cpu,
  BellRing,
  Warehouse,
  Users,
  ShieldCheck,
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const { isAdmin } = useAuth();

  const navItems = [
    { to: '/', label: 'Tổng quan', icon: LayoutDashboard },
    { to: '/devices', label: 'Thiết bị & Mạch', icon: Cpu },
    { to: '/alerts', label: 'Cảnh báo', icon: BellRing },
    { to: '/zones', label: 'Khu vực kho', icon: Warehouse },
  ];

  const adminNavItems = [
    { to: '/users', label: 'Người dùng', icon: Users },
    { to: '/audit-logs', label: 'Nhật ký hệ thống', icon: ShieldCheck },
  ];

  return (
    <aside className="w-60 bg-white border-r border-slate-200 flex flex-col shrink-0">
      <div className="p-4 flex-1 space-y-6">
        <div>
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-3 mb-2">
            Giám sát kho
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`
                }
              >
                <item.icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        {isAdmin && (
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-3 mb-2">
              Quản trị
            </div>
            <nav className="space-y-1">
              {adminNavItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-purple-50 text-purple-800 font-semibold border border-purple-200'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`
                  }
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="p-4 border-t border-slate-200 bg-slate-50 text-xs text-slate-500">
        <div className="font-semibold text-slate-700">Ngưỡng bảo quản mục tiêu</div>
        <div className="mt-1 text-[11px]">Ẩm hạt an toàn: &le; 14.0%</div>
        <div className="text-[11px]">Ẩm không khí: &le; 65%</div>
      </div>
    </aside>
  );
};
