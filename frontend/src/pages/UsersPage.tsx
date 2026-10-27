import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { User, Role, UserStatus } from '../types';
import {
  Users,
  UserPlus,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Lock,
  Unlock,
  CheckCircle,
  Search,
  Send,
} from 'lucide-react';

export const UsersPage: React.FC = () => {
  const { isAdmin, showToast } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal Create User
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newFullName, setNewFullName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<Role>('OPERATOR');
  const [newTelegramId, setNewTelegramId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const res = await api.getUsers();
      if (res.success && res.data) {
        setUsers(res.data);
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi tải danh sách người dùng', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleToggleStatus = async (user: User) => {
    const newStatus: UserStatus = user.status === 'ACTIVE' ? 'LOCKED' : 'ACTIVE';
    try {
      const res = await api.updateUserStatus(user.id, newStatus);
      if (res.success) {
        showToast(
          `Đã chuyển trạng thái người dùng ${user.email} sang: ${newStatus}`,
          newStatus === 'ACTIVE' ? 'success' : 'warning'
        );
        fetchUsers();
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi cập nhật trạng thái người dùng', 'error');
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFullName || !newEmail || !newPassword) {
      showToast('Vui lòng điền họ tên, email và mật khẩu!', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.createUser({
        full_name: newFullName.trim(),
        email: newEmail.trim(),
        password: newPassword,
        role: newRole,
        telegram_chat_id: newTelegramId.trim() || undefined,
      });

      if (res.success) {
        showToast(`Đã thêm thành công người dùng: ${newEmail}`, 'success');
        setIsCreateModalOpen(false);
        setNewFullName('');
        setNewEmail('');
        setNewPassword('');
        setNewTelegramId('');
        fetchUsers();
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi tạo người dùng', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getRoleBadge = (role: Role) => {
    switch (role) {
      case 'ADMIN':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
      case 'OPERATOR':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
      case 'VIEWER':
      default:
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    }
  };

  const filteredUsers = users.filter((u) => {
    return (
      u.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.role.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Users className="w-7 h-7 text-purple-400" />
            <span>Quản lý Tài khoản & Phân quyền RBAC</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Thiết lập tài khoản người vận hành kho lương thực (Admin / Operator / Viewer)
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchUsers}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-lg shadow-purple-600/20 transition"
          >
            <UserPlus className="w-4 h-4" />
            <span>Thêm Người Dùng</span>
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo họ tên, email hoặc vai trò..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase font-semibold tracking-wider">
                <th className="py-3.5 px-4">Họ và Tên</th>
                <th className="py-3.5 px-4">Địa chỉ Email</th>
                <th className="py-3.5 px-4">Vai trò (Role)</th>
                <th className="py-3.5 px-4">Trạng thái</th>
                <th className="py-3.5 px-4">Telegram Chat ID</th>
                <th className="py-3.5 px-4">Khu vực phụ trách</th>
                <th className="py-3.5 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-200">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Không tìm thấy người dùng nào.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isLocked = u.status === 'LOCKED';
                  return (
                    <tr key={u.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-slate-100">{u.full_name}</td>
                      <td className="py-3.5 px-4 text-slate-300 font-mono text-[11px]">{u.email}</td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getRoleBadge(u.role)}`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            !isLocked
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          }`}
                        >
                          {u.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">
                        {u.telegram_chat_id ? (
                          <div className="flex items-center gap-1 text-sky-400">
                            <Send className="w-3 h-3" />
                            <span>{u.telegram_chat_id}</span>
                          </div>
                        ) : (
                          <span className="text-slate-600 italic">Chưa liên kết</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-slate-300 text-[11px]">
                        {u.managed_zones && u.managed_zones.length > 0 ? (
                          u.managed_zones.map((z) => z.name).join(', ')
                        ) : (
                          <span className="text-slate-500 italic">Toàn bộ kho</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => handleToggleStatus(u)}
                          title={isLocked ? 'Mở khoá tài khoản' : 'Khoá tài khoản'}
                          className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition inline-flex items-center gap-1 ${
                            isLocked
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30'
                          }`}
                        >
                          {isLocked ? (
                            <>
                              <Unlock className="w-3 h-3" />
                              <span>Mở khoá</span>
                            </>
                          ) : (
                            <>
                              <Lock className="w-3 h-3" />
                              <span>Khoá</span>
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Create User */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-purple-400" />
                <h2 className="text-base font-bold text-slate-100">Thêm Người Dùng Mới</h2>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Họ và Tên *</label>
                <input
                  type="text"
                  placeholder="VD: Nguyễn Văn A"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-purple-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Email đăng nhập *</label>
                <input
                  type="email"
                  placeholder="VD: operator2@grain.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-purple-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Mật khẩu ban đầu *</label>
                <input
                  type="password"
                  placeholder="Tối thiểu 6 ký tự"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-purple-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Vai trò hệ thống (Role) *</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as Role)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-purple-500"
                >
                  <option value="OPERATOR">OPERATOR (Vận hành & Điều khiển Quạt)</option>
                  <option value="VIEWER">VIEWER (Chỉ xem dữ liệu)</option>
                  <option value="ADMIN">ADMIN (Quản trị toàn quyền)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Telegram Chat ID (Nhận cảnh báo khẩn)
                </label>
                <input
                  type="text"
                  placeholder="VD: 987654321"
                  value={newTelegramId}
                  onChange={(e) => setNewTelegramId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-purple-500 font-mono"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs"
                >
                  {isSubmitting ? 'Đang tạo...' : 'Tạo Tài khoản'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
