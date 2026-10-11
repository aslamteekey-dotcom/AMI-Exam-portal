import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { GraduationCap, Lock, User, AlertCircle, ArrowRight, Shield } from 'lucide-react';

export const LoginForm: React.FC = () => {
  const { login, lang } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) {
      setError('Please provide both username and password.');
      return;
    }

    setIsSubmitting(true);
    const result = await login(username.trim(), password);
    setIsSubmitting(false);

    if (!result.success) {
      setError(result.error || 'Authentication failed. Please check your credentials.');
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 bg-gradient-to-b from-emerald-50/50 via-slate-50 to-emerald-100/30">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-emerald-900/10 overflow-hidden">
        {/* Madrasa Top Banner */}
        <div className="bg-emerald-900 text-white p-6 text-center relative">
          <div className="font-serif text-emerald-200 text-base mb-1" dir="rtl">
            بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
          </div>
          <div className="w-14 h-14 bg-white/10 rounded-2xl mx-auto flex items-center justify-center mb-3 shadow-inner">
            <GraduationCap className="w-8 h-8 text-emerald-200" />
          </div>
          <h2 className="text-xl font-bold font-serif uppercase tracking-tight">
            {lang === 'ml' ? 'അൽ മദ്റസത്തുൽ ഇസ്ലാമിയ്യ പള്ളിക്കുത്ത്' : 'Al-Madrasathul Islamiya Pallikkuth'}
          </h2>
          <p className="text-xs text-emerald-200 mt-1">
            {lang === 'ml' ? 'പരീക്ഷാ & പുരോഗതി രേഖാ പോർട്ടൽ' : 'Examination & Progress Report Portal'}
          </p>
        </div>

        {/* Login Form */}
        <div className="p-6 md:p-8">
          {error && (
            <div className="mb-5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Username / Login ID
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent bg-slate-50/50"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent bg-slate-50/50"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-3 py-3 px-4 bg-emerald-800 hover:bg-emerald-900 text-white font-semibold rounded-xl shadow-md transition flex items-center justify-center gap-2 disabled:opacity-50 text-sm cursor-pointer"
            >
              {isSubmitting ? 'Authenticating...' : 'Sign In to Portal'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Secure Access Guidance Notice */}
          <div className="mt-6 pt-4 border-t border-slate-100 flex items-start gap-2 text-slate-400 text-[11px] leading-relaxed">
            <Shield className="w-4 h-4 text-emerald-800 shrink-0 mt-0.5" />
            <span>
              Authorized institutional access only. Principal, Usthad teachers, and parents should use their designated credentials to sign in.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
