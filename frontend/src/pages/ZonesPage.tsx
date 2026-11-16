import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { WarehouseZone, User } from '../types';
import {
  Warehouse,
  Plus,
  RefreshCw,
  Droplets,
  Layers,
  User as UserIcon,
  Cpu,
  FileText,
  Pencil,
  Trash2,
} from 'lucide-react';

export const ZonesPage: React.FC = () => {
  const { isAdmin, showToast } = useAuth();
  const [zones, setZones] = useState<WarehouseZone[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal Create / Edit Zone
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<WarehouseZone | null>(null);
  const [zoneName, setZoneName] = useState('');
  const [grainType, setGrainType] = useState('Thóc tẻ');
  const [targetMc, setTargetMc] = useState(14.0);
  const [maxRh, setMaxRh] = useState(65.0);
  const [managerId, setManagerId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [zRes, uRes] = await Promise.all([
        api.getZones(),
        isAdmin
          ? api.getUsers().catch(() => ({ success: true, data: [] }))
          : Promise.resolve({ success: true, data: [] }),
      ]);

      if (zRes.success) setZones(zRes.data);
      if (uRes.success && uRes.data) {
        setUsers(uRes.data);
        if (uRes.data.length > 0 && !managerId) {
          setManagerId(uRes.data[0].id);
        }
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi tải danh sách khu vực kho', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openCreateModal = () => {
    setEditingZone(null);
    setZoneName('');
    setGrainType('Thóc tẻ');
    setTargetMc(14.0);
    setMaxRh(65.0);
    if (users.length > 0) setManagerId(users[0].id);
    setIsModalOpen(true);
  };

  const openEditModal = (zone: WarehouseZone) => {
    setEditingZone(zone);
    setZoneName(zone.name);
    setGrainType(zone.grain_type);
    setTargetMc(zone.target_mc);
    setMaxRh(zone.max_rh);
    setManagerId(zone.manager_id || users[0]?.id || '');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!zoneName.trim()) {
      showToast('Vui lòng nhập tên khu vực kho!', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: zoneName.trim(),
        grain_type: grainType.trim(),
        target_mc: Number(targetMc),
        max_rh: Number(maxRh),
        ...(managerId ? { manager_id: managerId } : {}),
      };

      const res = editingZone
        ? await api.updateZone(editingZone.id, payload)
        : await api.createZone(payload);

      if (res.success) {
        showToast(
          editingZone ? `Đã cập nhật kho "${zoneName}"` : `Đã thêm khu vực kho "${zoneName}"`,
          'success'
        );
        setIsModalOpen(false);
        setEditingZone(null);
        fetchData();
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi lưu khu vực kho', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteZone = async (zone: WarehouseZone) => {
    if (zone.devices && zone.devices.length > 0) {
      showToast(
        `Không thể xóa "${zone.name}" vì đang có ${zone.devices.length} thiết bị trong kho. Hãy chuyển hoặc xóa thiết bị trước!`,
        'warning'
      );
      return;
    }

    if (!window.confirm(`Bạn có chắc muốn xóa khu vực kho "${zone.name}" không?`)) {
      return;
    }

    try {
      const res = await api.deleteZone(zone.id);
      if (res.success) {
        showToast(res.message || `Đã xóa khu vực kho "${zone.name}"`, 'success');
        fetchData();
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi xóa khu vực kho', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Warehouse className="w-6 h-6 text-emerald-600" />
            <span>Khu vực Kho Silo</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Quản lý các khu vực bảo quản ngũ cốc và ngưỡng độ ẩm mục tiêu
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
              onClick={openCreateModal}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm transition"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm Khu Vực</span>
            </button>
          )}
        </div>
      </div>

      {/* TCVN Banner */}
      <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 flex items-start gap-3.5">
        <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
          <FileText className="w-5 h-5" />
        </div>
        <div className="text-xs space-y-1">
          <div className="font-bold text-amber-900 text-sm">
            Ngưỡng bảo quản an toàn
          </div>
          <div className="text-amber-800 leading-relaxed">
            Độ ẩm hạt an toàn không vượt quá <strong>14.0% – 14.5%</strong> và độ ẩm không khí không vượt quá <strong>65%</strong>.
          </div>
        </div>
      </div>

      {/* Zones Grid */}
      {zones.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-slate-500 shadow-sm">
          <Warehouse className="w-10 h-10 mx-auto text-slate-300 mb-2" />
          <div className="font-semibold text-slate-800 text-sm">Chưa có khu vực kho nào</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {zones.map((zone) => (
            <div
              key={zone.id}
              className="bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-5 shadow-sm transition-all space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                    {zone.grain_type}
                  </span>
                  <h3 className="text-lg font-bold text-slate-900 mt-2">{zone.name}</h3>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full shrink-0">
                  <Cpu className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{zone.devices ? zone.devices.length : 0} thiết bị</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                    <Droplets className="w-3.5 h-3.5 text-amber-600" />
                    <span>Ẩm hạt mục tiêu</span>
                  </div>
                  <div className="text-xl font-bold text-slate-900 mt-1">
                    {zone.target_mc}%
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                    <Layers className="w-3.5 h-3.5 text-sky-600" />
                    <span>Ẩm không khí tối đa</span>
                  </div>
                  <div className="text-xl font-bold text-slate-900 mt-1">
                    {zone.max_rh}%
                  </div>
                </div>
              </div>

              <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-3 text-xs text-slate-500">
                <div className="flex items-center gap-2">
                  <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    Phụ trách:{' '}
                    <strong className="text-slate-800">
                      {zone.manager?.full_name || 'Chưa gán'}
                    </strong>
                  </span>
                </div>

                {isAdmin && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEditModal(zone)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-semibold transition"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Sửa</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteZone(zone)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 font-semibold transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Xóa</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Add / Edit Zone */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Warehouse className="w-5 h-5 text-emerald-600" />
                <h2 className="text-base font-bold text-slate-900">
                  {editingZone ? 'Chỉnh Sửa Khu Vực Kho' : 'Thêm Khu Vực Kho Mới'}
                </h2>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Tên khu vực *</label>
                <input
                  type="text"
                  placeholder="VD: Silo Thóc Tẻ C1"
                  value={zoneName}
                  onChange={(e) => setZoneName(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Loại ngũ cốc</label>
                <input
                  type="text"
                  placeholder="VD: Thóc tẻ, Lúa mì, Ngô hạt..."
                  value={grainType}
                  onChange={(e) => setGrainType(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Ẩm hạt mục tiêu (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={targetMc}
                    onChange={(e) => setTargetMc(parseFloat(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Ẩm khí tối đa (%)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={maxRh}
                    onChange={(e) => setMaxRh(parseFloat(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Người phụ trách</label>
                <select
                  value={managerId}
                  onChange={(e) => setManagerId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-emerald-500"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} ({u.email})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs"
                >
                  {isSubmitting ? 'Đang lưu...' : editingZone ? 'Lưu thay đổi' : 'Lưu khu vực'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
