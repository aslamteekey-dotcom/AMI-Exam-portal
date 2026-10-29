import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  TeacherAssignment,
  ClassItem,
  SubjectItem,
  Examination,
  MarkSheet,
  Student,
  sortStudentsBoysFirst,
  assignClassSequentialRollNumbers,
  recalculateClassRollsAndExamRegNos,
  TUITION_FEE_MONTHS,
  FeePayment,
  SpecialFeeType,
  ReceiptSequences,
  InstitutionSettings,
  ClassAttendanceConfig,
  DailyAttendanceRecord,
  InstitutionHoliday,
  SpecialWorkingDay,
  isClassMatch,
  AttendanceEditRequest,
  NewsItem,
  NotificationItem,
  DEFAULT_NEWS_ITEMS,
  ALL_STANDARD_CLASSES,
  mergeClassesWithStandard,
  normalizeGender,
} from '../../types';
import { MarkEntryScreen } from './MarkEntryScreen';
import { useHorizontalScroll, handleHorizontalWheel } from '../../hooks/useHorizontalScroll';
import { useAttendanceLocks } from '../../hooks/useAttendanceLocks';
import {
  isAlternateOffDay,
  isClassScheduledOffDay,
  isAlternateScheduleClass,
  getScheduledOffDayReason,
  getClassScheduleSummary,
  parseDateToDayOfWeek,
} from '../../utils/scheduleUtils';
import {
  db,
  handleFirestoreError,
  OperationType,
  safeOnSnapshot,
  isFirestoreQuotaExhausted,
  markFirestoreQuotaExhausted,
  isQuotaError,
} from '../../services/firebase';
import {
  collection,
  onSnapshot,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  addDoc,
  updateDoc,
  query,
  where,
} from 'firebase/firestore';
import { firestoreSync, cleanForFirestore } from '../../services/firestoreSync';
import { logAuditEvent } from '../../services/auditLogger';
import {
  BookOpen,
  Users,
  Clock,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Lock,
  Unlock,
  Key,
  Edit3,
  Shield,
  Layers,
  GraduationCap,
  Calendar,
  Sparkles,
  CreditCard,
  Save,
  CalendarCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  CheckCheck,
  RotateCcw,
  Home,
  Newspaper,
  Bell,
  PhoneCall,
  Phone,
  Mail,
  MapPin,
  ExternalLink,
  Send,
  ShieldCheck,
  Instagram,
  Facebook,
  Youtube,
  Plus,
  Edit2,
  Trash2,
  Award,
  BarChart2,
  ArrowRight,
  User as UserIcon,
  Search,
  Tag,
  Printer,
} from 'lucide-react';

export type TeacherPortalTab =
  | 'home'
  | 'my_class'
  | 'mark_entry'
  | 'attendance'
  | 'fees'
  | 'special_fees'
  | 'news'
  | 'notification'
  | 'contact'
  | 'about';

export const ACADEMIC_YEAR_START_DATE = '2026-06-01';

export const formatLocalDate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const parseLocalDate = (dateStr: string): Date => {
  if (!dateStr) return new Date();
  const parts = dateStr.split('-');
  const y = parseInt(parts[0], 10) || new Date().getFullYear();
  const m = (parseInt(parts[1], 10) || (new Date().getMonth() + 1)) - 1;
  const d = parseInt(parts[2], 10) || new Date().getDate();
  return new Date(y, m, d);
};

export const getWeekMondayStr = (baseDateStr: string): string => {
  const d = parseLocalDate(baseDateStr);
  if (isNaN(d.getTime())) return formatLocalDate(new Date());
  const day = d.getDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return formatLocalDate(d);
};

export const SPECIAL_FEE_TYPES: SpecialFeeType[] = [
  'Terminal Exam Fee',
  'Hikma Exam Fee',
  'Public Exam Fee',
  'Council Fund',
  'Donation/Other',
];

export const numberToWords = (num: number): string => {
  if (num <= 0) return 'Zero Rupees Only';
  const a = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const inWords = (n: number): string => {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
    if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' and ' + inWords(n % 100) : '');
    if (n < 100000) return inWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 !== 0 ? ' ' + inWords(n % 1000) : '');
    if (n < 10000000) return inWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 !== 0 ? ' ' + inWords(n % 100000) : '');
    return inWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 !== 0 ? ' ' + inWords(n % 10000000) : '');
  };

  return inWords(num).trim() + ' Rupees Only';
};

