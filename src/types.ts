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
  status: 'draft' | 'ongoing' | 'evaluating' | 'ready_to_publish' | 'published';
  classesParticipating: string[];
  passMarkPercentage: number;
}

export interface Student {
  id: string;
  admissionNo: string;
  rollNo: number;
  nameEn: string;
  nameMl: string;
  classId: string;
  academicYearId: string;
  parentNameEn: string;
  parentNameMl: string;
  parentPhone: string;
  parentUserId?: string;
  status: 'active' | 'inactive';
  dob?: string;
  gender?: 'M' | 'F';
  examRegisterNumbers?: Record<string, string>; // examinationId -> exam register number
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
  academicYearId: string;
  classId: string;
  subjectId: string;
  assignedTeacherId: string;
  status: 'not_started' | 'draft' | 'submitted' | 'approved' | 'locked' | 'returned_for_correction';
  studentMarks: Record<string, StudentMarkEntry>;
  submittedAt?: string;
  verifiedAt?: string;
  verifiedBy?: string;
  lockedAt?: string;
  returnedReason?: string;
  lastUpdated: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: string;
  action: string;
  recordType: string;
  recordId: string;
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

export interface FeePayment {
  id: string;
  receiptNo: string;
  date: string;
  studentId: string;
  studentName: string;
  admissionNo: string;
  classId: string;
  className: string;
  admissionFee: number;
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

export interface ClassAttendanceConfig {
  classId: string;
  totalWorkingDays: number;
  studentDaysAttended: Record<string, number>; // studentId -> days attended
  updatedAt?: string;
}

/**
 * Student Sorting Order:
 * 1. Primary Sort: Gender — Boys/Male ('M') first, then Girls/Female ('F')
 * 2. Secondary Sort: Alphabetical order by Student Name (A to Z) within each gender group
 */
export function sortStudentsBoysFirst<T extends { gender?: string; nameEn?: string; name?: string }>(students: T[]): T[] {
  return [...students].sort((a, b) => {
    const isGirlA = (a.gender || 'M').toUpperCase().startsWith('F');
    const isGirlB = (b.gender || 'M').toUpperCase().startsWith('F');
    if (isGirlA !== isGirlB) {
      return isGirlA ? 1 : -1; // Boys/Male first (-1), Girls/Female second (1)
    }
    const nameA = String(a.nameEn || a.name || '').trim().toLowerCase();
    const nameB = String(b.nameEn || b.name || '').trim().toLowerCase();
    return nameA.localeCompare(nameB);
  });
}
