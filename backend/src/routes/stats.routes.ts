import { Router } from 'express';
import { StatsController } from '../controllers/stats.controller';
import { authenticateJWT } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticateJWT);

router.get('/dashboard', StatsController.getDashboardKPI);

export default router;

