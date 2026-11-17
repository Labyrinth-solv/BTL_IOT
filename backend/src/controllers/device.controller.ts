import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import prisma from '../config/prisma';
import { AuditService } from '../services/audit.service';
import { MQTTService } from '../services/mqtt.service';
import { SocketService } from '../services/socket.service';
import { LifecycleState, Role } from '@prisma/client';
import { DeviceCommandError, validateDeviceConfig } from '../services/deviceConfig';

export class DeviceController {
  private static emitLifecycle(device: any): void {
    if (!device.is_online) MQTTService.clearDeviceDiagnostics(device.device_code);
    SocketService.emitDeviceStatus({
      device_id: device.device_code, device_db_id: device.id,
      is_online: device.is_online, state: device.is_online ? 'ONLINE' : 'OFFLINE',
      lifecycle_state: device.lifecycle_state,
    });
  }

  /**
   * Lấy danh sách thiết bị (lọc theo quyền RBAC)
   */
  static async getAll(req: Request, res: Response): Promise<void> {
    try {
      // Mode demo: Trả về toàn bộ thiết bị trong hệ thống
      const devices = await prisma.device.findMany({
        include: {
          zone: { select: { id: true, name: true, grain_type: true } },
          telemetry_logs: {
            take: 1,
            orderBy: { recorded_at: 'desc' },
          },
        },
        orderBy: { created_at: 'desc' },
      });

      const enrichedDevices = devices.map((dev) => {
        const diag = MQTTService.getDeviceDiagnostics(dev.device_code);
        return {
          ...dev,
          sensor_health: diag?.sensor_health ?? null,
          door_open: diag?.door_open ?? null,
          control_mode: diag?.control_mode ?? null,
          fan_state: diag?.fan_state ?? null,
          buzzer_state: diag?.buzzer_state ?? null,
          custom_peripherals: diag?.custom_peripherals ?? [],
          ip_address: diag?.ip_address ?? null,
          mac_address: diag?.mac_address ?? null,
          chip_id: diag?.chip_id ?? null,
          rssi: diag?.rssi ?? null,
        };
      });

      res.status(200).json({ success: true, data: enrichedDevices });
    } catch (error) {
      console.error('[DeviceController.getAll]', error);
      res.status(500).json({ success: false, message: 'Lỗi khi lấy danh sách thiết bị' });
    }
  }

  /**
   * Lấy danh sách thiết bị ESP32 vừa kết nối MQTT nhưng chưa đăng ký vào DB
   */
  static async getDiscovered(_req: Request, res: Response): Promise<void> {
    try {
      const nodes = MQTTService.getDiscoveredNodes();
      res.status(200).json({ success: true, data: nodes });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Lỗi khi lấy danh sách thiết bị vừa phát hiện' });
    }
  }

  /**
   * Xem chi tiết 1 thiết bị
   */
  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;

      const device = await prisma.device.findFirst({
        where: {
          OR: [{ id }, { device_code: id }],
        },
        include: {
          zone: true,
          telemetry_logs: {
            take: 20,
            orderBy: { recorded_at: 'desc' },
          },
          commands: {
            take: 10,
            orderBy: { created_at: 'desc' },
            include: { issued_by: { select: { id: true, full_name: true, email: true } } },
          },
          alerts: {
            take: 5,
            orderBy: { created_at: 'desc' },
          },
        },
      });

      if (!device) {
        res.status(404).json({ success: false, message: 'Không tìm thấy thiết bị' });
        return;
      }

      const diag = MQTTService.getDeviceDiagnostics(device.device_code);
      res.status(200).json({
        success: true,
        data: {
          ...device,
          sensor_health: diag?.sensor_health ?? null,
          door_open: diag?.door_open ?? null,
          control_mode: diag?.control_mode ?? null,
          fan_state: diag?.fan_state ?? null,
          buzzer_state: diag?.buzzer_state ?? null,
          custom_peripherals: diag?.custom_peripherals ?? [],
          ip_address: diag?.ip_address ?? null,
          mac_address: diag?.mac_address ?? null,
          chip_id: diag?.chip_id ?? null,
          rssi: diag?.rssi ?? null,
        },
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Lỗi khi lấy chi tiết thiết bị' });
    }
  }

