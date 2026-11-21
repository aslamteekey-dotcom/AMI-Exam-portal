import React from 'react';

interface FooterProps {
  className?: string;
  variant?: 'default' | 'green';
}

export const Footer: React.FC<FooterProps> = ({
  className = '',
  variant = 'default',
}) => {
  const isGreen = variant === 'green';

  return (
    <footer
      className={`${
        isGreen
          ? 'bg-emerald-600 border border-emerald-500/60 shadow-sm text-white py-2.5 px-4'
          : 'bg-white/70 backdrop-blur-md border-t border-white/60 py-2 px-4'
      } print:hidden shrink-0 select-none ${className}`}
    >
      <div className="max-w-7xl mx-auto flex flex-col items-center text-center leading-tight gap-1">
        <p
          className={`text-xs font-semibold tracking-wide ${
            isGreen ? 'text-white' : 'text-emerald-950/80'
          }`}
        >
          KMEB Affiliated • Mi'yar A+ Accredited
        </p>
        <p
          className={`text-[11px] font-medium ${
            isGreen ? 'text-white' : 'text-emerald-900/70'
          }`}
        >
          © 2026-27 Al Madrasathul Islamiya Pallikkuth
        </p>
      </div>
    </footer>
  );
};
