import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { AuditLog } from '../types';
import {
  ShieldCheck,
  Search,
  RefreshCw,
  Code,
  LayoutList,
  Table,
} from 'lucide-react';

export const AuditLogsPage: React.FC = () => {
  const { showToast } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [viewMode, setViewMode] = useState<'CARD' | 'TABLE'>('CARD');

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const res = await api.getAuditLogs();
      if (res.success && res.data) {
        setLogs(res.data);
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi tải nhật ký hệ thống (Chỉ Chủ kho mới có quyền)', 'error');
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
        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
          {action}
        </span>
      );
    }
    if (action.includes('LOGIN') || action.includes('ONBOARD') || action.includes('PROVISION')) {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          {action}
        </span>
      );
    }
    if (action.includes('COMMAND') || action.includes('CONTROL') || action.includes('UPDATE')) {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
          {action}
        </span>
      );
    }
    return (
      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-purple-600" />
            <span>Nhật ký hệ thống</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Theo dõi lịch sử thao tác người dùng và bảo mật
          </p>
        </div>

        <button
          onClick={fetchLogs}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold border border-slate-200 shadow-sm transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Làm mới</span>
        </button>
      </div>

      {/* Filter and Search */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 shadow-sm">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo người thực hiện hoặc hành động..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-purple-500 transition"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-purple-500"
          >
            <option value="ALL">Tất cả ({logs.length})</option>
            <option value="LOGIN_SUCCESS">Đăng nhập</option>
            <option value="SECURITY_VIOLATION_403">Từ chối quyền (403)</option>
            <option value="COMMAND_ISSUED">Gửi lệnh điều khiển</option>
            <option value="DEVICE_ONBOARDED">Thêm thiết bị</option>
            <option value="ALERT_ACKNOWLEDGED">Xác nhận cảnh báo</option>
            <option value="ALERT_RESOLVED">Hoàn tất cảnh báo</option>
          </select>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode('CARD')}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                viewMode === 'CARD'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span>Thẻ</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('TABLE')}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                viewMode === 'TABLE'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Table className="w-3.5 h-3.5" />
              <span>Bảng</span>
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'CARD' ? (
        <div className="space-y-3">
          {filteredLogs.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400">
              Không tìm thấy nhật ký nào.
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div
                key={log.id}
                className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm transition space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-slate-500 text-xs">
                      {new Date(log.created_at).toLocaleString('vi-VN', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {getActionBadge(log.action)}
                  </div>

                  {log.details_json && (
                    <button
                      onClick={() => setSelectedLog(log)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 text-purple-700 text-xs font-semibold border border-slate-200 transition"
                    >
                      <Code className="w-3.5 h-3.5" />
                      <span>Chi tiết</span>
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-slate-600">
                  <div>
                    <span className="text-slate-400">Người thực hiện: </span>
                    <span className="font-semibold text-slate-800">
                      {log.actor ? log.actor.full_name : 'Hệ thống'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Đối tượng: </span>
                    <span className="font-medium text-slate-800">{log.target_type}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 uppercase font-semibold tracking-wider">
                  <th className="py-3.5 px-4">Thời gian</th>
                  <th className="py-3.5 px-4">Người thực hiện</th>
                  <th className="py-3.5 px-4">Hành vi</th>
                  <th className="py-3.5 px-4">Đối tượng</th>
                  <th className="py-3.5 px-4 text-right">Chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      Không tìm thấy nhật ký nào.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString('vi-VN', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-800">
                        {log.actor ? log.actor.full_name : 'Hệ thống'}
                      </td>
                      <td className="py-3.5 px-4">{getActionBadge(log.action)}</td>
                      <td className="py-3.5 px-4 text-slate-600">{log.target_type}</td>
                      <td className="py-3.5 px-4 text-right">
                        {log.details_json ? (
                          <button
                            onClick={() => setSelectedLog(log)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold"
                          >
                            <Code className="w-3 h-3" />
                            <span>Xem</span>
                          </button>
                        ) : (
                          <span className="text-slate-400">--</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Code className="w-5 h-5 text-purple-600" />
                <h2 className="text-sm font-bold text-slate-900">Chi tiết: {selectedLog.action}</h2>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-slate-400 hover:text-slate-700 text-sm"
              >
                ✕
              </button>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 font-mono text-xs text-slate-800 overflow-x-auto max-h-96">
              <pre>{JSON.stringify(selectedLog.details_json, null, 2)}</pre>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-200">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs"
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
