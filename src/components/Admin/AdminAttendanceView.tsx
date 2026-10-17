import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../services/firebase';
import { cleanForFirestore } from '../../services/firestoreSync';
import { handleHorizontalWheel } from '../../hooks/useHorizontalScroll';
import { collection, doc, onSnapshot, setDoc, deleteDoc, updateDoc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import {
  ClassItem,
  Student,
  ClassAttendanceConfig,
  DailyAttendanceRecord,
  InstitutionHoliday,
  SpecialWorkingDay,
  isClassMatch,
  AttendanceEditRequest,
  sortStudentsBoysFirst,
} from '../../types';
import { firestoreSync } from '../../services/firestoreSync';
import { logAuditEvent } from '../../services/auditLogger';
import {
  Calendar,
  CalendarDays,
  Check,
  X,
  Lock,
  Unlock,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  AlertTriangle,
  Save,
  CheckCheck,
  Edit3,
  Users,
  Trash2,
  FileSpreadsheet,
  Clock,
  Shield,
  Bell,
  Sparkles,
  HelpCircle,
} from 'lucide-react';

const ACADEMIC_YEAR_START_DATE = '2026-06-01';

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

const formatDateRangeBadge = (startDate: string, endDate: string, totalDays?: number): string => {
  const s = parseLocalDate(startDate);
  const e = parseLocalDate(endDate);
  const sStr = s.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const eStr = e.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const count = totalDays ?? Math.max(1, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  return `${sStr} – ${eStr} (${count} Day${count === 1 ? '' : 's'})`;
};

export const AdminAttendanceView: React.FC = () => {
  const { user, fetchWithAuth } = useAuth();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('class_1');
  const [students, setStudents] = useState<Student[]>([]);
  const [classAttendanceConfig, setClassAttendanceConfig] = useState<ClassAttendanceConfig | null>(null);

  // Tab Modes: 'overview' (Ledger & Summary) | 'daily' | 'weekly' | 'holidays' | 'requests'
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'daily' | 'weekly' | 'holidays' | 'requests'>('overview');

  const [todayStr] = useState<string>(() => formatLocalDate(new Date()));
  const [selectedDate, setSelectedDate] = useState<string>(() => formatLocalDate(new Date()));
  const [selectedWeekDate, setSelectedWeekDate] = useState<string>(() => formatLocalDate(new Date()));
  const [institutionHolidays, setInstitutionHolidays] = useState<Record<string, InstitutionHoliday>>({});
  const [specialWorkingDays, setSpecialWorkingDays] = useState<Record<string, SpecialWorkingDay>>({});
  
  // Holiday Form State (Single Day vs Date Range / Long Leave)
  const [holidayMode, setHolidayMode] = useState<'single' | 'range'>('single');
  const [newHolidayDate, setNewHolidayDate] = useState<string>(() => formatLocalDate(new Date()));
  const [rangeStartDate, setRangeStartDate] = useState<string>(() => formatLocalDate(new Date()));
  const [rangeEndDate, setRangeEndDate] = useState<string>(() => formatLocalDate(new Date()));
  const [newHolidayReason, setNewHolidayReason] = useState<string>('');
  const [newHolidayTargetClasses, setNewHolidayTargetClasses] = useState<string[]>(['all']);
  const [holidayModalDate, setHolidayModalDate] = useState<string | null>(null);
  const [holidayModalMode, setHolidayModalMode] = useState<'single' | 'range'>('single');
  const [modalRangeEndDate, setModalRangeEndDate] = useState<string>(() => formatLocalDate(new Date()));
  const [holidayReasonInput, setHolidayReasonInput] = useState<string>('');
  const [modalTargetClasses, setModalTargetClasses] = useState<string[]>(['all']);
  const [isSavingHoliday, setIsSavingHoliday] = useState(false);

  // Principal Sunday Unlock Modal & State (For KMEB Examinations)
  const [showSundayUnlockModal, setShowSundayUnlockModal] = useState(false);
  const [sundayUnlockDate, setSundayUnlockDate] = useState<string>('');
  const [sundayUnlockTargetClasses, setSundayUnlockTargetClasses] = useState<string[]>(['all']);
  const [sundayUnlockReason, setSundayUnlockReason] = useState<string>('KMEB Board Examination Session');
  const [isSavingSunday, setIsSavingSunday] = useState(false);

  // Edit Requests
  const [editRequests, setEditRequests] = useState<AttendanceEditRequest[]>([]);
  const [requestFilter, setRequestFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [isProcessingRequest, setIsProcessingRequest] = useState<string | null>(null);

  // Attendance states
  const [unlockedDates, setUnlockedDates] = useState<Record<string, boolean>>({});
  const [dailyStatusMap, setDailyStatusMap] = useState<Record<string, boolean>>({});
  const [weeklyStatusMap, setWeeklyStatusMap] = useState<Record<string, Record<string, boolean>>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [dailyViewLayout, setDailyViewLayout] = useState<'table' | 'cards'>('table');

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

  // Automated Data Cleanup: Purge erroneous June 24 holiday from Class 5 on mount
  useEffect(() => {
    firestoreSync.cleanupJune24Class5Holiday().catch(err => {
      console.warn('cleanupJune24Class5Holiday error:', err);
    });
  }, []);

  // Listen to institutionHolidays from Firestore in real-time
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
            const targetClasses: string[] = Array.isArray(data.targetClasses) && data.targetClasses.length > 0 ? data.targetClasses : ['all'];

            // Automated filter: if June 24 was specifically marked for Class 5, purge it immediately
            if (date === '2026-06-24' || date === '24/06/2026') {
              const hasClass5 = targetClasses.some(c => c === 'all' || c === 'cls_5' || c === 'class_5' || c === '5');
              if (hasClass5 && (targetClasses.includes('cls_5') || targetClasses.includes('class_5') || targetClasses.length === 1)) {
                deleteDoc(doc(db, 'institutionHolidays', d.id)).catch(() => {});
                return;
              }
            }

            map[date] = {
              id: d.id,
              date,
              targetClasses,
              reason: data.reason || 'Official Holiday / Non-Working Day',
              markedBy: data.markedBy || data.createdBy || 'Principal',
              createdBy: data.createdBy || data.markedBy || 'Principal',
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

  // Listen to specialWorkingDays from Firestore in real-time (Principal Sunday Unlock)
  useEffect(() => {
    let unsub: (() => void) | undefined;
    try {
      unsub = onSnapshot(
        collection(db, 'specialWorkingDays'),
        snapshot => {
          const map: Record<string, SpecialWorkingDay> = {};
          snapshot.docs.forEach(d => {
            const data = d.data();
            const date = data.date || d.id;
            map[date] = {
              id: d.id,
              date,
              targetClasses: Array.isArray(data.targetClasses) && data.targetClasses.length > 0 ? data.targetClasses : ['all'],
              reason: data.reason || 'KMEB Examination Session',
              unlockedBy: data.unlockedBy || 'Principal ASLAM TK',
              unlockedAt: data.unlockedAt || new Date().toISOString(),
              academicYear: data.academicYear || '2026-2027',
              createdAt: data.createdAt,
            };
          });
          setSpecialWorkingDays(map);
        },
        err => console.warn('specialWorkingDays listener error in AdminAttendanceView:', err)
      );
    } catch (e) {
      console.warn('Could not subscribe to specialWorkingDays in AdminAttendanceView:', e);
    }
    return () => {
      if (unsub) unsub();
    };
  }, []);

  // Listen to attendanceEditRequests from Firestore in real-time
  useEffect(() => {
    let unsub: (() => void) | undefined;
    try {
      unsub = onSnapshot(
        collection(db, 'attendanceEditRequests'),
        snapshot => {
          const list: AttendanceEditRequest[] = [];
          snapshot.docs.forEach(docSnap => {
            const data = docSnap.data() as AttendanceEditRequest;
            list.push({
              ...data,
              id: docSnap.id,
            });
          });
          // Sort pending first, then by requestedAt desc
          list.sort((a, b) => {
            if (a.status === 'pending' && b.status !== 'pending') return -1;
            if (a.status !== 'pending' && b.status === 'pending') return 1;
            return new Date(b.requestedAt || 0).getTime() - new Date(a.requestedAt || 0).getTime();
          });
          setEditRequests(list);
        },
        err => console.warn('attendanceEditRequests listener error:', err)
      );
    } catch (e) {
      console.warn('Could not subscribe to attendanceEditRequests:', e);
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

  const classStudents = useMemo(() => {
    return sortStudentsBoysFirst(
      students.filter(s => s.classId === selectedClassId && s.status === 'active')
    );
  }, [students, selectedClassId]);

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
  }, [selectedClassId, selectedDate, classAttendanceConfig, classStudents]);

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
  }, [selectedClassId, selectedWeekDate, classAttendanceConfig, classStudents]);

  const isSunday = (dateStr: string): boolean => {
    const d = parseLocalDate(dateStr);
    return d.getDay() === 0;
  };

  const getSpecialWorkingDay = (dateStr: string, classId: string = selectedClassId): SpecialWorkingDay | null => {
    const swd = specialWorkingDays[dateStr];
    if (swd && isClassMatch(swd.targetClasses, classId)) {
      return swd;
    }
    return null;
  };

  const isDateHoliday = (dateStr: string, classId: string = selectedClassId): boolean => {
    // 1. Sunday default closure: all Sundays are non-working days unless unlocked by Principal as a Working Sunday
    if (isSunday(dateStr)) {
      const swd = getSpecialWorkingDay(dateStr, classId);
      if (!swd) return true; // Sunday default weekly closure
    }

    // 2. Declared institution holidays: check target classes matching
    const hol = institutionHolidays[dateStr];
    if (hol && isClassMatch(hol.targetClasses, classId)) {
      return true;
    }

    // 3. Class-specific daily records
    if (classAttendanceConfig?.dailyRecords?.[dateStr]?.isHoliday) {
      return true;
    }
    return false;
  };

  const getHolidayInfo = (
    dateStr: string,
    classId: string = selectedClassId
  ): (InstitutionHoliday & { isSundayClosure?: boolean; isWorkingSunday?: boolean }) | null => {
    if (isSunday(dateStr)) {
      const swd = getSpecialWorkingDay(dateStr, classId);
      if (!swd) {
        return {
          id: dateStr,
          date: dateStr,
          targetClasses: ['all'],
          reason: 'Sunday Weekly Closure (Non-Working Day)',
          markedBy: 'Samastha & KMEB Academic Board',
          academicYear: '2026-2027',
          isSundayClosure: true,
        };
      }
    }

    const hol = institutionHolidays[dateStr];
    if (hol && isClassMatch(hol.targetClasses, classId)) {
      return hol;
    }

    const rec = classAttendanceConfig?.dailyRecords?.[dateStr];
    if (rec?.isHoliday) {
      return {
        id: dateStr,
        date: dateStr,
        targetClasses: [classId],
        reason: rec.holidayReason || 'Official Holiday / Non-Working Day',
        markedBy: rec.markedBy || 'Principal',
        academicYear: '2026-2027',
      };
    }
    return null;
  };

  const isDateLocked = (dateStr: string, classId: string = selectedClassId): boolean => {
    // Sundays are locked unless unlocked by Principal
    if (isSunday(dateStr)) {
      const swd = getSpecialWorkingDay(dateStr, classId);
      if (!swd) return true;
    }
    if (isDateHoliday(dateStr, classId)) return true;
    if (dateStr > todayStr) return true;
    if (unlockedDates[dateStr]) return false;
    const rec = classAttendanceConfig?.dailyRecords?.[dateStr];
    if (!rec) return false;
    // If record exists and marked unlocked by admin/principal approval
    if (rec.unlocked === true || rec.editable === true) return false;
    return true;
  };

  // -------------------------------------------------------------
  // Holiday Management (Exclusively for Admin / Principal)
  // -------------------------------------------------------------
  const handleDeclareHoliday = async (
    dateStr: string,
    reasonInput: string,
    targets: string[] = newHolidayTargetClasses
  ) => {
    if (!dateStr) return;
    if (dateStr < ACADEMIC_YEAR_START_DATE) {
      alert(`Dates prior to June 1 of the academic year (${ACADEMIC_YEAR_START_DATE}) cannot be modified.`);
      return;
    }
    setIsSavingHoliday(true);
    try {
      const reason = reasonInput.trim() || 'Official Holiday / Non-Working Day';
      const targetClasses = targets.length > 0 ? targets : ['all'];
      const holidayData: InstitutionHoliday = {
        id: dateStr,
        date: dateStr,
        targetClasses,
        reason,
        markedBy: user?.name || 'Principal ASLAM TK',
        createdBy: 'Principal',
        markedAt: new Date().toISOString(),
        academicYear: '2026-2027',
        createdAt: new Date().toISOString(),
      };

      // 1. Direct write to Firestore 'institutionHolidays'
      await setDoc(doc(db, 'institutionHolidays', dateStr), cleanForFirestore(holidayData), { merge: true });

      // 2. Immediately update local React state
      setInstitutionHolidays(prev => ({
        ...prev,
        [dateStr]: holidayData,
      }));

      // 3. Update attendance configs in Firestore across matching classes
      const affectedClasses = classes.filter(c => isClassMatch(targetClasses, c.id));
      for (const cls of affectedClasses) {
        try {
          const docRef = doc(db, 'attendance', cls.id);
          const snap = await getDocs(query(collection(db, 'attendance')));
          const matched = snap.docs.find(d => d.id === cls.id);
          const currentConfig: ClassAttendanceConfig = matched
            ? (matched.data() as ClassAttendanceConfig)
            : { classId: cls.id, totalWorkingDays: 88, studentDaysAttended: {}, dailyRecords: {} };

          const updatedDailyRecords = {
            ...(currentConfig.dailyRecords || {}),
            [dateStr]: {
              date: dateStr,
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
            k => updatedDailyRecords[k]?.isHoliday || (institutionHolidays[k] && isClassMatch(institutionHolidays[k].targetClasses, cls.id)) || k === dateStr
          ).length;
          const totalSundaysUnlocked = Object.values(specialWorkingDays).filter(
            sw => isClassMatch(sw.targetClasses, cls.id)
          ).length;
          const totalWorking = Math.max(1, 88 - totalHolidays + totalSundaysUnlocked);

          const updatedConfig: ClassAttendanceConfig = {
            ...currentConfig,
            classId: cls.id,
            totalWorkingDays: totalWorking,
            dailyRecords: updatedDailyRecords,
            updatedAt: new Date().toISOString(),
          };

          await setDoc(docRef, cleanForFirestore(updatedConfig), { merge: true });
          if (cls.id === selectedClassId) {
            setClassAttendanceConfig(updatedConfig);
          }
        } catch (e) {
          console.warn('Error updating class attendance for holiday:', cls.id, e);
        }
      }

      // 4. Update local API
      await fetchWithAuth('/api/institution-holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(holidayData),
      });

      // 5. Immutable Audit Log
      logAuditEvent({
        action: 'HOLIDAY_MARKED',
        details: `Principal ${user?.name || 'ASLAM TK'} designated ${dateStr} as Official Holiday ("${reason}") for ${targetClasses.includes('all') ? 'All Classes' : targetClasses.join(', ')}.`,
        currentUser: user,
        recordType: 'institution_holiday',
        recordId: dateStr,
      }).catch(e => console.warn('Audit log error:', e));

      setHolidayModalDate(null);
      setNewHolidayReason('');
      setNewHolidayTargetClasses(['all']);
      alert(`Date ${dateStr} designated as Holiday ("${reason}") for ${targetClasses.includes('all') ? 'All Classes' : 'selected classes'}. Attendance percentages and working days adjusted.`);
    } catch (err: any) {
      alert('Failed to mark holiday: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSavingHoliday(false);
    }
  };

  const handleRemoveHoliday = async (holidayIdOrDate: string, explicitDate?: string) => {
    const dateStr = explicitDate || holidayIdOrDate;
    const confirm = window.confirm(
      `Restore date ${dateStr} as a regular working day? This will remove the holiday exemption and restore active attendance marking.`
    );
    if (!confirm) return;

    try {
      // 1. Direct delete from Firestore institutionHolidays collection
      await deleteDoc(doc(db, 'institutionHolidays', holidayIdOrDate)).catch(() => {});
      if (holidayIdOrDate !== dateStr) {
        await deleteDoc(doc(db, 'institutionHolidays', dateStr)).catch(() => {});
      }
      try {
        const qSnap = await getDocs(query(collection(db, 'institutionHolidays'), where('date', '==', dateStr)));
        for (const d of qSnap.docs) {
          await deleteDoc(doc(db, 'institutionHolidays', d.id));
        }
      } catch {}

      // 2. Update local React state immediately so holiday badge is removed without reload
      setInstitutionHolidays(prev => {
        const copy = { ...prev };
        delete copy[dateStr];
        delete copy[holidayIdOrDate];
        return copy;
      });

      // 3. Update attendance daily records across all classes that recorded this holiday
      for (const cls of classes) {
        try {
          const docRef = doc(db, 'attendance', cls.id);
          const snap = await getDocs(query(collection(db, 'attendance')));
          const matched = snap.docs.find(d => d.id === cls.id);
          if (matched) {
            const currentConfig = matched.data() as ClassAttendanceConfig;
            if (currentConfig.dailyRecords && currentConfig.dailyRecords[dateStr]?.isHoliday) {
              const updatedDaily = { ...currentConfig.dailyRecords };
              delete updatedDaily[dateStr];
              const remainingHolidays = Object.keys(updatedDaily).filter(
                k => (updatedDaily[k]?.isHoliday || institutionHolidays[k]) && k !== dateStr
              ).length;
              const totalSundaysUnlocked = Object.values(specialWorkingDays).filter(
                sw => isClassMatch(sw.targetClasses, cls.id)
              ).length;
              const totalWorking = Math.max(1, 88 - remainingHolidays + totalSundaysUnlocked);

              const updatedConfig: ClassAttendanceConfig = {
                ...currentConfig,
                totalWorkingDays: totalWorking,
                dailyRecords: updatedDaily,
                updatedAt: new Date().toISOString(),
              };

              await setDoc(docRef, cleanForFirestore(updatedConfig), { merge: true });
              if (cls.id === selectedClassId) {
                setClassAttendanceConfig(updatedConfig);
              }
            }
          }
        } catch (e) {
          console.warn('Error updating class config on holiday removal:', cls.id, e);
        }
      }

      // 4. Sync deletion with local API
      await fetchWithAuth(`/api/institution-holidays?date=${dateStr}`, { method: 'DELETE' });

      // 5. Immutable Audit Log
      logAuditEvent({
        action: 'HOLIDAY_REMOVED',
        details: `Principal ${user?.name || 'ASLAM TK'} restored date ${dateStr} as a regular working day.`,
        currentUser: user,
        recordType: 'institution_holiday',
        recordId: dateStr,
      }).catch(e => console.warn('Audit log error:', e));

      alert(`Holiday designation removed for ${dateStr}. Restored to regular working day.`);
    } catch (err: any) {
      alert('Failed to remove holiday: ' + (err.message || 'Unknown error'));
    }
  };

  const calcRangeSummary = useMemo(() => {
    if (!rangeStartDate || !rangeEndDate || rangeStartDate > rangeEndDate) {
      return { totalCalendarDays: 0, workingDaysToExclude: 0, sundaysSkipped: 0, label: '' };
    }
    const cur = parseLocalDate(rangeStartDate);
    const end = parseLocalDate(rangeEndDate);
    let totalCalendar = 0;
    let working = 0;
    let sundays = 0;

    while (cur <= end) {
      totalCalendar++;
      if (cur.getDay() === 0) {
        sundays++;
      } else {
        working++;
      }
      cur.setDate(cur.getDate() + 1);
    }

    const startFmt = parseLocalDate(rangeStartDate).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
    const endFmt = parseLocalDate(rangeEndDate).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
    return {
      totalCalendarDays: totalCalendar,
      workingDaysToExclude: working,
      sundaysSkipped: sundays,
      label: `${startFmt} – ${endFmt}`,
    };
  }, [rangeStartDate, rangeEndDate]);

  const handleDeclareHolidayRange = async (
    startDate: string,
    endDate: string,
    reasonInput: string,
    targets: string[] = newHolidayTargetClasses
  ) => {
    if (!startDate || !endDate) {
      alert('Please select both Starting Date and Ending Date.');
      return;
    }
    if (startDate > endDate) {
      alert('Starting Date cannot be after Ending Date.');
      return;
    }

    setIsSavingHoliday(true);
    try {
      const reason = reasonInput.trim() || 'Official Holiday / Long Leave';
      const targetClasses = targets.length > 0 ? targets : ['all'];
      const rangeGroupId = `range_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

      // Generate all dates between startDate and endDate
      const allDates: string[] = [];
      const nonSundayDates: string[] = [];
      const cur = parseLocalDate(startDate);
      const end = parseLocalDate(endDate);

      while (cur <= end) {
        const dStr = formatLocalDate(cur);
        allDates.push(dStr);
        // Exclude standard Sundays so they are not double-counted (since Sundays are already weekly closures)
        if (cur.getDay() !== 0) {
          nonSundayDates.push(dStr);
        }
        cur.setDate(cur.getDate() + 1);
      }

      if (nonSundayDates.length === 0) {
        alert('All dates in the selected range fall on Sundays, which are already weekly closures by default.');
        setIsSavingHoliday(false);
        return;
      }

      const totalCalendarDays = allDates.length;
      const totalHolidayWorkingDays = nonSundayDates.length;

      // 1. Batch write to Firestore institutionHolidays
      const batch = writeBatch(db);
      const newEntries: Record<string, InstitutionHoliday> = {};

      for (const dStr of nonSundayDates) {
        const item: InstitutionHoliday = {
          id: dStr,
          date: dStr,
          targetClasses,
          reason,
          markedBy: user?.name || 'Principal ASLAM TK',
          createdBy: 'Principal',
          markedAt: new Date().toISOString(),
          academicYear: '2026-2027',
          createdAt: new Date().toISOString(),
          rangeStart: startDate,
          rangeEnd: endDate,
          rangeGroupId,
          totalRangeDays: totalCalendarDays,
        };
        batch.set(doc(db, 'institutionHolidays', dStr), cleanForFirestore(item), { merge: true });
        newEntries[dStr] = item;
      }

      await batch.commit();

      // 2. Immediately update local React state
      setInstitutionHolidays(prev => ({
        ...prev,
        ...newEntries,
      }));

      // 3. Update attendance configs in Firestore across matching classes
      const affectedClasses = classes.filter(c => isClassMatch(targetClasses, c.id));
      for (const cls of affectedClasses) {
        try {
          const docRef = doc(db, 'attendance', cls.id);
          const snap = await getDocs(query(collection(db, 'attendance')));
          const matched = snap.docs.find(d => d.id === cls.id);
          const currentConfig: ClassAttendanceConfig = matched
            ? (matched.data() as ClassAttendanceConfig)
            : { classId: cls.id, totalWorkingDays: 88, studentDaysAttended: {}, dailyRecords: {} };

          const updatedDailyRecords = { ...(currentConfig.dailyRecords || {}) };
          nonSundayDates.forEach(dStr => {
            updatedDailyRecords[dStr] = {
              date: dStr,
              presentStudentIds: [],
              absentStudentIds: [],
              statusMap: {},
              isHoliday: true,
              holidayReason: reason,
              markedAt: new Date().toISOString(),
              markedBy: user?.name || 'Principal ASLAM TK',
            };
          });

          const totalHolidays = Object.keys(updatedDailyRecords).filter(
            k => updatedDailyRecords[k]?.isHoliday || (institutionHolidays[k] && isClassMatch(institutionHolidays[k].targetClasses, cls.id)) || nonSundayDates.includes(k)
          ).length;
          const totalSundaysUnlocked = Object.values(specialWorkingDays).filter(
            sw => isClassMatch(sw.targetClasses, cls.id)
          ).length;
          const totalWorking = Math.max(1, 88 - totalHolidays + totalSundaysUnlocked);

          const updatedConfig: ClassAttendanceConfig = {
            ...currentConfig,
            classId: cls.id,
            totalWorkingDays: totalWorking,
            dailyRecords: updatedDailyRecords,
            updatedAt: new Date().toISOString(),
          };

          await setDoc(docRef, cleanForFirestore(updatedConfig), { merge: true });
          if (cls.id === selectedClassId) {
            setClassAttendanceConfig(updatedConfig);
          }
        } catch (e) {
          console.warn('Error updating class attendance for holiday range:', cls.id, e);
        }
      }

      // 4. Sync each with local storage API
      for (const dStr of nonSundayDates) {
        await fetchWithAuth('/api/institution-holidays', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newEntries[dStr]),
        }).catch(() => {});
      }

      // 5. Immutable Audit Log
      logAuditEvent({
        action: 'HOLIDAY_RANGE_DECLARED',
        details: `Principal designated Date Range Leave "${reason}" from ${startDate} to ${endDate} (${totalCalendarDays} calendar days, ${totalHolidayWorkingDays} non-Sunday days excluded) for ${targetClasses.includes('all') ? 'All Classes' : targetClasses.join(', ')}.`,
        currentUser: user,
        recordType: 'institution_holiday_range',
        recordId: rangeGroupId,
      }).catch(e => console.warn('Audit log error:', e));

      setRangeStartDate(formatLocalDate(new Date()));
      setRangeEndDate(formatLocalDate(new Date()));
      setNewHolidayReason('');
      alert(`Long leave "${reason}" successfully declared from ${startDate} to ${endDate} (${totalHolidayWorkingDays} active working days excluded, Sundays preserved). Total working days and percentages updated.`);
    } catch (err: any) {
      alert('Failed to declare holiday range: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSavingHoliday(false);
    }
  };

  const handleRemoveHolidayRange = async (dates: string[], startDate: string, endDate: string) => {
    const confirm = window.confirm(
      `Restore regular working days from ${startDate} to ${endDate} (${dates.length} holiday dates)? This will remove holiday exemptions and restore active attendance marking.`
    );
    if (!confirm) return;

    try {
      // 1. Direct delete from Firestore institutionHolidays
      for (const dStr of dates) {
        await deleteDoc(doc(db, 'institutionHolidays', dStr)).catch(() => {});
        try {
          const qSnap = await getDocs(query(collection(db, 'institutionHolidays'), where('date', '==', dStr)));
          qSnap.forEach(d => deleteDoc(doc(db, 'institutionHolidays', d.id)).catch(() => {}));
        } catch {}
      }

      // 2. Update local state
      setInstitutionHolidays(prev => {
        const copy = { ...prev };
        dates.forEach(dStr => delete copy[dStr]);
        return copy;
      });

      // 3. Update attendance configs in Firestore across classes
      for (const cls of classes) {
        try {
          const docRef = doc(db, 'attendance', cls.id);
          const snap = await getDocs(query(collection(db, 'attendance')));
          const matched = snap.docs.find(d => d.id === cls.id);
          if (matched) {
            const currentConfig = matched.data() as ClassAttendanceConfig;
            const updatedDaily = { ...(currentConfig.dailyRecords || {}) };
            dates.forEach(dStr => {
              if (updatedDaily[dStr]?.isHoliday) {
                delete updatedDaily[dStr];
              }
            });

            const remainingHolidays = Object.keys(updatedDaily).filter(
              k => (updatedDaily[k]?.isHoliday || institutionHolidays[k]) && !dates.includes(k)
            ).length;
            const totalSundaysUnlocked = Object.values(specialWorkingDays).filter(
              sw => isClassMatch(sw.targetClasses, cls.id)
            ).length;
            const totalWorking = Math.max(1, 88 - remainingHolidays + totalSundaysUnlocked);

            const updatedConfig = {
              ...currentConfig,
              totalWorkingDays: totalWorking,
              dailyRecords: updatedDaily,
              updatedAt: new Date().toISOString(),
            };

            await setDoc(docRef, cleanForFirestore(updatedConfig), { merge: true });
            if (cls.id === selectedClassId) {
              setClassAttendanceConfig(updatedConfig);
            }
          }
        } catch (e) {
          console.warn('Error updating class config on holiday range removal:', cls.id, e);
        }
      }

      // 4. Local API sync
      for (const dStr of dates) {
        await fetchWithAuth(`/api/institution-holidays?date=${dStr}`, { method: 'DELETE' }).catch(() => {});
      }

      // 5. Immutable Audit Log
      logAuditEvent({
        action: 'HOLIDAY_RANGE_REMOVED',
        details: `Principal ${user?.name || 'ASLAM TK'} restored regular working days from ${startDate} to ${endDate} (${dates.length} days).`,
        currentUser: user,
        recordType: 'institution_holiday_range',
        recordId: `${startDate}_${endDate}`,
      }).catch(e => console.warn('Audit log error:', e));

      alert(`Holiday range ${startDate} – ${endDate} removed. Restored to regular working days.`);
    } catch (err: any) {
      alert('Failed to remove holiday range: ' + (err.message || 'Unknown error'));
    }
  };

  // -------------------------------------------------------------
  // Principal-Exclusive Sunday Working Day Unlock (e.g. KMEB Exams)
  // -------------------------------------------------------------
  const handleUnlockSunday = async (sundayDateStr: string, targets: string[], reasonInput: string) => {
    if (!sundayDateStr) return;
    if (!isSunday(sundayDateStr)) {
      alert('The selected date is not a Sunday. Principal Unlock is exclusively for Sunday Working Days (e.g., KMEB Examinations).');
      return;
    }
    setIsSavingSunday(true);
    try {
      const reason = reasonInput.trim() || 'KMEB Board Examination Session';
      const targetClasses = targets.length > 0 ? targets : ['all'];
      const swdData: SpecialWorkingDay = {
        id: sundayDateStr,
        date: sundayDateStr,
        targetClasses,
        reason,
        unlockedBy: user?.name || 'Principal ASLAM TK',
        unlockedAt: new Date().toISOString(),
        academicYear: '2026-2027',
        createdAt: new Date().toISOString(),
      };

      // 1. Direct write to Firestore 'specialWorkingDays'
      await setDoc(doc(db, 'specialWorkingDays', sundayDateStr), cleanForFirestore(swdData), { merge: true });

      // 2. Update local state
      setSpecialWorkingDays(prev => ({
        ...prev,
        [sundayDateStr]: swdData,
      }));

      // 3. Update attendance configs in Firestore: add to working days count for affected classes
      const affectedClasses = classes.filter(c => isClassMatch(targetClasses, c.id));
      for (const cls of affectedClasses) {
        try {
          const docRef = doc(db, 'attendance', cls.id);
          const snap = await getDocs(query(collection(db, 'attendance')));
          const matched = snap.docs.find(d => d.id === cls.id);
          const currentConfig: ClassAttendanceConfig = matched
            ? (matched.data() as ClassAttendanceConfig)
            : { classId: cls.id, totalWorkingDays: 88, studentDaysAttended: {}, dailyRecords: {} };

          const updatedDaily = { ...(currentConfig.dailyRecords || {}) };
          if (updatedDaily[sundayDateStr]) {
            updatedDaily[sundayDateStr] = {
              ...updatedDaily[sundayDateStr],
              isHoliday: false,
              unlocked: true,
              editable: true,
            };
          }

          const totalHolidays = Object.keys(updatedDaily).filter(
            k => updatedDaily[k]?.isHoliday || (institutionHolidays[k] && isClassMatch(institutionHolidays[k].targetClasses, cls.id))
          ).length;
          const totalSundaysUnlocked = Object.values(specialWorkingDays).filter(
            sw => isClassMatch(sw.targetClasses, cls.id)
          ).length + 1;
          const totalWorking = Math.max(1, 88 - totalHolidays + totalSundaysUnlocked);

          const updatedConfig: ClassAttendanceConfig = {
            ...currentConfig,
            classId: cls.id,
            totalWorkingDays: totalWorking,
            dailyRecords: updatedDaily,
            updatedAt: new Date().toISOString(),
          };

          await setDoc(docRef, cleanForFirestore(updatedConfig), { merge: true });
          if (cls.id === selectedClassId) {
            setClassAttendanceConfig(updatedConfig);
          }
        } catch (e) {
          console.warn('Error updating class config on sunday unlock:', cls.id, e);
        }
      }

      // 4. Local API
      await fetchWithAuth('/api/special-working-days', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(swdData),
      });

      // 5. Immutable Audit Log
      logAuditEvent({
        action: 'SUNDAY_UNLOCKED_WORKING_DAY',
        details: `Principal ${user?.name || 'ASLAM TK'} unlocked Sunday ${sundayDateStr} as official working day ("${reason}") for ${targetClasses.includes('all') ? 'All Classes' : targetClasses.join(', ')}.`,
        currentUser: user,
        recordType: 'special_working_day',
        recordId: sundayDateStr,
      }).catch(e => console.warn('Audit log error:', e));

      setShowSundayUnlockModal(false);
      setSundayUnlockDate('');
      alert(`Sunday ${sundayDateStr} successfully unlocked as Working Day ("${reason}") for ${targetClasses.includes('all') ? 'All Classes' : 'selected classes'}. Teachers can now mark attendance and working days have been incremented.`);
    } catch (err: any) {
      alert('Failed to unlock Sunday: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSavingSunday(false);
    }
  };

  const handleRevokeSunday = async (sundayDateStr: string) => {
    const confirm = window.confirm(
      `Re-lock Sunday ${sundayDateStr} back to Default Weekly Closure? This will remove attendance marking permission for this Sunday.`
    );
    if (!confirm) return;

    try {
      await deleteDoc(doc(db, 'specialWorkingDays', sundayDateStr));
      try {
        const snap = await getDocs(query(collection(db, 'specialWorkingDays'), where('date', '==', sundayDateStr)));
        snap.forEach(d => deleteDoc(doc(db, 'specialWorkingDays', d.id)).catch(() => {}));
      } catch {}

      setSpecialWorkingDays(prev => {
        const copy = { ...prev };
        delete copy[sundayDateStr];
        return copy;
      });

      for (const cls of classes) {
        try {
          const docRef = doc(db, 'attendance', cls.id);
          const snap = await getDocs(query(collection(db, 'attendance')));
          const matched = snap.docs.find(d => d.id === cls.id);
          if (matched) {
            const currentConfig = matched.data() as ClassAttendanceConfig;
            const updatedDaily = { ...(currentConfig.dailyRecords || {}) };
            delete updatedDaily[sundayDateStr];
            const totalHolidays = Object.keys(updatedDaily).filter(
              k => updatedDaily[k]?.isHoliday || (institutionHolidays[k] && isClassMatch(institutionHolidays[k].targetClasses, cls.id))
            ).length;
            const totalSundaysUnlocked = Object.values(specialWorkingDays).filter(
              sw => sw.date !== sundayDateStr && isClassMatch(sw.targetClasses, cls.id)
            ).length;
            const totalWorking = Math.max(1, 88 - totalHolidays + totalSundaysUnlocked);

            const updatedConfig = {
              ...currentConfig,
              totalWorkingDays: totalWorking,
              dailyRecords: updatedDaily,
              updatedAt: new Date().toISOString(),
            };
            await setDoc(docRef, cleanForFirestore(updatedConfig), { merge: true });
            if (cls.id === selectedClassId) {
              setClassAttendanceConfig(updatedConfig);
            }
          }
        } catch (e) {
          console.warn('Error revoking sunday working day:', cls.id, e);
        }
      }

      await fetchWithAuth(`/api/special-working-days?date=${sundayDateStr}`, { method: 'DELETE' });

      logAuditEvent({
        action: 'SUNDAY_RESTORED_CLOSURE',
        details: `Principal ${user?.name || 'ASLAM TK'} revoked working day override for Sunday ${sundayDateStr}. Restored to weekly non-working day.`,
        currentUser: user,
        recordType: 'special_working_day',
        recordId: sundayDateStr,
      }).catch(e => console.warn('Audit log error:', e));

      alert(`Sunday ${sundayDateStr} reverted to Default Weekly Closure.`);
    } catch (err: any) {
      alert('Failed to revoke Sunday: ' + (err.message || 'Unknown error'));
    }
  };

  // -------------------------------------------------------------
  // Attendance Edit Request Approvals (Principal Unlock Workflow)
  // -------------------------------------------------------------
  const handleApproveUnlockRequest = async (req: AttendanceEditRequest) => {
    setIsProcessingRequest(req.id);
    try {
      const nowIso = new Date().toISOString();
      const approverName = user?.name || 'Principal ASLAM TK';

      // 1. Update attendanceEditRequests in Firestore
      await setDoc(
        doc(db, 'attendanceEditRequests', req.id),
        {
          status: 'approved',
          resolvedAt: nowIso,
          resolvedBy: approverName,
        },
        { merge: true }
      );

      // 2. Unlock the attendance daily record for that class and date in Firestore
      const classRef = doc(db, 'attendance', req.classId);
      await setDoc(
        classRef,
        {
          dailyRecords: {
            [req.date]: {
              unlocked: true,
              editable: true,
              unlockedAt: nowIso,
              unlockedBy: approverName,
            },
          },
          updatedAt: nowIso,
        },
        { merge: true }
      );

      // 3. Local API sync
      await fetchWithAuth(`/api/attendance-edit-requests/${req.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'approved',
          resolvedAt: nowIso,
          resolvedBy: approverName,
        }),
      });

      // 4. Audit Log
      logAuditEvent({
        action: 'ATTENDANCE_UNLOCKED',
        details: `Principal approved attendance edit request for Class ${req.className || req.classId} on ${req.date}. Requested by ${req.teacherName}. Reason: "${req.reason}".`,
        currentUser: user,
        recordType: 'attendance_edit_request',
        recordId: req.id,
      }).catch(e => console.warn('Audit log error:', e));

      // Update local state if currently viewing this class
      if (req.classId === selectedClassId) {
        setUnlockedDates(prev => ({ ...prev, [req.date]: true }));
      }

      alert(`Attendance edit request APPROVED & UNLOCKED for ${req.className || req.classId} on ${req.date}. Teacher ${req.teacherName} can now make corrections.`);
    } catch (err: any) {
      alert('Failed to approve unlock request: ' + (err.message || 'Unknown error'));
    } finally {
      setIsProcessingRequest(null);
    }
  };

  const handleRejectUnlockRequest = async (req: AttendanceEditRequest) => {
    const reason = prompt('Optional reason for rejecting this unlock request:') || 'Rejected by Principal';
    setIsProcessingRequest(req.id);
    try {
      const nowIso = new Date().toISOString();
      const approverName = user?.name || 'Principal ASLAM TK';

      await setDoc(
        doc(db, 'attendanceEditRequests', req.id),
        {
          status: 'rejected',
          resolvedAt: nowIso,
          resolvedBy: approverName,
          resolutionNote: reason,
        },
        { merge: true }
      );

      await fetchWithAuth(`/api/attendance-edit-requests/${req.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'rejected',
          resolvedAt: nowIso,
          resolvedBy: approverName,
          resolutionNote: reason,
        }),
      });

      logAuditEvent({
        action: 'ATTENDANCE_UNLOCK_REJECTED',
        details: `Principal rejected attendance edit request for Class ${req.className || req.classId} on ${req.date}. Requested by ${req.teacherName}. Note: "${reason}".`,
        currentUser: user,
        recordType: 'attendance_edit_request',
        recordId: req.id,
      }).catch(e => console.warn('Audit log error:', e));

      alert(`Unlock request rejected.`);
    } catch (err: any) {
      alert('Failed to reject unlock request: ' + (err.message || 'Unknown error'));
    } finally {
      setIsProcessingRequest(null);
    }
  };

  // -------------------------------------------------------------
  // Daily Attendance Marking & Saving
  // -------------------------------------------------------------
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
        unlocked: false,
        editable: false,
      };

      const updatedDailyRecords = {
        ...(classAttendanceConfig?.dailyRecords || {}),
        [selectedDate]: dailyRecord,
      };

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
        details: `Principal ${user?.name || 'ASLAM TK'} saved attendance for Class ${selectedClass?.name || selectedClassId} on ${selectedDate}.`,
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
        if (w.dateStr <= todayStr && w.dateStr >= ACADEMIC_YEAR_START_DATE) {
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
            unlocked: false,
            editable: false,
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

  // -------------------------------------------------------------
  // Class-wise Overview & Ledger Calculations
  // -------------------------------------------------------------
  const allDailyKeys = Object.keys(classAttendanceConfig?.dailyRecords || {});
  const markedDailyRecords = Object.values(classAttendanceConfig?.dailyRecords || {}).filter(
    r => !r.isHoliday && r.date <= todayStr && r.date >= ACADEMIC_YEAR_START_DATE
  );

  const totalDeclaredHolidaysCount = Object.keys(institutionHolidays).length;
  const netClassWorkingDays = Math.max(1, (classAttendanceConfig?.totalWorkingDays || 88));

  // Compute student-wise attended days & percentages
  const studentLedger = useMemo(() => {
    return classStudents.map(st => {
      let attended = 0;
      let totalAssessedDays = 0;

      markedDailyRecords.forEach(rec => {
        const isHol = rec.isHoliday || institutionHolidays[rec.date];
        if (!isHol) {
          totalAssessedDays++;
          if (rec.statusMap && rec.statusMap[st.id] !== undefined) {
            if (rec.statusMap[st.id]) attended++;
          } else if (rec.presentStudentIds && rec.presentStudentIds.includes(st.id)) {
            attended++;
          } else {
            // default present if not explicitly marked absent
            if (!rec.absentStudentIds?.includes(st.id)) {
              attended++;
            }
          }
        }
      });

      // If recorded in studentDaysAttended, reconcile
      const recordedDays = classAttendanceConfig?.studentDaysAttended?.[st.id] ?? attended;
      const finalAttended = totalAssessedDays > 0 ? attended : recordedDays;
      const finalWorking = totalAssessedDays > 0 ? totalAssessedDays : netClassWorkingDays;
      const percentage = finalWorking > 0 ? Math.round((finalAttended / finalWorking) * 100) : 100;

      return {
        student: st,
        attended: finalAttended,
        workingDays: finalWorking,
        percentage,
      };
    });
  }, [classStudents, markedDailyRecords, classAttendanceConfig, institutionHolidays, netClassWorkingDays]);

  const classOverallPercentage = studentLedger.length > 0
    ? Math.round(studentLedger.reduce((acc, s) => acc + s.percentage, 0) / studentLedger.length)
    : 100;

  // Dynamic Monthly Academic Calendar Calculation
  const academicMonths = useMemo(() => {
    const rawMonths = [
      { key: '2026-06', year: 2026, monthIdx: 5, monthEn: 'June 2026', monthMl: 'ജൂൺ 2026' },
      { key: '2026-07', year: 2026, monthIdx: 6, monthEn: 'July 2026', monthMl: 'ജൂലൈ 2026' },
      { key: '2026-08', year: 2026, monthIdx: 7, monthEn: 'August 2026', monthMl: 'ഓഗസ്റ്റ് 2026' },
      { key: '2026-09', year: 2026, monthIdx: 8, monthEn: 'September 2026', monthMl: 'സെപ്റ്റംബർ 2026' },
      { key: '2026-10', year: 2026, monthIdx: 9, monthEn: 'October 2026', monthMl: 'ഒക്ടോബർ 2026' },
      { key: '2026-11', year: 2026, monthIdx: 10, monthEn: 'November 2026', monthMl: 'നവംബർ 2026' },
      { key: '2026-12', year: 2026, monthIdx: 11, monthEn: 'December 2026', monthMl: 'ഡിസംബർ 2026' },
      { key: '2027-01', year: 2027, monthIdx: 0, monthEn: 'January 2027', monthMl: 'ജനുവരി 2027' },
      { key: '2027-02', year: 2027, monthIdx: 1, monthEn: 'February 2027', monthMl: 'ഫെബ്രുവരി 2027' },
      { key: '2027-03', year: 2027, monthIdx: 2, monthEn: 'March 2027', monthMl: 'മാർച്ച് 2027' },
    ];

    return rawMonths.map(m => {
      // 1. Calendar Days: dynamically get true days in calendar month
      const calendarDays = new Date(m.year, m.monthIdx + 1, 0).getDate();

      // 2. Sundays (Weekly Off): dynamically count exact Sundays in this specific month
      let sundaysCount = 0;
      for (let day = 1; day <= calendarDays; day++) {
        const d = new Date(m.year, m.monthIdx, day);
        if (d.getDay() === 0) {
          sundaysCount++;
        }
      }

      // 3. Declared Holidays: official special/institution holidays declared in that month for the selected class (excluding Sundays to avoid double deduction)
      const declaredHolidaysInMonth = Object.values(institutionHolidays).filter(h => {
        if (!h.date || !h.date.startsWith(m.key)) return false;
        if (!isClassMatch(h.targetClasses, selectedClassId)) return false;
        const d = parseLocalDate(h.date);
        if (d.getDay() === 0) return false; // Exclude Sundays
        return true;
      });
      const declaredHolidaysCount = declaredHolidaysInMonth.length;

      // 4. Any Principal Unlocked Working Sundays in this month for selected class
      const unlockedSundaysInMonth = Object.values(specialWorkingDays).filter(sw => {
        if (!sw.date || !sw.date.startsWith(m.key)) return false;
        return isClassMatch(sw.targetClasses, selectedClassId);
      });
      const unlockedSundaysCount = unlockedSundaysInMonth.length;

      // 5. Net Working Days: Calendar Days - Sundays - Declared Holidays + (Any Principal Unlocked Working Sundays)
      const netWorkingDays = Math.max(0, calendarDays - sundaysCount - declaredHolidaysCount + unlockedSundaysCount);

      // 6. Class Sessions Marked in this month
      const markedDays = markedDailyRecords.filter(r => r.date.startsWith(m.key) && !r.isHoliday).length;

      return {
        ...m,
        calendarDays,
        sundaysCount,
        declaredHolidaysCount,
        unlockedSundaysCount,
        netWorkingDays,
        markedDays,
      };
    });
  }, [institutionHolidays, specialWorkingDays, markedDailyRecords, selectedClassId]);

  // Daily status computation for selectedDate
  const isDailyHoliday = isDateHoliday(selectedDate);
  const dailyHolidayInfo = getHolidayInfo(selectedDate);
  const isDailyLocked = isDateLocked(selectedDate);
  const isDailyEditing = classAttendanceConfig?.dailyRecords?.[selectedDate] && (unlockedDates[selectedDate] || classAttendanceConfig.dailyRecords[selectedDate].unlocked);

  let dailyPresentCount = 0;
  let dailyAbsentCount = 0;
  classStudents.forEach(s => {
    if (dailyStatusMap[s.id] !== false) dailyPresentCount++;
    else dailyAbsentCount++;
  });
  const dailyPercentage = classStudents.length > 0
    ? Math.round((dailyPresentCount / classStudents.length) * 100)
    : 100;

  const pendingRequestsCount = editRequests.filter(r => r.status === 'pending').length;

  const filteredEditRequests = editRequests.filter(r => {
    if (requestFilter === 'all') return true;
    return r.status === requestFilter;
  });

  const allHolidaysList = Object.values(institutionHolidays).sort(
    (a, b) => b.date.localeCompare(a.date)
  );

  return (
    <div className="space-y-6">
      {/* Top Banner and Navigation Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900">Institution Attendance &amp; Holiday Management</h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                Principal Console
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Comprehensive attendance oversight, class percentage ledger, institution non-working day designations, and teacher edit approvals.
            </p>
          </div>

          {/* Class Selection Dropdown */}
          <div className="flex items-center gap-3">
            <label className="text-xs font-bold text-slate-700 whitespace-nowrap">Select Class:</label>
            <select
              value={selectedClassId}
              onChange={e => setSelectedClassId(e.target.value)}
              className="px-3.5 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700 shadow-2xs cursor-pointer"
            >
              {classes.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Pending Edit Requests Alert Banner */}
        {pendingRequestsCount > 0 && (
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 rounded-xl p-3.5 flex items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-lg bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-800 text-sm font-bold shrink-0">
                <Bell className="w-4 h-4 animate-bounce" />
              </span>
              <div>
                <span className="text-xs font-bold text-amber-950 block">
                  {pendingRequestsCount} Teacher Attendance Edit Request{pendingRequestsCount > 1 ? 's' : ''} Pending Principal Approval!
                </span>
                <span className="text-[11px] text-amber-900">
                  Teachers cannot alter locked attendance records without explicit Principal approval.
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveSubTab('requests')}
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition shadow-2xs cursor-pointer whitespace-nowrap"
            >
              Review Requests ({pendingRequestsCount}) →
            </button>
          </div>
        )}

        {/* Navigation Tabs Bar for Attendance Console */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-2 border-t border-slate-100" onWheel={handleHorizontalWheel}>
          <button
            type="button"
            onClick={() => setActiveSubTab('overview')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
              activeSubTab === 'overview'
                ? 'bg-emerald-800 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Class Overview &amp; Ledger</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('daily')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
              activeSubTab === 'daily'
                ? 'bg-emerald-800 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Daily Attendance Roster</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('weekly')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
              activeSubTab === 'weekly'
                ? 'bg-emerald-800 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <CalendarDays className="w-4 h-4" />
            <span>Weekly Grid</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('holidays')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
              activeSubTab === 'holidays'
                ? 'bg-emerald-800 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <span>🏖️</span>
            <span>Institution Holidays ({Object.keys(institutionHolidays).length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('requests')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap relative ${
              activeSubTab === 'requests'
                ? 'bg-emerald-800 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Unlock className="w-4 h-4" />
            <span>Edit Requests</span>
            {pendingRequestsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-white">
                {pendingRequestsCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* SUB-TAB 1: CLASS-WISE ATTENDANCE OVERVIEW & LEDGER */}
      {activeSubTab === 'overview' && (
        <div className="space-y-6">
          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Enrolled Students
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900 font-mono">
                  {classStudents.length}
                </span>
                <span className="text-[11px] text-slate-400">
                  ({classStudents.filter(s => s.gender === 'M').length} Boys · {classStudents.filter(s => s.gender === 'F').length} Girls)
                </span>
              </div>
              <div className="text-[10px] text-emerald-800 font-medium">Sorted Boys A-Z then Girls A-Z</div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Net Working Days
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900 font-mono">
                  {netClassWorkingDays}
                </span>
                <span className="text-[11px] text-amber-700 font-bold">
                  ({totalDeclaredHolidaysCount} Holidays Excluded)
                </span>
              </div>
              <div className="text-[10px] text-slate-400">Official Non-Working Days Safeguarded</div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Class Attendance Rate
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-emerald-700 font-mono">
                  {classOverallPercentage}%
                </span>
                <span className="text-[11px] text-slate-400">Class Average</span>
              </div>
              <div className="text-[10px] text-emerald-700 font-medium">
                {classOverallPercentage >= 85 ? '✓ Excellent Discipline' : 'Needs Regularity'}
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Recorded Sessions
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900 font-mono">
                  {markedDailyRecords.length}
                </span>
                <span className="text-[11px] text-slate-400">Days Logged</span>
              </div>
              <div className="text-[10px] text-slate-400 font-mono">
                From {ACADEMIC_YEAR_START_DATE} to {todayStr}
              </div>
            </div>
          </div>

          {/* Monthly Working Days Breakdown Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-emerald-800" />
                  <span>Academic Year Monthly Working Days Breakdown</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Institution holidays automatically subtract from working days so attendance percentages remain completely unpenalized.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSubTab('holidays')}
                className="text-xs font-bold text-emerald-800 hover:text-emerald-950 flex items-center gap-1 cursor-pointer"
              >
                <span>🏖️ Manage Holidays →</span>
              </button>
            </div>

            <div className="overflow-x-auto w-full scrollbar-thin" onWheel={handleHorizontalWheel}>
              <table className="w-full text-left text-xs min-w-[760px] border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                  <tr>
                    <th className="py-3 px-4">Academic Month</th>
                    <th className="py-3 px-3 text-center">Calendar Days</th>
                    <th className="py-3 px-3 text-center text-slate-600">Sundays (Weekly Off)</th>
                    <th className="py-3 px-3 text-center text-amber-800">Declared Holidays</th>
                    <th className="py-3 px-3 text-center text-emerald-900 font-bold">Net Working Days</th>
                    <th className="py-3 px-3 text-center">Class Sessions Marked</th>
                    <th className="py-3 px-4 text-center">Compliance Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {academicMonths.map(m => {
                    const isPassed = m.markedDays >= m.netWorkingDays && m.netWorkingDays > 0;
                    const isActive = m.markedDays > 0 && !isPassed;

                    return (
                      <tr key={m.key} className="hover:bg-slate-50/70 transition">
                        <td className="py-3 px-4 font-bold text-slate-900">
                          <span>{m.monthEn}</span>
                          <span className="text-[11px] text-slate-400 block font-normal">{m.monthMl}</span>
                        </td>
                        <td className="py-3 px-3 text-center font-mono font-bold text-slate-700">
                          {m.calendarDays} days
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 font-mono font-bold text-[11px]">
                            {m.sundaysCount} Sundays
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center font-mono font-bold text-amber-700">
                          {m.declaredHolidaysCount > 0 ? (
                            <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-950 border border-amber-300">
                              - {m.declaredHolidaysCount} days
                            </span>
                          ) : (
                            <span className="text-slate-400 font-normal">0</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <div className="inline-flex flex-col items-center">
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-950 border border-emerald-300 font-mono font-black text-xs shadow-2xs">
                              {m.netWorkingDays} days
                            </span>
                            {m.unlockedSundaysCount > 0 && (
                              <span className="text-[10px] text-indigo-700 font-bold mt-0.5">
                                (+{m.unlockedSundaysCount} Sun Unlocked)
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center font-mono">
                          <span className="font-bold text-slate-900">{m.markedDays}</span>
                          <span className="text-[10px] text-slate-400 block">/ {m.netWorkingDays} days</span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {isPassed ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 shadow-2xs">
                              <Check className="w-3.5 h-3.5 text-emerald-700 stroke-[3]" /> Reconciled
                            </span>
                          ) : isActive ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-800 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200 shadow-2xs">
                              <Clock className="w-3.5 h-3.5 text-blue-600" /> Active ({Math.round((m.markedDays / m.netWorkingDays) * 100)}%)
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400 font-medium">Upcoming</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-100/90 font-bold border-t-2 border-slate-200 text-slate-800">
                  <tr>
                    <td className="py-3 px-4 uppercase text-xs tracking-wider">
                      Academic Year Totals
                    </td>
                    <td className="py-3 px-3 text-center font-mono font-black">
                      {academicMonths.reduce((s, m) => s + m.calendarDays, 0)} days
                    </td>
                    <td className="py-3 px-3 text-center font-mono font-bold text-slate-700">
                      {academicMonths.reduce((s, m) => s + m.sundaysCount, 0)} Sundays
                    </td>
                    <td className="py-3 px-3 text-center font-mono font-bold text-amber-800">
                      - {academicMonths.reduce((s, m) => s + m.declaredHolidaysCount, 0)} days
                    </td>
                    <td className="py-3 px-3 text-center font-mono font-black text-emerald-950 text-xs">
                      {academicMonths.reduce((s, m) => s + m.netWorkingDays, 0)} days
                    </td>
                    <td className="py-3 px-3 text-center font-mono font-black text-slate-900">
                      {academicMonths.reduce((s, m) => s + m.markedDays, 0)} marked
                    </td>
                    <td className="py-3 px-4 text-center text-xs text-slate-600">
                      {Math.round(
                        (academicMonths.reduce((s, m) => s + m.markedDays, 0) /
                          Math.max(1, academicMonths.reduce((s, m) => s + m.netWorkingDays, 0))) *
                          100
                      )}% Progress
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Student-wise Attendance Percentage Ledger */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-800" />
                  <span>Student Attendance Ledger &amp; Percentage Record: {selectedClass?.name}</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Roll No &amp; Student Name remain frozen while scrolling. Mouse-wheel horizontal scroll active.
                </p>
              </div>
              <div className="text-xs font-mono font-bold text-slate-600">
                Total Students: {classStudents.length}
              </div>
            </div>

            <div
              onWheel={handleHorizontalWheel}
              className="overflow-x-auto relative w-full scrollbar-thin rounded-b-2xl border-t border-slate-100"
            >
              <table className="w-full text-left text-xs min-w-[700px] border-collapse">
                <thead className="sticky top-0 bg-slate-100 z-30">
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <th className="py-3 px-3 text-center w-12 font-mono sticky left-0 bg-slate-100 z-40 shadow-[1px_0_0_0_#e5e7eb]">
                      Roll
                    </th>
                    <th className="py-3 px-4 min-w-[200px] sticky left-12 bg-slate-100 z-40 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                      Student Name
                    </th>
                    <th className="py-3 px-2 w-20 text-center font-mono">Adm No</th>
                    <th className="py-3 px-2 w-16 text-center">Gender</th>
                    <th className="py-3 px-3 text-center font-mono">Days Attended</th>
                    <th className="py-3 px-3 text-center font-mono">Total Working</th>
                    <th className="py-3 px-3 text-center font-mono">Attendance %</th>
                    <th className="py-3 px-4 text-center">Discipline Rating</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {studentLedger.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-slate-400">
                        No active students found in this class.
                      </td>
                    </tr>
                  ) : (
                    studentLedger.map(({ student: st, attended, workingDays, percentage }) => {
                      const isHigh = percentage >= 85;
                      const isMed = percentage >= 75 && percentage < 85;

                      return (
                        <tr key={st.id} className="hover:bg-slate-50/80 transition group">
                          <td className="py-3 px-3 text-center font-mono font-bold text-slate-700 w-12 sticky left-0 z-20 shadow-[1px_0_0_0_#e5e7eb] bg-white group-hover:bg-slate-50">
                            {st.rollNo}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap min-w-[200px] sticky left-12 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] bg-white group-hover:bg-slate-50">
                            <span className="font-bold text-slate-900 block">{st.nameEn}</span>
                            {st.nameMl && (
                              <div className="text-[11px] text-slate-500 font-ml leading-tight mt-0.5">
                                {st.nameMl}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-2 text-center font-mono font-bold text-slate-700 w-20">
                            {st.admissionNo}
                          </td>
                          <td className="py-3 px-2 text-center w-16">
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                st.gender === 'F' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'
                              }`}
                            >
                              {st.gender || 'M'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center font-mono font-bold text-emerald-800">
                            {attended}
                          </td>
                          <td className="py-3 px-3 text-center font-mono text-slate-600">
                            {workingDays}
                          </td>
                          <td className="py-3 px-3 text-center font-mono font-bold text-sm">
                            <span
                              className={`px-2 py-0.5 rounded-lg border ${
                                isHigh
                                  ? 'bg-emerald-100 text-emerald-950 border-emerald-300'
                                  : isMed
                                  ? 'bg-amber-100 text-amber-950 border-amber-300'
                                  : 'bg-rose-100 text-rose-950 border-rose-300'
                              }`}
                            >
                              {percentage}%
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            {isHigh ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 inline-block">
                                Regular
                              </span>
                            ) : isMed ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 inline-block">
                                Average
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-200 inline-block">
                                Shortage Alert
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: DAILY ATTENDANCE ROSTER & MARKING */}
      {activeSubTab === 'daily' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {/* Date Navigators with June 1 Boundary and Today Max */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    const d = parseLocalDate(selectedDate);
                    d.setDate(d.getDate() - 1);
                    const prev = formatLocalDate(d);
                    if (prev >= ACADEMIC_YEAR_START_DATE) {
                      setSelectedDate(prev);
                    }
                  }}
                  disabled={selectedDate <= ACADEMIC_YEAR_START_DATE}
                  className={`p-2 rounded-xl border border-slate-200 transition ${
                    selectedDate <= ACADEMIC_YEAR_START_DATE
                      ? 'bg-slate-100 text-slate-300 opacity-40 cursor-not-allowed'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer'
                  }`}
                  title="Previous Day"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5">
                  <Calendar className="w-4 h-4 text-slate-500" />
                  <input
                    type="date"
                    value={selectedDate}
                    min={ACADEMIC_YEAR_START_DATE}
                    max={todayStr}
                    onChange={e => {
                      const val = e.target.value;
                      if (!val) return;
                      if (val < ACADEMIC_YEAR_START_DATE) setSelectedDate(ACADEMIC_YEAR_START_DATE);
                      else if (val > todayStr) setSelectedDate(todayStr);
                      else setSelectedDate(val);
                    }}
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
                    Unlocked for Principal Editing
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
                    onClick={() => {
                      setHolidayModalDate(selectedDate);
                      setHolidayReasonInput('');
                    }}
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

          {/* Prominent Banner on Special Working Sunday */}
          {!isDailyHoliday && getSpecialWorkingDay(selectedDate, selectedClassId) && (
            <div className="bg-gradient-to-r from-indigo-50 via-purple-50 to-indigo-50 rounded-2xl border-2 border-indigo-300 p-6 text-center space-y-3 shadow-xs">
              <div className="w-12 h-12 rounded-full bg-indigo-100 border border-indigo-300 flex items-center justify-center text-2xl mx-auto shadow-2xs">
                ⭐
              </div>
              <div>
                <h4 className="text-base font-bold text-indigo-950 flex items-center justify-center gap-2">
                  <span>⭐ Principal Unlocked Working Sunday</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-200 text-indigo-900 border border-indigo-300">
                    KMEB Exam Session Active
                  </span>
                </h4>
                <div className="inline-block mt-1 px-3 py-1 bg-indigo-200 text-indigo-950 text-xs font-bold rounded-lg border border-indigo-300">
                  {getSpecialWorkingDay(selectedDate, selectedClassId)?.reason || 'KMEB Board Examination Session'}
                </div>
              </div>
              <p className="text-xs text-indigo-900 max-w-lg mx-auto leading-relaxed">
                This Sunday is officially unlocked as an active working day for <strong>{selectedClass?.name}</strong>. Attendance marking is enabled and counts toward official working days.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => handleRevokeSunday(selectedDate)}
                  className="px-4 py-2 text-xs font-bold text-indigo-950 bg-white hover:bg-indigo-100 border border-indigo-300 rounded-xl transition cursor-pointer shadow-2xs"
                >
                  Re-lock to Default Sunday Closure
                </button>
              </div>
            </div>
          )}

          {/* Prominent Banner on Holiday or Sunday Default Closure */}
          {isDailyHoliday && (
            <div className="bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 rounded-2xl border-2 border-amber-300 p-6 text-center space-y-3 shadow-xs">
              <div className="w-12 h-12 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center text-2xl mx-auto shadow-2xs">
                {dailyHolidayInfo?.isSundayClosure ? '🗓️' : '🏖️'}
              </div>
              <div>
                <h4 className="text-base font-bold text-amber-950">
                  {dailyHolidayInfo?.isSundayClosure ? '🗓️ Sunday Default Weekly Closure' : '🏖️ Official Holiday / Non-Working Day'}
                </h4>
                <div className="inline-block mt-1 px-3 py-1 bg-amber-200 text-amber-950 text-xs font-bold rounded-lg border border-amber-300">
                  {dailyHolidayInfo?.reason || 'Official Holiday / Non-Working Day'}
                </div>
              </div>
              <p className="text-xs text-amber-900 max-w-lg mx-auto leading-relaxed">
                {dailyHolidayInfo?.isSundayClosure
                  ? `Sunday (${selectedDate}) is an official weekly holiday across the portal. Attendance marking is disabled by default.`
                  : `Madrasa is officially closed for ${selectedClass?.name} on ${selectedDate}. Student attendance is strictly exempt, working days are deducted, and attendance percentages remain safeguarded.`}
              </p>
              <div className="pt-2 flex items-center justify-center gap-3">
                {dailyHolidayInfo?.isSundayClosure ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSundayUnlockDate(selectedDate);
                      setSundayUnlockTargetClasses(['all']);
                      setSundayUnlockReason('KMEB Board Examination Session');
                      setShowSundayUnlockModal(true);
                    }}
                    className="px-4 py-2 text-xs font-bold text-white bg-indigo-700 hover:bg-indigo-800 border border-indigo-800 rounded-xl transition cursor-pointer shadow-2xs flex items-center gap-1.5"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>Unlock This Sunday as Working Day (e.g., KMEB Examination)</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleRemoveHoliday(dailyHolidayInfo?.id || selectedDate, selectedDate)}
                    className="px-4 py-2 text-xs font-bold text-amber-950 bg-white hover:bg-amber-100 border border-amber-300 rounded-xl transition cursor-pointer shadow-2xs"
                  >
                    Remove Holiday &amp; Restore Regular Working Day
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Student Daily List */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
              <div>
                <span className="text-xs font-bold text-slate-700">
                  Enrolled Students in {selectedClass?.name} ({classStudents.length})
                </span>
                <span className="text-[11px] text-slate-400 block sm:inline sm:ml-2">
                  {isDailyHoliday
                    ? '🏖️ Official Holiday: Checkboxes disabled, attendance exempt.'
                    : isDailyLocked
                    ? 'Locked. Click "Unlock to Edit" above to make authorized changes.'
                    : 'Click button to toggle status. Roll No and Student Name remain frozen while scrolling.'}
                </span>
              </div>

              {/* View Layout Switcher */}
              <div className="inline-flex p-0.5 bg-slate-100 rounded-lg border border-slate-200 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setDailyViewLayout('table')}
                  className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                    dailyViewLayout === 'table'
                      ? 'bg-emerald-800 text-white shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Roster Table
                </button>
                <button
                  type="button"
                  onClick={() => setDailyViewLayout('cards')}
                  className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                    dailyViewLayout === 'cards'
                      ? 'bg-emerald-800 text-white shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Card Grid
                </button>
              </div>
            </div>

            {classStudents.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-xs">
                No active students found in this class.
              </div>
            ) : dailyViewLayout === 'table' ? (
              <div
                onWheel={handleHorizontalWheel}
                className="overflow-x-auto relative w-full scrollbar-thin rounded-xl border border-slate-200"
              >
                <table className="w-full text-left text-xs min-w-[660px] border-collapse">
                  <thead className="sticky top-0 bg-slate-100 z-30">
                    <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                      <th className="py-3 px-3 text-center w-12 font-mono sticky left-0 bg-slate-100 z-40 shadow-[1px_0_0_0_#e5e7eb]">
                        Roll
                      </th>
                      <th className="py-3 px-4 min-w-[180px] md:min-w-[220px] sticky left-12 bg-slate-100 z-40 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                        Student Name
                      </th>
                      <th className="py-3 px-2 w-20 text-center font-mono">Adm No</th>
                      <th className="py-3 px-2 w-16 text-center">Gender</th>
                      <th className="py-3 px-4 text-center min-w-[150px]">Attendance Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {classStudents.map(st => {
                      const isPresent = dailyStatusMap[st.id] !== false;

                      return (
                        <tr
                          key={st.id}
                          className={`transition group ${
                            isDailyHoliday
                              ? 'bg-amber-50/30'
                              : isPresent
                              ? 'bg-white hover:bg-slate-50/80'
                              : 'bg-rose-50/30 hover:bg-rose-50/60'
                          }`}
                        >
                          <td
                            className={`py-3 px-3 text-center font-mono font-bold text-slate-700 w-12 sticky left-0 z-20 shadow-[1px_0_0_0_#e5e7eb] ${
                              isDailyHoliday
                                ? 'bg-amber-50 group-hover:bg-amber-100'
                                : isPresent
                                ? 'bg-white group-hover:bg-slate-50'
                                : 'bg-rose-50/70 group-hover:bg-rose-100/70'
                            }`}
                          >
                            {st.rollNo}
                          </td>
                          <td
                            className={`py-3 px-4 whitespace-nowrap min-w-[180px] md:min-w-[220px] sticky left-12 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${
                              isDailyHoliday
                                ? 'bg-amber-50 group-hover:bg-amber-100'
                                : isPresent
                                ? 'bg-white group-hover:bg-slate-50'
                                : 'bg-rose-50/70 group-hover:bg-rose-100/70'
                            }`}
                          >
                            <span className="font-bold text-slate-900 block">{st.nameEn}</span>
                            {st.nameMl && (
                              <div className="text-[11px] text-slate-500 font-ml leading-tight mt-0.5">
                                {st.nameMl}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-2 text-center font-mono font-bold text-slate-700 w-20">
                            {st.admissionNo}
                          </td>
                          <td className="py-3 px-2 text-center w-16">
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                st.gender === 'F' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'
                              }`}
                            >
                              {st.gender || 'M'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            {isDailyHoliday ? (
                              <span className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-amber-100 text-amber-950 border border-amber-300 inline-block">
                                🏖️ Exempt (Holiday)
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={isDailyLocked}
                                onClick={() => toggleDailyStudent(st.id)}
                                className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all inline-flex items-center justify-center gap-1.5 min-w-[120px] ${
                                  isDailyLocked
                                    ? isPresent
                                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300 opacity-90 cursor-not-allowed'
                                      : 'bg-rose-100 text-rose-800 border-rose-300 opacity-90 cursor-not-allowed'
                                    : isPresent
                                    ? 'bg-emerald-700 hover:bg-emerald-800 text-white border-emerald-800 shadow-2xs cursor-pointer'
                                    : 'bg-white hover:bg-rose-50 text-rose-600 border-rose-300 cursor-pointer'
                                }`}
                              >
                                {isPresent ? (
                                  <>
                                    <Check className="w-4 h-4 stroke-[3]" />
                                    <span>Present</span>
                                  </>
                                ) : (
                                  <>
                                    <X className="w-4 h-4 stroke-[3]" />
                                    <span>Absent</span>
                                  </>
                                )}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
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
                            🏖️ Exempt
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
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 3: WEEKLY ATTENDANCE GRID */}
      {activeSubTab === 'weekly' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  const monday = parseLocalDate(getWeekMondayStr(selectedWeekDate));
                  monday.setDate(monday.getDate() - 7);
                  const prev = formatLocalDate(monday);
                  if (prev >= ACADEMIC_YEAR_START_DATE) {
                    setSelectedWeekDate(prev);
                  }
                }}
                disabled={getWeekMondayStr(selectedWeekDate) <= ACADEMIC_YEAR_START_DATE}
                className={`p-2 rounded-xl border border-slate-200 transition ${
                  getWeekMondayStr(selectedWeekDate) <= ACADEMIC_YEAR_START_DATE
                    ? 'bg-slate-100 text-slate-300 opacity-40 cursor-not-allowed'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer'
                }`}
                title="Previous Week"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="text-xs font-bold bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 font-mono">
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
            <div
              onWheel={handleHorizontalWheel}
              className="overflow-x-auto w-full scrollbar-thin relative"
            >
              <table className="w-full text-left text-xs min-w-[780px] border-collapse">
                <thead className="sticky top-0 bg-slate-100 z-30">
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <th className="py-3 px-3 text-center w-12 font-mono sticky left-0 bg-slate-100 z-40 shadow-[1px_0_0_0_#e5e7eb]">Roll</th>
                    <th className="py-3 px-4 min-w-[180px] md:min-w-[220px] sticky left-12 bg-slate-100 z-40 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Student Name</th>
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
                      <tr key={st.id} className="hover:bg-slate-50 transition group">
                        <td className="py-3 px-3 text-center font-mono font-bold text-slate-600 w-12 sticky left-0 z-20 shadow-[1px_0_0_0_#e5e7eb] bg-white group-hover:bg-slate-50">
                          {st.rollNo}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap min-w-[180px] md:min-w-[220px] sticky left-12 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] bg-white group-hover:bg-slate-50">
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

      {/* SUB-TAB 4: INSTITUTION HOLIDAYS & NON-WORKING DAYS (EXCLUSIVE PRINCIPAL INTERFACE) */}
      {activeSubTab === 'holidays' && (
        <div className="space-y-6">
          {/* Add Holiday Card with Class-Specific Target Selector */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 border border-amber-300 flex items-center justify-center text-xl">
                🏖️
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Designate Institution Holiday / Non-Working Day
                </h3>
                <p className="text-xs text-slate-500">
                  Select date, target classes (All Classes or specific grades like Class 7 &amp; 9), and reason. Automatically adjusts working day counts and attendance percentages.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Select Date:</label>
                <input
                  type="date"
                  value={newHolidayDate}
                  min={ACADEMIC_YEAR_START_DATE}
                  onChange={e => setNewHolidayDate(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-bold bg-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="md:col-span-2 space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Holiday Title / Reason:</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newHolidayReason}
                    onChange={e => setNewHolidayReason(e.target.value)}
                    placeholder="e.g. Public Holiday, Special Madrasa Holiday, Rain Holiday, Study Leave, Eid / Milad"
                    className="flex-1 p-2.5 border border-slate-300 rounded-xl text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleDeclareHoliday(newHolidayDate, newHolidayReason, newHolidayTargetClasses)}
                    disabled={isSavingHoliday || !newHolidayDate}
                    className="px-5 py-2.5 text-xs font-bold text-amber-950 bg-amber-300 hover:bg-amber-400 border border-amber-400 rounded-xl transition shadow-xs cursor-pointer whitespace-nowrap disabled:opacity-50"
                  >
                    {isSavingHoliday ? 'Designating...' : 'Declare Holiday'}
                  </button>
                </div>
              </div>
            </div>

            {/* Target Classes Selector */}
            <div className="space-y-1.5 pt-1">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <label className="text-xs font-bold text-slate-700">Target Classes:</label>
                <span className="text-[11px] text-slate-500">
                  {newHolidayTargetClasses.includes('all')
                    ? 'Applies Institution-wide to All Classes (1–9)'
                    : `Applies specifically to ${newHolidayTargetClasses.length} selected class(es)`}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 items-center">
                <button
                  type="button"
                  onClick={() => setNewHolidayTargetClasses(['all'])}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition cursor-pointer ${
                    newHolidayTargetClasses.includes('all')
                      ? 'bg-emerald-800 text-white border-emerald-900 shadow-xs'
                      : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                  }`}
                >
                  All Classes (Institution-wide)
                </button>
                {classes.map(c => {
                  const isSelected = !newHolidayTargetClasses.includes('all') && newHolidayTargetClasses.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        if (newHolidayTargetClasses.includes('all')) {
                          setNewHolidayTargetClasses([c.id]);
                        } else {
                          if (isSelected) {
                            const rem = newHolidayTargetClasses.filter(id => id !== c.id);
                            setNewHolidayTargetClasses(rem.length === 0 ? ['all'] : rem);
                          } else {
                            setNewHolidayTargetClasses([...newHolidayTargetClasses, c.id]);
                          }
                        }
                      }}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition cursor-pointer ${
                        isSelected
                          ? 'bg-amber-300 text-amber-950 border-amber-400 font-bold shadow-2xs'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quick Suggestion Chips (Strictly WITHOUT Friday Holiday) */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[11px] font-bold text-slate-500">Quick Suggestions:</span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'Public Holiday',
                  'Special Madrasa Holiday',
                  'Rain Holiday',
                  'Study Leave',
                  'Eid / Milad',
                  'Ramadan Break',
                  'Board Exam Preparation',
                ].map(preset => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setNewHolidayReason(preset)}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition cursor-pointer ${
                      newHolidayReason === preset
                        ? 'bg-amber-100 text-amber-950 border-amber-400 font-bold'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* PRINCIPAL EXCLUSIVE: WORKING SUNDAY OVERRIDE CARD */}
          <div className="bg-gradient-to-br from-indigo-50/80 via-purple-50/40 to-indigo-50/80 rounded-2xl border-2 border-indigo-200 p-6 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-100 border border-indigo-300 flex items-center justify-center text-xl">
                  ⭐
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900">
                      Principal Exclusive: Unlock Sunday as Working Day (e.g., KMEB Examination)
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-200 text-indigo-900 border border-indigo-300">
                      Board Exam Override
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Sundays are default closed across the portal. Unlocking a specific Sunday enables teacher attendance and adds that date to official working days for the selected classes.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSundayUnlockDate('');
                  setSundayUnlockTargetClasses(['all']);
                  setSundayUnlockReason('KMEB Board Examination Session');
                  setShowSundayUnlockModal(true);
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-indigo-800 hover:bg-indigo-900 border border-indigo-900 rounded-xl transition shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Unlock className="w-3.5 h-3.5" />
                <span>Unlock Sunday as Working Day</span>
              </button>
            </div>

            {/* List of currently unlocked Sundays */}
            {Object.keys(specialWorkingDays).length > 0 && (
              <div className="pt-2 border-t border-indigo-100 space-y-2">
                <span className="text-xs font-bold text-indigo-950 block">
                  Currently Active Working Sunday Overrides ({Object.keys(specialWorkingDays).length}):
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {Object.values(specialWorkingDays).map(sw => {
                    const isAll = !sw.targetClasses || sw.targetClasses.includes('all');
                    const targetNames = isAll
                      ? 'All Classes'
                      : sw.targetClasses.map(id => classes.find(c => c.id === id)?.name || id.replace(/^(cls_|class_)/i, 'Class ')).join(', ');

                    return (
                      <div
                        key={sw.id || sw.date}
                        className="bg-white p-3.5 rounded-xl border border-indigo-200 flex items-center justify-between gap-3 shadow-2xs"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-bold text-indigo-950 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                              Sunday: {sw.date}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-200">
                              {targetNames}
                            </span>
                          </div>
                          <div className="text-xs font-semibold text-slate-800 mt-1 truncate">
                            {sw.reason}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            Unlocked by {sw.unlockedBy || 'Principal ASLAM TK'}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRevokeSunday(sw.date)}
                          className="px-3 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition shrink-0 cursor-pointer"
                        >
                          Restore Normal Sunday Closure
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* List of Declared Holidays */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span>🏖️</span>
                  <span>Currently Declared Institution Holidays ({allHolidaysList.length})</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  These dates are exempt from attendance in Admin, Teacher, and Parent portals for their targeted classes.
                </p>
              </div>
            </div>

            <div className="divide-y divide-slate-100 text-xs">
              {allHolidaysList.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  No institution holidays currently declared. Use the form above to add one.
                </div>
              ) : (
                allHolidaysList.map(h => {
                  const isAll = !h.targetClasses || h.targetClasses.includes('all');
                  const targetLabel = isAll
                    ? 'All Classes'
                    : (h.targetClasses || []).map(cId => classes.find(c => c.id === cId)?.name || cId.replace(/^(cls_|class_)/i, 'Class ')).join(', ');

                  return (
                    <div key={h.id || h.date} className="p-4 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50 transition">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-900 border border-amber-200 font-mono font-bold text-xs flex flex-col items-center justify-center shrink-0">
                          <span>{h.date.split('-')[2]}</span>
                          <span className="text-[9px] uppercase">{new Date(h.date).toLocaleDateString([], { month: 'short' })}</span>
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 text-sm flex items-center gap-2 flex-wrap">
                            <span>{h.reason}</span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-bold">
                              {h.date}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                isAll
                                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                  : 'bg-amber-100 text-amber-950 border-amber-300'
                              }`}
                            >
                              Target: {targetLabel}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Designated by: <span className="font-bold text-slate-700">{h.markedBy || h.createdBy || 'Principal'}</span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveHoliday(h.id || h.date, h.date)}
                        className="px-3.5 py-1.5 text-xs font-bold text-amber-950 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Restore Regular Working Day</span>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 5: ATTENDANCE UNLOCK / EDIT REQUEST APPROVALS */}
      {activeSubTab === 'requests' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Unlock className="w-5 h-5 text-emerald-800" />
                  <span>Teacher Attendance Edit &amp; Unlock Requests</span>
                </h3>
                {pendingRequestsCount > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-white animate-pulse">
                    {pendingRequestsCount} Pending
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                When a teacher submits an edit request for a locked attendance date, it appears here for Principal review. Approving unlocks the record in Firestore so the teacher can save corrections.
              </p>
            </div>

            {/* Filter Buttons */}
            <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-bold">
              {(['all', 'pending', 'approved', 'rejected'] as const).map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setRequestFilter(f)}
                  className={`px-3 py-1.5 rounded-lg transition capitalize cursor-pointer ${
                    requestFilter === f
                      ? 'bg-emerald-800 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {f} {f === 'pending' && pendingRequestsCount > 0 ? `(${pendingRequestsCount})` : ''}
                </button>
              ))}
            </div>
          </div>

          {/* Requests List */}
          <div className="space-y-3">
            {filteredEditRequests.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 text-xs shadow-xs">
                No attendance edit requests matching filter &quot;{requestFilter}&quot;.
              </div>
            ) : (
              filteredEditRequests.map(req => {
                const isPending = req.status === 'pending';
                const isApproved = req.status === 'approved';
                const isRejected = req.status === 'rejected';

                return (
                  <div
                    key={req.id}
                    className={`bg-white rounded-2xl border p-5 shadow-xs transition space-y-3 ${
                      isPending
                        ? 'border-amber-300 ring-2 ring-amber-100'
                        : isApproved
                        ? 'border-emerald-200 bg-emerald-50/20'
                        : 'border-slate-200 opacity-80'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900 text-sm">
                            {req.className || `Class ${req.classId}`}
                          </span>
                          <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-200">
                            Date: {req.date}
                          </span>
                          {isPending && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-950 border border-amber-300">
                              <Clock className="w-3 h-3 text-amber-700 animate-spin" />
                              Pending Principal Approval
                            </span>
                          )}
                          {isApproved && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-950 border border-emerald-300">
                              <CheckCircle className="w-3 h-3 text-emerald-700" />
                              Approved &amp; Unlocked
                            </span>
                          )}
                          {isRejected && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-950 border border-rose-300">
                              <X className="w-3 h-3 text-rose-700" />
                              Request Rejected
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-slate-600 mt-1">
                          Teacher: <span className="font-bold text-slate-800">{req.teacherName}</span> · Submitted: <span className="font-mono text-slate-500">{new Date(req.requestedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
                        </div>
                      </div>

                      {/* Action buttons for pending requests */}
                      {isPending && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleRejectUnlockRequest(req)}
                            disabled={isProcessingRequest === req.id}
                            className="px-3.5 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-300 rounded-xl transition cursor-pointer disabled:opacity-50"
                          >
                            Reject
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApproveUnlockRequest(req)}
                            disabled={isProcessingRequest === req.id}
                            className="px-4 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 border border-emerald-800 rounded-xl transition shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                          >
                            <Unlock className="w-3.5 h-3.5" />
                            <span>Approve &amp; Unlock</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Reason text */}
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-800">
                      <span className="font-bold text-slate-600 block mb-0.5">Reason for Edit:</span>
                      <p className="italic text-slate-700">{req.reason || 'No specific reason provided.'}</p>
                    </div>

                    {req.resolutionNote && (
                      <div className="text-[11px] text-slate-500 italic">
                        Principal Note: {req.resolutionNote}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* HOLIDAY DESIGNATION POPUP MODAL */}
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

            <form
              onSubmit={e => {
                e.preventDefault();
                handleDeclareHoliday(holidayModalDate, holidayReasonInput);
              }}
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Holiday Reason / Title
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
                  Marking this date will subtract 1 day from the class working days count. Students are NOT penalized as absent.
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
