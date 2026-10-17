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
  status: 'draft' | 'ongoing' | 'evaluating' | 'ready_to_publish' | 'published' | 'approved' | 'completed' | (string & {});
  classesParticipating?: string[];
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
  schoolClass?: string; // Regular school grade/class (e.g., 'Class 1' to 'Class 10', 'Plus Two')
  examRegisterNumbers?: Record<string, string>; // examinationId -> exam register number
  examRegisterNos?: Record<string, string>; // examinationId -> exam register number (cloud persistence schema alias)
  examRegNo?: string; // current active exam register number (cloud persistence schema alias)
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

export interface InstitutionHoliday {
  id: string; // date "YYYY-MM-DD"
  date: string; // "YYYY-MM-DD"
  reason: string; // e.g. "Friday Holiday", "Eid", "Milad-un-Nabi", "Study Leave"
  markedBy?: string;
  markedAt?: string;
  academicYear?: string;
  createdAt?: string;
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
  unlocked?: boolean;
  editable?: boolean;
  unlockedAt?: string;
  unlockedBy?: string;
}

export interface AttendanceEditRequest {
  id: string; // e.g. `${classId}_${date}`
  classId: string;
  className?: string;
  date: string; // "YYYY-MM-DD"
  teacherId: string;
  teacherName: string;
  reason: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected' | 'resolved';
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNote?: string;
}

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
}

/**
 * Helper to determine if a student is male/boy.
 * Handles 'M', 'male', 'boy', 'Male', 'Boy', etc.
 */
export function isBoyStudent(gender?: string): boolean {
  if (!gender) return true;
  const g = String(gender).trim().toLowerCase();
  if (g === 'f' || g === 'female' || g === 'girl' || g.startsWith('fem') || g.startsWith('gir')) {
    return false;
  }
  return true;
}

/**
 * Unified Student Sorting Order:
 * 1. Primary Sort: Gender — Boys ('male' / 'boy' / 'M') first, followed by Girls ('female' / 'girl' / 'F')
 * 2. Secondary Sort: Alphabetical order by Student Name (A to Z) within each gender group
 */
export function sortStudentsBoysFirst<T extends { gender?: string; nameEn?: string; name?: string; rollNo?: number }>(students: T[]): T[] {
  return [...students].sort((a, b) => {
    const isBoyA = isBoyStudent(a.gender);
    const isBoyB = isBoyStudent(b.gender);
    if (isBoyA !== isBoyB) {
      return isBoyA ? -1 : 1; // Boys first (-1), Girls second (1)
    }
    const nameA = String(a.nameEn || a.name || '').trim().toLowerCase();
    const nameB = String(b.nameEn || b.name || '').trim().toLowerCase();
    const comp = nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    if (comp !== 0) return comp;
    return (a.rollNo || 0) - (b.rollNo || 0);
  });
}

/**
 * Class-wise Sequential Roll Numbers (1, 2, 3...):
 * For every class, assigns sequential Roll Numbers starting strictly from 1 onward
 * based on the unified sorted order (all boys alphabetically first: Roll 1, 2, 3...
 * followed directly by all girls alphabetically: Roll n+1, n+2...).
 * Does not use random, admission-based, or non-sequential roll numbers.
 */
export function assignClassSequentialRollNumbers<T extends { id?: string; gender?: string; nameEn?: string; name?: string; rollNo?: number; classId?: string }>(students: T[]): T[] {
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
    const sorted = sortStudentsBoysFirst(classStudents);
    sorted.forEach((student, index) => {
      updatedStudents.push({
        ...student,
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
export function recalculateClassRollsAndExamRegNos<T extends { id?: string; gender?: string; nameEn?: string; name?: string; rollNo?: number; classId?: string; examRegisterNumbers?: Record<string, string>; examRegisterNos?: Record<string, string>; examRegNo?: string }>(
  classStudents: T[],
  className?: string
): T[] {
  const sorted = sortStudentsBoysFirst(classStudents);
  const classNumeral = (className || '').replace(/[^0-9]/g, '') || (sorted[0]?.classId ? sorted[0].classId.replace(/[^0-9]/g, '') : '') || '7';

  // Gather all exam IDs that have register numbers across this class
  const examIds = new Set<string>();
  sorted.forEach(s => {
    const regMap = s.examRegisterNumbers || (s as any).examRegisterNos || {};
    Object.keys(regMap).forEach(eId => examIds.add(eId));
  });

  const updated: T[] = sorted.map((student, index) => ({
    ...student,
    rollNo: index + 1,
  }));

  // Re-sequence exam register numbers if any exist
  examIds.forEach(eId => {
    let minBoyReg = parseInt(`${classNumeral}101`, 10) || 7101;
    let minGirlReg = parseInt(`${classNumeral}201`, 10) || 7201;
    let hasCustomBoy = false;
    let hasCustomGirl = false;

    classStudents.forEach(s => {
      const reg = s.examRegisterNumbers?.[eId] || (s as any).examRegisterNos?.[eId] || '';
      const num = parseInt(reg, 10);
      if (!isNaN(num)) {
        if (isBoyStudent(s.gender)) {
          if (!hasCustomBoy || num < minBoyReg) { minBoyReg = num; hasCustomBoy = true; }
        } else {
          if (!hasCustomGirl || num < minGirlReg) { minGirlReg = num; hasCustomGirl = true; }
        }
      }
    });

    let boyCounter = minBoyReg;
    let girlCounter = minGirlReg;

    updated.forEach(s => {
      const existingReg = s.examRegisterNumbers?.[eId] || (s as any).examRegisterNos?.[eId];
      if (existingReg !== undefined || hasCustomBoy || hasCustomGirl) {
        const isBoy = isBoyStudent(s.gender);
        const newReg = isBoy ? String(boyCounter++) : String(girlCounter++);
        if (!s.examRegisterNumbers) s.examRegisterNumbers = {};
        s.examRegisterNumbers[eId] = newReg;
        if (!(s as any).examRegisterNos) (s as any).examRegisterNos = {};
        (s as any).examRegisterNos[eId] = newReg;
        (s as any).examRegNo = newReg;
      }
    });
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
