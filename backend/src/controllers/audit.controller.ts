import { Request, Response } from 'express';
import prisma from '../config/prisma';

export class AuditController {
  static async getAll(req: Request, res: Response): Promise<void> {
    try {
      const { action, target_type, limit } = req.query;

      const where: any = {};
      if (action) where.action = action as string;
      if (target_type) where.target_type = target_type as string;

      const takeCount = limit ? parseInt(limit as string, 10) : 100;

      const logs = await prisma.auditLog.findMany({
        where,
        include: {
          actor: { select: { id: true, email: true, full_name: true, role: true } },
        },
        orderBy: { created_at: 'desc' },
        take: Math.min(500, takeCount),
      });

      res.status(200).json({ success: true, count: logs.length, data: logs });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Lỗi khi lấy nhật ký kiểm toán (Audit Logs)' });
    }
  }
}
