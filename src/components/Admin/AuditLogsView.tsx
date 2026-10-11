import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { AuditLog } from '../../types';
import { ShieldCheck, Search, Filter, Clock } from 'lucide-react';

export const AuditLogsView: React.FC = () => {
  const { fetchWithAuth, t } = useAuth();
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [search, setSearch] = useState('');
  const [selectedAction, setSelectedAction] = useState('');

  const loadLogs = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/audit-logs?limit=200');
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (err) {
      console.error('Error loading audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const filteredLogs = logs.filter(l => {
    const matchAction = selectedAction ? l.action === selectedAction : true;
    const matchSearch =
      l.userName.toLowerCase().includes(search.toLowerCase()) ||
      l.details.toLowerCase().includes(search.toLowerCase()) ||
      l.action.toLowerCase().includes(search.toLowerCase());
    return matchAction && matchSearch;
  });

  const uniqueActions = Array.from(new Set(logs.map(l => l.action)));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{t.navAuditLogs} ({logs.length})</h2>
          <p className="text-xs text-slate-500">
            Immutable administrative audit trail recording mark changes, verification events, and logins.
          </p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-600">Action:</span>
          <select
            value={selectedAction}
            onChange={e => setSelectedAction(e.target.value)}
            className="p-1.5 border border-slate-300 rounded-lg bg-slate-50 text-xs focus:outline-none"
          >
            <option value="">All Actions</option>
            {uniqueActions.map(a => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        <div className="relative w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search audit trail..."
            className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg bg-slate-50/50 text-xs focus:outline-none"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-100 text-slate-700 font-bold border-b">
            <tr>
              <th className="p-3 w-40">Timestamp</th>
              <th className="p-3 w-36">User</th>
              <th className="p-3 w-48">Action</th>
              <th className="p-3">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredLogs.map(log => (
              <tr key={log.id} className="hover:bg-slate-50">
                <td className="p-3 font-mono text-slate-500 text-[11px] whitespace-nowrap">
                  {new Date(log.timestamp).toLocaleString()}
                </td>
                <td className="p-3">
                  <div className="font-bold text-slate-900">{log.userName}</div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">{log.userRole}</span>
                </td>
                <td className="p-3 font-mono font-bold text-slate-700 text-[11px]">
                  <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded">
                    {log.action}
                  </span>
                </td>
                <td className="p-3 text-slate-700 leading-relaxed font-medium">
                  {log.details}
                  {log.previousValue !== undefined && log.newValue !== undefined && (
                    <span className="block text-[11px] text-purple-800 font-mono mt-0.5">
                      (Previous: {JSON.stringify(log.previousValue)} → New: {JSON.stringify(log.newValue)})
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
