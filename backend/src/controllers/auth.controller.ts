import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env';
import prisma from '../config/prisma';
import { AuditService } from '../services/audit.service';
import { UserStatus } from '@prisma/client';

export class AuthController {
  /**
   * Đăng nhập hệ thống bằng email và mật khẩu
   */
  static async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({ success: false, message: 'Vui lòng cung cấp email và mật khẩu' });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { email },
        include: {
          managed_zones: {
            select: { id: true, name: true, grain_type: true },
          },
        },
      });

      if (!user) {
        res.status(401).json({ success: false, message: 'Email hoặc mật khẩu không chính xác' });
        return;
      }

      if (user.status === UserStatus.LOCKED) {
        res.status(403).json({ success: false, message: 'Tài khoản của bạn đã bị khóa' });
        return;
      }

      const isPasswordValid = await bcrypt.compare(password, user.password_hash);
      if (!isPasswordValid) {
        res.status(401).json({ success: false, message: 'Email hoặc mật khẩu không chính xác' });
        return;
      }

      // Tạo JWT Token
      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        ENV.JWT_SECRET,
        { expiresIn: '1d' }
      );

      const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';

      // Ghi Audit Log đăng nhập thành công
      await AuditService.log({
        actor_id: user.id,
        action: 'USER_LOGIN',
        target_type: 'USER',
        target_id: user.id,
        ip_address: clientIp,
        details_json: { email: user.email, role: user.role },
      });

      res.status(200).json({
        success: true,
        message: 'Đăng nhập thành công',
        data: {
          token,
          user: {
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            role: user.role,
            status: user.status,
            managed_zones: user.managed_zones,
          },
        },
      });
    } catch (error) {
      console.error('[AuthController.login]', error);
      res.status(500).json({ success: false, message: 'Lỗi máy chủ khi đăng nhập' });
    }
  }

  /**
   * Lấy thông tin tài khoản hiện tại từ JWT
   */
  static async getCurrentUser(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: {
          managed_zones: {
            select: { id: true, name: true, grain_type: true },
          },
        },
      });

      if (!user) {
        res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          status: user.status,
          managed_zones: user.managed_zones,
        },
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Lỗi khi lấy thông tin người dùng' });
    }
  }
}

