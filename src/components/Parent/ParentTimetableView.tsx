import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../../services/firebase';
import { Student, TimetableDayName } from '../../types';
import {
  TIMETABLE_DAYS,
  getPeriodTimings,
  getTimingForPeriod,
  getWorkingDaysForClass,
  getTimetableDisplayDay,
  extractTimetableClassNumber,
  getTimetableDocId,
} from '../../utils/timetableUtils';
import {
  Calendar,
  Clock,
  BookOpen,
  Loader2,
  Sun,
  CalendarDays,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';

interface ParentTimetableViewProps {
  student: Student | null;
  classLabel?: string;
  onBack?: () => void;
  isMl?: boolean;
}

// STRICT PRIVACY TYPE: Teacher short name and teacher identity are intentionally omitted
interface StudentSafePeriod {
  period: 1 | 2 | 3;
  subject: string;
}

type StudentSafeSchedule = Partial<Record<TimetableDayName, StudentSafePeriod[]>>;

function sanitizeScheduleForParent(rawData: Record<string, any> | undefined | null): StudentSafeSchedule {
  const safe: StudentSafeSchedule = {};
  if (!rawData || typeof rawData.schedule !== 'object' || !rawData.schedule) {
    return safe;
  }

  TIMETABLE_DAYS.forEach(day => {
    const rawList = Array.isArray(rawData.schedule[day]) ? rawData.schedule[day] : [];
    const cleaned: StudentSafePeriod[] = rawList
      .map((p: any) => ({
        period: (Number(p?.period) as 1 | 2 | 3) || 1,
        subject: String(p?.subject || '').trim(),
      }))
      .filter((p: StudentSafePeriod) => p.period >= 1 && p.period <= 3 && p.subject !== '')
      .sort((a: StudentSafePeriod, b: StudentSafePeriod) => a.period - b.period);

    if (cleaned.length > 0) {
      safe[day] = cleaned;
    }
  });

  return safe;
}

export const ParentTimetableView: React.FC<ParentTimetableViewProps> = ({
  student,
  classLabel,
  onBack,
  isMl = false,
}) => {
  // Strict initial states — NO dummy data
  const [schedule, setSchedule] = useState<StudentSafeSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'daily' | 'week'>('daily');
  const [nowTick, setNowTick] = useState<Date>(() => new Date());

  const gradeNum = useMemo(
    () => extractTimetableClassNumber(student?.classId || student?.class),
    [student?.classId, student?.class]
  );

  // Refresh 5 PM rollover check every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => setNowTick(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  // Fetch live timetable document for the active student's class
  useEffect(() => {
    if (!gradeNum) {
      setSchedule(null);
      setLoading(false);
      return;
    }

    let active = true;
    const canonicalDocId = getTimetableDocId(gradeNum);

    const loadClassTimetable = async () => {
      setLoading(true);
      try {
        const directSnap = await getDoc(doc(db, 'timetables', canonicalDocId));
        if (!active) return;

        if (directSnap.exists()) {
          setSchedule(sanitizeScheduleForParent(directSnap.data()));
        } else {
          // Defensive lookup if doc was saved with a different doc key but matching classId
          const q = query(
            collection(db, 'timetables'),
            where('classId', '==', String(gradeNum))
          );
          const qSnap = await getDocs(q);
          if (!active) return;
          if (!qSnap.empty) {
            setSchedule(sanitizeScheduleForParent(qSnap.docs[0].data()));
          } else {
            setSchedule(null);
          }
        }
      } catch (err) {
        console.error('Error fetching student class timetable:', err);
        if (active) setSchedule(null);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadClassTimetable();

    const unsub = onSnapshot(
      doc(db, 'timetables', canonicalDocId),
      snap => {
        if (snap.exists()) {
          setSchedule(sanitizeScheduleForParent(snap.data()));
        } else {
          setSchedule(null);
        }
        setLoading(false);
      },
      err => {
        console.error('Parent timetable snapshot error:', err);
        setLoading(false);
      }
    );

    return () => {
      active = false;
      unsub();
    };
  }, [gradeNum]);

  // CRITICAL TIME LOGIC (5 PM Rollover)
  const displayTimeState = useMemo(() => getTimetableDisplayDay(nowTick), [nowTick]);

  const hasAnyPeriods = useMemo(() => {
    if (!schedule) return false;
    return TIMETABLE_DAYS.some(day => Array.isArray(schedule[day]) && schedule[day]!.length > 0);
  }, [schedule]);

  const workingDays = useMemo(() => getWorkingDaysForClass(gradeNum), [gradeNum]);

  const activeDayName = displayTimeState.dayName as TimetableDayName;
  const isClassOffDay =
    !displayTimeState.isHoliday &&
    TIMETABLE_DAYS.includes(activeDayName) &&
    !workingDays.includes(activeDayName);
  const activeDayPeriods: StudentSafePeriod[] =
    !displayTimeState.isHoliday && !isClassOffDay && schedule && TIMETABLE_DAYS.includes(activeDayName)
      ? schedule[activeDayName] || []
      : [];

  const resolvedClassLabel =
    classLabel || (gradeNum ? `Class ${gradeNum}` : student?.class || 'Class');

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 font-serif">
                {isMl ? 'ക്ലാസ് ടൈംടേബിൾ' : 'Class Timetable'}
              </h2>
              <span className="px-2.5 py-0.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
                {resolvedClassLabel}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {student ? (isMl ? student.nameMl || student.nameEn : student.nameEn) : ''}
              {viewMode === 'daily' && (
                <>
                  {student ? ' · ' : ''}
                  <span className="font-semibold text-emerald-800">
                    {isMl ? displayTimeState.dayNameMl : displayTimeState.dayName}
                  </span>
                  {displayTimeState.rolledOver && (
                    <span className="ml-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold">
                      <Sparkles className="w-2.5 h-2.5" />
                      {isMl ? 'നാളത്തെ ഷെഡ്യൂൾ (5 PM ശേഷം)' : 'Next Day Preview (After 5 PM)'}
                    </span>
                  )}
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode('daily')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                viewMode === 'daily'
                  ? 'bg-emerald-800 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {isMl ? 'ദിവസേന' : 'Daily View'}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('week')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                viewMode === 'week'
                  ? 'bg-emerald-800 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {isMl ? 'ആഴ്ച മുഴുവൻ' : 'Full Week View'}
            </button>
          </div>

          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{isMl ? 'ഹോം' : 'Back'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-700 mx-auto mb-2" />
          <p className="text-xs text-slate-500 font-medium">
            {isMl ? 'ടൈംടേബിൾ ലോഡ് ചെയ്യുന്നു...' : 'Loading class timetable...'}
          </p>
        </div>
      ) : viewMode === 'daily' ? (
        /* ======================== DAILY VIEW ======================== */
        displayTimeState.isHoliday ? (
          <div className="bg-white rounded-2xl border border-amber-200 p-8 sm:p-10 text-center shadow-xs space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
              <Sun className="w-8 h-8" />
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-slate-900 font-serif">
              Holiday
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto">
              {displayTimeState.rolledOver
                ? 'Tomorrow is Sunday — Weekly Holiday. No regular classes scheduled.'
                : 'Today is Sunday — Weekly Holiday. No regular classes scheduled.'}
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setViewMode('week')}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                <CalendarDays className="w-4 h-4" />
                <span>Full Week View</span>
              </button>
            </div>
          </div>
        ) : !hasAnyPeriods ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-2 shadow-xs">
            <Calendar className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="text-base font-bold text-slate-800">Timetable not updated yet.</h3>
            <p className="text-xs text-slate-500">
              The timetable for {resolvedClassLabel} has not been published yet.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 bg-emerald-900 text-white flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-300" />
                <span className="font-bold text-sm sm:text-base">
                  {displayTimeState.dayName} · {resolvedClassLabel}
                </span>
              </div>
              <span className="text-[11px] font-mono text-emerald-200">
                {getPeriodTimings(displayTimeState.dayName)
                  .map(t => `P${t.period}: ${t.label}`)
                  .join(' · ')}
              </span>
            </div>

            {isClassOffDay ? (
              <div className="p-8 text-center space-y-1.5">
                <p className="text-sm font-bold text-slate-800">
                  Scheduled Off-Day for {resolvedClassLabel} ({displayTimeState.dayName})
                </p>
                <p className="text-xs text-slate-500">
                  {resolvedClassLabel} follows an alternate schedule ({workingDays.join(', ')}). Switch to Full Week View to see working days.
                </p>
              </div>
            ) : activeDayPeriods.length === 0 ? (
              <div className="p-8 text-center space-y-1">
                <p className="text-sm font-bold text-slate-700">
                  No periods scheduled for {displayTimeState.dayName}.
                </p>
                <p className="text-xs text-slate-500">
                  Switch to Full Week View to see schedules for other days.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {activeDayPeriods.map(item => (
                  <div
                    key={item.period}
                    className="p-4 sm:px-5 flex items-center justify-between gap-3 hover:bg-emerald-50/40 transition"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-xl bg-emerald-800 text-white flex flex-col items-center justify-center shrink-0 shadow-xs">
                        <span className="text-[9px] uppercase font-bold text-emerald-200">Period</span>
                        <span className="text-base font-extrabold leading-none">{item.period}</span>
                      </div>
                      <div>
                        <div className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                          <BookOpen className="w-4 h-4 text-emerald-700 shrink-0" />
                          <span>{item.subject}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono mt-0.5">
                          <Clock className="w-3.5 h-3.5 text-emerald-700" />
                          <span>{getTimingForPeriod(displayTimeState.dayName, item.period)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      ) : /* ======================== FULL WEEK VIEW ======================== */ !hasAnyPeriods ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-2 shadow-xs">
          <Calendar className="w-10 h-10 text-slate-300 mx-auto" />
          <h3 className="text-base font-bold text-slate-800">Timetable not updated yet.</h3>
          <p className="text-xs text-slate-500">
            The timetable for {resolvedClassLabel} has not been published yet.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {workingDays.map(day => {
            const dayPeriods = schedule?.[day] || [];
            const isHighlighted = !displayTimeState.isHoliday && displayTimeState.dayName === day;
            const isFriday = day === 'Friday';

            return (
              <div
                key={day}
                className={`bg-white rounded-2xl border shadow-xs overflow-hidden ${
                  isHighlighted ? 'border-emerald-600 ring-1 ring-emerald-600/20' : 'border-slate-200'
                }`}
              >
                <div
                  className={`px-4 py-3 border-b flex items-center justify-between ${
                    isHighlighted
                      ? 'bg-emerald-900 text-white border-emerald-800'
                      : isFriday
                      ? 'bg-amber-50 text-slate-900 border-amber-200'
                      : 'bg-slate-50 text-slate-900 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm">{day}</span>
                    {isHighlighted && (
                      <span className="px-2 py-0.5 rounded bg-amber-400 text-emerald-950 text-[10px] font-extrabold">
                        {displayTimeState.rolledOver ? 'Next Working Day' : 'Today'}
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-[10px] font-bold ${
                      isHighlighted ? 'text-emerald-200' : 'text-slate-500'
                    }`}
                  >
                    {dayPeriods.length} Period{dayPeriods.length === 1 ? '' : 's'}
                  </span>
                </div>

                {dayPeriods.length === 0 ? (
                  <div className="p-5 text-center text-xs text-slate-400 font-medium">
                    No periods scheduled
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {dayPeriods.map(item => (
                      <div
                        key={`${day}-${item.period}`}
                        className="px-4 py-3 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-900 font-bold text-xs flex items-center justify-center shrink-0">
                            P{item.period}
                          </span>
                          <div>
                            <div className="font-bold text-xs sm:text-sm text-slate-900 flex items-center gap-1.5">
                              <BookOpen className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                              <span>{item.subject}</span>
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              {getTimingForPeriod(day, item.period)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
