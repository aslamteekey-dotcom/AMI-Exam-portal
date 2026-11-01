import React, { useState } from 'react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { Download, Smartphone, X } from 'lucide-react';

interface Props {
  className?: string;
  variant?: 'pill' | 'button' | 'banner';
}

export const PWAInstallButton: React.FC<Props> = ({ className = '', variant = 'pill' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // Suppress if already running in standalone mode (already installed as PWA)
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    if (variant === 'banner') {
      return (
        <div className={`p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-2xs ${className}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-800 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900">Install AMI Pallikkuth App</h4>
              <p className="text-xs text-slate-500">Fast access from your home screen with offline caching support.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={install}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Install App</span>
          </button>
        </div>
      );
    }

    return (
      <button
        type="button"
        onClick={install}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition shadow-2xs cursor-pointer ${className}`}
        title="Install AMI Pallikkuth app on your device"
      >
        <Download className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Install App</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-emerald-900 bg-emerald-50 border border-emerald-300 hover:bg-emerald-100 rounded-xl transition shadow-2xs cursor-pointer ${className}`}
          title="Install on iPhone / iPad"
        >
          <Smartphone className="w-3.5 h-3.5 text-emerald-700" />
          <span className="hidden sm:inline">Install on iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in">
            <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-800 text-white flex items-center justify-center">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">Install on iPhone / iPad</h3>
                </div>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-4 space-y-3 text-xs text-slate-600">
                <div className="flex items-start gap-2.5 p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-[11px] shrink-0">1</span>
                  <span>Tap the <strong>Share</strong> icon (box with an arrow pointing up) in the Safari toolbar.</span>
                </div>
                <div className="flex items-start gap-2.5 p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-[11px] shrink-0">2</span>
                  <span>Scroll down and select <strong>Add to Home Screen</strong>.</span>
                </div>
                <div className="flex items-start gap-2.5 p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-[11px] shrink-0">3</span>
                  <span>Tap <strong>Add</strong> in the top right to launch directly from your home screen.</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full py-2 bg-emerald-800 text-white font-bold rounded-xl text-xs hover:bg-emerald-900 transition"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
