import { Router } from 'express';
import { AlertController } from '../controllers/alert.controller';
import { authenticateJWT } from '../middleware/auth.middleware';
import { requireRoles } from '../middleware/rbac.middleware';
import { Role } from '@prisma/client';

const router = Router();

router.use(authenticateJWT);

// Xem danh sách cảnh báo (ADMIN, OPERATOR, VIEWER)
router.get('/', AlertController.getAll);

// Xác nhận cảnh báo ACK (ADMIN & OPERATOR) - Chặn VIEWER 403
router.post('/:id/ack', requireRoles(Role.ADMIN, Role.OPERATOR), AlertController.acknowledge);

// Xử lý và đóng cảnh báo RESOLVE (ADMIN & OPERATOR) - Chặn VIEWER 403
router.post('/:id/resolve', requireRoles(Role.ADMIN, Role.OPERATOR), AlertController.resolve);

export default router;

