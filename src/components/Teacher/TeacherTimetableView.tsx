import React, { useState, useEffect, useMemo } from 'react';
import { collection, doc, getDoc, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { ClassTimetableDoc, TimetableDayName, User } from '../../types';
import {
  TIMETABLE_DAYS,
  DAY_NAME_ML,
  getPeriodTimings,
  getTimingForPeriod,
  getTimetableDisplayDay,
  normalizeClassTimetableDoc,
  hasAnyTimetableEntries,
  doesTeacherMatchPeriod,
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

interface TeacherTimetableViewProps {
  user: User | null;
  onBack?: () => void;
  isMl?: boolean;
}

interface MatchedTeacherPeriod {
  classId: string;
  day: TimetableDayName;
  period: 1 | 2 | 3;
  timing: string;
  subject: string;
  teacherShortName: string;
}

export const TeacherTimetableView: React.FC<TeacherTimetableViewProps> = ({
  user,
  onBack,
  isMl = false,
}) => {
  // Strict initial states — NO dummy data
  const [timetableDocs, setTimetableDocs] = useState<ClassTimetableDoc[]>([]);
  const [liveTeacherProfile, setLiveTeacherProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'daily' | 'week'>('daily');
  const [nowTick, setNowTick] = useState<Date>(() => new Date());

  // Re-evaluate 5 PM rollover every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => setNowTick(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  // Fetch live timetable docs across all classes and freshest live teacher doc from Firestore
  useEffect(() => {
    let active = true;

    const loadData = async () => {
      setLoading(true);
      try {
        const [ttSnap, teacherSnap] = await Promise.all([
          getDocs(collection(db, 'timetables')),
          user?.id ? getDoc(doc(db, 'teachers', user.id)).catch(() => null) : Promise.resolve(null),
        ]);

        if (!active) return;

        const parsedDocs: ClassTimetableDoc[] = [];
        ttSnap.docs.forEach(d => {
          const norm = normalizeClassTimetableDoc(d.id, d.data());
          if (norm) parsedDocs.push(norm);
        });
        setTimetableDocs(parsedDocs);

        if (teacherSnap && teacherSnap.exists()) {
          setLiveTeacherProfile({
            ...(teacherSnap.data() as User),
            id: teacherSnap.id,
          });
        } else {
          setLiveTeacherProfile(null);
        }
      } catch (err) {
        console.error('Error fetching teacher timetable:', err);
        if (active) setTimetableDocs([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadData();

    const unsub = onSnapshot(
      collection(db, 'timetables'),
      snap => {
        const parsedDocs: ClassTimetableDoc[] = [];
        snap.docs.forEach(d => {
          const norm = normalizeClassTimetableDoc(d.id, d.data());
          if (norm) parsedDocs.push(norm);
        });
        setTimetableDocs(parsedDocs);
        setLoading(false);
      },
      err => {
        console.error('Teacher timetable snapshot error:', err);
        setLoading(false);
      }
    );

    return () => {
      active = false;
      unsub();
    };
  }, [user?.id]);

  const effectiveTeacher = liveTeacherProfile || user;

  // CRITICAL TIME LOGIC (5 PM Rollover)
  const displayTimeState = useMemo(() => getTimetableDisplayDay(nowTick), [nowTick]);

  const hasAnyData = useMemo(() => hasAnyTimetableEntries(timetableDocs), [timetableDocs]);

  // Filter periods across ALL classes matching logged-in teacher's short name / identity
  const matchedPeriodsByDay = useMemo(() => {
    const byDay: Record<TimetableDayName, MatchedTeacherPeriod[]> = {
      Monday: [],
      Tuesday: [],
      Wednesday: [],
      Thursday: [],
      Friday: [],
      Saturday: [],
    };

    if (!effectiveTeacher) return byDay;

    timetableDocs.forEach(classDoc => {
      TIMETABLE_DAYS.forEach(day => {
        const dayEntries = classDoc.schedule?.[day] || [];
        dayEntries.forEach(entry => {
          if (doesTeacherMatchPeriod(effectiveTeacher, entry.teacherShortName)) {
            byDay[day].push({
              classId: classDoc.classId,
              day,
              period: entry.period,
              timing: getTimingForPeriod(day, entry.period),
              subject: entry.subject,
              teacherShortName: entry.teacherShortName,
            });
          }
        });
      });
    });

    TIMETABLE_DAYS.forEach(day => {
      byDay[day].sort((a, b) => {
        if (a.period !== b.period) return a.period - b.period;
        return Number(a.classId) - Number(b.classId);
      });
    });

    return byDay;
  }, [timetableDocs, effectiveTeacher]);

  const totalWeeklyPeriods = useMemo(
    () => TIMETABLE_DAYS.reduce((sum, day) => sum + matchedPeriodsByDay[day].length, 0),
    [matchedPeriodsByDay]
  );

  const activeDayName = displayTimeState.dayName as TimetableDayName;
  const activeDayPeriods =
    !displayTimeState.isHoliday && TIMETABLE_DAYS.includes(activeDayName)
      ? matchedPeriodsByDay[activeDayName] || []
      : [];

  return (
    <div className="space-y-4">
      {/* Header & View Mode Switcher */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 font-serif">
                {isMl ? 'എന്റെ ടൈംടേബിൾ' : 'My Teaching Timetable'}
              </h2>
              {effectiveTeacher?.shortCode && (
                <span className="px-2 py-0.5 rounded-md bg-emerald-800 text-white font-mono text-[10px] font-bold">
                  {effectiveTeacher.shortCode}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {effectiveTeacher?.nameEn || effectiveTeacher?.name || 'Teacher'}
              {viewMode === 'daily' && (
                <>
                  {' · '}
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
            {isMl ? 'ടൈംടേബിൾ ലോഡ് ചെയ്യുന്നു...' : 'Loading timetable from database...'}
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
        ) : !hasAnyData ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-2 shadow-xs">
            <Calendar className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="text-base font-bold text-slate-800">Timetable not updated yet.</h3>
            <p className="text-xs text-slate-500">
              The Principal has not published the class timetable yet.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 bg-emerald-900 text-white flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-300" />
                <span className="font-bold text-sm sm:text-base">
                  {displayTimeState.dayName} Schedule
                </span>
              </div>
              <span className="text-[11px] font-mono text-emerald-200">
                {getPeriodTimings(displayTimeState.dayName)
                  .map(t => `P${t.period}: ${t.label}`)
                  .join(' · ')}
              </span>
            </div>

            {activeDayPeriods.length === 0 ? (
              <div className="p-8 text-center space-y-1">
                <p className="text-sm font-bold text-slate-700">
                  No periods assigned to you on {displayTimeState.dayName}.
                </p>
                <p className="text-xs text-slate-500">
                  Switch to Full Week View to see your classes on other days.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {activeDayPeriods.map((item, idx) => (
                  <div
                    key={`${item.classId}-${item.period}-${idx}`}
                    className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-emerald-50/40 transition"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-xl bg-emerald-800 text-white flex flex-col items-center justify-center shrink-0 shadow-xs">
                        <span className="text-[9px] uppercase font-bold text-emerald-200">Period</span>
                        <span className="text-base font-extrabold leading-none">{item.period}</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm sm:text-base font-bold text-slate-900">
                            {item.subject || 'Subject'}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 text-[11px] font-bold">
                            Class {item.classId}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono mt-0.5">
                          <Clock className="w-3.5 h-3.5 text-emerald-700" />
                          <span>{item.timing}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-center">
                      <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 font-mono text-[11px] font-bold">
                        {item.teacherShortName}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      ) : /* ======================== FULL WEEK VIEW ======================== */ !hasAnyData ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-2 shadow-xs">
          <Calendar className="w-10 h-10 text-slate-300 mx-auto" />
          <h3 className="text-base font-bold text-slate-800">Timetable not updated yet.</h3>
          <p className="text-xs text-slate-500">
            The Principal has not published the class timetable yet.
          </p>
        </div>
      ) : totalWeeklyPeriods === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-2 shadow-xs">
          <Calendar className="w-10 h-10 text-slate-300 mx-auto" />
          <h3 className="text-base font-bold text-slate-800">
            No periods matched for {effectiveTeacher?.nameEn || effectiveTeacher?.name}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Ensure your teacher short code matches the Master Timetable code configured by the Principal.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {TIMETABLE_DAYS.map(day => {
            const periods = matchedPeriodsByDay[day] || [];
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
                    {periods.length} Period{periods.length === 1 ? '' : 's'}
                  </span>
                </div>

                {periods.length === 0 ? (
                  <div className="p-5 text-center text-xs text-slate-400 font-medium">
                    No periods scheduled
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {periods.map((item, idx) => (
                      <div
                        key={`${day}-${item.classId}-${item.period}-${idx}`}
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
                              {item.timing}
                            </div>
                          </div>
                        </div>

                        <span className="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-bold shrink-0">
                          Class {item.classId}
                        </span>
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
