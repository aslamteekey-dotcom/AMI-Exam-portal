import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  ClassItem,
  Student,
  HikmaModelId,
  HikmaStudentMark,
  HikmaClassModelRecord,
  HIKMA_MODELS,
  HIKMA_EXAM_ID,
  calculateHikmaStudentScore,
  sortStudentsGirlsFirst,
  determineStudentGender,
} from '../../types';
import {
  getHikmaClassRecord,
  saveHikmaClassRecord,
  isStudentInSchoolClass,
  isStudentHikmaParticipating,
  getHikmaExamConfig,
  getHikmaSavedRegNumbers,
  HikmaExamConfig,
} from '../../services/hikmaExamService';
import {
  Save,
  CheckCircle,
  Clock,
  Sparkles,
  ArrowLeft,
  ChevronDown,
  CheckCircle2,
  Hash,
} from 'lucide-react';

interface Props {
  classId: string;
  classes?: ClassItem[];
  onClassChange?: (clsId: string) => void;
  selectedModel: HikmaModelId;
  onModelChange: (m: HikmaModelId) => void;
  students: Student[];
  onBack?: () => void;
}

export const HikmaMarkEntryView: React.FC<Props> = ({
  classId,
  classes = [],
  selectedModel,
  onModelChange,
  students,
  onBack,
}) => {
  const { lang } = useAuth();
  const isMl = lang === 'ml';

  const [loading, setLoading] = useState(true);
  const [maxMarks, setMaxMarks] = useState<number>(50);
  const [marks, setMarks] = useState<Record<string, HikmaStudentMark>>({});
  const [status, setStatus] = useState<'draft' | 'submitted' | 'approved' | 'locked'>('draft');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [autoFillSuccess, setAutoFillSuccess] = useState(false);
  const [savedRegMap, setSavedRegMap] = useState<Record<string, string>>(() => getHikmaSavedRegNumbers());

  const activeClass = useMemo(() => {
    return classes.find(c => c.id === classId) || classes[0] || null;
  }, [classes, classId]);

  // Sync saved Hikma registration numbers from Principal Portal
  useEffect(() => {
    const updateRegMap = () => {
      setSavedRegMap(getHikmaSavedRegNumbers());
    };
    updateRegMap();
    window.addEventListener('hikma_exam_updated', updateRegMap);
    window.addEventListener('madrasa_students_updated', updateRegMap);
    return () => {
      window.removeEventListener('hikma_exam_updated', updateRegMap);
      window.removeEventListener('madrasa_students_updated', updateRegMap);
    };
  }, []);

  const getStudentRegNo = (st: Student): string => {
    return (
      savedRegMap[st.id] ||
      (st.admissionNo ? savedRegMap[st.admissionNo] : '') ||
      st.hikmaRegNo ||
      st.examRegisterNumbers?.[HIKMA_EXAM_ID] ||
      (st as any).examRegisterNos?.[HIKMA_EXAM_ID] ||
      (st as any).regNo ||
      ''
    );
  };

  // Sort students sequential roll numbers, strictly filtered by School Class and Participating status (Girls First, then Boys)
  const sortedStudents = useMemo(() => {
    const list = students.filter(
      s => isStudentInSchoolClass(s, classId, activeClass) && isStudentHikmaParticipating(s)
    );

    const sorted = sortStudentsGirlsFirst(list);

    return sorted.map((s, idx) => ({
      ...s,
      rollNo: idx + 1,
      gender: determineStudentGender(s),
    }));
  }, [students, classId, activeClass]);

  // Load HIKMA record and dynamically fetch Max Marks from Exam Settings configured in Principal Portal
  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    const loadData = async () => {
      try {
        const config = await getHikmaExamConfig();
        const configuredMax = config.models?.[selectedModel]?.totalMarks || 50;

        const rec = await getHikmaClassRecord(classId, selectedModel, sortedStudents);
        if (!isMounted) return;

        const effectiveMax = configuredMax || rec.maxMarks || 50;
        setMaxMarks(effectiveMax);
        setStatus(rec.status || 'draft');
        setMarks(rec.studentMarks || {});
      } catch (err) {
        console.error('Failed to load Hikma class record:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadData();

    // Listen to real-time exam config updates from Principal Portal
    const handleConfigUpdate = (e: any) => {
      const newConfig: HikmaExamConfig = e.detail;
      if (newConfig?.models?.[selectedModel]?.totalMarks) {
        const newMax = newConfig.models[selectedModel].totalMarks;
        setMaxMarks(newMax);
      }
    };

    window.addEventListener('hikma_config_updated', handleConfigUpdate);

    return () => {
      isMounted = false;
      window.removeEventListener('hikma_config_updated', handleConfigUpdate);
    };
  }, [classId, selectedModel, sortedStudents]);

  // Handle student input change (real-time recalculation)
  const handleScoreInputChange = (
    studentId: string,
    field: 'correct' | 'wrong',
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
      let u = Math.max(0, maxMarks - (c + w));

      // Cap at maxMarks if exceeded
      if (c > maxMarks) c = maxMarks;
      if (w > maxMarks) w = maxMarks;

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
      examinationId: HIKMA_EXAM_ID,
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
    const avgPercentage =
      totalPresent > 0 && maxMarks > 0 ? ((sumGrandTotal / (totalPresent * maxMarks)) * 100).toFixed(1) : '0.0';

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
    <div className="space-y-3 sm:space-y-4">
      {/* Top Controls Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-5 shadow-xs space-y-3.5 sm:space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5 sm:gap-3">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="p-1.5 sm:p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
                title="Back"
              >
                <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            )}
            <div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800">
                  {isMl ? 'ഹിക്മ മോഡൽ പരീക്ഷ' : 'HIKMA Model Exam'}
                </span>
                <span className="text-slate-300">•</span>
                <span className="text-[11px] sm:text-xs text-slate-500 font-medium">
                  {activeClass?.name || 'Class'} Evaluation
                </span>
              </div>
              <h2 className="text-base sm:text-xl font-bold text-slate-900 mt-0.5 flex items-center gap-2">
                <span>{activeClass?.name || 'School Class'} — {isMl ? activeModelMeta.labelMl : activeModelMeta.labelEn}</span>
              </h2>
            </div>
          </div>

          {/* Status Badge & Dynamic Max Marks Indicator */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1">
              <Hash className="w-3 h-3 text-slate-500" />
              <span>Max: <strong>{maxMarks}</strong></span>
            </span>

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
                  <span>Approved</span>
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

        {/* Streamlined Top Control: Only Select Model Paper */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50/90 border border-slate-200/90 p-3 sm:p-3.5 rounded-xl">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                {isMl ? 'മോഡൽ തിരഞ്ഞെടുക്കുക' : 'Select Model Paper'}
              </label>
              <div className="relative">
                <select
                  value={selectedModel}
                  onChange={e => onModelChange(e.target.value as HikmaModelId)}
                  className="w-56 sm:w-64 text-xs font-bold px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-emerald-700 focus:outline-none appearance-none cursor-pointer pr-8 shadow-2xs"
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

            <div className="hidden md:flex items-center gap-1.5 mt-5 text-[11px] text-slate-500">
              <span>(Configured limit:</span>
              <strong className="text-slate-800 font-mono">{maxMarks} Marks</strong>
              <span>from Principal Exam Settings)</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAutoFillUnattempted}
              className="text-xs font-bold text-emerald-800 hover:text-emerald-950 underline cursor-pointer px-2 py-1"
            >
              Auto-calculate unattempted
            </button>
          </div>
        </div>

        {/* Live Calculation Formula Banner */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] sm:text-xs bg-emerald-50/70 border border-emerald-200/80 p-2.5 sm:p-3 rounded-xl text-emerald-950 font-medium">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-bold flex items-center gap-1 text-emerald-900">
              <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
              Negative Marking Rule:
            </span>
            <span>Correct: <strong className="text-emerald-800">+1.00</strong></span>
            <span className="text-emerald-300">•</span>
            <span className="text-rose-800">Wrong: <strong className="text-rose-800">-0.25</strong></span>
            <span className="text-emerald-300">•</span>
            <span>Grand Total = <strong>Total Positive - Minus Marks</strong></span>
          </div>
        </div>

        {/* Feedback banners */}
        {saveSuccess && (
          <div className="p-2.5 sm:p-3 bg-emerald-100 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-bold flex items-center gap-2">
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

      {/* Main Student Mark Entry Table - Compact & Mobile Friendly with Sticky Frozen Student Details */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-3 sm:p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2.5 bg-slate-50/60">
          <div>
            <h3 className="font-bold text-slate-900 text-xs sm:text-sm">
              Student Mark Entry Roster ({sortedStudents.length} Students)
            </h3>
            <p className="text-[11px] text-slate-500 hidden sm:block">
              Swipe horizontally on mobile to enter Right and Wrong answer marks.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSave('draft')}
              disabled={isSaving}
              className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Saving...' : 'Save Draft'}</span>
            </button>
            <button
              type="button"
              onClick={() => handleSave('submitted')}
              disabled={isSaving}
              className="px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs font-bold bg-emerald-800 hover:bg-emerald-900 text-white transition flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Submit</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500 text-xs font-semibold">
            Loading HIKMA Model Exam roster...
          </div>
        ) : sortedStudents.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs font-semibold">
            No participating students found in {activeClass?.name || 'this school class'}.
          </div>
        ) : (
          <div className="overflow-x-auto border-t border-slate-200 overscroll-x-contain">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-bold uppercase text-[10px] tracking-wider select-none">
                  {/* Frozen Column 1: Student Name */}
                  <th className="py-2 px-2.5 w-[160px] sm:w-[190px] min-w-[160px] sm:min-w-[190px] sticky left-0 z-20 bg-slate-100">
                    Student Name
                  </th>
                  {/* Frozen Column 2: Hikma Reg No */}
                  <th className="py-2 px-2 text-center w-[84px] sm:w-[96px] min-w-[84px] sm:min-w-[96px] sticky left-[160px] sm:left-[190px] z-20 bg-slate-100 border-r border-slate-300 shadow-[3px_0_5px_-2px_rgba(0,0,0,0.12)]">
                    Reg No.
                  </th>
                  {/* Scrollable Evaluation Columns */}
                  <th className="py-2 px-2 text-center w-20 sm:w-24 bg-emerald-50 text-emerald-950 border-l border-emerald-100 whitespace-nowrap">
                    Right Ans
                  </th>
                  <th className="py-2 px-1.5 text-center w-16 sm:w-20 bg-emerald-100/70 text-emerald-900 border-l border-emerald-200 whitespace-nowrap">
                    Mark (+1)
                  </th>
                  <th className="py-2 px-2 text-center w-20 sm:w-24 bg-rose-50 text-rose-950 border-l border-rose-100 whitespace-nowrap">
                    Wrong Ans
                  </th>
                  <th className="py-2 px-1.5 text-center w-16 sm:w-20 bg-rose-100/70 text-rose-900 border-l border-rose-200 whitespace-nowrap">
                    Mark (-0.25)
                  </th>
                  <th className="py-2 px-2 text-center w-20 sm:w-24 bg-emerald-900 text-white border-l border-emerald-800 whitespace-nowrap">
                    Total
                  </th>
                  <th className="py-2 px-1.5 text-center w-16 sm:w-20 whitespace-nowrap">
                    Status
                  </th>
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
                  const regNo = getStudentRegNo(student);

                  return (
                    <tr
                      key={student.id}
                      className={`group transition-colors ${
                        isAbsent ? 'bg-rose-50/40 text-slate-400' : 'hover:bg-slate-50/90'
                      }`}
                    >
                      {/* Frozen Column 1: Roll No + Student Name */}
                      <td
                        className={`py-1.5 px-2.5 w-[160px] sm:w-[190px] min-w-[160px] sm:min-w-[190px] sticky left-0 z-10 border-b border-slate-100 ${
                          isAbsent ? 'bg-rose-50/80 group-hover:bg-rose-100/70' : 'bg-white group-hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded bg-slate-100 text-slate-700 flex items-center justify-center font-mono font-bold text-[10px] shrink-0 border border-slate-200">
                            {student.rollNo}
                          </span>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 truncate text-[11px] sm:text-xs leading-tight">
                              {student.nameEn}
                            </div>
                            <div className="text-[9.5px] text-slate-500 font-mono leading-none mt-0.5">
                              Adm: {student.admissionNo || '—'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Frozen Column 2: Hikma Reg No */}
                      <td
                        className={`py-1.5 px-2 text-center w-[84px] sm:w-[96px] min-w-[84px] sm:min-w-[96px] sticky left-[160px] sm:left-[190px] z-10 border-r border-slate-300 border-b border-slate-100 shadow-[3px_0_5px_-2px_rgba(0,0,0,0.12)] ${
                          isAbsent ? 'bg-rose-50/80 group-hover:bg-rose-100/70' : 'bg-white group-hover:bg-slate-50'
                        }`}
                      >
                        {regNo ? (
                          <span className="font-mono text-[10px] sm:text-[11px] font-bold text-emerald-950 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 inline-block">
                            {regNo}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono text-[11px]">—</span>
                        )}
                      </td>

                      {/* Right Ans (Number Input) */}
                      <td className="py-1 px-1.5 text-center border-l border-emerald-100 bg-emerald-50/20 border-b border-slate-100">
                        <input
                          type="number"
                          min={0}
                          max={maxMarks}
                          disabled={isAbsent}
                          value={isAbsent ? '' : (entry.correctAnswers !== undefined ? entry.correctAnswers : '')}
                          onChange={e => handleScoreInputChange(student.id, 'correct', e.target.value)}
                          placeholder="0"
                          className="w-14 sm:w-16 mx-auto py-1 px-1 text-center text-xs font-mono font-bold border border-emerald-300 rounded-md bg-white focus:ring-2 focus:ring-emerald-700 focus:outline-none disabled:bg-slate-100 disabled:opacity-40"
                        />
                      </td>

                      {/* Mark (Auto-calculated: Right Ans * 1) */}
                      <td className="py-1.5 px-1.5 text-center font-mono font-bold text-emerald-900 border-l border-emerald-200 bg-emerald-50/40 border-b border-slate-100 text-xs">
                        {isAbsent ? (
                          <span className="text-slate-400">0</span>
                        ) : (
                          <span>+{rightMark}</span>
                        )}
                      </td>

                      {/* Wrong Ans (Number Input) */}
                      <td className="py-1 px-1.5 text-center border-l border-rose-100 bg-rose-50/20 border-b border-slate-100">
                        <input
                          type="number"
                          min={0}
                          max={maxMarks}
                          disabled={isAbsent}
                          value={isAbsent ? '' : (entry.wrongAnswers !== undefined ? entry.wrongAnswers : '')}
                          onChange={e => handleScoreInputChange(student.id, 'wrong', e.target.value)}
                          placeholder="0"
                          className="w-14 sm:w-16 mx-auto py-1 px-1 text-center text-xs font-mono font-bold border border-rose-300 rounded-md bg-white text-rose-900 focus:ring-2 focus:ring-rose-700 focus:outline-none disabled:bg-slate-100 disabled:opacity-40"
                        />
                      </td>

                      {/* Mark (Auto-calculated: Wrong Ans * 0.25) */}
                      <td className="py-1.5 px-1.5 text-center font-mono font-bold text-rose-800 border-l border-rose-200 bg-rose-50/40 border-b border-slate-100 text-xs">
                        {isAbsent ? (
                          <span className="text-slate-400">0.00</span>
                        ) : (
                          <span>-{wrongMark.toFixed(2)}</span>
                        )}
                      </td>

                      {/* Total (Right Ans Mark - Wrong Ans Mark) */}
                      <td className="py-1.5 px-1.5 text-center font-mono font-black text-xs sm:text-sm border-l border-emerald-800 bg-emerald-50/80 border-b border-slate-100">
                        {isAbsent ? (
                          <span className="text-rose-600 font-bold text-xs">AB</span>
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
                      <td className="py-1 px-1.5 text-center border-b border-slate-100">
                        <button
                          type="button"
                          onClick={() => handleToggleAbsent(student.id)}
                          className={`px-1.5 py-1 rounded text-[10px] font-bold cursor-pointer transition ${
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

        {/* Compact Table Footer Summary Bar */}
        <div className="p-3 sm:p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-x-4 sm:gap-x-6 gap-y-1.5 text-slate-600 text-[11px] sm:text-xs">
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
              className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-slate-200 hover:bg-slate-300 text-slate-800 transition cursor-pointer"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
