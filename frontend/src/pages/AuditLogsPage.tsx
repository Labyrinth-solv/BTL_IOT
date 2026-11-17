import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { AuditLog, getRoleDisplayName } from '../types';
import {
  ShieldCheck,
  Search,
  RefreshCw,
  FileText,
  LayoutList,
  Table,
  X,
} from 'lucide-react';

type AuditCategory =
  | 'AUTH'
  | 'CONTROL'
  | 'CONFIG'
  | 'DEVICE'
  | 'ZONE'
  | 'USER'
  | 'ALERT'
  | 'SECURITY'
  | 'SYSTEM';

type BadgeTone = 'emerald' | 'sky' | 'amber' | 'rose' | 'slate';

interface ActionMeta {
  label: string;
  category: AuditCategory;
  tone: BadgeTone;
}

const ACTION_META_MAP: Record<string, ActionMeta> = {
  USER_LOGIN: { label: 'Đăng nhập hệ thống', category: 'AUTH', tone: 'emerald' },
  LOGIN_SUCCESS: { label: 'Đăng nhập hệ thống', category: 'AUTH', tone: 'emerald' },
  USER_CREATED: { label: 'Tạo tài khoản mới', category: 'USER', tone: 'emerald' },
  USER_UPDATED: { label: 'Cập nhật tài khoản', category: 'USER', tone: 'sky' },
  USER_STATUS_UPDATED: { label: 'Đổi trạng thái tài khoản', category: 'USER', tone: 'amber' },
  USER_DELETED: { label: 'Xóa tài khoản', category: 'USER', tone: 'rose' },
  ZONE_CREATED: { label: 'Thêm khu vực kho', category: 'ZONE', tone: 'emerald' },
  ZONE_UPDATED: { label: 'Cập nhật khu vực kho', category: 'ZONE', tone: 'sky' },
  ZONE_DELETED: { label: 'Xóa khu vực kho', category: 'ZONE', tone: 'rose' },
  DEVICE_ONBOARDED: { label: 'Thêm thiết bị mới', category: 'DEVICE', tone: 'emerald' },
  DEVICE_PROVISIONED: { label: 'Cấp phép thiết bị', category: 'DEVICE', tone: 'sky' },
  DEVICE_ACTIVATED: { label: 'Kích hoạt thiết bị', category: 'DEVICE', tone: 'emerald' },
  DEVICE_ENTER_MAINTENANCE: { label: 'Chuyển sang bảo trì', category: 'DEVICE', tone: 'amber' },
  DEVICE_EXIT_MAINTENANCE: { label: 'Hoàn tất bảo trì', category: 'DEVICE', tone: 'emerald' },
  DEVICE_UPDATED: { label: 'Sửa thông tin thiết bị', category: 'DEVICE', tone: 'sky' },
  DEVICE_TOKEN_ROTATED: { label: 'Cấp lại khóa thiết bị', category: 'DEVICE', tone: 'amber' },
  DEVICE_SUSPENDED: { label: 'Đình chỉ thiết bị', category: 'DEVICE', tone: 'rose' },
  DEVICE_UNSUSPENDED: { label: 'Mở khóa thiết bị', category: 'DEVICE', tone: 'emerald' },
  DEVICE_DECOMMISSIONED: { label: 'Thu hồi thiết bị', category: 'DEVICE', tone: 'rose' },
  DEVICE_DELETED: { label: 'Xóa thiết bị', category: 'DEVICE', tone: 'rose' },
  DEVICE_CONFIG_UPDATED: { label: 'Cập nhật cấu hình & ngưỡng', category: 'CONFIG', tone: 'sky' },
  ACTUATOR_CONTROL_COMMAND: { label: 'Điều khiển Quạt / Còi / Relay', category: 'CONTROL', tone: 'sky' },
  TURN_ON: { label: 'Tự động bật quạt', category: 'CONTROL', tone: 'amber' },
  TURN_OFF: { label: 'Tự động tắt quạt', category: 'CONTROL', tone: 'emerald' },
  ALERT_ACKNOWLEDGED: { label: 'Xác nhận cảnh báo', category: 'ALERT', tone: 'amber' },
  ALERT_RESOLVED: { label: 'Xử lý xong cảnh báo', category: 'ALERT', tone: 'emerald' },
  ALERT_DELETED: { label: 'Xóa cảnh báo', category: 'ALERT', tone: 'rose' },
  ALERTS_CLEARED: { label: 'Xóa hàng loạt cảnh báo', category: 'ALERT', tone: 'rose' },
  SECURITY_VIOLATION_403: { label: 'Từ chối thao tác (Không đủ quyền)', category: 'SECURITY', tone: 'rose' },
  UNAUTHORIZED_ACCESS_ATTEMPT: { label: 'Truy cập trái phép bị chặn', category: 'SECURITY', tone: 'rose' },
  UNAUTHORIZED_TELEMETRY_BLOCKED: { label: 'Chặn dữ liệu từ thiết bị bị khóa', category: 'SECURITY', tone: 'rose' },
  INVALID_SENSOR_DATA_REJECTED: { label: 'Từ chối dữ liệu cảm biến lỗi', category: 'SECURITY', tone: 'amber' },
  SYSTEM_INITIALIZATION: { label: 'Khởi tạo dữ liệu hệ thống', category: 'SYSTEM', tone: 'slate' },
};

