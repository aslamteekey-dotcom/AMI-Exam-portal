import { StudentProgressReport } from '../types';

export interface StudentCalculationResult {
  grandAttendedObtained: number;
  grandAttendedMax: number;
  displayGrandObtained: number;
  displayGrandMax: number;
  percentageStr: string;
  attendanceDays: number;
  attendanceTotal: number;
  academicRankText: string;
  resultStatus: string;
  displayResultStatus: string;
  resultBadgeColor: string;
  isRankAwarded: boolean;
  classRank: number | null;
  hasAbsent: boolean;
  hasWithheld: boolean;
  hasFailedWritten: boolean;
}

export function extractComponentColumns(components: { key: string; labelEn: string; maxMarks: number; obtainedMarks: number | null }[]) {
  let omrVal: number | string = '—';
  let ocrVal: number | string = '—';
  let cieVal: number | string = '—';
  let omrMax = 0;
  let ocrMax = 0;
  let cieMax = 0;

  (components || []).forEach((c) => {
    const k = (c.key || '').toLowerCase();
    const rawVal = c.obtainedMarks;
    const parsedVal = (rawVal !== null && rawVal !== undefined && (rawVal as any) !== '' && !isNaN(Number(rawVal)))
      ? Number(rawVal)
      : null;
    const val = parsedVal !== null ? parsedVal : '—';

    if (k === 'omr' || k === 'written' || k === 'tilawah' || k === 'new_portion' || k === 'salawat' || k.includes('omr')) {
      omrVal = val;
      omrMax = c.maxMarks || 20;
    } else if (k === 'descriptive' || k === 'tajweed' || k === 'tilawati' || k === 'revision' || k === 'duas' || k === 'oral' || k.includes('desc') || k.includes('ocr')) {
      ocrVal = val;
      ocrMax = c.maxMarks || 20;
    } else if (k === 'ce' || k === 'diary' || k.includes('ce') || k.includes('cie')) {
      cieVal = val;
      cieMax = c.maxMarks || 10;
    }
  });

  // Fallback if component keys were mapped generically
  if (omrMax === 0 && components && components[0]) {
    const rawVal = components[0].obtainedMarks;
    const parsedVal = (rawVal !== null && rawVal !== undefined && (rawVal as any) !== '' && !isNaN(Number(rawVal))) ? Number(rawVal) : null;
    omrVal = parsedVal !== null ? parsedVal : '—';
    omrMax = components[0].maxMarks || 20;
  }
  if (ocrMax === 0 && components && components[1]) {
    const rawVal = components[1].obtainedMarks;
    const parsedVal = (rawVal !== null && rawVal !== undefined && (rawVal as any) !== '' && !isNaN(Number(rawVal))) ? Number(rawVal) : null;
    ocrVal = parsedVal !== null ? parsedVal : '—';
    ocrMax = components[1].maxMarks || 20;
  }
  if (cieMax === 0 && components && components[2]) {
    const rawVal = components[2].obtainedMarks;
    const parsedVal = (rawVal !== null && rawVal !== undefined && (rawVal as any) !== '' && !isNaN(Number(rawVal))) ? Number(rawVal) : null;
    cieVal = parsedVal !== null ? parsedVal : '—';
    cieMax = components[2].maxMarks || 10;
  }

  return { omrVal, ocrVal, cieVal, omrMax, ocrMax, cieMax };
}

