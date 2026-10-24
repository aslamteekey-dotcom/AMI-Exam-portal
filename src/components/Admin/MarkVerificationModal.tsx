import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../services/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { MarkSheet, SubjectAssessmentRule, Student, StudentMarkEntry, sortStudentsBoysFirst } from '../../types';
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

  // Administrative mark correction
  const [correctingStudent, setCorrectingStudent] = useState<Student | null>(null);
  const [selectedCompKey, setSelectedCompKey] = useState<string>('');
  const [newMarkVal, setNewMarkVal] = useState<string>('');
  const [correctionReason, setCorrectionReason] = useState<string>('');
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
          data.students = sortStudentsBoysFirst(data.students).map((s: any, idx: number) => ({
            ...s,
            rollNo: idx + 1,
          }));
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

  const handleSaveCorrection = async () => {
    if (!correctingStudent || !selectedCompKey || newMarkVal === '' || !correctionReason.trim()) {
      alert('Please provide student, component, new mark, and audit reason.');
      return;
    }

    setIsSavingCorrection(true);
    try {
      // Direct persistent Firestore write
      try {
        const studentId = correctingStudent.id;
        const studentMarksCopy = { ...(sheetData.markSheet.studentMarks || {}) };
        const entry = studentMarksCopy[studentId] || { studentId, isAbsent: false, componentMarks: {} };
        const compMarks = { ...(entry.componentMarks || {}) };
        compMarks[selectedCompKey] = Number(newMarkVal);
        studentMarksCopy[studentId] = { ...entry, componentMarks: compMarks };

        await setDoc(
          doc(db, 'marks', sheetData.markSheet.id),
          {
            studentMarks: studentMarksCopy,
            lastUpdated: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch (firestoreErr: any) {
        console.warn('Firestore admin correct warning:', firestoreErr);
      }

      const res = await fetchWithAuth(`/api/mark-sheets/${sheetData.markSheet.id}/admin-correct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: correctingStudent.id,
          componentKey: selectedCompKey,
          newMark: Number(newMarkVal),
          reason: correctionReason,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to correct mark');
      }

      alert('Mark successfully corrected and logged in audit trail!');
      setCorrectingStudent(null);
      setNewMarkVal('');
      setCorrectionReason('');
      onRefresh();
      loadData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSavingCorrection(false);
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
  const marksList = Array.isArray(sheetData?.marks)
    ? sheetData.marks
    : Array.isArray(sheetData?.students)
      ? sortStudentsBoysFirst(sheetData.students).map((st: any, idx: number) => {
          const studentId = st?.id;
          const entry = markSheet?.studentMarks?.[studentId] || {};
          return {
            student: st,
            studentId,
            studentName: st?.nameEn || st?.name,
            rollNo: idx + 1,
            admissionNo: st?.admissionNo,
            ...entry,
          };
        })
      : [];

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
              {isMl ? (exam?.nameMl || exam?.nameEn) : (exam?.nameEn || exam?.nameMl)} • Teacher: <span className="font-semibold text-slate-700">{teacherHeader}</span> • Al-Madrasathul Islamiya Pallikkuth
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
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
            {status === 'submitted' && (
              <>
                <button
                  onClick={handleApprove}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg shadow-2xs"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  Approve Mark Sheet
                </button>
                <button
                  onClick={() => setShowReturnInput(!showReturnInput)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-800 border border-rose-300 hover:bg-rose-100 font-bold rounded-lg"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Return for Correction
                </button>
              </>
            )}

            {status === 'approved' && (
              <>
                <button
                  onClick={handleLock}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-lg shadow-2xs"
                >
                  <Lock className="w-3.5 h-3.5" />
                  Lock Marks
                </button>
                <button
                  onClick={() => setShowReturnInput(!showReturnInput)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-800 border border-rose-300 hover:bg-rose-100 font-bold rounded-lg"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Return to Teacher
                </button>
              </>
            )}

            {status === 'locked' && (
              <button
                onClick={handleUnlock}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg shadow-2xs"
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
                className="px-3 py-1 text-xs text-slate-600 bg-white border rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleReturnCorrection}
                className="px-3 py-1 text-xs bg-rose-700 text-white font-bold rounded-lg"
              >
                Send Return Notice
              </button>
            </div>
          </div>
        )}

        {/* Marks Table with Fallback Guards */}
        <div className="border border-slate-200 rounded-xl overflow-x-auto relative w-full scrollbar-thin">
          <table className="w-full min-w-[560px] text-xs text-left border-collapse">
            <thead className="sticky top-0 bg-slate-100 font-bold text-slate-700 border-b z-30">
              <tr>
                <th className="p-2.5 text-center w-12 whitespace-nowrap sticky left-0 bg-slate-100 z-40 shadow-[1px_0_0_0_#e5e7eb]">Roll</th>
                <th className="p-2.5 whitespace-nowrap sticky left-12 bg-slate-100 z-40 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] min-w-[180px] md:min-w-[220px]">Student Name</th>
                {components.map((c: SubjectAssessmentRule) => (
                  <th key={c.componentKey} className="p-2.5 text-center whitespace-nowrap">
                    {c.labelEn} ({c.maxMarks})
                  </th>
                ))}
                <th className="p-2.5 text-center font-bold bg-slate-200/50 whitespace-nowrap">Total (50)</th>
                <th className="p-2.5 text-center w-20 whitespace-nowrap">Admin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {marksList.filter(Boolean).map((entry: any, index: number) => {
                const student = entry?.student || studentMap[entry?.studentId] || {};
                const studentName = (entry?.student?.name || entry?.studentName || studentMap[entry?.studentId]?.name || student?.nameEn || student?.name || 'Student');
                const bilingualName = entry?.student?.nameMl || entry?.student?.nameEn || entry?.student?.name || student?.nameMl || student?.nameEn || '';
                const rollNo = entry?.rollNo ?? student?.rollNo ?? (index + 1);
                const admissionNo = entry?.admissionNo ?? student?.admissionNo ?? '—';
                const isAbsent = entry?.isAbsent;

                let writtenTotal = 0;
                let maxWritten = 0;
                let cieMark = 0;
                let maxCie = 0;
                components.forEach((c: SubjectAssessmentRule, cIdx: number) => {
                  const k = (c.componentKey || '').toLowerCase();
                  const val = entry?.componentMarks?.[c.componentKey];
                  const numVal = val !== '' && val !== undefined && !isNaN(Number(val)) ? Number(val) : 0;
                  const isCie = k === 'ce' || k === 'diary' || k.includes('ce') || k.includes('cie') || (components.length === 3 && cIdx === 2);
                  if (isCie) {
                    cieMark += numVal;
                    maxCie += c.maxMarks || 10;
                  } else {
                    writtenTotal += numVal;
                    maxWritten += c.maxMarks || 20;
                  }
                });
                const isFail = !isAbsent && maxWritten > 0 && writtenTotal < (maxWritten * 0.35);
                const grandTotal = (entry?.subjectTotal !== undefined && entry?.subjectTotal !== null && !isNaN(Number(entry?.subjectTotal)))
                  ? entry.subjectTotal
                  : (writtenTotal + cieMark);

                return (
                  <tr key={entry?.studentId || student?.id || index} className={`transition group ${isAbsent ? 'bg-amber-50/50 hover:bg-amber-100/50' : 'hover:bg-slate-50'}`}>
                    <td className={`p-2.5 text-center font-mono font-bold text-slate-600 w-12 sticky left-0 z-20 shadow-[1px_0_0_0_#e5e7eb] ${isAbsent ? 'bg-amber-50 group-hover:bg-amber-100' : 'bg-white group-hover:bg-slate-50'}`}>
                      {rollNo}
                    </td>
                    <td className={`p-2.5 font-medium sticky left-12 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] min-w-[180px] md:min-w-[220px] ${isAbsent ? 'bg-amber-50 group-hover:bg-amber-100' : 'bg-white group-hover:bg-slate-50'}`}>
                      <div className="font-bold text-slate-900">{studentName}</div>
                      {bilingualName && bilingualName !== studentName && (
                        <div className="text-[11px] text-slate-500 font-ml">{bilingualName}</div>
                      )}
                      <div className="text-[11px] text-slate-400 font-mono">Adm: {admissionNo}</div>
                    </td>

                    {components.map((c: SubjectAssessmentRule) => (
                      <td key={c.componentKey} className="p-2.5 text-center font-mono">
                        {isAbsent ? (
                          <span className="text-slate-400">—</span>
                        ) : entry?.componentMarks?.[c.componentKey] !== undefined ? (
                          <span className="font-bold">{entry.componentMarks[c.componentKey]}</span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                    ))}

                    <td className="p-2.5 text-center font-mono font-black text-sm bg-slate-50/50">
                      {isAbsent ? (
                        <span className="text-amber-800 text-[11px] bg-amber-100 px-2 py-0.5 rounded font-bold">
                          Absent
                        </span>
                      ) : (
                        <span className={isFail ? 'text-red-600 font-bold' : 'text-emerald-950 font-bold'}>
                          {grandTotal ?? '—'}
                        </span>
                      )}
                    </td>

                    <td className="p-2.5 text-center">
                      <button
                        onClick={() => {
                          setCorrectingStudent(student);
                          if (components[0]) {
                            setSelectedCompKey(components[0].componentKey);
                            setNewMarkVal(String(entry?.componentMarks?.[components[0].componentKey] ?? '0'));
                          }
                        }}
                        className="p-1 rounded text-purple-700 hover:bg-purple-50 transition"
                        title="Principal Mark Correction"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Authorized Mark Correction Box */}
        {correctingStudent && (
          <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-purple-950 text-sm flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-purple-700" />
                Principal Authorized Mark Correction for {correctingStudent?.nameEn || (correctingStudent as any)?.name || (correctingStudent ? studentMap[correctingStudent.id]?.name : '') || 'Student'}
              </h4>
              <button
                onClick={() => setCorrectingStudent(null)}
                className="text-purple-600 hover:text-purple-800 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-purple-900 mb-1">
                  Component
                </label>
                <select
                  value={selectedCompKey}
                  onChange={e => {
                    setSelectedCompKey(e.target.value);
                    const old = markSheet?.studentMarks?.[correctingStudent.id]?.componentMarks?.[e.target.value];
                    setNewMarkVal(old !== undefined ? String(old) : '0');
                  }}
                  className="w-full p-2 bg-white border border-purple-200 rounded-lg text-xs font-semibold"
                >
                  {components.map((c: SubjectAssessmentRule) => (
                    <option key={c.componentKey} value={c.componentKey}>
                      {c.labelEn} (max {c.maxMarks})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-purple-900 mb-1">
                  New Mark
                </label>
                <input
                  type="number"
                  min="0"
                  value={newMarkVal}
                  onChange={e => setNewMarkVal(e.target.value)}
                  className="w-full p-2 bg-white border border-purple-200 rounded-lg text-xs font-bold font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-purple-900 mb-1">
                  Audit Reason (Required)
                </label>
                <input
                  type="text"
                  value={correctionReason}
                  onChange={e => setCorrectionReason(e.target.value)}
                  placeholder="e.g. Totaling error in descriptive paper re-evaluation"
                  className="w-full p-2 bg-white border border-purple-200 rounded-lg text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setCorrectingStudent(null)}
                className="px-3 py-1.5 text-xs text-slate-600 bg-white border rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCorrection}
                disabled={isSavingCorrection}
                className="px-4 py-1.5 text-xs font-bold text-white bg-purple-800 hover:bg-purple-900 rounded-lg shadow-2xs"
              >
                {isSavingCorrection ? 'Saving...' : 'Apply Correction & Recalculate'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
