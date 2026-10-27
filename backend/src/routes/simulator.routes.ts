import { Router } from 'express';
import { SimulatorController } from '../controllers/simulator.controller';

const router = Router();

// Không bắt buộc đăng nhập để Simulator Drawer trên Web Demo có thể gọi dễ dàng
router.get('/status', SimulatorController.getStatus);
router.post('/scenario', SimulatorController.setScenario);
router.post('/reconnect', SimulatorController.reconnect);

export default router;
