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
  RefreshCw,
  Search,
  MessageSquare,
  Flame,
  Droplets,
  Thermometer,
  WifiOff,
  LayoutList,
  Table,
  Trash2,
} from 'lucide-react';

export const AlertsPage: React.FC = () => {
  const { isAdmin, isViewer, showToast } = useAuth();
  const { recentAlerts: liveAlerts } = useSocket();

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'CARD' | 'TABLE'>('CARD');

  const [ackModalAlert, setAckModalAlert] = useState<Alert | null>(null);
  const [ackNote, setAckNote] = useState('');
  const [isSubmittingAck, setIsSubmittingAck] = useState(false);

  const [resolveModalAlert, setResolveModalAlert] = useState<Alert | null>(null);
  const [resolveNote, setResolveNote] = useState('');
  const [isSubmittingResolve, setIsSubmittingResolve] = useState(false);

  const handleDeleteAlert = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!window.confirm('Bạn có chắc muốn xóa cảnh báo này không?')) return;
    try {
      const res = await api.deleteAlert(id);
      if (res.success) {
        showToast('Đã xóa cảnh báo', 'success');
        setAlerts((prev) => prev.filter((a) => a.id !== id));
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi xóa cảnh báo', 'error');
    }
  };

  const handleClearAlerts = async (all: boolean = false) => {
    const confirmMsg = all
      ? 'Bạn có chắc muốn XÓA TẤT CẢ cảnh báo trong hệ thống không?'
      : 'Bạn có chắc muốn dọn các cảnh báo đã giải quyết xong không?';
    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await api.clearAlerts(all);
      if (res.success) {
        showToast(res.message || 'Đã dọn cảnh báo', 'success');
        fetchAlerts();
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi dọn cảnh báo', 'error');
    }
  };

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
        showToast('Đã xác nhận tiếp nhận cảnh báo', 'success');
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
        showToast('Đã đóng cảnh báo', 'success');
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

  const getAlertIcon = (type: string, message?: string) => {
    if (message?.startsWith('[Lỗi cảm biến]')) {
      return <AlertCircle className="w-4 h-4 text-rose-600" />;
    }
    switch (type) {
      case 'HIGH_HUMIDITY':
        return <Droplets className="w-4 h-4 text-sky-600" />;
      case 'HIGH_TEMP':
        return <Thermometer className="w-4 h-4 text-orange-600" />;
      case 'GAS_SPIKE':
        return <Flame className="w-4 h-4 text-rose-600" />;
      case 'DEVICE_OFFLINE':
        return <WifiOff className="w-4 h-4 text-slate-500" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-amber-600" />;
    }
  };

  const getSeverityBadge = (sev: AlertSeverity) => {
    if (sev === 'CRITICAL') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1 w-fit">
          <AlertCircle className="w-3 h-3 text-rose-600" />
          Nghiêm trọng
        </span>
      );
    }
    return (
      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1 w-fit">
        <AlertTriangle className="w-3 h-3 text-amber-600" />
        Cảnh báo
      </span>
    );
  };

  const getStatusBadge = (status: AlertStatus) => {
    switch (status) {
      case 'NEW':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            Mới
          </span>
        );
      case 'ACKNOWLEDGED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
            Đang xử lý
          </span>
        );
      case 'RESOLVED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            Đã xong
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BellRing className="w-6 h-6 text-amber-600" />
            <span>Trung tâm Cảnh báo</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Theo dõi và xác nhận xử lý các sự cố trong kho
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {!isViewer && (
            <button
              onClick={() => handleClearAlerts(false)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold border border-slate-200 shadow-sm transition"
            >
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span>Dọn mục đã xong</span>
            </button>
          )}

          {isAdmin && (
            <button
              onClick={() => handleClearAlerts(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold border border-rose-200 transition"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              <span>Xóa tất cả</span>
            </button>
          )}

          <button
            onClick={fetchAlerts}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold border border-slate-200 shadow-sm transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3">
          {['ALL', 'NEW', 'ACKNOWLEDGED', 'RESOLVED'].map((tab) => {
            const count =
              tab === 'ALL' ? alerts.length : alerts.filter((a) => a.status === tab).length;

            return (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                  statusFilter === tab
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900'
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

        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm theo nội dung cảnh báo hoặc thiết bị..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 whitespace-nowrap">Mức độ:</span>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-emerald-500"
              >
                <option value="ALL">Tất cả</option>
                <option value="CRITICAL">Nghiêm trọng</option>
                <option value="WARNING">Cảnh báo</option>
              </select>
            </div>

            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode('CARD')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
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
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
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
      </div>

      {filteredAlerts.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500 shadow-sm">
          <CheckCircle className="w-12 h-12 mx-auto text-emerald-500 mb-3" />
          <div className="text-base font-semibold text-slate-800">Không có cảnh báo nào</div>
          <div className="text-xs text-slate-500 mt-1">Các khu vực kho hiện đang an toàn.</div>
        </div>
      ) : viewMode === 'CARD' ? (
        <div className="space-y-3">
          {filteredAlerts.map((alert) => {
            const isNew = alert.status === 'NEW';
            const isAck = alert.status === 'ACKNOWLEDGED';
            const isResolved = alert.status === 'RESOLVED';

            return (
              <div
                key={alert.id}
                className={`bg-white border rounded-2xl p-4 shadow-sm transition-all ${
                  isNew
                    ? 'border-rose-200 bg-rose-50/30'
                    : isAck
                    ? 'border-sky-200 bg-sky-50/30'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="flex flex-wrap items-center gap-2">
                    {getSeverityBadge(alert.severity)}
                    {getStatusBadge(alert.status)}
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {new Date(alert.created_at).toLocaleString('vi-VN')}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-full">
                      {alert.device?.device_code || alert.device_id}
                    </span>
                    <span className="text-slate-500 hidden sm:inline">
                      {alert.zone?.name || 'Kho ngũ cốc'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3">
                  <div className="flex items-start gap-2.5 flex-1 min-w-0">
                    <div className="mt-0.5 shrink-0">{getAlertIcon(alert.alert_type, alert.message)}</div>
                    <div className="text-sm font-semibold text-slate-900 break-words leading-relaxed">
                      {alert.message}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {!isViewer && isNew && (
                      <button
                        onClick={() => {
                          setAckModalAlert(alert);
                          setAckNote('Đã tiếp nhận, đang kiểm tra kho.');
                        }}
                        className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs transition flex items-center gap-1.5 shadow-sm"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Xác nhận</span>
                      </button>
                    )}

                    {!isViewer && (isNew || isAck) && (
                      <button
                        onClick={() => {
                          setResolveModalAlert(alert);
                          setResolveNote('Đã xử lý xong, thông số kho đã ổn định.');
                        }}
                        className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition flex items-center gap-1.5 shadow-sm"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Hoàn tất</span>
                      </button>
                    )}

                    {isResolved && (
                      <span className="text-emerald-700 font-semibold text-xs flex items-center gap-1 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Đã xong</span>
                      </span>
                    )}

                    {!isViewer && (
                      <button
                        onClick={(e) => handleDeleteAlert(alert.id, e)}
                        title="Xóa cảnh báo"
                        className="p-2 rounded-xl bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {alert.ack_by && (
                  <div className="mt-3 pt-2.5 border-t border-slate-100 text-xs text-slate-600 flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-800">{alert.ack_by.full_name}:</span>
                    <span className="italic">&ldquo;{alert.ack_note || 'Đã tiếp nhận xử lý'}&rdquo;</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 uppercase font-semibold tracking-wider">
                  <th className="py-3.5 px-3 whitespace-nowrap">Thời gian</th>
                  <th className="py-3.5 px-3">Mức độ</th>
                  <th className="py-3.5 px-3">Nội dung</th>
                  <th className="py-3.5 px-3">Thiết bị</th>
                  <th className="py-3.5 px-3">Trạng thái</th>
                  <th className="py-3.5 px-3 text-right whitespace-nowrap">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredAlerts.map((alert) => {
                  const isNew = alert.status === 'NEW';
                  const isAck = alert.status === 'ACKNOWLEDGED';
                  const isResolved = alert.status === 'RESOLVED';

                  return (
                    <tr key={alert.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3.5 px-3 text-slate-500 whitespace-nowrap">
                        {new Date(alert.created_at).toLocaleString('vi-VN', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-3.5 px-3">{getSeverityBadge(alert.severity)}</td>
                      <td className="py-3.5 px-3 max-w-sm break-words font-medium text-slate-900">
                        {alert.message}
                      </td>
                      <td className="py-3.5 px-3 font-semibold text-slate-700">
                        {alert.device?.device_code || alert.device_id}
                      </td>
                      <td className="py-3.5 px-3">{getStatusBadge(alert.status)}</td>
                      <td className="py-3.5 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {!isViewer && isNew && (
                            <button
                              onClick={() => {
                                setAckModalAlert(alert);
                                setAckNote('Đã tiếp nhận, đang kiểm tra kho.');
                              }}
                              className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-semibold text-[11px]"
                            >
                              Xác nhận
                            </button>
                          )}
                          {!isViewer && (isNew || isAck) && (
                            <button
                              onClick={() => {
                                setResolveModalAlert(alert);
                                setResolveNote('Đã xử lý xong.');
                              }}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px]"
                            >
                              Hoàn tất
                            </button>
                          )}
                          {isResolved && (
                            <span className="text-emerald-700 font-semibold text-[11px]">Đã đóng</span>
                          )}
                          {!isViewer && (
                            <button
                              onClick={(e) => handleDeleteAlert(alert.id, e)}
                              className="p-1 rounded-lg bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL ACK */}
      {ackModalAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-sky-700">
              <MessageSquare className="w-5 h-5" />
              <h2 className="text-base font-bold text-slate-900">Xác nhận tiếp nhận cảnh báo</h2>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
              <div className="font-semibold text-slate-900">{ackModalAlert.message}</div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Ghi chú xử lý:</label>
              <textarea
                rows={3}
                value={ackNote}
                onChange={(e) => setAckNote(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl p-3 text-xs text-slate-900 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setAckModalAlert(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs"
              >
                Huỷ
              </button>
              <button
                type="button"
                onClick={handleAcknowledgeSubmit}
                disabled={isSubmittingAck}
                className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs"
              >
                {isSubmittingAck ? 'Đang gửi...' : 'Xác nhận'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL RESOLVE */}
      {resolveModalAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-emerald-700">
              <CheckCircle className="w-5 h-5" />
              <h2 className="text-base font-bold text-slate-900">Hoàn tất cảnh báo</h2>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <div className="font-semibold text-slate-900">{resolveModalAlert.message}</div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Kết quả khắc phục:</label>
              <textarea
                rows={3}
                value={resolveNote}
                onChange={(e) => setResolveNote(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl p-3 text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setResolveModalAlert(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs"
              >
                Huỷ
              </button>
              <button
                type="button"
                onClick={handleResolveSubmit}
                disabled={isSubmittingResolve}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs"
              >
                {isSubmittingResolve ? 'Đang lưu...' : 'Đánh dấu đã xong'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
