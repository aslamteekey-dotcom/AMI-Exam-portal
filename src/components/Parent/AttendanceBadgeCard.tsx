import React, { useId } from 'react';

interface AttendanceBadgeCardProps {
  percentage: string | number;
}

interface TierConfig {
  id: 'perfect' | 'outstanding' | 'excellent' | 'good';
  title: string;
  primaryColor: string;
  secondaryColor: string;
  highlightColor: string;
  borderColor: string;
  bgGradient: string;
  glowClass: string;
  pillBg: string;
  pillText: string;
}

function getAttendanceTier(pct: number): TierConfig | null {
  if (pct >= 100) {
    return {
      id: 'perfect',
      title: 'Perfect Attendance',
      primaryColor: '#FFD700',
      secondaryColor: '#F59E0B',
      highlightColor: '#FEF08A',
      borderColor: '#FFD700',
      bgGradient: 'from-emerald-950 via-emerald-900 to-amber-950/90',
      glowClass: 'drop-shadow-[0_0_15px_rgba(255,215,0,0.8)]',
      pillBg: 'rgba(255, 215, 0, 0.16)',
      pillText: '#FEF08A',
    };
  }
  if (pct >= 97) {
    return {
      id: 'outstanding',
      title: 'Outstanding Attendance',
      primaryColor: '#F59E0B',
      secondaryColor: '#D97706',
      highlightColor: '#FDE68A',
      borderColor: '#F59E0B',
      bgGradient: 'from-emerald-950 via-emerald-900 to-slate-900',
      glowClass: 'drop-shadow-[0_0_10px_rgba(245,158,11,0.45)]',
      pillBg: 'rgba(245, 158, 11, 0.16)',
      pillText: '#FDE68A',
    };
  }
  if (pct >= 94) {
    return {
      id: 'excellent',
      title: 'Excellent Attendance',
      primaryColor: '#9CA3AF',
      secondaryColor: '#6B7280',
      highlightColor: '#F3F4F6',
      borderColor: '#9CA3AF',
      bgGradient: 'from-slate-900 via-slate-800 to-emerald-950',
      glowClass: 'drop-shadow-[0_0_8px_rgba(156,163,175,0.4)]',
      pillBg: 'rgba(156, 163, 175, 0.16)',
      pillText: '#E5E7EB',
    };
  }
  if (pct >= 90) {
    return {
      id: 'good',
      title: 'Good Attendance',
      primaryColor: '#CD7F32',
      secondaryColor: '#B45309',
      highlightColor: '#FDBA74',
      borderColor: '#CD7F32',
      bgGradient: 'from-stone-900 via-emerald-950 to-amber-950/90',
      glowClass: 'drop-shadow-[0_0_8px_rgba(205,127,50,0.4)]',
      pillBg: 'rgba(205, 127, 50, 0.18)',
      pillText: '#FED7AA',
    };
  }
  return null;
}