  /**
   * Bước 1 & 2: Onboarding thiết bị mới và cấp Secret Token (ADMIN ONLY)
   */
  static async onboard(req: Request, res: Response): Promise<void> {
    try {
      const { device_code, name, zone_id, hw_version, fw_version } = req.body;

      const trimmedCode = typeof device_code === 'string' ? device_code.trim() : '';
      if (!trimmedCode || !name || !zone_id) {
        res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc (device_code, name, zone_id)' });
        return;
      }

      const existing = await prisma.device.findUnique({ where: { device_code: trimmedCode } });
      if (existing) {
        res.status(400).json({ success: false, message: `Mã thiết bị '${trimmedCode}' đã tồn tại` });
        return;
      }

      const discoveredNode = MQTTService.getDiscoveredNodes().find((n) => n.device_code === trimmedCode);

      // Sinh secret token ngẫu nhiên riêng biệt cho thiết bị
      const rawSecretToken = `sec_${crypto.randomBytes(16).toString('hex')}`;
      const hashedToken = await bcrypt.hash(rawSecretToken, 10);

      const device = await prisma.device.create({
        data: {
          device_code: trimmedCode,
          name: String(name).trim(),
          secret_token_hash: hashedToken,
          zone_id,
          lifecycle_state: LifecycleState.REGISTERED,
          hw_version: hw_version || discoveredNode?.hw_version || 'ESP32-WROOM-32D-v2',
          fw_version: fw_version || discoveredNode?.fw_version || '1.1.1',
          config_json: {
            sampling_interval_ms: 3000,
            temp_warn_threshold: 25.0,
            temp_crit_threshold: 28.0,
            hum_warn_threshold: 65.0,
            hum_crit_threshold: 70.0,
            emc_warn_threshold: 14.0,
            emc_crit_threshold: 14.8,
            gas_warn_threshold: 600.0,
            gas_crit_threshold: 700.0,
            peripherals: {
              aht20_enabled: true,
              mq135_enabled: false,
              door_enabled: true,
              fan_enabled: true,
              fan_auto: true,
              buzzer_enabled: true,
              buzzer_auto: true,
            },
          },
        },
        include: {
          zone: { select: { id: true, name: true, grain_type: true } },
        },
      });

      MQTTService.removeDiscoveredNode(trimmedCode);

      const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';

      await AuditService.log({
        actor_id: req.user!.id,
        action: 'DEVICE_ONBOARDED',
        target_type: 'DEVICE',
        target_id: device.id,
        ip_address: clientIp,
        details_json: { device_code: trimmedCode, zone_id },
      });

      // Trả về secret token MỘT LẦN DUY NHẤT để người dùng nạp vào vi điều khiển
      res.status(201).json({
        success: true,
        message: 'Đăng ký thiết bị thành công! Hãy lưu lại secret_token vì nó sẽ không hiển thị lại.',
        data: {
          device,
          secret_token: rawSecretToken,
        },
      });
    } catch (error) {
      console.error('[DeviceController.onboard]', error);
      res.status(500).json({ success: false, message: 'Lỗi khi đăng ký thiết bị mới' });
    }
  }

