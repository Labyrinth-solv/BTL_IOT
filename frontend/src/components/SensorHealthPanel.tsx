import React from 'react';
import {
  AlertOctagon,
  CheckCircle2,
  DoorClosed,
  DoorOpen,
  Info,
} from 'lucide-react';
import { PeripheralConfig, SensorHealth } from '../types';

interface SensorHealthPanelProps {
  sensorHealth?: SensorHealth | null;
  peripherals?: PeripheralConfig | null;
  doorOpen?: boolean | null;
  isOnline?: boolean;
  variant?: 'compact' | 'detailed';
}

const getStatusBadge = (ok: boolean, status?: string) => {
  if (ok && status === 'SIMULATED') {
    return (
      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
        Mô phỏng
      </span>
    );
  }
  if (ok) {
    return (
      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        Hoạt động tốt
      </span>
    );
  }
  return (
    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
      {status === 'READ_ERROR' ? 'Lỗi đọc dữ liệu' : 'Chưa kết nối'}
    </span>
  );
};

export const SensorHealthPanel: React.FC<SensorHealthPanelProps> = ({
  sensorHealth,
  peripherals,
  doorOpen,
  isOnline = true,
  variant = 'compact',
}) => {
  const ahtEnabled =
    peripherals?.aht20_enabled !== false &&
    sensorHealth?.aht20?.enabled !== false &&
    sensorHealth?.aht20?.status !== 'DISABLED';
  const mqEnabled =
    peripherals?.mq135_enabled === true &&
    sensorHealth?.mq135?.enabled !== false &&
    sensorHealth?.mq135?.status !== 'DISABLED';
  const doorEnabled =
    peripherals?.door_enabled !== false &&
    sensorHealth?.door_sensor?.enabled !== false &&
    sensorHealth?.door_sensor?.status !== 'DISABLED';

  if (!ahtEnabled && !mqEnabled && !doorEnabled) {
    return null;
  }

  if (!isOnline) {
    if (variant === 'detailed') {
      return (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-3 text-sm text-slate-600 shadow-sm">
          <Info className="w-4 h-4 text-slate-400 shrink-0" />
          <span>Thiết bị đang ngoại tuyến — Tạm ẩn trạng thái cảm biến.</span>
        </div>
      );
    }
    return null;
  }

  if (!sensorHealth) {
    if (variant === 'detailed') {
      return (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-3 text-sm text-slate-600 shadow-sm">
          <Info className="w-4 h-4 text-slate-400 shrink-0" />
          <span>Đang chờ dữ liệu kiểm tra cảm biến từ thiết bị.</span>
        </div>
      );
    }
    return null;
  }

  const aht = sensorHealth.aht20;
  const mq = sensorHealth.mq135;

  const ahtOk = !ahtEnabled || (aht ? aht.ok : true);
  const mqOk = !mqEnabled || (mq ? mq.ok : true);

  const faultyList: { name: string; detail: string }[] = [];
  if (ahtEnabled && !ahtOk) {
    faultyList.push({
      name: 'Cảm biến Nhiệt & Ẩm (AHT20)',
      detail: aht?.message || 'Chưa nhận được tín hiệu cảm biến',
    });
  }
  if (mqEnabled && !mqOk) {
    faultyList.push({
      name: 'Cảm biến Khí Gas (MQ-135)',
      detail: mq?.message || 'Chưa nhận được tín hiệu cảm biến',
    });
  }

  // Compact view inside Dashboard cards: ultra clean!
  if (variant === 'compact') {
    if (faultyList.length === 0 && !doorEnabled) {
      return null;
    }

    return (
      <div
        className={`mt-3 px-3.5 py-2.5 rounded-2xl border text-xs transition-all ${
          faultyList.length > 0
            ? 'bg-rose-50/70 border-rose-200 text-rose-800'
            : 'bg-slate-50 border-slate-200 text-slate-600'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 font-medium">
            {faultyList.length > 0 ? (
              <>
                <AlertOctagon className="w-4 h-4 text-rose-600 shrink-0" />
                <span>
                  Chưa nhận tín hiệu:{' '}
                  <strong className="font-semibold">
                    {faultyList.map((f) => f.name).join(', ')}
                  </strong>
                </span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Các cảm biến hoạt động bình thường</span>
              </>
            )}
          </div>

          {doorEnabled && typeof doorOpen === 'boolean' && (
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                doorOpen
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : 'bg-white text-slate-700 border-slate-200'
              }`}
            >
              {doorOpen ? (
                <DoorOpen className="w-3.5 h-3.5 text-amber-600" />
              ) : (
                <DoorClosed className="w-3.5 h-3.5 text-emerald-600" />
              )}
              Cửa kho: {doorOpen ? 'Đang mở' : 'Đang đóng'}
            </span>
          )}
        </div>
      </div>
    );
  }

  // Detailed view (DeviceDetailPage) — only attached sensors are shown
  const enabledCount = [ahtEnabled, mqEnabled, doorEnabled].filter(Boolean).length;
  const gridColsClass =
    enabledCount === 1
      ? 'grid-cols-1'
      : enabledCount === 2
      ? 'grid-cols-1 md:grid-cols-2'
      : 'grid-cols-1 md:grid-cols-3';

  return (
    <div
      className={`rounded-2xl p-5 border shadow-sm ${
        faultyList.length > 0
          ? 'bg-rose-50/40 border-rose-200'
          : 'bg-white border-slate-200'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          {faultyList.length > 0 ? (
            <AlertOctagon className="w-5 h-5 text-rose-600" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          )}
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Tình trạng cảm biến đang gắn
            </h3>
            <p className="text-xs text-slate-500">
              {faultyList.length > 0
                ? `Có ${faultyList.length} cảm biến đang mất kết nối hoặc chưa cắm dây`
                : 'Tất cả cảm biến đang gắn đều hoạt động ổn định'}
            </p>
          </div>
        </div>

        {doorEnabled && typeof doorOpen === 'boolean' && (
          <div
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border ${
              doorOpen
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
            }`}
          >
            {doorOpen ? <DoorOpen className="w-4 h-4" /> : <DoorClosed className="w-4 h-4" />}
            <span>Cửa kho: {doorOpen ? 'Đang mở' : 'Đang đóng'}</span>
          </div>
        )}
      </div>

      <div className={`grid ${gridColsClass} gap-3`}>
        {ahtEnabled && (
          <div
            className={`p-4 rounded-xl border ${
              ahtOk ? 'bg-slate-50 border-slate-200' : 'bg-white border-rose-200'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-800">Nhiệt &amp; Ẩm (AHT20)</span>
              {getStatusBadge(ahtOk, aht?.status)}
            </div>
            <p
              className={`text-xs mt-2 ${
                ahtOk ? 'text-slate-500' : 'text-rose-700 font-medium'
              }`}
            >
              {ahtOk
                ? 'Đang đo nhiệt độ và độ ẩm bình thường.'
                : aht?.message || 'Không tìm thấy cảm biến AHT20. Kiểm tra lại dây cắm hoặc nguồn.'}
            </p>
          </div>
        )}

        {mqEnabled && (
          <div
            className={`p-4 rounded-xl border ${
              mqOk ? 'bg-slate-50 border-slate-200' : 'bg-white border-rose-200'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-800">Khí Gas (MQ-135)</span>
              {getStatusBadge(mqOk, mq?.status)}
            </div>
            <p
              className={`text-xs mt-2 ${
                mqOk ? 'text-slate-500' : 'text-rose-700 font-medium'
              }`}
            >
              {mqOk
                ? 'Tín hiệu cảm biến khí gas ổn định.'
                : mq?.message || 'Chưa nhận được tín hiệu từ MQ-135.'}
            </p>
          </div>
        )}

        {doorEnabled && (
          <div className="p-4 rounded-xl border bg-slate-50 border-slate-200">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-800">Cảm biến Cửa Kho</span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                {typeof doorOpen === 'boolean'
                  ? doorOpen
                    ? 'Đang mở'
                    : 'Đang đóng'
                  : 'Đang theo dõi'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Theo dõi trạng thái đóng/mở cửa kho theo thời gian thực.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
