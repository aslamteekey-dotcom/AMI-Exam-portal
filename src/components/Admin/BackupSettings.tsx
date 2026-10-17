import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { InstitutionSettings, User, AdminPermissions } from '../../types';
import { firestoreSync } from '../../services/firestoreSync';
import { SubAdminModal } from './SubAdminModal';
import {
  Download,
  Upload,
  Save,
  CheckCircle,
  ShieldAlert,
  FileText,
  Database,
  KeyRound,
  Eye,
  EyeOff,
  User as UserIcon,
  Shield,
  Trash2,
  RefreshCw,
  Plus,
  Edit2,
  ShieldCheck,
} from 'lucide-react';

export const BackupSettings: React.FC = () => {
  const { fetchWithAuth, lang, t, user, refreshUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<InstitutionSettings | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Admin Profile & Credential state
  const [adminUsername, setAdminUsername] = useState(user?.username || 'principal');
  const [adminName, setAdminName] = useState(user?.name || 'ASLAM TK');
  const [adminNameMl, setAdminNameMl] = useState(user?.nameMl || 'അസ്‌ലം ടി.കെ.');
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [credentialSuccess, setCredentialSuccess] = useState(false);
  const [isUpdatingCredentials, setIsUpdatingCredentials] = useState(false);

  useEffect(() => {
    if (user) {
      setAdminUsername(user.username);
      setAdminName(user.name);
      setAdminNameMl(user.nameMl || '');
    }
  }, [user]);

  const handleUpdateCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdatingCredentials(true);
    setCredentialSuccess(false);
    try {
      const res = await fetchWithAuth('/api/auth/profile-credentials', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newUsername: adminUsername.trim(),
          newPassword: adminPassword.trim() || undefined,
          name: adminName.trim(),
          nameMl: adminNameMl.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update credentials');
      }
      setCredentialSuccess(true);
      setAdminPassword('');
      await refreshUser();
      setTimeout(() => setCredentialSuccess(false), 4000);
      alert('Admin credentials successfully updated! You can now log in with your updated username and password in subsequent sessions.');
    } catch (err: any) {
      alert(err.message || 'Error updating credentials');
    } finally {
      setIsUpdatingCredentials(false);
    }
  };

  const handleDownloadBackup = async () => {
    setIsDownloading(true);
    try {
      const res = await fetchWithAuth('/api/backup/download');
      if (!res.ok) {
        throw new Error('Failed to download database backup');
      }
      const data = await res.json();
      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      link.href = url;
      link.download = `madrasa_pallikkuth_backup_${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);
    } catch (err: any) {
      console.error('Download error:', err);
      alert(err.message || 'Error downloading database backup');
    } finally {
      setIsDownloading(false);
    }
  };

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/settings');
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch (err) {
      console.error('Error loading settings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const res = await fetchWithAuth('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        firestoreSync.syncSettings(settings).catch(e => {
          console.warn('Firestore syncSettings error:', e);
        });
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      alert('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const confirm = window.confirm(
      'WARNING: Restoring from a backup will overwrite the current database with the backup snapshot. Do you want to continue?'
    );
    if (!confirm) return;

    setIsRestoring(true);
    const reader = new FileReader();
    reader.onload = async event => {
      try {
        const rawJson = event.target?.result as string;
        const parsed = JSON.parse(rawJson);

        const res = await fetchWithAuth('/api/backup/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ backupData: parsed }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to restore database');
        }

        alert('Database restored successfully! Refreshing view...');
        window.location.reload();
      } catch (err: any) {
        alert(err.message);
      } finally {
        setIsRestoring(false);
      }
    };
    reader.readAsText(file);
  };

  // Sub-Admin State & Management
  const [subAdmins, setSubAdmins] = useState<User[]>([]);
  const [showSubAdminModal, setShowSubAdminModal] = useState(false);
  const [editingSubAdmin, setEditingSubAdmin] = useState<User | null>(null);

  const loadSubAdmins = async () => {
    try {
      const res = await fetchWithAuth('/api/sub-admins');
      if (res.ok) {
        const data = await res.json();
        setSubAdmins(data);
      }
    } catch (err) {
      console.error('Failed to load sub-admins:', err);
    }
  };

  useEffect(() => {
    loadSubAdmins();
  }, []);

  const handleSaveSubAdmin = async (adminData: {
    id?: string;
    name: string;
    nameMl?: string;
    username: string;
    password?: string;
    permissions: AdminPermissions;
  }) => {
    if (adminData.id) {
      const res = await fetchWithAuth(`/api/sub-admins/${adminData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adminData),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update sub-admin');
      }
    } else {
      const res = await fetchWithAuth('/api/sub-admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adminData),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create sub-admin');
      }
    }
    await loadSubAdmins();
    alert('Sub-admin account saved successfully!');
  };

  const handleDeleteSubAdmin = async (admin: User) => {
    if (!window.confirm(`Delete sub-admin account "${admin.name}" (@${admin.username})?`)) return;
    try {
      const res = await fetchWithAuth(`/api/sub-admins/${admin.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete sub-admin');
      await loadSubAdmins();
    } catch (err: any) {
      alert(err.message || 'Error deleting sub-admin');
    }
  };

  if (loading || !settings) {
    return <div className="text-center py-10 text-xs text-slate-500">Loading settings...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">{t.navSettings}</h2>
        <p className="text-xs text-slate-500">
          Admin credential security, institutional header details, report format, signature blocks, and JSON database backup/recovery.
        </p>
      </div>

      {/* Admin Profile & Login Credentials Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-emerald-800" />
            <div>
              <h3 className="text-base font-bold text-slate-900">Admin Account & Login Credentials</h3>
              <p className="text-xs text-slate-500">Update your administrator username and password for subsequent sessions.</p>
            </div>
          </div>

          {credentialSuccess && (
            <span className="text-xs font-bold text-emerald-700 flex items-center gap-1 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
              <CheckCircle className="w-4 h-4" /> Credentials Updated!
            </span>
          )}
        </div>

        <form onSubmit={handleUpdateCredentials} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Admin Username / Login ID
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={adminUsername}
                  onChange={e => setAdminUsername(e.target.value)}
                  placeholder="e.g. principal"
                  className="w-full p-2.5 border rounded-xl font-mono focus:outline-emerald-700 bg-slate-50/50"
                  required
                />
              </div>
              <span className="text-[11px] text-slate-400 mt-1 block">
                Default: <code className="font-mono text-slate-600">principal</code>
              </span>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                New Password <span className="font-normal text-slate-400">(leave blank to keep current)</span>
              </label>
              <div className="relative">
                <input
                  type={showAdminPassword ? 'text' : 'password'}
                  value={adminPassword}
                  onChange={e => setAdminPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full p-2.5 pr-9 border rounded-xl font-mono focus:outline-emerald-700 bg-slate-50/50"
                />
                <button
                  type="button"
                  onClick={() => setShowAdminPassword(!showAdminPassword)}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  {showAdminPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <span className="text-[11px] text-slate-400 mt-1 block">
                Default: <code className="font-mono text-slate-600">admin123</code>
              </span>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Principal Name (English)
              </label>
              <input
                type="text"
                value={adminName}
                onChange={e => setAdminName(e.target.value)}
                placeholder="e.g. ASLAM TK"
                className="w-full p-2.5 border rounded-xl focus:outline-emerald-700 bg-slate-50/50"
                required
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Principal Name (Malayalam)
              </label>
              <input
                type="text"
                value={adminNameMl}
                onChange={e => setAdminNameMl(e.target.value)}
                placeholder="ഉദാ: അസ്‌ലം ടി.കെ."
                className="w-full p-2.5 border rounded-xl focus:outline-emerald-700 bg-slate-50/50"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isUpdatingCredentials}
              className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition shadow-xs disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {isUpdatingCredentials ? 'Saving Credentials...' : 'Save Admin Profile & Credentials'}
            </button>
          </div>
        </form>
      </div>

      {/* Database Backup & Disaster Recovery Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Database className="w-5 h-5 text-emerald-800" />
          <h3 className="text-base font-bold text-slate-900">Database Backup & Portability</h3>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          The persistent server database stores all users, examinations, classes, students, assignments, verified marks, and audit logs. You can create complete snapshots or restore from previously downloaded JSON backups.
        </p>

        <div className="flex flex-wrap items-center gap-4 pt-2">
          <button
            type="button"
            onClick={handleDownloadBackup}
            disabled={isDownloading}
            className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition shadow-xs disabled:opacity-50 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            {isDownloading ? 'Preparing Backup...' : 'Download Full Database JSON Backup'}
          </button>

          <label className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl cursor-pointer transition">
            <Upload className="w-4 h-4" />
            {isRestoring ? 'Restoring...' : 'Restore Database from JSON'}
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleRestoreFile}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Institution Details & Progress Report Customization */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-800" />
            <h3 className="text-base font-bold text-slate-900">Institution & Report Format Settings</h3>
          </div>

          {saveSuccess && (
            <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
              <CheckCircle className="w-4 h-4" /> Settings Saved!
            </span>
          )}
        </div>

        <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Madrasa Name (English)</label>
              <input
                type="text"
                value={settings.madrasaNameEn}
                onChange={e => setSettings({ ...settings, madrasaNameEn: e.target.value })}
                className="w-full p-2.5 border rounded-xl font-bold"
                required
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Madrasa Name (Malayalam)</label>
              <input
                type="text"
                value={settings.madrasaNameMl}
                onChange={e => setSettings({ ...settings, madrasaNameMl: e.target.value })}
                className="w-full p-2.5 border rounded-xl font-bold"
                required
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Arabic Header Calligraphy Text</label>
            <input
              type="text"
              dir="rtl"
              value={settings.madrasaArabicHeader}
              onChange={e => setSettings({ ...settings, madrasaArabicHeader: e.target.value })}
              className="w-full p-2.5 border rounded-xl font-serif text-sm"
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Location / Address (English)</label>
              <input
                type="text"
                value={settings.locationEn}
                onChange={e => setSettings({ ...settings, locationEn: e.target.value })}
                className="w-full p-2.5 border rounded-xl"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Location / Address (Malayalam)</label>
              <input
                type="text"
                value={settings.locationMl}
                onChange={e => setSettings({ ...settings, locationMl: e.target.value })}
                className="w-full p-2.5 border rounded-xl"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Phone</label>
              <input
                type="text"
                value={settings.phone}
                onChange={e => setSettings({ ...settings, phone: e.target.value })}
                className="w-full p-2.5 border rounded-xl font-mono"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Registration No.</label>
              <input
                type="text"
                value={settings.registrationNo}
                onChange={e => setSettings({ ...settings, registrationNo: e.target.value })}
                className="w-full p-2.5 border rounded-xl font-mono"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Principal Name</label>
              <input
                type="text"
                value={settings.principalNameEn}
                onChange={e => setSettings({ ...settings, principalNameEn: e.target.value })}
                className="w-full p-2.5 border rounded-xl"
              />
            </div>
          </div>

          {/* Signature Toggles */}
          <div className="pt-2 border-t border-slate-100">
            <span className="block font-bold text-slate-700 mb-2">Progress Report Signature Blocks:</span>
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.showTeacherSignature}
                  onChange={e => setSettings({ ...settings, showTeacherSignature: e.target.checked })}
                  className="rounded text-emerald-700"
                />
                <span className="font-semibold text-slate-700">Class Teacher Signature</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.showPrincipalSignature}
                  onChange={e => setSettings({ ...settings, showPrincipalSignature: e.target.checked })}
                  className="rounded text-emerald-700"
                />
                <span className="font-semibold text-slate-700">Principal Signature</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.showParentSignature}
                  onChange={e => setSettings({ ...settings, showParentSignature: e.target.checked })}
                  className="rounded text-emerald-700"
                />
                <span className="font-semibold text-slate-700">Parent Signature</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end pt-3">
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition shadow-xs disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </form>
      </div>

      {/* Role-Based Sub-Administrator Delegation Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-800" />
            <div>
              <h3 className="text-base font-bold text-slate-900">Sub-Administrator Delegation & Permissions</h3>
              <p className="text-xs text-slate-500">
                Create subordinate staff accounts with granular View and Edit permissions across Students, Teachers, Exams, Marks, and Fees.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setEditingSubAdmin(null);
              setShowSubAdminModal(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Sub-Admin
          </button>
        </div>

        {subAdmins.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-xl">
            <p className="font-semibold text-slate-700">No Sub-Administrators Configured</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Only the primary Principal account currently has administrative access. Click "Add Sub-Admin" to delegate roles.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {subAdmins.map(admin => (
              <div
                key={admin.id}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-sm">{admin.name}</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setEditingSubAdmin(admin);
                          setShowSubAdminModal(true);
                        }}
                        className="p-1 text-slate-400 hover:text-emerald-800 rounded-lg transition cursor-pointer"
                        title="Edit Permissions"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteSubAdmin(admin)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded-lg transition cursor-pointer"
                        title="Delete Sub-Admin"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 font-mono mt-0.5">@{admin.username}</div>

                  {/* Active Permission Badges */}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {admin.permissions && Object.entries(admin.permissions).map(([mod, p]: [string, any]) => {
                      if (!p.view) return null;
                      return (
                        <span
                          key={mod}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                            p.edit
                              ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                              : 'bg-slate-200/70 text-slate-700'
                          }`}
                        >
                          {mod}: {p.edit ? 'Edit' : 'View'}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showSubAdminModal && (
        <SubAdminModal
          initialData={editingSubAdmin}
          onClose={() => {
            setShowSubAdminModal(false);
            setEditingSubAdmin(null);
          }}
          onSave={handleSaveSubAdmin}
        />
      )}
    </div>
  );
};
