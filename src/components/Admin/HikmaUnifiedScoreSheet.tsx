import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  ClassItem,
  Student,
  HikmaClassModelRecord,
  HikmaStudentMark,
  ALL_STANDARD_CLASSES,
  sortStudentsBoysFirst,
  sortStudentsGirlsFirst,
  determineStudentGender,
  HIKMA_EXAM_ID,
} from '../../types';
import {
  getHikmaUnifiedClassRecords,
  getHikmaUnifiedClassRecordsSync,
  isStudentInSchoolClass,
  isStudentHikmaParticipating,
} from '../../services/hikmaExamService';
import {
  Printer,
  Download,
  Award,
  ChevronDown,
  Sparkles,
  TrendingUp,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

interface Props {
  initialClassId?: string;
  selectedClassId?: string;
  onClassChange?: (classId: string) => void;
  hideHeaderBar?: boolean;
  classes?: ClassItem[];
  allStudents?: Student[];
}

const DEFAULT_SCHOOL_CLASSES = ALL_STANDARD_CLASSES.filter(
  c => c.numericGrade >= 1 && c.numericGrade <= 9
);

export const HikmaUnifiedScoreSheet: React.FC<Props> = ({
  initialClassId,
  selectedClassId: propSelectedClassId,
  onClassChange,
  hideHeaderBar = false,
  classes = DEFAULT_SCHOOL_CLASSES,
  allStudents,
}) => {
  const { lang, institutionSettings } = useAuth();
  const isMl = lang === 'ml';

  const [internalClassId, setInternalClassId] = useState<string>(
    propSelectedClassId || initialClassId || classes[0]?.id || 'cls_5'
  );

  const selectedClassId = propSelectedClassId || internalClassId;

  const handleSelectClass = (clsId: string) => {
    setInternalClassId(clsId);
    if (onClassChange) onClassChange(clsId);
  };

  const [internalStudents, setInternalStudents] = useState<Student[]>(allStudents || []);
  const initialSync = getHikmaUnifiedClassRecordsSync(selectedClassId);
  const [loading, setLoading] = useState(!initialSync);
  const [records, setRecords] = useState<{
    model_1?: HikmaClassModelRecord;
    model_2?: HikmaClassModelRecord;
    model_3?: HikmaClassModelRecord;
  }>(initialSync || {});

  const printContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (allStudents && allStudents.length > 0) {
      setInternalStudents(allStudents);
    } else {
      fetch('/api/students')
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) setInternalStudents(data);
        })
        .catch(err => console.error('Error fetching students:', err));
    }
  }, [allStudents]);

  const activeClass = useMemo(() => {
    return classes.find(c => c.id === selectedClassId) || classes[0] || null;
  }, [classes, selectedClassId]);

  const classStudents = useMemo(() => {
    const list = internalStudents.filter(
      s => isStudentInSchoolClass(s, selectedClassId, activeClass) && isStudentHikmaParticipating(s)
    );

    const sorted = sortStudentsGirlsFirst(list);

    return sorted.map((s, idx) => ({
      ...s,
      rollNo: idx + 1,
      gender: determineStudentGender(s),
    }));
  }, [internalStudents, selectedClassId, activeClass]);

  // Load records for all 3 models
  useEffect(() => {
    let isMounted = true;
    const cached = getHikmaUnifiedClassRecordsSync(selectedClassId, classStudents);
    if (cached) {
      setRecords(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }

    getHikmaUnifiedClassRecords(selectedClassId, classStudents).then(unified => {
      if (!isMounted) return;
      setRecords(unified);
      setLoading(false);
    });

    const handleUpdate = () => {
      const updated = getHikmaUnifiedClassRecordsSync(selectedClassId, classStudents);
      if (updated && isMounted) setRecords(updated);
      getHikmaUnifiedClassRecords(selectedClassId, classStudents).then(unified => {
        if (!isMounted) return;
        setRecords(unified);
      });
    };

    window.addEventListener('hikma_exam_updated', handleUpdate);
    return () => {
      isMounted = false;
      window.removeEventListener('hikma_exam_updated', handleUpdate);
    };
  }, [selectedClassId, classStudents]);

  // Aggregate stats
  const classAverages = useMemo(() => {
    const calcModelAvg = (mRec?: HikmaClassModelRecord) => {
      if (!mRec || !mRec.studentMarks) return { pos: 0, min: 0, grand: 0, count: 0 };
      let sumPos = 0;
      let sumMin = 0;
      let sumGrand = 0;
      let count = 0;

      Object.values(mRec.studentMarks).forEach(m => {
        if (!m.isAbsent) {
          sumPos += m.totalPositive || 0;
          sumMin += m.minusMarks || 0;
          sumGrand += m.grandTotal || 0;
          count++;
        }
      });

      return {
        pos: count > 0 ? (sumPos / count).toFixed(2) : '0.00',
        min: count > 0 ? (sumMin / count).toFixed(2) : '0.00',
        grand: count > 0 ? (sumGrand / count).toFixed(2) : '0.00',
        count,
        maxMarks: mRec.maxMarks || 50,
      };
    };

    return {
      m1: calcModelAvg(records.model_1),
      m2: calcModelAvg(records.model_2),
      m3: calcModelAvg(records.model_3),
    };
  }, [records]);

  // Export CSV
  const handleExportCsv = () => {
    if (!classStudents.length) return;
    const headers = [
      'Roll No',
      'Admission No',
      'Student Name',
      'Gender',
      'Model 1 Positive',
      'Model 1 Minus',
      'Model 1 Grand Total',
      'Model 2 Positive',
      'Model 2 Minus',
      'Model 2 Grand Total',
      'Model 3 Positive',
      'Model 3 Minus',
      'Model 3 Grand Total',
      'Cumulative Grand Total',
    ];

    const rows = classStudents.map(st => {
      const m1 = records.model_1?.studentMarks[st.id];
      const m2 = records.model_2?.studentMarks[st.id];
      const m3 = records.model_3?.studentMarks[st.id];

      const cumTotal =
        (m1 && !m1.isAbsent ? m1.grandTotal : 0) +
        (m2 && !m2.isAbsent ? m2.grandTotal : 0) +
        (m3 && !m3.isAbsent ? m3.grandTotal : 0);

      return [
        st.rollNo,
        st.admissionNo || '',
        `"${st.nameEn}"`,
        st.gender || '',
        m1 ? (m1.isAbsent ? 'AB' : m1.totalPositive) : '—',
        m1 ? (m1.isAbsent ? 'AB' : m1.minusMarks) : '—',
        m1 ? (m1.isAbsent ? 'AB' : m1.grandTotal) : '—',
        m2 ? (m2.isAbsent ? 'AB' : m2.totalPositive) : '—',
        m2 ? (m2.isAbsent ? 'AB' : m2.minusMarks) : '—',
        m2 ? (m2.isAbsent ? 'AB' : m2.grandTotal) : '—',
        m3 ? (m3.isAbsent ? 'AB' : m3.totalPositive) : '—',
        m3 ? (m3.isAbsent ? 'AB' : m3.minusMarks) : '—',
        m3 ? (m3.isAbsent ? 'AB' : m3.grandTotal) : '—',
        cumTotal.toFixed(2),
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `HIKMA_ScoreSheet_${activeClass?.name || 'Class'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-4">
      {/* Top Action & Controls Bar (Hidden during print or if hideHeaderBar is true) */}
      {!hideHeaderBar && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800">
                Principal Portal • Mark Monitoring
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-xs text-slate-500 font-mono">Academic Year 2026–2027</span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 mt-1">
              HIKMA Model Exam — Consolidated Score Sheet
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Side-by-side comparative inspection for Model 1, Model 2, and Model 3 with negative marking logic.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Class Selector Dropdown */}
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
              <label className="text-xs font-bold text-slate-600">Class:</label>
              <div className="relative">
                <select
                  value={selectedClassId}
                  onChange={e => handleSelectClass(e.target.value)}
                  className="text-xs font-bold bg-transparent text-slate-900 pr-6 focus:outline-none cursor-pointer"
                >
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.nameMl ? `(${c.nameMl})` : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-0 top-1 pointer-events-none" />
              </div>
            </div>

            {/* Export CSV */}
            <button
              type="button"
              onClick={handleExportCsv}
              className="px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
              <span>Export CSV</span>
            </button>

            {/* Print */}
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print Sheet</span>
            </button>
          </div>
        </div>
      )}

      {hideHeaderBar && (
        <div className="flex items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs print:hidden">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span className="font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg">
              {activeClass?.name || 'Class'}
            </span>
            <span className="text-slate-300">•</span>
            <span className="font-semibold text-slate-700">{classStudents.length} Students Listed</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Sheet</span>
            </button>
          </div>
        </div>
      )}

      {/* Unified Score Sheet Container */}
      <div
        ref={printContainerRef}
        className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-6 print:p-0 print:border-none print:shadow-none space-y-4"
      >
        {/* Official Header for Printouts */}
        <div className="text-center border-b-2 border-emerald-900/40 pb-4 mb-2 print:block">
          <div className="text-xs font-serif text-emerald-900 font-bold" dir="rtl">
            {institutionSettings?.madrasaArabicHeader || 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ'}
          </div>
          <h1 className="text-base sm:text-lg font-bold font-serif text-emerald-950 mt-1 uppercase tracking-wide">
            {institutionSettings?.madrasaNameEn || 'Al Madrasathul Islamiya Pallikkuth'}
          </h1>
          <p className="text-xs text-slate-600 font-medium">
            KMEB Affiliated • Mi'yar A+ Accredited • Pallikkuth, Pattikkad P.O, Malappuram
          </p>
          <div className="mt-2 inline-block px-4 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold text-xs">
            HIKMA MODEL EXAMINATION 2026–2027 — CONSOLIDATED SCORE SHEET ({activeClass?.name || 'Class'})
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Single General Paper • Negative Marking Scheme (+1.00 Correct / -0.25 Wrong)
          </div>
        </div>

        {/* Unified Table */}
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-xs font-semibold">
            Loading unified HIKMA score sheet...
          </div>
        ) : classStudents.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs font-semibold">
            No students found in this class.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse border border-slate-300 text-xs">
              <thead>
                {/* Grouped Header Row 1 */}
                <tr className="bg-slate-100 text-slate-800 border-b border-slate-300 font-bold uppercase text-[10px] tracking-wider select-none">
                  <th colSpan={4} className="py-2 px-3 text-center border-r border-slate-300 bg-slate-200/70">
                    Student Information
                  </th>
                  <th
                    colSpan={3}
                    className="py-2 px-3 text-center border-r border-slate-300 bg-blue-100/80 text-blue-950"
                  >
                    Model 1 (Max: {records.model_1?.maxMarks || 50})
                  </th>
                  <th
                    colSpan={3}
                    className="py-2 px-3 text-center border-r border-slate-300 bg-emerald-100/80 text-emerald-950"
                  >
                    Model 2 (Max: {records.model_2?.maxMarks || 50})
                  </th>
                  <th
                    colSpan={3}
                    className="py-2 px-3 text-center border-r border-slate-300 bg-purple-100/80 text-purple-950"
                  >
                    Model 3 (Max: {records.model_3?.maxMarks || 50})
                  </th>
                  <th colSpan={2} className="py-2 px-3 text-center bg-slate-200/70 text-slate-900">
                    Cumulative Summary
                  </th>
                </tr>

                {/* Sub-Header Row 2 */}
                <tr className="bg-slate-50 text-slate-700 border-b border-slate-300 text-[10px] font-bold select-none">
                  {/* Student Info */}
                  <th className="py-2 px-2 text-center w-10 border-r border-slate-200">Roll</th>
                  <th className="py-2 px-2 w-14 border-r border-slate-200">Adm</th>
                  <th className="py-2 px-2 text-center w-16 border-r border-slate-200">Reg No</th>
                  <th className="py-2 px-3 min-w-[150px] border-r border-slate-300">Name</th>

                  {/* Model 1 Sub-columns */}
                  <th className="py-2 px-2 text-center w-16 bg-blue-50/50 text-blue-900 border-r border-slate-200">
                    Total (+)
                  </th>
                  <th className="py-2 px-2 text-center w-16 bg-blue-50/50 text-rose-800 border-r border-slate-200">
                    Minus (-)
                  </th>
                  <th className="py-2 px-2 text-center w-20 bg-blue-100/60 font-black text-blue-950 border-r border-slate-300">
                    Grand Total
                  </th>

                  {/* Model 2 Sub-columns */}
                  <th className="py-2 px-2 text-center w-16 bg-emerald-50/50 text-emerald-900 border-r border-slate-200">
                    Total (+)
                  </th>
                  <th className="py-2 px-2 text-center w-16 bg-emerald-50/50 text-rose-800 border-r border-slate-200">
                    Minus (-)
                  </th>
                  <th className="py-2 px-2 text-center w-20 bg-emerald-100/60 font-black text-emerald-950 border-r border-slate-300">
                    Grand Total
                  </th>

                  {/* Model 3 Sub-columns */}
                  <th className="py-2 px-2 text-center w-16 bg-purple-50/50 text-purple-900 border-r border-slate-200">
                    Total (+)
                  </th>
                  <th className="py-2 px-2 text-center w-16 bg-purple-50/50 text-rose-800 border-r border-slate-200">
                    Minus (-)
                  </th>
                  <th className="py-2 px-2 text-center w-20 bg-purple-100/60 font-black text-purple-950 border-r border-slate-300">
                    Grand Total
                  </th>

                  {/* Cumulative */}
                  <th className="py-2 px-2 text-center w-20 bg-slate-100 font-bold text-slate-900 border-r border-slate-200">
                    Cum. Total
                  </th>
                  <th className="py-2 px-2 text-center w-16 bg-slate-100 font-bold text-slate-800">
                    Avg %
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {classStudents.map((st, idx) => {
                  const m1 = records.model_1?.studentMarks[st.id];
                  const m2 = records.model_2?.studentMarks[st.id];
                  const m3 = records.model_3?.studentMarks[st.id];

                  const validTotals: number[] = [];
                  let sumMax = 0;
                  if (m1 && !m1.isAbsent) {
                    validTotals.push(m1.grandTotal);
                    sumMax += records.model_1?.maxMarks || 50;
                  }
                  if (m2 && !m2.isAbsent) {
                    validTotals.push(m2.grandTotal);
                    sumMax += records.model_2?.maxMarks || 50;
                  }
                  if (m3 && !m3.isAbsent) {
                    validTotals.push(m3.grandTotal);
                    sumMax += records.model_3?.maxMarks || 50;
                  }

                  const cumScore = validTotals.reduce((a, b) => a + b, 0);
                  const cumPct = sumMax > 0 ? ((cumScore / sumMax) * 100).toFixed(1) : '—';

                  return (
                    <tr
                      key={st.id}
                      className={`hover:bg-slate-50 transition-colors ${
                        idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'
                      }`}
                    >
                      {/* Roll */}
                      <td className="py-2 px-2 text-center font-mono font-bold text-slate-900 border-r border-slate-200">
                        {st.rollNo}
                      </td>

                      {/* Adm */}
                      <td className="py-2 px-2 font-mono text-[11px] text-slate-600 border-r border-slate-200">
                        {st.admissionNo || '—'}
                      </td>

                      {/* Reg No */}
                      <td className="py-2 px-2 text-center font-mono text-[11px] text-emerald-800 font-bold border-r border-slate-200">
                        {st.hikmaRegNo || st.examRegisterNumbers?.[HIKMA_EXAM_ID] || m1?.registerNo || '—'}
                      </td>

                      {/* Name */}
                      <td className="py-2 px-3 border-r border-slate-300">
                        <div className="font-bold text-slate-900 truncate max-w-[170px]">
                          {st.nameEn}
                        </div>
                        {st.nameMl && (
                          <div className="text-[10px] text-slate-500 font-ml truncate max-w-[170px]">
                            {st.nameMl}
                          </div>
                        )}
                      </td>

                      {/* Model 1: Total (+) */}
                      <td className="py-2 px-2 text-center font-mono text-emerald-900 border-r border-slate-200 bg-blue-50/10">
                        {m1 ? (m1.isAbsent ? <span className="text-slate-400">AB</span> : `+${m1.totalPositive.toFixed(2)}`) : '—'}
                      </td>
                      {/* Model 1: Minus (-) */}
                      <td className="py-2 px-2 text-center font-mono text-rose-800 border-r border-slate-200 bg-blue-50/10">
                        {m1 ? (m1.isAbsent ? <span className="text-slate-400">AB</span> : `-${m1.minusMarks.toFixed(2)}`) : '—'}
                      </td>
                      {/* Model 1: Grand Total */}
                      <td className="py-2 px-2 text-center font-mono font-bold text-xs text-blue-950 border-r border-slate-300 bg-blue-50/30">
                        {m1 ? (
                          m1.isAbsent ? (
                            <span className="text-rose-600 font-bold">AB</span>
                          ) : (
                            Number(m1.grandTotal).toFixed(2)
                          )
                        ) : (
                          '—'
                        )}
                      </td>

                      {/* Model 2: Total (+) */}
                      <td className="py-2 px-2 text-center font-mono text-emerald-900 border-r border-slate-200 bg-emerald-50/10">
                        {m2 ? (m2.isAbsent ? <span className="text-slate-400">AB</span> : `+${m2.totalPositive.toFixed(2)}`) : '—'}
                      </td>
                      {/* Model 2: Minus (-) */}
                      <td className="py-2 px-2 text-center font-mono text-rose-800 border-r border-slate-200 bg-emerald-50/10">
                        {m2 ? (m2.isAbsent ? <span className="text-slate-400">AB</span> : `-${m2.minusMarks.toFixed(2)}`) : '—'}
                      </td>
                      {/* Model 2: Grand Total */}
                      <td className="py-2 px-2 text-center font-mono font-bold text-xs text-emerald-950 border-r border-slate-300 bg-emerald-50/30">
                        {m2 ? (
                          m2.isAbsent ? (
                            <span className="text-rose-600 font-bold">AB</span>
                          ) : (
                            Number(m2.grandTotal).toFixed(2)
                          )
                        ) : (
                          '—'
                        )}
                      </td>

                      {/* Model 3: Total (+) */}
                      <td className="py-2 px-2 text-center font-mono text-emerald-900 border-r border-slate-200 bg-purple-50/10">
                        {m3 ? (m3.isAbsent ? <span className="text-slate-400">AB</span> : `+${m3.totalPositive.toFixed(2)}`) : '—'}
                      </td>
                      {/* Model 3: Minus (-) */}
                      <td className="py-2 px-2 text-center font-mono text-rose-800 border-r border-slate-200 bg-purple-50/10">
                        {m3 ? (m3.isAbsent ? <span className="text-slate-400">AB</span> : `-${m3.minusMarks.toFixed(2)}`) : '—'}
                      </td>
                      {/* Model 3: Grand Total */}
                      <td className="py-2 px-2 text-center font-mono font-bold text-xs text-purple-950 border-r border-slate-300 bg-purple-50/30">
                        {m3 ? (
                          m3.isAbsent ? (
                            <span className="text-rose-600 font-bold">AB</span>
                          ) : (
                            Number(m3.grandTotal).toFixed(2)
                          )
                        ) : (
                          '—'
                        )}
                      </td>

                      {/* Cumulative Total */}
                      <td className="py-2 px-2 text-center font-mono font-black text-slate-900 border-r border-slate-200 bg-slate-100/50">
                        {validTotals.length > 0 ? cumScore.toFixed(2) : '—'}
                      </td>

                      {/* Avg % */}
                      <td className="py-2 px-2 text-center font-mono font-bold text-slate-700 bg-slate-100/50">
                        {cumPct !== '—' ? `${cumPct}%` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Summary Footer Row */}
              <tfoot>
                <tr className="bg-slate-200 text-slate-900 font-bold border-t-2 border-slate-400 text-[11px]">
                  <td colSpan={3} className="py-2.5 px-3 uppercase text-right border-r border-slate-300">
                    Class Averages:
                  </td>

                  {/* Model 1 Averages */}
                  <td className="py-2 px-2 text-center font-mono text-emerald-950 border-r border-slate-300">
                    +{classAverages.m1.pos}
                  </td>
                  <td className="py-2 px-2 text-center font-mono text-rose-900 border-r border-slate-300">
                    -{classAverages.m1.min}
                  </td>
                  <td className="py-2 px-2 text-center font-mono font-black text-blue-950 border-r border-slate-400 bg-blue-100/60">
                    {classAverages.m1.grand}
                  </td>

                  {/* Model 2 Averages */}
                  <td className="py-2 px-2 text-center font-mono text-emerald-950 border-r border-slate-300">
                    +{classAverages.m2.pos}
                  </td>
                  <td className="py-2 px-2 text-center font-mono text-rose-900 border-r border-slate-300">
                    -{classAverages.m2.min}
                  </td>
                  <td className="py-2 px-2 text-center font-mono font-black text-emerald-950 border-r border-slate-400 bg-emerald-100/60">
                    {classAverages.m2.grand}
                  </td>

                  {/* Model 3 Averages */}
                  <td className="py-2 px-2 text-center font-mono text-emerald-950 border-r border-slate-300">
                    +{classAverages.m3.pos}
                  </td>
                  <td className="py-2 px-2 text-center font-mono text-rose-900 border-r border-slate-300">
                    -{classAverages.m3.min}
                  </td>
                  <td className="py-2 px-2 text-center font-mono font-black text-purple-950 border-r border-slate-400 bg-purple-100/60">
                    {classAverages.m3.grand}
                  </td>

                  {/* Cumulative Average */}
                  <td colSpan={2} className="py-2 px-2 text-center font-mono font-black text-emerald-950 bg-slate-300/80">
                    {(
                      Number(classAverages.m1.grand) +
                      Number(classAverages.m2.grand) +
                      Number(classAverages.m3.grand)
                    ).toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Verification Signatures (Visible during print) */}
        <div className="pt-8 border-t border-slate-200 hidden print:flex items-center justify-between text-xs text-slate-700">
          <div className="text-center">
            <div className="w-40 border-b border-slate-800 mb-1"></div>
            <div className="font-bold">Class In-charge Teacher</div>
          </div>
          <div className="text-center">
            <div className="w-40 border-b border-slate-800 mb-1"></div>
            <div className="font-bold">Evaluation Coordinator</div>
          </div>
          <div className="text-center">
            <div className="w-40 border-b border-slate-800 mb-1"></div>
            <div className="font-bold">{institutionSettings?.principalNameEn || 'Principal'}</div>
            <div className="text-[10px] text-slate-500">Official Seal &amp; Date</div>
          </div>
        </div>
      </div>
    </div>
  );
};
