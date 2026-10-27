import React, { useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
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
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <div className="text-sm font-semibold">Đang tải hệ thống Smart Grain Storage...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased">
      {/* Top Navigation */}
      <Navbar
        isSimulatorOpen={isSimulatorOpen}
        onToggleSimulator={() => setIsSimulatorOpen((prev) => !prev)}
      />

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar />

        {/* Dynamic Page Content */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 bg-gradient-to-b from-slate-900/50 to-slate-950">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>

        {/* Hardware Simulator Drawer */}
        <SimulatorDrawer
          isOpen={isSimulatorOpen}
          onClose={() => setIsSimulatorOpen(false)}
        />
      </div>

      {/* Floating System Toast */}
      <Toast />
    </div>
  );
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
            <UsersPage />
          </MainLayout>
        }
      />

      <Route
        path="/audit-logs"
        element={
          <MainLayout>
            <AuditLogsPage />
          </MainLayout>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
