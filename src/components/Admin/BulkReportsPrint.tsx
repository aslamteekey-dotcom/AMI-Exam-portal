import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ClassItem, Examination, StudentProgressReport, InstitutionSettings, sortStudentsBoysFirst, normalizeGender, determineStudentGender, ProgressReportSubject, ClassAttendanceConfig } from '../../types';
import { ProgressReportCard } from '../Report/ProgressReportCard';
import { computeClassLedgerRankings, calculateStudentReportMetrics, computeSubjectScoreSheetMarks, calculateAttendanceForExamCutoff } from '../../utils/reportCalculations';
import { handleHorizontalWheel } from '../../hooks/useHorizontalScroll';
import { db, safeOnSnapshot } from '../../services/firebase';
import { doc } from 'firebase/firestore';
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
  FileSpreadsheet,
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
  const [classAttendanceConfig, setClassAttendanceConfig] = useState<ClassAttendanceConfig | null>(null);
  const [reportsData, setReportsData] = useState<{
    reports: StudentProgressReport[];
    settings: InstitutionSettings;
  } | null>(null);
  const [fetching, setFetching] = useState(false);
  const [viewMode, setViewMode] = useState<'bulk_cards' | 'ledger_table' | 'score_sheet'>('ledger_table');
  const [activeSingleReport, setActiveSingleReport] = useState<StudentProgressReport | null>(null);
  const [isBatchPrinting, setIsBatchPrinting] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [showRegModal, setShowRegModal] = useState(false);
  const [subjectStatusesMap, setSubjectStatusesMap] = useState<Record<string, string>>({});
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
          const genderA = determineStudentGender(a.student, eId);
          const genderB = determineStudentGender(b.student, eId);
          if (genderA !== genderB) return genderA === 'Boy' ? -1 : 1;
          const nameA = String(a.student?.nameEn || (a.student as any)?.name || '').trim().toLowerCase();
          const nameB = String(b.student?.nameEn || (b.student as any)?.name || '').trim().toLowerCase();
          return nameA.localeCompare(nameB);
        }).map((r, idx) => ({
          ...r,
          student: {
            ...r.student,
            rollNo: idx + 1,
            gender: determineStudentGender(r.student, eId),
          },
        }));

        const statuses: Record<string, string> = { ...(data.subjectStatuses || {}) };
        if (Array.isArray(data.markSheets)) {
          data.markSheets.forEach((ms: any) => {
            if (ms.subjectId) statuses[ms.subjectId] = ms.status;
          });
        }
        rawReports.forEach(r => {
          (r.subjects || []).forEach(s => {
            if (s.subjectId && (s.status || s.markSheetStatus)) {
              if (!statuses[s.subjectId]) {
                statuses[s.subjectId] = s.status || s.markSheetStatus || 'draft';
              }
            }
          });
        });
        setSubjectStatusesMap(statuses);

        // Also fetch mark-sheets list for the exam to ensure full status coverage
        fetchWithAuth(`/api/mark-sheets?examinationId=${eId}`)
          .then(r => (r.ok ? r.json() : []))
          .then((sheets: any[]) => {
            if (Array.isArray(sheets)) {
              const extra: Record<string, string> = {};
              sheets
                .filter(ms => ms.classId === cId || String(ms.classId) === String(cId))
                .forEach(ms => {
                  if (ms.subjectId) extra[ms.subjectId] = ms.status;
                });
              setSubjectStatusesMap(prev => ({ ...prev, ...extra }));
            }
          })
          .catch(() => {});

        // Fetch attendance config for class
        fetchWithAuth(`/api/attendance/class/${cId}`)
          .then(r => (r.ok ? r.json() : null))
          .then(cfg => {
            if (cfg) setClassAttendanceConfig(cfg);
          })
          .catch(() => {});

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

  // Real-time listener for class attendance config
  useEffect(() => {
    if (!selectedClassId) return;
    const unsub = safeOnSnapshot(doc(db, 'attendance', selectedClassId), snap => {
      if (snap.exists()) {
        setClassAttendanceConfig({ ...snap.data(), classId: snap.id } as ClassAttendanceConfig);
      }
    });
    return () => {
      try {
        unsub();
      } catch {}
    };
  }, [selectedClassId]);

  // Run initial data loading strictly once on mount
  useEffect(() => {
    loadInitial();
    const handleSettingsUpdated = (e: any) => {
      if (e?.detail) setSettings(e.detail);
    };
    window.addEventListener('madrasa_settings_updated', handleSettingsUpdated);
    return () => {
      window.removeEventListener('madrasa_settings_updated', handleSettingsUpdated);
    };
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
      rawReports.map(r => {
        const att = calculateAttendanceForExamCutoff(
          classAttendanceConfig?.dailyRecords,
          currentExam?.attendanceCutoffDate,
          r.student?.id || '',
          r.attendance?.daysAttended ?? 88,
          r.attendance?.totalWorkingDays ?? 88
        );
        return {
          ...r,
          attendance: att,
          gender: determineStudentGender(r.student, selectedExamId),
          nameEn: r.student?.nameEn,
          name: (r.student as any)?.name,
        };
      }),
      selectedExamId
    ).map((r, idx) => ({
      ...r,
      student: {
        ...r.student,
        rollNo: idx + 1,
        gender: determineStudentGender(r.student, selectedExamId),
      },
    }));
  }, [rawReports, selectedExamId, classAttendanceConfig, currentExam?.attendanceCutoffDate]);

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

  // Helper to verify if subject mark sheet is formally submitted ('submitted' | 'approved' | 'locked')
  const isSubjectSubmitted = useCallback((subId: string, subObj?: ProgressReportSubject) => {
    const status = (
      subjectStatusesMap[subId] ||
      subObj?.status ||
      subObj?.markSheetStatus ||
      (subObj as any)?.markStatus ||
      'draft'
    ).toLowerCase();
    return status === 'submitted' || status === 'approved' || status === 'locked';
  }, [subjectStatusesMap]);

  // Transformed reports strictly for Score Sheet where draft marks are forced to 0
  const scoreSheetReports = useMemo(() => {
    return safeReports.map(rep => {
      const sanitizedSubjects = (rep.subjects || []).map(sub => {
        const submitted = isSubjectSubmitted(sub.subjectId, sub);
        if (!submitted) {
          return {
            ...sub,
            status: 'draft',
            markSheetStatus: 'draft',
            isAbsent: false,
            obtainedMarks: 0,
            components: (sub.components || []).map(c => ({
              ...c,
              obtainedMarks: 0,
            })),
          };
        }
        return {
          ...sub,
          status: 'submitted',
          markSheetStatus: 'submitted',
        };
      });

      return {
        ...rep,
        subjects: sanitizedSubjects,
      };
    });
  }, [safeReports, isSubjectSubmitted]);

  // Dense rankings computed specifically for the Score Sheet using the forced 0 values
  const scoreSheetRankings = useMemo(() => {
    return computeClassLedgerRankings(scoreSheetReports, classTotalExpectedMax, true);
  }, [scoreSheetReports, classTotalExpectedMax]);

  // Enriched reports for Score Sheet
  const enrichedScoreSheetReports = useMemo(() => {
    return scoreSheetReports.map(rep => {
      const s = rep.student;
      const rankData = scoreSheetRankings.get(s?.id || '') || (s?.admissionNo ? scoreSheetRankings.get(s.admissionNo) : undefined);
      const metrics = rankData?.metrics || calculateStudentReportMetrics(rep, classTotalExpectedMax, true);
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
  }, [scoreSheetReports, scoreSheetRankings, classTotalExpectedMax]);

  const ledgerBoysCount = enrichedReports.filter(r => determineStudentGender(r.student, selectedExamId) === 'Boy').length;
  const ledgerGirlsCount = enrichedReports.filter(r => determineStudentGender(r.student, selectedExamId) === 'Girl').length;

  const classSubjects = useMemo(() => {
    const map = new Map<string, ProgressReportSubject>();
    safeReports.forEach(r => {
      (r.subjects || []).forEach(s => {
        if (!map.has(s.subjectId)) {
          map.set(s.subjectId, s);
        }
      });
    });
    return Array.from(map.values());
  }, [safeReports]);

  const classTeacherName = useMemo(() => {
    return (
      safeReports[0]?.classTeacherName ||
      (currentClass as any)?.classTeacherName ||
      'Class Teacher'
    );
  }, [safeReports, currentClass]);

  const handlePrintScoreSheet = () => {
    setViewMode('score_sheet');
    setTimeout(() => {
      window.print();
    }, 200);
  };

  const handleExportScoreSheetCsv = () => {
    if (!enrichedScoreSheetReports.length) return;
    const headerCols = ['Roll No', 'Student Name'];
    classSubjects.forEach(sub => {
      const sName = sub.subjectNameEn || sub.code;
      headerCols.push(`${sName} TE`, `${sName} CE`, `${sName} Tot`);
    });
    headerCols.push('Grand Total', 'Percentage', 'Attendance', 'Rank');
    let csv = headerCols.join(',') + '\n';

    enrichedScoreSheetReports.forEach(rep => {
      const s = rep.student;
      const rankData = scoreSheetRankings.get(s?.id || '') || (s?.admissionNo ? scoreSheetRankings.get(s.admissionNo) : undefined);
      const metrics = rankData?.metrics || calculateStudentReportMetrics(rep, classTotalExpectedMax, true);
      const cleanName = `"${(s?.nameEn || '').replace(/"/g, '""')}"`;
      const row: (string | number)[] = [s?.rollNo || '-', cleanName];

      classSubjects.forEach(subDef => {
        const subData = (rep.subjects || []).find(sub => sub.subjectId === subDef.subjectId);
        const subStatus = subjectStatusesMap[subDef.subjectId] || subData?.status || subData?.markSheetStatus;
        const marks = computeSubjectScoreSheetMarks(subData, subStatus);
        row.push(marks.isAbsent ? 'AB' : marks.te);
        row.push(marks.isAbsent ? 'AB' : marks.ce);
        row.push(marks.isAbsent ? 'AB' : marks.tot);
      });

      row.push(`"${metrics.displayGrandObtained} / ${classTotalExpectedMax}"`);
      row.push(`"${metrics.percentageStr}%"`);
      row.push(`"${metrics.attendanceDays} / ${metrics.attendanceTotal}"`);
      const rankStr = rankData?.isRankAwarded && rankData.rank !== null ? `Rank ${rankData.rank}` : (metrics.displayResultStatus === 'Absent' ? 'Absent' : (metrics.displayResultStatus === 'Withheld' ? 'Withheld' : '—'));
      row.push(`"${rankStr}"`);

      csv += row.join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const cName = getEnglishClassName(currentClass || ({ name: 'Class', numericGrade: 1 } as any)).replace(/\s+/g, '_');
    const eName = (currentExam?.nameEn || 'Exam').replace(/\s+/g, '_');
    link.download = `${cName}_${eName}_Score_Sheet.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

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
              onClick={() => setViewMode('score_sheet')}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition shadow-xs cursor-pointer border ${
                viewMode === 'score_sheet'
                  ? 'bg-emerald-100 text-emerald-950 border-emerald-400'
                  : 'text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border-emerald-300'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
              Score Sheet
            </button>
            {viewMode === 'score_sheet' ? (
              <button
                type="button"
                onClick={handlePrintScoreSheet}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition shadow-xs cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Score Sheet
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePrintAll}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition shadow-xs cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Print All Cards
              </button>
            )}
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

        {/* View Mode Switcher Toggle: Result Ledger Table | Score Sheet | Full-Class Cards */}
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
              onClick={() => setViewMode('score_sheet')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                viewMode === 'score_sheet'
                  ? 'bg-emerald-800 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Score Sheet
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
                    Displaying all {enrichedReports.length} progress report cards ({ledgerBoysCount} Boys, {ledgerGirlsCount} Girls) in sequential order. Each student card is formatted strictly for a single A4 page.
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
        ) : viewMode === 'score_sheet' ? (
          /* ========================================================= */
          /* 2. CONSOLIDATED EXAMINATION SCORE SHEET VIEW (A4 Landscape)*/
          /* ========================================================= */
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {/* Embedded Print Styling matching requirement 3 */}
            <style>{`
              @media print {
                @page { size: A4 landscape; margin: 5mm; }
                .overflow-x-auto { overflow: visible !important; }
                .score-sheet-container {
                  width: 100% !important;
                  padding: 0 !important;
                  margin: 0 !important;
                }
                .score-sheet-table, table { 
                  width: 100% !important; 
                  min-width: auto !important; 
                  table-layout: auto !important;
                  border-collapse: collapse !important; 
                  font-size: 8pt !important;
                }
                .score-sheet-table th.subject-name, th.subject-name {
                  white-space: normal !important; 
                  font-size: 7.5pt !important;
                  padding: 2px !important;
                }
                .score-sheet-table th, .score-sheet-table td, td, th { 
                  border: 1px solid #000 !important; 
                  padding: 1px 2px !important; 
                  text-align: center !important; 
                  white-space: nowrap !important; 
                  font-size: 8pt !important;
                }
                .no-print { display: none !important; }
              }
            `}</style>

            {/* Screen Header & Action Bar (Hidden in Print) */}
            <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50 print:hidden no-print">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-800" />
                  <span>{classLabelEnglish} Consolidated Score Sheet</span>
                  <span className="text-xs font-semibold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-lg">
                    {classSubjects.length} Subjects (Written & Oral)
                  </span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Dynamic TE/CE breakdown (TE = Written OMR + Descriptive or Oral; CE = Continuous Evaluation). Compact A4 Landscape print format.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportScoreSheetCsv}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition shadow-2xs cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-800" />
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={handlePrintScoreSheet}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition shadow-xs cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Score Sheet (A4 Landscape)
                </button>
              </div>
            </div>

            {/* Score Sheet Container */}
            <div className="score-sheet-container p-4 md:p-6 print:p-0">
              {/* Dynamic A4 Landscape Print Header (Official Formatting Style matching Fee Receipts) */}
              <div className="score-sheet-print-header hidden print:block text-center border-b border-black pb-2 mb-2">
                <div className="font-serif text-black text-xs font-bold" dir="rtl">
                  {settings?.madrasaArabicHeader || reportsData?.settings?.madrasaArabicHeader || 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ'}
                </div>
                <h1 className="text-base font-black uppercase text-black font-serif tracking-wide mt-0.5">
                  {settings?.institutionName || reportsData?.settings?.institutionName || settings?.madrasaNameEn || reportsData?.settings?.madrasaNameEn || 'Al-Madrasathul Islamiya Pallikkuth'}
                </h1>
                {(settings?.institutionNameMl || reportsData?.settings?.institutionNameMl || settings?.madrasaNameMl || reportsData?.settings?.madrasaNameMl) && (
                  <h2 className="text-xs font-bold text-black font-ml mt-0.5">
                    {settings?.institutionNameMl || reportsData?.settings?.institutionNameMl || settings?.madrasaNameMl || reportsData?.settings?.madrasaNameMl}
                  </h2>
                )}
                {(settings?.institutionSubtitle || reportsData?.settings?.institutionSubtitle || settings?.locationEn || reportsData?.settings?.locationEn) && (
                  <div className="text-[10px] font-semibold text-black tracking-wide mt-0.5">
                    {settings?.institutionSubtitle || reportsData?.settings?.institutionSubtitle || settings?.locationEn || reportsData?.settings?.locationEn}
                  </div>
                )}
                <p className="text-[10px] text-black mt-0.5">
                  {(settings?.registrationNumber || reportsData?.settings?.registrationNumber || settings?.registrationNo || reportsData?.settings?.registrationNo)
                    ? `Reg. No: ${settings?.registrationNumber || reportsData?.settings?.registrationNumber || settings?.registrationNo || reportsData?.settings?.registrationNo} • `
                    : ''}
                  Consolidated Examination Score Sheet (2026–2027)
                </p>

                {/* Dynamic Metadata Row: Exam Name, Class Name, Class Teacher, Academic Year */}
                <div className="mt-1.5 flex items-center justify-between text-[9pt] px-2 text-black font-semibold border-t border-b border-black py-1">
                  <div>
                    <span className="uppercase text-[8pt] font-normal">Exam:</span>{' '}
                    <span className="font-bold">{currentExam ? (isMl ? (currentExam.nameMl || currentExam.nameEn) : currentExam.nameEn) : 'Examination'}</span>
                  </div>
                  <div>
                    <span className="uppercase text-[8pt] font-normal">Class:</span>{' '}
                    <span className="font-bold">{classLabelEnglish}</span>
                  </div>
                  <div>
                    <span className="uppercase text-[8pt] font-normal">Class Teacher:</span>{' '}
                    <span className="font-bold">{classTeacherName || 'Class Teacher'}</span>
                  </div>
                  <div>
                    <span className="uppercase text-[8pt] font-normal">Academic Year:</span>{' '}
                    <span className="font-mono font-bold">2026–2027</span>
                  </div>
                </div>
              </div>

              {/* Table Container with Horizontal Scroll on Web, Full Width in Print */}
              <div
                onWheel={handleHorizontalWheel}
                className="w-full overflow-x-auto pb-4 relative scrollbar-thin"
              >
                <table className="score-sheet-table w-full min-w-max border-collapse text-center text-xs">
                  <thead className="bg-slate-100 print:bg-slate-50">
                    {/* Top Header Row */}
                    <tr className="border-b border-slate-200 print:border-black text-slate-800">
                      <th
                        rowSpan={2}
                        className="py-2 px-3 text-center border border-slate-300 print:border-black font-bold whitespace-nowrap w-12 bg-slate-100 print:bg-slate-50 font-mono"
                      >
                        Roll No
                      </th>
                      <th
                        rowSpan={2}
                        className="py-2 px-4 text-left border border-slate-300 print:border-black font-bold whitespace-nowrap min-w-[180px] bg-slate-100 print:bg-slate-50"
                      >
                        Student Name
                      </th>
                      {classSubjects.map(sub => {
                        const subName = sub.subjectNameMl || sub.subjectNameEn;
                        return (
                          <th
                            key={sub.subjectId}
                            colSpan={3}
                            className="subject-name py-2 px-3 text-center border border-slate-300 print:border-black font-bold whitespace-nowrap bg-slate-100 print:bg-slate-50"
                          >
                            <div className="font-bold text-slate-900 leading-tight whitespace-nowrap">
                              {subName}
                            </div>
                            <div className="text-[10px] font-mono text-slate-500 font-normal print:text-black whitespace-nowrap">
                              {sub.code} ({sub.maxMarks || 50})
                            </div>
                          </th>
                        );
                      })}
                      <th
                        rowSpan={2}
                        className="py-2 px-3 text-center border border-slate-300 print:border-black font-bold whitespace-nowrap bg-emerald-50/70 print:bg-transparent min-w-[85px]"
                      >
                        Grand Total
                        <div className="text-[9px] text-slate-500 font-normal">/ {classTotalExpectedMax}</div>
                      </th>
                      <th
                        rowSpan={2}
                        className="py-2 px-3 text-center border border-slate-300 print:border-black font-bold whitespace-nowrap bg-emerald-50/70 print:bg-transparent min-w-[75px]"
                      >
                        Percentage
                        <div className="text-[9px] text-slate-500 font-normal">%</div>
                      </th>
                      <th
                        rowSpan={2}
                        className="py-2 px-3 text-center border border-slate-300 print:border-black font-bold whitespace-nowrap bg-slate-100 print:bg-transparent min-w-[80px]"
                      >
                        Attendance
                        <div className="text-[9px] text-slate-500 font-normal">
                          {currentExam?.attendanceCutoffDate ? `Up to ${currentExam.attendanceCutoffDate}` : 'Attended / Total'}
                        </div>
                      </th>
                      <th
                        rowSpan={2}
                        className="py-2 px-3 text-center border border-slate-300 print:border-black font-bold whitespace-nowrap bg-slate-100 print:bg-transparent min-w-[80px]"
                      >
                        Rank
                      </th>
                    </tr>

                    {/* Sub Header Row: TE | CE | Tot */}
                    <tr className="border-b border-slate-200 print:border-black text-slate-700">
                      {classSubjects.map(sub => (
                        <React.Fragment key={`score_sub_cols_${sub.subjectId}`}>
                          <th className="py-1.5 px-3 text-center border border-slate-300 print:border-black font-bold text-[10px] whitespace-nowrap bg-slate-50 print:bg-slate-100">
                            TE
                          </th>
                          <th className="py-1.5 px-3 text-center border border-slate-300 print:border-black font-bold text-[10px] whitespace-nowrap bg-slate-50 print:bg-slate-100">
                            CE
                          </th>
                          <th className="py-1.5 px-3 text-center border border-slate-300 print:border-black font-bold text-[10px] whitespace-nowrap bg-slate-100 print:bg-slate-200 font-mono">
                            Tot
                          </th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-200 print:divide-black">
                    {enrichedScoreSheetReports.map((rep, idx) => {
                      const s = rep?.student;
                      const rankData = scoreSheetRankings.get(s?.id || '') || (s?.admissionNo ? scoreSheetRankings.get(s.admissionNo) : undefined);
                      const metrics = rankData?.metrics || calculateStudentReportMetrics(rep, classTotalExpectedMax, true);

                      return (
                        <tr
                          key={s?.id || idx}
                          className={`transition ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60 print:bg-transparent'} hover:bg-slate-100/50`}
                        >
                          {/* Roll No */}
                          <td className="py-2 px-3 text-center font-mono font-bold text-slate-700 border border-slate-300 print:border-black whitespace-nowrap">
                            {s?.rollNo}
                          </td>
                          {/* Student Name */}
                          <td className="py-2 px-4 text-left font-medium text-slate-900 border border-slate-300 print:border-black whitespace-nowrap">
                            <div className="font-bold">{s?.nameEn}</div>
                            {s?.nameMl && (
                              <div className="text-[10px] text-slate-500 font-ml leading-tight">
                                {s.nameMl}
                              </div>
                            )}
                          </td>

                          {/* Subject Columns: TE | CE | Tot */}
                          {classSubjects.map(subDef => {
                            const subData = (rep.subjects || []).find(sub => sub.subjectId === subDef.subjectId);
                            const subStatus = subjectStatusesMap[subDef.subjectId] || subData?.status || subData?.markSheetStatus;
                            const marks = computeSubjectScoreSheetMarks(subData, subStatus);

                            return (
                              <React.Fragment key={`ss_marks_${s?.id}_${subDef.subjectId}`}>
                                {/* TE */}
                                <td className="py-2 px-3 text-center border border-slate-300 print:border-black font-mono text-[11px] whitespace-nowrap">
                                  {marks.isAbsent ? (
                                    <span className="text-red-600 font-bold">AB</span>
                                  ) : marks.te === '—' ? (
                                    <span className="text-slate-300 print:text-black">—</span>
                                  ) : (
                                    <span className={marks.isFail ? 'text-red-600 font-bold' : 'text-slate-800'}>
                                      {marks.te}
                                    </span>
                                  )}
                                </td>
                                {/* CE */}
                                <td className="py-2 px-3 text-center border border-slate-300 print:border-black font-mono text-[11px] whitespace-nowrap">
                                  {marks.isAbsent ? (
                                    <span className="text-red-600 font-bold">AB</span>
                                  ) : marks.ce === '—' ? (
                                    <span className="text-slate-300 print:text-black">—</span>
                                  ) : (
                                    <span className="text-slate-700">{marks.ce}</span>
                                  )}
                                </td>
                                {/* Tot */}
                                <td className="py-2 px-3 text-center border border-slate-300 print:border-black font-mono text-[11px] font-bold whitespace-nowrap bg-slate-50/60 print:bg-transparent">
                                  {marks.isAbsent ? (
                                    <span className="text-red-600 font-bold">AB</span>
                                  ) : marks.tot === '—' ? (
                                    <span className="text-slate-300 print:text-black">—</span>
                                  ) : (
                                    <span className={marks.isFail ? 'text-red-600 font-bold' : 'text-slate-900'}>
                                      {marks.tot}
                                    </span>
                                  )}
                                </td>
                              </React.Fragment>
                            );
                          })}

                          {/* Grand Total */}
                          <td className="py-2 px-3 text-center border border-slate-300 print:border-black font-mono font-bold text-emerald-950 whitespace-nowrap bg-emerald-50/20 print:bg-transparent">
                            {metrics.displayGrandObtained}
                          </td>

                          {/* Percentage */}
                          <td className="py-2 px-3 text-center border border-slate-300 print:border-black font-mono font-bold text-slate-800 whitespace-nowrap bg-emerald-50/20 print:bg-transparent">
                            {metrics.percentageStr}%
                          </td>

                          {/* Attendance */}
                          <td className="py-2 px-3 text-center border border-slate-300 print:border-black font-mono text-slate-700 whitespace-nowrap">
                            {metrics.attendanceDays}
                          </td>

                          {/* Rank */}
                          <td className="py-2 px-3 text-center border border-slate-300 print:border-black font-bold whitespace-nowrap">
                            {rankData?.isRankAwarded && rankData.rank !== null ? (
                              <span className="font-mono text-emerald-900 font-bold">
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
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          /* ========================================================= */
          /* 3. SPREADSHEET-STYLE RESULT LEDGER TABLE VIEW             */
          /* ========================================================= */
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {classLabelEnglish} Result Ledger ({enrichedReports.length} Students: {ledgerBoysCount} Boys, {ledgerGirlsCount} Girls)
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
                    <th className="py-2.5 px-2 text-center whitespace-nowrap">Gender</th>
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
                        <td className="py-2.5 px-2 text-center whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            determineStudentGender(s, selectedExamId) === 'Girl'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}>
                            {determineStudentGender(s, selectedExamId)}
                          </span>
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
