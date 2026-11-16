import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { Device, DiscoveredDevice, WarehouseZone } from '../types';
import { LifecycleBadge } from '../components/LifecycleBadge';
import { PERIPHERAL_CATALOG, normalizePeripherals } from '../utils/peripherals';
import {
  Plus,
  RefreshCw,
  Search,
  Wrench,
  Ban,
  RotateCcw,
  Trash2,
  Cpu,
  ExternalLink,
  ShieldAlert,
  LayoutList,
  Table,
  Pencil,
  PlayCircle,
  Radio,
  X,
} from 'lucide-react';

export const DevicesPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAdmin, isViewer, showToast } = useAuth();
  const { latestTelemetry, deviceStatus, discoveredDevices: socketDiscovered, removeDiscoveredDevice } = useSocket();

  const [devices, setDevices] = useState<Device[]>([]);
  const [zones, setZones] = useState<WarehouseZone[]>([]);
  const [apiDiscovered, setApiDiscovered] = useState<DiscoveredDevice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [stateFilter, setStateFilter] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'CARD' | 'TABLE'>('CARD');

  const [isOnboardModalOpen, setIsOnboardModalOpen] = useState(false);
  const [newDeviceCode, setNewDeviceCode] = useState('');
  const [newDeviceName, setNewDeviceName] = useState('');
  const [newZoneId, setNewZoneId] = useState('');
  const [newFwVersion, setNewFwVersion] = useState('1.1.1');
  const [newHwVersion, setNewHwVersion] = useState('ESP32-WROOM-32D-v2');
  const [isSubmittingOnboard, setIsSubmittingOnboard] = useState(false);

  const [editModalDevice, setEditModalDevice] = useState<Device | null>(null);
  const [editName, setEditName] = useState('');
  const [editZoneId, setEditZoneId] = useState('');
  const [editFwVersion, setEditFwVersion] = useState('');
  const [editHwVersion, setEditHwVersion] = useState('');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  const [suspendModalDevice, setSuspendModalDevice] = useState<Device | null>(null);
  const [suspendReason, setSuspendReason] = useState('Tạm ngưng kiểm tra thiết bị');
  const [isSubmittingSuspend, setIsSubmittingSuspend] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [devRes, zoneRes, discRes] = await Promise.all([
        api.getDevices(),
        api.getZones(),
        api.getDiscoveredDevices().catch(() => ({ success: false, data: [] })),
      ]);
      if (devRes.success) setDevices(devRes.data);
      if (discRes?.success && Array.isArray(discRes.data)) {
        setApiDiscovered(discRes.data);
      }
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

  const closeOnboardModal = () => {
    setIsOnboardModalOpen(false);
    setNewDeviceCode('');
    setNewDeviceName('');
  };

  const handleOnboardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeviceCode || !newDeviceName || !newZoneId) {
      showToast('Vui lòng điền đầy đủ mã thiết bị, tên và khu vực!', 'warning');
      return;
    }

    const codeNormalized = newDeviceCode.trim().toUpperCase();
    setIsSubmittingOnboard(true);
    try {
      const res = await api.onboardDevice({
        device_code: codeNormalized,
        name: newDeviceName.trim(),
        zone_id: newZoneId,
        fw_version: newFwVersion,
        hw_version: newHwVersion,
      });

      if (res.success && res.data) {
        removeDiscoveredDevice(codeNormalized);
        setApiDiscovered((prev) => prev.filter((n) => n.device_code !== codeNormalized));
        closeOnboardModal();
        showToast(`Đã thêm thiết bị ${codeNormalized} thành công!`, 'success');
        fetchData();
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi thêm thiết bị', 'error');
    } finally {
      setIsSubmittingOnboard(false);
    }
  };

  const handleToggleMaintenance = async (device: Device) => {
    const isMaint = device.lifecycle_state === 'MAINTENANCE';
    try {
      const res = await api.toggleMaintenance(device.id, !isMaint);
      if (res.success) {
        showToast(
          `Đã chuyển ${device.device_code} sang trạng thái ${!isMaint ? 'Bảo trì' : 'Hoạt động'}`,
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
        showToast(`Đã đình chỉ thiết bị ${suspendModalDevice.device_code}`, 'warning');
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
        showToast(`Đã kích hoạt lại thiết bị ${device.device_code}`, 'success');
        fetchData();
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi mở đình chỉ thiết bị', 'error');
    }
  };

  const handleDecommission = async (device: Device) => {
    if (!window.confirm(`Bạn có chắc muốn thu hồi thiết bị ${device.device_code}?`)) {
      return;
    }
    try {
      const res = await api.decommissionDevice(device.id);
      if (res.success) {
        showToast(`Đã thu hồi thiết bị ${device.device_code}`, 'error');
        fetchData();
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi thu hồi thiết bị', 'error');
    }
  };

  const handleActivate = async (device: Device) => {
    try {
      const res = await api.activateDevice(device.id);
      if (res.success) {
        showToast(`Đã kích hoạt thiết bị ${device.device_code}`, 'success');
        fetchData();
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi kích hoạt thiết bị', 'error');
    }
  };

  const openEditModal = (device: Device) => {
    setEditModalDevice(device);
    setEditName(device.name);
    setEditZoneId(device.zone_id);
    setEditFwVersion(device.fw_version || '1.1.1');
    setEditHwVersion(device.hw_version || 'ESP32-WROOM-32D-v2');
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModalDevice || !editName.trim() || !editZoneId) {
      showToast('Tên thiết bị và khu vực không được để trống!', 'warning');
      return;
    }
    setIsSubmittingEdit(true);
    try {
      const res = await api.updateDevice(editModalDevice.id, {
        name: editName.trim(),
        zone_id: editZoneId,
        fw_version: editFwVersion.trim(),
        hw_version: editHwVersion.trim(),
      });
      if (res.success) {
        showToast(`Đã cập nhật ${editModalDevice.device_code}`, 'success');
        setEditModalDevice(null);
        fetchData();
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi cập nhật thiết bị', 'error');
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleDeletePermanent = async (device: Device) => {
    if (
      !window.confirm(
        `Xóa hẳn thiết bị ${device.device_code} (${device.name}) cùng toàn bộ dữ liệu liên quan?`
      )
    ) {
      return;
    }
    try {
      const res = await api.deleteDevice(device.id);
      if (res.success) {
        showToast(`Đã xóa thiết bị ${device.device_code}`, 'success');
        fetchData();
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi xóa thiết bị', 'error');
    }
  };

  const handleQuickOnboardDiscovered = (node: DiscoveredDevice) => {
    setNewDeviceCode(node.device_code);
    setNewDeviceName(`Node Silo ${node.device_code}`);
    setNewFwVersion(node.fw_version || '1.1.1');
    setNewHwVersion(node.hw_version || 'ESP32-WROOM-32D-v2');
    if (zones.length > 0 && !newZoneId) {
      setNewZoneId(zones[0].id);
    }
    setIsOnboardModalOpen(true);
  };

  const registeredCodes = new Set(devices.map((d) => d.device_code));
  const discoveredMap = new Map<string, DiscoveredDevice>();
  apiDiscovered.forEach((n) => {
    if (!registeredCodes.has(n.device_code)) discoveredMap.set(n.device_code, n);
  });
  Object.values(socketDiscovered).forEach((n) => {
    if (!registeredCodes.has(n.device_code)) discoveredMap.set(n.device_code, n);
  });
  const discoveredList = Array.from(discoveredMap.values()).sort(
    (a, b) => b.last_seen_at - a.last_seen_at
  );

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Cpu className="w-6 h-6 text-emerald-600" />
            <span>Quản lý Thiết bị &amp; Mạch</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Thêm mạch ESP32 mới, thay đổi thông tin và quản lý các thiết bị ngoại vi
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchData}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold border border-slate-200 shadow-sm transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>

          {isAdmin && (
            <button
              onClick={() => setIsOnboardModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm transition"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm Thiết bị Mới</span>
            </button>
          )}
        </div>
      </div>

      {/* Auto-Discovered ESP32 Banner */}
      {discoveredList.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
              <Radio className="w-4 h-4 text-amber-600 animate-pulse" />
              <span>Phát hiện {discoveredList.length} thiết bị mới đang kết nối</span>
            </div>
            <span className="text-xs text-amber-800">
              {isAdmin ? 'Bấm "Thêm ngay" để đưa vào danh sách theo dõi' : 'Liên hệ Chủ kho để thêm thiết bị mới'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {discoveredList.map((node) => (
              <div
                key={node.device_code}
                className="bg-white border border-amber-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="text-xs">
                  <div className="font-bold text-slate-900">{node.device_code}</div>
                  {node.ip_address && (
                    <div className="text-[11px] text-slate-500 mt-0.5">Địa chỉ mạng: {node.ip_address}</div>
                  )}
                </div>

                {isAdmin && (
                  <button
                    onClick={() => handleQuickOnboardDiscovered(node)}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs flex items-center gap-1.5 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Thêm ngay</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search & Filter */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 shadow-sm">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo tên thiết bị hoặc khu vực kho..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-emerald-500"
          >
            <option value="ALL">Tất cả ({devices.length})</option>
            <option value="ACTIVE">Đang hoạt động</option>
            <option value="PROVISIONED">Đã cấp phép</option>
            <option value="MAINTENANCE">Bảo trì</option>
            <option value="SUSPENDED">Đình chỉ</option>
            <option value="DECOMMISSIONED">Đã thu hồi</option>
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
          {filteredDevices.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400">
              Không tìm thấy thiết bị nào phù hợp.
            </div>
          ) : (
            filteredDevices.map((dev) => {
              const wsStatus = deviceStatus[dev.device_code];
              const liveOnline = wsStatus ? wsStatus.state !== 'OFFLINE' : dev.is_online;
              const isSuspended = dev.lifecycle_state === 'SUSPENDED';
              const isDecommissioned = dev.lifecycle_state === 'DECOMMISSIONED';
              const isMaintenance = dev.lifecycle_state === 'MAINTENANCE';
              const needsActivation =
                dev.lifecycle_state === 'REGISTERED' || dev.lifecycle_state === 'PROVISIONED';

              const periph = normalizePeripherals((dev.config_json as any)?.peripherals);
              const attachedCount = PERIPHERAL_CATALOG.filter(
                (p) => periph[p.enabledKey] !== false
              ).length;
              const customCount = Array.isArray((dev.config_json as any)?.custom_peripherals)
                ? (dev.config_json as any).custom_peripherals.length
                : 0;

              return (
                <div
                  key={dev.id}
                  className="bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-4 shadow-sm transition space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">{dev.name}</span>
                      <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                        {dev.device_code}
                      </span>
                      <LifecycleBadge state={dev.lifecycle_state} />
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full font-medium">
                        {attachedCount + customCount} ngoại vi
                      </span>
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                          liveOnline
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${
                            liveOnline ? 'bg-emerald-500' : 'bg-slate-400'
                          }`}
                        />
                        {liveOnline ? 'Trực tuyến' : 'Ngoại tuyến'}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-slate-500">
                    <div>
                      Khu vực: <strong className="text-slate-800">{dev.zone?.name || 'Chưa gán'}</strong>
                    </div>
                    <div>
                      Cập nhật gần nhất:{' '}
                      <span className="text-slate-700">
                        {dev.last_seen_at
                          ? new Date(dev.last_seen_at).toLocaleString('vi-VN', {
                              hour: '2-digit',
                              minute: '2-digit',
                              day: '2-digit',
                              month: '2-digit',
                            })
                          : 'Chưa có dữ liệu'}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                    <button
                      onClick={() => navigate(`/devices/${dev.id}`)}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition shadow-sm"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Chi tiết &amp; Quản lý Ngoại vi</span>
                    </button>

                    {!isViewer && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {needsActivation && (
                          <button
                            onClick={() => handleActivate(dev)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 text-xs font-semibold transition"
                          >
                            <PlayCircle className="w-3.5 h-3.5" />
                            <span>Kích hoạt</span>
                          </button>
                        )}

                        <button
                          onClick={() => openEditModal(dev)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 text-xs font-semibold transition"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span>Sửa</span>
                        </button>

                        {!isDecommissioned && (
                          <>
                            <button
                              onClick={() => handleToggleMaintenance(dev)}
                              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition ${
                                isMaintenance
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              <Wrench className="w-3.5 h-3.5" />
                              <span>{isMaintenance ? 'Xong bảo trì' : 'Bảo trì'}</span>
                            </button>

                            {isAdmin && (
                              <>
                                {isSuspended ? (
                                  <button
                                    onClick={() => handleUnsuspend(dev)}
                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 text-xs font-semibold transition"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                    <span>Mở đình chỉ</span>
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => setSuspendModalDevice(dev)}
                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 text-xs font-semibold transition"
                                  >
                                    <Ban className="w-3.5 h-3.5" />
                                    <span>Đình chỉ</span>
                                  </button>
                                )}

                                <button
                                  onClick={() => handleDecommission(dev)}
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 text-xs font-semibold transition"
                                >
                                  <Ban className="w-3.5 h-3.5" />
                                  <span>Thu hồi</span>
                                </button>
                              </>
                            )}
                          </>
                        )}

                        {isAdmin && (
                          <button
                            onClick={() => handleDeletePermanent(dev)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-700 text-xs font-semibold transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Xóa hẳn</span>
                          </button>
                        )}
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
                  <th className="py-3.5 px-4">Tên thiết bị</th>
                  <th className="py-3.5 px-4">Mã</th>
                  <th className="py-3.5 px-4">Khu vực</th>
                  <th className="py-3.5 px-4">Trạng thái</th>
                  <th className="py-3.5 px-4">Kết nối</th>
                  <th className="py-3.5 px-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredDevices.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      Không tìm thấy thiết bị nào phù hợp.
                    </td>
                  </tr>
                ) : (
                  filteredDevices.map((dev) => {
                    const wsStatus = deviceStatus[dev.device_code];
                    const liveOnline = wsStatus ? wsStatus.state !== 'OFFLINE' : dev.is_online;
                    return (
                      <tr
                        key={dev.id}
                        className="hover:bg-slate-50 transition-colors cursor-pointer"
                        onClick={() => navigate(`/devices/${dev.id}`)}
                      >
                        <td className="py-3.5 px-4 font-semibold text-slate-900">{dev.name}</td>
                        <td className="py-3.5 px-4 text-slate-600">{dev.device_code}</td>
                        <td className="py-3.5 px-4">{dev.zone?.name || 'Chưa gán'}</td>
                        <td className="py-3.5 px-4">
                          <LifecycleBadge state={dev.lifecycle_state} />
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`font-semibold ${
                              liveOnline ? 'text-emerald-700' : 'text-slate-500'
                            }`}
                          >
                            {liveOnline ? 'Trực tuyến' : 'Ngoại tuyến'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => navigate(`/devices/${dev.id}`)}
                            className="px-3 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-[11px]"
                          >
                            Chi tiết &amp; Ngoại vi
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

      {/* MODAL: ONBOARD */}
      {isOnboardModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-emerald-600" />
                <h2 className="text-lg font-bold text-slate-900">Thêm Thiết bị Mới</h2>
              </div>
              <button onClick={closeOnboardModal} className="text-slate-400 hover:text-slate-700 text-sm">
                ✕
              </button>
            </div>

            <form onSubmit={handleOnboardSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Mã thiết bị *</label>
                <input
                  type="text"
                  placeholder="VD: DEV_SILO_03"
                  value={newDeviceCode}
                  onChange={(e) => setNewDeviceCode(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Tên hiển thị *</label>
                <input
                  type="text"
                  placeholder="VD: Cảm biến Kho Silo C1"
                  value={newDeviceName}
                  onChange={(e) => setNewDeviceName(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Khu vực kho *</label>
                <select
                  value={newZoneId}
                  onChange={(e) => setNewZoneId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500"
                >
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name} ({z.grain_type})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={closeOnboardModal}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 font-semibold text-xs"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingOnboard}
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 font-semibold text-xs"
                >
                  {isSubmittingOnboard ? 'Đang thêm...' : 'Thêm Thiết bị'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SUSPEND */}
      {suspendModalDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-rose-600">
              <ShieldAlert className="w-5 h-5" />
              <h2 className="text-base font-bold text-slate-900">Đình chỉ thiết bị</h2>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Thiết bị <strong>{suspendModalDevice.name}</strong> sẽ bị tạm ngưng kết nối cho đến khi được kích hoạt lại.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Lý do:</label>
              <textarea
                rows={3}
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl p-3 text-xs text-slate-900 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setSuspendModalDevice(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs"
              >
                Huỷ
              </button>
              <button
                type="button"
                onClick={handleSuspendSubmit}
                disabled={isSubmittingSuspend}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs"
              >
                {isSubmittingSuspend ? 'Đang xử lý...' : 'Xác nhận đình chỉ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDIT */}
      {editModalDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="text-base font-bold text-slate-900">
                Sửa thông tin {editModalDevice.name}
              </h2>
              <button onClick={() => setEditModalDevice(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Tên hiển thị *</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Khu vực kho *</label>
                <select
                  value={editZoneId}
                  onChange={(e) => setEditZoneId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500"
                >
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name} ({z.grain_type})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditModalDevice(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEdit}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs"
                >
                  {isSubmittingEdit ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
