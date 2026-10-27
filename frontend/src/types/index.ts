export type Role = 'ADMIN' | 'OPERATOR' | 'VIEWER';
export type UserStatus = 'ACTIVE' | 'LOCKED';

export type LifecycleState =
  | 'REGISTERED'
  | 'PROVISIONED'
  | 'ACTIVE'
  | 'OFFLINE'
  | 'FAULT'
  | 'MAINTENANCE'
  | 'SUSPENDED'
  | 'DECOMMISSIONED';

export type RiskLevel = 'SAFE' | 'WARNING' | 'HIGH_RISK';

export type AlertType = 'HIGH_HUMIDITY' | 'HIGH_TEMP' | 'GAS_SPIKE' | 'DEVICE_OFFLINE';
export type AlertSeverity = 'WARNING' | 'CRITICAL';
export type AlertStatus = 'NEW' | 'ACKNOWLEDGED' | 'RESOLVED';

export type CommandStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'TIMEOUT';

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  status: UserStatus;
  telegram_chat_id?: string | null;
  managed_zones?: { id: string; name: string }[];
}

export interface WarehouseZone {
  id: string;
  name: string;
  grain_type: string;
  target_mc: number;
  max_rh: number;
  manager_id: string;
  manager?: { id: string; full_name: string; email: string };
  devices?: Device[];
  created_at: string;
}

export interface Device {
  id: string;
  device_code: string;
  name: string;
  zone_id: string;
  zone?: WarehouseZone;
  lifecycle_state: LifecycleState;
  is_online: boolean;
  fw_version: string;
  hw_version: string;
  config_json: any;
  last_seen_at?: string | null;
  telemetry_logs?: TelemetryLog[];
  created_at: string;
}

export interface TelemetryLog {
  id: string | number;
  device_id: string;
  msg_id: string;
  temperature: number;
  humidity_air: number;
  gas_ppm: number;
  estimated_emc: number;
  fan_state: boolean;
  risk_level: RiskLevel;
  recorded_at: string;
}

export interface Alert {
  id: string;
  device_id: string;
  device?: { device_code: string; name: string };
  zone_id: string;
  zone?: { name: string; grain_type: string };
  alert_type: AlertType;
  severity: AlertSeverity;
  message: string;
  trigger_value: number;
  status: AlertStatus;
  ack_by_id?: string | null;
  ack_by?: { id: string; full_name: string; email: string } | null;
  ack_note?: string | null;
  created_at: string;
  resolved_at?: string | null;
}

export interface DeviceCommand {
  id: string;
  cmd_id: string;
  device_id: string;
  issued_by_id: string;
  issued_by?: { id: string; full_name: string; email: string };
  command_type: string;
  payload_json: any;
  status: CommandStatus;
  retry_count: number;
  created_at: string;
  executed_at?: string | null;
}

export interface AuditLog {
  id: string | number;
  actor_id?: string | null;
  actor?: { id: string; full_name: string; email: string; role: Role } | null;
  action: string;
  target_type: string;
  target_id: string;
  ip_address?: string | null;
  details_json?: any;
  created_at: string;
}

export interface DashboardKPI {
  total_devices: number;
  online_devices: number;
  offline_devices: number;
  new_alerts_count: number;
  active_fans_count: number;
  avg_temperature: number;
  avg_humidity: number;
  avg_emc: number;
}

export type SimulatorScenario =
  | 'NORMAL'
  | 'HUMIDITY_SPIKE'
  | 'FERMENTATION_SPIKE'
  | 'DISCONNECT_LWT'
  | 'REVOKED_DEVICE_ATTACK';
