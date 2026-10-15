import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  TeacherAssignment,
  ClassItem,
  SubjectItem,
  Examination,
  MarkSheet,
  Student,
  sortStudentsBoysFirst,
  TUITION_FEE_MONTHS,
  FeePayment,
  ClassAttendanceConfig,
  DailyAttendanceRecord,
} from '../../types';
import { MarkEntryScreen } from './MarkEntryScreen';
import { db, handleFirestoreError, OperationType } from '../../services/firebase';
import { collection, onSnapshot, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { cleanForFirestore } from '../../services/firestoreSync';
import {
  BookOpen,
  Users,
  Clock,
  CheckCircle,
  AlertCircle,
  Lock,
  Edit3,
  Shield,
  Layers,
  GraduationCap,
  Calendar,
  Sparkles,
  CreditCard,
  Save,
  CalendarCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  CheckCheck,
  RotateCcw,
} from 'lucide-react';

export const TeacherDashboard: React.FC = () => {
  const { user, fetchWithAuth, lang, t } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'my_assignments' | 'my_class' | 'attendance'>('my_assignments');
  const [assignments, setAssignments] = useState<TeacherAssignment[]>(() => {
    const raw = (user as any)?.assignedSubjects || user?.assignments;
    return Array.isArray(raw) ? raw : [];
  });
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [examinations, setExaminations] = useState<Examination[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [markSheets, setMarkSheets] = useState<MarkSheet[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [currentTeacherInChargeClassId, setCurrentTeacherInChargeClassId] = useState<string | undefined>(user?.inChargeClassId);

  // In-charge Class Attendance & Fee Tracking
  const [attendanceTotalWorkingDays, setAttendanceTotalWorkingDays] = useState<number>(88);
  const [studentDaysAttendedMap, setStudentDaysAttendedMap] = useState<Record<string, number>>({});
  const [isSavingAttendance, setIsSavingAttendance] = useState(false);
  const [attendanceSaved, setAttendanceSaved] = useState(false);
  const [classFeePayments, setClassFeePayments] = useState<FeePayment[]>([]);

  // Comprehensive Attendance Management System State
  const [attendanceClassId, setAttendanceClassId] = useState<string>('');
  const [attendanceMode, setAttendanceMode] = useState<'daily' | 'weekly'>('daily');
  const [selectedAttendanceDate, setSelectedAttendanceDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [selectedWeekDate, setSelectedWeekDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [dailyStatusMap, setDailyStatusMap] = useState<Record<string, boolean>>({});
  const [weeklyStatusMap, setWeeklyStatusMap] = useState<Record<string, Record<string, boolean>>>({});
  const [classAttendanceConfig, setClassAttendanceConfig] = useState<ClassAttendanceConfig | null>(null);
  const [allAttendanceConfigs, setAllAttendanceConfigs] = useState<ClassAttendanceConfig[]>([]);
  const [isSavingDaily, setIsSavingDaily] = useState(false);
  const [dailySaveSuccess, setDailySaveSuccess] = useState(false);
  const [isSavingWeekly, setIsSavingWeekly] = useState(false);
  const [weeklySaveSuccess, setWeeklySaveSuccess] = useState(false);

  // Active Mark Entry Selection
  const [activeEntry, setActiveEntry] = useState<{
    classId: string;
    subjectId: string;
    examinationId: string;
  } | null>(null);

  const isMl = lang === 'ml';

  const loadData = async () => {
    setLoading(true);
    try {
      const [resAuth, resClasses, resSubjects, resExams, resStudents] = await Promise.all([
        fetchWithAuth('/api/auth/me'),
        fetchWithAuth('/api/classes'),
        fetchWithAuth('/api/subjects'),
        fetchWithAuth('/api/examinations'),
        fetchWithAuth('/api/students'),
      ]);

      const authData = await resAuth.json();
      const clsData: ClassItem[] = await resClasses.json();
      const subData: SubjectItem[] = await resSubjects.json();
      const examData: Examination[] = await resExams.json();
      const stuData: Student[] = await resStudents.json();

      let currentAssignments: TeacherAssignment[] = authData.assignments || [];

      // DIRECT CLOUD SYNC: Fetch teacher profile directly from Firestore on mount/load
      const teacherId = user?.id || authData.user?.id;
      const teacherUsername = user?.username || authData.user?.username;

      if (teacherId) {
        try {
          const tDocRef = doc(db, 'teachers', teacherId);
          const tDocSnap = await getDoc(tDocRef);
          if (tDocSnap.exists()) {
            const tData = tDocSnap.data();
            const rawSubs = Array.isArray(tData.assignedSubjects)
              ? tData.assignedSubjects
              : (Array.isArray(tData.assignments) ? tData.assignments : []);
            if (rawSubs.length > 0) {
              currentAssignments = rawSubs.map((a: any, idx: number) => ({
                id: a.id || `asg_${teacherId}_${idx}`,
                teacherId: a.teacherId || teacherId,
                classId: a.classId,
                subjectId: a.subjectId,
              }));
            }
            if (tData.inChargeClassId !== undefined) {
              setCurrentTeacherInChargeClassId(tData.inChargeClassId || undefined);
            }
          } else {
            // Fallback collection scan if teacher was stored under different ID or username
            const allTeachersSnap = await getDocs(collection(db, 'teachers'));
            const matched = allTeachersSnap.docs.find(d => d.id === teacherId || d.data().username === teacherUsername);
            if (matched) {
              const tData = matched.data();
              const rawSubs = Array.isArray(tData.assignedSubjects)
                ? tData.assignedSubjects
                : (Array.isArray(tData.assignments) ? tData.assignments : []);
              if (rawSubs.length > 0) {
                currentAssignments = rawSubs.map((a: any, idx: number) => ({
                  id: a.id || `asg_${matched.id}_${idx}`,
                  teacherId: a.teacherId || matched.id,
                  classId: a.classId,
                  subjectId: a.subjectId,
                }));
              }
              if (tData.inChargeClassId !== undefined) {
                setCurrentTeacherInChargeClassId(tData.inChargeClassId || undefined);
              }
            }
          }
        } catch (fErr) {
          console.error('Error fetching teacher profile directly from Firestore:', fErr);
        }
      }

      setAssignments(currentAssignments);
      setClasses(clsData);
      setSubjects(subData);
      setExaminations(examData);
      setAllStudents(sortStudentsBoysFirst(stuData));
      if (authData.user?.inChargeClassId !== undefined) {
        setCurrentTeacherInChargeClassId(authData.user.inChargeClassId);
      }

      const targetInChargeId = authData.user?.inChargeClassId !== undefined ? authData.user.inChargeClassId : currentAssignments[0]?.classId;
      if (targetInChargeId) {
        try {
          const [resAtt, resFees] = await Promise.all([
            fetchWithAuth(`/api/attendance/class/${targetInChargeId}`),
            fetchWithAuth(`/api/fees/payments?classId=${targetInChargeId}`),
          ]);
          if (resAtt.ok) {
            const att = await resAtt.json();
            if (att.totalWorkingDays) setAttendanceTotalWorkingDays(att.totalWorkingDays);
            if (att.studentDaysAttended) setStudentDaysAttendedMap(att.studentDaysAttended);
          }
          if (resFees.ok) {
            const fees = await resFees.json();
            setClassFeePayments(fees);
          }
        } catch (fErr) {
          console.warn('Error loading in-charge attendance & fees:', fErr);
        }
      }

      const activeExam = examData[0];
      if (activeExam) {
        setSelectedExamId(activeExam.id);
        const resSheets = await fetchWithAuth(`/api/mark-sheets?examinationId=${activeExam.id}`);
        if (resSheets.ok) {
          const sheetsData = await resSheets.json();
          setMarkSheets(sheetsData);
        }
      }
    } catch (err) {
      console.error('Error loading teacher data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Real-time onSnapshot listeners for subjects, classes, students, and teachers
    const unsubs: (() => void)[] = [];

    try {
      const unsubSubs = onSnapshot(
        collection(db, 'subjects'),
        snapshot => {
          if (!snapshot.empty) {
            const remoteSubs = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as SubjectItem));
            setSubjects(remoteSubs);
          }
        },
        error => {
          console.error('Firestore subjects onSnapshot listener error:', error);
          handleFirestoreError(error, OperationType.GET, 'subjects');
        }
      );
      unsubs.push(unsubSubs);

      const unsubCls = onSnapshot(
        collection(db, 'classes'),
        snapshot => {
          if (!snapshot.empty) {
            const remoteCls = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as ClassItem));
            remoteCls.sort((a, b) => a.numericGrade - b.numericGrade);
            setClasses(remoteCls);
          }
        },
        error => {
          console.error('Firestore classes onSnapshot listener error:', error);
          handleFirestoreError(error, OperationType.GET, 'classes');
        }
      );
      unsubs.push(unsubCls);

      const unsubStu = onSnapshot(
        collection(db, 'students'),
        snapshot => {
          if (!snapshot.empty) {
            const remoteStu = snapshot.docs.map(d => {
              const data = d.data();
              const regNos = {
                ...((data as any).examRegisterNumbers || {}),
                ...((data as any).examRegisterNos || {}),
              };
              if ((data as any).examRegNo && Object.keys(regNos).length === 0) {
                regNos[selectedExamId || 'default'] = (data as any).examRegNo;
              }
              return {
                ...data,
                id: d.id,
                examRegisterNumbers: regNos,
                examRegisterNos: regNos,
                examRegNo:
                  (data as any).examRegNo ||
                  (data as any).examRegisterNos?.[selectedExamId] ||
                  regNos[selectedExamId] ||
                  '',
              } as Student;
            });
            setAllStudents(sortStudentsBoysFirst(remoteStu));
          }
        },
        error => {
          console.error('Firestore students onSnapshot listener error:', error);
          handleFirestoreError(error, OperationType.GET, 'students');
        }
      );
      unsubs.push(unsubStu);

      const handleStudentsUpdated = (e: any) => {
        const list = e.detail;
        if (Array.isArray(list)) {
          setAllStudents(sortStudentsBoysFirst(list));
        }
      };
      window.addEventListener('madrasa_students_updated', handleStudentsUpdated);
      unsubs.push(() => window.removeEventListener('madrasa_students_updated', handleStudentsUpdated));

      // Real-time teacher assignments listener
      const unsubTeachers = onSnapshot(
        collection(db, 'teachers'),
        snapshot => {
          if (!snapshot.empty && (user?.id || user?.username)) {
            const currentT = snapshot.docs.find(d => d.id === user?.id || d.data().username === user?.username);
            if (currentT) {
              const tData = currentT.data();
              if (tData.inChargeClassId !== undefined) {
                setCurrentTeacherInChargeClassId(tData.inChargeClassId || undefined);
              }
              const rawSubs = Array.isArray(tData.assignedSubjects)
                ? tData.assignedSubjects
                : (Array.isArray(tData.assignments) ? tData.assignments : []);

              const mappedAsgs: TeacherAssignment[] = rawSubs.map((a: any, idx: number) => ({
                id: a.id || `asg_${currentT.id}_${idx}`,
                teacherId: a.teacherId || currentT.id,
                classId: a.classId,
                subjectId: a.subjectId,
              }));
              setAssignments(mappedAsgs);
            }
          }
        },
        error => {
          console.error('Firestore teachers onSnapshot listener error:', error);
          handleFirestoreError(error, OperationType.GET, 'teachers');
        }
      );
      unsubs.push(unsubTeachers);

      // Direct document listener on specific teacher profile
      if (user?.id) {
        const unsubDoc = onSnapshot(
          doc(db, 'teachers', user.id),
          docSnap => {
            if (docSnap.exists()) {
              const tData = docSnap.data();
              if (tData.inChargeClassId !== undefined) {
                setCurrentTeacherInChargeClassId(tData.inChargeClassId || undefined);
              }
              const rawSubs = Array.isArray(tData.assignedSubjects)
                ? tData.assignedSubjects
                : (Array.isArray(tData.assignments) ? tData.assignments : []);

              const mappedAsgs: TeacherAssignment[] = rawSubs.map((a: any, idx: number) => ({
                id: a.id || `asg_${user.id}_${idx}`,
                teacherId: a.teacherId || user.id,
                classId: a.classId,
                subjectId: a.subjectId,
              }));
              setAssignments(mappedAsgs);
            }
          },
          err => {
            console.error('Firestore direct teacher doc listener error:', err);
          }
        );
        unsubs.push(unsubDoc);
      }

      // Real-time Firestore Attendance listener
      const unsubAttendance = onSnapshot(
        collection(db, 'attendance'),
        snapshot => {
          if (!snapshot.empty) {
            const configs = snapshot.docs.map(d => ({ ...d.data(), classId: d.id } as ClassAttendanceConfig));
            setAllAttendanceConfigs(configs);
          }
        },
        error => {
          console.error('Firestore attendance onSnapshot error:', error);
        }
      );
      unsubs.push(unsubAttendance);
    } catch (e) {
      console.error('Failed to attach Teacher Portal real-time listeners:', e);
    }

    return () => {
      unsubs.forEach(u => {
        try {
          u();
        } catch {}
      });
    };
  }, [user?.id, user?.username]);

  const handleExamChange = async (examId: string) => {
    setSelectedExamId(examId);
    const resSheets = await fetchWithAuth(`/api/mark-sheets?examinationId=${examId}`);
    if (resSheets.ok) {
      const sheetsData = await resSheets.json();
      setMarkSheets(sheetsData);
    }
  };

  const handleSaveAttendance = async (targetClassId: string) => {
    setIsSavingAttendance(true);
    setAttendanceSaved(false);
    try {
      const res = await fetchWithAuth(`/api/attendance/class/${targetClassId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          totalWorkingDays: attendanceTotalWorkingDays,
          studentDaysAttended: studentDaysAttendedMap,
        }),
      });
      if (!res.ok) throw new Error('Failed to save attendance');
      setAttendanceSaved(true);
      setTimeout(() => setAttendanceSaved(false), 3000);
      alert('Class attendance roster saved successfully! Total working days and student attendance recorded.');
    } catch (err: any) {
      alert(err.message || 'Error saving attendance');
    } finally {
      setIsSavingAttendance(false);
    }
  };

  // Set default attendanceClassId when classes or in-charge class load
  useEffect(() => {
    if (!attendanceClassId) {
      const defaultId = currentTeacherInChargeClassId || user?.inChargeClassId || (assignments.length > 0 ? assignments[0].classId : (classes[0]?.id || ''));
      if (defaultId) setAttendanceClassId(defaultId);
    }
  }, [currentTeacherInChargeClassId, user?.inChargeClassId, assignments, classes, attendanceClassId]);

  // Sync classAttendanceConfig when attendanceClassId or allAttendanceConfigs changes
  useEffect(() => {
    if (!attendanceClassId) return;
    const cfg = allAttendanceConfigs.find(c => c.classId === attendanceClassId);
    if (cfg) {
      setClassAttendanceConfig(cfg);
      if (cfg.totalWorkingDays) setAttendanceTotalWorkingDays(cfg.totalWorkingDays);
      if (cfg.studentDaysAttended) setStudentDaysAttendedMap(cfg.studentDaysAttended);
    } else {
      setClassAttendanceConfig({
        classId: attendanceClassId,
        totalWorkingDays: 88,
        studentDaysAttended: {},
        dailyRecords: {},
      });
    }
  }, [attendanceClassId, allAttendanceConfigs]);

  // Helper to compute 6 days of the week (Monday through Saturday)
  const getWeekDays = (baseDateStr: string) => {
    const d = new Date(baseDateStr);
    if (isNaN(d.getTime())) return [];
    const day = d.getDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(d);
    monday.setDate(d.getDate() + diffToMonday);

    const days: { dateStr: string; dayName: string; dayNameMl: string; shortDate: string }[] = [];
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayNamesMl = ['തിങ്കൾ', 'ചൊവ്വ', 'ബുധൻ', 'വ്യാഴം', 'വെള്ളി', 'ശനി'];

    for (let i = 0; i < 6; i++) {
      const cur = new Date(monday);
      cur.setDate(monday.getDate() + i);
      const dateStr = cur.toISOString().split('T')[0];
      const shortDate = `${cur.getDate()} ${cur.toLocaleString('default', { month: 'short' })}`;
      days.push({
        dateStr,
        dayName: dayNames[i],
        dayNameMl: dayNamesMl[i],
        shortDate,
      });
    }
    return days;
  };

  // Sync dailyStatusMap when selectedAttendanceDate, attendanceClassId, classAttendanceConfig, or allStudents change
  useEffect(() => {
    if (!attendanceClassId) return;
    const currentStudents = allStudents.filter(s => s.classId === attendanceClassId && s.status === 'active');
    const recordForDate = classAttendanceConfig?.dailyRecords?.[selectedAttendanceDate];

    const newMap: Record<string, boolean> = {};
    currentStudents.forEach(st => {
      if (recordForDate?.statusMap && recordForDate.statusMap[st.id] !== undefined) {
        newMap[st.id] = recordForDate.statusMap[st.id];
      } else if (recordForDate?.absentStudentIds && recordForDate.absentStudentIds.includes(st.id)) {
        newMap[st.id] = false;
      } else {
        // Default: Present
        newMap[st.id] = true;
      }
    });
    setDailyStatusMap(newMap);
  }, [selectedAttendanceDate, attendanceClassId, classAttendanceConfig, allStudents]);

  // Sync weeklyStatusMap when selectedWeekDate, attendanceClassId, classAttendanceConfig, or allStudents change
  useEffect(() => {
    if (!attendanceClassId) return;
    const currentStudents = allStudents.filter(s => s.classId === attendanceClassId && s.status === 'active');
    const weekDays = getWeekDays(selectedWeekDate);
    const newWeeklyMap: Record<string, Record<string, boolean>> = {};

    currentStudents.forEach(st => {
      newWeeklyMap[st.id] = {};
      weekDays.forEach(wDay => {
        const rec = classAttendanceConfig?.dailyRecords?.[wDay.dateStr];
        if (rec?.statusMap && rec.statusMap[st.id] !== undefined) {
          newWeeklyMap[st.id][wDay.dateStr] = rec.statusMap[st.id];
        } else if (rec?.absentStudentIds && rec.absentStudentIds.includes(st.id)) {
          newWeeklyMap[st.id][wDay.dateStr] = false;
        } else {
          // Default: Present
          newWeeklyMap[st.id][wDay.dateStr] = true;
        }
      });
    });
    setWeeklyStatusMap(newWeeklyMap);
  }, [selectedWeekDate, attendanceClassId, classAttendanceConfig, allStudents]);

  // Quick navigation helpers for dates
  const stepDailyDate = (offsetDays: number) => {
    const d = new Date(selectedAttendanceDate);
    d.setDate(d.getDate() + offsetDays);
    setSelectedAttendanceDate(d.toISOString().split('T')[0]);
  };

  const stepWeeklyDate = (offsetWeeks: number) => {
    const d = new Date(selectedWeekDate);
    d.setDate(d.getDate() + offsetWeeks * 7);
    setSelectedWeekDate(d.toISOString().split('T')[0]);
  };

  // Toggle single student in Daily view
  const toggleDailyStudent = (studentId: string) => {
    setDailyStatusMap(prev => ({
      ...prev,
      [studentId]: prev[studentId] === false ? true : false,
    }));
  };

  // Mark all present in Daily view
  const markAllDailyPresent = () => {
    const currentStudents = allStudents.filter(s => s.classId === attendanceClassId && s.status === 'active');
    const newMap: Record<string, boolean> = {};
    currentStudents.forEach(st => {
      newMap[st.id] = true;
    });
    setDailyStatusMap(newMap);
  };

  // Mark all absent in Daily view
  const markAllDailyAbsent = () => {
    const currentStudents = allStudents.filter(s => s.classId === attendanceClassId && s.status === 'active');
    const newMap: Record<string, boolean> = {};
    currentStudents.forEach(st => {
      newMap[st.id] = false;
    });
    setDailyStatusMap(newMap);
  };

  // Toggle student day in Weekly view
  const toggleWeeklyStudentDay = (studentId: string, dateStr: string) => {
    setWeeklyStatusMap(prev => {
      const studentMap = prev[studentId] || {};
      const currentVal = studentMap[dateStr] !== false;
      return {
        ...prev,
        [studentId]: {
          ...studentMap,
          [dateStr]: !currentVal,
        },
      };
    });
  };

  // Mark all present in Weekly view
  const markAllWeeklyPresent = () => {
    const currentStudents = allStudents.filter(s => s.classId === attendanceClassId && s.status === 'active');
    const weekDays = getWeekDays(selectedWeekDate);
    const newMap: Record<string, Record<string, boolean>> = {};
    currentStudents.forEach(st => {
      newMap[st.id] = {};
      weekDays.forEach(wDay => {
        newMap[st.id][wDay.dateStr] = true;
      });
    });
    setWeeklyStatusMap(newMap);
  };

  // Save Daily Attendance
  const handleSaveDailyAttendance = async () => {
    if (!attendanceClassId) return;
    setIsSavingDaily(true);
    setDailySaveSuccess(false);
    try {
      const currentStudents = sortStudentsBoysFirst(
        allStudents.filter(s => s.classId === attendanceClassId && s.status === 'active')
      );
      const presentStudentIds: string[] = [];
      const absentStudentIds: string[] = [];
      const statusMap: Record<string, boolean> = {};

      currentStudents.forEach(st => {
        const isPres = dailyStatusMap[st.id] !== false;
        statusMap[st.id] = isPres;
        if (isPres) presentStudentIds.push(st.id);
        else absentStudentIds.push(st.id);
      });

      const updatedDailyRecords = {
        ...(classAttendanceConfig?.dailyRecords || {}),
        [selectedAttendanceDate]: {
          date: selectedAttendanceDate,
          presentStudentIds,
          absentStudentIds,
          statusMap,
          markedAt: new Date().toISOString(),
          markedBy: user?.name || 'Class Teacher',
        },
      };

      const updatedDaysAttended: Record<string, number> = {
        ...(classAttendanceConfig?.studentDaysAttended || {}),
      };

      const distinctDates = Object.keys(updatedDailyRecords);
      const totalWorking = Math.max(distinctDates.length, attendanceTotalWorkingDays || 88);

      currentStudents.forEach(st => {
        let currentDays = updatedDaysAttended[st.id];
        if (currentDays === undefined) {
          currentDays = st.attendance?.daysAttended ?? Math.max(0, totalWorking - ((Number(st.rollNo || 1) * 3) % 4) - 2);
        }
        const prevRecord = classAttendanceConfig?.dailyRecords?.[selectedAttendanceDate];
        if (prevRecord) {
          const wasPresent = prevRecord.statusMap?.[st.id] !== false;
          const nowPresent = statusMap[st.id];
          if (wasPresent && !nowPresent) {
            currentDays = Math.max(0, currentDays - 1);
          } else if (!wasPresent && nowPresent) {
            currentDays = Math.min(totalWorking, currentDays + 1);
          }
        } else {
          if (!statusMap[st.id]) {
            currentDays = Math.max(0, currentDays - 1);
          }
        }
        updatedDaysAttended[st.id] = currentDays;
      });

      const updatedConfig: ClassAttendanceConfig = {
        classId: attendanceClassId,
        totalWorkingDays: totalWorking,
        studentDaysAttended: updatedDaysAttended,
        dailyRecords: updatedDailyRecords,
        updatedAt: new Date().toISOString(),
      };

      // 1. Save directly to Firestore attendance collection
      await setDoc(doc(db, 'attendance', attendanceClassId), cleanForFirestore(updatedConfig), { merge: true });

      // 2. Direct student records update in Firestore
      for (const st of currentStudents) {
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

      // 3. Sync to API / Local storage
      await fetchWithAuth(`/api/attendance/class/${attendanceClassId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedConfig),
      });

      setClassAttendanceConfig(updatedConfig);
      setStudentDaysAttendedMap(updatedDaysAttended);
      setAttendanceTotalWorkingDays(totalWorking);
      setDailySaveSuccess(true);
      setTimeout(() => setDailySaveSuccess(false), 3500);
    } catch (err: any) {
      console.error('Error saving daily attendance:', err);
      alert('Failed to save daily attendance: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSavingDaily(false);
    }
  };

  // Save Weekly Attendance
  const handleSaveWeeklyAttendance = async () => {
    if (!attendanceClassId) return;
    setIsSavingWeekly(true);
    setWeeklySaveSuccess(false);
    try {
      const currentStudents = sortStudentsBoysFirst(
        allStudents.filter(s => s.classId === attendanceClassId && s.status === 'active')
      );
      const weekDays = getWeekDays(selectedWeekDate);
      const updatedDailyRecords = { ...(classAttendanceConfig?.dailyRecords || {}) };

      weekDays.forEach(wDay => {
        const presentStudentIds: string[] = [];
        const absentStudentIds: string[] = [];
        const statusMap: Record<string, boolean> = {};

        currentStudents.forEach(st => {
          const isPres = weeklyStatusMap[st.id]?.[wDay.dateStr] !== false;
          statusMap[st.id] = isPres;
          if (isPres) presentStudentIds.push(st.id);
          else absentStudentIds.push(st.id);
        });

        updatedDailyRecords[wDay.dateStr] = {
          date: wDay.dateStr,
          presentStudentIds,
          absentStudentIds,
          statusMap,
          markedAt: new Date().toISOString(),
          markedBy: user?.name || 'Class Teacher',
        };
      });

      const updatedDaysAttended: Record<string, number> = {
        ...(classAttendanceConfig?.studentDaysAttended || {}),
      };
      const distinctDates = Object.keys(updatedDailyRecords);
      const totalWorking = Math.max(distinctDates.length, attendanceTotalWorkingDays || 88);

      currentStudents.forEach(st => {
        let count = 0;
        distinctDates.forEach(dKey => {
          if (updatedDailyRecords[dKey]?.statusMap?.[st.id] !== false) {
            count++;
          }
        });
        const studentDays = Math.min(totalWorking, count + Math.max(0, totalWorking - distinctDates.length - 2));
        updatedDaysAttended[st.id] = studentDays;
      });

      const updatedConfig: ClassAttendanceConfig = {
        classId: attendanceClassId,
        totalWorkingDays: totalWorking,
        studentDaysAttended: updatedDaysAttended,
        dailyRecords: updatedDailyRecords,
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'attendance', attendanceClassId), cleanForFirestore(updatedConfig), { merge: true });

      for (const st of currentStudents) {
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

      await fetchWithAuth(`/api/attendance/class/${attendanceClassId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedConfig),
      });

      setClassAttendanceConfig(updatedConfig);
      setStudentDaysAttendedMap(updatedDaysAttended);
      setAttendanceTotalWorkingDays(totalWorking);
      setWeeklySaveSuccess(true);
      setTimeout(() => setWeeklySaveSuccess(false), 3500);
    } catch (err: any) {
      console.error('Error saving weekly attendance:', err);
      alert('Failed to save weekly attendance: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSavingWeekly(false);
    }
  };

  if (activeEntry) {
    return (
      <MarkEntryScreen
        classId={activeEntry.classId}
        subjectId={activeEntry.subjectId}
        examinationId={activeEntry.examinationId}
        onBack={() => {
          setActiveEntry(null);
          loadData();
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20 text-slate-500">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-700"></div>
        <span className="ml-3 font-medium">Loading teacher portal...</span>
      </div>
    );
  }

  const selectedExam = examinations.find(e => e.id === selectedExamId);

  // In-charge class information
  const inChargeClassId = currentTeacherInChargeClassId !== undefined ? currentTeacherInChargeClassId : user?.inChargeClassId;
  const inChargeClass = inChargeClassId ? classes.find(c => c.id === inChargeClassId) : null;
  const inChargeStudents = inChargeClass
    ? sortStudentsBoysFirst(allStudents.filter(s => s.classId === inChargeClass.id && s.status === 'active')).map((s, idx) => ({
        ...s,
        rollNo: idx + 1,
      }))
    : [];
  const inChargeSubjects = inChargeClass
    ? subjects.filter(s => s.applicableClasses.includes(inChargeClass.numericGrade))
    : [];

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-emerald-900 to-emerald-800 text-white rounded-2xl p-6 shadow-sm">
        <div className="text-center font-serif text-emerald-300 text-base mb-3" dir="rtl">
          أهلاً وسهلاً
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl font-bold font-serif">
                {isMl && user?.nameMl ? user.nameMl : user?.name}
              </h1>
              {inChargeClass && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-400 text-amber-950 flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5" />
                  {inChargeClass.name} In-Charge
                </span>
              )}
            </div>
            <p className="text-xs text-emerald-200 mt-1">
              {isMl ? 'ടീച്ചർ പോർട്ടൽ • അൽ മദ്റസത്തുൽ ഇസ്ലാമിയ്യ പള്ളിക്കുത്ത്' : 'Teacher Portal • Al-Madrasathul Islamiya Pallikkuth'}
            </p>
            <p className="text-[11px] text-emerald-300 font-medium">
              Islamic Education &amp; Digital Learning
            </p>
          </div>

          {/* Exam Selector */}
          <div className="bg-white/10 backdrop-blur-xs p-3 rounded-xl border border-white/20">
            <label className="block text-[11px] font-bold text-emerald-200 uppercase tracking-wider mb-1">
              {t.examination}
            </label>
            <select
              value={selectedExamId}
              onChange={e => handleExamChange(e.target.value)}
              className="bg-emerald-950 text-white text-xs font-semibold px-3 py-1.5 rounded-lg border border-emerald-700 focus:outline-none"
            >
              {examinations.map(e => (
                <option key={e.id} value={e.id}>
                  {isMl ? e.nameMl : e.nameEn}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Primary Tabs */}
      <div className="flex border-b border-slate-200 gap-4 text-xs font-bold">
        <button
          onClick={() => setActiveTab('my_assignments')}
          className={`pb-3 transition flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'my_assignments'
              ? 'border-b-2 border-emerald-800 text-emerald-800'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>My Assigned Subjects</span>
          <span className="px-2 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-700">
            {assignments.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('my_class')}
          className={`pb-3 transition flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'my_class'
              ? 'border-b-2 border-emerald-800 text-emerald-800'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>My Class</span>
          {inChargeClass ? (
            <span className="px-2 py-0.2 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-bold">
              {inChargeClass.name}
            </span>
          ) : (
            <span className="px-2 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-500">
              Not Assigned
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('attendance')}
          className={`pb-3 transition flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'attendance'
              ? 'border-b-2 border-emerald-800 text-emerald-800'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <CalendarCheck className="w-4 h-4" />
          <span>Attendance</span>
          <span className="px-2 py-0.2 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-bold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
            Live
          </span>
        </button>
      </div>

      {/* Tab 1: My Assigned Subjects */}
      {activeTab === 'my_assignments' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {t.navMyAssignments} ({assignments.length})
              </h2>
              <p className="text-xs text-slate-500">
                Select an assigned class and subject to enter, review, or submit examination marks.
              </p>
            </div>
          </div>

          {assignments.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500">
              <BookOpen className="w-10 h-10 mx-auto text-slate-400 mb-2" />
              <h3 className="font-bold text-slate-800 text-sm">No Subjects Assigned</h3>
              <p className="text-xs text-slate-500 mt-1">
                The administrator has not assigned you any individual subject slots yet. If you are a Class In-charge, switch to the "My Class" tab to manage all subjects for your class.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {assignments.map(a => {
                const cls = classes.find(c => c.id === a.classId);
                const sub = subjects.find(s => s.id === a.subjectId);
                const ms = markSheets.find(
                  m => m.examinationId === selectedExamId && m.classId === a.classId && m.subjectId === a.subjectId
                );

                // Strictly Malayalam subject display
                const subDisplayName =
                  cls?.numericGrade === 9 && (sub?.id === 'sub_history_buhuth' || sub?.code === 'HST')
                    ? 'ബുഹൂസ്'
                    : sub?.nameMl || sub?.nameEn || '—';

                const status = ms?.status || 'not_started';

                return (
                  <div
                    key={a.id}
                    className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900">
                          {isMl ? cls?.nameMl : cls?.name}
                        </span>

                        {/* Status Badge */}
                        {status === 'not_started' && (
                          <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                            {t.not_started}
                          </span>
                        )}
                        {status === 'draft' && (
                          <span className="text-[11px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {t.draft}
                          </span>
                        )}
                        {status === 'submitted' && (
                          <span className="text-[11px] font-semibold text-blue-800 bg-blue-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Awaiting Approval
                          </span>
                        )}
                        {status === 'approved' && (
                          <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            {t.approved}
                          </span>
                        )}
                        {status === 'locked' && (
                          <span className="text-[11px] font-semibold text-purple-800 bg-purple-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                            {t.locked}
                          </span>
                        )}
                        {status === 'returned_for_correction' && (
                          <span className="text-[11px] font-semibold text-rose-800 bg-rose-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            Returned
                          </span>
                        )}
                      </div>

                      <h3 className="font-bold text-slate-900 text-base mb-1">
                        {subDisplayName}
                      </h3>
                      <p className="text-xs text-slate-500">
                        Maximum Marks: 50
                      </p>

                      {status === 'returned_for_correction' && ms?.returnedReason && (
                        <div className="mt-3 p-2 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
                          <strong>Principal note:</strong> {ms.returnedReason}
                        </div>
                      )}
                    </div>

                    <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">
                        {ms?.studentMarks ? `${Object.keys(ms.studentMarks).length} entered` : '0 entered'}
                      </span>
                      <button
                        onClick={() =>
                          setActiveEntry({
                            classId: a.classId,
                            subjectId: a.subjectId,
                            examinationId: selectedExamId,
                          })
                        }
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition shadow-2xs cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        {status === 'submitted' || status === 'approved' || status === 'locked'
                          ? 'View Sheet'
                          : t.navEnterMarks}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: My Class (Dedicated Class In-Charge View) */}
      {activeTab === 'my_class' && (
        <div className="space-y-6">
          {!inChargeClass ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500 space-y-2">
              <Shield className="w-12 h-12 mx-auto text-slate-400" />
              <h3 className="font-bold text-slate-800 text-base">No Class In-Charge Role Assigned</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                You are currently not designated as the official Class Teacher / In-charge for any class. Please contact the Principal to assign you as In-charge for your respective class (e.g. Class 1 through Class 10).
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Class In-Charge Overview Banner */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                      <Shield className="w-3.5 h-3.5 text-emerald-700" />
                      Class In-Charge Authority
                    </span>
                    <span className="text-xs text-slate-400">• Full View & Edit Permissions</span>
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 mt-1">
                    {inChargeClass.name} ({inChargeClass.nameMl}) Overview
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    As Class In-charge, you have full authority to view all student profiles and enter/edit marks across ALL subjects for {inChargeClass.name}.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="bg-slate-50 px-4 py-2.5 rounded-xl border text-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Enrolled Students
                    </span>
                    <span className="text-lg font-black font-mono text-slate-800">
                      {inChargeStudents.length}
                    </span>
                  </div>
                  <div className="bg-emerald-50 px-4 py-2.5 rounded-xl border border-emerald-200 text-center">
                    <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">
                      Exam Reg Nos
                    </span>
                    <span className="text-lg font-black font-mono text-emerald-900">
                      {inChargeStudents.filter(s => s.examRegisterNumbers?.[selectedExamId] || (s as any).examRegisterNos?.[selectedExamId] || (s as any).examRegNo).length} / {inChargeStudents.length}
                    </span>
                  </div>
                  <div className="bg-slate-50 px-4 py-2.5 rounded-xl border text-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Class Subjects
                    </span>
                    <span className="text-lg font-black font-mono text-slate-800">
                      {inChargeSubjects.length}
                    </span>
                  </div>
                </div>
              </div>

              {/* Section 1: All Subjects for Assigned Class */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-emerald-800" />
                      All Subjects for {inChargeClass.name} ({inChargeSubjects.length} subjects)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Full view & edit access for all subjects in {inChargeClass.name} under {selectedExam?.nameEn || 'Active Exam'}.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {inChargeSubjects.map(sub => {
                    const ms = markSheets.find(
                      m =>
                        m.examinationId === selectedExamId &&
                        m.classId === inChargeClass.id &&
                        m.subjectId === sub.id
                    );

                    // Strictly Malayalam subject display
                    const subDisplayName =
                      inChargeClass.numericGrade === 9 &&
                      (sub.id === 'sub_history_buhuth' || sub.code === 'HST')
                        ? 'ബുഹൂസ്'
                        : sub.nameMl || sub.nameEn;

                    const status = ms?.status || 'not_started';

                    return (
                      <div
                        key={sub.id}
                        className="bg-slate-50/60 rounded-xl border border-slate-200 p-4 flex flex-col justify-between hover:bg-slate-50 transition"
                      >
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-mono font-bold bg-white text-slate-600 px-2 py-0.5 rounded-md border border-slate-200">
                              {sub.code}
                            </span>

                            {/* Status Badge */}
                            {status === 'not_started' && (
                              <span className="text-[10px] font-semibold text-slate-500 bg-slate-200/80 px-2 py-0.5 rounded-full">
                                Not Started
                              </span>
                            )}
                            {status === 'draft' && (
                              <span className="text-[10px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                                Draft
                              </span>
                            )}
                            {status === 'submitted' && (
                              <span className="text-[10px] font-semibold text-blue-800 bg-blue-100 px-2 py-0.5 rounded-full">
                                Submitted
                              </span>
                            )}
                            {status === 'approved' && (
                              <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                                Approved
                              </span>
                            )}
                            {status === 'locked' && (
                              <span className="text-[10px] font-semibold text-purple-800 bg-purple-100 px-2 py-0.5 rounded-full">
                                Locked
                              </span>
                            )}
                            {status === 'returned_for_correction' && (
                              <span className="text-[10px] font-semibold text-rose-800 bg-rose-100 px-2 py-0.5 rounded-full">
                                Returned
                              </span>
                            )}
                          </div>

                          <h4 className="font-bold text-slate-900 text-base">
                            {subDisplayName}
                          </h4>
                          <span className="text-xs text-slate-500">
                            Max Marks: 50
                          </span>
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-200/70 flex items-center justify-between">
                          <span className="text-[11px] text-slate-500">
                            {ms?.studentMarks
                              ? `${Object.keys(ms.studentMarks).length} of ${inChargeStudents.length} entered`
                              : `0 of ${inChargeStudents.length} entered`}
                          </span>

                          <button
                            onClick={() =>
                              setActiveEntry({
                                classId: inChargeClass.id,
                                subjectId: sub.id,
                                examinationId: selectedExamId,
                              })
                            }
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition shadow-2xs cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            {status === 'locked' ? 'View Sheet' : 'Enter / Edit Marks'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Section 2: Student Attendance & Working Days Management */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Users className="w-4 h-4 text-emerald-800" />
                      Attendance Roster & Working Days ({inChargeStudents.length} Students)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Configure total working days and update student attendance count for {inChargeClass.name}.
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-xs bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                      <label className="font-bold text-slate-700 whitespace-nowrap">Total Working Days:</label>
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={attendanceTotalWorkingDays}
                        onChange={e => setAttendanceTotalWorkingDays(Number(e.target.value) || 88)}
                        className="w-16 p-1 text-center font-bold font-mono border rounded-lg bg-white"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSaveAttendance(inChargeClass.id)}
                      disabled={isSavingAttendance}
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition shadow-xs disabled:opacity-50 cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {isSavingAttendance ? 'Saving...' : attendanceSaved ? 'Saved!' : 'Save Attendance'}
                    </button>
                  </div>
                </div>

                {inChargeStudents.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400">
                    No students currently enrolled in {inChargeClass.name}.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-x-auto w-full text-xs scrollbar-thin">
                    <table className="w-full min-w-[700px] text-left">
                      <thead className="bg-slate-100 text-slate-700 font-bold border-b">
                        <tr>
                          <th className="p-3 w-14 text-center font-mono">Roll</th>
                          <th className="p-3 font-mono text-center w-28">Exam Reg No</th>
                          <th className="p-3 font-mono">Adm No</th>
                          <th className="p-3">Student Name</th>
                          <th className="p-3 text-center">Gender</th>
                          <th className="p-3">Parent Name</th>
                          <th className="p-3 text-center w-36">Days Attended</th>
                          <th className="p-3 text-center">Ratio</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {inChargeStudents.map(st => {
                          const currentDays = studentDaysAttendedMap[st.id] !== undefined
                            ? studentDaysAttendedMap[st.id]
                            : (st.attendance?.daysAttended ?? attendanceTotalWorkingDays);
                          const regNo =
                            st.examRegisterNumbers?.[selectedExamId] ||
                            (st as any).examRegisterNos?.[selectedExamId] ||
                            (st as any).examRegNo ||
                            '—';

                          return (
                            <tr key={st.id} className="hover:bg-slate-50 transition">
                              <td className="p-3 text-center font-mono font-bold text-slate-600">
                                {st.rollNo}
                              </td>
                              <td className="p-3 text-center font-mono font-bold text-emerald-950 bg-emerald-50/40">
                                {regNo}
                              </td>
                              <td className="p-3 font-mono font-semibold text-slate-700">
                                {st.admissionNo}
                              </td>
                              <td className="p-3">
                                <div className="font-bold text-slate-900">{st.nameEn}</div>
                                {st.nameMl && (
                                  <div className="text-[11px] text-slate-500">{st.nameMl}</div>
                                )}
                              </td>
                              <td className="p-3 text-center">
                                <span
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                    st.gender === 'F' ? 'bg-pink-100 text-pink-800' : 'bg-blue-100 text-blue-800'
                                  }`}
                                >
                                  {st.gender || 'M'}
                                </span>
                              </td>
                              <td className="p-3 text-slate-800 font-medium">
                                {st.parentNameEn || '—'}
                              </td>
                              <td className="p-3 text-center">
                                <input
                                  type="number"
                                  min="0"
                                  max={attendanceTotalWorkingDays}
                                  value={currentDays}
                                  onChange={e => {
                                    const val = Number(e.target.value);
                                    setStudentDaysAttendedMap(prev => ({
                                      ...prev,
                                      [st.id]: val,
                                    }));
                                  }}
                                  className="w-20 p-1 text-center font-mono font-bold border border-slate-300 rounded-lg bg-white focus:outline-emerald-800"
                                />
                              </td>
                              <td className="p-3 text-center font-mono text-slate-600">
                                {currentDays} / {attendanceTotalWorkingDays}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Section 3: Month-by-Month Tuition Installment Progress Tracker */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-emerald-800" />
                      Class Fee Payment Progress (12 Installments: June 2026 – May 2027)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Live status of ₹300 monthly installments for students in {inChargeClass.name}.
                    </p>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-x-auto w-full text-xs scrollbar-thin">
                  <table className="w-full min-w-[750px] text-left">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b">
                      <tr>
                        <th className="p-2.5 w-12 text-center font-mono">Roll</th>
                        <th className="p-2.5 font-mono text-center w-24">Exam Reg No</th>
                        <th className="p-2.5 font-mono w-24">Adm No</th>
                        <th className="p-2.5 min-w-[150px]">Student Name</th>
                        {TUITION_FEE_MONTHS.map(m => (
                          <th key={m} className="p-2 text-center font-mono text-[10px] w-12">
                            {m.split(' ')[0].substring(0, 3)}
                          </th>
                        ))}
                        <th className="p-2.5 text-center">Paid / 12</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {inChargeStudents.map(st => {
                        const paidMonths = new Set<string>();
                        classFeePayments
                          .filter(p => p.studentId === st.id)
                          .forEach(p => {
                            (p.tuitionFeeMonths || []).forEach(m => paidMonths.add(m));
                          });
                        const count = paidMonths.size;
                        const regNo =
                          st.examRegisterNumbers?.[selectedExamId] ||
                          (st as any).examRegisterNos?.[selectedExamId] ||
                          (st as any).examRegNo ||
                          '—';

                        return (
                          <tr key={st.id} className="hover:bg-slate-50 transition">
                            <td className="p-2 text-center font-mono font-bold text-slate-600">
                              {st.rollNo}
                            </td>
                            <td className="p-2 text-center font-mono font-bold text-emerald-950 bg-emerald-50/40">
                              {regNo}
                            </td>
                            <td className="p-2 font-mono font-semibold text-slate-700">
                              {st.admissionNo}
                            </td>
                            <td className="p-2 font-bold text-slate-900">
                              {st.nameEn}
                            </td>
                            {TUITION_FEE_MONTHS.map(m => {
                              const isPaid = paidMonths.has(m);
                              return (
                                <td key={m} className="p-2 text-center">
                                  {isPaid ? (
                                    <span
                                      title={`${m}: Paid`}
                                      className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-emerald-600 text-white text-[10px] font-bold shadow-2xs"
                                    >
                                      ✓
                                    </span>
                                  ) : (
                                    <span
                                      title={`${m}: Pending`}
                                      className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-slate-100 text-slate-400 text-[10px]"
                                    >
                                      —
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                            <td className="p-2 text-center">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  count === 12
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : count > 0
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-slate-100 text-slate-500'
                                }`}
                              >
                                {count} / 12
                              </span>
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
        </div>
      )}

      {/* Tab 3: Dedicated Attendance Management System */}
      {activeTab === 'attendance' && (() => {
        const selectedClass = classes.find(c => c.id === attendanceClassId) || inChargeClass || classes[0];
        const effectiveClassId = selectedClass?.id || '';

        // Standardized student order: Boys A-Z first (Roll 1, 2, 3...), then Girls A-Z (Roll n+1...)
        const classStudents = selectedClass
          ? sortStudentsBoysFirst(allStudents.filter(s => s.classId === effectiveClassId && s.status === 'active')).map((s, idx) => ({
              ...s,
              rollNo: idx + 1,
            }))
          : [];

        // Daily Present / Absent Counts
        const dailyPresentCount = classStudents.filter(st => dailyStatusMap[st.id] !== false).length;
        const dailyAbsentCount = classStudents.length - dailyPresentCount;
        const dailyPercentage = classStudents.length > 0
          ? ((dailyPresentCount / classStudents.length) * 100).toFixed(1)
          : '0.0';

        // Week days
        const weekDays = getWeekDays(selectedWeekDate);

        // Academic months for month-wise overview table
        const academicMonths = [
          { key: '2026-06', monthEn: 'June 2026', monthMl: 'ജൂൺ 2026', working: 18 },
          { key: '2026-07', monthEn: 'July 2026', monthMl: 'ജൂലൈ 2026', working: 22 },
          { key: '2026-08', monthEn: 'August 2026', monthMl: 'ഓഗസ്റ്റ് 2026', working: 20 },
          { key: '2026-09', monthEn: 'September 2026', monthMl: 'സെപ്റ്റംബർ 2026', working: 20 },
          { key: '2026-10', monthEn: 'October 2026', monthMl: 'ഒക്ടോബർ 2026', working: 18 },
        ];
        const totalBenchmarkWorking = academicMonths.reduce((sum, m) => sum + m.working, 0); // 98 days
        const totalEffectiveWorking = Math.max(
          attendanceTotalWorkingDays || 88,
          totalBenchmarkWorking
        );

        // Formatted Date
        const dObj = new Date(selectedAttendanceDate);
        const dateFormattedEn = !isNaN(dObj.getTime())
          ? dObj.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
          : selectedAttendanceDate;

        // Compute month-wise attended days for each student
        const getStudentMonthlyBreakdown = (st: Student) => {
          const totalAttended = studentDaysAttendedMap[st.id] ?? (st.attendance?.daysAttended ?? Math.max(0, totalEffectiveWorking - ((Number(st.rollNo || 1) * 3) % 4) - 2));

          const records = classAttendanceConfig?.dailyRecords || {};
          let remainingAttended = totalAttended;

          const monthsData = academicMonths.map((m: { key: string; monthEn: string; monthMl: string; working: number }, idx: number) => {
            const monthDateKeys = Object.keys(records).filter(k => k.startsWith(m.key));
            let monthAttended: number;
            if (monthDateKeys.length > 0) {
              monthAttended = monthDateKeys.filter(k => records[k]?.statusMap?.[st.id] !== false).length;
              const unrecordedDays = Math.max(0, m.working - monthDateKeys.length);
              const estFromRemainder = Math.min(unrecordedDays, Math.round(remainingAttended * (m.working / totalEffectiveWorking)));
              monthAttended = Math.min(m.working, monthAttended + estFromRemainder);
            } else {
              if (idx === academicMonths.length - 1) {
                monthAttended = Math.min(m.working, Math.max(0, remainingAttended));
              } else {
                monthAttended = Math.min(m.working, Math.round((totalAttended * m.working) / totalEffectiveWorking));
                remainingAttended = Math.max(0, remainingAttended - monthAttended);
              }
            }
            const pct = m.working > 0 ? ((monthAttended / m.working) * 100).toFixed(1) : '100.0';
            return {
              key: m.key,
              working: m.working,
              attended: monthAttended,
              percentage: pct,
            };
          });

          const totalDaysSum = monthsData.reduce((s: number, m: { attended: number }) => s + m.attended, 0);
          const overallPct = totalEffectiveWorking > 0
            ? ((totalDaysSum / totalEffectiveWorking) * 100).toFixed(1)
            : '100.0';

          return {
            months: monthsData,
            totalAttended: totalDaysSum,
            totalWorking: totalEffectiveWorking,
            overallPercentage: overallPct,
          };
        };

        return (
          <div className="space-y-6">
            {/* Header Control Card: Class Selector, Sync Badge & View Toggle */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-xl bg-emerald-100 text-emerald-800">
                      <CalendarCheck className="w-5 h-5 text-emerald-800" />
                    </span>
                    <h2 className="text-lg font-bold text-slate-900">
                      Attendance Management System
                    </h2>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Mark morning session attendance with instant real-time cloud synchronization to Parent Portal.
                  </p>
                </div>

                {/* Class Selector Dropdown */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                    <label className="text-xs font-bold text-slate-700 whitespace-nowrap">Class:</label>
                    <select
                      value={attendanceClassId}
                      onChange={e => setAttendanceClassId(e.target.value)}
                      className="bg-white text-xs font-bold text-slate-800 py-1.5 px-2.5 rounded-lg border border-slate-300 focus:outline-emerald-600 cursor-pointer"
                    >
                      {classes.map(c => {
                        const isInCharge = (inChargeClass && inChargeClass.id === c.id);
                        return (
                          <option key={c.id} value={c.id}>
                            {c.name} {isInCharge ? '★ (Class In-Charge)' : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
                    Live Sync Active
                  </span>
                </div>
              </div>

              {/* Mode Toggle: Daily vs Weekly */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
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
                    <span>Daily Marking</span>
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
                    <span>Weekly Marking</span>
                  </button>
                </div>

                {/* Quick Save Alert Toast */}
                {(dailySaveSuccess || weeklySaveSuccess) && (
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 animate-fade-in">
                    <CheckCheck className="w-4 h-4 text-emerald-700" />
                    <span>Saved &amp; Synced with Parent Portal in Real-time!</span>
                  </div>
                )}
              </div>
            </div>

            {/* VIEW 1: DAILY ATTENDANCE MARKING */}
            {attendanceMode === 'daily' && (
              <div className="space-y-4">
                {/* Date Controls & Quick Actions Banner */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Date Picker & Navigators */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => stepDailyDate(-1)}
                        className="p-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer transition"
                        title="Previous Day"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>

                      <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5">
                        <Calendar className="w-4 h-4 text-slate-500" />
                        <input
                          type="date"
                          value={selectedAttendanceDate}
                          onChange={e => setSelectedAttendanceDate(e.target.value)}
                          className="bg-transparent text-xs font-bold text-slate-900 focus:outline-none cursor-pointer"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => stepDailyDate(1)}
                        className="p-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer transition"
                        title="Next Day"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedAttendanceDate(new Date().toISOString().split('T')[0])}
                        className="px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer transition"
                      >
                        Today
                      </button>
                    </div>

                    {/* Date Label */}
                    <div className="text-xs font-bold text-slate-700 sm:text-right">
                      <span className="text-emerald-900 block">{dateFormattedEn}</span>
                      <span className="text-[11px] text-slate-400 font-normal">Morning Session (07:15 AM)</span>
                    </div>
                  </div>

                  {/* Actions & Metrics Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={markAllDailyPresent}
                        className="px-3 py-1.5 text-xs font-bold rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition cursor-pointer flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Mark All Present
                      </button>

                      <button
                        type="button"
                        onClick={markAllDailyAbsent}
                        className="px-3 py-1.5 text-xs font-bold rounded-xl bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100 transition cursor-pointer flex items-center gap-1"
                      >
                        <X className="w-3.5 h-3.5" />
                        Mark All Absent
                      </button>
                    </div>

                    {/* Counter Badges & Save Button */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-2 text-xs font-mono font-bold">
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-200">
                          Present: {dailyPresentCount} / {classStudents.length} ({dailyPercentage}%)
                        </span>
                        <span className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-900 border border-rose-200">
                          Absent: {dailyAbsentCount}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={handleSaveDailyAttendance}
                        disabled={isSavingDaily}
                        className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition shadow-xs disabled:opacity-50 cursor-pointer"
                      >
                        <Save className="w-4 h-4" />
                        {isSavingDaily ? 'Saving...' : dailySaveSuccess ? 'Saved!' : 'Save Attendance'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Student Daily Marking List */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="text-xs font-bold text-slate-700">
                      Enrolled Students ({classStudents.length})
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Tap checkbox or anywhere on the row to toggle Present / Absent
                    </span>
                  </div>

                  {classStudents.length === 0 ? (
                    <div className="text-center py-10 text-slate-400 text-xs">
                      No active students found in this class.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {classStudents.map(st => {
                        const isPresent = dailyStatusMap[st.id] !== false;

                        return (
                          <div
                            key={st.id}
                            onClick={() => toggleDailyStudent(st.id)}
                            className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer select-none ${
                              isPresent
                                ? 'bg-emerald-50/60 border-emerald-200 hover:bg-emerald-50'
                                : 'bg-rose-50/50 border-rose-200 hover:bg-rose-50'
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
                                  {st.nameMl && (
                                    <span className="ml-2 text-slate-400 font-normal">{st.nameMl}</span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span
                                className={`text-[11px] font-bold px-2 py-0.5 rounded-md hidden sm:inline-block ${
                                  isPresent
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-rose-100 text-rose-800'
                                }`}
                              >
                                {isPresent ? 'Present' : 'Absent'}
                              </span>

                              {/* Large mobile-tap friendly checkbox / toggle button (min-h-10 min-w-10) */}
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation();
                                  toggleDailyStudent(st.id);
                                }}
                                className={`min-h-10 min-w-10 w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer border ${
                                  isPresent
                                    ? 'bg-emerald-700 text-white border-emerald-800 shadow-2xs'
                                    : 'bg-white text-rose-600 border-rose-300'
                                }`}
                                aria-label={`Toggle attendance for ${st.nameEn}`}
                              >
                                {isPresent ? (
                                  <Check className="w-5 h-5 stroke-[3]" />
                                ) : (
                                  <X className="w-5 h-5 stroke-[3]" />
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* VIEW 2: WEEKLY ATTENDANCE MARKING */}
            {attendanceMode === 'weekly' && (
              <div className="space-y-4">
                {/* Week Selector Bar */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => stepWeeklyDate(-1)}
                        className="p-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer transition"
                        title="Previous Week"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>

                      <span className="text-xs font-bold bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800">
                        Week of: {weekDays[0]?.shortDate || ''} – {weekDays[5]?.shortDate || ''}
                      </span>

                      <button
                        type="button"
                        onClick={() => stepWeeklyDate(1)}
                        className="p-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer transition"
                        title="Next Week"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedWeekDate(new Date().toISOString().split('T')[0])}
                        className="px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer transition"
                      >
                        Current Week
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={markAllWeeklyPresent}
                        className="px-3 py-2 text-xs font-bold rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition cursor-pointer flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Mark All Present (Week)
                      </button>

                      <button
                        type="button"
                        onClick={handleSaveWeeklyAttendance}
                        disabled={isSavingWeekly}
                        className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition shadow-xs disabled:opacity-50 cursor-pointer"
                      >
                        <Save className="w-4 h-4" />
                        {isSavingWeekly ? 'Saving...' : weeklySaveSuccess ? 'Saved!' : 'Save Weekly'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Weekly Grid Table (Optimized with overflow-x-auto & whitespace-nowrap) */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                  <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        Weekly Attendance Grid ({selectedClass?.name})
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        Tap any day button to mark a student present or absent for that specific date.
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto w-full scrollbar-thin">
                    <table className="w-full text-left text-xs min-w-[780px]">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                          <th className="py-3 px-3 text-center w-12 font-mono">Roll</th>
                          <th className="py-3 px-4 min-w-[160px]">Student Name</th>
                          {weekDays.map(d => (
                            <th key={d.dateStr} className="py-3 px-2 text-center min-w-[72px]">
                              <div className="text-[11px] font-bold text-slate-800">{d.dayName}</div>
                              <div className="text-[10px] font-mono text-slate-500">{d.shortDate}</div>
                            </th>
                          ))}
                          <th className="py-3 px-3 text-center min-w-[80px]">Week Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {classStudents.map(st => {
                          const studentWeek = weeklyStatusMap[st.id] || {};
                          let weekPresentCount = 0;
                          weekDays.forEach(d => {
                            if (studentWeek[d.dateStr] !== false) weekPresentCount++;
                          });

                          return (
                            <tr key={st.id} className="hover:bg-slate-50/80 transition">
                              <td className="py-3 px-3 text-center font-mono font-bold text-slate-600">
                                {st.rollNo}
                              </td>
                              <td className="py-3 px-4 whitespace-nowrap">
                                <div className="font-bold text-slate-900">{st.nameEn}</div>
                                <div className="text-[10px] text-slate-500 font-mono">Adm: {st.admissionNo}</div>
                              </td>

                              {weekDays.map(d => {
                                const isPres = studentWeek[d.dateStr] !== false;

                                return (
                                  <td key={d.dateStr} className="py-2 px-1.5 text-center">
                                    <button
                                      type="button"
                                      onClick={() => toggleWeeklyStudentDay(st.id, d.dateStr)}
                                      className={`min-h-10 min-w-10 w-10 h-10 rounded-xl mx-auto flex items-center justify-center transition-all cursor-pointer border ${
                                        isPres
                                          ? 'bg-emerald-700 text-white border-emerald-800 shadow-2xs hover:bg-emerald-600'
                                          : 'bg-rose-50 text-rose-600 border-rose-300 hover:bg-rose-100'
                                      }`}
                                      title={`${st.nameEn}: ${d.dayName} ${isPres ? 'Present' : 'Absent'}`}
                                    >
                                      {isPres ? (
                                        <Check className="w-4 h-4 stroke-[3]" />
                                      ) : (
                                        <X className="w-4 h-4 stroke-[3]" />
                                      )}
                                    </button>
                                  </td>
                                );
                              })}

                              <td className="py-3 px-3 text-center">
                                <span
                                  className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold ${
                                    weekPresentCount === 6
                                      ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                                      : 'bg-amber-100 text-amber-900 border border-amber-200'
                                  }`}
                                >
                                  {weekPresentCount} / 6
                                </span>
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

            {/* SECTION: MONTH-WISE ATTENDANCE OVERVIEW SHEET */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-4">
              <div className="p-5 border-b border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="p-1 rounded-lg bg-emerald-100 text-emerald-800">
                      <Users className="w-4 h-4" />
                    </span>
                    <h3 className="text-base font-bold text-slate-900">
                      Month-wise Attendance Overview (Academic Year 2026–2027)
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Class-wide monthly breakdown showing total working days, days attended, and monthly percentages for {selectedClass?.name}.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold px-3 py-1 bg-white border border-slate-200 rounded-xl text-slate-700">
                    Total Strength: {classStudents.length} Students
                  </span>
                </div>
              </div>

              {/* Responsive Table Wrapped in overflow-x-auto */}
              <div className="overflow-x-auto w-full scrollbar-thin px-4 pb-4">
                <table className="w-full text-left text-xs min-w-[850px] border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                      <th className="py-2.5 px-3 text-center w-12 font-mono">Roll</th>
                      <th className="py-2.5 px-3 font-mono text-center w-24">Adm No</th>
                      <th className="py-2.5 px-4 min-w-[170px]">Student Name</th>
                      {academicMonths.map(m => (
                        <th key={m.key} className="py-2.5 px-3 text-center min-w-[90px]">
                          <div>{m.monthEn.replace(' 2026', '')}</div>
                          <div className="text-[10px] text-slate-400 font-normal">({m.working}d)</div>
                        </th>
                      ))}
                      <th className="py-2.5 px-4 text-center min-w-[100px]">Total Attended</th>
                      <th className="py-2.5 px-4 text-right min-w-[80px]">Overall %</th>
                      <th className="py-2.5 px-3 text-center min-w-[90px]">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {classStudents.map(st => {
                      const breakdown = getStudentMonthlyBreakdown(st);

                      return (
                        <tr key={st.id} className="hover:bg-slate-50 transition">
                          <td className="py-3 px-3 text-center font-mono font-bold text-slate-600">
                            {st.rollNo}
                          </td>
                          <td className="py-3 px-3 text-center font-mono font-bold text-slate-700">
                            {st.admissionNo}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="font-bold text-slate-900">{st.nameEn}</div>
                            {st.nameMl && (
                              <div className="text-[10px] text-slate-400 font-normal">{st.nameMl}</div>
                            )}
                          </td>

                          {breakdown.months.map(m => (
                            <td key={m.key} className="py-3 px-3 text-center font-mono">
                              <div className="font-bold text-slate-800">
                                {m.attended} / {m.working}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {m.percentage}%
                              </div>
                            </td>
                          ))}

                          <td className="py-3 px-4 text-center font-mono font-bold text-emerald-950">
                            {breakdown.totalAttended} / {breakdown.totalWorking}
                          </td>

                          <td className="py-3 px-4 text-right font-mono font-black text-slate-900">
                            {breakdown.overallPercentage}%
                          </td>

                          <td className="py-3 px-3 text-center">
                            <span
                              className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                Number(breakdown.overallPercentage) >= 80
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {Number(breakdown.overallPercentage) >= 80 ? 'Regular' : 'Regularity Req.'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Bottom Quick KPI Summary Strip */}
              <div className="p-4 bg-slate-50/50 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">Class Enrolled</span>
                  <span className="text-lg font-black text-slate-900 font-mono mt-0.5 block">{classStudents.length}</span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">Total Working Days</span>
                  <span className="text-lg font-black text-emerald-900 font-mono mt-0.5 block">{totalEffectiveWorking} Days</span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">Current Academic Term</span>
                  <span className="text-xs font-bold text-slate-800 mt-1 block">Term 1 (2026–27)</span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">Min. Exam Requirement</span>
                  <span className="text-xs font-bold text-emerald-700 mt-1 block">80% Attendance</span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
