import React, { useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { LoginForm } from './components/Auth/LoginForm';
import { AdminDashboard } from './components/Admin/AdminDashboard';
import { TeacherDashboard } from './components/Teacher/TeacherDashboard';
import { ParentDashboard } from './components/Parent/ParentDashboard';
import { GraduationCap } from 'lucide-react';
import { ErrorBoundary } from './components/Common/ErrorBoundary';
import { OfflineFallback } from './components/Common/OfflineFallback';
import { SplashScreen } from './components/Common/SplashScreen';
import { Footer } from './components/Common/Footer';

const AppContent: React.FC = () => {
  const { user, isLoading, lang, t, institutionSettings } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center bg-transparent text-slate-600">
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
    <div className={`min-h-screen flex flex-col bg-transparent text-slate-800 font-sans selection:bg-emerald-100 selection:text-emerald-900 ${!user ? 'h-[100dvh] overflow-hidden justify-between' : ''}`}>
      <Navbar />

      <main className={`flex-1 max-w-7xl w-full mx-auto px-2 sm:px-6 lg:px-8 flex flex-col ${!user ? 'py-2 sm:py-4 items-center justify-center' : 'py-2 sm:py-3'}`}>
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

      {/* Progressive Web App Offline Connectivity Fallback */}
      <OfflineFallback />

      {/* Embedded Mobile & PWA Splash Screen */}
      <SplashScreen />

      {/* Global Glassmorphic Footer (for non-parent roles; Parent Portal has its own integrated footer) */}
      {user?.role !== 'parent' && (
        <Footer className={!user ? 'py-2 mt-0' : 'py-2 mt-auto'} />
      )}
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
