import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  calculateMonthlyAttendanceStats,
  MonthlyAttendanceStats,
} from '../../services/attendanceStatsService';
import { ClassItem, ALL_STANDARD_CLASSES } from '../../types';
import {
  CalendarDays,
  Users,
  CheckCircle2,
  Printer,
  RefreshCw,
  AlertCircle,
  FileSpreadsheet,
  TrendingUp,
  Percent,
} from 'lucide-react';

interface MonthlyAttendanceReportProps {
  initialClassId?: string;
  classes?: ClassItem[];
  allowClassSelection?: boolean;
}

const MONTH_OPTIONS = [
  { value: 1, labelEn: 'January', labelMl: 'ജനുവരി' },
  { value: 2, labelEn: 'February', labelMl: 'ഫെബ്രുവരി' },
  { value: 3, labelEn: 'March', labelMl: 'മാർച്ച്' },
  { value: 4, labelEn: 'April', labelMl: 'ഏപ്രിൽ' },
  { value: 5, labelEn: 'May', labelMl: 'മേയ്' },
  { value: 6, labelEn: 'June', labelMl: 'ജൂൺ' },
  { value: 7, labelEn: 'July', labelMl: 'ജൂലൈ' },
  { value: 8, labelEn: 'August', labelMl: 'ഓഗസ്റ്റ്' },
  { value: 9, labelEn: 'September', labelMl: 'സെപ്റ്റംബർ' },
  { value: 10, labelEn: 'October', labelMl: 'ഒക്ടോബർ' },
  { value: 11, labelEn: 'November', labelMl: 'നവംബർ' },
  { value: 12, labelEn: 'December', labelMl: 'ഡിസംബർ' },
];

const YEAR_OPTIONS = [2025, 2026, 2027, 2028];

