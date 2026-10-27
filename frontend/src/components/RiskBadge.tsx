import React from 'react';
import { RiskLevel } from '../types';
import { ShieldCheck, AlertTriangle, AlertOctagon } from 'lucide-react';

export const RiskBadge: React.FC<{ risk: RiskLevel | string }> = ({ risk }) => {
  if (risk === 'HIGH_RISK') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-alert-pulse">
        <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
        HIGH RISK (Nguy hiểm)
      </span>
    );
  }

  if (risk === 'WARNING') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
        WARNING (Cảnh báo)
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
      SAFE (An toàn)
    </span>
  );
};
