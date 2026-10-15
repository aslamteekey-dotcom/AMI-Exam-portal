import React, { useRef, useState } from 'react';
import { StudentProgressReport, InstitutionSettings } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { Printer, Download, Award, GraduationCap, ShieldAlert, AlertTriangle } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { extractComponentColumns, calculateStudentReportMetrics } from '../../utils/reportCalculations';

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
  const { lang, t } = useAuth();
  const reportRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  // CRITICAL SAFE GUARD (ELIMINATE WHITE SCREEN / CRASH)
  if (!report || !report.student) {
    return null;
  }

  const isMl = lang === 'ml';

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    if (!reportRef.current) return;
    setIsExporting(true);
    try {
      const element = reportRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
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

      // Fit card proportionally onto single crisp A4 page
      const ratio = Math.min(pdfWidth / imgProps.width, pdfHeight / imgProps.height);
      const finalWidth = imgProps.width * ratio;
      const finalHeight = imgProps.height * ratio;
      const posX = (pdfWidth - finalWidth) / 2;
      const posY = (pdfHeight - finalHeight) / 2;

      pdf.addImage(imgData, 'PNG', posX, posY, finalWidth, finalHeight, undefined, 'FAST');
      const safeStudentName = (report?.student?.nameEn || 'student').replace(/\s+/g, '_');
      const safeExamName = (report?.examination?.nameEn || 'exam').replace(/\s+/g, '_');
      pdf.save(`Progress_Report_${safeStudentName}_${safeExamName}.pdf`);
    } catch (err) {
      console.error('PDF export error:', err);
      alert('Failed to generate PDF. Please use the Print option and select "Save as PDF".');
    } finally {
      setIsExporting(false);
    }
  };

  // Helper alias to keep compatibility
  const extractColumns = extractComponentColumns;

  // Strictly English class name (e.g., "Class 7", strip any Malayalam text)
  const cleanClassName = (report?.classNameEn || 'Class')
    .replace(/\s*\(.*?\)\s*/g, '')
    .replace(/[\u0D00-\u0D7F]+/g, '')
    .trim();

  // Numeral value for class field (e.g., label "Class:", value "7")
  const classNumeral = cleanClassName.replace(/[^0-9]/g, '') || cleanClassName || '—';

  // Dynamically resolve Class In-charge Teacher name
  const classInChargeName = report?.classTeacherName || (report as any)?.classInChargeName || 'Class In-Charge';

  // Unify calculation metrics using shared engine
  const metrics = calculateStudentReportMetrics(report);
  const displayGrandObtained = metrics.displayGrandObtained;
  const displayGrandMax = metrics.displayGrandMax;
  const calculatedPercentage = metrics.percentageStr;
  const attendanceDays = metrics.attendanceDays;
  const attendanceTotal = metrics.attendanceTotal;

  // Exam Register Number (supports multi-portal cloud sync across schema variations)
  const examRegisterNo =
    report.examRegisterNo ||
    report.student?.examRegisterNumbers?.[report.examination?.id] ||
    (report.student as any)?.examRegisterNos?.[report.examination?.id] ||
    (report.student as any)?.examRegNo ||
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
      {/* Top Action Toolbar (Hidden in Print & in Batch View) */}
      {!hideToolbar && (
        <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs print:hidden">
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
      <div className="overflow-x-auto flex justify-center pb-8 print:p-0 print:m-0 print:pb-0">
        <div
          ref={reportRef}
          id="report-print-sheet"
          className="report-print-sheet w-full max-w-[820px] bg-white text-slate-900 border-2 border-emerald-900/30 p-6 md:p-8 shadow-lg print:shadow-none print:border-none print:p-0 print:max-w-none print:w-full font-sans relative print:min-h-0 print:h-auto"
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

          {/* 1. INSTITUTION HEADER */}
          <div className="text-center border-b-2 border-emerald-800 pb-3 mb-3 print:pb-1.5 print:mb-1.5">
            <div className="font-serif text-emerald-900 text-lg md:text-xl print:text-base font-bold tracking-wide mb-1 print:mb-0.5 text-center" dir="rtl">
              {settings?.madrasaArabicHeader || 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ'}
            </div>
            <div className="flex items-center justify-center gap-3 my-1">
              <div className="w-12 h-12 rounded-full border-2 border-emerald-800 bg-emerald-50 flex items-center justify-center text-emerald-800 shadow-inner shrink-0">
                <GraduationCap className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-black uppercase tracking-tight text-emerald-950 font-serif">
                  {settings?.madrasaNameEn || 'Al-Madrasathul Islamiya Pallikkuth'}
                </h1>
                <h2 className="text-base md:text-lg font-bold text-emerald-900">
                  {settings?.madrasaNameMl || 'അൽ മദ്റസത്തുൽ ഇസ്ലാമിയ്യ പള്ളിക്കുത്ത്'}
                </h2>
              </div>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              {isMl ? settings?.locationMl : settings?.locationEn} • Reg. No: {settings?.registrationNo || 'KEC-8492'}
            </p>

            <div className="mt-2.5 inline-block bg-emerald-900 text-white px-5 py-1 rounded-md font-bold text-xs tracking-wider uppercase shadow-xs">
              STUDENT PROGRESS REPORT • {report?.academicYear || '2026–2027'}
            </div>
            <div className="text-xs font-semibold text-emerald-950 mt-1">
              {isMl ? report?.examination?.nameMl : report?.examination?.nameEn}
            </div>
          </div>

          {/* 2. DEDICATED STUDENT DETAILS BOX - Typography & Sentence Case Rules */}
          <div className="bg-emerald-50/60 border border-emerald-900/30 rounded-xl p-3.5 mb-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-left items-start">
              <div className="space-y-0.5">
                <span className="text-[11px] font-semibold text-slate-600 block">Student name:</span>
                <span className="font-bold text-black text-sm block leading-tight uppercase tracking-tight">
                  {(report?.student?.nameEn || (report?.student as any)?.name || '—').toUpperCase()}
                </span>
                <span className="text-[11px] text-slate-600 truncate block pt-0.5">
                  Parent: <span style={{ color: '#000000' }} className="font-bold text-black uppercase">{(report?.student?.parentNameEn || '—').toUpperCase()}</span>
                </span>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-slate-600 block">Class:</span>
                <span className="font-bold text-black text-sm block uppercase font-mono">
                  {classNumeral}
                </span>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-slate-600 block">Admission no:</span>
                <span className="font-mono font-bold text-black text-sm block uppercase">
                  {String(report?.student?.admissionNo || '—').toUpperCase()}
                </span>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-slate-600 block">Exam reg no:</span>
                <span className="font-mono font-bold text-black text-sm block uppercase">
                  {String(examRegisterNo || '—').toUpperCase()}
                </span>
              </div>
            </div>
          </div>

          {/* 3. MARKS TABLE COLUMNS: [ # | Subject | OMR | OCR | CIE | Total | Result ] */}
          <div className="mb-3 overflow-hidden border border-emerald-900/30 rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-emerald-900 text-white font-bold text-center border-b border-emerald-950">
                  <th className="py-2.5 px-3 text-left w-10">#</th>
                  <th className="py-2.5 px-3 text-left">Subject</th>
                  <th className="py-2.5 px-3 w-16">OMR</th>
                  <th className="py-2.5 px-3 w-16">OCR</th>
                  <th className="py-2.5 px-3 w-16">CIE</th>
                  <th className="py-2.5 px-3 w-20">Total</th>
                  <th className="py-2.5 px-3 w-28 text-center">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(report?.subjects || []).map((sub, idx) => {
                  const { omrVal, ocrVal, cieVal, omrMax, ocrMax, cieMax } = extractColumns(sub.components || []);
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
                      <td className="py-2 px-3 text-slate-500 font-mono text-center">{idx + 1}</td>
                      <td className="py-2 px-3 font-bold text-emerald-950">
                        {sub.subjectNameMl || sub.subjectNameEn}
                      </td>
                      <td className="py-2 px-3 text-center font-mono font-medium text-slate-700">
                        {isSubAbsent ? (
                          <span className="text-amber-800 font-semibold text-[11px]">Absent</span>
                        ) : (
                          omrVal
                        )}
                      </td>
                      <td className="py-2 px-3 text-center font-mono font-medium text-slate-700">
                        {isSubAbsent ? (
                          <span className="text-amber-800 font-semibold text-[11px]">Absent</span>
                        ) : (
                          ocrVal
                        )}
                      </td>
                      <td className="py-2 px-3 text-center font-mono font-medium text-slate-700">
                        {isSubAbsent ? (
                          <span className="text-amber-800 font-semibold text-[11px]">Absent</span>
                        ) : isCeZero ? (
                          <span className="text-amber-800 font-bold text-[11px]">0</span>
                        ) : (
                          cieVal
                        )}
                      </td>
                      <td className="py-2 px-3 text-center font-bold font-mono text-emerald-950">
                        {isSubAbsent ? (
                          <span className="text-amber-800 font-bold text-[11px]">Absent</span>
                        ) : (
                          subTotal
                        )}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${subjectBadgeStyle}`}>
                          {subjectResult}
                        </span>
                      </td>
                    </tr>
                  );
                })}

                {/* DISTINCT GRAND TOTAL ROW AT THE BOTTOM */}
                {/* Remove individual component totals for OMR, OCR, and CIE columns; display ONLY Grand Total of Total column */}
                <tr className="bg-emerald-950 text-white font-black text-center border-t-2 border-emerald-900">
                  <td colSpan={2} className="py-3 px-3 text-left uppercase tracking-wider text-xs">
                    GRAND TOTAL
                  </td>
                  <td className="py-3 px-3 text-center text-xs text-emerald-300/40">—</td>
                  <td className="py-3 px-3 text-center text-xs text-emerald-300/40">—</td>
                  <td className="py-3 px-3 text-center text-xs text-emerald-300/40">—</td>
                  <td className="py-3 px-3 font-mono text-sm text-amber-300 font-bold whitespace-nowrap">
                    {displayGrandObtained} / {displayGrandMax}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${metrics.resultBadgeColor}`}>
                      {metrics.displayResultStatus}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Practical & oral breakdown criteria note underneath table */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 mb-4 text-[10px] text-slate-600 leading-relaxed">
            <span className="font-bold text-slate-800">Assessment Breakdown Criteria: </span>
            <span>
              OMR: Written objective assessment (Max 20/30). OCR: Descriptive written / Oral recitation breakdown (Tajweed, Tilawah, Revision). CIE: Continuous Internal Evaluation & Diary performance (Max 10). Minimum 35% in TE (Written) required for qualification.
            </span>
          </div>

          {/* 4. ACADEMIC METRICS BOX: [ Percentage | Attendance | Rank ] */}
          <div className="bg-emerald-900 text-white rounded-xl p-3.5 mb-4 print:p-2 print:mb-2 shadow-xs">
            <div className="grid grid-cols-3 gap-4 text-center divide-x divide-emerald-800/80">
              {/* Percentage (exact, never display N/A) */}
              <div>
                <span className="text-[11px] print:text-[9pt] font-bold text-emerald-200 uppercase tracking-wider block">
                  Percentage (%)
                </span>
                <span className="text-2xl print:text-lg font-black font-mono mt-0.5 block">
                  {calculatedPercentage}%
                </span>
              </div>

              {/* Attendance */}
              <div>
                <span className="text-[11px] print:text-[9pt] font-bold text-emerald-200 uppercase tracking-wider block">
                  Attendance
                </span>
                <span className="text-2xl print:text-lg font-black font-mono mt-0.5 block">
                  {attendanceDays} / {attendanceTotal}
                </span>
              </div>

              {/* Rank Box: Rank is awarded ONLY if all subjects are Passed with zero withheld and zero absences. Otherwise show Need Improvement, Withheld, or Absent */}
              <div>
                <span className="text-[11px] print:text-[9pt] font-bold text-emerald-200 uppercase tracking-wider block">
                  Academic Rank
                </span>
                <div className="flex items-center justify-center gap-1.5 mt-0.5">
                  <Award className="w-5 h-5 print:w-4 print:h-4 text-amber-400 shrink-0" />
                  <span className="text-xl md:text-2xl print:text-lg font-black font-mono text-amber-300">
                    {academicRankBoxText}
                  </span>
                </div>
              </div>
            </div>

            {/* Status alerts */}
            {report?.hasWithheldCe && (
              <div className="mt-2 pt-1.5 border-t border-emerald-800 text-[10px] text-amber-300 font-semibold flex items-center justify-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                <span>Result Withheld: Continuous Evaluation (CE) is incomplete or 0 for one or more subjects.</span>
              </div>
            )}
            {report?.hasAbsentSubjects && (
              <div className="mt-2 pt-1.5 border-t border-emerald-800 text-[10px] text-amber-300 font-semibold flex items-center justify-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>Student marked absent in examination components. Excluded from academic rank calculation.</span>
              </div>
            )}
          </div>

          {/* 5. CENTERED 3-SIGNATURE BLOCK AT BOTTOM */}
          <div className="mt-8 pt-4 print:mt-2.5 print:pt-1.5 border-t border-slate-300">
            <div className="grid grid-cols-3 gap-6 print:gap-4 text-center text-xs print:text-[9pt] text-slate-800">
              {/* Parent */}
              <div>
                <div className="h-12 print:h-8 border-b border-slate-400"></div>
                <span className="font-bold mt-1.5 block">Signature of Parent</span>
              </div>

              {/* Principal */}
              <div>
                <div className="h-12 print:h-8 border-b border-slate-400 flex items-end justify-center pb-0.5 font-serif italic text-emerald-950 font-bold">
                  {settings?.principalNameEn || 'ASLAM TK'}
                </div>
                <span className="font-bold mt-1.5 block">Signature of Principal</span>
              </div>

              {/* Class Teacher */}
              <div>
                <div className="h-12 print:h-8 border-b border-slate-400 flex items-end justify-center pb-0.5 font-serif italic text-slate-500">
                  (Class In-Charge)
                </div>
                <span className="font-bold mt-1.5 block">Signature of Class Teacher</span>
              </div>
            </div>

            <div className="text-center text-[10px] print:text-[7.5pt] text-slate-400 mt-4 print:mt-1">
              Al-Madrasathul Islamiya Pallikkuth • Examination & Progress Verification Record • Generated {new Date().toLocaleDateString('en-GB')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