export const MonthlyAttendanceReport: React.FC<MonthlyAttendanceReportProps> = ({
  initialClassId = 'cls_1',
  classes = [],
  allowClassSelection = true,
}) => {
  const { lang } = useAuth();
  const isMl = lang === 'ml';

  const now = new Date();
  const [selectedClassId, setSelectedClassId] = useState<string>(initialClassId);
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);

  const [stats, setStats] = useState<MonthlyAttendanceStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Sync if initialClassId changes
  useEffect(() => {
    if (initialClassId && initialClassId !== selectedClassId) {
      setSelectedClassId(initialClassId);
    }
  }, [initialClassId]);

  const loadStats = useCallback(async () => {
    if (!selectedClassId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await calculateMonthlyAttendanceStats(
        selectedClassId,
        selectedYear,
        selectedMonth
      );
      setStats(data);
    } catch (err: any) {
      console.error('Error calculating monthly attendance stats:', err);
      setError(err?.message || 'Failed to calculate monthly statistics.');
    } finally {
      setLoading(false);
    }
  }, [selectedClassId, selectedYear, selectedMonth]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const availableClasses = classes && classes.length > 0 ? classes : ALL_STANDARD_CLASSES;

  const currentClass = availableClasses.find(
    c =>
      c.id === selectedClassId ||
      c.name.toLowerCase() === selectedClassId.toLowerCase() ||
      (c.numericGrade && String(c.numericGrade) === selectedClassId.replace(/\D/g, ''))
  );
  const classNameDisplay = currentClass
    ? isMl && currentClass.nameMl
      ? currentClass.nameMl
      : currentClass.name
    : selectedClassId;

  const currentMonthMeta = MONTH_OPTIONS.find(m => m.value === selectedMonth);
  const monthNameDisplay = isMl
    ? currentMonthMeta?.labelMl
    : currentMonthMeta?.labelEn;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Control & Filter Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs print:hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-emerald-100 text-emerald-800">
                <FileSpreadsheet className="w-5 h-5 text-emerald-800" />
              </span>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {isMl ? 'പ്രതിമാസ ഹാജർ റിപ്പോർട്ട്' : 'Monthly Attendance Report'}
                </h3>
                <p className="text-xs text-slate-500">
                  {isMl
                    ? 'പ്രതിമാസ പ്രവൃത്തിദിനങ്ങൾ, ശരാശരി കുട്ടികളുടെ എണ്ണം, ശരാശരി ഹാജർ നിരക്കുകൾ.'
                    : 'Class-level statutory summary: Total School Days, Average on Roll, and Average Daily Attendance.'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadStats}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-xl transition cursor-pointer disabled:opacity-50"
              title="Refresh statistics"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-slate-700 ${loading ? 'animate-spin' : ''}`} />
              <span>{isMl ? 'പുതുക്കുക' : 'Refresh'}</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition shadow-xs cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-white" />
              <span>{isMl ? 'പ്രിന്റ് ചെയ്യുക' : 'Print Report'}</span>
            </button>
          </div>
        </div>

        {/* Filters Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Class Selector */}
          {allowClassSelection && availableClasses.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {isMl ? 'ക്ലാസ്സ്' : 'Class'}
              </label>
              <select
                value={selectedClassId}
                onChange={e => setSelectedClassId(e.target.value)}
                className="w-full bg-slate-50 text-xs font-bold text-slate-800 py-2 px-3 rounded-xl border border-slate-300 focus:outline-emerald-600 cursor-pointer"
              >
                {availableClasses.map(cls => (
                  <option key={cls.id} value={cls.id}>
                    {isMl && cls.nameMl ? cls.nameMl : cls.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Month Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {isMl ? 'മാസം' : 'Month'}
            </label>
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(Number(e.target.value))}
              className="w-full bg-slate-50 text-xs font-bold text-slate-800 py-2 px-3 rounded-xl border border-slate-300 focus:outline-emerald-600 cursor-pointer"
            >
              {MONTH_OPTIONS.map(m => (
                <option key={m.value} value={m.value}>
                  {isMl ? m.labelMl : m.labelEn}
                </option>
              ))}
            </select>
          </div>

          {/* Year Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {isMl ? 'വർഷം' : 'Year'}
            </label>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="w-full bg-slate-50 text-xs font-bold text-slate-800 py-2 px-3 rounded-xl border border-slate-300 focus:outline-emerald-600 cursor-pointer"
            >
              {YEAR_OPTIONS.map(yr => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Printable Report Header */}
      <div className="hidden print:block text-center border-b-2 border-slate-800 pb-4 mb-4">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">
          AMI PALLIKKUTH MADRASA
        </h1>
        <p className="text-xs text-slate-600 font-medium">
          Official Monthly Attendance Summary Register
        </p>
        <div className="mt-2 text-xs font-bold text-slate-800 flex justify-center gap-6">
          <span>Class: {classNameDisplay}</span>
          <span>Period: {monthNameDisplay} {selectedYear}</span>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-center gap-3 text-rose-800 text-xs">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 3-Metric Statistics Card Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Metric 1: Total School Days */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between relative overflow-hidden group hover:border-emerald-300 transition">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              {isMl ? 'ആകെ പ്രവൃത്തിദിനങ്ങൾ' : 'Total School Days'}
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-800 flex items-center justify-center">
              <CalendarDays className="w-5 h-5 text-emerald-800" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900 font-mono tracking-tight">
              {loading ? '—' : stats?.totalSchoolDays ?? 0}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {isMl ? 'ഈ മാസത്തെ ആകെ അധ്യയന ദിനങ്ങൾ' : 'Working days recorded in month'}
            </p>
          </div>
        </div>

        {/* Metric 2: Average Nos On Roll */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between relative overflow-hidden group hover:border-blue-300 transition">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              {isMl ? 'ശരാശരി റോൾ എണ്ണം' : 'Average Nos On Roll'}
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-800 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-800" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-blue-950 font-mono tracking-tight">
              {loading ? '—' : (stats?.averageNosOnRoll ?? 0).toFixed(2)}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {isMl ? 'ക്ലാസ്സിലെ ശരാശരി വിദ്യാർത്ഥി ബലം' : 'Average student strength per day'}
            </p>
          </div>
        </div>

        {/* Metric 3: Average Attendance */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between relative overflow-hidden group hover:border-amber-300 transition">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              {isMl ? 'ശരാശരി ഹാജർ' : 'Average Attendance'}
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-800 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-amber-800" />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900 font-mono tracking-tight">
                {loading ? '—' : (stats?.averageAttendance ?? 0).toFixed(2)}
              </span>
              {stats && stats.attendancePercentage > 0 && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  {stats.attendancePercentage}%
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {isMl ? 'പ്രതിദിന ശരാശരി ഹാജരായ കുട്ടികൾ' : 'Average daily presence / school days'}
            </p>
          </div>
        </div>
      </div>

      {/* Summary Banner */}
      {stats && stats.totalSchoolDays > 0 && (
        <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-xl bg-emerald-100 text-emerald-800">
              <TrendingUp className="w-4 h-4 text-emerald-800" />
            </span>
            <div>
              <span className="font-bold text-slate-800 block">
                {classNameDisplay} — {monthNameDisplay} {selectedYear}
              </span>
              <span className="text-slate-500 text-[11px]">
                {isMl
                  ? `ആകെ ${stats.totalPresentSum} ഹാജർ രേഖപ്പെടുത്തലുകൾ, ${stats.totalAbsentSum} അസാന്നിധ്യങ്ങൾ.`
                  : `Cumulative total: ${stats.totalPresentSum} present entries, ${stats.totalAbsentSum} absent entries across ${stats.totalSchoolDays} school days.`}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold px-3 py-1 bg-white border border-slate-200 rounded-xl text-slate-700">
              {isMl ? 'ഹാജർ നിരക്ക്:' : 'Attendance Rate:'} {stats.attendancePercentage}%
            </span>
          </div>
        </div>
      )}

      {/* Daily Records Breakdown Table */}
      {stats && stats.dailyDetails.length > 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-slate-900">
                {isMl ? 'പ്രതിദിന ഹാജർ വിവരങ്ങൾ' : 'Daily Attendance Log'}
              </h4>
              <p className="text-[11px] text-slate-500">
                {isMl
                  ? 'തിരഞ്ഞെടുത്ത മാസത്തിലെ ഓരോ ദിവസത്തെയും കൃത്യമായ ഹാജർ കണക്കുകൾ.'
                  : 'Daily presence, absence, roll strength, and attendance percentage.'}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-xs min-w-[550px] border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4 font-mono text-center w-14">#</th>
                  <th className="py-2.5 px-4 min-w-[120px]">{isMl ? 'തിയതി' : 'Date'}</th>
                  <th className="py-2.5 px-3 text-center">{isMl ? 'ദിവസം' : 'Day'}</th>
                  <th className="py-2.5 px-3 text-center font-mono">{isMl ? 'ഹാജർ' : 'Present'}</th>
                  <th className="py-2.5 px-3 text-center font-mono">{isMl ? 'അസാന്നിധ്യം' : 'Absent'}</th>
                  <th className="py-2.5 px-3 text-center font-mono">{isMl ? 'റോൾ' : 'Roll'}</th>
                  <th className="py-2.5 px-4 text-right font-mono">{isMl ? 'ശതമാനം' : 'Rate %'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.dailyDetails.map((day, idx) => (
                  <tr key={day.date} className="hover:bg-slate-50 transition">
                    <td className="py-2.5 px-4 text-center font-mono text-slate-500">{idx + 1}</td>
                    <td className="py-2.5 px-4 font-bold text-slate-800 font-mono">{day.date}</td>
                    <td className="py-2.5 px-3 text-center text-slate-600 font-semibold">{day.dayName}</td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-emerald-800 bg-emerald-50/40">
                      {day.presentCount}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-semibold text-rose-700 bg-rose-50/40">
                      {day.absentCount}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-slate-700 font-bold">
                      {day.totalRoll}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-black text-slate-900">
                      {day.percentage}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : !loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500 space-y-2">
          <CalendarDays className="w-10 h-10 mx-auto text-slate-400 mb-2" />
          <h4 className="font-bold text-slate-800 text-sm">
            {isMl ? 'ഹാജർ വിവരങ്ങൾ ലഭ്യമല്ല' : 'No Attendance Records Found'}
          </h4>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {isMl
              ? `${classNameDisplay}-ന് ${monthNameDisplay} ${selectedYear}-ൽ ഹാജർ രേഖപ്പെടുത്തിയിട്ടില്ല.`
              : `No attendance records found for ${classNameDisplay} in ${monthNameDisplay} ${selectedYear}. Please select another month or mark attendance.`}
          </p>
        </div>
      ) : null}
    </div>
  );
};

export default MonthlyAttendanceReport;
