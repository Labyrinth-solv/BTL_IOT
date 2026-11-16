import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { AuditService } from '../services/audit.service';

export class ZoneController {
  static async getAll(_req: Request, res: Response): Promise<void> {
    try {
      const zones = await prisma.warehouseZone.findMany({
        include: {
          manager: { select: { id: true, full_name: true, email: true } },
          devices: {
            select: { id: true, device_code: true, name: true, lifecycle_state: true, is_online: true },
          },
        },
        orderBy: { created_at: 'asc' },
      });

      res.status(200).json({ success: true, count: zones.length, data: zones });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Lỗi khi lấy danh sách khu vực kho' });
    }
  }

  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;

      const zone = await prisma.warehouseZone.findUnique({
        where: { id },
        include: {
          manager: { select: { id: true, full_name: true, email: true } },
          devices: true,
          alerts: {
            take: 10,
            orderBy: { created_at: 'desc' },
          },
        },
      });

      if (!zone) {
        res.status(404).json({ success: false, message: 'Không tìm thấy khu vực kho' });
        return;
      }

      res.status(200).json({ success: true, data: zone });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Lỗi khi lấy thông tin kho' });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const { name, grain_type, target_mc, max_rh, manager_id } = req.body;

      if (!name || !String(name).trim()) {
        res.status(400).json({ success: false, message: 'Vui lòng nhập tên khu vực kho' });
        return;
      }

      const resolvedManagerId = manager_id || req.user!.id;

      const zone = await prisma.warehouseZone.create({
        data: {
          name: String(name).trim(),
          grain_type: grain_type ? String(grain_type).trim() : 'Thóc tẻ',
          target_mc: target_mc !== undefined ? parseFloat(target_mc) : 14.0,
          max_rh: max_rh !== undefined ? parseFloat(max_rh) : 65.0,
          manager_id: resolvedManagerId,
        },
      });

      await AuditService.log({
        actor_id: req.user!.id,
        action: 'ZONE_CREATED',
        target_type: 'ZONE',
        target_id: zone.id,
        details_json: { name: zone.name, grain_type: zone.grain_type },
      });

      res.status(201).json({ success: true, message: 'Tạo khu vực kho thành công', data: zone });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Lỗi khi tạo kho mới' });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const { name, grain_type, target_mc, max_rh, manager_id } = req.body;

      const existing = await prisma.warehouseZone.findUnique({ where: { id } });
      if (!existing) {
        res.status(404).json({ success: false, message: 'Không tìm thấy khu vực kho' });
        return;
      }

      const zone = await prisma.warehouseZone.update({
        where: { id },
        data: {
          name: name ? String(name).trim() : undefined,
          grain_type: grain_type ? String(grain_type).trim() : undefined,
          target_mc: target_mc !== undefined ? parseFloat(target_mc) : undefined,
          max_rh: max_rh !== undefined ? parseFloat(max_rh) : undefined,
          manager_id: manager_id || undefined,
        },
      });

      await AuditService.log({
        actor_id: req.user!.id,
        action: 'ZONE_UPDATED',
        target_type: 'ZONE',
        target_id: zone.id,
        details_json: { name: zone.name, grain_type: zone.grain_type, target_mc: zone.target_mc, max_rh: zone.max_rh },
      });

      res.status(200).json({ success: true, message: 'Cập nhật kho thành công', data: zone });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Lỗi khi cập nhật kho' });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;

      const zone = await prisma.warehouseZone.findUnique({
        where: { id },
        include: { _count: { select: { devices: true } } },
      });

      if (!zone) {
        res.status(404).json({ success: false, message: 'Không tìm thấy khu vực kho' });
        return;
      }

      if (zone._count.devices > 0) {
        res.status(400).json({
          success: false,
          message: `Không thể xóa "${zone.name}" vì đang có ${zone._count.devices} thiết bị gắn trong kho này. Hãy chuyển hoặc xóa thiết bị trước!`,
        });
        return;
      }

      await prisma.$transaction([
        prisma.alert.deleteMany({ where: { zone_id: id } }),
        prisma.warehouseZone.delete({ where: { id } }),
      ]);

      await AuditService.log({
        actor_id: req.user!.id,
        action: 'ZONE_DELETED',
        target_type: 'ZONE',
        target_id: id,
        details_json: { name: zone.name },
      });

      res.status(200).json({ success: true, message: `Đã xóa khu vực kho "${zone.name}"` });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Lỗi khi xóa khu vực kho' });
    }
  }
}
