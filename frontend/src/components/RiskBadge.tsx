import React from 'react';
import { RiskLevel } from '../types';
import { ShieldCheck, AlertTriangle, AlertOctagon } from 'lucide-react';

export const RiskBadge: React.FC<{ risk: RiskLevel | string }> = ({ risk }) => {
  if (risk === 'HIGH_RISK') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 animate-alert-pulse">
        <AlertOctagon className="w-3.5 h-3.5 text-rose-600" />
        Nguy hiểm
      </span>
    );
  }

  if (risk === 'WARNING') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
        Cảnh báo
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
      An toàn
    </span>
  );
};
