import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../config/prisma';
import { AuditService } from '../services/audit.service';
import { Role, UserStatus } from '@prisma/client';

export class UserController {
  static async getAll(req: Request, res: Response): Promise<void> {
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          email: true,
          full_name: true,
          role: true,
          status: true,
          telegram_chat_id: true,
          created_at: true,
          managed_zones: { select: { id: true, name: true } },
        },
        orderBy: { created_at: 'desc' },
      });

      res.status(200).json({ success: true, count: users.length, data: users });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Lỗi khi lấy danh sách người dùng' });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, full_name, role, telegram_chat_id } = req.body;

      if (!email || !password || !full_name) {
        res.status(400).json({ success: false, message: 'Thiếu email, mật khẩu hoặc họ tên' });
        return;
      }

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        res.status(400).json({ success: false, message: 'Email này đã tồn tại trong hệ thống' });
        return;
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const user = await prisma.user.create({
        data: {
          email,
          password_hash: passwordHash,
          full_name,
          role: (role as Role) || Role.OPERATOR,
          status: UserStatus.ACTIVE,
          telegram_chat_id: telegram_chat_id || null,
        },
        select: {
          id: true,
          email: true,
          full_name: true,
          role: true,
          status: true,
          created_at: true,
        },
      });

      await AuditService.log({
        actor_id: req.user!.id,
        action: 'USER_CREATED',
        target_type: 'USER',
        target_id: user.id,
        details_json: { email: user.email, role: user.role },
      });

      res.status(201).json({ success: true, message: 'Tạo tài khoản thành công', data: user });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Lỗi khi tạo tài khoản mới' });
    }
  }

  static async updateStatus(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const { status } = req.body; // ACTIVE | LOCKED

      const user = await prisma.user.update({
        where: { id },
        data: { status: status as UserStatus },
      });

      await AuditService.log({
        actor_id: req.user!.id,
        action: 'USER_STATUS_UPDATED',
        target_type: 'USER',
        target_id: user.id,
        details_json: { status },
      });

      res.status(200).json({ success: true, message: `Đã cập nhật trạng thái tài khoản sang ${status}`, data: user });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Lỗi khi cập nhật trạng thái tài khoản' });
    }
  }
}
