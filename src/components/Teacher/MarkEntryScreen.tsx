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
      const current = prev[studentId];
      const nextAbsent = !current.isAbsent;
      const compMarks = { ...current.componentMarks };
      if (nextAbsent) {
        Object.keys(compMarks).forEach(k => (compMarks[k] = ''));
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
    if (entry.isAbsent) return 'Absent';

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

  const isReadOnly =
    markSheet?.status === 'submitted' ||
    markSheet?.status === 'approved' ||
    markSheet?.status === 'locked';

  const handleSaveDraft = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    setErrorMsg(null);
    try {
      // Build payload
      const studentMarksPayload: Record<string, any> = {};
      for (const [studentId, entry] of Object.entries(marks)) {
        if (entry.isAbsent) {
          studentMarksPayload[studentId] = {
            studentId,
            isAbsent: true,
            componentMarks: {},
            remarks: entry.remarks,
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
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async () => {
    // First save latest draft
    await handleSaveDraft();
    if (!markSheet?.id) return;

    try {
      // Direct persistent Firestore write
      try {
        await setDoc(
          doc(db, 'marks', markSheet.id),
          cleanForFirestore({
            status: 'submitted',
            submittedAt: new Date().toISOString(),
          }),
          { merge: true }
        );
      } catch (firestoreErr: any) {
        console.warn('Firestore mark submit write warning:', firestoreErr);
      }

      const res = await fetchWithAuth(`/api/mark-sheets/${markSheet.id}/submit`, {
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
        details: `Teacher ${user?.name || 'Teacher'} submitted mark sheet for Class ${cls?.name || classId} - ${subject?.nameEn || subjectId} (${exam?.nameEn || examinationId}).`,
        currentUser: user,
        recordType: 'marks',
        recordId: markSheet.id,
      }).catch(e => console.warn('Audit log error:', e));

      alert('Mark sheet successfully submitted to the Principal for verification!');
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
    if (entry.isAbsent) return { isAbsent: true, total: 'Absent', writtenTotal: 0, maxWritten: 0, cieMark: 0, maxCie: 0, isFail: true, hasAny: true };

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
          <div className="flex items-center gap-3">
            {markSheet?.status === 'returned_for_correction' && (
              <div className="text-xs bg-amber-50 text-amber-800 border border-amber-300 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <span>
                  Returned: <strong className="font-semibold">{markSheet.returnedReason}</strong>
                </span>
              </div>
            )}

            {markSheet?.status === 'submitted' && (
              <div className="text-xs bg-blue-50 text-blue-800 border border-blue-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-blue-600" />
                <span>Submitted — Awaiting Principal's Verification</span>
              </div>
            )}

            {markSheet?.status === 'approved' && (
              <div className="text-xs bg-emerald-50 text-emerald-800 border border-emerald-300 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span>Verified & Approved</span>
              </div>
            )}

            {markSheet?.status === 'locked' && (
              <div className="text-xs bg-purple-50 text-purple-800 border border-purple-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-purple-600" />
                <span>Locked by Principal</span>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons Row */}
        {!isReadOnly && (
          <div className="grid grid-cols-3 gap-2 w-full my-3">
            <button
              onClick={handleSaveDraft}
              disabled={isSaving}
              className="h-10 flex items-center justify-center gap-1.5 text-xs sm:text-sm font-semibold whitespace-nowrap border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 rounded-xl transition shadow-2xs disabled:opacity-50"
            >
              <Save className="w-4 h-4 shrink-0" />
              <span>{isSaving ? 'Saving...' : 'Save'}</span>
            </button>

            <button
              onClick={() => setShowPreviewModal(true)}
              className="h-10 flex items-center justify-center gap-1.5 text-xs sm:text-sm font-semibold whitespace-nowrap border border-emerald-300 text-emerald-800 bg-emerald-50/50 hover:bg-emerald-100 rounded-xl transition shadow-2xs"
            >
              <Eye className="w-4 h-4 shrink-0" />
              <span>Preview</span>
            </button>

            <button
              onClick={() => setShowSubmitModal(true)}
              className="h-10 flex items-center justify-center gap-1.5 text-xs sm:text-sm font-semibold whitespace-nowrap bg-emerald-800 text-white shadow-sm hover:bg-emerald-900 rounded-xl transition"
            >
              <Send className="w-4 h-4 shrink-0" />
              <span>Submit</span>
            </button>
          </div>
        )}
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
                <th className="py-3 px-3 w-24 text-center">Status</th>
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

                    {/* Present / Absent Toggle Button */}
                    <td className="py-3 px-3 text-center">
                      <button
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => handleToggleAbsent(student.id)}
                        className={`px-2.5 py-1.5 text-xs font-bold rounded-lg border flex items-center justify-center gap-1 mx-auto transition cursor-pointer disabled:cursor-not-allowed ${
                          isAbsent
                            ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                        }`}
                        title={isAbsent ? 'Mark as Present' : 'Mark as Absent'}
                      >
                        {isAbsent ? (
                          <>
                            <UserX className="w-3.5 h-3.5" />
                            <span>Absent</span>
                          </>
                        ) : (
                          <>
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>Present</span>
                          </>
                        )}
                      </button>
                    </td>

                    {/* Component Inputs with comfortable touch padding */}
                    {effectiveComponents.map(comp => (
                      <td key={comp.componentKey} className="py-3 px-2 text-center min-w-[90px]">
                        {isAbsent ? (
                          <span className="text-slate-400 font-mono text-xs select-none">—</span>
                        ) : (
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            disabled={isReadOnly}
                            value={sEntry.componentMarks[comp.componentKey] || ''}
                            onChange={e =>
                              handleMarkChange(student.id, comp.componentKey, e.target.value, comp.maxMarks)
                            }
                            placeholder="0"
                            className="w-16 mx-auto text-center font-bold font-mono py-2 px-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent bg-white disabled:bg-slate-100 disabled:text-slate-500 shadow-2xs touch-manipulation"
                          />
                        )}
                      </td>
                    ))}

                    {/* Auto Computed Total */}
                    <td className="py-3 px-4 text-center font-mono font-extrabold text-base bg-slate-50/70 w-24">
                      {isAbsent ? (
                        <span className="text-amber-800 text-xs font-bold bg-amber-100 px-2 py-0.5 rounded">
                          Absent
                        </span>
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
              Submit Marks to Principal?
            </h3>
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              Once submitted, marks for this subject will become <strong>read-only</strong> while the Principal verifies them. Any absent students will be noted accordingly.
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
                className="px-4 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl shadow-xs"
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
                          {entry?.isAbsent ? 'Absent' : entry?.componentMarks[c.componentKey] || '—'}
                        </td>
                      ))}
                      {(() => {
                        const sStatus = calculateStudentSubjectStatus(s.id);
                        return (
                          <td className={`p-2 text-center font-mono font-bold ${sStatus.isFail ? 'text-red-600 font-bold' : 'text-emerald-950'}`}>
                            {sStatus.total}
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
