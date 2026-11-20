import React, { useState, useEffect, useMemo } from 'react';
import {
  ClassAttendanceConfig,
  DailyAttendanceRecord,
  Student,
} from '../../types';
import { isAlternateOffDay } from '../../utils/scheduleUtils';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Save,
  Lock,
  User,
  RotateCcw,
} from 'lucide-react';

export interface AcademicMonthOption {
  key: string; // "YYYY-MM"
  year: number;
  month: number; // 1..12
  labelEn: string;
  labelMl: string;
}

// Strictly locked Academic Year range: June 2026 to May 2027
export const ACADEMIC_YEAR_MONTHS: AcademicMonthOption[] = [
  { key: '2026-06', year: 2026, month: 6, labelEn: 'June 2026', labelMl: 'ജൂൺ 2026' },
  { key: '2026-07', year: 2026, month: 7, labelEn: 'July 2026', labelMl: 'ജൂലൈ 2026' },
  { key: '2026-08', year: 2026, month: 8, labelEn: 'August 2026', labelMl: 'ഓഗസ്റ്റ് 2026' },
  { key: '2026-09', year: 2026, month: 9, labelEn: 'September 2026', labelMl: 'സെപ്റ്റംബർ 2026' },
  { key: '2026-10', year: 2026, month: 10, labelEn: 'October 2026', labelMl: 'ഒക്ടോബർ 2026' },
  { key: '2026-11', year: 2026, month: 11, labelEn: 'November 2026', labelMl: 'നവംബർ 2026' },
  { key: '2026-12', year: 2026, month: 12, labelEn: 'December 2026', labelMl: 'ഡിസംബർ 2026' },
  { key: '2027-01', year: 2027, month: 1, labelEn: 'January 2027', labelMl: 'ജനുവരി 2027' },
  { key: '2027-02', year: 2027, month: 2, labelEn: 'February 2027', labelMl: 'ഫെബ്രുവരി 2027' },
  { key: '2027-03', year: 2027, month: 3, labelEn: 'March 2027', labelMl: 'മാർച്ച് 2027' },
  { key: '2027-04', year: 2027, month: 4, labelEn: 'April 2027', labelMl: 'ഏപ്രിൽ 2027' },
  { key: '2027-05', year: 2027, month: 5, labelEn: 'May 2027', labelMl: 'മേയ് 2027' },
];

function getInitialAcademicMonthIndex(todayStr: string): number {
  const ym = todayStr.slice(0, 7);
  const idx = ACADEMIC_YEAR_MONTHS.findIndex(m => m.key === ym);
  if (idx !== -1) return idx;
  if (ym < ACADEMIC_YEAR_MONTHS[0].key) return 0;
  return ACADEMIC_YEAR_MONTHS.length - 1;
}

function getSavedStudentStatusForDate(
  rec: DailyAttendanceRecord | undefined,
  studentId: string
): boolean | undefined {
  if (!rec || rec.isHoliday) return undefined;
  const raw = rec.statusMap?.[studentId] as unknown;
  if (raw === true || raw === 'Present' || raw === 'P') return true;
  if (raw === false || raw === 'Absent' || raw === 'A') return false;
  if (Array.isArray(rec.presentStudentIds) && rec.presentStudentIds.includes(studentId)) {
    return true;
  }
  if (Array.isArray(rec.absentStudentIds) && rec.absentStudentIds.includes(studentId)) {
    return false;
  }
  return undefined;
}

interface MonthlyMarkingCalendarProps {
  classId: string;
  className: string;
  classStudents: Student[];
  classAttendanceConfig: ClassAttendanceConfig | null;
  todayStr: string;
  isDateHoliday: (dateStr: string, targetClassId?: string) => boolean;
  getHolidayInfo: (dateStr: string, targetClassId?: string) => { reason: string } | null;
  isDateSunday: (dateStr: string) => boolean;
  isSundayUnlockedForClass: (dateStr: string, targetClassId?: string) => boolean;
  onSaveMonthlyAttendance: (
    studentId: string,
    monthKey: string,
    changes: Record<string, boolean>
  ) => Promise<void>;
  isSaving: boolean;
  saveSuccess: boolean;
  isMl?: boolean;
}

