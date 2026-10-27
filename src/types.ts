export type UserRole = 'admin' | 'teacher' | 'parent';

export interface ModulePermission {
  view: boolean;
  edit: boolean;
}

export interface AdminPermissions {
  students: ModulePermission;
  teachers: ModulePermission;
  academicExams: ModulePermission;
  marksReports: ModulePermission;
  feesCollections: ModulePermission;
  settings: ModulePermission;
}

export const DEFAULT_ADMIN_PERMISSIONS: AdminPermissions = {
  students: { view: true, edit: true },
  teachers: { view: true, edit: true },
  academicExams: { view: true, edit: true },
  marksReports: { view: true, edit: true },
  feesCollections: { view: true, edit: true },
  settings: { view: true, edit: true },
};

export interface User {
  id: string;
  username: string;
  name: string;
  nameEn?: string;
  nameMl?: string;
  role: UserRole;
  isSubAdmin?: boolean;
  permissions?: AdminPermissions;
  plainPassword?: string;
  passwordHash?: string;
  active: boolean;
  email?: string;
  phone?: string;
  inChargeClassId?: string;
  assignments?: TeacherAssignment[];
  assignedSubjects?: TeacherAssignment[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ClassItem {
  id: string;
  name: string;
  nameMl: string;
  numericGrade: number;
  division?: string;
  active: boolean;
}

export interface SubjectAssessmentRule {
  componentKey: string;
  labelEn: string;
  labelMl: string;
  maxMarks: number;
}

export interface SubjectItem {
  id: string;
  code: string;
  nameEn: string;
  nameMl: string;
  displayNameEn?: string;
  displayNameMl?: string;
  applicableClasses: number[];
  specialClassNames?: Record<number, { nameEn: string; nameMl: string }>;
  defaultComponents: SubjectAssessmentRule[];
  classComponentOverrides?: Record<number, SubjectAssessmentRule[]>;
}

export interface AcademicYear {
  id: string;
  year: string;
  isCurrent: boolean;
}

export interface Examination {
  id: string;
  academicYearId: string;
  nameEn: string;
  nameMl: string;
  startDate: string;
  endDate: string;
  isPublished: boolean;
  publishedAt?: string;
  scheduledPublishDate?: string;
  status: 'draft' | 'ongoing' | 'evaluating' | 'ready_to_publish' | 'published' | 'approved' | 'completed' | (string & {});
  classesParticipating?: string[];
  passMarkPercentage: number;
  attendanceCutoffDate?: string;
  publishedClasses?: string[];
  lockedClasses?: string[];
  classPublishStatus?: Record<string, boolean>;
}

/**
 * Checks whether examination results for a specific class have been explicitly published.
 * Distinct from locking: marks can be locked by Principal, but results are only visible
 * to parents if explicitly published for that class or overall examination.
 */
export function isClassResultsPublished(
  exam: Examination | null | undefined,
  classId: string | null | undefined
): boolean {
  if (!exam) return false;
  if (classId) {
    if (exam.publishedClasses && Array.isArray(exam.publishedClasses)) {
      if (exam.publishedClasses.includes(classId)) return true;
    }
    if (exam.classPublishStatus && typeof exam.classPublishStatus === 'object') {
      if (exam.classPublishStatus[classId] === true) return true;
      if (exam.classPublishStatus[classId] === false) return false;
    }
  }
  // If exam has isPublished: true or status is published, and no specific class restrictions
  if (exam.isPublished === true || exam.status === 'published') {
    if (!exam.publishedClasses || exam.publishedClasses.length === 0 || (classId && exam.publishedClasses.includes(classId))) {
      return true;
    }
  }
  return false;
}

export interface Student {
  id: string;
  admissionNo: string;
  rollNo: number;
  nameEn: string;
  nameMl: string;
  classId: string;
  class?: string; // Madrasa class name (e.g., 'Class 1' to 'Class 9')
  academicYearId: string;
  parentNameEn: string;
  parentNameMl: string;
  parentPhone: string;
  parentUserId?: string;
  status: 'active' | 'inactive';
  dob?: string;
  gender?: 'Boy' | 'Girl' | 'M' | 'F' | string;
  schoolClass?: string; // Regular school grade/class (e.g., 'Class 1' to 'Class 10', 'Plus Two')
  examRegisterNumbers?: Record<string, string>; // examinationId -> exam register number
  examRegisterNos?: Record<string, string>; // examinationId -> exam register number (cloud persistence schema alias)
  examRegNo?: string; // current active exam register number (cloud persistence schema alias)
  regNo?: string; // register number alias
  isRegNoLocked?: boolean; // Flag indicating manually assigned/edited register number override
  attendance?: {
    daysAttended: number;
    totalWorkingDays: number;
  };
}

export interface TeacherAssignment {
  id: string;
  teacherId: string;
  classId: string;
  subjectId: string;
}

export interface StudentMarkEntry {
  studentId: string;
  isAbsent: boolean;
  componentMarks: Record<string, number>;
  subjectTotal: number;
  remarks?: string;
}

export interface MarkSheet {
  id: string;
  examinationId: string;
  examId?: string;
  examName?: string;
  examNameEn?: string;
  examNameMl?: string;
  academicYearId: string;
  classId: string;
  subjectId: string;
  assignedTeacherId: string;
  status: 'not_started' | 'draft' | 'submitted' | 'approved' | 'locked' | 'returned_for_correction';
  studentMarks: Record<string, StudentMarkEntry>;
  submittedAt?: string;
  verifiedAt?: string;
  verifiedBy?: string;
  isPublished?: boolean;
  publishedAt?: string;
  lockedAt?: string;
  returnedReason?: string;
  lastUpdated?: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  user?: string;
  userName?: string;
  role?: string;
  userRole?: string;
  userId?: string;
  action: string;
  recordType?: string;
  recordId?: string;
  details: string;
  previousValue?: any;
  newValue?: any;
}

export interface InstitutionSettings {
  madrasaNameEn: string;
  madrasaNameMl: string;
  madrasaArabicHeader: string;
  locationEn: string;
  locationMl: string;
  phone: string;
  email: string;
  registrationNo: string;
  principalNameEn: string;
  principalNameMl: string;
  showTeacherSignature: boolean;
  showPrincipalSignature: boolean;
  showParentSignature: boolean;
  reportHeaderNotesEn: string;
  reportHeaderNotesMl: string;
  activeAcademicYearId: string;
  activeExamId: string;
  institutionName?: string;
  institutionNameMl?: string;
  institutionSubtitle?: string;
  registrationNumber?: string;
}

export interface ProgressReportSubject {
  subjectId: string;
  code: string;
  subjectNameEn: string;
  subjectNameMl: string;
  maxMarks: number;
  obtainedMarks: number | null;
  isAbsent: boolean;
  hasMissingCe: boolean;
  components: {
    key: string;
    labelEn: string;
    labelMl: string;
    maxMarks: number;
    obtainedMarks: number | null;
  }[];
  isComplete: boolean;
  statusTextEn: string;
  statusTextMl: string;
  status?: string;
  markSheetStatus?: string;
}

export interface StudentProgressReport {
  student: Student;
  examination: Examination;
  academicYear: string;
  classNameEn: string;
  classNameMl: string;
  subjects: ProgressReportSubject[];
  totalMaxMarks: number;
  totalObtainedMarks: number;
  attendedObtainedMarks?: number;
  attendedMaxMarks?: number;
  examRegisterNo?: string;
  nonCeDiaryMax?: number;
  nonCeDiaryObtained?: number;
  percentage: number | null;
  classRank: number | null;
  totalStudentsInClass: number;
  hasIncompleteSubjects: boolean;
  hasAbsentSubjects: boolean;
  hasWithheldCe?: boolean;
  resultStatus: 'Passed' | 'Need Improvement' | 'Needs Improvement' | 'Withheld' | 'Incomplete' | 'Absent';
  resultStatusMl: 'വിജയിച്ചു' | 'മെച്ചപ്പെടേണ്ടതുണ്ട്' | 'തടഞ്ഞുവെച്ചു (Withheld)' | 'പൂർണ്ണമല്ല' | 'പങ്കെടുത്തില്ല';
  isPublished: boolean;
  attendance?: {
    daysAttended: number;
    totalWorkingDays: number;
  };
  denseRankText?: string; // e.g. "Rank 1", "Need Improvement", "Withheld", "Absent"
  classTeacherName?: string;
}

export const TUITION_FEE_MONTHS = [
  'June 2026',
  'July 2026',
  'August 2026',
  'September 2026',
  'October 2026',
  'November 2026',
  'December 2026',
  'January 2027',
  'February 2027',
  'March 2027',
  'April 2027',
  'May 2027',
] as const;

export type FeeMonth = (typeof TUITION_FEE_MONTHS)[number];

export interface SpecialFeeBreakdown {
  podhuPareeksha?: number;   // Board Exam fee (₹500 for Class 7 & 9)
  desheeyaPariksha?: number; // Desheeya Pariksha (₹90 for 1-4, ₹130 for 5,6,8,10, ₹65 for 7,9)
  vikasanam?: number;        // Vikasanam (₹130)
  councilFund?: number;      // Council Fund (₹100)
  ccaFund?: number;          // CCA Fund (₹100)
  unifiedCouncilFund?: number; // Unified Council & CCA Fund (₹200)
  halfYearlyExam?: number;   // Half-yearly exam charges installment
  annualExam?: number;       // Annual exam charges installment
}

export type SpecialFeeType =
  | 'Terminal Exam Fee'
  | 'Hikma Exam Fee'
  | 'Public Exam Fee'
  | 'Council Fund'
  | 'Donation/Other'
  | 'Exam'
  | 'Hikma Exam'
  | 'Public Exam';

export interface ReceiptSequences {
  tuitionReceiptNo: number;
  specialReceiptNo: number;
  updatedAt?: string;
}

export interface FeePayment {
  id: string;
  receiptNo: string;
  date: string;
  studentId: string;
  studentName: string;
  admissionNo: string;
  classId: string;
  className: string;
  feeCategory?: 'tuition' | 'special';
  specialFeeType?: SpecialFeeType | string;
  paymentMode?: string;
  paymentMethod?: string;
  admissionFee: number;
  hasAdmissionFee?: boolean;
  tuitionFeeMonths: FeeMonth[];
  tuitionFeeAmount: number; // ₹300 per month
  specialFeeComponents: SpecialFeeBreakdown;
  specialFeeAmount: number;
  donationAmount: number;
  totalAmount: number;
  amountInWords: string;
  notes?: string;
  collectedBy?: string;
  createdAt: string;
}

export interface InstitutionHoliday {
  id: string; // date "YYYY-MM-DD" or unique id
  date: string; // "YYYY-MM-DD"
  targetClasses?: string[]; // e.g. ['all'] or ['cls_1', 'cls_5', 'cls_7', 'cls_9']
  reason: string; // e.g. "Public Holiday", "Special Madrasa Holiday", "Rain Holiday", "Study Leave", "Eid / Milad"
  markedBy?: string;
  markedAt?: string;
  createdBy?: string;
  academicYear?: string;
  createdAt?: string;
  rangeStart?: string;
  rangeEnd?: string;
  rangeGroupId?: string;
  totalRangeDays?: number;
}

export interface SpecialWorkingDay {
  id: string; // date "YYYY-MM-DD" or unique id
  date: string; // "YYYY-MM-DD" (must be Sunday)
  targetClasses: string[]; // e.g. ['all'] or ['cls_7', 'cls_9']
  reason: string; // e.g. "KMEB Examination Session", "Special Working Day"
  unlockedBy?: string;
  unlockedAt?: string;
  academicYear?: string;
  createdAt?: string;
}

/**
 * Checks whether a given classId matches a list of target classes (e.g. ['all'] or ['cls_1', 'cls_5']).
 * Normalizes different ID formats (e.g., 'cls_5', 'class_5', '5', 'Class 5').
 */
export function isClassMatch(targetClasses?: string[], classId?: string): boolean {
  if (!classId) return true;
  if (!targetClasses || targetClasses.length === 0) return true;
  if (targetClasses.includes('all') || targetClasses.includes('ALL')) return true;

  const extractGrade = (val: string): string => {
    const num = val.replace(/\D/g, '');
    return num || val.toLowerCase().trim();
  };

  const targetGrade = extractGrade(classId);
  return targetClasses.some(tc => {
    if (tc === 'all' || tc === 'ALL') return true;
    if (tc === classId) return true;
    return extractGrade(tc) === targetGrade;
  });
}


export interface DailyAttendanceRecord {
  date: string; // "YYYY-MM-DD"
  presentStudentIds: string[];
  absentStudentIds: string[];
  statusMap: Record<string, boolean>; // studentId -> true (Present) / false (Absent)
  markedAt?: string;
  markedBy?: string;
  isHoliday?: boolean;
  holidayReason?: string;
  isLocked?: boolean;
  unlocked?: boolean;
  editable?: boolean;
  unlockedAt?: string;
  unlockedBy?: string;
  relockedAt?: string;
}

export interface AttendanceUnlockRequest {
  id: string; // Firestore document ID
  mode?: 'single' | 'range';
  date?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  displayDateLabel?: string;
  classId: string;
  className?: string;
  teacherId: string;
  teacherName: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'resolved';
  createdAt?: string;
  requestedAt?: string;
  approvedAt?: string;
  completedAt?: string;
  rejectedAt?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNote?: string;
}

export type AttendanceEditRequest = AttendanceUnlockRequest;

export interface MonthlyAttendanceStat {
  month: string; // e.g., "June 2026", "July 2026"
  workingDays: number;
  studentAttended: Record<string, number>; // studentId -> days attended
}

export interface ClassAttendanceConfig {
  classId: string;
  totalWorkingDays: number;
  studentDaysAttended: Record<string, number>; // studentId -> days attended
  dailyRecords?: Record<string, DailyAttendanceRecord>; // date ("YYYY-MM-DD") -> record
  monthlyStats?: Record<string, MonthlyAttendanceStat>; // month key -> stat
  updatedAt?: string;
  holidays?: Record<string, { date: string; reason: string }>;
  lockedDays?: Record<string, boolean>;
}

/**
 * Accurate Gender Determination (Strictly Rule A & Rule B, NO name guessing):
 * Rule A (Stored Gender Value):
 * Check all gender fields on the student record (student.gender, student.sex).
 * If the value (case-insensitive, trimmed) is 'f', 'female', 'girl', or 'g', return 'Girl'.
 * If 'm', 'male', 'boy', or 'b', return 'Boy'.
 *
 * Rule B (Exam Register Number Series Check):
 * Check the student's assigned Exam Register Number (student.examRegNo, student.regNo,
 * student.examRegisterNos[activeExamId], student.examRegisterNumbers[activeExamId], or candidate registers).
 * Because Boys start from X101 (e.g. 1101, 4101, 5101, 7101) and Girls start from X201 (e.g. 1201, 4201, 5201, 7201):
 * - If the 4-digit register number has '2' as its second digit (matches /^[1-9]2\d{2}$/), strictly classify the student as 'Girl'.
 * - If the 4-digit register number has '1' as its second digit (matches /^[1-9]1\d{2}$/), strictly classify the student as 'Boy'.
 *
 * Strictly NO name-based heuristics or guessing.
 */
export function determineStudentGender(studentOrGender: any, activeExamId?: string): 'Boy' | 'Girl' {
  if (!studentOrGender) return 'Boy';

  // If a string / primitive value is passed directly
  if (typeof studentOrGender === 'string') {
    const val = studentOrGender.trim().toLowerCase();
    if (val === 'f' || val === 'female' || val === 'girl' || val === 'g' || val.startsWith('fem') || val.startsWith('gir')) {
      return 'Girl';
    }
    if (val === 'm' || val === 'male' || val === 'boy' || val === 'b') {
      return 'Boy';
    }
    return 'Boy';
  }

  // 1. Gather all candidate register numbers from the student object
  const regCandidates: string[] = [];
  if (studentOrGender.examRegNo) regCandidates.push(String(studentOrGender.examRegNo).trim());
  if (studentOrGender.regNo) regCandidates.push(String(studentOrGender.regNo).trim());
  if (studentOrGender.examRegisterNo) regCandidates.push(String(studentOrGender.examRegisterNo).trim());

  if (activeExamId) {
    if (studentOrGender.examRegisterNos?.[activeExamId]) {
      regCandidates.push(String(studentOrGender.examRegisterNos[activeExamId]).trim());
    }
    if (studentOrGender.examRegisterNumbers?.[activeExamId]) {
      regCandidates.push(String(studentOrGender.examRegisterNumbers[activeExamId]).trim());
    }
  }

  if (studentOrGender.examRegisterNos && typeof studentOrGender.examRegisterNos === 'object') {
    Object.values(studentOrGender.examRegisterNos).forEach(v => {
      if (v) regCandidates.push(String(v).trim());
    });
  }
  if (studentOrGender.examRegisterNumbers && typeof studentOrGender.examRegisterNumbers === 'object') {
    Object.values(studentOrGender.examRegisterNumbers).forEach(v => {
      if (v) regCandidates.push(String(v).trim());
    });
  }

  // Rule B Check:
  // If the 4-digit register number has '2' as its second digit (matches /^[1-9]2\d{2}$/), strictly classify as 'Girl'
  const hasGirlRegSeries = regCandidates.some(r => /^[1-9]2\d{2}$/.test(r));
  if (hasGirlRegSeries) {
    return 'Girl';
  }

  // Rule A (Stored Gender Value):
  // Check all gender fields on the student record (student.gender, student.sex)
  const storedValues = [studentOrGender.gender, studentOrGender.sex]
    .filter(g => g !== undefined && g !== null && typeof g === 'string')
    .map(g => String(g).trim().toLowerCase());

  const hasFemaleStored = storedValues.some(v => v === 'f' || v === 'female' || v === 'girl' || v === 'g' || v.startsWith('fem') || v.startsWith('gir'));
  if (hasFemaleStored) {
    return 'Girl';
  }

  // If the 4-digit register number has '1' as its second digit (matches /^[1-9]1\d{2}$/), strictly classify as 'Boy'
  const hasBoyRegSeries = regCandidates.some(r => /^[1-9]1\d{2}$/.test(r));
  if (hasBoyRegSeries) {
    return 'Boy';
  }

  const hasMaleStored = storedValues.some(v => v === 'm' || v === 'male' || v === 'boy' || v === 'b');
  if (hasMaleStored) {
    return 'Boy';
  }

  return 'Boy';
}

/**
 * Universal Gender Normalizer:
 * Standardizes any gender representation into 'Boy' or 'Girl' using determineStudentGender.
 */
export const normalizeGender = (g: any, studentObj?: any, activeExamId?: string): 'Boy' | 'Girl' => {
  if (studentObj && typeof studentObj === 'object') {
    return determineStudentGender(studentObj, activeExamId);
  }
  if (g && typeof g === 'object') {
    return determineStudentGender(g, activeExamId);
  }
  return determineStudentGender(g, activeExamId);
};

/**
 * Returns single letter abbreviation for badges ('B' for Boy, 'G' for Girl)
 */
export const getGenderShortBadge = (studentOrGender: any): 'B' | 'G' => {
  return determineStudentGender(studentOrGender) === 'Girl' ? 'G' : 'B';
};

/**
 * Helper to determine if a student is male/boy.
 */
export function isBoyStudent(studentOrGender?: any, activeExamId?: string): boolean {
  return determineStudentGender(studentOrGender, activeExamId) === 'Boy';
}

/**
 * Unified Student Sorting Order:
 * 1. Primary Sort: Gender — Boys first, followed by Girls
 * 2. Secondary Sort: Alphabetical order by Student Name (A to Z) within each gender group
 */
export function sortStudentsBoysFirst<T extends { gender?: any; nameEn?: string; name?: string; rollNo?: number; examRegNo?: string; regNo?: string; examRegisterNos?: Record<string, string>; examRegisterNumbers?: Record<string, string> }>(
  students: T[],
  activeExamId?: string
): T[] {
  return [...students].sort((studentA, studentB) => {
    const genderA = determineStudentGender(studentA, activeExamId);
    const genderB = determineStudentGender(studentB, activeExamId);
    if (genderA !== genderB) {
      return genderA === 'Boy' ? -1 : 1; // Boys first (-1), Girls second (1)
    }
    const nameA = String(studentA?.nameEn || studentA?.name || '').trim().toLowerCase();
    const nameB = String(studentB?.nameEn || studentB?.name || '').trim().toLowerCase();
    const comp = nameA.localeCompare(nameB);
    if (comp !== 0) return comp;
    return (studentA?.rollNo || 0) - (studentB?.rollNo || 0);
  });
}

/**
 * Class-wise Sequential Roll Numbers (1, 2, 3...):
 * For every class, assigns sequential Roll Numbers starting strictly from 1 onward
 * based on the unified sorted order (all boys alphabetically first: Roll 1, 2, 3...
 * followed directly by all girls alphabetically: Roll n+1, n+2...).
 * Does not use random, admission-based, or non-sequential roll numbers.
 */
export function assignClassSequentialRollNumbers<T extends { id?: string; gender?: string; nameEn?: string; name?: string; rollNo?: number; classId?: string; examRegNo?: string; regNo?: string; examRegisterNos?: Record<string, string>; examRegisterNumbers?: Record<string, string> }>(
  students: T[],
  activeExamId?: string
): T[] {
  const classMap = new Map<string, T[]>();
  students.forEach(s => {
    const cId = s.classId || 'default';
    if (!classMap.has(cId)) {
      classMap.set(cId, []);
    }
    classMap.get(cId)!.push(s);
  });

  const updatedStudents: T[] = [];
  classMap.forEach(classStudents => {
    const sorted = sortStudentsBoysFirst(classStudents, activeExamId);
    sorted.forEach((student, index) => {
      updatedStudents.push({
        ...student,
        gender: determineStudentGender(student, activeExamId),
        rollNo: index + 1,
      });
    });
  });

  return updatedStudents;
}

/**
 * Re-sequences both roll numbers and exam register numbers for class students
 * according to updated gender: all boys A-Z first, then all girls A-Z.
 */
export function recalculateClassRollsAndExamRegNos<T extends { id?: string; gender?: string; nameEn?: string; name?: string; rollNo?: number; classId?: string; examRegisterNumbers?: Record<string, string>; examRegisterNos?: Record<string, string>; examRegNo?: string; regNo?: string; isRegNoLocked?: boolean }>(
  classStudents: T[],
  className?: string,
  activeExamId?: string
): T[] {
  const targetExamId = activeExamId || 'exam_half_yearly_2026_27';
  const sorted = sortStudentsBoysFirst(classStudents, targetExamId);
  const classNumeral = (className || '').replace(/[^0-9]/g, '') || (sorted[0]?.classId ? sorted[0].classId.replace(/[^0-9]/g, '') : '') || '7';

  // Gather all exam IDs that have register numbers across this class
  const examIds = new Set<string>();
  if (targetExamId) examIds.add(targetExamId);
  sorted.forEach(s => {
    const regMap = (s as any).examRegisterNos || s.examRegisterNumbers || {};
    Object.keys(regMap).forEach(eId => examIds.add(eId));
  });

  const updated: T[] = sorted.map((student, index) => ({
    ...student,
    gender: determineStudentGender(student, targetExamId),
    rollNo: index + 1,
  }));

  // Re-sequence exam register numbers if any exist
  examIds.forEach(eId => {
    let minBoyReg = parseInt(`${classNumeral}101`, 10) || 7101;
    let minGirlReg = parseInt(`${classNumeral}201`, 10) || 7201;
    let hasCustomBoy = false;
    let hasCustomGirl = false;

    classStudents.forEach(s => {
      const reg = (s as any).examRegisterNos?.[eId] || s.examRegisterNumbers?.[eId] || (s as any).examRegNo || (s as any).regNo || '';
      const num = parseInt(reg, 10);
      if (!isNaN(num)) {
        if (isBoyStudent(s, eId)) {
          if (!hasCustomBoy || num < minBoyReg) { minBoyReg = num; hasCustomBoy = true; }
        } else {
          if (!hasCustomGirl || num < minGirlReg) { minGirlReg = num; hasCustomGirl = true; }
        }
      }
    });

    let boyCounter = minBoyReg;
    let girlCounter = minGirlReg;

    updated.forEach(s => {
      const isLocked = Boolean((s as any).isRegNoLocked);
      const existingReg = (s as any).examRegisterNos?.[eId] || s.examRegisterNumbers?.[eId] || (s as any).examRegNo || (s as any).regNo;
      if (existingReg || isLocked) {
        // PRESERVE the existing / manually set / locked register number
        const cleanReg = String(existingReg || '').trim();
        if (cleanReg) {
          if (!s.examRegisterNumbers) s.examRegisterNumbers = {};
          s.examRegisterNumbers[eId] = cleanReg;
          if (!(s as any).examRegisterNos) (s as any).examRegisterNos = {};
          (s as any).examRegisterNos[eId] = cleanReg;
        }
      } else if (hasCustomBoy || hasCustomGirl) {
        const isBoy = isBoyStudent(s, eId);
        const newReg = isBoy ? String(boyCounter++) : String(girlCounter++);
        if (!s.examRegisterNumbers) s.examRegisterNumbers = {};
        s.examRegisterNumbers[eId] = newReg;
        if (!(s as any).examRegisterNos) (s as any).examRegisterNos = {};
        (s as any).examRegisterNos[eId] = newReg;
      }
    });
  });

  // Ensure top-level examRegNo and regNo strictly prioritize activeExamId
  updated.forEach(s => {
    const regForActive =
      (s as any).examRegisterNos?.[targetExamId] ||
      s.examRegisterNumbers?.[targetExamId] ||
      (s as any).examRegNo ||
      (s as any).regNo ||
      Object.values((s as any).examRegisterNos || {})[0] ||
      Object.values(s.examRegisterNumbers || {})[0] ||
      '';
    if (regForActive) {
      (s as any).examRegNo = String(regForActive).trim();
      (s as any).regNo = String(regForActive).trim();
    }
  });

  return updated;
}

export interface NewsItem {
  id: string;
  titleEn: string;
  titleMl: string;
  categoryEn: string;
  categoryMl: string;
  date: string;
  summaryEn: string;
  summaryMl: string;
  contentEn: string;
  contentMl: string;
  author: string;
  isImportant?: boolean;
  createdAt?: string;
}

export interface NotificationItem {
  id: string;
  titleEn: string;
  titleMl: string;
  descEn: string;
  descMl: string;
  time: string;
  type: 'exam' | 'fee' | 'circular' | 'academic';
  read: boolean;
}

export const DEFAULT_NEWS_ITEMS: NewsItem[] = [
  {
    id: 'news-1',
    titleEn: 'Half-Yearly Examination 2026–2027 Schedule & Progress Card Release',
    titleMl: 'അർദ്ധവാർഷിക പരീക്ഷ 2026–2027 ടൈംടേബിളും പുരോഗതി രേഖയും',
    categoryEn: 'Academic',
    categoryMl: 'പരീക്ഷാ നിർവ്വഹണം',
    date: '12 Oct 2026',
    isImportant: true,
    author: 'Principal Office',
    summaryEn: 'Valuation of written and oral assessment components completed. Progress reports are available digitally in this portal.',
    summaryMl: 'എഴുത്തുപരീക്ഷകളുടെയും വാചിക പരീക്ഷകളുടെയും മൂല്യനിർണ്ണയം പൂർത്തിയായി. പുരോഗതി രേഖകൾ പോർട്ടലിൽ ലഭ്യമാണ്.',
    contentEn: 'The Half-Yearly examinations for all grades have completed successfully. Students and parents can access official signed evaluation cards via this portal. For any clarification regarding component marks, please meet the respective class teacher.',
    contentMl: 'എല്ലാ ക്ലാസ്സുകളിലെയും അർദ്ധവാർഷിക പരീക്ഷകൾ വിജയകരമായി പൂർത്തിയായി. രക്ഷിതാക്കൾക്ക് പ്രോഗ്രസ്സ് റിപ്പോർട്ട് കാർഡുകൾ ഓൺലൈനായി കാണാം. സംശയങ്ങൾക്ക് ക്ലാസ് അധ്യാപകരുമായി ബന്ധപ്പെടുക.',
    createdAt: '2026-10-12T09:00:00Z',
  },
  {
    id: 'news-2',
    titleEn: 'Rabi’ al-Awwal Milad Conference & Student Talent Fest',
    titleMl: 'റബീഉൽ അവ്വൽ മീലാദ് സമ്മേളനവും വിദ്യാർത്ഥി പ്രതിഭാ മേളയും',
    categoryEn: 'Events',
    categoryMl: 'ഇസ്ലാമിക പരിപാടികൾ',
    date: '28 Sep 2026',
    author: 'Arts & Cultural Committee',
    summaryEn: 'Annual Qira’at, Hifz, Islamic Quiz, and Arabic calligraphy competitions conducted with active participation of all students.',
    summaryMl: 'ഖിറാഅത്ത്, ഹിഫ്ള്, ഇസ്ലാമിക് ക്വിസ്, അറബിക് കാലിഗ്രാഫി മത്സരങ്ങൾ ഭംഗിയായി നടന്നു.',
    contentEn: 'Al-Madrasathul Islamiya Pallikkuth celebrated Milad-un-Nabi with great enthusiasm. Students showcased outstanding talents in Quran recitation, Elocution, and Islamic quiz competitions.',
    contentMl: 'അൽ മദ്റസത്തുൽ ഇസ്ലാമിയ്യ പള്ളിക്കുത്തിൽ മീലാദ് ആഘോഷവും വിവിധ കലാ മത്സരങ്ങളും സംഘടിപ്പിച്ചു. നിരവധി വിദ്യാർത്ഥികൾ സമ്മാനങ്ങൾ കരസ്ഥമാക്കി.',
    createdAt: '2026-09-28T10:30:00Z',
  },
  {
    id: 'news-3',
    titleEn: 'Term 1 Parent-Teacher Consultative Meeting (PTM)',
    titleMl: 'ഒന്നാം പാദ രക്ഷാകർതൃ-അധ്യാപക സംഗമം (PTM)',
    categoryEn: 'Academic',
    categoryMl: 'രക്ഷാകർതൃ മീറ്റിംഗ്',
    date: '15 Sep 2026',
    author: 'Management Committee',
    summaryEn: 'Constructive review on student punctuality, Subhi prayer habits, and moral development with class teachers.',
    summaryMl: 'വിദ്യാർത്ഥികളുടെ പഠന പുരോഗതിയും സുബ്ഹി നമസ്കാര ശീലവും ചർച്ച ചെയ്യുന്നതിനായി യോഗം ചേർന്നു.',
    contentEn: 'The General Body of parents gathered at the Madrasa Auditorium. Key discussions centered on cultivating Tajweed practice at home and supporting students in their daily lessons.',
    contentMl: 'മദ്റസ ഓഡിറ്റോറിയത്തിൽ ചേർന്ന രക്ഷാകർതൃ സംഗമത്തിൽ വിദ്യാർത്ഥികളുടെ പഠന നിലവാരം ഉയർത്തുന്നതിനുള്ള നിർദ്ദേശങ്ങൾ ചർച്ച ചെയ്തു.',
    createdAt: '2026-09-15T08:00:00Z',
  },
  {
    id: 'news-4',
    titleEn: 'Madrasa Timing & Morning Assembly Uniform Code',
    titleMl: 'മദ്റസ സമയക്രമവും അസംബ്ലി മാർഗ്ഗനിർദ്ദേശങ്ങളും',
    categoryEn: 'General',
    categoryMl: 'ഭരണനിർവ്വഹണം',
    date: '01 Aug 2026',
    author: 'Sadr Muallim',
    summaryEn: 'Morning assembly starts promptly at 07:15 AM. Proper Islamic white attire and caps are mandatory for all students.',
    summaryMl: 'രാവിലെ 07:15 ന് കൃത്യമായി അസംബ്ലി ആരംഭിക്കും. വെള്ള വസ്ത്രവും തൊപ്പിയും നിർബന്ധമാണ്.',
    contentEn: 'Parents are requested to ensure students arrive at Madrasa by 07:10 AM with necessary books, slate/notebooks, and in proper clean dress.',
    contentMl: 'കുട്ടികളെ കൃത്യസമയത്ത് മദ്റസയിൽ എത്തിക്കാനും യൂണിഫോമും പാഠപുസ്തകങ്ങളും ഉറപ്പുവരുത്താനും രക്ഷിതാക്കൾ ശ്രദ്ധിക്കുക.',
    createdAt: '2026-08-01T07:15:00Z',
  },
];

export interface StudyMaterialFolder {
  id: string;
  name: string;
  nameMl?: string;
  parentId: string | null;
  isPermanent?: boolean;
  createdAt: string;
  updatedAt?: string;
  createdBy?: string;
}

export interface StudyMaterialFile {
  id: string;
  name: string;
  folderId: string;
  downloadUrl: string;
  storagePath?: string;
  fileType: string;
  fileSize: number;
  uploadedAt: string;
  uploadedBy?: string;
  description?: string;
}

export const DEFAULT_ROOT_FOLDERS: StudyMaterialFolder[] = [
  {
    id: 'root_question_papers',
    name: 'Question paper',
    nameMl: 'ചോദ്യപേപ്പർ',
    parentId: null,
    isPermanent: true,
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'root_hikma_questions',
    name: 'Hikma Questions',
    nameMl: 'ഹിക്മ ചോദ്യങ്ങൾ',
    parentId: null,
    isPermanent: true,
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'root_textbooks',
    name: 'Textbooks',
    nameMl: 'പാഠപുസ്തകങ്ങൾ',
    parentId: null,
    isPermanent: true,
    createdAt: '2026-01-01T00:00:00Z',
  },
];

export const ALL_STANDARD_CLASSES: ClassItem[] = [
  { id: 'cls_1', name: 'Class 1', nameMl: 'ക്ലാസ്സ് 1', numericGrade: 1, active: true },
  { id: 'cls_2', name: 'Class 2', nameMl: 'ക്ലാസ്സ് 2', numericGrade: 2, active: true },
  { id: 'cls_3', name: 'Class 3', nameMl: 'ക്ലാസ്സ് 3', numericGrade: 3, active: true },
  { id: 'cls_4', name: 'Class 4', nameMl: 'ക്ലാസ്സ് 4', numericGrade: 4, active: true },
  { id: 'cls_5', name: 'Class 5', nameMl: 'ക്ലാസ്സ് 5', numericGrade: 5, active: true },
  { id: 'cls_6', name: 'Class 6', nameMl: 'ക്ലാസ്സ് 6', numericGrade: 6, active: true },
  { id: 'cls_7', name: 'Class 7', nameMl: 'ക്ലാസ്സ് 7', numericGrade: 7, active: true },
  { id: 'cls_8', name: 'Class 8', nameMl: 'ക്ലാസ്സ് 8', numericGrade: 8, active: true },
  { id: 'cls_9', name: 'Class 9', nameMl: 'ക്ലാസ്സ് 9', numericGrade: 9, active: true },
];

export function mergeClassesWithStandard(rawClasses?: ClassItem[]): ClassItem[] {
  const map = new Map<string, ClassItem>();
  ALL_STANDARD_CLASSES.forEach(c => map.set(c.id, c));
  if (Array.isArray(rawClasses)) {
    rawClasses.forEach(c => {
      if (c && c.id) {
        // Normalize class keys e.g. cls_1
        const num = c.numericGrade || parseInt(c.id.replace(/\D/g, ''), 10) || parseInt(c.name.replace(/\D/g, ''), 10);
        if (num >= 1 && num <= 9) {
          const canonicalId = `cls_${num}`;
          map.set(canonicalId, {
            ...map.get(canonicalId)!,
            ...c,
            id: canonicalId,
            numericGrade: num,
          });
        } else {
          map.set(c.id, c);
        }
      }
    });
  }
  const list = Array.from(map.values());
  list.sort((a, b) => a.numericGrade - b.numericGrade);
  return list;
}