export function calculateStudentReportMetrics(
  report: StudentProgressReport,
  totalClassExpectedMax?: number
): StudentCalculationResult {
  let grandAttendedObtained = 0;
  let grandAttendedMax = 0;
  let totalSubjectsMax = 0;
  let hasAbsent = Boolean(report.hasAbsentSubjects || report.resultStatus === 'Absent');
  let hasWithheld = Boolean(report.hasWithheldCe || report.resultStatus === 'Withheld');
  let hasFailedWritten = false;

  (report.subjects || []).forEach((sub) => {
    const { omrVal, ocrVal, cieVal, omrMax, ocrMax, cieMax } = extractComponentColumns(sub.components || []);
    const subMax = sub.maxMarks || (omrMax + ocrMax + cieMax) || 50;
    totalSubjectsMax += subMax;

    if (sub.isAbsent) {
      hasAbsent = true;
    } else {
      const numOmr = typeof omrVal === 'number' && !isNaN(omrVal) ? omrVal : 0;
      const numOcr = typeof ocrVal === 'number' && !isNaN(ocrVal) ? ocrVal : 0;
      const numCie = typeof cieVal === 'number' && !isNaN(cieVal) ? cieVal : 0;
      const compSum = numOmr + numOcr + numCie;

      // Always prioritize sum of attended (OMR + OCR + CIE) components
      const subTotal = compSum > 0
        ? compSum
        : (sub.obtainedMarks !== null && sub.obtainedMarks !== undefined && !isNaN(Number(sub.obtainedMarks)) && Number(sub.obtainedMarks) > 0
            ? Number(sub.obtainedMarks)
            : compSum);

      grandAttendedObtained += subTotal;
      grandAttendedMax += subMax;

      const teMax = omrMax + ocrMax;
      const teObtained = numOmr + numOcr;
      if (teMax > 0 && teObtained < teMax * 0.35) {
        hasFailedWritten = true;
      }
      if ((typeof cieVal === 'number' && cieVal === 0 && cieMax > 0) || (cieVal === '—' && cieMax > 0) || sub.hasMissingCe) {
        hasWithheld = true;
      }
    }
  });

  // Total Marks Obtained: sum of all (OMR + OCR + CIE) marks across attended subjects
  const displayGrandObtained = grandAttendedObtained > 0
    ? grandAttendedObtained
    : (typeof report.attendedObtainedMarks === 'number' && report.attendedObtainedMarks > 0
        ? report.attendedObtainedMarks
        : (typeof report.totalObtainedMarks === 'number' && report.totalObtainedMarks > 0
            ? report.totalObtainedMarks
            : grandAttendedObtained));

  // Total Max Marks: consistently calculated for class (e.g. 400 for 8 subjects)
  const displayGrandMax = totalClassExpectedMax || (totalSubjectsMax > 0 ? totalSubjectsMax : 400);

  // Percentage: calculated against attended max (if attended) or total max, matching the card
  const basePercentageMax = grandAttendedMax > 0 ? grandAttendedMax : displayGrandMax;
  const percentageStr = basePercentageMax > 0
    ? ((displayGrandObtained / basePercentageMax) * 100).toFixed(2)
    : (report?.percentage !== null && report?.percentage !== undefined && !isNaN(report.percentage)
        ? report.percentage.toFixed(2)
        : '0.00');

  const attendanceDays = report.attendance?.daysAttended ?? report?.student?.attendance?.daysAttended ?? 86;
  const attendanceTotal = report.attendance?.totalWorkingDays ?? report?.student?.attendance?.totalWorkingDays ?? 88;

  let displayResultStatus = 'Passed';
  let resultBadgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-200';

  if (hasAbsent) {
    displayResultStatus = 'Absent';
    resultBadgeColor = 'bg-amber-100 text-amber-900 border-amber-200';
  } else if (hasWithheld) {
    displayResultStatus = 'Withheld';
    resultBadgeColor = 'bg-amber-100 text-amber-900 border-amber-200';
  } else if (hasFailedWritten || report.resultStatus === 'Needs Improvement' || report.resultStatus === 'Need Improvement') {
    displayResultStatus = 'Need Improvement';
    resultBadgeColor = 'bg-rose-100 text-rose-800 border-rose-200';
  } else {
    displayResultStatus = 'Passed';
    resultBadgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-200';
  }

  const academicRankText = displayResultStatus === 'Passed'
    ? (report.classRank ? `Rank ${report.classRank}` : 'Passed')
    : displayResultStatus;

  return {
    grandAttendedObtained,
    grandAttendedMax,
    displayGrandObtained,
    displayGrandMax,
    percentageStr,
    attendanceDays,
    attendanceTotal,
    hasAbsent,
    hasWithheld,
    hasFailedWritten,
    displayResultStatus,
    resultStatus: displayResultStatus,
    resultBadgeColor,
    academicRankText,
    isRankAwarded: displayResultStatus === 'Passed',
    classRank: report.classRank ?? null,
  };
}

