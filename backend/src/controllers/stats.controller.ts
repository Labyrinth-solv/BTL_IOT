import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { Role } from '@prisma/client';

export class StatsController {
  static async getDashboardKPI(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user!;
      const deviceWhere: any = {};
      const alertWhere: any = { status: 'NEW' };

      // Phân quyền: OPERATOR lọc theo kho quản lý; ADMIN và VIEWER xem toàn bộ kho
      if (user.role === Role.OPERATOR && user.managed_zones && user.managed_zones.length > 0) {
        deviceWhere.zone_id = { in: user.managed_zones };
        alertWhere.zone_id = { in: user.managed_zones };
      }

      const totalDevices = await prisma.device.count({ where: deviceWhere });
      const onlineDevices = await prisma.device.count({
        where: { ...deviceWhere, is_online: true },
      });
      const offlineDevices = totalDevices - onlineDevices;

      const newAlertsCount = await prisma.alert.count({ where: alertWhere });

      // Lấy telemetry mới nhất của các thiết bị để tính trung bình
      const devices = await prisma.device.findMany({
        where: deviceWhere,
        include: {
          telemetry_logs: {
            take: 1,
            orderBy: { recorded_at: 'desc' },
          },
        },
      });

      let sumTemp = 0;
      let sumRH = 0;
      let sumEMC = 0;
      let countWithData = 0;
      let activeFansCount = 0;

      devices.forEach((dev) => {
        if (dev.telemetry_logs.length > 0) {
          const log = dev.telemetry_logs[0];
          sumTemp += log.temperature;
          sumRH += log.humidity_air;
          sumEMC += log.estimated_emc;
          countWithData++;
          if (log.fan_state) activeFansCount++;
        }
      });

      const avgTemp = countWithData > 0 ? Math.round((sumTemp / countWithData) * 10) / 10 : 0;
      const avgRH = countWithData > 0 ? Math.round((sumRH / countWithData) * 10) / 10 : 0;
      const avgEMC = countWithData > 0 ? Math.round((sumEMC / countWithData) * 10) / 10 : 0;

      res.status(200).json({
        success: true,
        data: {
          kpi: {
            total_devices: totalDevices,
            online_devices: onlineDevices,
            offline_devices: offlineDevices,
            new_alerts_count: newAlertsCount,
            active_fans_count: activeFansCount,
            avg_temperature: avgTemp,
            avg_humidity: avgRH,
            avg_emc: avgEMC,
          },
        },
      });
    } catch (error) {
      console.error('[StatsController.getDashboardKPI]', error);
      res.status(500).json({ success: false, message: 'Lỗi khi thống kê chỉ số Dashboard' });
    }
  }
}

