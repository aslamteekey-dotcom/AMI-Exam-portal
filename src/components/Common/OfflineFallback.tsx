import React, { useState } from 'react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { WifiOff, RefreshCw, AlertCircle, Database } from 'lucide-react';

export const OfflineFallback: React.FC = () => {
  const isOnline = useOnlineStatus();
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = () => {
    setIsRetrying(true);
    setTimeout(() => {
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
      setIsRetrying(false);
    }, 800);
  };

  if (isOnline) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 z-50 max-w-md animate-fade-in print:hidden">
      <div className="bg-slate-900/95 text-white p-4 rounded-2xl shadow-2xl border border-slate-700/80 backdrop-blur-md flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/30">
            <WifiOff className="w-5 h-5 animate-pulse" />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
              <span>No Internet Connection</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30">
                Offline Mode
              </span>
            </h4>
            <p className="text-[11px] text-slate-300 mt-0.5 truncate">
              Viewing cached data (read-only). Reconnect to sync changes.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleRetry}
          disabled={isRetrying}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 text-white text-xs font-bold rounded-xl transition shadow-xs shrink-0 cursor-pointer disabled:opacity-60"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
          <span>{isRetrying ? 'Checking...' : 'Retry'}</span>
        </button>
      </div>
    </div>
  );
};

export const FullscreenOfflinePage: React.FC<{ onRetry?: () => void }> = ({ onRetry }) => {
  const [retrying, setRetrying] = useState(false);

  const handleReload = () => {
    setRetrying(true);
    if (onRetry) {
      onRetry();
    } else if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
      <div className="w-16 h-16 rounded-3xl bg-amber-100 text-amber-800 flex items-center justify-center mb-4 shadow-sm border border-amber-200">
        <WifiOff className="w-8 h-8" />
      </div>
      <h2 className="text-xl font-bold text-slate-900">No Internet Connection</h2>
      <p className="text-xs text-slate-500 max-w-sm mt-2">
        You appear to be offline. The application has cached essential screens for offline viewing. Please check your network connection.
      </p>

      <div className="mt-6 flex flex-col sm:flex-row items-center gap-3">
        <button
          onClick={handleReload}
          disabled={retrying}
          className="flex items-center gap-2 px-5 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold rounded-xl shadow-sm transition"
        >
          <RefreshCw className={`w-4 h-4 ${retrying ? 'animate-spin' : ''}`} />
          <span>{retrying ? 'Reconnecting...' : 'Try Reconnecting'}</span>
        </button>
      </div>

      <div className="mt-8 p-4 bg-white rounded-xl border border-slate-200 max-w-xs text-left shadow-2xs">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
          <Database className="w-4 h-4 text-emerald-800" />
          <span>Offline Safety Rule</span>
        </div>
        <p className="text-[11px] text-slate-500 mt-1">
          Mark entry and fee modifications require an active connection for strict cloud integrity.
        </p>
      </div>
    </div>
  );
};
