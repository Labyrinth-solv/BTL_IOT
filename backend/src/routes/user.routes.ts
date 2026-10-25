import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { authenticateJWT } from '../middleware/auth.middleware';
import { requireRoles } from '../middleware/rbac.middleware';
import { Role } from '@prisma/client';

const router = Router();

// Toàn bộ chức năng quản lý người dùng yêu cầu vai trò ADMIN
router.use(authenticateJWT, requireRoles(Role.ADMIN));

router.get('/', UserController.getAll);
router.post('/', UserController.create);
router.put('/:id/status', UserController.updateStatus);

export default router;

