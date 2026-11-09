import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  ClassItem,
  Student,
  HikmaModelId,
  HikmaStudentMark,
  HikmaClassModelRecord,
  HIKMA_MODELS,
  calculateHikmaStudentScore,
  sortStudentsBoysFirst,
  determineStudentGender,
} from '../../types';
import {
  getHikmaClassRecord,
  saveHikmaClassRecord,
  isStudentInSchoolClass,
} from '../../services/hikmaExamService';
import {
  Save,
  CheckCircle,
  HelpCircle,
  Clock,
  Sparkles,
  ArrowLeft,
  RotateCcw,
  Printer,
  ChevronDown,
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
} from 'lucide-react';

interface Props {
  classId: string;
  classes: ClassItem[];
  onClassChange?: (clsId: string) => void;
  selectedModel: HikmaModelId;
  onModelChange: (m: HikmaModelId) => void;
  students: Student[];
  onBack?: () => void;
}

export const HikmaMarkEntryView: React.FC<Props> = ({
  classId,
  classes,
  onClassChange,
  selectedModel,
  onModelChange,
  students,
  onBack,
}) => {
  const { lang, user } = useAuth();
  const isMl = lang === 'ml';

  const [loading, setLoading] = useState(true);
  const [maxMarks, setMaxMarks] = useState<number>(50);
  const [marks, setMarks] = useState<Record<string, HikmaStudentMark>>({});
  const [status, setStatus] = useState<'draft' | 'submitted' | 'approved' | 'locked'>('draft');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [autoFillSuccess, setAutoFillSuccess] = useState(false);

  const activeClass = useMemo(() => {
    return classes.find(c => c.id === classId) || classes[0] || null;
  }, [classes, classId]);

  // Sort students sequential roll numbers, boys first, strictly filtered by School Class
  const sortedStudents = useMemo(() => {
    const list = students.filter(s => isStudentInSchoolClass(s, classId, activeClass));
    return sortStudentsBoysFirst(list).map((s, idx) => ({
      ...s,
      rollNo: idx + 1,
      gender: determineStudentGender(s),
    }));
  }, [students, classId, activeClass]);

  // Load HIKMA record for current class and selected model
  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    getHikmaClassRecord(classId, selectedModel, sortedStudents).then(rec => {
      if (!isMounted) return;
      setMaxMarks(rec.maxMarks || 50);
      setStatus(rec.status || 'draft');
      setMarks(rec.studentMarks || {});
      setLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [classId, selectedModel, sortedStudents]);

  // Handle Max Marks changes
  const handleMaxMarksChange = (val: string) => {
    const parsed = parseInt(val, 10);
    const newMax = isNaN(parsed) || parsed <= 0 ? 50 : parsed;
    setMaxMarks(newMax);

    // Recalculate marks with updated max marks
    setMarks(prev => {
      const next: Record<string, HikmaStudentMark> = {};
      Object.entries(prev).forEach(([sId, entry]) => {
        const score = calculateHikmaStudentScore(
          entry.correctAnswers,
          entry.wrongAnswers,
          entry.unattempted,
          newMax,
          entry.isAbsent
        );
        next[sId] = {
          ...entry,
          maxMarks: newMax,
          ...score,
        };
      });
      return next;
    });
  };

  // Handle student input change (real-time recalculation)
  const handleScoreInputChange = (
    studentId: string,
    field: 'correct' | 'wrong' | 'unattempted',
    rawVal: string
  ) => {
    if (rawVal !== '' && !/^\d+$/.test(rawVal)) return;

    setMarks(prev => {
      const current = prev[studentId] || {
        studentId,
        isAbsent: false,
        correctAnswers: 0,
        wrongAnswers: 0,
        unattempted: 0,
        totalPositive: 0,
        minusMarks: 0,
        grandTotal: 0,
        maxMarks,
      };

      let c = field === 'correct' ? (rawVal === '' ? 0 : parseInt(rawVal, 10)) : current.correctAnswers;
      let w = field === 'wrong' ? (rawVal === '' ? 0 : parseInt(rawVal, 10)) : current.wrongAnswers;
      let u = field === 'unattempted' ? (rawVal === '' ? 0 : parseInt(rawVal, 10)) : current.unattempted;

      // Cap at maxMarks if exceeded
      if (c > maxMarks) c = maxMarks;
      if (w > maxMarks) w = maxMarks;
      if (u > maxMarks) u = maxMarks;

      const calc = calculateHikmaStudentScore(c, w, u, maxMarks, current.isAbsent);

      return {
        ...prev,
        [studentId]: {
          ...current,
          maxMarks,
          correctAnswers: c,
          wrongAnswers: w,
          unattempted: u,
          totalPositive: calc.totalPositive,
          minusMarks: calc.minusMarks,
          grandTotal: calc.grandTotal,
        },
      };
    });
  };

  // Toggle student absent
  const handleToggleAbsent = (studentId: string) => {
    setMarks(prev => {
      const current = prev[studentId] || {
        studentId,
        isAbsent: false,
        correctAnswers: 0,
        wrongAnswers: 0,
        unattempted: 0,
        totalPositive: 0,
        minusMarks: 0,
        grandTotal: 0,
        maxMarks,
      };
      const nextAbsent = !current.isAbsent;
      const calc = calculateHikmaStudentScore(
        nextAbsent ? 0 : current.correctAnswers,
        nextAbsent ? 0 : current.wrongAnswers,
        nextAbsent ? 0 : current.unattempted,
        maxMarks,
        nextAbsent
      );

      return {
        ...prev,
        [studentId]: {
          ...current,
          isAbsent: nextAbsent,
          ...calc,
        },
      };
    });
  };

  // Auto-fill unattempted questions for all students
  const handleAutoFillUnattempted = () => {
    setMarks(prev => {
      const next: Record<string, HikmaStudentMark> = {};
      sortedStudents.forEach(st => {
        const cur = prev[st.id] || {
          studentId: st.id,
          studentName: st.nameEn,
          rollNo: st.rollNo,
          admissionNo: st.admissionNo,
          isAbsent: false,
          correctAnswers: 0,
          wrongAnswers: 0,
          unattempted: 0,
          totalPositive: 0,
          minusMarks: 0,
          grandTotal: 0,
          maxMarks,
        };
        if (cur.isAbsent) {
          next[st.id] = cur;
          return;
        }
        const remaining = Math.max(0, maxMarks - (cur.correctAnswers + cur.wrongAnswers));
        const calc = calculateHikmaStudentScore(cur.correctAnswers, cur.wrongAnswers, remaining, maxMarks, false);
        next[st.id] = {
          ...cur,
          maxMarks,
          ...calc,
        };
      });
      return next;
    });

    setAutoFillSuccess(true);
    setTimeout(() => setAutoFillSuccess(false), 3000);
  };

  // Save record
  const handleSave = async (newStatus: 'draft' | 'submitted' = 'draft') => {
    setIsSaving(true);
    const rec: HikmaClassModelRecord = {
      examinationId: 'exam_hikma_model_2026_27',
      classId,
      modelId: selectedModel,
      maxMarks,
      status: newStatus,
      submittedAt: newStatus === 'submitted' ? new Date().toISOString() : undefined,
      lastUpdated: new Date().toISOString(),
      studentMarks: marks,
    };

    try {
      await saveHikmaClassRecord(rec);
      setStatus(newStatus);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save HIKMA mark sheet:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Computed summary metrics
  const stats = useMemo(() => {
    let totalPresent = 0;
    let totalAbsent = 0;
    let sumGrandTotal = 0;
    let sumPositive = 0;
    let sumMinus = 0;

    Object.values(marks).forEach(m => {
      if (m.isAbsent) {
        totalAbsent++;
      } else {
        totalPresent++;
        sumGrandTotal += m.grandTotal;
        sumPositive += m.totalPositive;
        sumMinus += m.minusMarks;
      }
    });

    const avgScore = totalPresent > 0 ? (sumGrandTotal / totalPresent).toFixed(2) : '0.00';
    const avgPercentage = totalPresent > 0 && maxMarks > 0 ? ((sumGrandTotal / (totalPresent * maxMarks)) * 100).toFixed(1) : '0.0';

    return {
      totalStudents: sortedStudents.length,
      totalPresent,
      totalAbsent,
      avgScore,
      avgPercentage,
      sumPositive,
      sumMinus,
    };
  }, [marks, sortedStudents, maxMarks]);

  const activeModelMeta = HIKMA_MODELS.find(m => m.id === selectedModel) || HIKMA_MODELS[0];

  return (
    <div className="space-y-4">
      {/* Top Controls Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
                title="Back"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800">
                  {isMl ? 'ഹിക്മ മോഡൽ പരീക്ഷ' : 'HIKMA Model Exam'}
                </span>
                <span className="text-slate-300">•</span>
                <span className="text-xs text-slate-500 font-medium">
                  Single General Paper Evaluation
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 mt-0.5">
                {activeClass?.name || 'Class'} — {isMl ? activeModelMeta.labelMl : activeModelMeta.labelEn}
              </h2>
            </div>
          </div>

          {/* Status Badge */}
          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                status === 'submitted'
                  ? 'bg-blue-100 text-blue-900 border border-blue-200'
                  : status === 'approved' || status === 'locked'
                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                  : 'bg-amber-100 text-amber-900 border border-amber-200'
              }`}
            >
              {status === 'submitted' ? (
                <>
                  <Clock className="w-3.5 h-3.5" />
                  <span>Submitted</span>
                </>
              ) : status === 'approved' || status === 'locked' ? (
                <>
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Approved / Locked</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Draft Mode</span>
                </>
              )}
            </span>
          </div>
        </div>

        {/* Dynamic Controls Bar: Sub-Dropdown & Dynamic Max Marks Input */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50/80 border border-slate-200/80 p-3.5 rounded-xl">
          {/* 1. Sub-Dropdown: Model Selection ("Model 1", "Model 2", "Model 3") */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              {isMl ? 'മോഡൽ തിരഞ്ഞെടുക്കുക' : 'Select Model Paper'}
            </label>
            <div className="relative">
              <select
                value={selectedModel}
                onChange={e => onModelChange(e.target.value as HikmaModelId)}
                className="w-full text-xs font-bold px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-emerald-700 focus:outline-none appearance-none cursor-pointer pr-8"
              >
                {HIKMA_MODELS.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.labelEn} ({isMl ? m.labelMl : 'General Paper'})
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-500 absolute right-2.5 top-2.5 pointer-events-none" />
            </div>
          </div>

          {/* 2. Dynamic Max Marks / Total Questions Input */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              {isMl ? 'ആകെ ചോദ്യങ്ങൾ / മാക്സിമം മാർക്ക്' : 'Total Questions / Max Marks'}
            </label>
            <div className="relative">
              <input
                type="number"
                min={1}
                max={200}
                value={maxMarks}
                onChange={e => handleMaxMarksChange(e.target.value)}
                className="w-full text-xs font-mono font-bold px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-emerald-700 focus:outline-none"
                placeholder="e.g. 25 or 50"
              />
              <span className="text-[11px] font-semibold text-slate-400 absolute right-3 top-2 pointer-events-none">
                Marks
              </span>
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Configurable limit (e.g., 25 or 50 questions)
            </p>
          </div>

          {/* 3. Class Selection (if allowed) */}
          {classes.length > 1 && onClassChange && (
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                {isMl ? 'ക്ലാസ്' : 'Selected Class'}
              </label>
              <div className="relative">
                <select
                  value={classId}
                  onChange={e => onClassChange(e.target.value)}
                  className="w-full text-xs font-bold px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-emerald-700 focus:outline-none appearance-none cursor-pointer pr-8"
                >
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.nameMl ? `(${c.nameMl})` : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-500 absolute right-2.5 top-2.5 pointer-events-none" />
              </div>
            </div>
          )}
        </div>

        {/* Live Calculation Formula Banner */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-emerald-50/70 border border-emerald-200/80 p-3 rounded-xl text-emerald-950 font-medium">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-bold flex items-center gap-1.5 text-emerald-900">
              <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
              Negative Marking Rule:
            </span>
            <span>Correct: <strong>+1.00</strong> mark</span>
            <span className="text-emerald-300">•</span>
            <span className="text-rose-800">Wrong: <strong>-0.25</strong> mark</span>
            <span className="text-emerald-300">•</span>
            <span>Grand Total = <strong>Total Positive - Minus Marks</strong></span>
          </div>

          <button
            type="button"
            onClick={handleAutoFillUnattempted}
            className="text-xs font-bold text-emerald-800 hover:text-emerald-950 underline cursor-pointer"
          >
            Auto-calculate unattempted for all
          </button>
        </div>

        {/* Feedback banners */}
        {saveSuccess && (
          <div className="p-3 bg-emerald-100 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>HIKMA Model Exam marks saved successfully!</span>
          </div>
        )}
        {autoFillSuccess && (
          <div className="p-2.5 bg-blue-50 border border-blue-200 text-blue-900 rounded-xl text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-blue-700 shrink-0" />
            <span>Unattempted questions auto-filled based on Max Marks ({maxMarks})!</span>
          </div>
        )}
      </div>

      {/* Main Student Mark Entry Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">
              Student Mark Entry Roster ({sortedStudents.length} Students)
            </h3>
            <p className="text-xs text-slate-500">
              Enter Correct, Wrong, and Unattempted answers. Values auto-calculate in real time.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSave('draft')}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Saving...' : 'Save Draft'}</span>
            </button>
            <button
              type="button"
              onClick={() => handleSave('submitted')}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-800 hover:bg-emerald-900 text-white transition flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Submit Marksheet</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500 text-xs font-semibold">
            Loading HIKMA Model Exam roster...
          </div>
        ) : sortedStudents.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs font-semibold">
            No active students found in this class.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/90 text-slate-700 border-b border-slate-200 font-bold uppercase text-[10px] tracking-wider select-none">
                  <th className="py-2.5 px-3 min-w-[200px]">Student Name</th>
                  <th className="py-2.5 px-3 text-center w-28 bg-emerald-50 text-emerald-950 border-l border-emerald-100">
                    Right Ans
                  </th>
                  <th className="py-2.5 px-3 text-center w-24 bg-emerald-100/70 text-emerald-900 border-l border-emerald-200">
                    Mark
                  </th>
                  <th className="py-2.5 px-3 text-center w-28 bg-rose-50 text-rose-950 border-l border-rose-100">
                    Wrong Ans
                  </th>
                  <th className="py-2.5 px-3 text-center w-24 bg-rose-100/70 text-rose-900 border-l border-rose-200">
                    Mark
                  </th>
                  <th className="py-2.5 px-3 text-center w-28 bg-emerald-900 text-white border-l border-emerald-800">
                    Total
                  </th>
                  <th className="py-2.5 px-3 text-center w-20">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedStudents.map(student => {
                  const entry = marks[student.id] || {
                    studentId: student.id,
                    studentName: student.nameEn,
                    studentNameMl: student.nameMl,
                    rollNo: student.rollNo,
                    admissionNo: student.admissionNo,
                    isAbsent: false,
                    correctAnswers: 0,
                    wrongAnswers: 0,
                    unattempted: 0,
                    totalPositive: 0,
                    minusMarks: 0,
                    grandTotal: 0,
                    maxMarks,
                  };

                  const isAbsent = entry.isAbsent;
                  const rightAns = entry.correctAnswers || 0;
                  const rightMark = rightAns * 1;
                  const wrongAns = entry.wrongAnswers || 0;
                  const wrongMark = wrongAns * 0.25;
                  const total = rightMark - wrongMark;

                  return (
                    <tr
                      key={student.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isAbsent ? 'bg-rose-50/30 text-slate-400' : ''
                      }`}
                    >
                      {/* Student Name */}
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2.5">
                          <span className="w-6 h-6 rounded-md bg-slate-100 text-slate-700 flex items-center justify-center font-mono font-bold text-[11px] shrink-0 border border-slate-200">
                            {student.rollNo}
                          </span>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 truncate">
                              {student.nameEn}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              Adm: {student.admissionNo || '—'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Right Ans (Number Input) */}
                      <td className="py-2 px-3 text-center border-l border-emerald-100 bg-emerald-50/20">
                        <input
                          type="number"
                          min={0}
                          max={maxMarks}
                          disabled={isAbsent}
                          value={isAbsent ? '' : (entry.correctAnswers !== undefined ? entry.correctAnswers : '')}
                          onChange={e => handleScoreInputChange(student.id, 'correct', e.target.value)}
                          placeholder="0"
                          className="w-20 mx-auto py-1 px-2 text-center text-xs font-mono font-bold border border-emerald-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-700 focus:outline-none disabled:bg-slate-100 disabled:opacity-40"
                        />
                      </td>

                      {/* Mark (Read-only auto-calculated: Right Ans * 1) */}
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-emerald-900 border-l border-emerald-200 bg-emerald-50/40">
                        {isAbsent ? (
                          <span className="text-slate-400">0</span>
                        ) : (
                          <span>+{rightMark}</span>
                        )}
                      </td>

                      {/* Wrong Ans (Number Input) */}
                      <td className="py-2 px-3 text-center border-l border-rose-100 bg-rose-50/20">
                        <input
                          type="number"
                          min={0}
                          max={maxMarks}
                          disabled={isAbsent}
                          value={isAbsent ? '' : (entry.wrongAnswers !== undefined ? entry.wrongAnswers : '')}
                          onChange={e => handleScoreInputChange(student.id, 'wrong', e.target.value)}
                          placeholder="0"
                          className="w-20 mx-auto py-1 px-2 text-center text-xs font-mono font-bold border border-rose-300 rounded-lg bg-white text-rose-900 focus:ring-2 focus:ring-rose-700 focus:outline-none disabled:bg-slate-100 disabled:opacity-40"
                        />
                      </td>

                      {/* Mark (Read-only auto-calculated: Wrong Ans * 0.25) */}
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-rose-800 border-l border-rose-200 bg-rose-50/40">
                        {isAbsent ? (
                          <span className="text-slate-400">0.00</span>
                        ) : (
                          <span>-{wrongMark.toFixed(2)}</span>
                        )}
                      </td>

                      {/* Total (Read-only auto-calculated: Right Ans Mark - Wrong Ans Mark) */}
                      <td className="py-2.5 px-3 text-center font-mono font-black text-sm border-l border-emerald-800 bg-emerald-50/80">
                        {isAbsent ? (
                          <span className="text-rose-600 font-bold">AB</span>
                        ) : (
                          <span
                            className={
                              total >= maxMarks * 0.7
                                ? 'text-emerald-950 font-bold'
                                : total >= maxMarks * 0.4
                                ? 'text-amber-900 font-bold'
                                : 'text-rose-900 font-bold'
                            }
                          >
                            {total.toFixed(2)}
                          </span>
                        )}
                      </td>

                      {/* Absent Toggle Button */}
                      <td className="py-2 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleAbsent(student.id)}
                          className={`px-2 py-1 rounded-md text-[10px] font-bold cursor-pointer transition ${
                            isAbsent
                              ? 'bg-rose-600 text-white hover:bg-rose-700 shadow-2xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {isAbsent ? 'Absent' : 'Present'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Table Footer Summary Bar */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-slate-600">
            <div>
              <span>Enrolled: </span>
              <strong className="text-slate-900">{stats.totalStudents}</strong>
            </div>
            <div>
              <span>Present: </span>
              <strong className="text-emerald-800">{stats.totalPresent}</strong>
            </div>
            <div>
              <span>Absent: </span>
              <strong className="text-rose-700">{stats.totalAbsent}</strong>
            </div>
            <div>
              <span>Class Avg Score: </span>
              <strong className="text-slate-900 font-mono">{stats.avgScore} / {maxMarks}</strong>
              <span className="text-slate-400 ml-1">({stats.avgPercentage}%)</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSave('draft')}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-200 hover:bg-slate-300 text-slate-800 transition cursor-pointer"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
