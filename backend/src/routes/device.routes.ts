import { Router } from 'express';
import { DeviceController } from '../controllers/device.controller';
import { authenticateJWT } from '../middleware/auth.middleware';
import { requireRoles, checkDeviceOrZoneAccess } from '../middleware/rbac.middleware';
import { Role } from '@prisma/client';

const router = Router();

// Tất cả các route yêu cầu xác thực JWT
router.use(authenticateJWT);

// Xem danh sách thiết bị: ADMIN, OPERATOR, VIEWER
router.get('/', DeviceController.getAll);

// Chi tiết 1 thiết bị: ADMIN, OPERATOR, VIEWER (kiểm tra phân quyền kho)
router.get('/:id', checkDeviceOrZoneAccess, DeviceController.getById);

// Bước 1 & 2: Onboard thiết bị mới và sinh secret token (ADMIN ONLY)
router.post('/', requireRoles(Role.ADMIN), DeviceController.onboard);

// Bước 3: Gán kho và nạp cấu hình ban đầu PROVISIONED (ADMIN ONLY)
router.post('/:id/provision', requireRoles(Role.ADMIN), DeviceController.provision);

// Bước 4: Kích hoạt thiết bị ACTIVE (ADMIN & OPERATOR)
router.post(
  '/:id/activate',
  requireRoles(Role.ADMIN, Role.OPERATOR),
  checkDeviceOrZoneAccess,
  DeviceController.activate
);

// Bước 7/8: Bật/Tắt chế độ bảo trì MAINTENANCE (ADMIN & OPERATOR)
router.post(
  '/:id/maintenance',
  requireRoles(Role.ADMIN, Role.OPERATOR),
  checkDeviceOrZoneAccess,
  DeviceController.toggleMaintenance
);

// Bước 9: Tạm khóa thiết bị SUSPENDED (ADMIN ONLY)
router.post('/:id/suspend', requireRoles(Role.ADMIN), DeviceController.suspend);

// Mở khóa thiết bị về ACTIVE (ADMIN ONLY)
router.post('/:id/unsuspend', requireRoles(Role.ADMIN), DeviceController.unsuspend);

// Bước 10: Ngừng sử dụng vĩnh viễn DECOMMISSIONED (ADMIN ONLY)
router.post('/:id/decommission', requireRoles(Role.ADMIN), DeviceController.decommission);

// Cập nhật cấu hình ngưỡng từ xa UPDATE_CONFIG (ADMIN & OPERATOR) - Chặn VIEWER 403
router.post(
  '/:id/config',
  requireRoles(Role.ADMIN, Role.OPERATOR),
  checkDeviceOrZoneAccess,
  DeviceController.updateConfig
);

// Điều khiển Quạt / Cơ cấu chấp hành ACTUATOR_CONTROL (ADMIN & OPERATOR) - Chặn VIEWER 403
router.post(
  '/:id/control',
  requireRoles(Role.ADMIN, Role.OPERATOR),
  checkDeviceOrZoneAccess,
  DeviceController.controlActuator
);

export default router;
