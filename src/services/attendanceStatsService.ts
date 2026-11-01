import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { DailyAttendanceRecord, ClassAttendanceConfig, InstitutionHoliday } from '../types';

export interface MonthlyAttendanceDayDetail {
  date: string;
  dayName: string;
  presentCount: number;
  absentCount: number;
  totalRoll: number;
  percentage: number;
  isHoliday?: boolean;
  holidayReason?: string;
}

export interface MonthlyAttendanceStats {
  totalSchoolDays: number;
  averageNosOnRoll: number;
  averageAttendance: number;
  // Extended descriptive statistics
  attendancePercentage: number;
  totalPresentSum: number;
  totalAbsentSum: number;
  dailyDetails: MonthlyAttendanceDayDetail[];
  classId: string;
  year: number;
  month: number;
  monthNameEn: string;
  monthNameMl: string;
}

const MONTH_NAMES: { en: string; ml: string }[] = [
  { en: 'January', ml: 'ജനുവരി' },
  { en: 'February', ml: 'ഫെബ്രുവരി' },
  { en: 'March', ml: 'മാർച്ച്' },
  { en: 'April', ml: 'ഏപ്രിൽ' },
  { en: 'May', ml: 'മേയ്' },
  { en: 'June', ml: 'ജൂൺ' },
  { en: 'July', ml: 'ജൂലൈ' },
  { en: 'August', ml: 'ഓഗസ്റ്റ്' },
  { en: 'September', ml: 'സെപ്റ്റംബർ' },
  { en: 'October', ml: 'ഒക്ടോബർ' },
  { en: 'November', ml: 'നവംബർ' },
  { en: 'December', ml: 'ഡിസംബർ' },
];

/**
 * Normalizes class ID matching across representations:
 * e.g., 'cls_7', 'class-7', 'Class 7', '7' are all treated as matches.
 */
function isClassMatch(targetClassId: string | undefined | null, candidateClassId: string | undefined | null): boolean {
  if (!targetClassId || !candidateClassId) return false;
  const cleanTarget = String(targetClassId).trim().toLowerCase();
  const cleanCandidate = String(candidateClassId).trim().toLowerCase();
  if (cleanTarget === cleanCandidate) return true;

  const targetDigits = cleanTarget.replace(/\D/g, '');
  const candidateDigits = cleanCandidate.replace(/\D/g, '');
  if (targetDigits && candidateDigits && targetDigits === candidateDigits) {
    return true;
  }
  return false;
}

/**
 * Extracts Year and Month (1-12) from string date or timestamp.
 * Handles 'YYYY-MM-DD', 'YYYY/MM/DD', 'DD-MM-YYYY', etc.
 */
function parseDateYearAndMonth(dateStr: string | any): { year: number; month: number } | null {
  if (!dateStr) return null;
  const str = String(dateStr).trim();

  // 1. Standard ISO format: YYYY-MM-DD or YYYY-M-D
  const isoParts = str.split('-');
  if (isoParts.length >= 2 && isoParts[0].length === 4) {
    const y = parseInt(isoParts[0], 10);
    const m = parseInt(isoParts[1], 10);
    if (!isNaN(y) && !isNaN(m) && m >= 1 && m <= 12) {
      return { year: y, month: m };
    }
  }

  // 2. Slashes: YYYY/MM/DD
  const slashParts = str.split('/');
  if (slashParts.length >= 2 && slashParts[0].length === 4) {
    const y = parseInt(slashParts[0], 10);
    const m = parseInt(slashParts[1], 10);
    if (!isNaN(y) && !isNaN(m) && m >= 1 && m <= 12) {
      return { year: y, month: m };
    }
  }

  // 3. Date object / timestamp parse
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  }

  return null;
}

/**
 * Calculates monthly attendance statistics for a specific class.
 * Aligns with the actual Firestore schema:
 * - Reads class config documents (e.g., 'cls_1', 'cls_7') containing `dailyRecords: { [dateStr]: DailyAttendanceRecord }`
 * - Also consolidates standalone daily documents 'attendance/{classId}_{date}'
 * - Locally filters records matching the selected year and month
 * - Computes Total School Days, Average Nos On Roll, and Average Attendance
 *
 * @param {string} classId - The ID of the class (e.g., 'cls_1', 'cls_7', '7')
 * @param {number} year - The selected year (e.g., 2026)
 * @param {number} month - The selected month (1-12)
 * @returns {Promise<MonthlyAttendanceStats>}
 */
