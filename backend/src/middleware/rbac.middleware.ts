import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';

/**
 * Middleware phân quyền RBAC (Chế độ Demo: Mở toàn quyền không chặn 403).
 */
export const requireRoles = (...allowedRoles: Role[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Demo Mode: Cho phép mọi tài khoản thực hiện đầy đủ chức năng
    next();
  };
};

/**
 * Middleware kiểm tra quyền truy cập kho/thiết bị (Chế độ Demo: Cho phép tất cả).
 */
export const checkDeviceOrZoneAccess = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Demo Mode: Cho phép xem và điều khiển toàn bộ kho và thiết bị
  next();
};
