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
  sortStudentsBoysFirst,
  assignClassSequentialRollNumbers,
  isBoyStudent,
  FeePayment,
  ClassAttendanceConfig,
  DEFAULT_ADMIN_PERMISSIONS,
} from '../types';
import { firestoreSync } from './firestoreSync';

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
  feePayments: FeePayment[];
  attendanceConfigs: ClassAttendanceConfig[];
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

// Initial clean seed data generator with complete mock data
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

  const examinations: Examination[] = [
    {
      id: 'exam_half_yearly_2026_27',
      academicYearId: 'ay_2026_2027',
      nameEn: 'Half-Yearly Examination 2026–2027',
      nameMl: 'അർദ്ധവാർഷിക പരീക്ഷ 2026–2027',
      startDate: '2026-10-15',
      endDate: '2026-10-25',
      isPublished: false,
      status: 'ongoing',
      classesParticipating: ['cls_1', 'cls_2', 'cls_3', 'cls_4', 'cls_5', 'cls_6', 'cls_7', 'cls_8', 'cls_9'],
      passMarkPercentage: 35,
    },
    {
      id: 'exam_annual_2026_27',
      academicYearId: 'ay_2026_2027',
      nameEn: 'Annual Examination 2026–2027',
      nameMl: 'വാർഷിക പരീക്ഷ 2026–2027',
      startDate: '2027-03-10',
      endDate: '2027-03-22',
      isPublished: false,
      status: 'draft',
      classesParticipating: ['cls_1', 'cls_2', 'cls_3', 'cls_4', 'cls_5', 'cls_6', 'cls_7', 'cls_8', 'cls_9'],
      passMarkPercentage: 35,
    },
  ];

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
    {
      id: 'usr_t1',
      username: 'teacher.abdulrahman',
      name: 'Abdul Rahman',
      nameMl: 'അബ്ദുൽ റഹ്മാൻ',
      role: 'teacher',
      plainPassword: 'teacher123',
      active: true,
      email: 'abdulrahman@madrasapallikkuth.edu',
      phone: '+91 9847123456',
      createdAt: '2026-06-01T08:00:00Z',
    },
    {
      id: 'usr_t2',
      username: 'teacher.muhammad',
      name: 'Muhammad Faizy',
      nameMl: 'മുഹമ്മദ് ഫൈസി',
      role: 'teacher',
      plainPassword: 'teacher123',
      active: true,
      email: 'muhammadfaizy@madrasapallikkuth.edu',
      phone: '+91 9847234567',
      createdAt: '2026-06-01T08:00:00Z',
    },
    {
      id: 'usr_t3',
      username: 'teacher.usman',
      name: 'Usman Musliyar',
      nameMl: 'ഉസ്മാൻ മുസ്ലിയാർ',
      role: 'teacher',
      plainPassword: 'teacher123',
      active: true,
      email: 'usmanmusliyar@madrasapallikkuth.edu',
      phone: '+91 9847345678',
      createdAt: '2026-06-01T08:00:00Z',
    },
    {
      id: 'usr_p1',
      username: 'parent.hamza',
      name: 'Hamza K',
      nameMl: 'ഹംസ കെ',
      role: 'parent',
      plainPassword: '9001',
      active: true,
      email: 'hamza.k@gmail.com',
      phone: '+91 9846123456',
      createdAt: '2026-06-01T08:00:00Z',
    },
  ];

  const students: Student[] = [
    // Class 1
    {
      id: 'st_101',
      admissionNo: '1001',
      rollNo: 1,
      nameEn: 'Muhammed Raihan',
      nameMl: 'മുഹമ്മദ് റൈഹാൻ',
      classId: 'cls_1',
      academicYearId: 'ay_2026_2027',
      parentNameEn: 'Hamza K',
      parentNameMl: 'ഹംസ കെ',
      parentPhone: '+91 9846123456',
      parentUserId: 'usr_p1',
      status: 'active',
      gender: 'M',
    },
    {
      id: 'st_102',
      admissionNo: '1002',
      rollNo: 2,
      nameEn: 'Fathima Rida',
      nameMl: 'ഫാത്തിമ റിദ',
      classId: 'cls_1',
      academicYearId: 'ay_2026_2027',
      parentNameEn: 'Ibrahim M',
      parentNameMl: 'ഇബ്രാഹിം എം',
      parentPhone: '+91 9846123457',
      status: 'active',
      gender: 'F',
    },
    {
      id: 'st_103',
      admissionNo: '1003',
      rollNo: 3,
      nameEn: 'Bilal Ahmed',
      nameMl: 'ബിലാൽ അഹമ്മദ്',
      classId: 'cls_1',
      academicYearId: 'ay_2026_2027',
      parentNameEn: 'Musthafa P',
      parentNameMl: 'മുസ്തഫ പി',
      parentPhone: '+91 9846123458',
      status: 'active',
      gender: 'M',
    },
    {
      id: 'st_104',
      admissionNo: '1004',
      rollNo: 4,
      nameEn: 'Ayesha Noor',
      nameMl: 'ആയിഷ നൂർ',
      classId: 'cls_1',
      academicYearId: 'ay_2026_2027',
      parentNameEn: 'Kabeer T',
      parentNameMl: 'കബീർ ടി',
      parentPhone: '+91 9846123459',
      status: 'active',
      gender: 'F',
    },
    // Class 2
    {
      id: 'st_201',
      admissionNo: '2001',
      rollNo: 1,
      nameEn: 'Zayan Malik',
      nameMl: 'സയാൻ മാലിക്',
      classId: 'cls_2',
      academicYearId: 'ay_2026_2027',
      parentNameEn: 'Shafi V',
      parentNameMl: 'ഷാഫി വി',
      parentPhone: '+91 9846123460',
      status: 'active',
      gender: 'M',
    },
    {
      id: 'st_202',
      admissionNo: '2002',
      rollNo: 2,
      nameEn: 'Huda Fathima',
      nameMl: 'ഹുദ ഫാത്തിമ',
      classId: 'cls_2',
      academicYearId: 'ay_2026_2027',
      parentNameEn: 'Rasheed A',
      parentNameMl: 'റഷീദ് എ',
      parentPhone: '+91 9846123461',
      status: 'active',
      gender: 'F',
    },
    // Class 5
    {
      id: 'st_501',
      admissionNo: '5001',
      rollNo: 1,
      nameEn: 'Ahmed Nihal',
      nameMl: 'അഹമ്മദ് നിഹാൽ',
      classId: 'cls_5',
      academicYearId: 'ay_2026_2027',
      parentNameEn: 'Abdul Latheef',
      parentNameMl: 'അബ്ദുൽ ലത്തീഫ്',
      parentPhone: '+91 9846123462',
      status: 'active',
      gender: 'M',
    },
    {
      id: 'st_502',
      admissionNo: '5002',
      rollNo: 2,
      nameEn: 'Aisha Minha',
      nameMl: 'ആയിഷ മിൻഹ',
      classId: 'cls_5',
      academicYearId: 'ay_2026_2027',
      parentNameEn: 'Usman Farook',
      parentNameMl: 'ഉസ്മാൻ ഫാറൂഖ്',
      parentPhone: '+91 9846123463',
      status: 'active',
      gender: 'F',
    },
    {
      id: 'st_503',
      admissionNo: '5003',
      rollNo: 3,
      nameEn: 'Zainul Abid',
      nameMl: 'സൈനുൽ ആബിദ്',
      classId: 'cls_5',
      academicYearId: 'ay_2026_2027',
      parentNameEn: 'Hamza K',
      parentNameMl: 'ഹംസ കെ',
      parentPhone: '+91 9846123456',
      parentUserId: 'usr_p1',
      status: 'active',
      gender: 'M',
    },
    {
      id: 'st_504',
      admissionNo: '5004',
      rollNo: 4,
      nameEn: 'Safwan Ali',
      nameMl: 'സഫ്‍വാൻ അലി',
      classId: 'cls_5',
      academicYearId: 'ay_2026_2027',
      parentNameEn: 'Ali Master',
      parentNameMl: 'അലി മാസ്റ്റർ',
      parentPhone: '+91 9846123464',
      status: 'active',
      gender: 'M',
    },
    // Class 3
    {
      id: 'st_301',
      admissionNo: '3001',
      rollNo: 1,
      nameEn: 'Adil Mansoor',
      nameMl: 'ആദിൽ മൻസൂർ',
      classId: 'cls_3',
      academicYearId: 'ay_2026_2027',
      parentNameEn: 'Mansoor Ali',
      parentNameMl: 'മൻസൂർ അലി',
      parentPhone: '+91 9846123470',
      status: 'active',
      gender: 'M',
    },
    // Class 4
    {
      id: 'st_401',
      admissionNo: '4001',
      rollNo: 1,
      nameEn: 'Haneen Fathima',
      nameMl: 'ഹനീൻ ഫാത്തിമ',
      classId: 'cls_4',
      academicYearId: 'ay_2026_2027',
      parentNameEn: 'Faizal K',
      parentNameMl: 'ഫൈസൽ കെ',
      parentPhone: '+91 9846123471',
      status: 'active',
      gender: 'F',
    },
    // Class 6
    {
      id: 'st_601',
      admissionNo: '6001',
      rollNo: 1,
      nameEn: 'Bilal Farhan',
      nameMl: 'ബിലാൽ ഫർഹാൻ',
      classId: 'cls_6',
      academicYearId: 'ay_2026_2027',
      parentNameEn: 'Farhan K',
      parentNameMl: 'ഫർഹാൻ കെ',
      parentPhone: '+91 9846123472',
      status: 'active',
      gender: 'M',
    },
    // Class 7
    {
      id: 'st_701',
      admissionNo: '862',
      rollNo: 1,
      nameEn: 'Muhammed Hafiz C',
      nameMl: 'മുഹമ്മദ് ഹാഫിസ് സി',
      classId: 'cls_7',
      academicYearId: 'ay_2026_2027',
      parentNameEn: 'Hamza K',
      parentNameMl: 'ഹംസ കെ',
      parentPhone: '+91 9846123456',
      parentUserId: 'usr_p1',
      status: 'active',
      gender: 'M',
      examRegisterNumbers: {
        exam_half_yearly_2026_27: '701',
      },
    },
    {
      id: 'st_702',
      admissionNo: '7002',
      rollNo: 2,
      nameEn: 'Fathima Sana',
      nameMl: 'ഫാത്തിമ സന',
      classId: 'cls_7',
      academicYearId: 'ay_2026_2027',
      parentNameEn: 'Abdul Rasheed',
      parentNameMl: 'അബ്ദുൽ റഷീദ്',
      parentPhone: '+91 9846123473',
      status: 'active',
      gender: 'F',
      examRegisterNumbers: {
        exam_half_yearly_2026_27: '702',
      },
    },
    // Class 8
    {
      id: 'st_801',
      admissionNo: '8001',
      rollNo: 1,
      nameEn: 'Rayan Abdullah',
      nameMl: 'റയാൻ അബ്ദുള്ള',
      classId: 'cls_8',
      academicYearId: 'ay_2026_2027',
      parentNameEn: 'Abdullah K',
      parentNameMl: 'അബ്ദുള്ള കെ',
      parentPhone: '+91 9846123474',
      status: 'active',
      gender: 'M',
    },
    // Class 9
    {
      id: 'st_901',
      admissionNo: '9001',
      rollNo: 1,
      nameEn: 'Salman Faris',
      nameMl: 'സൽമാൻ ഫാരിസ്',
      classId: 'cls_9',
      academicYearId: 'ay_2026_2027',
      parentNameEn: 'Hamza K',
      parentNameMl: 'ഹംസ കെ',
      parentPhone: '+91 9846123456',
      parentUserId: 'usr_p1',
      status: 'active',
      gender: 'M',
    },
    {
      id: 'st_902',
      admissionNo: '9002',
      rollNo: 2,
      nameEn: 'Maryam Safa',
      nameMl: 'മറിയം സഫ',
      classId: 'cls_9',
      academicYearId: 'ay_2026_2027',
      parentNameEn: 'Abdulla Master',
      parentNameMl: 'അബ്ദുള്ള മാസ്റ്റർ',
      parentPhone: '+91 9846123465',
      status: 'active',
      gender: 'F',
    },
    {
      id: 'st_903',
      admissionNo: '9003',
      rollNo: 3,
      nameEn: 'Adil Ibrahim',
      nameMl: 'ആദിൽ ഇബ്രാഹിം',
      classId: 'cls_9',
      academicYearId: 'ay_2026_2027',
      parentNameEn: 'Ibrahim M',
      parentNameMl: 'ഇബ്രാഹിം എം',
      parentPhone: '+91 9846123457',
      status: 'active',
      gender: 'M',
    },
  ];

  const teacherAssignments: TeacherAssignment[] = [
    // Class 1
    { id: 'asgn_1', teacherId: 'usr_t1', classId: 'cls_1', subjectId: 'sub_hifz' },
    { id: 'asgn_2', teacherId: 'usr_t2', classId: 'cls_1', subjectId: 'sub_tarbiyah' },
    { id: 'asgn_3', teacherId: 'usr_t1', classId: 'cls_1', subjectId: 'sub_arabic' },
    { id: 'asgn_4', teacherId: 'usr_t3', classId: 'cls_1', subjectId: 'sub_islamic_studies' },
    // Class 5
    { id: 'asgn_5', teacherId: 'usr_t2', classId: 'cls_5', subjectId: 'sub_fiqh' },
    { id: 'asgn_6', teacherId: 'usr_t2', classId: 'cls_5', subjectId: 'sub_hadith' },
    { id: 'asgn_7', teacherId: 'usr_t3', classId: 'cls_5', subjectId: 'sub_tafsir' },
    { id: 'asgn_8', teacherId: 'usr_t1', classId: 'cls_5', subjectId: 'sub_arabic' },
    { id: 'asgn_9', teacherId: 'usr_t3', classId: 'cls_5', subjectId: 'sub_history_buhuth' },
    // Class 9
    { id: 'asgn_10', teacherId: 'usr_t3', classId: 'cls_9', subjectId: 'sub_history_buhuth' },
    { id: 'asgn_11', teacherId: 'usr_t1', classId: 'cls_9', subjectId: 'sub_tilawah' },
    { id: 'asgn_12', teacherId: 'usr_t2', classId: 'cls_9', subjectId: 'sub_fiqh' },
  ];

  const markSheets: MarkSheet[] = [
    {
      id: 'ms_c1_hifz',
      examinationId: 'exam_half_yearly_2026_27',
      academicYearId: 'ay_2026_2027',
      classId: 'cls_1',
      subjectId: 'sub_hifz',
      assignedTeacherId: 'usr_t1',
      status: 'approved',
      studentMarks: {
        st_101: { studentId: 'st_101', isAbsent: false, componentMarks: { new_portion: 28, revision: 9, ce: 10 }, subjectTotal: 47 },
        st_102: { studentId: 'st_102', isAbsent: false, componentMarks: { new_portion: 27, revision: 8, ce: 9 }, subjectTotal: 44 },
        st_103: { studentId: 'st_103', isAbsent: false, componentMarks: { new_portion: 25, revision: 8, ce: 8 }, subjectTotal: 41 },
        st_104: { studentId: 'st_104', isAbsent: false, componentMarks: { new_portion: 29, revision: 10, ce: 10 }, subjectTotal: 49 },
      },
      verifiedAt: '2026-10-18T10:00:00Z',
      verifiedBy: 'usr_admin',
      lastUpdated: '2026-10-18T10:00:00Z',
    },
    {
      id: 'ms_c1_tarbiyah',
      examinationId: 'exam_half_yearly_2026_27',
      academicYearId: 'ay_2026_2027',
      classId: 'cls_1',
      subjectId: 'sub_tarbiyah',
      assignedTeacherId: 'usr_t2',
      status: 'submitted',
      studentMarks: {
        st_101: { studentId: 'st_101', isAbsent: false, componentMarks: { salawat: 28, duas: 9, diary: 10 }, subjectTotal: 47 },
        st_102: { studentId: 'st_102', isAbsent: false, componentMarks: { salawat: 26, duas: 8, diary: 9 }, subjectTotal: 43 },
        st_103: { studentId: 'st_103', isAbsent: false, componentMarks: { salawat: 24, duas: 7, diary: 8 }, subjectTotal: 39 },
        st_104: { studentId: 'st_104', isAbsent: false, componentMarks: { salawat: 29, duas: 9, diary: 10 }, subjectTotal: 48 },
      },
      submittedAt: '2026-10-18T11:00:00Z',
      lastUpdated: '2026-10-18T11:00:00Z',
    },
    {
      id: 'ms_c5_fiqh',
      examinationId: 'exam_half_yearly_2026_27',
      academicYearId: 'ay_2026_2027',
      classId: 'cls_5',
      subjectId: 'sub_fiqh',
      assignedTeacherId: 'usr_t2',
      status: 'draft',
      studentMarks: {
        st_501: { studentId: 'st_501', isAbsent: false, componentMarks: { omr: 18, descriptive: 17, ce: 9 }, subjectTotal: 44 },
        st_502: { studentId: 'st_502', isAbsent: false, componentMarks: { omr: 19, descriptive: 18, ce: 10 }, subjectTotal: 47 },
      },
      lastUpdated: '2026-10-18T12:00:00Z',
    },
    {
      id: 'ms_c7_fiqh',
      examinationId: 'exam_half_yearly_2026_27',
      academicYearId: 'ay_2026_2027',
      classId: 'cls_7',
      subjectId: 'sub_fiqh',
      assignedTeacherId: 'usr_t2',
      status: 'approved',
      studentMarks: {
        st_701: { studentId: 'st_701', isAbsent: false, componentMarks: { omr: 19, descriptive: 18, ce: 10 }, subjectTotal: 47 },
        '862': { studentId: 'st_701', isAbsent: false, componentMarks: { omr: 19, descriptive: 18, ce: 10 }, subjectTotal: 47 },
        st_702: { studentId: 'st_702', isAbsent: false, componentMarks: { omr: 18, descriptive: 17, ce: 9 }, subjectTotal: 44 },
      },
      verifiedAt: '2026-10-18T12:00:00Z',
      verifiedBy: 'usr_admin',
      lastUpdated: '2026-10-18T12:00:00Z',
    },
    {
      id: 'ms_c7_tafsir',
      examinationId: 'exam_half_yearly_2026_27',
      academicYearId: 'ay_2026_2027',
      classId: 'cls_7',
      subjectId: 'sub_tafsir',
      assignedTeacherId: 'usr_t1',
      status: 'approved',
      studentMarks: {
        st_701: { studentId: 'st_701', isAbsent: false, componentMarks: { omr: 19, descriptive: 19, ce: 10 }, subjectTotal: 48 },
        '862': { studentId: 'st_701', isAbsent: false, componentMarks: { omr: 19, descriptive: 19, ce: 10 }, subjectTotal: 48 },
        st_702: { studentId: 'st_702', isAbsent: false, componentMarks: { omr: 17, descriptive: 18, ce: 9 }, subjectTotal: 44 },
      },
      verifiedAt: '2026-10-18T12:00:00Z',
      verifiedBy: 'usr_admin',
      lastUpdated: '2026-10-18T12:00:00Z',
    },
    {
      id: 'ms_c9_buhuth',
      examinationId: 'exam_half_yearly_2026_27',
      academicYearId: 'ay_2026_2027',
      classId: 'cls_9',
      subjectId: 'sub_history_buhuth',
      assignedTeacherId: 'usr_t3',
      status: 'approved',
      studentMarks: {
        st_901: { studentId: 'st_901', isAbsent: false, componentMarks: { omr: 19, descriptive: 19, ce: 10 }, subjectTotal: 48 },
        st_902: { studentId: 'st_902', isAbsent: false, componentMarks: { omr: 18, descriptive: 18, ce: 9 }, subjectTotal: 45 },
        st_903: { studentId: 'st_903', isAbsent: false, componentMarks: { omr: 17, descriptive: 16, ce: 8 }, subjectTotal: 41 },
      },
      verifiedAt: '2026-10-18T13:00:00Z',
      verifiedBy: 'usr_admin',
      lastUpdated: '2026-10-18T13:00:00Z',
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
    activeExamId: 'exam_half_yearly_2026_27',
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
      details: 'System initialized for Al-Madrasathul Islamiya Pallikkuth with Principal ASLAM TK, active examination, classes 1-9, teachers, and student records.',
    },
  ];

  return {
    users,
    classes,
    subjects,
    academicYears: [academicYear],
    examinations,
    students: assignClassSequentialRollNumbers(students),
    teacherAssignments,
    markSheets,
    auditLogs,
    settings,
    feePayments: [],
    attendanceConfigs: [],
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
    this.initFirestoreSync();
  }

  /**
   * Resequences roll numbers class-wise strictly starting from 1 onward
   * based on the unified sorting rule:
   * 1st: Boys ('male' / 'boy') alphabetically (A to Z) -> Roll 1, 2, 3...
   * 2nd: Girls ('female' / 'girl') alphabetically (A to Z) -> Roll n+1, n+2...
   */
  public resequenceClassRollNumbers(targetClassId?: string): void {
    const classIds = targetClassId
      ? [targetClassId]
      : Array.from(new Set(this.db.students.map(s => s.classId)));

    classIds.forEach(cId => {
      const classStudents = this.db.students.filter(s => s.classId === cId && s.status !== 'inactive');
      const sorted = sortStudentsBoysFirst(classStudents);
      sorted.forEach((student, index) => {
        student.rollNo = index + 1;
      });
    });
  }

  private initFirestoreSync(): void {
    if (typeof window === 'undefined') return;
    try {
      firestoreSync.subscribeToCollections({
        onStudents: (remoteStudents) => {
          if (Array.isArray(remoteStudents)) {
            const mapped = remoteStudents.map(st => {
              const regNos = {
                ...((st as any).examRegisterNumbers || {}),
                ...((st as any).examRegisterNos || {}),
              };
              if ((st as any).examRegNo && Object.keys(regNos).length === 0) {
                regNos[this.db.settings?.activeExamId || 'default'] = (st as any).examRegNo;
              }
              return {
                ...st,
                examRegisterNumbers: regNos,
                examRegisterNos: regNos,
                examRegNo: (st as any).examRegNo || Object.values(regNos)[0] || '',
              };
            });
            const resequenced = assignClassSequentialRollNumbers(mapped);
            this.db.students = resequenced;
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(this.db));
            } catch {}
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('madrasa_students_updated', { detail: resequenced }));
            }
          }
        },
        getInitialStudents: () => {
          return this.db.students;
        },
        onTeachers: (remoteTeachers) => {
          if (Array.isArray(remoteTeachers)) {
            this.syncTeachersFromRemote(remoteTeachers);
          }
        },
        getInitialTeachers: () => {
          return this.db.users.filter(u => u.role === 'teacher');
        },
        onParents: (remoteParents) => {
          if (Array.isArray(remoteParents)) {
            // Merge parents into users keeping admin and teachers
            const nonParents = this.db.users.filter(u => u.role !== 'parent');
            this.db.users = [...nonParents, ...remoteParents];
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(this.db));
            } catch {}
          }
        },
        getInitialParents: () => {
          return this.db.users.filter(u => u.role === 'parent');
        },
        onClasses: (remoteClasses) => {
          if (Array.isArray(remoteClasses) && remoteClasses.length > 0) {
            this.db.classes = remoteClasses;
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(this.db));
            } catch {}
          }
        },
        getInitialClasses: () => {
          return this.db.classes;
        },
        onSubjects: (remoteSubjects) => {
          if (Array.isArray(remoteSubjects) && remoteSubjects.length > 0) {
            this.db.subjects = remoteSubjects;
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(this.db));
            } catch {}
          }
        },
        getInitialSubjects: () => {
          return this.db.subjects;
        },
        onMarks: (remoteMarks) => {
          if (Array.isArray(remoteMarks)) {
            this.db.markSheets = remoteMarks;
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(this.db));
            } catch {}
          }
        },
        getInitialMarks: () => {
          return this.db.markSheets;
        },
        onExams: (remoteExams) => {
          if (Array.isArray(remoteExams) && remoteExams.length > 0) {
            this.db.examinations = remoteExams;
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(this.db));
            } catch {}
          }
        },
        getInitialExams: () => {
          return this.db.examinations;
        },
        onFees: (remoteFees) => {
          if (Array.isArray(remoteFees)) {
            this.db.feePayments = remoteFees;
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(this.db));
            } catch {}
          }
        },
        onAdmins: (remoteAdmins) => {
          if (Array.isArray(remoteAdmins)) {
            // Merge sub-admins into users, keeping principal, teachers and parents
            const nonSubAdmins = this.db.users.filter(u => !(u.isSubAdmin || (u.role === 'admin' && u.id !== 'usr_admin' && u.username !== 'principal')));
            this.db.users = [...nonSubAdmins, ...remoteAdmins];
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(this.db));
            } catch {}
          }
        },
        onAttendance: (remoteAttendance) => {
          if (Array.isArray(remoteAttendance)) {
            this.db.attendanceConfigs = remoteAttendance;
            // Also apply to students
            remoteAttendance.forEach(cfg => {
              Object.entries(cfg.studentDaysAttended || {}).forEach(([stuId, days]) => {
                const stu = this.db.students.find(s => s.id === stuId);
                if (stu) {
                  stu.attendance = {
                    daysAttended: days,
                    totalWorkingDays: cfg.totalWorkingDays,
                  };
                }
              });
            });
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(this.db));
            } catch {}
          }
        },
      });
    } catch (e) {
      console.warn('Firestore sync init error:', e);
    }
  }

  public purgeDemoData(): { success: boolean; clearedCount: number } {
    // Keep admin account
    const adminUser: User = this.db.users.find(u => u.role === 'admin' || u.username === 'principal') || {
      id: 'usr_admin',
      username: 'principal',
      name: 'ASLAM TK',
      nameMl: 'അസ്‌ലം ടി.കെ.',
      role: 'admin',
      plainPassword: 'admin123',
      passwordHash: clientHashPassword('admin123'),
      active: true,
    };

    const previousCount = this.db.students.length;
    // Clear students, demo marks, and demo teachers, assignments
    this.db.students = [];
    this.db.markSheets = [];
    this.db.teacherAssignments = [];
    this.db.users = [adminUser];

    // Save to localStorage
    this.saveDB();

    // Purge in Firestore asynchronously
    firestoreSync.purgeDemoDataFromFirestore().catch(e => {
      console.warn('Firestore purge error:', e);
    });

    return { success: true, clearedCount: previousCount };
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
        if (parsed && typeof parsed === 'object') {
          // Ensure all collections are non-null arrays/objects
          parsed.users = Array.isArray(parsed.users) ? parsed.users : [];
          parsed.classes = Array.isArray(parsed.classes) ? parsed.classes : [];
          parsed.subjects = Array.isArray(parsed.subjects) ? parsed.subjects : [];
          parsed.academicYears = Array.isArray(parsed.academicYears) ? parsed.academicYears : [];
          parsed.examinations = Array.isArray(parsed.examinations) ? parsed.examinations : [];
          parsed.students = Array.isArray(parsed.students)
            ? assignClassSequentialRollNumbers(parsed.students)
            : [];
          parsed.teacherAssignments = Array.isArray(parsed.teacherAssignments) ? parsed.teacherAssignments : [];
          parsed.markSheets = Array.isArray(parsed.markSheets) ? parsed.markSheets : [];
          parsed.auditLogs = Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [];
          parsed.settings = parsed.settings || {};
          parsed.feePayments = Array.isArray(parsed.feePayments) ? parsed.feePayments : [];
          parsed.attendanceConfigs = Array.isArray(parsed.attendanceConfigs) ? parsed.attendanceConfigs : [];

          // Ensure admin user exists
          if (!parsed.users.some((u: any) => u.role === 'admin' || u.username === 'principal')) {
            parsed.users.unshift({
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
            });
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

  public calculateExamStats(examId?: string): {
    totalRequiredSheets: number;
    countNotStarted: number;
    countDraft: number;
    countSubmitted: number;
    countApproved: number;
    countLocked: number;
    countReturned: number;
    pending: number;
    submitted: number;
    approved: number;
    locked: number;
  } {
    const defaultStats = {
      totalRequiredSheets: 0,
      countNotStarted: 0,
      countDraft: 0,
      countSubmitted: 0,
      countApproved: 0,
      countLocked: 0,
      countReturned: 0,
      pending: 0,
      submitted: 0,
      approved: 0,
      locked: 0,
    };

    if (!this.db) return defaultStats;

    const targetExamId =
      examId ||
      this.db.settings?.activeExamId ||
      (this.db.examinations || [])[0]?.id ||
      '';

    const exam = (this.db.examinations || []).find(
      e => e && (e.id === targetExamId || e.id?.toString() === targetExamId?.toString() || e.nameEn === targetExamId)
    ) || (this.db.examinations || [])[0];

    const currentExamId = exam?.id?.toString() || targetExamId?.toString();
    const examSheets = (this.db.markSheets || []).filter(ms => {
      if (!ms) return false;
      const sExamId = ms.examId?.toString();
      const sExaminationId = ms.examinationId?.toString();
      return (
        (currentExamId && (sExamId === currentExamId || sExaminationId === currentExamId)) ||
        (exam?.nameEn && ms.examName === exam.nameEn) ||
        (!currentExamId && !sExamId && !sExaminationId) ||
        (this.db.examinations || []).length <= 1
      );
    });

    let countDraft = 0;
    let countSubmitted = 0;
    let countApproved = 0;
    let countLocked = 0;
    let countReturned = 0;

    examSheets.forEach(ms => {
      if (!ms) return;
      if (ms.status === 'draft') countDraft++;
      else if (ms.status === 'submitted') countSubmitted++;
      else if (ms.status === 'approved') countApproved++;
      else if (ms.status === 'locked') countLocked++;
      else if (ms.status === 'returned_for_correction') countReturned++;
    });

    let totalRequiredSheets = 0;
    const participating = exam?.classesParticipating || (this.db.classes || []).map(c => c.id);
    (this.db.classes || [])
      .filter(c => c && participating.includes(c.id))
      .forEach(cls => {
        const applicable = (this.db.subjects || []).filter(
          s => s && s.applicableClasses && s.applicableClasses.includes(cls.numericGrade)
        );
        totalRequiredSheets += applicable.length;
      });

    const countNotStarted = Math.max(0, totalRequiredSheets - examSheets.length);

    return {
      totalRequiredSheets,
      countNotStarted,
      countDraft,
      countSubmitted,
      countApproved,
      countLocked,
      countReturned,
      pending: countDraft + countReturned,
      submitted: countSubmitted,
      approved: countApproved,
      locked: countLocked,
    };
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

  public syncTeachersFromRemote(remoteTeachers: User[]): void {
    if (!Array.isArray(remoteTeachers)) return;
    // Merge teachers into users keeping admin and parents
    const nonTeachers = this.db.users.filter(u => u.role !== 'teacher');
    this.db.users = [...nonTeachers, ...remoteTeachers];

    // Reconstruct teacher assignments from all remote teachers
    const collectedAsgs: TeacherAssignment[] = [];
    remoteTeachers.forEach(t => {
      const asgs = Array.isArray((t as any).assignedSubjects)
        ? (t as any).assignedSubjects
        : (Array.isArray(t.assignments) ? t.assignments : []);
      if (asgs.length > 0) {
        collectedAsgs.push(...asgs);
      }
    });

    if (collectedAsgs.length > 0 || remoteTeachers.length > 0) {
      const asgMap = new Map<string, TeacherAssignment>();
      collectedAsgs.forEach(a => {
        const key = `${a.teacherId}_${a.classId}_${a.subjectId}`;
        asgMap.set(key, a);
      });
      this.db.teacherAssignments = Array.from(asgMap.values());
    }

    // Refresh currently logged in teacher user if applicable
    const currentUser = this.getCurrentUser();
    if (currentUser && currentUser.role === 'teacher') {
      const fresh = remoteTeachers.find(t => t.id === currentUser.id || t.username === currentUser.username);
      if (fresh) {
        const freshAsgs = Array.isArray((fresh as any).assignedSubjects)
          ? (fresh as any).assignedSubjects
          : (Array.isArray(fresh.assignments) ? fresh.assignments : []);
        const updatedCurrentUser = {
          ...currentUser,
          ...fresh,
          assignments: freshAsgs,
          assignedSubjects: freshAsgs,
        };
        this.setCurrentUser(updatedCurrentUser);
      }
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.db));
    } catch {}
  }

  // Client authentication
  public login(username: string, pass: string): { success: boolean; user?: User; token?: string; error?: string } {
    const trimmedUsername = username.trim().toLowerCase();
    const trimmedPass = pass.trim();

    const cleanDigits = trimmedUsername.replace(/\D/g, '');
    // Match by username or phone number
    let user = this.db.users.find(u =>
      u.username.toLowerCase() === trimmedUsername ||
      (cleanDigits.length >= 6 && u.username.replace(/\D/g, '') === cleanDigits) ||
      (cleanDigits.length >= 6 && u.phone && u.phone.replace(/\D/g, '') === cleanDigits)
    );

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

    // Password check: Match plainPassword, default admin123, or Admn@<AdmissionNo>
    let isPasswordMatch =
      user.plainPassword === trimmedPass ||
      (user.username.toLowerCase() === 'principal' && trimmedPass === 'admin123') ||
      (user as any).passwordHash === clientHashPassword(trimmedPass);

    if (!isPasswordMatch && user.role === 'parent') {
      const userKids = this.db.students.filter(s =>
        s.parentUserId === user?.id ||
        (cleanDigits.length >= 6 && s.parentPhone && s.parentPhone.replace(/\D/g, '') === cleanDigits) ||
        (s.parentNameEn && s.parentNameEn.toLowerCase() === user?.name.toLowerCase())
      );
      for (const k of userKids) {
        if (
          `admn@${k.admissionNo.toLowerCase()}` === trimmedPass.toLowerCase() ||
          k.admissionNo.toLowerCase() === trimmedPass.toLowerCase()
        ) {
          isPasswordMatch = true;
          user.plainPassword = `Admn@${k.admissionNo}`;
          this.saveDB();
          break;
        }
      }
    }

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
    const cls = this.db.classes.find(c => c.id === classId || String(c.numericGrade) === classId || c.name === classId);
    if (!cls) return new Map();

    const targetClassId = cls.id;
    const studentsInClass = this.db.students.filter(
      s => (s.classId === targetClassId || s.classId === classId || String(s.classId) === String(cls.numericGrade)) && s.status === 'active'
    );
    const applicableSubjects = this.db.subjects.filter(s => s.applicableClasses.includes(cls.numericGrade));
    const markSheets = this.db.markSheets.filter(
      ms => (ms.classId === targetClassId || ms.classId === classId || String(ms.classId) === String(cls.numericGrade)) && ms.examinationId === examId
    );
    const markSheetBySub = new Map<string, MarkSheet>();
    markSheets.forEach(ms => markSheetBySub.set(ms.subjectId, ms));

    interface ScoredStudent {
      studentId: string;
      admissionNo?: string;
      total: number;
      max: number;
      nonCeMax: number;
      nonCeObtained: number;
      isIncomplete: boolean;
      hasAbsent: boolean;
      hasMissingCe: boolean;
      failedWritten: boolean;
    }

    const studentScores: ScoredStudent[] = [];

    studentsInClass.forEach(student => {
      let totalObtained = 0;
      let totalMax = 0;
      let nonCeMax = 0;
      let nonCeObtained = 0;
      let isIncomplete = false;
      let hasAbsent = false;
      let hasMissingCe = false;
      let failedWritten = false;

      applicableSubjects.forEach(subject => {
        const ms = markSheetBySub.get(subject.id);
        const components = this.getComponentsForClass(subject, cls.numericGrade);
        const subMax = components.reduce((sum, c) => sum + c.maxMarks, 0);
        totalMax += subMax;

        let subNonCeMax = 0;
        let subNonCeObtained = 0;
        components.forEach(c => {
          if (c.componentKey !== 'ce' && c.componentKey !== 'diary') {
            subNonCeMax += c.maxMarks;
            nonCeMax += c.maxMarks;
          }
        });

        const entry = ms?.studentMarks?.[student.id] || (student.admissionNo ? ms?.studentMarks?.[student.admissionNo] : undefined);
        if (!ms || !entry) {
          isIncomplete = true;
        } else {
          if (entry.isAbsent) {
            hasAbsent = true;
            isIncomplete = true;
          } else {
            let compSum = 0;
            components.forEach(c => {
              const v = entry.componentMarks?.[c.componentKey];
              if (v !== undefined && v !== null && (v as any) !== '') {
                compSum += Number(v) || 0;
              }
            });
            const subTotal = (typeof entry.subjectTotal === 'number' && !isNaN(entry.subjectTotal) && entry.subjectTotal > 0)
              ? entry.subjectTotal
              : compSum;
            totalObtained += subTotal;

            // Calculate TE / non-CE marks
            components.forEach(c => {
              if (c.componentKey !== 'ce' && c.componentKey !== 'diary') {
                const mark = Number(entry.componentMarks?.[c.componentKey]) || 0;
                subNonCeObtained += mark;
                nonCeObtained += mark;
              }
            });

            // Check if student scored below 35% in Written / TE for this subject
            if (subNonCeMax > 0 && subNonCeObtained < subNonCeMax * 0.35) {
              failedWritten = true;
            }

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

      // Overall non-CE threshold
      if (nonCeMax > 0 && nonCeObtained < nonCeMax * 0.35) {
        failedWritten = true;
      }

      studentScores.push({
        studentId: student.id,
        total: totalObtained,
        max: totalMax,
        nonCeMax,
        nonCeObtained,
        isIncomplete: isIncomplete || hasAbsent || hasMissingCe,
        hasAbsent,
        hasMissingCe,
        failedWritten,
      });
    });

    // Ranking population:
    // - Absent students: excluded from ranking calculation entirely
    // - Missing CE/assignments: 'Withheld'
    // - Scored below 35% in TE: 'Need Improvement'
    // - Valid qualified students: Dense ranking (1, 1, 2, 3...)
    const qualifiedStudents = studentScores.filter(s => !s.hasAbsent && !s.hasMissingCe && !s.failedWritten && !s.isIncomplete);
    qualifiedStudents.sort((a, b) => b.total - a.total);

    const rankMap = new Map<string, { rank: number | null; denseRankText: string; total: number; max: number; pct: number | null; isIncomplete: boolean }>();

    let currentDenseRank = 1;
    for (let i = 0; i < qualifiedStudents.length; i++) {
      if (i > 0 && qualifiedStudents[i].total < qualifiedStudents[i - 1].total) {
        currentDenseRank++;
      }
      const s = qualifiedStudents[i];
      const pct = s.max > 0 ? Number(((s.total / s.max) * 100).toFixed(2)) : 0;
      rankMap.set(s.studentId, {
        rank: currentDenseRank,
        denseRankText: `Rank ${currentDenseRank}`,
        total: s.total,
        max: s.max,
        pct,
        isIncomplete: false,
      });
    }

    // Set non-qualified students
    studentScores.forEach(s => {
      if (rankMap.has(s.studentId)) return;

      const pct = s.max > 0 && !s.hasAbsent ? Number(((s.total / s.max) * 100).toFixed(2)) : null;
      let text = 'Need Improvement';
      if (s.hasAbsent) {
        text = 'Absent';
      } else if (s.hasMissingCe) {
        text = 'Withheld';
      } else if (s.failedWritten) {
        text = 'Need Improvement';
      } else if (s.isIncomplete) {
        text = 'Incomplete';
      }

      rankMap.set(s.studentId, {
        rank: null,
        denseRankText: text,
        total: s.total,
        max: s.max,
        pct,
        isIncomplete: true,
      });
    });

    return rankMap;
  }

  public generateStudentProgressReport(studentId: string, examId: string): StudentProgressReport | null {
    const student = this.db.students.find(
      s => s.id === studentId || s.admissionNo === studentId || String(s.admissionNo) === String(studentId)
    );
    if (!student) return null;

    const exam = this.db.examinations.find(e => e.id === examId);
    if (!exam) return null;

    const cls = this.db.classes.find(
      c =>
        c.id === student.classId ||
        String(c.numericGrade) === String(student.classId) ||
        String(c.numericGrade) === String(student.classId).replace(/\D/g, '') ||
        c.name.toLowerCase().trim() === String(student.classId).toLowerCase().trim() ||
        c.name.toLowerCase().includes(String(student.classId).toLowerCase().trim())
    );
    if (!cls) return null;

    const ay = this.db.academicYears.find(a => a.id === exam.academicYearId);
    const ayName = ay ? ay.year : '2026–2027';

    const rankMap = this.calculateClassRanks(cls.id, examId);
    const rankInfo = rankMap.get(student.id) || (student.admissionNo ? rankMap.get(student.admissionNo) : undefined) || { rank: null, total: 0, max: 0, pct: null, isIncomplete: true };
    const totalStudentsInClass = this.db.students.filter(
      s => (s.classId === cls.id || s.classId === student.classId || String(s.classId) === String(cls.numericGrade) || s.classId?.replace(/\D/g, '') === String(cls.numericGrade)) && s.status === 'active'
    ).length || 1;

    const applicableSubjects = this.db.subjects.filter(s => s.applicableClasses.includes(cls.numericGrade));
    const markSheets = this.db.markSheets.filter(
      ms => (ms.classId === cls.id || ms.classId === student.classId || String(ms.classId) === String(cls.numericGrade) || ms.classId?.replace(/\D/g, '') === String(cls.numericGrade)) && ms.examinationId === examId
    );
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

    let totalAttendedMaxMarks = 0;
    let totalAttendedObtainedMarks = 0;

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
      const entry = ms?.studentMarks?.[student.id] || (student.admissionNo ? ms?.studentMarks?.[student.admissionNo] : undefined);

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

      let compSum = 0;
      configuredComponents.forEach(c => {
        const v = entry.componentMarks?.[c.componentKey];
        if (v !== undefined && v !== null && (v as any) !== '') {
          compSum += Number(v) || 0;
        }
      });
      const resolvedSubjectTotal = (typeof entry.subjectTotal === 'number' && !isNaN(entry.subjectTotal) && entry.subjectTotal > 0)
        ? entry.subjectTotal
        : compSum;

      totalObtainedMarks += resolvedSubjectTotal;
      totalAttendedObtainedMarks += resolvedSubjectTotal;
      totalAttendedMaxMarks += maxSubMarks;

      let subNonCeMax = 0;
      let subNonCeObtained = 0;
      configuredComponents.forEach(c => {
        if (c.componentKey !== 'ce' && c.componentKey !== 'diary') {
          subNonCeMax += c.maxMarks;
          const mark = Number(entry.componentMarks?.[c.componentKey]) || 0;
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
        obtainedMarks: resolvedSubjectTotal,
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
      totalAttendedMaxMarks > 0
        ? Number(((totalAttendedObtainedMarks / totalAttendedMaxMarks) * 100).toFixed(2))
        : 0;

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

    const attConfig = this.db.attendanceConfigs?.find(a => a.classId === student.classId);
    const daysAttended = attConfig?.studentDaysAttended?.[student.id] ?? student.attendance?.daysAttended ?? 88;
    const totalWorkingDays = attConfig?.totalWorkingDays ?? student.attendance?.totalWorkingDays ?? 88;
    const examRegisterNo =
      student.examRegisterNumbers?.[examId] ||
      (student as any).examRegisterNos?.[examId] ||
      (student as any).examRegNo ||
      String(student.rollNo);
    const classInCharge = this.db.users.find(u => u.role === 'teacher' && (u as any).inChargeClassId === student.classId);
    const classTeacherName = classInCharge ? ((classInCharge as any).nameEn || classInCharge.name) : undefined;

    return {
      student,
      examination: exam,
      academicYear: ayName,
      classNameEn: cls.name,
      classNameMl: cls.nameMl,
      subjects: reportSubjects,
      totalMaxMarks: totalAttendedMaxMarks > 0 ? totalAttendedMaxMarks : totalMaxMarks,
      totalObtainedMarks: totalAttendedObtainedMarks,
      attendedObtainedMarks: totalAttendedObtainedMarks,
      attendedMaxMarks: totalAttendedMaxMarks > 0 ? totalAttendedMaxMarks : totalMaxMarks,
      examRegisterNo,
      nonCeDiaryMax,
      nonCeDiaryObtained,
      percentage,
      classRank: hasWithheldCe || hasIncompleteSubjects || hasAbsentSubjects || !passedNonCeCriteria ? null : rankInfo.rank,
      denseRankText: (rankInfo as any)?.denseRankText || (resultStatus === 'Passed' && rankInfo.rank ? `Rank ${rankInfo.rank}` : resultStatus),
      attendance: {
        daysAttended,
        totalWorkingDays,
      },
      totalStudentsInClass,
      hasIncompleteSubjects,
      hasAbsentSubjects,
      hasWithheldCe,
      resultStatus,
      resultStatusMl,
      isPublished: exam.isPublished,
      classTeacherName,
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
        const freshUser = this.db.users.find(u => u.id === current.id || u.username === current.username) || current;
        const userAssigned = Array.isArray((freshUser as any).assignedSubjects)
          ? (freshUser as any).assignedSubjects
          : (Array.isArray(freshUser.assignments) ? freshUser.assignments : []);
        const dbAssigned = this.db.teacherAssignments.filter(a => a.teacherId === freshUser.id);
        const assignments = dbAssigned.length > 0 ? dbAssigned : userAssigned;
        if (freshUser.role === 'teacher') {
          freshUser.assignments = assignments;
          (freshUser as any).assignedSubjects = assignments;
        }
        let children: Student[] = [];
        if (freshUser.role === 'parent') {
          const cleanPhone = (freshUser.phone || '').replace(/\D/g, '');
          children = this.db.students.filter(s =>
            s.parentUserId === freshUser.id ||
            (cleanPhone && s.parentPhone && s.parentPhone.replace(/\D/g, '') === cleanPhone) ||
            (s.parentNameEn && s.parentNameEn.toLowerCase() === freshUser.name.toLowerCase()) ||
            (s.parentNameEn && s.parentNameEn.toLowerCase() === freshUser.username.toLowerCase())
          );
          children = sortStudentsBoysFirst(children);
        }
        return this.jsonResponse({ user: freshUser, assignments, children });
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

      if (path === '/api/classes' && method === 'POST') {
        const { id, name, nameMl, numericGrade } = bodyData;
        const newClass: ClassItem = {
          id: id || `cls_${numericGrade || Date.now()}`,
          name: name?.trim() || `Class ${numericGrade}`,
          nameMl: nameMl?.trim() || `ക്ലാസ് ${numericGrade}`,
          numericGrade: Number(numericGrade) || 1,
          active: true,
        };
        const existingIdx = this.db.classes.findIndex(c => c.id === newClass.id || c.numericGrade === newClass.numericGrade);
        if (existingIdx >= 0) {
          this.db.classes[existingIdx] = newClass;
        } else {
          this.db.classes.push(newClass);
        }
        this.db.classes.sort((a, b) => a.numericGrade - b.numericGrade);
        this.saveDB();
        firestoreSync.syncClass(newClass).catch(e => console.warn('Firestore syncClass error:', e));
        return this.jsonResponse(newClass);
      }

      const classIdMatch = path.match(/^\/api\/classes\/([^/]+)$/);
      if (classIdMatch && method === 'DELETE') {
        const cId = classIdMatch[1];
        this.db.classes = this.db.classes.filter(c => c.id !== cId);
        this.saveDB();
        firestoreSync.deleteClass(cId).catch(e => console.warn('Firestore deleteClass error:', e));
        return this.jsonResponse({ success: true });
      }

      if (path === '/api/subjects' && method === 'GET') {
        return this.jsonResponse(this.db.subjects);
      }

      if (path === '/api/subjects' && method === 'POST') {
        const { id, code, nameMl, nameEn, applicableClasses, defaultComponents } = bodyData;
        const subId = id || `sub_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const newSubject: SubjectItem = {
          id: subId,
          code: (code || nameEn || 'SUB').toUpperCase().trim(),
          nameEn: (nameEn || nameMl).trim(),
          nameMl: nameMl.trim(),
          displayNameMl: nameMl.trim(),
          applicableClasses: Array.isArray(applicableClasses) && applicableClasses.length > 0 ? applicableClasses : [1, 2, 3, 4, 5],
          defaultComponents: Array.isArray(defaultComponents) && defaultComponents.length > 0 ? defaultComponents : [
            { componentKey: 'written', labelEn: 'Written', labelMl: 'എഴുത്ത് പരീക്ഷ', maxMarks: 35 },
            { componentKey: 'oral', labelEn: 'Oral', labelMl: 'വാചിക പരീക്ഷ', maxMarks: 10 },
            { componentKey: 'ce', labelEn: 'CE', labelMl: 'തുടർമൂല്യനിർണ്ണയം', maxMarks: 5 },
          ],
        };
        this.db.subjects.push(newSubject);
        this.saveDB();
        firestoreSync.syncSubject(newSubject).catch(e => console.warn('Firestore syncSubject error:', e));
        return this.jsonResponse(newSubject);
      }

      const subIdMatch = path.match(/^\/api\/subjects\/([^/]+)$/);
      if (subIdMatch && method === 'DELETE') {
        const sId = subIdMatch[1];
        this.db.subjects = this.db.subjects.filter(s => s.id !== sId);
        this.saveDB();
        firestoreSync.deleteSubject(sId).catch(e => console.warn('Firestore deleteSubject error:', e));
        return this.jsonResponse({ success: true });
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
        const { id, username, name, nameMl, plainPassword, password, email, phone, inChargeClassId, assignments } = bodyData;
        if (!username || !name) {
          return this.jsonResponse({ error: 'Username and Name are required' }, 400);
        }
        if (this.db.users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
          return this.jsonResponse({ error: 'Username already taken' }, 400);
        }

        const teacherId = id || `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const newTeacher: User = {
          id: teacherId,
          username: username.trim(),
          name: name.trim(),
          nameMl: nameMl?.trim() || name.trim(),
          role: 'teacher',
          plainPassword: (plainPassword || password || 'teacher123').trim(),
          active: true,
          email: email?.trim(),
          phone: phone?.trim(),
          inChargeClassId: inChargeClassId || undefined,
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
        // Immediately sync to Firestore collection 'teachers'
        firestoreSync.syncTeacher(newTeacher).catch(e => {
          console.warn('Firestore syncTeacher error:', e);
        });
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
        if (bodyData.inChargeClassId !== undefined) teacher.inChargeClassId = bodyData.inChargeClassId || undefined;

        this.saveDB();
        firestoreSync.syncTeacher(teacher).catch(e => {
          console.warn('Firestore syncTeacher error on PUT:', e);
        });
        return this.jsonResponse(teacher);
      }

      if (teacherIdMatch && method === 'DELETE') {
        const tId = teacherIdMatch[1];
        this.db.users = this.db.users.filter(u => u.id !== tId);
        this.db.teacherAssignments = this.db.teacherAssignments.filter(a => a.teacherId !== tId);
        this.saveDB();
        firestoreSync.deleteTeacher(tId).catch(e => {
          console.warn('Firestore deleteTeacher error on DELETE:', e);
        });
        return this.jsonResponse({ success: true });
      }

      // Password Reset for any user (teacher/parent)
      const userPasswordMatch = path.match(/^\/api\/users\/([^/]+)\/password$/);
      if (userPasswordMatch && method === 'PUT') {
        const uId = userPasswordMatch[1];
        const user = this.db.users.find(u => u.id === uId);
        if (!user) return this.jsonResponse({ error: 'User not found' }, 404);
        const submittedPassword = bodyData.password ?? bodyData.newPassword ?? '';
        const trimmed = String(submittedPassword).trim();
        if (!trimmed) {
          return this.jsonResponse({ error: 'Password cannot be empty' }, 400);
        }
        user.plainPassword = trimmed;
        user.passwordHash = clientHashPassword(trimmed);
        this.saveDB();
        if (user.role === 'teacher') {
          firestoreSync.syncTeacher(user).catch(e => console.warn('Firestore sync user password error:', e));
        } else if (user.role === 'parent') {
          firestoreSync.syncParent(user).catch(e => console.warn('Firestore sync parent password error:', e));
        }
        return this.jsonResponse({ success: true, message: 'Password updated successfully' });
      }

      // Teacher assignments
      if (path === '/api/teacher-assignments' && method === 'GET') {
        if (this.db.teacherAssignments.length === 0) {
          const collected: TeacherAssignment[] = [];
          this.db.users.filter(u => u.role === 'teacher').forEach(t => {
            const asgs = Array.isArray((t as any).assignedSubjects)
              ? (t as any).assignedSubjects
              : (Array.isArray(t.assignments) ? t.assignments : []);
            collected.push(...asgs);
          });
          if (collected.length > 0) {
            this.db.teacherAssignments = collected;
          }
        }
        return this.jsonResponse(this.db.teacherAssignments);
      }

      if (path === '/api/teacher-assignments' && method === 'POST') {
        const { teacherId, classId, subjectId, id, force, reassign } = bodyData;
        
        // Check if allocated to a different teacher
        const conflictingAsg = this.db.teacherAssignments.find(
          a => a.classId === classId && a.subjectId === subjectId && a.teacherId !== teacherId
        );
        if (conflictingAsg && !force && !reassign) {
          const conflictingTeacher = this.db.users.find(u => u.id === conflictingAsg.teacherId);
          const targetCls = this.db.classes.find(c => c.id === classId);
          const targetSub = this.db.subjects.find(s => s.id === subjectId);
          return this.jsonResponse({
            error: `This subject slot (${targetSub?.nameMl || targetSub?.nameEn || 'Subject'} in ${targetCls?.name || 'Class'}) is already allocated to teacher "${conflictingTeacher?.name || 'another teacher'}". Please confirm re-assignment or remove that assignment first.`,
            hasConflict: true,
            prevTeacherName: conflictingTeacher?.name,
          }, 400);
        }

        // Clean out any prior assignment for this class-subject slot
        this.db.teacherAssignments = this.db.teacherAssignments.filter(
          a => !(a.classId === classId && a.subjectId === subjectId)
        );

        const newAssignment: TeacherAssignment = {
          id: id || `asg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          teacherId,
          classId,
          subjectId,
        };
        this.db.teacherAssignments.push(newAssignment);
        const teacher = this.db.users.find(u => u.id === teacherId);
        if (teacher) {
          const teacherAsgs = this.db.teacherAssignments.filter(a => a.teacherId === teacherId);
          teacher.assignments = teacherAsgs;
          (teacher as any).assignedSubjects = teacherAsgs;
          firestoreSync.syncTeacher(teacher).catch(e => console.error('Firestore syncTeacher error on assignment:', e));
        }
        this.saveDB();
        return this.jsonResponse(newAssignment);
      }

      const asgIdMatch = path.match(/^\/api\/teacher-assignments\/([^/]+)$/);
      if (asgIdMatch && method === 'DELETE') {
        const asgId = asgIdMatch[1];
        const existingAsg = this.db.teacherAssignments.find(a => a.id === asgId);
        const affectedTeacherId = existingAsg?.teacherId;
        this.db.teacherAssignments = this.db.teacherAssignments.filter(a => a.id !== asgId);
        if (affectedTeacherId) {
          const teacher = this.db.users.find(u => u.id === affectedTeacherId);
          if (teacher) {
            const teacherAsgs = this.db.teacherAssignments.filter(a => a.teacherId === affectedTeacherId);
            teacher.assignments = teacherAsgs;
            (teacher as any).assignedSubjects = teacherAsgs;
            firestoreSync.syncTeacher(teacher).catch(e => console.error('Firestore syncTeacher error on remove assignment:', e));
          }
        }
        this.saveDB();
        return this.jsonResponse({ success: true });
      }

      // 4. Students
      if (path === '/api/students' && method === 'GET') {
        const classId = params.get('classId');
        if (classId) {
          this.resequenceClassRollNumbers(classId);
        } else {
          this.resequenceClassRollNumbers();
        }
        let students = this.db.students;
        if (classId) {
          students = students.filter(s => s.classId === classId);
        }
        return this.jsonResponse(sortStudentsBoysFirst(students));
      }

      if (path === '/api/students/resequence-rolls' && method === 'POST') {
        const targetClassId = bodyData?.classId || params.get('classId');
        this.resequenceClassRollNumbers(targetClassId || undefined);
        this.saveDB();
        const affected = targetClassId
          ? this.db.students.filter(s => s.classId === targetClassId)
          : this.db.students;
        for (const st of affected) {
          firestoreSync.syncStudent(st).catch(() => {});
        }
        return this.jsonResponse({ success: true, count: affected.length, students: sortStudentsBoysFirst(affected) });
      }

      if (path === '/api/students' && method === 'POST') {
        const studentId = bodyData.id || `stu_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const newStudent: Student = {
          id: studentId,
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
        let createdParent: User | null = null;
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
            createdParent = parentUser;
          }
          newStudent.parentUserId = parentUser.id;
        }

        this.db.students.push(newStudent);
        this.resequenceClassRollNumbers(newStudent.classId);
        this.saveDB();

        // Sync affected class students with their updated sequential roll numbers
        const classStudents = this.db.students.filter(s => s.classId === newStudent.classId);
        for (const st of classStudents) {
          firestoreSync.syncStudent(st).catch(e => {
            console.warn('Firestore syncStudent error:', e);
          });
        }
        if (createdParent) {
          firestoreSync.syncParent(createdParent).catch(e => {
            console.warn('Firestore syncParent error:', e);
          });
        }

        const savedStudent = this.db.students.find(s => s.id === studentId) || newStudent;
        return this.jsonResponse(savedStudent);
      }

      const studentIdMatch = path.match(/^\/api\/students\/([^/]+)$/);
      if (studentIdMatch && method === 'PUT') {
        const sId = studentIdMatch[1];
        const student = this.db.students.find(s => s.id === sId);
        if (!student) return this.jsonResponse({ error: 'Student not found' }, 404);

        const prevClassId = student.classId;
        Object.assign(student, bodyData);
        this.resequenceClassRollNumbers(student.classId);
        if (prevClassId && prevClassId !== student.classId) {
          this.resequenceClassRollNumbers(prevClassId);
        }
        this.saveDB();

        const affected = this.db.students.filter(s => s.classId === student.classId || s.classId === prevClassId);
        for (const st of affected) {
          firestoreSync.syncStudent(st).catch(e => {
            console.warn('Firestore syncStudent PUT error:', e);
          });
        }

        return this.jsonResponse(student);
      }

      if (studentIdMatch && method === 'DELETE') {
        const sId = studentIdMatch[1];
        const targetStudent = this.db.students.find(s => s.id === sId);
        const targetClassId = targetStudent?.classId;
        this.db.students = this.db.students.filter(s => s.id !== sId);
        if (targetClassId) {
          this.resequenceClassRollNumbers(targetClassId);
          const affected = this.db.students.filter(s => s.classId === targetClassId);
          for (const st of affected) {
            firestoreSync.syncStudent(st).catch(() => {});
          }
        }
        this.saveDB();

        firestoreSync.deleteStudent(sId).catch(e => {
          console.warn('Firestore deleteStudent error:', e);
        });

        return this.jsonResponse({ success: true });
      }

      // Bulk & Filtered Student Deletion
      if (path === '/api/students' && method === 'DELETE') {
        const targetClassId = params.get('classId');
        if (targetClassId) {
          const toDelete = this.db.students.filter(s => s.classId === targetClassId);
          this.db.students = this.db.students.filter(s => s.classId !== targetClassId);
          this.saveDB();
          for (const s of toDelete) {
            firestoreSync.deleteStudent(s.id).catch(() => {});
          }
          return this.jsonResponse({ success: true, deletedCount: toDelete.length });
        } else {
          const count = this.db.students.length;
          const ids = this.db.students.map(s => s.id);
          this.db.students = [];
          this.saveDB();
          for (const id of ids) {
            firestoreSync.deleteStudent(id).catch(() => {});
          }
          return this.jsonResponse({ success: true, deletedCount: count });
        }
      }

      // Contextual Clear Demo Endpoints
      if (path === '/api/students/clear-demo' && method === 'POST') {
        const count = this.db.students.length;
        this.db.students = [];
        this.db.markSheets = [];
        this.saveDB();
        await firestoreSync.purgeDemoStudentsFromFirestore();
        return this.jsonResponse({ success: true, clearedCount: count });
      }

      if (path === '/api/teachers/clear-demo' && method === 'POST') {
        const count = this.db.users.filter(u => u.role === 'teacher').length;
        this.db.users = this.db.users.filter(u => u.role !== 'teacher');
        this.db.teacherAssignments = [];
        this.saveDB();
        await firestoreSync.purgeDemoTeachersFromFirestore();
        return this.jsonResponse({ success: true, clearedCount: count });
      }

      if (path === '/api/parents/clear-demo' && method === 'POST') {
        const count = this.db.users.filter(u => u.role === 'parent').length;
        this.db.users = this.db.users.filter(u => u.role !== 'parent');
        this.db.students.forEach(s => s.parentUserId = undefined);
        this.saveDB();
        await firestoreSync.purgeDemoParentsFromFirestore();
        return this.jsonResponse({ success: true, clearedCount: count });
      }

      // Student Import Preview (Supports Multi-Class Global CSV)
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

              const admissionNo = rowObj['admission no'] || rowObj['admission_no'] || rowObj['admissionno'] || rowObj['adm_no'] || rowObj['admission'] || rawCols[0];
              const nameEn = rowObj['name'] || rowObj['student name'] || rowObj['student_name'] || rowObj['name_en'] || rowObj['student'] || rawCols[1];
              const nameMl = rowObj['name_ml'] || rowObj['malayalam_name'] || nameEn;
              const rollNo = parseInt(rowObj['roll_no'] || rowObj['rollno'] || rowObj['roll']) || i;

              // Parse Class automatically across multiple classes
              const rawClassStr = rowObj['class'] || rowObj['classname'] || rowObj['grade'] || rawCols[2] || '';
              let resolvedClass = this.db.classes.find(
                c => c.name.toLowerCase() === rawClassStr.toLowerCase() || c.nameMl === rawClassStr
              );
              if (!resolvedClass && rawClassStr) {
                const digit = rawClassStr.replace(/\D/g, '');
                if (digit) resolvedClass = this.db.classes.find(c => c.numericGrade === parseInt(digit, 10));
              }
              if (!resolvedClass && targetClassId) {
                resolvedClass = this.db.classes.find(c => c.id === targetClassId);
              }
              const finalClass = resolvedClass || this.db.classes[0] || { id: 'cls_1', name: 'Class 1' };

              // Gender
              const rawGender = rowObj['gender'] || rowObj['sex'] || rawCols[3] || 'M';
              const gender = String(rawGender).trim().toUpperCase().startsWith('F') ? 'F' : 'M';

              // Parent name & phone
              const parentName = rowObj['parent name'] || rowObj['parent_name'] || rowObj['guardian_name'] || rowObj['parent'] || rawCols[4] || '';
              const parentPhone = rowObj['phone'] || rowObj['mobile'] || rowObj['parent phone'] || rowObj['contact'] || rawCols[5] || '';

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
                classId: finalClass.id,
                className: finalClass.name,
                gender,
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
            if (!targetClass) {
              targetClass = this.db.classes[0] || { id: 'cls_1', name: 'Class 1' };
            }

            if (!adm || !nameEn) {
              invalidRows.push({ row, reason: `Row #${idx + 1}: Missing Admission No or Name` });
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
        const { students, records, targetClassId, replaceExisting } = bodyData;
        const itemsToProcess = Array.isArray(records) ? records : Array.isArray(students) ? students : [];
        let importedCount = 0;
        let parentAccountCount = 0;

        // Clean slate option: replace / clear existing class records before importing
        if (replaceExisting) {
          if (targetClassId) {
            this.db.students = this.db.students.filter(s => s.classId !== targetClassId);
          } else {
            const classesInImport = new Set(itemsToProcess.map((item: any) => item.classId).filter(Boolean));
            if (classesInImport.size > 0) {
              this.db.students = this.db.students.filter(s => !classesInImport.has(s.classId));
            } else {
              this.db.students = [];
            }
          }
        }

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

          let existing = this.db.students.find(s => s.admissionNo === admNo || s.id === admNo);
          if (existing) {
            existing.id = admNo;
            existing.admissionNo = admNo;
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
            this.db.students.push({
              id: admNo,
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

        this.resequenceClassRollNumbers();
        this.saveDB();
        // Sync imported students to Firestore (strictly using admission number as document key)
        this.db.students.forEach((st) => {
          firestoreSync.syncStudent(st).catch(e => console.warn('Firestore syncStudent on import error:', e));
        });
        this.db.users.filter(u => u.role === 'parent').forEach(p => {
          firestoreSync.syncParent(p).catch(e => console.warn('Firestore syncParent on import error:', e));
        });
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
        const { id, username, name, nameMl, phone, studentIds, password } = bodyData;
        if (!name) return this.jsonResponse({ error: 'Parent Name is required' }, 400);

        const parentId = id || `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const newParent: User = {
          id: parentId,
          username: username?.trim() || name.trim(),
          name: name.trim(),
          nameMl: nameMl?.trim(),
          role: 'parent',
          plainPassword: (password || 'password123').trim(),
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
          if (elder && !password) {
            newParent.plainPassword = elder.admissionNo;
          }
        }

        this.db.users.push(newParent);
        this.saveDB();

        firestoreSync.syncParent(newParent).catch(e => {
          console.warn('Firestore syncParent error:', e);
        });

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

        firestoreSync.syncParent(parent).catch(e => {
          console.warn('Firestore syncParent PUT error:', e);
        });

        return this.jsonResponse(parent);
      }

      if (parentIdMatch && method === 'DELETE') {
        const pId = parentIdMatch[1];
        this.db.users = this.db.users.filter(u => u.id !== pId);
        this.db.students.forEach(s => {
          if (s.parentUserId === pId) s.parentUserId = undefined;
        });
        this.saveDB();

        firestoreSync.deleteParent(pId).catch(e => {
          console.warn('Firestore deleteParent error:', e);
        });

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
          parent.plainPassword = `Admn@${elder.admissionNo}`;
        }

        this.saveDB();
        return this.jsonResponse({
          success: true,
          parent,
          elderChildAdmissionNo: elder?.admissionNo,
          parentPassword: parent.plainPassword,
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
          parent.plainPassword = `Admn@${elder.admissionNo}`;
        }

        this.saveDB();
        return this.jsonResponse({ success: true });
      }

      // Automated Parent Credentials & Multi-Student Sync
      if (path === '/api/parents/sync-from-students' && method === 'POST') {
        const { classId } = bodyData || {};
        let targetStudents = this.db.students;
        if (classId) {
          targetStudents = targetStudents.filter(s => s.classId === classId);
        }

        const groups = new Map<string, Student[]>();
        targetStudents.forEach(st => {
          const rawPhone = String(st.parentPhone || '').trim();
          const cleanPhone = rawPhone.replace(/\D/g, '');
          const key = cleanPhone || rawPhone || String(st.parentNameEn || '').trim() || st.admissionNo;
          if (!groups.has(key)) {
            groups.set(key, []);
          }
          groups.get(key)!.push(st);
        });

        let syncedCount = 0;
        groups.forEach((groupedKids, phoneKey) => {
          if (groupedKids.length === 0) return;
          const elder = getElderChild(groupedKids, this.db.classes) || groupedKids[0];
          const primaryKid = groupedKids[0];
          const rawPhone = String(primaryKid.parentPhone || '').trim();
          const cleanPhone = rawPhone.replace(/\D/g, '') || phoneKey;
          const username = cleanPhone;
          const password = `Admn@${elder.admissionNo}`;
          const parentName = primaryKid.parentNameEn || username;
          const parentNameMl = primaryKid.parentNameMl || parentName;

          let parent = this.db.users.find(
            u => u.role === 'parent' && (u.username === username || (u.phone && u.phone.replace(/\D/g, '') === cleanPhone))
          );

          if (parent) {
            parent.username = username;
            parent.name = parentName;
            parent.nameMl = parentNameMl;
            parent.phone = cleanPhone;
            parent.plainPassword = password;
          } else {
            parent = {
              id: `usr_p_${cleanPhone || Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              username,
              name: parentName,
              nameMl: parentNameMl,
              role: 'parent',
              plainPassword: password,
              active: true,
              phone: cleanPhone,
              createdAt: new Date().toISOString(),
            };
            this.db.users.push(parent);
          }

          groupedKids.forEach(k => {
            k.parentUserId = parent!.id;
            k.parentPhone = cleanPhone;
            firestoreSync.syncStudent(k).catch(e => console.error('Firestore syncStudent error in sync-from-students:', e));
          });

          firestoreSync.syncParent(parent).catch(e => console.error('Firestore syncParent error in sync-from-students:', e));
          syncedCount++;
        });

        this.saveDB();
        return this.jsonResponse({
          success: true,
          syncedAccounts: syncedCount,
          totalStudentsProcessed: targetStudents.length,
          passwordFormat: 'Admn@<AdmissionNo>'
        });
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
          passMarkPercentage: Number(bodyData.passMarkPercentage) || 35,
        };
        this.db.examinations.push(newExam);
        this.db.settings.activeExamId = newExam.id;
        this.saveDB();
        firestoreSync.syncExam(newExam).catch(e => console.warn('Firestore syncExam error on POST:', e));
        return this.jsonResponse(newExam);
      }

      const examActionMatch = path.match(/^\/api\/examinations\/([^/]+)$/);
      if (examActionMatch && method === 'PUT') {
        const examId = examActionMatch[1];
        const exam = this.db.examinations.find(e => e.id === examId);
        if (!exam) return this.jsonResponse({ error: 'Exam not found' }, 404);

        if (bodyData.nameEn !== undefined) exam.nameEn = bodyData.nameEn.trim();
        if (bodyData.nameMl !== undefined) exam.nameMl = bodyData.nameMl.trim();
        if (bodyData.startDate !== undefined) exam.startDate = bodyData.startDate;
        if (bodyData.endDate !== undefined) exam.endDate = bodyData.endDate;
        if (bodyData.passMarkPercentage !== undefined) exam.passMarkPercentage = Number(bodyData.passMarkPercentage);
        if (bodyData.classesParticipating !== undefined) exam.classesParticipating = bodyData.classesParticipating;

        this.saveDB();
        firestoreSync.syncExam(exam).catch(e => console.warn('Firestore syncExam error on PUT:', e));
        return this.jsonResponse(exam);
      }

      if (examActionMatch && method === 'DELETE') {
        const examId = examActionMatch[1];
        this.db.examinations = this.db.examinations.filter(e => e.id !== examId);
        this.db.markSheets = this.db.markSheets.filter(m => m.examinationId !== examId);
        if (this.db.settings.activeExamId === examId) {
          this.db.settings.activeExamId = this.db.examinations[0]?.id || '';
        }
        this.saveDB();
        firestoreSync.deleteExam(examId).catch(e => console.warn('Firestore deleteExam error:', e));
        return this.jsonResponse({ success: true });
      }

      const examReadinessMatch = path.match(/^\/api\/examinations\/([^/]+)\/readiness$/);
      if (examReadinessMatch && method === 'GET') {
        const examId = examReadinessMatch[1];
        const exam = (this.db.examinations || []).find(e => 
          e && (e.id === examId || e.id?.toString() === examId?.toString() || e.nameEn === examId)
        ) || (this.db.examinations || [])[0];
        if (!exam) return this.jsonResponse({ error: 'Exam not found' }, 404);

        const currentExamId = exam.id?.toString() || examId?.toString();
        const examSheets = (this.db.markSheets || []).filter(sheet => {
          if (!sheet) return false;
          const sExamId = sheet.examId?.toString();
          const sExaminationId = sheet.examinationId?.toString();
          return (
            (currentExamId && (sExamId === currentExamId || sExaminationId === currentExamId)) ||
            (exam.nameEn && sheet.examName === exam.nameEn) ||
            (!sExamId && !sExaminationId) ||
            (this.db.examinations || []).length <= 1 ||
            (sExaminationId && currentExamId && (sExaminationId.includes(currentExamId) || currentExamId.includes(sExaminationId)))
          );
        });

        const participating = (exam.classesParticipating && exam.classesParticipating.length > 0)
          ? exam.classesParticipating
          : (this.db.classes || []).map(c => c.id);

        let totalExpectedSheets = 0;
        const sheetDetails: any[] = [];

        (this.db.classes || [])
          .filter(c => participating.includes(c.id))
          .forEach(cls => {
            const subjects = (this.db.subjects || []).filter(s => s.applicableClasses.includes(cls.numericGrade));
            subjects.forEach(sub => {
              totalExpectedSheets++;
              const sheet = examSheets.find(
                ms => ms.classId === cls.id && ms.subjectId === sub.id
              );
              const asgn = (this.db.teacherAssignments || []).find(a => a.classId === cls.id && a.subjectId === sub.id);
              const teacher = asgn ? (this.db.users || []).find(u => u.id === asgn.teacherId) : null;
              const status = sheet?.status || 'not_started';
              sheetDetails.push({
                classId: cls.id,
                className: cls.name,
                subjectId: sub.id,
                subjectName: sub.nameMl,
                teacherName: teacher ? teacher.name : 'Unassigned',
                status,
                isReady: status === 'approved' || status === 'locked',
              });
            });
          });

        const submittedSheets = examSheets.filter(s => s.status === 'submitted').length;
        const approvedSheets = examSheets.filter(s => s.status === 'approved').length;
        const lockedSheets = examSheets.filter(s => s.status === 'locked').length;
        const missingSheets = Math.max(0, totalExpectedSheets - examSheets.length);

        const isReady = totalExpectedSheets > 0 && approvedSheets + lockedSheets === totalExpectedSheets;
        return this.jsonResponse({
          exam,
          totalRequiredSheets: totalExpectedSheets,
          totalExpectedSheets,
          totalSubmitted: submittedSheets,
          submittedSheets,
          totalApproved: approvedSheets,
          approvedSheets,
          totalLocked: lockedSheets,
          lockedSheets,
          missingSheets,
          countNotStarted: missingSheets,
          isReady,
          items: sheetDetails,
          sheetDetails,
        });
      }

      const examPublishMatch = path.match(/^\/api\/examinations\/([^/]+)\/publish$/);
      if (examPublishMatch && method === 'POST') {
        const examId = examPublishMatch[1];
        const exam = (this.db.examinations || []).find(e => 
          e && (e.id === examId || e.id?.toString() === examId?.toString() || e.nameEn === examId)
        ) || (this.db.examinations || [])[0];
        if (!exam) return this.jsonResponse({ error: 'Exam not found' }, 404);

        const isPub =
          bodyData.action === 'publish_now' ||
          bodyData.action === 'publish' ||
          bodyData.isPublished === true;
        const isRevoke =
          bodyData.action === 'revoke' ||
          bodyData.action === 'unpublish' ||
          bodyData.isPublished === false;

        const currentExamId = exam.id?.toString() || examId?.toString();

        if (isPub) {
          exam.isPublished = true;
          exam.status = 'published';
          exam.publishedAt = bodyData.publishedAt || new Date().toISOString();

          // Check and publish all sheets matching the exam that are 'approved' or 'locked'
          this.db.markSheets.forEach(sheet => {
            const sExamId = sheet.examId?.toString();
            const sExaminationId = sheet.examinationId?.toString();
            const matches =
              (currentExamId && (sExamId === currentExamId || sExaminationId === currentExamId)) ||
              (exam.nameEn && sheet.examName === exam.nameEn) ||
              (!sExamId && !sExaminationId) ||
              (this.db.examinations || []).length <= 1;
            if (matches && (sheet.status === 'approved' || sheet.status === 'locked' || sheet.status === 'submitted')) {
              sheet.status = 'locked';
              (sheet as any).isPublished = true;
              (sheet as any).publishedAt = exam.publishedAt;
            }
          });
        } else if (isRevoke) {
          exam.isPublished = false;
          exam.status = 'draft';
          exam.publishedAt = undefined;
        }

        this.saveDB();

        firestoreSync.syncExam(exam).catch(e => {
          console.warn('Firestore syncExam error on publish:', e);
        });

        // Also sync updated marksheets to firestore
        this.db.markSheets
          .filter(ms => ms.examinationId === examId)
          .forEach(ms => {
            firestoreSync.syncMarkSheet(ms).catch(e => console.warn('Firestore syncMarkSheet publish error:', e));
          });

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('madrasa_exams_updated', { detail: this.db.examinations }));
          window.dispatchEvent(new CustomEvent('madrasa_marks_updated'));
        }

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

        const students = sortStudentsBoysFirst(this.db.students.filter(s => s.classId === classId && s.status === 'active'));
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
        const { markSheetId, examinationId, classId, subjectId, studentMarks } = bodyData;
        let sheet = this.db.markSheets.find(s =>
          (markSheetId && s.id === markSheetId) ||
          (examinationId && classId && subjectId && s.examinationId === examinationId && s.classId === classId && s.subjectId === subjectId)
        );
        if (!sheet) {
          if (examinationId && classId && subjectId) {
            sheet = {
              id: markSheetId || `ms_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              examinationId,
              academicYearId: 'ay_2026_2027',
              classId,
              subjectId,
              assignedTeacherId: '',
              status: 'draft',
              studentMarks: studentMarks || {},
              lastUpdated: new Date().toISOString(),
            };
            this.db.markSheets.push(sheet);
          } else {
            return this.jsonResponse({ error: 'Mark sheet not found' }, 404);
          }
        }

        const processedMarks = { ...(studentMarks || {}) };
        Object.keys(processedMarks).forEach(k => {
          const entry = processedMarks[k];
          if (entry && !entry.isAbsent && entry.componentMarks) {
            const sum = Object.values(entry.componentMarks).reduce((s: number, v: any) => s + (Number(v) || 0), 0);
            entry.subjectTotal = sum;
          }
        });
        sheet.studentMarks = processedMarks;
        sheet.status = 'draft';
        sheet.lastUpdated = new Date().toISOString();
        this.saveDB();

        firestoreSync.syncMarkSheet(sheet).catch(e => {
          console.warn('Firestore syncMarkSheet save-draft error:', e);
        });

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

        firestoreSync.syncMarkSheet(sheet).catch(e => {
          console.warn('Firestore syncMarkSheet action error:', e);
        });

        return this.jsonResponse({ success: true, markSheet: sheet });
      }

      const classReportMatch = path.match(/^\/api\/reports\/class\/([^/]+)\/exam\/([^/]+)$/);
      if (classReportMatch && method === 'GET') {
        const [, cId, eId] = classReportMatch;
        const cls = this.db.classes.find(c => c.id === cId || String(c.numericGrade) === cId || c.name === cId);
        const targetClassId = cls?.id || cId;
        const targetGrade = cls?.numericGrade;
        const students = sortStudentsBoysFirst(
          this.db.students.filter(
            s =>
              (s.classId === targetClassId ||
                (targetGrade !== undefined && (String(s.classId) === String(targetGrade) || s.classId === `cls_${targetGrade}`)) ||
                (cls?.name && s.classId === cls.name)) &&
              s.status === 'active'
          )
        );
        const reports: StudentProgressReport[] = [];
        students.forEach(st => {
          const r = this.generateStudentProgressReport(st.id, eId);
          if (r) reports.push(r);
        });
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
        const student = this.db.students.find(s => s.id === sId || s.admissionNo === sId || String(s.admissionNo) === String(sId));
        const resolvedStudentId = student?.id || sId;
        const report = this.generateStudentProgressReport(resolvedStudentId, eId);
        if (!report) return this.jsonResponse({ error: 'Report could not be generated' }, 404);
        const exam = this.db.examinations.find(e => e.id === eId);
        const isExamPublished = Boolean(
          exam?.isPublished ||
          exam?.status === 'published' ||
          exam?.status === 'approved' ||
          exam?.status === 'completed'
        );
        return this.jsonResponse({
          report,
          settings: this.db.settings,
          isPublished: isExamPublished,
        });
      }

      const regNosMatch = path.match(/^\/api\/examinations\/([^/]+)\/classes\/([^/]+)\/register-numbers$/);
      if (regNosMatch && method === 'GET') {
        const [, eId, cId] = regNosMatch;
        this.resequenceClassRollNumbers(cId);
        const students = sortStudentsBoysFirst(this.db.students.filter(s => s.classId === cId && s.status === 'active'));
        const list = students.map((s, idx) => ({
          studentId: s.id,
          admissionNo: s.admissionNo,
          rollNo: idx + 1,
          nameEn: s.nameEn,
          nameMl: s.nameMl,
          gender: s.gender || 'M',
          examRegisterNo: s.examRegisterNumbers?.[eId] || (s as any).examRegisterNos?.[eId] || (s as any).examRegNo || '',
        }));
        return this.jsonResponse(list);
      }

      if (regNosMatch && method === 'POST') {
        const [, eId, cId] = regNosMatch;
        const { registerNumbers } = bodyData;
        if (!registerNumbers || typeof registerNumbers !== 'object') {
          return this.jsonResponse({ error: 'registerNumbers map is required' }, 400);
        }
        const updatedStudents: Student[] = [];
        Object.entries(registerNumbers).forEach(([sId, regNo]) => {
          const st = this.db.students.find(s => (s.id === sId || s.admissionNo === sId) && s.classId === cId);
          if (st) {
            const regVal = String(regNo || '').trim();
            if (!st.examRegisterNumbers) st.examRegisterNumbers = {};
            st.examRegisterNumbers[eId] = regVal;

            if (!(st as any).examRegisterNos) (st as any).examRegisterNos = {};
            (st as any).examRegisterNos[eId] = regVal;

            (st as any).examRegNo = regVal;
            updatedStudents.push(st);
          }
        });
        this.saveDB();

        // 1. Immediate Firestore Cloud Persistence across schema formats
        firestoreSync.updateExamRegisterNumbers(eId, registerNumbers, updatedStudents).catch(e => {
          console.warn('Firestore updateExamRegisterNumbers error on POST:', e);
        });

        for (const st of updatedStudents) {
          firestoreSync.syncStudent(st).catch(e => {
            console.warn('Firestore syncStudent error for reg number on POST:', e);
          });
        }

        // 2. Dispatch real-time update event for open tabs and components
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('madrasa_students_updated', { detail: this.db.students }));
        }

        return this.jsonResponse({ success: true, message: 'Register numbers saved permanently to Firestore and local storage' });
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
        const stats = this.calculateExamStats();
        const activeExam =
          (this.db.examinations || []).find(e => e && e.id === this.db.settings?.activeExamId) ||
          (this.db.examinations || []).find(e => e && e.isPublished) ||
          (this.db.examinations || [])[0] ||
          null;

        return this.jsonResponse({
          activeExam,
          totalStudents: (this.db.students || []).filter(s => s && s.status === 'active').length,
          totalTeachers: (this.db.users || []).filter(u => u && u.role === 'teacher').length,
          totalClasses: (this.db.classes || []).length,
          totalSubjects: (this.db.subjects || []).length,
          isPublished: Boolean(activeExam?.isPublished),
          stats,
          recentLogs: (this.db.auditLogs || []).slice(0, 10),
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

      if (path === '/api/admin/clear-demo-data' && method === 'POST') {
        const result = this.purgeDemoData();
        return this.jsonResponse({
          success: true,
          message: `Purged demo data (${result.clearedCount} sample student records cleared). Admin account retained.`,
        });
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

      // Sub-Admins API
      if (path === '/api/sub-admins' && method === 'GET') {
        const subAdmins = this.db.users.filter(u => u.role === 'admin' && u.isSubAdmin);
        return this.jsonResponse(subAdmins);
      }

      if (path === '/api/sub-admins' && method === 'POST') {
        const { name, nameMl, username, password, plainPassword, permissions } = bodyData;
        if (!name || !username) {
          return this.jsonResponse({ error: 'Name and Username are required' }, 400);
        }
        if (this.db.users.some(u => u.username.toLowerCase() === username.trim().toLowerCase())) {
          return this.jsonResponse({ error: 'Username already in use' }, 400);
        }
        const pwd = (password || plainPassword || 'admin123').trim();
        const newAdmin: User = {
          id: `adm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          username: username.trim(),
          name: name.trim(),
          nameMl: (nameMl || name).trim(),
          role: 'admin',
          isSubAdmin: true,
          plainPassword: pwd,
          passwordHash: clientHashPassword(pwd),
          permissions: permissions || DEFAULT_ADMIN_PERMISSIONS,
          active: true,
          createdAt: new Date().toISOString(),
        };
        this.db.users.push(newAdmin);
        this.saveDB();
        firestoreSync.syncAdmin(newAdmin).catch(e => console.warn('Firestore syncAdmin error:', e));
        return this.jsonResponse(newAdmin);
      }

      const subAdminIdMatch = path.match(/^\/api\/sub-admins\/([^/]+)$/);
      if (subAdminIdMatch && method === 'PUT') {
        const aId = subAdminIdMatch[1];
        const admin = this.db.users.find(u => u.id === aId && u.isSubAdmin);
        if (!admin) return this.jsonResponse({ error: 'Sub-admin not found' }, 404);
        if (bodyData.name) admin.name = bodyData.name.trim();
        if (bodyData.nameMl) admin.nameMl = bodyData.nameMl.trim();
        if (bodyData.username) admin.username = bodyData.username.trim();
        if (bodyData.password || bodyData.plainPassword) {
          const pwd = (bodyData.password || bodyData.plainPassword).trim();
          admin.plainPassword = pwd;
          admin.passwordHash = clientHashPassword(pwd);
        }
        if (bodyData.permissions) admin.permissions = bodyData.permissions;
        if (bodyData.active !== undefined) admin.active = Boolean(bodyData.active);
        this.saveDB();
        firestoreSync.syncAdmin(admin).catch(e => console.warn('Firestore syncAdmin PUT error:', e));
        return this.jsonResponse(admin);
      }

      if (subAdminIdMatch && method === 'DELETE') {
        const aId = subAdminIdMatch[1];
        this.db.users = this.db.users.filter(u => u.id !== aId);
        this.saveDB();
        firestoreSync.deleteAdmin(aId).catch(e => console.warn('Firestore deleteAdmin error:', e));
        return this.jsonResponse({ success: true });
      }

      // Fees Management API
      if (path === '/api/fees/payments' && method === 'GET') {
        const studentId = params.get('studentId');
        const classId = params.get('classId');
        let payments = this.db.feePayments || [];
        if (studentId) {
          payments = payments.filter(p => p.studentId === studentId);
        } else if (classId) {
          payments = payments.filter(p => p.classId === classId);
        }
        payments = [...payments].sort((a, b) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime());
        return this.jsonResponse(payments);
      }

      if (path === '/api/fees/payments' && method === 'POST') {
        let nextNum = 1001;
        const existingNums = (this.db.feePayments || [])
          .map(p => parseInt((p.receiptNo || '').replace(/\D/g, ''), 10))
          .filter(n => !isNaN(n));
        if (existingNums.length > 0) {
          nextNum = Math.max(...existingNums) + 1;
        }

        const pId = bodyData.id || `fee_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const receiptNo = bodyData.receiptNo ? String(bodyData.receiptNo).trim() : `#${nextNum}`;
        const newPayment: FeePayment = {
          id: pId,
          receiptNo,
          date: bodyData.date || new Date().toISOString().split('T')[0],
          studentId: bodyData.studentId,
          studentName: bodyData.studentName,
          admissionNo: bodyData.admissionNo,
          classId: bodyData.classId,
          className: bodyData.className,
          admissionFee: Number(bodyData.admissionFee) || 0,
          tuitionFeeMonths: Array.isArray(bodyData.tuitionFeeMonths) ? bodyData.tuitionFeeMonths : [],
          tuitionFeeAmount: Number(bodyData.tuitionFeeAmount) || (Array.isArray(bodyData.tuitionFeeMonths) ? bodyData.tuitionFeeMonths.length * 300 : 0),
          specialFeeComponents: bodyData.specialFeeComponents || {},
          specialFeeAmount: Number(bodyData.specialFeeAmount) || 0,
          donationAmount: Number(bodyData.donationAmount) || 0,
          totalAmount: Number(bodyData.totalAmount) || 0,
          amountInWords: bodyData.amountInWords || '',
          notes: bodyData.notes || '',
          collectedBy: bodyData.collectedBy || this.getCurrentUser()?.name || 'Office',
          createdAt: new Date().toISOString(),
        };

        if (!this.db.feePayments) this.db.feePayments = [];
        this.db.feePayments.push(newPayment);
        this.saveDB();
        firestoreSync.syncFeePayment(newPayment).catch(e => console.warn('Firestore syncFeePayment error:', e));
        return this.jsonResponse(newPayment);
      }

      const feePaymentIdMatch = path.match(/^\/api\/fees\/payments\/([^/]+)$/);
      if (feePaymentIdMatch && method === 'DELETE') {
        const feeId = feePaymentIdMatch[1];
        this.db.feePayments = (this.db.feePayments || []).filter(p => p.id !== feeId);
        this.saveDB();
        firestoreSync.deleteFeePayment(feeId).catch(e => console.warn('Firestore deleteFeePayment error:', e));
        return this.jsonResponse({ success: true });
      }

      // Attendance API
      const attendanceClassMatch = path.match(/^\/api\/attendance\/class\/([^/]+)$/);
      if (attendanceClassMatch && method === 'GET') {
        const cId = attendanceClassMatch[1];
        const config = (this.db.attendanceConfigs || []).find(c => c.classId === cId) || {
          classId: cId,
          totalWorkingDays: 88,
          studentDaysAttended: {},
        };
        return this.jsonResponse(config);
      }

      if (attendanceClassMatch && method === 'POST') {
        const cId = attendanceClassMatch[1];
        const { totalWorkingDays, studentDaysAttended } = bodyData;
        if (!this.db.attendanceConfigs) this.db.attendanceConfigs = [];
        const existingIdx = this.db.attendanceConfigs.findIndex(c => c.classId === cId);
        const config: ClassAttendanceConfig = {
          classId: cId,
          totalWorkingDays: Number(totalWorkingDays) || 0,
          studentDaysAttended: studentDaysAttended || {},
          updatedAt: new Date().toISOString(),
        };
        if (existingIdx >= 0) {
          this.db.attendanceConfigs[existingIdx] = config;
        } else {
          this.db.attendanceConfigs.push(config);
        }
        Object.entries(studentDaysAttended || {}).forEach(([sId, days]) => {
          const st = this.db.students.find(s => s.id === sId);
          if (st) {
            st.attendance = {
              daysAttended: Number(days) || 0,
              totalWorkingDays: Number(totalWorkingDays) || 0,
            };
          }
        });
        this.saveDB();
        firestoreSync.syncAttendance(config).catch(e => console.warn('Firestore syncAttendance error:', e));
        return this.jsonResponse(config);
      }

      // Parent Removal (Class-wise & Bulk)
      const parentClassDeleteMatch = path.match(/^\/api\/parents\/class\/([^/]+)$/);
      if (parentClassDeleteMatch && method === 'DELETE') {
        const cId = parentClassDeleteMatch[1];
        const classStudents = this.db.students.filter(s => s.classId === cId);
        const classStudentIds = new Set(classStudents.map(s => s.id));
        const parentIdsToRemove = new Set<string>();

        this.db.users.filter(u => u.role === 'parent').forEach(p => {
          const linked = this.db.students.filter(s => s.parentUserId === p.id || s.parentNameEn.toLowerCase() === p.name.toLowerCase());
          if (linked.some(s => classStudentIds.has(s.id))) {
            parentIdsToRemove.add(p.id);
          }
        });

        const deletedCount = parentIdsToRemove.size;
        this.db.users = this.db.users.filter(u => !parentIdsToRemove.has(u.id));
        classStudents.forEach(s => {
          s.parentUserId = undefined;
        });
        this.saveDB();

        parentIdsToRemove.forEach(pId => {
          firestoreSync.deleteParent(pId).catch(e => console.warn('Firestore deleteParent error:', e));
        });

        return this.jsonResponse({ success: true, deletedCount });
      }

      if (path === '/api/parents/bulk-delete' && method === 'POST') {
        const { parentIds } = bodyData;
        if (!Array.isArray(parentIds) || parentIds.length === 0) {
          return this.jsonResponse({ error: 'No parent IDs provided' }, 400);
        }
        const idSet = new Set(parentIds);
        this.db.users = this.db.users.filter(u => !idSet.has(u.id));
        this.db.students.forEach(s => {
          if (s.parentUserId && idSet.has(s.parentUserId)) {
            s.parentUserId = undefined;
          }
        });
        this.saveDB();

        parentIds.forEach(pId => {
          firestoreSync.deleteParent(pId).catch(e => console.warn('Firestore bulk deleteParent error:', e));
        });

        return this.jsonResponse({ success: true, deletedCount: parentIds.length });
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
