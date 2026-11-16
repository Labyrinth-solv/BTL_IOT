import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env';
import prisma from '../config/prisma';
import { Role, UserStatus } from '@prisma/client';

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  status: UserStatus;
  managed_zones?: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const authenticateJWT = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      message: 'Vui lòng đăng nhập để tiếp tục (401 Unauthorized)',
    });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, ENV.JWT_SECRET) as { id: string; email: string };

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: {
        managed_zones: {
          select: { id: true },
        },
      },
    });

    if (!user) {
      res.status(401).json({
        success: false,
        message: 'Tài khoản không tồn tại hoặc đã bị xóa (401 Unauthorized)',
      });
      return;
    }

    if (user.status !== UserStatus.ACTIVE) {
      res.status(403).json({
        success: false,
        message: 'Tài khoản của bạn đã bị khóa (403 Forbidden)',
      });
      return;
    }

    req.user = {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      status: user.status,
      managed_zones: user.managed_zones.map((z) => z.id),
    };

    next();
  } catch {
    res.status(401).json({
      success: false,
      message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn (401 Unauthorized)',
    });
  }
};
