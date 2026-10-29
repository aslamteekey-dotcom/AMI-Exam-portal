import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db, handleFirestoreError, OperationType, safeOnSnapshot, isFirestoreQuotaExhausted } from '../../services/firebase';
import { cleanForFirestore } from '../../services/firestoreSync';
import { handleHorizontalWheel } from '../../hooks/useHorizontalScroll';
import { collection, doc, setDoc } from 'firebase/firestore';
import { logAuditEvent } from '../../services/auditLogger';
import {
  ClassItem,
  SubjectItem,
  Examination,
  SubjectAssessmentRule,
  Student,
  MarkSheet,
  StudentMarkEntry,
  sortStudentsBoysFirst,
  determineStudentGender,
  isClassMatch,
} from '../../types';
import {
  Save,
  Send,
  Eye,
  CheckCircle,
  AlertCircle,
  Clock,
  Lock,
  ArrowLeft,
  UserX,
  UserCheck,
  RotateCcw,
} from 'lucide-react';

interface Props {
  classId: string;
  subjectId: string;
  examinationId: string;
  onBack: () => void;
}

export const MarkEntryScreen: React.FC<Props> = ({ classId, subjectId, examinationId, onBack }) => {
  const { fetchWithAuth, lang, t, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [cls, setCls] = useState<ClassItem | null>(null);
  const [subject, setSubject] = useState<any | null>(null);
  const [exam, setExam] = useState<Examination | null>(null);
  const [components, setComponents] = useState<SubjectAssessmentRule[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [markSheet, setMarkSheet] = useState<MarkSheet | null>(null);
  const [assignedTeacherId, setAssignedTeacherId] = useState<string>('');

  // Local state for mark entries
  const [marks, setMarks] = useState<Record<string, { isAbsent: boolean; componentMarks: Record<string, string>; remarks: string }>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  const isMl = lang === 'ml';

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(
        `/api/mark-sheet-detail?examinationId=${examinationId}&classId=${classId}&subjectId=${subjectId}`
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to load mark sheet');
      }
      const data = await res.json();
      setCls(data.classItem || data.class);
      setSubject(data.subject);
      setExam(data.examination || data.exam);
      setComponents(data.components || []);
      const uniqueRaw = Array.from(
        new Map((data.students || []).map((s: Student) => [s.admissionNo?.toString() || s.id, s])).values()
      ) as Student[];
      const sortedStudents = sortStudentsBoysFirst<Student>(uniqueRaw, examinationId).map((s, idx) => ({
        ...s,
        rollNo: idx + 1,
        gender: determineStudentGender(s, examinationId),
      }));
      setStudents(sortedStudents);
      setMarkSheet(data.markSheet);
      setAssignedTeacherId(data.assignedTeacherId || data.markSheet?.assignedTeacherId || '');

      // Initialize marks state
      const initialMarks: Record<string, { isAbsent: boolean; componentMarks: Record<string, string>; remarks: string }> = {};
      const activeComponents = data.components || [];
      sortedStudents.forEach((s: Student) => {
        const entry: StudentMarkEntry = data.markSheet?.studentMarks?.[s.id];
        if (entry) {
          const compStr: Record<string, string> = {};
          activeComponents.forEach((c: SubjectAssessmentRule) => {
            compStr[c.componentKey] = entry.componentMarks?.[c.componentKey] !== undefined ? String(entry.componentMarks[c.componentKey]) : '';
          });
          initialMarks[s.id] = {
            isAbsent: !!entry.isAbsent,
            componentMarks: compStr,
            remarks: entry.remarks || '',
          };
        } else {
          const emptyComp: Record<string, string> = {};
          activeComponents.forEach((c: SubjectAssessmentRule) => {
            emptyComp[c.componentKey] = '';
          });
          initialMarks[s.id] = {
            isAbsent: false,
            componentMarks: emptyComp,
            remarks: '',
          };
        }
      });
      setMarks(initialMarks);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Real-time Firestore listener for student updates (including Exam Register Numbers)
    let unsub: (() => void) | undefined;
    if (!isFirestoreQuotaExhausted()) {
      try {
        unsub = safeOnSnapshot(collection(db, 'students'), (snapshot: any) => {
          if (!snapshot.empty) {
            const remoteList: Student[] = snapshot.docs.map((d: any) => ({ ...d.data(), id: d.id } as Student));
            setStudents(prev => {
              const updated = prev.map(p => {
                const remote = remoteList.find((r: Student) => r.id === p.id || r.admissionNo === p.admissionNo);
                if (remote) {
                  const regNos = {
                    ...(p.examRegisterNumbers || {}),
                    ...((remote as any).examRegisterNumbers || {}),
                    ...((remote as any).examRegisterNos || {}),
                  };
                  return {
                    ...p,
                    ...remote,
                    gender: determineStudentGender(remote, examinationId),
                    examRegisterNumbers: regNos,
                    examRegisterNos: regNos,
                    examRegNo:
                      (remote as any).examRegisterNos?.[examinationId] ||
                      (remote as any).examRegNo ||
                      (remote as any).regNo ||
                      remote.examRegisterNumbers?.[examinationId] ||
                      regNos[examinationId] ||
                      '',
                    regNo:
                      (remote as any).examRegisterNos?.[examinationId] ||
                      (remote as any).examRegNo ||
                      (remote as any).regNo ||
                      remote.examRegisterNumbers?.[examinationId] ||
                      regNos[examinationId] ||
                      '',
                  };
                }
                return p;
              });
              return sortStudentsBoysFirst(updated, examinationId).map((s, idx) => ({ ...s, rollNo: idx + 1 }));
            });
          }
        });
      } catch (e) {
        console.warn('Real-time students listener error in MarkEntryScreen:', e);
      }
    }

    const handleStudentsUpdated = (e: any) => {
      const list = e.detail;
      if (Array.isArray(list)) {
        setStudents(prev => {
          const updated = prev.map(p => {
            const found = list.find((s: Student) => s.id === p.id || s.admissionNo === p.admissionNo);
            if (found) {
              const regNos = {
                ...(p.examRegisterNumbers || {}),
                ...((found as any).examRegisterNumbers || {}),
                ...((found as any).examRegisterNos || {}),
              };
              return {
                ...p,
                ...found,
                gender: determineStudentGender(found, examinationId),
                examRegisterNumbers: regNos,
                examRegisterNos: regNos,
                examRegNo:
                  (found as any).examRegisterNos?.[examinationId] ||
                  (found as any).examRegNo ||
                  (found as any).regNo ||
                  found.examRegisterNumbers?.[examinationId] ||
                  regNos[examinationId] ||
                  '',
                regNo:
                  (found as any).examRegisterNos?.[examinationId] ||
                  (found as any).examRegNo ||
                  (found as any).regNo ||
                  found.examRegisterNumbers?.[examinationId] ||
                  regNos[examinationId] ||
                  '',
              };
            }
            return p;
          });
          return sortStudentsBoysFirst(updated, examinationId).map((s, idx) => ({ ...s, rollNo: idx + 1 }));
        });
      }
    };
    window.addEventListener('madrasa_students_updated', handleStudentsUpdated);

    return () => {
      if (unsub) unsub();
      window.removeEventListener('madrasa_students_updated', handleStudentsUpdated);
    };
  }, [classId, subjectId, examinationId]);

  const handleMarkChange = (studentId: string, compKey: string, val: string, maxMarks: number) => {
    if (val !== '' && !/^\d+$/.test(val)) return; // integer only
    if (val !== '' && parseInt(val, 10) > maxMarks) {
      alert(`Mark cannot exceed maximum limit of ${maxMarks}`);
      return;
    }

    setMarks(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        componentMarks: {
          ...prev[studentId]?.componentMarks,
          [compKey]: val,
        },
      },
    }));
  };

  const handleToggleAbsent = (studentId: string) => {
    setMarks(prev => {
      const current = prev[studentId] || { isAbsent: false, componentMarks: {}, remarks: '' };
      const nextAbsent = !current.isAbsent;
      const compMarks = { ...current.componentMarks };
      if (nextAbsent) {
        effectiveComponents.forEach(c => {
          compMarks[c.componentKey] = '0';
        });
      } else {
        effectiveComponents.forEach(c => {
          if (compMarks[c.componentKey] === '0') {
            compMarks[c.componentKey] = '';
          }
        });
      }
      return {
        ...prev,
        [studentId]: {
          ...current,
          isAbsent: nextAbsent,
          componentMarks: compMarks,
          remarks: nextAbsent ? 'Absent' : '',
        },
      };
    });
  };

  const calculateStudentTotal = (studentId: string): number | string => {
    const entry = marks[studentId];
    if (!entry) return 0;
    if (entry.isAbsent) return 'AB';

    let total = 0;
    let hasAny = false;
    for (const val of Object.values(entry.componentMarks)) {
      if (val !== '') {
        total += parseInt(val, 10);
        hasAny = true;
      }
    }
    return hasAny ? total : '—';
  };

  const isClassTeacher = Boolean(
    user &&
    user.role === 'teacher' &&
    (user.inChargeClassId === classId ||
      (user.inChargeClassId && isClassMatch([user.inChargeClassId], classId)) ||
      (cls && user.inChargeClassId && isClassMatch([user.inChargeClassId], cls.name)) ||
      (cls && String(cls.numericGrade) === String(user.inChargeClassId)))
  );

  const userAssignments = Array.isArray(user?.assignments)
    ? user.assignments
    : Array.isArray((user as any)?.assignedSubjects)
    ? (user as any).assignedSubjects
    : [];

  const isAssignedViaUserAssignments = userAssignments.some(
    (a: any) =>
      (a.classId === classId || (cls && isClassMatch([a.classId], classId))) &&
      (a.subjectId === subjectId || (subject && a.subjectId === subject.id))
  );

  const isSubjectTeacher = Boolean(
    user &&
    user.role === 'teacher' &&
    (isAssignedViaUserAssignments ||
      (assignedTeacherId && assignedTeacherId === user.id) ||
      (markSheet?.assignedTeacherId && markSheet.assignedTeacherId === user.id))
  );

  // 3-Tier Status Permissions:
  // 1. 'locked': strictly read-only for all teachers (Principal lock)
  // 2. 'approved': read-only for all teachers (awaiting Principal's lock)
  // 3. 'submitted': editable for Class Teacher; read-only for Subject Teacher
  // 4. 'draft': editable for Subject Teacher. If user is only Class Teacher (and not Subject Teacher), it is read-only (waiting for Subject Teacher submission)
  const isLocked = markSheet?.status === 'locked';
  const isApproved = markSheet?.status === 'approved';
  const isSubmitted = markSheet?.status === 'submitted';
  const isDraft = !isLocked && !isApproved && !isSubmitted;

  const isReadOnly =
    isLocked ||
    isApproved ||
    (isSubmitted && !isClassTeacher) ||
    (isDraft && isClassTeacher && !isSubjectTeacher);

  const [isApproving, setIsApproving] = useState(false);

  const handleSaveDraft = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    setErrorMsg(null);
    try {
      // Build payload
      const studentMarksPayload: Record<string, any> = {};
      for (const [studentId, entry] of Object.entries(marks)) {
        if (entry.isAbsent) {
          const compZeros: Record<string, number> = {};
          effectiveComponents.forEach(c => {
            compZeros[c.componentKey] = 0;
          });
          studentMarksPayload[studentId] = {
            studentId,
            isAbsent: true,
            componentMarks: compZeros,
            subjectTotal: 0,
            remarks: entry.remarks || 'Absent',
          };
        } else {
          const compNum: Record<string, number> = {};
          let subjectTotal = 0;
          for (const [k, v] of Object.entries(entry.componentMarks)) {
            const num = v !== '' ? parseInt(v, 10) : 0;
            compNum[k] = num;
            subjectTotal += num;
          }
          studentMarksPayload[studentId] = {
            studentId,
            isAbsent: false,
            componentMarks: compNum,
            subjectTotal,
            remarks: entry.remarks,
          };
        }
      }

      const res = await fetchWithAuth('/api/mark-sheets/save-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          examinationId,
          classId,
          subjectId,
          studentMarks: studentMarksPayload,
          keepStatus: isClassTeacher && isSubmitted, // keep 'submitted' status if Class Teacher edits before approving
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save draft');
      }

      const data = await res.json();
      setMarkSheet(data.markSheet);

      // Direct persistent Firestore write
      if (data.markSheet?.id) {
        try {
          await setDoc(doc(db, 'marks', data.markSheet.id), cleanForFirestore(data.markSheet), { merge: true });
        } catch (firestoreErr: any) {
          console.warn('Firestore mark draft write warning:', firestoreErr);
        }
      }

      setSaveSuccess(true);
      if (data.markSheet?.id) {
        logAuditEvent({
          action: 'MARKS_SUBMITTED',
          details: `Teacher ${user?.name || 'Teacher'} drafted marks for Class ${cls?.name || classId} - ${subject?.nameEn || subjectId} (${exam?.nameEn || examinationId}).`,
          currentUser: user,
          recordType: 'marks',
          recordId: data.markSheet.id,
        }).catch(e => console.warn('Audit log error:', e));
      }
      setTimeout(() => setSaveSuccess(false), 3000);
      return data.markSheet;
    } catch (err: any) {
      setErrorMsg(err.message);
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const handleApprove = async () => {
    const confirmApprove = window.confirm(
      `Approve marks for Class ${cls?.name || classId} - ${subject?.nameEn || subjectId}? This will change the status to "Approved — Awaiting Principal's Lock".`
    );
    if (!confirmApprove) return;

    setIsApproving(true);
    try {
      // 1. First save latest modifications
      const savedSheet = await handleSaveDraft();
      const targetSheetId = savedSheet?.id || markSheet?.id;
      if (!targetSheetId) {
        throw new Error('Unable to resolve mark sheet ID for approval.');
      }

      // 2. Direct persistent Firestore write
      try {
        await setDoc(
          doc(db, 'marks', targetSheetId),
          cleanForFirestore({
            status: 'approved',
            verifiedAt: new Date().toISOString(),
            verifiedBy: user?.name || 'Class Teacher',
          }),
          { merge: true }
        );
      } catch (firestoreErr: any) {
        console.warn('Firestore approve mark sheet warning:', firestoreErr);
      }

      // 3. API approve call
      const res = await fetchWithAuth(`/api/mark-sheets/${targetSheetId}/approve`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to approve mark sheet');
      }

      const data = await res.json();
      setMarkSheet(data.markSheet);

      logAuditEvent({
        action: 'MARKS_APPROVED',
        details: `Class Teacher ${user?.name || 'Class Teacher'} approved marks for Class ${cls?.name || classId} - ${subject?.nameEn || subjectId} (${exam?.nameEn || examinationId}).`,
        currentUser: user,
        recordType: 'marks',
        recordId: targetSheetId,
      }).catch(e => console.warn('Audit log error:', e));

      alert('Marks successfully approved! Status is now: "Approved — Awaiting Principal\'s Lock".');
    } catch (err: any) {
      alert(err.message || 'Failed to approve marks');
    } finally {
      setIsApproving(false);
    }
  };

  const handleSubmit = async () => {
    // First save latest draft
    const saved = await handleSaveDraft();
    const targetId = saved?.id || markSheet?.id;
    if (!targetId) return;

    try {
      // Direct persistent Firestore write
      try {
        await setDoc(
          doc(db, 'marks', targetId),
          cleanForFirestore({
            status: 'submitted',
            submittedAt: new Date().toISOString(),
          }),
          { merge: true }
        );
      } catch (firestoreErr: any) {
        console.warn('Firestore mark submit write warning:', firestoreErr);
      }

      const res = await fetchWithAuth(`/api/mark-sheets/${targetId}/submit`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to submit mark sheet');
      }
      const data = await res.json();
      setMarkSheet(data.markSheet);
      setShowSubmitModal(false);

      logAuditEvent({
        action: 'MARKS_SUBMITTED',
        details: `Subject Teacher ${user?.name || 'Teacher'} submitted mark sheet for Class ${cls?.name || classId} - ${subject?.nameEn || subjectId} (${exam?.nameEn || examinationId}).`,
        currentUser: user,
        recordType: 'marks',
        recordId: targetId,
      }).catch(e => console.warn('Audit log error:', e));

      alert('Mark sheet successfully submitted to the Class Teacher for review & approval!');
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20 text-slate-500">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-700"></div>
        <span className="ml-3 font-medium">Loading mark sheet...</span>
      </div>
    );
  }

  const compTotal = (components || []).reduce((sum, c) => sum + (Number(c.maxMarks) || 0), 0);
  const effectiveComponents: SubjectAssessmentRule[] = (components && components.length > 0)
    ? components
    : [
        { componentKey: 'written', labelEn: 'OMR (Written)', labelMl: 'എഴുത്ത് പരീക്ഷ', maxMarks: 20 },
        { componentKey: 'oral', labelEn: 'OCR (Oral / Descriptive)', labelMl: 'വാചിക പരീക്ഷ', maxMarks: 20 },
        { componentKey: 'ce', labelEn: 'CIE (Continuous Evaluation)', labelMl: 'തുടർമൂല്യനിർണ്ണയം', maxMarks: 10 },
      ];
  const subjectMaxMarks = compTotal > 0 ? compTotal : effectiveComponents.reduce((sum, c) => sum + c.maxMarks, 0);

  // Subject evaluation status based strictly on OMR + OCR marks (excluding CIE from 35% threshold)
  const calculateStudentSubjectStatus = (studentId: string) => {
    const entry = marks[studentId];
    if (!entry) return { isAbsent: false, total: 0, writtenTotal: 0, maxWritten: 0, cieMark: 0, maxCie: 0, isFail: false, hasAny: false };
    if (entry.isAbsent) return { isAbsent: true, total: 'AB', writtenTotal: 0, maxWritten: 0, cieMark: 0, maxCie: 0, isFail: true, hasAny: true };

    let writtenTotal = 0;
    let maxWritten = 0;
    let cieMark = 0;
    let maxCie = 0;
    let hasAny = false;

    effectiveComponents.forEach((comp, idx) => {
      const k = (comp.componentKey || '').toLowerCase();
      const val = entry.componentMarks[comp.componentKey];
      const numVal = val !== '' && val !== undefined && !isNaN(Number(val)) ? Number(val) : 0;
      if (val !== '' && val !== undefined) hasAny = true;

      const isCie = k === 'ce' || k === 'diary' || k.includes('ce') || k.includes('cie') || (effectiveComponents.length === 3 && idx === 2);
      if (isCie) {
        cieMark += numVal;
        maxCie += comp.maxMarks || 10;
      } else {
        writtenTotal += numVal;
        maxWritten += comp.maxMarks || 20;
      }
    });

    const grandTotal = writtenTotal + cieMark;
    // The 35% passing mark applies STRICTLY to writtenTotal out of maxWritten
    const isFail = maxWritten > 0 && writtenTotal < (maxWritten * 0.35);

    return {
      isAbsent: false,
      total: hasAny ? grandTotal : '—',
      writtenTotal,
      maxWritten,
      cieMark,
      maxCie,
      isFail,
      hasAny,
    };
  };

  const teacherBoysCount = students.filter(s => determineStudentGender(s, examinationId) === 'Boy').length;
  const teacherGirlsCount = students.filter(s => determineStudentGender(s, examinationId) === 'Girl').length;

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 rounded-xl text-slate-600 bg-slate-100 hover:bg-slate-200 transition"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900 font-ml">
                  {cls?.numericGrade === 9 && (subject?.id === 'sub_history_buhuth' || subject?.code === 'HST')
                    ? 'ബുഹൂസ്'
                    : subject?.displayNameMl || subject?.nameMl || subject?.nameEn}
                </h2>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  {isMl ? cls?.nameMl : cls?.name}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {isMl ? exam?.nameMl : exam?.nameEn} • Max Marks: {subjectMaxMarks} • ({students.length} Students: {teacherBoysCount} Boys, {teacherGirlsCount} Girls)
              </p>
            </div>
          </div>

          {/* Status Badges */}
          <div className="flex items-center gap-2">
            {markSheet?.status === 'returned_for_correction' && (
              <div className="text-xs bg-amber-50 text-amber-800 border border-amber-300 px-2.5 py-1 rounded-xl flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span className="text-[11px]">
                  Returned: <strong className="font-semibold">{markSheet.returnedReason}</strong>
                </span>
              </div>
            )}

            {isLocked ? (
              <div className="text-xs font-bold bg-emerald-100 text-emerald-800 px-3 py-1.5 rounded-xl flex items-center justify-center gap-1.5 whitespace-nowrap text-center shadow-2xs">
                <Lock className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                <span>Locked</span>
              </div>
            ) : isApproved ? (
              <div className="text-xs font-bold bg-emerald-100 text-emerald-800 px-3 py-1.5 rounded-xl flex items-center justify-center gap-1.5 whitespace-nowrap text-center shadow-2xs">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                <span>Approved</span>
              </div>
            ) : isSubmitted ? (
              <div className="text-xs font-bold bg-blue-100 text-blue-800 px-3 py-1.5 rounded-xl flex items-center justify-center gap-1.5 whitespace-nowrap text-center shadow-2xs">
                <Clock className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                <span>Submitted</span>
              </div>
            ) : (
              <div className="text-xs font-bold bg-orange-100 text-orange-800 px-3 py-1.5 rounded-xl flex items-center justify-center gap-1.5 whitespace-nowrap text-center shadow-2xs">
                <Clock className="w-3.5 h-3.5 text-orange-700 shrink-0" />
                <span>Unsubmitted</span>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons Row - Equal Height Responsive 3-Column Grid */}
        <div className="grid grid-cols-3 gap-2 w-full my-3">
          {/* Button 1: Save Draft / Save Changes */}
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={isReadOnly || isSaving}
            className={`h-10 flex items-center justify-center gap-1.5 text-xs sm:text-sm font-semibold whitespace-nowrap rounded-xl transition ${
              isReadOnly
                ? 'border border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed'
                : isSubmitted
                ? 'border border-blue-600 text-blue-600 hover:bg-blue-50 bg-white shadow-2xs cursor-pointer disabled:opacity-50'
                : 'border border-orange-600 text-orange-600 hover:bg-orange-50 bg-white shadow-2xs cursor-pointer disabled:opacity-50'
            }`}
          >
            <Save className="w-4 h-4 shrink-0" />
            <span>{isSaving ? 'Saving...' : 'Save'}</span>
          </button>

          {/* Button 2: Preview */}
          <button
            type="button"
            onClick={() => setShowPreviewModal(true)}
            className="h-10 flex items-center justify-center gap-1.5 text-xs sm:text-sm font-semibold whitespace-nowrap border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 rounded-xl transition shadow-2xs cursor-pointer"
          >
            <Eye className="w-4 h-4 shrink-0" />
            <span>Preview</span>
          </button>

          {/* Button 3: Dynamic Action (Submit / Approve / Waiting / Approved / Locked) */}
          {isLocked ? (
            <button
              type="button"
              disabled
              className="h-10 flex items-center justify-center gap-1.5 text-xs sm:text-sm font-bold whitespace-nowrap bg-emerald-700 text-white rounded-xl transition cursor-not-allowed shadow-2xs"
            >
              <Lock className="w-4 h-4 shrink-0" />
              <span>Locked</span>
            </button>
          ) : isApproved ? (
            <button
              type="button"
              disabled
              className="h-10 flex items-center justify-center gap-1.5 text-xs sm:text-sm font-bold whitespace-nowrap bg-emerald-700 text-white rounded-xl transition cursor-not-allowed shadow-2xs"
            >
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>Approved</span>
            </button>
          ) : isSubmitted ? (
            isClassTeacher ? (
              <button
                type="button"
                onClick={handleApprove}
                disabled={isApproving}
                className="h-10 flex items-center justify-center gap-1.5 text-xs sm:text-sm font-bold whitespace-nowrap bg-blue-700 hover:bg-blue-800 text-white shadow-sm rounded-xl transition disabled:opacity-60 cursor-pointer"
              >
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>{isApproving ? 'Approving...' : 'Approve'}</span>
              </button>
            ) : (
              <button
                type="button"
                disabled
                className="h-10 flex items-center justify-center gap-1.5 text-xs sm:text-sm font-semibold whitespace-nowrap bg-blue-100 text-blue-800 border border-blue-300 rounded-xl transition cursor-not-allowed shadow-2xs"
              >
                <Clock className="w-4 h-4 shrink-0" />
                <span>Awaiting Approval</span>
              </button>
            )
          ) : (
            /* Draft / Not Started state */
            isSubjectTeacher ? (
              <button
                type="button"
                onClick={() => setShowSubmitModal(true)}
                className="h-10 flex items-center justify-center gap-1.5 text-xs sm:text-sm font-semibold whitespace-nowrap bg-orange-700 hover:bg-orange-800 text-white shadow-sm rounded-xl transition cursor-pointer"
              >
                <Send className="w-4 h-4 shrink-0" />
                <span>Submit</span>
              </button>
            ) : (
              <button
                type="button"
                disabled
                className="h-10 flex items-center justify-center gap-1.5 text-xs sm:text-sm font-semibold whitespace-nowrap bg-gray-100 text-gray-500 border border-gray-300 rounded-xl transition cursor-not-allowed shadow-2xs"
              >
                <Clock className="w-4 h-4 shrink-0" />
                <span>Waiting for Submission</span>
              </button>
            )
          )}
        </div>
      </div>

      {saveSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
          <span>{t.saved}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main Mark Entry Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div
          onWheel={handleHorizontalWheel}
          className="overflow-x-auto relative w-full scrollbar-thin"
        >
          <table className="w-full text-left border-collapse text-sm">
            <thead className="sticky top-0 bg-slate-100 z-30">
              <tr className="bg-slate-100 text-slate-700 text-xs uppercase tracking-wider border-b border-slate-200">
                <th className="py-3 px-3 w-12 text-center sticky left-0 bg-slate-100 z-40 shadow-[1px_0_0_0_#e5e7eb] font-mono">Roll</th>
                <th className="py-3 px-2 w-20 text-center sticky left-12 bg-slate-100 z-40 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] font-mono text-emerald-900 font-bold">Reg No</th>
                <th className="py-3 px-4 min-w-[160px] md:min-w-[200px] text-left">Student Name</th>
                <th className="py-3 px-2 w-16 text-center">Gender</th>
                <th className="py-3 px-3 w-20 text-center font-bold text-rose-800">Absent</th>
                {effectiveComponents.map(comp => (
                  <th key={comp.componentKey} className="py-3 px-3 text-center min-w-[100px]">
                    <div>{comp.labelEn}</div>
                    <div className="text-[10px] text-emerald-800 font-bold lowercase">
                      (max {comp.maxMarks})
                    </div>
                  </th>
                ))}
                <th className="py-3 px-4 w-24 text-center font-bold bg-slate-200/60">
                  Total
                  <div className="text-[10px] text-slate-500 lowercase">(max {subjectMaxMarks})</div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {students.map((student, idx) => {
                const sEntry = marks[student.id] || { isAbsent: false, componentMarks: {}, remarks: '' };
                const isAbsent = sEntry.isAbsent;
                const statusInfo = calculateStudentSubjectStatus(student.id);
                const regNo =
                  (student as any).examRegisterNos?.[examinationId] ||
                  (student as any).examRegNo ||
                  (student as any).regNo ||
                  student.examRegisterNumbers?.[examinationId] ||
                  '—';
                const studentGender = determineStudentGender(student, examinationId);

                return (
                  <tr
                    key={student.id}
                    className={`transition group ${
                      isAbsent
                        ? 'bg-amber-50/70 hover:bg-amber-100/60'
                        : idx % 2 === 0
                        ? 'bg-white hover:bg-slate-50/80'
                        : 'bg-slate-50/30 hover:bg-slate-50/80'
                    }`}
                  >
                    {/* Compact Sticky Frozen Column 1: Roll No */}
                    <td
                      className={`py-3 px-3 w-12 text-center font-bold font-mono text-slate-600 sticky left-0 z-20 shadow-[1px_0_0_0_#e5e7eb] ${
                        isAbsent ? 'bg-amber-50 group-hover:bg-amber-100' : 'bg-white group-hover:bg-slate-50'
                      }`}
                    >
                      {student.rollNo}
                    </td>

                    {/* Compact Sticky Frozen Column 2: Exam Reg No */}
                    <td
                      className={`py-3 px-2 w-20 text-center font-semibold font-mono text-emerald-800 sticky left-12 z-20 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] ${
                        isAbsent ? 'bg-amber-50 group-hover:bg-amber-100' : 'bg-white group-hover:bg-slate-50'
                      }`}
                    >
                      {regNo}
                    </td>

                    {/* Scrollable Column 3: Student Name (Clean without Admission Number) */}
                    <td className="py-3 px-4 min-w-[160px] md:min-w-[200px] text-left">
                      <div className="font-bold text-slate-900 whitespace-nowrap text-xs">
                        {student.nameEn}
                      </div>
                      {student.nameMl && (
                        <div className="text-[11px] text-slate-500 font-ml leading-tight mt-0.5 whitespace-nowrap">
                          {student.nameMl}
                        </div>
                      )}
                    </td>

                    {/* Non-clickable Gender Badge */}
                    <td className="py-3 px-2 text-center whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        studentGender === 'Girl'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}>
                        {studentGender}
                      </span>
                    </td>

                    {/* Absent Checkbox Column */}
                    <td className="py-3 px-3 text-center">
                      {!isReadOnly ? (
                        <label className="inline-flex items-center justify-center cursor-pointer">
                          <input
                            type="checkbox"
                            disabled={isReadOnly}
                            checked={isAbsent}
                            onChange={() => handleToggleAbsent(student.id)}
                            className="w-4.5 h-4.5 text-red-600 rounded border-slate-300 focus:ring-red-500 cursor-pointer disabled:cursor-not-allowed"
                            title={isAbsent ? 'Uncheck to mark Present' : 'Check to mark Absent'}
                          />
                        </label>
                      ) : isAbsent ? (
                        <span className="text-red-600 font-bold font-mono">AB</span>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>

                    {/* Component Inputs with comfortable touch padding */}
                    {effectiveComponents.map(comp => (
                      <td key={comp.componentKey} className="py-3 px-2 text-center min-w-[90px]">
                        {isAbsent ? (
                          <span className="text-red-600 font-bold font-mono">AB</span>
                        ) : isReadOnly ? (
                          <span className="font-mono font-bold text-slate-800">
                            {sEntry.componentMarks[comp.componentKey] !== '' && sEntry.componentMarks[comp.componentKey] !== undefined
                              ? sEntry.componentMarks[comp.componentKey]
                              : '0'}
                          </span>
                        ) : (
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            disabled={isReadOnly || isAbsent}
                            value={sEntry.componentMarks[comp.componentKey] || ''}
                            onChange={e =>
                              handleMarkChange(student.id, comp.componentKey, e.target.value, comp.maxMarks)
                            }
                            placeholder="0"
                            className="w-16 mx-auto text-center font-bold font-mono py-2 px-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent bg-white disabled:bg-slate-100 disabled:text-slate-400 shadow-2xs touch-manipulation"
                          />
                        )}
                      </td>
                    ))}

                    {/* Auto Computed Total */}
                    <td className="py-3 px-4 text-center font-mono font-extrabold text-base bg-slate-50/70 w-24">
                      {isAbsent ? (
                        <span className="text-red-600 font-bold font-mono">AB</span>
                      ) : (
                        <span className={statusInfo.isFail ? 'text-red-600 font-bold' : 'text-emerald-900 font-bold'}>
                          {statusInfo.total}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Submit Confirmation Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-2">
              Submit Marks to Class Teacher?
            </h3>
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              Once submitted, marks for this subject will be sent to the <strong>Class Teacher</strong> for review, direct editing, and approval. It will become read-only for you until approved or returned.
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowSubmitModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl"
              >
                {t.cancel}
              </button>
              <button
                onClick={handleSubmit}
                className="px-4 py-2 text-xs font-bold text-white bg-orange-700 hover:bg-orange-800 rounded-xl shadow-xs"
              >
                Confirm & Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4 pb-2 border-b">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Mark Sheet Preview: {cls?.numericGrade === 9 && (subject?.id === 'sub_history_buhuth' || subject?.code === 'HST') ? 'ബുഹൂസ്' : subject?.displayNameMl || subject?.nameMl || subject?.nameEn} ({cls?.name})
                </h3>
                <p className="text-xs text-slate-500">{exam?.nameEn} • Al-Madrasathul Islamiya Pallikkuth</p>
              </div>
              <button
                onClick={() => setShowPreviewModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold px-2"
              >
                ✕
              </button>
            </div>

            <table className="w-full text-xs border border-slate-200 divide-y divide-slate-200">
              <thead className="bg-slate-100 font-bold">
                <tr>
                  <th className="p-2 text-center w-12 font-mono">Roll</th>
                  <th className="p-2 text-center font-mono w-20">Reg No</th>
                  <th className="p-2 text-left">Student Name</th>
                  <th className="p-2 text-center w-16">Gender</th>
                  {components.map(c => (
                    <th key={c.componentKey} className="p-2 text-center">
                      {c.labelEn} ({c.maxMarks})
                    </th>
                  ))}
                  <th className="p-2 text-center">Total (50)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map(s => {
                  const entry = marks[s.id];
                  const regNo =
                    (s as any).examRegisterNos?.[examinationId] ||
                    (s as any).examRegNo ||
                    (s as any).regNo ||
                    s.examRegisterNumbers?.[examinationId] ||
                    '—';
                  const sGender = determineStudentGender(s, examinationId);
                  return (
                    <tr key={s.id}>
                      <td className="p-2 text-center font-mono">{s.rollNo}</td>
                      <td className="p-2 text-center font-mono font-bold text-emerald-950">{regNo}</td>
                      <td className="p-2 font-medium">{s.nameEn}</td>
                      <td className="p-2 text-center whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          sGender === 'Girl'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}>
                          {sGender}
                        </span>
                      </td>
                      {components.map(c => (
                        <td key={c.componentKey} className="p-2 text-center font-mono">
                          {entry?.isAbsent ? (
                            <span className="text-red-600 font-bold">AB</span>
                          ) : (
                            entry?.componentMarks[c.componentKey] || '0'
                          )}
                        </td>
                      ))}
                      {(() => {
                        const sStatus = calculateStudentSubjectStatus(s.id);
                        return (
                          <td className={`p-2 text-center font-mono font-bold ${entry?.isAbsent || sStatus.isFail ? 'text-red-600 font-bold' : 'text-emerald-950'}`}>
                            {entry?.isAbsent ? (
                              <span className="text-red-600 font-bold">AB</span>
                            ) : (
                              sStatus.total
                            )}
                          </td>
                        );
                      })()}
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setShowPreviewModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
