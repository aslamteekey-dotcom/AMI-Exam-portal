import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Student, HikmaStudentMark } from '../../types';
import { getHikmaStudentComparativeMarks } from '../../services/hikmaExamService';
import {
  Award,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  Printer,
  Sparkles,
  ShieldCheck,
  ArrowUpRight,
  MinusCircle,
  HelpCircle,
} from 'lucide-react';

interface Props {
  student?: Student | null;
  onClose?: () => void;
}

export const HikmaProgressReportCard: React.FC<Props> = ({ student, onClose }) => {
  const { lang, institutionSettings } = useAuth();
  const isMl = lang === 'ml';

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    model_1?: HikmaStudentMark;
    model_2?: HikmaStudentMark;
    model_3?: HikmaStudentMark;
  }>({});

  useEffect(() => {
    let isMounted = true;
    if (!student) {
      setLoading(false);
      return;
    }
    setLoading(true);

    getHikmaStudentComparativeMarks(student).then(res => {
      if (!isMounted) return;
      setData(res);
      setLoading(false);
    });

    const handleUpdate = () => {
      if (!student) return;
      getHikmaStudentComparativeMarks(student).then(res => {
        if (!isMounted) return;
        setData(res);
      });
    };

    window.addEventListener('hikma_exam_updated', handleUpdate);
    return () => {
      isMounted = false;
      window.removeEventListener('hikma_exam_updated', handleUpdate);
    };
  }, [student]);

  const m1 = data.model_1;
  const m2 = data.model_2;
  const m3 = data.model_3;

  // Comparison metrics between models
  const diff1to2 = m1 && m2 && !m1.isAbsent && !m2.isAbsent ? m2.grandTotal - m1.grandTotal : 0;
  const diff2to3 = m2 && m3 && !m2.isAbsent && !m3.isAbsent ? m3.grandTotal - m2.grandTotal : 0;

  const totalMaxMarks = (m1?.maxMarks || 50) + (m2?.maxMarks || 50) + (m3?.maxMarks || 50);
  const totalGrandMarks =
    (m1 && !m1.isAbsent ? m1.grandTotal : 0) +
    (m2 && !m2.isAbsent ? m2.grandTotal : 0) +
    (m3 && !m3.isAbsent ? m3.grandTotal : 0);

  const totalPositiveMarks =
    (m1 && !m1.isAbsent ? m1.totalPositive : 0) +
    (m2 && !m2.isAbsent ? m2.totalPositive : 0) +
    (m3 && !m3.isAbsent ? m3.totalPositive : 0);

  const totalMinusMarks =
    (m1 && !m1.isAbsent ? m1.minusMarks : 0) +
    (m2 && !m2.isAbsent ? m2.minusMarks : 0) +
    (m3 && !m3.isAbsent ? m3.minusMarks : 0);

  const overallPercentage =
    totalMaxMarks > 0 ? ((totalGrandMarks / totalMaxMarks) * 100).toFixed(1) : '0.0';

  const handlePrint = () => {
    window.print();
  };

  if (!student) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-xs font-semibold text-slate-500 shadow-xs">
        Please select a student profile to view the HIKMA Model Exam report.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-xs font-semibold text-slate-500 shadow-xs">
        Loading HIKMA Model Exam comparative report...
      </div>
    );
  }

  return (
    <div className="hikma-progress-card bg-white rounded-2xl sm:rounded-3xl border border-emerald-900/20 shadow-md p-4 sm:p-6 space-y-5 print:border-none print:shadow-none print:p-0">
      {/* Top Banner & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-800 to-teal-950 text-white flex items-center justify-center shadow-xs shrink-0">
            <Award className="w-6 h-6 text-amber-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-900">
                {isMl ? 'ഹിക്മ മോഡൽ പരീക്ഷ' : 'HIKMA Model Exam'}
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-[11px] text-slate-500 font-medium">Single General Paper</span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 mt-0.5">
              Comparative Progress Report — 3 Models
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2 print:hidden">
          <button
            type="button"
            onClick={handlePrint}
            className="px-3.5 py-1.5 text-xs font-bold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print Report</span>
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Student Details Strip */}
      <div className="bg-gradient-to-r from-emerald-50/90 via-teal-50/60 to-emerald-50/90 border border-emerald-200/80 rounded-2xl p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider">
            Student Profile
          </div>
          <div className="text-sm sm:text-base font-bold text-emerald-950 mt-0.5">
            {student.nameEn}
            {student.nameMl && (
              <span className="text-xs font-normal text-emerald-800 ml-2 font-ml">
                ({student.nameMl})
              </span>
            )}
          </div>
          <div className="text-xs text-emerald-800 mt-0.5 font-medium">
            Class: <strong className="text-emerald-950">{(student.class || student.classId || '').replace(/^Class\s*/i, '')}</strong> • Roll No: <strong className="text-emerald-950">{student.rollNo}</strong> • Adm No: <span className="font-mono font-bold text-emerald-950">{student.admissionNo}</span>
          </div>
        </div>

        <div className="text-right">
          <div className="text-[10px] uppercase font-bold text-slate-500">Evaluation Scheme</div>
          <div className="text-xs font-bold text-slate-800 mt-0.5">
            +1.00 Correct • -0.25 Wrong
          </div>
          <div className="text-[11px] text-emerald-700 font-medium">
            Academic Year 2026–2027
          </div>
        </div>
      </div>

      {/* 3 Model Cards: Side-by-side on desktop, stacked on mobile */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Model 1 Card */}
        <div className="bg-white rounded-2xl border-2 border-blue-200/80 p-4 sm:p-5 shadow-xs flex flex-col justify-between relative overflow-hidden group hover:border-blue-400 transition-colors">
          <div className="absolute top-0 right-0 bg-blue-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider">
            Model 1
          </div>

          <div>
            <div className="text-xs font-bold text-blue-900 mb-2">First Assessment</div>

            {/* Final Grand Total Highlight */}
            <div className="bg-blue-50/80 border border-blue-100 rounded-xl p-3 mb-4 text-center">
              <div className="text-[10px] font-bold uppercase tracking-wider text-blue-700">
                Final Grand Total
              </div>
              <div className="text-2xl sm:text-3xl font-black font-mono text-blue-950 mt-0.5">
                {m1 ? (m1.isAbsent ? 'AB' : Number(m1.grandTotal).toFixed(2)) : '—'}
              </div>
              <div className="text-xs text-blue-700 font-semibold mt-0.5">
                Out of {m1?.maxMarks || 50} Marks ({m1 && !m1.isAbsent && m1.maxMarks ? ((m1.grandTotal / m1.maxMarks) * 100).toFixed(1) : 0}%)
              </div>
            </div>

            {/* Required Breakdown: Max Marks, Correct Answers (Score), Minus Marks */}
            <div className="space-y-2 text-xs border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between text-slate-600">
                <span className="font-medium">Max Marks:</span>
                <span className="font-mono font-bold text-slate-900">{m1?.maxMarks || 50}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span className="font-medium">Correct Answers (Score):</span>
                <span className="font-mono font-bold text-emerald-800">
                  {m1 ? `${m1.correctAnswers} (+${Number(m1.totalPositive).toFixed(2)})` : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span className="font-medium">Minus Marks:</span>
                <span className="font-mono font-bold text-rose-700">
                  {m1 ? `-${Number(m1.minusMarks).toFixed(2)} (${m1.wrongAnswers} wrong)` : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-500 text-[11px]">
                <span>Unattempted Questions:</span>
                <span className="font-mono">{m1?.unattempted ?? 0}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-blue-100/60 text-[11px] text-blue-800 font-medium text-center">
            Baseline Model Evaluation Completed
          </div>
        </div>

        {/* Model 2 Card */}
        <div className="bg-white rounded-2xl border-2 border-emerald-300 p-4 sm:p-5 shadow-xs flex flex-col justify-between relative overflow-hidden group hover:border-emerald-500 transition-colors">
          <div className="absolute top-0 right-0 bg-emerald-700 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider">
            Model 2
          </div>

          <div>
            <div className="flex items-center justify-between text-xs font-bold text-emerald-900 mb-2">
              <span>Second Assessment</span>
              {diff1to2 !== 0 && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-0.5 ${
                    diff1to2 >= 0
                      ? 'bg-emerald-100 text-emerald-900'
                      : 'bg-rose-100 text-rose-900'
                  }`}
                >
                  {diff1to2 >= 0 ? `+${diff1to2.toFixed(2)} ↗` : `${diff1to2.toFixed(2)} ↘`}
                </span>
              )}
            </div>

            {/* Final Grand Total Highlight */}
            <div className="bg-emerald-50/80 border border-emerald-200/80 rounded-xl p-3 mb-4 text-center">
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                Final Grand Total
              </div>
              <div className="text-2xl sm:text-3xl font-black font-mono text-emerald-950 mt-0.5">
                {m2 ? (m2.isAbsent ? 'AB' : Number(m2.grandTotal).toFixed(2)) : '—'}
              </div>
              <div className="text-xs text-emerald-800 font-semibold mt-0.5">
                Out of {m2?.maxMarks || 50} Marks ({m2 && !m2.isAbsent && m2.maxMarks ? ((m2.grandTotal / m2.maxMarks) * 100).toFixed(1) : 0}%)
              </div>
            </div>

            {/* Required Breakdown: Max Marks, Correct Answers (Score), Minus Marks */}
            <div className="space-y-2 text-xs border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between text-slate-600">
                <span className="font-medium">Max Marks:</span>
                <span className="font-mono font-bold text-slate-900">{m2?.maxMarks || 50}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span className="font-medium">Correct Answers (Score):</span>
                <span className="font-mono font-bold text-emerald-800">
                  {m2 ? `${m2.correctAnswers} (+${Number(m2.totalPositive).toFixed(2)})` : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span className="font-medium">Minus Marks:</span>
                <span className="font-mono font-bold text-rose-700">
                  {m2 ? `-${Number(m2.minusMarks).toFixed(2)} (${m2.wrongAnswers} wrong)` : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-500 text-[11px]">
                <span>Unattempted Questions:</span>
                <span className="font-mono">{m2?.unattempted ?? 0}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-emerald-100 text-[11px] text-emerald-800 font-medium text-center">
            {diff1to2 >= 0
              ? `Growth: +${diff1to2.toFixed(2)} marks compared to Model 1`
              : `Change: ${diff1to2.toFixed(2)} marks compared to Model 1`}
          </div>
        </div>

        {/* Model 3 Card */}
        <div className="bg-white rounded-2xl border-2 border-purple-300 p-4 sm:p-5 shadow-xs flex flex-col justify-between relative overflow-hidden group hover:border-purple-500 transition-colors">
          <div className="absolute top-0 right-0 bg-purple-700 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider">
            Model 3
          </div>

          <div>
            <div className="flex items-center justify-between text-xs font-bold text-purple-900 mb-2">
              <span>Third Assessment</span>
              {diff2to3 !== 0 && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-0.5 ${
                    diff2to3 >= 0
                      ? 'bg-purple-100 text-purple-900'
                      : 'bg-rose-100 text-rose-900'
                  }`}
                >
                  {diff2to3 >= 0 ? `+${diff2to3.toFixed(2)} ↗` : `${diff2to3.toFixed(2)} ↘`}
                </span>
              )}
            </div>

            {/* Final Grand Total Highlight */}
            <div className="bg-purple-50/80 border border-purple-200/80 rounded-xl p-3 mb-4 text-center">
              <div className="text-[10px] font-bold uppercase tracking-wider text-purple-800">
                Final Grand Total
              </div>
              <div className="text-2xl sm:text-3xl font-black font-mono text-purple-950 mt-0.5">
                {m3 ? (m3.isAbsent ? 'AB' : Number(m3.grandTotal).toFixed(2)) : '—'}
              </div>
              <div className="text-xs text-purple-800 font-semibold mt-0.5">
                Out of {m3?.maxMarks || 50} Marks ({m3 && !m3.isAbsent && m3.maxMarks ? ((m3.grandTotal / m3.maxMarks) * 100).toFixed(1) : 0}%)
              </div>
            </div>

            {/* Required Breakdown: Max Marks, Correct Answers (Score), Minus Marks */}
            <div className="space-y-2 text-xs border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between text-slate-600">
                <span className="font-medium">Max Marks:</span>
                <span className="font-mono font-bold text-slate-900">{m3?.maxMarks || 50}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span className="font-medium">Correct Answers (Score):</span>
                <span className="font-mono font-bold text-emerald-800">
                  {m3 ? `${m3.correctAnswers} (+${Number(m3.totalPositive).toFixed(2)})` : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span className="font-medium">Minus Marks:</span>
                <span className="font-mono font-bold text-rose-700">
                  {m3 ? `-${Number(m3.minusMarks).toFixed(2)} (${m3.wrongAnswers} wrong)` : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-500 text-[11px]">
                <span>Unattempted Questions:</span>
                <span className="font-mono">{m3?.unattempted ?? 0}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-purple-100 text-[11px] text-purple-800 font-medium text-center">
            {diff2to3 >= 0
              ? `Growth: +${diff2to3.toFixed(2)} marks compared to Model 2`
              : `Change: ${diff2to3.toFixed(2)} marks compared to Model 2`}
          </div>
        </div>
      </div>

      {/* Cumulative Performance & Progress Comparison Banner */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-700" />
              <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                Progress Trajectory across Models 1, 2, and 3
              </h4>
            </div>
            <p className="text-xs text-slate-600">
              Cumulative score: <strong className="text-emerald-950 font-mono text-sm">{totalGrandMarks.toFixed(2)}</strong> / {totalMaxMarks} ({overallPercentage}%)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="bg-white border border-slate-200 px-3 py-1.5 rounded-xl text-center">
              <div className="text-[10px] text-slate-400 font-bold uppercase">Positive Points</div>
              <div className="font-bold text-emerald-800 font-mono">+{totalPositiveMarks.toFixed(2)}</div>
            </div>
            <div className="bg-white border border-slate-200 px-3 py-1.5 rounded-xl text-center">
              <div className="text-[10px] text-slate-400 font-bold uppercase">Negative Deductions</div>
              <div className="font-bold text-rose-700 font-mono">-{totalMinusMarks.toFixed(2)}</div>
            </div>
            <div className="bg-emerald-900 text-white px-3.5 py-1.5 rounded-xl text-center shadow-xs">
              <div className="text-[10px] text-emerald-200 font-bold uppercase">Aggregate %</div>
              <div className="font-black text-white font-mono">{overallPercentage}%</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
