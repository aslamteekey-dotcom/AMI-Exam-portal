import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ClassItem, Examination, StudentProgressReport, InstitutionSettings, sortStudentsBoysFirst } from '../../types';
import { ProgressReportCard } from '../Report/ProgressReportCard';
import { computeClassLedgerRankings, calculateStudentReportMetrics } from '../../utils/reportCalculations';
import { handleHorizontalWheel } from '../../hooks/useHorizontalScroll';
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
  const [viewMode, setViewMode] = useState<'bulk_cards' | 'ledger_table'>('ledger_table');
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
        // Strict deduplication by admissionNo or id
        const uniqueReports = Array.from(
          new Map(safeReports.map(r => [r.student.admissionNo?.toString() || r.student.id, r])).values()
        );

        // Sort: Boys first, then alphabetical by student English name
        const sortedReports = [...uniqueReports].sort((a, b) => {
          const isGirlA = (a.student?.gender || 'M').toUpperCase().startsWith('F');
          const isGirlB = (b.student?.gender || 'M').toUpperCase().startsWith('F');
          if (isGirlA !== isGirlB) return isGirlA ? 1 : -1;
          return (a.student?.nameEn || '')
            .trim()
            .toLowerCase()
            .localeCompare((b.student?.nameEn || '').trim().toLowerCase());
        }).map((r, idx) => ({
          ...r,
          student: {
            ...r.student,
            rollNo: idx + 1,
          },
        }));

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

  const selectedClassIdRef = useRef(selectedClassId);
  const selectedExamIdRef = useRef(selectedExamId);
  selectedClassIdRef.current = selectedClassId;
  selectedExamIdRef.current = selectedExamId;

  // Run initial data loading strictly once on mount
  useEffect(() => {
    loadInitial();
  }, []);

  // Dynamically re-fetch reports whenever selected class or exam changes
  useEffect(() => {
    if (selectedClassId && selectedExamId) {
      fetchClassReports(selectedClassId, selectedExamId);
    }
  }, [selectedClassId, selectedExamId]);

  // Listen to background student updates and refresh current class
  useEffect(() => {
    const handleStudentsUpdated = () => {
      if (selectedClassIdRef.current && selectedExamIdRef.current) {
        fetchClassReports(selectedClassIdRef.current, selectedExamIdRef.current);
      }
    };
    window.addEventListener('madrasa_students_updated', handleStudentsUpdated);
    return () => {
      window.removeEventListener('madrasa_students_updated', handleStudentsUpdated);
    };
  }, []);

  const currentClass = classes.find(
    c =>
      c.id === selectedClassId ||
      String(c.numericGrade) === selectedClassId ||
      String(c.numericGrade) === selectedClassId.replace(/\D/g, '') ||
      c.name.toLowerCase().trim() === selectedClassId.toLowerCase().trim()
  );
  const currentExam = examinations.find(e => e.id === selectedExamId);

  const rawReports = useMemo(() => {
    return (reportsData?.reports || []).filter(r => r && r.student);
  }, [reportsData?.reports]);

  const safeReports = useMemo(() => {
    return sortStudentsBoysFirst(
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
  }, [rawReports]);

  // Determine consistent total maximum marks for the class (e.g. 8 subjects * 50 = 400)
  const classTotalExpectedMax = useMemo(() => {
    return safeReports.reduce((max, r) => {
      const subSum = (r.subjects || []).reduce((sum, s) => sum + (s.maxMarks || 50), 0);
      return Math.max(max, subSum);
    }, 0) || 400;
  }, [safeReports]);

  // Unify calculation metrics and dense ranking using shared engine
  const classLedgerRankings = useMemo(() => {
    return computeClassLedgerRankings(safeReports, classTotalExpectedMax);
  }, [safeReports, classTotalExpectedMax]);

  // Synchronize reports with exact class ledger ranking metrics
  const enrichedReports = useMemo(() => {
    return safeReports.map(rep => {
      const s = rep.student;
      const rankData = classLedgerRankings.get(s?.id || '') || (s?.admissionNo ? classLedgerRankings.get(s.admissionNo) : undefined);
      const metrics = rankData?.metrics || calculateStudentReportMetrics(rep, classTotalExpectedMax);
      return {
        ...rep,
        classRank: rankData?.rank ?? null,
        denseRankText: rankData?.denseRankText || (metrics.displayResultStatus === 'Passed' ? 'Passed' : metrics.displayResultStatus),
        resultStatus: metrics.displayResultStatus as any,
        totalObtainedMarks: metrics.displayGrandObtained,
        attendedObtainedMarks: metrics.displayGrandObtained,
        totalMaxMarks: classTotalExpectedMax,
        attendedMaxMarks: metrics.grandAttendedMax > 0 ? metrics.grandAttendedMax : classTotalExpectedMax,
        percentage: Number(metrics.percentageStr) || 0,
        hasAbsentSubjects: metrics.hasAbsent,
        hasWithheldCe: metrics.hasWithheld,
        attendance: {
          daysAttended: metrics.attendanceDays,
          totalWorkingDays: metrics.attendanceTotal,
        },
      };
    });
  }, [safeReports, classLedgerRankings, classTotalExpectedMax]);

  const handleClassChange = (cId: string) => {
    setSelectedClassId(cId);
    selectedClassIdRef.current = cId;
    // Explicit requirement: Set default view strictly to Result Ledger Table
    setViewMode('ledger_table');
    const examToUse = selectedExamId || selectedExamIdRef.current || (examinations[0]?.id || '');
    if (examToUse) {
      fetchClassReports(cId, examToUse);
    }
  };

  const setSelectedClass = (cId: string) => {
    handleClassChange(cId);
  };

  const handleExamChange = (eId: string) => {
    setSelectedExamId(eId);
    selectedExamIdRef.current = eId;
    // Explicit requirement: Set default view strictly to Result Ledger Table
    setViewMode('ledger_table');
    const classToUse = selectedClassId || selectedClassIdRef.current || (classes[0]?.id || '');
    if (classToUse) {
      fetchClassReports(classToUse, eId);
    }
  };

  const handleLoadClassReportsClick = async () => {
    if (!selectedClassId || !selectedExamId) return;
    await fetchClassReports(selectedClassId, selectedExamId);
    // Explicit requirement: Render "Result Ledger Table" first by default
    setViewMode('ledger_table');
  };

  const handleExportCsv = () => {
    if (!enrichedReports.length) return;
    let csv = 'Roll No,Exam Reg No,Admission No,Student Name,Marks Obtained,Total Max,Percentage,Attendance,Dense Rank,Result Status\n';
    enrichedReports.forEach(rep => {
      const s = rep.student;
      const rankData = classLedgerRankings.get(s?.id || '') || (s?.admissionNo ? classLedgerRankings.get(s.admissionNo) : undefined);
      const metrics = rankData?.metrics || calculateStudentReportMetrics(rep, classTotalExpectedMax);
      const examRegNo =
        (s as any)?.examRegisterNos?.[selectedExamId] ||
        (s as any)?.examRegNo ||
        (s as any)?.regNo ||
        s?.examRegisterNumbers?.[selectedExamId] ||
        rep.examRegisterNo ||
        '-';
      const rankStr = rankData?.isRankAwarded && rankData.rank !== null
        ? `Rank ${rankData.rank}`
        : (metrics.displayResultStatus === 'Absent' ? 'Absent' : (metrics.displayResultStatus === 'Withheld' ? 'Withheld' : '—'));
      csv += `${s?.rollNo || ''},"${examRegNo}","${s?.admissionNo || ''}","${s?.nameEn || ''}",${metrics.displayGrandObtained},${classTotalExpectedMax},"${metrics.percentageStr}%","${metrics.attendanceDays}/${metrics.attendanceTotal}","${rankStr}","${metrics.displayResultStatus}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const cName = getEnglishClassName(currentClass || ({ name: 'Class', numericGrade: 1 } as any)).replace(/\s+/g, '_');
    const eName = (currentExam?.nameEn || 'Exam').replace(/\s+/g, '_');
    link.download = `${cName}_${eName}_Result_Ledger.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const handlePrintAll = () => {
    // Ensure bulk cards view is active when printing all cards
    setViewMode('bulk_cards');
    setTimeout(() => {
      window.print();
    }, 250);
  };

  const handleBatchPdfDownload = async () => {
    // 1. Ensure bulk cards view is active so cards are present in DOM
    if (viewMode !== 'bulk_cards') {
      setViewMode('bulk_cards');
    }

    setIsBatchPrinting(true);
    setPdfProgress({ current: 0, total: enrichedReports.length });

    try {
      // Allow DOM to update and render student cards
      let cardElements: HTMLElement[] = [];
      let attempts = 0;
      while (attempts < 20) {
        await new Promise(r => setTimeout(r, 120));
        const elements = document.querySelectorAll<HTMLElement>('.report-print-sheet');
        if (elements && elements.length > 0) {
          cardElements = Array.from(elements);
          break;
        }
        attempts++;
      }

      if (cardElements.length === 0) {
        throw new Error('No printable report cards found in DOM');
      }

      setPdfProgress({ current: 0, total: cardElements.length });

      // Initialize pure jsPDF for A4 portrait batch compilation
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pdfWidth = pdf.internal.pageSize.getWidth(); // 210mm
      const pdfHeight = pdf.internal.pageSize.getHeight(); // 297mm

      // Sequentially rasterize each student card container with scale: 2
      for (let i = 0; i < cardElements.length; i++) {
        setPdfProgress({ current: i + 1, total: cardElements.length });
        const cardEl = cardElements[i];

        const canvas = await html2canvas(cardEl, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          allowTaint: true,
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.95);

        // Subsequent cards start on a fresh page
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
      console.warn('Client batch PDF compilation encountered an issue. Gracefully triggering print fallback:', err);
      // Fallback Print Route:
      // Gracefully trigger window.print() targeting isolated printable cards layout with @media print { page-break-after: always; }
      setViewMode('bulk_cards');
      setTimeout(() => {
        window.print();
      }, 350);
    } finally {
      setIsBatchPrinting(false);
      setPdfProgress({ current: 0, total: 0 });
    }
  };

  const sortedClasses = [...classes].sort((a, b) => a.numericGrade - b.numericGrade);
  const classLabelEnglish = currentClass ? getEnglishClassName(currentClass) : 'Class';
  const selectedClass = selectedClassId;

  if (loading) {
    return <div className="text-center py-12 text-xs text-slate-500">Loading progress report center...</div>;
  }

  // Single report detailed inspection
  if (activeSingleReport && reportsData) {
    const singleEnriched = enrichedReports.find(
      r => r.student?.id === activeSingleReport.student?.id || r.student?.admissionNo === activeSingleReport.student?.admissionNo
    ) || activeSingleReport;
    return (
      <ProgressReportCard
        report={singleEnriched}
        settings={reportsData.settings || settings!}
        onBack={() => setActiveSingleReport(null)}
      />
    );
  }

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
              onClick={() => setViewMode('bulk_cards')}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition shadow-xs cursor-pointer border ${
                viewMode === 'bulk_cards'
                  ? 'bg-emerald-100 text-emerald-950 border-emerald-400'
                  : 'text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border-emerald-300'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-emerald-700" />
              View All Cards
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
            value={selectedClassId || selectedClass}
            onChange={e => setSelectedClass(e.target.value)}
            className="p-2 border border-slate-300 rounded-xl bg-slate-50 font-bold text-slate-800 focus:outline-none cursor-pointer min-w-[140px]"
          >
            {sortedClasses.map(cls => (
              <option key={cls.id} value={cls.id}>
                {getEnglishClassName(cls)}
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

        {/* View Mode Switcher Toggle: Result Ledger Table first by default */}
        {safeReports.length > 0 && (
          <div className="pt-4 ml-auto flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
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
            <button
              onClick={() => setViewMode('bulk_cards')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                viewMode === 'bulk_cards'
                  ? 'bg-emerald-800 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Full-Class Cards ({enrichedReports.length})
            </button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {enrichedReports.length > 0 ? (
        viewMode === 'bulk_cards' ? (
          /* ========================================================= */
          /* 1. FULL-CLASS BULK REPORT CARDS VIEW (A4 Print / PDF Engine) */
          /* ========================================================= */
          <div className="space-y-6">
            {/* Bulk Cards View Header Info Bar (Hidden in Print) */}
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs print:hidden">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-800 text-white flex items-center justify-center font-bold">
                  {enrichedReports.length}
                </div>
                <div>
                  <h3 className="font-bold text-emerald-950 text-sm">
                    {classLabelEnglish} — {currentExam?.nameEn}
                  </h3>
                  <p className="text-[11px] text-emerald-800/80">
                    Displaying all {enrichedReports.length} progress report cards in sequential order. Each student card is formatted strictly for a single A4 page.
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
                  className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition shadow-xs cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print All Cards
                </button>
              </div>
            </div>

            {/* List of Report Cards */}
            <div ref={bulkCardsContainerRef} className="space-y-8 print:space-y-0">
              {enrichedReports.map((rep, idx) => (
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
                  {classLabelEnglish} Result Ledger ({enrichedReports.length} Students)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Dense Ranking: ties share identical rank without skipping (1, 1, 2…); students with TE &lt; 35% require improvement.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-100 text-emerald-900 rounded-lg">
                  {currentExam?.nameEn}
                </span>
              </div>
            </div>

            <div
              onWheel={handleHorizontalWheel}
              className="overflow-x-auto relative w-full scrollbar-thin"
            >
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-100 z-30">
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <th className="py-2.5 px-3 w-12 text-center sticky left-0 bg-slate-100 z-40 shadow-[1px_0_0_0_#e5e7eb]">Roll</th>
                    <th className="py-2.5 px-3 sticky left-12 bg-slate-100 z-40 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] min-w-[180px] md:min-w-[220px]">Student Name</th>
                    <th className="py-2.5 px-2 w-20 text-center font-mono">Reg No</th>
                    <th className="py-2.5 px-2 w-20 text-center font-mono">Adm No</th>
                    <th className="py-2.5 px-3 text-center whitespace-nowrap">Marks Obtained</th>
                    <th className="py-2.5 px-3 text-center whitespace-nowrap">Percentage</th>
                    <th className="py-2.5 px-3 text-center whitespace-nowrap">Attendance</th>
                    <th className="py-2.5 px-3 text-center whitespace-nowrap">Dense Rank</th>
                    <th className="py-2.5 px-3 text-center whitespace-nowrap">Result Status</th>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {enrichedReports.map(rep => {
                    const s = rep?.student;
                    const rankData = classLedgerRankings.get(s?.id || '') || (s?.admissionNo ? classLedgerRankings.get(s.admissionNo) : undefined);
                    const metrics = rankData?.metrics || calculateStudentReportMetrics(rep, classTotalExpectedMax);
                    const examRegNo =
                      (s as any)?.examRegisterNos?.[selectedExamId] ||
                      (s as any)?.examRegNo ||
                      (s as any)?.regNo ||
                      s?.examRegisterNumbers?.[selectedExamId] ||
                      rep.examRegisterNo ||
                      '-';

                    return (
                      <tr key={s?.id || Math.random()} className="hover:bg-slate-50/80 transition group">
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-700 text-center w-12 sticky left-0 bg-white group-hover:bg-slate-50 z-20 shadow-[1px_0_0_0_#e5e7eb]">
                          {s?.rollNo}
                        </td>
                        <td className="py-2.5 px-3 sticky left-12 bg-white group-hover:bg-slate-50 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] min-w-[180px] md:min-w-[220px]">
                          <span className="font-bold text-slate-900 block">{s?.nameEn}</span>
                          {s?.nameMl && (
                            <span className="text-[11px] text-slate-500 font-ml block leading-tight">
                              {s.nameMl}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 font-mono font-bold text-emerald-950 w-20 text-center">
                          {examRegNo}
                        </td>
                        <td className="py-2.5 px-2 font-mono font-medium text-slate-600 w-20 text-center">
                          {s?.admissionNo}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-emerald-950 whitespace-nowrap">
                          {metrics.displayGrandObtained} / {classTotalExpectedMax}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-800 whitespace-nowrap">
                          {metrics.percentageStr}%
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono text-slate-600 whitespace-nowrap">
                          {metrics.attendanceDays} / {metrics.attendanceTotal}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold whitespace-nowrap">
                          {rankData?.isRankAwarded && rankData.rank !== null ? (
                            <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-50 text-emerald-900 border border-emerald-200 font-black">
                              Rank {rankData.rank}
                            </span>
                          ) : (
                            <span className="text-slate-400 font-mono text-xs">
                              {metrics.displayResultStatus === 'Absent'
                                ? 'Absent'
                                : (metrics.displayResultStatus === 'Withheld' ? 'Withheld' : '—')}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${metrics.resultBadgeColor}`}>
                            {metrics.displayResultStatus}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
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

      {/* Batch PDF Export Progress Indicator Overlay */}
      {isBatchPrinting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 mx-auto flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Compiling Batch PDF</h3>
              <p className="text-xs text-emerald-800 font-bold mt-1">
                Generating PDF (Card {pdfProgress.current} of {pdfProgress.total})...
              </p>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-emerald-700 h-full transition-all duration-300"
                style={{
                  width: `${pdfProgress.total > 0 ? (pdfProgress.current / pdfProgress.total) * 100 : 5}%`,
                }}
              />
            </div>
            <p className="text-[11px] text-slate-400">
              Rasterizing individual A4 student cards with high-definition vector scaling.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
