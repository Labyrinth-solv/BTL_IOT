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
  CheckCircle2,
  AlertCircle,
  FileText,
} from 'lucide-react';

export const ZonesPage: React.FC = () => {
  const { isViewer, showToast } = useAuth();
  const [zones, setZones] = useState<WarehouseZone[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [zoneName, setZoneName] = useState('');
  const [grainType, setGrainType] = useState('Lúa mì');
  const [targetMc, setTargetMc] = useState(14.0);
  const [maxRh, setMaxRh] = useState(65.0);
  const [managerId, setManagerId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [zRes, uRes] = await Promise.all([
        api.getZones(),
        api.getUsers().catch(() => ({ success: true, data: [] })),
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

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!zoneName || !managerId) {
      showToast('Vui lòng điền đầy đủ tên khu vực và người quản lý!', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.createZone({
        name: zoneName.trim(),
        grain_type: grainType.trim(),
        target_mc: Number(targetMc),
        max_rh: Number(maxRh),
        manager_id: managerId,
      });

      if (res.success) {
        showToast(`Đã thêm khu vực kho mới: ${zoneName}`, 'success');
        setIsModalOpen(false);
        setZoneName('');
        fetchData();
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi tạo khu vực kho', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Warehouse className="w-7 h-7 text-amber-500" />
            <span>Khu vực Kho Silo & Tiêu chuẩn TCVN 8370</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Quy hoạch các vùng bảo quản ngũ cốc chuyên dụng, ngưỡng EMC và độ ẩm an toàn hạt
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
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Thêm Khu Vực Silo</span>
            </button>
          )}
        </div>
      </div>

      {/* TCVN Banner */}
      <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 rounded-2xl p-4 flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
          <FileText className="w-5 h-5" />
        </div>
        <div className="text-xs space-y-1">
          <div className="font-bold text-amber-300 text-sm">
            Quy chuẩn Quốc Gia TCVN 8370:2018 - Yêu cầu kỹ thuật bảo quản thóc gạo & ngũ cốc
          </div>
          <div className="text-slate-300 leading-relaxed">
            Hạt ngũ cốc duy trì chất lượng tốt nhất khi độ ẩm hạt (Moisture Content - MC) không vượt quá{' '}
            <strong className="text-amber-300">14.0% - 14.5%</strong> và độ ẩm tương đối của không khí kho không vượt quá{' '}
            <strong className="text-amber-300">65% RH</strong>. Khi độ ẩm hoặc EMC tăng cao, hệ thống kích hoạt quạt thông gió để giải phóng nhiệt ẩm và ngăn ngừa nấm mốc lên men.
          </div>
        </div>
      </div>

      {/* Zones Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {zones.map((zone) => (
          <div
            key={zone.id}
            className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 shadow-xl transition-all space-y-4"
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 uppercase tracking-wider">
                  {zone.grain_type}
                </span>
                <h3 className="text-lg font-bold text-slate-100 mt-1.5">{zone.name}</h3>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-500">Mã định danh</span>
                <div className="font-mono text-xs text-slate-400 font-semibold">{zone.id}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800/80">
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                  <Droplets className="w-3.5 h-3.5 text-amber-400" />
                  <span>Target MC (Độ ẩm mục tiêu)</span>
                </div>
                <div className="text-xl font-bold text-amber-400 mt-1 font-mono">
                  {zone.target_mc}%
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Tiêu chuẩn hạt an toàn</div>
              </div>

              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                  <Layers className="w-3.5 h-3.5 text-sky-400" />
                  <span>Max RH (Ngưỡng ẩm khí)</span>
                </div>
                <div className="text-xl font-bold text-sky-400 mt-1 font-mono">
                  {zone.max_rh}%
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Kích hoạt quạt thông gió</div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <UserIcon className="w-3.5 h-3.5 text-slate-500" />
                <span>
                  Quản lý:{' '}
                  <strong className="text-slate-300">
                    {zone.manager?.full_name || 'Chưa gán'}
                  </strong>
                </span>
              </div>

              <div className="flex items-center gap-1.5 text-slate-300">
                <Cpu className="w-3.5 h-3.5 text-amber-500" />
                <span>
                  {zone.devices ? zone.devices.length : 1} Cảm biến Silo
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal Add Zone */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Warehouse className="w-5 h-5 text-amber-500" />
                <h2 className="text-base font-bold text-slate-100">Thêm Khu Vực Silo Mới</h2>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Tên Khu Vực Silo *</label>
                <input
                  type="text"
                  placeholder="VD: Silo Lúa Mì Nam Định 03"
                  value={zoneName}
                  onChange={(e) => setZoneName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Loại Ngũ Cốc</label>
                <input
                  type="text"
                  placeholder="VD: Lúa mì, Ngô hạt, Thóc tẻ..."
                  value={grainType}
                  onChange={(e) => setGrainType(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Target MC (%) - TCVN
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={targetMc}
                    onChange={(e) => setTargetMc(parseFloat(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Max RH (%) Ngưỡng ẩm
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={maxRh}
                    onChange={(e) => setMaxRh(parseFloat(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Người Quản Lý Phụ Trách</label>
                <select
                  value={managerId}
                  onChange={(e) => setManagerId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-500"
                  required
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} ({u.role} - {u.email})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
                >
                  {isSubmitting ? 'Đang tạo...' : 'Lưu Khu Vực'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
