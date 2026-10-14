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
} from '../../types';
import { MarkEntryScreen } from './MarkEntryScreen';
import { db, handleFirestoreError, OperationType } from '../../services/firebase';
import { collection, onSnapshot, doc, getDoc, getDocs } from 'firebase/firestore';
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
} from 'lucide-react';

export const TeacherDashboard: React.FC = () => {
  const { user, fetchWithAuth, lang, t } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'my_assignments' | 'my_class'>('my_assignments');
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
            const remoteStu = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Student));
            setAllStudents(sortStudentsBoysFirst(remoteStu));
          }
        },
        error => {
          console.error('Firestore students onSnapshot listener error:', error);
          handleFirestoreError(error, OperationType.GET, 'students');
        }
      );
      unsubs.push(unsubStu);

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
                      Class Subjects
                    </span>
                    <span className="text-lg font-black font-mono text-emerald-900">
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

                          return (
                            <tr key={st.id} className="hover:bg-slate-50 transition">
                              <td className="p-3 text-center font-mono font-bold text-slate-600">
                                {st.rollNo}
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

                        return (
                          <tr key={st.id} className="hover:bg-slate-50 transition">
                            <td className="p-2 text-center font-mono font-bold text-slate-600">
                              {st.rollNo}
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
    </div>
  );
};
