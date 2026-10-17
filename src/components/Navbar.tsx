import React from 'react';
import { useAuth } from '../context/AuthContext';
import { GraduationCap, LogOut, User as UserIcon } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, lang, setLang, t, logout } = useAuth();

  const getRoleBadge = (role?: string) => {
    switch (role) {
      case 'admin':
        return <span className="bg-purple-100 text-purple-800 text-[11px] font-bold px-2 py-0.5 rounded-full">{t.adminRole}</span>;
      case 'teacher':
        return <span className="bg-blue-100 text-blue-800 text-[11px] font-bold px-2 py-0.5 rounded-full">{t.teacherRole}</span>;
      case 'parent':
        return <span className="bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2 py-0.5 rounded-full">{t.parentRole}</span>;
      default:
        return null;
    }
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo & Name */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-800 flex items-center justify-center text-white shadow-sm shrink-0">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`font-bold text-slate-900 text-sm sm:text-base leading-tight tracking-tight ${lang === 'ml' ? 'font-ml' : 'font-title'}`}>
                  {lang === 'ml' ? 'അൽ മദ്റസത്തുൽ ഇസ്ലാമിയ്യ പള്ളിക്കുത്ത്' : 'Al-Madrasathul Islamiya Pallikkuth'}
                </span>
                <span className="hidden sm:inline-block text-[10px] bg-emerald-100 text-emerald-900 font-semibold px-1.5 py-0.5 rounded">
                  2026–2027
                </span>
              </div>
              <div className="text-[11px] text-slate-500 font-medium leading-none mt-0.5">
                Islamic Education &amp; Digital Learning
              </div>
            </div>
          </div>

          {/* Controls: Language, Switch Role Demo, User Info, Logout */}
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Language Switcher */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button
                onClick={() => setLang('en')}
                className={`px-2 py-1 text-xs font-semibold rounded-md transition ${
                  lang === 'en' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                EN
              </button>
              <button
                onClick={() => setLang('ml')}
                className={`px-2 py-1 text-xs font-semibold rounded-md transition ${
                  lang === 'ml' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ML
              </button>
            </div>

            {/* Current User Pill */}
            {user && (
              <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-slate-200">
                <div className="text-right">
                  <div className="text-xs font-bold text-slate-800 leading-tight">
                    {lang === 'ml' && user.nameMl ? user.nameMl : user.name}
                  </div>
                  <div>{getRoleBadge(user.role)}</div>
                </div>
              </div>
            )}

            {/* Logout Button */}
            {user && (
              <button
                onClick={logout}
                className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                title={t.navLogout}
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
