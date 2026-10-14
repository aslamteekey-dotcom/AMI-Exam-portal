import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { LoginForm } from './components/Auth/LoginForm';
import { AdminDashboard } from './components/Admin/AdminDashboard';
import { TeacherDashboard } from './components/Teacher/TeacherDashboard';
import { ParentDashboard } from './components/Parent/ParentDashboard';
import { GraduationCap } from 'lucide-react';
import { ErrorBoundary } from './components/Common/ErrorBoundary';

const AppContent: React.FC = () => {
  const { user, isLoading, lang, t } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center bg-slate-50 text-slate-600">
        <div className="w-12 h-12 rounded-2xl bg-emerald-800 flex items-center justify-center text-white mb-4 animate-pulse">
          <GraduationCap className="w-7 h-7" />
        </div>
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-800 mb-2"></div>
        <p className="text-xs font-semibold tracking-wide uppercase text-slate-400">
          Loading Madrasa Portal...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800 font-sans selection:bg-emerald-100 selection:text-emerald-900">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {!user ? (
          <LoginForm />
        ) : user.role === 'admin' ? (
          <AdminDashboard />
        ) : user.role === 'teacher' ? (
          <TeacherDashboard />
        ) : user.role === 'parent' ? (
          <ParentDashboard />
        ) : (
          <LoginForm />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 mt-12 print:hidden text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-emerald-800 text-white flex items-center justify-center">
              <GraduationCap className="w-3.5 h-3.5" />
            </div>
            <span className="font-bold text-slate-800 font-serif">
              {lang === 'ml' ? 'അൽ മദ്റസത്തുൽ ഇസ്ലാമിയ്യ പള്ളിക്കുത്ത്' : 'Al-Madrasathul Islamiya Pallikkuth'}
            </span>
          </div>

          <div className="text-[11px] text-slate-400">
            {lang === 'ml'
              ? 'അധ്യയന വർഷം: 2026–2027 • പരീക്ഷാ മൂല്യനിർണ്ണയ സംവിധാനം'
              : 'Academic session 2026-2027 . Examination system'}
          </div>
        </div>
      </footer>
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}
