import { Router } from 'express';
import { AuditController } from '../controllers/audit.controller';
import { authenticateJWT } from '../middleware/auth.middleware';
import { requireRoles } from '../middleware/rbac.middleware';
import { Role } from '@prisma/client';

const router = Router();

// Xem nhật ký kiểm toán yêu cầu quyền ADMIN
router.use(authenticateJWT, requireRoles(Role.ADMIN));

router.get('/', AuditController.getAll);

export default router;
