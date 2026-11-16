import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, getRoleDisplayName } from '../types';
import { api } from '../services/api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
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
      if (!token) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      try {
        const res = await api.getMe();
        if (res.success && res.data) {
          setUser(res.data);
          setIsLoading(false);
          return;
        }
      } catch {
        // Token hết hạn, không hợp lệ hoặc tài khoản đã bị khóa
      }

      localStorage.removeItem('grain_token');
      setToken(null);
      setUser(null);
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
        showToast(`Đăng nhập thành công (${getRoleDisplayName(res.data.user.role)})`, 'success');
        return true;
      }
      return false;
    } catch (err: any) {
      showToast(err.message || 'Email hoặc mật khẩu không chính xác', 'error');
      return false;
    }
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
