import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { User, Role, UserStatus, getRoleDisplayName } from '../types';
import {
  Users,
  UserPlus,
  RefreshCw,
  Lock,
  Unlock,
  Search,
  Send,
  Pencil,
  Trash2,
} from 'lucide-react';

export const UsersPage: React.FC = () => {
  const { user: currentUser, showToast } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal Create / Edit User
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formFullName, setFormFullName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<Role>('OPERATOR');
  const [formStatus, setFormStatus] = useState<UserStatus>('ACTIVE');
  const [formTelegramId, setFormTelegramId] = useState('');
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

  const openCreateModal = () => {
    setEditingUser(null);
    setFormFullName('');
    setFormEmail('');
    setFormPassword('');
    setFormRole('OPERATOR');
    setFormStatus('ACTIVE');
    setFormTelegramId('');
    setIsModalOpen(true);
  };

  const openEditModal = (u: User) => {
    setEditingUser(u);
    setFormFullName(u.full_name);
    setFormEmail(u.email);
    setFormPassword('');
    setFormRole(u.role);
    setFormStatus(u.status);
    setFormTelegramId(u.telegram_chat_id || '');
    setIsModalOpen(true);
  };

  const handleToggleStatus = async (user: User) => {
    const newStatus: UserStatus = user.status === 'ACTIVE' ? 'LOCKED' : 'ACTIVE';
    try {
      const res = await api.updateUserStatus(user.id, newStatus);
      if (res.success) {
        showToast(
          `Đã ${newStatus === 'ACTIVE' ? 'mở khóa' : 'khóa'} tài khoản ${user.email}`,
          newStatus === 'ACTIVE' ? 'success' : 'warning'
        );
        fetchUsers();
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi cập nhật trạng thái người dùng', 'error');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formFullName.trim() || !formEmail.trim()) {
      showToast('Vui lòng điền họ tên và tên đăng nhập!', 'warning');
      return;
    }
    if (!editingUser && !formPassword) {
      showToast('Vui lòng nhập mật khẩu cho tài khoản mới!', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingUser) {
        const res = await api.updateUser(editingUser.id, {
          full_name: formFullName.trim(),
          email: formEmail.trim(),
          role: formRole,
          status: formStatus,
          telegram_chat_id: formTelegramId.trim() || null,
          ...(formPassword.trim() ? { password: formPassword } : {}),
        });
        if (res.success) {
          showToast(`Đã cập nhật tài khoản ${formEmail}`, 'success');
          setIsModalOpen(false);
          setEditingUser(null);
          fetchUsers();
        }
      } else {
        const res = await api.createUser({
          full_name: formFullName.trim(),
          email: formEmail.trim(),
          password: formPassword,
          role: formRole,
          telegram_chat_id: formTelegramId.trim() || undefined,
        });
        if (res.success) {
          showToast(`Đã thêm thành công người dùng: ${formEmail}`, 'success');
          setIsModalOpen(false);
          fetchUsers();
        }
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi lưu thông tin người dùng', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async (u: User) => {
    if (!window.confirm(`Bạn có chắc muốn xóa vĩnh viễn tài khoản "${u.email}" (${u.full_name}) không?`)) {
      return;
    }
    try {
      const res = await api.deleteUser(u.id);
      if (res.success) {
        showToast(res.message || `Đã xóa tài khoản ${u.email}`, 'success');
        fetchUsers();
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi xóa tài khoản', 'error');
    }
  };

  const getRoleBadge = (role: Role) => {
    switch (role) {
      case 'ADMIN':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'OPERATOR':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'VIEWER':
      default:
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-purple-600" />
            <span>Quản lý Người dùng</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Thêm, sửa, khóa hoặc xóa tài khoản và phân quyền truy cập kho
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchUsers}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold border border-slate-200 shadow-sm transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>

          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs shadow-sm transition"
          >
            <UserPlus className="w-4 h-4" />
            <span>Thêm Người Dùng</span>
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo họ tên, tài khoản hoặc vai trò..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-purple-500 transition"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 uppercase font-semibold tracking-wider">
                <th className="py-3.5 px-4">Họ và Tên</th>
                <th className="py-3.5 px-4">Tài khoản</th>
                <th className="py-3.5 px-4">Vai trò</th>
                <th className="py-3.5 px-4">Trạng thái</th>
                <th className="py-3.5 px-4">Khu vực phụ trách</th>
                <th className="py-3.5 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Không tìm thấy người dùng nào.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isLocked = u.status === 'LOCKED';
                  const isSelf = currentUser?.id === u.id;
                  return (
                    <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-slate-900">
                        <div className="flex items-center gap-2">
                          <span>{u.full_name}</span>
                          {isSelf && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 font-medium">
                              Bạn
                            </span>
                          )}
                        </div>
                        {u.telegram_chat_id && (
                          <div className="text-[11px] text-sky-600 flex items-center gap-1 font-normal mt-0.5">
                            <Send className="w-3 h-3" />
                            <span>Telegram đã liên kết</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 font-medium">{u.email}</td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${getRoleBadge(u.role)}`}>
                          {getRoleDisplayName(u.role)}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                            !isLocked
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          {!isLocked ? 'Đang hoạt động' : 'Đã khoá'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600">
                        {u.managed_zones && u.managed_zones.length > 0 ? (
                          u.managed_zones.map((z) => z.name).join(', ')
                        ) : (
                          <span className="text-slate-400">Toàn bộ kho</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(u)}
                            className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold transition inline-flex items-center gap-1"
                          >
                            <Pencil className="w-3 h-3" />
                            <span>Sửa</span>
                          </button>

                          {!isSelf && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleToggleStatus(u)}
                                className={`px-2.5 py-1 rounded-lg border text-xs font-semibold transition inline-flex items-center gap-1 ${
                                  isLocked
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                    : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
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

                              <button
                                type="button"
                                onClick={() => handleDeleteUser(u)}
                                className="px-2.5 py-1 rounded-lg bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold transition inline-flex items-center gap-1"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Xóa</span>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Create / Edit User */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-purple-600" />
                <h2 className="text-base font-bold text-slate-900">
                  {editingUser ? `Chỉnh Sửa Tài Khoản (${editingUser.email})` : 'Thêm Người Dùng Mới'}
                </h2>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Họ và Tên *</label>
                <input
                  type="text"
                  placeholder="VD: Nguyễn Văn A"
                  value={formFullName}
                  onChange={(e) => setFormFullName(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-purple-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Tên đăng nhập / Email *</label>
                <input
                  type="text"
                  placeholder="VD: operator2 hoặc operator2@grain.com"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-purple-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  {editingUser ? 'Mật khẩu mới (để trống nếu giữ nguyên)' : 'Mật khẩu *'}
                </label>
                <input
                  type="password"
                  placeholder={editingUser ? 'Nhập nếu muốn đổi mật khẩu' : 'Tối thiểu 6 ký tự'}
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-purple-500"
                  required={!editingUser}
                />
              </div>

              <div className={editingUser ? 'grid grid-cols-2 gap-3' : ''}>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Vai trò *</label>
                  <select
                    value={formRole}
                    disabled={editingUser?.id === currentUser?.id}
                    onChange={(e) => setFormRole(e.target.value as Role)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-purple-500 disabled:bg-slate-100"
                  >
                    <option value="OPERATOR">Vận hành (Điều khiển Quạt &amp; Ngưỡng)</option>
                    <option value="VIEWER">Giám sát QC (Chỉ xem dữ liệu)</option>
                    <option value="ADMIN">Chủ kho (Toàn quyền quản trị)</option>
                  </select>
                </div>

                {editingUser && (
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Trạng thái</label>
                    <select
                      value={formStatus}
                      disabled={editingUser.id === currentUser?.id}
                      onChange={(e) => setFormStatus(e.target.value as UserStatus)}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-purple-500 disabled:bg-slate-100"
                    >
                      <option value="ACTIVE">Đang hoạt động</option>
                      <option value="LOCKED">Đã khoá</option>
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Telegram Chat ID (tùy chọn)
                </label>
                <input
                  type="text"
                  placeholder="VD: 987654321"
                  value={formTelegramId}
                  onChange={(e) => setFormTelegramId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs"
                >
                  {isSubmitting ? 'Đang lưu...' : editingUser ? 'Lưu thay đổi' : 'Tạo Tài khoản'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
