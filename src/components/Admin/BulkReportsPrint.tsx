import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ClassItem, Examination, StudentProgressReport, InstitutionSettings, sortStudentsBoysFirst } from '../../types';
import { ProgressReportCard } from '../Report/ProgressReportCard';
import {
  Printer,
  Download,
  Eye,
  Table,
  Award,
  AlertCircle,
  FileText,
  Hash,
  Loader2,
  FileSpreadsheet,
  CheckCircle2,
} from 'lucide-react';
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
  const [viewMode, setViewMode] = useState<'bulk_cards' | 'ledger_table'>('bulk_cards');
  const [activeSingleReport, setActiveSingleReport] = useState<StudentProgressReport | null>(null);
  const [isBatchPrinting, setIsBatchPrinting] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [showRegModal, setShowRegModal] = useState(false);
  const bulkCardsContainerRef = useRef<HTMLDivElement>(null);

  const isMl = lang === 'ml';

  // Helper to ensure strictly English-only class names (e.g. "Class 1", "Class 2", "Class 3", etc.)
  const getEnglishClassName = (c: ClassItem): string => {
    if (c.numericGrade) {
      return `Class ${c.numericGrade}${c.division ? ` ${c.division}` : ''}`;
    }
    return c.name.replace(/[\u0D00-\u0D7F]+/g, '').replace(/[()]/g, '').trim() || 'Class';
  };

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

      const sortedC = [...cData].sort((a, b) => a.numericGrade - b.numericGrade);
      setClasses(sortedC);
      setExaminations(eData);
      setSettings(sData);

      const initialClassId = sortedC[0]?.id || '';
      const initialExamId = eData[0]?.id || '';
      setSelectedClassId(initialClassId);
      setSelectedExamId(initialExamId);

      if (initialClassId && initialExamId) {
        await fetchClassReports(initialClassId, initialExamId);
      }
    } catch (err) {
      console.error('Error loading initial report data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchClassReports = async (cId: string, eId: string): Promise<boolean> => {
    if (!cId || !eId) return false;
    setFetching(true);
    try {
      const res = await fetchWithAuth(`/api/reports/class/${cId}/exam/${eId}`);
      if (res.ok) {
        const data = await res.json();
        const rawReports: StudentProgressReport[] = Array.isArray(data.reports) ? data.reports : [];
        const safeReports = rawReports.filter(r => r && r.student);

        // Sort: Boys first, then alphabetical by student English name
        const sortedReports = [...safeReports].sort((a, b) => {
          const isGirlA = (a.student?.gender || 'M').toUpperCase().startsWith('F');
          const isGirlB = (b.student?.gender || 'M').toUpperCase().startsWith('F');
          if (isGirlA !== isGirlB) return isGirlA ? 1 : -1;
          return (a.student?.nameEn || '')
            .trim()
            .toLowerCase()
            .localeCompare((b.student?.nameEn || '').trim().toLowerCase());
        });

        setReportsData({
          reports: sortedReports,
          settings: data.settings || settings,
        });
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to load class reports:', err);
      return false;
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

  const handleLoadClassReportsClick = async () => {
    if (!selectedClassId || !selectedExamId) return;
    await fetchClassReports(selectedClassId, selectedExamId);
    setViewMode('bulk_cards');
  };

  const handleExportCsv = async () => {
    if (!selectedClassId || !selectedExamId) return;
    try {
      const res = await fetchWithAuth(
        `/api/export/class-results-csv?classId=${selectedClassId}&examId=${selectedExamId}`
      );
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
    // Ensure bulk cards view is active when printing all cards
    setViewMode('bulk_cards');
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const handleBatchPdfDownload = async () => {
    // If not in bulk cards view, switch to bulk cards view first
    if (viewMode !== 'bulk_cards') {
      setViewMode('bulk_cards');
      await new Promise(r => setTimeout(r, 200));
    }

    if (!bulkCardsContainerRef.current) return;
    const cardElements = bulkCardsContainerRef.current.querySelectorAll<HTMLElement>('.report-print-sheet');
    if (!cardElements || cardElements.length === 0) {
      alert('No report cards found to export.');
      return;
    }

    setIsBatchPrinting(true);
    setPdfProgress({ current: 0, total: cardElements.length });

    try {
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pdfWidth = pdf.internal.pageSize.getWidth(); // 210mm
      const pdfHeight = pdf.internal.pageSize.getHeight(); // 297mm

      for (let i = 0; i < cardElements.length; i++) {
        setPdfProgress({ current: i + 1, total: cardElements.length });
        const cardEl = cardElements[i];

        const canvas = await html2canvas(cardEl, {
          scale: 1.6,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.95);

        if (i > 0) {
          pdf.addPage('a4', 'portrait');
        }

        const margin = 4;
        const availWidth = pdfWidth - margin * 2;
        const availHeight = pdfHeight - margin * 2;
        const ratio = Math.min(availWidth / canvas.width, availHeight / canvas.height);
        const renderW = canvas.width * ratio;
        const renderH = canvas.height * ratio;
        const posX = (pdfWidth - renderW) / 2;
        const posY = (pdfHeight - renderH) / 2;

        pdf.addImage(imgData, 'JPEG', posX, posY, renderW, renderH, undefined, 'FAST');
      }

      const cName = getEnglishClassName(currentClass || ({ name: 'Class', numericGrade: 1 } as any)).replace(/\s+/g, '_');
      const eName = (currentExam?.nameEn || 'Exam').replace(/\s+/g, '_');
      pdf.save(`${cName}_${eName}_All_Progress_Reports.pdf`);
    } catch (err) {
      console.error('Batch PDF generation failed:', err);
      alert('Failed to compile batch PDF. Please use the Print option and choose "Save as PDF".');
    } finally {
      setIsBatchPrinting(false);
      setPdfProgress({ current: 0, total: 0 });
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-xs text-slate-500">Loading progress report center...</div>;
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
  const rawReports = (reportsData?.reports || []).filter(r => r && r.student);
  const safeReports = sortStudentsBoysFirst(
    rawReports.map(r => ({
      ...r,
      gender: r.student?.gender,
      nameEn: r.student?.nameEn,
      name: (r.student as any)?.name,
    }))
  ).map((r, idx) => ({
    ...r,
    student: {
      ...r.student,
      rollNo: idx + 1,
    },
  }));

  const sortedClasses = [...classes].sort((a, b) => a.numericGrade - b.numericGrade);
  const classLabelEnglish = currentClass ? getEnglishClassName(currentClass) : 'Class';

  return (
    <div className="space-y-6">
      {/* Top Banner & Title (Hidden in Print) */}
      <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            {classLabelEnglish} • Progress Reports & Examination Ledger
          </h2>
          <p className="text-xs text-slate-500">
            Full-class progress report cards formatted for single A4 page printing, batch PDF export, and examination result ledger.
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
              Assign Exam Reg Nos
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition shadow-2xs cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={handleBatchPdfDownload}
              disabled={isBatchPrinting}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {isBatchPrinting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-800" />
                  Generating PDF ({pdfProgress.current}/{pdfProgress.total})...
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5 text-emerald-800" />
                  Download Batch PDF
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handlePrintAll}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition shadow-xs cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Print All Cards
            </button>
          </div>
        )}
      </div>

      {/* Selector Controls (Hidden in Print) */}
      <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center gap-4 text-xs print:hidden">
        <div>
          <label className="block font-bold text-slate-700 mb-1">Select Class:</label>
          <select
            value={selectedClassId}
            onChange={e => handleClassChange(e.target.value)}
            className="p-2 border border-slate-300 rounded-xl bg-slate-50 font-bold text-slate-800 focus:outline-none cursor-pointer min-w-[140px]"
          >
            {sortedClasses.map(c => (
              <option key={c.id} value={c.id}>
                {getEnglishClassName(c)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block font-bold text-slate-700 mb-1">Select Examination:</label>
          <select
            value={selectedExamId}
            onChange={e => handleExamChange(e.target.value)}
            className="p-2 border border-slate-300 rounded-xl bg-slate-50 font-bold text-slate-800 focus:outline-none cursor-pointer min-w-[220px]"
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
            onClick={handleLoadClassReportsClick}
            disabled={fetching}
            className="px-4 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition shadow-xs disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
          >
            {fetching ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Loading Reports...
              </>
            ) : (
              <>
                <FileText className="w-3.5 h-3.5" />
                Load Class Reports
              </>
            )}
          </button>
        </div>

        {/* View Mode Switcher Toggle */}
        {safeReports.length > 0 && (
          <div className="pt-4 ml-auto flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setViewMode('bulk_cards')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                viewMode === 'bulk_cards'
                  ? 'bg-emerald-800 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Full-Class Cards ({safeReports.length})
            </button>
            <button
              onClick={() => setViewMode('ledger_table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                viewMode === 'ledger_table'
                  ? 'bg-emerald-800 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Table className="w-3.5 h-3.5" />
              Result Ledger Table
            </button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {safeReports.length > 0 ? (
        viewMode === 'bulk_cards' ? (
          /* ========================================================= */
          /* 1. FULL-CLASS BULK REPORT CARDS VIEW (A4 Print / PDF Engine) */
          /* ========================================================= */
          <div className="space-y-6">
            {/* Bulk Cards View Header Info Bar (Hidden in Print) */}
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs print:hidden">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-800 text-white flex items-center justify-center font-bold">
                  {safeReports.length}
                </div>
                <div>
                  <h3 className="font-bold text-emerald-950 text-sm">
                    {classLabelEnglish} — {currentExam?.nameEn}
                  </h3>
                  <p className="text-[11px] text-emerald-800/80">
                    Displaying all {safeReports.length} progress report cards in sequential order. Each student card is formatted strictly for a single A4 page.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleBatchPdfDownload}
                  disabled={isBatchPrinting}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  {isBatchPrinting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-800" />
                      Saving PDF...
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5 text-emerald-800" />
                      Download Batch PDF
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handlePrintAll}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition shadow-xs cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print All Cards
                </button>
              </div>
            </div>

            {/* List of Report Cards */}
            <div ref={bulkCardsContainerRef} className="space-y-8 print:space-y-0">
              {safeReports.map((rep, idx) => (
                <div
                  key={rep?.student?.id || idx}
                  className="report-card-print-container w-full flex flex-col items-center"
                >
                  {/* On-screen Student Header & Quick Card Actions (Strictly Hidden in Print) */}
                  <div className="w-full max-w-[820px] mb-2 flex items-center justify-between text-xs px-2 text-slate-500 font-semibold print:hidden">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-emerald-800 text-white flex items-center justify-center text-[11px] font-bold">
                        {idx + 1}
                      </span>
                      <span className="text-slate-900 font-bold text-sm">
                        {rep?.student?.nameEn}
                      </span>
                      <span className="text-slate-400 font-mono text-xs">
                        (Roll: {rep?.student?.rollNo} • Adm: {rep?.student?.admissionNo} • Reg: {rep.examRegisterNo || rep.student?.rollNo || '—'})
                      </span>
                    </div>

                    <button
                      onClick={() => setActiveSingleReport(rep)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 rounded-lg transition border border-emerald-300 cursor-pointer"
                    >
                      <Eye className="w-3 h-3" />
                      Inspect / Print Single
                    </button>
                  </div>

                  {/* The A4 Progress Report Card */}
                  <ProgressReportCard
                    report={rep}
                    settings={reportsData?.settings || settings!}
                    hideToolbar={true}
                    isBatchItem={true}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* ========================================================= */
          /* 2. SPREADSHEET-STYLE RESULT LEDGER TABLE VIEW             */
          /* ========================================================= */
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {classLabelEnglish} Result Ledger ({safeReports.length} Students)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Dense Ranking: ties share identical rank without skipping (1, 1, 2…); students with TE &lt; 35% require improvement.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-100 text-emerald-900 rounded-lg">
                  {currentExam?.nameEn}
                </span>
                <button
                  onClick={() => setViewMode('bulk_cards')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-xl transition cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" />
                  View All Cards
                </button>
              </div>
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

                    const attendedObtained = rep.attendedObtainedMarks ?? rep.totalObtainedMarks ?? 0;
                    const attendedMax = rep.attendedMaxMarks ?? rep.totalMaxMarks ?? 0;

                    const pctVal =
                      attendedMax > 0
                        ? ((attendedObtained / attendedMax) * 100).toFixed(2)
                        : rep.percentage !== null && rep.percentage !== undefined
                        ? rep.percentage.toFixed(2)
                        : '0.00';

                    const isRankAwarded =
                      rep.resultStatus === 'Passed' &&
                      !rep.hasAbsentSubjects &&
                      !rep.hasWithheldCe &&
                      rep.classRank !== null;

                    let resultBadgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-200';
                    let displayResultStatus: string =
                      rep.resultStatus === 'Needs Improvement' ? 'Need Improvement' : rep.resultStatus;

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
        )
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-xs text-slate-500">
          <AlertCircle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="font-semibold text-slate-700">No marks recorded yet for {classLabelEnglish} & {currentExam?.nameEn}.</p>
          <p className="text-[11px] text-slate-400 mt-1">
            Click "Load Class Reports" above or select another class and examination.
          </p>
        </div>
      )}

      {/* Exam Register Number Assignment Modal */}
      {showRegModal && selectedClassId && selectedExamId && (
        <ExamRegisterModal
          classId={selectedClassId}
          className={classLabelEnglish}
          examinationId={selectedExamId}
          examinationName={currentExam ? (isMl ? currentExam.nameMl : currentExam.nameEn) : 'Examination'}
          onClose={() => setShowRegModal(false)}
          onSaved={() => fetchClassReports(selectedClassId, selectedExamId)}
        />
      )}
    </div>
  );
};
