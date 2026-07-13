import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { logout } from '../../store/slices/authSlice';
import { setTheme } from '../../store/slices/uiSlice';
import { apiService } from '../../services/api';
import {
  FiSearch, FiBell, FiSun, FiMoon, FiUser, FiLogOut,
  FiSettings, FiChevronDown, FiMenu, FiAlertTriangle,
  FiShoppingBag, FiRefreshCw, FiX, FiClock,
} from 'react-icons/fi';

export default function Navbar({ onMenuToggle }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user, isAuthenticated, loading: authLoading } = useSelector((state) => state.auth);
  const { theme } = useSelector((state) => state.ui);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const profileRef = useRef(null);
  const notifRef = useRef(null);

  // ─── Fetch Notifications (only when authenticated) ───
  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated || authLoading) return;
    try {
      const res = await apiService.getNotifications({ limit: 20 });
      setNotifications(res.data?.data || []);
      setUnreadCount(res.data?.unreadCount || 0);
    } catch {
      // Fail silently — notification bar is non-critical
    }
  }, [isAuthenticated, authLoading]);

  // Fetch unread count once on mount so the bell badge shows immediately
  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      fetchNotifications();
    }
  }, [isAuthenticated, authLoading, fetchNotifications]);

  // Poll every 30s while dropdown is open; stop when closed
  useEffect(() => {
    if (!notificationsOpen || !isAuthenticated || authLoading) return;
    fetchNotifications();
    const id = setInterval(fetchNotifications, 30000);
    return () => clearInterval(id);
  }, [notificationsOpen, isAuthenticated, authLoading, fetchNotifications]);

  // Mark a single notification as read
  const markAsRead = async (id) => {
    try {
      await apiService.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {}
  };

  // Permanently delete a single notification
  const deleteNotification = async (id, e) => {
    e.stopPropagation();
    try {
      await apiService.deleteNotification(id);
      setNotifications((prev) => prev.filter((n) => n._id !== id));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {}
  };

  // Permanently delete all notifications
  const deleteAllNotifications = async () => {
    try {
      await apiService.deleteAllNotifications();
      setNotifications([]);
      setUnreadCount(0);
    } catch {}
  };

  // Navigate to the relevant page based on notification type
  const handleNotifClick = async (notif) => {
    setNotificationsOpen(false);
    if (!notif.isRead) {
      await markAsRead(notif._id).catch(() => {});
    }

    const type = notif.type;
    const data = notif.data || {};

    switch (true) {
      case type === 'low_stock' || type === 'out_of_stock':
        navigate('/inventory');
        break;
      case type === 'order_created' || type === 'order_pending':
        if (data.orderId) {
          navigate(`/orders/${data.orderId}`);
        } else {
          navigate('/orders');
        }
        break;
      case type === 'expiry_alert':
        navigate('/inventory');
        break;
      case type === 'new_customer':
        navigate('/customers');
        break;
      case type === 'payment_received' || type === 'payment_failed':
        navigate('/orders');
        break;
      case type === 'subscription_renewal' || type === 'subscription_expired':
        navigate('/billing');
        break;
      case type === 'shop_registered':
        navigate('/super-admin/shops');
        break;
      case type === 'support_ticket':
        navigate('/support');
        break;
      default:
        // For unknown types, do nothing extra (just mark as read)
        break;
    }
  };

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotificationsOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleLogout = () => dispatch(logout());

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    dispatch(setTheme(newTheme));
    localStorage.setItem('theme', newTheme);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/products?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
      setSearchOpen(false);
    }
  };

  const getInitials = (name) => {
    return name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  };

  // ─── Time ago helper ───
  const getTimeAgo = (dateStr) => {
    if (!dateStr) return '';
    const now = Date.now();
    const date = new Date(dateStr).getTime();
    const diff = now - date;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  const getRoleBadge = (role) => {
    const badges = {
      super_admin: 'badge-danger',
      shop_admin: 'badge-warning',
      manager: 'badge-info',
      staff: 'badge-success',
    };
    return badges[role] || 'badge-info';
  };

  return (
    <header className="h-16 bg-white dark:bg-gray-800 border-b dark:border-gray-700 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-20">
      {/* Left: Menu button + Search */}
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuToggle}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 lg:hidden"
        >
          <FiMenu className="w-5 h-5" />
        </button>

        {/* Desktop Search */}
        <form onSubmit={handleSearch} className="hidden md:flex items-center">
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products, orders, customers..."
              className="w-72 lg:w-96 pl-9 pr-4 py-2 bg-gray-100 dark:bg-gray-700 border-0 rounded-lg text-sm
                focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-gray-200
                placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
          </div>
        </form>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Mobile Search */}
        <button
          onClick={() => setSearchOpen(!searchOpen)}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 md:hidden"
        >
          <FiSearch className="w-5 h-5" />
        </button>

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? <FiSun className="w-5 h-5" /> : <FiMoon className="w-5 h-5" />}
        </button>

        {/* Notifications */}
        <div ref={notifRef} className="relative">
          <button
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 relative transition-colors"
            title="Notifications"
          >
            <FiBell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-danger-500 rounded-full">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {notificationsOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white dark:bg-gray-800 rounded-xl shadow-lg border dark:border-gray-700 animate-slide-down overflow-hidden z-30">
              <div className="p-3 border-b dark:border-gray-700 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Notifications
                  {unreadCount > 0 && (
                    <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                      ({unreadCount} unread)
                    </span>
                  )}
                </h3>
                <div className="flex items-center gap-1">
                  <button
                    onClick={fetchNotifications}
                    className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    title="Refresh"
                  >
                    <FiRefreshCw className="w-3.5 h-3.5" />
                  </button>
                  {notifications.length > 0 && (
                    <>
                      <button
                        onClick={deleteAllNotifications}
                        className="px-2 py-1 text-xs font-medium text-danger-600 hover:text-danger-700 hover:bg-danger-50 dark:text-danger-400 dark:hover:bg-danger-900/20 rounded-lg transition-colors"
                      >
                        Delete all
                      </button>
                      {unreadCount > 0 && (
                        <button
                          onClick={async () => {
                            await apiService.markAllAsRead();
                            setUnreadCount(0);
                            setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
                          }}
                          className="px-2 py-1 text-xs font-medium text-primary-600 hover:text-primary-700 hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-900/20 rounded-lg transition-colors"
                        >
                          Mark read
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div className="max-h-80 overflow-y-auto p-2">
                {notifications.length === 0 ? (
                  <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
                    <FiBell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    No notifications
                  </div>
                ) : (
                  notifications.map((notif) => {
                    const isLowStock = notif.type === 'low_stock' || notif.type === 'out_of_stock';
                    const isOrder = notif.type === 'order_created' || notif.type === 'order_pending';
                    const isExpiry = notif.type === 'expiry_alert';
                    const isSystem = notif.type === 'system_announcement' || notif.type === 'subscription_renewal';

                    let icon = FiBell;
                    let bgColor = 'bg-gray-100 dark:bg-gray-700';
                    let iconColor = 'text-gray-500';
                    let dotColor = 'bg-primary-500';

                    if (notif.type === 'out_of_stock') {
                      icon = FiX;
                      bgColor = 'bg-danger-50 dark:bg-danger-900/20';
                      iconColor = 'text-danger-500';
                      dotColor = 'bg-danger-500';
                    } else if (notif.type === 'low_stock') {
                      icon = FiAlertTriangle;
                      bgColor = 'bg-warning-50 dark:bg-warning-900/20';
                      iconColor = 'text-warning-500';
                      dotColor = 'bg-warning-500';
                    } else if (isOrder) {
                      icon = FiShoppingBag;
                      bgColor = 'bg-primary-50 dark:bg-primary-900/20';
                      iconColor = 'text-primary-500';
                    } else if (isExpiry) {
                      icon = FiClock;
                      bgColor = 'bg-amber-50 dark:bg-amber-900/20';
                      iconColor = 'text-amber-500';
                    } else if (isSystem) {
                      icon = FiSettings;
                      bgColor = 'bg-gray-100 dark:bg-gray-700';
                      iconColor = 'text-gray-500';
                    }

                    const timeAgo = getTimeAgo(notif.createdAt);

                    return (
                      <div
                        key={notif._id}
                        onClick={() => handleNotifClick(notif)}
                        className={`group relative flex items-start gap-3 p-3 rounded-lg mb-1 cursor-pointer transition-all hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                          !notif.isRead ? `${bgColor} border-l-2 border-primary-500` : ''
                        }`}
                      >
                        <button
                          onClick={(e) => deleteNotification(notif._id, e)}
                          className="absolute top-2 right-2 p-0.5 rounded text-gray-300 hover:text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/20 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Delete notification"
                        >
                          <FiX className="w-3 h-3" />
                        </button>
                        <div className={`w-8 h-8 rounded-full ${bgColor} flex items-center justify-center flex-shrink-0`}>
                          <div className={iconColor}>
                            {React.createElement(icon, { size: 16 })}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className={`text-sm ${!notif.isRead ? 'font-semibold' : 'font-medium'} text-gray-900 dark:text-white truncate pr-4`}>
                              {notif.title}
                            </p>
                            {!notif.isRead && (
                              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5" style={{ backgroundColor: dotColor.replace('bg-', '').replace('-500', '') ? undefined : '#3b82f6' }} />
                            )}
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                            {notif.message}
                          </p>
                          <p className="text-[10px] text-gray-400 mt-1">{timeAgo}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Profile Dropdown */}
        <div ref={profileRef} className="relative">
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
              {getInitials(user?.name)}
            </div>
            <div className="hidden md:block text-left">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200 leading-tight">{user?.name}</p>
              <p className={`text-[10px] leading-tight mt-0.5 ${getRoleBadge(user?.role)}`}>
                {user?.role?.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
              </p>
            </div>
            <FiChevronDown className="w-4 h-4 text-gray-400" />
          </button>

          {profileOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-gray-800 rounded-xl shadow-lg border dark:border-gray-700 animate-slide-down overflow-hidden">
              {/* User Info */}
              <div className="p-4 border-b dark:border-gray-700">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{user?.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{user?.email}</p>
                <p className={`text-xs mt-1.5 inline-block ${getRoleBadge(user?.role)}`}>
                  {user?.role?.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                </p>
              </div>

              {/* Menu Items */}
              <div className="p-1">
                <button
                  onClick={() => { setProfileOpen(false); navigate('/settings'); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <FiUser className="w-4 h-4" /> Profile Settings
                </button>
                <button
                  onClick={() => { setProfileOpen(false); navigate('/settings'); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <FiSettings className="w-4 h-4" /> Account Settings
                </button>
                <hr className="my-1 dark:border-gray-700" />
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-danger-600 dark:text-danger-400 rounded-lg hover:bg-danger-50 dark:hover:bg-danger-900/20"
                >
                  <FiLogOut className="w-4 h-4" /> Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Search Bar */}
      {searchOpen && (
        <div className="absolute top-16 left-0 right-0 bg-white dark:bg-gray-800 border-b dark:border-gray-700 p-3 animate-slide-down md:hidden">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="input-field flex-1"
              autoFocus
            />
            <button type="submit" className="btn-primary px-4">
              <FiSearch className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </header>
  );
}
