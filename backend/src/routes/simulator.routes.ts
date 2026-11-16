import { Router } from 'express';
import { SimulatorController } from '../controllers/simulator.controller';
import { authenticateJWT } from '../middleware/auth.middleware';
import { requireRoles } from '../middleware/rbac.middleware';
import { Role } from '@prisma/client';

const router = Router();

router.use(authenticateJWT);

router.get('/status', SimulatorController.getStatus);
router.post('/scenario', requireRoles(Role.ADMIN, Role.OPERATOR), SimulatorController.setScenario);
router.post('/reconnect', requireRoles(Role.ADMIN, Role.OPERATOR), SimulatorController.reconnect);

export default router;
