import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ClassItem, Examination, StudentProgressReport, InstitutionSettings } from '../../types';
import { ProgressReportCard } from '../Report/ProgressReportCard';
import { Printer, Download, Eye, Table, Award, AlertCircle, FileText, Hash } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { ExamRegisterModal } from './ExamRegisterModal';

export const BulkReportsPrint: React.FC = () => {
  const { fetchWithAuth, lang, t } = useAuth();
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [examinations, setExaminations] = useState<Examination[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedExamId, setSelectedExamId] = useState('');
  const [settings, setSettings] = useState<InstitutionSettings | null>(null);
  const [reportsData, setReportsData] = useState<{
    reports: StudentProgressReport[];
    settings: InstitutionSettings;
  } | null>(null);
  const [fetching, setFetching] = useState(false);
  const [activeSingleReport, setActiveSingleReport] = useState<StudentProgressReport | null>(null);
  const [isBatchPrinting, setIsBatchPrinting] = useState(false);
  const [showRegModal, setShowRegModal] = useState(false);
  const batchPrintRef = useRef<HTMLDivElement>(null);

  const isMl = lang === 'ml';

  const loadInitial = async () => {
    setLoading(true);
    try {
      const [resC, resE, resS] = await Promise.all([
        fetchWithAuth('/api/classes'),
        fetchWithAuth('/api/examinations'),
        fetchWithAuth('/api/settings'),
      ]);
      const cData: ClassItem[] = await resC.json();
      const eData: Examination[] = await resE.json();
      const sData: InstitutionSettings = await resS.json();
      setClasses(cData);
      setExaminations(eData);
      setSettings(sData);

      const initialClassId = cData[0]?.id || '';
      const initialExamId = eData[0]?.id || '';
      setSelectedClassId(initialClassId);
      setSelectedExamId(initialExamId);

      if (initialClassId && initialExamId) {
        fetchClassReports(initialClassId, initialExamId);
      }
    } catch (err) {
      console.error('Error loading initial report data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchClassReports = async (cId: string, eId: string) => {
    if (!cId || !eId) return;
    setFetching(true);
    try {
      const res = await fetchWithAuth(`/api/reports/class/${cId}/exam/${eId}`);
      if (res.ok) {
        const data = await res.json();
        // SAFE GUARD: filter out any null or malformed report objects
        const rawReports: StudentProgressReport[] = Array.isArray(data.reports) ? data.reports : [];
        const safeReports = rawReports.filter(r => r && r.student);

        // Sort: Boys first, then alphabetical
        const sortedReports = [...safeReports].sort((a, b) => {
          const isGirlA = (a.student?.gender || 'M').toUpperCase().startsWith('F');
          const isGirlB = (b.student?.gender || 'M').toUpperCase().startsWith('F');
          if (isGirlA !== isGirlB) return isGirlA ? 1 : -1;
          return (a.student?.nameEn || '').trim().toLowerCase().localeCompare((b.student?.nameEn || '').trim().toLowerCase());
        });

        setReportsData({
          reports: sortedReports,
          settings: data.settings || settings,
        });
      }
    } catch (err) {
      console.error('Failed to load class reports:', err);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    loadInitial();
  }, []);

  const handleClassChange = (cId: string) => {
    setSelectedClassId(cId);
    if (selectedExamId) {
      fetchClassReports(cId, selectedExamId);
    }
  };

  const handleExamChange = (eId: string) => {
    setSelectedExamId(eId);
    if (selectedClassId) {
      fetchClassReports(selectedClassId, eId);
    }
  };

  const handleExportCsv = async () => {
    if (!selectedClassId || !selectedExamId) return;
    try {
      const res = await fetchWithAuth(`/api/export/class-results-csv?classId=${selectedClassId}&examId=${selectedExamId}`);
      if (!res.ok) throw new Error('Failed to export CSV');
      const text = await res.text();
      const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `class_${selectedClassId}_results.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'Error exporting CSV');
    }
  };

  const handlePrintAll = () => {
    window.print();
  };

  const handleBatchPdfDownload = async () => {
    if (!batchPrintRef.current) return;
    setIsBatchPrinting(true);
    try {
      const element = batchPrintRef.current;
      const canvas = await html2canvas(element, {
        scale: 1.5,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgProps = pdf.getImageProperties(imgData);
      const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, Math.min(imgHeight, pdfHeight));
      pdf.save(`Class_${selectedClassId}_Progress_Reports.pdf`);
    } catch (err) {
      console.error('Batch PDF generation failed:', err);
      alert('Failed to compile batch PDF. Please use the Print option and choose "Save as PDF".');
    } finally {
      setIsBatchPrinting(false);
    }
  };

  if (loading) {
    return <div className="text-center py-10 text-xs text-slate-500">Loading progress report center...</div>;
  }

  // Single report detailed inspection
  if (activeSingleReport && reportsData) {
    return (
      <ProgressReportCard
        report={activeSingleReport}
        settings={reportsData.settings || settings!}
        onBack={() => setActiveSingleReport(null)}
      />
    );
  }

  const currentClass = classes.find(c => c.id === selectedClassId);
  const currentExam = examinations.find(e => e.id === selectedExamId);
  const safeReports = (reportsData?.reports || []).filter(r => r && r.student);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Class Progress Reports & Grade Ledger</h2>
          <p className="text-xs text-slate-500">
            Spreadsheet-style class overview, dense rank distribution, and official multi-page A4 print cards.
          </p>
        </div>

        {safeReports.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowRegModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-xl transition shadow-2xs cursor-pointer"
            >
              <Hash className="w-3.5 h-3.5 text-emerald-700" />
              Assign Exam Register Nos
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition shadow-2xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={handlePrintAll}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition shadow-xs cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Class Reports
            </button>
          </div>
        )}
      </div>

      {/* Selector Controls */}
      <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center gap-4 text-xs">
        <div>
          <label className="block font-bold text-slate-700 mb-1">Select Class:</label>
          <select
            value={selectedClassId}
            onChange={e => handleClassChange(e.target.value)}
            className="p-2 border border-slate-300 rounded-xl bg-slate-50 font-bold focus:outline-none cursor-pointer"
          >
            {classes.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} {c.nameMl && `(${c.nameMl})`}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block font-bold text-slate-700 mb-1">Select Examination:</label>
          <select
            value={selectedExamId}
            onChange={e => handleExamChange(e.target.value)}
            className="p-2 border border-slate-300 rounded-xl bg-slate-50 font-bold focus:outline-none cursor-pointer"
          >
            {examinations.map(e => (
              <option key={e.id} value={e.id}>
                {isMl ? e.nameMl : e.nameEn}
              </option>
            ))}
          </select>
        </div>

        <div className="pt-4 flex items-center gap-2">
          <button
            onClick={() => fetchClassReports(selectedClassId, selectedExamId)}
            disabled={fetching}
            className="px-4 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition shadow-xs disabled:opacity-50 cursor-pointer"
          >
            {fetching ? 'Loading Reports...' : 'Load Class Reports'}
          </button>
          <button
            type="button"
            onClick={() => setShowRegModal(true)}
            className="px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 border border-emerald-300 rounded-xl transition cursor-pointer"
          >
            Edit Exam Reg Nos
          </button>
        </div>
      </div>

      {/* SPREADSHEET-STYLE OVERVIEW TABLE */}
      {safeReports.length > 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {currentClass?.name} Result Ledger ({safeReports.length} Students)
              </h3>
              <p className="text-[11px] text-slate-500">
                Dense Ranking: ties share identical rank without skipping ($1, 1, 2\dots$); students with TE &lt; 35% require improvement.
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-100 text-emerald-900 rounded-lg">
              {currentExam?.nameEn}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <th className="py-2.5 px-3 w-12 text-center">Roll</th>
                  <th className="py-2.5 px-3 w-28">Exam Reg No</th>
                  <th className="py-2.5 px-3 w-24">Adm No</th>
                  <th className="py-2.5 px-3">Student Name</th>
                  <th className="py-2.5 px-3 text-center">Marks Obtained</th>
                  <th className="py-2.5 px-3 text-center">Percentage</th>
                  <th className="py-2.5 px-3 text-center">Attendance</th>
                  <th className="py-2.5 px-3 text-center">Dense Rank</th>
                  <th className="py-2.5 px-3 text-center">Result Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {safeReports.map(rep => {
                  const s = rep?.student;
                  const attDays = rep.attendance?.daysAttended ?? s?.attendance?.daysAttended ?? 88;
                  const attTotal = rep.attendance?.totalWorkingDays ?? s?.attendance?.totalWorkingDays ?? 88;
                  const examRegNo = rep.examRegisterNo || s?.examRegisterNumbers?.[selectedExamId] || s?.rollNo || '—';

                  // Marks Obtained calculation:
                  // Even if student was absent for one or more subjects, calculate and display total marks obtained for attended subjects.
                  // Do not replace overall total with "null" or "Absent".
                  const attendedObtained = rep.attendedObtainedMarks ?? rep.totalObtainedMarks ?? 0;
                  const attendedMax = rep.attendedMaxMarks ?? rep.totalMaxMarks ?? 0;

                  // Percentage calculation: (Attended Marks / Attended Max) * 100, formatted to 2 decimals.
                  // Never display "N/A" if marks exist.
                  const pctVal = attendedMax > 0
                    ? ((attendedObtained / attendedMax) * 100).toFixed(2)
                    : (rep.percentage !== null && rep.percentage !== undefined ? rep.percentage.toFixed(2) : '0.00');

                  // Clear distinction between Dense Rank and Result Status:
                  // Rank is awarded strictly to students who passed all subjects without any absence or withheld status.
                  // Exclude failed/absent students from dense rank column.
                  const isRankAwarded = rep.resultStatus === 'Passed' && !rep.hasAbsentSubjects && !rep.hasWithheldCe && rep.classRank !== null;

                  let resultBadgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-200';
                  let displayResultStatus: string = rep.resultStatus === 'Needs Improvement' ? 'Need Improvement' : rep.resultStatus;

                  if (rep.hasAbsentSubjects) {
                    displayResultStatus = 'Absent';
                    resultBadgeColor = 'bg-slate-100 text-slate-800 border-slate-200';
                  } else if (rep.hasWithheldCe) {
                    displayResultStatus = 'Withheld';
                    resultBadgeColor = 'bg-amber-100 text-amber-900 border-amber-200';
                  } else if (displayResultStatus === 'Need Improvement') {
                    resultBadgeColor = 'bg-rose-100 text-rose-800 border-rose-200';
                  } else {
                    resultBadgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-200';
                  }

                  return (
                    <tr key={s?.id || Math.random()} className="hover:bg-slate-50/80 transition">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-700 text-center">{s?.rollNo}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-emerald-950">{examRegNo}</td>
                      <td className="py-2.5 px-3 font-mono font-medium text-slate-600">{s?.admissionNo}</td>
                      <td className="py-2.5 px-3">
                        <span className="font-bold text-slate-900 block">{s?.nameEn}</span>
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-emerald-950">
                        {attendedObtained} / {attendedMax}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-800">
                        {pctVal}%
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono text-slate-600">
                        {attDays} / {attTotal}
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold">
                        {isRankAwarded ? (
                          <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-50 text-emerald-900 border border-emerald-200 font-black">
                            Rank {rep.classRank}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono text-xs">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${resultBadgeColor}`}>
                          {displayResultStatus}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => setActiveSingleReport(rep)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 rounded-lg transition border border-emerald-300 cursor-pointer"
                        >
                          <Eye className="w-3 h-3" />
                          View Card
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-xs text-slate-500">
          <AlertCircle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="font-semibold text-slate-700">No marks recorded yet for this class & examination.</p>
          <p className="text-[11px] text-slate-400 mt-1">
            Ensure the teachers have submitted their mark sheets and the Principal has verified them.
          </p>
        </div>
      )}

      {/* Hidden Batch Print Container for multi-page PDF generation */}
      <div className="hidden">
        <div ref={batchPrintRef}>
          {safeReports.map((rep, idx) => (
            <div key={rep?.student?.id || idx} style={{ pageBreakAfter: 'always', padding: '20px' }}>
              <ProgressReportCard
                report={rep}
                settings={reportsData?.settings || settings!}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Exam Register Number Assignment Modal */}
      {showRegModal && selectedClassId && selectedExamId && (
        <ExamRegisterModal
          classId={selectedClassId}
          className={currentClass?.name || 'Class'}
          examinationId={selectedExamId}
          examinationName={currentExam ? (isMl ? currentExam.nameMl : currentExam.nameEn) : 'Examination'}
          onClose={() => setShowRegModal(false)}
          onSaved={() => fetchClassReports(selectedClassId, selectedExamId)}
        />
      )}
    </div>
  );
};