export async function calculateMonthlyAttendanceStats(
  classId: string,
  year: number,
  month: number
): Promise<MonthlyAttendanceStats> {
  const normalizedMonth = Math.max(1, Math.min(12, Math.floor(month)));
  const monthMeta = MONTH_NAMES[normalizedMonth - 1] || {
    en: `Month ${normalizedMonth}`,
    ml: `മാസം ${normalizedMonth}`,
  };

  // Map to hold all consolidated daily records for this class: dateStr ('YYYY-MM-DD') -> record
  const recordsByDate = new Map<string, any>();

  // Set of declared institution holiday date strings
  const declaredHolidays = new Set<string>();

  let activeEnrolledStudentCount = 0;

  // =========================================================================
  // STEP 1: FETCH FROM FIRESTORE ATTENDANCE COLLECTION
  // =========================================================================
  try {
    // 1a. Attempt direct fetch of the class document (fastest path: doc(db, 'attendance', classId))
    const possibleDocIds = [
      classId,
      `cls_${classId.replace(/\D/g, '')}`,
      `class_${classId.replace(/\D/g, '')}`,
      classId.replace(/\D/g, ''),
    ].filter(Boolean);

    for (const docId of Array.from(new Set(possibleDocIds))) {
      try {
        const directSnap = await getDoc(doc(db, 'attendance', docId));
        if (directSnap.exists()) {
          const cfgData = directSnap.data() as ClassAttendanceConfig;
          if (cfgData.dailyRecords && typeof cfgData.dailyRecords === 'object') {
            Object.entries(cfgData.dailyRecords).forEach(([dKey, rec]) => {
              if (rec && !recordsByDate.has(dKey)) {
                recordsByDate.set(dKey, { ...rec, date: rec.date || dKey });
              }
            });
          }
        }
      } catch (err) {
        // Continue to collection scan
      }
    }

    // 1b. Fetch all documents from attendance collection to catch both root configs & standalone daily docs
    const attendanceSnap = await getDocs(collection(db, 'attendance'));
    attendanceSnap.docs.forEach(docSnap => {
      const docData = docSnap.data();
      const docId = docSnap.id;

      // Check if this document belongs to the target class
      const matchesDocId = isClassMatch(classId, docId);
      const matchesField = isClassMatch(classId, docData.classId);
      const isDailyDocOfClass =
        docId.startsWith(`${classId}_`) ||
        (classId.replace(/\D/g, '') && docId.startsWith(`cls_${classId.replace(/\D/g, '')}_`)) ||
        isClassMatch(classId, docId.split('_')[0]);

      if (matchesDocId || matchesField || isDailyDocOfClass) {
        // If it's a class config containing a dailyRecords map
        if (docData.dailyRecords && typeof docData.dailyRecords === 'object') {
          Object.entries(docData.dailyRecords).forEach(([dKey, rec]: [string, any]) => {
            if (rec && !recordsByDate.has(dKey)) {
              recordsByDate.set(dKey, { ...rec, date: rec.date || dKey });
            }
          });
        }

        // If it's a standalone daily document (has date)
        if (docData.date) {
          const dKey = String(docData.date).trim();
          if (!recordsByDate.has(dKey)) {
            recordsByDate.set(dKey, { ...docData, date: dKey });
          }
        }
      }
    });

    // 1c. Fetch institution holidays to safeguard official holiday dates
    try {
      const holSnap = await getDocs(collection(db, 'institutionHolidays'));
      holSnap.docs.forEach(hDoc => {
        const hData = hDoc.data() as InstitutionHoliday;
        const targetClasses: string[] = Array.isArray(hData.targetClasses) ? hData.targetClasses : ['all'];
        const isTargeted =
          targetClasses.includes('all') ||
          targetClasses.some(tc => isClassMatch(classId, tc));

        if (isTargeted) {
          const hDate = hData.date || hDoc.id;
          if (hDate && hDate.length === 10) {
            declaredHolidays.add(hDate);
          }
          if (hData.rangeStart && hData.rangeEnd) {
            const startD = new Date(hData.rangeStart);
            const endD = new Date(hData.rangeEnd);
            const curr = new Date(startD);
            while (curr <= endD) {
              const yStr = curr.getFullYear();
              const mStr = String(curr.getMonth() + 1).padStart(2, '0');
              const dStr = String(curr.getDate()).padStart(2, '0');
              declaredHolidays.add(`${yStr}-${mStr}-${dStr}`);
              curr.setDate(curr.getDate() + 1);
            }
          }
        }
      });
    } catch {}

    // 1d. Fetch active enrolled students count for this class
    try {
      const studentsSnap = await getDocs(collection(db, 'students'));
      const activeStudents = studentsSnap.docs.filter(sDoc => {
        const sData = sDoc.data();
        const sClass = sData.classId || sData.class;
        return isClassMatch(classId, sClass) && sData.status !== 'inactive';
      });
      activeEnrolledStudentCount = activeStudents.length;
    } catch {}
  } catch (firestoreErr) {
    console.warn('Firestore attendance fetch warning, checking clientStorageApi fallback:', firestoreErr);
  }

  // =========================================================================
  // STEP 2: FALLBACK FROM LOCAL STORAGE (OFFLINE / SYNC BACKUP)
  // =========================================================================
  try {
    const rawDb = localStorage.getItem('madrasa_db_storage_v2');
    if (rawDb) {
      const parsed = JSON.parse(rawDb);

      // Check attendanceConfigs
      if (Array.isArray(parsed.attendanceConfigs)) {
        parsed.attendanceConfigs.forEach((cfg: any) => {
          if (isClassMatch(classId, cfg.classId) && cfg.dailyRecords) {
            Object.entries(cfg.dailyRecords).forEach(([dKey, rec]: [string, any]) => {
              if (rec && !recordsByDate.has(dKey)) {
                recordsByDate.set(dKey, { ...rec, date: rec.date || dKey });
              }
            });
          }
        });
      }

      // Check active students count fallback
      if (activeEnrolledStudentCount === 0 && Array.isArray(parsed.students)) {
        const enrolled = parsed.students.filter((st: any) => {
          const sClass = st.classId || st.class;
          return isClassMatch(classId, sClass) && st.status !== 'inactive';
        });
        activeEnrolledStudentCount = enrolled.length;
      }
    }
  } catch (storageErr) {
    console.warn('Local storage fallback error:', storageErr);
  }

  // =========================================================================
  // STEP 3: FILTER LOCALLY IN JAVASCRIPT BY MONTH & YEAR & CALCULATE STATS
  // =========================================================================
  const uniqueSchoolDays = new Set<string>();
  let totalPresentMarksSum = 0;
  let totalRollSum = 0;
  const dailyDetails: MonthlyAttendanceDayDetail[] = [];

  // Sort dates chronologically
  const allDateKeys = Array.from(recordsByDate.keys()).sort();

  for (const dateKey of allDateKeys) {
    const rec = recordsByDate.get(dateKey);
    if (!rec) continue;

    const actualDate = String(rec.date || dateKey).trim();
    const ym = parseDateYearAndMonth(actualDate);
    if (!ym) continue;

    // Filter strictly by target year and month
    if (ym.year !== year || ym.month !== normalizedMonth) {
      continue;
    }

    // Check if day is a holiday
    const isHoliday =
      rec.isHoliday === true ||
      rec.status === 'holiday' ||
      rec.status === 'OFF' ||
      declaredHolidays.has(actualDate);

    if (isHoliday) {
      continue; // School days exclude non-working holidays
    }

    // 1. Calculate 'Present' count on this day
    let pres = 0;
    if (Array.isArray(rec.presentStudentIds)) {
      pres = rec.presentStudentIds.length;
    } else if (rec.statusMap && typeof rec.statusMap === 'object') {
      pres = Object.values(rec.statusMap).filter(
        v => v === true || v === 'Present' || v === 'P' || v === 'present'
      ).length;
    } else if (Array.isArray(rec.students)) {
      pres = rec.students.filter(
        (s: any) =>
          s.status === 'present' ||
          s.status === 'Present' ||
          s.status === 'P' ||
          s.present === true ||
          s.isPresent === true
      ).length;
    }

    // 2. Calculate absent count
    let abs = 0;
    if (Array.isArray(rec.absentStudentIds)) {
      abs = rec.absentStudentIds.length;
    } else if (rec.statusMap && typeof rec.statusMap === 'object') {
      abs = Object.values(rec.statusMap).filter(
        v => v === false || v === 'Absent' || v === 'A' || v === 'absent'
      ).length;
    }

    // 3. Calculate enrolled students on roll for this day
    let dayRoll = 0;
    if (Array.isArray(rec.students) && rec.students.length > 0) {
      dayRoll = rec.students.length;
    } else if (rec.statusMap && Object.keys(rec.statusMap).length > 0) {
      dayRoll = Object.keys(rec.statusMap).length;
    } else if (pres + abs > 0) {
      dayRoll = pres + abs;
    }

    // Fallback to active enrolled student count if record roll is 0 or less than present count
    if (dayRoll === 0 || dayRoll < pres) {
      dayRoll = activeEnrolledStudentCount > 0 ? Math.max(pres, activeEnrolledStudentCount) : pres;
    }
    if (abs === 0 && dayRoll > pres) {
      abs = dayRoll - pres;
    }

    // 4. Verify that this was an active school day where attendance was marked
    const hasRecordedMarks =
      Boolean(rec.markedAt) ||
      pres > 0 ||
      abs > 0 ||
      (rec.presentStudentIds && rec.presentStudentIds.length > 0) ||
      (rec.absentStudentIds && rec.absentStudentIds.length > 0) ||
      (rec.statusMap && Object.keys(rec.statusMap).length > 0);

    if (hasRecordedMarks) {
      uniqueSchoolDays.add(actualDate);
      totalPresentMarksSum += pres;
      totalRollSum += dayRoll;

      const dObj = new Date(actualDate);
      const dayName = !isNaN(dObj.getTime())
        ? dObj.toLocaleDateString('en-US', { weekday: 'short' })
        : '';

      dailyDetails.push({
        date: actualDate,
        dayName,
        presentCount: pres,
        absentCount: abs,
        totalRoll: dayRoll,
        percentage: dayRoll > 0 ? Number(((pres / dayRoll) * 100).toFixed(1)) : 0,
        isHoliday: false,
      });
    }
  }

  // =========================================================================
  // STEP 4: STRICT STATISTICAL FORMULAS (FIXED TO 2 DECIMALS)
  // =========================================================================
  // 1. Total School Days = Count of attendance documents/records in selected month & year
  const totalSchoolDays = uniqueSchoolDays.size;

  // 2. Average Nos On Roll = Average of total enrolled students across school days (or active student count)
  const averageNosOnRoll = totalSchoolDays > 0
    ? Number((totalRollSum / totalSchoolDays).toFixed(2))
    : (activeEnrolledStudentCount > 0 ? Number(activeEnrolledStudentCount.toFixed(2)) : 0);

  // 3. Average Attendance = (Total 'Present' marks across all days in that month) / (Total School Days)
  const averageAttendance = totalSchoolDays > 0
    ? Number((totalPresentMarksSum / totalSchoolDays).toFixed(2))
    : 0;

  // 4. Attendance Percentage
  const attendancePercentage = averageNosOnRoll > 0
    ? Number(((averageAttendance / averageNosOnRoll) * 100).toFixed(2))
    : 0;

  return {
    totalSchoolDays,
    averageNosOnRoll,
    averageAttendance,
    attendancePercentage,
    totalPresentSum: totalPresentMarksSum,
    totalAbsentSum: Math.max(0, totalRollSum - totalPresentMarksSum),
    dailyDetails,
    classId,
    year,
    month: normalizedMonth,
    monthNameEn: `${monthMeta.en} ${year}`,
    monthNameMl: `${monthMeta.ml} ${year}`,
  };
}

export default calculateMonthlyAttendanceStats;
