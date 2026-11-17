import React, { useState } from 'react';
import { Activity, Cpu, Plus, Settings, SlidersHorizontal, Trash2, type LucideIcon } from 'lucide-react';

type Tone = 'neutral' | 'success' | 'warning' | 'danger';

export interface PeripheralItem {
  id: string;
  name: string;
  pin: string;
  icon: LucideIcon;
  status: string;
  tone?: Tone;
  note?: string;
  action?: { label: string; disabled: boolean; onClick: () => void };
  auto?: { checked: boolean; disabled: boolean; onChange: () => void };
  mode?: string;
  autoAction?: () => void;
  onRemove: () => void;
}

interface Props {
  sensors: PeripheralItem[];
  actuators: PeripheralItem[];
  isAdmin: boolean;
  isOnline: boolean;
  busy: boolean;
  onAdd: () => void;
}

const tones: Record<Tone, { row: string; badge: string; icon: string }> = {
  neutral: { row: 'bg-white border-slate-200', badge: 'bg-slate-100 text-slate-500', icon: 'bg-slate-100 text-slate-500' },
  success: { row: 'bg-white border-slate-200', badge: 'bg-emerald-50 text-emerald-700', icon: 'bg-emerald-50 text-emerald-600' },
  warning: { row: 'bg-amber-50 border-amber-300', badge: 'bg-amber-100 text-amber-800', icon: 'bg-amber-100 text-amber-700' },
  danger: { row: 'bg-rose-50 border-rose-300', badge: 'bg-rose-100 text-rose-700', icon: 'bg-rose-100 text-rose-600' },
};

export const PeripheralPanel: React.FC<Props> = ({ sensors, actuators, isAdmin, isOnline, busy, onAdd }) => {
  const [managing, setManaging] = useState(false);
  const groups = [
    { title: 'Cảm biến', icon: Activity, items: sensors, empty: 'Chưa có cảm biến được thêm.' },
    { title: 'Điều khiển', icon: SlidersHorizontal, items: actuators, empty: 'Chưa có thiết bị điều khiển.' },
  ];

  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-emerald-600" /> Ngoại vi của thiết bị
          </h2>
          <p className="text-xs text-slate-500 mt-1">{sensors.length} cảm biến · {actuators.length} thiết bị điều khiển</p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <button type="button" aria-pressed={managing} disabled={busy}
              onClick={() => setManaging(value => !value)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition disabled:opacity-50 ${managing ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              <Settings className="w-3.5 h-3.5" />{managing ? 'Xong' : 'Quản lý'}
            </button>
            <button type="button" onClick={onAdd} disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-50">
              <Plus className="w-3.5 h-3.5" />Thêm ngoại vi
            </button>
          </div>
        )}
      </div>

      {managing && isAdmin && (
        <p className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          {isOnline ? 'Gỡ ngoại vi bằng nút bên cạnh từng thiết bị. Dùng “Thêm ngoại vi” để thêm mới hoặc thêm lại.' : 'Kết nối lại thiết bị để thêm hoặc gỡ ngoại vi.'}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {groups.map(group => {
          const GroupIcon = group.icon;
          return (
            <div key={group.title} className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-2.5">
                <GroupIcon className="w-3.5 h-3.5" /><h3>{group.title}</h3>
                <span className="ml-auto bg-slate-100 rounded-md px-1.5 py-0.5 text-[10px]">{group.items.length}</span>
              </div>
              <div className="space-y-2.5">
                {group.items.length === 0 && <div className="border border-dashed border-slate-200 rounded-xl p-5 text-xs text-slate-400">{group.empty}</div>}
                {group.items.map(item => {
                  const style = tones[isOnline ? item.tone || 'neutral' : 'neutral'];
                  const Icon = item.icon;
                  return (
                    <div key={item.id} className={`rounded-xl border p-3 sm:p-3.5 transition-colors ${style.row}`}>
                      <div className="flex items-start gap-2.5">
                        <div className={`w-9 h-9 shrink-0 flex items-center justify-center rounded-xl ${style.icon}`}><Icon className="w-4 h-4" /></div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                            <h4 className="text-sm font-semibold text-slate-800 break-words min-w-0">{item.name}</h4>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${style.badge}`}>{item.status}</span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1 break-words">{item.pin}</p>
                          {item.note && <p className={`text-[11px] mt-1.5 break-words ${item.tone === 'danger' ? 'text-rose-700' : item.tone === 'warning' ? 'text-amber-800' : 'text-slate-500'}`}>{item.note}</p>}
                        </div>
                      </div>
                      {(item.action || item.auto || item.mode || (managing && isAdmin)) && (
                        <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-2.5 border-t border-slate-200/70">
                          {item.auto ? (
                            <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                              <input type="checkbox" aria-label={`Tự động ${item.name}`} checked={item.auto.checked}
                                disabled={busy || !isOnline || item.auto.disabled} onChange={item.auto.onChange}
                                className="w-3.5 h-3.5 accent-emerald-600 disabled:opacity-50" />Tự động
                            </label>
                          ) : item.mode ? <span className="text-[11px] text-slate-500">{item.mode}</span> : <span />}
                          <div className="flex items-center gap-2 ml-auto">
                            {item.autoAction && <button type="button" disabled={busy || !isOnline} onClick={item.autoAction} className="text-[11px] font-semibold text-emerald-700 disabled:opacity-40">Bật tự động</button>}
                            {item.action && <button type="button" aria-label={`${item.action.label} ${item.name}`} disabled={busy || !isOnline || item.action.disabled} onClick={item.action.onClick}
                              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-100 transition disabled:opacity-40 disabled:cursor-not-allowed">{busy ? 'Đang chờ…' : item.action.label}</button>}
                            {managing && isAdmin && <button type="button" aria-label={`Gỡ ${item.name}`} disabled={busy || !isOnline} onClick={item.onRemove}
                              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-40"><Trash2 className="w-3.5 h-3.5" />Gỡ</button>}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
