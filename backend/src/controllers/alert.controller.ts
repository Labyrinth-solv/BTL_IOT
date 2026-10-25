import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { SocketService } from '../services/socket.service';
import { AuditService } from '../services/audit.service';
import { AlertStatus, Role } from '@prisma/client';

export class AlertController {
  /**
   * Lấy danh sách cảnh báo (có lọc theo trạng thái và phân quyền)
   */
  static async getAll(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user!;
      const { status, severity, device_id, zone_id } = req.query;

      const where: any = {};

      if (status) where.status = status as AlertStatus;
      if (severity) where.severity = severity as any;
      if (device_id) where.device_id = device_id as string;
      if (zone_id) where.zone_id = zone_id as string;

      // Phân quyền: OPERATOR & VIEWER chỉ thấy cảnh báo trong kho được gán
      if (user.role !== Role.ADMIN) {
        where.zone_id = { in: user.managed_zones || [] };
      }

      const alerts = await prisma.alert.findMany({
        where,
        include: {
          device: { select: { device_code: true, name: true } },
          zone: { select: { name: true, grain_type: true } },
          ack_by: { select: { id: true, full_name: true, email: true } },
        },
        orderBy: { created_at: 'desc' },
        take: 100,
      });

      res.status(200).json({ success: true, count: alerts.length, data: alerts });
    } catch (error) {
      console.error('[AlertController.getAll]', error);
      res.status(500).json({ success: false, message: 'Lỗi khi lấy danh sách cảnh báo' });
    }
  }

  /**
   * Xác nhận đã tiếp nhận cảnh báo (ACKNOWLEDGED)
   */
  static async acknowledge(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const { note } = req.body;

      const alert = await prisma.alert.update({
        where: { id },
        data: {
          status: AlertStatus.ACKNOWLEDGED,
          ack_by_id: req.user!.id,
          ack_note: note || undefined,
        },
        include: {
          device: { select: { device_code: true } },
          zone: { select: { name: true } },
          ack_by: { select: { full_name: true, email: true } },
        },
      });

      await AuditService.log({
        actor_id: req.user!.id,
        action: 'ALERT_ACKNOWLEDGED',
        target_type: 'ALERT',
        target_id: alert.id,
        details_json: { alert_type: alert.alert_type, note },
      });

      SocketService.emitAlertUpdate(alert);

      res.status(200).json({
        success: true,
        message: 'Đã xác nhận tiếp nhận cảnh báo thành công',
        data: alert,
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Lỗi khi xác nhận cảnh báo' });
    }
  }

  /**
   * Đánh dấu đã xử lý xong cảnh báo (RESOLVED)
   */
  static async resolve(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const { note } = req.body;

      const alert = await prisma.alert.update({
        where: { id },
        data: {
          status: AlertStatus.RESOLVED,
          resolved_at: new Date(),
          ack_note: note || undefined,
          ack_by_id: req.user!.id,
        },
        include: {
          device: { select: { device_code: true } },
          zone: { select: { name: true } },
          ack_by: { select: { full_name: true, email: true } },
        },
      });

      await AuditService.log({
        actor_id: req.user!.id,
        action: 'ALERT_RESOLVED',
        target_type: 'ALERT',
        target_id: alert.id,
        details_json: { note, resolved_at: new Date() },
      });

      SocketService.emitAlertUpdate(alert);

      res.status(200).json({
        success: true,
        message: 'Đã hoàn tất xử lý cảnh báo (RESOLVED)',
        data: alert,
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Lỗi khi đóng cảnh báo' });
    }
  }
}
