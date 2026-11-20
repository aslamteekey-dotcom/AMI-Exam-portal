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
  glowClass: string;
  squareGlowStyle?: React.CSSProperties;
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
      glowClass: 'drop-shadow-[0_0_15px_rgba(255,215,0,0.8)]',
      squareGlowStyle: {
        borderColor: '#FFD700',
        boxShadow: '0 0 15px rgba(255, 215, 0, 0.55), inset 0 0 10px rgba(255, 215, 0, 0.2)',
      },
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
      glowClass: 'drop-shadow-[0_0_8px_rgba(245,158,11,0.45)]',
      squareGlowStyle: {
        borderColor: '#F59E0B',
        boxShadow: 'inset 0 0 8px rgba(245, 158, 11, 0.18)',
      },
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
      glowClass: 'drop-shadow-[0_0_6px_rgba(156,163,175,0.4)]',
      squareGlowStyle: {
        borderColor: '#9CA3AF',
        boxShadow: 'inset 0 0 8px rgba(156, 163, 175, 0.18)',
      },
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
      glowClass: 'drop-shadow-[0_0_6px_rgba(205,127,50,0.4)]',
      squareGlowStyle: {
        borderColor: '#CD7F32',
        boxShadow: 'inset 0 0 8px rgba(205, 127, 50, 0.18)',
      },
    };
  }
  return null;
}

export const AttendanceBadgeCard: React.FC<AttendanceBadgeCardProps> = ({ percentage }) => {
  const uid = useId().replace(/:/g, '');
  const numericPct = Number.parseFloat(String(percentage));
  const safePct = Number.isFinite(numericPct) ? numericPct : 0;
  const tier = getAttendanceTier(safePct);

  const displayPctText =
    typeof percentage === 'string' && percentage.trim() !== ''
      ? `${percentage.trim()}%`
      : `${safePct}%`;

  // Below 90%: Hide the badge completely and show simple text "Keep improving!"
  if (!tier) {
    return (
      <div className="mt-3 bg-emerald-900 text-white p-4 rounded-xl shadow-xs flex flex-row justify-between items-center gap-3">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold text-emerald-200 uppercase tracking-wider">
            Attendance Badge
          </span>
          <span className="text-2xl font-black text-emerald-300 font-mono leading-tight mt-0.5">
            {displayPctText}
          </span>
          <span className="text-xs font-semibold text-emerald-100 mt-0.5">
            Keep improving!
          </span>
        </div>
      </div>
    );
  }

  const gradId = `tierGrad_${uid}`;
  const leafGradId = `leafGrad_${uid}`;

  // Symmetrical leaf positions along left & right circular arcs around central cup
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
    <div className="mt-3 bg-emerald-900 text-white p-4 rounded-xl shadow-xs flex flex-row justify-between items-center gap-3">
      {/* Left Side: Percentage & Tier Text stacked vertically */}
      <div className="flex flex-col min-w-0">
        <span className="text-[10px] font-bold text-emerald-200 uppercase tracking-wider">
          Attendance Badge
        </span>
        <span
          className="text-2xl sm:text-3xl font-black font-mono leading-tight mt-0.5"
          style={{ color: tier.highlightColor }}
        >
          {displayPctText}
        </span>
        <span
          className="text-xs font-bold mt-0.5 truncate"
          style={{ color: tier.primaryColor }}
        >
          {tier.title}
        </span>
      </div>

      {/* Right Side: Compact SVG Cup + Laurel Wreath Badge enclosed in Square Outline */}
      <div
        className={`w-16 h-16 shrink-0 border-2 rounded-md p-2 aspect-square flex items-center justify-center bg-emerald-950/60 ${tier.glowClass}`}
        style={tier.squareGlowStyle}
        aria-label={tier.title}
      >
        <svg
          viewBox="20 28 160 130"
          className="w-12 h-12 sm:w-14 sm:h-14 overflow-visible"
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
            strokeWidth="2.8"
            strokeLinecap="round"
          />
          {/* Right Laurel Wreath Stem */}
          <path
            d="M 112 148 C 148 142, 168 115, 166 86 C 164 64, 152 48, 134 38"
            fill="none"
            stroke={tier.primaryColor}
            strokeWidth="2.8"
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
                strokeWidth="0.8"
              />
              <path
                d="M 1 2 C 7 -2, 11 -8, 11 -14 C 6 -12, 2 -6, 1 2 Z"
                fill={`url(#${leafGradId})`}
                opacity="0.9"
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
                strokeWidth="0.8"
              />
              <path
                d="M -1 2 C -7 -2, -11 -8, -11 -14 C -6 -12, -2 -6, -1 2 Z"
                fill={`url(#${leafGradId})`}
                opacity="0.9"
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
              strokeWidth="4.5"
              strokeLinecap="round"
            />
            {/* Right Handle */}
            <path
              d="M 125 52 C 138 52, 140 72, 125 77"
              fill="none"
              stroke={`url(#${gradId})`}
              strokeWidth="4.5"
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
              strokeWidth="2.4"
              strokeLinecap="round"
              opacity="0.45"
            />
            {/* Center Star Emblem on Cup */}
            <polygon
              points="100,60 103,67 110,67.5 104.5,72 106.5,79 100,75 93.5,79 95.5,72 90,67.5 97,67"
              fill="#FFFFFF"
              opacity="0.88"
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
      </div>
    </div>
  );
};
