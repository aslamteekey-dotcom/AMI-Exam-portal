import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '../../services/firebase';
import { cleanForFirestore } from '../../services/firestoreSync';
import { useAuth } from '../../context/AuthContext';
import { logAuditEvent } from '../../services/auditLogger';
import {
  ClassTimetableDoc,
  SubjectItem,
  TimetableDayName,
  TimetablePeriod,
  User,
} from '../../types';
import {
  TIMETABLE_DAYS,
  TIMETABLE_CLASS_NUMBERS,
  TEACHER_SHORT_CODE_GUIDE,
  getPeriodTimings,
  getWorkingDaysForClass,
  getPeriodNumbersForClass,
  getTimetableDocId,
  normalizeClassTimetableDoc,
  hasAnyTimetableEntries,
} from '../../utils/timetableUtils';
import {
  Calendar,
  Clock,
  Edit3,
  Save,
  X,
  Loader2,
  CheckCircle2,
  Copy,
  Trash2,
  Users,
  BookOpen,
  Info,
} from 'lucide-react';

type EditableDayGrid = Record<
  TimetableDayName,
  Record<1 | 2 | 3, { subject: string; teacherShortName: string }>
>;

function buildEmptyEditableGrid(): EditableDayGrid {
  const grid = {} as EditableDayGrid;
  TIMETABLE_DAYS.forEach(day => {
    grid[day] = {
      1: { subject: '', teacherShortName: '' },
      2: { subject: '', teacherShortName: '' },
      3: { subject: '', teacherShortName: '' },
    };
  });
  return grid;
}

function docToEditableGrid(docData?: ClassTimetableDoc | null): EditableDayGrid {
  const grid = buildEmptyEditableGrid();
  if (!docData?.schedule) return grid;
  TIMETABLE_DAYS.forEach(day => {
    const periods = docData.schedule[day] || [];
    periods.forEach(p => {
      if (p.period === 1 || p.period === 2 || p.period === 3) {
        grid[day][p.period] = {
          subject: p.subject || '',
          teacherShortName: p.teacherShortName || '',
        };
      }
    });
  });
  return grid;
}