export function computeClassLedgerRankings(reports: StudentProgressReport[], totalClassExpectedMax?: number) {
  // Determine consistent class max: e.g. 8 subjects * 50 = 400
  const resolvedClassMax = totalClassExpectedMax || reports.reduce((max, r) => {
    const sSum = (r.subjects || []).reduce((sum, s) => sum + (s.maxMarks || 50), 0);
    return Math.max(max, sSum);
  }, 0) || 400;

  // 1. Calculate metrics for all reports
  const reportMetrics = new Map<string, StudentCalculationResult>();
  reports.forEach((r) => {
    const m = calculateStudentReportMetrics(r, resolvedClassMax);
    if (r.student?.id) reportMetrics.set(r.student.id, m);
    if (r.student?.admissionNo) reportMetrics.set(r.student.admissionNo, m);
  });

  // 2. Filter qualified students: ONLY fully Passed students (no absent, no withheld, no failed written)
  const qualified: { sId: string; admissionNo?: string; obtained: number }[] = [];
  reports.forEach((r) => {
    const sId = r.student?.id || r.student?.admissionNo || '';
    const m = reportMetrics.get(sId);
    if (m && m.displayResultStatus === 'Passed') {
      qualified.push({
        sId,
        admissionNo: r.student?.admissionNo,
        obtained: m.displayGrandObtained,
      });
    }
  });

  // Sort qualified students by obtained marks descending
  qualified.sort((a, b) => b.obtained - a.obtained);

  const resultMap = new Map<
    string,
    {
      rank: number | null;
      denseRankText: string;
      isRankAwarded: boolean;
      metrics: StudentCalculationResult;
    }
  >();

  // Assign Dense Ranks: ties share identical rank without skipping rank numbers
  let currentDenseRank = 1;
  for (let i = 0; i < qualified.length; i++) {
    if (i > 0 && qualified[i].obtained < qualified[i - 1].obtained) {
      currentDenseRank++;
    }
    const item = qualified[i];
    const m = reportMetrics.get(item.sId)!;
    const updatedMetrics = {
      ...m,
      classRank: currentDenseRank,
      academicRankText: `Rank ${currentDenseRank}`,
    };
    const entry = {
      rank: currentDenseRank,
      denseRankText: `Rank ${currentDenseRank}`,
      isRankAwarded: true,
      metrics: updatedMetrics,
    };
    if (item.sId) resultMap.set(item.sId, entry);
    if (item.admissionNo) resultMap.set(item.admissionNo, entry);
  }

  // Set non-qualified students (Absent, Withheld, Need Improvement)
  reports.forEach((r) => {
    const sId = r.student?.id || '';
    const adm = r.student?.admissionNo || '';
    if (!resultMap.has(sId) && !resultMap.has(adm)) {
      const m = reportMetrics.get(sId) || reportMetrics.get(adm) || calculateStudentReportMetrics(r, resolvedClassMax);
      const denseText = m.displayResultStatus === 'Absent' ? 'Absent' : (m.displayResultStatus === 'Withheld' ? 'Withheld' : '—');
      const updatedMetrics = {
        ...m,
        classRank: null,
        academicRankText: denseText,
      };
      const entry = {
        rank: null,
        denseRankText: denseText,
        isRankAwarded: false,
        metrics: updatedMetrics,
      };
      if (sId) resultMap.set(sId, entry);
      if (adm) resultMap.set(adm, entry);
    }
  });

  return resultMap;
}
