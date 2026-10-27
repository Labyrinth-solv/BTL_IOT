import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Device, WarehouseZone } from '../types';
import { LifecycleBadge } from '../components/LifecycleBadge';
import {
  Plus,
  RefreshCw,
  Search,
  Check,
  Copy,
  AlertTriangle,
  Wrench,
  Ban,
  RotateCcw,
  Trash2,
  Cpu,
  ArrowRight,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';

export const DevicesPage: React.FC = () => {
  const navigate = useNavigate();
  const { isViewer, showToast } = useAuth();

  const [devices, setDevices] = useState<Device[]>([]);
  const [zones, setZones] = useState<WarehouseZone[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [stateFilter, setStateFilter] = useState<string>('ALL');

  // Modal Onboard
  const [isOnboardModalOpen, setIsOnboardModalOpen] = useState(false);
  const [newDeviceCode, setNewDeviceCode] = useState('');
  const [newDeviceName, setNewDeviceName] = useState('');
  const [newZoneId, setNewZoneId] = useState('');
  const [newFwVersion, setNewFwVersion] = useState('1.0.0');
  const [newHwVersion, setNewHwVersion] = useState('ESP32-WROOM-32');
  const [isSubmittingOnboard, setIsSubmittingOnboard] = useState(false);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [hasCopiedToken, setHasCopiedToken] = useState(false);

  // Modal Suspend
  const [suspendModalDevice, setSuspendModalDevice] = useState<Device | null>(null);
  const [suspendReason, setSuspendReason] = useState('Nghi ngờ can thiệp phần cứng trái phép');
  const [isSubmittingSuspend, setIsSubmittingSuspend] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [devRes, zoneRes] = await Promise.all([
        api.getDevices(),
        api.getZones(),
      ]);
      if (devRes.success) setDevices(devRes.data);
      if (zoneRes.success) {
        setZones(zoneRes.data);
        if (zoneRes.data.length > 0 && !newZoneId) {
          setNewZoneId(zoneRes.data[0].id);
        }
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi tải danh sách thiết bị', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOnboardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeviceCode || !newDeviceName || !newZoneId) {
      showToast('Vui lòng điền đầy đủ mã thiết bị, tên và khu vực!', 'warning');
      return;
    }

    setIsSubmittingOnboard(true);
    try {
      const res = await api.onboardDevice({
        device_code: newDeviceCode.trim().toUpperCase(),
        name: newDeviceName.trim(),
        zone_id: newZoneId,
        fw_version: newFwVersion,
        hw_version: newHwVersion,
      });

      if (res.success && res.data) {
        setGeneratedToken(res.data.secret_token);
        showToast('Onboard thiết bị thành công! Lưu ý sao lưu Secret Token.', 'success');
        fetchData();
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi Onboard thiết bị', 'error');
    } finally {
      setIsSubmittingOnboard(false);
    }
  };

  const handleCopyToken = () => {
    if (generatedToken) {
      navigator.clipboard.writeText(generatedToken);
      setHasCopiedToken(true);
      showToast('Đã sao chép secret_token vào clipboard!', 'success');
      setTimeout(() => setHasCopiedToken(false), 3000);
    }
  };

  const closeOnboardModal = () => {
    setIsOnboardModalOpen(false);
    setGeneratedToken(null);
    setNewDeviceCode('');
    setNewDeviceName('');
  };

  const handleToggleMaintenance = async (device: Device) => {
    const isMaint = device.lifecycle_state === 'MAINTENANCE';
    try {
      const res = await api.toggleMaintenance(device.id, !isMaint);
      if (res.success) {
        showToast(
          `Đã chuyển thiết bị ${device.device_code} sang trạng thái ${!isMaint ? 'Bảo trì (MAINTENANCE)' : 'Hoạt động (ACTIVE)'}`,
          'success'
        );
        fetchData();
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi cập nhật bảo trì', 'error');
    }
  };

  const handleSuspendSubmit = async () => {
    if (!suspendModalDevice) return;
    setIsSubmittingSuspend(true);
    try {
      const res = await api.suspendDevice(suspendModalDevice.id, suspendReason);
      if (res.success) {
        showToast(`Đã đình chỉ (SUSPEND) thiết bị ${suspendModalDevice.device_code}`, 'warning');
        setSuspendModalDevice(null);
        fetchData();
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi đình chỉ thiết bị', 'error');
    } finally {
      setIsSubmittingSuspend(false);
    }
  };

  const handleUnsuspend = async (device: Device) => {
    try {
      const res = await api.unsuspendDevice(device.id);
      if (res.success) {
        showToast(`Đã phục hồi kích hoạt thiết bị ${device.device_code}`, 'success');
        fetchData();
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi mở đình chỉ thiết bị', 'error');
    }
  };

  const handleDecommission = async (device: Device) => {
    if (!window.confirm(`CẢNH BÁO: Bạn có chắc chắn muốn thu hồi (DECOMMISSION) vĩnh viễn thiết bị ${device.device_code}? Token và quyền truy cập sẽ bị huỷ vĩnh viễn!`)) {
      return;
    }
    try {
      const res = await api.decommissionDevice(device.id);
      if (res.success) {
        showToast(`Đã thu hồi vĩnh viễn thiết bị ${device.device_code}`, 'error');
        fetchData();
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi thu hồi thiết bị', 'error');
    }
  };

  // Filtered devices
  const filteredDevices = devices.filter((dev) => {
    const matchesSearch =
      dev.device_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      dev.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (dev.zone?.name && dev.zone.name.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesState = stateFilter === 'ALL' || dev.lifecycle_state === stateFilter;
    return matchesSearch && matchesState;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Cpu className="w-7 h-7 text-amber-500" />
            <span>Quản lý Thiết bị Cảm biến Silo</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Quản trị vòng đời phần cứng (Lifecycle State Machine: Registered &rarr; Active &rarr; Maintenance / Suspended &rarr; Decommissioned)
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchData}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>

          {!isViewer && (
            <button
              onClick={() => setIsOnboardModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Onboard Thiết bị Mới</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo mã thiết bị, tên hoặc khu vực kho..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 whitespace-nowrap">Trạng thái:</span>
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">Tất cả ({devices.length})</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="PROVISIONED">PROVISIONED</option>
            <option value="MAINTENANCE">MAINTENANCE</option>
            <option value="SUSPENDED">SUSPENDED</option>
            <option value="DECOMMISSIONED">DECOMMISSIONED</option>
            <option value="FAULT">FAULT</option>
          </select>
        </div>
      </div>

      {/* Devices Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase font-semibold tracking-wider">
                <th className="py-3.5 px-4">Mã Thiết bị</th>
                <th className="py-3.5 px-4">Tên Silo</th>
                <th className="py-3.5 px-4">Khu vực Lưu trữ</th>
                <th className="py-3.5 px-4">Trạng thái Vòng đời</th>
                <th className="py-3.5 px-4">Kết nối MQTT</th>
                <th className="py-3.5 px-4">Firmware / Hardware</th>
                <th className="py-3.5 px-4">Gói tin gần nhất</th>
                <th className="py-3.5 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-200">
              {filteredDevices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    Không tìm thấy thiết bị nào phù hợp.
                  </td>
                </tr>
              ) : (
                filteredDevices.map((dev) => {
                  const isSuspended = dev.lifecycle_state === 'SUSPENDED';
                  const isDecommissioned = dev.lifecycle_state === 'DECOMMISSIONED';
                  const isMaintenance = dev.lifecycle_state === 'MAINTENANCE';

                  return (
                    <tr
                      key={dev.id}
                      className="hover:bg-slate-800/40 transition-colors group cursor-pointer"
                      onClick={() => navigate(`/devices/${dev.id}`)}
                    >
                      <td className="py-3.5 px-4 font-mono font-bold text-amber-400">
                        {dev.device_code}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-100">
                        {dev.name}
                      </td>
                      <td className="py-3.5 px-4 text-slate-300">
                        {dev.zone?.name || 'Chưa gán'}
                      </td>
                      <td className="py-3.5 px-4">
                        <LifecycleBadge state={dev.lifecycle_state} />
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              dev.is_online ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
                            }`}
                          />
                          <span
                            className={`font-semibold ${
                              dev.is_online ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {dev.is_online ? 'ONLINE' : 'OFFLINE'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                        v{dev.fw_version} | {dev.hw_version}
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                        {dev.last_seen_at
                          ? new Date(dev.last_seen_at).toLocaleTimeString('vi-VN', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })
                          : 'Chưa có dữ liệu'}
                      </td>
                      <td
                        className="py-3.5 px-4 text-right"
                        onClick={(e) => e.stopPropagation()} // Không trigger click cả hàng
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => navigate(`/devices/${dev.id}`)}
                            title="Xem chi tiết vi khí hậu & điều khiển"
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>

                          {!isViewer && !isDecommissioned && (
                            <>
                              {/* Toggle Maintenance */}
                              <button
                                onClick={() => handleToggleMaintenance(dev)}
                                title={isMaintenance ? 'Tắt chế độ bảo trì' : 'Bật chế độ bảo trì'}
                                className={`p-1.5 rounded-lg border transition ${
                                  isMaintenance
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                                }`}
                              >
                                <Wrench className="w-3.5 h-3.5" />
                              </button>

                              {/* Suspend / Unsuspend */}
                              {isSuspended ? (
                                <button
                                  onClick={() => handleUnsuspend(dev)}
                                  title="Mở đình chỉ thiết bị"
                                  className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 transition"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <button
                                  onClick={() => setSuspendModalDevice(dev)}
                                  title="Đình chỉ (Suspend) do vi phạm bảo mật hoặc nghi ngờ can thiệp"
                                  className="p-1.5 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30 transition"
                                >
                                  <Ban className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {/* Decommission */}
                              <button
                                onClick={() => handleDecommission(dev)}
                                title="Thu hồi vĩnh viễn (Decommission)"
                                className="p-1.5 rounded-lg bg-red-950/40 text-red-400 border border-red-900/60 hover:bg-red-900/80 hover:text-white transition"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
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

      {/* MODAL: ONBOARD NEW DEVICE */}
      {isOnboardModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5">
            {!generatedToken ? (
              <>
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-5 h-5 text-amber-500" />
                    <h2 className="text-lg font-bold text-slate-100">Onboard Thiết bị Mới</h2>
                  </div>
                  <button
                    onClick={closeOnboardModal}
                    className="text-slate-400 hover:text-slate-200 text-sm"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleOnboardSubmit} className="space-y-4 text-xs">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Mã định danh Thiết bị (Device Code) *
                    </label>
                    <input
                      type="text"
                      placeholder="VD: DEV_SILO_03"
                      value={newDeviceCode}
                      onChange={(e) => setNewDeviceCode(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500 font-mono"
                      required
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Dùng làm MQTT ClientId và topic routing: grain/devices/DEV_SILO_XX/telemetry
                    </p>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Tên gọi hiển thị *
                    </label>
                    <input
                      type="text"
                      placeholder="VD: Cảm biến Silo Thóc Đông Hải 03"
                      value={newDeviceName}
                      onChange={(e) => setNewDeviceName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Khu vực Silo Lưu trữ (Zone) *
                    </label>
                    <select
                      value={newZoneId}
                      onChange={(e) => setNewZoneId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                    >
                      {zones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.name} ({z.grain_type} - Target MC: {z.target_mc}%)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        Firmware Version
                      </label>
                      <input
                        type="text"
                        value={newFwVersion}
                        onChange={(e) => setNewFwVersion(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        Hardware Version
                      </label>
                      <input
                        type="text"
                        value={newHwVersion}
                        onChange={(e) => setNewHwVersion(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono"
                      />
                    </div>
                  </div>

                  <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={closeOnboardModal}
                      className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-semibold text-xs"
                    >
                      Huỷ bỏ
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingOnboard}
                      className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 hover:bg-amber-400 font-bold text-xs flex items-center gap-2"
                    >
                      {isSubmittingOnboard ? 'Đang khởi tạo...' : 'Tạo Thiết bị & Sinh Token'}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              /* Màn hình hiển thị Secret Token duy nhất 1 lần theo đặc tả */
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-emerald-400">
                  <Check className="w-5 h-5" />
                  <h2 className="text-lg font-bold text-slate-100">
                    Khởi tạo Thiết bị Thành công!
                  </h2>
                </div>

                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
                  <div>
                    <div className="font-bold">LƯU Ý QUAN TRỌNG:</div>
                    <div>
                      Secret token chỉ hiển thị <strong>DUY NHẤT 1 LẦN NÀY</strong>. Hãy sao chép và nạp vào mã nguồn firmware ESP32 của thiết bị ngay bây giờ!
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Device Secret Token (Bearer Token):
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      readOnly
                      value={generatedToken}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 pr-20 text-xs text-amber-300 font-mono select-all focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleCopyToken}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition"
                    >
                      {hasCopiedToken ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{hasCopiedToken ? 'Đã chép' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 flex justify-end">
                  <button
                    onClick={closeOnboardModal}
                    className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition"
                  >
                    Hoàn tất & Đóng
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: SUSPEND DEVICE */}
      {suspendModalDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-rose-400">
              <ShieldAlert className="w-5 h-5" />
              <h2 className="text-base font-bold text-slate-100">
                Đình chỉ Thiết bị (SUSPEND)
              </h2>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Bạn đang thực hiện đình chỉ thiết bị{' '}
              <strong className="text-amber-400 font-mono">{suspendModalDevice.device_code}</strong>. Thiết bị sẽ bị cắt kết nối MQTT và chặn telemetry cho đến khi được phục hồi.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Lý do đình chỉ:</label>
              <textarea
                rows={3}
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setSuspendModalDevice(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs"
              >
                Huỷ bỏ
              </button>
              <button
                type="button"
                onClick={handleSuspendSubmit}
                disabled={isSubmittingSuspend}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-2"
              >
                {isSubmittingSuspend ? 'Đang xử lý...' : 'Xác nhận Đình chỉ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
