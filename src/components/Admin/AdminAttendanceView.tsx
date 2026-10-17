import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../../services/firebase';
import { cleanForFirestore } from '../../services/firestoreSync';
import { collection, doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import {
  ClassItem,
  Student,
  ClassAttendanceConfig,
  DailyAttendanceRecord,
  InstitutionHoliday,
  sortStudentsBoysFirst,
} from '../../types';
import { logAuditEvent } from '../../services/auditLogger';
import {
  Calendar,
  CalendarDays,
  Check,
  X,
  Lock,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  AlertCircle,
  Save,
  CheckCheck,
  Edit3,
  Users,
} from 'lucide-react';

const formatLocalDate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const parseLocalDate = (dateStr: string): Date => {
  if (!dateStr) return new Date();
  const parts = dateStr.split('-');
  const y = parseInt(parts[0], 10) || new Date().getFullYear();
  const m = (parseInt(parts[1], 10) || (new Date().getMonth() + 1)) - 1;
  const d = parseInt(parts[2], 10) || new Date().getDate();
  return new Date(y, m, d);
};

const getWeekMondayStr = (baseDateStr: string): string => {
  const d = parseLocalDate(baseDateStr);
  if (isNaN(d.getTime())) return formatLocalDate(new Date());
  const day = d.getDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return formatLocalDate(d);
};

export const AdminAttendanceView: React.FC = () => {
  const { user, fetchWithAuth } = useAuth();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('class_1');
  const [students, setStudents] = useState<Student[]>([]);
  const [classAttendanceConfig, setClassAttendanceConfig] = useState<ClassAttendanceConfig | null>(null);
  const [attendanceMode, setAttendanceMode] = useState<'daily' | 'weekly'>('daily');
  const [todayStr] = useState<string>(() => formatLocalDate(new Date()));
  const [selectedDate, setSelectedDate] = useState<string>(() => formatLocalDate(new Date()));
  const [selectedWeekDate, setSelectedWeekDate] = useState<string>(() => formatLocalDate(new Date()));
  const [institutionHolidays, setInstitutionHolidays] = useState<Record<string, InstitutionHoliday>>({});
  const [holidayModalDate, setHolidayModalDate] = useState<string | null>(null);
  const [holidayReasonInput, setHolidayReasonInput] = useState<string>('');
  const [isSavingHoliday, setIsSavingHoliday] = useState(false);
  const [unlockedDates, setUnlockedDates] = useState<Record<string, boolean>>({});
  const [dailyStatusMap, setDailyStatusMap] = useState<Record<string, boolean>>({});
  const [weeklyStatusMap, setWeeklyStatusMap] = useState<Record<string, Record<string, boolean>>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load Classes and Students
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [cRes, sRes] = await Promise.all([
          fetchWithAuth('/api/classes'),
          fetchWithAuth('/api/students'),
        ]);
        if (cRes.ok && sRes.ok) {
          const cData = await cRes.json();
          const sData = await sRes.json();
          setClasses(cData);
          if (cData.length > 0 && !selectedClassId) {
            setSelectedClassId(cData[0].id);
          }
          setStudents(sData);
        }
      } catch (err) {
        console.warn('Error fetching classes/students in AdminAttendanceView:', err);
      }
    };
    loadInitialData();
  }, []);

  // Listen to institutionHolidays from Firestore
  useEffect(() => {
    let unsub: (() => void) | undefined;
    try {
      unsub = onSnapshot(
        collection(db, 'institutionHolidays'),
        snapshot => {
          const map: Record<string, InstitutionHoliday> = {};
          snapshot.docs.forEach(d => {
            const data = d.data();
            const date = data.date || d.id;
            map[date] = {
              id: d.id,
              date,
              reason: data.reason || 'Official Holiday / Non-Working Day',
              markedBy: data.markedBy || 'Principal',
              academicYear: data.academicYear || '2026-2027',
              createdAt: data.createdAt,
            };
          });
          setInstitutionHolidays(map);
        },
        err => console.warn('institutionHolidays listener error in AdminAttendanceView:', err)
      );
    } catch (e) {
      console.warn('Could not subscribe to institutionHolidays in AdminAttendanceView:', e);
    }
    return () => {
      if (unsub) unsub();
    };
  }, []);

  // Listen to Attendance Config for selected class
  useEffect(() => {
    if (!selectedClassId) return;

    let unsub: (() => void) | undefined;
    try {
      unsub = onSnapshot(
        doc(db, 'attendance', selectedClassId),
        docSnap => {
          if (docSnap.exists()) {
            const data = docSnap.data() as ClassAttendanceConfig;
            setClassAttendanceConfig(data);
          } else {
            // Default config
            setClassAttendanceConfig({
              classId: selectedClassId,
              totalWorkingDays: 88,
              studentDaysAttended: {},
              dailyRecords: {},
              updatedAt: new Date().toISOString(),
            });
          }
        },
        err => console.warn('Attendance listener error for class:', selectedClassId, err)
      );
    } catch (e) {
      console.warn('Could not listen to class attendance:', e);
    }
    return () => {
      if (unsub) unsub();
    };
  }, [selectedClassId]);

  const classStudents = sortStudentsBoysFirst(
    students.filter(s => s.classId === selectedClassId && s.status === 'active')
  );

  const selectedClass = classes.find(c => c.id === selectedClassId);

  // Sync dailyStatusMap from record or default
  useEffect(() => {
    if (!selectedClassId || !selectedDate) return;
    const rec = classAttendanceConfig?.dailyRecords?.[selectedDate];
    const initialMap: Record<string, boolean> = {};

    classStudents.forEach(st => {
      if (rec) {
        if (rec.statusMap && typeof rec.statusMap[st.id] === 'boolean') {
          initialMap[st.id] = rec.statusMap[st.id];
        } else if (Array.isArray(rec.presentStudentIds)) {
          initialMap[st.id] = rec.presentStudentIds.includes(st.id);
        } else {
          initialMap[st.id] = true;
        }
      } else {
        initialMap[st.id] = true; // Default present
      }
    });
    setDailyStatusMap(initialMap);
  }, [selectedClassId, selectedDate, classAttendanceConfig, students]);

  // Week days generator
  const getWeekDays = (baseDateStr: string) => {
    const mondayStr = getWeekMondayStr(baseDateStr);
    const monday = parseLocalDate(mondayStr);
    const days: { dateStr: string; dayName: string; shortDate: string }[] = [];
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (let i = 0; i < 6; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const ds = formatLocalDate(d);
      days.push({
        dateStr: ds,
        dayName: dayNames[i],
        shortDate: d.toLocaleDateString([], { month: 'short', day: 'numeric' }),
      });
    }
    return days;
  };

  const weekDays = getWeekDays(selectedWeekDate);

  // Sync weeklyStatusMap
  useEffect(() => {
    if (!selectedClassId) return;
    const map: Record<string, Record<string, boolean>> = {};

    classStudents.forEach(st => {
      map[st.id] = {};
      weekDays.forEach(w => {
        const rec = classAttendanceConfig?.dailyRecords?.[w.dateStr];
        if (rec) {
          if (rec.statusMap && typeof rec.statusMap[st.id] === 'boolean') {
            map[st.id][w.dateStr] = rec.statusMap[st.id];
          } else if (Array.isArray(rec.presentStudentIds)) {
            map[st.id][w.dateStr] = rec.presentStudentIds.includes(st.id);
          } else {
            map[st.id][w.dateStr] = true;
          }
        } else {
          map[st.id][w.dateStr] = true;
        }
      });
    });
    setWeeklyStatusMap(map);
  }, [selectedClassId, selectedWeekDate, classAttendanceConfig, students]);

  const isDateHoliday = (dateStr: string): boolean => {
    if (institutionHolidays[dateStr]) return true;
    if (classAttendanceConfig?.dailyRecords?.[dateStr]?.isHoliday) return true;
    return false;
  };

  const getHolidayInfo = (dateStr: string): InstitutionHoliday | null => {
    if (institutionHolidays[dateStr]) return institutionHolidays[dateStr];
    const rec = classAttendanceConfig?.dailyRecords?.[dateStr];
    if (rec?.isHoliday) {
      return {
        id: dateStr,
        date: dateStr,
        reason: rec.holidayReason || 'Official Holiday / Non-Working Day',
        markedBy: rec.markedBy || 'Principal',
        academicYear: '2026-2027',
      };
    }
    return null;
  };

  const isDateLocked = (dateStr: string): boolean => {
    if (isDateHoliday(dateStr)) return true; // Holidays locked against checkbox editing
    if (dateStr > todayStr) return true; // Future dates locked
    if (unlockedDates[dateStr]) return false; // Unlocked by user
    return Boolean(classAttendanceConfig?.dailyRecords?.[dateStr]); // Locked if recorded
  };

  const handleOpenMarkHoliday = (dateStr: string) => {
    setHolidayModalDate(dateStr);
    const existing = getHolidayInfo(dateStr);
    setHolidayReasonInput(existing?.reason || '');
  };

  const handleConfirmMarkHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!holidayModalDate) return;
    setIsSavingHoliday(true);
    try {
      const reason = holidayReasonInput.trim() || 'Official Holiday / Non-Working Day';
      const holidayData: InstitutionHoliday = {
        id: holidayModalDate,
        date: holidayModalDate,
        reason,
        markedBy: user?.name || 'Principal ASLAM TK',
        markedAt: new Date().toISOString(),
        academicYear: '2026-2027',
        createdAt: new Date().toISOString(),
      };

      // 1. Direct write to Firestore 'institutionHolidays'
      await setDoc(doc(db, 'institutionHolidays', holidayModalDate), cleanForFirestore(holidayData), { merge: true });

      // 2. Update local state
      setInstitutionHolidays(prev => ({
        ...prev,
        [holidayModalDate]: holidayData,
      }));

      // 3. Update classAttendanceConfig.dailyRecords with isHoliday
      if (selectedClassId) {
        const updatedDailyRecords = {
          ...(classAttendanceConfig?.dailyRecords || {}),
          [holidayModalDate]: {
            date: holidayModalDate,
            presentStudentIds: [],
            absentStudentIds: [],
            statusMap: {},
            isHoliday: true,
            holidayReason: reason,
            markedAt: new Date().toISOString(),
            markedBy: user?.name || 'Principal ASLAM TK',
          },
        };

        const totalHolidays = Object.keys(updatedDailyRecords).filter(
          k => updatedDailyRecords[k]?.isHoliday || institutionHolidays[k] || k === holidayModalDate
        ).length;
        const totalWorking = Math.max(1, (classAttendanceConfig?.totalWorkingDays || 88) - totalHolidays);

        const updatedConfig: ClassAttendanceConfig = {
          classId: selectedClassId,
          totalWorkingDays: totalWorking,
          studentDaysAttended: classAttendanceConfig?.studentDaysAttended || {},
          dailyRecords: updatedDailyRecords,
          updatedAt: new Date().toISOString(),
        };

        await setDoc(doc(db, 'attendance', selectedClassId), cleanForFirestore(updatedConfig), { merge: true });
        setClassAttendanceConfig(updatedConfig);
      }

      // 4. Update local API
      await fetchWithAuth('/api/institution-holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(holidayData),
      });

      // 5. Trigger immutable audit log
      logAuditEvent({
        action: 'HOLIDAY_MARKED',
        details: `Principal ${user?.name || 'ASLAM TK'} officially declared ${holidayModalDate} as Holiday ("${reason}").`,
        currentUser: user,
        recordType: 'institution_holiday',
        recordId: holidayModalDate,
      }).catch(e => console.warn('Audit log error:', e));

      setHolidayModalDate(null);
      alert(`Date ${holidayModalDate} officially designated as Holiday ("${reason}"). Working days and attendance percentages are safeguarded without penalty.`);
    } catch (err: any) {
      alert('Failed to mark holiday: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSavingHoliday(false);
    }
  };

  const handleRemoveHoliday = async (dateStr: string) => {
    const confirm = window.confirm(
      `Restore date ${dateStr} as a regular working day? This will remove the holiday exemption banner.`
    );
    if (!confirm) return;

    try {
      await deleteDoc(doc(db, 'institutionHolidays', dateStr));
      setInstitutionHolidays(prev => {
        const copy = { ...prev };
        delete copy[dateStr];
        return copy;
      });

      if (selectedClassId && classAttendanceConfig?.dailyRecords?.[dateStr]?.isHoliday) {
        const updatedDailyRecords = { ...(classAttendanceConfig.dailyRecords || {}) };
        delete updatedDailyRecords[dateStr];

        const totalHolidays = Object.keys(updatedDailyRecords).filter(
          k => (updatedDailyRecords[k]?.isHoliday || institutionHolidays[k]) && k !== dateStr
        ).length;
        const totalWorking = Math.max(1, 88 - totalHolidays);

        const updatedConfig: ClassAttendanceConfig = {
          ...classAttendanceConfig,
          totalWorkingDays: totalWorking,
          dailyRecords: updatedDailyRecords,
          updatedAt: new Date().toISOString(),
        };

        await setDoc(doc(db, 'attendance', selectedClassId), cleanForFirestore(updatedConfig), { merge: true });
        setClassAttendanceConfig(updatedConfig);
      }

      await fetchWithAuth(`/api/institution-holidays?date=${dateStr}`, { method: 'DELETE' });

      alert(`Holiday designation removed for ${dateStr}. Restored to normal working day.`);
    } catch (err: any) {
      alert('Failed to remove holiday: ' + (err.message || 'Unknown error'));
    }
  };

  const toggleDailyStudent = (studentId: string) => {
    if (isDateLocked(selectedDate)) return;
    setDailyStatusMap(prev => ({
      ...prev,
      [studentId]: !prev[studentId],
    }));
  };

  const markAllDailyPresent = () => {
    if (isDateLocked(selectedDate)) return;
    const m: Record<string, boolean> = {};
    classStudents.forEach(s => {
      m[s.id] = true;
    });
    setDailyStatusMap(m);
  };

  const markAllDailyAbsent = () => {
    if (isDateLocked(selectedDate)) return;
    const m: Record<string, boolean> = {};
    classStudents.forEach(s => {
      m[s.id] = false;
    });
    setDailyStatusMap(m);
  };

  const handleSaveDaily = async () => {
    if (!selectedClassId || !selectedDate) return;
    setIsSaving(true);
    try {
      const presentStudentIds: string[] = [];
      const absentStudentIds: string[] = [];
      classStudents.forEach(st => {
        if (dailyStatusMap[st.id] !== false) {
          presentStudentIds.push(st.id);
        } else {
          absentStudentIds.push(st.id);
        }
      });

      const isHoliday = isDateHoliday(selectedDate);
      const holInfo = getHolidayInfo(selectedDate);

      const dailyRecord: DailyAttendanceRecord = {
        date: selectedDate,
        presentStudentIds: isHoliday ? [] : presentStudentIds,
        absentStudentIds: isHoliday ? [] : absentStudentIds,
        statusMap: isHoliday ? {} : dailyStatusMap,
        isHoliday,
        holidayReason: isHoliday ? (holInfo?.reason || 'Non-Working Day') : undefined,
        markedAt: new Date().toISOString(),
        markedBy: user?.name || 'Principal ASLAM TK',
      };

      const updatedDailyRecords = {
        ...(classAttendanceConfig?.dailyRecords || {}),
        [selectedDate]: dailyRecord,
      };

      // Recalculate working days strictly excluding holidays
      const totalHolidays = Object.keys(updatedDailyRecords).filter(
        dKey => updatedDailyRecords[dKey]?.isHoliday || institutionHolidays[dKey]
      ).length;
      const totalWorking = Math.max(1, 88 - totalHolidays);

      // Recalculate student days attended
      const updatedDaysAttended: Record<string, number> = {};
      classStudents.forEach(st => {
        let attended = 0;
        Object.entries(updatedDailyRecords).forEach(([dKey, rec]) => {
          const isHol = rec?.isHoliday || institutionHolidays[dKey];
          if (!isHol && rec?.presentStudentIds?.includes(st.id)) {
            attended++;
          }
        });
        updatedDaysAttended[st.id] = attended;
      });

      const updatedConfig: ClassAttendanceConfig = {
        classId: selectedClassId,
        totalWorkingDays: totalWorking,
        studentDaysAttended: updatedDaysAttended,
        dailyRecords: updatedDailyRecords,
        updatedAt: new Date().toISOString(),
      };

      // 1. Direct Firestore write
      await setDoc(doc(db, 'attendance', selectedClassId), cleanForFirestore(updatedConfig), { merge: true });

      // 2. Also update student documents in Firestore
      for (const st of classStudents) {
        try {
          await setDoc(
            doc(db, 'students', st.id),
            cleanForFirestore({
              attendance: {
                daysAttended: updatedDaysAttended[st.id],
                totalWorkingDays: totalWorking,
              },
            }),
            { merge: true }
          );
        } catch {}
      }

      // 3. API endpoint call
      await fetchWithAuth(`/api/attendance/class/${selectedClassId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedConfig),
      });

      // 4. Audit Log
      logAuditEvent({
        action: 'ATTENDANCE_MARKED',
        details: `Principal ${user?.name || 'ASLAM TK'} marked attendance for Class ${selectedClass?.name || selectedClassId} on ${selectedDate}.`,
        currentUser: user,
        recordType: 'attendance',
        recordId: `${selectedClassId}_${selectedDate}`,
      }).catch(e => console.warn('Audit log error:', e));

      setClassAttendanceConfig(updatedConfig);
      setUnlockedDates(prev => ({ ...prev, [selectedDate]: false }));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      alert('Failed to save attendance: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveWeekly = async () => {
    if (!selectedClassId) return;
    setIsSaving(true);
    try {
      const updatedDailyRecords = { ...(classAttendanceConfig?.dailyRecords || {}) };

      weekDays.forEach(w => {
        if (w.dateStr <= todayStr) {
          const isHol = isDateHoliday(w.dateStr);
          const holInfo = getHolidayInfo(w.dateStr);
          const pIds: string[] = [];
          const aIds: string[] = [];
          const sMap: Record<string, boolean> = {};

          classStudents.forEach(st => {
            const isPres = weeklyStatusMap[st.id]?.[w.dateStr] !== false;
            sMap[st.id] = isPres;
            if (isPres) pIds.push(st.id);
            else aIds.push(st.id);
          });

          updatedDailyRecords[w.dateStr] = {
            date: w.dateStr,
            presentStudentIds: isHol ? [] : pIds,
            absentStudentIds: isHol ? [] : aIds,
            statusMap: isHol ? {} : sMap,
            isHoliday: isHol,
            holidayReason: isHol ? (holInfo?.reason || 'Non-Working Day') : undefined,
            markedAt: new Date().toISOString(),
            markedBy: user?.name || 'Principal ASLAM TK',
          };
        }
      });

      const totalHolidays = Object.keys(updatedDailyRecords).filter(
        dKey => updatedDailyRecords[dKey]?.isHoliday || institutionHolidays[dKey]
      ).length;
      const totalWorking = Math.max(1, 88 - totalHolidays);

      const updatedDaysAttended: Record<string, number> = {};
      classStudents.forEach(st => {
        let attended = 0;
        Object.entries(updatedDailyRecords).forEach(([dKey, rec]) => {
          const isHol = rec?.isHoliday || institutionHolidays[dKey];
          if (!isHol && rec?.presentStudentIds?.includes(st.id)) {
            attended++;
          }
        });
        updatedDaysAttended[st.id] = attended;
      });

      const updatedConfig: ClassAttendanceConfig = {
        classId: selectedClassId,
        totalWorkingDays: totalWorking,
        studentDaysAttended: updatedDaysAttended,
        dailyRecords: updatedDailyRecords,
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'attendance', selectedClassId), cleanForFirestore(updatedConfig), { merge: true });

      for (const st of classStudents) {
        try {
          await setDoc(
            doc(db, 'students', st.id),
            cleanForFirestore({
              attendance: {
                daysAttended: updatedDaysAttended[st.id],
                totalWorkingDays: totalWorking,
              },
            }),
            { merge: true }
          );
        } catch {}
      }

      await fetchWithAuth(`/api/attendance/class/${selectedClassId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedConfig),
      });

      logAuditEvent({
        action: 'ATTENDANCE_MARKED',
        details: `Principal ${user?.name || 'ASLAM TK'} saved weekly attendance for Class ${selectedClass?.name || selectedClassId} (Week of ${selectedWeekDate}).`,
        currentUser: user,
        recordType: 'attendance',
        recordId: `${selectedClassId}_week_${selectedWeekDate}`,
      }).catch(e => console.warn('Audit log error:', e));

      setClassAttendanceConfig(updatedConfig);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      alert('Failed to save weekly attendance: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  const isDailyHoliday = isDateHoliday(selectedDate);
  const dailyHolidayInfo = getHolidayInfo(selectedDate);
  const isDailyLocked = isDateLocked(selectedDate);
  const isDailyEditing = classAttendanceConfig?.dailyRecords?.[selectedDate] && unlockedDates[selectedDate];

  let dailyPresentCount = 0;
  let dailyAbsentCount = 0;
  classStudents.forEach(s => {
    if (dailyStatusMap[s.id] !== false) dailyPresentCount++;
    else dailyAbsentCount++;
  });
  const dailyPercentage = classStudents.length > 0
    ? Math.round((dailyPresentCount / classStudents.length) * 100)
    : 100;

  return (
    <div className="space-y-6">
      {/* Top Banner and Class Selection */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900">Institution Attendance &amp; Holiday Management</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
              Principal Console
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Designate non-working days &amp; official holidays. Marked holidays are automatically excluded from working days and percentages across all portals.
          </p>
        </div>

        {/* Class Selection Dropdown */}
        <div className="flex items-center gap-3">
          <label className="text-xs font-bold text-slate-600">Select Class:</label>
          <select
            value={selectedClassId}
            onChange={e => setSelectedClassId(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700"
          >
            {classes.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
            Cloud Sync Active
          </span>
        </div>
      </div>

      {/* Mode Toggle: Daily vs Weekly */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-bold">
          <button
            type="button"
            onClick={() => setAttendanceMode('daily')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg transition cursor-pointer ${
              attendanceMode === 'daily'
                ? 'bg-emerald-800 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Daily Attendance</span>
          </button>
          <button
            type="button"
            onClick={() => setAttendanceMode('weekly')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg transition cursor-pointer ${
              attendanceMode === 'weekly'
                ? 'bg-emerald-800 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CalendarDays className="w-4 h-4" />
            <span>Weekly Attendance Grid</span>
          </button>
        </div>

        {saveSuccess && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
            <CheckCheck className="w-4 h-4 text-emerald-700" />
            <span>Attendance &amp; Holidays Synced Live with Parent Portal!</span>
          </div>
        )}
      </div>

      {/* VIEW 1: DAILY ATTENDANCE */}
      {attendanceMode === 'daily' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {/* Date Navigators */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    const d = parseLocalDate(selectedDate);
                    d.setDate(d.getDate() - 1);
                    setSelectedDate(formatLocalDate(d));
                  }}
                  className="p-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer"
                  title="Previous Day"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5">
                  <Calendar className="w-4 h-4 text-slate-500" />
                  <input
                    type="date"
                    value={selectedDate}
                    max={todayStr}
                    onChange={e => e.target.value && setSelectedDate(e.target.value)}
                    className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const d = parseLocalDate(selectedDate);
                    d.setDate(d.getDate() + 1);
                    const nextStr = formatLocalDate(d);
                    if (nextStr <= todayStr) setSelectedDate(nextStr);
                  }}
                  disabled={selectedDate >= todayStr}
                  className={`p-2 rounded-xl border border-slate-200 transition ${
                    selectedDate >= todayStr
                      ? 'bg-slate-100 text-slate-300 opacity-40 cursor-not-allowed'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer'
                  }`}
                  title="Next Day"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedDate(todayStr)}
                  disabled={selectedDate === todayStr}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-200 transition ${
                    selectedDate === todayStr
                      ? 'bg-slate-100 text-slate-400 cursor-default'
                      : 'bg-white hover:bg-slate-50 text-slate-700 cursor-pointer'
                  }`}
                >
                  Today
                </button>
              </div>

              {/* Status Indicator */}
              <div>
                {isDailyHoliday ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-950 border border-amber-300">
                    <span>🏖️</span>
                    <span>Official Holiday: {dailyHolidayInfo?.reason || 'Non-Working Day'}</span>
                  </span>
                ) : isDailyLocked ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-700" />
                    Attendance Marked &amp; Locked
                  </span>
                ) : isDailyEditing ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                    <Edit3 className="w-3.5 h-3.5 text-amber-700" />
                    Unlocked for Editing
                  </span>
                ) : (
                  <span className="text-xs text-slate-500 font-medium">
                    Open for Marking · Click Save Attendance when complete
                  </span>
                )}
              </div>
            </div>

            {/* Action Buttons Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Clear Holiday Toggle Button */}
                {isDailyHoliday ? (
                  <button
                    type="button"
                    onClick={() => handleRemoveHoliday(selectedDate)}
                    className="px-3.5 py-2 text-xs font-bold rounded-xl border border-amber-300 bg-amber-100 hover:bg-amber-200 text-amber-950 transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <span>🏖️</span>
                    <span>Restore Regular Working Day</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleOpenMarkHoliday(selectedDate)}
                    className="px-3.5 py-2 text-xs font-bold rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-950 transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <span>🏖️</span>
                    <span>Mark as Holiday / Non-Working Day</span>
                  </button>
                )}

                {!isDailyHoliday && (
                  <>
                    <button
                      type="button"
                      onClick={markAllDailyPresent}
                      disabled={isDailyLocked}
                      className="px-3 py-1.5 text-xs font-bold rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Mark All Present
                    </button>
                    <button
                      type="button"
                      onClick={markAllDailyAbsent}
                      disabled={isDailyLocked}
                      className="px-3 py-1.5 text-xs font-bold rounded-xl border border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100 transition flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <X className="w-3.5 h-3.5" />
                      Mark All Absent
                    </button>
                  </>
                )}
              </div>

              {/* Counters & Save Action */}
              <div className="flex items-center gap-3 flex-wrap">
                {isDailyHoliday ? (
                  <div className="px-3 py-1.5 rounded-xl bg-amber-50 text-amber-950 border border-amber-200 text-xs font-bold flex items-center gap-1.5">
                    <span>🏖️</span>
                    <span>Working Day Exempt · Total Days Safeguarded</span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-xs font-mono font-bold">
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-200">
                        Present: {dailyPresentCount} / {classStudents.length} ({dailyPercentage}%)
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-900 border border-rose-200">
                        Absent: {dailyAbsentCount}
                      </span>
                    </div>

                    {isDailyLocked ? (
                      <button
                        type="button"
                        onClick={() => setUnlockedDates(prev => ({ ...prev, [selectedDate]: true }))}
                        className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 rounded-xl transition border border-slate-300 shadow-2xs cursor-pointer"
                      >
                        <Lock className="w-3.5 h-3.5 text-emerald-700" />
                        <span>Unlock to Edit</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleSaveDaily}
                        disabled={isSaving}
                        className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition shadow-xs disabled:opacity-50 cursor-pointer"
                      >
                        <Save className="w-4 h-4" />
                        <span>{isSaving ? 'Saving...' : 'Save Attendance'}</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Prominent Friendly Banner Across Daily View on Holiday */}
          {isDailyHoliday && (
            <div className="bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 rounded-2xl border-2 border-amber-300 p-6 text-center space-y-3 shadow-xs">
              <div className="w-12 h-12 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center text-2xl mx-auto shadow-2xs">
                🏖️
              </div>
              <div>
                <h4 className="text-base font-bold text-amber-950">
                  🏖️ Official Holiday / Non-Working Day
                </h4>
                <div className="inline-block mt-1 px-3 py-1 bg-amber-200 text-amber-950 text-xs font-bold rounded-lg border border-amber-300">
                  {dailyHolidayInfo?.reason || 'Official Holiday / Non-Working Day'}
                </div>
              </div>
              <p className="text-xs text-amber-900 max-w-lg mx-auto leading-relaxed">
                Madrasa is officially closed on <strong>{selectedDate}</strong>.
                Student attendance is strictly exempt and no student is marked absent.
                Total working days automatically exclude this date so student percentages remain completely unpenalized.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => handleRemoveHoliday(selectedDate)}
                  className="px-4 py-2 text-xs font-bold text-amber-950 bg-white hover:bg-amber-100 border border-amber-300 rounded-xl transition cursor-pointer shadow-2xs"
                >
                  Remove Holiday &amp; Restore Regular Working Day
                </button>
              </div>
            </div>
          )}

          {/* Student Daily List */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-700">
                Enrolled Students in {selectedClass?.name} ({classStudents.length})
              </span>
              <span className="text-[11px] text-slate-400">
                {isDailyHoliday
                  ? '🏖️ Official Holiday: Checkboxes disabled, attendance exempt.'
                  : isDailyLocked
                  ? 'Locked. Click "Unlock to Edit" above to make authorized changes.'
                  : 'Click anywhere on student row or button to toggle status'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {classStudents.map(st => {
                const isPresent = dailyStatusMap[st.id] !== false;

                return (
                  <div
                    key={st.id}
                    onClick={() => !isDailyLocked && !isDailyHoliday && toggleDailyStudent(st.id)}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all select-none ${
                      isDailyHoliday
                        ? 'bg-amber-50/40 border-amber-200 cursor-default opacity-85'
                        : isDailyLocked
                        ? 'cursor-default'
                        : 'cursor-pointer hover:bg-slate-50'
                    } ${
                      !isDailyHoliday && (isPresent
                        ? 'bg-emerald-50/40 border-emerald-200'
                        : 'bg-rose-50/40 border-rose-200')
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-8 h-8 rounded-lg bg-white border border-slate-200 font-mono font-bold text-xs flex items-center justify-center shrink-0 text-slate-700 shadow-2xs">
                        {st.rollNo}
                      </span>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 text-sm truncate flex items-center gap-1.5">
                          <span className="whitespace-nowrap">{st.nameEn}</span>
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                              st.gender === 'F' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'
                            }`}
                          >
                            {st.gender || 'M'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 whitespace-nowrap">
                          Adm: <span className="font-mono font-bold text-slate-700">{st.admissionNo}</span>
                          {st.nameMl && <span className="ml-2 text-slate-500 font-ml">{st.nameMl}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isDailyHoliday ? (
                        <span className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-amber-100 text-amber-950 border border-amber-300">
                          🏖️ Exempt (Holiday)
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={isDailyLocked || isDailyHoliday}
                          onClick={e => {
                            e.stopPropagation();
                            if (!isDailyLocked && !isDailyHoliday) toggleDailyStudent(st.id);
                          }}
                          className={`min-h-10 min-w-10 w-10 h-10 rounded-xl flex items-center justify-center transition-all border ${
                            isDailyLocked
                              ? isPresent
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300 opacity-90'
                                : 'bg-rose-100 text-rose-800 border-rose-300 opacity-90'
                              : isPresent
                              ? 'bg-emerald-700 text-white border-emerald-800 shadow-2xs cursor-pointer'
                              : 'bg-white text-rose-600 border-rose-300 cursor-pointer'
                          }`}
                        >
                          {isPresent ? (
                            <Check className="w-5 h-5 stroke-[3]" />
                          ) : (
                            <X className="w-5 h-5 stroke-[3]" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: WEEKLY ATTENDANCE GRID */}
      {attendanceMode === 'weekly' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  const monday = parseLocalDate(getWeekMondayStr(selectedWeekDate));
                  monday.setDate(monday.getDate() - 7);
                  setSelectedWeekDate(formatLocalDate(monday));
                }}
                className="p-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer"
                title="Previous Week"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="text-xs font-bold bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800">
                Week: {weekDays[0]?.shortDate || ''} – {weekDays[5]?.shortDate || ''}
              </span>

              <button
                type="button"
                onClick={() => {
                  const monday = parseLocalDate(getWeekMondayStr(selectedWeekDate));
                  monday.setDate(monday.getDate() + 7);
                  setSelectedWeekDate(formatLocalDate(monday));
                }}
                className="p-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer"
                title="Next Week"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setSelectedWeekDate(todayStr)}
                className="px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer"
              >
                Current Week
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleOpenMarkHoliday(selectedDate || todayStr)}
                className="px-3.5 py-2 text-xs font-bold rounded-xl bg-amber-50 text-amber-950 border border-amber-300 hover:bg-amber-100 transition cursor-pointer flex items-center gap-1.5"
              >
                <span>🏖️</span>
                <span>Mark Holiday</span>
              </button>

              <button
                type="button"
                onClick={handleSaveWeekly}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition shadow-xs disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Saving...' : 'Save Weekly'}</span>
              </button>
            </div>
          </div>

          {/* Weekly Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-xs min-w-[780px]">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <th className="py-3 px-3 text-center w-12 font-mono">Roll</th>
                    <th className="py-3 px-4 min-w-[160px]">Student Name</th>
                    {weekDays.map(d => {
                      const isFuture = d.dateStr > todayStr;
                      const isDayHoliday = isDateHoliday(d.dateStr);
                      const holInfo = getHolidayInfo(d.dateStr);

                      return (
                        <th
                          key={d.dateStr}
                          className={`py-3 px-2 text-center min-w-[80px] ${
                            isDayHoliday
                              ? 'bg-amber-100 text-amber-950 border-b-2 border-amber-300'
                              : isFuture
                              ? 'bg-slate-100/70 text-slate-400'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-[11px] font-bold">{d.dayName}</span>
                            {isDayHoliday && <span>🏖️</span>}
                            {isFuture && <Lock className="w-3 h-3 text-slate-400" />}
                          </div>
                          <div className="text-[10px] font-mono text-slate-500">{d.shortDate}</div>

                          <div className="mt-1">
                            {isDayHoliday ? (
                              <div className="space-y-0.5">
                                <span
                                  className="inline-block text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-200 text-amber-950 truncate max-w-[74px]"
                                  title={holInfo?.reason}
                                >
                                  {holInfo?.reason || 'Holiday'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveHoliday(d.dateStr)}
                                  className="text-[9px] text-amber-950 hover:underline font-bold cursor-pointer block mx-auto"
                                >
                                  Restore
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenMarkHoliday(d.dateStr)}
                                className="text-[9px] text-amber-800 hover:text-amber-950 underline font-medium cursor-pointer"
                              >
                                🏖️ Holiday
                              </button>
                            )}
                          </div>
                        </th>
                      );
                    })}
                    <th className="py-3 px-3 text-center min-w-[80px]">Week Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {classStudents.map(st => {
                    const studentWeek = weeklyStatusMap[st.id] || {};
                    const elapsedWorkingDays = weekDays.filter(d => d.dateStr <= todayStr && !isDateHoliday(d.dateStr));
                    let weekPresentCount = 0;
                    elapsedWorkingDays.forEach(d => {
                      if (studentWeek[d.dateStr] !== false) weekPresentCount++;
                    });

                    return (
                      <tr key={st.id} className="hover:bg-slate-50">
                        <td className="py-3 px-3 text-center font-mono font-bold text-slate-600">
                          {st.rollNo}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-bold text-slate-900">{st.nameEn}</div>
                          {st.nameMl && <div className="text-[11px] text-slate-500 font-ml leading-tight">{st.nameMl}</div>}
                          <div className="text-[10px] text-slate-500 font-mono">Adm: {st.admissionNo}</div>
                        </td>

                        {weekDays.map(d => {
                          const isFuture = d.dateStr > todayStr;
                          const isDayHoliday = isDateHoliday(d.dateStr);
                          const holInfo = getHolidayInfo(d.dateStr);
                          const isPres = studentWeek[d.dateStr] !== false;

                          if (isDayHoliday) {
                            return (
                              <td key={d.dateStr} className="py-2 px-1.5 text-center bg-amber-50/40">
                                <div
                                  className="min-h-10 min-w-10 w-10 h-10 rounded-xl mx-auto flex flex-col items-center justify-center border border-amber-200 bg-amber-100/70 text-amber-900 text-[10px] font-bold select-none cursor-not-allowed"
                                  title={`Official Holiday: ${holInfo?.reason || 'Non-working day'}. Attendance exempt.`}
                                >
                                  <span className="text-xs">🏖️</span>
                                  <span className="text-[8px] font-bold uppercase">OFF</span>
                                </div>
                              </td>
                            );
                          }

                          if (isFuture) {
                            return (
                              <td key={d.dateStr} className="py-2 px-1.5 text-center bg-slate-50/50">
                                <div
                                  className="min-h-10 min-w-10 w-10 h-10 rounded-xl mx-auto flex items-center justify-center border border-slate-200 bg-slate-100 text-slate-400 opacity-40 cursor-not-allowed"
                                  title="Future date locked"
                                >
                                  <Lock className="w-3.5 h-3.5" />
                                </div>
                              </td>
                            );
                          }

                          return (
                            <td key={d.dateStr} className="py-2 px-1.5 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  setWeeklyStatusMap(prev => ({
                                    ...prev,
                                    [st.id]: {
                                      ...(prev[st.id] || {}),
                                      [d.dateStr]: !isPres,
                                    },
                                  }));
                                }}
                                className={`min-h-10 min-w-10 w-10 h-10 rounded-xl mx-auto flex items-center justify-center transition-all border cursor-pointer ${
                                  isPres
                                    ? 'bg-emerald-700 text-white border-emerald-800 shadow-2xs'
                                    : 'bg-white text-rose-600 border-rose-300'
                                }`}
                              >
                                {isPres ? <Check className="w-4 h-4 stroke-[3]" /> : <X className="w-4 h-4 stroke-[3]" />}
                              </button>
                            </td>
                          );
                        })}

                        <td className="py-3 px-3 text-center font-mono font-bold text-slate-700">
                          {weekPresentCount} / {elapsedWorkingDays.length}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* HOLIDAY DESIGNATION MODAL */}
      {holidayModalDate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-amber-100 border border-amber-300 flex items-center justify-center text-lg">
                  🏖️
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Designate Institution Holiday
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    Date: {holidayModalDate}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setHolidayModalDate(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmMarkHoliday} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Holiday Reason / Title (Optional)
                </label>
                <input
                  type="text"
                  value={holidayReasonInput}
                  onChange={e => setHolidayReasonInput(e.target.value)}
                  placeholder="e.g. Friday Holiday, Eid, Milad-un-Nabi, Study Leave"
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Quick Preset Suggestion Buttons */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-slate-500">Quick Suggestions:</span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Friday Holiday',
                    'Eid Holiday',
                    'Milad-un-Nabi',
                    'Study Leave',
                    'Ramadan Break',
                    'Public Holiday',
                    'Monsoon Leave',
                  ].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setHolidayReasonInput(preset)}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition cursor-pointer ${
                        holidayReasonInput === preset
                          ? 'bg-amber-100 text-amber-950 border-amber-400 font-bold'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Safeguard Notice */}
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-950 space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <span>🛡️</span>
                  <span>Attendance Safeguard Active</span>
                </div>
                <p className="text-[11px] text-amber-900 leading-relaxed">
                  Marking this date will subtract 1 day from the class working days count (`actualWorkingDays = totalCalendarDays - markedHolidaysCount`). Students are NOT penalized as absent.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setHolidayModalDate(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingHoliday}
                  className="px-5 py-2 text-xs font-bold text-amber-950 bg-amber-300 hover:bg-amber-400 border border-amber-400 rounded-xl transition shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isSavingHoliday ? 'Designating...' : 'Confirm Holiday'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
