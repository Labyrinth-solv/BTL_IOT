import React from 'react';
import {
  AlertOctagon,
  CheckCircle2,
  Cpu,
  DoorClosed,
  DoorOpen,
  Info,
} from 'lucide-react';
import { SensorHealth } from '../types';

interface SensorHealthPanelProps {
  sensorHealth?: SensorHealth | null;
  doorOpen?: boolean | null;
  isOnline?: boolean;
  variant?: 'compact' | 'detailed';
}

const getStatusBadge = (ok: boolean, status?: string, enabled: boolean = true) => {
  if (!enabled || status === 'DISABLED') {
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
        ĐÃ TẮT
      </span>
    );
  }
  if (ok && status === 'SIMULATED') {
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
        MÔ PHỎNG
      </span>
    );
  }
  if (ok) {
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
        NHẬN DIỆN OK
      </span>
    );
  }
  const label =
    status === 'READ_ERROR'
      ? 'LỖI ĐỌC I2C'
      : status === 'OUT_OF_RANGE'
      ? 'QUÁ ÁP CHIA ÁP'
      : 'CHƯA CẮM / MẤT KẾT NỐI';

  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
      {label}
    </span>
  );
};

export const SensorHealthPanel: React.FC<SensorHealthPanelProps> = ({
  sensorHealth,
  doorOpen,
  isOnline = true,
  variant = 'compact',
}) => {
  if (!sensorHealth) {
    if (variant === 'detailed') {
      return (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center gap-3 text-xs text-slate-400">
          <Info className="w-4 h-4 text-slate-400 shrink-0" />
          <span>
            {isOnline
              ? 'Chưa nhận được gói chẩn đoán sensor_health từ thiết bị (hãy nạp lại firmware mới cho ESP32 nếu vừa cập nhật).'
              : 'Thiết bị đang OFFLINE, chưa có dữ liệu chẩn đoán cảm biến mới.'}
          </span>
        </div>
      );
    }

    return isOnline ? (
      <div className="mt-3 px-3 py-2 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center gap-2 text-[11px] text-slate-400">
        <Cpu className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        <span>Chưa có gói chẩn đoán cảm biến (chờ bản tin Telemetry mới từ ESP32)</span>
      </div>
    ) : null;
  }

  const aht = sensorHealth.aht20;
  const mq = sensorHealth.mq135;
  const door = sensorHealth.door_sensor;

  const ahtEnabled = aht?.enabled !== false && aht?.status !== 'DISABLED';
  const mqEnabled = mq?.enabled !== false && mq?.status !== 'DISABLED';
  const doorEnabled = door?.enabled !== false && door?.status !== 'DISABLED';

  const ahtOk = !ahtEnabled || (aht ? aht.ok : true);
  const mqOk = !mqEnabled || (mq ? mq.ok : true);
  const faultCount =
    sensorHealth.fault_count ??
    ((ahtEnabled && !ahtOk ? 1 : 0) + (mqEnabled && !mqOk ? 1 : 0));

  if (variant === 'compact') {
    return (
      <div
        className={`mt-3 p-3 rounded-2xl border text-xs transition-all ${
          faultCount > 0
            ? 'bg-rose-950/25 border-rose-500/40'
            : 'bg-slate-950/50 border-slate-800/80'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 font-semibold">
            {faultCount > 0 ? (
              <>
                <AlertOctagon className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
                <span className="text-rose-300">
                  Phát hiện {faultCount} cảm biến chưa kết nối / lỗi
                </span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300">Tình trạng phần cứng cảm biến</span>
              </>
            )}
          </div>

          {doorEnabled && typeof doorOpen === 'boolean' && (
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                doorOpen
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                  : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}
            >
              {doorOpen ? (
                <DoorOpen className="w-3 h-3 text-amber-400" />
              ) : (
                <DoorClosed className="w-3 h-3 text-emerald-400" />
              )}
              Cửa kho: {doorOpen ? 'ĐANG MỞ' : 'ĐANG ĐÓNG'}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {/* AHT20 */}
          <div
            className={`flex flex-col justify-between gap-1 px-2.5 py-2 rounded-xl border ${
              !ahtEnabled
                ? 'bg-slate-900/40 border-slate-800/70 opacity-65'
                : 'bg-slate-900/70 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="font-semibold text-slate-200 text-[11px]">AHT20</span>
              <span
                className={`text-[10px] font-bold ${
                  !ahtEnabled
                    ? 'text-slate-400'
                    : !ahtOk
                    ? 'text-rose-400'
                    : aht?.status === 'SIMULATED'
                    ? 'text-amber-300'
                    : 'text-emerald-400'
                }`}
              >
                {!ahtEnabled
                  ? 'ĐÃ TẮT'
                  : !ahtOk
                  ? 'KHÔNG NHẬN'
                  : aht?.status === 'SIMULATED'
                  ? 'MÔ PHỎNG'
                  : 'OK (0x38)'}
              </span>
            </div>
            {ahtEnabled && !ahtOk && aht?.message && (
              <span className="text-[10px] text-rose-300/90 leading-tight">{aht.message}</span>
            )}
          </div>

          {/* MQ-135 */}
          <div
            className={`flex flex-col justify-between gap-1 px-2.5 py-2 rounded-xl border ${
              !mqEnabled
                ? 'bg-slate-900/40 border-slate-800/70 opacity-65'
                : 'bg-slate-900/70 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="font-semibold text-slate-200 text-[11px]">MQ-135</span>
              <span
                className={`text-[10px] font-bold ${
                  !mqEnabled
                    ? 'text-slate-400'
                    : !mqOk
                    ? 'text-rose-400'
                    : mq?.status === 'SIMULATED'
                    ? 'text-amber-300'
                    : 'text-emerald-400'
                }`}
              >
                {!mqEnabled
                  ? 'ĐÃ TẮT'
                  : !mqOk
                  ? mq?.status === 'OUT_OF_RANGE'
                    ? 'QUÁ ÁP'
                    : 'MẤT TÍN HIỆU'
                  : mq?.status === 'SIMULATED'
                  ? 'MÔ PHỎNG'
                  : 'OK'}
                {mqEnabled && mq?.raw_adc !== undefined ? ` (${mq.raw_adc})` : ''}
              </span>
            </div>
            {mqEnabled && !mqOk && mq?.message && (
              <span className="text-[10px] text-rose-300/90 leading-tight">{mq.message}</span>
            )}
          </div>

          {/* Door Sensor */}
          <div
            className={`flex flex-col justify-between gap-1 px-2.5 py-2 rounded-xl border ${
              !doorEnabled
                ? 'bg-slate-900/40 border-slate-800/70 opacity-65'
                : 'bg-slate-900/70 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="font-semibold text-slate-200 text-[11px]">Cảm biến cửa</span>
              <span
                className={`text-[10px] font-semibold ${
                  !doorEnabled ? 'text-slate-400 font-bold' : 'text-sky-300'
                }`}
              >
                {!doorEnabled ? 'ĐÃ TẮT' : `GPIO27 = ${door?.raw_logic ?? (doorOpen ? 1 : 0)}`}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 leading-tight">
              {!doorEnabled
                ? 'Module đã tắt theo dõi'
                : 'Digital 1-bit (không tự nhận rút dây)'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Detailed view (DeviceDetailPage)
  return (
    <div
      className={`rounded-3xl p-5 border shadow-lg ${
        faultCount > 0
          ? 'bg-rose-950/20 border-rose-500/40'
          : 'bg-slate-900 border-slate-800'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          {faultCount > 0 ? (
            <AlertOctagon className="w-5 h-5 text-rose-400 animate-pulse" />
          ) : (
            <Cpu className="w-5 h-5 text-emerald-400" />
          )}
          <div>
            <h3 className="text-sm font-bold text-slate-100">
              Chẩn Đoán Trạng Thái Cảm Biến Phần Cứng (Realtime)
            </h3>
            <p className="text-xs text-slate-400">
              {faultCount > 0
                ? `ESP32 đang báo ${faultCount} cảm biến không nhận diện được hoặc mất tín hiệu`
                : 'Các cảm biến đo lường chính (I2C AHT20 & ADC MQ-135) đang hoạt động bình thường'}
            </p>
          </div>
        </div>

        {doorEnabled && typeof doorOpen === 'boolean' && (
          <div
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border ${
              doorOpen
                ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
            }`}
          >
            {doorOpen ? <DoorOpen className="w-4 h-4" /> : <DoorClosed className="w-4 h-4" />}
            <span>Trạng thái cửa kho: {doorOpen ? 'ĐANG MỞ' : 'ĐANG ĐÓNG'}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: AHT20 */}
        <div
          className={`p-4 rounded-2xl border ${
            !ahtEnabled
              ? 'bg-slate-950/40 border-slate-800/70 opacity-70'
              : ahtOk
              ? 'bg-slate-950/60 border-slate-800'
              : 'bg-rose-950/30 border-rose-500/50'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-200">1. Cảm biến Nhiệt &amp; Ẩm AHT20</span>
            {getStatusBadge(ahtOk, aht?.status, ahtEnabled)}
          </div>
          <div className="text-[11px] text-slate-400 mt-2">
            Chân kết nối: <span className="font-mono text-slate-300">{aht?.pin || 'I2C 0x38 (SDA21/SCL22)'}</span>
          </div>
          <div
            className={`text-xs mt-1.5 ${
              !ahtEnabled ? 'text-slate-400' : ahtOk ? 'text-slate-300' : 'text-rose-300 font-medium'
            }`}
          >
            {!ahtEnabled
              ? 'Module đã được tắt trên cấu hình node'
              : aht?.message || (ahtOk ? 'Đọc I2C ổn định' : 'Không tìm thấy AHT20 trên bus I2C')}
          </div>
        </div>

        {/* Card 2: MQ-135 */}
        <div
          className={`p-4 rounded-2xl border ${
            !mqEnabled
              ? 'bg-slate-950/40 border-slate-800/70 opacity-70'
              : mqOk
              ? 'bg-slate-950/60 border-slate-800'
              : 'bg-rose-950/30 border-rose-500/50'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-200">2. Cảm biến Khí Gas MQ-135</span>
            {getStatusBadge(mqOk, mq?.status, mqEnabled)}
          </div>
          <div className="text-[11px] text-slate-400 mt-2 flex items-center justify-between">
            <span>
              Chân: <span className="font-mono text-slate-300">{mq?.pin || 'GPIO34'}</span>
            </span>
            <span>
              ADC thô:{' '}
              <span className="font-mono font-bold text-amber-300">
                {mqEnabled ? mq?.raw_adc ?? '--' : '--'}
              </span>
            </span>
          </div>
          <div
            className={`text-xs mt-1.5 ${
              !mqEnabled ? 'text-slate-400' : mqOk ? 'text-slate-300' : 'text-rose-300 font-medium'
            }`}
          >
            {!mqEnabled
              ? 'Module đã được tắt trên cấu hình node'
              : mq?.message || (mqOk ? 'Tín hiệu analog hợp lệ' : 'Mất tín hiệu hoặc chưa cấp nguồn 5V')}
          </div>
        </div>

        {/* Card 3: Door Sensor */}
        <div
          className={`p-4 rounded-2xl border ${
            !doorEnabled
              ? 'bg-slate-950/40 border-slate-800/70 opacity-70'
              : 'bg-slate-950/60 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-200">3. Cảm biến Từ Cửa Kho</span>
            {doorEnabled ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/15 text-sky-300 border border-sky-500/30">
                DIGITAL 1-BIT
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                ĐÃ TẮT
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-400 mt-2 flex items-center justify-between">
            <span>
              Chân: <span className="font-mono text-slate-300">{door?.pin || 'GPIO27'}</span>
            </span>
            <span>
              Logic đo:{' '}
              <span className="font-mono font-bold text-sky-300">
                {!doorEnabled
                  ? '--'
                  : door?.raw_logic !== undefined
                  ? door.raw_logic
                    ? 'HIGH (1)'
                    : 'LOW (0)'
                  : '--'}
              </span>
            </span>
          </div>
          <div className="text-xs text-slate-400 mt-1.5">
            {door?.message || 'Cảm biến từ chỉ xuất 1 bit đóng/mở nên không tự phát hiện rút dây.'}
          </div>
        </div>
      </div>
    </div>
  );
};
