import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';

export const SplashScreen: React.FC = () => {
  const { institutionSettings } = useAuth();
  const [isVisible, setIsVisible] = useState(true);
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    // Keep splash active for 2.5 seconds, then initiate 500ms smooth fade-out
    const fadeTimer = setTimeout(() => {
      setIsFading(true);
    }, 2500);

    const removeTimer = setTimeout(() => {
      setIsVisible(false);
    }, 3000);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, []);

  if (!isVisible) return null;

  const arabicTitle = institutionSettings?.madrasaArabicHeader || 'المدرسة الاسلامية بالكوت';
  const englishTitle = institutionSettings?.madrasaNameEn || institutionSettings?.institutionName || 'Islamic Madrasa';

  return (
    <div
      aria-label="Splash Screen"
      className={`fixed inset-0 z-[9999] bg-gradient-to-br from-[#0a6e3f] via-[#0d854d] to-[#075a33] flex flex-col justify-between items-center py-12 px-6 overflow-hidden select-none transition-opacity duration-500 ease-out ${
        isFading ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Background Islamic Geometric Pattern Overlay */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-[0.08] mix-blend-overlay">
        <svg
          className="w-full h-full"
          xmlns="http://www.w3.org/2000/svg"
          width="100%"
          height="100%"
        >
          <defs>
            <pattern
              id="islamic-splash-pattern"
              width="80"
              height="80"
              patternUnits="userSpaceOnUse"
            >
              {/* Central 8-pointed star rosette */}
              <path
                d="M40 10 L48 24 L64 24 L52 36 L58 52 L40 44 L22 52 L28 36 L16 24 L32 24 Z"
                fill="none"
                stroke="#ffffff"
                strokeWidth="1.5"
              />
              <circle cx="40" cy="40" r="28" fill="none" stroke="#ffffff" strokeWidth="1" />
              <circle cx="40" cy="40" r="14" fill="none" stroke="#ffffff" strokeWidth="0.8" />
              {/* Connecting lattice lines */}
              <line x1="0" y1="0" x2="80" y2="80" stroke="#ffffff" strokeWidth="0.8" strokeDasharray="3,3" />
              <line x1="80" y1="0" x2="0" y2="80" stroke="#ffffff" strokeWidth="0.8" strokeDasharray="3,3" />
              <line x1="40" y1="0" x2="40" y2="80" stroke="#ffffff" strokeWidth="0.8" />
              <line x1="0" y1="40" x2="80" y2="40" stroke="#ffffff" strokeWidth="0.8" />
              {/* Corner corner stars */}
              <circle cx="0" cy="0" r="12" fill="none" stroke="#ffffff" strokeWidth="1" />
              <circle cx="80" cy="0" r="12" fill="none" stroke="#ffffff" strokeWidth="1" />
              <circle cx="0" cy="80" r="12" fill="none" stroke="#ffffff" strokeWidth="1" />
              <circle cx="80" cy="80" r="12" fill="none" stroke="#ffffff" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#islamic-splash-pattern)" />
        </svg>
      </div>

      {/* Subtle radial ambient illumination */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(254,243,199,0.12)_0%,transparent_70%)] pointer-events-none" />

      {/* Top spacer / subtle header accent */}
      <div className="relative z-10 w-full flex justify-center pt-2">
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/15 text-[11px] text-emerald-100/90 tracking-widest uppercase font-semibold">
          <span>بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</span>
        </div>
      </div>

      {/* Centered Content: Arabic Calligraphy with Gold/Cream Glow */}
      <div className="relative z-10 flex flex-col items-center justify-center my-auto text-center px-4 max-w-lg">
        {/* Decorative crescent / star icon accent */}
        <div className="mb-4 flex items-center justify-center">
          <div className="w-12 h-0.5 bg-gradient-to-r from-transparent to-amber-200/60 rounded-full" />
          <div className="mx-3 text-[#fef08a] text-lg select-none">✦</div>
          <div className="w-12 h-0.5 bg-gradient-to-l from-transparent to-amber-200/60 rounded-full" />
        </div>

        {/* Primary Arabic Calligraphy Title with Gold/Cream Glow */}
        <h1
          dir="rtl"
          lang="ar"
          className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-[#fef9c3] tracking-wide leading-relaxed drop-shadow-[0_0_18px_rgba(254,240,138,0.55)] transition-transform duration-700 ease-out scale-100"
          style={{
            fontFamily: "'Amiri', 'Scheherazade New', 'Traditional Arabic', serif",
            textShadow: '0 0 25px rgba(254, 240, 138, 0.45), 0 2px 4px rgba(0, 0, 0, 0.35)',
          }}
        >
          {arabicTitle}
        </h1>

        {/* English Institution Subtitle */}
        <p className="mt-3 text-xs sm:text-sm font-semibold tracking-[0.22em] text-white/95 uppercase drop-shadow-sm font-sans">
          {englishTitle}
        </p>

        {/* Subtle decorative baseline */}
        <div className="mt-5 flex items-center justify-center gap-1.5 opacity-70">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-200" />
          <div className="w-6 h-0.5 bg-amber-200/70 rounded-full" />
          <div className="w-1.5 h-1.5 rounded-full bg-amber-200" />
        </div>
      </div>

      {/* Bottom Logo Section (SWAYAM App Style Layout) */}
      <div className="relative z-10 w-full flex flex-col items-center pb-2">
        <div className="flex flex-row items-center justify-center gap-3.5 sm:gap-4 px-5 py-2.5 rounded-2xl bg-black/15 backdrop-blur-md border border-white/20 shadow-lg">
          {/* Left Side: Scaled down IECI Logo */}
          <div className="flex items-center justify-center shrink-0">
            <img
              src="/ieci-logo.png"
              alt="IECI Logo"
              className="h-11 sm:h-12 w-auto object-contain filter drop-shadow-sm"
              onError={(e) => {
                // Fallback to assets folder if needed
                (e.currentTarget as HTMLImageElement).src = '/assets/aistudio/ieci-logo_51ac3bba.png';
              }}
            />
          </div>

          {/* Middle Divider: Subtle Vertical Line */}
          <div className="h-10 border-l border-white/40 shrink-0" />

          {/* Right Side: KMEB Affiliated Text (Swayam style alignment) */}
          <div className="text-left text-white/95 flex flex-col justify-center select-none">
            <div className="text-xs sm:text-sm font-bold tracking-wider uppercase text-white font-serif drop-shadow-sm leading-tight">
              KMEB Affiliated
            </div>
            <div className="text-[10px] sm:text-[11px] text-emerald-100/90 font-medium tracking-normal mt-0.5 leading-snug">
              Islamic Education Board
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
