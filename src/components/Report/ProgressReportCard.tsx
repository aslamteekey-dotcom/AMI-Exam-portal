import React, { useRef, useState } from 'react';
import { StudentProgressReport, InstitutionSettings } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { Printer, Download, Award, GraduationCap, ShieldAlert, AlertTriangle } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface Props {
  report: StudentProgressReport;
  settings: InstitutionSettings;
  onBack?: () => void;
}

export const ProgressReportCard: React.FC<Props> = ({ report, settings, onBack }) => {
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
      const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, Math.min(imgHeight, pdfHeight));
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

  // Helper to extract OMR, OCR, and CIE from components
  const extractColumns = (components: { key: string; labelEn: string; maxMarks: number; obtainedMarks: number | null }[]) => {
    let omrVal: number | string = '—';
    let ocrVal: number | string = '—';
    let cieVal: number | string = '—';
    let omrMax = 0;
    let ocrMax = 0;
    let cieMax = 0;

    components.forEach((c) => {
      const k = c.key.toLowerCase();
      if (k === 'omr' || k === 'written' || k === 'tilawah' || k === 'new_portion' || k === 'salawat') {
        omrVal = c.obtainedMarks !== null ? c.obtainedMarks : '—';
        omrMax = c.maxMarks;
      } else if (k === 'descriptive' || k === 'tajweed' || k === 'tilawati' || k === 'revision' || k === 'duas' || k === 'oral') {
        ocrVal = c.obtainedMarks !== null ? c.obtainedMarks : '—';
        ocrMax = c.maxMarks;
      } else if (k === 'ce' || k === 'diary') {
        cieVal = c.obtainedMarks !== null ? c.obtainedMarks : '—';
        cieMax = c.maxMarks;
      }
    });

    // Fallback if component keys were mapped generically
    if (omrMax === 0 && components[0]) {
      omrVal = components[0].obtainedMarks !== null ? components[0].obtainedMarks : '—';
      omrMax = components[0].maxMarks;
    }
    if (ocrMax === 0 && components[1]) {
      ocrVal = components[1].obtainedMarks !== null ? components[1].obtainedMarks : '—';
      ocrMax = components[1].maxMarks;
    }
    if (cieMax === 0 && components[2]) {
      cieVal = components[2].obtainedMarks !== null ? components[2].obtainedMarks : '—';
      cieMax = components[2].maxMarks;
    }

    return { omrVal, ocrVal, cieVal, omrMax, ocrMax, cieMax };
  };

  // Grand total calculations
  let grandOmrObtained = 0;
  let grandOmrMax = 0;
  let grandOcrObtained = 0;
  let grandOcrMax = 0;
  let grandCieObtained = 0;
  let grandCieMax = 0;

  (report.subjects || []).forEach((sub) => {
    const { omrVal, ocrVal, cieVal, omrMax, ocrMax, cieMax } = extractColumns(sub.components || []);
    grandOmrMax += omrMax;
    grandOcrMax += ocrMax;
    grandCieMax += cieMax;
    if (typeof omrVal === 'number') grandOmrObtained += omrVal;
    if (typeof ocrVal === 'number') grandOcrObtained += ocrVal;
    if (typeof cieVal === 'number') grandCieObtained += cieVal;
  });

  const attendanceDays = report.attendance?.daysAttended ?? report?.student?.attendance?.daysAttended ?? 88;
  const attendanceTotal = report.attendance?.totalWorkingDays ?? report?.student?.attendance?.totalWorkingDays ?? 88;

  // Format rank strictly as "Rank 1", "Rank 2" (no total denominator) or academic status
  const formattedRank = report.denseRankText || (report.classRank ? `Rank ${report.classRank}` : (report.resultStatus === 'Passed' ? 'Passed' : report.resultStatus));

  return (
    <div className="space-y-6">
      {/* Top Action Toolbar (Hidden in Print) */}
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
              {isMl && report?.student?.nameMl ? report.student.nameMl : report?.student?.nameEn}
            </h3>
            <p className="text-xs text-slate-500 font-mono">
              {report?.classNameEn} • {t.rollNo}: {report?.student?.rollNo} • Adm: {report?.student?.admissionNo}
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

      {/* Progress Report Sheet - A4 Document Container */}
      <div className="overflow-x-auto flex justify-center pb-8 print:p-0 print:m-0">
        <div
          ref={reportRef}
          id="report-print-sheet"
          className="w-full max-w-[820px] bg-white text-slate-900 border-2 border-emerald-900/30 p-8 md:p-10 shadow-lg print:shadow-none print:border-none print:p-4 print:max-w-none print:w-full font-sans relative"
          style={{ minHeight: '1080px' }}
        >
          {/* Subtle Islamic Geometric Corner Motifs */}
          <div className="absolute top-3 left-3 text-emerald-800/25 text-xs font-serif select-none pointer-events-none">
            ❖ ❖ ❖
          </div>
          <div className="absolute top-3 right-3 text-emerald-800/25 text-xs font-serif select-none pointer-events-none">
            ❖ ❖ ❖
          </div>
          <div className="absolute bottom-3 left-3 text-emerald-800/25 text-xs font-serif select-none pointer-events-none">
            ❖ ❖ ❖
          </div>
          <div className="absolute bottom-3 right-3 text-emerald-800/25 text-xs font-serif select-none pointer-events-none">
            ❖ ❖ ❖
          </div>

          {/* 1. INSTITUTION HEADER */}
          <div className="text-center border-b-2 border-emerald-800 pb-4 mb-4">
            <div className="font-serif text-emerald-900 text-lg md:text-xl font-bold tracking-wide mb-1 text-center" dir="rtl">
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

          {/* 2. DEDICATED STUDENT DETAILS BOX */}
          <div className="bg-emerald-50/60 border border-emerald-900/30 rounded-xl p-3.5 mb-4 text-xs">
            <div className="grid grid-cols-3 gap-4 text-left">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase block">Student Name:</span>
                <span className="font-bold text-slate-900 text-sm block leading-tight">
                  {report?.student?.nameEn || '—'}
                </span>
                {report?.student?.nameMl && (
                  <span className="text-[11px] text-slate-600 font-medium">{report.student.nameMl}</span>
                )}
              </div>
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase block">Class:</span>
                <span className="font-bold text-emerald-950 text-sm block">
                  {report?.classNameEn || '—'} {report?.classNameMl && `(${report.classNameMl})`}
                </span>
                <span className="text-[11px] text-slate-500 font-mono">Roll #{report?.student?.rollNo || '—'}</span>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase block">Admission No:</span>
                <span className="font-mono font-bold text-slate-900 text-sm block">
                  {report?.student?.admissionNo || '—'}
                </span>
                {report?.student?.parentNameEn && (
                  <span className="text-[11px] text-slate-500 truncate block">Parent: {report.student.parentNameEn}</span>
                )}
              </div>
            </div>
          </div>

          {/* 3. MARKS TABLE COLUMNS: [ Subject | OMR | OCR | CIE | Total ] */}
          <div className="mb-3 overflow-hidden border border-emerald-900/30 rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-emerald-900 text-white font-bold text-center border-b border-emerald-950">
                  <th className="py-2.5 px-3 text-left w-10">#</th>
                  <th className="py-2.5 px-3 text-left">Subject</th>
                  <th className="py-2.5 px-3 w-20">OMR</th>
                  <th className="py-2.5 px-3 w-20">OCR</th>
                  <th className="py-2.5 px-3 w-20">CIE</th>
                  <th className="py-2.5 px-3 w-24">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(report?.subjects || []).map((sub, idx) => {
                  const { omrVal, ocrVal, cieVal } = extractColumns(sub.components || []);
                  const isSubAbsent = sub.isAbsent;
                  return (
                    <tr key={sub.subjectId || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}>
                      <td className="py-2 px-3 text-slate-500 font-mono text-center">{idx + 1}</td>
                      <td className="py-2 px-3 font-bold text-emerald-950">
                        {sub.subjectNameMl || sub.subjectNameEn}
                      </td>
                      <td className="py-2 px-3 text-center font-mono font-medium text-slate-700">
                        {isSubAbsent ? '—' : omrVal}
                      </td>
                      <td className="py-2 px-3 text-center font-mono font-medium text-slate-700">
                        {isSubAbsent ? '—' : ocrVal}
                      </td>
                      <td className="py-2 px-3 text-center font-mono font-medium text-slate-700">
                        {isSubAbsent ? '—' : sub.hasMissingCe ? 'Withheld' : cieVal}
                      </td>
                      <td className="py-2 px-3 text-center font-bold font-mono text-emerald-950">
                        {isSubAbsent ? (
                          <span className="text-amber-700 font-semibold text-[11px]">Absent</span>
                        ) : sub.hasMissingCe ? (
                          <span className="text-amber-800 font-bold text-[11px]">Withheld</span>
                        ) : sub.obtainedMarks !== null ? (
                          sub.obtainedMarks
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })}

                {/* DISTINCT GRAND TOTAL ROW AT THE BOTTOM */}
                <tr className="bg-emerald-950 text-white font-black text-center border-t-2 border-emerald-900">
                  <td colSpan={2} className="py-3 px-3 text-left uppercase tracking-wider text-xs">
                    GRAND TOTAL
                  </td>
                  <td className="py-3 px-3 font-mono text-xs text-emerald-200">
                    {report?.hasAbsentSubjects ? '—' : grandOmrObtained} / {grandOmrMax}
                  </td>
                  <td className="py-3 px-3 font-mono text-xs text-emerald-200">
                    {report?.hasAbsentSubjects ? '—' : grandOcrObtained} / {grandOcrMax}
                  </td>
                  <td className="py-3 px-3 font-mono text-xs text-emerald-200">
                    {report?.hasAbsentSubjects ? '—' : grandCieObtained} / {grandCieMax}
                  </td>
                  <td className="py-3 px-3 font-mono text-sm text-amber-300">
                    {report?.hasAbsentSubjects ? (
                      <span className="text-amber-400">Absent</span>
                    ) : (
                      `${report?.totalObtainedMarks || 0} / ${report?.totalMaxMarks || 0}`
                    )}
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
          <div className="bg-emerald-900 text-white rounded-xl p-4 mb-8 shadow-xs">
            <div className="grid grid-cols-3 gap-4 text-center divide-x divide-emerald-800/80">
              {/* Percentage */}
              <div>
                <span className="text-[11px] font-bold text-emerald-200 uppercase tracking-wider block">
                  Percentage (%)
                </span>
                <span className="text-2xl font-black font-mono mt-1 block">
                  {report?.percentage !== null && report?.percentage !== undefined ? `${report.percentage}%` : 'N/A'}
                </span>
              </div>

              {/* Attendance */}
              <div>
                <span className="text-[11px] font-bold text-emerald-200 uppercase tracking-wider block">
                  Attendance
                </span>
                <span className="text-2xl font-black font-mono mt-1 block">
                  {attendanceDays} / {attendanceTotal}
                </span>
              </div>

              {/* Rank (Strictly Rank 1, Rank 2 - No denominator) */}
              <div>
                <span className="text-[11px] font-bold text-emerald-200 uppercase tracking-wider block">
                  Academic Rank
                </span>
                <div className="flex items-center justify-center gap-1.5 mt-1">
                  <Award className="w-5 h-5 text-amber-400 shrink-0" />
                  <span className="text-xl md:text-2xl font-black font-mono text-amber-300">
                    {formattedRank}
                  </span>
                </div>
              </div>
            </div>

            {/* Status alerts */}
            {report?.hasWithheldCe && (
              <div className="mt-3 pt-2 border-t border-emerald-800 text-[11px] text-amber-300 font-semibold flex items-center justify-center gap-1.5">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>Result Withheld: Continuous Evaluation (CE) is incomplete for one or more subjects.</span>
              </div>
            )}
            {report?.hasAbsentSubjects && (
              <div className="mt-3 pt-2 border-t border-emerald-800 text-[11px] text-amber-300 font-semibold flex items-center justify-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Student marked absent in examination components. Excluded from rank calculation.</span>
              </div>
            )}
          </div>

          {/* 5. CENTERED 3-SIGNATURE BLOCK AT BOTTOM */}
          <div className="mt-14 pt-6 border-t border-slate-300">
            <div className="grid grid-cols-3 gap-8 text-center text-xs text-slate-800">
              {/* Parent */}
              <div>
                <div className="h-16 border-b border-slate-400"></div>
                <span className="font-bold mt-2 block">Signature of Parent</span>
              </div>

              {/* Principal */}
              <div>
                <div className="h-16 border-b border-slate-400 flex items-end justify-center pb-1 font-serif italic text-emerald-950 font-bold">
                  {settings?.principalNameEn || 'ASLAM TK'}
                </div>
                <span className="font-bold mt-2 block">Signature of Principal</span>
              </div>

              {/* Class Teacher */}
              <div>
                <div className="h-16 border-b border-slate-400 flex items-end justify-center pb-1 font-serif italic text-slate-500">
                  (Class In-Charge)
                </div>
                <span className="font-bold mt-2 block">Signature of Class Teacher</span>
              </div>
            </div>

            <div className="text-center text-[10px] text-slate-400 mt-8">
              Al-Madrasathul Islamiya Pallikkuth • Examination & Progress Verification Record • Generated {new Date().toLocaleDateString('en-GB')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