const getActionMeta = (action: string): ActionMeta => {
  if (ACTION_META_MAP[action]) return ACTION_META_MAP[action];
  return { label: action, category: 'SYSTEM', tone: 'slate' };
};

const getTargetTypeLabel = (targetType: string): string => {
  switch (targetType) {
    case 'DEVICE':
      return 'Thiết bị';
    case 'ZONE':
      return 'Khu vực kho';
    case 'USER':
      return 'Người dùng';
    case 'ALERT':
      return 'Cảnh báo';
    case 'SYSTEM':
      return 'Hệ thống';
    default:
      return targetType || 'Hệ thống';
  }
};

const formatIpAddress = (ip?: string | null): string => {
  if (!ip || ip === 'unknown') return 'Nội bộ / Không rõ';
  if (ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1') {
    return 'Máy chủ cục bộ (localhost)';
  }
  return ip.replace(/^::ffff:/, '');
};

const formatLogSummary = (log: AuditLog): string => {
  const d = log.details_json || {};

  switch (log.action) {
    case 'USER_LOGIN':
    case 'LOGIN_SUCCESS':
      return d.email
        ? `Tài khoản "${d.email}" (${getRoleDisplayName(d.role, true) || d.role})`
        : 'Đăng nhập vào hệ thống';

    case 'USER_CREATED':
    case 'USER_UPDATED':
    case 'USER_DELETED': {
      const namePart = d.full_name ? `${d.full_name} ` : '';
      const emailPart = d.email ? `(${d.email})` : '';
      const rolePart = d.role ? ` — ${getRoleDisplayName(d.role, true)}` : '';
      return `${namePart}${emailPart}${rolePart}`.trim() || 'Thao tác trên tài khoản người dùng';
    }

    case 'USER_STATUS_UPDATED':
      return `Tài khoản ${d.email || ''} chuyển sang trạng thái: ${
        d.status === 'LOCKED' ? 'Đã khóa' : 'Đang hoạt động'
      }`;

    case 'ZONE_CREATED':
    case 'ZONE_UPDATED':
    case 'ZONE_DELETED':
      return d.name
        ? `Kho "${d.name}"${d.grain_type ? ` (${d.grain_type})` : ''}`
        : 'Thao tác trên khu vực kho';

    case 'DEVICE_ONBOARDED':
    case 'DEVICE_UPDATED':
    case 'DEVICE_DELETED':
    case 'DEVICE_TOKEN_ROTATED':
    case 'DEVICE_SUSPENDED':
    case 'DEVICE_DECOMMISSIONED': {
      const code = d.device_code || log.target_id;
      const reason = d.reason ? ` — Lý do: ${d.reason}` : '';
      return `Thiết bị ${code}${d.name ? ` (${d.name})` : ''}${reason}`;
    }

    case 'ACTUATOR_CONTROL_COMMAND': {
      const targetName =
        d.target === 'VENTILATION_FAN'
          ? 'Quạt thông gió'
          : d.target === 'ALARM_BUZZER'
          ? 'Còi báo động'
          : d.target === 'CUSTOM_PERIPHERAL'
          ? 'Thiết bị ngoại vi'
          : d.target || 'Thiết bị';
      if (d.action === 'SET_AUTO') {
        return `Chuyển ${targetName} sang chế độ Tự động`;
      }
      const verb = d.action === 'TURN_ON' ? 'Bật' : d.action === 'TURN_OFF' ? 'Tắt' : d.action;
      const modeLabel =
        d.control_mode === 'MANUAL'
          ? ' (Thủ công)'
          : d.control_mode === 'AUTO'
          ? ' (Tự động)'
          : '';
      return `${verb} ${targetName}${modeLabel}`;
    }

    case 'DEVICE_CONFIG_UPDATED': {
      const changed = d.updated_config || d;
      const parts: string[] = [];
      if (typeof changed.temp_warn_threshold === 'number') {
        parts.push(`Nhiệt báo ≥${changed.temp_warn_threshold}°C`);
      }
      if (typeof changed.hum_warn_threshold === 'number') {
        parts.push(`Ẩm khí ≥${changed.hum_warn_threshold}%`);
      }
      if (typeof changed.emc_warn_threshold === 'number') {
        parts.push(`Ẩm hạt ≥${changed.emc_warn_threshold}%`);
      }
      if (typeof changed.gas_warn_threshold === 'number') {
        parts.push(`Gas ≥${changed.gas_warn_threshold} ppm`);
      }
      if (changed.peripherals) parts.push('Cập nhật ngoại vi / GPIO');
      return parts.length > 0 ? parts.join(' · ') : 'Đồng bộ cấu hình xuống thiết bị';
    }

    case 'ALERT_ACKNOWLEDGED':
      return `Xác nhận cảnh báo${d.alert_type ? ` (${d.alert_type})` : ''}`;

    case 'ALERT_RESOLVED':
      return d.resolution_note
        ? `Ghi chú xử lý: "${d.resolution_note}"`
        : 'Đánh dấu cảnh báo đã được khắc phục';

    case 'ALERT_DELETED':
      return `Đã xóa cảnh báo ${d.alert_type || ''}`.trim();

    case 'ALERTS_CLEARED':
      return `Đã xóa ${d.deleted_count ?? 0} cảnh báo`;

    case 'SECURITY_VIOLATION_403':
    case 'UNAUTHORIZED_ACCESS_ATTEMPT':
      return d.reason || 'Người dùng thử thực hiện thao tác vượt quá phân quyền';

    case 'UNAUTHORIZED_TELEMETRY_BLOCKED':
      return `Chặn gói tin từ thiết bị ${d.device_code || ''} (${d.lifecycle_state || 'Bị khóa'})`;

    case 'INVALID_SENSOR_DATA_REJECTED':
      return 'Từ chối dữ liệu cảm biến nằm ngoài ngưỡng vật lý';

    case 'SYSTEM_INITIALIZATION':
      return 'Khởi tạo dữ liệu tài khoản, kho và thiết bị mẫu';

    default:
      if (typeof d.message === 'string') return d.message;
      if (typeof d.description === 'string') return d.description;
      if (typeof d.device_code === 'string') return `Thiết bị ${d.device_code}`;
      return `${getTargetTypeLabel(log.target_type)} (${log.target_id})`;
  }
};

