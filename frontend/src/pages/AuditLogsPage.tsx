import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { AuditLog } from '../types';
import {
  ShieldCheck,
  ShieldAlert,
  Search,
  RefreshCw,
  Clock,
  User,
  Activity,
  Code,
  Info,
} from 'lucide-react';

export const AuditLogsPage: React.FC = () => {
  const { isAdmin, showToast } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const res = await api.getAuditLogs();
      if (res.success && res.data) {
        setLogs(res.data);
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi tải nhật ký Audit Logs (Chỉ Admin mới có quyền)', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const getActionBadge = (action: string) => {
    if (action.includes('SECURITY') || action.includes('403') || action.includes('VIOLATION') || action.includes('SUSPEND') || action.includes('DECOMMISSION')) {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
          {action}
        </span>
      );
    }
    if (action.includes('LOGIN') || action.includes('ONBOARD') || action.includes('PROVISION')) {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
          {action}
        </span>
      );
    }
    if (action.includes('COMMAND') || action.includes('CONTROL') || action.includes('UPDATE')) {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40">
          {action}
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
        {action}
      </span>
    );
  };

  const filteredLogs = logs.filter((log) => {
    const actorName = log.actor?.full_name || '';
    const actorEmail = log.actor?.email || '';
    const actionText = log.action || '';
    const targetText = `${log.target_type} ${log.target_id}`;

    const matchesSearch =
      actorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      actorEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      actionText.toLowerCase().includes(searchTerm.toLowerCase()) ||
      targetText.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesAction = actionFilter === 'ALL' || log.action === actionFilter;

    return matchesSearch && matchesAction;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-purple-400" />
            <span>Nhật ký Kiểm toán Hệ thống (Audit Logs)</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Ghi vết bất biến mọi hành vi can thiệp điều khiển, phân quyền, đăng nhập & vi phạm bảo mật 403
          </p>
        </div>

        <button
          onClick={fetchLogs}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Làm mới</span>
        </button>
      </div>

      {/* Filter and Search */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo người thực hiện, hành động hoặc mã đối tượng..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 whitespace-nowrap">Lọc hành động:</span>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
          >
            <option value="ALL">Tất cả hành động ({logs.length})</option>
            <option value="LOGIN_SUCCESS">LOGIN_SUCCESS</option>
            <option value="SECURITY_VIOLATION_403">SECURITY_VIOLATION_403</option>
            <option value="COMMAND_ISSUED">COMMAND_ISSUED</option>
            <option value="DEVICE_ONBOARDED">DEVICE_ONBOARDED</option>
            <option value="DEVICE_SUSPENDED">DEVICE_SUSPENDED</option>
            <option value="ALERT_ACKNOWLEDGED">ALERT_ACKNOWLEDGED</option>
            <option value="ALERT_RESOLVED">ALERT_RESOLVED</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase font-semibold tracking-wider">
                <th className="py-3.5 px-4">Thời gian</th>
                <th className="py-3.5 px-4">Người thực hiện (Actor)</th>
                <th className="py-3.5 px-4">Hành vi (Action)</th>
                <th className="py-3.5 px-4">Đối tượng tác động (Target)</th>
                <th className="py-3.5 px-4">Địa chỉ IP</th>
                <th className="py-3.5 px-4">Chi tiết JSON</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-200">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Không tìm thấy nhật ký kiểm toán nào.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString('vi-VN', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                    <td className="py-3.5 px-4">
                      {log.actor ? (
                        <div>
                          <div className="font-semibold text-slate-200">{log.actor.full_name}</div>
                          <div className="text-[11px] text-slate-400">
                            {log.actor.email}{' '}
                            <span className="text-[9px] px-1 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                              {log.actor.role}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-500 italic">SYSTEM / UNKNOWN</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">{getActionBadge(log.action)}</td>
                    <td className="py-3.5 px-4 font-mono text-slate-300">
                      <span className="text-slate-500 font-normal">[{log.target_type}]</span>{' '}
                      {log.target_id}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">
                      {log.ip_address || '127.0.0.1'}
                    </td>
                    <td className="py-3.5 px-4">
                      {log.details_json ? (
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] border border-slate-700 transition"
                        >
                          <Code className="w-3 h-3 text-amber-400" />
                          <span>Xem Payload</span>
                        </button>
                      ) : (
                        <span className="text-slate-600 italic text-[11px]">Trống</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* JSON Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Code className="w-5 h-5 text-purple-400" />
                <h2 className="text-sm font-bold text-slate-100">
                  Chi tiết Payload Audit: {selectedLog.action}
                </h2>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-slate-400 hover:text-slate-200 text-sm"
              >
                ✕
              </button>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs text-amber-300 overflow-x-auto max-h-96">
              <pre>{JSON.stringify(selectedLog.details_json, null, 2)}</pre>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