export const TeacherDashboard: React.FC = () => {
  const { user, fetchWithAuth, lang, t } = useAuth();
  const isMl = lang === 'ml';
  const language = (lang || 'en').toUpperCase();
  const teacher = user;
  const [loading, setLoading] = useState(true);

  // Tab State: 1. Home, 2. My Class, 3. Mark Entry, 4. Attendance, 5. Fees, 6. Special Fees, 7. News, 8. Notification, 9. Contact, 10. About
  const [activeTab, setActiveTab] = useState<TeacherPortalTab>('home');
  const { scrollProps: navScrollProps } = useHorizontalScroll();

  const [assignments, setAssignments] = useState<TeacherAssignment[]>(() => {
    const raw = (user as any)?.assignedSubjects || user?.assignments;
    return Array.isArray(raw) ? raw : [];
  });
  const [classes, setClasses] = useState<ClassItem[]>(ALL_STANDARD_CLASSES);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [examinations, setExaminations] = useState<Examination[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>('exam_half_yearly_2026_27');
  const [markSheets, setMarkSheets] = useState<MarkSheet[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [currentTeacherInChargeClassId, setCurrentTeacherInChargeClassId] = useState<string | undefined>(user?.inChargeClassId);

  // In-charge class information
  const inChargeClassId =
    currentTeacherInChargeClassId !== undefined
      ? currentTeacherInChargeClassId
      : (user?.inChargeClassId || (user as any)?.classInCharge);
  const inChargeClass = inChargeClassId
    ? (classes.find(
        c =>
          c.id === inChargeClassId ||
          c.name.toLowerCase() === String(inChargeClassId).toLowerCase() ||
          String(c.numericGrade) === String(inChargeClassId).replace(/\D/g, '')
      ) || null)
    : null;

  // In-charge Class Attendance & Fee Tracking
  const [attendanceTotalWorkingDays, setAttendanceTotalWorkingDays] = useState<number>(88);
  const [studentDaysAttendedMap, setStudentDaysAttendedMap] = useState<Record<string, number>>({});
  const [isSavingAttendance, setIsSavingAttendance] = useState(false);
  const [attendanceSaved, setAttendanceSaved] = useState(false);
  const [classFeePayments, setClassFeePayments] = useState<FeePayment[]>([]);
  const [feeClassId, setFeeClassId] = useState<string>('');

  // Special Fees State (Restricted to Teacher's Designated Class)
  const [allFeePayments, setAllFeePayments] = useState<FeePayment[]>([]);
  const [institutionSettings, setInstitutionSettings] = useState<InstitutionSettings | null>(null);
  const [specialFeeReceiptNo, setSpecialFeeReceiptNo] = useState<string>('01');
  const [specialFeeStudentId, setSpecialFeeStudentId] = useState<string>('');
  const [specialFeeDate, setSpecialFeeDate] = useState<string>(() => formatLocalDate(new Date()));
  const [specialFeeType, setSpecialFeeType] = useState<SpecialFeeType>('Terminal Exam Fee');
  const [specialFeeAmount, setSpecialFeeAmount] = useState<number | ''>(150);
  const [specialFeeNotes, setSpecialFeeNotes] = useState<string>('');
  const [isSubmittingSpecialFee, setIsSubmittingSpecialFee] = useState<boolean>(false);
  const [activeSpecialReceipt, setActiveSpecialReceipt] = useState<FeePayment | null>(null);
  const [specialFeeSearchQuery, setSpecialFeeSearchQuery] = useState<string>('');
  const [feeSubTab, setFeeSubTab] = useState<'tuition_progress' | 'special_fees'>('tuition_progress');
  const [showSpecialFeeModal, setShowSpecialFeeModal] = useState<boolean>(false);
  const [specialFeePaymentMode, setSpecialFeePaymentMode] = useState<'Cash' | 'UPI' | 'Bank Transfer'>('Cash');

  const todayStr = formatLocalDate(new Date());
  const [attendanceClassId, setAttendanceClassId] = useState<string>('');
  const [attendanceMode, setAttendanceMode] = useState<'daily' | 'weekly'>('daily');
  const [selectedAttendanceDate, setSelectedAttendanceDate] = useState<string>(() => {
    return formatLocalDate(new Date());
  });
  const [selectedWeekDate, setSelectedWeekDate] = useState<string>(() => {
    return formatLocalDate(new Date());
  });
  const [unlockedDates, setUnlockedDates] = useState<Record<string, boolean>>({});
  const [institutionHolidays, setInstitutionHolidays] = useState<Record<string, InstitutionHoliday>>({});
  const [activeHolidays, setActiveHolidays] = useState<InstitutionHoliday[]>([]);
  const [specialWorkingDays, setSpecialWorkingDays] = useState<Record<string, SpecialWorkingDay>>({});
  const [attendanceEditRequests, setAttendanceEditRequests] = useState<Record<string, AttendanceEditRequest>>({});
  const [isRequestModalOpen, setIsRequestModalOpen] = useState<boolean>(false);
  const [requestReasonInput, setRequestReasonInput] = useState<string>('');
  const [unlockMode, setUnlockMode] = useState<'single' | 'range'>('single');
  const [singleUnlockDate, setSingleUnlockDate] = useState<string>(() => formatLocalDate(new Date()));
  const [rangeStartDate, setRangeStartDate] = useState<string>(() => formatLocalDate(new Date()));
  const [rangeEndDate, setRangeEndDate] = useState<string>(() => formatLocalDate(new Date()));
  const [isSubmittingRequest, setIsSubmittingRequest] = useState<boolean>(false);
  const [showRequestSentToast, setShowRequestSentToast] = useState<boolean>(false);

  const handleOpenUnlockModal = (initialDate?: string) => {
    const target = initialDate || selectedAttendanceDate || todayStr;
    setUnlockMode('single');
    setSingleUnlockDate(target);
    setRangeStartDate(target);
    setRangeEndDate(target);
    setRequestReasonInput('');
    setIsRequestModalOpen(true);
  };
  const [dailyStatusMap, setDailyStatusMap] = useState<Record<string, boolean>>({});
  const [weeklyStatusMap, setWeeklyStatusMap] = useState<Record<string, Record<string, boolean>>>({});
  const [classAttendanceConfig, setClassAttendanceConfig] = useState<ClassAttendanceConfig | null>(null);
  const [allAttendanceConfigs, setAllAttendanceConfigs] = useState<ClassAttendanceConfig[]>([]);
  const [isSavingDaily, setIsSavingDaily] = useState(false);
  const [dailySaveSuccess, setDailySaveSuccess] = useState(false);
  const [isSavingWeekly, setIsSavingWeekly] = useState(false);
  const [weeklySaveSuccess, setWeeklySaveSuccess] = useState(false);
  const [dailyViewLayout, setDailyViewLayout] = useState<'table' | 'cards'>('table');
  const [isSpecialWorkingDay, setIsSpecialWorkingDay] = useState<boolean>(false);

  // Reset teacher special working day override when switching date or class
  useEffect(() => {
    setIsSpecialWorkingDay(false);
  }, [selectedAttendanceDate, attendanceClassId]);

  // Strict Hard Restriction: Instantly clamp to June 1 of academic year and cannot exceed today
  useEffect(() => {
    if (selectedAttendanceDate > todayStr) {
      setSelectedAttendanceDate(todayStr);
    } else if (selectedAttendanceDate < ACADEMIC_YEAR_START_DATE) {
      setSelectedAttendanceDate(ACADEMIC_YEAR_START_DATE);
    }
  }, [selectedAttendanceDate, todayStr]);

  useEffect(() => {
    const selectedWeekMonday = getWeekMondayStr(selectedWeekDate);
    const currentWeekMonday = getWeekMondayStr(todayStr);
    if (selectedWeekMonday > currentWeekMonday) {
      setSelectedWeekDate(todayStr);
    } else if (selectedWeekMonday < ACADEMIC_YEAR_START_DATE) {
      setSelectedWeekDate(ACADEMIC_YEAR_START_DATE);
    }
  }, [selectedWeekDate, todayStr]);

  // Active Mark Entry Selection
  const [activeEntry, setActiveEntry] = useState<{
    classId: string;
    subjectId: string;
    examinationId: string;
  } | null>(null);

  // Mark Entry Sub-tab Segment: 'my_class' (Class In-charge) vs 'teaching_subjects' (All assigned subjects)
  const [markEntrySegment, setMarkEntrySegment] = useState<'my_class' | 'teaching_subjects'>('my_class');

  // View mode switcher in "My Class": 'students' (Students List) vs 'marksheet' (Class Marksheet)
  const [myClassViewMode, setMyClassViewMode] = useState<'students' | 'marksheet'>('students');

  // Student Edit Modal State in "My Class"
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [isSavingStudent, setIsSavingStudent] = useState(false);
  const [studentFormData, setStudentFormData] = useState({
    nameEn: '',
    nameMl: '',
    rollNo: '',
    admissionNo: '',
    gender: 'Boy' as 'Boy' | 'Girl',
    dob: '',
    schoolClass: '',
    parentNameEn: '',
    parentPhone: '',
    examRegNo: '',
  });

  // News State with Create Capability
  const [newsList, setNewsList] = useState<NewsItem[]>(DEFAULT_NEWS_ITEMS);
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const [newsFilter, setNewsFilter] = useState<'all' | 'academic' | 'events' | 'general'>('all');
  const [showCreateNewsModal, setShowCreateNewsModal] = useState(false);
  const [isSavingNews, setIsSavingNews] = useState(false);
  const [newsFormData, setNewsFormData] = useState({
    titleEn: '',
    titleMl: '',
    categoryEn: 'Academic',
    categoryMl: 'പരീക്ഷാ നിർവ്വഹണം',
    summaryEn: '',
    summaryMl: '',
    contentEn: '',
    contentMl: '',
    isImportant: false,
  });

  // Shared Notifications State
  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: 'n-1',
      titleEn: 'Exam Register Number Assigned',
      titleMl: 'പരീക്ഷാ രജിസ്റ്റർ നമ്പർ നൽകി',
      descEn: 'Official Examination Register Number has been allocated for Half-Yearly Examination 2026–2027.',
      descMl: '2026-2027 അർദ്ധവാർഷിക പരീക്ഷയ്ക്കുള്ള പരീക്ഷാ രജിസ്റ്റർ നമ്പർ നൽകിയിട്ടുണ്ട്.',
      time: '2 hours ago',
      type: 'exam',
      read: false,
    },
    {
      id: 'n-2',
      titleEn: 'Fee Payment Ledger Updated',
      titleMl: 'ഫീസ് രസീത് തയ്യാറായി',
      descEn: 'Tuition installment fee payment recorded. Official receipt is available in the Fees tab.',
      descMl: 'ട്യൂഷൻ ഫീസ് പേയ്മെന്റ് രേഖപ്പെടുത്തിയിട്ടുണ്ട്. ഡിജിറ്റൽ രസീത് ഫീസ് വിഭാഗത്തിൽ ലഭ്യമാണ്.',
      time: '1 day ago',
      type: 'fee',
      read: false,
    },
    {
      id: 'n-3',
      titleEn: 'Valuation & Progress Card Update',
      titleMl: 'പുരോഗതി രേഖ പരിശോധന പൂർത്തിയായി',
      descEn: 'Evaluation scores and teacher remarks have been verified by Principal Aslam TK.',
      descMl: 'പ്രിൻസിപ്പൽ അസ്‌ലം ടി.കെ. പരിശോധിച്ചു അംഗീകരിച്ച പുരോഗതി രേഖ പ്രോഗ്രസ്സ് റിപ്പോർട്ട് കാർഡിൽ കാണാം.',
      time: '3 days ago',
      type: 'academic',
      read: true,
    },
    {
      id: 'n-4',
      titleEn: 'Madrasa Holiday Announcement',
      titleMl: 'മദ്റസ അവധി അറിയിപ്പ്',
      descEn: 'Madrasa will remain closed on second Saturday as per the academic calendar.',
      descMl: 'വിദ്യാഭ്യാസ ബോർഡ് കലണ്ടർ പ്രകാരം രണ്ടാം ശനിയാഴ്ച മദ്റസയ്ക്ക് അവധിയായിരിക്കും.',
      time: '1 week ago',
      type: 'circular',
      read: true,
    },
  ]);

  // Shared Contact form state
  const [contactSubject, setContactSubject] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSent, setContactSent] = useState(false);

  const refreshSpecialReceiptSequence = async (existingPayments?: FeePayment[]) => {
    try {
      let serverSeq: ReceiptSequences | null = null;
      try {
        const res = await fetchWithAuth('/api/fees/receipt-sequences');
        if (res.ok) serverSeq = await res.json();
      } catch {}

      if (!serverSeq || !serverSeq.specialReceiptNo) {
        const fsSeq = await firestoreSync.fetchReceiptSequences().catch(() => null);
        if (fsSeq) serverSeq = fsSeq;
      }

      let nextSpecial = serverSeq?.specialReceiptNo ? Number(serverSeq.specialReceiptNo) : 1;

      const list = existingPayments || allFeePayments;
      (list || []).forEach(p => {
        const raw = String(p.receiptNo || '').trim();
        const num = parseInt(raw.replace(/\D/g, ''), 10);
        if (!isNaN(num)) {
          if (p.feeCategory === 'special' || (p.specialFeeAmount > 0 && !p.tuitionFeeAmount && !p.admissionFee)) {
            if (num >= nextSpecial) nextSpecial = num + 1;
          }
        }
      });

      const formatted = nextSpecial < 10 ? `0${nextSpecial}` : String(nextSpecial);
      setSpecialFeeReceiptNo(formatted);
    } catch (e) {
      console.warn('Error refreshing special receipt sequence:', e);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [resAuth, resClasses, resSubjects, resExams, resStudents, resFees, resSettings] = await Promise.all([
        fetchWithAuth('/api/auth/me'),
        fetchWithAuth('/api/classes'),
        fetchWithAuth('/api/subjects'),
        fetchWithAuth('/api/examinations'),
        fetchWithAuth('/api/students'),
        fetchWithAuth('/api/fees/payments').catch(() => null),
        fetchWithAuth('/api/settings').catch(() => null),
      ]);

      const authData = await resAuth.json();
      const clsData: ClassItem[] = await resClasses.json();
      const subData: SubjectItem[] = await resSubjects.json();
      const examData: Examination[] = await resExams.json();
      const stuData: Student[] = await resStudents.json();

      if (resFees && resFees.ok) {
        const allFees = await resFees.json();
        setAllFeePayments(allFees || []);
        refreshSpecialReceiptSequence(allFees);
      }
      if (resSettings && resSettings.ok) {
        const setData = await resSettings.json();
        setInstitutionSettings(setData);
      }

      let currentAssignments: TeacherAssignment[] = authData.assignments || [];

      // DIRECT CLOUD SYNC: Fetch teacher profile directly from Firestore on mount/load
      const teacherId = user?.id || authData.user?.id;
      const teacherUsername = user?.username || authData.user?.username;

      if (teacherId) {
        try {
          const tDocRef = doc(db, 'teachers', teacherId);
          const tDocSnap = await getDoc(tDocRef);
          if (tDocSnap.exists()) {
            const tData = tDocSnap.data();
            const rawSubs = Array.isArray(tData.assignedSubjects)
              ? tData.assignedSubjects
              : (Array.isArray(tData.assignments) ? tData.assignments : []);
            if (rawSubs.length > 0) {
              currentAssignments = rawSubs.map((a: any, idx: number) => ({
                id: a.id || `asg_${teacherId}_${idx}`,
                teacherId: a.teacherId || teacherId,
                classId: a.classId,
                subjectId: a.subjectId,
              }));
            }
            if (tData.inChargeClassId !== undefined) {
              setCurrentTeacherInChargeClassId(tData.inChargeClassId || undefined);
            }
          } else {
            // Fallback collection scan if teacher was stored under different ID or username
            const allTeachersSnap = await getDocs(collection(db, 'teachers'));
            const matched = allTeachersSnap.docs.find(d => d.id === teacherId || d.data().username === teacherUsername);
            if (matched) {
              const tData = matched.data();
              const rawSubs = Array.isArray(tData.assignedSubjects)
                ? tData.assignedSubjects
                : (Array.isArray(tData.assignments) ? tData.assignments : []);
              if (rawSubs.length > 0) {
                currentAssignments = rawSubs.map((a: any, idx: number) => ({
                  id: a.id || `asg_${matched.id}_${idx}`,
                  teacherId: a.teacherId || matched.id,
                  classId: a.classId,
                  subjectId: a.subjectId,
                }));
              }
              if (tData.inChargeClassId !== undefined) {
                setCurrentTeacherInChargeClassId(tData.inChargeClassId || undefined);
              }
            }
          }
        } catch (fErr) {
          console.error('Error fetching teacher profile directly from Firestore:', fErr);
        }
      }

      setAssignments(currentAssignments);
      setClasses(mergeClassesWithStandard(clsData));
      setSubjects(subData);
      setExaminations(examData);
      setAllStudents(sortStudentsBoysFirst(stuData));
      if (authData.user?.inChargeClassId !== undefined) {
        setCurrentTeacherInChargeClassId(authData.user.inChargeClassId);
      }

      const targetInChargeId = authData.user?.inChargeClassId !== undefined ? authData.user.inChargeClassId : currentAssignments[0]?.classId;
      if (targetInChargeId) {
        setFeeClassId(targetInChargeId);
        try {
          const [resAtt, resFees] = await Promise.all([
            fetchWithAuth(`/api/attendance/class/${targetInChargeId}`),
            fetchWithAuth(`/api/fees/payments?classId=${targetInChargeId}`),
          ]);
          if (resAtt.ok) {
            const att = await resAtt.json();
            if (att.totalWorkingDays) setAttendanceTotalWorkingDays(att.totalWorkingDays);
            if (att.studentDaysAttended) setStudentDaysAttendedMap(att.studentDaysAttended);
          }
          if (resFees.ok) {
            const fees = await resFees.json();
            setClassFeePayments(fees);
          }
        } catch (fErr) {
          console.warn('Error loading in-charge attendance & fees:', fErr);
        }
      } else if (clsData.length > 0) {
        setFeeClassId(clsData[0].id);
      }

      const activeExam = examData[0];
      if (activeExam) {
        setSelectedExamId(activeExam.id);
        const resSheets = await fetchWithAuth(`/api/mark-sheets?examinationId=${activeExam.id}`);
        if (resSheets.ok) {
          const sheetsData = await resSheets.json();
          setMarkSheets(sheetsData);
        }
      }

      // Initial direct fetch for institutionHolidays
      try {
        const holSnap = await getDocs(collection(db, 'institutionHolidays'));
        const holidays = holSnap.docs.map(docSnap => ({
          ...docSnap.data(),
          id: docSnap.id,
          date: docSnap.data().date || docSnap.id,
        } as InstitutionHoliday));
        setActiveHolidays(holidays);
        const holMap: Record<string, InstitutionHoliday> = {};
        holidays.forEach(h => {
          const key = h.date || h.id;
          if (key) holMap[key] = h;
          const rStart = h.rangeStart || (h as any).startDate;
          const rEnd = h.rangeEnd || (h as any).endDate;
          if (rStart && rEnd) {
            let curr = parseLocalDate(rStart);
            const end = parseLocalDate(rEnd);
            while (curr <= end) {
              holMap[formatLocalDate(curr)] = h;
              curr.setDate(curr.getDate() + 1);
            }
          }
        });
        setInstitutionHolidays(holMap);
      } catch (fErr) {
        console.warn('Initial Firestore institutionHolidays fetch error:', fErr);
      }
    } catch (err) {
      console.error('Error loading teacher data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    firestoreSync.cleanupRestoredHolidays().catch(() => {});
    loadData();

    if (isFirestoreQuotaExhausted()) {
      return;
    }

    // Real-time onSnapshot listeners for subjects, classes, students, teachers, attendance, and news
    const unsubs: (() => void)[] = [];

    try {
      const unsubSubs = safeOnSnapshot(
        collection(db, 'subjects'),
        snapshot => {
          if (!snapshot.empty) {
            const remoteSubs = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as SubjectItem));
            setSubjects(remoteSubs);
          }
        },
        error => {
          console.error('Firestore subjects onSnapshot listener error:', error);
          handleFirestoreError(error, OperationType.GET, 'subjects');
        }
      );
      unsubs.push(unsubSubs);

      const unsubCls = safeOnSnapshot(
        collection(db, 'classes'),
        snapshot => {
          if (!snapshot.empty) {
            const remoteCls = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as ClassItem));
            setClasses(mergeClassesWithStandard(remoteCls));
          }
        },
        error => {
          console.error('Firestore classes onSnapshot listener error:', error);
          handleFirestoreError(error, OperationType.GET, 'classes');
        }
      );
      unsubs.push(unsubCls);

      const unsubStu = safeOnSnapshot(
        collection(db, 'students'),
        snapshot => {
          if (!snapshot.empty) {
            const validDocs = snapshot.docs.filter(d => {
              const data = d.data();
              const hasName = Boolean(String(data.nameEn || data.name || '').trim());
              const hasAdmNo = Boolean(String(data.admissionNo || '').trim());
              return hasName && hasAdmNo;
            });
            const uniqueMap = new Map();
            for (const d of validDocs) {
              const data = d.data();
              const regNos = {
                ...((data as any).examRegisterNumbers || {}),
                ...((data as any).examRegisterNos || {}),
              };
              Object.keys(data).forEach(key => {
                if (key.startsWith('examRegisterNumbers.') || key.startsWith('examRegisterNos.')) {
                  const examId = key.substring(key.indexOf('.') + 1);
                  if (examId && (data as any)[key]) {
                    regNos[examId] = String((data as any)[key]).trim();
                  }
                }
              });
              const targetExamKey = selectedExamId || 'exam_half_yearly_2026_27';
              const currentReg = String(
                (data as any).examRegNo ||
                (data as any).regNo ||
                regNos[targetExamKey] ||
                (data as any).examRegisterNos?.[targetExamKey] ||
                (selectedExamId ? regNos[selectedExamId] : '') ||
                Object.values(regNos)[0] ||
                ''
              ).trim();
              if (currentReg) {
                regNos[targetExamKey] = currentReg;
                if (selectedExamId) {
                  regNos[selectedExamId] = currentReg;
                }
              }
              const normalizedGender = normalizeGender((data as any).gender);
              if ((data as any).gender && (data as any).gender !== normalizedGender) {
                updateDoc(doc(db, 'students', d.id), { gender: normalizedGender }).catch(() => {});
              }
              const studentObj = {
                ...data,
                id: d.id,
                gender: normalizedGender,
                examRegisterNumbers: regNos,
                examRegisterNos: regNos,
                examRegNo: currentReg,
                regNo: currentReg,
                isRegNoLocked: Boolean((data as any).isRegNoLocked || currentReg),
              } as Student;
              const key = String(studentObj.admissionNo || d.id).trim();
              if (!uniqueMap.has(key)) {
                uniqueMap.set(key, studentObj);
              }
            }
            setAllStudents(sortStudentsBoysFirst(Array.from(uniqueMap.values())));
          }
        },
        error => {
          console.error('Firestore students onSnapshot listener error:', error);
          handleFirestoreError(error, OperationType.GET, 'students');
        }
      );
      unsubs.push(unsubStu);

      const handleStudentsUpdated = (e: any) => {
        const list = e.detail;
        if (Array.isArray(list)) {
          const valid = list.filter(
            (s: any) => s && Boolean(String(s.nameEn || s.name || '').trim()) && Boolean(String(s.admissionNo || '').trim())
          ).map((s: any) => ({
            ...s,
            gender: normalizeGender(s.gender),
          }));
          setAllStudents(sortStudentsBoysFirst(valid));
        }
      };
      window.addEventListener('madrasa_students_updated', handleStudentsUpdated);
      unsubs.push(() => window.removeEventListener('madrasa_students_updated', handleStudentsUpdated));

      // Real-time teacher assignments listener
      const unsubTeachers = safeOnSnapshot(
        collection(db, 'teachers'),
        snapshot => {
          if (!snapshot.empty && (user?.id || user?.username)) {
            const currentT = snapshot.docs.find(d => d.id === user?.id || d.data().username === user?.username);
            if (currentT) {
              const tData = currentT.data();
              if (tData.inChargeClassId !== undefined) {
                setCurrentTeacherInChargeClassId(tData.inChargeClassId || undefined);
              }
              const rawSubs = Array.isArray(tData.assignedSubjects)
                ? tData.assignedSubjects
                : (Array.isArray(tData.assignments) ? tData.assignments : []);

              const mappedAsgs: TeacherAssignment[] = rawSubs.map((a: any, idx: number) => ({
                id: a.id || `asg_${currentT.id}_${idx}`,
                teacherId: a.teacherId || currentT.id,
                classId: a.classId,
                subjectId: a.subjectId,
              }));
              setAssignments(mappedAsgs);
            }
          }
        },
        error => {
          console.error('Firestore teachers onSnapshot listener error:', error);
          handleFirestoreError(error, OperationType.GET, 'teachers');
        }
      );
      unsubs.push(unsubTeachers);

      // Direct document listener on specific teacher profile
      if (user?.id) {
        const unsubDoc = safeOnSnapshot(
          doc(db, 'teachers', user.id),
          docSnap => {
            if (docSnap.exists()) {
              const tData = docSnap.data();
              if (tData.inChargeClassId !== undefined) {
                setCurrentTeacherInChargeClassId(tData.inChargeClassId || undefined);
              }
              const rawSubs = Array.isArray(tData.assignedSubjects)
                ? tData.assignedSubjects
                : (Array.isArray(tData.assignments) ? tData.assignments : []);

              const mappedAsgs: TeacherAssignment[] = rawSubs.map((a: any, idx: number) => ({
                id: a.id || `asg_${user.id}_${idx}`,
                teacherId: a.teacherId || user.id,
                classId: a.classId,
                subjectId: a.subjectId,
              }));
              setAssignments(mappedAsgs);
            }
          },
          err => {
            console.error('Firestore direct teacher doc listener error:', err);
          }
        );
        unsubs.push(unsubDoc);
      }

      // Real-time Firestore Attendance listener
      const unsubAttendance = safeOnSnapshot(
        collection(db, 'attendance'),
        snapshot => {
          if (!snapshot.empty) {
            const configs = snapshot.docs.map(d => ({ ...d.data(), classId: d.id } as ClassAttendanceConfig));
            setAllAttendanceConfigs(configs);
          }
        },
        error => {
          console.error('Firestore attendance onSnapshot error:', error);
        }
      );
      unsubs.push(unsubAttendance);

      // Real-time Firestore Institution Holidays listener
      const unsubHolidays = safeOnSnapshot(
        collection(db, 'institutionHolidays'),
        snapshot => {
          const holidays: InstitutionHoliday[] = snapshot.docs.map(docSnap => ({
            ...docSnap.data(),
            id: docSnap.id,
            date: docSnap.data().date || docSnap.id,
          } as InstitutionHoliday));

          setActiveHolidays(holidays);

          const holMap: Record<string, InstitutionHoliday> = {};
          holidays.forEach(h => {
            const key = h.date || h.id;
            if (key) holMap[key] = h;
            const rStart = h.rangeStart || (h as any).startDate;
            const rEnd = h.rangeEnd || (h as any).endDate;
            if (rStart && rEnd) {
              let curr = parseLocalDate(rStart);
              const end = parseLocalDate(rEnd);
              while (curr <= end) {
                holMap[formatLocalDate(curr)] = h;
                curr.setDate(curr.getDate() + 1);
              }
            }
          });
          setInstitutionHolidays(holMap);
        },
        error => {
          console.warn('Firestore institutionHolidays onSnapshot error:', error);
        }
      );
      unsubs.push(unsubHolidays);

      const handleHolidaysUpdated = () => {
        if (isFirestoreQuotaExhausted()) return;
        getDocs(collection(db, 'institutionHolidays')).then(snapshot => {
          const holidays: InstitutionHoliday[] = snapshot.docs.map(docSnap => ({
            ...docSnap.data(),
            id: docSnap.id,
            date: docSnap.data().date || docSnap.id,
          } as InstitutionHoliday));

          setActiveHolidays(holidays);

          const holMap: Record<string, InstitutionHoliday> = {};
          holidays.forEach(h => {
            const key = h.date || h.id;
            if (key) holMap[key] = h;
            const rStart = h.rangeStart || (h as any).startDate;
            const rEnd = h.rangeEnd || (h as any).endDate;
            if (rStart && rEnd) {
              let curr = parseLocalDate(rStart);
              const end = parseLocalDate(rEnd);
              while (curr <= end) {
                holMap[formatLocalDate(curr)] = h;
                curr.setDate(curr.getDate() + 1);
              }
            }
          });
          setInstitutionHolidays(holMap);
        }).catch(() => {});
      };
      window.addEventListener('madrasa_holidays_updated', handleHolidaysUpdated);
      unsubs.push(() => window.removeEventListener('madrasa_holidays_updated', handleHolidaysUpdated));

      // Real-time Firestore Special Working Days (Principal Sunday Unlock) listener
      const unsubSpecialWorking = safeOnSnapshot(
        collection(db, 'specialWorkingDays'),
        snapshot => {
          const swMap: Record<string, SpecialWorkingDay> = {};
          snapshot.docs.forEach(docSnap => {
            swMap[docSnap.id] = { ...docSnap.data(), id: docSnap.id } as SpecialWorkingDay;
          });
          setSpecialWorkingDays(swMap);
        },
        error => {
          console.warn('Firestore specialWorkingDays onSnapshot error:', error);
        }
      );
      unsubs.push(unsubSpecialWorking);

      // Real-time Firestore Attendance Unlock Requests listener (Primary)
      const unsubUnlockRequests = safeOnSnapshot(
        collection(db, 'attendanceUnlockRequests'),
        snapshot => {
          setAttendanceEditRequests(prev => {
            const next = { ...prev };
            snapshot.docs.forEach(docSnap => {
              const data = docSnap.data() as AttendanceEditRequest;
              const item: AttendanceEditRequest = {
                ...data,
                id: docSnap.id,
                createdAt: data.createdAt || data.requestedAt,
                requestedAt: data.requestedAt || data.createdAt,
              };
              if ((item.mode === 'range' || (item.startDate && item.endDate)) && item.startDate && item.endDate) {
                let curr = parseLocalDate(item.startDate);
                const end = parseLocalDate(item.endDate);
                while (curr <= end) {
                  const dStr = formatLocalDate(curr);
                  next[dStr] = item;
                  if (item.classId) next[`${item.classId}_${dStr}`] = item;
                  curr.setDate(curr.getDate() + 1);
                }
              } else if (item.date) {
                next[item.date] = item;
                if (item.classId) next[`${item.classId}_${item.date}`] = item;
              }
            });
            return next;
          });
        },
        error => {
          console.warn('Firestore attendanceUnlockRequests onSnapshot error:', error);
        }
      );
      unsubs.push(unsubUnlockRequests);

      // Legacy fallback listener for attendanceEditRequests
      const unsubLegacyRequests = safeOnSnapshot(
        collection(db, 'attendanceEditRequests'),
        snapshot => {
          setAttendanceEditRequests(prev => {
            const next = { ...prev };
            snapshot.docs.forEach(docSnap => {
              const data = docSnap.data() as AttendanceEditRequest;
              const item: AttendanceEditRequest = {
                ...data,
                id: docSnap.id,
                createdAt: data.createdAt || data.requestedAt,
                requestedAt: data.requestedAt || data.createdAt,
              };
              if (item.date) next[item.date] = item;
              if (item.classId && item.date) {
                next[`${item.classId}_${item.date}`] = item;
              }
            });
            return next;
          });
        },
        error => {
          console.warn('Firestore attendanceEditRequests legacy onSnapshot error:', error);
        }
      );
      unsubs.push(unsubLegacyRequests);

      // Real-time Firestore News listener
      const unsubNews = safeOnSnapshot(
        collection(db, 'news'),
        snapshot => {
          if (!snapshot.empty) {
            const remoteNews = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as NewsItem));
            const existingIds = new Set(remoteNews.map(n => n.id));
            const combined = [...remoteNews, ...DEFAULT_NEWS_ITEMS.filter(n => !existingIds.has(n.id))];
            combined.sort((a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime());
            setNewsList(combined);
          }
        },
        error => {
          console.error('Firestore news onSnapshot error:', error);
        }
      );
      unsubs.push(unsubNews);

      // Real-time Firestore fee_payments listener
      const unsubFees = safeOnSnapshot(
        collection(db, 'fee_payments'),
        snapshot => {
          if (!snapshot.empty) {
            const fees = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as FeePayment));
            setAllFeePayments(fees);
            refreshSpecialReceiptSequence(fees);
          }
        },
        error => {
          console.warn('Firestore fee_payments listener error in TeacherDashboard:', error);
        }
      );
      unsubs.push(unsubFees);
    } catch (e) {
      console.error('Failed to attach Teacher Portal real-time listeners:', e);
    }

    return () => {
      unsubs.forEach(u => {
        try {
          u();
        } catch {}
      });
    };
  }, [user?.id, user?.username]);

  const handleExamChange = async (examId: string) => {
    setSelectedExamId(examId);
    const resSheets = await fetchWithAuth(`/api/mark-sheets?examinationId=${examId}`);
    if (resSheets.ok) {
      const sheetsData = await resSheets.json();
      setMarkSheets(sheetsData);
    }
  };

  const handleFeeClassChange = async (targetClassId: string) => {
    setFeeClassId(targetClassId);
    try {
      const resFees = await fetchWithAuth(`/api/fees/payments?classId=${targetClassId}`);
      if (resFees.ok) {
        const fees = await resFees.json();
        setClassFeePayments(fees);
      }
    } catch (e) {
      console.warn('Error loading fees for class:', e);
    }
  };

  const handleSaveAttendance = async (targetClassId: string) => {
    setIsSavingAttendance(true);
    setAttendanceSaved(false);
    try {
      const res = await fetchWithAuth(`/api/attendance/class/${targetClassId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          totalWorkingDays: attendanceTotalWorkingDays,
          studentDaysAttended: studentDaysAttendedMap,
        }),
      });
      if (!res.ok) throw new Error('Failed to save attendance');
      setAttendanceSaved(true);
      setTimeout(() => setAttendanceSaved(false), 3000);
      alert('Class attendance roster saved successfully! Total working days and student attendance recorded.');
    } catch (err: any) {
      alert(err.message || 'Error saving attendance');
    } finally {
      setIsSavingAttendance(false);
    }
  };

  // Set default attendanceClassId when classes or in-charge class load
  useEffect(() => {
    if (!attendanceClassId) {
      const defaultId = currentTeacherInChargeClassId || user?.inChargeClassId || (assignments.length > 0 ? assignments[0].classId : (classes[0]?.id || ''));
      if (defaultId) setAttendanceClassId(defaultId);
    }
  }, [currentTeacherInChargeClassId, user?.inChargeClassId, assignments, classes, attendanceClassId]);

  // Check if a date is a Sunday (weekly closure by default)
  const isDateSunday = (dateStr: string): boolean => {
    const d = parseLocalDate(dateStr);
    return d.getDay() === 0;
  };

  // Check if a Sunday is unlocked by Principal for this class
  const isSundayUnlockedForClass = (dateStr: string, classId?: string): boolean => {
    const sw = specialWorkingDays[dateStr];
    if (!sw) return false;
    return isClassMatch(sw.targetClasses, classId || attendanceClassId);
  };

  // Check if date is designated as an Institution Holiday / Non-Working Day for this class
  // CRITICAL: Evaluates ONLY against currently active holidays from Firestore (or Sunday default closure)
  const isDateHoliday = (dateStr: string, classId?: string): boolean => {
    const targetClass = classId || attendanceClassId;

    // Sunday Default Closure Check
    if (isDateSunday(dateStr)) {
      if (isSundayUnlockedForClass(dateStr, targetClass)) {
        return false; // Principal unlocked as working day
      }
      return true; // Default weekly Sunday closure
    }

    // Institution Holiday Check (class-specific) - Check real-time institutionHolidays map
    const hol = institutionHolidays[dateStr];
    if (hol && isClassMatch(hol.targetClasses, targetClass)) {
      return true;
    }

    // Direct check against activeHolidays list from Firestore snapshot
    const activeHol = activeHolidays.find(h => {
      if (!isClassMatch(h.targetClasses, targetClass)) return false;
      if (h.date === dateStr || h.id === dateStr) return true;
      const rStart = h.rangeStart || (h as any).startDate;
      const rEnd = h.rangeEnd || (h as any).endDate;
      if (rStart && rEnd && dateStr >= rStart && dateStr <= rEnd) return true;
      return false;
    });
    if (activeHol) return true;

    // CRITICAL: Daily records MUST NOT be checked here. If date is not in institutionHolidays, it is NOT a holiday.
    return false;
  };

  // Get metadata for a holiday (strictly read-only in Teacher Portal)
  const getHolidayInfo = (dateStr: string, classId?: string): { date: string; reason: string; markedBy?: string } | null => {
    const targetClass = classId || attendanceClassId;

    if (isDateSunday(dateStr)) {
      if (isSundayUnlockedForClass(dateStr, targetClass)) {
        return null;
      }
      return {
        date: dateStr,
        reason: 'Sunday Weekly Closure (Non-Working Day)',
        markedBy: 'System Default',
      };
    }

    const hol = institutionHolidays[dateStr] || activeHolidays.find(h => {
      if (!isClassMatch(h.targetClasses, targetClass)) return false;
      if (h.date === dateStr || h.id === dateStr) return true;
      const rStart = h.rangeStart || (h as any).startDate;
      const rEnd = h.rangeEnd || (h as any).endDate;
      if (rStart && rEnd && dateStr >= rStart && dateStr <= rEnd) return true;
      return false;
    });

    if (hol && isClassMatch(hol.targetClasses, targetClass)) {
      return {
        date: dateStr,
        reason: hol.reason || 'Official Holiday / Non-Working Day',
        markedBy: hol.markedBy || hol.createdBy || 'Principal',
      };
    }

    return null;
  };

  // Central Unified Real-Time Attendance Lock State (Single Source of Truth)
  const attendanceLocks = useAttendanceLocks({
    classId: attendanceClassId,
    isDateHoliday,
    todayStr,
    academicYearStartDate: ACADEMIC_YEAR_START_DATE,
    dailyRecords: classAttendanceConfig?.dailyRecords || {},
    classLockedDays: classAttendanceConfig?.lockedDays || {},
  });

  // Helper to fetch request for date & class
  const getRequestForDate = (dateStr: string, classId?: string): AttendanceEditRequest | undefined => {
    return attendanceLocks.getRequestForDate(dateStr, classId);
  };

  // Check if attendance has already been saved to Firestore for a given date
  const isDateRecorded = (dateStr: string): boolean => {
    return attendanceLocks.isDateRecorded(dateStr);
  };

  // Check if a date is locked (already saved to Firestore and not explicitly unlocked by Principal)
  const isDateLocked = (dateStr: string): boolean => {
    return attendanceLocks.isDateLocked(dateStr);
  };

  // Helper to compute days of the week (Monday through Saturday, plus Sunday if unlocked for this class)
  const getWeekDays = (baseDateStr: string) => {
    const mondayStr = getWeekMondayStr(baseDateStr);
    const monday = parseLocalDate(mondayStr);

    const days: { dateStr: string; dayName: string; dayNameMl: string; shortDate: string }[] = [];
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayNamesMl = ['തിങ്കൾ', 'ചൊവ്വ', 'ബുധൻ', 'വ്യാഴം', 'വെള്ളി', 'ശനി'];

    for (let i = 0; i < 6; i++) {
      const cur = new Date(monday);
      cur.setDate(monday.getDate() + i);
      const dateStr = formatLocalDate(cur);
      const shortDate = `${cur.getDate()} ${cur.toLocaleString('default', { month: 'short' })}`;
      days.push({
        dateStr,
        dayName: dayNames[i],
        dayNameMl: dayNamesMl[i],
        shortDate,
      });
    }

    // Include Sunday if explicitly unlocked by Principal for this class (e.g. KMEB Examination)
    const sundayCur = new Date(monday);
    sundayCur.setDate(monday.getDate() + 6);
    const sundayDateStr = formatLocalDate(sundayCur);
    if (isSundayUnlockedForClass(sundayDateStr, attendanceClassId)) {
      const sundayShortDate = `${sundayCur.getDate()} ${sundayCur.toLocaleString('default', { month: 'short' })}`;
      days.push({
        dateStr: sundayDateStr,
        dayName: 'Sunday ⭐',
        dayNameMl: 'ഞായർ (KMEB Exam)',
        shortDate: sundayShortDate,
      });
    }

    return days;
  };

  const rawCfg = useMemo(() => {
    if (!attendanceClassId) return null;
    return (
      allAttendanceConfigs.find(
        c => c.classId === attendanceClassId || isClassMatch([attendanceClassId], c.classId)
      ) || null
    );
  }, [allAttendanceConfigs, attendanceClassId]);

  // Attendance Data Resolver: Cleans up stale isHoliday/status: 'holiday' flags and synchronizes classAttendanceConfig in memory
  useEffect(() => {
    if (!attendanceClassId) return;

    const currentRecords: Record<string, DailyAttendanceRecord> = { ...(rawCfg?.dailyRecords || {}) };

    // Consolidate any standalone daily attendance documents for this class from allAttendanceConfigs
    allAttendanceConfigs.forEach(item => {
      const itemData = item as any;
      const isMatch =
        item.classId === attendanceClassId ||
        itemData.classId === attendanceClassId ||
        item.classId?.startsWith(`${attendanceClassId}_`) ||
        itemData.id?.startsWith(`${attendanceClassId}_`);

      if (isMatch && itemData.date && !currentRecords[itemData.date]) {
        currentRecords[itemData.date] = {
          date: itemData.date,
          presentStudentIds: itemData.presentStudentIds || [],
          absentStudentIds: itemData.absentStudentIds || [],
          statusMap: itemData.statusMap || {},
          markedAt: itemData.markedAt,
          markedBy: itemData.markedBy,
          isHoliday: Boolean(itemData.isHoliday),
          holidayReason: itemData.holidayReason,
          isLocked: itemData.isLocked,
          unlocked: itemData.unlocked,
          editable: itemData.editable,
        };
      }
    });

    const cleanedRecords: Record<string, DailyAttendanceRecord> = {};

    Object.entries(currentRecords).forEach(([dKey, rec]) => {
      const isRecordMarkedHoliday = rec?.isHoliday === true || (rec as any)?.status === 'holiday' || (rec as any)?.status === 'OFF';
      const isDateActiveHoliday = isDateHoliday(dKey, attendanceClassId);

      if (isRecordMarkedHoliday && !isDateActiveHoliday) {
        const hasStudentMarks =
          (rec.presentStudentIds && rec.presentStudentIds.length > 0) ||
          (rec.absentStudentIds && rec.absentStudentIds.length > 0) ||
          (rec.statusMap && Object.keys(rec.statusMap).length > 0);

        if (hasStudentMarks) {
          const { isHoliday, holidayReason, ...rest } = rec;
          const cleanedItem: DailyAttendanceRecord = {
            ...rest,
            isHoliday: false,
          };
          delete (cleanedItem as any).status;
          delete (cleanedItem as any).holidayReason;
          cleanedRecords[dKey] = cleanedItem;
        }
      } else {
        cleanedRecords[dKey] = rec;
      }
    });

    // Calculate dynamic working days directly from live initialized/recorded days (excluding holidays & Sundays)
    const recordedWorkingDates = Object.keys(cleanedRecords).filter(dKey => {
      const rec = cleanedRecords[dKey];
      if (!rec) return false;
      if (rec.isHoliday || isDateHoliday(dKey, attendanceClassId)) return false;
      if (isDateSunday(dKey) && !isSundayUnlockedForClass(dKey, attendanceClassId)) return false;
      const hasMarks =
        (rec.statusMap && Object.keys(rec.statusMap).length > 0) ||
        (rec.presentStudentIds && rec.presentStudentIds.length > 0) ||
        (rec.absentStudentIds && rec.absentStudentIds.length > 0) ||
        Boolean(rec.markedAt);
      return hasMarks;
    });

    const dynamicTotalWorking = recordedWorkingDates.length;

    const resolvedConfig: ClassAttendanceConfig = {
      classId: attendanceClassId,
      totalWorkingDays: dynamicTotalWorking,
      studentDaysAttended: rawCfg?.studentDaysAttended || {},
      dailyRecords: cleanedRecords,
      lockedDays: (rawCfg as any)?.lockedDays || {},
      updatedAt: rawCfg?.updatedAt,
    };

    setClassAttendanceConfig(resolvedConfig);
    setAttendanceTotalWorkingDays(dynamicTotalWorking);
    if (rawCfg?.studentDaysAttended) {
      setStudentDaysAttendedMap(rawCfg.studentDaysAttended);
    }
  }, [attendanceClassId, rawCfg, allAttendanceConfigs, institutionHolidays, specialWorkingDays]);

  // Dynamically listen to class attendance config from Firestore in real-time when switching classes
  useEffect(() => {
    if (!attendanceClassId || isFirestoreQuotaExhausted()) return;
    const unsub = safeOnSnapshot(
      doc(db, 'attendance', attendanceClassId),
      attDoc => {
        if (attDoc.exists()) {
          const cfg = { ...attDoc.data(), classId: attDoc.id } as ClassAttendanceConfig;
          setAllAttendanceConfigs(prev => {
            const idx = prev.findIndex(c => c.classId === attendanceClassId);
            if (idx >= 0) {
              const copy = [...prev];
              copy[idx] = cfg;
              return copy;
            }
            return [...prev, cfg];
          });
        }
      },
      err => {
        console.warn('Real-time attendance doc listener error in TeacherDashboard:', err);
      }
    );
    return () => unsub();
  }, [attendanceClassId]);

  // Submit Attendance Unlock Request to Principal for approval
  const handleSubmitEditRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingRequest) return;
    if (!attendanceClassId) return;

    const isMultiDate = unlockMode === 'range';
    const singleDate = singleUnlockDate;
    const startDate = rangeStartDate;
    const endDate = rangeEndDate;

    if (isMultiDate) {
      if (!startDate || !endDate) {
        alert('Please select both starting date and ending date.');
        return;
      }
      if (endDate < startDate) {
        alert('Ending date cannot be before starting date.');
        return;
      }
    } else {
      if (!singleDate) {
        alert('Please select a target date to unlock.');
        return;
      }
    }

    const requestReason = requestReasonInput.trim();
    if (!requestReason) {
      alert('Please enter a reason for requesting attendance unlock.');
      return;
    }
    setIsSubmittingRequest(true);
    try {
      const teacherClassId = attendanceClassId;
      const teacherClassName = classes.find(c => c.id === attendanceClassId)?.name || `Class ${attendanceClassId}`;
      const currentTeacher = {
        id: user?.id || 'teacher',
        name: user?.name || 'Class Teacher',
        nameEn: (user as any)?.nameEn || user?.name || 'Class Teacher',
      };
      const nowIso = new Date().toISOString();
      const displayDateLabel = isMultiDate ? `${startDate} to ${endDate}` : singleDate;
      const finalDate = isMultiDate ? `${startDate} to ${endDate}` : singleDate;

      // 1. Standardized Unified Firestore Collection: attendanceUnlockRequests
      const docRef = await addDoc(collection(db, 'attendanceUnlockRequests'), {
        mode: isMultiDate ? 'range' : 'single',
        date: finalDate,
        startDate: isMultiDate ? startDate : null,
        endDate: isMultiDate ? endDate : null,
        displayDateLabel: displayDateLabel,
        classId: teacherClassId,
        className: teacherClassName,
        teacherId: currentTeacher.id,
        teacherName: currentTeacher.nameEn || currentTeacher.name,
        reason: requestReason,
        status: 'pending',
        createdAt: nowIso,
        requestedAt: nowIso,
      });

      const reqData: AttendanceEditRequest = {
        id: docRef.id,
        mode: isMultiDate ? 'range' : 'single',
        date: finalDate,
        startDate: isMultiDate ? startDate : null,
        endDate: isMultiDate ? endDate : null,
        displayDateLabel,
        classId: teacherClassId,
        className: teacherClassName,
        teacherId: currentTeacher.id,
        teacherName: currentTeacher.nameEn || currentTeacher.name,
        reason: requestReason,
        status: 'pending',
        createdAt: nowIso,
        requestedAt: nowIso,
      };

      setAttendanceEditRequests(prev => {
        const next = { ...prev };
        if (isMultiDate && startDate && endDate) {
          let curr = parseLocalDate(startDate);
          const end = parseLocalDate(endDate);
          while (curr <= end) {
            const dStr = formatLocalDate(curr);
            next[dStr] = reqData;
            next[`${teacherClassId}_${dStr}`] = reqData;
            curr.setDate(curr.getDate() + 1);
          }
        } else if (singleDate) {
          next[singleDate] = reqData;
          next[`${teacherClassId}_${singleDate}`] = reqData;
        }
        return next;
      });

      // Synchronize with local API storage without duplicate Firestore writes
      await fetchWithAuth('/api/attendance-edit-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqData),
      }).catch(() => {});

      logAuditEvent({
        action: 'ATTENDANCE_UNLOCK_REQUESTED',
        details: `Teacher ${currentTeacher.nameEn || currentTeacher.name} requested attendance unlock for Class ${teacherClassName} (${displayDateLabel}). Reason: "${requestReason}".`,
        currentUser: user,
        recordType: 'attendance_unlock_request',
        recordId: docRef.id,
      }).catch(e => console.warn('Audit log error:', e));

      setIsRequestModalOpen(false);
      setRequestReasonInput('');
      setShowRequestSentToast(true);
      setTimeout(() => setShowRequestSentToast(false), 5000);
    } catch (err: any) {
      console.error('Error submitting unlock request:', err);
      alert('Failed to submit unlock request: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  // Re-lock an unlocked date
  const handleRelockDate = (dateStr: string) => {
    attendanceLocks.relockDate(dateStr);
    setUnlockedDates(prev => ({
      ...prev,
      [dateStr]: false,
    }));
    setClassAttendanceConfig(prev => {
      if (!prev || !prev.dailyRecords || !prev.dailyRecords[dateStr]) return prev;
      return {
        ...prev,
        lockedDays: {
          ...(prev.lockedDays || {}),
          [dateStr]: true,
        },
        dailyRecords: {
          ...prev.dailyRecords,
          [dateStr]: {
            ...prev.dailyRecords[dateStr],
            isLocked: true,
            unlocked: false,
            editable: false,
          },
        },
      };
    });
    setAttendanceEditRequests(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => {
        const r = next[k];
        if (r && (r.classId === attendanceClassId || !r.classId)) {
          const matches =
            r.date === dateStr ||
            k.includes(dateStr) ||
            (r.startDate && r.endDate && dateStr >= r.startDate && dateStr <= r.endDate);
          if (matches) {
            next[k] = { ...r, status: 'completed' };
          }
        }
      });
      return next;
    });
  };

  // Current week vs selected week calculation
  const currentWeekMondayStr = getWeekMondayStr(todayStr);
  const selectedWeekMondayStr = getWeekMondayStr(selectedWeekDate);
  const isCurrentWeekOrFuture = selectedWeekMondayStr >= currentWeekMondayStr;
  const isDailyAtToday = selectedAttendanceDate >= todayStr;

  // Sync dailyStatusMap when selectedAttendanceDate, attendanceClassId, classAttendanceConfig, or allStudents change
  useEffect(() => {
    if (!attendanceClassId) return;
    const currentStudents = allStudents.filter(
      s =>
        (s.classId === attendanceClassId ||
          (s.classId && attendanceClassId && s.classId.replace(/[^0-9]/g, '') === attendanceClassId.replace(/[^0-9]/g, '')) ||
          isClassMatch([attendanceClassId], s.classId)) &&
        s.status === 'active'
    );
    const recordForDate = classAttendanceConfig?.dailyRecords?.[selectedAttendanceDate];
    const isStale = (recordForDate?.isHoliday === true || (recordForDate as any)?.status === 'holiday' || (recordForDate as any)?.status === 'OFF') && !isDateHoliday(selectedAttendanceDate, attendanceClassId);

    const newMap: Record<string, boolean> = {};
    currentStudents.forEach(st => {
      if (!isStale && recordForDate?.statusMap && recordForDate.statusMap[st.id] !== undefined) {
        newMap[st.id] = recordForDate.statusMap[st.id];
      } else if (!isStale && recordForDate?.absentStudentIds && recordForDate.absentStudentIds.includes(st.id)) {
        newMap[st.id] = false;
      } else {
        newMap[st.id] = true;
      }
    });
    setDailyStatusMap(newMap);
  }, [selectedAttendanceDate, attendanceClassId, classAttendanceConfig, allStudents, institutionHolidays]);

  // Sync weeklyStatusMap when selectedWeekDate, attendanceClassId, classAttendanceConfig, or allStudents change
  useEffect(() => {
    if (!attendanceClassId) return;
    const currentStudents = allStudents.filter(
      s =>
        (s.classId === attendanceClassId ||
          (s.classId && attendanceClassId && s.classId.replace(/[^0-9]/g, '') === attendanceClassId.replace(/[^0-9]/g, '')) ||
          isClassMatch([attendanceClassId], s.classId)) &&
        s.status === 'active'
    );
    const weekDays = getWeekDays(selectedWeekDate);
    const newWeeklyMap: Record<string, Record<string, boolean>> = {};

    currentStudents.forEach(st => {
      newWeeklyMap[st.id] = {};
      weekDays.forEach(wDay => {
        const rec = classAttendanceConfig?.dailyRecords?.[wDay.dateStr];
        const isStale = (rec?.isHoliday === true || (rec as any)?.status === 'holiday' || (rec as any)?.status === 'OFF') && !isDateHoliday(wDay.dateStr, attendanceClassId);
        if (!isStale && rec?.statusMap && rec.statusMap[st.id] !== undefined) {
          newWeeklyMap[st.id][wDay.dateStr] = rec.statusMap[st.id];
        } else if (!isStale && rec?.absentStudentIds && rec.absentStudentIds.includes(st.id)) {
          newWeeklyMap[st.id][wDay.dateStr] = false;
        } else {
          newWeeklyMap[st.id][wDay.dateStr] = true;
        }
      });
    });
    setWeeklyStatusMap(newWeeklyMap);
  }, [selectedWeekDate, attendanceClassId, classAttendanceConfig, allStudents, institutionHolidays]);

  // Quick navigation helpers for dates - STRICTLY CLAMPED BETWEEN JUNE 1 & TODAY
  const stepDailyDate = (offsetDays: number) => {
    if (offsetDays > 0 && isDailyAtToday) {
      return;
    }
    if (offsetDays < 0 && selectedAttendanceDate <= ACADEMIC_YEAR_START_DATE) {
      return;
    }
    const d = parseLocalDate(selectedAttendanceDate);
    d.setDate(d.getDate() + offsetDays);
    const nextDateStr = formatLocalDate(d);
    if (nextDateStr > todayStr) {
      setSelectedAttendanceDate(todayStr);
    } else if (nextDateStr < ACADEMIC_YEAR_START_DATE) {
      setSelectedAttendanceDate(ACADEMIC_YEAR_START_DATE);
    } else {
      setSelectedAttendanceDate(nextDateStr);
    }
  };

  const stepWeeklyDate = (offsetWeeks: number) => {
    if (offsetWeeks > 0 && isCurrentWeekOrFuture) {
      return;
    }
    const currentMon = getWeekMondayStr(selectedWeekDate);
    if (offsetWeeks < 0 && currentMon <= ACADEMIC_YEAR_START_DATE) {
      return;
    }
    const d = parseLocalDate(selectedWeekDate);
    d.setDate(d.getDate() + offsetWeeks * 7);
    const nextDateStr = formatLocalDate(d);
    const nextMonday = getWeekMondayStr(nextDateStr);
    if (nextMonday > currentWeekMondayStr) {
      setSelectedWeekDate(todayStr);
    } else if (nextMonday < ACADEMIC_YEAR_START_DATE) {
      setSelectedWeekDate(ACADEMIC_YEAR_START_DATE);
    } else {
      setSelectedWeekDate(nextDateStr);
    }
  };

  // Toggle single student in Daily view (disallowed if holiday, locked, or future)
  const toggleDailyStudent = (studentId: string) => {
    if (isDateHoliday(selectedAttendanceDate) || isDateLocked(selectedAttendanceDate) || selectedAttendanceDate > todayStr) {
      return;
    }
    setDailyStatusMap(prev => ({
      ...prev,
      [studentId]: prev[studentId] === false ? true : false,
    }));
  };

  // Mark all present in Daily view (disallowed if holiday, locked, or future)
  const markAllDailyPresent = () => {
    if (isDateHoliday(selectedAttendanceDate, attendanceClassId) || isDateLocked(selectedAttendanceDate) || selectedAttendanceDate > todayStr) {
      return;
    }
    const currentStudents = allStudents.filter(
      s => (s.classId === attendanceClassId || isClassMatch([attendanceClassId], s.classId)) && s.status === 'active'
    );
    const newMap: Record<string, boolean> = {};
    currentStudents.forEach(st => {
      newMap[st.id] = true;
    });
    setDailyStatusMap(newMap);
  };

  // Mark all absent in Daily view (disallowed if holiday, locked, or future)
  const markAllDailyAbsent = () => {
    if (isDateHoliday(selectedAttendanceDate, attendanceClassId) || isDateLocked(selectedAttendanceDate) || selectedAttendanceDate > todayStr) {
      return;
    }
    const currentStudents = allStudents.filter(
      s => (s.classId === attendanceClassId || isClassMatch([attendanceClassId], s.classId)) && s.status === 'active'
    );
    const newMap: Record<string, boolean> = {};
    currentStudents.forEach(st => {
      newMap[st.id] = false;
    });
    setDailyStatusMap(newMap);
  };

  // Toggle student day in Weekly view (strictly disallow holiday, future days, and locked days)
  const toggleWeeklyStudentDay = (studentId: string, dateStr: string) => {
    if (isDateHoliday(dateStr, attendanceClassId) || dateStr > todayStr || isDateLocked(dateStr)) {
      return;
    }
    setWeeklyStatusMap(prev => {
      const studentMap = prev[studentId] || {};
      const currentVal = studentMap[dateStr] !== false;
      return {
        ...prev,
        [studentId]: {
          ...studentMap,
          [dateStr]: !currentVal,
        },
      };
    });
  };

  // Mark all present in Weekly view (strictly ONLY for unrecorded or unlocked days <= todayStr that are NOT holidays)
  const markAllWeeklyPresent = () => {
    const currentStudents = allStudents.filter(
      s =>
        (s.classId === attendanceClassId ||
          (s.classId && attendanceClassId && s.classId.replace(/[^0-9]/g, '') === attendanceClassId.replace(/[^0-9]/g, '')) ||
          isClassMatch([attendanceClassId], s.classId)) &&
        s.status === 'active'
    );
    const weekDays = getWeekDays(selectedWeekDate);
    const newMap: Record<string, Record<string, boolean>> = { ...weeklyStatusMap };

    currentStudents.forEach(st => {
      if (!newMap[st.id]) newMap[st.id] = {};
      weekDays.forEach(wDay => {
        if (wDay.dateStr <= todayStr && !isDateLocked(wDay.dateStr) && !isDateHoliday(wDay.dateStr, attendanceClassId)) {
          const activeClassName = classes.find(c => c.id === attendanceClassId)?.name || attendanceClassId;
          const isDayAltOff = isAlternateOffDay(activeClassName, wDay.dateStr);
          const dayRec = classAttendanceConfig?.dailyRecords?.[wDay.dateStr];
          const dayHasMarks = Boolean(
            dayRec &&
            !dayRec.isHoliday &&
            (dayRec.markedAt ||
              (dayRec.presentStudentIds && dayRec.presentStudentIds.length > 0) ||
              (dayRec.absentStudentIds && dayRec.absentStudentIds.length > 0) ||
              (dayRec.statusMap && Object.keys(dayRec.statusMap).length > 0))
          );
          if (isDayAltOff && !dayHasMarks) {
            return;
          }
          newMap[st.id][wDay.dateStr] = true;
        }
      });
    });
    setWeeklyStatusMap(newMap);
  };

  // Save Daily Attendance (safeguards working days count by excluding holidays)
  const handleSaveDailyAttendance = async () => {
    if (!attendanceClassId) return;
    if (selectedAttendanceDate > todayStr) {
      alert('Cannot mark attendance for future dates.');
      return;
    }
    if (isDateHoliday(selectedAttendanceDate)) {
      alert('This date is designated as an Official Holiday. Attendance marking is exempt.');
      return;
    }
    if (isDateLocked(selectedAttendanceDate)) {
      alert('This date record is locked against duplicate submission. Click "Edit / Unlock Attendance" if you need to make corrections.');
      return;
    }

    setIsSavingDaily(true);
    setDailySaveSuccess(false);
    try {
      const currentStudents = sortStudentsBoysFirst(
        allStudents.filter(
          s =>
            (s.classId === attendanceClassId ||
              (s.classId && attendanceClassId && s.classId.replace(/[^0-9]/g, '') === attendanceClassId.replace(/[^0-9]/g, '')) ||
              isClassMatch([attendanceClassId], s.classId)) &&
            s.status === 'active'
        )
      );
      const presentStudentIds: string[] = [];
      const absentStudentIds: string[] = [];
      const statusMap: Record<string, boolean> = {};

      currentStudents.forEach(st => {
        const isPres = dailyStatusMap[st.id] !== false;
        statusMap[st.id] = isPres;
        if (isPres) presentStudentIds.push(st.id);
        else absentStudentIds.push(st.id);
      });

      const updatedLockedDays: Record<string, boolean> = {
        ...(classAttendanceConfig?.lockedDays || {}),
        [selectedAttendanceDate]: true,
      };

      const updatedDailyRecords: Record<string, DailyAttendanceRecord> = {
        ...(classAttendanceConfig?.dailyRecords || {}),
        [selectedAttendanceDate]: {
          date: selectedAttendanceDate,
          presentStudentIds,
          absentStudentIds,
          statusMap,
          markedAt: new Date().toISOString(),
          markedBy: user?.name || 'Class Teacher',
          isHoliday: false,
          isLocked: true,
          unlocked: false,
          editable: false,
          relockedAt: new Date().toISOString(),
        },
      };

      const updatedDaysAttended: Record<string, number> = {
        ...(classAttendanceConfig?.studentDaysAttended || {}),
      };

      const distinctDates = Object.keys(updatedDailyRecords);
      const workingDateKeys = distinctDates.filter(dKey => {
        const rec = updatedDailyRecords[dKey];
        if (!rec) return false;
        if (rec.isHoliday || isDateHoliday(dKey, attendanceClassId)) return false;
        if (isDateSunday(dKey) && !isSundayUnlockedForClass(dKey, attendanceClassId)) return false;
        const hasMarks =
          (rec.statusMap && Object.keys(rec.statusMap).length > 0) ||
          (rec.presentStudentIds && rec.presentStudentIds.length > 0) ||
          (rec.absentStudentIds && rec.absentStudentIds.length > 0) ||
          Boolean(rec.markedAt);
        return hasMarks;
      });
      const totalWorking = workingDateKeys.length;

      currentStudents.forEach(st => {
        let count = 0;
        workingDateKeys.forEach(dKey => {
          const rec = updatedDailyRecords[dKey];
          const isPres = Boolean(
            rec.statusMap?.[st.id] === true ||
            (rec.statusMap?.[st.id] as any) === 'Present' ||
            (rec.statusMap?.[st.id] as any) === 'P' ||
            (rec.presentStudentIds && rec.presentStudentIds.includes(st.id))
          );
          if (isPres) {
            count++;
          }
        });
        updatedDaysAttended[st.id] = count;
      });

      const updatedConfig: ClassAttendanceConfig = {
        classId: attendanceClassId,
        totalWorkingDays: totalWorking,
        studentDaysAttended: updatedDaysAttended,
        dailyRecords: updatedDailyRecords,
        lockedDays: updatedLockedDays,
        updatedAt: new Date().toISOString(),
      };

      // 1. Direct Firestore writes to attendance collections
      await setDoc(doc(db, 'attendance', attendanceClassId), cleanForFirestore(updatedConfig), { merge: true });
      await setDoc(doc(db, 'attendance', `${attendanceClassId}_${selectedAttendanceDate}`), cleanForFirestore({
        classId: attendanceClassId,
        ...updatedDailyRecords[selectedAttendanceDate],
        date: selectedAttendanceDate,
        isLocked: true,
        unlocked: false,
        editable: false,
        updatedAt: new Date().toISOString(),
      }), { merge: true }).catch(() => {});

      // 2. Update Month's Locked Status document (attendanceLocks)
      const monthKey = selectedAttendanceDate.slice(0, 7);
      try {
        await setDoc(doc(db, 'attendanceLocks', `${attendanceClassId}_${monthKey}`), cleanForFirestore({
          classId: attendanceClassId,
          month: monthKey,
          lockedDays: {
            [selectedAttendanceDate]: true,
          },
          updatedAt: new Date().toISOString(),
        }), { merge: true });
      } catch (lockErr) {
        console.warn('Month lock document write warning:', lockErr);
      }

      for (const st of currentStudents) {
        try {
          await setDoc(
            doc(db, 'students', st.id),
            cleanForFirestore({
              attendance: {
                daysAttended: updatedDaysAttended[st.id],
                totalWorkingDays: totalWorking,
              },
            }),
            { merge: true }
          );
        } catch {}
      }

      await fetchWithAuth(`/api/attendance/class/${attendanceClassId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedConfig),
      });

      const nowIso = new Date().toISOString();

      // 3. Resolve active unlock requests in Firestore attendanceUnlockRequests
      await attendanceLocks.resolveUnlockRequests(selectedAttendanceDate, attendanceClassId, user?.name || 'Class Teacher');

      // 4. Resolve legacy attendanceEditRequests documents
      const activeReq = getRequestForDate(selectedAttendanceDate, attendanceClassId);
      if (activeReq?.id) {
        try {
          await setDoc(doc(db, 'attendanceUnlockRequests', activeReq.id), {
            status: 'completed',
            completedAt: nowIso,
            resolvedAt: nowIso,
          }, { merge: true });
        } catch {}
      }

      const reqId = `${attendanceClassId}_${selectedAttendanceDate}`;
      try {
        await setDoc(
          doc(db, 'attendanceEditRequests', reqId),
          {
            status: 'resolved',
            resolvedAt: nowIso,
          },
          { merge: true }
        );
        await fetchWithAuth(`/api/attendance-edit-requests/${reqId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'resolved' }),
        }).catch(() => {});
      } catch {}

      // 5. Immediate UI State Updates (Re-lock without page refresh)
      setClassAttendanceConfig(updatedConfig);
      setStudentDaysAttendedMap(updatedDaysAttended);
      setAttendanceTotalWorkingDays(totalWorking);

      setUnlockedDates(prev => ({ ...prev, [selectedAttendanceDate]: false }));

      setAttendanceEditRequests(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(k => {
          const r = next[k];
          if (r && (r.classId === attendanceClassId || !r.classId)) {
            const matches =
              r.date === selectedAttendanceDate ||
              k.includes(selectedAttendanceDate) ||
              (r.startDate && r.endDate && selectedAttendanceDate >= r.startDate && selectedAttendanceDate <= r.endDate);
            if (matches) {
              next[k] = {
                ...r,
                status: 'completed',
                resolvedAt: nowIso,
              };
            }
          }
        });
        return next;
      });

      logAuditEvent({
        action: 'ATTENDANCE_MARKED',
        details: `Teacher ${user?.name || 'Teacher'} marked and locked daily attendance for Class ${classes.find(c => c.id === attendanceClassId)?.name || attendanceClassId} on ${selectedAttendanceDate}.`,
        currentUser: user,
        recordType: 'attendance',
        recordId: `${attendanceClassId}_${selectedAttendanceDate}`,
      }).catch(e => console.warn('Audit log error:', e));

      setDailySaveSuccess(true);
      setTimeout(() => setDailySaveSuccess(false), 3500);
    } catch (err: any) {
      console.error('Error saving daily attendance:', err);
      alert('Failed to save daily attendance: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSavingDaily(false);
    }
  };

  // Save Weekly Attendance (safeguards working days count by excluding holidays)
  const handleSaveWeeklyAttendance = async () => {
    if (!attendanceClassId) return;
    setIsSavingWeekly(true);
    setWeeklySaveSuccess(false);
    try {
      const currentStudents = sortStudentsBoysFirst(
        allStudents.filter(
          s =>
            (s.classId === attendanceClassId ||
              (s.classId && attendanceClassId && s.classId.replace(/[^0-9]/g, '') === attendanceClassId.replace(/[^0-9]/g, '')) ||
              isClassMatch([attendanceClassId], s.classId)) &&
            s.status === 'active'
        )
      );
      const weekDays = getWeekDays(selectedWeekDate);
      const updatedDailyRecords = { ...(classAttendanceConfig?.dailyRecords || {}) };

      // Strictly only process past or today dates (<= todayStr)
      const eligibleDays = weekDays.filter(wDay => wDay.dateStr <= todayStr);

      eligibleDays.forEach(wDay => {
        // If day is a marked holiday, keep or set as holiday without marking students absent
        if (isDateHoliday(wDay.dateStr)) {
          const holInfo = getHolidayInfo(wDay.dateStr);
          updatedDailyRecords[wDay.dateStr] = {
            date: wDay.dateStr,
            presentStudentIds: [],
            absentStudentIds: [],
            statusMap: {},
            isHoliday: true,
            holidayReason: holInfo?.reason || 'Official Holiday / Non-Working Day',
            markedAt: new Date().toISOString(),
            markedBy: user?.name || 'Class Teacher',
          };
          return;
        }

        // If day was already marked & saved and not unlocked, keep its existing record
        if (isDateLocked(wDay.dateStr) && updatedDailyRecords[wDay.dateStr]) {
          return;
        }

        // If day is an alternate scheduled off-day and has no recorded attendance, skip creating an active record
        const activeClassName = classes.find(c => c.id === attendanceClassId)?.name || attendanceClassId;
        const isDayAltOff = isAlternateOffDay(activeClassName, wDay.dateStr);
        const existingRec = updatedDailyRecords[wDay.dateStr];
        const dayHasMarks = Boolean(
          existingRec &&
          !existingRec.isHoliday &&
          (existingRec.markedAt ||
            (existingRec.presentStudentIds && existingRec.presentStudentIds.length > 0) ||
            (existingRec.absentStudentIds && existingRec.absentStudentIds.length > 0) ||
            (existingRec.statusMap && Object.keys(existingRec.statusMap).length > 0))
        );
        if (isDayAltOff && !dayHasMarks) {
          return;
        }

        const presentStudentIds: string[] = [];
        const absentStudentIds: string[] = [];
        const statusMap: Record<string, boolean> = {};

        currentStudents.forEach(st => {
          const isPres = weeklyStatusMap[st.id]?.[wDay.dateStr] !== false;
          statusMap[st.id] = isPres;
          if (isPres) presentStudentIds.push(st.id);
          else absentStudentIds.push(st.id);
        });

        updatedDailyRecords[wDay.dateStr] = {
          date: wDay.dateStr,
          presentStudentIds,
          absentStudentIds,
          statusMap,
          markedAt: new Date().toISOString(),
          markedBy: user?.name || 'Class Teacher',
          isHoliday: false,
          isLocked: true,
          unlocked: false,
          editable: false,
          relockedAt: new Date().toISOString(),
        };
      });

      const savedDates = eligibleDays
        .filter(wDay => !isDateHoliday(wDay.dateStr, attendanceClassId))
        .map(wDay => wDay.dateStr);

      const updatedLockedDays: Record<string, boolean> = {
        ...(classAttendanceConfig?.lockedDays || {}),
      };
      savedDates.forEach(dStr => {
        updatedLockedDays[dStr] = true;
      });

      const updatedDaysAttended: Record<string, number> = {
        ...(classAttendanceConfig?.studentDaysAttended || {}),
      };
      const distinctDates = Object.keys(updatedDailyRecords);
      const workingDateKeys = distinctDates.filter(dKey => {
        const rec = updatedDailyRecords[dKey];
        if (!rec) return false;
        if (rec.isHoliday || isDateHoliday(dKey, attendanceClassId)) return false;
        if (isDateSunday(dKey) && !isSundayUnlockedForClass(dKey, attendanceClassId)) return false;
        const hasMarks =
          (rec.statusMap && Object.keys(rec.statusMap).length > 0) ||
          (rec.presentStudentIds && rec.presentStudentIds.length > 0) ||
          (rec.absentStudentIds && rec.absentStudentIds.length > 0) ||
          Boolean(rec.markedAt);
        return hasMarks;
      });
      const totalWorking = workingDateKeys.length;

      currentStudents.forEach(st => {
        let count = 0;
        workingDateKeys.forEach(dKey => {
          const rec = updatedDailyRecords[dKey];
          const isPres = Boolean(
            rec.statusMap?.[st.id] === true ||
            (rec.statusMap?.[st.id] as any) === 'Present' ||
            (rec.statusMap?.[st.id] as any) === 'P' ||
            (rec.presentStudentIds && rec.presentStudentIds.includes(st.id))
          );
          if (isPres) {
            count++;
          }
        });
        updatedDaysAttended[st.id] = count;
      });

      const updatedConfig: ClassAttendanceConfig = {
        classId: attendanceClassId,
        totalWorkingDays: totalWorking,
        studentDaysAttended: updatedDaysAttended,
        dailyRecords: updatedDailyRecords,
        lockedDays: updatedLockedDays,
        updatedAt: new Date().toISOString(),
      };

      // 1. Direct Firestore write to class attendance config
      await setDoc(doc(db, 'attendance', attendanceClassId), cleanForFirestore(updatedConfig), { merge: true });

      // 2. Direct Firestore writes for individual day docs
      for (const w of weekDays) {
        if (w.dateStr <= todayStr && w.dateStr >= ACADEMIC_YEAR_START_DATE && updatedDailyRecords[w.dateStr]) {
          await setDoc(doc(db, 'attendance', `${attendanceClassId}_${w.dateStr}`), cleanForFirestore({
            classId: attendanceClassId,
            ...updatedDailyRecords[w.dateStr],
            date: w.dateStr,
            isLocked: true,
            unlocked: false,
            editable: false,
            updatedAt: new Date().toISOString(),
          }), { merge: true }).catch(() => {});
        }
      }

      // 3. Update month's locked status documents (attendanceLocks)
      const monthsSet = new Set(savedDates.map(d => d.slice(0, 7)));
      for (const mKey of monthsSet) {
        const monthDates = savedDates.filter(d => d.startsWith(mKey));
        const monthLocks: Record<string, boolean> = {};
        monthDates.forEach(d => { monthLocks[d] = true; });
        try {
          await setDoc(doc(db, 'attendanceLocks', `${attendanceClassId}_${mKey}`), cleanForFirestore({
            classId: attendanceClassId,
            month: mKey,
            lockedDays: monthLocks,
            updatedAt: new Date().toISOString(),
          }), { merge: true });
        } catch {}
      }

      for (const st of currentStudents) {
        try {
          await setDoc(
            doc(db, 'students', st.id),
            cleanForFirestore({
              attendance: {
                daysAttended: updatedDaysAttended[st.id],
                totalWorkingDays: totalWorking,
              },
            }),
            { merge: true }
          );
        } catch {}
      }

      await fetchWithAuth(`/api/attendance/class/${attendanceClassId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedConfig),
      });

      const nowIso = new Date().toISOString();

      // 4. Resolve matching unlock requests in Firestore attendanceUnlockRequests
      await attendanceLocks.resolveUnlockRequests(savedDates, attendanceClassId, user?.name || 'Class Teacher');

      // 5. Resolve legacy attendanceEditRequests
      for (const dStr of savedDates) {
        const reqId = `${attendanceClassId}_${dStr}`;
        try {
          await setDoc(doc(db, 'attendanceEditRequests', reqId), {
            status: 'resolved',
            resolvedAt: nowIso,
          }, { merge: true });
          await fetchWithAuth(`/api/attendance-edit-requests/${reqId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'resolved' }),
          }).catch(() => {});
        } catch {}
      }

      // 6. Immediate React UI state update (Immediate restriction without page refresh)
      setClassAttendanceConfig(updatedConfig);
      setStudentDaysAttendedMap(updatedDaysAttended);
      setAttendanceTotalWorkingDays(totalWorking);

      // Lock all dates in this week
      setUnlockedDates(prev => {
        const copy = { ...prev };
        weekDays.forEach(w => {
          copy[w.dateStr] = false;
        });
        return copy;
      });

      // Immediately resolve local attendanceEditRequests state so isDateLocked reflects locked state right away
      setAttendanceEditRequests(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(k => {
          const r = next[k];
          if (r && (r.classId === attendanceClassId || !r.classId)) {
            const matches = savedDates.some(dStr =>
              r.date === dStr ||
              k.includes(dStr) ||
              (r.startDate && r.endDate && dStr >= r.startDate && dStr <= r.endDate)
            );
            if (matches) {
              next[k] = { ...r, status: 'completed', resolvedAt: nowIso };
            }
          }
        });
        return next;
      });

      setWeeklySaveSuccess(true);

      logAuditEvent({
        action: 'ATTENDANCE_MARKED',
        details: `Teacher ${user?.name || 'Teacher'} saved and synced weekly attendance for Class ${classes.find(c => c.id === attendanceClassId)?.name || attendanceClassId} (Week of ${selectedWeekDate}).`,
        currentUser: user,
        recordType: 'attendance',
        recordId: `${attendanceClassId}_week_${selectedWeekDate}`,
      }).catch(e => console.warn('Audit log error:', e));

      setTimeout(() => setWeeklySaveSuccess(false), 3500);
    } catch (err: any) {
      console.error('Error saving weekly attendance:', err);
      alert('Failed to save weekly attendance: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSavingWeekly(false);
    }
  };

  // Real-time duplicate detection across all students for Teacher portal
  const teacherAdmCounts = useMemo(() => {
    const counts = new Map<string, number>();
    allStudents.forEach(s => {
      const adm = String(s.admissionNo || '').trim().toLowerCase();
      if (adm) {
        counts.set(adm, (counts.get(adm) || 0) + 1);
      }
    });
    return counts;
  }, [allStudents]);

  const trimmedTeacherAdm = studentFormData.admissionNo.trim();
  const teacherDuplicateConflict = useMemo(() => {
    if (!trimmedTeacherAdm) return null;
    return allStudents.find(s => {
      if (editingStudent && (s.id === editingStudent.id || s.admissionNo === editingStudent.admissionNo)) {
        return false;
      }
      return String(s.admissionNo || '').trim().toLowerCase() === trimmedTeacherAdm.toLowerCase();
    });
  }, [trimmedTeacherAdm, allStudents, editingStudent]);

  const isTeacherAdmDuplicate = Boolean(teacherDuplicateConflict);

  // Student Edit Handlers in "My Class"
  const handleOpenEditStudent = (st: Student) => {
    setEditingStudent(st);
    const activeExamKey = selectedExamId || 'exam_half_yearly_2026_27';
    const currentReg =
      (st as any).examRegisterNos?.[activeExamKey] ||
      (st as any).examRegNo ||
      (st as any).regNo ||
      st.examRegisterNumbers?.[activeExamKey] ||
      Object.values((st as any).examRegisterNos || {})[0] ||
      Object.values(st.examRegisterNumbers || {})[0] ||
      '';

    setStudentFormData({
      nameEn: st.nameEn || '',
      nameMl: st.nameMl || '',
      rollNo: String(st.rollNo || ''),
      admissionNo: st.admissionNo || '',
      gender: normalizeGender(st.gender),
      dob: st.dob || '',
      schoolClass: st.schoolClass || '',
      parentNameEn: st.parentNameEn || '',
      parentPhone: st.parentPhone || '',
      examRegNo: String(currentReg || ''),
    });
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;

    const trimmedAdm = studentFormData.admissionNo.trim();
    if (!trimmedAdm) {
      alert('Admission Number is required.');
      return;
    }

    if (isTeacherAdmDuplicate) {
      alert(`Admission Number [${trimmedAdm}] already exists! Please use a unique Admission Number.`);
      return;
    }

    setIsSavingStudent(true);
    try {
      const trimmedExamReg = (studentFormData.examRegNo || '').trim();
      const activeExamId = selectedExamId || 'exam_half_yearly_2026_27';
      const updatedExamRegNos = {
        ...((editingStudent as any).examRegisterNos || {}),
        ...(editingStudent.examRegisterNumbers || {}),
        [activeExamId]: trimmedExamReg,
      };
      if (trimmedExamReg) {
        Object.keys(updatedExamRegNos).forEach(k => {
          updatedExamRegNos[k] = trimmedExamReg;
        });
      }

      const updateData: Partial<Student> & Record<string, any> = {
        nameEn: studentFormData.nameEn.trim(),
        nameMl: studentFormData.nameMl.trim() || studentFormData.nameEn.trim(),
        rollNo: Number(studentFormData.rollNo) || editingStudent.rollNo,
        admissionNo: trimmedAdm,
        gender: normalizeGender(studentFormData.gender),
        dob: studentFormData.dob.trim() || undefined,
        schoolClass: studentFormData.schoolClass.trim() || undefined,
        parentNameEn: studentFormData.parentNameEn.trim(),
        parentPhone: studentFormData.parentPhone.trim(),
        examRegNo: trimmedExamReg,
        regNo: trimmedExamReg,
        examRegisterNos: updatedExamRegNos,
        examRegisterNumbers: updatedExamRegNos,
        isRegNoLocked: true,
        updatedAt: new Date().toISOString(),
      };

      // 1. Persist to ALL storage locations:
      // - Firestore students/{id} and students/{admissionNo}
      // - Firestore examinations/{activeExamId} and exams/{activeExamId}
      // - Firestore settings
      // - Immediate localStorage cache
      await firestoreSync.persistStudentExamRegisterNumber(
        editingStudent.id,
        editingStudent.admissionNo,
        activeExamId,
        trimmedExamReg,
        updateData
      );

      // Mutate editingStudent directly
      Object.assign(editingStudent, updateData);

      // 2. Re-sequence class roll numbers strictly (Boys A-Z first: 1, 2, 3..., then Girls A-Z)
      // NEVER auto-recalculate or overwrite existing exam register numbers!
      const targetClassId = editingStudent.classId;
      const updatedList = allStudents.map(s => {
        if (s.id === editingStudent.id || (editingStudent.admissionNo && s.admissionNo === editingStudent.admissionNo)) {
          return {
            ...s,
            ...updateData,
            examRegNo: trimmedExamReg,
            regNo: trimmedExamReg,
            examRegisterNos: updatedExamRegNos,
            examRegisterNumbers: updatedExamRegNos,
            isRegNoLocked: true,
          };
        }
        return s;
      });

      const classStudents = updatedList.filter(s => s.classId === targetClassId);
      const resequencedClass = assignClassSequentialRollNumbers(classStudents, activeExamId);

      // Retain explicitly edited examRegNo for the edited student
      const finalResequencedClass = resequencedClass.map(st => {
        if (st.id === editingStudent.id || (editingStudent.admissionNo && st.admissionNo === editingStudent.admissionNo)) {
          return {
            ...st,
            ...updateData,
            examRegNo: trimmedExamReg,
            regNo: trimmedExamReg,
            examRegisterNos: updatedExamRegNos,
            examRegisterNumbers: updatedExamRegNos,
            isRegNoLocked: true,
            updatedAt: new Date().toISOString(),
          };
        }
        return st;
      });

      // Persist any other class students whose roll numbers changed to Firestore
      for (const st of finalResequencedClass) {
        if (st.id !== editingStudent.id && st.admissionNo !== editingStudent.admissionNo) {
          try {
            await setDoc(doc(db, 'students', st.id), cleanForFirestore(st), { merge: true });
            if (st.admissionNo && st.admissionNo !== st.id) {
              await setDoc(doc(db, 'students', st.admissionNo), cleanForFirestore(st), { merge: true }).catch(() => {});
            }
          } catch (e) {
            console.warn('Firestore sync resequenced student error:', e);
          }
        }
      }

      const resequencedMap = new Map(finalResequencedClass.map(s => [s.id, s]));
      const finalAllStudents = updatedList.map(s => {
        if (s.id === editingStudent.id || (editingStudent.admissionNo && s.admissionNo === editingStudent.admissionNo)) {
          return {
            ...s,
            ...updateData,
            examRegNo: trimmedExamReg,
            regNo: trimmedExamReg,
            examRegisterNos: updatedExamRegNos,
            examRegisterNumbers: updatedExamRegNos,
            isRegNoLocked: true,
          };
        }
        return resequencedMap.get(s.id) || s;
      });

      // 3. Local API sync
      await fetchWithAuth(`/api/students/${editingStudent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });

      // 4. React state update - mutate and set state immediately so the card updates instantly without page reload
      setAllStudents(sortStudentsBoysFirst(finalAllStudents));

      // Broadcast events so Parent Portal, Marks Entry, and Principal Portal update immediately
      window.dispatchEvent(new CustomEvent('madrasa_students_updated', { detail: finalAllStudents }));
      window.dispatchEvent(new CustomEvent('madrasa_marks_updated'));

      logAuditEvent({
        action: 'STUDENT_UPDATED',
        details: `Teacher ${user?.name || 'Class Teacher'} updated student profile for ${editingStudent.nameEn} (Adm: ${editingStudent.admissionNo}, Gender: ${studentFormData.gender}, RegNo: ${trimmedExamReg || 'N/A'}).`,
        currentUser: user,
        recordType: 'student',
        recordId: editingStudent.id,
      }).catch(e => console.warn('Audit log error:', e));

      setEditingStudent(null);
    } catch (err: any) {
      alert('Failed to update student: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSavingStudent(false);
    }
  };

  // News Publish Handler (Teacher creating news into Firestore 'news' collection)
  const handlePublishNews = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsFormData.titleEn.trim()) {
      alert('Please enter a title for the announcement.');
      return;
    }
    setIsSavingNews(true);
    try {
      const newId = `news_${Date.now()}`;
      const now = new Date();
      const dateFormatted = `${now.getDate()} ${now.toLocaleString('default', { month: 'short' })} ${now.getFullYear()}`;

      const newNewsItem: NewsItem = {
        id: newId,
        titleEn: newsFormData.titleEn.trim(),
        titleMl: newsFormData.titleMl.trim() || newsFormData.titleEn.trim(),
        categoryEn: newsFormData.categoryEn,
        categoryMl: newsFormData.categoryMl,
        date: dateFormatted,
        author: user?.name || 'Class Teacher',
        summaryEn: newsFormData.summaryEn.trim() || newsFormData.titleEn.trim(),
        summaryMl: newsFormData.summaryMl.trim() || newsFormData.titleMl.trim() || newsFormData.titleEn.trim(),
        contentEn: newsFormData.contentEn.trim() || newsFormData.summaryEn.trim() || newsFormData.titleEn.trim(),
        contentMl: newsFormData.contentMl.trim() || newsFormData.summaryMl.trim() || newsFormData.titleMl.trim() || newsFormData.titleEn.trim(),
        isImportant: newsFormData.isImportant,
        createdAt: now.toISOString(),
      };

      // 1. Direct write to Firestore 'news' collection
      await setDoc(doc(db, 'news', newId), cleanForFirestore(newNewsItem), { merge: true });

      // 2. State update
      setNewsList(prev => [newNewsItem, ...prev]);

      // 3. Reset form & close modal
      setNewsFormData({
        titleEn: '',
        titleMl: '',
        categoryEn: 'Academic',
        categoryMl: 'പരീക്ഷാ നിർവ്വഹണം',
        summaryEn: '',
        summaryMl: '',
        contentEn: '',
        contentMl: '',
        isImportant: false,
      });
      setShowCreateNewsModal(false);
      alert('Announcement published successfully! It is now visible to all parents and teachers.');
    } catch (err: any) {
      console.error('Error publishing news:', err);
      alert('Failed to publish announcement: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSavingNews(false);
    }
  };

  const selectedExam = examinations.find(e => e.id === selectedExamId);

  // In-charge class students & subjects
  const inChargeStudents = inChargeClass
    ? sortStudentsBoysFirst(
        allStudents.filter(
          s =>
            (s.classId === inChargeClass.id ||
              s.class === inChargeClass.name ||
              (s.classId && inChargeClass.id && s.classId.replace(/[^0-9]/g, '') === inChargeClass.id.replace(/[^0-9]/g, '')) ||
              isClassMatch([inChargeClass.id], s.classId)) &&
            s.status === 'active'
        )
      ).map((s, idx) => ({
        ...s,
        rollNo: s.rollNo || idx + 1,
      }))
    : [];
  const inChargeSubjects = inChargeClass
    ? subjects.filter(s => s.applicableClasses.includes(inChargeClass.numericGrade))
    : [];

  // Filtered Special Fee Payments for Teacher's Class Only
  const classSpecialFeePayments = useMemo(() => {
    if (!inChargeClass) return [];
    const inChargeIds = new Set(inChargeStudents.map(s => s.id));
    const inChargeAdms = new Set(inChargeStudents.map(s => String(s.admissionNo || '').trim().toLowerCase()));

    return allFeePayments.filter(p => {
      // 1. Must belong to Special Fees
      const isSpecial =
        p.feeCategory === 'special' ||
        Boolean(p.specialFeeType) ||
        (p.specialFeeAmount > 0 && !p.tuitionFeeAmount && !p.admissionFee);
      if (!isSpecial) return false;

      // 2. Student must belong to Teacher's designated class
      const matchesStudent =
        inChargeIds.has(p.studentId) ||
        (p.admissionNo && inChargeAdms.has(String(p.admissionNo).trim().toLowerCase()));
      const matchesClass =
        p.classId === inChargeClass.id ||
        p.className === inChargeClass.name ||
        (p.className && p.className.toLowerCase() === inChargeClass.name.toLowerCase());

      return matchesStudent || matchesClass;
    }).sort((a, b) => new Date(b.date || b.createdAt || 0).getTime() - new Date(a.date || a.createdAt || 0).getTime());
  }, [allFeePayments, inChargeClass, inChargeStudents]);

  const totalSpecialFeesCollected = useMemo(() => {
    return classSpecialFeePayments.reduce((acc, p) => {
      const amt = Number(p.specialFeeAmount || p.totalAmount) || 0;
      return acc + amt;
    }, 0);
  }, [classSpecialFeePayments]);

  const studentPaidMonthsMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    allFeePayments.forEach(p => {
      if (p.studentId && Array.isArray(p.tuitionFeeMonths)) {
        if (!map[p.studentId]) {
          map[p.studentId] = [];
        }
        p.tuitionFeeMonths.forEach(m => {
          if (!map[p.studentId].includes(m)) {
            map[p.studentId].push(m);
          }
        });
      }
    });
    return map;
  }, [allFeePayments]);

  // Handle Recording Special Fee by Class Teacher
  const handleRecordSpecialFee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inChargeClass) {
      alert('You must be assigned as a Class In-Charge to record Special Fees.');
      return;
    }
    if (!specialFeeStudentId) {
      alert('Please select a student from your class.');
      return;
    }
    const student = inChargeStudents.find(s => s.id === specialFeeStudentId);
    if (!student) {
      alert('Selected student not found in your class roster.');
      return;
    }
    const amt = Number(specialFeeAmount);
    if (!amt || amt <= 0) {
      alert('Please enter a valid amount.');
      return;
    }
    if (!specialFeeReceiptNo.trim()) {
      alert('Please enter a Receipt Number.');
      return;
    }

    setIsSubmittingSpecialFee(true);
    try {
      const payload: Partial<FeePayment> = {
        date: specialFeeDate,
        studentId: student.id,
        studentName: student.nameEn,
        admissionNo: student.admissionNo,
        classId: inChargeClass.id,
        className: inChargeClass.name,
        receiptNo: specialFeeReceiptNo.trim(),
        feeCategory: 'special',
        specialFeeType: specialFeeType,
        admissionFee: 0,
        hasAdmissionFee: false,
        tuitionFeeMonths: [],
        tuitionFeeAmount: 0,
        specialFeeComponents: { [specialFeeType]: amt },
        specialFeeAmount: amt,
        donationAmount: specialFeeType === 'Donation/Other' ? amt : 0,
        totalAmount: amt,
        amountInWords: numberToWords(amt),
        notes: specialFeeNotes,
        paymentMode: specialFeePaymentMode,
        paymentMethod: specialFeePaymentMode,
        collectedBy: user?.name || 'Class Teacher',
      };

      const res = await fetchWithAuth('/api/fees/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to record special fee');
      }

      const created: FeePayment = await res.json();

      // Mirror sync to Firestore (fee_payments and special_receipts)
      try {
        await firestoreSync.syncFeePayment(created);
      } catch (fErr) {
        console.warn('Firestore payment mirror write error:', fErr);
      }

      // Propose and sync next auto-increment sequence
      const currentNum = parseInt(specialFeeReceiptNo.replace(/\D/g, ''), 10) || 1;
      const nextSpecial = currentNum + 1;
      const nextSpecialStr = nextSpecial < 10 ? `0${nextSpecial}` : String(nextSpecial);
      setSpecialFeeReceiptNo(nextSpecialStr);

      firestoreSync.syncReceiptSequences({
        tuitionReceiptNo: 4458,
        specialReceiptNo: nextSpecial,
      });

      fetchWithAuth('/api/fees/receipt-sequences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specialReceiptNo: nextSpecial }),
      }).catch(() => {});

      logAuditEvent({
        action: 'SPECIAL_FEE_COLLECTED',
        details: `Teacher ${user?.name} collected Special Fee of ₹${amt} (${specialFeeType}) for ${student.nameEn} (Adm: ${student.admissionNo}, ${inChargeClass.name}). Receipt #${specialFeeReceiptNo}.`,
        currentUser: user,
        recordType: 'fee_payment',
        recordId: created.id,
      }).catch(() => {});

      // Update local state
      setAllFeePayments(prev => [created, ...prev.filter(p => p.id !== created.id)]);
      setSpecialFeeNotes('');
      setSpecialFeeStudentId('');
      setShowSpecialFeeModal(false);
      // Open identical printable receipt
      setActiveSpecialReceipt(created);
    } catch (err: any) {
      alert(err.message || 'Error recording special fee payment');
    } finally {
      setIsSubmittingSpecialFee(false);
    }
  };

  // Consolidated class marksheet calculations with dense ranking
  const classMarksheetData = useMemo(() => {
    if (!inChargeClass || inChargeStudents.length === 0) return [];

    const classGrade = inChargeClass?.numericGrade;
    const isClass2or3 =
      inChargeClass?.name === 'Class 2' ||
      inChargeClass?.name === 'Class 3' ||
      classGrade === 2 ||
      classGrade === 3 ||
      String(inChargeClass?.id).replace(/\D/g, '') === '2' ||
      String(inChargeClass?.id).replace(/\D/g, '') === '3';

    const getSubjectMax = (s: SubjectItem) => {
      const comps =
        (classGrade && s.classComponentOverrides?.[classGrade]) ||
        (s.defaultComponents && s.defaultComponents.length > 0 ? s.defaultComponents : []);
      const compSum = comps.reduce((acc, c) => acc + (c.maxMarks || 0), 0);
      return (s as any).maxMarks || (compSum > 0 ? compSum : 50);
    };
    const expectedMax = inChargeSubjects.reduce((acc, s) => acc + getSubjectMax(s), 0) || 400;

    const list = inChargeStudents.map(student => {
      let studentObtained = 0;
      let hasAbsent = false;
      let anyMarkEntered = false;
      let hasFailedComponent = false;
      let hasWithheld = false;

      const subjectMarksMap: Record<
        string,
        {
          value: number | 'AB' | '—';
          te?: number | string;
          ce?: number | string;
          tot?: number | string;
          isAbsent: boolean;
          max: number;
          isFail: boolean;
          isWithheld: boolean;
        }
      > = {};

      inChargeSubjects.forEach(sub => {
        const ms = markSheets.find(
          m => m.examinationId === selectedExamId && m.classId === inChargeClass.id && m.subjectId === sub.id
        );
        const max = getSubjectMax(sub);

        // CONDITIONAL MARK RENDERING BASED ON STATUS:
        // Exclude in-progress / draft marks. Must be formally submitted ('submitted' | 'approved' | 'locked').
        const isFormallySubmitted = Boolean(
          ms && (ms.status === 'submitted' || ms.status === 'approved' || ms.status === 'locked')
        );

        if (!isFormallySubmitted) {
          // If status is 'draft' (or not submitted/approved/locked):
          // 1. Force displayed values for TE, CE, and Tot to be 0 for all students in that subject.
          // 2. Override absent flag: display 0 even if the teacher has temporarily toggled isAbsent.
          // 3. Draft marks contribute 0 to studentObtained, and do not trigger absent, fail, or withheld.
          subjectMarksMap[sub.id] = {
            value: 0,
            te: 0,
            ce: 0,
            tot: 0,
            isAbsent: false,
            max,
            isFail: false,
            isWithheld: false,
          };
          return;
        }

        const entry = ms?.studentMarks?.[student.id];

        if (!entry) {
          subjectMarksMap[sub.id] = { value: '—', te: '—', ce: '—', tot: '—', isAbsent: false, max, isFail: false, isWithheld: false };
        } else if (entry.isAbsent) {
          hasAbsent = true;
          anyMarkEntered = true;
          subjectMarksMap[sub.id] = { value: 'AB', te: 'AB', ce: 'AB', tot: 'AB', isAbsent: true, max, isFail: true, isWithheld: false };
        } else {
          anyMarkEntered = true;
          const compMarks = entry.componentMarks || (entry as any).marks || {};
          const isSubTilawah =
            sub.id === 'sub_tilawah' ||
            sub.code === 'TIL' ||
            (sub.nameEn && /tilaw/i.test(sub.nameEn)) ||
            (sub.nameMl && sub.nameMl.includes('തിലാവ'));

          const configuredComponents =
            (classGrade && sub.classComponentOverrides?.[classGrade]) ||
            (sub.defaultComponents && sub.defaultComponents.length > 0
              ? sub.defaultComponents
              : [
                  { componentKey: 'written', labelEn: 'OMR', maxMarks: 20 },
                  { componentKey: 'oral', labelEn: 'OCR', maxMarks: 20 },
                  { componentKey: 'ce', labelEn: 'CIE', maxMarks: 10 },
                ]);

          let writtenTotal = 0;
          let maxWritten = 0;
          let cieMark = 0;
          let maxCie = 0;
          let hasCie = false;

          configuredComponents.forEach((c, idx) => {
            const k = (c.componentKey || '').toLowerCase();
            const val = compMarks[c.componentKey] ?? (entry as any)[c.componentKey] ?? (entry as any).marks?.[c.componentKey];
            const numVal = (val as any) !== '' && val !== undefined && !isNaN(Number(val)) ? Number(val) : 0;
            const isCie =
              k === 'ce' ||
              k === 'diary' ||
              k.includes('ce') ||
              k.includes('cie') ||
              (configuredComponents.length === 3 && idx === 2);

            if (isCie) {
              cieMark += numVal;
              maxCie += c.maxMarks || 10;
              if ((val as any) !== '' && val !== undefined) hasCie = true;
            } else {
              writtenTotal += numVal;
              maxWritten += c.maxMarks || 20;
            }
          });

          // CRITICAL: Synchronize Tilawah TE calculation logic for Classes 2 & 3
          // In Classes 2 & 3, Tilawah TE must equal the primary exam component (e.g. tilawah) PLUS the tilawati component.
          // For Classes 4 and above, strictly preserve the existing logic (where Tilawah TE incorporates 'Tajweed').
          if (isClass2or3 && isSubTilawah) {
            const tilawahRaw =
              compMarks['tilawah'] ??
              compMarks['oral'] ??
              compMarks['written'] ??
              (entry as any).marks?.tilawah ??
              (entry as any).marks?.oral ??
              (entry as any).tilawah;
            const tilawatiRaw =
              compMarks['tilawati'] ??
              (entry as any).marks?.tilawati ??
              (entry as any).tilawati;

            const tilawahNum =
              (tilawahRaw as any) !== '' && tilawahRaw !== undefined && !isNaN(Number(tilawahRaw))
                ? Number(tilawahRaw)
                : 0;
            const tilawatiNum =
              (tilawatiRaw as any) !== '' && tilawatiRaw !== undefined && !isNaN(Number(tilawatiRaw))
                ? Number(tilawatiRaw)
                : 0;

            // TE = primary component (tilawah) + tilawati
            writtenTotal = tilawahNum + tilawatiNum;
            maxWritten = 40; // 30 (oral/tilawah) + 10 (tilawati)

            const ceRaw = compMarks['ce'] ?? (entry as any).marks?.ce ?? (entry as any).ce;
            if ((ceRaw as any) !== '' && ceRaw !== undefined && !isNaN(Number(ceRaw))) {
              cieMark = Number(ceRaw);
              hasCie = true;
            }
            if (maxCie === 0) maxCie = 10;
          }

          // Subject Grand Total = writtenTotal + CIE
          const hasComponentEntries =
            Object.keys(compMarks).length > 0 ||
            (isClass2or3 && isSubTilawah && (compMarks['tilawah'] !== undefined || compMarks['tilawati'] !== undefined || (entry as any).marks?.tilawati !== undefined));

          const total = hasComponentEntries
            ? writtenTotal + cieMark
            : typeof entry.subjectTotal === 'number' && !isNaN(entry.subjectTotal)
            ? entry.subjectTotal
            : 0;

          studentObtained += total;

          // 35% passing mark applies STRICTLY to writtenTotal out of maxWritten (excluding CIE)
          const isFail = maxWritten > 0 ? writtenTotal < maxWritten * 0.35 : total < max * 0.35;

          // Withheld Status (CIE = 0): If a student has CIE marks equal to 0 (or unsubmitted internal work) in any subject
          const isSubWithheld = maxCie > 0 && ((hasCie && cieMark === 0) || !hasCie || (entry as any).hasMissingCe);

          if (isFail) {
            hasFailedComponent = true;
          }
          if (isSubWithheld) {
            hasWithheld = true;
          }

          subjectMarksMap[sub.id] = {
            value: total,
            te: hasComponentEntries ? writtenTotal : '—',
            ce: hasCie ? cieMark : (hasComponentEntries ? 0 : '—'),
            tot: hasComponentEntries ? total : '—',
            isAbsent: false,
            max,
            isFail,
            isWithheld: isSubWithheld,
          };
        }
      });

      const percentage = expectedMax > 0 ? ((studentObtained / expectedMax) * 100).toFixed(2) : '0.00';
      const fallbackTotalWorking = classAttendanceConfig?.totalWorkingDays ?? attendanceTotalWorkingDays ?? 88;
      const fallbackDaysAttended =
        studentDaysAttendedMap[student.id] ??
        student.attendance?.daysAttended ??
        (student as any).daysAttended ??
        86;

      const activeConfig = classAttendanceConfig || allAttendanceConfigs.find(c => c.classId === inChargeClass?.id || c.classId === inChargeClass?.id.replace(/\D/g, ''));
      const cutoffDate = selectedExam?.attendanceCutoffDate ? selectedExam.attendanceCutoffDate.trim() : '';

      let totalWorking = fallbackTotalWorking;
      let daysAttended = fallbackDaysAttended;

      if (cutoffDate && activeConfig?.dailyRecords) {
        const records = Object.values(activeConfig.dailyRecords).filter(
          rec =>
            rec &&
            rec.date &&
            rec.date <= cutoffDate &&
            !rec.isHoliday &&
            (rec as any).status !== 'OFF' &&
            (rec as any).status !== 'holiday'
        );
        if (records.length > 0) {
          totalWorking = records.length;
          let attended = 0;
          records.forEach(rec => {
            if (rec.statusMap && rec.statusMap[student.id] !== undefined) {
              if (rec.statusMap[student.id]) attended++;
            } else if (rec.presentStudentIds && rec.presentStudentIds.includes(student.id)) {
              attended++;
            } else if (!rec.absentStudentIds?.includes(student.id)) {
              attended++;
            }
          });
          daysAttended = attended;
        }
      }

      let status: 'Passed' | 'Needs Imp' | 'Withheld' | 'Absent' | 'Pending' = 'Passed';
      if (hasAbsent) {
        status = 'Absent';
      } else if (hasWithheld) {
        status = 'Withheld';
      } else if (hasFailedComponent || Number(percentage) < 35) {
        status = 'Needs Imp';
      } else if (!anyMarkEntered) {
        status = 'Pending';
      }

      return {
        student,
        subjectMarksMap,
        studentObtained,
        expectedMax,
        percentage,
        daysAttended,
        totalWorking,
        hasAbsent,
        hasWithheld,
        status,
        isQualifiedForRank: anyMarkEntered && !hasAbsent && !hasWithheld && status === 'Passed',
      };
    });

    // Assign Dense Ranks: ties share identical rank without skipping rank numbers
    const qualified = list
      .filter(item => item.isQualifiedForRank)
      .sort((a, b) => b.studentObtained - a.studentObtained);

    const rankMap = new Map<string, number>();
    let currentDenseRank = 1;
    for (let i = 0; i < qualified.length; i++) {
      if (i > 0 && qualified[i].studentObtained < qualified[i - 1].studentObtained) {
        currentDenseRank++;
      }
      rankMap.set(qualified[i].student.id, currentDenseRank);
    }

    return list.map(item => {
      const rank = rankMap.get(item.student.id);
      let rankOrStatusText = item.status as string;
      let badgeClass = 'bg-slate-100 text-slate-700';

      if (rank !== undefined) {
        rankOrStatusText = `Rank ${rank}`;
        badgeClass =
          rank === 1
            ? 'bg-amber-100 text-amber-900 border border-amber-300 font-bold'
            : rank === 2
            ? 'bg-slate-200 text-slate-800 border border-slate-300 font-bold'
            : rank === 3
            ? 'bg-amber-50 text-amber-800 border border-amber-200 font-bold'
            : 'bg-emerald-100 text-emerald-800 font-semibold';
      } else if (item.status === 'Absent') {
        rankOrStatusText = 'Absent';
        badgeClass = 'bg-rose-100 text-rose-800 border border-rose-200 font-bold';
      } else if (item.status === 'Withheld') {
        rankOrStatusText = 'Withheld';
        badgeClass = 'bg-amber-100 text-amber-900 border border-amber-300 font-bold';
      } else if (item.status === 'Needs Imp') {
        rankOrStatusText = 'Need Improvement';
        badgeClass = 'bg-rose-100 text-rose-800 border border-rose-200 font-bold';
      } else {
        rankOrStatusText = '—';
        badgeClass = 'bg-slate-100 text-slate-500 font-medium';
      }

      return {
        ...item,
        rank,
        rankOrStatusText,
        badgeClass,
      };
    });
  }, [
    inChargeClass,
    inChargeStudents,
    inChargeSubjects,
    markSheets,
    selectedExamId,
    selectedExam,
    classAttendanceConfig,
    allAttendanceConfigs,
    attendanceTotalWorkingDays,
    studentDaysAttendedMap,
  ]);

  // Mark Entry Segregation: "My Class" (In-charge) vs "Teaching Subjects" (Consolidated all classes including own class)
  const myClassAssignments = assignments.filter(a => {
    if (!inChargeClass) return false;
    const cls = classes.find(c => c.id === a.classId);
    return (
      a.classId === inChargeClass.id ||
      (inChargeClassId && a.classId === inChargeClassId) ||
      (cls && cls.numericGrade === inChargeClass.numericGrade)
    );
  });

  // Consolidated Teaching Subjects across all classes (including own designated class)
  const teachingSubjects = useMemo(() => {
    const seen = new Set<string>();
    const list: TeacherAssignment[] = [];
    for (const a of assignments) {
      const key = `${a.classId}_${a.subjectId}`;
      if (!seen.has(key)) {
        seen.add(key);
        list.push(a);
      }
    }
    return list;
  }, [assignments]);

  const otherClassAssignments = teachingSubjects; // backwards-compatible alias

  // Effective fee class
  const activeFeeClass = classes.find(c => c.id === feeClassId) || inChargeClass || classes[0];
  const feeClassStudents = activeFeeClass
    ? sortStudentsBoysFirst(allStudents.filter(s => s.classId === activeFeeClass.id && s.status === 'active')).map((s, idx) => ({
        ...s,
        rollNo: idx + 1,
      }))
    : [];

  if (activeEntry) {
    return (
      <MarkEntryScreen
        classId={activeEntry.classId}
        subjectId={activeEntry.subjectId}
        examinationId={activeEntry.examinationId}
        onBack={() => {
          setActiveEntry(null);
          loadData();
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20 text-slate-500">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-700"></div>
        <span className="ml-3 font-medium">Loading teacher portal...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-emerald-900 to-emerald-800 text-white rounded-2xl p-6 shadow-sm print:hidden no-print">
        <div className="text-center font-serif text-emerald-300 text-base mb-3" dir="rtl">
          أهلاً وسهلاً
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl font-bold font-serif">
                {isMl && user?.nameMl ? user.nameMl : user?.name}
              </h1>
              {inChargeClass && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-400 text-amber-950 flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5" />
                  {inChargeClass.name} In-Charge
                </span>
              )}
            </div>
            <p className="text-xs text-emerald-200 mt-1">
              {isMl ? 'ടീച്ചർ പോർട്ടൽ • അൽ മദ്റസത്തുൽ ഇസ്ലാമിയ്യ പള്ളിക്കുത്ത്' : 'Teacher Portal • Al-Madrasathul Islamiya Pallikkuth'}
            </p>
            <p className="text-[11px] text-emerald-300 font-medium">
              Islamic Education &amp; Digital Learning
            </p>
          </div>

          {/* Exam Selector */}
          <div className="bg-white/10 backdrop-blur-xs p-3 rounded-xl border border-white/20">
            <label className="block text-[11px] font-bold text-emerald-200 uppercase tracking-wider mb-1">
              {t.examination}
            </label>
            <select
              value={selectedExamId}
              onChange={e => handleExamChange(e.target.value)}
              className="bg-emerald-950 text-white text-xs font-semibold px-3 py-1.5 rounded-lg border border-emerald-700 focus:outline-none cursor-pointer"
            >
              {examinations.map(e => (
                <option key={e.id} value={e.id}>
                  {isMl ? e.nameMl : e.nameEn}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Primary Tabs in EXACT STRICT ORDER: 1. Home, 2. My Class, 3. Mark Entry, 4. Attendance, 5. Fees, 6. News, 7. Notification, 8. Contact, 9. About */}
      <div
        {...navScrollProps}
        className="flex border-b border-slate-200 gap-1.5 sm:gap-2 text-xs font-bold overflow-x-auto no-scrollbar pb-1 cursor-grab active:cursor-grabbing select-none print:hidden no-print"
      >
        {/* 1. Home */}
        <button
          type="button"
          onClick={() => setActiveTab('home')}
          className={`px-3.5 py-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
            activeTab === 'home'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200'
          }`}
        >
          <Home className="w-4 h-4" />
          <span>Home</span>
        </button>

        {/* 2. My Class */}
        <button
          type="button"
          onClick={() => setActiveTab('my_class')}
          className={`px-3.5 py-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
            activeTab === 'my_class'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200'
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>My Class</span>
          {inChargeClass ? (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                activeTab === 'my_class' ? 'bg-emerald-950/60 text-emerald-200' : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {inChargeClass.name}
            </span>
          ) : (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 text-slate-600">
              —
            </span>
          )}
        </button>

        {/* 3. Mark Entry */}
        <button
          type="button"
          onClick={() => setActiveTab('mark_entry')}
          className={`px-3.5 py-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
            activeTab === 'mark_entry'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Mark Entry</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              activeTab === 'mark_entry' ? 'bg-emerald-950/60 text-emerald-200' : 'bg-slate-200 text-slate-700'
            }`}
          >
            {assignments.length}
          </span>
        </button>

        {/* 4. Attendance */}
        <button
          type="button"
          onClick={() => setActiveTab('attendance')}
          className={`px-3.5 py-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
            activeTab === 'attendance'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200'
          }`}
        >
          <CalendarCheck className="w-4 h-4" />
          <span>Attendance</span>
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        </button>

        {/* 5. Fees (Consolidated Single Tab) */}
        <button
          type="button"
          onClick={() => setActiveTab('fees')}
          className={`px-3.5 py-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
            activeTab === 'fees'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>{inChargeClass ? 'Class Fees' : 'Fees'}</span>
          {inChargeClass && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === 'fees'
                  ? 'bg-emerald-950 text-emerald-200'
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {inChargeClass.name}
            </span>
          )}
        </button>

        {/* 6. News */}
        <button
          type="button"
          onClick={() => setActiveTab('news')}
          className={`px-3.5 py-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
            activeTab === 'news'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200'
          }`}
        >
          <Newspaper className="w-4 h-4" />
          <span>News</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              activeTab === 'news' ? 'bg-emerald-950/60 text-emerald-200' : 'bg-slate-200 text-slate-700'
            }`}
          >
            {newsList.length}
          </span>
        </button>

        {/* 7. Notification */}
        <button
          type="button"
          onClick={() => setActiveTab('notification')}
          className={`px-3.5 py-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
            activeTab === 'notification'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200'
          }`}
        >
          <Bell className="w-4 h-4" />
          <span>Notification</span>
          {notifications.some(n => !n.read) && (
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
          )}
        </button>

        {/* 8. Contact */}
        <button
          type="button"
          onClick={() => setActiveTab('contact')}
          className={`px-3.5 py-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
            activeTab === 'contact'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200'
          }`}
        >
          <PhoneCall className="w-4 h-4" />
          <span>Contact</span>
        </button>

        {/* 9. About */}
        <button
          type="button"
          onClick={() => setActiveTab('about')}
          className={`px-3.5 py-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
            activeTab === 'about'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200'
          }`}
        >
          <Sparkles className="w-4 h-4 text-amber-300" />
          <span>About</span>
        </button>
      </div>

      {/* =========================================================================
          TAB 1: HOME (Teacher Overview Dashboard & Shortcuts)
         ========================================================================= */}
      {activeTab === 'home' && (
        <div className="space-y-6">
          {/* Welcome Overview Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800">
                    Faculty Portal
                  </span>
                  <span className="text-slate-400 text-xs">•</span>
                  <span className="text-xs text-slate-500 font-mono">Academic Year 2026–2027</span>
                </div>
                <div className="flex flex-col mb-2">
                  <span className="text-lg md:text-xl font-medium text-gray-600">
                    {language === 'ML' ? 'അസ്സലാമു അലൈക്കും,' : 'Assalamu Alaikum,'}
                  </span>
                  <span className={`text-2xl md:text-3xl font-bold text-gray-900 ${language === 'ML' ? 'font-ml' : ''}`}>
                    {language === 'ML' && teacher?.nameMl ? teacher.nameMl : (teacher?.name || 'Usthad')}
                  </span>
                </div>
                <p className={`text-xs text-slate-500 mt-1 leading-relaxed max-w-2xl ${lang?.toLowerCase() === 'ml' ? 'font-ml' : ''}`}>
                  {lang?.toLowerCase() === 'ml'
                    ? 'പോർട്ടലിലേക്ക് സ്വാഗതം! സാങ്കേതികവിദ്യ നിങ്ങളുടെ ദൈനംദിന കാര്യങ്ങൾ എളുപ്പമാക്കട്ടെ. അതുവഴി ലാഭിക്കുന്ന സമയം, നിങ്ങളുടെ മഹത്തായ ഉത്തരവാദിത്വമായ വിദ്യാർത്ഥികളെ വാർത്തെടുക്കുന്നതിനായി പൂർണ്ണമായും വിനിയോഗിക്കാൻ നിങ്ങൾക്ക് കഴിയും.'
                    : 'Welcome to your portal. Let technology handle the routine tasks and save your valuable time, empowering you to dedicate yourself to your noble responsibility of shaping young minds.'}
                </p>
              </div>

              {inChargeClass && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 sm:text-right shrink-0">
                  <span className="text-[10px] uppercase font-bold text-emerald-700 block">Class In-Charge</span>
                  <span className="text-sm font-bold text-emerald-950 mt-0.5 block">
                    {(inChargeClass.name || '').replace(/\s*\([^)]*\)/g, '').trim()}
                  </span>
                  <span className="text-xs text-emerald-800 font-mono font-medium block">
                    {inChargeStudents.length} Students Enrolled
                  </span>
                </div>
              )}
            </div>

            {/* 4 Key KPI Metrics Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: My Class */}
              <div className="bg-gradient-to-br from-emerald-50/70 to-teal-50/50 rounded-xl p-4 border border-emerald-100 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold uppercase text-emerald-800">
                      My Class Roster
                    </span>
                    <Shield className="w-4 h-4 text-emerald-700" />
                  </div>
                  <div className="text-2xl font-black font-mono text-emerald-950">
                    {inChargeStudents.length}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {inChargeClass ? `${inChargeClass.name} Active Students` : 'No Class In-charge assigned'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('my_class')}
                  className="mt-4 flex items-center justify-between text-xs font-bold text-emerald-800 hover:text-emerald-950 pt-2 border-t border-emerald-200/60 cursor-pointer"
                >
                  <span>Open Student Grid</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Card 2: Mark Entry */}
              <div className="bg-gradient-to-br from-blue-50/70 to-cyan-50/50 rounded-xl p-4 border border-blue-100 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold uppercase text-blue-800">
                      Assigned Subjects
                    </span>
                    <BookOpen className="w-4 h-4 text-blue-700" />
                  </div>
                  <div className="text-2xl font-black font-mono text-blue-950">
                    {assignments.length}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {selectedExam?.nameEn || 'Active Exam'} marks entry
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('mark_entry')}
                  className="mt-4 flex items-center justify-between text-xs font-bold text-blue-800 hover:text-blue-950 pt-2 border-t border-blue-200/60 cursor-pointer"
                >
                  <span>Enter / Edit Marks</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Card 3: Attendance */}
              <div className="bg-gradient-to-br from-purple-50/70 to-violet-50/50 rounded-xl p-4 border border-purple-100 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold uppercase text-purple-800">
                      Morning Attendance
                    </span>
                    <CalendarCheck className="w-4 h-4 text-purple-700" />
                  </div>
                  <div className="text-xl font-black font-mono text-purple-950">
                    Live Sync
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Daily &amp; Weekly marking modes
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('attendance')}
                  className="mt-4 flex items-center justify-between text-xs font-bold text-purple-800 hover:text-purple-950 pt-2 border-t border-purple-200/60 cursor-pointer"
                >
                  <span>Mark Attendance</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Card 4: Fees */}
              <div className="bg-gradient-to-br from-amber-50/70 to-orange-50/50 rounded-xl p-4 border border-amber-100 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold uppercase text-amber-800">
                      Class Fees Ledger
                    </span>
                    <CreditCard className="w-4 h-4 text-amber-700" />
                  </div>
                  <div className="text-2xl font-black font-mono text-amber-950">
                    {classFeePayments.length}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    12-Month Installment progress
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('fees')}
                  className="mt-4 flex items-center justify-between text-xs font-bold text-amber-800 hover:text-amber-950 pt-2 border-t border-amber-200/60 cursor-pointer"
                >
                  <span>Review Fee Ledger</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Quick Action Navigation Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div
              onClick={() => setActiveTab('my_class')}
              className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-emerald-300 hover:shadow-xs transition cursor-pointer flex items-start gap-4"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">My Class Student Grid</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  View, edit, or delete enrolled students with instant cloud persistence.
                </p>
              </div>
            </div>

            <div
              onClick={() => setActiveTab('mark_entry')}
              className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-emerald-300 hover:shadow-xs transition cursor-pointer flex items-start gap-4"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center shrink-0">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Mark Entry Console</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Enter examination marks for My Class &amp; Other Classes with absent marking.
                </p>
              </div>
            </div>

            <div
              onClick={() => setActiveTab('attendance')}
              className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-emerald-300 hover:shadow-xs transition cursor-pointer flex items-start gap-4"
            >
              <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center shrink-0">
                <CalendarCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Attendance System</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Mark daily attendance or use the weekly grid with real-time Parent sync.
                </p>
              </div>
            </div>

            <div
              onClick={() => setActiveTab('fees')}
              className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-emerald-300 hover:shadow-xs transition cursor-pointer flex items-start gap-4"
            >
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Fees Progress Tracker</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Monitor the 12 monthly installments (June 2026 – May 2027) for your students.
                </p>
              </div>
            </div>

            {inChargeClass && (
              <div
                onClick={() => {
                  setActiveTab('fees');
                  setFeeSubTab('special_fees');
                }}
                className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-purple-300 hover:shadow-xs transition cursor-pointer flex items-start gap-4"
              >
                <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center shrink-0">
                  <Tag className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Special Fees ({inChargeClass.name})</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Collect Exam Fees, Council Funds &amp; Donations with printable receipts.
                  </p>
                </div>
              </div>
            )}

            <div
              onClick={() => setActiveTab('news')}
              className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-emerald-300 hover:shadow-xs transition cursor-pointer flex items-start gap-4"
            >
              <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center shrink-0">
                <Newspaper className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Post Announcements</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Publish notices and circulars directly to parents and the school community.
                </p>
              </div>
            </div>

            <div
              onClick={() => setActiveTab('contact')}
              className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-emerald-300 hover:shadow-xs transition cursor-pointer flex items-start gap-4"
            >
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-800 flex items-center justify-center shrink-0">
                <PhoneCall className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Madrasa Contact &amp; Office</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Access institutional telephone numbers, office hours, and Principal helpdesk.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 2: "MY CLASS" (Student Grid with Functional Edit & Delete Buttons)
         ========================================================================= */}
      {activeTab === 'my_class' && (
        <div className="space-y-6">
          {!inChargeClass ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500 space-y-2">
              <Shield className="w-12 h-12 mx-auto text-slate-400" />
              <h3 className="font-bold text-slate-800 text-base">No Class In-Charge Role Assigned</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                You are currently not designated as the official Class Teacher / In-charge for any class.
                Please contact the Principal to assign you as In-charge for your respective class (e.g. Class 1 through Class 10).
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Class In-Charge Overview Banner */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-xs print:hidden no-print">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                      <Shield className="w-3.5 h-3.5 text-emerald-700" />
                      Class In-Charge Authority
                    </span>
                    <span className="text-xs text-slate-400">• Full View &amp; Edit Permissions</span>
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 mt-1">
                    {(inChargeClass.name || '').replace(/\s*\([^)]*\)/g, '').trim()} Student Roster
                  </h2>
                  <p className={`text-xs text-slate-500 mt-0.5 ${language === 'ML' ? 'font-ml' : ''}`}>
                    {language === 'ML'
                      ? 'കുട്ടികളുടെ വിവരങ്ങൾ എളുപ്പത്തിൽ മാനേജ് ചെയ്യാനും, ക്ലാസിലെ മുഴുവൻ വിദ്യാർത്ഥികളുടെയും മാർക്ക് ഷീറ്റ് ഒറ്റനോട്ടത്തിൽ കാണാനും ഇവിടെ സാധിക്കും.'
                      : 'Easily manage student profiles and access the consolidated class marksheet.'}
                  </p>
                </div>

                {/* Uniform 3-Column Summary Cards Grid */}
                <div className="grid grid-cols-3 gap-2 sm:gap-4 w-full my-4 items-stretch">
                  <div className="bg-slate-50 border border-slate-200 p-2.5 sm:p-4 rounded-xl flex flex-col justify-between items-center text-center">
                    <span className="text-[10px] sm:text-xs font-semibold tracking-wider uppercase text-slate-500 block">
                      Enrolled Students
                    </span>
                    <span className="text-sm sm:text-lg md:text-xl font-bold font-mono text-slate-800 mt-1">
                      {inChargeStudents.length}
                    </span>
                  </div>

                  <div className="bg-emerald-50/60 border border-emerald-200 p-2.5 sm:p-4 rounded-xl flex flex-col justify-between items-center text-center">
                    <span className="text-[10px] sm:text-xs font-semibold tracking-wider uppercase text-emerald-800 block">
                      EXAM REGS
                    </span>
                    <div className="whitespace-nowrap flex items-center justify-center gap-1 text-sm sm:text-lg md:text-xl font-bold text-emerald-900 font-mono mt-1">
                      <span>{inChargeStudents.filter(s => {
                        const r = (s as any).examRegisterNos?.[selectedExamId] || (s as any).examRegNo || (s as any).regNo || s.examRegisterNumbers?.[selectedExamId];
                        return !!r && r !== '-';
                      }).length}</span>
                      <span className="text-emerald-500 font-normal">/</span>
                      <span>{inChargeStudents.length}</span>
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 p-2.5 sm:p-4 rounded-xl flex flex-col justify-between items-center text-center">
                    <span className="text-[10px] sm:text-xs font-semibold tracking-wider uppercase text-slate-500 block">
                      Class Subjects
                    </span>
                    <span className="text-sm sm:text-lg md:text-xl font-bold font-mono text-slate-800 mt-1">
                      {inChargeSubjects.length}
                    </span>
                  </div>
                </div>
              </div>

              {/* View Toggle Bar: Students List vs Marksheet */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-2.5 rounded-2xl border border-slate-200 shadow-2xs print:hidden no-print">
                <div className="flex items-center gap-1 sm:gap-1.5 p-1 bg-slate-100/90 rounded-xl overflow-x-auto max-w-full">
                  <button
                    type="button"
                    onClick={() => setMyClassViewMode('students')}
                    className={`flex flex-row items-center justify-center whitespace-nowrap gap-1 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer shrink-0 ${
                      myClassViewMode === 'students'
                        ? 'bg-emerald-800 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                    <span className="whitespace-nowrap">Students List</span>
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold whitespace-nowrap shrink-0 ${
                        myClassViewMode === 'students'
                          ? 'bg-emerald-950/60 text-emerald-200'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {inChargeStudents.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMyClassViewMode('marksheet')}
                    className={`flex flex-row items-center justify-center whitespace-nowrap gap-1 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer shrink-0 ${
                      myClassViewMode === 'marksheet'
                        ? 'bg-emerald-800 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                    }`}
                  >
                    <BarChart2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                    <span className="whitespace-nowrap">Marksheet</span>
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold whitespace-nowrap shrink-0 ${
                        myClassViewMode === 'marksheet'
                          ? 'bg-emerald-950/60 text-emerald-200'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {inChargeSubjects.length} Sub
                    </span>
                  </button>
                </div>

                <div className="text-xs text-slate-500 pr-2 hidden sm:flex items-center gap-2 font-medium">
                  <span className="font-bold text-slate-700">{(inChargeClass.name || '').replace(/\s*\([^)]*\)/g, '').trim()}</span>
                  <span>•</span>
                  <span>{selectedExam?.nameEn || 'Active Examination'}</span>
                </div>
              </div>

              {/* View 1: STUDENTS LIST VIEW (Default) */}
              {myClassViewMode === 'students' && (
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div>
                      {(() => {
                        const boysCount = inChargeStudents.filter(s => s.gender?.toLowerCase() === 'boy' || normalizeGender(s.gender) === 'Boy').length;
                        const girlsCount = inChargeStudents.filter(s => s.gender?.toLowerCase() === 'girl' || normalizeGender(s.gender) === 'Girl').length;
                        const cleanClassName = (inChargeClass.name || '').replace(/\s*\([^)]*\)/g, '').trim();
                        return (
                          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                            <Users className="w-4 h-4 text-emerald-800 shrink-0" />
                            <span>{cleanClassName || inChargeClass.name} Students List (B-{boysCount} + G-{girlsCount})</span>
                          </h3>
                        );
                      })()}
                      <p className={`text-xs text-slate-500 mt-0.5 ${language === 'ML' ? 'font-ml' : ''}`}>
                        {language === 'ML'
                          ? 'കുട്ടികളുടെ വിവരങ്ങൾ എളുപ്പത്തിൽ തിരുത്താനും ഒഴിവാക്കാനും സാധിക്കും.'
                          : 'Easily edit or remove student profiles.'}
                      </p>
                    </div>
                  </div>

                  {inChargeStudents.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 text-xs">
                      No active students enrolled in {inChargeClass.name}.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {inChargeStudents.map(st => {
                        const regNo =
                          (st as any).examRegisterNos?.[selectedExamId] ||
                          (st as any).examRegNo ||
                          (st as any).regNo ||
                          st.examRegisterNumbers?.[selectedExamId] ||
                          '-';
                        const isDuplicate =
                          (teacherAdmCounts.get(String(st.admissionNo || '').trim().toLowerCase()) || 0) > 1;

                        return (
                          <div
                            key={st.id}
                            className={`${
                              isDuplicate
                                ? 'bg-red-50/90 rounded-xl border-2 border-red-400 p-3.5 shadow-xs transition flex flex-col justify-between relative'
                                : 'bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs hover:shadow-xs transition flex flex-col justify-between relative group'
                            }`}
                          >
                            <div>
                              {/* Top Row: Roll No Badge, Gender Badge & Action Buttons */}
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="w-6 h-6 rounded-lg bg-emerald-800 text-white font-mono font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                                    {st.rollNo}
                                  </span>
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                      normalizeGender(st.gender) === 'Girl' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'
                                    }`}
                                  >
                                    {normalizeGender(st.gender)}
                                  </span>
                                  {isDuplicate && (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-700 border border-red-300">
                                      ⚠️ Duplicate Adm No
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditStudent(st)}
                                    className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition cursor-pointer"
                                    title={`Edit ${st.nameEn}`}
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              {/* Student Name */}
                              <div className="font-bold text-slate-900 text-sm leading-tight truncate" title={st.nameEn}>
                                {st.nameEn}
                              </div>
                              {st.nameMl && (
                                <div className="text-[11px] text-slate-500 truncate font-ml" title={st.nameMl}>
                                  {st.nameMl}
                                </div>
                              )}

                              {/* Details Metadata */}
                              <div className="mt-2.5 pt-2 border-t border-slate-100 space-y-1 text-[11px]">
                                <div className="flex items-center justify-between text-slate-500">
                                  <span>Adm No:</span>
                                  <span
                                    className={`font-mono font-bold ${
                                      isDuplicate
                                        ? 'text-red-700 bg-red-100 px-1 py-0.5 rounded border border-red-200'
                                        : 'text-slate-700'
                                    }`}
                                  >
                                    {st.admissionNo}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-slate-500">
                                  <span>Class:</span>
                                  <span className="font-semibold text-emerald-800">{inChargeClass.name}</span>
                                </div>
                                {st.schoolClass && (
                                  <div className="flex items-center justify-between text-slate-500">
                                    <span>School Grade:</span>
                                    <span className="font-semibold text-indigo-700">{st.schoolClass}</span>
                                  </div>
                                )}
                                {st.dob && (
                                  <div className="flex items-center justify-between text-slate-500">
                                    <span>DOB:</span>
                                    <span className="font-mono text-slate-700">{st.dob}</span>
                                  </div>
                                )}
                                {regNo && regNo !== '-' && (
                                  <div className="flex items-center justify-between text-slate-500">
                                    <span>Reg No:</span>
                                    <span className="font-mono font-bold text-emerald-900">{regNo}</span>
                                  </div>
                                )}
                                {st.parentNameEn && (
                                  <div className="flex items-center justify-between text-slate-500 truncate">
                                    <span>Parent:</span>
                                    <span className="truncate max-w-[90px] text-slate-700" title={st.parentNameEn}>
                                      {st.parentNameEn}
                                    </span>
                                  </div>
                                )}
                              </div>

                              {isDuplicate && (
                                <div className="w-full mt-2.5 py-1 px-2 text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg text-center">
                                  ⚠️ Contact Principal to resolve duplicate
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* View 2: MARKSHEET VIEW */}
              {/* View 2: MARKSHEET / SCORE SHEET VIEW */}
              {myClassViewMode === 'marksheet' && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden print:border-none print:shadow-none print:p-0">
                  {/* Embedded Print Styling */}
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

                  <div className="p-4 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden no-print">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <BarChart2 className="w-4 h-4 text-emerald-800" />
                        <span>{(inChargeClass.name || '').replace(/\s*\([^)]*\)/g, '').trim()} Examination Score Sheet</span>
                        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          {selectedExam?.nameEn || 'Active Exam'}
                        </span>
                      </h3>
                      <p className={`text-xs text-slate-500 mt-0.5 ${language === 'ML' ? 'font-ml' : ''}`}>
                        {language === 'ML'
                          ? 'ക്ലാസിലെ മുഴുവൻ കുട്ടികളുടെയും പൂർണ്ണമായ മാർക്ക് ഷീറ്റ് ഇവിടെ കാണാം.'
                          : 'View the consolidated marksheet of the entire class.'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => window.print()}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition shadow-xs cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        Print Score Sheet (A4 Landscape)
                      </button>
                    </div>
                  </div>

                  {inChargeStudents.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 text-xs">
                      No active students enrolled in {inChargeClass.name}.
                    </div>
                  ) : (
                    <div className="score-sheet-container p-4 sm:p-6 print:p-0">
                      {/* Dynamic A4 Landscape Print Header (Official Formatting Style matching Fee Receipts) */}
                      <div className="score-sheet-print-header hidden print:block text-center border-b border-black pb-2 mb-2">
                        <div className="font-serif text-black text-xs font-bold" dir="rtl">
                          {institutionSettings?.madrasaArabicHeader || 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ'}
                        </div>
                        <h1 className="text-base font-black uppercase text-black font-serif tracking-wide mt-0.5">
                          {institutionSettings?.institutionName || institutionSettings?.madrasaNameEn || 'Al-Madrasathul Islamiya Pallikkuth'}
                        </h1>
                        {(institutionSettings?.institutionNameMl || institutionSettings?.madrasaNameMl) && (
                          <h2 className="text-xs font-bold text-black font-ml mt-0.5">
                            {institutionSettings?.institutionNameMl || institutionSettings?.madrasaNameMl}
                          </h2>
                        )}
                        {(institutionSettings?.institutionSubtitle || institutionSettings?.locationEn) && (
                          <div className="text-[10px] font-semibold text-black tracking-wide mt-0.5">
                            {institutionSettings?.institutionSubtitle || institutionSettings?.locationEn}
                          </div>
                        )}
                        <p className="text-[10px] text-black mt-0.5">
                          {(institutionSettings?.registrationNumber || institutionSettings?.registrationNo)
                            ? `Reg. No: ${institutionSettings?.registrationNumber || institutionSettings?.registrationNo} • `
                            : ''}
                          Consolidated Examination Score Sheet (2026–2027)
                        </p>

                        {/* Dynamic Metadata Row: Exam Name, Class Name, Class Teacher, Academic Year */}
                        <div className="mt-1.5 flex items-center justify-between text-[9pt] px-2 text-black font-semibold border-t border-b border-black py-1">
                          <div>
                            <span className="uppercase text-[8pt] font-normal">Exam:</span>{' '}
                            <span className="font-bold">{selectedExam ? selectedExam.nameEn : 'Examination'}</span>
                          </div>
                          <div>
                            <span className="uppercase text-[8pt] font-normal">Class:</span>{' '}
                            <span className="font-bold">{inChargeClass.name}</span>
                          </div>
                          <div>
                            <span className="uppercase text-[8pt] font-normal">Class Teacher:</span>{' '}
                            <span className="font-bold">{user?.name || 'Class Teacher'}</span>
                          </div>
                          <div>
                            <span className="uppercase text-[8pt] font-normal">Academic Year:</span>{' '}
                            <span className="font-mono font-bold">2026–2027</span>
                          </div>
                        </div>
                      </div>

                      <div className="w-full overflow-x-auto pb-4 scrollbar-thin">
                        <table className="score-sheet-table w-full min-w-max border-collapse text-center text-xs">
                          <thead className="bg-slate-100 print:bg-slate-50">
                            {/* Top Header Row */}
                            <tr className="border-b border-slate-200 print:border-black text-slate-800 font-semibold">
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

                              {/* Columns for each Subject */}
                              {inChargeSubjects.map(sub => {
                                const subName =
                                  inChargeClass.numericGrade === 9 && (sub.id === 'sub_history_buhuth' || sub.code === 'HST')
                                    ? 'ബുഹൂസ്'
                                    : sub.nameMl || sub.nameEn;
                                return (
                                  <th
                                    key={sub.id}
                                    colSpan={3}
                                    className="subject-name py-2 px-3 text-center border border-slate-300 print:border-black font-bold whitespace-nowrap bg-slate-100 print:bg-slate-50"
                                  >
                                    <div className="font-bold text-slate-900 leading-tight whitespace-nowrap">{subName}</div>
                                    <div className="text-[10px] text-slate-500 font-mono font-normal print:text-black whitespace-nowrap">
                                      {sub.code} ({sub.defaultComponents?.reduce((acc, c) => acc + (c.maxMarks || 0), 0) || (sub as any).maxMarks || 50})
                                    </div>
                                  </th>
                                );
                              })}

                              {/* Summary Columns */}
                              <th
                                rowSpan={2}
                                className="py-2 px-3 text-center border border-slate-300 print:border-black font-bold whitespace-nowrap bg-emerald-50/70 print:bg-transparent min-w-[85px]"
                              >
                                Grand Total
                                <div className="text-[9px] text-slate-500 font-normal">/ {classMarksheetData[0]?.expectedMax || inChargeSubjects.length * 50}</div>
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
                                  {selectedExam?.attendanceCutoffDate ? `Up to ${selectedExam.attendanceCutoffDate}` : 'Attended / Total'}
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
                              {inChargeSubjects.map(sub => (
                                <React.Fragment key={`tch_score_sub_cols_${sub.id}`}>
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

                          <tbody className="divide-y divide-slate-100 print:divide-black text-slate-800">
                            {classMarksheetData.map((row, idx) => {
                              const st = row.student;

                              return (
                                <tr
                                  key={st.id}
                                  className={`transition ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60 print:bg-transparent'} hover:bg-slate-100/50`}
                                >
                                  {/* Roll No */}
                                  <td className="py-2 px-3 text-center font-bold font-mono text-slate-700 border border-slate-300 print:border-black whitespace-nowrap">
                                    {st.rollNo}
                                  </td>

                                  {/* Student Name */}
                                  <td className="py-2 px-4 text-left font-medium text-slate-900 border border-slate-300 print:border-black whitespace-nowrap">
                                    <div className="font-bold">{st.nameEn}</div>
                                    {st.nameMl && (
                                      <div className="text-[10px] text-slate-500 font-ml leading-tight">
                                        {st.nameMl}
                                      </div>
                                    )}
                                  </td>

                                  {/* Columns for each Subject: TE | CE | Tot */}
                                  {inChargeSubjects.map(sub => {
                                    const mData = row.subjectMarksMap[sub.id];
                                    const isAb = mData?.isAbsent;
                                    const teVal = mData?.te;
                                    const ceVal = mData?.ce;
                                    const totVal = mData?.tot;

                                    return (
                                      <React.Fragment key={`tch_ss_marks_${st.id}_${sub.id}`}>
                                        {/* TE */}
                                        <td className="py-2 px-3 text-center border border-slate-300 print:border-black font-mono text-[11px] whitespace-nowrap">
                                          {isAb ? (
                                            <span className="text-red-600 font-bold">AB</span>
                                          ) : teVal === '—' || teVal === undefined ? (
                                            <span className="text-slate-300 print:text-black">—</span>
                                          ) : (
                                            <span className={mData?.isFail ? 'text-red-600 font-bold' : 'text-slate-800'}>
                                              {teVal}
                                            </span>
                                          )}
                                        </td>
                                        {/* CE */}
                                        <td className="py-2 px-3 text-center border border-slate-300 print:border-black font-mono text-[11px] whitespace-nowrap">
                                          {isAb ? (
                                            <span className="text-red-600 font-bold">AB</span>
                                          ) : ceVal === '—' || ceVal === undefined ? (
                                            <span className="text-slate-300 print:text-black">—</span>
                                          ) : (
                                            <span className="text-slate-700">{ceVal}</span>
                                          )}
                                        </td>
                                        {/* Tot */}
                                        <td className="py-2 px-3 text-center border border-slate-300 print:border-black font-mono text-[11px] font-bold whitespace-nowrap bg-slate-50/60 print:bg-transparent">
                                          {isAb ? (
                                            <span className="text-red-600 font-bold">AB</span>
                                          ) : totVal === '—' || totVal === undefined ? (
                                            <span className="text-slate-300 print:text-black">—</span>
                                          ) : (
                                            <span className={mData?.isFail ? 'text-red-600 font-bold' : 'text-slate-900'}>
                                              {totVal}
                                            </span>
                                          )}
                                        </td>
                                      </React.Fragment>
                                    );
                                  })}

                                  {/* Summary Column 1: Grand Total */}
                                  <td className="py-2 px-3 text-center border border-slate-300 print:border-black font-mono font-bold text-emerald-950 whitespace-nowrap bg-emerald-50/20 print:bg-transparent">
                                    {row.studentObtained}
                                  </td>

                                  {/* Summary Column 2: Percentage */}
                                  <td className="py-2 px-3 text-center border border-slate-300 print:border-black font-mono font-bold text-slate-800 whitespace-nowrap bg-emerald-50/20 print:bg-transparent">
                                    {row.percentage}%
                                  </td>

                                  {/* Summary Column 3: Attendance */}
                                  <td className="py-2 px-3 text-center border border-slate-300 print:border-black font-mono text-slate-700 whitespace-nowrap">
                                    {row.daysAttended}
                                  </td>

                                  {/* Summary Column 4: Dense Rank / Status */}
                                  <td className="py-2 px-3 text-center border border-slate-300 print:border-black font-bold whitespace-nowrap">
                                    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${row.badgeClass}`}>
                                      {row.rankOrStatusText}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* EDIT STUDENT MODAL */}
          {editingStudent && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
              <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
                  <div className="flex items-center gap-2">
                    <Edit2 className="w-4 h-4 text-emerald-800" />
                    <h3 className="text-sm font-bold text-slate-900">
                      Edit Student: {editingStudent.nameEn}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingStudent(null)}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSaveStudent} className="space-y-3.5 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Student Name (English) *</label>
                    <input
                      type="text"
                      required
                      value={studentFormData.nameEn}
                      onChange={e => setStudentFormData({ ...studentFormData, nameEn: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-700 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Student Name (Malayalam)</label>
                    <input
                      type="text"
                      value={studentFormData.nameMl}
                      onChange={e => setStudentFormData({ ...studentFormData, nameMl: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-700 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Roll No *</label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={studentFormData.rollNo}
                        onChange={e => setStudentFormData({ ...studentFormData, rollNo: e.target.value })}
                        className="w-full p-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-700 focus:outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Gender *</label>
                      <select
                        value={normalizeGender(studentFormData.gender)}
                        onChange={e => setStudentFormData({ ...studentFormData, gender: normalizeGender(e.target.value) })}
                        className="w-full p-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-700 focus:outline-none font-medium"
                      >
                        <option value="Boy">Boy</option>
                        <option value="Girl">Girl</option>
                      </select>
                    </div>
                  </div>

                  {/* Date of Birth & Regular School Class */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Date of Birth (DOB)</label>
                      <input
                        type="date"
                        name="dob"
                        value={studentFormData.dob}
                        onChange={e => setStudentFormData({ ...studentFormData, dob: e.target.value })}
                        className="w-full p-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-700 focus:outline-none bg-white font-medium"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">School Class / Regular Grade</label>
                      <select
                        value={studentFormData.schoolClass}
                        onChange={e => setStudentFormData({ ...studentFormData, schoolClass: e.target.value })}
                        className="w-full p-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-700 focus:outline-none bg-slate-50 font-medium"
                      >
                        <option value="">Select Regular Grade</option>
                        <option value="Pre-Primary / KG">Pre-Primary / KG</option>
                        <option value="Class 1">Class 1</option>
                        <option value="Class 2">Class 2</option>
                        <option value="Class 3">Class 3</option>
                        <option value="Class 4">Class 4</option>
                        <option value="Class 5">Class 5</option>
                        <option value="Class 6">Class 6</option>
                        <option value="Class 7">Class 7</option>
                        <option value="Class 8">Class 8</option>
                        <option value="Class 9">Class 9</option>
                        <option value="Class 10">Class 10</option>
                        <option value="Plus One (+1)">Plus One (+1)</option>
                        <option value="Plus Two (+2)">Plus Two (+2)</option>
                        <option value="College / Degree">College / Degree</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Admission Number *</label>
                      <input
                        type="text"
                        required
                        value={studentFormData.admissionNo}
                        onChange={e => setStudentFormData({ ...studentFormData, admissionNo: e.target.value })}
                        className={`w-full p-2 border rounded-xl focus:ring-2 focus:outline-none font-mono ${
                          isTeacherAdmDuplicate
                            ? 'border-red-500 bg-red-50 text-red-900 focus:ring-red-400'
                            : 'border-slate-300 focus:ring-emerald-700'
                        }`}
                      />
                      {isTeacherAdmDuplicate && (
                        <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-red-600">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          Admission Number [{trimmedTeacherAdm}] already exists! Please use a unique Admission Number.
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Exam Register Number
                      </label>
                      <input
                        type="text"
                        name="examRegNo"
                        value={studentFormData.examRegNo || ''}
                        onChange={e => setStudentFormData({ ...studentFormData, examRegNo: e.target.value })}
                        placeholder="e.g. 7101"
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-700 focus:outline-none font-mono bg-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Parent / Guardian</label>
                      <input
                        type="text"
                        value={studentFormData.parentNameEn}
                        onChange={e => setStudentFormData({ ...studentFormData, parentNameEn: e.target.value })}
                        className="w-full p-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-700 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Parent Phone</label>
                      <input
                        type="tel"
                        value={studentFormData.parentPhone}
                        onChange={e => setStudentFormData({ ...studentFormData, parentPhone: e.target.value })}
                        className="w-full p-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-700 focus:outline-none font-mono"
                      />
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingStudent(null)}
                      className="px-3.5 py-2 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingStudent || isTeacherAdmDuplicate}
                      className="px-4 py-2 text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition font-bold disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5 shadow-xs"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{isSavingStudent ? 'Saving...' : 'Save Changes'}</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 3: "MARK ENTRY" TAB (Restructured from "My Assigned Subject")
         ========================================================================= */}
      {activeTab === 'mark_entry' && (
        <div className="space-y-4">
          {/* Header & Sub-tab Segments: "My Class" vs "Other Class" */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-emerald-800" />
                <span>Mark Entry</span>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                  {assignments.length} Total
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Select an assigned class and subject to enter, review, or submit examination marks.
              </p>
            </div>

            {/* Segment Toggle: My Class vs Teaching Subjects */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-100/90 border border-slate-200/80 rounded-xl self-start sm:self-auto shadow-2xs">
              <button
                type="button"
                onClick={() => setMarkEntrySegment('my_class')}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  markEntrySegment === 'my_class'
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>My Class</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                    markEntrySegment === 'my_class'
                      ? 'bg-emerald-950/60 text-emerald-200'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {inChargeClass ? inChargeSubjects.length : 0}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setMarkEntrySegment('teaching_subjects')}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  markEntrySegment === 'teaching_subjects'
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Teaching Subjects</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                    markEntrySegment === 'teaching_subjects'
                      ? 'bg-emerald-950/60 text-emerald-200'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {teachingSubjects.length}
                </span>
              </button>
            </div>
          </div>

          {/* Segment Content */}
          {assignments.length === 0 && !inChargeClass ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500">
              <BookOpen className="w-10 h-10 mx-auto text-slate-400 mb-2" />
              <h3 className="font-bold text-slate-800 text-sm">No Subjects Assigned</h3>
              <p className="text-xs text-slate-500 mt-1">
                The administrator has not assigned you any individual subject slots yet. If you are a Class In-charge, switch to the "My Class" tab to view student rosters and marksheets.
              </p>
            </div>
          ) : markEntrySegment === 'my_class' ? (
            !inChargeClass ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500 space-y-3">
                <Shield className="w-10 h-10 mx-auto text-slate-400" />
                <h3 className="font-bold text-slate-800 text-sm">No Class In-Charge Designated</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  You are currently not designated as the Class In-charge for any class. Please switch to the "Teaching Subjects" segment to view and enter marks for your assigned subjects.
                </p>
                <button
                  type="button"
                  onClick={() => setMarkEntrySegment('teaching_subjects')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-xs"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Switch to Teaching Subjects ({teachingSubjects.length})</span>
                </button>
              </div>
            ) : (
              /* All Subjects for Class [X] (Moved from "My Class" tab to "Mark Entry" -> "My Class" segment) */
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-emerald-800" />
                      <span>All Subjects for {inChargeClass.name} ({inChargeSubjects.length} subjects)</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Full view &amp; edit access for all subjects in {inChargeClass.name} under {selectedExam?.nameEn || 'Active Exam'}.
                    </p>
                  </div>
                  <span className="self-start sm:self-auto px-2.5 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-lg flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-emerald-700" />
                    Class In-charge Authority
                  </span>
                </div>

                {inChargeSubjects.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 text-xs">
                    No subjects configured for {inChargeClass.name}.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {inChargeSubjects.map(sub => {
                      const ms = markSheets.find(
                        m =>
                          m.examinationId === selectedExamId &&
                          m.classId === inChargeClass.id &&
                          m.subjectId === sub.id
                      );

                      const subDisplayName =
                        inChargeClass.numericGrade === 9 &&
                        (sub.id === 'sub_history_buhuth' || sub.code === 'HST')
                          ? 'ബുഹൂസ്'
                          : sub.nameMl || sub.nameEn;

                      const status = ms?.status || 'not_started';

                      const isMyAssignedSubject = assignments.some(
                        a => a.classId === inChargeClass.id && a.subjectId === sub.id
                      );

                      return (
                        <div
                          key={sub.id}
                          className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md border border-slate-200">
                                {sub.code}
                              </span>

                              {status === 'not_started' && (
                                <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                                  {isMyAssignedSubject ? t.not_started : 'Not Started'}
                                </span>
                              )}
                              {status === 'draft' && (
                                isMyAssignedSubject ? (
                                  <span className="text-[11px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {t.draft}
                                  </span>
                                ) : (
                                  <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <Clock className="w-3 h-3 text-slate-500" />
                                    Waiting for Submission
                                  </span>
                                )
                              )}
                              {status === 'submitted' && (
                                <span className="text-[11px] font-bold text-blue-900 bg-blue-100/90 border border-blue-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-blue-700" />
                                  Awaiting Your Approval
                                </span>
                              )}
                              {status === 'approved' && (
                                <span className="text-[11px] font-bold text-emerald-900 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                                  <CheckCircle className="w-3 h-3 text-emerald-700" />
                                  Approved — Awaiting Principal's Lock
                                </span>
                              )}
                              {status === 'locked' && (
                                <span className="text-[11px] font-bold text-purple-900 bg-purple-100 border border-purple-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                                  <Lock className="w-3 h-3 text-purple-700" />
                                  Locked by Principal
                                </span>
                              )}
                              {status === 'returned_for_correction' && (
                                <span className="text-[11px] font-semibold text-rose-800 bg-rose-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3" />
                                  Returned
                                </span>
                              )}
                            </div>

                            <h4 className="font-bold text-slate-900 text-base mb-1 font-ml">
                              {subDisplayName}
                            </h4>
                            <p className="text-xs text-slate-500">
                              Maximum Marks: 50
                            </p>

                            {status === 'returned_for_correction' && ms?.returnedReason && (
                              <div className="mt-3 p-2 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
                                <strong>Principal note:</strong> {ms.returnedReason}
                              </div>
                            )}
                          </div>

                          <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                            <span className="text-[11px] text-slate-500">
                              {ms?.studentMarks
                                ? `${Object.keys(ms.studentMarks).length} of ${inChargeStudents.length} entered`
                                : `0 of ${inChargeStudents.length} entered`}
                            </span>

                            <button
                              type="button"
                              onClick={() =>
                                setActiveEntry({
                                  classId: inChargeClass.id,
                                  subjectId: sub.id,
                                  examinationId: selectedExamId,
                                })
                              }
                              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition shadow-2xs cursor-pointer ${
                                status === 'submitted'
                                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                  : status === 'approved' || status === 'locked' || !isMyAssignedSubject
                                  ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
                                  : 'bg-orange-600 hover:bg-orange-700 text-white'
                              }`}
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              {status === 'submitted'
                                ? 'Direct Edit & Approve'
                                : status === 'approved' || status === 'locked'
                                ? 'View Sheet'
                                : isMyAssignedSubject
                                ? t.navEnterMarks
                                : 'View Sheet'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )
          ) : (
            /* Teaching Subjects Segment */
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-emerald-800" />
                    <span>Teaching Subjects ({teachingSubjects.length})</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Assigned teaching subjects across all classes under the current examination.
                  </p>
                </div>
              </div>

              {teachingSubjects.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500 space-y-2">
                  <Layers className="w-10 h-10 mx-auto text-slate-400 mb-2" />
                  <h3 className="font-bold text-slate-800 text-sm">No Teaching Subjects Assigned</h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    The administrator has not assigned you any teaching subjects yet.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {teachingSubjects.map(a => {
                    const cls = classes.find(c => c.id === a.classId);
                    const sub = subjects.find(s => s.id === a.subjectId);
                    const ms = markSheets.find(
                      m => m.examinationId === selectedExamId && m.classId === a.classId && m.subjectId === a.subjectId
                    );

                    const subDisplayName =
                      cls?.numericGrade === 9 && (sub?.id === 'sub_history_buhuth' || sub?.code === 'HST')
                        ? 'ബുഹൂസ്'
                        : sub?.nameMl || sub?.nameEn || '—';

                    const status = ms?.status || 'not_started';
                    const isMyClassInCharge = Boolean(
                      inChargeClass && (inChargeClass.id === a.classId || (cls && cls.numericGrade === inChargeClass.numericGrade))
                    );

                    return (
                      <div
                        key={a.id}
                        className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900">
                              {isMl ? cls?.nameMl : cls?.name}
                            </span>

                            {status === 'not_started' && (
                              <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                                {t.not_started}
                              </span>
                            )}
                            {status === 'draft' && (
                              <span className="text-[11px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {t.draft}
                              </span>
                            )}
                            {status === 'submitted' && (
                              <span className="text-[11px] font-semibold text-blue-800 bg-blue-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {isMyClassInCharge ? 'Awaiting Your Approval' : 'Awaiting Class Teacher Approval'}
                              </span>
                            )}
                            {status === 'approved' && (
                              <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" />
                                Approved — Awaiting Principal's Lock
                              </span>
                            )}
                            {status === 'locked' && (
                              <span className="text-[11px] font-semibold text-purple-800 bg-purple-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                                <Lock className="w-3 h-3" />
                                Locked by Principal
                              </span>
                            )}
                            {status === 'returned_for_correction' && (
                              <span className="text-[11px] font-semibold text-rose-800 bg-rose-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />
                                Returned
                              </span>
                            )}
                          </div>

                          <h3 className="font-bold text-slate-900 text-base mb-1 font-ml">
                            {subDisplayName}
                          </h3>
                          <p className="text-xs text-slate-500">
                            Maximum Marks: 50
                          </p>

                          {status === 'returned_for_correction' && ms?.returnedReason && (
                            <div className="mt-3 p-2 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
                              <strong>Principal note:</strong> {ms.returnedReason}
                            </div>
                          )}
                        </div>

                        <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                          <span className="text-[11px] text-slate-400">
                            {ms?.studentMarks ? `${Object.keys(ms.studentMarks).length} entered` : '0 entered'}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setActiveEntry({
                                classId: a.classId,
                                subjectId: a.subjectId,
                                examinationId: selectedExamId,
                              })
                            }
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition shadow-2xs cursor-pointer ${
                              status === 'submitted' && isMyClassInCharge
                                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                : status === 'submitted' || status === 'approved' || status === 'locked'
                                ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
                                : 'bg-orange-600 hover:bg-orange-700 text-white'
                            }`}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            {status === 'submitted' && isMyClassInCharge
                              ? 'Direct Edit & Approve'
                              : status === 'submitted' || status === 'approved' || status === 'locked'
                              ? 'View Sheet'
                              : t.navEnterMarks}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 4: ATTENDANCE (Strictly Preserved Verbatim)
         ========================================================================= */}
      {activeTab === 'attendance' && (() => {
        const selectedClass = classes.find(c => c.id === attendanceClassId) || inChargeClass || classes[0];
        const effectiveClassId = selectedClass?.id || attendanceClassId || '';

        const classStudents = selectedClass
          ? sortStudentsBoysFirst(
              allStudents.filter(
                s =>
                  (s.classId === effectiveClassId ||
                    (s.classId && effectiveClassId && s.classId.replace(/[^0-9]/g, '') === effectiveClassId.replace(/[^0-9]/g, '')) ||
                    isClassMatch([effectiveClassId], s.classId)) &&
                  s.status === 'active'
              )
            ).map((s, idx) => ({
              ...s,
              rollNo: idx + 1,
            }))
          : [];

        const dailyPresentCount = classStudents.filter(st => dailyStatusMap[st.id] !== false).length;
        const dailyAbsentCount = classStudents.length - dailyPresentCount;
        const dailyPercentage = classStudents.length > 0
          ? ((dailyPresentCount / classStudents.length) * 100).toFixed(1)
          : '0.0';

        const weekDays = getWeekDays(selectedWeekDate);

        const liveRecords = classAttendanceConfig?.dailyRecords || {};

        // Base Academic Months (Term 1) and dynamic detection of any other months recorded in Firestore
        const baseAcademicMonths = [
          { key: '2026-06', monthEn: 'June 2026', monthMl: 'ജൂൺ 2026' },
          { key: '2026-07', monthEn: 'July 2026', monthMl: 'ജൂലൈ 2026' },
          { key: '2026-08', monthEn: 'August 2026', monthMl: 'ഓഗസ്റ്റ് 2026' },
          { key: '2026-09', monthEn: 'September 2026', monthMl: 'സെപ്റ്റംബർ 2026' },
          { key: '2026-10', monthEn: 'October 2026', monthMl: 'ഒക്ടോബർ 2026' },
        ];

        // Check if additional months exist in live Firestore dailyRecords
        const extraMonthKeys = Array.from(new Set(
          Object.keys(liveRecords)
            .map(d => d.slice(0, 7))
            .filter(k => /^\d{4}-\d{2}$/.test(k) && !baseAcademicMonths.some(m => m.key === k))
        )).sort();

        const extraMonthNameMap: Record<string, { en: string; ml: string }> = {
          '2026-11': { en: 'November 2026', ml: 'നവംബർ 2026' },
          '2026-12': { en: 'December 2026', ml: 'ഡിസംബർ 2026' },
          '2027-01': { en: 'January 2027', ml: 'ജനുവരി 2027' },
          '2027-02': { en: 'February 2027', ml: 'ഫെബ്രുവരി 2027' },
          '2027-03': { en: 'March 2027', ml: 'മാർച്ച് 2027' },
        };

        const allCandidateMonths = [
          ...baseAcademicMonths,
          ...extraMonthKeys.map(k => ({
            key: k,
            monthEn: extraMonthNameMap[k]?.en || k,
            monthMl: extraMonthNameMap[k]?.ml || k,
          })),
        ];

        // 1. DYNAMIC "WORKING DAYS" CALCULATION (NO HARDCODING):
        // Calculate the totalWorkingDays dynamically for each month directly from live Firestore attendance document.
        // A day is counted as a "working day" ONLY IF attendance was actually initialized/marked for that day in Firestore
        // and it is not explicitly marked as a Holiday or Sunday.
        const academicMonths = allCandidateMonths.map(m => {
          const monthWorkingDayKeys = Object.keys(liveRecords).filter(dayKey => {
            if (!dayKey.startsWith(m.key)) return false;
            const rec = liveRecords[dayKey];
            if (!rec) return false;

            // Exclude holidays
            if (rec.isHoliday === true || (rec as any).status === 'holiday' || (rec as any).status === 'Holiday' || (rec as any).status === 'OFF') {
              return false;
            }
            if (isDateHoliday(dayKey, attendanceClassId)) {
              return false;
            }

            // Exclude Sundays unless unlocked as special working day
            if (isDateSunday(dayKey) && !isSundayUnlockedForClass(dayKey, attendanceClassId)) {
              return false;
            }

            // Must have attendance actually initialized / recorded
            const hasMarks =
              (rec.statusMap && Object.keys(rec.statusMap).length > 0) ||
              (rec.presentStudentIds && rec.presentStudentIds.length > 0) ||
              (rec.absentStudentIds && rec.absentStudentIds.length > 0) ||
              Boolean(rec.markedAt);

            return hasMarks;
          });

          return {
            ...m,
            workingDays: monthWorkingDayKeys.sort(),
            working: monthWorkingDayKeys.length, // DYNAMIC COUNT (NO HARDCODING)
          };
        });

        // Dynamic sum of all working days across months
        const totalEffectiveWorking = academicMonths.reduce((sum, m) => sum + m.working, 0);

        const dObj = new Date(selectedAttendanceDate);
        const dateFormattedEn = !isNaN(dObj.getTime())
          ? dObj.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
          : selectedAttendanceDate;

        // 2. EXACT "PRESENT" COUNT AGGREGATION & PERCENTAGES:
        const getStudentMonthlyBreakdown = (st: Student) => {
          let studentTotalAttended = 0;

          const monthsData = academicMonths.map(m => {
            let presentCount = 0;

            m.workingDays.forEach(dayKey => {
              const rec = liveRecords[dayKey];
              if (!rec) return;

              // Count exactly how many times student is Present in the live Firestore document
              const isPresent = Boolean(
                rec.statusMap?.[st.id] === true ||
                (rec.statusMap?.[st.id] as any) === 'Present' ||
                (rec.statusMap?.[st.id] as any) === 'P' ||
                (rec.presentStudentIds && rec.presentStudentIds.includes(st.id))
              );

              if (isPresent) {
                presentCount++;
              }
            });

            studentTotalAttended += presentCount;

            const percentage = m.working > 0
              ? ((presentCount / m.working) * 100).toFixed(1)
              : '0.0';

            return {
              key: m.key,
              working: m.working,
              attended: presentCount,
              percentage,
            };
          });

          const overallPercentage = totalEffectiveWorking > 0
            ? ((studentTotalAttended / totalEffectiveWorking) * 100).toFixed(1)
            : '0.0';

          return {
            months: monthsData,
            totalAttended: studentTotalAttended,
            totalWorking: totalEffectiveWorking,
            overallPercentage,
          };
        };

        return (
          <div className="space-y-6">
            {/* Header Control Card: Class Selector, Sync Badge & View Toggle */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-xl bg-emerald-100 text-emerald-800">
                      <CalendarCheck className="w-5 h-5 text-emerald-800" />
                    </span>
                    <h2 className="text-lg font-bold text-slate-900">
                      Attendance Management System
                    </h2>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Mark morning session attendance with instant real-time cloud synchronization to Parent Portal.
                  </p>
                </div>

                {/* Class Selector Dropdown */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                    <label className="text-xs font-bold text-slate-700 whitespace-nowrap">Class:</label>
                    <select
                      value={attendanceClassId}
                      onChange={e => setAttendanceClassId(e.target.value)}
                      className="bg-white text-xs font-bold text-slate-800 py-1.5 px-2.5 rounded-lg border border-slate-300 focus:outline-emerald-600 cursor-pointer"
                    >
                      {classes.map(c => {
                        const isInCharge = (inChargeClass && inChargeClass.id === c.id);
                        return (
                          <option key={c.id} value={c.id}>
                            {c.name} {isInCharge ? '★ (Class In-Charge)' : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
                    Live Sync Active
                  </span>

                  {isAlternateScheduleClass(classes.find(c => c.id === attendanceClassId)?.name || attendanceClassId) && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-50 text-blue-900 border border-blue-200">
                      <Clock className="w-3.5 h-3.5 text-blue-600" />
                      <span>{getClassScheduleSummary(classes.find(c => c.id === attendanceClassId)?.name || attendanceClassId)}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Mode Toggle: Daily vs Weekly */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setAttendanceMode('daily')}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg transition cursor-pointer ${
                      attendanceMode === 'daily'
                        ? 'bg-emerald-800 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Calendar className="w-4 h-4" />
                    <span>Daily Marking</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAttendanceMode('weekly')}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg transition cursor-pointer ${
                      attendanceMode === 'weekly'
                        ? 'bg-emerald-800 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <CalendarDays className="w-4 h-4" />
                    <span>Weekly Marking</span>
                  </button>
                </div>

                {/* Quick Save Alert Toast */}
                {(dailySaveSuccess || weeklySaveSuccess) && (
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 animate-fade-in">
                    <CheckCheck className="w-4 h-4 text-emerald-700" />
                    <span>Saved &amp; Synced with Parent Portal in Real-time!</span>
                  </div>
                )}

                {/* Request Sent Toast in Teacher Portal */}
                {showRequestSentToast && (
                  <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-amber-100 text-amber-950 border border-amber-300 animate-fade-in shadow-2xs">
                    <Clock className="w-4 h-4 text-amber-700 animate-spin" />
                    <span>Request Sent - Pending Approval</span>
                  </div>
                )}
              </div>
            </div>

            {/* VIEW 1: DAILY ATTENDANCE MARKING */}
            {attendanceMode === 'daily' && (() => {
              const dailyRecord = classAttendanceConfig?.dailyRecords?.[selectedAttendanceDate];
              const lockStatus = attendanceLocks.getDateLockStatus(selectedAttendanceDate, dailyRecord);
              const isDailyRecorded = lockStatus.isRecorded;
              const isDailyHoliday = lockStatus.isHoliday;
              const dailyHolidayInfo = getHolidayInfo(selectedAttendanceDate);
              const reqForDate = lockStatus.activeRequest || getRequestForDate(selectedAttendanceDate, attendanceClassId);
              const isDailyEditing = lockStatus.canEdit && lockStatus.isUnlockedByPrincipal;
              const isDailyLocked = lockStatus.isLocked;

              const selectedClassName = classes.find(c => c.id === attendanceClassId)?.name || attendanceClassId;
              const isAltOff = isAlternateOffDay(selectedClassName || attendanceClassId, selectedAttendanceDate);
              const hasRecordedAttendance = Boolean(
                dailyRecord &&
                !dailyRecord.isHoliday &&
                (dailyRecord.markedAt ||
                  (dailyRecord.presentStudentIds && dailyRecord.presentStudentIds.length > 0) ||
                  (dailyRecord.absentStudentIds && dailyRecord.absentStudentIds.length > 0) ||
                  (dailyRecord.statusMap && Object.keys(dailyRecord.statusMap).length > 0))
              );
              const isScheduledOffDay = isAltOff && !hasRecordedAttendance && !isSpecialWorkingDay;

              return (
                <div className="space-y-4">
                  {/* Special Working Day Alert Banner when Activated by Teacher */}
                  {isSpecialWorkingDay && isAltOff && !hasRecordedAttendance && (
                    <div className="bg-emerald-50 border-2 border-emerald-400 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs animate-fade-in">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-200 text-emerald-950 flex items-center justify-center text-xl shrink-0 shadow-2xs">
                          📅
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-emerald-950 flex items-center gap-2">
                            <span>📅 Special Working Day Active (Teacher Override)</span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-200 text-emerald-900 border border-emerald-300">
                              Open for Marking
                            </span>
                          </h4>
                          <p className="text-xs text-emerald-800 mt-0.5">
                            You have activated today as a special working day for {selectedClassName}. Mark attendance below and click &quot;Save Attendance&quot; to permanently record it in Firestore.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsSpecialWorkingDay(false)}
                        className="px-3.5 py-1.5 text-xs font-bold text-emerald-900 bg-white hover:bg-emerald-100 rounded-xl border border-emerald-300 shadow-2xs transition cursor-pointer"
                      >
                        Revert to Off-Day
                      </button>
                    </div>
                  )}

                  {/* Green Alert Banner when Unlocked by Principal */}
                  {isDailyEditing && !isDailyHoliday && (
                    <div className="bg-emerald-50 border-2 border-emerald-400 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs animate-fade-in">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-200 text-emerald-950 flex items-center justify-center text-xl shrink-0 shadow-2xs">
                          🔓
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-emerald-950 flex items-center gap-2">
                            <span>🔓 Unlocked by Principal - You can now edit and save attendance.</span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-200 text-emerald-900 border border-emerald-300">
                              Editing Active
                            </span>
                          </h4>
                          <p className="text-xs text-emerald-800 mt-0.5">
                            Principal ASLAM TK has authorized attendance modifications for {selectedAttendanceDate}. Toggle student statuses and click &quot;Save Corrections&quot; or &quot;Save Attendance&quot; to save and lock again.
                          </p>
                        </div>
                      </div>
                      <span className="text-[11px] font-mono font-bold text-emerald-900 bg-white px-3 py-1.5 rounded-xl border border-emerald-200 shadow-2xs">
                        Class: {classes.find(c => c.id === attendanceClassId)?.name || 'Class'}
                      </span>
                    </div>
                  )}

                  {/* Date Controls & Quick Actions Banner */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      {/* Date Picker & Navigators */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => stepDailyDate(-1)}
                          disabled={selectedAttendanceDate <= ACADEMIC_YEAR_START_DATE}
                          className={`p-2 rounded-xl border border-slate-200 transition ${
                            selectedAttendanceDate <= ACADEMIC_YEAR_START_DATE
                              ? 'bg-slate-100 text-slate-300 opacity-40 cursor-not-allowed pointer-events-none'
                              : 'bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer'
                          }`}
                          title={selectedAttendanceDate <= ACADEMIC_YEAR_START_DATE ? "Cannot navigate prior to June 1 of the academic year" : "Previous Day"}
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>

                        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5">
                          <Calendar className="w-4 h-4 text-slate-500" />
                          <input
                            type="date"
                            min={ACADEMIC_YEAR_START_DATE}
                            max={todayStr}
                            value={selectedAttendanceDate}
                            onChange={e => {
                              const val = e.target.value;
                              if (!val) return;
                              if (val > todayStr) {
                                setSelectedAttendanceDate(todayStr);
                              } else if (val < ACADEMIC_YEAR_START_DATE) {
                                setSelectedAttendanceDate(ACADEMIC_YEAR_START_DATE);
                              } else {
                                setSelectedAttendanceDate(val);
                              }
                            }}
                            className="bg-transparent text-xs font-bold text-slate-900 focus:outline-none cursor-pointer"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => stepDailyDate(1)}
                          disabled={isDailyAtToday}
                          className={`p-2 rounded-xl border border-slate-200 transition ${
                            isDailyAtToday
                              ? 'bg-slate-100 text-slate-300 opacity-40 cursor-not-allowed pointer-events-none'
                              : 'bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer'
                          }`}
                          title={isDailyAtToday ? "Next day disabled: cannot navigate into future dates" : "Next Day"}
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => setSelectedAttendanceDate(todayStr)}
                          disabled={selectedAttendanceDate === todayStr}
                          className={`px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-200 transition ${
                            selectedAttendanceDate === todayStr
                              ? 'bg-slate-100 text-slate-400 cursor-default'
                              : 'bg-white hover:bg-slate-50 text-slate-700 cursor-pointer'
                          }`}
                        >
                          Today
                        </button>
                      </div>

                      {/* Date Label & Locking / Holiday Status */}
                      <div className="text-xs font-bold text-slate-700 sm:text-right flex flex-col sm:items-end gap-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-emerald-950 font-bold">{dateFormattedEn}</span>
                          {selectedAttendanceDate === todayStr && (
                            <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded">
                              Today
                            </span>
                          )}
                        </div>

                        {isDailyHoliday ? (
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
                              <span>🏖️</span>
                              <span>Official Holiday: {dailyHolidayInfo?.reason || 'Non-Working Day'}</span>
                            </span>
                          </div>
                        ) : isScheduledOffDay ? (
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-300 shadow-2xs">
                              <span>📅</span>
                              <span>{getScheduledOffDayReason(selectedClassName, selectedAttendanceDate) || 'Scheduled Off-Day (Alternate Schedule)'}</span>
                            </span>
                          </div>
                        ) : isAltOff && hasRecordedAttendance ? (
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-2xs">
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-700" />
                              <span>Working Day (Session Recorded)</span>
                            </span>
                          </div>
                        ) : isDailyLocked ? (
                          <div className="flex items-center gap-1.5">
                            {reqForDate?.status === 'pending' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-950 border border-amber-300 shadow-2xs">
                                <Clock className="w-3.5 h-3.5 text-amber-700 animate-spin" />
                                Request Sent - Pending Approval
                              </span>
                            ) : reqForDate?.status === 'rejected' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-900 border border-rose-300 shadow-2xs">
                                <X className="w-3.5 h-3.5 text-rose-700" />
                                Unlock Request Rejected by Principal
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-2xs">
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-700" />
                                Attendance Marked (Locked)
                              </span>
                            )}
                            <span className="text-[10px] text-slate-400 font-normal">
                              ({dailyRecord?.markedAt ? new Date(dailyRecord.markedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Morning Session'})
                            </span>
                          </div>
                        ) : isDailyEditing ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                            <Unlock className="w-3.5 h-3.5 text-emerald-700" />
                            Unlocked by Principal - You can now edit and save attendance.
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-normal">
                            Morning Session (07:15 AM) · Open for marking
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions & Metrics Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
                      <div className="flex items-center gap-2 flex-wrap">
                        {!isDailyHoliday && !isScheduledOffDay && (
                          <>
                            <button
                              type="button"
                              onClick={markAllDailyPresent}
                              disabled={isDailyLocked}
                              className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition flex items-center gap-1 ${
                                isDailyLocked
                                  ? 'bg-slate-100 text-slate-400 border-slate-200 opacity-50 cursor-not-allowed'
                                  : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100 cursor-pointer'
                              }`}
                              title={isDailyLocked ? "Record is locked to prevent double entry" : "Mark All Present"}
                            >
                              <Check className="w-3.5 h-3.5" />
                              Mark All Present
                            </button>

                            <button
                              type="button"
                              onClick={markAllDailyAbsent}
                              disabled={isDailyLocked}
                              className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition flex items-center gap-1 ${
                                isDailyLocked
                                  ? 'bg-slate-100 text-slate-400 border-slate-200 opacity-50 cursor-not-allowed'
                                  : 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100 cursor-pointer'
                              }`}
                              title={isDailyLocked ? "Record is locked to prevent double entry" : "Mark All Absent"}
                            >
                              <X className="w-3.5 h-3.5" />
                              Mark All Absent
                            </button>
                          </>
                        )}
                        {isScheduledOffDay && (
                          <button
                            type="button"
                            onClick={() => setIsSpecialWorkingDay(true)}
                            className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                          >
                            <CalendarCheck className="w-3.5 h-3.5" />
                            <span>📅 Make it a Working Day</span>
                          </button>
                        )}
                      </div>

                      {/* Counter Badges & Save / Unlock Request Button */}
                      <div className="flex items-center gap-3 flex-wrap">
                        {isDailyHoliday ? (
                          <div className="px-3 py-1.5 rounded-xl bg-amber-50 text-amber-900 border border-amber-200 text-xs font-bold flex items-center gap-1.5">
                            <span>🏖️</span>
                            <span>Official Holiday · Working Day Exempt</span>
                          </div>
                        ) : isScheduledOffDay ? (
                          <div className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold flex items-center gap-1.5">
                            <span>📅</span>
                            <span>Scheduled Off-Day</span>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2 text-xs font-mono font-bold">
                              <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-200">
                                Present: {dailyPresentCount} / {classStudents.length} ({dailyPercentage}%)
                              </span>
                              <span className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-900 border border-rose-200">
                                Absent: {dailyAbsentCount}
                              </span>
                            </div>

                            {isDailyLocked ? (
                              reqForDate?.status === 'pending' ? (
                                <div className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-amber-950 bg-amber-100 rounded-xl border border-amber-300 shadow-2xs">
                                  <Clock className="w-4 h-4 text-amber-700 animate-spin" />
                                  <span>Request Sent - Pending Approval</span>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleOpenUnlockModal(selectedAttendanceDate)}
                                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-amber-50 rounded-xl transition border border-slate-300 hover:border-amber-400 shadow-2xs cursor-pointer"
                                  title="Request Principal to Unlock this record for corrections"
                                >
                                  <Unlock className="w-4 h-4 text-amber-600" />
                                  <span>Request Unlock</span>
                                </button>
                              )
                            ) : (
                              <div className="flex items-center gap-2">
                                {isDailyEditing && (
                                  <button
                                    type="button"
                                    onClick={() => handleRelockDate(selectedAttendanceDate)}
                                    className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={handleSaveDailyAttendance}
                                  disabled={isSavingDaily}
                                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition shadow-xs disabled:opacity-50 cursor-pointer"
                                >
                                  <Save className="w-4 h-4" />
                                  <span>
                                    {isSavingDaily
                                      ? 'Saving...'
                                      : dailySaveSuccess
                                      ? 'Saved!'
                                      : isDailyEditing
                                      ? 'Save Corrections'
                                      : 'Save Attendance'}
                                  </span>
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* PROMINENT HOLIDAY BANNER (READ ONLY - NO REMOVE BUTTON FOR TEACHER) */}
                  {isDailyHoliday && (
                    <div className="bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 rounded-2xl border-2 border-amber-300 p-6 text-center space-y-3 shadow-xs">
                      <div className="w-12 h-12 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center text-2xl mx-auto shadow-2xs">
                        🏖️
                      </div>
                      <div>
                        <h4 className="text-base font-bold text-amber-950">
                          Official Holiday / Non-Working Day
                        </h4>
                        <div className="inline-block mt-1 px-3 py-1 bg-amber-200/90 text-amber-950 text-xs font-bold rounded-lg border border-amber-300">
                          {dailyHolidayInfo?.reason || 'Official Holiday / Non-Working Day'}
                        </div>
                      </div>
                      <p className="text-xs text-amber-900/90 max-w-lg mx-auto leading-relaxed">
                        Classes are officially closed on <strong>{dateFormattedEn}</strong>.
                        Student attendance is completely exempt and will not be marked absent.
                        Total working day counts automatically exclude this date, safeguarding student percentages against unexcused penalties.
                      </p>
                    </div>
                  )}

                  {/* SCHEDULED OFF-DAY CARD (TEACHER OVERRIDE AVAILABLE) */}
                  {isScheduledOffDay && !isDailyHoliday && (
                    <div className="bg-gradient-to-r from-slate-50 via-slate-100 to-slate-50 rounded-2xl border-2 border-slate-300 p-8 text-center space-y-4 shadow-xs animate-fade-in">
                      <div className="w-14 h-14 rounded-2xl bg-white border border-slate-300 flex items-center justify-center text-3xl mx-auto shadow-xs text-slate-700">
                        📅
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-base font-bold text-slate-900">
                          Today is a scheduled Off-Day for this class.
                        </h4>
                        <p className="text-xs text-slate-600 max-w-md mx-auto">
                          {getScheduledOffDayReason(selectedClassName, selectedAttendanceDate) ||
                            `${selectedClassName} follows an alternate-day schedule and is scheduled off today.`}
                        </p>
                      </div>
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => setIsSpecialWorkingDay(true)}
                          className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow transition cursor-pointer"
                        >
                          <CalendarCheck className="w-4 h-4" />
                          <span>📅 Make it a Working Day</span>
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-500 max-w-lg mx-auto">
                        If you conducted a special session or regular classes today, click above to unlock the attendance register and record marks for your students.
                      </p>
                    </div>
                  )}

                  {/* Student Daily Marking List */}
                  {!isScheduledOffDay && (
                    <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                      <div>
                        <span className="text-xs font-bold text-slate-700">
                          Enrolled Students ({classStudents.length})
                        </span>
                        <span className="text-[11px] text-slate-400 block sm:inline sm:ml-2">
                          {isDailyHoliday
                            ? '🏖️ Official Holiday: Attendance marking is disabled and exempt.'
                            : isDailyLocked
                            ? 'Attendance is locked. Click "Edit / Unlock Attendance" above to modify records.'
                            : 'Tap button to toggle status. Roll No and Student Name remain frozen while scrolling.'}
                        </span>
                      </div>

                      {/* View Layout Switcher */}
                      <div className="inline-flex p-0.5 bg-slate-100 rounded-lg border border-slate-200 text-xs font-semibold">
                        <button
                          type="button"
                          onClick={() => setDailyViewLayout('table')}
                          className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                            dailyViewLayout === 'table'
                              ? 'bg-emerald-800 text-white shadow-2xs font-bold'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Roster Table
                        </button>
                        <button
                          type="button"
                          onClick={() => setDailyViewLayout('cards')}
                          className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                            dailyViewLayout === 'cards'
                              ? 'bg-emerald-800 text-white shadow-2xs font-bold'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Card Grid
                        </button>
                      </div>
                    </div>

                    {classStudents.length === 0 ? (
                      <div className="text-center py-10 text-slate-400 text-xs">
                        No active students found in this class.
                      </div>
                    ) : dailyViewLayout === 'table' ? (
                      /* Daily Table Roster with Frozen Columns */
                      <div
                        onWheel={handleHorizontalWheel}
                        className="overflow-x-auto relative w-full scrollbar-thin rounded-xl border border-slate-200"
                      >
                        <table className="w-full text-left text-xs min-w-[660px] border-collapse">
                          <thead className="sticky top-0 bg-slate-100 z-30">
                            <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                              <th className="py-3 px-3 text-center w-12 font-mono sticky left-0 bg-slate-100 z-40 shadow-[1px_0_0_0_#e5e7eb]">
                                Roll
                              </th>
                              <th className="py-3 px-4 min-w-[180px] md:min-w-[220px] sticky left-12 bg-slate-100 z-40 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                Student Name
                              </th>
                              <th className="py-3 px-2 w-20 text-center font-mono">
                                Adm No
                              </th>
                              <th className="py-3 px-2 w-16 text-center">
                                Gender
                              </th>
                              <th className="py-3 px-4 text-center min-w-[150px]">
                                Attendance Status
                              </th>
                              <th className="py-3 px-3 text-right">
                                Action
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {classStudents.map(st => {
                              const isPresent = dailyStatusMap[st.id] !== false;
                              const isDupAdm =
                                (teacherAdmCounts.get(String(st.admissionNo || '').trim().toLowerCase()) || 0) > 1;

                              return (
                                <tr
                                  key={st.id}
                                  className={`transition group ${
                                    isDupAdm
                                      ? 'bg-red-50/90 hover:bg-red-100/70'
                                      : isDailyHoliday
                                      ? 'bg-amber-50/30'
                                      : isPresent
                                      ? 'bg-white hover:bg-slate-50/80'
                                      : 'bg-rose-50/30 hover:bg-rose-50/60'
                                  }`}
                                >
                                  <td
                                    className={`py-3 px-3 text-center font-mono font-bold text-slate-700 w-12 sticky left-0 z-20 shadow-[1px_0_0_0_#e5e7eb] ${
                                      isDupAdm
                                        ? 'bg-red-50 group-hover:bg-red-100'
                                        : isDailyHoliday
                                        ? 'bg-amber-50 group-hover:bg-amber-100'
                                        : isPresent
                                        ? 'bg-white group-hover:bg-slate-50'
                                        : 'bg-rose-50/70 group-hover:bg-rose-100/70'
                                    }`}
                                  >
                                    {st.rollNo}
                                  </td>
                                  <td
                                    className={`py-3 px-4 whitespace-nowrap min-w-[180px] md:min-w-[220px] sticky left-12 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${
                                      isDupAdm
                                        ? 'bg-red-50 group-hover:bg-red-100'
                                        : isDailyHoliday
                                        ? 'bg-amber-50 group-hover:bg-amber-100'
                                        : isPresent
                                        ? 'bg-white group-hover:bg-slate-50'
                                        : 'bg-rose-50/70 group-hover:bg-rose-100/70'
                                    }`}
                                  >
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-bold text-slate-900">{st.nameEn}</span>
                                      {isDupAdm && (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-red-100 text-red-700 border border-red-300 shadow-2xs">
                                          ⚠️ Duplicate Adm No
                                        </span>
                                      )}
                                    </div>
                                    {st.nameMl && (
                                      <div className="text-[11px] text-slate-500 font-ml leading-tight mt-0.5">
                                        {st.nameMl}
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-3 px-2 text-center font-mono font-bold text-slate-700 w-20">
                                    <span
                                      className={
                                        isDupAdm
                                          ? 'text-red-700 bg-red-100 px-1 py-0.5 rounded border border-red-200'
                                          : ''
                                      }
                                    >
                                      {st.admissionNo}
                                    </span>
                                  </td>
                                  <td className="py-3 px-2 text-center w-16">
                                    <span
                                      className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                        normalizeGender(st.gender) === 'Girl' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'
                                      }`}
                                    >
                                      {normalizeGender(st.gender)}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 text-center">
                                    {isDailyHoliday ? (
                                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-amber-100 text-amber-900 border border-amber-200 inline-block">
                                        🏖️ Exempt (Holiday)
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        disabled={isDailyLocked}
                                        onClick={() => toggleDailyStudent(st.id)}
                                        className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all inline-flex items-center justify-center gap-1.5 min-w-[120px] ${
                                          isDailyLocked
                                            ? isPresent
                                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300 cursor-not-allowed opacity-90'
                                              : 'bg-rose-100 text-rose-800 border-rose-300 cursor-not-allowed opacity-90'
                                            : isPresent
                                            ? 'bg-emerald-700 hover:bg-emerald-800 text-white border-emerald-800 shadow-2xs cursor-pointer'
                                            : 'bg-white hover:bg-rose-50 text-rose-600 border-rose-300 cursor-pointer'
                                        }`}
                                        aria-label={`Toggle attendance for ${st.nameEn}`}
                                        title={isDailyLocked ? "Record is locked" : `Toggle ${st.nameEn}`}
                                      >
                                        {isPresent ? (
                                          <>
                                            <Check className="w-4 h-4 stroke-[3]" />
                                            <span>Present</span>
                                          </>
                                        ) : (
                                          <>
                                            <X className="w-4 h-4 stroke-[3]" />
                                            <span>Absent</span>
                                          </>
                                        )}
                                      </button>
                                    )}
                                  </td>
                                  <td className="py-3 px-3 text-right">
                                    {isDupAdm && (
                                      <span className="text-[10px] font-bold text-red-700 bg-red-100 border border-red-200 px-1.5 py-0.5 rounded shadow-2xs" title="Duplicate admission number - contact Principal to resolve">
                                        Duplicate Adm No
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      /* Card Grid Layout */
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        {classStudents.map(st => {
                          const isPresent = dailyStatusMap[st.id] !== false;
                          const isDupAdm =
                            (teacherAdmCounts.get(String(st.admissionNo || '').trim().toLowerCase()) || 0) > 1;

                          return (
                            <div
                              key={st.id}
                              onClick={() => !isDailyLocked && !isDailyHoliday && toggleDailyStudent(st.id)}
                              className={`flex items-center justify-between p-3 rounded-xl border transition-all select-none ${
                                isDupAdm
                                  ? 'bg-red-50/95 border-2 border-red-400 text-red-950'
                                  : isDailyHoliday
                                  ? 'bg-amber-50/30 border-amber-200/60 cursor-default opacity-85'
                                  : isDailyLocked
                                  ? 'cursor-default'
                                  : 'cursor-pointer'
                              } ${
                                !isDailyHoliday && !isDupAdm && (isPresent
                                  ? isDailyLocked
                                    ? 'bg-emerald-50/40 border-emerald-200/70'
                                    : 'bg-emerald-50/60 border-emerald-200 hover:bg-emerald-50'
                                  : isDailyLocked
                                    ? 'bg-rose-50/30 border-rose-200/70'
                                    : 'bg-rose-50/50 border-rose-200 hover:bg-rose-50')
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="w-8 h-8 rounded-lg bg-white border border-slate-200 font-mono font-bold text-xs flex items-center justify-center shrink-0 text-slate-700 shadow-2xs">
                                  {st.rollNo}
                                </span>
                                <div className="min-w-0">
                                  <div className="font-bold text-slate-900 text-sm truncate flex items-center gap-1.5 flex-wrap">
                                    <span className="whitespace-nowrap">{st.nameEn}</span>
                                    {isDupAdm && (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-300 shadow-2xs">
                                        ⚠️ Duplicate Adm No
                                      </span>
                                    )}
                                    <span
                                      className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                                        normalizeGender(st.gender) === 'Girl' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'
                                      }`}
                                    >
                                      {normalizeGender(st.gender)}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-slate-500 whitespace-nowrap">
                                    Adm:{' '}
                                    <span
                                      className={`font-mono font-bold ${
                                        isDupAdm
                                          ? 'text-red-700 bg-red-100 px-1 py-0.5 rounded border border-red-200'
                                          : 'text-slate-700'
                                      }`}
                                    >
                                      {st.admissionNo}
                                    </span>
                                    {st.nameMl && (
                                      <span className="ml-2 text-slate-500 font-ml">{st.nameMl}</span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                {isDupAdm && (
                                  <span className="text-[10px] font-bold text-red-700 bg-red-100 border border-red-200 px-1.5 py-0.5 rounded shadow-2xs" title="Duplicate admission number - contact Principal to resolve">
                                    Duplicate Adm No
                                  </span>
                                )}
                                {isDailyHoliday ? (
                                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-amber-100 text-amber-900 border border-amber-200">
                                    🏖️ Exempt (Holiday)
                                  </span>
                                ) : (
                                  <>
                                    <span
                                      className={`text-[11px] font-bold px-2 py-0.5 rounded-md hidden sm:inline-block ${
                                        isPresent
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : 'bg-rose-100 text-rose-800'
                                      }`}
                                    >
                                      {isPresent ? 'Present' : 'Absent'}
                                    </span>

                                    <button
                                      type="button"
                                      disabled={isDailyLocked || isDailyHoliday}
                                      onClick={e => {
                                        e.stopPropagation();
                                        if (!isDailyLocked && !isDailyHoliday) {
                                          toggleDailyStudent(st.id);
                                        }
                                      }}
                                      className={`min-h-10 min-w-10 w-10 h-10 rounded-xl flex items-center justify-center transition-all border ${
                                        isDailyLocked
                                          ? isPresent
                                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300 cursor-not-allowed opacity-90'
                                            : 'bg-rose-100 text-rose-800 border-rose-300 cursor-not-allowed opacity-90'
                                          : isPresent
                                            ? 'bg-emerald-700 text-white border-emerald-800 shadow-2xs cursor-pointer'
                                            : 'bg-white text-rose-600 border-rose-300 cursor-pointer'
                                      }`}
                                      aria-label={`Toggle attendance for ${st.nameEn}`}
                                      title={isDailyLocked ? "Record is locked to prevent duplicate entry" : `Toggle ${st.nameEn}`}
                                    >
                                      {isPresent ? (
                                        <Check className="w-5 h-5 stroke-[3]" />
                                      ) : (
                                        <X className="w-5 h-5 stroke-[3]" />
                                      )}
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
            })()}

            {/* VIEW 2: WEEKLY ATTENDANCE MARKING */}
            {attendanceMode === 'weekly' && (
              <div className="space-y-4">
                <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => stepWeeklyDate(-1)}
                        disabled={selectedWeekMondayStr <= ACADEMIC_YEAR_START_DATE}
                        className={`p-2 rounded-xl border border-slate-200 transition ${
                          selectedWeekMondayStr <= ACADEMIC_YEAR_START_DATE
                            ? 'bg-slate-100 text-slate-300 opacity-40 cursor-not-allowed pointer-events-none'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer'
                        }`}
                        title={selectedWeekMondayStr <= ACADEMIC_YEAR_START_DATE ? "Cannot navigate prior to June 1 of the academic year" : "Previous Week"}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>

                      <span className="text-xs font-bold bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800">
                        Week of: {weekDays[0]?.shortDate || ''} – {weekDays[5]?.shortDate || ''}
                      </span>

                      <button
                        type="button"
                        onClick={() => stepWeeklyDate(1)}
                        disabled={isCurrentWeekOrFuture}
                        className={`p-2 rounded-xl border border-slate-200 transition ${
                          isCurrentWeekOrFuture
                            ? 'bg-slate-100 text-slate-300 opacity-40 cursor-not-allowed pointer-events-none'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer'
                        }`}
                        title={isCurrentWeekOrFuture ? "Future week navigation is locked" : "Next Week"}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedWeekDate(todayStr)}
                        disabled={isCurrentWeekOrFuture}
                        className={`px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 transition ${
                          isCurrentWeekOrFuture
                            ? 'bg-slate-100 text-slate-400 cursor-default'
                            : 'bg-white hover:bg-slate-50 text-slate-700 cursor-pointer'
                        }`}
                      >
                        Current Week
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={markAllWeeklyPresent}
                        className="px-3 py-2 text-xs font-bold rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition cursor-pointer flex items-center gap-1"
                        title="Mark open past/current days as present"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Mark All Present (Open Days)
                      </button>

                      <button
                        type="button"
                        onClick={handleSaveWeeklyAttendance}
                        disabled={isSavingWeekly}
                        className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition shadow-xs disabled:opacity-50 cursor-pointer"
                      >
                        <Save className="w-4 h-4" />
                        {isSavingWeekly ? 'Saving...' : weeklySaveSuccess ? 'Saved!' : 'Save Weekly'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                  <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        Weekly Attendance Grid ({selectedClass?.name})
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        Official holidays and future dates are strictly locked and unpenalized. Click 'Edit' in column header to unlock marked days for corrections.
                      </p>
                    </div>
                  </div>

                  <div
                    onWheel={handleHorizontalWheel}
                    className="overflow-x-auto w-full scrollbar-thin relative"
                  >
                    <table className="w-full text-left text-xs min-w-[780px] border-collapse">
                      <thead className="sticky top-0 bg-slate-100 z-30">
                        <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                          <th className="py-3 px-3 text-center w-12 font-mono sticky left-0 bg-slate-100 z-40 shadow-[1px_0_0_0_#e5e7eb]">Roll</th>
                          <th className="py-3 px-4 min-w-[180px] md:min-w-[220px] sticky left-12 bg-slate-100 z-40 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Student Name</th>
                          {weekDays.map(d => {
                            const lockStatus = attendanceLocks.getDateLockStatus(d.dateStr);
                            const isFuture = lockStatus.isFuture;
                            const isDayHoliday = lockStatus.isHoliday;
                            const holInfo = getHolidayInfo(d.dateStr);
                            const isDayRecorded = lockStatus.isRecorded;
                            const isDayLocked = lockStatus.isLocked;
                            const isDayEditing = lockStatus.canEdit && lockStatus.isUnlockedByPrincipal;
                            const isAltOff = isAlternateOffDay(selectedClass?.name || attendanceClassId, d.dateStr);
                            const recForDay = classAttendanceConfig?.dailyRecords?.[d.dateStr];
                            const hasDayMarks = Boolean(
                              recForDay &&
                              !recForDay.isHoliday &&
                              (recForDay.markedAt ||
                                (recForDay.presentStudentIds && recForDay.presentStudentIds.length > 0) ||
                                (recForDay.absentStudentIds && recForDay.absentStudentIds.length > 0) ||
                                (recForDay.statusMap && Object.keys(recForDay.statusMap).length > 0))
                            );
                            const isUnmarkedAltOff = isAltOff && !hasDayMarks && !isDayHoliday && !isFuture;

                            return (
                              <th
                                key={d.dateStr}
                                className={`py-3 px-2 text-center min-w-[80px] transition-colors ${
                                  isDayHoliday
                                    ? 'bg-amber-100/90 text-amber-950 border-b-2 border-amber-300'
                                    : isUnmarkedAltOff
                                    ? 'bg-slate-100/80 text-slate-500 border-b-2 border-slate-200'
                                    : isFuture
                                    ? 'bg-slate-100/70 text-slate-400'
                                    : isDayLocked
                                    ? 'bg-emerald-50/70 text-emerald-950'
                                    : isDayEditing
                                    ? 'bg-amber-50/70 text-amber-950'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                <div className="flex items-center justify-center gap-1">
                                  <span className="text-[11px] font-bold">{d.dayName}</span>
                                  {isDayHoliday ? (
                                    <span title="Official Holiday">🏖️</span>
                                  ) : (
                                    <>
                                      {isFuture && <Lock className="w-3 h-3 text-slate-400" />}
                                      {isDayLocked && <CheckCircle className="w-3 h-3 text-emerald-600" />}
                                    </>
                                  )}
                                </div>
                                <div className="text-[10px] font-mono text-slate-500">{d.shortDate}</div>

                                <div className="mt-1">
                                  {isDayHoliday ? (
                                    <div className="space-y-0.5">
                                      <span className="inline-block text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 truncate max-w-[74px]" title={holInfo?.reason}>
                                        {holInfo?.reason ? (holInfo.reason.length > 10 ? holInfo.reason.slice(0, 9) + '…' : holInfo.reason) : 'Holiday'}
                                      </span>
                                    </div>
                                  ) : isFuture ? (
                                    <span className="inline-block text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-500 uppercase tracking-wider">
                                      Future
                                    </span>
                                  ) : isUnmarkedAltOff ? (
                                    <div className="space-y-0.5">
                                      <span
                                        className="inline-block text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 uppercase tracking-wider shadow-2xs"
                                        title="Scheduled Off-Day (No attendance recorded)"
                                      >
                                        OFF-DAY
                                      </span>
                                    </div>
                                  ) : isDayLocked ? (
                                    <div className="space-y-0.5">
                                      {getRequestForDate(d.dateStr, attendanceClassId)?.status === 'pending' ? (
                                        <span className="inline-flex items-center gap-0.5 text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-950 border border-amber-300 shadow-2xs" title="Unlock request pending Principal approval">
                                          Pending
                                        </span>
                                      ) : (
                                        <div className="flex items-center justify-center gap-1">
                                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                                            Locked
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setSelectedAttendanceDate(d.dateStr);
                                              handleOpenUnlockModal(d.dateStr);
                                            }}
                                            className="text-[9px] text-amber-800 hover:text-amber-950 underline font-bold cursor-pointer flex items-center gap-0.5"
                                            title={`Request Principal to unlock ${d.dayName} for corrections`}
                                          >
                                            <Key className="w-2.5 h-2.5 text-amber-600" />
                                            <span>Unlock</span>
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  ) : isDayEditing ? (
                                    <div className="flex items-center justify-center gap-1">
                                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                                        Editing
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => handleRelockDate(d.dateStr)}
                                        className="text-[9px] text-slate-500 hover:text-slate-700 underline cursor-pointer"
                                        title="Cancel editing and lock"
                                      >
                                        Re-lock
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="space-y-0.5">
                                      <span className="inline-block text-[9px] font-medium px-1.5 py-0.5 rounded bg-slate-200/60 text-slate-600">
                                        Open
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </th>
                            );
                          })}
                          <th className="py-3 px-3 text-center min-w-[80px]">Week Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {classStudents.map(st => {
                          const studentWeek = weeklyStatusMap[st.id] || {};
                          const elapsedWorkingDays = weekDays.filter(d => {
                            if (d.dateStr > todayStr) return false;
                            if (isDateHoliday(d.dateStr, attendanceClassId)) return false;
                            const isAltOff = isAlternateOffDay(selectedClass?.name || attendanceClassId, d.dateStr);
                            const recForDay = classAttendanceConfig?.dailyRecords?.[d.dateStr];
                            const hasDayMarks = Boolean(
                              recForDay &&
                              !recForDay.isHoliday &&
                              (recForDay.markedAt ||
                                (recForDay.presentStudentIds && recForDay.presentStudentIds.length > 0) ||
                                (recForDay.absentStudentIds && recForDay.absentStudentIds.length > 0) ||
                                (recForDay.statusMap && Object.keys(recForDay.statusMap).length > 0))
                            );
                            if (isAltOff && !hasDayMarks) return false;
                            return true;
                          });
                          let weekPresentCount = 0;
                          elapsedWorkingDays.forEach(d => {
                            if (studentWeek[d.dateStr] !== false) weekPresentCount++;
                          });
                          const isDupAdm =
                            (teacherAdmCounts.get(String(st.admissionNo || '').trim().toLowerCase()) || 0) > 1;

                          return (
                            <tr
                              key={st.id}
                              className={`transition group ${
                                isDupAdm
                                  ? 'bg-red-50/90 hover:bg-red-100/70'
                                  : 'hover:bg-slate-50/80 bg-white'
                              }`}
                            >
                              <td
                                className={`py-3 px-3 text-center font-mono font-bold text-slate-600 w-12 sticky left-0 z-20 shadow-[1px_0_0_0_#e5e7eb] ${
                                  isDupAdm ? 'bg-red-50 group-hover:bg-red-100' : 'bg-white group-hover:bg-slate-50'
                                }`}
                              >
                                {st.rollNo}
                              </td>
                              <td
                                className={`py-3 px-4 whitespace-nowrap min-w-[180px] md:min-w-[220px] sticky left-12 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${
                                  isDupAdm ? 'bg-red-50 group-hover:bg-red-100' : 'bg-white group-hover:bg-slate-50'
                                }`}
                              >
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold text-slate-900">{st.nameEn}</span>
                                  {isDupAdm && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-red-100 text-red-700 border border-red-300 shadow-2xs">
                                      ⚠️ Duplicate Adm No
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-500 font-mono mt-0.5 flex items-center gap-1.5">
                                  <span>Adm:</span>
                                  <span
                                    className={
                                      isDupAdm
                                        ? 'text-red-700 bg-red-100 px-1 rounded font-bold border border-red-200'
                                        : ''
                                    }
                                  >
                                    {st.admissionNo}
                                  </span>
                                  {isDupAdm && (
                                    <span
                                      className="ml-1.5 px-1.5 py-0.2 rounded text-[9px] font-bold text-red-700 bg-red-100 border border-red-200"
                                      title="Duplicate admission number - contact Principal to resolve"
                                    >
                                      Duplicate
                                    </span>
                                  )}
                                </div>
                              </td>

                              {weekDays.map(d => {
                                const isFuture = d.dateStr > todayStr;
                                const isDayHoliday = isDateHoliday(d.dateStr);
                                const holInfo = getHolidayInfo(d.dateStr);
                                const isDayRecorded = isDateRecorded(d.dateStr);
                                const isDayLocked = isDateLocked(d.dateStr);
                                const isPres = studentWeek[d.dateStr] !== false;

                                if (isDayHoliday) {
                                  return (
                                    <td key={d.dateStr} className="py-2 px-1.5 text-center bg-amber-50/40">
                                      <div
                                        className="min-h-10 min-w-10 w-10 h-10 rounded-xl mx-auto flex flex-col items-center justify-center border border-amber-200 bg-amber-100/70 text-amber-800 text-[10px] font-bold select-none cursor-not-allowed opacity-90"
                                        title={`Official Holiday: ${holInfo?.reason || 'Non-working day'}. Attendance exempt.`}
                                      >
                                        <span className="text-xs">🏖️</span>
                                        <span className="text-[8px] font-bold uppercase tracking-wider">OFF</span>
                                      </div>
                                    </td>
                                  );
                                }

                                if (isFuture) {
                                  return (
                                    <td key={d.dateStr} className="py-2 px-1.5 text-center bg-slate-50/50">
                                      <div
                                        className="min-h-10 min-w-10 w-10 h-10 rounded-xl mx-auto flex items-center justify-center border border-slate-200 bg-slate-100 text-slate-400 opacity-40 cursor-not-allowed pointer-events-none select-none"
                                        title="Future day locked - Advance marking prohibited"
                                      >
                                        <Lock className="w-4 h-4 text-slate-400" />
                                      </div>
                                    </td>
                                  );
                                }

                                const isAltOff = isAlternateOffDay(selectedClass?.name || attendanceClassId, d.dateStr);
                                const recForDay = classAttendanceConfig?.dailyRecords?.[d.dateStr];
                                const hasDayMarks = Boolean(
                                  recForDay &&
                                  !recForDay.isHoliday &&
                                  (recForDay.markedAt ||
                                    (recForDay.presentStudentIds && recForDay.presentStudentIds.length > 0) ||
                                    (recForDay.absentStudentIds && recForDay.absentStudentIds.length > 0) ||
                                    (recForDay.statusMap && Object.keys(recForDay.statusMap).length > 0))
                                );
                                const isUnmarkedAltOff = isAltOff && !hasDayMarks;

                                if (isUnmarkedAltOff) {
                                  return (
                                    <td key={d.dateStr} className="py-2 px-1.5 text-center bg-slate-50/60">
                                      <div
                                        className="min-h-10 min-w-10 w-10 h-10 rounded-xl mx-auto flex flex-col items-center justify-center border border-slate-200 bg-slate-100/90 text-slate-500 text-[9px] font-bold select-none cursor-default shadow-2xs"
                                        title={`${selectedClass?.name || 'Class'}: Scheduled Off-Day (${d.dayName})`}
                                      >
                                        <span className="text-[8px] font-bold uppercase tracking-wider text-slate-500">OFF-DAY</span>
                                      </div>
                                    </td>
                                  );
                                }

                                if (isDayLocked) {
                                  return (
                                    <td key={d.dateStr} className="py-2 px-1.5 text-center bg-emerald-50/20">
                                      <div
                                        className={`min-h-10 min-w-10 w-10 h-10 rounded-xl mx-auto flex items-center justify-center border select-none cursor-not-allowed opacity-90 ${
                                          isPres
                                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                            : 'bg-rose-100 text-rose-800 border-rose-300'
                                        }`}
                                        title={`${st.nameEn}: ${d.dayName} (${isPres ? 'Present' : 'Absent'}) - Locked to prevent double entry. Click 'Edit' in column header to unlock.`}
                                      >
                                        {isPres ? (
                                          <Check className="w-4 h-4 stroke-[3]" />
                                        ) : (
                                          <X className="w-4 h-4 stroke-[3]" />
                                        )}
                                      </div>
                                    </td>
                                  );
                                }

                                return (
                                  <td key={d.dateStr} className="py-2 px-1.5 text-center">
                                    <button
                                      type="button"
                                      onClick={() => toggleWeeklyStudentDay(st.id, d.dateStr)}
                                      className={`min-h-10 min-w-10 w-10 h-10 rounded-xl mx-auto flex items-center justify-center transition-all cursor-pointer border ${
                                        isPres
                                          ? 'bg-emerald-700 text-white border-emerald-800 shadow-2xs hover:bg-emerald-600'
                                          : 'bg-rose-50 text-rose-600 border-rose-300 hover:bg-rose-100'
                                      }`}
                                      title={`${st.nameEn}: ${d.dayName} ${isPres ? 'Present' : 'Absent'}`}
                                    >
                                      {isPres ? (
                                        <Check className="w-4 h-4 stroke-[3]" />
                                      ) : (
                                        <X className="w-4 h-4 stroke-[3]" />
                                      )}
                                    </button>
                                  </td>
                                );
                              })}

                              <td className="py-3 px-3 text-center">
                                {elapsedWorkingDays.length > 0 ? (
                                  <span
                                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold ${
                                      weekPresentCount === elapsedWorkingDays.length
                                        ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                                        : 'bg-amber-100 text-amber-900 border border-amber-200'
                                    }`}
                                  >
                                    {weekPresentCount} / {elapsedWorkingDays.length}
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                                    Holiday Week
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
            )}

            {/* SECTION: MONTH-WISE ATTENDANCE OVERVIEW SHEET */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-4">
              <div className="p-5 border-b border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="p-1 rounded-lg bg-emerald-100 text-emerald-800">
                      <Users className="w-4 h-4" />
                    </span>
                    <h3 className="text-base font-bold text-slate-900">
                      Month-wise Attendance Overview (Academic Year 2026–2027)
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Class-wide monthly breakdown showing total working days, days attended, and monthly percentages for {selectedClass?.name}.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold px-3 py-1 bg-white border border-slate-200 rounded-xl text-slate-700">
                    Total Strength: {classStudents.length} Students
                  </span>
                </div>
              </div>

              <div
                onWheel={handleHorizontalWheel}
                className="overflow-x-auto w-full scrollbar-thin px-4 pb-4 relative"
              >
                <table className="w-full text-left text-xs min-w-[850px] border-collapse">
                  <thead className="sticky top-0 bg-slate-100 z-30">
                    <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                      <th className="py-2.5 px-3 text-center w-12 font-mono sticky left-0 bg-slate-100 z-40 shadow-[1px_0_0_0_#e5e7eb]">Roll</th>
                      <th className="py-2.5 px-4 min-w-[180px] md:min-w-[220px] sticky left-12 bg-slate-100 z-40 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Student Name</th>
                      <th className="py-2.5 px-2 font-mono text-center w-20">Adm No</th>
                      {academicMonths.map(m => (
                        <th key={m.key} className="py-2.5 px-3 text-center min-w-[90px]">
                          <div>{m.monthEn.replace(/\s\d{4}$/, '')}</div>
                          <div className="text-[10px] text-slate-400 font-normal">({m.working}d)</div>
                        </th>
                      ))}
                      <th className="py-2.5 px-4 text-center min-w-[100px]">Total Attended</th>
                      <th className="py-2.5 px-4 text-right min-w-[80px]">Overall %</th>
                      <th className="py-2.5 px-3 text-center min-w-[90px]">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {classStudents.map(st => {
                      const breakdown = getStudentMonthlyBreakdown(st);

                      return (
                        <tr key={st.id} className="hover:bg-slate-50 transition group">
                          <td className="py-3 px-3 text-center font-mono font-bold text-slate-600 w-12 sticky left-0 z-20 shadow-[1px_0_0_0_#e5e7eb] bg-white group-hover:bg-slate-50">
                            {st.rollNo}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap min-w-[180px] md:min-w-[220px] sticky left-12 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] bg-white group-hover:bg-slate-50">
                            <div className="font-bold text-slate-900">{st.nameEn}</div>
                            {st.nameMl && (
                              <div className="text-[10px] text-slate-500 font-ml">{st.nameMl}</div>
                            )}
                          </td>
                          <td className="py-3 px-2 text-center font-mono font-bold text-slate-700 w-20">
                            {st.admissionNo}
                          </td>

                          {breakdown.months.map(m => (
                            <td key={m.key} className="py-3 px-3 text-center font-mono">
                              <div className="font-bold text-slate-800">
                                {m.attended} / {m.working}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {m.percentage}%
                              </div>
                            </td>
                          ))}

                          <td className="py-3 px-4 text-center font-mono font-bold text-emerald-950">
                            {breakdown.totalAttended} / {breakdown.totalWorking}
                          </td>

                          <td className="py-3 px-4 text-right font-mono font-black text-slate-900">
                            {breakdown.overallPercentage}%
                          </td>

                          <td className="py-3 px-3 text-center">
                            <span
                              className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                Number(breakdown.overallPercentage) >= 80
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {Number(breakdown.overallPercentage) >= 80 ? 'Regular' : 'Regularity Req.'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="p-4 bg-slate-50/50 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">Class Enrolled</span>
                  <span className="text-lg font-black text-slate-900 font-mono mt-0.5 block">{classStudents.length}</span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">Total Working Days</span>
                  <span className="text-lg font-black text-emerald-900 font-mono mt-0.5 block">{totalEffectiveWorking} Days</span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">Current Academic Term</span>
                  <span className="text-xs font-bold text-slate-800 mt-1 block">Term 1 (2026–27)</span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">Min. Exam Requirement</span>
                  <span className="text-xs font-bold text-emerald-700 mt-1 block">80% Attendance</span>
                </div>
              </div>
            </div>

          </div>
        );
      })()}

      {/* ATTENDANCE UNLOCK / EDIT REQUEST MODAL */}
      {isRequestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 border border-amber-300 flex items-center justify-center text-lg text-amber-900 shadow-2xs">
                  <Unlock className="w-5 h-5 text-amber-700" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Request Attendance Unlock
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    {classes.find(c => c.id === attendanceClassId)?.name || 'Class'} · {unlockMode === 'range' ? `${rangeStartDate} to ${rangeEndDate}` : singleUnlockDate}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRequestModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitEditRequest} className="space-y-4">
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 leading-relaxed">
                <p>
                  Attendance for <strong>{unlockMode === 'range' ? `${rangeStartDate} to ${rangeEndDate}` : singleUnlockDate}</strong> is currently locked. Submitting this request sends an alert directly to <strong>Principal ASLAM TK</strong>. Once approved, the toggles will automatically unlock for you to make corrections and save.
                </p>
              </div>

              {/* Unlock Selection Mode Dropdown */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Unlock Selection Mode
                </label>
                <select
                  value={unlockMode}
                  onChange={e => setUnlockMode(e.target.value as 'single' | 'range')}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-bold bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
                >
                  <option value="single">Single Date</option>
                  <option value="range">Multi-Date / Date Range (e.g. for multiple days or full week)</option>
                </select>
              </div>

              {/* Dynamic Date Inputs based on Selection Mode */}
              {unlockMode === 'single' ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    Target Date to Unlock:
                  </label>
                  <input
                    type="date"
                    name="targetDate"
                    value={singleUnlockDate}
                    min="2026-06-01"
                    max={new Date().toISOString().split('T')[0]}
                    onChange={e => setSingleUnlockDate(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-bold bg-white text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                    required
                  />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">
                      Starting Date:
                    </label>
                    <input
                      type="date"
                      name="startDate"
                      value={rangeStartDate}
                      min="2026-06-01"
                      max={new Date().toISOString().split('T')[0]}
                      onChange={e => {
                        const val = e.target.value;
                        setRangeStartDate(val);
                        if (rangeEndDate && val > rangeEndDate) {
                          setRangeEndDate(val);
                        }
                      }}
                      className="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-bold bg-white text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">
                      Ending Date:
                    </label>
                    <input
                      type="date"
                      name="endDate"
                      value={rangeEndDate}
                      min={rangeStartDate || "2026-06-01"}
                      max={new Date().toISOString().split('T')[0]}
                      onChange={e => setRangeEndDate(e.target.value)}
                      className="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-bold bg-white text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                      required
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Reason for Unlock / Correction: <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={requestReasonInput}
                  onChange={e => setRequestReasonInput(e.target.value)}
                  placeholder="e.g. Correct mistaken absence marking for Roll No 4, late admission updated, etc."
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Quick Reason Suggestions */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-500">Quick Reasons:</span>
                <div className="flex flex-wrap gap-1">
                  {[
                    'Correct mistaken absence marking',
                    'Student arrived late with valid excuse',
                    'Clerical error during morning roll call',
                    'Medical leave slip submitted today',
                  ].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setRequestReasonInput(preset)}
                      className="px-2 py-0.5 text-[10px] rounded-md bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-950 border border-slate-200 transition cursor-pointer"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsRequestModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingRequest || !requestReasonInput.trim()}
                  className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-xl transition shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>{isSubmittingRequest ? 'Submitting...' : 'Submit Unlock Request'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 5: CONSOLIDATED FEES & FINANCIAL LEDGER (CLASS IN-CHARGE & TUITION)
         ========================================================================= */}
      {activeTab === 'fees' && (
        <div className="space-y-6">
          {/* Header Card with Class Selector & Record Special Fee Button */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-xl bg-emerald-100 text-emerald-800">
                  <CreditCard className="w-5 h-5 text-emerald-800" />
                </span>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900">
                  {inChargeClass ? `Class Fees & Financial Ledger — ${inChargeClass.name}` : 'Class Fees & Financial Ledger'}
                </h2>
                {inChargeClass && (
                  <span className="hidden sm:inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                    Class In-Charge
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {feeSubTab === 'tuition_progress'
                  ? `Live status of ₹300 monthly installments for students in ${activeFeeClass?.name || 'Class'}.`
                  : `Special fee collection and receipts ledger strictly for ${inChargeClass?.name || 'your designated class'}.`}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {feeSubTab === 'tuition_progress' && (
                <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                  <label className="text-xs font-bold text-slate-700 whitespace-nowrap">Class:</label>
                  <select
                    value={feeClassId}
                    onChange={e => handleFeeClassChange(e.target.value)}
                    className="bg-white text-xs font-bold text-slate-800 py-1.5 px-2.5 rounded-lg border border-slate-300 focus:outline-emerald-600 cursor-pointer"
                  >
                    {classes.map(c => {
                      const isInCharge = inChargeClass && inChargeClass.id === c.id;
                      return (
                        <option key={c.id} value={c.id}>
                          {c.name} {isInCharge ? '★ (Class In-Charge)' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {inChargeClass && (
                <button
                  type="button"
                  onClick={() => setShowSpecialFeeModal(true)}
                  className="px-4 py-2.5 bg-purple-800 hover:bg-purple-900 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-2 transition cursor-pointer shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>Record Special Fee Payment</span>
                </button>
              )}
            </div>
          </div>

          {/* Sub-Toggles: Class Fee Payment Progress vs Special Fee Ledger */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setFeeSubTab('tuition_progress')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                feeSubTab === 'tuition_progress'
                  ? 'bg-emerald-800 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              <span>Class Fee Payment Progress</span>
            </button>
            {inChargeClass && (
              <button
                type="button"
                onClick={() => setFeeSubTab('special_fees')}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                  feeSubTab === 'special_fees'
                    ? 'bg-purple-800 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Tag className="w-4 h-4" />
                <span>Special Fee Ledger</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    feeSubTab === 'special_fees'
                      ? 'bg-purple-950 text-purple-200'
                      : 'bg-purple-100 text-purple-800'
                  }`}
                >
                  {inChargeClass.name}
                </span>
              </button>
            )}
          </div>

          {/* VIEW 1: TUITION INSTALLMENTS PROGRESS */}
          {feeSubTab === 'tuition_progress' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-emerald-800" />
                    Class Fee Payment Progress (12 Installments: June 2026 – May 2027)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Live status of ₹300 monthly installments for students in {activeFeeClass?.name || 'Class'}.
                  </p>
                </div>
              </div>

              {feeClassStudents.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs">
                  No students enrolled in {activeFeeClass?.name || 'this class'}.
                </div>
              ) : (
                <div
                  onWheel={handleHorizontalWheel}
                  className="border border-slate-200 rounded-xl overflow-x-auto relative w-full text-xs scrollbar-thin"
                >
                  <table className="w-full text-left border-collapse min-w-[950px]">
                    <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-2.5 text-center font-mono sticky left-0 z-20 bg-slate-50 w-12 border-r border-slate-200">
                          Roll
                        </th>
                        <th className="p-2.5 font-mono text-center sticky left-12 z-20 bg-slate-50 w-16 border-r border-slate-200">
                          Adm No
                        </th>
                        <th className="p-2.5 sticky left-28 z-20 bg-slate-50 min-w-[170px] border-r border-slate-200 shadow-sm">
                          Student Name
                        </th>
                        {TUITION_FEE_MONTHS.map(m => (
                          <th key={m} className="p-2 text-center font-medium text-[11px] w-14">
                            {m.slice(0, 3)}
                          </th>
                        ))}
                        <th className="p-2.5 text-center font-bold text-slate-900 border-l border-slate-200 w-16">
                          Paid
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {feeClassStudents.map(student => {
                        const paidMonths = studentPaidMonthsMap[student.id] || [];
                        const count = paidMonths.length;
                        return (
                          <tr key={student.id} className="hover:bg-slate-50 transition">
                            <td className="p-2 text-center font-mono font-bold text-slate-600 sticky left-0 z-10 bg-white border-r border-slate-200">
                              {student.rollNo}
                            </td>
                            <td className="p-2 text-center font-mono font-semibold text-slate-700 sticky left-12 z-10 bg-white border-r border-slate-200">
                              {student.admissionNo}
                            </td>
                            <td className="p-2 font-medium text-slate-900 sticky left-28 z-10 bg-white border-r border-slate-200 shadow-sm">
                              <span className="block truncate max-w-[160px] font-bold text-xs">{student.nameEn}</span>
                              {student.nameMl && (
                                <span className="block truncate max-w-[160px] text-[10px] text-slate-500 font-ml">
                                  {student.nameMl}
                                </span>
                              )}
                            </td>
                            {TUITION_FEE_MONTHS.map(m => {
                              const isPaid = paidMonths.includes(m);
                              return (
                                <td key={m} className="p-1.5 text-center">
                                  {isPaid ? (
                                    <span
                                      title={`${m}: Paid ₹300`}
                                      className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-emerald-600 text-white font-black text-[10px] shadow-xs"
                                    >
                                      ✓
                                    </span>
                                  ) : (
                                    <span
                                      title={`${m}: Unpaid`}
                                      className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-slate-100 text-slate-300 font-bold text-[10px]"
                                    >
                                      —
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                            <td className="p-2 text-center">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  count === 12
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : count > 0
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-slate-100 text-slate-500'
                                }`}
                              >
                                {count} / 12
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* VIEW 2: SPECIAL FEE LEDGER (RESTRICTED TO CLASS IN-CHARGE) */}
          {feeSubTab === 'special_fees' && (
            <div className="space-y-6">
              {!inChargeClass ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 text-center max-w-xl mx-auto shadow-xs">
                  <div className="w-16 h-16 rounded-2xl bg-purple-50 text-purple-700 mx-auto flex items-center justify-center mb-4">
                    <Tag className="w-8 h-8" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 mb-2">Class In-Charge Restricted Module</h2>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    The Special Fees ledger allows Class Teachers to collect Exam Fees, Council Funds, and Donations strictly for their designated class. You currently do not have a Class In-Charge assignment.
                  </p>
                </div>
              ) : (
                <>
                  {/* Single Prominent Top Summary Card */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-purple-100 text-purple-900 flex items-center justify-center shrink-0 shadow-inner">
                        <Tag className="w-7 h-7 text-purple-800" />
                      </div>
                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-purple-900/70 block">
                          Total Special Fees Collected ({inChargeClass.name})
                        </span>
                        <div className="text-2xl sm:text-3xl font-black font-mono text-purple-950 mt-0.5">
                          ₹{totalSpecialFeesCollected.toLocaleString('en-IN')}
                        </div>
                        <span className="text-xs text-slate-500 block mt-0.5">
                          {numberToWords(totalSpecialFeesCollected)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 border-t sm:border-t-0 sm:border-l border-slate-100 pt-3 sm:pt-0 sm:pl-6">
                      <div className="text-left sm:text-right">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Receipts Issued</span>
                        <span className="text-xl font-bold font-mono text-slate-800 block">
                          {classSpecialFeePayments.length}
                        </span>
                        <span className="text-[11px] text-emerald-600 font-medium block">
                          Active for {inChargeClass.name}
                        </span>
                      </div>

                      <div className="text-left sm:text-right border-l border-slate-100 pl-4">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Next Receipt No</span>
                        <span className="text-xl font-bold font-mono text-purple-900 block">
                          {specialFeeReceiptNo || '01'}
                        </span>
                        <span className="text-[11px] text-purple-600 font-medium block">
                          Series 01
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Full Width Special Fee Receipts Ledger */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-2">
                          <span>Special Fee Receipts Ledger</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800">
                            {inChargeClass.name}
                          </span>
                        </h3>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Listing all special fees collected for {inChargeClass.name}
                        </p>
                      </div>

                      {/* Search Filter & Record Button */}
                      <div className="flex items-center gap-2.5">
                        <div className="relative w-full sm:w-64">
                          <input
                            type="text"
                            value={specialFeeSearchQuery}
                            onChange={e => setSpecialFeeSearchQuery(e.target.value)}
                            placeholder="Search student, adm, receipt..."
                            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500"
                          />
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                          {specialFeeSearchQuery && (
                            <button
                              type="button"
                              onClick={() => setSpecialFeeSearchQuery('')}
                              className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                            >
                              ×
                            </button>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => setShowSpecialFeeModal(true)}
                          className="px-3.5 py-1.5 bg-purple-800 hover:bg-purple-900 text-white font-bold text-xs rounded-lg shadow-xs flex items-center gap-1.5 transition cursor-pointer shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Record Payment</span>
                        </button>
                      </div>
                    </div>

                    {/* Table View */}
                    <div className="overflow-x-auto border border-slate-200 rounded-xl scrollbar-thin">
                      {(() => {
                        const q = specialFeeSearchQuery.trim().toLowerCase();
                        const filtered = classSpecialFeePayments.filter(p => {
                          if (!q) return true;
                          const name = (p.studentName || '').toLowerCase();
                          const adm = (p.admissionNo || '').toLowerCase();
                          const rec = (p.receiptNo || '').toLowerCase();
                          const type = (p.specialFeeType || '').toLowerCase();
                          return name.includes(q) || adm.includes(q) || rec.includes(q) || type.includes(q);
                        });

                        if (filtered.length === 0) {
                          return (
                            <div className="p-8 text-center text-slate-400 text-xs">
                              {specialFeeSearchQuery
                                ? 'No receipts match your search term.'
                                : `No special fee receipts recorded yet for ${inChargeClass.name}.`}
                            </div>
                          );
                        }

                        return (
                          <table className="w-full text-left text-xs border-collapse">
                            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                              <tr>
                                <th className="p-2.5 text-center font-mono w-12">Roll</th>
                                <th className="p-2.5 font-mono text-center w-16">Adm No</th>
                                <th className="p-2.5 min-w-[150px]">Student Name</th>
                                <th className="p-2.5 min-w-[130px]">Fee Type</th>
                                <th className="p-2.5 font-mono text-right w-24">Amount</th>
                                <th className="p-2.5 font-mono text-center w-20">Receipt No</th>
                                <th className="p-2.5 font-mono text-center w-24">Date</th>
                                <th className="p-2.5 text-center w-16">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {filtered.map(p => {
                                const matchingStudent = inChargeStudents.find(
                                  s => s.id === p.studentId || s.admissionNo === p.admissionNo
                                );
                                const rollNo = matchingStudent?.rollNo || '—';
                                const pureName = (matchingStudent?.nameEn || p.studentName || '')
                                  .replace(/\s*-\s*Class.*$/i, '')
                                  .trim();
                                const feeAmount = p.specialFeeAmount || p.totalAmount || 0;
                                return (
                                  <tr key={p.id} className="hover:bg-purple-50/40 transition">
                                    <td className="p-2.5 text-center font-mono font-bold text-slate-600">
                                      {rollNo}
                                    </td>
                                    <td className="p-2.5 text-center font-mono font-semibold text-slate-700">
                                      {p.admissionNo}
                                    </td>
                                    <td className="p-2.5">
                                      <span className="font-bold text-slate-900 block">{pureName}</span>
                                      {matchingStudent?.nameMl && (
                                        <span className="text-[10px] text-slate-500 font-ml block">
                                          {matchingStudent.nameMl}
                                        </span>
                                      )}
                                    </td>
                                    <td className="p-2.5">
                                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-800 border border-purple-200">
                                        {p.specialFeeType || 'Special Fee'}
                                      </span>
                                    </td>
                                    <td className="p-2.5 text-right font-mono font-bold text-purple-950">
                                      ₹{feeAmount.toLocaleString('en-IN')}
                                    </td>
                                    <td className="p-2.5 text-center font-mono font-bold text-purple-900 bg-purple-50/30">
                                      {p.receiptNo}
                                    </td>
                                    <td className="p-2.5 text-center font-mono text-slate-600 text-[11px]">
                                      {p.date}
                                    </td>
                                    <td className="p-2.5 text-center">
                                      <button
                                        type="button"
                                        onClick={() => setActiveSpecialReceipt(p)}
                                        title="Print Official Receipt"
                                        className="p-1.5 rounded-lg text-slate-600 hover:text-purple-900 hover:bg-purple-100 transition inline-flex items-center justify-center cursor-pointer"
                                      >
                                        <Printer className="w-3.5 h-3.5" />
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        );
                      })()}
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                      <span>
                        Showing {classSpecialFeePayments.length} special fee receipts for {inChargeClass.name}
                      </span>
                      <span className="font-mono font-semibold text-purple-900">
                        Total: ₹{totalSpecialFeesCollected.toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          RECORD SPECIAL FEE PAYMENT MODAL DIALOG (OVERLAY)
         ========================================================================= */}
      {showSpecialFeeModal && inChargeClass && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden my-auto">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-purple-950 via-purple-900 to-indigo-950 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-purple-800/80 text-purple-200 border border-purple-700/50">
                  <CreditCard className="w-5 h-5 text-purple-200" />
                </span>
                <div>
                  <h3 className="font-bold text-base text-white">Record Special Fee Payment</h3>
                  <p className="text-xs text-purple-200/80">
                    Designated Class: <span className="font-bold text-amber-300">{inChargeClass.name}</span> • Next: Series 01 (#{specialFeeReceiptNo || '01'})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSpecialFeeModal(false)}
                className="p-1.5 rounded-lg text-purple-200 hover:text-white hover:bg-purple-800/60 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleRecordSpecialFee} className="p-5 sm:p-6 space-y-4">
              {/* Student Selection (Strictly inChargeStudents) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Select Student ({inChargeClass.name}) <span className="text-rose-500">*</span>
                </label>
                <select
                  value={specialFeeStudentId}
                  onChange={e => setSpecialFeeStudentId(e.target.value)}
                  required
                  className="w-full p-2.5 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
                >
                  <option value="">-- Choose Student ({inChargeStudents.length} Available) --</option>
                  {inChargeStudents.map(st => (
                    <option key={st.id} value={st.id}>
                      Roll #{st.rollNo} • {st.nameEn} (Adm: {st.admissionNo})
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Only students enrolled in your designated class ({inChargeClass.name}) are available.
                </span>
              </div>

              {/* Fee Type Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Fee Type <span className="text-rose-500">*</span>
                </label>
                <select
                  value={specialFeeType}
                  onChange={e => setSpecialFeeType(e.target.value as SpecialFeeType)}
                  required
                  className="w-full p-2.5 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-purple-500 focus:outline-none font-medium"
                >
                  {SPECIAL_FEE_TYPES.map(t => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              {/* Fee Amount with Quick Suggestion Buttons */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">
                    Fee Amount (₹) <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-medium">Click quick amounts or type</span>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400 font-mono text-sm">₹</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={specialFeeAmount || ''}
                    onChange={e => setSpecialFeeAmount(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    placeholder="e.g. 150"
                    required
                    className="w-full pl-8 pr-3 p-2.5 text-xs font-mono font-bold border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-purple-500 focus:outline-none text-slate-900"
                  />
                </div>
                {/* Quick Amount Suggestion Pills */}
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {[50, 100, 150, 200, 250, 500, 1000].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setSpecialFeeAmount(amt)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold transition cursor-pointer border ${
                        specialFeeAmount === amt
                          ? 'bg-purple-700 text-white border-purple-700 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      ₹{amt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment Mode Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Payment Mode
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Cash', 'UPI', 'Bank Transfer'] as const).map(mode => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setSpecialFeePaymentMode(mode)}
                      className={`py-2 px-3 rounded-xl text-xs font-bold text-center border transition cursor-pointer ${
                        specialFeePaymentMode === mode
                          ? 'bg-purple-100 text-purple-900 border-purple-400 ring-1 ring-purple-400 shadow-xs'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {/* Receipt Number & Date Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700">Receipt No</label>
                    <span className="text-[10px] text-purple-700 font-mono font-bold">Series 01</span>
                  </div>
                  <input
                    type="text"
                    value={specialFeeReceiptNo}
                    onChange={e => setSpecialFeeReceiptNo(e.target.value)}
                    placeholder="01"
                    required
                    className="w-full p-2.5 text-xs font-mono font-bold border border-slate-300 rounded-xl bg-purple-50/50 text-purple-950 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Payment Date</label>
                  <input
                    type="date"
                    value={specialFeeDate}
                    onChange={e => setSpecialFeeDate(e.target.value)}
                    required
                    className="w-full p-2.5 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Notes / Remarks */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Notes / Remarks (Optional)</label>
                <input
                  type="text"
                  value={specialFeeNotes}
                  onChange={e => setSpecialFeeNotes(e.target.value)}
                  placeholder="e.g. Paid in cash by parent"
                  className="w-full p-2.5 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
              </div>

              {/* Summary & Words */}
              <div className="p-3.5 rounded-xl bg-purple-950 text-white space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-purple-300 block uppercase font-bold tracking-wider">
                      Total Amount to Collect:
                    </span>
                    <span className="text-xl font-black font-mono text-amber-300">
                      ₹{(specialFeeAmount || 0).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <span className="px-2.5 py-1 rounded bg-purple-800 text-[10px] font-bold uppercase tracking-wider text-purple-200">
                    {specialFeeType}
                  </span>
                </div>
                <div className="text-[11px] text-purple-200/90 italic border-t border-purple-800/80 pt-1.5">
                  {numberToWords(specialFeeAmount || 0)}
                </div>
              </div>

              {/* Actions: Cancel & Save */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSpecialFeeModal(false)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingSpecialFee || !specialFeeStudentId || !specialFeeAmount || specialFeeAmount <= 0}
                  className="py-2.5 px-5 text-xs font-bold text-purple-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 rounded-xl transition shadow-xs flex items-center gap-2 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>
                    {isSubmittingSpecialFee
                      ? 'Recording & Generating...'
                      : `Save & Issue Receipt (₹${(specialFeeAmount || 0).toLocaleString('en-IN')})`}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 6: NEWS TAB (WITH CREATE CAPABILITY)
         ========================================================================= */}
      {activeTab === 'news' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Newspaper className="w-5 h-5 text-emerald-800" />
                  <h2 className="text-base sm:text-lg font-bold text-slate-900">
                    {isMl ? 'മദ്റസ വാർത്തകളും സർക്കുലറുകളും' : 'Madrasa News & Announcements'}
                  </h2>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Official circulars, academic notices, and fest announcements from Al-Madrasathul Islamiya Pallikkuth
                </p>
              </div>

              {/* Action Buttons: Create News & Category Filter */}
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowCreateNewsModal(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create News / Announcement</span>
                </button>

                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  {(['all', 'academic', 'events', 'general'] as const).map(tabKey => (
                    <button
                      key={tabKey}
                      type="button"
                      onClick={() => setNewsFilter(tabKey)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition capitalize cursor-pointer ${
                        newsFilter === tabKey
                          ? 'bg-emerald-800 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {tabKey}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* News Cards Feed */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-5">
              {newsList
                .filter(item => newsFilter === 'all' || item.categoryEn.toLowerCase() === newsFilter)
                .map(item => (
                  <div
                    key={item.id}
                    className="p-5 rounded-2xl border border-slate-200 bg-white hover:border-emerald-300 hover:shadow-xs transition flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                          {isMl ? item.categoryMl : item.categoryEn}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400">
                          {item.date}
                        </span>
                      </div>

                      <h3 className="font-bold text-slate-900 text-sm leading-snug">
                        {isMl ? item.titleMl : item.titleEn}
                      </h3>

                      <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                        {isMl ? item.summaryMl : item.summaryEn}
                      </p>
                    </div>

                    <div className="pt-4 mt-3 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[11px] text-slate-400 font-medium">
                        By {item.author}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedNews(item)}
                        className="text-xs font-bold text-emerald-800 hover:text-emerald-950 flex items-center gap-1 cursor-pointer"
                      >
                        <span>Read More</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* CREATE NEWS MODAL FOR TEACHERS */}
          {showCreateNewsModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
              <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
                  <div className="flex items-center gap-2">
                    <Plus className="w-4 h-4 text-emerald-800" />
                    <h3 className="text-sm font-bold text-slate-900">
                      Create News / Madrasa Announcement
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCreateNewsModal(false)}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handlePublishNews} className="space-y-3.5 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Announcement Title (English) *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Half-Yearly Examination Timetable Release"
                      value={newsFormData.titleEn}
                      onChange={e => setNewsFormData({ ...newsFormData, titleEn: e.target.value })}
                      className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-700 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Announcement Title (Malayalam)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. അർദ്ധവാർഷിക പരീക്ഷാ ടൈംടേബിൾ പ്രസിദ്ധീകരിച്ചു"
                      value={newsFormData.titleMl}
                      onChange={e => setNewsFormData({ ...newsFormData, titleMl: e.target.value })}
                      className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-700 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Category *</label>
                      <select
                        value={newsFormData.categoryEn}
                        onChange={e => {
                          const cat = e.target.value;
                          const catMl =
                            cat === 'Academic'
                              ? 'പരീക്ഷാ നിർവ്വഹണം'
                              : cat === 'Events'
                              ? 'ഇസ്ലാമിക പരിപാടികൾ'
                              : 'ഭരണനിർവ്വഹണം';
                          setNewsFormData({
                            ...newsFormData,
                            categoryEn: cat,
                            categoryMl: catMl,
                          });
                        }}
                        className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-700 focus:outline-none"
                      >
                        <option value="Academic">Academic</option>
                        <option value="Events">Events</option>
                        <option value="General">General</option>
                      </select>
                    </div>

                    <div className="flex items-center pt-6">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={newsFormData.isImportant}
                          onChange={e => setNewsFormData({ ...newsFormData, isImportant: e.target.checked })}
                          className="w-4 h-4 text-emerald-800 rounded focus:ring-emerald-700"
                        />
                        <span className="font-bold text-slate-700">Mark as Important</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Summary / Short Excerpt (English) *
                    </label>
                    <textarea
                      rows={2}
                      required
                      placeholder="Brief overview visible on the card feed..."
                      value={newsFormData.summaryEn}
                      onChange={e => setNewsFormData({ ...newsFormData, summaryEn: e.target.value })}
                      className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-700 focus:outline-none"
                    ></textarea>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Summary (Malayalam)
                    </label>
                    <textarea
                      rows={2}
                      placeholder="മലയാളത്തിലുള്ള സംഗ്രഹം..."
                      value={newsFormData.summaryMl}
                      onChange={e => setNewsFormData({ ...newsFormData, summaryMl: e.target.value })}
                      className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-700 focus:outline-none"
                    ></textarea>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Full Content / Details (English) *
                    </label>
                    <textarea
                      rows={4}
                      required
                      placeholder="Detailed announcement content..."
                      value={newsFormData.contentEn}
                      onChange={e => setNewsFormData({ ...newsFormData, contentEn: e.target.value })}
                      className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-700 focus:outline-none"
                    ></textarea>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Full Content (Malayalam)
                    </label>
                    <textarea
                      rows={3}
                      placeholder="വിശദമായ വാർത്ത മലയാളത്തിൽ..."
                      value={newsFormData.contentMl}
                      onChange={e => setNewsFormData({ ...newsFormData, contentMl: e.target.value })}
                      className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-700 focus:outline-none"
                    ></textarea>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCreateNewsModal(false)}
                      className="px-4 py-2 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingNews}
                      className="px-5 py-2 text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition font-bold disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shadow-xs"
                    >
                      <Save className="w-4 h-4" />
                      <span>{isSavingNews ? 'Publishing...' : 'Publish to Firestore'}</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* VIEW DETAILED NEWS MODAL */}
          {selectedNews && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
              <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[85vh] overflow-y-auto">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                    {isMl ? selectedNews.categoryMl : selectedNews.categoryEn}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedNews(null)}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="text-xs text-slate-400 font-mono mb-2">
                  Published: {selectedNews.date} • {selectedNews.author}
                </div>

                <h2 className="text-base font-bold text-slate-900 mb-3">
                  {isMl ? selectedNews.titleMl : selectedNews.titleEn}
                </h2>

                <div className="text-xs text-slate-600 leading-relaxed space-y-3">
                  <p className="font-semibold text-slate-800">
                    {isMl ? selectedNews.summaryMl : selectedNews.summaryEn}
                  </p>
                  <p className="whitespace-pre-line">
                    {isMl ? selectedNews.contentMl : selectedNews.contentEn}
                  </p>
                </div>

                <div className="pt-4 mt-6 border-t border-slate-200 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setSelectedNews(null)}
                    className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 7: NOTIFICATION TAB (Exact same UI as Parent Portal)
         ========================================================================= */}
      {activeTab === 'notification' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-emerald-800" />
                  <h2 className="text-base sm:text-lg font-bold text-slate-900">
                    {isMl ? 'അറിയിപ്പുകളും സന്ദേശങ്ങളും' : 'Notification Center & Alerts'}
                  </h2>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Real-time alerts, circular notices, and fee receipts for your classes and students
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setNotifications(prev => prev.map(n => ({ ...n, read: true })))}
                  className="px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 border border-emerald-300 rounded-lg transition cursor-pointer"
                >
                  {isMl ? 'എല്ലാം വായിച്ചതായി അടയാളപ്പെടുത്തുക' : 'Mark All as Read'}
                </button>
              </div>
            </div>

            {/* Notifications List */}
            <div className="divide-y divide-slate-100 pt-2">
              {notifications.map(notif => (
                <div
                  key={notif.id}
                  onClick={() => setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n))}
                  className={`p-4 rounded-xl transition flex items-start justify-between gap-3 cursor-pointer ${
                    notif.read ? 'bg-white hover:bg-slate-50' : 'bg-emerald-50/50 hover:bg-emerald-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                        notif.type === 'exam'
                          ? 'bg-amber-100 text-amber-800'
                          : notif.type === 'fee'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {notif.type === 'exam' ? (
                        <Award className="w-4 h-4" />
                      ) : notif.type === 'fee' ? (
                        <CreditCard className="w-4 h-4" />
                      ) : (
                        <Bell className="w-4 h-4" />
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className={`text-xs font-bold ${notif.read ? 'text-slate-800' : 'text-slate-900'}`}>
                          {isMl ? notif.titleMl : notif.titleEn}
                        </h4>
                        {!notif.read && (
                          <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0"></span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        {isMl ? notif.descMl : notif.descEn}
                      </p>
                      <span className="text-[10px] text-slate-400 font-mono mt-1.5 block">
                        {notif.time}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 8: CONTACT TAB (Exact same Madrasa contact card UI as Parent Portal)
         ========================================================================= */}
      {activeTab === 'contact' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <PhoneCall className="w-5 h-5 text-emerald-800" />
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  {isMl ? 'മദ്റസ ഓഫീസ് ബന്ധപ്പെടാനുള്ള വിവരങ്ങൾ' : 'Madrasa Contact & Helpdesk'}
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Reach out to the Principal and administration for admissions, fees, and examination inquiries
              </p>
            </div>

            {/* Primary Madrasa Contact Card */}
            <div className="bg-gradient-to-r from-emerald-950 to-emerald-900 text-white rounded-2xl p-6 relative overflow-hidden shadow-sm">
              <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                <GraduationCap className="w-48 h-48" />
              </div>

              <div className="relative z-10 space-y-4">
                <div className="font-serif text-emerald-300 text-sm font-bold" dir="rtl">
                  بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
                </div>

                <div>
                  <h3 className="text-xl sm:text-2xl font-black font-serif text-white">
                    Al-Madrasathul Islamiya Pallikkuth
                  </h3>
                  <h4 className="text-sm font-bold text-emerald-200 mt-0.5">
                    അൽ മദ്റസത്തുൽ ഇസ്ലാമിയ്യ പള്ളിക്കുത്ത്
                  </h4>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="bg-emerald-900/90 border border-emerald-400/50 text-emerald-200 px-2.5 py-0.5 rounded-full text-[11px] font-semibold flex items-center gap-1 shadow-2xs">
                      <ShieldCheck className="w-3 h-3 text-emerald-300" />
                      <span>KMEB-affiliated</span>
                    </span>
                    <span className="bg-amber-400/20 border border-amber-300/50 text-amber-200 px-2.5 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1 shadow-2xs">
                      <Award className="w-3 h-3 text-amber-300" />
                      <span>A+ Accreditation</span>
                    </span>
                    <span className="text-xs text-emerald-300/80 font-mono">
                      Reg: KEC-8492
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-100/90 leading-relaxed mt-2 max-w-2xl">
                    Committed to excellence in Islamic education through innovative teaching methods, modern educational technology, and student-centered moral development.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-emerald-800/80 text-xs">
                  {/* Address */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-emerald-300 font-bold uppercase text-[10px] tracking-wider">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>Address</span>
                    </div>
                    <p className="text-white font-medium">
                      Pattikkad P.O, Malappuram Dt.
                    </p>
                    <p className="text-emerald-200/80 text-[11px]">
                      Kerala, India – 679325
                    </p>
                  </div>

                  {/* Phone */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-emerald-300 font-bold uppercase text-[10px] tracking-wider">
                      <Phone className="w-3.5 h-3.5" />
                      <span>Phone / WhatsApp</span>
                    </div>
                    <a
                      href="tel:9447485432"
                      className="text-white font-bold font-mono text-sm hover:underline block"
                    >
                      9447 485 432
                    </a>
                    <p className="text-emerald-200/80 text-[11px]">
                      Direct Office Line
                    </p>
                  </div>

                  {/* Email */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-emerald-300 font-bold uppercase text-[10px] tracking-wider">
                      <Mail className="w-3.5 h-3.5" />
                      <span>Email Address</span>
                    </div>
                    <a
                      href="mailto:amipallikkuth@gmail.com"
                      className="text-white font-semibold hover:underline block break-all text-xs"
                    >
                      amipallikkuth@gmail.com
                    </a>
                    <p className="text-emerald-200/80 text-[11px]">
                      Official Correspondence
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Principal Info & Timings Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                <div className="flex items-center gap-2">
                  <UserIcon className="w-4 h-4 text-emerald-800" />
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Sadr Muallim / Principal
                  </span>
                </div>
                <div className="text-base font-bold text-slate-900">
                  ASLAM TK (അസ്‌ലം ടി.കെ.)
                </div>
                <p className="text-xs text-slate-500">
                  Available for consultation regarding student performance and moral training.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-800" />
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Office Working Hours
                  </span>
                </div>
                <div className="text-xs font-semibold text-slate-800">
                  Sat – Wed: 07:00 AM – 12:30 PM &amp; 04:30 PM – 06:30 PM
                </div>
                <div className="text-xs text-slate-600">
                  Thursday: 07:00 AM – 11:30 AM • Friday: Closed (Jum'ah)
                </div>
              </div>
            </div>

            {/* Direct Action Buttons */}
            <div className="flex flex-wrap items-center gap-3">
              <a
                href="tel:9447485432"
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-800 text-white font-bold text-xs rounded-xl hover:bg-emerald-900 transition shadow-xs"
              >
                <Phone className="w-4 h-4" />
                <span>Call 9447 485 432</span>
              </a>

              <a
                href="mailto:amipallikkuth@gmail.com"
                className="flex items-center gap-2 px-4 py-2.5 bg-white text-slate-700 font-bold text-xs rounded-xl border border-slate-300 hover:bg-slate-50 transition"
              >
                <Mail className="w-4 h-4" />
                <span>Send Email</span>
              </a>

              <a
                href="https://wa.me/919447485432"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 text-emerald-900 font-bold text-xs rounded-xl border border-emerald-300 hover:bg-emerald-100 transition"
              >
                <ExternalLink className="w-4 h-4" />
                <span>WhatsApp Inquiry</span>
              </a>
            </div>

            {/* Send Query / Message Form */}
            <div className="pt-4 border-t border-slate-200 space-y-3">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                {isMl ? 'മദ്റസ ഓഫീസിലേക്ക് സന്ദേശം അയക്കുക' : 'Send a Message to Madrasa Office'}
              </h4>

              {contactSent ? (
                <div className="bg-emerald-50 border border-emerald-300 p-4 rounded-xl flex items-center gap-3 text-emerald-900 text-xs">
                  <CheckCircle className="w-5 h-5 text-emerald-700 shrink-0" />
                  <div>
                    <div className="font-bold">Message Submitted Successfully!</div>
                    <div className="mt-0.5 text-emerald-800">
                      Thank you. The Madrasa office has received your inquiry and will respond shortly.
                    </div>
                  </div>
                </div>
              ) : (
                <form
                  onSubmit={e => {
                    e.preventDefault();
                    if (contactMessage.trim()) {
                      setContactSent(true);
                      setTimeout(() => {
                        setContactSubject('');
                        setContactMessage('');
                        setContactSent(false);
                      }, 5000);
                    }
                  }}
                  className="space-y-3"
                >
                  <input
                    type="text"
                    placeholder="Subject (e.g. Academic syllabus query, Leave note, Exam verification)"
                    value={contactSubject}
                    onChange={e => setContactSubject(e.target.value)}
                    className="w-full text-xs p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-700 focus:outline-none"
                  />
                  <textarea
                    rows={3}
                    required
                    placeholder="Write your message or inquiry here..."
                    value={contactMessage}
                    onChange={e => setContactMessage(e.target.value)}
                    className="w-full text-xs p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-700 focus:outline-none"
                  ></textarea>
                  <button
                    type="submit"
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-800 text-white font-bold text-xs rounded-xl hover:bg-emerald-900 transition cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send Message</span>
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 9: ABOUT TAB (Exact same institutional description UI as Parent Portal)
         ========================================================================= */}
      {activeTab === 'about' && (
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-emerald-950 via-emerald-900 to-emerald-950 text-white rounded-3xl p-6 sm:p-8 shadow-md border border-emerald-800/80 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
              <GraduationCap className="w-64 h-64 text-emerald-300" />
            </div>

            <div className="relative z-10 space-y-6">
              {/* Bismillah Header */}
              <div className="text-center font-serif text-emerald-300 text-base sm:text-lg" dir="rtl">
                بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
              </div>

              {/* Top Header & Badges */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-emerald-800/80 pb-5">
                <div className="flex items-center gap-3.5">
                  <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center text-emerald-200 shadow-inner shrink-0">
                    <GraduationCap className="w-8 h-8" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold tracking-wider uppercase px-2.5 py-0.5 rounded-full bg-emerald-800/90 text-emerald-200 border border-emerald-700/60 flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                        <span>Institutional Overview</span>
                      </span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-bold font-serif text-white tracking-tight">
                      Al-Madrasathul Islamiya Pallikkuth
                    </h2>
                    <div className="text-xs sm:text-sm font-semibold text-emerald-200 font-mono mt-0.5 tracking-wider">
                      Reg No: KMEB/MPM/026/M0161/19
                    </div>
                    <p className="text-xs font-semibold text-emerald-300 tracking-wide mt-1">
                      Islamic Education &amp; Digital Learning
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:self-start">
                  <span className="bg-emerald-900/90 border border-emerald-400/50 text-emerald-200 px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 shadow-xs">
                    <ShieldCheck className="w-4 h-4 text-emerald-300" />
                    <span>KMEB-affiliated</span>
                  </span>
                  <span className="bg-amber-400/20 border border-amber-300/50 text-amber-200 px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-xs">
                    <Award className="w-4 h-4 text-amber-300" />
                    <span>A+ Accreditation</span>
                  </span>
                </div>
              </div>

              {/* Concise Statement */}
              <div className="bg-white/5 backdrop-blur-xs p-5 sm:p-6 rounded-2xl border border-white/10 space-y-3">
                <div className="text-xs uppercase font-bold tracking-wider text-emerald-300 flex items-center gap-2">
                  <BookOpen className="w-4 h-4" />
                  <span>OFFICIAL STATEMENT</span>
                </div>
                <p className="text-sm sm:text-base text-emerald-50 leading-relaxed font-sans">
                  Al-Madrasathul Islamiya Pallikkuth (KMEB-affiliated, A+ Accredited) blends traditional Islamic values with modern educational technology. We partner with parents and teachers to create an engaging, student-centered digital learning environment that nurtures academic excellence, moral character, and holistic development.
                </p>
              </div>

              {/* 3 Core Highlight Pillars */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-1 text-xs">
                <div className="bg-emerald-950/80 p-4 rounded-xl border border-emerald-800/60">
                  <div className="font-bold text-amber-300 flex items-center gap-1.5 mb-1.5 text-xs uppercase tracking-wider">
                    <Award className="w-4 h-4" />
                    <span>KMEB A+ Accredited</span>
                  </div>
                  <p className="text-xs text-emerald-200/90 leading-relaxed">
                    Certified with A+ grade by Kerala Madrasa Education Board for superior academic, ethical, and organizational standards.
                  </p>
                </div>

                <div className="bg-emerald-950/80 p-4 rounded-xl border border-emerald-800/60">
                  <div className="font-bold text-emerald-300 flex items-center gap-1.5 mb-1.5 text-xs uppercase tracking-wider">
                    <Sparkles className="w-4 h-4" />
                    <span>Modern Educational Tech</span>
                  </div>
                  <p className="text-xs text-emerald-200/90 leading-relaxed">
                    Digital learning content, multimedia classrooms, and computerized evaluation and mark management systems.
                  </p>
                </div>

                <div className="bg-emerald-950/80 p-4 rounded-xl border border-emerald-800/60">
                  <div className="font-bold text-teal-300 flex items-center gap-1.5 mb-1.5 text-xs uppercase tracking-wider">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Values &amp; Character</span>
                  </div>
                  <p className="text-xs text-emerald-200/90 leading-relaxed">
                    Nurturing deep Islamic moral values (akhlaq), Tajweed recitation, Subhi prayer habits, and active parent-teacher partnership.
                  </p>
                </div>
              </div>

              {/* Credentials Info Box */}
              <div className="bg-white/10 rounded-2xl p-4 sm:p-5 border border-white/10 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs text-emerald-100">
                <div>
                  <span className="text-[11px] text-emerald-400 font-bold block uppercase tracking-wider">Affiliation</span>
                  <span className="font-semibold text-white mt-0.5 block">Kerala Madrasa Education Board (KMEB)</span>
                </div>
                <div>
                  <span className="text-[11px] text-emerald-400 font-bold block uppercase tracking-wider">Accreditation</span>
                  <span className="font-semibold text-white mt-0.5 block">Mi'yar Grading A+ Accredited</span>
                </div>
                <div>
                  <span className="text-[11px] text-emerald-400 font-bold block uppercase tracking-wider">Campus Location</span>
                  <span className="font-semibold text-white mt-0.5 block">Pallikkuth, Pattikkad P.O, Malappuram Dt.</span>
                </div>
                <div>
                  <span className="text-[11px] text-emerald-400 font-bold block uppercase tracking-wider">Head of the Institution</span>
                  <span className="font-semibold text-white mt-0.5 block text-sm font-bold text-amber-200">ASLAM TK</span>
                </div>
              </div>

              {/* Social Media Section */}
              <div className="bg-white/5 backdrop-blur-xs p-5 sm:p-6 rounded-2xl border border-white/10 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                      <span>Follow us</span>
                    </h3>
                    <p className="text-xs text-emerald-100/80 mt-0.5">
                      Connect with Al-Madrasathul Islamiya Pallikkuth on our official social media channels
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <a
                    href="https://www.instagram.com/ami.pallikkuth?vrfl=Nmo4cGxnaDU0YTg1"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-700 to-green-600 hover:from-emerald-600 hover:to-green-500 text-white font-bold text-xs shadow-sm hover:shadow transition border border-emerald-500/40 group"
                  >
                    <Instagram className="w-4 h-4 text-emerald-200 group-hover:scale-110 transition-transform" />
                    <span>Instagram</span>
                    <ExternalLink className="w-3.5 h-3.5 text-emerald-200/70 ml-auto" />
                  </a>

                  <a
                    href="https://www.facebook.com/share/1DfZmA6LPT/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-700 to-green-600 hover:from-emerald-600 hover:to-green-500 text-white font-bold text-xs shadow-sm hover:shadow transition border border-emerald-500/40 group"
                  >
                    <Facebook className="w-4 h-4 text-emerald-200 group-hover:scale-110 transition-transform" />
                    <span>Facebook</span>
                    <ExternalLink className="w-3.5 h-3.5 text-emerald-200/70 ml-auto" />
                  </a>

                  <a
                    href="https://youtube.com/@amipallikkuth?si=Upv5bhFgIIK9LWgT"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-700 to-green-600 hover:from-emerald-600 hover:to-green-500 text-white font-bold text-xs shadow-sm hover:shadow transition border border-emerald-500/40 group"
                  >
                    <Youtube className="w-4 h-4 text-emerald-200 group-hover:scale-110 transition-transform" />
                    <span>YouTube</span>
                    <ExternalLink className="w-3.5 h-3.5 text-emerald-200/70 ml-auto" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          PRINTABLE OFFICIAL SPECIAL FEE RECEIPT MODAL
         ========================================================================= */}
      {activeSpecialReceipt && (() => {
        const matchingStudent = inChargeStudents.find(
          s => s.id === activeSpecialReceipt.studentId || s.admissionNo === activeSpecialReceipt.admissionNo
        );
        const pureStudentName =
          matchingStudent?.nameEn ||
          activeSpecialReceipt.studentName.replace(/\s*-\s*Class.*$/i, '').trim();
        const madrasaClassName =
          matchingStudent?.class ||
          activeSpecialReceipt.className ||
          inChargeClass?.name ||
          'Class';

        return (
          <div className="fee-receipt-modal fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 print:p-0 print:bg-transparent print:static print:inset-auto">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto print:border-none print:shadow-none print:max-h-none print:overflow-visible print:p-0 print:w-full print:max-w-none">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4 print:hidden">
                <span className="text-xs font-bold text-slate-700">Official Special Fee Receipt</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-purple-800 hover:bg-purple-900 rounded-lg cursor-pointer transition shadow-xs"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Print Receipt
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSpecialReceipt(null)}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Official Slip */}
              <div className="fee-receipt-slip bg-white text-slate-900 border-2 border-emerald-900 p-6 rounded-xl font-sans relative">
                {/* Header */}
                <div className="text-center border-b border-emerald-800 pb-3 mb-3">
                  <div className="font-serif text-emerald-900 text-sm font-bold" dir="rtl">
                    {institutionSettings?.madrasaArabicHeader || 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ'}
                  </div>
                  <h1 className="text-base font-black uppercase text-emerald-950 font-serif mt-1">
                    {institutionSettings?.institutionName || institutionSettings?.madrasaNameEn || 'Al-Madrasathul Islamiya Pallikkuth'}
                  </h1>
                  <h2 className="text-xs font-bold text-emerald-900">
                    {institutionSettings?.institutionNameMl || institutionSettings?.madrasaNameMl || 'അൽ മദ്റസത്തുൽ ഇസ്ലാമിയ്യ പള്ളിക്കുത്ത്'}
                  </h2>
                  <div className="text-[10px] font-semibold text-emerald-800 tracking-wide mt-0.5">
                    {institutionSettings?.institutionSubtitle || institutionSettings?.locationEn || 'Islamic Education & Digital Learning'}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Reg. No: {institutionSettings?.registrationNumber || institutionSettings?.registrationNo || 'KEC-8492'} • Official Fee Receipt (2026–2027)
                  </p>
                </div>

                {/* Receipt Details Header */}
                <div className="flex items-center justify-between text-xs mb-3 font-mono bg-purple-50/70 p-2 rounded-lg border border-purple-100">
                  <div>
                    <span className="text-slate-500">Receipt No: </span>
                    <strong className="text-purple-950 text-sm">{activeSpecialReceipt.receiptNo}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Date: </span>
                    <strong className="text-slate-800">{activeSpecialReceipt.date}</strong>
                  </div>
                </div>

                {/* Student Metadata */}
                <div className="text-xs space-y-1 mb-4 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Student Name:</span>
                    <strong className="text-slate-900">{pureStudentName}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Admission No:</span>
                    <span className="font-mono font-bold text-slate-800">{activeSpecialReceipt.admissionNo}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Class:</span>
                    <strong className="text-emerald-900">{madrasaClassName}</strong>
                  </div>
                </div>

                {/* Breakdown Table */}
                <table className="w-full text-xs mb-4 border-collapse">
                  <thead>
                    <tr className="border-b border-slate-300 text-slate-600 font-bold">
                      <th className="py-1.5 text-left">Description</th>
                      <th className="py-1.5 text-right">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="py-2 text-slate-800 font-medium">
                        Special Fee: {activeSpecialReceipt.specialFeeType || 'Special Fee'}
                      </td>
                      <td className="py-2 text-right font-mono font-bold">
                        ₹{activeSpecialReceipt.specialFeeAmount || activeSpecialReceipt.totalAmount}
                      </td>
                    </tr>
                    <tr className="border-t-2 border-emerald-900 font-bold">
                      <td className="py-2 text-emerald-950 uppercase text-xs">Total Received</td>
                      <td className="py-2 text-right font-mono text-emerald-950 text-sm font-black">
                        ₹{activeSpecialReceipt.totalAmount.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* In Words Amount */}
                <div className="text-sm font-medium text-gray-700 mb-2">
                  <span className="font-bold text-gray-800">In Words: </span>
                  {activeSpecialReceipt.amountInWords || numberToWords(activeSpecialReceipt.totalAmount)}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
