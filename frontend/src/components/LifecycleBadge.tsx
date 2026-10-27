import React from 'react';
import { LifecycleState } from '../types';

export const LifecycleBadge: React.FC<{ state: LifecycleState | string }> = ({ state }) => {
  const getBadgeStyle = () => {
    switch (state) {
      case 'ACTIVE':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'OFFLINE':
        return 'bg-slate-700/50 text-slate-400 border-slate-600/40';
      case 'PROVISIONED':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'REGISTERED':
        return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
      case 'MAINTENANCE':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'FAULT':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
      case 'SUSPENDED':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      case 'DECOMMISSIONED':
        return 'bg-red-950/40 text-red-400 border-red-800/40';
      default:
        return 'bg-slate-700/30 text-slate-300 border-slate-600/30';
    }
  };

  return (
    <span
      className={`inline-block px-2.5 py-0.5 rounded text-[11px] font-medium border tracking-wide uppercase ${getBadgeStyle()}`}
    >
      {state}
    </span>
  );
};
