import React, { createContext, useContext, useEffect, useState } from 'react';
import { getSocket } from '../services/socket';
import { Alert, DiscoveredDevice, SensorHealth } from '../types';

interface TelemetryUpdate {
  device_id: string;
  device_db_id?: string;
  zone_name?: string;
  temperature: number;
  humidity_air: number;
  gas_ppm: number;
  estimated_emc: number;
  fan_state: 'ON' | 'OFF';
  buzzer_state: 'ON' | 'OFF';
  door_open?: boolean;
  control_mode?: string;
  sensor_health?: SensorHealth | null;
  ip_address?: string;
  mac_address?: string;
  chip_id?: string;
  rssi?: number;
  risk_level: 'SAFE' | 'WARNING' | 'HIGH_RISK';
  timestamp: number;
}

interface DeviceStatusUpdate {
  device_id: string;
  device_db_id?: string;
  state: 'ONLINE' | 'OFFLINE' | 'FAULT';
  is_online?: boolean;
  lifecycle_state?: string;
  ip_address?: string;
  mac_address?: string;
  chip_id?: string;
  rssi?: number;
  last_seen_at?: string;
}

interface SocketContextType {
  latestTelemetry: Record<string, TelemetryUpdate>;
  deviceStatus: Record<string, DeviceStatusUpdate>;
  recentAlerts: Alert[];
  latestAck: Record<string, any>;
  discoveredDevices: Record<string, DiscoveredDevice>;
  removeDiscoveredDevice: (deviceCode: string) => void;
}

const SocketContext = createContext<SocketContextType>({
  latestTelemetry: {},
  deviceStatus: {},
  recentAlerts: [],
  latestAck: {},
  discoveredDevices: {},
  removeDiscoveredDevice: () => {},
});

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [latestTelemetry, setLatestTelemetry] = useState<Record<string, TelemetryUpdate>>({});
  const [deviceStatus, setDeviceStatus] = useState<Record<string, DeviceStatusUpdate>>({});
  const [recentAlerts, setRecentAlerts] = useState<Alert[]>([]);
  const [latestAck, setLatestAck] = useState<Record<string, any>>({});
  const [discoveredDevices, setDiscoveredDevices] = useState<Record<string, DiscoveredDevice>>({});

  const removeDiscoveredDevice = (deviceCode: string) => {
    setDiscoveredDevices((prev) => {
      if (!prev[deviceCode]) return prev;
      const next = { ...prev };
      delete next[deviceCode];
      return next;
    });
  };

  useEffect(() => {
    const socket = getSocket();

    const handleTelemetry = (data: TelemetryUpdate) => {
      setLatestTelemetry((prev) => ({
        ...prev,
        [data.device_id]: data,
      }));
    };

    const handleDeviceStatus = (data: DeviceStatusUpdate) => {
      setDeviceStatus((prev) => ({
        ...prev,
        [data.device_id]: data,
      }));
    };

    const handleNewAlert = (alert: Alert) => {
      setRecentAlerts((prev) => [alert, ...prev.slice(0, 19)]);
    };

    const handleAlertUpdate = (updatedAlert: Alert) => {
      setRecentAlerts((prev) => {
        const exists = prev.some((a) => a.id === updatedAlert.id);
        if (exists) {
          return prev.map((a) => (a.id === updatedAlert.id ? updatedAlert : a));
        }
        return [updatedAlert, ...prev.slice(0, 19)];
      });
    };

    const handleCommandAck = (ackData: any) => {
      if (ackData.cmd_id) {
        setLatestAck((prev) => ({
          ...prev,
          [ackData.cmd_id]: ackData,
        }));
      }
      if (ackData.status === 'SUCCESS' && ackData.current_actuators && ackData.device_id) {
        setLatestTelemetry((prev) => {
          const existing = prev[ackData.device_id];
          if (!existing) return prev;
          return {
            ...prev,
            [ackData.device_id]: {
              ...existing,
              fan_state: ackData.current_actuators.fan_state ?? existing.fan_state,
              buzzer_state: ackData.current_actuators.buzzer_state ?? existing.buzzer_state,
            },
          };
        });
      }
    };

    const handleDeviceDiscovered = (info: DiscoveredDevice) => {
      if (!info?.device_code) return;
      setDiscoveredDevices((prev) => ({
        ...prev,
        [info.device_code]: info,
      }));
    };

    socket.on('telemetry', handleTelemetry);
    socket.on('device_status', handleDeviceStatus);
    socket.on('alert_new', handleNewAlert);
    socket.on('alert_updated', handleAlertUpdate);
    socket.on('command_ack', handleCommandAck);
    socket.on('device_discovered', handleDeviceDiscovered);

    return () => {
      socket.off('telemetry', handleTelemetry);
      socket.off('device_status', handleDeviceStatus);
      socket.off('alert_new', handleNewAlert);
      socket.off('alert_updated', handleAlertUpdate);
      socket.off('command_ack', handleCommandAck);
      socket.off('device_discovered', handleDeviceDiscovered);
    };
  }, []);

  return (
    <SocketContext.Provider
      value={{
        latestTelemetry,
        deviceStatus,
        recentAlerts,
        latestAck,
        discoveredDevices,
        removeDiscoveredDevice,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
