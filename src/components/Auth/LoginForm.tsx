import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { GraduationCap, Lock, User, AlertCircle, ArrowRight } from 'lucide-react';

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

  const isMl = lang === 'ml';

  return (
    <div className="w-full max-w-sm sm:max-w-md mx-auto my-auto">
      <div className="bg-white/75 backdrop-blur-md rounded-2xl sm:rounded-3xl shadow-xl sm:shadow-2xl border border-white/60 overflow-hidden">
        {/* Madrasa Top Banner */}
        <div className="bg-gradient-to-r from-emerald-950 via-emerald-900 to-[#047857] text-white px-4 py-3.5 sm:px-6 sm:py-5 text-center relative border-b border-white/20">
          <div className="font-serif text-emerald-300 text-xs sm:text-sm mb-1 sm:mb-1.5" dir="rtl">
            بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
          </div>
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/10 backdrop-blur-xs rounded-xl sm:rounded-2xl mx-auto flex items-center justify-center mb-1.5 sm:mb-2 shadow-inner border border-white/15">
            <GraduationCap className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-200" />
          </div>
          <h1 className={`text-base sm:text-xl font-bold uppercase tracking-tight ${isMl ? 'font-ml' : 'font-title'}`}>
            {isMl ? 'അൽ മദ്റസത്തുൽ ഇസ്ലാമിയ്യ പള്ളിക്കുത്ത്' : 'Al-Madrasathul Islamiya Pallikkuth'}
          </h1>
          <p className="text-[10px] sm:text-xs font-semibold text-emerald-300 mt-0.5 tracking-wide">
            Islamic Education &amp; Digital Learning
          </p>
        </div>

        {/* Login Form */}
        <div className="p-4 sm:p-6 bg-white/40">
          {error && (
            <div className="mb-3 p-2.5 rounded-xl bg-rose-50/90 border border-rose-200 text-rose-800 text-xs flex items-center gap-2 shadow-2xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
            <div>
              <label className="block text-[11px] sm:text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
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
                  placeholder="e.g. admin, teacher, parent"
                  className="w-full pl-9 pr-3 py-2 sm:py-2.5 text-sm border border-emerald-900/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#047857] focus:border-transparent bg-white/80 backdrop-blur-xs text-slate-800 placeholder:text-slate-400 shadow-2xs focus:bg-white transition"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] sm:text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
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
                  className="w-full pl-9 pr-3 py-2 sm:py-2.5 text-sm border border-emerald-900/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#047857] focus:border-transparent bg-white/80 backdrop-blur-xs text-slate-800 placeholder:text-slate-400 shadow-2xs focus:bg-white transition"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 sm:mt-3 py-2.5 sm:py-3 px-4 bg-[#047857] hover:bg-[#065f46] text-white font-semibold rounded-xl shadow-md hover:shadow-lg transition flex items-center justify-center gap-2 disabled:opacity-50 text-sm cursor-pointer"
            >
              {isSubmitting ? 'Authenticating...' : 'Sign In to Portal'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
