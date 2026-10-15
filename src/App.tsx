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

      {/* Global Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 mt-12 print:hidden text-xs text-slate-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-1">
          <p className="font-semibold text-slate-800 text-xs sm:text-sm tracking-wide">
            KMEB Affiliated · Mi'yar Grading A+ Accredited Institution
          </p>
          <p className="text-[11px] sm:text-xs text-slate-500 font-medium">
            Academic Year 2026–2027 · Knowledge | Values | Innovation
          </p>
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