export const MonthlyMarkingCalendar: React.FC<MonthlyMarkingCalendarProps> = ({
  classId,
  className,
  classStudents,
  classAttendanceConfig,
  todayStr,
  isDateHoliday,
  getHolidayInfo,
  isDateSunday,
  isSundayUnlockedForClass,
  onSaveMonthlyAttendance,
  isSaving,
  saveSuccess,
  isMl = false,
}) => {
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [monthIndex, setMonthIndex] = useState<number>(() =>
    getInitialAcademicMonthIndex(todayStr)
  );
  // Local batch draft: dateStr ("YYYY-MM-DD") -> true (Present) / false (Absent)
  const [draftChanges, setDraftChanges] = useState<Record<string, boolean>>({});

  // Keep selectedStudentId valid for current classStudents
  useEffect(() => {
    if (classStudents.length === 0) {
      setSelectedStudentId('');
      setDraftChanges({});
      return;
    }
    const exists = classStudents.some(s => s.id === selectedStudentId);
    if (!exists) {
      setSelectedStudentId(classStudents[0].id);
      setDraftChanges({});
    }
  }, [classStudents, selectedStudentId]);

  // Clear pending unsaved drafts if class changes
  useEffect(() => {
    setDraftChanges({});
  }, [classId]);

  const activeMonth = ACADEMIC_YEAR_MONTHS[monthIndex] || ACADEMIC_YEAR_MONTHS[0];
  const selectedStudent = useMemo(
    () => classStudents.find(s => s.id === selectedStudentId) || null,
    [classStudents, selectedStudentId]
  );

  // Build calendar grid cells for the selected month
  const calendarDays = useMemo(() => {
    const year = activeMonth.year;
    const monthIdx0 = activeMonth.month - 1;
    const firstDayWeekday = new Date(year, monthIdx0, 1).getDay(); // 0=Sun..6=Sat
    const daysInMonth = new Date(year, monthIdx0 + 1, 0).getDate();

    const leadingBlanks = Array.from({ length: firstDayWeekday }, (_, i) => i);
    const days: {
      dayNum: number;
      dateStr: string;
      isFuture: boolean;
      isHoliday: boolean;
      holidayReason?: string;
      isSunday: boolean;
      isAltOff: boolean;
      savedStatus: boolean | undefined;
      effectiveStatus: boolean | undefined;
      isModified: boolean;
    }[] = [];

    const liveRecords = classAttendanceConfig?.dailyRecords || {};

    for (let d = 1; d <= daysInMonth; d++) {
      const mm = String(activeMonth.month).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      const dateStr = `${year}-${mm}-${dd}`;
      const rec = liveRecords[dateStr];

      const isFuture = dateStr > todayStr;
      const isHol = Boolean(rec?.isHoliday || isDateHoliday(dateStr, classId));
      const holInfo = isHol ? getHolidayInfo(dateStr, classId) : null;
      const isSun = isDateSunday(dateStr) && !isSundayUnlockedForClass(dateStr, classId);
      const isAltOff = isAlternateOffDay(className || classId, dateStr);

      const savedStatus = selectedStudentId
        ? getSavedStudentStatusForDate(rec, selectedStudentId)
        : undefined;
      const hasDraft = Object.prototype.hasOwnProperty.call(draftChanges, dateStr);
      const effectiveStatus = hasDraft ? draftChanges[dateStr] : savedStatus;

      days.push({
        dayNum: d,
        dateStr,
        isFuture,
        isHoliday: isHol,
        holidayReason: holInfo?.reason || rec?.holidayReason,
        isSunday: isSun,
        isAltOff,
        savedStatus,
        effectiveStatus,
        isModified: hasDraft && draftChanges[dateStr] !== savedStatus,
      });
    }

    return { leadingBlanks, days };
  }, [
    activeMonth,
    classAttendanceConfig,
    selectedStudentId,
    draftChanges,
    todayStr,
    classId,
    className,
    isDateHoliday,
    getHolidayInfo,
    isDateSunday,
    isSundayUnlockedForClass,
  ]);

  const monthSummary = useMemo(() => {
    let present = 0;
    let absent = 0;
    let unmarked = 0;
    let holidays = 0;
    let pendingCount = 0;

    calendarDays.days.forEach(d => {
      if (d.isModified) pendingCount++;
      if (d.isHoliday || d.isSunday) {
        if (d.isHoliday) holidays++;
        return;
      }
      if (d.isFuture) return;
      if (d.effectiveStatus === true) present++;
      else if (d.effectiveStatus === false) absent++;
      else unmarked++;
    });

    return { present, absent, unmarked, holidays, pendingCount };
  }, [calendarDays]);

  const handleToggleDate = (dateStr: string, currentEffective: boolean | undefined) => {
    if (!selectedStudentId) return;
    // Toggle strictly in local draft state: Unmarked -> Present, Present -> Absent, Absent -> Present
    const nextVal = currentEffective === true ? false : true;
    setDraftChanges(prev => ({
      ...prev,
      [dateStr]: nextVal,
    }));
  };

  const handleSelectStudent = (newStudentId: string) => {
    setSelectedStudentId(newStudentId);
    setDraftChanges({});
  };

  const handlePrevMonth = () => {
    setMonthIndex(prev => Math.max(0, prev - 1));
  };

  const handleNextMonth = () => {
    setMonthIndex(prev => Math.min(ACADEMIC_YEAR_MONTHS.length - 1, prev + 1));
  };

  const handleBatchSave = async () => {
    if (!selectedStudentId) return;
    // Collect all changes in current month (plus any changes across months in draftChanges)
    const monthPrefix = activeMonth.key;
    const changesToSave: Record<string, boolean> = {};
    Object.entries(draftChanges).forEach(([dateStr, val]) => {
      if (dateStr.startsWith(monthPrefix) || val !== undefined) {
        changesToSave[dateStr] = val;
      }
    });

    if (Object.keys(changesToSave).length === 0) {
      return;
    }

    await onSaveMonthlyAttendance(selectedStudentId, activeMonth.key, changesToSave);
    setDraftChanges({});
  };

  const pendingKeysCount = Object.keys(draftChanges).length;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-xs space-y-5">
      {/* Top Controls: Student Selector + Locked June-to-May Month Navigator */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-slate-100 pb-4">
        {/* a. Student Dropdown */}
        <div className="flex-1 min-w-0">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
            {isMl ? 'വിദ്യാർത്ഥിയെ തിരഞ്ഞെടുക്കുക' : `Select Student (${className})`}
          </label>
          {classStudents.length === 0 ? (
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500">
              No active students found in this class.
            </div>
          ) : (
            <div className="relative">
              <User className="w-4 h-4 text-emerald-700 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={selectedStudentId}
                onChange={e => handleSelectStudent(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700 cursor-pointer"
              >
                {classStudents.map(st => (
                  <option key={st.id} value={st.id}>
                    Roll {st.rollNo} — {st.nameEn} {st.admissionNo ? `(Adm: ${st.admissionNo})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* b. Academic Year Month Navigator (Strictly June 2026 - May 2027) */}
        <div className="shrink-0">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
            {isMl ? 'മാസം (ജൂൺ – മേയ്)' : 'Academic Month (June – May)'}
          </label>
          <div className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xl p-1">
            <button
              type="button"
              onClick={handlePrevMonth}
              disabled={monthIndex <= 0}
              className={`p-2 rounded-lg transition ${
                monthIndex <= 0
                  ? 'text-slate-300 cursor-not-allowed opacity-40'
                  : 'text-slate-700 hover:bg-white hover:shadow-2xs cursor-pointer'
              }`}
              title={monthIndex <= 0 ? 'Academic year starts in June 2026' : 'Previous Month'}
              aria-label="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="px-3 py-1 text-center min-w-[140px]">
              <div className="text-xs sm:text-sm font-bold text-slate-900 flex items-center justify-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-emerald-700" />
                <span>{isMl ? activeMonth.labelMl : activeMonth.labelEn}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              disabled={monthIndex >= ACADEMIC_YEAR_MONTHS.length - 1}
              className={`p-2 rounded-lg transition ${
                monthIndex >= ACADEMIC_YEAR_MONTHS.length - 1
                  ? 'text-slate-300 cursor-not-allowed opacity-40'
                  : 'text-slate-700 hover:bg-white hover:shadow-2xs cursor-pointer'
              }`}
              title={
                monthIndex >= ACADEMIC_YEAR_MONTHS.length - 1
                  ? 'Academic year ends in May 2027'
                  : 'Next Month'
              }
              aria-label="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Legend & Student Month Summary */}
      {selectedStudent && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/80 border border-slate-200 rounded-xl p-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-800">
              <span className="w-3 h-3 rounded bg-emerald-600 inline-block" />
              Present ({monthSummary.present})
            </span>
            <span className="inline-flex items-center gap-1.5 font-semibold text-rose-700">
              <span className="w-3 h-3 rounded bg-rose-500 inline-block" />
              Absent ({monthSummary.absent})
            </span>
            <span className="inline-flex items-center gap-1.5 font-medium text-slate-600">
              <span className="w-3 h-3 rounded bg-white border border-slate-300 inline-block" />
              Unmarked ({monthSummary.unmarked})
            </span>
            {monthSummary.holidays > 0 && (
              <span className="inline-flex items-center gap-1.5 font-medium text-amber-800">
                <span className="w-3 h-3 rounded bg-amber-200 border border-amber-300 inline-block" />
                Holiday ({monthSummary.holidays})
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {pendingKeysCount > 0 && (
              <>
                <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 font-bold text-[11px] border border-amber-300">
                  {pendingKeysCount} unsaved change{pendingKeysCount === 1 ? '' : 's'}
                </span>
                <button
                  type="button"
                  onClick={() => setDraftChanges({})}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 text-[11px] font-bold cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* c. Interactive Calendar View (Responsive 7-Column Grid) */}
      {selectedStudent && (
        <div>
          <p className="text-[11px] text-slate-500 mb-2">
            Tap any working date to toggle between <strong className="text-emerald-700">Present (Green)</strong> and <strong className="text-rose-700">Absent (Red)</strong>, then click <strong>Save Monthly Attendance</strong> below.
          </p>

          {/* Weekday Headers */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-1.5 text-center text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-500">
            <div className="py-1.5 text-rose-600">Sun</div>
            <div className="py-1.5">Mon</div>
            <div className="py-1.5">Tue</div>
            <div className="py-1.5">Wed</div>
            <div className="py-1.5">Thu</div>
            <div className="py-1.5">Fri</div>
            <div className="py-1.5">Sat</div>
          </div>

          {/* Calendar Cells */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {calendarDays.leadingBlanks.map(blankIdx => (
              <div
                key={`blank-${blankIdx}`}
                className="min-h-[52px] sm:min-h-[64px] rounded-xl bg-slate-50/40"
              />
            ))}

            {calendarDays.days.map(cell => {
              const isToday = cell.dateStr === todayStr;

              if (cell.isHoliday) {
                return (
                  <div
                    key={cell.dateStr}
                    title={cell.holidayReason || 'Official Holiday'}
                    className="min-h-[52px] sm:min-h-[64px] rounded-xl border border-amber-200 bg-amber-50/90 p-1 sm:p-2 flex flex-col items-center justify-center text-center select-none opacity-90"
                  >
                    <span className="text-xs sm:text-sm font-bold text-amber-900">
                      {cell.dayNum}
                    </span>
                    <span className="text-[9px] font-bold uppercase text-amber-700 mt-0.5">
                      Holiday
                    </span>
                  </div>
                );
              }

              if (cell.isSunday) {
                return (
                  <div
                    key={cell.dateStr}
                    className="min-h-[52px] sm:min-h-[64px] rounded-xl border border-slate-200/80 bg-slate-100/70 p-1 sm:p-2 flex flex-col items-center justify-center text-center select-none text-slate-400"
                  >
                    <span className="text-xs sm:text-sm font-bold">{cell.dayNum}</span>
                    <span className="text-[9px] font-semibold uppercase mt-0.5">Sun</span>
                  </div>
                );
              }

              if (cell.isFuture) {
                return (
                  <div
                    key={cell.dateStr}
                    className="min-h-[52px] sm:min-h-[64px] rounded-xl border border-slate-200/70 bg-slate-50 p-1 sm:p-2 flex flex-col items-center justify-center text-center select-none text-slate-300 cursor-not-allowed"
                  >
                    <span className="text-xs sm:text-sm font-bold">{cell.dayNum}</span>
                    <Lock className="w-3 h-3 mt-0.5 opacity-60" />
                  </div>
                );
              }

              const isPresent = cell.effectiveStatus === true;
              const isAbsent = cell.effectiveStatus === false;

              let tileClasses =
                'bg-white border-slate-200 text-slate-800 hover:border-emerald-400 hover:bg-emerald-50/40';
              if (isPresent) {
                tileClasses =
                  'bg-emerald-600 border-emerald-700 text-white hover:bg-emerald-700 shadow-2xs';
              } else if (isAbsent) {
                tileClasses =
                  'bg-rose-600 border-rose-700 text-white hover:bg-rose-700 shadow-2xs';
              }

              return (
                <button
                  key={cell.dateStr}
                  type="button"
                  onClick={() => handleToggleDate(cell.dateStr, cell.effectiveStatus)}
                  className={`relative min-h-[52px] sm:min-h-[64px] rounded-xl border p-1 sm:p-2 flex flex-col items-center justify-center text-center transition cursor-pointer active:scale-95 ${tileClasses} ${
                    isToday ? 'ring-2 ring-amber-400 ring-offset-1' : ''
                  } ${cell.isModified ? 'ring-2 ring-amber-300' : ''}`}
                >
                  <span className="text-xs sm:text-sm font-extrabold leading-none">
                    {cell.dayNum}
                  </span>

                  <div className="mt-1 flex items-center justify-center">
                    {isPresent ? (
                      <span className="inline-flex items-center gap-0.5 text-[9px] sm:text-[10px] font-bold">
                        <Check className="w-3 h-3 stroke-[3]" />
                        <span className="hidden sm:inline">Present</span>
                      </span>
                    ) : isAbsent ? (
                      <span className="inline-flex items-center gap-0.5 text-[9px] sm:text-[10px] font-bold">
                        <X className="w-3 h-3 stroke-[3]" />
                        <span className="hidden sm:inline">Absent</span>
                      </span>
                    ) : (
                      <span className="text-[9px] text-slate-400 font-medium">
                        {cell.isAltOff ? 'Off' : 'Tap'}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* e. Batch Save Button */}
      <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-[11px] text-slate-500">
          {pendingKeysCount > 0
            ? `${pendingKeysCount} day(s) modified for ${selectedStudent?.nameEn || 'student'}. Click Save to sync to Firestore.`
            : 'No unsaved calendar edits.'}
        </p>

        <button
          type="button"
          onClick={handleBatchSave}
          disabled={isSaving || !selectedStudentId || pendingKeysCount === 0}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs sm:text-sm font-bold shadow-xs transition cursor-pointer disabled:cursor-not-allowed"
        >
          <Save className="w-4 h-4" />
          <span>
            {isSaving
              ? 'Saving Monthly Attendance...'
              : saveSuccess
              ? 'Saved!'
              : 'Save Monthly Attendance'}
          </span>
        </button>
      </div>
    </div>
  );
};
