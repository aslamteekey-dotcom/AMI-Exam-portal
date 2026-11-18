import { ClassTimetableDoc, TimetableDayName, TimetablePeriod, User } from '../types';

export const TIMETABLE_DAYS: TimetableDayName[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export const DAY_INDEX_TO_NAME = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export const DAY_NAME_ML: Record<string, string> = {
  Sunday: 'ഞായറാഴ്ച',
  Monday: 'തിങ്കളാഴ്ച',
  Tuesday: 'ചൊവ്വാഴ്ച',
  Wednesday: 'ബുധനാഴ്ച',
  Thursday: 'വ്യാഴാഴ്ച',
  Friday: 'വെള്ളിയാഴ്ച',
  Saturday: 'ശനിയാഴ്ച',
};

export const TIMETABLE_CLASS_NUMBERS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

export interface PeriodTimingInfo {
  period: 1 | 2 | 3;
  start: string;
  end: string;
  label: string;
}

/**
 * Exact Period Timings:
 * - Mon, Tue, Wed, Thu, Sat:
 *   Period 1: 06:45-07:15
 *   Period 2: 07:15-07:50
 *   Period 3: 07:50-08:25
 * - Friday:
 *   Period 1: 06:45-07:10
 *   Period 2: 07:10-07:40
 *   Period 3: 07:40-08:15
 */
export function getPeriodTimings(dayName: string): PeriodTimingInfo[] {
  if (dayName === 'Friday') {
    return [
      { period: 1, start: '06:45', end: '07:10', label: '06:45 - 07:10' },
      { period: 2, start: '07:10', end: '07:40', label: '07:10 - 07:40' },
      { period: 3, start: '07:40', end: '08:15', label: '07:40 - 08:15' },
    ];
  }
  return [
    { period: 1, start: '06:45', end: '07:15', label: '06:45 - 07:15' },
    { period: 2, start: '07:15', end: '07:50', label: '07:15 - 07:50' },
    { period: 3, start: '07:50', end: '08:25', label: '07:50 - 08:25' },
  ];
}

export function getTimingForPeriod(dayName: string, periodNum: 1 | 2 | 3): string {
  const list = getPeriodTimings(dayName);
  return list.find(t => t.period === periodNum)?.label || '';
}

/**
 * CRITICAL TIME LOGIC (The "5 PM Rollover"):
 * 1. const now = new Date();
 * 2. let displayDay = now.getDay(); // 0=Sun, 1=Mon...6=Sat
 * 3. if (now.getHours() >= 17) { displayDay = (displayDay + 1) % 7; }
 * 4. If displayDay === 0 (Sunday), the UI MUST display a "Holiday" state.
 */
export function getTimetableDisplayDay(now: Date = new Date()): {
  displayDay: number;
  dayName: (typeof DAY_INDEX_TO_NAME)[number];
  dayNameMl: string;
  isHoliday: boolean;
  rolledOver: boolean;
} {
  let displayDay = now.getDay(); // 0=Sun, 1=Mon...6=Sat
  const rolledOver = now.getHours() >= 17;
  if (rolledOver) {
    displayDay = (displayDay + 1) % 7;
  }
  const dayName = DAY_INDEX_TO_NAME[displayDay] || 'Sunday';
  return {
    displayDay,
    dayName,
    dayNameMl: DAY_NAME_ML[dayName] || dayName,
    isHoliday: displayDay === 0,
    rolledOver,
  };
}

/**
 * Extracts numeric class grade string ("1" .. "9") from any class identifier
 * e.g., "class_1" -> "1", "cls_7" -> "7", "Class 5" -> "5", "5" -> "5"
 */
export function extractTimetableClassNumber(val?: string | number | null): string | null {
  if (val === undefined || val === null) return null;
  const str = String(val).trim();
  if (!str) return null;
  const digits = str.replace(/\D/g, '');
  if (!digits) return null;
  const num = parseInt(digits, 10);
  if (isNaN(num) || num < 1 || num > 12) return null;
  return String(num);
}

/**
 * Canonical Firestore document ID for a class timetable: `class_1` .. `class_9`
 */
export function getTimetableDocId(classIdOrGrade: string | number): string {
  const grade = extractTimetableClassNumber(classIdOrGrade);
  return grade ? `class_${grade}` : String(classIdOrGrade);
}

/**
 * Normalizes a Firestore timetable document snapshot into a strict ClassTimetableDoc
 */
export function normalizeClassTimetableDoc(
  docId: string,
  data: Record<string, any>
): ClassTimetableDoc | null {
  const grade =
    extractTimetableClassNumber(data?.classId) || extractTimetableClassNumber(docId);
  if (!grade) return null;

  const rawSchedule = data?.schedule && typeof data.schedule === 'object' ? data.schedule : {};
  const normalizedSchedule: Partial<Record<TimetableDayName, TimetablePeriod[]>> = {};

  TIMETABLE_DAYS.forEach(day => {
    const rawPeriods = Array.isArray(rawSchedule[day]) ? rawSchedule[day] : [];
    const cleanedPeriods: TimetablePeriod[] = rawPeriods
      .map((p: any) => ({
        period: (Number(p?.period) as 1 | 2 | 3) || 1,
        subject: String(p?.subject || '').trim(),
        teacherShortName: String(p?.teacherShortName || '').trim(),
      }))
      .filter((p: TimetablePeriod) => p.period >= 1 && p.period <= 3 && (p.subject !== '' || p.teacherShortName !== ''))
      .sort((a: TimetablePeriod, b: TimetablePeriod) => a.period - b.period);

    if (cleanedPeriods.length > 0) {
      normalizedSchedule[day] = cleanedPeriods;
    }
  });

  return {
    id: docId,
    classId: grade,
    schedule: normalizedSchedule,
    updatedAt: data?.updatedAt,
    updatedBy: data?.updatedBy,
  };
}

/**
 * Checks whether at least one period entry exists across timetable docs
 */
export function hasAnyTimetableEntries(docs: ClassTimetableDoc[]): boolean {
  return docs.some(d =>
    TIMETABLE_DAYS.some(day =>
      Array.isArray(d.schedule?.[day]) &&
      d.schedule[day]!.some(p => Boolean(p.subject?.trim() || p.teacherShortName?.trim()))
    )
  );
}

/**
 * Checks whether a single class timetable doc has any configured periods
 */
export function hasClassTimetableEntries(docData: ClassTimetableDoc | null | undefined): boolean {
  if (!docData || !docData.schedule) return false;
  return TIMETABLE_DAYS.some(
    day =>
      Array.isArray(docData.schedule[day]) &&
      docData.schedule[day]!.some(p => Boolean(p.subject?.trim() || p.teacherShortName?.trim()))
  );
}

/**
 * Official Teacher Short Code Guide
 */
export interface TeacherShortCodeEntry {
  code: string;
  name: string;
  note?: string;
}

export const TEACHER_SHORT_CODE_GUIDE: TeacherShortCodeEntry[] = [
  { code: 'YP', name: 'Ahmed Yaseen P' },
  { code: 'CH', name: 'Thahira CH' },
  { code: 'KPS', name: 'Abdus Salam KP' },
  { code: 'VK', name: 'Sareena VK' },
  { code: 'TK7', name: 'Aslam TK', note: 'For Class 7 duties' },
  { code: 'TK9', name: 'Aslam TK', note: 'For Class 9 duties' },
  { code: 'PK', name: 'Hadhi Mishab PK' },
  { code: 'SM', name: 'Sabira M' },
  { code: 'KK', name: 'Khadeeja K' },
];

/**
 * Conditional Working Days per Class:
 * - Class 9: Monday, Wednesday, Friday
 * - Class 8: Tuesday, Thursday, Saturday
 * - Classes 1 to 7: Monday through Saturday
 */
export function getWorkingDaysForClass(classNumOrId?: string | number | null): TimetableDayName[] {
  const grade = extractTimetableClassNumber(classNumOrId);
  if (grade === '9') {
    return ['Monday', 'Wednesday', 'Friday'];
  }
  if (grade === '8') {
    return ['Tuesday', 'Thursday', 'Saturday'];
  }
  return [...TIMETABLE_DAYS];
}

/**
 * Conditional Period Numbers per Class:
 * - Class 8 and Class 9: ONLY 2 periods (P1, P2)
 * - Classes 1 to 7: 3 periods (P1, P2, P3)
 */
export function getPeriodNumbersForClass(classNumOrId?: string | number | null): (1 | 2 | 3)[] {
  const grade = extractTimetableClassNumber(classNumOrId);
  if (grade === '8' || grade === '9') {
    return [1, 2];
  }
  return [1, 2, 3];
}

/**
 * Builds normalized candidate short codes derived from a live Teacher user record.
 * Never injects dummy data — derives solely from the passed live User object.
 */
export function getTeacherMatchCandidates(teacher: Partial<User> | null | undefined): string[] {
  if (!teacher) return [];
  const candidates = new Set<string>();
  const add = (val?: string | null) => {
    if (!val) return;
    const norm = String(val).trim().toUpperCase();
    if (!norm) return;
    candidates.add(norm);
    const compact = norm.replace(/[\s.]+/g, '');
    if (compact) candidates.add(compact);
  };

  // 1. Explicit stored short code fields
  add(teacher.shortCode);
  add((teacher as any).teacherShortName);
  add((teacher as any).shortName);

  // 2. Name / Username exact forms
  const primaryName = String(teacher.nameEn || teacher.name || '').trim();
  add(primaryName);
  add(teacher.name);
  add(teacher.username);

  // 3. Configured Teacher Short Code Mappings
  const lowerName = `${primaryName} ${teacher.name || ''} ${teacher.username || ''}`.toLowerCase();
  if (/yaseen/i.test(lowerName)) add('YP');
  if (/thahira/i.test(lowerName)) add('CH');
  if (/abdus\s*salam|abdul\s*salam|\bsalam\b/i.test(lowerName)) add('KPS');
  if (/sareena/i.test(lowerName)) add('VK');
  if (/aslam/i.test(lowerName)) {
    add('TK7');
    add('TK9');
  }
  if (/hadh?i\s*mishab|mishab/i.test(lowerName)) add('PK');
  if (/sabira/i.test(lowerName)) add('SM');
  if (/khadeeja|kadeeja/i.test(lowerName)) add('KK');

  // 4. Derived multi-word initials (ignoring generic honorific prefixes)
  if (primaryName) {
    const cleanedWords = primaryName
      .replace(/[.,]/g, ' ')
      .split(/\s+/)
      .map(w => w.trim())
      .filter(Boolean)
      .filter(w => !/^(usthad|usthadh|ustad|moulavi|maulavi|musliyar|faizy|hudawi|darimi|mr|mrs|ms|dr|muhammed|mohammed|muhammad)$/i.test(w));

    const allWords = primaryName
      .replace(/[.,]/g, ' ')
      .split(/\s+/)
      .map(w => w.trim())
      .filter(Boolean);

    const buildInitials = (words: string[]) => {
      if (words.length >= 2) {
        add(words.map(w => w[0]).join(''));
        add(words.slice(0, 2).map(w => w[0]).join(''));
      }
    };

    buildInitials(allWords);
    buildInitials(cleanedWords);
  }

  return Array.from(candidates);
}

/**
 * Matches a timetable period's `teacherShortName` against the logged-in teacher
 */
export function doesTeacherMatchPeriod(
  teacher: Partial<User> | null | undefined,
  teacherShortName?: string | null
): boolean {
  if (!teacher || !teacherShortName) return false;
  const raw = String(teacherShortName).trim().toUpperCase();
  if (!raw) return false;
  const compact = raw.replace(/[\s.]+/g, '');

  const candidates = getTeacherMatchCandidates(teacher);
  return candidates.includes(raw) || candidates.includes(compact);
}
