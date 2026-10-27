import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Role } from '../types';
import { api, ApiError } from '../services/api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  quickLogin: (role: Role) => Promise<boolean>;
  logout: () => void;
  isAdmin: boolean;
  isOperator: boolean;
  isViewer: boolean;
  toastMessage: { text: string; type: 'success' | 'error' | 'warning' } | null;
  showToast: (text: string, type?: 'success' | 'error' | 'warning') => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('grain_token'));
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'warning' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' | 'warning' = 'error') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  useEffect(() => {
    const fetchMe = async () => {
      if (token) {
        try {
          const res = await api.getMe();
          if (res.success) {
            setUser(res.data);
          } else {
            logout();
          }
        } catch (e) {
          logout();
        }
      }
      setIsLoading(false);
    };

    fetchMe();
  }, [token]);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const res = await api.login({ email, password });
      if (res.success && res.data?.token) {
        localStorage.setItem('grain_token', res.data.token);
        setToken(res.data.token);
        setUser(res.data.user);
        showToast(`Đăng nhập thành công với vai trò: ${res.data.user.role}`, 'success');
        return true;
      }
      return false;
    } catch (err: any) {
      showToast(err.message || 'Đăng nhập thất bại', 'error');
      return false;
    }
  };

  const quickLogin = async (role: Role): Promise<boolean> => {
    let email = 'operator@grain.com';
    let password = 'operator123';

    if (role === 'ADMIN') {
      email = 'admin@grain.com';
      password = 'admin123';
    } else if (role === 'VIEWER') {
      email = 'viewer@grain.com';
      password = 'viewer123';
    }

    return login(email, password);
  };

  const logout = () => {
    localStorage.removeItem('grain_token');
    setToken(null);
    setUser(null);
    showToast('Đã đăng xuất khỏi hệ thống', 'warning');
  };

  const isAdmin = user?.role === 'ADMIN';
  const isOperator = user?.role === 'OPERATOR';
  const isViewer = user?.role === 'VIEWER';

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        quickLogin,
        logout,
        isAdmin,
        isOperator,
        isViewer,
        toastMessage,
        showToast,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
