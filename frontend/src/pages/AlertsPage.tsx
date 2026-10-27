import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { Alert, AlertStatus, AlertSeverity } from '../types';
import {
  BellRing,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  Clock,
  Filter,
  RefreshCw,
  Search,
  MessageSquare,
  ShieldAlert,
  Flame,
  Droplets,
  Thermometer,
  WifiOff,
} from 'lucide-react';

export const AlertsPage: React.FC = () => {
  const { isViewer, showToast, user } = useAuth();
  const { recentAlerts: liveAlerts } = useSocket();

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Ack Modal
  const [ackModalAlert, setAckModalAlert] = useState<Alert | null>(null);
  const [ackNote, setAckNote] = useState('');
  const [isSubmittingAck, setIsSubmittingAck] = useState(false);

  // Resolve Modal
  const [resolveModalAlert, setResolveModalAlert] = useState<Alert | null>(null);
  const [resolveNote, setResolveNote] = useState('');
  const [isSubmittingResolve, setIsSubmittingResolve] = useState(false);

  const fetchAlerts = async () => {
    setIsLoading(true);
    try {
      const res = await api.getAlerts();
      if (res.success && res.data) {
        setAlerts(res.data);
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi tải danh sách cảnh báo', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  // Khi có alert mới từ WebSocket, refresh danh sách
  useEffect(() => {
    if (liveAlerts.length > 0) {
      fetchAlerts();
    }
  }, [liveAlerts]);

  const handleAcknowledgeSubmit = async () => {
    if (!ackModalAlert) return;
    setIsSubmittingAck(true);
    try {
      const res = await api.acknowledgeAlert(ackModalAlert.id, ackNote);
      if (res.success) {
        showToast(`Đã xác nhận (ACK) cảnh báo: ${ackModalAlert.message}`, 'success');
        setAckModalAlert(null);
        setAckNote('');
        fetchAlerts();
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi xác nhận cảnh báo', 'error');
    } finally {
      setIsSubmittingAck(false);
    }
  };

  const handleResolveSubmit = async () => {
    if (!resolveModalAlert) return;
    setIsSubmittingResolve(true);
    try {
      const res = await api.resolveAlert(resolveModalAlert.id, resolveNote);
      if (res.success) {
        showToast(`Đã hoàn tất xử lý cảnh báo: ${resolveModalAlert.message}`, 'success');
        setResolveModalAlert(null);
        setResolveNote('');
        fetchAlerts();
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi đóng cảnh báo', 'error');
    } finally {
      setIsSubmittingResolve(false);
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'HIGH_HUMIDITY':
        return <Droplets className="w-4 h-4 text-sky-400" />;
      case 'HIGH_TEMP':
        return <Thermometer className="w-4 h-4 text-orange-400" />;
      case 'GAS_SPIKE':
        return <Flame className="w-4 h-4 text-rose-500 animate-pulse" />;
      case 'DEVICE_OFFLINE':
        return <WifiOff className="w-4 h-4 text-slate-400" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-amber-400" />;
    }
  };

  const getSeverityBadge = (sev: AlertSeverity) => {
    if (sev === 'CRITICAL') {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1 w-fit">
          <AlertCircle className="w-3 h-3 text-rose-400" />
          CRITICAL
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 w-fit">
        <AlertTriangle className="w-3 h-3 text-amber-400" />
        WARNING
      </span>
    );
  };

  const getStatusBadge = (status: AlertStatus) => {
    switch (status) {
      case 'NEW':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse">
            NEW
          </span>
        );
      case 'ACKNOWLEDGED':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30">
            ACKNOWLEDGED
          </span>
        );
      case 'RESOLVED':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            RESOLVED
          </span>
        );
      default:
        return null;
    }
  };

  const filteredAlerts = alerts.filter((alert) => {
    const matchesSearch =
      alert.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
      alert.alert_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (alert.device?.device_code &&
        alert.device.device_code.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === 'ALL' || alert.status === statusFilter;
    const matchesSeverity = severityFilter === 'ALL' || alert.severity === severityFilter;

    return matchesSearch && matchesStatus && matchesSeverity;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <BellRing className="w-7 h-7 text-amber-500" />
            <span>Trung tâm Cảnh báo Vi khí hậu Silo</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Xử lý sự cố vi khí hậu theo quy trình SOP (New &rarr; Operator ACK &rarr; Resolved)
          </p>
        </div>

        <button
          onClick={fetchAlerts}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Làm mới</span>
        </button>
      </div>

      {/* Filter Tabs & Search */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
        {/* Status Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
          {['ALL', 'NEW', 'ACKNOWLEDGED', 'RESOLVED'].map((tab) => {
            const count =
              tab === 'ALL'
                ? alerts.length
                : alerts.filter((a) => a.status === tab).length;

            return (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                  statusFilter === tab
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {tab === 'ALL'
                  ? 'Tất cả'
                  : tab === 'NEW'
                  ? 'Chưa xử lý'
                  : tab === 'ACKNOWLEDGED'
                  ? 'Đang xử lý'
                  : 'Đã hoàn tất'}{' '}
                ({count})
              </button>
            );
          })}
        </div>

        {/* Filter controls */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm theo nội dung cảnh báo, thiết bị..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 whitespace-nowrap">Mức độ nghiêm trọng:</span>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
            >
              <option value="ALL">Tất cả mức độ</option>
              <option value="CRITICAL">CRITICAL (Nghiêm trọng)</option>
              <option value="WARNING">WARNING (Cảnh báo)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Alerts Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase font-semibold tracking-wider">
                <th className="py-3.5 px-4">Thời gian</th>
                <th className="py-3.5 px-4">Mức độ</th>
                <th className="py-3.5 px-4">Loại sự cố</th>
                <th className="py-3.5 px-4">Nội dung cảnh báo</th>
                <th className="py-3.5 px-4">Thiết bị & Kho</th>
                <th className="py-3.5 px-4">Trạng thái</th>
                <th className="py-3.5 px-4">Ghi chú ACK</th>
                <th className="py-3.5 px-4 text-right">Thao tác SOP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-200">
              {filteredAlerts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    Không có cảnh báo nào trong danh sách.
                  </td>
                </tr>
              ) : (
                filteredAlerts.map((alert) => {
                  const isNew = alert.status === 'NEW';
                  const isAck = alert.status === 'ACKNOWLEDGED';
                  const isResolved = alert.status === 'RESOLVED';

                  return (
                    <tr
                      key={alert.id}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        isNew ? 'bg-rose-500/5' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                        {new Date(alert.created_at).toLocaleString('vi-VN', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </td>
                      <td className="py-3.5 px-4">{getSeverityBadge(alert.severity)}</td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 font-semibold text-slate-300">
                          {getAlertIcon(alert.alert_type)}
                          <span>{alert.alert_type}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="font-medium text-slate-100">{alert.message}</div>
                        {alert.trigger_value !== undefined && (
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Giá trị đo kích hoạt: <span className="text-amber-400 font-mono font-bold">{alert.trigger_value}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-mono text-amber-400 font-bold">
                          {alert.device?.device_code || alert.device_id}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {alert.zone?.name || 'Kho ngũ cốc'}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">{getStatusBadge(alert.status)}</td>
                      <td className="py-3.5 px-4 max-w-xs text-slate-400 text-[11px]">
                        {alert.ack_by ? (
                          <div>
                            <span className="text-slate-300 font-semibold">
                              {alert.ack_by.full_name}:
                            </span>{' '}
                            <span>{alert.ack_note || 'Đã tiếp nhận'}</span>
                          </div>
                        ) : (
                          <span className="italic text-slate-600">Chưa ghi nhận</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isNew && (
                            <button
                              onClick={() => {
                                setAckModalAlert(alert);
                                setAckNote('Đã tiếp nhận cảnh báo, đang cử nhân viên kiểm tra quạt.');
                              }}
                              className="px-2.5 py-1 rounded-lg bg-sky-500/20 text-sky-300 border border-sky-500/40 hover:bg-sky-500/30 font-semibold text-[11px] transition flex items-center gap-1"
                            >
                              <MessageSquare className="w-3 h-3" />
                              <span>Xác nhận (ACK)</span>
                            </button>
                          )}

                          {(isNew || isAck) && (
                            <button
                              onClick={() => {
                                setResolveModalAlert(alert);
                                setResolveNote('Đã thông gió cưỡng bức, độ ẩm và khí gas trở lại an toàn TCVN 8370.');
                              }}
                              className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 font-semibold text-[11px] transition flex items-center gap-1"
                            >
                              <CheckCircle className="w-3 h-3" />
                              <span>Hoàn tất (Resolve)</span>
                            </button>
                          )}

                          {isResolved && (
                            <span className="text-emerald-400 font-semibold text-[11px] flex items-center justify-end gap-1">
                              <CheckCircle className="w-3.5 h-3.5" />
                              <span>Đã đóng</span>
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: ACKNOWLEDGE ALERT */}
      {ackModalAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-sky-400">
              <MessageSquare className="w-5 h-5" />
              <h2 className="text-base font-bold text-slate-100">
                Xác nhận Tiếp nhận Cảnh báo (ACK)
              </h2>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-1">
              <div className="text-slate-400">Nội dung sự cố:</div>
              <div className="font-semibold text-slate-200">{ackModalAlert.message}</div>
              <div className="text-amber-400 font-mono text-[11px]">
                Thiết bị: {ackModalAlert.device?.device_code}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">
                Ghi chú tiếp nhận (SOP Note):
              </label>
              <textarea
                rows={3}
                value={ackNote}
                onChange={(e) => setAckNote(e.target.value)}
                placeholder="Nhập ghi chú hoặc phương án xử lý tức thì..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setAckModalAlert(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs"
              >
                Huỷ bỏ
              </button>
              <button
                type="button"
                onClick={handleAcknowledgeSubmit}
                disabled={isSubmittingAck}
                className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center gap-2"
              >
                {isSubmittingAck ? 'Đang gửi...' : 'Gửi Xác nhận (ACK)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: RESOLVE ALERT */}
      {resolveModalAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle className="w-5 h-5" />
              <h2 className="text-base font-bold text-slate-100">
                Đóng & Hoàn tất Cảnh báo (Resolve)
              </h2>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-1">
              <div className="text-slate-400">Nội dung sự cố:</div>
              <div className="font-semibold text-slate-200">{resolveModalAlert.message}</div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">
                Ghi chú khắc phục sự cố:
              </label>
              <textarea
                rows={3}
                value={resolveNote}
                onChange={(e) => setResolveNote(e.target.value)}
                placeholder="Mô tả kết quả xử lý..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setResolveModalAlert(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs"
              >
                Huỷ bỏ
              </button>
              <button
                type="button"
                onClick={handleResolveSubmit}
                disabled={isSubmittingResolve}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-2"
              >
                {isSubmittingResolve ? 'Đang hoàn tất...' : 'Xác nhận Đã giải quyết'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
