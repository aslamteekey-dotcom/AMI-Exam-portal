import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { AuditLog } from '../../types';
import { db, safeOnSnapshot, isFirestoreQuotaExhausted } from '../../services/firebase';
import { collection } from 'firebase/firestore';
import {
  ShieldCheck,
  Search,
  Filter,
  Clock,
  RotateCcw,
  CheckCircle,
  Lock,
  Globe,
  UserPlus,
  UserCheck,
  Trash2,
  CalendarCheck,
  LogIn,
  Hash,
  Sparkles,
} from 'lucide-react';

export const AuditLogsView: React.FC = () => {
  const { fetchWithAuth, t } = useAuth();
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [search, setSearch] = useState('');
  const [selectedAction, setSelectedAction] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'marks' | 'attendance' | 'students' | 'logins'>('all');

  const loadLogs = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/audit-logs?limit=300');
      if (res.ok) {
        const data: AuditLog[] = await res.json();
        setLogs(prev => {
          const map = new Map<string, AuditLog>();
          prev.forEach(l => map.set(l.id, l));
          data.forEach(l => map.set(l.id, l));
          return Array.from(map.values()).sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
        });
      }
    } catch (err) {
      console.error('Error loading audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();

    if (isFirestoreQuotaExhausted()) return;

    // 1. Live Firestore real-time listener for auditLogs collection
    let unsub: (() => void) | undefined;
    try {
      unsub = safeOnSnapshot(
        collection(db, 'auditLogs'),
        snapshot => {
          const remote = snapshot.docs.map(doc => ({
            ...doc.data(),
            id: doc.id,
          } as AuditLog));

          if (remote.length > 0) {
            setLogs(prev => {
              const map = new Map<string, AuditLog>();
              prev.forEach(l => map.set(l.id, l));
              remote.forEach(l => map.set(l.id, l));
              return Array.from(map.values()).sort(
                (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
              );
            });
          }
        },
        err => console.warn('AuditLogs Firestore listener error:', err)
      );
    } catch (e) {
      console.warn('Could not attach Firestore listener to auditLogs:', e);
    }

    // 2. Browser event listener for in-app instant updates
    const handleLogAdded = (e: any) => {
      const newLog = e.detail as AuditLog;
      if (newLog?.id) {
        setLogs(prev => {
          if (prev.some(l => l.id === newLog.id)) return prev;
          return [newLog, ...prev];
        });
      }
    };
    const handleLogsUpdated = (e: any) => {
      const updated = e.detail as AuditLog[];
      if (Array.isArray(updated)) {
        setLogs(updated);
      }
    };

    window.addEventListener('madrasa_audit_log_added', handleLogAdded);
    window.addEventListener('madrasa_audit_logs_updated', handleLogsUpdated);

    return () => {
      if (unsub) unsub();
      window.removeEventListener('madrasa_audit_log_added', handleLogAdded);
      window.removeEventListener('madrasa_audit_logs_updated', handleLogsUpdated);
    };
  }, []);

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'MARKS_SUBMITTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
            <Clock className="w-3 h-3 text-amber-700" />
            MARKS SUBMITTED
          </span>
        );
      case 'MARKS_APPROVED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
            <CheckCircle className="w-3 h-3 text-emerald-700" />
            MARKS APPROVED
          </span>
        );
      case 'MARKS_LOCKED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-purple-100 text-purple-900 border border-purple-300">
            <Lock className="w-3 h-3 text-purple-700" />
            MARKS LOCKED
          </span>
        );
      case 'RESULTS_PUBLISHED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-blue-100 text-blue-900 border border-blue-300">
            <Globe className="w-3 h-3 text-blue-700" />
            RESULTS PUBLISHED
          </span>
        );
      case 'STUDENT_CREATED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-teal-100 text-teal-900 border border-teal-300">
            <UserPlus className="w-3 h-3 text-teal-700" />
            STUDENT CREATED
          </span>
        );
      case 'STUDENT_UPDATED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-100 text-indigo-900 border border-indigo-300">
            <UserCheck className="w-3 h-3 text-indigo-700" />
            STUDENT UPDATED
          </span>
        );
      case 'STUDENT_DELETED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-100 text-rose-900 border border-rose-300">
            <Trash2 className="w-3 h-3 text-rose-700" />
            STUDENT DELETED
          </span>
        );
      case 'EXAM_REG_UPDATED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-cyan-100 text-cyan-900 border border-cyan-300">
            <Hash className="w-3 h-3 text-cyan-700" />
            EXAM REG UPDATED
          </span>
        );
      case 'ATTENDANCE_MARKED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
            <CalendarCheck className="w-3 h-3 text-emerald-700" />
            ATTENDANCE MARKED
          </span>
        );
      case 'HOLIDAY_MARKED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-100 text-amber-950 border border-amber-300">
            <span>🏖️</span>
            HOLIDAY MARKED
          </span>
        );
      case 'TEACHER_CREATED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-teal-100 text-teal-900 border border-teal-300">
            <UserPlus className="w-3 h-3 text-teal-700" />
            TEACHER CREATED
          </span>
        );
      case 'TEACHER_UPDATED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-100 text-indigo-900 border border-indigo-300">
            <UserCheck className="w-3 h-3 text-indigo-700" />
            TEACHER UPDATED
          </span>
        );
      case 'TEACHER_DELETED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-100 text-rose-900 border border-rose-300">
            <Trash2 className="w-3 h-3 text-rose-700" />
            TEACHER DELETED
          </span>
        );
      case 'TEACHER_LOGIN':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-violet-100 text-violet-900 border border-violet-300">
            <LogIn className="w-3 h-3 text-violet-700" />
            TEACHER LOGIN
          </span>
        );
      case 'ADMIN_LOGIN':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-sky-100 text-sky-900 border border-sky-300">
            <ShieldCheck className="w-3 h-3 text-sky-700" />
            ADMIN LOGIN
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
            {action}
          </span>
        );
    }
  };

  const filteredLogs = logs.filter(l => {
    // 1. Action select filter
    if (selectedAction && l.action !== selectedAction) return false;

    // 2. Category filter
    if (categoryFilter === 'marks') {
      if (!['MARKS_SUBMITTED', 'MARKS_APPROVED', 'MARKS_LOCKED', 'RESULTS_PUBLISHED'].includes(l.action)) {
        return false;
      }
    } else if (categoryFilter === 'attendance') {
      if (!['ATTENDANCE_MARKED', 'HOLIDAY_MARKED'].includes(l.action)) {
        return false;
      }
    } else if (categoryFilter === 'students') {
      if (!['STUDENT_CREATED', 'STUDENT_UPDATED', 'STUDENT_DELETED', 'EXAM_REG_UPDATED', 'TEACHER_CREATED', 'TEACHER_UPDATED', 'TEACHER_DELETED'].includes(l.action)) {
        return false;
      }
    } else if (categoryFilter === 'logins') {
      if (!['TEACHER_LOGIN', 'ADMIN_LOGIN'].includes(l.action)) {
        return false;
      }
    }

    // 3. Search query match
    if (search.trim()) {
      const q = search.toLowerCase();
      const u = (l.user || l.userName || '').toLowerCase();
      const r = (l.role || l.userRole || '').toLowerCase();
      const a = (l.action || '').toLowerCase();
      const d = (l.details || '').toLowerCase();
      return u.includes(q) || r.includes(q) || a.includes(q) || d.includes(q);
    }

    return true;
  });

  const uniqueActions = Array.from(new Set(logs.map(l => l.action))).filter(Boolean);

  return (
    <div className="space-y-6">
      {/* Header with KPI and Refresh */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900">{t.navAuditLogs}</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
              {logs.length} Events
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Sync
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Immutable administrative audit trail recording mark changes, verification events, holidays, and logins.
          </p>
        </div>

        <button
          type="button"
          onClick={loadLogs}
          disabled={loading}
          className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs transition cursor-pointer"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-600' : 'text-slate-500'}`} />
          <span>{loading ? 'Syncing...' : 'Refresh Logs'}</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        {/* Category Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-bold scrollbar-none">
          <button
            type="button"
            onClick={() => setCategoryFilter('all')}
            className={`px-3 py-1.5 rounded-xl transition whitespace-nowrap cursor-pointer ${
              categoryFilter === 'all'
                ? 'bg-emerald-800 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Activity ({logs.length})
          </button>
          <button
            type="button"
            onClick={() => setCategoryFilter('marks')}
            className={`px-3 py-1.5 rounded-xl transition whitespace-nowrap cursor-pointer ${
              categoryFilter === 'marks'
                ? 'bg-emerald-800 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Marks &amp; Publishing
          </button>
          <button
            type="button"
            onClick={() => setCategoryFilter('attendance')}
            className={`px-3 py-1.5 rounded-xl transition whitespace-nowrap cursor-pointer ${
              categoryFilter === 'attendance'
                ? 'bg-emerald-800 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Attendance &amp; Holidays
          </button>
          <button
            type="button"
            onClick={() => setCategoryFilter('students')}
            className={`px-3 py-1.5 rounded-xl transition whitespace-nowrap cursor-pointer ${
              categoryFilter === 'students'
                ? 'bg-emerald-800 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Students, Staff &amp; Exam Reg
          </button>
          <button
            type="button"
            onClick={() => setCategoryFilter('logins')}
            className={`px-3 py-1.5 rounded-xl transition whitespace-nowrap cursor-pointer ${
              categoryFilter === 'logins'
                ? 'bg-emerald-800 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Logins
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-1 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-600">Specific Action:</span>
            <select
              value={selectedAction}
              onChange={e => setSelectedAction(e.target.value)}
              className="p-1.5 border border-slate-300 rounded-lg bg-slate-50 text-xs focus:outline-none"
            >
              <option value="">All Actions ({uniqueActions.length})</option>
              {uniqueActions.map(a => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search user, action, details..."
              className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg bg-slate-50/50 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* Audit Logs Table / Cards with Mobile-friendly Overflow */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {filteredLogs.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            No audit logs found matching the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-xs text-left min-w-[700px]">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3 w-40 whitespace-nowrap">Timestamp</th>
                  <th className="p-3 w-40 whitespace-nowrap">User</th>
                  <th className="p-3 w-48 whitespace-nowrap">Action</th>
                  <th className="p-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.map(log => {
                  const userName = log.user || log.userName || 'System User';
                  const userRole = log.role || log.userRole || 'system';

                  return (
                    <tr key={log.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-3 font-mono text-slate-500 text-[11px] whitespace-nowrap align-top">
                        <div className="font-semibold text-slate-700">
                          {new Date(log.timestamp).toLocaleDateString([], {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {new Date(log.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </div>
                      </td>

                      <td className="p-3 align-top whitespace-nowrap">
                        <div className="font-bold text-slate-900">{userName}</div>
                        <span className="inline-block text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                          {userRole}
                        </span>
                      </td>

                      <td className="p-3 align-top whitespace-nowrap">
                        {getActionBadge(log.action)}
                      </td>

                      <td className="p-3 text-slate-800 leading-relaxed font-medium align-top break-words max-w-md">
                        {log.details}
                        {log.previousValue !== undefined && log.newValue !== undefined && (
                          <div className="mt-1 p-2 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-mono text-purple-900 break-all">
                            Previous: {JSON.stringify(log.previousValue)} → New: {JSON.stringify(log.newValue)}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
