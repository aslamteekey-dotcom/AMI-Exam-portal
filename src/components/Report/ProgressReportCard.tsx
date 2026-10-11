import React, { useRef, useState } from 'react';
import { StudentProgressReport, InstitutionSettings } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { Printer, Download, CheckCircle, AlertTriangle, Award, GraduationCap, XCircle, ShieldAlert } from 'lucide-react';
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
      const safeName = report.student.nameEn.replace(/\s+/g, '_');
      pdf.save(`Progress_Report_${safeName}_${report.examination.nameEn.replace(/\s+/g, '_')}.pdf`);
    } catch (err) {
      console.error('PDF export error:', err);
      alert('Failed to generate PDF. Please use the Print option and choose "Save as PDF".');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Action Toolbar (Hidden in Print) */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm print:hidden">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="px-3 py-1.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
            >
              ← {t.back}
            </button>
          )}
          <div>
            <h3 className="font-bold text-slate-800 text-base">
              {isMl ? report.student.nameMl : report.student.nameEn}
            </h3>
            <p className="text-xs text-slate-500">
              {report.classNameEn} • {t.rollNo}: {report.student.rollNo} • {report.student.admissionNo}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadPdf}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-sm transition disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {isExporting ? 'Generating PDF...' : t.downloadPdf}
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition"
          >
            <Printer className="w-4 h-4" />
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
          <div className="absolute top-2 left-2 text-emerald-800/20 text-xs font-serif select-none pointer-events-none">❖ ❖ ❖</div>
          <div className="absolute top-2 right-2 text-emerald-800/20 text-xs font-serif select-none pointer-events-none">❖ ❖ ❖</div>
          <div className="absolute bottom-2 left-2 text-emerald-800/20 text-xs font-serif select-none pointer-events-none">❖ ❖ ❖</div>
          <div className="absolute bottom-2 right-2 text-emerald-800/20 text-xs font-serif select-none pointer-events-none">❖ ❖ ❖</div>

          {/* 1. INSTITUTION HEADER */}
          <div className="text-center border-b-2 border-emerald-800 pb-4 mb-5">
            <div className="font-serif text-emerald-900 text-lg md:text-xl font-bold tracking-wide mb-1" dir="rtl">
              {settings.madrasaArabicHeader || 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ'}
            </div>
            <div className="flex items-center justify-center gap-3 my-1">
              {/* Crescent & Book Madrasa Emblem */}
              <div className="w-12 h-12 rounded-full border-2 border-emerald-800 bg-emerald-50 flex items-center justify-center text-emerald-800 shadow-inner">
                <GraduationCap className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-extrabold uppercase tracking-tight text-emerald-950 font-serif">
                  {settings.madrasaNameEn}
                </h1>
                <h2 className="text-base md:text-lg font-bold text-emerald-900">
                  {settings.madrasaNameMl}
                </h2>
              </div>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              {isMl ? settings.locationMl : settings.locationEn} | Reg. No: {settings.registrationNo}
            </p>
            <p className="text-[11px] text-emerald-800 font-medium italic mt-0.5">
              {isMl ? settings.reportHeaderNotesMl : settings.reportHeaderNotesEn}
            </p>

            <div className="mt-3 inline-block bg-emerald-900 text-white px-6 py-1 rounded font-bold text-xs tracking-wider uppercase shadow-sm">
              {t.studentProgressReport}
            </div>
          </div>

          {/* 2. EXAM & STUDENT INFORMATION GRID */}
          <div className="bg-emerald-50/60 border border-emerald-800/30 rounded-lg p-4 mb-5 text-sm">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-y-2 gap-x-4">
              <div>
                <span className="text-xs text-slate-500 font-semibold block">{t.studentName}:</span>
                <span className="font-bold text-slate-900 text-base">
                  {report.student.nameEn}
                </span>
                {report.student.nameMl && (
                  <span className="text-xs text-slate-700 block font-medium">({report.student.nameMl})</span>
                )}
              </div>
              <div>
                <span className="text-xs text-slate-500 font-semibold block">{t.class}:</span>
                <span className="font-bold text-emerald-900">
                  {report.classNameEn}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-500 font-semibold block">{t.rollNo}:</span>
                <span className="font-bold text-slate-900">{report.student.rollNo}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 font-semibold block">{t.admissionNo}:</span>
                <span className="font-mono font-semibold text-slate-800">{report.student.admissionNo}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 font-semibold block">{t.academicYear}:</span>
                <span className="font-semibold text-slate-800">{report.academicYear}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 font-semibold block">{t.examination}:</span>
                <span className="font-bold text-emerald-950">
                  {isMl ? report.examination.nameMl : report.examination.nameEn}
                </span>
              </div>
              {report.student.parentNameEn && (
                <div className="col-span-2">
                  <span className="text-xs text-slate-500 font-semibold block">{t.parent}:</span>
                  <span className="font-medium text-slate-800">
                    {report.student.parentNameEn} {report.student.parentNameMl && `(${report.student.parentNameMl})`}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 3. DYNAMIC ASSESSMENT COMPONENTS & SUBJECT MARKS TABLE */}
          {/* Strictly displaying Subject names in Malayalam, while Assessment Components and Table Headers are strictly in English */}
          <div className="mb-5 overflow-hidden border border-emerald-900/30 rounded-lg">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-emerald-900 text-white font-semibold text-center border-b border-emerald-950">
                  <th className="py-2.5 px-3 text-left w-10">#</th>
                  <th className="py-2.5 px-3 text-left">Subject</th>
                  <th className="py-2.5 px-3 text-left">Components</th>
                  <th className="py-2.5 px-2 w-20">Max Marks</th>
                  <th className="py-2.5 px-2 w-24">Total</th>
                  <th className="py-2.5 px-2 w-24">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {report.subjects.map((sub, idx) => {
                  const isSubAbsent = sub.isAbsent;
                  return (
                    <tr key={sub.subjectId} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}>
                      <td className="py-2.5 px-3 text-slate-500 font-mono text-center">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-900 text-sm">
                        {/* Strictly in Malayalam */}
                        <div className="text-emerald-950 font-bold">{sub.subjectNameMl}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="space-y-1">
                          {sub.components.map(comp => {
                            const isMissingCeComp = comp.key === 'ce' && sub.hasMissingCe;
                            return (
                              <div key={comp.key} className="flex justify-between text-[11px] text-slate-700 border-b border-dotted border-slate-200 pb-0.5">
                                <span>
                                  {comp.labelEn}{' '}
                                  <span className="text-slate-400">({comp.maxMarks})</span>
                                </span>
                                <span className={`font-semibold font-mono ${isMissingCeComp ? 'text-amber-700 font-bold' : ''}`}>
                                  {isSubAbsent ? '—' : isMissingCeComp ? 'Withheld' : comp.obtainedMarks !== null ? comp.obtainedMarks : '—'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-center font-bold text-slate-700 bg-slate-100/50">
                        {sub.maxMarks}
                      </td>
                      <td className="py-2.5 px-2 text-center font-bold font-mono text-sm">
                        {isSubAbsent ? (
                          <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded text-xs">
                            Absent
                          </span>
                        ) : sub.hasMissingCe ? (
                          <span className="text-amber-800 bg-amber-50 px-2 py-0.5 rounded text-[11px] font-bold">
                            Withheld
                          </span>
                        ) : sub.obtainedMarks !== null ? (
                          <span className="text-emerald-950 font-extrabold">{sub.obtainedMarks}</span>
                        ) : (
                          <span className="text-slate-400">Pending</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        {isSubAbsent ? (
                          <span className="text-amber-800 text-[11px] font-semibold">Absent</span>
                        ) : sub.hasMissingCe ? (
                          <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded text-[10px] font-bold">
                            Withheld
                          </span>
                        ) : sub.obtainedMarks !== null ? (
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                              sub.statusTextEn === 'Passed'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {sub.statusTextEn === 'Passed' ? 'Pass' : sub.statusTextEn}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 4. OVERALL SUMMARY BOX */}
          <div className="bg-emerald-900 text-white rounded-lg p-4 mb-6 shadow-sm">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center divide-x divide-emerald-800/60">
              <div>
                <span className="text-xs text-emerald-200 block uppercase tracking-wider">Total</span>
                <span className="text-2xl font-black font-mono mt-0.5 block">
                  {report.hasAbsentSubjects || report.hasIncompleteSubjects || report.hasWithheldCe ? (
                    <span className="text-emerald-300 text-lg">{report.totalObtainedMarks} / {report.totalMaxMarks}*</span>
                  ) : (
                    `${report.totalObtainedMarks} / ${report.totalMaxMarks}`
                  )}
                </span>
              </div>
              <div>
                <span className="text-xs text-emerald-200 block uppercase tracking-wider">Percentage</span>
                <span className="text-2xl font-black font-mono mt-0.5 block">
                  {report.percentage !== null ? `${report.percentage}%` : 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-xs text-emerald-200 block uppercase tracking-wider">Rank</span>
                <div className="flex items-center justify-center gap-1 mt-0.5">
                  <Award className="w-5 h-5 text-amber-400" />
                  <span className="text-2xl font-black font-mono text-amber-300">
                    {report.classRank !== null ? `#${report.classRank}` : '—'}
                  </span>
                </div>
                <span className="text-[10px] text-emerald-300 block">
                  (out of {report.totalStudentsInClass} students)
                </span>
              </div>
              <div>
                <span className="text-xs text-emerald-200 block uppercase tracking-wider">Status</span>
                <span className={`text-base font-bold mt-1 block px-2 py-0.5 rounded ${
                  report.resultStatus === 'Withheld' ? 'bg-amber-400 text-amber-950' : ''
                }`}>
                  {report.resultStatus === 'Passed' ? 'Pass' : report.resultStatus}
                </span>
              </div>
            </div>

            {/* Explanatory Pass Criteria & Withheld Notes */}
            <div className="mt-3 pt-2 border-t border-emerald-800 text-[11px] text-emerald-200 space-y-1">
              {report.hasWithheldCe && (
                <div className="flex items-center gap-1.5 text-amber-300 font-semibold justify-center">
                  <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {isMl
                      ? 'ഫലം തടഞ്ഞുവെച്ചിരിക്കുന്നു: CE മാർക്ക് പൂർണ്ണമായി രേഖപ്പെടുത്താത്തതിനാൽ ഫലം Withheld ചെയ്തിരിക്കുന്നു.'
                      : 'Result Withheld: Continuous Evaluation (CE) mark is not entered for one or more subjects.'}
                  </span>
                </div>
              )}
              {report.hasAbsentSubjects && (
                <div className="flex items-center gap-1.5 justify-center">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                  <span>{t.absentNotice}</span>
                </div>
              )}
              <div className="text-center text-[10px] text-emerald-300/80">
                {isMl
                  ? 'പാസ്സ് നിബന്ധന: CE, ഡയറി ഒഴികെയുള്ള മാർക്കിന്റെ 35% ലഭിച്ചാൽ വിജയിച്ചു.'
                  : 'Pass Criteria: Student secures at least 35% of total marks excluding CE and Diary marks.'}
              </div>
            </div>
          </div>

          {/* 5. SIGNATURE SECTION */}
          <div className="mt-12 pt-6 border-t border-slate-300">
            <div className="grid grid-cols-3 gap-6 text-center text-xs text-slate-700">
              {settings.showTeacherSignature && (
                <div>
                  <div className="h-14 border-b border-slate-400 flex items-end justify-center pb-1 font-serif italic text-slate-500">
                    (Usthad Verified)
                  </div>
                  <span className="font-semibold mt-2 block">{t.teacherSignature}</span>
                </div>
              )}
              {settings.showPrincipalSignature && (
                <div>
                  <div className="h-14 border-b border-slate-400 flex items-end justify-center pb-1 font-serif italic text-emerald-900 font-bold">
                    {settings.principalNameEn}
                  </div>
                  <span className="font-semibold mt-2 block">{t.principalSignature}</span>
                </div>
              )}
              {settings.showParentSignature && (
                <div>
                  <div className="h-14 border-b border-slate-400"></div>
                  <span className="font-semibold mt-2 block">{t.parentSignature}</span>
                </div>
              )}
            </div>

            <div className="text-center text-[10px] text-slate-400 mt-8">
              Report generated from the official Examination Portal of Al-Madrasathul Islamiya Pallikkuth on{' '}
              {new Date().toLocaleDateString('en-GB')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
