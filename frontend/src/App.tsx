import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useSocket } from './context/SocketContext';
import { api } from './services/api';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { SimulatorDrawer } from './components/SimulatorDrawer';
import { Toast } from './components/Toast';

// Pages
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { DevicesPage } from './pages/DevicesPage';
import { DeviceDetailPage } from './pages/DeviceDetailPage';
import { AlertsPage } from './pages/AlertsPage';
import { ZonesPage } from './pages/ZonesPage';
import { UsersPage } from './pages/UsersPage';
import { AuditLogsPage } from './pages/AuditLogsPage';

// Protected Layout
const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();
  const { deviceStatus, latestTelemetry } = useSocket();
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [isSimulatorRunning, setIsSimulatorRunning] = useState(false);
  const [hasDbOnlineDevice, setHasDbOnlineDevice] = useState(false);
  const location = useLocation();

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    const checkEnvironment = async () => {
      try {
        const [simRes, devRes] = await Promise.all([
          api.getSimulatorStatus().catch(() => null),
          api.getDevices().catch(() => null),
        ]);
        if (cancelled) return;

        const running = Boolean(simRes?.isRunning);
        setIsSimulatorRunning(running);
        if (!running) {
          setIsSimulatorOpen(false);
        }

        if (devRes?.success && Array.isArray(devRes.data)) {
          setHasDbOnlineDevice(devRes.data.some((d: any) => d.is_online));
        }
      } catch {
        if (!cancelled) setIsSimulatorRunning(false);
      }
    };

    checkEnvironment();
    const timer = setInterval(checkEnvironment, 8000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [user]);

  const hasWsOnlineDevice =
    Object.values(deviceStatus).some((s) => s.state === 'ONLINE') ||
    Object.keys(latestTelemetry).some((code) => deviceStatus[code]?.state !== 'OFFLINE');
  const isRealDeviceMode = !isSimulatorRunning && (hasDbOnlineDevice || hasWsOnlineDevice);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-600">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
          <div className="text-sm font-semibold">Đang tải hệ thống Smart Grain Storage...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans antialiased">
      {/* Top Navigation */}
      <Navbar
        isSimulatorOpen={isSimulatorOpen}
        onToggleSimulator={() => setIsSimulatorOpen((prev) => !prev)}
        showSimulator={isSimulatorRunning}
        isRealDeviceMode={isRealDeviceMode}
      />

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar />

        {/* Dynamic Page Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50">
          <div className="max-w-7xl mx-auto w-full">{children}</div>
        </main>

        {/* Hardware Simulator Drawer */}
        {isSimulatorRunning && (
          <SimulatorDrawer
            isOpen={isSimulatorOpen}
            onClose={() => setIsSimulatorOpen(false)}
          />
        )}
      </div>

      {/* Floating System Toast */}
      <Toast />
    </div>
  );
};

// Admin-only route guard
const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAdmin } = useAuth();
  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/"
        element={
          <MainLayout>
            <DashboardPage />
          </MainLayout>
        }
      />

      <Route
        path="/devices"
        element={
          <MainLayout>
            <DevicesPage />
          </MainLayout>
        }
      />

      <Route
        path="/devices/:id"
        element={
          <MainLayout>
            <DeviceDetailPage />
          </MainLayout>
        }
      />

      <Route
        path="/alerts"
        element={
          <MainLayout>
            <AlertsPage />
          </MainLayout>
        }
      />

      <Route
        path="/zones"
        element={
          <MainLayout>
            <ZonesPage />
          </MainLayout>
        }
      />

      <Route
        path="/users"
        element={
          <MainLayout>
            <AdminRoute>
              <UsersPage />
            </AdminRoute>
          </MainLayout>
        }
      />

      <Route
        path="/audit-logs"
        element={
          <MainLayout>
            <AdminRoute>
              <AuditLogsPage />
            </AdminRoute>
          </MainLayout>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