export const TimetableManager: React.FC = () => {
  const { user, fetchWithAuth } = useAuth();

  // Strictly empty initial states — NO dummy data
  const [timetableDocs, setTimetableDocs] = useState<ClassTimetableDoc[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Master view filters
  const [selectedDayFilter, setSelectedDayFilter] = useState<'ALL' | TimetableDayName>('ALL');
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('ALL');

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editingClassNum, setEditingClassNum] = useState<string>('1');
  const [editGrid, setEditGrid] = useState<EditableDayGrid>(() => buildEmptyEditableGrid());
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copySourceDay, setCopySourceDay] = useState<TimetableDayName>('Monday');

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 3500);
    return () => clearTimeout(t);
  }, [toastMessage]);

  useEffect(() => {
    let active = true;

    const loadInitial = async () => {
      setLoading(true);
      try {
        const [ttSnap, tSnap, sRes] = await Promise.all([
          getDocs(collection(db, 'timetables')),
          getDocs(collection(db, 'teachers')),
          fetchWithAuth('/api/subjects').catch(() => null),
        ]);

        if (!active) return;

        const parsedDocs: ClassTimetableDoc[] = [];
        ttSnap.docs.forEach(d => {
          const norm = normalizeClassTimetableDoc(d.id, d.data());
          if (norm) parsedDocs.push(norm);
        });
        setTimetableDocs(parsedDocs);

        if (!tSnap.empty) {
          const liveTeachers = tSnap.docs.map(d => ({
            ...d.data(),
            id: d.id,
          })) as User[];
          setTeachers(liveTeachers);
        } else {
          setTeachers([]);
        }

        if (sRes && sRes.ok) {
          const sData = await sRes.json();
          setSubjects(Array.isArray(sData) ? sData : []);
        }
      } catch (err) {
        console.error('Error loading master timetable:', err);
        if (active) setTimetableDocs([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadInitial();

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
        console.error('Timetables snapshot error:', err);
        setLoading(false);
      }
    );

    return () => {
      active = false;
      unsub();
    };
  }, [fetchWithAuth]);

  const docsByClass = useMemo(() => {
    const map: Record<string, ClassTimetableDoc> = {};
    timetableDocs.forEach(d => {
      map[d.classId] = d;
    });
    return map;
  }, [timetableDocs]);

  const hasAnyData = useMemo(() => hasAnyTimetableEntries(timetableDocs), [timetableDocs]);

  const editableDays = useMemo(
    () => getWorkingDaysForClass(editingClassNum),
    [editingClassNum]
  );

  const editablePeriods = useMemo(
    () => getPeriodNumbersForClass(editingClassNum),
    [editingClassNum]
  );

  // Ensure copySourceDay always belongs to the active class's working days
  useEffect(() => {
    if (!editableDays.includes(copySourceDay)) {
      setCopySourceDay(editableDays[0]);
    }
  }, [editableDays, copySourceDay]);

  // Populate editor grid when switching class or entering edit mode
  const openEditForClass = (classNum: string = '1') => {
    setEditingClassNum(classNum);
    setEditGrid(docToEditableGrid(docsByClass[classNum]));
    setCopySourceDay(getWorkingDaysForClass(classNum)[0]);
    setIsEditing(true);
  };

  const handleSelectEditClass = (classNum: string) => {
    setEditingClassNum(classNum);
    setEditGrid(docToEditableGrid(docsByClass[classNum]));
    setCopySourceDay(getWorkingDaysForClass(classNum)[0]);
  };

  const handleCellChange = (
    day: TimetableDayName,
    period: 1 | 2 | 3,
    field: 'subject' | 'teacherShortName',
    value: string
  ) => {
    setEditGrid(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        [period]: {
          ...prev[day][period],
          [field]: value,
        },
      },
    }));
  };

  const handleCopyDayToSelected = (targetDay: TimetableDayName) => {
    if (copySourceDay === targetDay) return;
    setEditGrid(prev => ({
      ...prev,
      [targetDay]: {
        1: { ...prev[copySourceDay][1] },
        2: { ...prev[copySourceDay][2] },
        3: { ...prev[copySourceDay][3] },
      },
    }));
  };

  const handleClearDay = (day: TimetableDayName) => {
    setEditGrid(prev => ({
      ...prev,
      [day]: {
        1: { subject: '', teacherShortName: '' },
        2: { subject: '', teacherShortName: '' },
        3: { subject: '', teacherShortName: '' },
      },
    }));
  };

  const handleSaveClassTimetable = async () => {
    setSaving(true);
    try {
      const docId = getTimetableDocId(editingClassNum);
      const allowedDays = getWorkingDaysForClass(editingClassNum);
      const allowedPeriods = getPeriodNumbersForClass(editingClassNum);
      const schedulePayload: Record<string, TimetablePeriod[]> = {};
      let totalPeriodsCount = 0;

      allowedDays.forEach(day => {
        const dayPeriods: TimetablePeriod[] = [];
        allowedPeriods.forEach(pNum => {
          const cell = editGrid[day][pNum];
          const subj = cell.subject.trim();
          const tCode = cell.teacherShortName.trim();
          if (subj || tCode) {
            dayPeriods.push({
              period: pNum,
              subject: subj,
              teacherShortName: tCode,
            });
            totalPeriodsCount++;
          }
        });
        if (dayPeriods.length > 0) {
          schedulePayload[day] = dayPeriods;
        }
      });

      if (totalPeriodsCount === 0) {
        // Remove empty timetable doc cleanly if Principal cleared all periods
        await deleteDoc(doc(db, 'timetables', docId)).catch(() => {});
        setToastMessage(`Cleared timetable for Class ${editingClassNum}`);
      } else {
        const docPayload = cleanForFirestore({
          classId: String(editingClassNum),
          schedule: schedulePayload,
          updatedAt: new Date().toISOString(),
          updatedBy: user?.name || 'Principal',
        });

        await setDoc(doc(db, 'timetables', docId), docPayload);
        setToastMessage(`Saved Class ${editingClassNum} timetable to Firestore (${totalPeriodsCount} periods).`);
      }

      logAuditEvent({
        action: 'TIMETABLE_UPDATED',
        details: `Principal updated Master Timetable for Class ${editingClassNum} (${totalPeriodsCount} periods).`,
        currentUser: user,
        recordType: 'timetable',
        recordId: docId,
      }).catch(() => {});
    } catch (err: any) {
      console.error('Error saving timetable:', err);
      alert(`Failed to save timetable: ${err.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  // Datalist suggestions derived from live subjects & configured short code guide
  const subjectSuggestions = useMemo(() => {
    const names = new Set<string>();
    subjects.forEach(s => {
      if (s.nameEn) names.add(s.nameEn);
      if (s.nameMl && s.nameMl !== s.nameEn) names.add(s.nameMl);
    });
    return Array.from(names);
  }, [subjects]);

  const teacherShortSuggestions = useMemo(() => {
    const map = new Map<string, { code: string; name: string; note?: string }>();
    TEACHER_SHORT_CODE_GUIDE.forEach(entry => {
      map.set(entry.code, entry);
    });
    teachers.forEach(t => {
      const explicit = t.shortCode?.trim().toUpperCase();
      if (explicit && !map.has(explicit)) {
        map.set(explicit, { code: explicit, name: t.nameEn || t.name });
      }
    });
    return Array.from(map.values());
  }, [teachers]);

  const visibleDays = useMemo(() => {
    const baseDays =
      selectedClassFilter !== 'ALL'
        ? getWorkingDaysForClass(selectedClassFilter)
        : TIMETABLE_DAYS;
    if (selectedDayFilter === 'ALL') return baseDays;
    return baseDays.filter(d => d === selectedDayFilter);
  }, [selectedDayFilter, selectedClassFilter]);

  const visiblePeriodNumbers = useMemo(() => {
    return selectedClassFilter !== 'ALL'
      ? getPeriodNumbersForClass(selectedClassFilter)
      : ([1, 2, 3] as (1 | 2 | 3)[]);
  }, [selectedClassFilter]);

  const visibleClasses = useMemo(() => {
    return selectedClassFilter === 'ALL'
      ? [...TIMETABLE_CLASS_NUMBERS]
      : [selectedClassFilter];
  }, [selectedClassFilter]);

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 font-serif">
                Master Timetable Manager
              </h2>
              <p className="text-xs text-slate-500">
                Classes 1–9 Weekly Schedule · Live Firestore Sync (<code className="text-emerald-800 font-mono">timetables</code>)
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isEditing ? (
            <button
              type="button"
              onClick={() => openEditForClass(selectedClassFilter !== 'ALL' ? selectedClassFilter : '1')}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white text-xs sm:text-sm font-bold rounded-xl shadow-xs transition cursor-pointer"
            >
              <Edit3 className="w-4 h-4" />
              <span>Edit Timetable</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-bold rounded-xl transition cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>Back to Master View</span>
            </button>
          )}
        </div>
      </div>

      {/* Period Timings Reference Card */}
      <div className="bg-emerald-950 text-white rounded-2xl p-4 shadow-xs border border-emerald-900/60">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-emerald-200 text-xs font-bold uppercase tracking-wider">
            <Clock className="w-4 h-4 shrink-0" />
            <span>Official Madrasa Period Timings</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            <div className="bg-emerald-900/60 border border-emerald-800/70 rounded-xl px-3 py-2">
              <span className="font-bold text-amber-300 block mb-0.5">Mon, Tue, Wed, Thu & Sat</span>
              <span className="text-emerald-100 font-mono text-[11px]">
                P1: 06:45–07:15 &nbsp;|&nbsp; P2: 07:15–07:50 &nbsp;|&nbsp; P3: 07:50–08:25
              </span>
            </div>
            <div className="bg-emerald-900/60 border border-emerald-800/70 rounded-xl px-3 py-2">
              <span className="font-bold text-amber-300 block mb-0.5">Friday</span>
              <span className="text-emerald-100 font-mono text-[11px]">
                P1: 06:45–07:10 &nbsp;|&nbsp; P2: 07:10–07:40 &nbsp;|&nbsp; P3: 07:40–08:15
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-700 mx-auto mb-2" />
          <p className="text-xs text-slate-500 font-medium">Loading master timetable from Firestore...</p>
        </div>
      ) : isEditing ? (
        /* ======================== EDIT TIMETABLE MODE ======================== */
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
          {/* Class Selector Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900">
                Edit Class Timetable — Class {editingClassNum}
              </h3>
              <p className="text-[11px] text-slate-500">
                Document ID: <code className="font-mono text-emerald-800">timetables/class_{editingClassNum}</code> · Leave a period blank to omit it.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSaveClassTimetable}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-800 hover:bg-emerald-900 disabled:opacity-60 text-white text-xs sm:text-sm font-bold rounded-xl shadow-xs transition cursor-pointer"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{saving ? 'Saving...' : `Save Class ${editingClassNum} Timetable`}</span>
            </button>
          </div>

          {/* Class 1 - 9 Pills */}
          <div className="flex flex-wrap gap-1.5">
            {TIMETABLE_CLASS_NUMBERS.map(cNum => {
              const isSelected = editingClassNum === cNum;
              const hasDoc = Boolean(docsByClass[cNum] && hasAnyTimetableEntries([docsByClass[cNum]]));
              return (
                <button
                  key={cNum}
                  type="button"
                  onClick={() => handleSelectEditClass(cNum)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition border cursor-pointer flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-emerald-800 text-white border-emerald-800 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-emerald-50 hover:border-emerald-300'
                  }`}
                >
                  <span>Class {cNum}</span>
                  {hasDoc && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isSelected ? 'bg-amber-300' : 'bg-emerald-600'
                      }`}
                      title="Has saved timetable"
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Helper Notes: Short Code Mapping & Quick Copy */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs">
            <div className="lg:col-span-2 space-y-1.5">
              <div className="font-bold text-slate-800 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Teacher Short Code Guide</span>
                </span>
                {(editingClassNum === '8' || editingClassNum === '9') && (
                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold">
                    Class {editingClassNum}: 2 Periods (P1, P2) · {editingClassNum === '9' ? 'Mon / Wed / Fri' : 'Tue / Thu / Sat'}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {TEACHER_SHORT_CODE_GUIDE.map(entry => (
                  <span
                    key={entry.code}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-slate-200 text-[11px] text-slate-700"
                    title={entry.note}
                  >
                    <strong className="font-mono text-emerald-800">{entry.code}</strong>
                    <span>= {entry.name}</span>
                    {entry.note && (
                      <span className="text-[10px] text-slate-500">({entry.note})</span>
                    )}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-start lg:justify-end gap-2">
              <span className="text-[11px] font-semibold text-slate-600">Quick Copy:</span>
              <select
                value={copySourceDay}
                onChange={e => setCopySourceDay(e.target.value as TimetableDayName)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800"
              >
                {editableDays.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <span className="text-[10px] text-slate-500">Copy to any day row.</span>
            </div>
          </div>

          {/* Editable Grid Table */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className={`w-full text-left border-collapse ${editablePeriods.length === 2 ? 'min-w-[600px]' : 'min-w-[780px]'}`}>
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  <th className="p-3 w-40">Day & Timings</th>
                  {editablePeriods.map(pNum => (
                    <th key={pNum} className="p-3">Period {pNum}</th>
                  ))}
                  <th className="p-3 w-32 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {editableDays.map(day => {
                  const timings = getPeriodTimings(day).filter(t => editablePeriods.includes(t.period));
                  const isFriday = day === 'Friday';
                  return (
                    <tr key={day} className={isFriday ? 'bg-amber-50/40' : 'bg-white'}>
                      <td className="p-3 align-top">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <span>{day}</span>
                          {isFriday && (
                            <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-100 text-amber-800 rounded">
                              Friday Timing
                            </span>
                          )}
                        </div>
                        <div className="mt-1 space-y-0.5 text-[10px] font-mono text-slate-500">
                          {timings.map(t => (
                            <div key={t.period}>
                              P{t.period}: {t.label}
                            </div>
                          ))}
                        </div>
                      </td>

                      {editablePeriods.map(pNum => {
                        const timingLabel = timings.find(t => t.period === pNum)?.label || '';
                        const cell = editGrid[day][pNum];
                        return (
                          <td key={pNum} className="p-2.5 align-top">
                            <div className="space-y-1.5 bg-slate-50/80 p-2 rounded-lg border border-slate-200/80">
                              <div className="text-[10px] font-mono font-semibold text-emerald-800">
                                P{pNum} ({timingLabel})
                              </div>
                              <input
                                type="text"
                                list="timetable-subject-suggestions"
                                value={cell.subject}
                                onChange={e => handleCellChange(day, pNum, 'subject', e.target.value)}
                                placeholder="Subject (e.g. Quran)"
                                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 font-medium text-slate-900"
                              />
                              <input
                                type="text"
                                list="timetable-teacher-suggestions"
                                value={cell.teacherShortName}
                                onChange={e =>
                                  handleCellChange(day, pNum, 'teacherShortName', e.target.value)
                                }
                                placeholder="Teacher Code (e.g. YP, CH, VK)"
                                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 font-mono uppercase text-slate-800"
                              />
                            </div>
                          </td>
                        );
                      })}

                      <td className="p-3 align-top text-right">
                        <div className="flex flex-col items-end gap-1.5">
                          {copySourceDay !== day && (
                            <button
                              type="button"
                              onClick={() => handleCopyDayToSelected(day)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-200 cursor-pointer"
                            >
                              <Copy className="w-3 h-3" />
                              <span>Copy {copySourceDay.slice(0, 3)}</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleClearDay(day)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10px] font-bold border border-rose-200 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Clear</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <datalist id="timetable-subject-suggestions">
            {subjectSuggestions.map(s => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <datalist id="timetable-teacher-suggestions">
            {teacherShortSuggestions.map((t, idx) => (
              <option key={`${t.code}-${idx}`} value={t.code}>
                {t.name}
              </option>
            ))}
          </datalist>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveClassTimetable}
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2 bg-emerald-800 hover:bg-emerald-900 disabled:opacity-60 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{saving ? 'Saving...' : `Save Class ${editingClassNum} Timetable`}</span>
            </button>
          </div>
        </div>
      ) : !hasAnyData ? (
        /* ======================== EMPTY DB STATE ======================== */
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-3 shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto">
            <Calendar className="w-7 h-7" />
          </div>
          <h3 className="text-base sm:text-lg font-bold text-slate-900">
            Timetable not updated yet.
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            No class schedules have been saved to the database yet. Click Edit Timetable to add schedules for Classes 1 to 9.
          </p>
          <div className="pt-1">
            <button
              type="button"
              onClick={() => openEditForClass('1')}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white text-xs sm:text-sm font-bold rounded-xl shadow-xs transition cursor-pointer"
            >
              <Edit3 className="w-4 h-4" />
              <span>Edit Timetable</span>
            </button>
          </div>
        </div>
      ) : (
        /* ======================== MASTER VIEW (ALL CLASSES) ======================== */
        <div className="space-y-4">
          {/* Filters */}
          <div className="bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-4 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Day Filter */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">Day:</span>
              <button
                type="button"
                onClick={() => setSelectedDayFilter('ALL')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  selectedDayFilter === 'ALL'
                    ? 'bg-emerald-800 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Full Week
              </button>
              {TIMETABLE_DAYS.map(day => (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelectedDayFilter(day)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    selectedDayFilter === day
                      ? 'bg-emerald-800 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {day.slice(0, 3)}
                </button>
              ))}
            </div>

            {/* Class Filter */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Class:</span>
              <select
                value={selectedClassFilter}
                onChange={e => setSelectedClassFilter(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 text-xs font-bold text-slate-800"
              >
                <option value="ALL">All Classes (Class 1 – 9)</option>
                {TIMETABLE_CLASS_NUMBERS.map(cNum => (
                  <option key={cNum} value={cNum}>
                    Class {cNum}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Day-by-Day Master Grid across Classes 1-9 */}
          <div className="space-y-4">
            {visibleDays.map(day => {
              const timings = getPeriodTimings(day).filter(t => visiblePeriodNumbers.includes(t.period));
              const isFriday = day === 'Friday';

              return (
                <div
                  key={day}
                  className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden"
                >
                  <div
                    className={`px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 ${
                      isFriday ? 'bg-amber-50' : 'bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm sm:text-base font-bold text-slate-900">{day}</span>
                      {isFriday && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-200/80 text-amber-900">
                          Friday Schedule
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-mono text-slate-600">
                      {timings.map(t => `P${t.period}: ${t.label}`).join('  |  ')}
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className={`w-full text-left border-collapse ${visiblePeriodNumbers.length === 2 ? 'min-w-[480px]' : 'min-w-[640px]'}`}>
                      <thead>
                        <tr className="bg-slate-50/70 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                          <th className="p-3 w-32">Class</th>
                          {timings.map(t => (
                            <th key={t.period} className="p-3">
                              <div>Period {t.period}</div>
                              <div className="text-[10px] font-mono font-normal text-slate-500">
                                {t.label}
                              </div>
                            </th>
                          ))}
                          <th className="p-3 w-24 text-right">Edit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {visibleClasses.map(cNum => {
                          const docData = docsByClass[cNum];
                          const dayPeriods = docData?.schedule?.[day] || [];
                          const classWorkingDays = getWorkingDaysForClass(cNum);
                          const classAllowedPeriods = getPeriodNumbersForClass(cNum);
                          const isOffDayForClass = !classWorkingDays.includes(day);

                          return (
                            <tr key={cNum} className="hover:bg-slate-50/70 transition-colors">
                              <td className="p-3 font-bold text-slate-900">
                                Class {cNum}
                              </td>
                              {visiblePeriodNumbers.map(pNum => {
                                if (isOffDayForClass) {
                                  return (
                                    <td key={pNum} className="p-3">
                                      <span className="text-[11px] text-slate-400 italic">Off Day</span>
                                    </td>
                                  );
                                }
                                if (!classAllowedPeriods.includes(pNum)) {
                                  return (
                                    <td key={pNum} className="p-3">
                                      <span className="text-[11px] text-slate-300">—</span>
                                    </td>
                                  );
                                }
                                const entry = dayPeriods.find(p => p.period === pNum);
                                return (
                                  <td key={pNum} className="p-3">
                                    {entry && (entry.subject || entry.teacherShortName) ? (
                                      <div className="flex items-center justify-between gap-2 bg-emerald-50/60 border border-emerald-200/70 rounded-lg px-2.5 py-1.5">
                                        <span className="font-bold text-slate-900 flex items-center gap-1.5">
                                          <BookOpen className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                                          <span>{entry.subject || '—'}</span>
                                        </span>
                                        {entry.teacherShortName && (
                                          <span className="px-2 py-0.5 rounded bg-emerald-800 text-white font-mono text-[10px] font-bold shrink-0">
                                            {entry.teacherShortName}
                                          </span>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-slate-300 font-medium">—</span>
                                    )}
                                  </td>
                                );
                              })}
                              <td className="p-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => openEditForClass(cNum)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-emerald-100 text-slate-700 hover:text-emerald-900 text-[11px] font-bold transition cursor-pointer"
                                >
                                  <Edit3 className="w-3 h-3" />
                                  <span>Edit</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Note on Teacher Short Code Guide */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-[11px] text-slate-600 space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-slate-800">
              <Users className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
              <span>Teacher Short Code Guide</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {TEACHER_SHORT_CODE_GUIDE.map(entry => (
                <span
                  key={entry.code}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-slate-200 text-[10px] text-slate-700"
                >
                  <strong className="font-mono text-emerald-800">{entry.code}</strong>
                  <span>= {entry.name}</span>
                  {entry.note && <span className="text-slate-500">({entry.note})</span>}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
