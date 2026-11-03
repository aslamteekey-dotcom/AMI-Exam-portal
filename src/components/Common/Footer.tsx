import React from 'react';

interface FooterProps {
  className?: string;
}

export const Footer: React.FC<FooterProps> = ({ className = '' }) => {
  return (
    <footer
      className={`bg-white/70 backdrop-blur-md border-t border-white/60 print:hidden shrink-0 py-2 px-4 select-none ${className}`}
    >
      <div className="max-w-7xl mx-auto flex flex-col items-center text-center leading-tight gap-0.5">
        <p className="text-[11px] font-semibold tracking-wide text-emerald-950/80">
          KMEB Affiliated • Mi'yar A+ Accredited
        </p>
        <p className="text-[10px] font-medium text-emerald-900/70">
          © 2026-27 Al Madrasathul Islamiya Pallikkuth
        </p>
      </div>
    </footer>
  );
};
