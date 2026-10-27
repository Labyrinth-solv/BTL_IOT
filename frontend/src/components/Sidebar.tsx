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
  FileText,
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const { isAdmin } = useAuth();

  const navItems = [
    { to: '/', label: 'Dashboard Tổng quan', icon: LayoutDashboard },
    { to: '/devices', label: 'Quản lý Thiết bị', icon: Cpu },
    { to: '/alerts', label: 'Trung tâm Cảnh báo', icon: BellRing },
    { to: '/zones', label: 'Khu vực Kho Silo', icon: Warehouse },
  ];

  const adminNavItems = [
    { to: '/users', label: 'Quản lý Người dùng', icon: Users },
    { to: '/audit-logs', label: 'Nhật ký Audit Logs', icon: ShieldCheck },
  ];

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
      <div className="p-4 flex-1 space-y-6">
        <div>
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-3 mb-2">
            Giám Sát & Vận Hành
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-amber-500/10 text-amber-300 font-semibold border border-amber-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`
                }
              >
                <item.icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        <div>
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-3 mb-2 flex items-center gap-1.5">
            <span>Quản Trị Hệ Thống</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
              QUẢN TRỊ
            </span>
          </div>
          <nav className="space-y-1">
            {adminNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-purple-500/10 text-purple-300 font-semibold border border-purple-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`
                }
              >
                <item.icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </div>

      {/* Footer Info */}
      <div className="p-4 border-t border-slate-800/80 bg-slate-950/40 text-xs text-slate-500">
        <div className="font-semibold text-slate-400">Quy chuẩn TCVN 8370:2018</div>
        <div className="mt-0.5 text-[11px]">Độ ẩm thóc max: 14.0% - 14.5%</div>
        <div className="text-[11px]">Không khí max: 65% RH</div>
      </div>
    </aside>
  );
};
