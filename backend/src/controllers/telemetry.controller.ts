import { Request, Response } from 'express';
import prisma from '../config/prisma';

export class TelemetryController {
  /**
   * Lấy bản ghi telemetry mới nhất của thiết bị
   */
  static async getLatest(req: Request, res: Response): Promise<void> {
    try {
      const deviceId = req.params.deviceId as string;

      const latest = await prisma.telemetryLog.findFirst({
        where: { device_id: deviceId },
        orderBy: { recorded_at: 'desc' },
      });

      if (!latest) {
        res.status(404).json({ success: false, message: 'Chưa có dữ liệu telemetry cho thiết bị này' });
        return;
      }

      res.status(200).json({ success: true, data: latest });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Lỗi khi lấy dữ liệu telemetry mới nhất' });
    }
  }

  /**
   * Lấy lịch sử telemetry theo khoảng thời gian
   */
  static async getHistory(req: Request, res: Response): Promise<void> {
    try {
      const deviceId = req.params.deviceId as string;
      const { from, to, limit } = req.query;

      const where: any = { device_id: deviceId };

      if (from || to) {
        where.recorded_at = {};
        if (from) where.recorded_at.gte = new Date(from as string);
        if (to) where.recorded_at.lte = new Date(to as string);
      }

      const takeCount = limit ? parseInt(limit as string, 10) : 100;

      const logs = await prisma.telemetryLog.findMany({
        where,
        take: Math.min(1000, takeCount),
        orderBy: { recorded_at: 'desc' },
      });

      res.status(200).json({ success: true, count: logs.length, data: logs });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Lỗi khi tra cứu lịch sử telemetry' });
    }
  }

  /**
   * Xuất báo cáo lịch sử đo dưới định dạng CSV
   */
  static async exportCSV(req: Request, res: Response): Promise<void> {
    try {
      const deviceId = req.params.deviceId as string;
      const { from, to } = req.query;

      const where: any = { device_id: deviceId };
      if (from || to) {
        where.recorded_at = {};
        if (from) where.recorded_at.gte = new Date(from as string);
        if (to) where.recorded_at.lte = new Date(to as string);
      }

      const logs = await prisma.telemetryLog.findMany({
        where,
        take: 5000,
        orderBy: { recorded_at: 'asc' },
      });

      // Tạo chuỗi CSV
      let csv = 'Timestamp,MsgID,Temperature(C),HumidityAir(%RH),Gas(PPM),EstimatedEMC(%MC),FanState,RiskLevel\n';
      logs.forEach((log) => {
        csv += `${log.recorded_at.toISOString()},${log.msg_id},${log.temperature},${log.humidity_air},${log.gas_ppm},${log.estimated_emc},${log.fan_state ? 'ON' : 'OFF'},${log.risk_level}\n`;
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="telemetry_${deviceId}_${Date.now()}.csv"`);
      res.status(200).send(csv);
    } catch (error) {
      res.status(500).json({ success: false, message: 'Lỗi khi xuất file CSV' });
    }
  }
}

