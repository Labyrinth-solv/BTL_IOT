import { Router } from 'express';
import { ZoneController } from '../controllers/zone.controller';
import { authenticateJWT } from '../middleware/auth.middleware';
import { requireRoles } from '../middleware/rbac.middleware';
import { Role } from '@prisma/client';

const router = Router();

router.use(authenticateJWT);

router.get('/', ZoneController.getAll);
router.get('/:id', ZoneController.getById);
router.post('/', requireRoles(Role.ADMIN), ZoneController.create);
router.put('/:id', requireRoles(Role.ADMIN, Role.OPERATOR), ZoneController.update);

export default router;

