import { Request, Response, NextFunction } from 'express';
import { Role, UserStatus } from '@prisma/client';

/**
 * Middleware phân quyền RBAC thực tế theo Role (ADMIN / OPERATOR / VIEWER).
 */
export const requireRoles = (...allowedRoles: Role[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Chưa xác thực người dùng (401 Unauthorized)',
      });
      return;
    }

    if (req.user.status !== UserStatus.ACTIVE) {
      res.status(403).json({
        success: false,
        message: 'Tài khoản đã bị khóa, không có quyền thực hiện thao tác (403 Forbidden)',
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: `Vai trò ${req.user.role} không có quyền thực hiện thao tác này (Yêu cầu: ${allowedRoles.join(' / ')})`,
      });
      return;
    }

    next();
  };
};

/**
 * Middleware kiểm tra quyền truy cập kho/thiết bị.
 * Cho phép các vai trò hợp lệ truy cập kho trong mô hình Demo đa kho tập trung.
 */
export const checkDeviceOrZoneAccess = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Chưa xác thực người dùng (401 Unauthorized)',
    });
    return;
  }

  next();
};
