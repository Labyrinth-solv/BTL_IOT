import React, { createContext, useContext, useEffect, useState } from 'react';
import { getSocket } from '../services/socket';
import { Alert } from '../types';

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
  risk_level: 'SAFE' | 'WARNING' | 'HIGH_RISK';
  timestamp: number;
}

interface DeviceStatusUpdate {
  device_id: string;
  device_db_id?: string;
  state: 'ONLINE' | 'OFFLINE' | 'FAULT';
  is_online?: boolean;
  lifecycle_state?: string;
  last_seen_at?: string;
}

interface SocketContextType {
  latestTelemetry: Record<string, TelemetryUpdate>;
  deviceStatus: Record<string, DeviceStatusUpdate>;
  recentAlerts: Alert[];
  latestAck: Record<string, any>;
}

const SocketContext = createContext<SocketContextType>({
  latestTelemetry: {},
  deviceStatus: {},
  recentAlerts: [],
  latestAck: {},
});

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [latestTelemetry, setLatestTelemetry] = useState<Record<string, TelemetryUpdate>>({});
  const [deviceStatus, setDeviceStatus] = useState<Record<string, DeviceStatusUpdate>>({});
  const [recentAlerts, setRecentAlerts] = useState<Alert[]>([]);
  const [latestAck, setLatestAck] = useState<Record<string, any>>({});

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

    const handleCommandAck = (ackData: any) => {
      if (ackData.cmd_id) {
        setLatestAck((prev) => ({
          ...prev,
          [ackData.cmd_id]: ackData,
        }));
      }
    };

    socket.on('telemetry', handleTelemetry);
    socket.on('device_status', handleDeviceStatus);
    socket.on('alert_new', handleNewAlert);
    socket.on('command_ack', handleCommandAck);

    return () => {
      socket.off('telemetry', handleTelemetry);
      socket.off('device_status', handleDeviceStatus);
      socket.off('alert_new', handleNewAlert);
      socket.off('command_ack', handleCommandAck);
    };
  }, []);

  return (
    <SocketContext.Provider
      value={{
        latestTelemetry,
        deviceStatus,
        recentAlerts,
        latestAck,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
