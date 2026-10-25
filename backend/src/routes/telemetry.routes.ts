import { Router } from 'express';
import { TelemetryController } from '../controllers/telemetry.controller';
import { authenticateJWT } from '../middleware/auth.middleware';
import { checkDeviceOrZoneAccess } from '../middleware/rbac.middleware';

const router = Router();

router.use(authenticateJWT);

router.get('/:deviceId/latest', checkDeviceOrZoneAccess, TelemetryController.getLatest);
router.get('/:deviceId/history', checkDeviceOrZoneAccess, TelemetryController.getHistory);
router.get('/:deviceId/export', checkDeviceOrZoneAccess, TelemetryController.exportCSV);

export default router;

