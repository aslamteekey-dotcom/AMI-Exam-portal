import React from 'react';
import { ArrowLeft, Clock, HelpCircle, GraduationCap } from 'lucide-react';

export type PlaceholderType = 'time_table' | 'quiz' | 'lms';

interface PlaceholderViewProps {
  type: PlaceholderType;
  onBack: () => void;
  className?: string;
}

const PLACEHOLDER_CONFIG: Record<
  PlaceholderType,
  {
    title: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  time_table: {
    title: 'Time table',
    description: 'Class schedules and examination timetable will be published here.',
    icon: Clock,
  },
  quiz: {
    title: 'Quiz',
    description: 'Quiz modules and online assessments will be published here.',
    icon: HelpCircle,
  },
  lms: {
    title: 'LMS',
    description: 'Learning Management System content will be published here.',
    icon: GraduationCap,
  },
};

export const PlaceholderView: React.FC<PlaceholderViewProps> = ({ type, onBack, className = '' }) => {
  const config = PLACEHOLDER_CONFIG[type];
  const Icon = config.icon;

  return (
    <div className={`w-full py-8 sm:py-12 flex justify-center items-center ${className}`}>
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 max-w-md w-full mx-auto text-center shadow-sm space-y-4">
        {/* Icon in light green rounded box */}
        <div className="w-16 h-16 rounded-2xl bg-green-100 text-[#047857] flex items-center justify-center mx-auto p-4 shadow-xs">
          <Icon className="w-8 h-8" />
        </div>

        {/* Title & Description */}
        <div className="space-y-1.5">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 font-serif">
            {config.title}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto leading-relaxed">
            {config.description}
          </p>
        </div>

        {/* Action Button: Back to Dashboard */}
        <div className="pt-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#047857] hover:bg-emerald-800 text-white text-xs sm:text-sm font-bold rounded-xl transition shadow-xs cursor-pointer active:scale-95"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </button>
        </div>
      </div>
    </div>
  );
};
