import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../services/firebase';
import { doc, setDoc, getDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { MarkSheet, SubjectAssessmentRule, Student, StudentMarkEntry, sortStudentsBoysFirst, determineStudentGender } from '../../types';
import { logAuditEvent } from '../../services/auditLogger';
import {
  CheckCircle,
  Lock,
  RotateCcw,
  AlertTriangle,
  Edit2,
  Clock,
  ShieldAlert,
  X,
  UserX,
  Save,
} from 'lucide-react';

interface Props {
  markSheetId: string;
  classId: string;
  subjectId: string;
  examinationId: string;
  onClose: () => void;
  onRefresh: () => void;
}

export const MarkVerificationModal: React.FC<Props> = ({
  classId,
  subjectId,
  examinationId,
  onClose,
  onRefresh,
}) => {
  const { fetchWithAuth, user, lang, t } = useAuth();
  const [loading, setLoading] = useState(true);
  const [sheetData, setSheetData] = useState<any>(null);
  const [returnReason, setReturnReason] = useState('');
  const [showReturnInput, setShowReturnInput] = useState(false);

  // Administrative mark correction: Inline & Bulk Edit State
  const [editableRows, setEditableRows] = useState<Set<string>>(new Set());
  const [isEditingAll, setIsEditingAll] = useState(false);
  const [draftMarks, setDraftMarks] = useState<Record<string, Record<string, string | number>>>({});
  const [draftAbsent, setDraftAbsent] = useState<Record<string, boolean>>({});
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditReasonInput, setAuditReasonInput] = useState('');
  const [isSavingCorrection, setIsSavingCorrection] = useState(false);

  const isMl = lang === 'ml';

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(
        `/api/mark-sheet-detail?examinationId=${examinationId}&classId=${classId}&subjectId=${subjectId}`
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.students)) {
          data.students = sortStudentsBoysFirst(data.students, examinationId).map((s: any, idx: number) => ({
            ...s,
            rollNo: idx + 1,
            gender: determineStudentGender(s, examinationId),
          }));
        }

        // Live Firestore sync check: ensure data.markSheet has all live student marks from Firestore
        if (data?.markSheet?.id) {
          try {
            const remoteDoc = await getDoc(doc(db, 'marks', data.markSheet.id));
            if (remoteDoc.exists()) {
              const remoteData = remoteDoc.data();
              const remoteStudentMarks = remoteData.studentMarks || remoteData.marks;
              if (remoteStudentMarks && typeof remoteStudentMarks === 'object' && Object.keys(remoteStudentMarks).length > 0) {
                data.markSheet.studentMarks = {
                  ...(data.markSheet.studentMarks || {}),
                  ...remoteStudentMarks,
                };
              }
              if (remoteData.status) {
                data.markSheet.status = remoteData.status;
              }
            } else {
              // Try querying by composite keys in case the document ID is different
              const q = query(
                collection(db, 'marks'),
                where('examinationId', '==', examinationId),
                where('classId', '==', classId),
                where('subjectId', '==', subjectId)
              );
              const qSnap = await getDocs(q);
              if (!qSnap.empty) {
                const foundDoc = qSnap.docs[0];
                const remoteData = foundDoc.data();
                data.markSheet.id = foundDoc.id;
                const remoteMarks = remoteData.studentMarks || remoteData.marks;
                if (remoteMarks && typeof remoteMarks === 'object' && Object.keys(remoteMarks).length > 0) {
                  data.markSheet.studentMarks = {
                    ...(data.markSheet.studentMarks || {}),
                    ...remoteMarks,
                  };
                }
                if (remoteData.status) {
                  data.markSheet.status = remoteData.status;
                }
              }
            }
          } catch (fErr) {
            console.warn('Firestore live read on loadData error:', fErr);
          }
        }

        setSheetData(data);
      }
    } catch (err) {
      console.error('Error loading verification sheet:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [classId, subjectId, examinationId]);

  const handleApprove = async () => {
    if (!sheetData?.markSheet?.id) return;
    try {
      // Direct persistent Firestore write
      try {
        await setDoc(
          doc(db, 'marks', sheetData.markSheet.id),
          {
            status: 'approved',
            verifiedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch (firestoreErr: any) {
        console.warn('Firestore approve mark sheet warning:', firestoreErr);
      }

      const res = await fetchWithAuth(`/api/mark-sheets/${sheetData.markSheet.id}/approve`, {
        method: 'POST',
      });
      if (res.ok) {
        logAuditEvent({
          action: 'MARKS_APPROVED',
          details: `Principal ${user?.name || 'ASLAM TK'} approved mark sheet for Class ${sheetData.classItem?.name || classId} - ${sheetData.subjectItem?.nameEn || subjectId}.`,
          currentUser: user,
          recordType: 'marks',
          recordId: sheetData.markSheet.id,
        }).catch(e => console.warn('Audit log error:', e));

        alert('Mark sheet successfully approved!');
        onRefresh();
        loadData();
      }
    } catch (err) {
      alert('Failed to approve mark sheet');
    }
  };

  const handleLock = async () => {
    if (!sheetData?.markSheet?.id) return;
    try {
      // Direct persistent Firestore write
      try {
        await setDoc(
          doc(db, 'marks', sheetData.markSheet.id),
          {
            status: 'locked',
            lockedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch (firestoreErr: any) {
        console.warn('Firestore lock mark sheet warning:', firestoreErr);
      }

      const res = await fetchWithAuth(`/api/mark-sheets/${sheetData.markSheet.id}/lock`, {
        method: 'POST',
      });
      if (res.ok) {
        logAuditEvent({
          action: 'MARKS_LOCKED',
          details: `Principal ${user?.name || 'ASLAM TK'} locked mark sheet for Class ${sheetData.classItem?.name || classId} - ${sheetData.subjectItem?.nameEn || subjectId}.`,
          currentUser: user,
          recordType: 'marks',
          recordId: sheetData.markSheet.id,
        }).catch(e => console.warn('Audit log error:', e));

        alert('Mark sheet locked. No further modifications allowed without Principal unlocking.');
        onRefresh();
        loadData();
      }
    } catch (err) {
      alert('Failed to lock mark sheet');
    }
  };

  const handleUnlock = async () => {
    if (!sheetData?.markSheet?.id) return;
    try {
      // Direct persistent Firestore write
      try {
        await setDoc(
          doc(db, 'marks', sheetData.markSheet.id),
          {
            status: 'approved',
          },
          { merge: true }
        );
      } catch (firestoreErr: any) {
        console.warn('Firestore unlock mark sheet warning:', firestoreErr);
      }

      const res = await fetchWithAuth(`/api/mark-sheets/${sheetData.markSheet.id}/unlock`, {
        method: 'POST',
      });
      if (res.ok) {
        alert('Mark sheet unlocked for authorized corrections.');
        onRefresh();
        loadData();
      }
    } catch (err) {
      alert('Failed to unlock mark sheet');
    }
  };

  const handleReturnCorrection = async () => {
    if (!returnReason.trim()) {
      alert('Please specify the reason for returning this mark sheet.');
      return;
    }
    if (!sheetData?.markSheet?.id) return;
    try {
      // Direct persistent Firestore write
      try {
        await setDoc(
          doc(db, 'marks', sheetData.markSheet.id),
          {
            status: 'returned_for_correction',
            returnedReason: returnReason.trim(),
          },
          { merge: true }
        );
      } catch (firestoreErr: any) {
        console.warn('Firestore return correction warning:', firestoreErr);
      }

      const res = await fetchWithAuth(`/api/mark-sheets/${sheetData.markSheet.id}/return-correction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: returnReason }),
      });
      if (res.ok) {
        alert('Mark sheet returned to the teacher for correction.');
        onRefresh();
        onClose();
      }
    } catch (err) {
      alert('Failed to return mark sheet');
    }
  };

  if (loading || !sheetData) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
        <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-md w-full text-center space-y-4">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-700 mx-auto"></div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Loading Mark Verification Data...</h3>
            <p className="text-xs text-slate-500 mt-1">Fetching student marks, components, and teacher submissions</p>
          </div>
          <div className="space-y-2 pt-2">
            <div className="h-4 bg-slate-100 rounded animate-pulse"></div>
            <div className="h-4 bg-slate-100 rounded animate-pulse w-5/6 mx-auto"></div>
            <div className="h-4 bg-slate-100 rounded animate-pulse w-3/4 mx-auto"></div>
          </div>
        </div>
      </div>
    );
  }

  const markSheet = sheetData?.markSheet || {};
  const subject = sheetData?.subject || {};
  const cls = sheetData?.class || {};
  const exam = sheetData?.examination || {};
  const components: SubjectAssessmentRule[] = Array.isArray(sheetData?.components) ? sheetData.components : [];
  const submission = sheetData?.submission || sheetData;
  const status = markSheet?.status || 'not_started';

  // Safe headers for Teacher & Subject per requirements
  const teacherHeader = submission?.teacher?.name || submission?.teacherName || sheetData?.teacher?.name || sheetData?.teacherName || 'Teacher';
  const subjectHeader = submission?.subject?.name || submission?.subjectName || (cls?.numericGrade === 9 && (subject?.id === 'sub_history_buhuth' || subject?.code === 'HST')
    ? 'ബുഹൂസ്'
    : subject?.displayNameMl || subject?.nameMl || subject?.nameEn || subject?.name || 'Subject');

  // Build safe student lookup map
  const studentMap: Record<string, any> = {};
  if (Array.isArray(sheetData?.students)) {
    sheetData.students.forEach((s: any) => {
      if (s?.id) studentMap[s.id] = s;
    });
  }

  // Build marks array safely
  const rawSortedStudents = Array.isArray(sheetData?.students) ? sortStudentsBoysFirst(sheetData.students, examinationId) : [];
  const marksList = Array.isArray(sheetData?.marks)
    ? sheetData.marks
    : rawSortedStudents.map((st: any, idx: number) => {
        const studentId = st?.id;
        const entry = markSheet?.studentMarks?.[studentId] || markSheet?.marks?.[studentId] || {};
        return {
          student: st,
          studentId,
          studentName: st?.nameEn || st?.name,
          rollNo: idx + 1,
          admissionNo: st?.admissionNo,
          gender: determineStudentGender(st, examinationId),
          ...entry,
        };
      });

  const validMarksList = marksList.filter(Boolean);
  const sheetBoysCount = validMarksList.filter((m: any) => {
    const st = m?.student || studentMap[m?.studentId] || {};
    return determineStudentGender(st, examinationId) === 'Boy';
  }).length;
  const sheetGirlsCount = validMarksList.filter((m: any) => {
    const st = m?.student || studentMap[m?.studentId] || {};
    return determineStudentGender(st, examinationId) === 'Girl';
  }).length;

  const hasAnyRowInEdit = isEditingAll || editableRows.size > 0;

  const handleToggleEditAll = () => {
    if (isEditingAll) {
      setIsEditingAll(false);
      setEditableRows(new Set());
      setDraftMarks({});
      setDraftAbsent({});
    } else {
      setIsEditingAll(true);
      // Pre-populate draftMarks and draftAbsent for all students from current marksList
      const nextDraft: Record<string, Record<string, any>> = {};
      const nextAbsent: Record<string, boolean> = {};
      validMarksList.forEach((m: any) => {
        const sId = m.studentId;
        if (sId) {
          const isAb = !!m.isAbsent;
          nextAbsent[sId] = isAb;
          const comps: Record<string, any> = {};
          components.forEach((c: SubjectAssessmentRule) => {
            const val = m.componentMarks?.[c.componentKey] ?? m[c.componentKey];
            comps[c.componentKey] = isAb ? 0 : (val !== undefined && val !== null ? val : '');
          });
          nextDraft[sId] = comps;
        }
      });
      setDraftMarks(nextDraft);
      setDraftAbsent(nextAbsent);
    }
  };

  const handleToggleRowEdit = (studentId: string, currentEntry: any) => {
    setEditableRows(prev => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
        setDraftMarks(dm => {
          const copy = { ...dm };
          delete copy[studentId];
          return copy;
        });
        setDraftAbsent(da => {
          const copy = { ...da };
          delete copy[studentId];
          return copy;
        });
      } else {
        next.add(studentId);
        const isAb = !!currentEntry?.isAbsent;
        setDraftAbsent(da => ({ ...da, [studentId]: isAb }));
        // Pre-populate draft marks for this student if not already present
        setDraftMarks(dm => {
          if (!dm[studentId]) {
            const comps: Record<string, any> = {};
            components.forEach((c: SubjectAssessmentRule) => {
              const val = currentEntry?.componentMarks?.[c.componentKey] ?? currentEntry?.[c.componentKey];
              comps[c.componentKey] = isAb ? 0 : (val !== undefined && val !== null ? val : '');
            });
            return { ...dm, [studentId]: comps };
          }
          return dm;
        });
      }
      return next;
    });
  };

  const handleToggleStudentAbsent = (studentId: string, isAbsentVal: boolean) => {
    setDraftAbsent(prev => ({
      ...prev,
      [studentId]: isAbsentVal,
    }));
    if (isAbsentVal) {
      // When Absent is checked, set internal mark values to 0
      setDraftMarks(prev => {
        const studentDraft = { ...(prev[studentId] || {}) };
        components.forEach((c: SubjectAssessmentRule) => {
          studentDraft[c.componentKey] = 0;
        });
        return {
          ...prev,
          [studentId]: studentDraft,
        };
      });
    }
  };

  const handleDraftMarkChange = (studentId: string, compKey: string, val: string, maxMarks: number) => {
    let numericVal = val;
    if (val !== '') {
      const parsed = Number(val);
      if (!isNaN(parsed) && maxMarks > 0 && parsed > maxMarks) {
        numericVal = String(maxMarks);
      } else if (!isNaN(parsed) && parsed < 0) {
        numericVal = '0';
      }
    }

    setDraftMarks(prev => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || {}),
        [compKey]: numericVal,
      },
    }));
  };

  const handleCancelEdit = () => {
    setIsEditingAll(false);
    setEditableRows(new Set());
    setDraftMarks({});
    setDraftAbsent({});
  };

  const handleInitiateSaveCorrections = () => {
    const studentIdsToConsider = isEditingAll
      ? validMarksList.map((m: any) => m.studentId).filter(Boolean)
      : Array.from(editableRows);

    if (studentIdsToConsider.length === 0) {
      alert('No rows are currently in edit mode.');
      return;
    }

    setAuditReasonInput('');
    setShowAuditModal(true);
  };

  const handleExecuteSaveCorrections = async () => {
    if (!auditReasonInput.trim()) {
      alert('Please specify an Audit Reason for these corrections.');
      return;
    }

    if (!sheetData?.markSheet?.id) {
      alert('Error: Mark sheet ID not found.');
      return;
    }

    setIsSavingCorrection(true);
    try {
      // 1. GATHER BASELINE CURRENT MARKS FROM LOCAL STATE
      let existingSubjectMarks: Record<string, any> = {};
      if (sheetData?.markSheet?.studentMarks && typeof sheetData.markSheet.studentMarks === 'object') {
        existingSubjectMarks = { ...sheetData.markSheet.studentMarks };
      }
      if (sheetData?.markSheet?.marks && typeof sheetData.markSheet.marks === 'object') {
        existingSubjectMarks = {
          ...sheetData.markSheet.marks,
          ...existingSubjectMarks,
        };
      }
      if (Array.isArray(sheetData?.marks)) {
        sheetData.marks.forEach((m: any) => {
          if (m?.studentId && !existingSubjectMarks[m.studentId]) {
            existingSubjectMarks[m.studentId] = {
              studentId: m.studentId,
              isAbsent: Boolean(m.isAbsent),
              componentMarks: m.componentMarks || {},
              subjectTotal: m.subjectTotal ?? m.total ?? 0,
              total: m.total ?? m.subjectTotal ?? 0,
            };
          }
        });
      }
      if (Array.isArray(sheetData?.students)) {
        sheetData.students.forEach((st: any) => {
          if (st?.id && !existingSubjectMarks[st.id]) {
            existingSubjectMarks[st.id] = {
              studentId: st.id,
              isAbsent: false,
              componentMarks: {},
              subjectTotal: 0,
              total: 0,
            };
          }
        });
      }

      // 2. FETCH LIVE FROM FIRESTORE TO ENSURE FULL MARKS MERGE (NEVER OVERWRITE WITH MISSING STUDENTS)
      const docRef = doc(db, 'marks', sheetData.markSheet.id);
      try {
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const liveDoc = snap.data();
          const remoteMarks = liveDoc.studentMarks || liveDoc.marks;
          if (remoteMarks && typeof remoteMarks === 'object' && Object.keys(remoteMarks).length > 0) {
            existingSubjectMarks = {
              ...remoteMarks,
              ...existingSubjectMarks,
            };
          }
        }
      } catch (fReadErr) {
        console.warn('Firestore live read warning before bulk correction:', fReadErr);
      }

      // 3. TARGET SPECIFIC STUDENTS IN EDIT MODE AND COMPUTE THEIR UPDATED MARKS
      const studentIdsToUpdate = isEditingAll
        ? validMarksList.map((m: any) => m.studentId).filter(Boolean)
        : Array.from(editableRows);

      let actuallyModifiedCount = 0;
      const updatedMarksMap: Record<string, any> = { ...existingSubjectMarks };

      studentIdsToUpdate.forEach((sId: string) => {
        const existingEntry = existingSubjectMarks[sId] || {
          studentId: sId,
          isAbsent: false,
          componentMarks: {},
        };
        const studentDraft = draftMarks[sId];
        const studentAbsent = draftAbsent[sId] !== undefined ? draftAbsent[sId] : !!existingEntry.isAbsent;
        if (!studentDraft && draftAbsent[sId] === undefined) return;

        // Build new component marks
        const newCompMarks = { ...(existingEntry.componentMarks || {}) };
        components.forEach((c: SubjectAssessmentRule) => {
          if (studentAbsent) {
            newCompMarks[c.componentKey] = 0;
          } else if (studentDraft && studentDraft[c.componentKey] !== undefined) {
            const raw = studentDraft[c.componentKey];
            newCompMarks[c.componentKey] = raw === '' ? 0 : Number(raw);
          }
        });

        // Recalculate total for this subject (components sum)
        const recalculatedTotal = studentAbsent
          ? 0
          : Object.values(newCompMarks).reduce(
              (sum: number, val: any) => sum + (Number(val) || 0),
              0
            );

        updatedMarksMap[sId] = {
          ...existingEntry,
          studentId: sId,
          isAbsent: studentAbsent,
          componentMarks: newCompMarks,
          subjectTotal: recalculatedTotal,
          total: recalculatedTotal,
          remarks: studentAbsent ? 'Absent' : (existingEntry.remarks || ''),
          lastCorrectedAt: new Date().toISOString(),
          lastCorrectedBy: user?.name || 'Principal',
          lastCorrectionReason: auditReasonInput.trim(),
        };
        actuallyModifiedCount++;
      });

      // 4. FIRESTORE TARGETED UPDATE (PREVENT BULK OVERWRITE)
      try {
        await setDoc(
          docRef,
          {
            studentMarks: updatedMarksMap,
            marks: updatedMarksMap,
            lastUpdated: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch (firestoreErr: any) {
        console.warn('Firestore bulk mark correction warning:', firestoreErr);
      }

      // 5. LOCAL STATE IMMUTABILITY: STRICTLY MODIFY ONLY UPDATED STUDENTS
      setSheetData((prev: any) => {
        if (!prev) return prev;
        const currentMarkSheet = prev.markSheet || {};
        return {
          ...prev,
          markSheet: {
            ...currentMarkSheet,
            studentMarks: updatedMarksMap,
            marks: updatedMarksMap,
            lastUpdated: new Date().toISOString(),
          },
          marks: Array.isArray(prev.marks)
            ? prev.marks.map((m: any) =>
                updatedMarksMap[m.studentId]
                  ? { ...m, ...updatedMarksMap[m.studentId] }
                  : m
              )
            : prev.marks,
        };
      });

      // 6. AUDIT LOGGING PRESERVATION (SAVED IN DEDICATED AUDIT LOGS)
      try {
        await logAuditEvent({
          action: 'BULK_MARKS_CORRECTED',
          details: `Principal ${user?.name || 'ASLAM TK'} authorized inline mark corrections for ${actuallyModifiedCount} student(s) in Class ${sheetData.classItem?.name || classId} - ${sheetData.subjectItem?.nameEn || subjectId}. Reason: ${auditReasonInput.trim()}`,
          currentUser: user,
          recordType: 'marks',
          recordId: sheetData.markSheet.id,
        });
      } catch (auditErr) {
        console.warn('Audit logging warning:', auditErr);
      }

      // 7. BACKEND API PERSISTENCE
      const res = await fetchWithAuth(`/api/mark-sheets/${sheetData.markSheet.id}/admin-correct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: auditReasonInput.trim(),
          studentMarks: updatedMarksMap,
          marks: updatedMarksMap,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to update database');
      }

      // 8. EXIT EDIT MODE AND RESET
      setShowAuditModal(false);
      setIsEditingAll(false);
      setEditableRows(new Set());
      setDraftMarks({});
      setDraftAbsent({});
      setAuditReasonInput('');

      // Dispatch global update event
      window.dispatchEvent(new CustomEvent('madrasa_marks_updated'));

      alert(`Successfully saved mark corrections for ${actuallyModifiedCount} student(s)!`);
      onRefresh();
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to save mark corrections');
    } finally {
      setIsSavingCorrection(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between border-b pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900">
                {isMl ? (cls?.nameMl || cls?.name || 'ക്ലാസ്') : (cls?.name || cls?.nameMl || 'Class')}
              </span>
              <h2 className="text-lg font-bold text-slate-900 font-ml">
                {subjectHeader}
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {isMl ? (exam?.nameMl || exam?.nameEn) : (exam?.nameEn || exam?.nameMl)} • Teacher: <span className="font-semibold text-slate-700">{teacherHeader}</span> • ({validMarksList.length} Students: {sheetBoysCount} Boys, {sheetGirlsCount} Girls) • Al-Madrasathul Islamiya Pallikkuth
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Verification Status & Action Controls */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div>
            <span className="font-semibold text-slate-600">Current Status: </span>
            <span className="font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-white border border-slate-200 ml-1">
              {status}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* 1. EDIT ALL BUTTON (Positioned to the left of Approve) */}
            {hasAnyRowInEdit ? (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg cursor-pointer transition shadow-2xs"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancel Editing</span>
              </button>
            ) : (
              status !== 'locked' && (
                <button
                  type="button"
                  onClick={handleToggleEditAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 text-purple-900 border border-purple-300 hover:bg-purple-100 font-bold rounded-lg cursor-pointer transition shadow-2xs"
                  title="Enable inline mark editing for all students"
                >
                  <Edit2 className="w-3.5 h-3.5 text-purple-700" />
                  <span>Edit All</span>
                </button>
              )
            )}

            {/* 2. DYNAMICALLY REPLACE APPROVE WITH SAVE CORRECTIONS WHEN IN EDIT MODE */}
            {hasAnyRowInEdit ? (
              <button
                type="button"
                onClick={handleInitiateSaveCorrections}
                disabled={isSavingCorrection}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-purple-800 hover:bg-purple-900 text-white font-bold rounded-lg cursor-pointer transition shadow-xs disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSavingCorrection ? 'Saving...' : 'Save Corrections'}</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-950 text-purple-200">
                  {isEditingAll ? 'All Rows' : `${editableRows.size} ${editableRows.size === 1 ? 'row' : 'rows'}`}
                </span>
              </button>
            ) : (
              <>
                {status === 'submitted' && (
                  <button
                    onClick={handleApprove}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg shadow-2xs cursor-pointer"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    Approve Mark Sheet
                  </button>
                )}

                {status === 'approved' && (
                  <button
                    onClick={handleLock}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-lg shadow-2xs cursor-pointer"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    Lock Marks
                  </button>
                )}
              </>
            )}

            {!hasAnyRowInEdit && (status === 'submitted' || status === 'approved') && (
              <button
                onClick={() => setShowReturnInput(!showReturnInput)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-800 border border-rose-300 hover:bg-rose-100 font-bold rounded-lg cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {status === 'submitted' ? 'Return for Correction' : 'Return to Teacher'}
              </button>
            )}

            {status === 'locked' && !hasAnyRowInEdit && (
              <button
                onClick={handleUnlock}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg shadow-2xs cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                Unlock Mark Sheet
              </button>
            )}
          </div>
        </div>

        {/* Return reason box if open */}
        {showReturnInput && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-3">
            <h4 className="font-bold text-rose-900 text-xs">Return Mark Sheet to Teacher for Correction:</h4>
            <textarea
              value={returnReason}
              onChange={e => setReturnReason(e.target.value)}
              placeholder="e.g. Please re-check CE marks for roll numbers 2 and 5."
              className="w-full p-2.5 text-xs border border-rose-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-rose-500"
              rows={2}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowReturnInput(false)}
                className="px-3 py-1 text-xs text-slate-600 bg-white border rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleReturnCorrection}
                className="px-3 py-1 text-xs bg-rose-700 text-white font-bold rounded-lg cursor-pointer"
              >
                Send Return Notice
              </button>
            </div>
          </div>
        )}

        {/* Marks Table with Inline Row Editing */}
        <div className="border border-slate-200 rounded-xl overflow-x-auto relative w-full scrollbar-thin">
          <table className="w-full min-w-[560px] text-xs text-left border-collapse">
            <thead className="sticky top-0 bg-slate-100 font-bold text-slate-700 border-b z-30">
              <tr>
                <th className="p-2.5 text-center w-12 whitespace-nowrap sticky left-0 bg-slate-100 z-40 shadow-[1px_0_0_0_#e5e7eb]">Roll</th>
                <th className="p-2.5 whitespace-nowrap sticky left-12 bg-slate-100 z-40 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] min-w-[170px] md:min-w-[200px]">Student Name</th>
                <th className="p-2.5 text-center w-16 whitespace-nowrap">Gender</th>
                <th className="p-2.5 text-center w-16 whitespace-nowrap text-rose-800 font-bold">Absent</th>
                {components.map((c: SubjectAssessmentRule) => (
                  <th key={c.componentKey} className="p-2.5 text-center whitespace-nowrap">
                    {c.labelEn} ({c.maxMarks})
                  </th>
                ))}
                <th className="p-2.5 text-center font-bold bg-slate-200/50 whitespace-nowrap">Total (50)</th>
                <th className="p-2.5 text-center w-16 whitespace-nowrap">Edit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {marksList.filter(Boolean).map((entry: any, index: number) => {
                const student = entry?.student || studentMap[entry?.studentId] || {};
                const studentId = entry?.studentId || student?.id;
                const studentName = (entry?.student?.name || entry?.studentName || studentMap[entry?.studentId]?.name || student?.nameEn || student?.name || 'Student');
                const bilingualName = entry?.student?.nameMl || entry?.student?.nameEn || entry?.student?.name || student?.nameMl || student?.nameEn || '';
                const rollNo = entry?.rollNo ?? student?.rollNo ?? (index + 1);
                const admissionNo = entry?.admissionNo ?? student?.admissionNo ?? '—';
                const studentGender = determineStudentGender(student, examinationId);

                // Row is editable if Edit All is enabled or individual student row is toggled
                const isRowEditable = isEditingAll || editableRows.has(studentId);
                const isAbsentSaved = !!entry?.isAbsent;
                const isAbsentCurrent = isRowEditable && draftAbsent[studentId] !== undefined
                  ? draftAbsent[studentId]
                  : isAbsentSaved;

                let writtenTotal = 0;
                let maxWritten = 0;
                let cieMark = 0;
                let maxCie = 0;
                components.forEach((c: SubjectAssessmentRule, cIdx: number) => {
                  const k = (c.componentKey || '').toLowerCase();
                  const draftVal = draftMarks[studentId]?.[c.componentKey];
                  const savedVal = entry?.componentMarks?.[c.componentKey] ?? entry?.[c.componentKey];
                  const effectiveVal = isRowEditable && draftVal !== undefined ? draftVal : savedVal;
                  const numVal = isAbsentCurrent
                    ? 0
                    : (effectiveVal !== '' && effectiveVal !== undefined && !isNaN(Number(effectiveVal)) ? Number(effectiveVal) : 0);

                  const isCie = k === 'ce' || k === 'diary' || k.includes('ce') || k.includes('cie') || (components.length === 3 && cIdx === 2);
                  if (isCie) {
                    cieMark += numVal;
                    maxCie += c.maxMarks || 10;
                  } else {
                    writtenTotal += numVal;
                    maxWritten += c.maxMarks || 20;
                  }
                });

                // Preservation of 35% pass/fail calculation logic and red highlighting in real-time
                const isFail = !isAbsentCurrent && maxWritten > 0 && writtenTotal < (maxWritten * 0.35);
                const grandTotal = writtenTotal + cieMark;

                return (
                  <tr
                    key={studentId || index}
                    className={`transition group ${
                      isRowEditable
                        ? 'bg-purple-50/60 ring-1 ring-purple-300'
                        : isAbsentCurrent
                        ? 'bg-amber-50/40 hover:bg-amber-100/40'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className={`p-2.5 text-center font-mono font-bold text-slate-600 w-12 sticky left-0 z-20 shadow-[1px_0_0_0_#e5e7eb] ${isRowEditable ? 'bg-purple-50' : isAbsentCurrent ? 'bg-amber-50/50 group-hover:bg-amber-100/50' : 'bg-white group-hover:bg-slate-50'}`}>
                      {rollNo}
                    </td>
                    <td className={`p-2.5 font-medium sticky left-12 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] min-w-[170px] md:min-w-[200px] ${isRowEditable ? 'bg-purple-50' : isAbsentCurrent ? 'bg-amber-50/50 group-hover:bg-amber-100/50' : 'bg-white group-hover:bg-slate-50'}`}>
                      <div className="font-bold text-slate-900">{studentName}</div>
                      {bilingualName && bilingualName !== studentName && (
                        <div className="text-[11px] text-slate-500 font-ml">{bilingualName}</div>
                      )}
                      <div className="text-[11px] text-slate-400 font-mono">Adm: {admissionNo}</div>
                    </td>
                    <td className="p-2.5 text-center whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        studentGender === 'Girl'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}>
                        {studentGender}
                      </span>
                    </td>

                    {/* Absent Toggle / Checkbox Column */}
                    <td className="p-2.5 text-center whitespace-nowrap">
                      {isRowEditable ? (
                        <label className="inline-flex items-center justify-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isAbsentCurrent}
                            onChange={e => handleToggleStudentAbsent(studentId, e.target.checked)}
                            className="w-4 h-4 text-red-600 rounded border-slate-300 focus:ring-red-500 cursor-pointer"
                            title={isAbsentCurrent ? 'Uncheck to mark Present' : 'Check to mark Absent'}
                          />
                        </label>
                      ) : isAbsentCurrent ? (
                        <span className="text-red-600 font-bold font-mono">AB</span>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>

                    {/* Component Columns: Red AB if absent, input when editable, static when read-only */}
                    {components.map((c: SubjectAssessmentRule) => {
                      const savedVal = entry?.componentMarks?.[c.componentKey] ?? entry?.[c.componentKey];
                      const draftVal = draftMarks[studentId]?.[c.componentKey];
                      const displayVal = draftVal !== undefined ? draftVal : (savedVal !== undefined && savedVal !== null ? savedVal : '');

                      return (
                        <td key={c.componentKey} className="p-2.5 text-center font-mono">
                          {isAbsentCurrent ? (
                            <span className="text-red-600 font-bold">AB</span>
                          ) : isRowEditable ? (
                            <input
                              type="number"
                              min="0"
                              max={c.maxMarks}
                              disabled={isAbsentCurrent}
                              value={displayVal}
                              onChange={e => handleDraftMarkChange(studentId, c.componentKey, e.target.value, c.maxMarks)}
                              className="w-16 p-1 text-center font-mono font-bold text-xs border border-purple-300 rounded-lg bg-white text-purple-950 focus:ring-2 focus:ring-purple-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
                              placeholder="0"
                            />
                          ) : displayVal !== '' && displayVal !== undefined ? (
                            <span className="font-bold">{displayVal}</span>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </td>
                      );
                    })}

                    {/* Total Column */}
                    <td className="p-2.5 text-center font-mono font-black text-sm bg-slate-50/50">
                      {isAbsentCurrent ? (
                        <span className="text-red-600 font-bold">AB</span>
                      ) : (
                        <span className={isFail ? 'text-red-600 font-bold' : 'text-emerald-950 font-bold'}>
                          {grandTotal ?? '—'}
                        </span>
                      )}
                    </td>

                    <td className="p-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleRowEdit(studentId, entry)}
                        className={`p-1 rounded transition cursor-pointer ${
                          isRowEditable
                            ? 'bg-purple-100 text-purple-900 hover:bg-purple-200'
                            : 'text-purple-700 hover:bg-purple-50'
                        }`}
                        title={isRowEditable ? 'Cancel editing this row' : 'Edit marks for this student'}
                      >
                        {isRowEditable ? (
                          <X className="w-3.5 h-3.5 text-purple-800" />
                        ) : (
                          <Edit2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Bulk / Inline Mark Correction Audit Reason Confirmation Modal */}
        {showAuditModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-md w-full border border-purple-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-purple-700" />
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                    Save Authorized Mark Corrections
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAuditModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  You are saving corrections for{' '}
                  <strong className="text-purple-950 font-mono">
                    {isEditingAll ? 'All Active Students' : `${editableRows.size} Selected Students`}
                  </strong>{' '}
                  in <span className="font-semibold text-slate-800">{sheetData.classItem?.name || classId}</span> -{' '}
                  <span className="font-semibold text-slate-800 font-ml">{subjectHeader}</span>.
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  All unmodified students' marks will remain completely intact.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Audit Reason (Required for Compliance) <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={auditReasonInput}
                  onChange={e => setAuditReasonInput(e.target.value)}
                  placeholder="e.g. Re-evaluation of answer scripts authorized by Academic Council"
                  className="w-full p-2.5 text-xs border border-purple-200 rounded-xl bg-purple-50/30 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 text-slate-900"
                  rows={3}
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAuditModal(false)}
                  disabled={isSavingCorrection}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteSaveCorrections}
                  disabled={isSavingCorrection || !auditReasonInput.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-purple-800 hover:bg-purple-900 rounded-xl transition shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5 text-amber-300" />
                  <span>{isSavingCorrection ? 'Applying...' : 'Confirm & Apply to Database'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
