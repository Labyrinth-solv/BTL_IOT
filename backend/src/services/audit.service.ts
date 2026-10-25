import prisma from '../config/prisma';

export interface AuditLogParams {
  actor_id?: string | null;
  action: string;
  target_type: string;
  target_id: string;
  ip_address?: string | null;
  details_json?: any;
}

export class AuditService {
  /**
   * Log an action to the audit_logs table
   */
  static async log(params: AuditLogParams): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          actor_id: params.actor_id || null,
          action: params.action,
          target_type: params.target_type,
          target_id: params.target_id,
          ip_address: params.ip_address || null,
          details_json: params.details_json || {},
        },
      });
    } catch (error) {
      console.error('[AuditService] Failed to record audit log:', error);
    }
  }

  /**
   * Log unauthorized access attempt (403 Forbidden)
   */
  static async logUnauthorizedAttempt(
    actor_id: string | null | undefined,
    action: string,
    target_type: string,
    target_id: string,
    ip_address: string | null | undefined,
    reason: string
  ): Promise<void> {
    await this.log({
      actor_id: actor_id || null,
      action: 'UNAUTHORIZED_ACCESS_ATTEMPT',
      target_type,
      target_id,
      ip_address: ip_address || null,
      details_json: {
        attempted_action: action,
        reason,
        timestamp: new Date().toISOString(),
      },
    });
  }
}