const TONE_CLASS_MAP: Record<BadgeTone, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  sky: 'bg-sky-50 text-sky-700 border-sky-200',
  amber: 'bg-amber-50 text-amber-800 border-amber-200',
  rose: 'bg-rose-50 text-rose-700 border-rose-200',
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
};

export const AuditLogsPage: React.FC = () => {
  const { showToast } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | AuditCategory>('ALL');
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

  const filteredLogs = logs.filter((log) => {
    const meta = getActionMeta(log.action);
    const summary = formatLogSummary(log);
    const targetLabel = getTargetTypeLabel(log.target_type);
    const actorName = log.actor?.full_name || 'Hệ thống';
    const actorEmail = log.actor?.email || '';

    const needle = searchTerm.toLowerCase();
    const matchesSearch =
      !needle ||
      actorName.toLowerCase().includes(needle) ||
      actorEmail.toLowerCase().includes(needle) ||
      meta.label.toLowerCase().includes(needle) ||
      summary.toLowerCase().includes(needle) ||
      targetLabel.toLowerCase().includes(needle);

    const matchesCategory = categoryFilter === 'ALL' || meta.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-purple-600" />
            <span>Nhật ký hoạt động hệ thống</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Theo dõi toàn bộ thao tác đăng nhập, điều khiển thiết bị, thay đổi cấu hình và bảo mật
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

      {/* Bộ lọc & Tìm kiếm */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 shadow-sm">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo tên người dùng, thao tác, tên kho hoặc mã thiết bị..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-purple-500 transition"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as 'ALL' | AuditCategory)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-purple-500"
          >
            <option value="ALL">Tất cả hoạt động ({logs.length})</option>
            <option value="AUTH">Đăng nhập</option>
            <option value="CONTROL">Điều khiển Quạt / Còi / Relay</option>
            <option value="CONFIG">Cấu hình ngưỡng &amp; Ngoại vi</option>
            <option value="DEVICE">Quản lý Thiết bị</option>
            <option value="ZONE">Quản lý Khu vực kho</option>
            <option value="USER">Quản lý Người dùng</option>
            <option value="ALERT">Xử lý Cảnh báo</option>
            <option value="SECURITY">Bảo mật / Từ chối quyền</option>
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
              Không tìm thấy nhật ký nào phù hợp.
            </div>
          ) : (
            filteredLogs.map((log) => {
              const meta = getActionMeta(log.action);
              const summary = formatLogSummary(log);

              return (
                <div
                  key={log.id}
                  className="bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-4 shadow-sm transition space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                          TONE_CLASS_MAP[meta.tone]
                        }`}
                      >
                        {meta.label}
                      </span>
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                        {getTargetTypeLabel(log.target_type)}
                      </span>
                      <span className="text-slate-400 text-xs">
                        {new Date(log.created_at).toLocaleString('vi-VN', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedLog(log)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 text-purple-700 text-xs font-semibold border border-slate-200 transition"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Xem chi tiết</span>
                    </button>
                  </div>

                  <div className="text-sm text-slate-800 font-medium">{summary}</div>

                  <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-slate-500">
                    <div>
                      Người thực hiện:{' '}
                      <strong className="text-slate-700">
                        {log.actor ? log.actor.full_name : 'Hệ thống tự động'}
                      </strong>
                      {log.actor?.role && (
                        <span className="text-slate-400 ml-1">
                          ({getRoleDisplayName(log.actor.role, true)})
                        </span>
                      )}
                    </div>
                    {log.ip_address && (
                      <div>
                        Nguồn truy cập:{' '}
                        <span className="text-slate-600">{formatIpAddress(log.ip_address)}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
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
                  <th className="py-3.5 px-4">Hoạt động</th>
                  <th className="py-3.5 px-4">Nội dung</th>
                  <th className="py-3.5 px-4 text-right">Chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      Không tìm thấy nhật ký nào phù hợp.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => {
                    const meta = getActionMeta(log.action);
                    const summary = formatLogSummary(log);

                    return (
                      <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString('vi-VN', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-slate-800 whitespace-nowrap">
                          {log.actor ? log.actor.full_name : 'Hệ thống tự động'}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                              TONE_CLASS_MAP[meta.tone]
                            }`}
                          >
                            {meta.label}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-700 max-w-md truncate">{summary}</td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedLog(log)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold"
                          >
                            <FileText className="w-3 h-3" />
                            <span>Xem</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
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
                <FileText className="w-5 h-5 text-purple-600" />
                <h2 className="text-sm font-bold text-slate-900">
                  {getActionMeta(selectedLog.action).label}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Thời gian</span>
                <span className="col-span-2 font-medium text-slate-900">
                  {new Date(selectedLog.created_at).toLocaleString('vi-VN')}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Người thực hiện</span>
                <span className="col-span-2 font-medium text-slate-900">
                  {selectedLog.actor
                    ? `${selectedLog.actor.full_name} (${selectedLog.actor.email})`
                    : 'Hệ thống tự động'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Đối tượng</span>
                <span className="col-span-2 font-medium text-slate-900">
                  {getTargetTypeLabel(selectedLog.target_type)}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Nội dung</span>
                <span className="col-span-2 font-semibold text-slate-900">
                  {formatLogSummary(selectedLog)}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Nguồn truy cập</span>
                <span className="col-span-2 text-slate-700">
                  {formatIpAddress(selectedLog.ip_address)}
                </span>
              </div>
            </div>

            {selectedLog.details_json && (
              <details className="bg-slate-50 rounded-xl border border-slate-200 p-3 text-xs">
                <summary className="cursor-pointer font-semibold text-slate-600 hover:text-slate-900">
                  Xem dữ liệu kỹ thuật (JSON)
                </summary>
                <pre className="mt-2 font-mono text-[11px] text-slate-700 overflow-x-auto max-h-56">
                  {JSON.stringify(selectedLog.details_json, null, 2)}
                </pre>
              </details>
            )}

            <div className="flex justify-end pt-2 border-t border-slate-200">
              <button
                type="button"
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
