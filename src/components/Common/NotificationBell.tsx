import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db, isFirestoreQuotaExhausted, safeOnSnapshot } from '../../services/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { AppNotification } from '../../types';
import { markNotificationAsRead, markAllNotificationsAsRead } from '../../services/notificationService';
import {
  Bell,
  CheckCircle,
  AlertTriangle,
  Award,
  Unlock,
  Clock,
  CheckCheck,
  X,
  Volume2,
} from 'lucide-react';

export const NotificationBell: React.FC = () => {
  const { user, lang } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Listen to Firestore notifications collection
  useEffect(() => {
    if (!user) return;

    let unsub: (() => void) | undefined;
    if (!isFirestoreQuotaExhausted()) {
      try {
        const notifQuery = query(
          collection(db, 'notifications'),
          orderBy('createdAt', 'desc'),
          limit(30)
        );

        unsub = safeOnSnapshot(
          notifQuery,
          (snapshot: any) => {
            const list: AppNotification[] = snapshot.docs.map((d: any) => ({
              id: d.id,
              ...d.data(),
            }));
            setNotifications(list);
          },
          (error: any) => {
            console.warn('[NotificationBell] Listener notice:', error);
          }
        );
      } catch (err) {
        console.warn('[NotificationBell] Setup error:', err);
      }
    }

    // Local event listener for instant optimistic updates
    const handleLocalNotif = (e: any) => {
      const item = e.detail;
      if (item) {
        setNotifications((prev) => [item, ...prev.filter((p) => p.id !== item.id)]);
      }
    };
    window.addEventListener('madrasa_new_notification', handleLocalNotif);

    return () => {
      if (unsub) unsub();
      window.removeEventListener('madrasa_new_notification', handleLocalNotif);
    };
  }, [user]);

  if (!user) return null;

  // Filter notifications relevant to current user
  const relevantNotifications = notifications.filter((n) => {
    if (user.role === 'admin') return true;

    if (user.role === 'teacher') {
      if (n.targetRole === 'admin') return false;
      if (n.targetRole === 'parent') return false;
      if (n.targetUserId && n.targetUserId !== user.id) return false;
      return true;
    }

    if (user.role === 'parent') {
      if (n.targetRole === 'admin' || n.targetRole === 'teacher') return false;
      // If studentId specified, verify parent is linked to this student
      if (n.studentId && Array.isArray((user as any).studentIds)) {
        return (user as any).studentIds.includes(n.studentId);
      }
      return true;
    }

    return n.targetRole === 'all';
  });

  const unreadCount = relevantNotifications.filter((n) => !n.readBy?.includes(user.id)).length;

  const getNotifIcon = (type: AppNotification['type']) => {
    switch (type) {
      case 'absent':
        return <AlertTriangle className="w-4 h-4 text-rose-600" />;
      case 'results_published':
        return <Award className="w-4 h-4 text-emerald-600" />;
      case 'marks_unlocked':
        return <Unlock className="w-4 h-4 text-amber-600" />;
      case 'marks_pending':
        return <Clock className="w-4 h-4 text-blue-600" />;
      default:
        return <Bell className="w-4 h-4 text-purple-600" />;
    }
  };

  const formatTimeAgo = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      const diffMs = Date.now() - date.getTime();
      const diffMin = Math.floor(diffMs / (1000 * 60));
      const diffHr = Math.floor(diffMin / 60);
      const diffDays = Math.floor(diffHr / 24);

      if (diffMin < 2) return lang === 'ml' ? 'ഇപ്പോൾ' : 'Just now';
      if (diffMin < 60) return lang === 'ml' ? `${diffMin} മിനിറ്റ് മുമ്പ്` : `${diffMin}m ago`;
      if (diffHr < 24) return lang === 'ml' ? `${diffHr} മണിക്കൂർ മുമ്പ്` : `${diffHr}h ago`;
      return lang === 'ml' ? `${diffDays} ദിവസം മുമ്പ്` : `${diffDays}d ago`;
    } catch {
      return '';
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-600 hover:text-emerald-800 hover:bg-slate-100 rounded-xl transition cursor-pointer"
        title={lang === 'ml' ? 'അറിയിപ്പുകൾ' : 'Notifications'}
      >
        <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white shadow-xs">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notifications Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="p-3.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-900">
                {lang === 'ml' ? 'അറിയിപ്പുകൾ' : 'Notifications'}
              </span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                  {unreadCount} {lang === 'ml' ? 'പുതിയത്' : 'new'}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => markAllNotificationsAsRead(relevantNotifications, user.id)}
                  className="text-[11px] font-semibold text-emerald-800 hover:text-emerald-950 flex items-center gap-1 px-2 py-1 hover:bg-emerald-50 rounded-lg transition cursor-pointer"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>{lang === 'ml' ? 'എല്ലാം വായിച്ചു' : 'Mark all read'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100 text-xs">
            {relevantNotifications.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="font-medium text-slate-600">
                  {lang === 'ml' ? 'പുതിയ അറിയിപ്പുകൾ ലഭ്യമല്ല' : 'No notifications yet'}
                </p>
                <p className="text-[11px] mt-0.5">
                  {lang === 'ml'
                    ? 'പരീക്ഷാ ഫലങ്ങളും അറ്റൻഡൻസ് അപ്‌ഡേറ്റുകളും ഇവിടെ ദൃശ്യമാകും.'
                    : 'System alerts and examination updates will appear here.'}
                </p>
              </div>
            ) : (
              relevantNotifications.map((notif) => {
                const isRead = notif.readBy?.includes(user.id);
                return (
                  <div
                    key={notif.id}
                    onClick={() => {
                      if (!isRead) markNotificationAsRead(notif.id, user.id);
                    }}
                    className={`p-3.5 transition flex items-start gap-3 cursor-pointer ${
                      isRead ? 'bg-white hover:bg-slate-50' : 'bg-emerald-50/40 hover:bg-emerald-50/70'
                    }`}
                  >
                    <div className="p-2 rounded-xl bg-white border border-slate-200 shadow-2xs shrink-0 mt-0.5">
                      {getNotifIcon(notif.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className={`text-xs ${isRead ? 'font-semibold text-slate-800' : 'font-bold text-slate-950'}`}>
                          {lang === 'ml' && notif.titleMl ? notif.titleMl : notif.title}
                        </h4>
                        <span className="text-[10px] text-slate-400 whitespace-nowrap">
                          {formatTimeAgo(notif.createdAt)}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-0.5 line-clamp-2 leading-relaxed">
                        {lang === 'ml' && notif.bodyMl ? notif.bodyMl : notif.body}
                      </p>
                    </div>
                    {!isRead && (
                      <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0 mt-2" title="Unread" />
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="p-2.5 bg-slate-50 border-t border-slate-100 text-center">
            <span className="text-[10px] text-slate-500 font-medium">
              Al-Madrasathul Islamiya Pallikkuth • Push Notification Hub
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
