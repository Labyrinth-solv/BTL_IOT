import React from 'react';
import { LifecycleState } from '../types';

export const LifecycleBadge: React.FC<{ state: LifecycleState | string }> = ({ state }) => {
  const getLabelAndStyle = () => {
    switch (state) {
      case 'ACTIVE':
        return { label: 'Đã kích hoạt', style: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      case 'OFFLINE':
        return { label: 'Ngoại tuyến', style: 'bg-slate-100 text-slate-600 border-slate-200' };
      case 'PROVISIONED':
        return { label: 'Đã cấp phép', style: 'bg-blue-50 text-blue-700 border-blue-200' };
      case 'REGISTERED':
        return { label: 'Mới đăng ký', style: 'bg-cyan-50 text-cyan-700 border-cyan-200' };
      case 'MAINTENANCE':
        return { label: 'Bảo trì', style: 'bg-amber-50 text-amber-700 border-amber-200' };
      case 'FAULT':
        return { label: 'Lỗi phần cứng', style: 'bg-rose-50 text-rose-700 border-rose-200' };
      case 'SUSPENDED':
        return { label: 'Đình chỉ', style: 'bg-purple-50 text-purple-700 border-purple-200' };
      case 'DECOMMISSIONED':
        return { label: 'Đã thu hồi', style: 'bg-red-50 text-red-700 border-red-200' };
      default:
        return { label: state, style: 'bg-slate-100 text-slate-600 border-slate-200' };
    }
  };

  const { label, style } = getLabelAndStyle();

  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold border ${style}`}>
      {label}
    </span>
  );
};