export const AttendanceBadgeCard: React.FC<AttendanceBadgeCardProps> = ({ percentage }) => {
  const uid = useId().replace(/:/g, '');
  const numericPct = Number.parseFloat(String(percentage));
  const safePct = Number.isFinite(numericPct) ? numericPct : 0;
  const tier = getAttendanceTier(safePct);

  // Below 90%: Hide the badge completely and show simple text "Keep improving!"
  if (!tier) {
    return (
      <div className="mt-4 pt-3 border-t border-slate-100 text-center">
        <p className="text-xs sm:text-sm font-semibold text-slate-500">
          Keep improving!
        </p>
      </div>
    );
  }

  const gradId = `tierGrad_${uid}`;
  const leafGradId = `leafGrad_${uid}`;
  const displayPctText =
    typeof percentage === 'string' && percentage.trim() !== ''
      ? `${percentage.trim()}%`
      : `${safePct}%`;

  // Symmetrical leaf positions along left & right circular arcs (center 100,100)
  const leftLeaves = [
    { cx: 52, cy: 138, rot: -135, scale: 0.9 },
    { cx: 40, cy: 120, rot: -112, scale: 0.95 },
    { cx: 34, cy: 100, rot: -90, scale: 1.0 },
    { cx: 37, cy: 80, rot: -68, scale: 0.95 },
    { cx: 46, cy: 61, rot: -45, scale: 0.9 },
    { cx: 61, cy: 46, rot: -22, scale: 0.85 },
  ];

  const rightLeaves = leftLeaves.map(leaf => ({
    cx: 200 - leaf.cx,
    cy: leaf.cy,
    rot: -leaf.rot,
    scale: leaf.scale,
  }));

  return (
    <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col items-center justify-center">
      <div
        className={`relative w-full rounded-2xl bg-gradient-to-br ${tier.bgGradient} px-4 py-5 sm:py-6 flex flex-col items-center justify-center text-center border`}
        style={{ borderColor: `${tier.borderColor}66` }}
      >
        <span
          className="text-[10px] font-bold uppercase tracking-[0.2em] mb-3"
          style={{ color: tier.highlightColor }}
        >
          Attendance Badge
        </span>

        {/* Prominent Circular Badge Container */}
        <div
          className={`relative w-40 h-40 sm:w-44 sm:h-44 rounded-full border-[3px] flex flex-col items-center justify-center bg-slate-950/50 backdrop-blur-xs ${tier.glowClass}`}
          style={{
            borderColor: tier.borderColor,
            boxShadow:
              tier.id === 'perfect'
                ? 'inset 0 0 24px rgba(255, 215, 0, 0.25)'
                : `inset 0 0 18px ${tier.primaryColor}28`,
          }}
        >
          {/* Inner subtle ring */}
          <div
            className="absolute inset-1.5 rounded-full border pointer-events-none"
            style={{ borderColor: `${tier.primaryColor}4D` }}
          />

          {/* Inline SVG: Laurel Wreath + Central Trophy/Cup */}
          <svg
            viewBox="0 0 200 175"
            className="w-32 h-28 sm:w-36 sm:h-32 overflow-visible"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={tier.highlightColor} />
                <stop offset="50%" stopColor={tier.primaryColor} />
                <stop offset="100%" stopColor={tier.secondaryColor} />
              </linearGradient>
              <linearGradient id={leafGradId} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={tier.highlightColor} />
                <stop offset="100%" stopColor={tier.primaryColor} />
              </linearGradient>
            </defs>

            {/* Left Laurel Wreath Stem */}
            <path
              d="M 88 148 C 52 142, 32 115, 34 86 C 36 64, 48 48, 66 38"
              fill="none"
              stroke={tier.primaryColor}
              strokeWidth="2.4"
              strokeLinecap="round"
            />
            {/* Right Laurel Wreath Stem */}
            <path
              d="M 112 148 C 148 142, 168 115, 166 86 C 164 64, 152 48, 134 38"
              fill="none"
              stroke={tier.primaryColor}
              strokeWidth="2.4"
              strokeLinecap="round"
            />

            {/* Left & Right Laurel Leaves */}
            {leftLeaves.map((l, idx) => (
              <g
                key={`ll-${idx}`}
                transform={`translate(${l.cx}, ${l.cy}) rotate(${l.rot}) scale(${l.scale})`}
              >
                <path
                  d="M 0 0 C -5 -6, -4 -14, 0 -18 C 4 -14, 5 -6, 0 0 Z"
                  fill={`url(#${leafGradId})`}
                  stroke={tier.secondaryColor}
                  strokeWidth="0.7"
                />
                <path
                  d="M 1 2 C 7 -2, 11 -8, 11 -14 C 6 -12, 2 -6, 1 2 Z"
                  fill={`url(#${leafGradId})`}
                  opacity="0.88"
                />
              </g>
            ))}

            {rightLeaves.map((r, idx) => (
              <g
                key={`rl-${idx}`}
                transform={`translate(${r.cx}, ${r.cy}) rotate(${r.rot}) scale(${r.scale})`}
              >
                <path
                  d="M 0 0 C -5 -6, -4 -14, 0 -18 C 4 -14, 5 -6, 0 0 Z"
                  fill={`url(#${leafGradId})`}
                  stroke={tier.secondaryColor}
                  strokeWidth="0.7"
                />
                <path
                  d="M -1 2 C -7 -2, -11 -8, -11 -14 C -6 -12, -2 -6, -1 2 Z"
                  fill={`url(#${leafGradId})`}
                  opacity="0.88"
                />
              </g>
            ))}

            {/* Central Trophy / Cup */}
            <g transform="translate(0, 4)">
              {/* Left Handle */}
              <path
                d="M 75 52 C 62 52, 60 72, 75 77"
                fill="none"
                stroke={`url(#${gradId})`}
                strokeWidth="4.2"
                strokeLinecap="round"
              />
              {/* Right Handle */}
              <path
                d="M 125 52 C 138 52, 140 72, 125 77"
                fill="none"
                stroke={`url(#${gradId})`}
                strokeWidth="4.2"
                strokeLinecap="round"
              />
              {/* Cup Rim */}
              <rect
                x="72"
                y="43"
                width="56"
                height="6"
                rx="3"
                fill={tier.highlightColor}
                stroke={tier.secondaryColor}
                strokeWidth="1.2"
              />
              {/* Cup Bowl */}
              <path
                d="M 75 49 L 125 49 C 125 78, 114 96, 100 100 C 86 96, 75 78, 75 49 Z"
                fill={`url(#${gradId})`}
                stroke={tier.secondaryColor}
                strokeWidth="1.5"
              />
              {/* Cup Gloss Highlight */}
              <path
                d="M 82 54 C 82 70, 86 83, 93 90"
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="2.2"
                strokeLinecap="round"
                opacity="0.45"
              />
              {/* Center Star Emblem on Cup */}
              <polygon
                points="100,60 103,67 110,67.5 104.5,72 106.5,79 100,75 93.5,79 95.5,72 90,67.5 97,67"
                fill="#FFFFFF"
                opacity="0.85"
              />
              {/* Trophy Stem */}
              <rect
                x="95"
                y="99"
                width="10"
                height="16"
                rx="2"
                fill={`url(#${gradId})`}
                stroke={tier.secondaryColor}
                strokeWidth="1.2"
              />
              {/* Trophy Pedestal */}
              <path
                d="M 82 115 L 118 115 L 122 124 L 78 124 Z"
                fill={`url(#${gradId})`}
                stroke={tier.secondaryColor}
                strokeWidth="1.3"
              />
              <rect
                x="74"
                y="124"
                width="52"
                height="6"
                rx="2.5"
                fill={tier.secondaryColor}
              />
            </g>
          </svg>

          {/* Exact Percentage inside the circular badge directly below the trophy */}
          <div className="-mt-3 flex flex-col items-center">
            <span
              className="text-xl sm:text-2xl font-black font-mono tracking-tight leading-none"
              style={{ color: tier.highlightColor }}
            >
              {displayPctText}
            </span>
          </div>
        </div>

        {/* Tier Title Banner neatly placed immediately below the circular badge */}
        <div
          className="mt-3.5 px-4 py-1.5 rounded-full border text-xs sm:text-sm font-bold tracking-wide"
          style={{
            backgroundColor: tier.pillBg,
            borderColor: `${tier.borderColor}80`,
            color: tier.highlightColor,
          }}
        >
          {tier.title}
        </div>
      </div>
    </div>
  );
};
