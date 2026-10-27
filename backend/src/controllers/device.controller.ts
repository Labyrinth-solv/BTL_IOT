import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import prisma from '../config/prisma';
import { AuditService } from '../services/audit.service';
import { MQTTService } from '../services/mqtt.service';
import { LifecycleState, Role } from '@prisma/client';

export class DeviceController {
  /**
   * Lấy danh sách thiết bị (lọc theo quyền RBAC)
   */
  static async getAll(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user!;
      const whereCondition: any = {};

      // Phân quyền: OPERATOR lọc theo kho quản lý (nếu có); ADMIN và VIEWER xem toàn bộ kho
      if (user.role === Role.OPERATOR && user.managed_zones && user.managed_zones.length > 0) {
        whereCondition.zone_id = { in: user.managed_zones };
      }

      const devices = await prisma.device.findMany({
        where: whereCondition,
        include: {
          zone: { select: { id: true, name: true, grain_type: true } },
          telemetry_logs: {
            take: 1,
            orderBy: { recorded_at: 'desc' },
          },
        },
        orderBy: { created_at: 'desc' },
      });

      res.status(200).json({ success: true, data: devices });
    } catch (error) {
      console.error('[DeviceController.getAll]', error);
      res.status(500).json({ success: false, message: 'Lỗi khi lấy danh sách thiết bị' });
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

      res.status(200).json({ success: true, data: device });
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

      if (!device_code || !name || !zone_id) {
        res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc (device_code, name, zone_id)' });
        return;
      }

      const existing = await prisma.device.findUnique({ where: { device_code } });
      if (existing) {
        res.status(400).json({ success: false, message: `Mã thiết bị '${device_code}' đã tồn tại` });
        return;
      }

      // Sinh secret token ngẫu nhiên riêng biệt cho thiết bị
      const rawSecretToken = `sec_${crypto.randomBytes(16).toString('hex')}`;
      const hashedToken = await bcrypt.hash(rawSecretToken, 10);

      const device = await prisma.device.create({
        data: {
          device_code,
          name,
          secret_token_hash: hashedToken,
          zone_id,
          lifecycle_state: LifecycleState.REGISTERED,
          hw_version: hw_version || 'ESP32-WROOM-32-v1',
          fw_version: fw_version || '1.0.0',
          config_json: {
            sampling_interval_ms: 3000,
            temp_warn_threshold: 25.0,
            temp_crit_threshold: 28.0,
            hum_warn_threshold: 65.0,
            hum_crit_threshold: 70.0,
            gas_warn_threshold: 600.0,
            gas_crit_threshold: 700.0,
          },
        },
      });

      const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';

      await AuditService.log({
        actor_id: req.user!.id,
        action: 'DEVICE_ONBOARDED',
        target_type: 'DEVICE',
        target_id: device.id,
        ip_address: clientIp,
        details_json: { device_code, zone_id },
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
   * Cập nhật cấu hình từ xa (UPDATE_CONFIG) qua MQTT /cmd
   */
  static async updateConfig(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const configPayload = req.body;

      const device = await prisma.device.findFirst({
        where: { OR: [{ id }, { device_code: id }] },
      });
      if (!device) {
        res.status(404).json({ success: false, message: 'Không tìm thấy thiết bị' });
        return;
      }

      // Lưu cấu hình vào DB
      const updatedConfig = {
        ...(typeof device.config_json === 'object' && device.config_json !== null ? device.config_json : {}),
        ...configPayload,
      };

      await prisma.device.update({
        where: { id },
        data: { config_json: updatedConfig },
      });

      // Phát lệnh xuống topic grain/devices/{device_code}/cmd
      const cmdId = await MQTTService.publishCommand(
        device.id,
        device.device_code,
        'UPDATE_CONFIG',
        configPayload,
        req.user!.id
      );

      await AuditService.log({
        actor_id: req.user!.id,
        action: 'DEVICE_CONFIG_UPDATED',
        target_type: 'DEVICE',
        target_id: device.id,
        details_json: { cmd_id: cmdId, configPayload },
      });

      res.status(200).json({
        success: true,
        message: 'Đã phát lệnh cập nhật cấu hình từ xa tới thiết bị',
        data: { cmd_id: cmdId, config: updatedConfig },
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Lỗi khi gửi cấu hình từ xa' });
    }
  }

  /**
   * Gửi lệnh điều khiển quạt / còi (ACTUATOR_CONTROL) qua MQTT /cmd
   */
  static async controlActuator(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const { target, action, control_mode, duration_sec, command } = req.body;

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

      // Phát lệnh xuống topic grain/devices/{device_code}/cmd
      const cmdId = await MQTTService.publishCommand(
        device.id,
        device.device_code,
        'ACTUATOR_CONTROL',
        {
          target: resolvedTarget,
          action: resolvedAction, // TURN_ON hoặc TURN_OFF
          control_mode: control_mode || 'MANUAL',
          duration_sec: duration_sec || 600,
        },
        req.user!.id
      );

      await AuditService.log({
        actor_id: req.user!.id,
        action: 'ACTUATOR_CONTROL_COMMAND',
        target_type: 'DEVICE',
        target_id: device.id,
        details_json: { cmd_id: cmdId, target: resolvedTarget, action: resolvedAction, control_mode },
      });

      res.status(200).json({
        success: true,
        message: `Đã phát lệnh điều khiển ${resolvedTarget}: ${resolvedAction} (Chờ phản hồi ACK)`,
        data: { cmd_id: cmdId, status: 'PENDING' },
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Lỗi khi gửi lệnh điều khiển' });
    }
  }
}
