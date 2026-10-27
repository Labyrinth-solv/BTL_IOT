const API_BASE = '/api';

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(status: number, message: string, data?: any) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('grain_token');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const contentType = response.headers.get('content-type');
  let data: any = null;
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const errorMsg = data?.message || response.statusText || 'Lỗi yêu cầu máy chủ';
    throw new ApiError(response.status, errorMsg, data);
  }

  return data;
}

export const api = {
  // Auth
  login: (credentials: { email: string; password: string }) =>
    request<any>('/auth/login', { method: 'POST', body: JSON.stringify(credentials) }),
  getMe: () => request<any>('/auth/me'),

  // Stats
  getDashboardKPI: () => request<any>('/stats/dashboard'),

  // Devices
  getDevices: () => request<any>('/devices'),
  getDeviceById: (id: string) => request<any>(`/devices/${id}`),
  onboardDevice: (body: any) => request<any>('/devices', { method: 'POST', body: JSON.stringify(body) }),
  provisionDevice: (id: string, body: any) =>
    request<any>(`/devices/${id}/provision`, { method: 'POST', body: JSON.stringify(body) }),
  activateDevice: (id: string) => request<any>(`/devices/${id}/activate`, { method: 'POST' }),
  toggleMaintenance: (id: string, maintenance_mode: boolean) =>
    request<any>(`/devices/${id}/maintenance`, {
      method: 'POST',
      body: JSON.stringify({ maintenance_mode }),
    }),
  suspendDevice: (id: string, reason?: string) =>
    request<any>(`/devices/${id}/suspend`, { method: 'POST', body: JSON.stringify({ reason }) }),
  unsuspendDevice: (id: string) => request<any>(`/devices/${id}/unsuspend`, { method: 'POST' }),
  decommissionDevice: (id: string) => request<any>(`/devices/${id}/decommission`, { method: 'POST' }),
  updateConfig: (id: string, config: any) =>
    request<any>(`/devices/${id}/config`, { method: 'POST', body: JSON.stringify(config) }),
  controlActuator: (id: string, body: any) =>
    request<any>(`/devices/${id}/control`, { method: 'POST', body: JSON.stringify(body) }),

  // Telemetry
  getLatestTelemetry: (deviceId: string) => request<any>(`/telemetry/${deviceId}/latest`),
  getTelemetryHistory: (deviceId: string, params?: { from?: string; to?: string; limit?: number }) => {
    const query = new URLSearchParams(params as any).toString();
    return request<any>(`/telemetry/${deviceId}/history${query ? `?${query}` : ''}`);
  },
  getExportUrl: (deviceId: string, params?: { from?: string; to?: string }) => {
    const query = new URLSearchParams(params as any).toString();
    return `${API_BASE}/telemetry/${deviceId}/export${query ? `?${query}` : ''}`;
  },

  // Alerts
  getAlerts: (params?: any) => {
    const query = new URLSearchParams(params).toString();
    return request<any>(`/alerts${query ? `?${query}` : ''}`);
  },
  acknowledgeAlert: (id: string, note?: string) =>
    request<any>(`/alerts/${id}/ack`, { method: 'POST', body: JSON.stringify({ note }) }),
  resolveAlert: (id: string, note?: string) =>
    request<any>(`/alerts/${id}/resolve`, { method: 'POST', body: JSON.stringify({ note }) }),

  // Zones
  getZones: () => request<any>('/zones'),
  getZoneById: (id: string) => request<any>(`/zones/${id}`),
  createZone: (body: any) => request<any>('/zones', { method: 'POST', body: JSON.stringify(body) }),
  updateZone: (id: string, body: any) => request<any>(`/zones/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

  // Users
  getUsers: () => request<any>('/users'),
  createUser: (body: any) => request<any>('/users', { method: 'POST', body: JSON.stringify(body) }),
  updateUserStatus: (id: string, status: string) =>
    request<any>(`/users/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),

  // Audit Logs
  getAuditLogs: (params?: any) => {
    const query = new URLSearchParams(params).toString();
    return request<any>(`/audit-logs${query ? `?${query}` : ''}`);
  },

  // Simulator
  getSimulatorStatus: () => request<any>('/simulator/status'),
  setSimulatorScenario: (scenario: string) =>
    request<any>('/simulator/scenario', { method: 'POST', body: JSON.stringify({ scenario }) }),
  reconnectSimulator: () => request<any>('/simulator/reconnect', { method: 'POST' }),
};
