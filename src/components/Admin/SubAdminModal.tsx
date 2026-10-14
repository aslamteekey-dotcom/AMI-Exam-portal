import React, { useState } from 'react';
import { User, AdminPermissions, DEFAULT_ADMIN_PERMISSIONS } from '../../types';
import { X, ShieldCheck, Check, KeyRound } from 'lucide-react';

interface Props {
  initialData?: User | null;
  onClose: () => void;
  onSave: (adminData: {
    id?: string;
    name: string;
    nameMl?: string;
    username: string;
    password?: string;
    permissions: AdminPermissions;
  }) => Promise<void>;
}

export const SubAdminModal: React.FC<Props> = ({ initialData, onClose, onSave }) => {
  const [name, setName] = useState(initialData?.name || '');
  const [nameMl, setNameMl] = useState(initialData?.nameMl || '');
  const [username, setUsername] = useState(initialData?.username || '');
  const [password, setPassword] = useState(initialData?.plainPassword || '');
  const [permissions, setPermissions] = useState<AdminPermissions>(() => {
    if (initialData?.permissions) {
      return JSON.parse(JSON.stringify(initialData.permissions));
    }
    return JSON.parse(JSON.stringify(DEFAULT_ADMIN_PERMISSIONS));
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const togglePermission = (module: keyof AdminPermissions, type: 'view' | 'edit') => {
    setPermissions(prev => {
      const updated = { ...prev };
      const current = { ...updated[module] };
      current[type] = !current[type];
      // If edit is enabled, automatically enable view
      if (type === 'edit' && current.edit) {
        current.view = true;
      }
      // If view is disabled, automatically disable edit
      if (type === 'view' && !current.view) {
        current.edit = false;
      }
      updated[module] = current;
      return updated;
    });
  };

  const handleSelectAll = (val: boolean) => {
    setPermissions({
      students: { view: val, edit: val },
      teachers: { view: val, edit: val },
      academicExams: { view: val, edit: val },
      marksReports: { view: val, edit: val },
      feesCollections: { view: val, edit: val },
      settings: { view: val, edit: val },
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Please provide an administrator name.');
      return;
    }
    if (!username.trim()) {
      setError('Please provide a login username.');
      return;
    }
    if (!initialData && !password.trim()) {
      setError('Please assign an initial password.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave({
        id: initialData?.id,
        name: name.trim(),
        nameMl: nameMl.trim() || name.trim(),
        username: username.trim(),
        password: password.trim() || undefined,
        permissions,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save sub-admin');
    } finally {
      setIsSubmitting(false);
    }
  };

  const modules: { key: keyof AdminPermissions; label: string; desc: string }[] = [
    { key: 'students', label: 'Students', desc: 'Manage student directory, admissions, and CSV data' },
    { key: 'teachers', label: 'Teachers', desc: 'Manage teachers and class/subject assignments' },
    { key: 'academicExams', label: 'Academic & Exams', desc: 'Exam scheduling, classes, and subjects' },
    { key: 'marksReports', label: 'Marks & Reports', desc: 'Mark verification, progress reports, and dense ranking' },
    { key: 'feesCollections', label: 'Fees & Collections', desc: 'Receipt issuance, special fees, and collection register' },
    { key: 'settings', label: 'Settings & Institution', desc: 'System preferences, backups, and sub-admin delegation' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden my-8">
        <div className="p-5 bg-emerald-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-emerald-300" />
            <h3 className="font-bold text-base">
              {initialData ? 'Edit Sub-Admin Permissions' : 'Add New Sub-Admin'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-emerald-200 hover:text-white hover:bg-emerald-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl">
              {error}
            </div>
          )}

          {/* Credentials Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Admin Full Name *</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Musthafa Master"
                className="w-full p-2.5 border rounded-xl bg-slate-50 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-700"
                required
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Name in Malayalam</label>
              <input
                type="text"
                value={nameMl}
                onChange={e => setNameMl(e.target.value)}
                placeholder="e.g. മുസ്തഫ മാസ്റ്റർ"
                className="w-full p-2.5 border rounded-xl bg-slate-50 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-700"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Login Username *</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="e.g. subadmin.office"
                className="w-full p-2.5 border rounded-xl bg-slate-50 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-700"
                required
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                {initialData ? 'Password (Leave blank to keep)' : 'Initial Password *'}
              </label>
              <input
                type="text"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min 6 characters"
                className="w-full p-2.5 border rounded-xl bg-slate-50 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-700"
                required={!initialData}
              />
            </div>
          </div>

          {/* Granular Permission Checkboxes */}
          <div className="pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-slate-800 text-xs uppercase tracking-wide">
                Granular Module Permissions
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSelectAll(true)}
                  className="text-[11px] text-emerald-800 font-bold hover:underline cursor-pointer"
                >
                  Grant All
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() => handleSelectAll(false)}
                  className="text-[11px] text-slate-500 hover:underline cursor-pointer"
                >
                  Clear All
                </button>
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 bg-slate-50/50">
              {modules.map(mod => {
                const perm = permissions[mod.key];
                return (
                  <div key={mod.key} className="p-3 flex items-center justify-between gap-3 hover:bg-white transition">
                    <div>
                      <div className="font-bold text-slate-900">{mod.label}</div>
                      <div className="text-[10px] text-slate-500">{mod.desc}</div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={perm.view}
                          onChange={() => togglePermission(mod.key, 'view')}
                          className="rounded border-slate-300 text-emerald-800 focus:ring-emerald-500 w-3.5 h-3.5"
                        />
                        <span className="font-semibold text-slate-700">View</span>
                      </label>

                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={perm.edit}
                          onChange={() => togglePermission(mod.key, 'edit')}
                          className="rounded border-slate-300 text-emerald-800 focus:ring-emerald-500 w-3.5 h-3.5"
                        />
                        <span className="font-semibold text-emerald-900">Edit / Manage</span>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl shadow-xs transition disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? 'Saving...' : initialData ? 'Update Permissions' : 'Create Sub-Admin'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
