import { Router } from 'express';
import authRoutes from './auth.routes';
import deviceRoutes from './device.routes';
import telemetryRoutes from './telemetry.routes';
import alertRoutes from './alert.routes';
import zoneRoutes from './zone.routes';
import userRoutes from './user.routes';
import auditRoutes from './audit.routes';
import statsRoutes from './stats.routes';
import simulatorRoutes from './simulator.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/devices', deviceRoutes);
router.use('/telemetry', telemetryRoutes);
router.use('/alerts', alertRoutes);
router.use('/zones', zoneRoutes);
router.use('/users', userRoutes);
router.use('/audit-logs', auditRoutes);
router.use('/stats', statsRoutes);
router.use('/simulator', simulatorRoutes);

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'Smart Grain Storage IoT Backend',
  });
});

export default router;