  /**
   * Bước 3: Gán khu vực kho và cấu hình ban đầu (PROVISIONED)
   */
  static async provision(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const { zone_id, config_json } = req.body;

      const device = await prisma.device.update({
        where: { id },
        data: {
          zone_id: zone_id || undefined,
          config_json: config_json || undefined,
          lifecycle_state: LifecycleState.PROVISIONED,
        },
      });

      await AuditService.log({
        actor_id: req.user!.id,
        action: 'DEVICE_PROVISIONED',
        target_type: 'DEVICE',
        target_id: device.id,
        details_json: { zone_id, config_json },
      });

      res.status(200).json({ success: true, message: 'Đã gán cấu hình thiết bị (PROVISIONED)', data: device });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Lỗi khi gán cấu hình thiết bị' });
    }
  }

  /**
   * Bước 4: Kích hoạt thiết bị sang ACTIVE
   */
  static async activate(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;

      const device = await prisma.device.update({
        where: { id },
        data: { lifecycle_state: LifecycleState.ACTIVE },
      });

      DeviceController.emitLifecycle(device);

      await AuditService.log({
        actor_id: req.user!.id,
        action: 'DEVICE_ACTIVATED',
        target_type: 'DEVICE',
        target_id: device.id,
      });

      res.status(200).json({ success: true, message: 'Kích hoạt thiết bị thành công', data: device });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Lỗi khi kích hoạt thiết bị' });
    }
  }

  /**
   * Bước 7/8: Đưa vào bảo trì (MAINTENANCE) hoặc hoàn tất bảo trì về ACTIVE
   */
  static async toggleMaintenance(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const { maintenance_mode } = req.body; // true hoặc false

      const targetState = maintenance_mode ? LifecycleState.MAINTENANCE : LifecycleState.ACTIVE;

      const device = await prisma.device.update({
        where: { id },
        data: { lifecycle_state: targetState },
      });

      DeviceController.emitLifecycle(device);

      await AuditService.log({
        actor_id: req.user!.id,
        action: maintenance_mode ? 'DEVICE_ENTER_MAINTENANCE' : 'DEVICE_EXIT_MAINTENANCE',
        target_type: 'DEVICE',
        target_id: device.id,
      });

      res.status(200).json({
        success: true,
        message: maintenance_mode ? 'Đã chuyển thiết bị sang chế độ BẢO TRÌ' : 'Đã kết thúc bảo trì, thiết bị ACTIVE',
        data: device,
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Lỗi khi cập nhật trạng thái bảo trì' });
    }
  }

  /**
   * Bước 9: Tạm khóa thiết bị (SUSPENDED) do vi phạm an ninh (ADMIN ONLY)
   */
  static async suspend(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const { reason } = req.body;

      const device = await prisma.device.update({
        where: { id },
        data: { lifecycle_state: LifecycleState.SUSPENDED, is_online: false },
      });

      DeviceController.emitLifecycle(device);

      await AuditService.log({
        actor_id: req.user!.id,
        action: 'DEVICE_SUSPENDED',
        target_type: 'DEVICE',
        target_id: device.id,
        details_json: { reason: reason || 'Khóa bởi quản trị viên' },
      });

      res.status(200).json({
        success: true,
        message: `Đã khóa quyền thiết bị ${device.device_code} (SUSPENDED)`,
        data: device,
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Lỗi khi khóa thiết bị' });
    }
  }

  /**
   * Mở khóa thiết bị từ SUSPENDED về ACTIVE (ADMIN ONLY)
   */
  static async unsuspend(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;

      const device = await prisma.device.update({
        where: { id },
        data: { lifecycle_state: LifecycleState.ACTIVE },
      });

      DeviceController.emitLifecycle(device);

      await AuditService.log({
        actor_id: req.user!.id,
        action: 'DEVICE_UNSUSPENDED',
        target_type: 'DEVICE',
        target_id: device.id,
      });

      res.status(200).json({ success: true, message: 'Đã mở khóa thiết bị thành công', data: device });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Lỗi khi mở khóa thiết bị' });
    }
  }

  /**
   * Bước 10: Ngừng sử dụng vĩnh viễn (DECOMMISSIONED) (ADMIN ONLY)
   */
  static async decommission(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;

      const device = await prisma.device.update({
        where: { id },
        data: { lifecycle_state: LifecycleState.DECOMMISSIONED, is_online: false },
      });

      DeviceController.emitLifecycle(device);

      await AuditService.log({
        actor_id: req.user!.id,
        action: 'DEVICE_DECOMMISSIONED',
        target_type: 'DEVICE',
        target_id: device.id,
      });

      res.status(200).json({
        success: true,
        message: `Đã hủy kích hoạt vĩnh viễn thiết bị ${device.device_code} (DECOMMISSIONED)`,
        data: device,
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Lỗi khi loại bỏ thiết bị' });
    }
  }

  /**
   * Cập nhật thông tin thiết bị (Tên, Khu vực kho, Phiên bản FW/HW)
   */
  static async update(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const { name, zone_id, hw_version, fw_version } = req.body;

      const existing = await prisma.device.findFirst({
        where: { OR: [{ id }, { device_code: id }] },
      });
      if (!existing) {
        res.status(404).json({ success: false, message: 'Không tìm thấy thiết bị' });
        return;
      }

      if (zone_id) {
        const zoneExists = await prisma.warehouseZone.findUnique({ where: { id: zone_id } });
        if (!zoneExists) {
          res.status(400).json({ success: false, message: 'Khu vực kho không tồn tại' });
          return;
        }
      }

      const device = await prisma.device.update({
        where: { id: existing.id },
        data: {
          ...(name !== undefined ? { name: String(name).trim() } : {}),
          ...(zone_id ? { zone_id } : {}),
          ...(hw_version !== undefined ? { hw_version: String(hw_version).trim() } : {}),
          ...(fw_version !== undefined ? { fw_version: String(fw_version).trim() } : {}),
        },
        include: {
          zone: { select: { id: true, name: true, grain_type: true } },
        },
      });

      await AuditService.log({
        actor_id: req.user!.id,
        action: 'DEVICE_UPDATED',
        target_type: 'DEVICE',
        target_id: device.id,
        details_json: { name, zone_id, hw_version, fw_version },
      });

      res.status(200).json({
        success: true,
        message: `Đã cập nhật thiết bị ${device.device_code}`,
        data: device,
      });
    } catch (error) {
      console.error('[DeviceController.update]', error);
      res.status(500).json({ success: false, message: 'Lỗi khi cập nhật thông tin thiết bị' });
    }
  }

  /**
   * Cấp lại Secret Token mới cho thiết bị (ADMIN ONLY)
   */
  static async rotateToken(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;

      const existing = await prisma.device.findFirst({
        where: { OR: [{ id }, { device_code: id }] },
      });
      if (!existing) {
        res.status(404).json({ success: false, message: 'Không tìm thấy thiết bị' });
        return;
      }

      const rawSecretToken = `sec_${crypto.randomBytes(16).toString('hex')}`;
      const hashedToken = await bcrypt.hash(rawSecretToken, 10);

      const device = await prisma.device.update({
        where: { id: existing.id },
        data: { secret_token_hash: hashedToken },
      });

      await AuditService.log({
        actor_id: req.user!.id,
        action: 'DEVICE_TOKEN_ROTATED',
        target_type: 'DEVICE',
        target_id: device.id,
        details_json: { device_code: device.device_code },
      });

      res.status(200).json({
        success: true,
        message: `Đã cấp lại Secret Token mới cho ${device.device_code}`,
        data: {
          device,
          secret_token: rawSecretToken,
        },
      });
    } catch (error) {
      console.error('[DeviceController.rotateToken]', error);
      res.status(500).json({ success: false, message: 'Lỗi khi cấp lại token thiết bị' });
    }
  }

  /**
   * Xóa vĩnh viễn thiết bị và toàn bộ log liên quan khỏi CSDL (ADMIN ONLY)
   */
  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;

      const existing = await prisma.device.findFirst({
        where: { OR: [{ id }, { device_code: id }] },
      });
      if (!existing) {
        res.status(404).json({ success: false, message: 'Không tìm thấy thiết bị' });
        return;
      }

      await MQTTService.withDeactivatedNode(existing, req.user!.id, async () => {
        await prisma.$transaction(async (tx) => {
          await tx.telemetryLog.deleteMany({ where: { device_id: existing.id } });
          await tx.alert.deleteMany({ where: { device_id: existing.id } });
          await tx.deviceCommand.deleteMany({ where: { device_id: existing.id } });
          await tx.device.delete({ where: { id: existing.id } });
        });
      });

      MQTTService.clearDeviceDiagnostics(existing.device_code);
      MQTTService.removeDiscoveredNode(existing.device_code);

      await AuditService.log({
        actor_id: req.user!.id,
        action: 'DEVICE_DELETED',
        target_type: 'DEVICE',
        target_id: existing.id,
        details_json: { device_code: existing.device_code, name: existing.name },
      });

      res.status(200).json({
        success: true,
        message: `Đã tắt và khóa đầu ra, xóa vĩnh viễn node ${existing.device_code}. Đăng ký lại để cho phép hoạt động`,
      });
    } catch (error) {
      console.error('[DeviceController.remove]', error);
      res.status(error instanceof DeviceCommandError ? error.statusCode : 500).json({
        success: false,
        message: error instanceof DeviceCommandError ? error.message : 'Chưa xóa được node; nếu mạch đã tắt đầu ra, đầu ra vẫn được khóa. Vui lòng thử lại',
      });
    }
  }

  /**
   * Cập nhật cấu hình từ xa (UPDATE_CONFIG) qua MQTT /cmd
   */
  static async updateConfig(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const configPayload = req.body;

      // Chỉ Chủ kho (ADMIN) mới được thêm, xóa hoặc bật/tắt thiết bị ngoại vi & GPIO
      const isModifyingPeripherals =
        configPayload.peripherals !== undefined ||
        configPayload.custom_peripherals !== undefined;
      if (isModifyingPeripherals && req.user!.role !== Role.ADMIN) {
        await AuditService.log({
          actor_id: req.user!.id,
          action: 'SECURITY_VIOLATION_403',
          target_type: 'DEVICE',
          target_id: id,
          details_json: {
            reason: 'Non-ADMIN attempted to modify hardware peripherals/GPIO config',
            role: req.user!.role,
          },
        });
        res.status(403).json({
          success: false,
          message: 'Chỉ Chủ kho (Admin) mới có quyền thêm, xóa hoặc cấu hình thiết bị ngoại vi (403 Forbidden)',
        });
        return;
      }

      const device = await prisma.device.findFirst({
        where: { OR: [{ id }, { device_code: id }] },
      });
      if (!device) {
        res.status(404).json({ success: false, message: 'Không tìm thấy thiết bị' });
        return;
      }

      const updatedConfig = validateDeviceConfig(configPayload, device.config_json);

      // Phát lệnh xuống topic grain/devices/{device_code}/cmd
      const cmdId = await MQTTService.publishCommand(
        device.id,
        device.device_code,
        'UPDATE_CONFIG',
        updatedConfig,
        req.user!.id
      );

      await AuditService.log({
        actor_id: req.user!.id,
        action: 'DEVICE_CONFIG_REQUESTED',
        target_type: 'DEVICE',
        target_id: device.id,
        details_json: { cmd_id: cmdId, configPayload },
      });

      res.status(200).json({
        success: true,
        message: 'Đã phát lệnh cập nhật cấu hình từ xa tới thiết bị',
        data: { cmd_id: cmdId, status: 'PENDING' },
      });
    } catch (error) {
      res.status(error instanceof DeviceCommandError ? error.statusCode : 500).json({ success: false, message: error instanceof DeviceCommandError ? error.message : 'Lỗi khi gửi cấu hình từ xa' });
    }
  }

  /**
   * Gửi lệnh điều khiển quạt / còi (ACTUATOR_CONTROL) qua MQTT /cmd
   */
  static async controlActuator(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const { target, action, control_mode, duration_sec, command, peripheral_id } = req.body;

      // Hỗ trợ cả 2 dạng body: { target, action } hoặc { command: "TURN_ON_FAN" }
      let resolvedTarget = target || 'VENTILATION_FAN';
      let resolvedAction = action;

      if (!resolvedAction && command) {
        if (command === 'TURN_ON_FAN' || command === 'FAN_ON') {
          resolvedTarget = 'VENTILATION_FAN';
          resolvedAction = 'TURN_ON';
        } else if (command === 'TURN_OFF_FAN' || command === 'FAN_OFF') {
          resolvedTarget = 'VENTILATION_FAN';
          resolvedAction = 'TURN_OFF';
        } else if (command === 'TURN_ON_BUZZER' || command === 'BUZZER_ON') {
          resolvedTarget = 'ALARM_BUZZER';
          resolvedAction = 'TURN_ON';
        } else if (command === 'TURN_OFF_BUZZER' || command === 'BUZZER_OFF') {
          resolvedTarget = 'ALARM_BUZZER';
          resolvedAction = 'TURN_OFF';
        } else if (command === 'FAN_AUTO' || command === 'SET_FAN_AUTO') {
          resolvedTarget = 'VENTILATION_FAN';
          resolvedAction = 'SET_AUTO';
        }
      }

      if (!resolvedAction) {
        res.status(400).json({ success: false, message: 'Thiếu tham số action hoặc command' });
        return;
      }

      const device = await prisma.device.findFirst({
        where: { OR: [{ id }, { device_code: id }] },
      });
      if (!device) {
        res.status(404).json({ success: false, message: 'Không tìm thấy thiết bị' });
        return;
      }

      const periph = (device.config_json as any)?.peripherals || {};
      const customPeripherals: any[] = Array.isArray((device.config_json as any)?.custom_peripherals)
        ? (device.config_json as any).custom_peripherals
        : [];

      if (resolvedTarget === 'VENTILATION_FAN' && periph.fan_enabled === false && resolvedAction === 'TURN_ON') {
        res.status(400).json({
          success: false,
          message: 'Quạt thông gió (Relay K1) đang bị tắt trong cấu hình Module của node này.',
        });
        return;
      }
      if (resolvedTarget === 'ALARM_BUZZER' && periph.buzzer_enabled === false && resolvedAction === 'TURN_ON') {
        res.status(400).json({
          success: false,
          message: 'Còi báo động (Relay K2) đang bị tắt trong cấu hình Module của node này.',
        });
        return;
      }
      if (resolvedTarget === 'CUSTOM_PERIPHERAL') {
        const matched = customPeripherals.find((cp) => cp.id === peripheral_id && cp.type === 'RELAY_OUTPUT');
        if (!matched) {
          res.status(400).json({
            success: false,
            message: 'Không tìm thấy thiết bị ngoại vi bật/tắt phù hợp trong cấu hình node.',
          });
          return;
        }
      }

      const resolvedControlMode =
        control_mode ||
        (resolvedTarget === 'VENTILATION_FAN' && resolvedAction === 'SET_AUTO'
          ? 'AUTO'
          : resolvedTarget === 'ALARM_BUZZER' || resolvedTarget === 'CUSTOM_PERIPHERAL'
          ? undefined
          : 'MANUAL');

      if (!['VENTILATION_FAN', 'ALARM_BUZZER', 'CUSTOM_PERIPHERAL'].includes(resolvedTarget) ||
          !['TURN_ON', 'TURN_OFF', 'SET_AUTO'].includes(resolvedAction) ||
          (resolvedAction === 'SET_AUTO' && resolvedTarget !== 'VENTILATION_FAN') ||
          (resolvedControlMode !== undefined && !['AUTO', 'MANUAL'].includes(resolvedControlMode))) {
        throw new DeviceCommandError('Target/action/control_mode không hợp lệ');
      }

      // Phát lệnh xuống topic grain/devices/{device_code}/cmd
      const cmdId = await MQTTService.publishCommand(
        device.id,
        device.device_code,
        'ACTUATOR_CONTROL',
        {
          target: resolvedTarget,
          action: resolvedAction, // TURN_ON hoặc TURN_OFF
          ...(resolvedTarget === 'CUSTOM_PERIPHERAL' ? { peripheral_id } : {}),
          ...(resolvedControlMode ? { control_mode: resolvedControlMode } : {}),
          duration_sec: duration_sec || 600,
        },
        req.user!.id
      );

      await AuditService.log({
        actor_id: req.user!.id,
        action: 'ACTUATOR_CONTROL_COMMAND',
        target_type: 'DEVICE',
        target_id: device.id,
        details_json: { cmd_id: cmdId, target: resolvedTarget, action: resolvedAction, control_mode: resolvedControlMode },
      });

      res.status(200).json({
        success: true,
        message: `Đã phát lệnh điều khiển ${resolvedTarget}: ${resolvedAction} (Chờ phản hồi ACK)`,
        data: { cmd_id: cmdId, status: 'PENDING' },
      });
    } catch (error) {
      res.status(error instanceof DeviceCommandError ? error.statusCode : 500).json({ success: false, message: error instanceof DeviceCommandError ? error.message : 'Lỗi khi gửi lệnh điều khiển' });
    }
  }
}
