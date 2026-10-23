import React, { useRef, useState, useEffect } from 'react';
import { StudentProgressReport, InstitutionSettings } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { Printer, Download, Award, GraduationCap, ShieldAlert, AlertTriangle } from 'lucide-react';
import html2pdf from 'html2pdf.js';
import { extractComponentColumns, calculateStudentReportMetrics } from '../../utils/reportCalculations';
import { collection, doc } from 'firebase/firestore';
import { db, safeOnSnapshot, isFirestoreQuotaExhausted } from '../../services/firebase';

interface Props {
  report: StudentProgressReport;
  settings: InstitutionSettings;
  onBack?: () => void;
  hideToolbar?: boolean;
  isBatchItem?: boolean;
}

export const ProgressReportCard: React.FC<Props> = ({
  report,
  settings,
  onBack,
  hideToolbar = false,
  isBatchItem = false,
}) => {
  const { lang, t, fetchWithAuth } = useAuth();
  const reportRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [currentSettings, setCurrentSettings] = useState<InstitutionSettings>(settings);

  useEffect(() => {
    if (settings) {
      setCurrentSettings(settings);
    }
  }, [settings]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(prev => (prev === msg ? null : prev));
    }, 4500);
  };

  // Globally fetch settings & listen to updates so Admin settings, address, reg no, Principal name dynamically reflect
  useEffect(() => {
    if (isBatchItem) return;
    let isMounted = true;
    const fetchFreshSettings = async () => {
      try {
        const res = await (fetchWithAuth ? fetchWithAuth('/api/settings') : fetch('/api/settings'));
        if (res.ok) {
          const fresh = await res.json();
          if (fresh && isMounted) {
            setCurrentSettings(prev => ({ ...prev, ...fresh }));
          }
        }
      } catch (err) {
        console.warn('Error fetching fresh settings in ProgressReportCard:', err);
      }
    };

    fetchFreshSettings();

    // Real-time Firestore settings collection listener
    let unsubFirestore: (() => void) | undefined;
    if (!isFirestoreQuotaExhausted()) {
      try {
        unsubFirestore = safeOnSnapshot(collection(db, 'settings'), (snapshot) => {
          if (!snapshot.empty && isMounted) {
            let merged: any = {};
            snapshot.docs.forEach(d => {
              merged = { ...merged, ...d.data() };
            });
            if (Object.keys(merged).length > 0) {
              setCurrentSettings(prev => ({ ...prev, ...merged }));
            }
          }
        });
      } catch (e) {
        console.warn('Settings onSnapshot error in ProgressReportCard:', e);
      }
    }

    const handleSettingsUpdated = (e: any) => {
      if (!isMounted) return;
      if (e?.detail) {
        setCurrentSettings(prev => ({ ...prev, ...e.detail }));
      } else {
        fetchFreshSettings();
      }
    };

    window.addEventListener('madrasa_settings_updated', handleSettingsUpdated);
    return () => {
      isMounted = false;
      if (unsubFirestore) unsubFirestore();
      window.removeEventListener('madrasa_settings_updated', handleSettingsUpdated);
    };
  }, [isBatchItem]);

  // Strictly English class name (e.g., "Class 7", strip any Malayalam text)
  const cleanClassName = (report?.classNameEn || 'Class')
    .replace(/\s*\(.*?\)\s*/g, '')
    .replace(/[\u0D00-\u0D7F]+/g, '')
    .trim();

  // Numeral value for class field (e.g., label "Class:", value "7")
  const classNumeral = cleanClassName.replace(/[^0-9]/g, '') || cleanClassName || '—';

  // Dynamically resolve Class In-charge Teacher name
  const [teacherName, setTeacherName] = useState<string>(
    report?.classTeacherName || (report as any)?.classInChargeName || ''
  );

  useEffect(() => {
    if (report?.classTeacherName && report.classTeacherName !== 'Class In-Charge') {
      setTeacherName(report.classTeacherName);
      return;
    }
    if (isBatchItem) return;
    let isMounted = true;
    const fetchTeacher = async () => {
      try {
        const res = await (fetchWithAuth ? fetchWithAuth('/api/teachers') : fetch('/api/teachers'));
        if (res.ok) {
          const teachers: any[] = await res.json();
          if (Array.isArray(teachers) && isMounted) {
            const classId = report?.student?.classId;
            const cleanNum = cleanClassName.replace(/[^0-9]/g, '');
            const match = teachers.find(
              t =>
                (classId && t.inChargeClassId === classId) ||
                (cleanNum && t.inChargeClassId === `cls_${cleanNum}`) ||
                (t.inChargeClassId && report?.classNameEn && report.classNameEn.toLowerCase().includes(t.inChargeClassId.toLowerCase()))
            );
            if (match) {
              setTeacherName(match.name || match.nameEn);
            } else {
              const assigned = teachers.find(
                t => Array.isArray(t.assignments) && t.assignments.some((a: any) => a.classId === classId || a.classId === `cls_${cleanNum}`)
              );
              if (assigned) {
                setTeacherName(assigned.name || assigned.nameEn);
              }
            }
          }
        }
      } catch (e) {
        console.warn('Failed to load teachers for class teacher signature:', e);
      }
    };
    fetchTeacher();
    return () => {
      isMounted = false;
    };
  }, [report?.student?.classId, report?.classNameEn, report?.classTeacherName, cleanClassName]);

  const resolvedTeacherDisplayName =
    teacherName && teacherName !== 'Class In-Charge'
      ? teacherName
      : report?.classTeacherName && report.classTeacherName !== 'Class In-Charge'
      ? report.classTeacherName
      : 'Abdul Rahman';

  // CRITICAL SAFE GUARD (ELIMINATE WHITE SCREEN / CRASH)
  if (!report || !report.student) {
    return null;
  }

  const isMl = lang === 'ml';

  const isMobileDevice = () => {
    if (typeof window === 'undefined') return false;
    const ua = navigator.userAgent || '';
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    const isSmallScreen = window.innerWidth <= 768;
    return isMobileUA || isSmallScreen;
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    if (!reportRef.current) return;

    // 1. Mobile devices: Instead of throwing raw failure alert when memory is low,
    // smoothly trigger window.print() directly with quick toast guidance
    if (isMobileDevice()) {
      showToast("Opening Print dialog... Select 'Save as PDF'");
      setTimeout(() => {
        window.print();
      }, 350);
      return;
    }

    // 2. Desktop / supported browsers: Update html2pdf configuration
    setIsExporting(true);
    try {
      const element = reportRef.current;
      const studentName = report?.student?.nameEn?.replace(/[^a-zA-Z0-9_-]/g, '_') || 'Student';
      const opt = {
        margin: 0,
        filename: `${studentName}_Report.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, scrollY: 0 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
      };

      await html2pdf().set(opt).from(element).save();
    } catch (err) {
      console.warn('html2pdf generation error, falling back smoothly to Print dialog:', err);
      showToast("Opening Print dialog... Select 'Save as PDF'");
      setTimeout(() => {
        window.print();
      }, 350);
    } finally {
      setIsExporting(false);
    }
  };

  // Helper alias to keep compatibility
  const extractColumns = extractComponentColumns;

  // Unify calculation metrics using shared engine
  const metrics = calculateStudentReportMetrics(report);
  const displayGrandObtained = metrics.displayGrandObtained;
  const displayGrandMax = metrics.displayGrandMax;
  const calculatedPercentage = metrics.percentageStr;
  const attendanceDays = metrics.attendanceDays;
  const attendanceTotal = metrics.attendanceTotal;

  // Exam Register Number (supports multi-portal cloud sync across schema variations)
  const examRegisterNo =
    (report.student as any)?.examRegisterNos?.[report.examination?.id] ||
    (report.student as any)?.examRegNo ||
    (report.student as any)?.regNo ||
    report.student?.examRegisterNumbers?.[report.examination?.id] ||
    report.examRegisterNo ||
    report.student?.rollNo ||
    '—';

  // Academic Rank Box logic:
  // Rank is awarded ONLY if all subjects are Passed, with zero withheld subjects and zero absences.
  // Otherwise, show "Need Improvement", "Withheld", or "Absent".
  let academicRankBoxText = 'Passed';
  if (metrics.hasAbsent || report.hasAbsentSubjects || report.resultStatus === 'Absent') {
    academicRankBoxText = 'Absent';
  } else if (metrics.hasWithheld || report.hasWithheldCe || report.resultStatus === 'Withheld') {
    academicRankBoxText = 'Withheld';
  } else if (metrics.hasFailedWritten || report.resultStatus === 'Need Improvement' || report.resultStatus === 'Needs Improvement') {
    academicRankBoxText = 'Need Improvement';
  } else if (report.classRank !== null && report.classRank !== undefined) {
    academicRankBoxText = `Rank ${report.classRank}`;
  } else if (report.denseRankText && report.denseRankText.startsWith('Rank')) {
    academicRankBoxText = report.denseRankText;
  } else {
    academicRankBoxText = metrics.displayResultStatus === 'Passed' ? 'Passed' : metrics.displayResultStatus;
  }

  return (
    <div className={hideToolbar ? '' : 'space-y-6'}>
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-emerald-950 text-white text-xs sm:text-sm font-semibold px-5 py-3 rounded-2xl shadow-2xl border border-emerald-500/40 flex items-center gap-3 no-print">
          <Printer className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Embedded Print Styles for Guaranteed Single-Page A4 Precision */}
      <style>{`
        @page {
          size: A4 portrait;
          margin: 8mm 10mm;
        }
        @media print {
          html, body {
            width: 210mm !important;
            height: 297mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          nav, header, footer, .no-print, button, .parent-nav, .print\\:hidden, aside {
            display: none !important;
          }
          .printable-progress-card {
            width: 100% !important;
            max-width: 190mm !important;
            min-height: 275mm !important;
            margin: 0 auto !important;
            padding: 12px 16px !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            page-break-after: avoid !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            box-sizing: border-box !important;
          }
        }
      `}</style>

      {/* Top Action Toolbar (Hidden in Print & in Batch View) */}
      {!hideToolbar && (
        <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs print:hidden no-print">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
              >
                ← {t.back}
              </button>
            )}
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                {report?.student?.nameEn || (report?.student as any)?.name || 'Student'}
              </h3>
              <p className="text-xs text-slate-500 font-mono">
                {report?.classNameEn} • Exam Register No: {examRegisterNo} • Adm: {report?.student?.admissionNo}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPdf}
              disabled={isExporting}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl shadow-xs transition disabled:opacity-50 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              {isExporting ? 'Generating PDF...' : 'Download PDF'}
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              {t.printReport}
            </button>
          </div>
        </div>
      )}

      {/* Progress Report Sheet - A4 Document Container */}
      <div className="overflow-x-auto flex justify-center pb-8 print:p-0 print:m-0 print:pb-0 print:overflow-visible print:block">
        <div
          ref={reportRef}
          id="report-print-sheet"
          className="report-print-sheet printable-progress-card w-full max-w-[820px] bg-white text-slate-900 border-2 border-emerald-900/30 p-3.5 sm:p-6 md:p-8 shadow-lg print:shadow-none print:border-none print:p-0 font-sans relative"
          style={{ minHeight: isBatchItem ? undefined : '920px' }}
        >
          {/* Subtle Islamic Geometric Corner Motifs */}
          <div className="absolute top-3 left-3 text-emerald-800/25 text-xs font-serif select-none pointer-events-none print:hidden">
            ❖ ❖ ❖
          </div>
          <div className="absolute top-3 right-3 text-emerald-800/25 text-xs font-serif select-none pointer-events-none print:hidden">
            ❖ ❖ ❖
          </div>
          <div className="absolute bottom-3 left-3 text-emerald-800/25 text-xs font-serif select-none pointer-events-none print:hidden">
            ❖ ❖ ❖
          </div>
          <div className="absolute bottom-3 right-3 text-emerald-800/25 text-xs font-serif select-none pointer-events-none print:hidden">
            ❖ ❖ ❖
          </div>

          <div>
            {/* 1. INSTITUTION HEADER */}
            <div className="text-center border-b-2 border-emerald-800 pb-3 mb-3 print:pb-1.5 print:mb-1.5 flex flex-col items-center">
              <div
                className="font-serif text-emerald-900 text-base sm:text-lg md:text-xl print:text-base font-bold tracking-wide mb-1.5 print:mb-0.5 text-center leading-relaxed"
                dir="rtl"
              >
                {currentSettings?.madrasaArabicHeader || 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ'}
              </div>
              <div className="flex flex-col items-center justify-center gap-1.5 my-1.5 text-center w-full">
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full border-2 border-emerald-800 bg-emerald-50 flex items-center justify-center text-emerald-800 shadow-inner shrink-0 mb-0.5">
                  <GraduationCap className="w-6 h-6 sm:w-7 sm:h-7" />
                </div>
                <div className="text-center flex flex-col items-center w-full">
                  <h1 className="text-base sm:text-lg md:text-xl print:text-lg font-black uppercase tracking-tight text-emerald-950 font-title leading-tight text-center">
                    {currentSettings?.madrasaNameEn || 'Al-Madrasathul Islamiya Pallikkuth'}
                  </h1>
                  <h2 className="text-base sm:text-lg print:text-base font-bold text-emerald-900 leading-snug mt-1 font-ml text-center">
                    {currentSettings?.madrasaNameMl || 'അൽ മദ്റസത്തുൽ ഇസ്ലാമിയ്യ പള്ളിക്കുത്ത്'}
                  </h2>
                </div>
              </div>
              {((isMl ? (currentSettings?.locationMl || currentSettings?.locationEn) : (currentSettings?.locationEn || currentSettings?.locationMl)) || currentSettings?.registrationNo) && (
                <p className="text-[11px] sm:text-xs text-slate-600 mt-1 flex flex-wrap items-center justify-center gap-1 sm:gap-2 text-center">
                  {(isMl ? (currentSettings?.locationMl || currentSettings?.locationEn) : (currentSettings?.locationEn || currentSettings?.locationMl)) && (
                    <span>{isMl ? (currentSettings?.locationMl || currentSettings?.locationEn) : (currentSettings?.locationEn || currentSettings?.locationMl)}</span>
                  )}
                  {((isMl ? (currentSettings?.locationMl || currentSettings?.locationEn) : (currentSettings?.locationEn || currentSettings?.locationMl)) && currentSettings?.registrationNo) && (
                    <span className="hidden sm:inline">•</span>
                  )}
                  {currentSettings?.registrationNo && (
                    <span>Reg. / Affiliation No: {currentSettings.registrationNo}</span>
                  )}
                </p>
              )}

              <div className="mt-2 inline-block bg-emerald-900 text-white px-3 sm:px-5 py-1 rounded-md font-bold text-[10px] sm:text-xs tracking-wider uppercase shadow-xs">
                STUDENT PROGRESS REPORT • {report?.academicYear || '2026–2027'}
              </div>
              <div className="text-xs sm:text-sm font-bold text-emerald-950 mt-1">
                {isMl ? report?.examination?.nameMl : report?.examination?.nameEn}
              </div>
            </div>

            {/* 2. DEDICATED STUDENT DETAILS BOX - Clean Grid Layout with Soft Styling & Visual Hierarchy */}
            <div className="bg-emerald-50/50 border border-emerald-900/25 rounded-2xl p-3.5 sm:p-4 mb-4 print:p-2.5 print:mb-2 text-xs shadow-2xs">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-y-3 gap-x-4 items-start">
                {/* Student Name */}
                <div className="col-span-2 sm:col-span-1 md:col-span-1 space-y-0.5 text-left">
                  <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-emerald-800/80 block">
                    Student Name
                  </span>
                  <span className="font-black text-slate-950 text-sm sm:text-base print:text-[10pt] block leading-snug uppercase tracking-tight">
                    {(report?.student?.nameEn || (report?.student as any)?.name || '—').toUpperCase()}
                  </span>
                  {report?.student?.nameMl && (
                    <span className="text-xs font-semibold text-emerald-900 block leading-tight font-ml">
                      {report.student.nameMl}
                    </span>
                  )}
                </div>

                {/* Parent */}
                <div className="space-y-0.5 text-left">
                  <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-emerald-800/80 block">
                    Parent / Guardian
                  </span>
                  <span className="font-bold text-slate-900 text-xs sm:text-sm print:text-[9.5pt] block uppercase tracking-tight">
                    {(report?.student?.parentNameEn || '—').toUpperCase()}
                  </span>
                  {report?.student?.parentNameMl && (
                    <span className="text-[11px] text-slate-600 block leading-tight font-ml">
                      {report.student.parentNameMl}
                    </span>
                  )}
                </div>

                {/* Class */}
                <div className="space-y-1 text-center flex flex-col items-center">
                  <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-emerald-800/80 block text-center">
                    Class
                  </span>
                  <span className="bg-emerald-800 text-white font-bold text-lg px-3 py-0.5 rounded shadow-sm inline-block font-mono print:text-base">
                    {classNumeral}
                  </span>
                </div>

                {/* Admission No */}
                <div className="space-y-1 text-center flex flex-col items-center">
                  <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-emerald-800/80 block text-center">
                    Admission No
                  </span>
                  <span className="font-mono font-bold text-slate-950 text-sm sm:text-base print:text-[10pt] block uppercase text-center">
                    {String(report?.student?.admissionNo || '—').toUpperCase()}
                  </span>
                </div>

                {/* Exam Reg No */}
                <div className="space-y-1 text-center flex flex-col items-center">
                  <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-emerald-800/80 block text-center">
                    Exam Reg No
                  </span>
                  <span className="font-mono font-bold text-emerald-950 text-sm sm:text-base print:text-[10pt] block uppercase text-center">
                    {String(examRegisterNo || '—').toUpperCase()}
                  </span>
                </div>
              </div>
            </div>

            {/* 3. MARKS TABLE COLUMNS: [ # | Subject | OMR | OCR | CIE | Total | Result ] - Responsive Scrollable Container */}
            <div className="mb-3 print:mb-2 w-full overflow-x-auto scrollbar-thin border border-emerald-900/30 rounded-xl bg-white shadow-2xs">
              <table className="w-full min-w-[540px] text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-emerald-900 text-white font-bold text-center border-b border-emerald-950">
                    <th className="py-2.5 print:py-2.5 px-3 print:px-2.5 text-left w-10 whitespace-nowrap">#</th>
                    <th className="py-2.5 print:py-2.5 px-3 print:px-2.5 text-left whitespace-nowrap">Subject</th>
                    <th className="py-2.5 print:py-2.5 px-3 print:px-2.5 w-16 text-center whitespace-nowrap">OMR</th>
                    <th className="py-2.5 print:py-2.5 px-3 print:px-2.5 w-16 text-center whitespace-nowrap">OCR</th>
                    <th className="py-2.5 print:py-2.5 px-3 print:px-2.5 w-16 text-center whitespace-nowrap">CIE</th>
                    <th className="py-2.5 print:py-2.5 px-3 print:px-2.5 w-20 text-center whitespace-nowrap">Total</th>
                    <th className="py-2.5 print:py-2.5 px-3 print:px-2.5 w-28 text-center whitespace-nowrap">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {(report?.subjects || []).map((sub, idx) => {
                    const { omrVal, ocrVal, cieVal, omrMax, ocrMax } = extractColumns(sub.components || []);
                    const isSubAbsent = sub.isAbsent;
                    const numOmr = typeof omrVal === 'number' ? omrVal : 0;
                    const numOcr = typeof ocrVal === 'number' ? ocrVal : 0;
                    const numCie = typeof cieVal === 'number' ? cieVal : 0;
                    // Total calculated correctly: OMR + OCR + CIE
                    const subTotal = (sub.obtainedMarks !== null && sub.obtainedMarks !== undefined)
                      ? sub.obtainedMarks
                      : (numOmr + numOcr + numCie);
                    const teMax = omrMax + ocrMax;
                    const teObtained = numOmr + numOcr;
                    const isCeZero = (typeof cieVal === 'number' && cieVal === 0) || sub.hasMissingCe;

                    // Subject Result logic:
                    // A. Passed: If (OMR + OCR) >= 35% of TE Max marks AND CIE > 0.
                    // B. Need Improvement: If (OMR + OCR) < 35% of TE Max marks.
                    // C. Withheld: If CIE === 0.
                    // Absent: If student was absent.
                    let subjectResult = 'Passed';
                    let subjectBadgeStyle = 'bg-emerald-100 text-emerald-800';

                    if (isSubAbsent) {
                      subjectResult = 'Absent';
                      subjectBadgeStyle = 'bg-amber-100 text-amber-900';
                    } else if (isCeZero) {
                      subjectResult = 'Withheld';
                      subjectBadgeStyle = 'bg-amber-100 text-amber-900';
                    } else if (teMax > 0 && teObtained < teMax * 0.35) {
                      subjectResult = 'Need Improvement';
                      subjectBadgeStyle = 'bg-rose-100 text-rose-800';
                    } else {
                      subjectResult = 'Passed';
                      subjectBadgeStyle = 'bg-emerald-100 text-emerald-800';
                    }

                    return (
                      <tr key={sub.subjectId || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}>
                        <td className="py-2 sm:py-2.5 print:py-2 px-3 print:px-2.5 text-slate-500 font-mono text-center">{idx + 1}</td>
                        <td className="py-2 sm:py-2.5 print:py-2 px-3 print:px-2.5 font-bold text-emerald-950 font-ml">
                          {sub.subjectNameMl || sub.subjectNameEn}
                        </td>
                        <td className="py-2 sm:py-2.5 print:py-2 px-3 print:px-2.5 text-center font-mono font-medium text-slate-700 whitespace-nowrap">
                          {isSubAbsent ? (
                            <span className="text-amber-800 font-semibold text-[11px]">Absent</span>
                          ) : (
                            omrVal
                          )}
                        </td>
                        <td className="py-2 sm:py-2.5 print:py-2 px-3 print:px-2.5 text-center font-mono font-medium text-slate-700 whitespace-nowrap">
                          {isSubAbsent ? (
                            <span className="text-amber-800 font-semibold text-[11px]">Absent</span>
                          ) : (
                            ocrVal
                          )}
                        </td>
                        <td className="py-2 sm:py-2.5 print:py-2 px-3 print:px-2.5 text-center font-mono font-medium text-slate-700 whitespace-nowrap">
                          {isSubAbsent ? (
                            <span className="text-amber-800 font-semibold text-[11px]">Absent</span>
                          ) : isCeZero ? (
                            <span className="text-amber-800 font-bold text-[11px]">0</span>
                          ) : (
                            cieVal
                          )}
                        </td>
                        <td className="py-2 sm:py-2.5 print:py-2 px-3 print:px-2.5 text-center font-bold font-mono text-emerald-950 whitespace-nowrap">
                          {isSubAbsent ? (
                            <span className="text-amber-800 font-bold text-[11px]">Absent</span>
                          ) : (
                            subTotal
                          )}
                        </td>
                        <td className="py-2 sm:py-2.5 print:py-2 px-3 print:px-2.5 text-center whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${subjectBadgeStyle}`}>
                            {subjectResult}
                          </span>
                        </td>
                      </tr>
                    );
                  })}

                  {/* DISTINCT GRAND TOTAL ROW AT THE BOTTOM */}
                  <tr className="bg-emerald-950 text-white font-black text-center border-t-2 border-emerald-900">
                    <td colSpan={2} className="py-2.5 print:py-2.5 px-3 print:px-2.5 text-left uppercase tracking-wider text-xs whitespace-nowrap">
                      GRAND TOTAL
                    </td>
                    <td className="py-2.5 print:py-2.5 px-3 print:px-2.5 text-center text-xs text-emerald-300/40">—</td>
                    <td className="py-2.5 print:py-2.5 px-3 print:px-2.5 text-center text-xs text-emerald-300/40">—</td>
                    <td className="py-2.5 print:py-2.5 px-3 print:px-2.5 text-center text-xs text-emerald-300/40">—</td>
                    <td className="py-2.5 print:py-2.5 px-3 print:px-2.5 font-mono text-sm text-amber-300 font-bold whitespace-nowrap">
                      {displayGrandObtained} / {displayGrandMax}
                    </td>
                    <td className="py-2.5 print:py-2.5 px-3 print:px-2.5 text-center whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${metrics.resultBadgeColor}`}>
                        {metrics.displayResultStatus}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Practical & oral breakdown criteria note underneath table */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 print:p-2 mb-4 print:mb-2 text-[10px] print:text-[7pt] text-slate-600 leading-relaxed">
              <span className="font-bold text-slate-800">Assessment Breakdown Criteria: </span>
              <span>
                OMR: Written objective assessment (Max 20/30). OCR: Descriptive written / Oral recitation breakdown (Tajweed, Tilawah, Revision). CIE: Continuous Internal Evaluation &amp; Diary performance (Max 10). Minimum 35% in TE (Written) required for qualification.
              </span>
            </div>

            {/* 4. ACADEMIC METRICS BOX: [ Percentage | Attendance | Rank ] - Mobile Optimized Alignment & Anti-Overlap */}
            <div className="bg-emerald-950 text-white rounded-2xl p-3.5 sm:p-4 mb-4 print:p-2.5 print:mb-2 shadow-xs border border-emerald-900/50">
              <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center divide-x divide-emerald-800/80 items-center">
                {/* Percentage (exact, never display N/A) */}
                <div className="px-1 sm:px-2">
                  <span className="text-[10px] sm:text-[11px] print:text-[8.5pt] font-bold text-emerald-200 uppercase tracking-wider block truncate">
                    Percentage (%)
                  </span>
                  <span className="text-lg sm:text-xl md:text-2xl print:text-base font-black font-mono mt-0.5 sm:mt-1 block whitespace-nowrap">
                    {calculatedPercentage}%
                  </span>
                </div>

                {/* Attendance */}
                <div className="px-1 sm:px-2">
                  <span className="text-[10px] sm:text-[11px] print:text-[8.5pt] font-bold text-emerald-200 uppercase tracking-wider block truncate">
                    Attendance
                  </span>
                  <span className="text-lg sm:text-xl md:text-2xl print:text-base font-black font-mono mt-0.5 sm:mt-1 block whitespace-nowrap">
                    {attendanceDays} / {attendanceTotal}
                  </span>
                </div>

                {/* Rank Box */}
                <div className="px-1 sm:px-2 min-w-0">
                  <span className="text-[10px] sm:text-[11px] print:text-[8.5pt] font-bold text-emerald-200 uppercase tracking-wider block truncate">
                    Academic Rank
                  </span>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 mt-0.5 sm:mt-1">
                    <Award className="w-4 h-4 sm:w-5 sm:h-5 print:w-4 print:h-4 text-amber-400 shrink-0" />
                    <span className="text-xs sm:text-base md:text-2xl print:text-sm font-black font-mono text-amber-300 leading-tight text-center break-words sm:whitespace-nowrap">
                      {academicRankBoxText}
                    </span>
                  </div>
                </div>
              </div>

              {/* Status alerts */}
              {report?.hasWithheldCe && (
                <div className="mt-2.5 pt-2 border-t border-emerald-800/80 text-[10px] text-amber-300 font-semibold flex items-center justify-center gap-1.5 text-center px-2">
                  <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                  <span>Result Withheld: Continuous Evaluation (CE) is incomplete or 0 for one or more subjects.</span>
                </div>
              )}
              {report?.hasAbsentSubjects && (
                <div className="mt-2.5 pt-2 border-t border-emerald-800/80 text-[10px] text-amber-300 font-semibold flex items-center justify-center gap-1.5 text-center px-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>Student marked absent in examination components. Excluded from academic rank calculation.</span>
                </div>
              )}
            </div>
          </div>

          {/* 5. CENTERED 3-SIGNATURE BLOCK AT BOTTOM */}
          <div className="mt-6 sm:mt-8 pt-3 sm:pt-4 print:mt-2.5 print:pt-2 border-t border-slate-300">
            <div className="grid grid-cols-3 gap-3 sm:gap-6 print:gap-4 text-center text-[10px] sm:text-xs print:text-[9pt] text-slate-800">
              {/* Parent */}
              <div>
                <div className="h-10 sm:h-12 print:h-9 border-b border-slate-400"></div>
                <span className="font-bold mt-1.5 block">Signature of Parent</span>
              </div>

              {/* Principal */}
              <div>
                <div className="h-10 sm:h-12 print:h-9 border-b border-slate-400 flex items-end justify-center pb-0.5 font-bold not-italic text-emerald-950 text-xs sm:text-sm print:text-[10pt]">
                  {currentSettings?.principalNameEn || currentSettings?.principalNameMl || (currentSettings as any)?.principalName || 'Principal'}
                </div>
                <span className="font-bold mt-1.5 block">Signature of Principal</span>
              </div>

              {/* Class Teacher */}
              <div>
                <div className="h-10 sm:h-12 print:h-9 border-b border-slate-400 flex items-end justify-center pb-0.5 font-bold not-italic text-slate-800 text-xs sm:text-sm print:text-[10pt]">
                  {resolvedTeacherDisplayName}
                </div>
                <span className="font-bold mt-1.5 block">Signature of Class Teacher</span>
              </div>
            </div>

            <div className="text-center text-[9px] sm:text-[10px] print:text-[7pt] text-slate-400 mt-3 sm:mt-4 print:mt-1.5">
              {currentSettings?.madrasaNameEn || 'Al-Madrasathul Islamiya Pallikkuth'} • Official Progress Verification Record
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
