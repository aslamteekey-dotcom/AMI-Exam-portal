export type UserRole = 'admin' | 'teacher' | 'parent';

export interface User {
  id: string;
  username: string;
  name: string;
  nameMl?: string;
  role: UserRole;
  plainPassword?: string;
  passwordHash?: string;
  active: boolean;
  email?: string;
  phone?: string;
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
  nonCeDiaryMax?: number;
  nonCeDiaryObtained?: number;
  percentage: number | null;
  classRank: number | null;
  totalStudentsInClass: number;
  hasIncompleteSubjects: boolean;
  hasAbsentSubjects: boolean;
  hasWithheldCe?: boolean;
  resultStatus: 'Passed' | 'Needs Improvement' | 'Withheld' | 'Incomplete' | 'Absent';
  resultStatusMl: 'വിജയിച്ചു' | 'മെച്ചപ്പെടേണ്ടതുണ്ട്' | 'തടഞ്ഞുവെച്ചു (Withheld)' | 'പൂർണ്ണമല്ല' | 'പങ്കെടുത്തില്ല';
  isPublished: boolean;
}
