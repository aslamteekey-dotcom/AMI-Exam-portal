import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  ClassItem,
  SubjectItem,
  Examination,
  SubjectAssessmentRule,
  Student,
  MarkSheet,
  StudentMarkEntry,
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
      setCls(data.class);
      setSubject(data.subject);
      setExam(data.examination);
      setComponents(data.components);
      setStudents(data.students);
      setMarkSheet(data.markSheet);

      // Initialize marks state
      const initialMarks: Record<string, { isAbsent: boolean; componentMarks: Record<string, string>; remarks: string }> = {};
      data.students.forEach((s: Student) => {
        const entry: StudentMarkEntry = data.markSheet?.studentMarks?.[s.id];
        if (entry) {
          const compStr: Record<string, string> = {};
          data.components.forEach((c: SubjectAssessmentRule) => {
            compStr[c.componentKey] = entry.componentMarks[c.componentKey] !== undefined ? String(entry.componentMarks[c.componentKey]) : '';
          });
          initialMarks[s.id] = {
            isAbsent: !!entry.isAbsent,
            componentMarks: compStr,
            remarks: entry.remarks || '',
          };
        } else {
          const emptyComp: Record<string, string> = {};
          data.components.forEach((c: SubjectAssessmentRule) => {
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
          for (const [k, v] of Object.entries(entry.componentMarks)) {
            compNum[k] = v !== '' ? parseInt(v, 10) : 0;
          }
          studentMarksPayload[studentId] = {
            studentId,
            isAbsent: false,
            componentMarks: compNum,
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
      setSaveSuccess(true);
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

  const subjectMaxMarks = components.reduce((sum, c) => sum + c.maxMarks, 0);

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl text-slate-600 bg-slate-100 hover:bg-slate-200 transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">
                {cls?.numericGrade === 9 && (subject?.id === 'sub_history_buhuth' || subject?.code === 'HST')
                  ? 'ബുഹൂസ്'
                  : subject?.displayNameMl || subject?.nameMl || subject?.nameEn}
              </h2>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                {isMl ? cls?.nameMl : cls?.name}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {isMl ? exam?.nameMl : exam?.nameEn} • Max Marks: {subjectMaxMarks}
            </p>
          </div>
        </div>

        {/* Status Badge & Actions */}
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

          {!isReadOnly && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveDraft}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl transition"
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Saving...' : t.saveDraft}
              </button>

              <button
                onClick={() => setShowPreviewModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition"
              >
                <Eye className="w-4 h-4" />
                Preview
              </button>

              <button
                onClick={() => setShowSubmitModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow-xs transition"
              >
                <Send className="w-4 h-4" />
                {t.submitMarks}
              </button>
            </div>
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
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-700 text-xs uppercase tracking-wider border-b border-slate-200">
                <th className="py-3 px-4 w-16 text-center">Roll No</th>
                <th className="py-3 px-4 w-52">Student Name</th>
                <th className="py-3 px-4 w-28 text-center">Status</th>
                {components.map(comp => (
                  <th key={comp.componentKey} className="py-3 px-3 text-center min-w-[130px]">
                    <div>{comp.labelEn}</div>
                    <div className="text-[10px] text-emerald-800 font-bold lowercase">
                      (max {comp.maxMarks})
                    </div>
                  </th>
                ))}
                <th className="py-3 px-4 w-28 text-center font-bold bg-slate-200/60">
                  Total
                  <div className="text-[10px] text-slate-500 lowercase">(max {subjectMaxMarks})</div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {students.map((student, idx) => {
                const sEntry = marks[student.id] || { isAbsent: false, componentMarks: {}, remarks: '' };
                const isAbsent = sEntry.isAbsent;
                const total = calculateStudentTotal(student.id);

                return (
                  <tr
                    key={student.id}
                    className={`hover:bg-slate-50/80 transition ${
                      isAbsent ? 'bg-amber-50/40' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'
                    }`}
                  >
                    <td className="py-3 px-4 text-center font-bold font-mono text-slate-600">
                      {student.rollNo}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{student.nameEn}</div>
                      <div className="text-xs text-slate-500 font-medium">{student.nameMl}</div>
                      <div className="text-[10px] font-mono text-slate-400">{student.admissionNo}</div>
                    </td>

                    {/* Present / Absent Toggle Button */}
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => handleToggleAbsent(student.id)}
                        className={`px-2.5 py-1 text-xs font-bold rounded-lg border flex items-center justify-center gap-1 mx-auto transition ${
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

                    {/* Component Inputs */}
                    {components.map(comp => (
                      <td key={comp.componentKey} className="py-3 px-3 text-center">
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
                            className="w-16 mx-auto text-center font-bold font-mono py-1.5 px-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent bg-white disabled:bg-slate-100 disabled:text-slate-500 shadow-2xs"
                          />
                        )}
                      </td>
                    ))}

                    {/* Auto Computed Total */}
                    <td className="py-3 px-4 text-center font-mono font-extrabold text-base bg-slate-50/70">
                      {isAbsent ? (
                        <span className="text-amber-800 text-xs font-bold bg-amber-100 px-2 py-0.5 rounded">
                          Absent
                        </span>
                      ) : (
                        <span className={typeof total === 'number' && total < subjectMaxMarks * 0.4 ? 'text-rose-600' : 'text-emerald-900'}>
                          {total}
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
                  <th className="p-2 text-center">Roll</th>
                  <th className="p-2 text-left">Student Name</th>
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
                  return (
                    <tr key={s.id}>
                      <td className="p-2 text-center font-mono">{s.rollNo}</td>
                      <td className="p-2 font-medium">{s.nameEn}</td>
                      {components.map(c => (
                        <td key={c.componentKey} className="p-2 text-center font-mono">
                          {entry?.isAbsent ? 'Absent' : entry?.componentMarks[c.componentKey] || '—'}
                        </td>
                      ))}
                      <td className="p-2 text-center font-mono font-bold">
                        {calculateStudentTotal(s.id)}
                      </td>
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
