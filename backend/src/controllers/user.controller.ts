import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../config/prisma';
import { AuditService } from '../services/audit.service';
import { Role, UserStatus } from '@prisma/client';

export class UserController {
  static async getAll(_req: Request, res: Response): Promise<void> {
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
      const normalizedEmail = typeof email === 'string' ? email.trim() : '';

      if (!normalizedEmail || !password || !full_name || !String(full_name).trim()) {
        res.status(400).json({ success: false, message: 'Thiếu tên đăng nhập, mật khẩu hoặc họ tên' });
        return;
      }

      const existing = await prisma.user.findFirst({
        where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
      });
      if (existing) {
        res.status(400).json({ success: false, message: 'Tên đăng nhập / Email này đã tồn tại trong hệ thống' });
        return;
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          password_hash: passwordHash,
          full_name: String(full_name).trim(),
          role: (role as Role) || Role.OPERATOR,
          status: UserStatus.ACTIVE,
          telegram_chat_id: telegram_chat_id ? String(telegram_chat_id).trim() : null,
        },
        select: {
          id: true,
          email: true,
          full_name: true,
          role: true,
          status: true,
          telegram_chat_id: true,
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

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const { email, password, full_name, role, status, telegram_chat_id } = req.body;

      const existingUser = await prisma.user.findUnique({ where: { id } });
      if (!existingUser) {
        res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
        return;
      }

      if (id === req.user!.id) {
        if ((role && role !== Role.ADMIN) || status === UserStatus.LOCKED) {
          res.status(400).json({
            success: false,
            message: 'Không thể tự hạ quyền hoặc tự khóa tài khoản đang đăng nhập',
          });
          return;
        }
      }

      const normalizedEmail = typeof email === 'string' ? email.trim() : existingUser.email;
      if (!normalizedEmail) {
        res.status(400).json({ success: false, message: 'Tên đăng nhập / Email không được để trống' });
        return;
      }

      if (normalizedEmail.toLowerCase() !== existingUser.email.toLowerCase()) {
        const duplicate = await prisma.user.findFirst({
          where: { email: { equals: normalizedEmail, mode: 'insensitive' }, id: { not: id } },
        });
        if (duplicate) {
          res.status(400).json({ success: false, message: 'Tên đăng nhập / Email này đã được tài khoản khác sử dụng' });
          return;
        }
      }

      const updateData: any = {
        email: normalizedEmail,
        full_name: full_name ? String(full_name).trim() : existingUser.full_name,
        role: (role as Role) || existingUser.role,
        status: (status as UserStatus) || existingUser.status,
        telegram_chat_id:
          telegram_chat_id !== undefined
            ? telegram_chat_id
              ? String(telegram_chat_id).trim()
              : null
            : existingUser.telegram_chat_id,
      };

      if (typeof password === 'string' && password.trim().length > 0) {
        updateData.password_hash = await bcrypt.hash(password, 10);
      }

      const updated = await prisma.user.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          email: true,
          full_name: true,
          role: true,
          status: true,
          telegram_chat_id: true,
          created_at: true,
        },
      });

      await AuditService.log({
        actor_id: req.user!.id,
        action: 'USER_UPDATED',
        target_type: 'USER',
        target_id: updated.id,
        details_json: {
          email: updated.email,
          full_name: updated.full_name,
          role: updated.role,
          status: updated.status,
          password_changed: Boolean(typeof password === 'string' && password.trim().length > 0),
        },
      });

      res.status(200).json({ success: true, message: 'Cập nhật thông tin tài khoản thành công', data: updated });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Lỗi khi cập nhật thông tin người dùng' });
    }
  }

  static async updateStatus(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const { status } = req.body; // ACTIVE | LOCKED

      if (id === req.user!.id && status === UserStatus.LOCKED) {
        res.status(400).json({ success: false, message: 'Không thể tự khóa tài khoản đang đăng nhập' });
        return;
      }

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

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;

      if (id === req.user!.id) {
        res.status(400).json({ success: false, message: 'Không thể tự xóa tài khoản đang đăng nhập' });
        return;
      }

      const targetUser = await prisma.user.findUnique({ where: { id } });
      if (!targetUser) {
        res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
        return;
      }

      if (targetUser.role === Role.ADMIN) {
        const activeAdmins = await prisma.user.count({
          where: { role: Role.ADMIN, status: UserStatus.ACTIVE, id: { not: id } },
        });
        if (activeAdmins === 0) {
          res.status(400).json({ success: false, message: 'Không thể xóa tài khoản Admin cuối cùng của hệ thống' });
          return;
        }
      }

      await prisma.$transaction([
        prisma.warehouseZone.updateMany({ where: { manager_id: id }, data: { manager_id: req.user!.id } }),
        prisma.alert.updateMany({ where: { ack_by_id: id }, data: { ack_by_id: null } }),
        prisma.auditLog.updateMany({ where: { actor_id: id }, data: { actor_id: null } }),
        prisma.deviceCommand.deleteMany({ where: { issued_by_id: id } }),
        prisma.user.delete({ where: { id } }),
      ]);

      await AuditService.log({
        actor_id: req.user!.id,
        action: 'USER_DELETED',
        target_type: 'USER',
        target_id: id,
        details_json: { email: targetUser.email, full_name: targetUser.full_name, role: targetUser.role },
      });

      res.status(200).json({ success: true, message: `Đã xóa tài khoản "${targetUser.email}"` });
    } catch (error) {
      console.error('[UserController.remove]', error);
      res.status(500).json({ success: false, message: 'Lỗi khi xóa tài khoản người dùng' });
    }
  }
}
