import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { AuditService } from '../services/audit.service';
import { Role } from '@prisma/client';

export class ZoneController {
  static async getAll(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user!;
      const where: any = {};

      if (user.role !== Role.ADMIN) {
        where.id = { in: user.managed_zones || [] };
      }

      const zones = await prisma.warehouseZone.findMany({
        where,
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

      if (!name || !manager_id) {
        res.status(400).json({ success: false, message: 'Thiếu tên kho hoặc ID người quản lý' });
        return;
      }

      const zone = await prisma.warehouseZone.create({
        data: {
          name,
          grain_type: grain_type || 'Thóc tẻ - TCVN 8370',
          target_mc: target_mc ? parseFloat(target_mc) : 14.0,
          max_rh: max_rh ? parseFloat(max_rh) : 65.0,
          manager_id,
        },
      });

      await AuditService.log({
        actor_id: req.user!.id,
        action: 'ZONE_CREATED',
        target_type: 'ZONE',
        target_id: zone.id,
        details_json: { name, grain_type },
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

      const zone = await prisma.warehouseZone.update({
        where: { id },
        data: {
          name: name || undefined,
          grain_type: grain_type || undefined,
          target_mc: target_mc ? parseFloat(target_mc) : undefined,
          max_rh: max_rh ? parseFloat(max_rh) : undefined,
          manager_id: manager_id || undefined,
        },
      });

      await AuditService.log({
        actor_id: req.user!.id,
        action: 'ZONE_UPDATED',
        target_type: 'ZONE',
        target_id: zone.id,
      });

      res.status(200).json({ success: true, message: 'Cập nhật kho thành công', data: zone });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Lỗi khi cập nhật kho' });
    }
  }
}
