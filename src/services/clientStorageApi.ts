import {
  User,
  ClassItem,
  SubjectItem,
  AcademicYear,
  Examination,
  Student,
  TeacherAssignment,
  MarkSheet,
  StudentMarkEntry,
  AuditLog,
  InstitutionSettings,
  ProgressReportSubject,
  StudentProgressReport,
  SubjectAssessmentRule,
} from '../types';

export interface MadrasaDatabase {
  users: User[];
  classes: ClassItem[];
  subjects: SubjectItem[];
  academicYears: AcademicYear[];
  examinations: Examination[];
  students: Student[];
  teacherAssignments: TeacherAssignment[];
  markSheets: MarkSheet[];
  auditLogs: AuditLog[];
  settings: InstitutionSettings;
}

const STORAGE_KEY = 'madrasa_db_storage_v2';
const CURRENT_USER_KEY = 'madrasa_current_user_v2';
const TOKEN_KEY = 'madrasa_auth_token';

// Fast reliable client hash
export function clientHashPassword(plain: string): string {
  let hash = 0;
  const salted = `madrasa_salt_${plain}`;
  for (let i = 0; i < salted.length; i++) {
    const char = salted.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return 'h_' + Math.abs(hash).toString(16);
}

// Default initial subjects strictly in Malayalam, while Assessment Components are strictly in ENGLISH
export function getDefaultSubjects(): SubjectItem[] {
  return [
    {
      id: 'sub_tilawah',
      code: 'TIL',
      nameEn: 'തിലാവത്',
      nameMl: 'തിലാവത്',
      applicableClasses: [2, 3, 4, 5, 6, 7, 8, 9], // Class 1 explicitly excluded
      defaultComponents: [
        { componentKey: 'tilawah', labelEn: 'Oral', labelMl: 'Oral', maxMarks: 30 },
        { componentKey: 'tajweed', labelEn: 'Tajweed', labelMl: 'Tajweed', maxMarks: 10 },
        { componentKey: 'ce', labelEn: 'CE', labelMl: 'CE', maxMarks: 10 },
      ],
      classComponentOverrides: {
        2: [
          { componentKey: 'tilawah', labelEn: 'Oral', labelMl: 'Oral', maxMarks: 30 },
          { componentKey: 'tilawati', labelEn: 'Tilawati', labelMl: 'Tilawati', maxMarks: 10 },
          { componentKey: 'ce', labelEn: 'CE', labelMl: 'CE', maxMarks: 10 },
        ],
        3: [
          { componentKey: 'tilawah', labelEn: 'Oral', labelMl: 'Oral', maxMarks: 30 },
          { componentKey: 'tilawati', labelEn: 'Tilawati', labelMl: 'Tilawati', maxMarks: 10 },
          { componentKey: 'ce', labelEn: 'CE', labelMl: 'CE', maxMarks: 10 },
        ],
      },
    },
    {
      id: 'sub_hifz',
      code: 'HFZ',
      nameEn: 'ഹിഫ്ള്',
      nameMl: 'ഹിഫ്ള്',
      applicableClasses: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      defaultComponents: [
        { componentKey: 'new_portion', labelEn: 'Oral (New)', labelMl: 'Oral (New)', maxMarks: 30 },
        { componentKey: 'revision', labelEn: 'Oral (Revision)', labelMl: 'Oral (Revision)', maxMarks: 10 },
        { componentKey: 'ce', labelEn: 'CE', labelMl: 'CE', maxMarks: 10 },
      ],
    },
    {
      id: 'sub_tarbiyah',
      code: 'TRB',
      nameEn: 'തർബിയ്യത്ത്',
      nameMl: 'തർബിയ്യത്ത്',
      applicableClasses: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      defaultComponents: [
        { componentKey: 'salawat', labelEn: 'Salawat', labelMl: 'Salawat', maxMarks: 30 },
        { componentKey: 'duas', labelEn: 'Duas', labelMl: 'Duas', maxMarks: 10 },
        { componentKey: 'diary', labelEn: 'Diary', labelMl: 'Diary', maxMarks: 10 },
      ],
    },
    {
      id: 'sub_arabic',
      code: 'ARB',
      nameEn: 'അറബിക്',
      nameMl: 'അറബിക്',
      applicableClasses: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      defaultComponents: [
        { componentKey: 'omr', labelEn: 'Written (OMR)', labelMl: 'Written (OMR)', maxMarks: 20 },
        { componentKey: 'descriptive', labelEn: 'Written (Descriptive)', labelMl: 'Written (Descriptive)', maxMarks: 20 },
        { componentKey: 'ce', labelEn: 'CE', labelMl: 'CE', maxMarks: 10 },
      ],
    },
    {
      id: 'sub_islamic_studies',
      code: 'ISL',
      nameEn: 'ഇസ്ലാമിക് സ്റ്റഡീസ്',
      nameMl: 'ഇസ്ലാമിക് സ്റ്റഡീസ്',
      applicableClasses: [1, 2, 3, 4],
      defaultComponents: [
        { componentKey: 'omr', labelEn: 'Written (OMR)', labelMl: 'Written (OMR)', maxMarks: 20 },
        { componentKey: 'descriptive', labelEn: 'Written (Descriptive)', labelMl: 'Written (Descriptive)', maxMarks: 20 },
        { componentKey: 'ce', labelEn: 'CE', labelMl: 'CE', maxMarks: 10 },
      ],
    },
    {
      id: 'sub_tafsir',
      code: 'TFS',
      nameEn: 'തഫ്സീർ',
      nameMl: 'തഫ്സീർ',
      applicableClasses: [5, 6, 7, 8, 9],
      defaultComponents: [
        { componentKey: 'omr', labelEn: 'Written (OMR)', labelMl: 'Written (OMR)', maxMarks: 20 },
        { componentKey: 'descriptive', labelEn: 'Written (Descriptive)', labelMl: 'Written (Descriptive)', maxMarks: 20 },
        { componentKey: 'ce', labelEn: 'CE', labelMl: 'CE', maxMarks: 10 },
      ],
    },
    {
      id: 'sub_hadith',
      code: 'HDT',
      nameEn: 'ഹദീസ്',
      nameMl: 'ഹദീസ്',
      applicableClasses: [5, 6, 7, 8, 9],
      defaultComponents: [
        { componentKey: 'omr', labelEn: 'Written (OMR)', labelMl: 'Written (OMR)', maxMarks: 20 },
        { componentKey: 'descriptive', labelEn: 'Written (Descriptive)', labelMl: 'Written (Descriptive)', maxMarks: 20 },
        { componentKey: 'ce', labelEn: 'CE', labelMl: 'CE', maxMarks: 10 },
      ],
    },
    {
      id: 'sub_fiqh',
      code: 'FQH',
      nameEn: 'ഫിഖ്ഹ്',
      nameMl: 'ഫിഖ്ഹ്',
      applicableClasses: [5, 6, 7, 8, 9],
      defaultComponents: [
        { componentKey: 'omr', labelEn: 'Written (OMR)', labelMl: 'Written (OMR)', maxMarks: 20 },
        { componentKey: 'descriptive', labelEn: 'Written (Descriptive)', labelMl: 'Written (Descriptive)', maxMarks: 20 },
        { componentKey: 'ce', labelEn: 'CE', labelMl: 'CE', maxMarks: 10 },
      ],
    },
    {
      id: 'sub_history_buhuth',
      code: 'HST',
      nameEn: 'ചരിത്രം',
      nameMl: 'ചരിത്രം',
      applicableClasses: [5, 6, 7, 8, 9],
      specialClassNames: {
        9: { nameEn: 'ബുഹൂസ്', nameMl: 'ബുഹൂസ്' }, // Class 9 strictly Malayalam!
      },
      defaultComponents: [
        { componentKey: 'omr', labelEn: 'Written (OMR)', labelMl: 'Written (OMR)', maxMarks: 20 },
        { componentKey: 'descriptive', labelEn: 'Written (Descriptive)', labelMl: 'Written (Descriptive)', maxMarks: 20 },
        { componentKey: 'ce', labelEn: 'CE', labelMl: 'CE', maxMarks: 10 },
      ],
    },
  ];
}

// Initial clean seed data generator
export function getInitialClientSeedData(): MadrasaDatabase {
  const academicYear: AcademicYear = {
    id: 'ay_2026_2027',
    year: '2026–2027',
    isCurrent: true,
  };

  const classes: ClassItem[] = [
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

  const subjects = getDefaultSubjects();

  // Fresh clean state: Only Principal ASLAM TK, NO dummy teachers, parents, students, or exams
  const users: User[] = [
    {
      id: 'usr_admin',
      username: 'principal',
      name: 'ASLAM TK',
      nameMl: 'അസ്‌ലം ടി.കെ.',
      role: 'admin',
      plainPassword: 'admin123',
      active: true,
      email: 'aslamteekey@gmail.com',
      phone: '+91 9447123456',
      createdAt: '2026-06-01T08:00:00Z',
    },
  ];

  const settings: InstitutionSettings = {
    madrasaNameEn: 'AL-MADRASATHUL ISLAMIYA PALLIKKUTH',
    madrasaNameMl: 'അൽ മദ്റസത്തുൽ ഇസ്ലാമിയ്യ പള്ളിക്കുത്ത്',
    madrasaArabicHeader: 'المدرسة الإسلامية بليكث',
    locationEn: 'Pallikkuth, Malappuram Dt., Kerala - 679334',
    locationMl: 'പള്ളിക്കുത്ത്, മലപ്പുറം ജില്ല, കേരളം - 679334',
    phone: '+91 9447 123 456 / 04933 245678',
    email: 'info@madrasapallikkuth.edu',
    registrationNo: 'REG/SWK/2004/892',
    principalNameEn: 'ASLAM TK',
    principalNameMl: 'അസ്‌ലം ടി.കെ.',
    showTeacherSignature: true,
    showPrincipalSignature: true,
    showParentSignature: true,
    reportHeaderNotesEn: 'Samastha Kerala Islam Matha Vidyabhyasa Board Affiliation / State Madrasa Curriculum',
    reportHeaderNotesMl: 'സമസ്ത കേരള ഇസ്ലാം മത വിദ്യാഭ്യാസ ബോർഡ് അംഗീകൃതം',
    activeAcademicYearId: 'ay_2026_2027',
    activeExamId: '',
  };

  const auditLogs: AuditLog[] = [
    {
      id: 'log_init',
      timestamp: new Date().toISOString(),
      userId: 'usr_admin',
      userName: 'ASLAM TK',
      userRole: 'admin',
      action: 'SYSTEM_INITIALIZED',
      recordType: 'system',
      recordId: 'init',
      details: 'System initialized for Al-Madrasathul Islamiya Pallikkuth with Principal ASLAM TK. Fresh clean state.',
    },
  ];

  return {
    users,
    classes,
    subjects,
    academicYears: [academicYear],
    examinations: [],
    students: [],
    teacherAssignments: [],
    markSheets: [],
    auditLogs,
    settings,
  };
}

// Helper to determine elder child
export function getElderChild(students: Student[], classes: ClassItem[]): Student | null {
  if (students.length === 0) return null;
  const classMap = new Map(classes.map(c => [c.id, c.numericGrade]));
  const sorted = [...students].sort((a, b) => {
    const gradeA = classMap.get(a.classId) || 0;
    const gradeB = classMap.get(b.classId) || 0;
    if (gradeB !== gradeA) {
      return gradeB - gradeA; // higher grade = elder child
    }
    const numA = parseInt(a.admissionNo.replace(/\D/g, ''), 10);
    const numB = parseInt(b.admissionNo.replace(/\D/g, ''), 10);
    if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
      return numA - numB; // lower admission number = earlier admitted
    }
    return a.admissionNo.localeCompare(b.admissionNo);
  });
  return sorted[0];
}

// Client Storage API class
export class ClientStorageApi {
  private static instance: ClientStorageApi;
  private db: MadrasaDatabase;

  private constructor() {
    this.db = this.loadDB();
  }

  public static getInstance(): ClientStorageApi {
    if (!ClientStorageApi.instance) {
      ClientStorageApi.instance = new ClientStorageApi();
    }
    return ClientStorageApi.instance;
  }

  public getDB(): MadrasaDatabase {
    return this.db;
  }

  private loadDB(): MadrasaDatabase {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Verify fresh state (no dummy teachers, principal is ASLAM TK)
        const hasDummyTeachers = parsed?.users?.some(
          (u: any) =>
            u.username === 'teacher.muhammed' ||
            u.username === 'teacher.ali' ||
            u.username === 'teacher.usman' ||
            (u.name && u.name.includes('Baqavi'))
        );
        const hasOldExamSeed = parsed?.examinations?.some((e: any) => e.id === 'exam_half_yearly_2026');
        if (hasDummyTeachers || hasOldExamSeed || parsed?.settings?.principalNameEn !== 'ASLAM TK') {
          const fresh = getInitialClientSeedData();
          this.saveDBSync(fresh);
          return fresh;
        }

        // Migrate and enforce assessment components strictly in English
        const defaultSubs = getDefaultSubjects();
        if (Array.isArray(parsed?.subjects)) {
          parsed.subjects.forEach((s: any) => {
            const def = defaultSubs.find(d => d.id === s.id);
            if (def) {
              s.defaultComponents = def.defaultComponents;
              if (def.classComponentOverrides) {
                s.classComponentOverrides = def.classComponentOverrides;
              }
            }
          });
        }

        return parsed;
      }
    } catch (e) {
      console.warn('Failed to load DB from localStorage, creating fresh seed:', e);
    }
    const fresh = getInitialClientSeedData();
    this.saveDBSync(fresh);
    return fresh;
  }

  public saveDB(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.db));
    } catch (e) {
      console.error('Failed to save DB to localStorage:', e);
    }
  }

  private saveDBSync(db: MadrasaDatabase): void {
    this.db = db;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch (e) {
      console.error('Failed to save DB to localStorage:', e);
    }
  }

  public getCurrentUser(): User | null {
    try {
      const raw = localStorage.getItem(CURRENT_USER_KEY);
      if (raw) {
        const u = JSON.parse(raw);
        // Refresh with latest in DB
        const inDb = this.db.users.find(x => x.id === u.id);
        if (inDb && inDb.active !== false) {
          return inDb;
        }
      }
    } catch (e) {
      // ignore
    }
    return null;
  }

  public setCurrentUser(user: User | null): void {
    if (user) {
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
      const token = `token_${user.id}_${Date.now()}`;
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(CURRENT_USER_KEY);
      localStorage.removeItem(TOKEN_KEY);
    }
  }

  // Client authentication
  public login(username: string, pass: string): { success: boolean; user?: User; token?: string; error?: string } {
    const trimmedUsername = username.trim().toLowerCase();
    const trimmedPass = pass.trim();

    // Default admin fallback guarantee
    let user = this.db.users.find(u => u.username.toLowerCase() === trimmedUsername);

    if (!user && (trimmedUsername === 'principal' || trimmedUsername === 'admin')) {
      // Restore default admin if missing
      const adminUser: User = {
        id: 'usr_admin',
        username: 'principal',
        name: 'ASLAM TK',
        nameMl: 'അസ്‌ലം ടി.കെ.',
        role: 'admin',
        plainPassword: 'admin123',
        active: true,
        email: 'aslamteekey@gmail.com',
        phone: '+91 9447123456',
        createdAt: new Date().toISOString(),
      };
      this.db.users.push(adminUser);
      this.saveDB();
      user = adminUser;
    }

    if (!user) {
      return { success: false, error: 'User account not found' };
    }

    if (!user.active) {
      return { success: false, error: 'Account is deactivated' };
    }

    // Password check: Match plainPassword, or default admin123 if principal
    const isPasswordMatch =
      user.plainPassword === trimmedPass ||
      (user.username.toLowerCase() === 'principal' && trimmedPass === 'admin123') ||
      (user as any).passwordHash === clientHashPassword(trimmedPass);

    if (!isPasswordMatch) {
      return { success: false, error: 'Invalid password' };
    }

    const token = `token_${user.id}_${Date.now()}`;
    this.setCurrentUser(user);

    return {
      success: true,
      user,
      token,
    };
  }

  public logout(): void {
    this.setCurrentUser(null);
  }

  // Calculation helpers
  public getComponentsForClass(subject: SubjectItem, numericGrade: number): SubjectAssessmentRule[] {
    if (subject.classComponentOverrides && subject.classComponentOverrides[numericGrade]) {
      return subject.classComponentOverrides[numericGrade];
    }
    return subject.defaultComponents;
  }

  public getSubjectDisplayName(subject: SubjectItem, numericGrade: number): { nameEn: string; nameMl: string } {
    if (numericGrade === 9 && (subject.id === 'sub_history_buhuth' || subject.code === 'HST')) {
      return {
        nameEn: 'ബുഹൂസ്',
        nameMl: 'ബുഹൂസ്',
      };
    }
    return {
      nameEn: subject.nameMl || subject.nameEn,
      nameMl: subject.nameMl || subject.nameEn,
    };
  }

  public calculateClassRanks(classId: string, examId: string): Map<string, { rank: number | null; total: number; max: number; pct: number | null; isIncomplete: boolean }> {
    const cls = this.db.classes.find(c => c.id === classId);
    if (!cls) return new Map();

    const studentsInClass = this.db.students.filter(s => s.classId === classId && s.status === 'active');
    const applicableSubjects = this.db.subjects.filter(s => s.applicableClasses.includes(cls.numericGrade));
    const markSheets = this.db.markSheets.filter(ms => ms.classId === classId && ms.examinationId === examId);
    const markSheetBySub = new Map<string, MarkSheet>();
    markSheets.forEach(ms => markSheetBySub.set(ms.subjectId, ms));

    interface ScoredStudent {
      studentId: string;
      total: number;
      max: number;
      isIncomplete: boolean;
      hasAbsent: boolean;
      hasMissingCe: boolean;
    }

    const studentScores: ScoredStudent[] = [];

    studentsInClass.forEach(student => {
      let totalObtained = 0;
      let totalMax = 0;
      let isIncomplete = false;
      let hasAbsent = false;
      let hasMissingCe = false;

      applicableSubjects.forEach(subject => {
        const ms = markSheetBySub.get(subject.id);
        const components = this.getComponentsForClass(subject, cls.numericGrade);
        const subMax = components.reduce((sum, c) => sum + c.maxMarks, 0);
        totalMax += subMax;

        if (!ms || !ms.studentMarks || !ms.studentMarks[student.id]) {
          isIncomplete = true;
        } else {
          const entry = ms.studentMarks[student.id];
          if (entry.isAbsent) {
            hasAbsent = true;
            isIncomplete = true;
          } else {
            totalObtained += entry.subjectTotal;
            const ceComp = components.find(c => c.componentKey === 'ce');
            if (ceComp) {
              const ceMark = entry.componentMarks?.['ce'];
              if (ceMark === undefined || ceMark === null || String(ceMark).trim() === '') {
                hasMissingCe = true;
              }
            }
          }
        }
      });

      studentScores.push({
        studentId: student.id,
        total: totalObtained,
        max: totalMax,
        isIncomplete: isIncomplete || hasAbsent || hasMissingCe,
        hasAbsent,
        hasMissingCe,
      });
    });

    const validStudents = studentScores.filter(s => !s.isIncomplete);
    validStudents.sort((a, b) => b.total - a.total);

    const rankMap = new Map<string, { rank: number | null; total: number; max: number; pct: number | null; isIncomplete: boolean }>();

    let currentRank = 1;
    for (let i = 0; i < validStudents.length; i++) {
      if (i > 0 && validStudents[i].total < validStudents[i - 1].total) {
        currentRank = i + 1;
      }
      const s = validStudents[i];
      const pct = s.max > 0 ? Number(((s.total / s.max) * 100).toFixed(2)) : 0;
      rankMap.set(s.studentId, {
        rank: currentRank,
        total: s.total,
        max: s.max,
        pct,
        isIncomplete: false,
      });
    }

    studentScores.forEach(s => {
      if (s.isIncomplete) {
        rankMap.set(s.studentId, {
          rank: null,
          total: s.total,
          max: s.max,
          pct: null,
          isIncomplete: true,
        });
      }
    });

    return rankMap;
  }

  public generateStudentProgressReport(studentId: string, examId: string): StudentProgressReport | null {
    const student = this.db.students.find(s => s.id === studentId);
    if (!student) return null;

    const exam = this.db.examinations.find(e => e.id === examId);
    if (!exam) return null;

    const cls = this.db.classes.find(c => c.id === student.classId);
    if (!cls) return null;

    const ay = this.db.academicYears.find(a => a.id === exam.academicYearId);
    const ayName = ay ? ay.year : '2026–2027';

    const rankMap = this.calculateClassRanks(student.classId, examId);
    const rankInfo = rankMap.get(studentId) || { rank: null, total: 0, max: 0, pct: null, isIncomplete: true };
    const totalStudentsInClass = this.db.students.filter(s => s.classId === student.classId && s.status === 'active').length;

    const applicableSubjects = this.db.subjects.filter(s => s.applicableClasses.includes(cls.numericGrade));
    const markSheets = this.db.markSheets.filter(ms => ms.classId === student.classId && ms.examinationId === examId);
    const markSheetBySub = new Map<string, MarkSheet>();
    markSheets.forEach(ms => markSheetBySub.set(ms.subjectId, ms));

    let totalMaxMarks = 0;
    let totalObtainedMarks = 0;
    let nonCeDiaryMax = 0;
    let nonCeDiaryObtained = 0;
    let hasIncompleteSubjects = false;
    let hasAbsentSubjects = false;
    let hasWithheldCe = false;
    let anySubjectFailed = false;

    const reportSubjects: ProgressReportSubject[] = applicableSubjects.map(sub => {
      const displayName = this.getSubjectDisplayName(sub, cls.numericGrade);
      const configuredComponents = this.getComponentsForClass(sub, cls.numericGrade);
      const maxSubMarks = configuredComponents.reduce((sum, c) => sum + c.maxMarks, 0);
      totalMaxMarks += maxSubMarks;

      configuredComponents.forEach(c => {
        if (c.componentKey !== 'ce' && c.componentKey !== 'diary') {
          nonCeDiaryMax += c.maxMarks;
        }
      });

      const ms = markSheetBySub.get(sub.id);
      const entry = ms?.studentMarks?.[student.id];

      if (!ms || !entry) {
        hasIncompleteSubjects = true;
        return {
          subjectId: sub.id,
          code: sub.code,
          subjectNameEn: displayName.nameEn,
          subjectNameMl: displayName.nameMl,
          maxMarks: maxSubMarks,
          obtainedMarks: null,
          isAbsent: false,
          hasMissingCe: false,
          components: configuredComponents.map(c => ({
            key: c.componentKey,
            labelEn: c.labelEn,
            labelMl: c.labelEn,
            maxMarks: c.maxMarks,
            obtainedMarks: null,
          })),
          isComplete: false,
          statusTextEn: 'Pending',
          statusTextMl: 'Pending',
        };
      }

      if (entry.isAbsent) {
        hasAbsentSubjects = true;
        return {
          subjectId: sub.id,
          code: sub.code,
          subjectNameEn: displayName.nameEn,
          subjectNameMl: displayName.nameMl,
          maxMarks: maxSubMarks,
          obtainedMarks: null,
          isAbsent: true,
          hasMissingCe: false,
          components: configuredComponents.map(c => ({
            key: c.componentKey,
            labelEn: c.labelEn,
            labelMl: c.labelEn,
            maxMarks: c.maxMarks,
            obtainedMarks: null,
          })),
          isComplete: true,
          statusTextEn: 'Absent',
          statusTextMl: 'Absent',
        };
      }

      const hasCeComponent = configuredComponents.some(c => c.componentKey === 'ce');
      const ceVal = entry.componentMarks?.['ce'];
      const isCeMissing = hasCeComponent && (ceVal === undefined || ceVal === null || String(ceVal).trim() === '');

      if (isCeMissing) {
        hasWithheldCe = true;
      }

      totalObtainedMarks += entry.subjectTotal;

      let subNonCeMax = 0;
      let subNonCeObtained = 0;
      configuredComponents.forEach(c => {
        if (c.componentKey !== 'ce' && c.componentKey !== 'diary') {
          subNonCeMax += c.maxMarks;
          const mark = entry.componentMarks[c.componentKey] || 0;
          subNonCeObtained += mark;
          nonCeDiaryObtained += mark;
        }
      });

      // Pass threshold: 35% of non-CE/Diary max
      const passThreshold = subNonCeMax * 0.35;
      const isSubjectPassed = subNonCeObtained >= passThreshold;
      if (!isSubjectPassed) {
        anySubjectFailed = true;
      }

      let statusTextEn = isSubjectPassed ? 'Pass' : 'Needs Improvement';
      let statusTextMl = isSubjectPassed ? 'Pass' : 'Needs Improvement';
      if (isCeMissing) {
        statusTextEn = 'Withheld';
        statusTextMl = 'Withheld';
      }

      return {
        subjectId: sub.id,
        code: sub.code,
        subjectNameEn: displayName.nameEn,
        subjectNameMl: displayName.nameMl,
        maxMarks: maxSubMarks,
        obtainedMarks: entry.subjectTotal,
        isAbsent: false,
        hasMissingCe: isCeMissing,
        components: configuredComponents.map(c => ({
          key: c.componentKey,
          labelEn: c.labelEn,
          labelMl: c.labelEn,
          maxMarks: c.maxMarks,
          obtainedMarks: entry.componentMarks[c.componentKey] ?? null,
        })),
        isComplete: true,
        statusTextEn,
        statusTextMl,
      };
    });

    const percentage =
      !hasIncompleteSubjects && !hasAbsentSubjects && totalMaxMarks > 0
        ? Number(((totalObtainedMarks / totalMaxMarks) * 100).toFixed(2))
        : null;

    const overallNonCeThreshold = nonCeDiaryMax * 0.35;
    const passedNonCeCriteria = nonCeDiaryMax > 0 && nonCeDiaryObtained >= overallNonCeThreshold && !anySubjectFailed;

    let resultStatus: 'Passed' | 'Needs Improvement' | 'Withheld' | 'Incomplete' | 'Absent' = 'Passed';
    let resultStatusMl: any = 'Passed';

    if (hasIncompleteSubjects) {
      resultStatus = 'Incomplete';
      resultStatusMl = 'Incomplete';
    } else if (hasAbsentSubjects) {
      resultStatus = 'Absent';
      resultStatusMl = 'Absent';
    } else if (hasWithheldCe) {
      resultStatus = 'Withheld';
      resultStatusMl = 'Withheld';
    } else if (!passedNonCeCriteria) {
      resultStatus = 'Needs Improvement';
      resultStatusMl = 'Needs Improvement';
    }

    return {
      student,
      examination: exam,
      academicYear: ayName,
      classNameEn: cls.name,
      classNameMl: cls.nameMl,
      subjects: reportSubjects,
      totalMaxMarks,
      totalObtainedMarks,
      nonCeDiaryMax,
      nonCeDiaryObtained,
      percentage,
      classRank: hasWithheldCe || hasIncompleteSubjects || hasAbsentSubjects ? null : rankInfo.rank,
      totalStudentsInClass,
      hasIncompleteSubjects,
      hasAbsentSubjects,
      hasWithheldCe,
      resultStatus,
      resultStatusMl,
      isPublished: exam.isPublished,
    };
  }

  // Unified Request Router to process any /api/* call completely in-browser
  public async handleRequest(urlStr: string, options: RequestInit = {}): Promise<Response> {
    const method = (options.method || 'GET').toUpperCase();
    const url = new URL(urlStr, window.location.origin);
    const path = url.pathname;
    const params = url.searchParams;

    let bodyData: any = null;
    if (options.body) {
      if (typeof options.body === 'string') {
        try {
          bodyData = JSON.parse(options.body);
        } catch {
          bodyData = options.body;
        }
      } else if (options.body instanceof FormData) {
        const obj: Record<string, any> = {};
        options.body.forEach((val, key) => {
          obj[key] = val;
        });
        bodyData = obj;
      }
    }

    try {
      // 1. Auth routes
      if (path === '/api/auth/login' && method === 'POST') {
        const res = this.login(bodyData.username || '', bodyData.password || '');
        if (!res.success) {
          return this.jsonResponse({ error: res.error }, 401);
        }
        return this.jsonResponse({ token: res.token, user: res.user });
      }

      if (path === '/api/auth/me' && method === 'GET') {
        const current = this.getCurrentUser();
        if (!current) {
          return this.jsonResponse({ error: 'Unauthorized' }, 401);
        }
        return this.jsonResponse({ user: current });
      }

      if (path === '/api/auth/logout' && method === 'POST') {
        this.logout();
        return this.jsonResponse({ success: true });
      }

      if (path === '/api/auth/profile-credentials' && method === 'PUT') {
        const { newUsername, newPassword, name, nameMl } = bodyData;
        const current = this.getCurrentUser();
        if (!current) {
          return this.jsonResponse({ error: 'Unauthorized' }, 401);
        }

        const adminUser = this.db.users.find(u => u.id === current.id || u.role === 'admin');
        if (!adminUser) {
          return this.jsonResponse({ error: 'Admin user not found' }, 404);
        }

        if (newUsername && newUsername.trim()) {
          adminUser.username = newUsername.trim();
        }
        if (newPassword && newPassword.trim()) {
          adminUser.plainPassword = newPassword.trim();
        }
        if (name && name.trim()) {
          adminUser.name = name.trim();
          this.db.settings.principalNameEn = name.trim();
        }
        if (nameMl && nameMl.trim()) {
          adminUser.nameMl = nameMl.trim();
          this.db.settings.principalNameMl = nameMl.trim();
        }

        this.saveDB();
        this.setCurrentUser(adminUser);
        return this.jsonResponse({ success: true, user: adminUser });
      }

      // 2. Classes & Subjects
      if (path === '/api/classes' && method === 'GET') {
        return this.jsonResponse(this.db.classes);
      }

      if (path === '/api/subjects' && method === 'GET') {
        return this.jsonResponse(this.db.subjects);
      }

      // 3. Teachers
      if (path === '/api/teachers' && method === 'GET') {
        const teachers = this.db.users
          .filter(u => u.role === 'teacher')
          .map(t => ({
            ...t,
            assignments: this.db.teacherAssignments.filter(a => a.teacherId === t.id),
          }));
        return this.jsonResponse(teachers);
      }

      if (path === '/api/teachers' && method === 'POST') {
        const { username, name, nameMl, plainPassword, email, phone, assignments } = bodyData;
        if (!username || !name) {
          return this.jsonResponse({ error: 'Username and Name are required' }, 400);
        }
        if (this.db.users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
          return this.jsonResponse({ error: 'Username already taken' }, 400);
        }

        const newTeacher: User = {
          id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          username: username.trim(),
          name: name.trim(),
          nameMl: nameMl?.trim(),
          role: 'teacher',
          plainPassword: plainPassword?.trim() || 'teacher123',
          active: true,
          email: email?.trim(),
          phone: phone?.trim(),
          createdAt: new Date().toISOString(),
        };

        this.db.users.push(newTeacher);

        if (Array.isArray(assignments)) {
          assignments.forEach(asg => {
            this.db.teacherAssignments.push({
              id: `asg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              teacherId: newTeacher.id,
              classId: asg.classId,
              subjectId: asg.subjectId,
            });
          });
        }

        this.saveDB();
        return this.jsonResponse(newTeacher);
      }

      const teacherIdMatch = path.match(/^\/api\/teachers\/([^/]+)$/);
      if (teacherIdMatch && method === 'PUT') {
        const tId = teacherIdMatch[1];
        const teacher = this.db.users.find(u => u.id === tId && u.role === 'teacher');
        if (!teacher) return this.jsonResponse({ error: 'Teacher not found' }, 404);

        if (bodyData.name !== undefined) teacher.name = bodyData.name.trim();
        if (bodyData.nameMl !== undefined) teacher.nameMl = bodyData.nameMl.trim();
        if (bodyData.username !== undefined) teacher.username = bodyData.username.trim();
        if (bodyData.email !== undefined) teacher.email = bodyData.email.trim();
        if (bodyData.phone !== undefined) teacher.phone = bodyData.phone.trim();
        if (bodyData.active !== undefined) teacher.active = Boolean(bodyData.active);

        this.saveDB();
        return this.jsonResponse(teacher);
      }

      if (teacherIdMatch && method === 'DELETE') {
        const tId = teacherIdMatch[1];
        this.db.users = this.db.users.filter(u => u.id !== tId);
        this.db.teacherAssignments = this.db.teacherAssignments.filter(a => a.teacherId !== tId);
        this.saveDB();
        return this.jsonResponse({ success: true });
      }

      // Password Reset for any user (teacher/parent)
      const userPasswordMatch = path.match(/^\/api\/users\/([^/]+)\/password$/);
      if (userPasswordMatch && method === 'PUT') {
        const uId = userPasswordMatch[1];
        const user = this.db.users.find(u => u.id === uId);
        if (!user) return this.jsonResponse({ error: 'User not found' }, 404);
        if (!bodyData.password || !bodyData.password.trim()) {
          return this.jsonResponse({ error: 'Password cannot be empty' }, 400);
        }
        user.plainPassword = bodyData.password.trim();
        this.saveDB();
        return this.jsonResponse({ success: true });
      }

      // Teacher assignments
      if (path === '/api/teacher-assignments' && method === 'GET') {
        return this.jsonResponse(this.db.teacherAssignments);
      }

      if (path === '/api/teacher-assignments' && method === 'POST') {
        const { teacherId, classId, subjectId } = bodyData;
        const exists = this.db.teacherAssignments.some(
          a => a.teacherId === teacherId && a.classId === classId && a.subjectId === subjectId
        );
        if (exists) {
          return this.jsonResponse({ error: 'Assignment already exists' }, 400);
        }
        const newAssignment: TeacherAssignment = {
          id: `asg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          teacherId,
          classId,
          subjectId,
        };
        this.db.teacherAssignments.push(newAssignment);
        this.saveDB();
        return this.jsonResponse(newAssignment);
      }

      const asgIdMatch = path.match(/^\/api\/teacher-assignments\/([^/]+)$/);
      if (asgIdMatch && method === 'DELETE') {
        const asgId = asgIdMatch[1];
        this.db.teacherAssignments = this.db.teacherAssignments.filter(a => a.id !== asgId);
        this.saveDB();
        return this.jsonResponse({ success: true });
      }

      // 4. Students
      if (path === '/api/students' && method === 'GET') {
        const classId = params.get('classId');
        let students = this.db.students;
        if (classId) {
          students = students.filter(s => s.classId === classId);
        }
        return this.jsonResponse(students);
      }

      if (path === '/api/students' && method === 'POST') {
        const newStudent: Student = {
          id: `stu_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          admissionNo: bodyData.admissionNo.trim(),
          rollNo: Number(bodyData.rollNo) || 1,
          nameEn: bodyData.nameEn.trim(),
          nameMl: bodyData.nameMl?.trim() || bodyData.nameEn.trim(),
          classId: bodyData.classId,
          academicYearId: bodyData.academicYearId || 'ay_2026_2027',
          parentNameEn: bodyData.parentNameEn?.trim() || '',
          parentNameMl: bodyData.parentNameMl?.trim() || '',
          parentPhone: bodyData.parentPhone?.trim() || '',
          status: 'active',
          dob: bodyData.dob,
          gender: bodyData.gender,
        };

        // Auto create/update parent account
        if (newStudent.parentNameEn) {
          let parentUser = this.db.users.find(
            u => u.role === 'parent' && u.name.toLowerCase() === newStudent.parentNameEn.toLowerCase()
          );
          if (!parentUser) {
            parentUser = {
              id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              username: newStudent.parentNameEn,
              name: newStudent.parentNameEn,
              nameMl: newStudent.parentNameMl,
              role: 'parent',
              plainPassword: newStudent.admissionNo,
              active: true,
              phone: newStudent.parentPhone,
              createdAt: new Date().toISOString(),
            };
            this.db.users.push(parentUser);
          }
          newStudent.parentUserId = parentUser.id;
        }

        this.db.students.push(newStudent);
        this.saveDB();
        return this.jsonResponse(newStudent);
      }

      const studentIdMatch = path.match(/^\/api\/students\/([^/]+)$/);
      if (studentIdMatch && method === 'PUT') {
        const sId = studentIdMatch[1];
        const student = this.db.students.find(s => s.id === sId);
        if (!student) return this.jsonResponse({ error: 'Student not found' }, 404);

        Object.assign(student, bodyData);
        this.saveDB();
        return this.jsonResponse(student);
      }

      if (studentIdMatch && method === 'DELETE') {
        const sId = studentIdMatch[1];
        this.db.students = this.db.students.filter(s => s.id !== sId);
        this.saveDB();
        return this.jsonResponse({ success: true });
      }

      // Student Import Preview
      if (path === '/api/students/import-preview' && method === 'POST') {
        const { csvText, targetClassId, rows } = bodyData;
        const validRows: any[] = [];
        const invalidRows: any[] = [];
        const errors: any[] = [];
        const parsedRecords: any[] = [];

        if (csvText) {
          const lines = csvText.split(/\r?\n/).filter((l: string) => l.trim().length > 0);
          if (lines.length >= 2) {
            const headers = lines[0].split(',').map((h: string) => h.trim().toLowerCase().replace(/['"]/g, ''));
            for (let i = 1; i < lines.length; i++) {
              const rawCols = lines[i].split(',').map((c: string) => c.trim().replace(/^["']|["']$/g, ''));
              if (rawCols.length < 2) continue;

              const rowObj: any = {};
              headers.forEach((h: string, idx: number) => {
                rowObj[h] = rawCols[idx] || '';
              });

              const admissionNo = rowObj['admission_no'] || rowObj['admissionno'] || rowObj['adm_no'] || rowObj['admission'] || rawCols[0];
              const nameEn = rowObj['student_name'] || rowObj['name'] || rowObj['name_en'] || rowObj['student'] || rawCols[1];
              const nameMl = rowObj['name_ml'] || rowObj['malayalam_name'] || nameEn;
              const rollNo = parseInt(rowObj['roll_no'] || rowObj['rollno'] || rowObj['roll']) || i;
              const parentName = rowObj['parent_name'] || rowObj['guardian_name'] || rowObj['parent'] || rawCols[3] || '';
              const parentPhone = rowObj['phone'] || rowObj['mobile'] || rowObj['contact'] || rawCols[4] || '';

              const rowErrors: string[] = [];
              if (!admissionNo) rowErrors.push('Missing Admission Number');
              if (!nameEn) rowErrors.push('Missing Student Name');

              const record = {
                rowNumber: i,
                admissionNo: admissionNo || '',
                rollNo,
                nameEn: nameEn || '',
                nameMl: nameMl || '',
                parentNameEn: parentName,
                parentPhone,
                classId: targetClassId || 'cls_1',
                isValid: rowErrors.length === 0,
                errors: rowErrors,
              };

              parsedRecords.push(record);
              if (rowErrors.length === 0) {
                validRows.push(record);
              } else {
                invalidRows.push(record);
                errors.push(`Row #${i}: ${rowErrors.join(', ')}`);
              }
            }
          }
        } else if (Array.isArray(rows)) {
          rows.forEach((row: any, idx: number) => {
            const adm = String(row.admissionNo || row['Admission No'] || row['AdmissionNo'] || '').trim();
            const nameEn = String(row.nameEn || row['Name'] || row['Student Name'] || '').trim();
            const className = String(row.className || row['Class'] || '').trim();

            let targetClass = this.db.classes.find(
              c => c.name.toLowerCase() === className.toLowerCase() || c.nameMl === className
            );
            if (!targetClass && className) {
              const digit = className.replace(/\D/g, '');
              if (digit) targetClass = this.db.classes.find(c => c.numericGrade === parseInt(digit, 10));
            }
            if (!targetClass && targetClassId) {
              targetClass = this.db.classes.find(c => c.id === targetClassId);
            }

            if (!adm || !nameEn || !targetClass) {
              invalidRows.push({ row, reason: `Row #${idx + 1}: Missing Admission No, Name, or Valid Class` });
              errors.push(`Row #${idx + 1}: Incomplete information`);
            } else {
              const rec = {
                admissionNo: adm,
                rollNo: Number(row.rollNo || row['Roll No'] || row['RollNo']) || validRows.length + 1,
                nameEn,
                nameMl: String(row.nameMl || row['Malayalam Name'] || nameEn).trim(),
                classId: targetClass.id,
                className: targetClass.name,
                parentNameEn: String(row.parentNameEn || row['Parent Name'] || row['Guardian'] || '').trim(),
                parentNameMl: String(row.parentNameMl || '').trim(),
                parentPhone: String(row.parentPhone || row['Phone'] || row['Mobile'] || '').trim(),
                gender: (row.gender || row['Gender'] || 'M').toUpperCase().startsWith('F') ? 'F' : 'M',
                isValid: true,
              };
              validRows.push(rec);
              parsedRecords.push(rec);
            }
          });
        }

        return this.jsonResponse({
          totalRows: parsedRecords.length || (rows || []).length,
          validRows: validRows.length,
          invalidRows: invalidRows.length,
          errorRows: errors.length,
          records: parsedRecords,
          students: validRows,
          errors,
        });
      }

      // Student Import Commit (Automatically creates/updates parent accounts)
      if (path === '/api/students/import-commit' && method === 'POST') {
        const { students, records, targetClassId } = bodyData;
        const itemsToProcess = Array.isArray(records) ? records : Array.isArray(students) ? students : [];
        let importedCount = 0;
        let parentAccountCount = 0;

        itemsToProcess.forEach((item: any) => {
          if (item.isValid === false) return;
          const admNo = String(item.admissionNo || '').trim();
          const nameEn = String(item.nameEn || '').trim();
          if (!admNo || !nameEn) return;

          const clsId = item.classId || targetClassId || 'cls_1';
          const pName = String(item.parentNameEn || '').trim();
          let parentUserId: string | undefined;

          if (pName) {
            let parentUser = this.db.users.find(
              u => u.role === 'parent' && (u.username.toLowerCase() === pName.toLowerCase() || u.name.toLowerCase() === pName.toLowerCase())
            );

            if (!parentUser) {
              parentUser = {
                id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                username: pName,
                name: pName,
                nameMl: item.parentNameMl ? String(item.parentNameMl).trim() : pName,
                role: 'parent',
                plainPassword: admNo,
                active: true,
                phone: item.parentPhone ? String(item.parentPhone).trim() : '',
                createdAt: new Date().toISOString(),
              };
              this.db.users.push(parentUser);
              parentAccountCount++;
            }
            parentUserId = parentUser.id;
          }

          let existing = this.db.students.find(s => s.admissionNo === admNo);
          if (existing) {
            Object.assign(existing, {
              rollNo: Number(item.rollNo) || existing.rollNo,
              nameEn,
              nameMl: item.nameMl ? String(item.nameMl).trim() : nameEn,
              classId: clsId,
              parentNameEn: pName,
              parentNameMl: item.parentNameMl ? String(item.parentNameMl).trim() : pName,
              parentPhone: item.parentPhone ? String(item.parentPhone).trim() : existing.parentPhone,
              parentUserId: parentUserId || existing.parentUserId,
            });
          } else {
            const studentId = `stu_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            this.db.students.push({
              id: studentId,
              admissionNo: admNo,
              rollNo: Number(item.rollNo) || 1,
              nameEn,
              nameMl: item.nameMl ? String(item.nameMl).trim() : nameEn,
              classId: clsId,
              academicYearId: this.db.settings.activeAcademicYearId || 'ay_2026_2027',
              parentNameEn: pName,
              parentNameMl: item.parentNameMl ? String(item.parentNameMl).trim() : pName,
              parentPhone: item.parentPhone ? String(item.parentPhone).trim() : '',
              parentUserId,
              status: 'active',
              gender: item.gender === 'F' ? 'F' : 'M',
            });
          }
          importedCount++;
        });

        // Re-evaluate elder child admission number password for each affected parent
        this.db.users.filter(u => u.role === 'parent').forEach(parent => {
          const children = this.db.students.filter(s => s.parentUserId === parent.id || s.parentNameEn.toLowerCase() === parent.name.toLowerCase());
          if (children.length > 0) {
            const elder = getElderChild(children, this.db.classes);
            if (elder) {
              parent.plainPassword = elder.admissionNo;
            }
          }
        });

        this.saveDB();
        return this.jsonResponse({
          success: true,
          importedCount,
          createdCount: importedCount,
          parentAccountCount,
        });
      }

      // 5. Parents
      if (path === '/api/parents' && method === 'GET') {
        const parents = this.db.users
          .filter(u => u.role === 'parent')
          .map(p => {
            const linkedStudents = this.db.students.filter(
              s => s.parentUserId === p.id || s.parentNameEn.toLowerCase() === p.name.toLowerCase()
            );
            return {
              ...p,
              linkedStudents,
            };
          });
        return this.jsonResponse(parents);
      }

      if (path === '/api/parents' && method === 'POST') {
        const { username, name, nameMl, phone, studentIds } = bodyData;
        if (!name) return this.jsonResponse({ error: 'Parent Name is required' }, 400);

        const newParent: User = {
          id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          username: username?.trim() || name.trim(),
          name: name.trim(),
          nameMl: nameMl?.trim(),
          role: 'parent',
          plainPassword: 'password123',
          active: true,
          phone: phone?.trim(),
          createdAt: new Date().toISOString(),
        };

        if (Array.isArray(studentIds) && studentIds.length > 0) {
          const linked = this.db.students.filter(s => studentIds.includes(s.id));
          linked.forEach(s => {
            s.parentUserId = newParent.id;
          });
          const elder = getElderChild(linked, this.db.classes);
          if (elder) {
            newParent.plainPassword = elder.admissionNo;
          }
        }

        this.db.users.push(newParent);
        this.saveDB();
        return this.jsonResponse(newParent);
      }

      const parentIdMatch = path.match(/^\/api\/parents\/([^/]+)$/);
      if (parentIdMatch && method === 'PUT') {
        const pId = parentIdMatch[1];
        const parent = this.db.users.find(u => u.id === pId && u.role === 'parent');
        if (!parent) return this.jsonResponse({ error: 'Parent not found' }, 404);

        if (bodyData.name !== undefined) parent.name = bodyData.name.trim();
        if (bodyData.nameMl !== undefined) parent.nameMl = bodyData.nameMl.trim();
        if (bodyData.username !== undefined) parent.username = bodyData.username.trim();
        if (bodyData.phone !== undefined) parent.phone = bodyData.phone.trim();
        if (bodyData.active !== undefined) parent.active = Boolean(bodyData.active);

        this.saveDB();
        return this.jsonResponse(parent);
      }

      if (parentIdMatch && method === 'DELETE') {
        const pId = parentIdMatch[1];
        this.db.users = this.db.users.filter(u => u.id !== pId);
        this.db.students.forEach(s => {
          if (s.parentUserId === pId) s.parentUserId = undefined;
        });
        this.saveDB();
        return this.jsonResponse({ success: true });
      }

      // Link multiple children to parent
      const parentLinkMatch = path.match(/^\/api\/parents\/([^/]+)\/link-students$/);
      if (parentLinkMatch && method === 'POST') {
        const pId = parentLinkMatch[1];
        const parent = this.db.users.find(u => u.id === pId && u.role === 'parent');
        if (!parent) return this.jsonResponse({ error: 'Parent not found' }, 404);

        const { studentIds } = bodyData;
        if (Array.isArray(studentIds)) {
          studentIds.forEach(sId => {
            const st = this.db.students.find(s => s.id === sId);
            if (st) st.parentUserId = pId;
          });
        }

        const allLinked = this.db.students.filter(s => s.parentUserId === pId);
        const elder = getElderChild(allLinked, this.db.classes);
        if (elder) {
          parent.plainPassword = elder.admissionNo;
        }

        this.saveDB();
        return this.jsonResponse({
          success: true,
          parent,
          elderChildAdmissionNo: elder?.admissionNo,
          linkedStudentsCount: allLinked.length,
        });
      }

      // Unlink child from parent
      const parentUnlinkMatch = path.match(/^\/api\/parents\/([^/]+)\/unlink-student$/);
      if (parentUnlinkMatch && method === 'POST') {
        const pId = parentUnlinkMatch[1];
        const { studentId } = bodyData;
        const student = this.db.students.find(s => s.id === studentId);
        if (student) student.parentUserId = undefined;

        const parent = this.db.users.find(u => u.id === pId);
        const allLinked = this.db.students.filter(s => s.parentUserId === pId);
        const elder = getElderChild(allLinked, this.db.classes);
        if (parent && elder) {
          parent.plainPassword = elder.admissionNo;
        }

        this.saveDB();
        return this.jsonResponse({ success: true });
      }

      // 6. Examinations
      if (path === '/api/academic-years' && method === 'GET') {
        return this.jsonResponse(this.db.academicYears);
      }

      if (path === '/api/examinations' && method === 'GET') {
        return this.jsonResponse(this.db.examinations);
      }

      if (path === '/api/examinations' && method === 'POST') {
        const newExam: Examination = {
          id: `exam_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          academicYearId: bodyData.academicYearId || 'ay_2026_2027',
          nameEn: bodyData.nameEn.trim(),
          nameMl: bodyData.nameMl.trim(),
          startDate: bodyData.startDate,
          endDate: bodyData.endDate,
          isPublished: false,
          status: 'draft',
          classesParticipating: bodyData.classesParticipating || this.db.classes.map(c => c.id),
          passMarkPercentage: 35,
        };
        this.db.examinations.push(newExam);
        this.db.settings.activeExamId = newExam.id;
        this.saveDB();
        return this.jsonResponse(newExam);
      }

      const examReadinessMatch = path.match(/^\/api\/examinations\/([^/]+)\/readiness$/);
      if (examReadinessMatch && method === 'GET') {
        const examId = examReadinessMatch[1];
        const exam = this.db.examinations.find(e => e.id === examId);
        if (!exam) return this.jsonResponse({ error: 'Exam not found' }, 404);

        let totalExpectedSheets = 0;
        let approvedSheets = 0;
        let lockedSheets = 0;
        let missingSheets = 0;
        const sheetDetails: any[] = [];

        exam.classesParticipating.forEach(cId => {
          const cls = this.db.classes.find(c => c.id === cId);
          if (!cls) return;
          const subjects = this.db.subjects.filter(s => s.applicableClasses.includes(cls.numericGrade));
          subjects.forEach(sub => {
            totalExpectedSheets++;
            const sheet = this.db.markSheets.find(
              ms => ms.examinationId === examId && ms.classId === cId && ms.subjectId === sub.id
            );
            const status = sheet?.status || 'not_started';
            if (status === 'approved') approvedSheets++;
            if (status === 'locked') lockedSheets++;
            if (status === 'not_started') missingSheets++;
            sheetDetails.push({
              classId: cId,
              className: cls.name,
              subjectId: sub.id,
              subjectName: sub.nameMl,
              status,
            });
          });
        });

        const isReady = totalExpectedSheets > 0 && approvedSheets + lockedSheets === totalExpectedSheets;
        return this.jsonResponse({
          exam,
          totalExpectedSheets,
          approvedSheets,
          lockedSheets,
          missingSheets,
          isReady,
          sheetDetails,
        });
      }

      const examPublishMatch = path.match(/^\/api\/examinations\/([^/]+)\/publish$/);
      if (examPublishMatch && method === 'POST') {
        const examId = examPublishMatch[1];
        const exam = this.db.examinations.find(e => e.id === examId);
        if (!exam) return this.jsonResponse({ error: 'Exam not found' }, 404);

        const { isPublished } = bodyData;
        exam.isPublished = Boolean(isPublished);
        exam.status = exam.isPublished ? 'published' : 'draft';
        if (exam.isPublished) {
          exam.publishedAt = new Date().toISOString();
        }
        this.saveDB();
        return this.jsonResponse({ success: true, exam });
      }

      // 7. Mark Sheets
      if (path === '/api/mark-sheets' && method === 'GET') {
        const examId = params.get('examinationId');
        let sheets = this.db.markSheets;
        if (examId) sheets = sheets.filter(s => s.examinationId === examId);
        return this.jsonResponse(sheets);
      }

      if (path === '/api/mark-sheet-detail' && method === 'GET') {
        const examId = params.get('examinationId') || '';
        const classId = params.get('classId') || '';
        const subjectId = params.get('subjectId') || '';

        const cls = this.db.classes.find(c => c.id === classId);
        const sub = this.db.subjects.find(s => s.id === subjectId);
        if (!cls || !sub) return this.jsonResponse({ error: 'Class or Subject not found' }, 404);

        let sheet = this.db.markSheets.find(
          ms => ms.examinationId === examId && ms.classId === classId && ms.subjectId === subjectId
        );

        if (!sheet) {
          sheet = {
            id: `ms_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            examinationId: examId,
            academicYearId: 'ay_2026_2027',
            classId,
            subjectId,
            assignedTeacherId: '',
            status: 'draft',
            studentMarks: {},
            lastUpdated: new Date().toISOString(),
          };
          this.db.markSheets.push(sheet);
          this.saveDB();
        }

        const students = this.db.students.filter(s => s.classId === classId && s.status === 'active');
        const components = this.getComponentsForClass(sub, cls.numericGrade);

        return this.jsonResponse({
          markSheet: sheet,
          students,
          subject: sub,
          classItem: cls,
          components,
        });
      }

      if (path === '/api/mark-sheets/save-draft' && method === 'POST') {
        const { markSheetId, studentMarks } = bodyData;
        const sheet = this.db.markSheets.find(s => s.id === markSheetId);
        if (!sheet) return this.jsonResponse({ error: 'Mark sheet not found' }, 404);

        sheet.studentMarks = studentMarks;
        sheet.status = 'draft';
        sheet.lastUpdated = new Date().toISOString();
        this.saveDB();
        return this.jsonResponse({ success: true, markSheet: sheet });
      }

      const markSheetActionMatch = path.match(/^\/api\/mark-sheets\/([^/]+)\/([^/]+)$/);
      if (markSheetActionMatch && method === 'POST') {
        const [, msId, action] = markSheetActionMatch;
        const sheet = this.db.markSheets.find(s => s.id === msId);
        if (!sheet) return this.jsonResponse({ error: 'Mark sheet not found' }, 404);

        if (action === 'submit') {
          sheet.status = 'submitted';
          sheet.submittedAt = new Date().toISOString();
        } else if (action === 'approve') {
          sheet.status = 'approved';
          sheet.verifiedAt = new Date().toISOString();
          sheet.verifiedBy = this.getCurrentUser()?.name || 'Admin';
        } else if (action === 'lock') {
          sheet.status = 'locked';
          sheet.lockedAt = new Date().toISOString();
        } else if (action === 'unlock') {
          sheet.status = 'approved';
        } else if (action === 'return-correction') {
          sheet.status = 'returned_for_correction';
          sheet.returnedReason = bodyData.reason || '';
        } else if (action === 'admin-correct') {
          sheet.studentMarks = bodyData.studentMarks;
          sheet.lastUpdated = new Date().toISOString();
        }

        this.saveDB();
        return this.jsonResponse({ success: true, markSheet: sheet });
      }

      // 8. Progress Reports
      const classReportMatch = path.match(/^\/api\/reports\/class\/([^/]+)\/exam\/([^/]+)$/);
      if (classReportMatch && method === 'GET') {
        const [, cId, eId] = classReportMatch;
        const students = this.db.students.filter(s => s.classId === cId && s.status === 'active');
        const reports: StudentProgressReport[] = [];
        students.forEach(st => {
          const r = this.generateStudentProgressReport(st.id, eId);
          if (r) reports.push(r);
        });
        const cls = this.db.classes.find(c => c.id === cId);
        const exam = this.db.examinations.find(e => e.id === eId);
        return this.jsonResponse({
          reports,
          className: cls?.name,
          examName: exam?.nameEn,
          totalStudents: students.length,
        });
      }

      const studentReportMatch = path.match(/^\/api\/reports\/student\/([^/]+)\/exam\/([^/]+)$/);
      if (studentReportMatch && method === 'GET') {
        const [, sId, eId] = studentReportMatch;
        const report = this.generateStudentProgressReport(sId, eId);
        if (!report) return this.jsonResponse({ error: 'Report could not be generated' }, 404);
        return this.jsonResponse(report);
      }

      // Monitoring Matrix
      if (path === '/api/monitoring/matrix' && method === 'GET') {
        const examId = params.get('examinationId') || this.db.examinations[0]?.id;
        const matrix: any[] = [];

        this.db.classes.forEach(cls => {
          const subs = this.db.subjects.filter(s => s.applicableClasses.includes(cls.numericGrade));
          subs.forEach(sub => {
            const assignment = this.db.teacherAssignments.find(
              a => a.classId === cls.id && a.subjectId === sub.id
            );
            const teacher = assignment ? this.db.users.find(u => u.id === assignment.teacherId) : null;
            const ms = this.db.markSheets.find(
              s => s.examinationId === examId && s.classId === cls.id && s.subjectId === sub.id
            );
            matrix.push({
              classId: cls.id,
              className: cls.name,
              classNameMl: cls.nameMl,
              numericGrade: cls.numericGrade,
              subjectId: sub.id,
              subjectCode: sub.code,
              subjectNameEn: sub.nameEn,
              subjectNameMl: sub.nameMl,
              teacherName: teacher ? teacher.name : 'Unassigned',
              status: ms?.status || 'not_started',
              studentCount: this.db.students.filter(s => s.classId === cls.id && s.status === 'active').length,
            });
          });
        });

        return this.jsonResponse(matrix);
      }

      if (path === '/api/monitoring/overview' && method === 'GET') {
        return this.jsonResponse({
          activeExam: this.db.examinations.find(e => e.isPublished) || this.db.examinations[0] || null,
          totalStudents: this.db.students.filter(s => s.status === 'active').length,
          totalTeachers: this.db.users.filter(u => u.role === 'teacher').length,
          totalClasses: this.db.classes.length,
        });
      }

      // 9. Settings & Backup
      if (path === '/api/settings' && method === 'GET') {
        return this.jsonResponse(this.db.settings);
      }

      if (path === '/api/settings' && method === 'PUT') {
        Object.assign(this.db.settings, bodyData);
        this.saveDB();
        return this.jsonResponse(this.db.settings);
      }

      if (path === '/api/backup/download' && method === 'GET') {
        return this.jsonResponse(this.db);
      }

      if (path === '/api/backup/restore' && method === 'POST') {
        if (!bodyData || !bodyData.classes || !bodyData.subjects) {
          return this.jsonResponse({ error: 'Invalid backup file structure' }, 400);
        }
        this.saveDBSync(bodyData);
        return this.jsonResponse({ success: true });
      }

      if (path === '/api/audit-logs' && method === 'GET') {
        return this.jsonResponse(this.db.auditLogs);
      }

      // CSV exports
      if (path === '/api/export/class-results-csv' && method === 'GET') {
        const cId = params.get('classId') || '';
        const eId = params.get('examId') || '';
        const students = this.db.students.filter(s => s.classId === cId && s.status === 'active');
        let csv = 'Roll No,Admission No,Student Name,Result Status,Percentage,Class Rank\n';
        students.forEach(st => {
          const r = this.generateStudentProgressReport(st.id, eId);
          csv += `${st.rollNo},${st.admissionNo},"${st.nameEn}",${r?.resultStatus || 'N/A'},${r?.percentage || 'N/A'},${r?.classRank || 'N/A'}\n`;
        });
        return new Response(csv, {
          status: 200,
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="class_${cId}_results.csv"`,
          },
        });
      }

      if (path === '/api/students/export-csv' && method === 'GET') {
        const cId = params.get('classId');
        let students = this.db.students;
        if (cId) students = students.filter(s => s.classId === cId);
        let csv = 'Admission No,Roll No,Name English,Name Malayalam,Class,Parent Name,Parent Phone\n';
        students.forEach(s => {
          const cls = this.db.classes.find(c => c.id === s.classId);
          csv += `"${s.admissionNo}",${s.rollNo},"${s.nameEn}","${s.nameMl}","${cls?.name || s.classId}","${s.parentNameEn}","${s.parentPhone}"\n`;
        });
        return new Response(csv, {
          status: 200,
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': 'attachment; filename="students_list.csv"',
          },
        });
      }

      return this.jsonResponse({ error: `Not found: ${method} ${path}` }, 404);
    } catch (err: any) {
      console.error('Error in handleRequest:', err);
      return this.jsonResponse({ error: err.message || 'Internal error' }, 500);
    }
  }

  private jsonResponse(data: any, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}

export const clientStorageApi = ClientStorageApi.getInstance();
