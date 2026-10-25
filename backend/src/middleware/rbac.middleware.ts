import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { AuditService } from '../services/audit.service';
import prisma from '../config/prisma';

/**
 * Middleware to enforce Role-Based Access Control (RBAC).
 * Automatically logs unauthorized access attempts (403 Forbidden) to audit_logs.
 */
export const requireRoles = (...allowedRoles: Role[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Chưa đăng nhập hệ thống',
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';

      // Log unauthorized attempt to audit_logs
      await AuditService.logUnauthorizedAttempt(
        req.user.id,
        `${req.method} ${req.originalUrl}`,
        'API_ENDPOINT',
        req.originalUrl,
        clientIp,
        `Vai trò ${req.user.role} không được cấp quyền thực hiện hành động này. Yêu cầu: [${allowedRoles.join(', ')}]`
      );

      res.status(403).json({
        success: false,
        message: `Bạn không có quyền thực hiện thao tác này (403 Forbidden). Quyền yêu cầu: [${allowedRoles.join(', ')}]`,
      });
      return;
    }

    next();
  };
};

/**
 * Middleware to check if user has access to a specific warehouse zone or device's zone.
 * ADMIN has access to all zones.
 * OPERATOR / VIEWER can only access assigned zones.
 */
export const checkDeviceOrZoneAccess = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
    return;
  }

  // Admin has global access
  if (req.user.role === Role.ADMIN) {
    return next();
  }

  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
  const deviceId = (req.params.id || req.params.deviceId) as string | undefined;
  const zoneId = req.params.zoneId || (req.body && req.body.zone_id);

  try {
    let targetZoneId = zoneId;

    if (!targetZoneId && deviceId) {
      const device = await prisma.device.findUnique({
        where: { id: deviceId },
        select: { zone_id: true },
      });
      if (device) {
        targetZoneId = device.zone_id;
      }
    }

    if (targetZoneId && req.user.managed_zones && !req.user.managed_zones.includes(targetZoneId)) {
      await AuditService.logUnauthorizedAttempt(
        req.user.id,
        `${req.method} ${req.originalUrl}`,
        'ZONE_ACCESS',
        targetZoneId,
        clientIp,
        `Người dùng không được phân quyền quản lý khu vực kho: ${targetZoneId}`
      );

      res.status(403).json({
        success: false,
        message: 'Bạn không có quyền truy cập vào khu vực kho này (403 Forbidden)',
      });
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
};
