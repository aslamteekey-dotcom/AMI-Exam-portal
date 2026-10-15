import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Student,
  Examination,
  StudentProgressReport,
  InstitutionSettings,
  sortStudentsBoysFirst,
  TUITION_FEE_MONTHS,
  FeePayment,
  ClassAttendanceConfig,
} from '../../types';
import { ProgressReportCard } from '../Report/ProgressReportCard';
import {
  User,
  GraduationCap,
  FileText,
  AlertCircle,
  Calendar,
  Award,
  ChevronDown,
  CheckCircle2,
  Loader2,
  RotateCcw,
  CreditCard,
  Printer,
  X,
  Hash,
  Home,
  CalendarCheck,
  Newspaper,
  Bell,
  Phone,
  PhoneCall,
  Mail,
  MapPin,
  Clock,
  Megaphone,
  ArrowRight,
  ExternalLink,
  Search,
  CheckCircle,
  HelpCircle,
  Send,
  Sparkles,
  ShieldCheck,
  BookOpen,
  Instagram,
  Facebook,
  Youtube,
} from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase';

export type ParentPortalTab =
  | 'home'
  | 'about'
  | 'attendance'
  | 'report'
  | 'fees'
  | 'news'
  | 'notification'
  | 'contact';

interface NewsItem {
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
}

interface NotificationItem {
  id: string;
  titleEn: string;
  titleMl: string;
  descEn: string;
  descMl: string;
  time: string;
  type: 'exam' | 'fee' | 'circular' | 'academic';
  read: boolean;
}

export const ParentDashboard: React.FC = () => {
  const { user, fetchWithAuth, lang, t } = useAuth();
  const [loading, setLoading] = useState(true);
  const [children, setChildren] = useState<Student[]>([]);
  const [classesMap, setClassesMap] = useState<Record<string, string>>({});
  const [examinations, setExaminations] = useState<Examination[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>('');
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<ParentPortalTab>('home');
  const [childPayments, setChildPayments] = useState<FeePayment[]>([]);
  const [activeReceipt, setActiveReceipt] = useState<FeePayment | null>(null);
  const [settings, setSettings] = useState<InstitutionSettings | null>(null);
  const [attendanceConfigs, setAttendanceConfigs] = useState<Record<string, ClassAttendanceConfig>>({});

  // Notifications State
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

  // Selected news item for modal
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const [newsFilter, setNewsFilter] = useState<'all' | 'academic' | 'events' | 'general'>('all');

  // Contact form state
  const [contactSubject, setContactSubject] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSent, setContactSent] = useState(false);

  // Selected Report Data
  const [reportData, setReportData] = useState<{
    report: StudentProgressReport;
    settings: InstitutionSettings;
  } | null>(null);
  const [isUnpublished, setIsUnpublished] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [fetchingReport, setFetchingReport] = useState(false);

  const isMl = lang === 'ml';

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [resAuth, resClasses, resExams, resSettings] = await Promise.all([
        fetchWithAuth('/api/auth/me'),
        fetchWithAuth('/api/classes'),
        fetchWithAuth('/api/examinations'),
        fetchWithAuth('/api/settings'),
      ]);

      const authData = await resAuth.json();
      const classesData = await resClasses.json();
      const examsData: Examination[] = await resExams.json();
      const settingsData: InstitutionSettings = await resSettings.json();
      setSettings(settingsData);

      const cMap: Record<string, string> = {};
      classesData.forEach((c: any) => {
        cMap[c.id] = isMl ? c.nameMl : c.name;
      });
      setClassesMap(cMap);

      const rawKids: Student[] = authData.children || [];
      const sortedKids = sortStudentsBoysFirst(rawKids);
      setChildren(sortedKids);
      setExaminations(examsData);

      if (sortedKids.length > 0) {
        setSelectedChildId(sortedKids[0].id);
      }
      if (examsData.length > 0) {
        // Prefer published/approved exam first, otherwise first exam
        const publishedExam =
          examsData.find(
            e => e.isPublished || e.status === 'published' || e.status === 'approved' || e.status === 'completed'
          ) || examsData[0];
        setSelectedExamId(publishedExam.id);
      }
    } catch (err) {
      console.error('Error loading parent data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();

    const unsubs: (() => void)[] = [];

    // 1. Real-time Firestore listener for student register numbers & details
    try {
      const unsubStu = onSnapshot(collection(db, 'students'), snapshot => {
        if (!snapshot.empty) {
          const remoteList = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Student));
          setChildren(prev =>
            prev.map(child => {
              const remote = remoteList.find(r => r.id === child.id || r.admissionNo === child.admissionNo);
              if (remote) {
                const regNos = {
                  ...(child.examRegisterNumbers || {}),
                  ...((remote as any).examRegisterNumbers || {}),
                  ...((remote as any).examRegisterNos || {}),
                };
                return {
                  ...child,
                  ...remote,
                  examRegisterNumbers: regNos,
                  examRegisterNos: regNos,
                  examRegNo:
                    (remote as any).examRegNo ||
                    (remote as any).examRegisterNos?.[selectedExamId] ||
                    regNos[selectedExamId] ||
                    '',
                };
              }
              return child;
            })
          );
        }
      });
      unsubs.push(unsubStu);
    } catch (e) {
      console.warn('Real-time students listener error in ParentDashboard:', e);
    }

    // 2. Real-time Firestore listener for published examinations (listening to both 'exams' and 'examinations')
    try {
      const handleRemoteExams = (remoteExams: Examination[]) => {
        setExaminations(prev => {
          const map = new Map<string, Examination>();
          prev.forEach(e => map.set(e.id, e));
          remoteExams.forEach(e => {
            const existing = map.get(e.id);
            map.set(e.id, existing ? { ...existing, ...e } : e);
          });
          return Array.from(map.values());
        });
        if (selectedChildId && selectedExamId) {
          loadReport(selectedChildId, selectedExamId);
        }
      };

      const unsubExams = onSnapshot(collection(db, 'exams'), snapshot => {
        if (!snapshot.empty) {
          const remoteExams = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Examination));
          handleRemoteExams(remoteExams);
        }
      });
      unsubs.push(unsubExams);

      const unsubExaminations = onSnapshot(collection(db, 'examinations'), snapshot => {
        if (!snapshot.empty) {
          const remoteExams = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Examination));
          handleRemoteExams(remoteExams);
        }
      });
      unsubs.push(unsubExaminations);
    } catch (e) {
      console.warn('Real-time exams listener error in ParentDashboard:', e);
    }

    // 3. Real-time Firestore listener for marks: listen to published/approved marks for active child
    try {
      const unsubMarks = onSnapshot(collection(db, 'marks'), snapshot => {
        if (!snapshot.empty && selectedChildId && selectedExamId) {
          const activeChild = children.find(c => c.id === selectedChildId);
          if (activeChild) {
            const marksDocs = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as any));
            const studentMarks = marksDocs.filter(
              m =>
                m.studentId === activeChild.id ||
                m.admissionNo === activeChild.admissionNo ||
                m.studentMarks?.[activeChild.id] ||
                (activeChild.admissionNo && m.studentMarks?.[activeChild.admissionNo])
            );
            if (studentMarks.length > 0) {
              loadReport(activeChild.id, selectedExamId);
            }
          }
        }
      });
      unsubs.push(unsubMarks);
    } catch (e) {
      console.warn('Real-time marks listener error in ParentDashboard:', e);
    }

    // 4. Real-time Firestore listener for attendance records
    try {
      const unsubAttendance = onSnapshot(collection(db, 'attendance'), snapshot => {
        if (!snapshot.empty) {
          const attMap: Record<string, ClassAttendanceConfig> = {};
          snapshot.docs.forEach(docSnap => {
            attMap[docSnap.id] = { ...docSnap.data(), classId: docSnap.id } as ClassAttendanceConfig;
          });
          setAttendanceConfigs(attMap);
        }
      });
      unsubs.push(unsubAttendance);
    } catch (e) {
      console.warn('Real-time attendance listener error in ParentDashboard:', e);
    }

    const handleStudentsUpdated = (e: any) => {
      const list = e.detail;
      if (Array.isArray(list)) {
        setChildren(prev =>
          prev.map(child => {
            const found = list.find((s: Student) => s.id === child.id || s.admissionNo === child.admissionNo);
            if (found) {
              const regNos = {
                ...(child.examRegisterNumbers || {}),
                ...((found as any).examRegisterNumbers || {}),
                ...((found as any).examRegisterNos || {}),
              };
              return {
                ...child,
                ...found,
                examRegisterNumbers: regNos,
                examRegisterNos: regNos,
                examRegNo:
                  (found as any).examRegNo ||
                  (found as any).examRegisterNos?.[selectedExamId] ||
                  regNos[selectedExamId] ||
                  '',
              };
            }
            return child;
          })
        );
      }
    };
    window.addEventListener('madrasa_students_updated', handleStudentsUpdated);
    unsubs.push(() => window.removeEventListener('madrasa_students_updated', handleStudentsUpdated));

    const handleMarksUpdated = () => {
      if (selectedChildId && selectedExamId) {
        loadReport(selectedChildId, selectedExamId);
      }
    };
    window.addEventListener('madrasa_marks_updated', handleMarksUpdated);
    window.addEventListener('madrasa_exams_updated', handleMarksUpdated);
    unsubs.push(() => {
      window.removeEventListener('madrasa_marks_updated', handleMarksUpdated);
      window.removeEventListener('madrasa_exams_updated', handleMarksUpdated);
    });

    return () => {
      unsubs.forEach(u => {
        try {
          u();
        } catch {}
      });
    };
  }, [lang, selectedExamId, selectedChildId]);

  // Automatically fetch and load progress report card whenever selected student or examination changes
  const loadReport = async (childId: string, examId: string) => {
    if (!childId || !examId) return;
    setFetchingReport(true);
    setIsUnpublished(false);
    setReportError(null);

    try {
      const res = await fetchWithAuth(`/api/reports/student/${childId}/exam/${examId}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        if (errJson.isUnpublished) {
          setIsUnpublished(true);
        } else {
          setReportError(errJson.error || 'Unable to retrieve progress report');
        }
        setReportData(null);
        return;
      }
      const data = await res.json();
      // Normalize data: support data directly being the report or data containing { report, settings }
      const finalReport: StudentProgressReport = data.report || data;
      const finalSettings: InstitutionSettings = data.settings || settings || {
        madrasaNameEn: 'Al-Madrasathul Islamiya Pallikkuth',
        madrasaNameMl: 'അൽ മദ്റസത്തുൽ ഇസ്ലാമിയ്യ പള്ളിക്കുത്ത്',
        locationEn: 'Pallikkuth, Kerala',
        locationMl: 'പള്ളിക്കുത്ത്, കേരളം',
        registrationNo: 'KEC-8492',
        principalNameEn: 'ASLAM TK',
        principalNameMl: 'അസ്‌ലം ടി.കെ.',
      };

      setReportData({
        report: finalReport,
        settings: finalSettings,
      });

      // Flexible publication status:
      // Status is published, approved, or completed, or isPublished is true
      const isPublished = Boolean(
        data.isPublished ||
        finalReport.isPublished ||
        finalReport.examination?.isPublished ||
        finalReport.examination?.status === 'published' ||
        finalReport.examination?.status === 'approved' ||
        finalReport.examination?.status === 'completed'
      );
      setIsUnpublished(!isPublished);
    } catch (err: any) {
      setReportError(err.message || 'Network error');
      setReportData(null);
    } finally {
      setFetchingReport(false);
    }
  };

  const loadChildFees = async (childId: string) => {
    if (!childId) return;
    try {
      const res = await fetchWithAuth(`/api/fees/payments?studentId=${childId}`);
      if (res.ok) {
        const data = await res.json();
        setChildPayments(data);
      }
    } catch (e) {
      console.warn('Error loading child fees:', e);
    }
  };

  useEffect(() => {
    if (selectedChildId) {
      loadChildFees(selectedChildId);
    }
  }, [selectedChildId]);

  useEffect(() => {
    if (selectedChildId && selectedExamId) {
      loadReport(selectedChildId, selectedExamId);
    }
  }, [selectedChildId, selectedExamId]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-800 mr-3" />
        <span className="font-medium text-sm">Loading parent portal...</span>
      </div>
    );
  }

  const selectedChild = children.find(c => c.id === selectedChildId);
  const selectedExam = examinations.find(e => e.id === selectedExamId);

  const activeReport = reportData?.report;
  const isExamPublished = Boolean(
    selectedExam?.isPublished ||
    selectedExam?.status === 'published' ||
    selectedExam?.status === 'approved' ||
    selectedExam?.status === 'completed' ||
    activeReport?.isPublished ||
    activeReport?.examination?.isPublished ||
    activeReport?.examination?.status === 'published' ||
    activeReport?.examination?.status === 'approved' ||
    activeReport?.examination?.status === 'completed'
  );

  const hasMarks = Boolean(
    activeReport &&
    (activeReport.subjects?.some(s => s.obtainedMarks !== null && s.obtainedMarks !== undefined) ||
     (activeReport.totalObtainedMarks !== undefined && activeReport.totalObtainedMarks > 0) ||
     (activeReport.percentage !== null && activeReport.percentage !== undefined && Number(activeReport.percentage) > 0))
  );

  // As long as published status matches OR published marks exist for this student, render immediately
  const shouldShowReport = Boolean(activeReport && (isExamPublished || hasMarks));

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-emerald-900 to-emerald-800 text-white rounded-2xl p-4 sm:p-6 shadow-sm print:hidden max-w-full overflow-hidden box-border">
        <div className="text-center font-serif text-emerald-300 text-base mb-3" dir="rtl">
          بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
        </div>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 w-full max-w-full">
          <div className="min-w-0 max-w-full">
            <h1 className="text-xl md:text-2xl font-bold font-serif truncate">
              {isMl && user?.nameMl ? user.nameMl : user?.name}
            </h1>
            <p className="text-xs text-emerald-200 mt-1">
              {t.parentRole} • Al-Madrasathul Islamiya Pallikkuth
            </p>
            <p className="text-[11px] text-emerald-300 font-medium">
              Islamic Education &amp; Digital Learning
            </p>
            {selectedChild && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="bg-emerald-950/80 border border-emerald-400/50 text-emerald-200 px-3 py-1 rounded-full text-xs font-mono font-bold flex items-center gap-1.5 shadow-2xs max-w-full">
                  <Hash className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                  <span className="text-[10px] uppercase font-sans text-emerald-300 font-bold shrink-0">Exam Reg No:</span>
                  <span className="text-white text-sm truncate">
                    {selectedChild.examRegisterNumbers?.[selectedExamId] ||
                      (selectedChild as any).examRegisterNos?.[selectedExamId] ||
                      (selectedChild as any).examRegNo ||
                      reportData?.report?.examRegisterNo ||
                      '—'}
                  </span>
                </span>
                <span className="bg-white/10 text-emerald-100 px-2.5 py-1 rounded-full text-xs font-mono">
                  Roll: {selectedChild.rollNo} • Adm: {selectedChild.admissionNo}
                </span>
                <span className="bg-white/15 text-white px-2.5 py-1 rounded-full text-xs font-semibold">
                  Class: {(classesMap[selectedChild.classId] || selectedChild.classId || '').replace(/^Class\s*/i, '')}
                </span>
              </div>
            )}
          </div>

          {/* Exam Selector Pill/Dropdown in Banner with mobile overflow fix */}
          {examinations.length > 0 && (
            <div
              className="w-full sm:w-auto max-w-full overflow-hidden text-ellipsis whitespace-nowrap bg-white/10 backdrop-blur-xs px-4 py-3 rounded-xl border border-white/20 shrink-0"
              style={{ boxSizing: 'border-box' }}
            >
              <label className="block text-[11px] font-bold text-emerald-200 uppercase tracking-wider mb-1 truncate">
                {t.examination}
              </label>
              <div
                className="w-full max-w-full overflow-hidden text-ellipsis whitespace-nowrap"
                style={{ boxSizing: 'border-box' }}
              >
                <select
                  value={selectedExamId}
                  onChange={e => setSelectedExamId(e.target.value)}
                  className="w-full max-w-full overflow-hidden text-ellipsis whitespace-nowrap bg-emerald-950 text-white text-xs font-semibold px-3 py-2 rounded-lg border border-emerald-700 focus:outline-none cursor-pointer"
                  style={{ boxSizing: 'border-box' }}
                >
                  {examinations.map(e => (
                    <option key={e.id} value={e.id} className="bg-emerald-950 text-white">
                      {isMl ? e.nameMl : e.nameEn} {e.isPublished ? '✓' : '(Not Published)'}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {children.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500">
          <User className="w-10 h-10 mx-auto text-slate-400 mb-2" />
          <h3 className="font-bold text-slate-800 text-sm">No Children Linked</h3>
          <p className="text-xs text-slate-500 mt-1">
            There are currently no student records associated with this parent account. Please contact the Principal with your child's Admission Number.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Multi-Student Sibling Selector: Clean Tabs & Mobile Dropdown */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs print:hidden space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-emerald-800" />
                <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  {t.navMyChildren} ({children.length} {children.length === 1 ? 'Student' : 'Students'})
                </h2>
              </div>
              <span className="text-[11px] text-slate-500">
                Click any student below to switch and view their report card immediately
              </span>
            </div>

            {/* Mobile Dropdown Selector */}
            <div className="sm:hidden">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Select Student:
              </label>
              <div className="relative">
                <select
                  value={selectedChildId}
                  onChange={e => setSelectedChildId(e.target.value)}
                  className="w-full p-2.5 pr-8 border border-emerald-300 rounded-xl bg-emerald-50/60 font-bold text-slate-800 text-xs focus:ring-2 focus:ring-emerald-700 focus:outline-none cursor-pointer appearance-none"
                >
                  {children.map(child => (
                    <option key={child.id} value={child.id}>
                      {child.nameEn || (child as any).name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-emerald-800 absolute right-3 top-3 pointer-events-none" />
              </div>
            </div>

            {/* Desktop & Tablet Student Selection Cards / Tabs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {children.map(child => {
                const isSelected = child.id === selectedChildId;
                const childRegNo =
                  child.examRegisterNumbers?.[selectedExamId] ||
                  (child as any).examRegisterNos?.[selectedExamId] ||
                  (child as any).examRegNo;

                return (
                  <button
                    type="button"
                    key={child.id}
                    onClick={() => setSelectedChildId(child.id)}
                    className={`p-3.5 rounded-2xl border text-left cursor-pointer transition flex items-center justify-between ${
                      isSelected
                        ? 'bg-emerald-50/90 border-emerald-600 shadow-xs ring-2 ring-emerald-600/20'
                        : 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
                          isSelected
                            ? 'bg-emerald-800 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {child.rollNo}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm">
                          {isMl && child.nameMl ? child.nameMl : child.nameEn}
                        </h3>
                        <p className="text-xs text-slate-500 font-medium flex flex-wrap items-center gap-1.5 mt-0.5">
                          <span>{classesMap[child.classId] || child.classId}</span>
                          <span>•</span>
                          <span>Adm: <span className="font-mono">{child.admissionNo}</span></span>
                          {childRegNo && (
                            <span className="font-mono text-emerald-900 font-bold bg-emerald-100/90 border border-emerald-300/60 px-1.5 py-0.5 rounded text-[10px]">
                              Reg: {childRegNo}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    {isSelected && (
                      <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* View Mode Toggle: All Portal Navigation Tabs with Mobile Horizontal Scroll */}
          <div className="flex items-center gap-1.5 sm:gap-2 border-b border-slate-200 pb-2 overflow-x-auto no-scrollbar print:hidden">
            <button
              type="button"
              onClick={() => setActiveTab('home')}
              className={`flex items-center gap-1.5 sm:gap-2 px-3.5 py-2 text-xs font-bold rounded-xl transition cursor-pointer shrink-0 ${
                activeTab === 'home'
                  ? 'bg-emerald-800 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200'
              }`}
            >
              <Home className="w-4 h-4" />
              <span>{isMl ? 'ഹോം' : 'Home'}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('attendance')}
              className={`flex items-center gap-1.5 sm:gap-2 px-3.5 py-2 text-xs font-bold rounded-xl transition cursor-pointer shrink-0 ${
                activeTab === 'attendance'
                  ? 'bg-emerald-800 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200'
              }`}
            >
              <CalendarCheck className="w-4 h-4" />
              <span>{isMl ? 'ഹാജർ' : 'Attendance'}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('report')}
              className={`flex items-center gap-1.5 sm:gap-2 px-3.5 py-2 text-xs font-bold rounded-xl transition cursor-pointer shrink-0 ${
                activeTab === 'report'
                  ? 'bg-emerald-800 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200'
              }`}
            >
              <Award className="w-4 h-4" />
              <span>{t.navProgressReport || 'Progress Report Card'}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('fees')}
              className={`flex items-center gap-1.5 sm:gap-2 px-3.5 py-2 text-xs font-bold rounded-xl transition cursor-pointer shrink-0 ${
                activeTab === 'fees'
                  ? 'bg-emerald-800 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              <span>{isMl ? `ഫീസ് (${childPayments.length})` : `Fees (${childPayments.length})`}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('news')}
              className={`flex items-center gap-1.5 sm:gap-2 px-3.5 py-2 text-xs font-bold rounded-xl transition cursor-pointer shrink-0 ${
                activeTab === 'news'
                  ? 'bg-emerald-800 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200'
              }`}
            >
              <Newspaper className="w-4 h-4" />
              <span>{isMl ? 'വാർത്തകൾ' : 'News'}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('notification')}
              className={`flex items-center gap-1.5 sm:gap-2 px-3.5 py-2 text-xs font-bold rounded-xl transition cursor-pointer shrink-0 relative ${
                activeTab === 'notification'
                  ? 'bg-emerald-800 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200'
              }`}
            >
              <Bell className="w-4 h-4" />
              <span>{isMl ? 'അറിയിപ്പുകൾ' : 'Notification'}</span>
              {notifications.some(n => !n.read) && (
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('contact')}
              className={`flex items-center gap-1.5 sm:gap-2 px-3.5 py-2 text-xs font-bold rounded-xl transition cursor-pointer shrink-0 ${
                activeTab === 'contact'
                  ? 'bg-emerald-800 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200'
              }`}
            >
              <PhoneCall className="w-4 h-4" />
              <span>{isMl ? 'ബന്ധപ്പെടുക' : 'Contact'}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('about')}
              className={`flex items-center gap-1.5 sm:gap-2 px-3.5 py-2 text-xs font-bold rounded-xl transition cursor-pointer shrink-0 ${
                activeTab === 'about'
                  ? 'bg-emerald-800 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200'
              }`}
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>About</span>
            </button>
          </div>

          {/* TAB 1: HOME OVERVIEW VIEW */}
          {activeTab === 'home' && (
            <div className="space-y-6">
              {/* Overview Welcome Landing Card */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800">
                        {isMl ? 'രക്ഷിതാവ് പോർട്ടൽ' : 'Parent Overview Portal'}
                      </span>
                      <span className="text-slate-400 text-xs">•</span>
                      <span className="text-xs text-slate-500 font-mono">Academic Year 2026–2027</span>
                    </div>
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900 font-serif mt-1">
                      {isMl
                        ? `അസ്സലാമു അലൈക്കും, ${user?.nameMl || user?.name || 'രക്ഷിതാവേ'}`
                        : `Assalamu Alaikum, ${user?.name || 'Dear Parent'}`}
                    </h2>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed max-w-2xl">
                      {isMl
                        ? `അൽ മദ്റസത്തുൽ ഇസ്ലാമിയ്യ പള്ളിക്കുത്ത് രക്ഷിതാവ് പോർട്ടലിലേക്ക് സ്വാഗതം. നിങ്ങളുടെ കുട്ടി ${selectedChild?.nameMl || selectedChild?.nameEn}-ന്റെ പഠന പുരോഗതി, ഹാജർ നിലവാരം, ഫീസ് വിവരങ്ങൾ, മദ്റസ അറിയിപ്പുകൾ എന്നിവ ഇവിടെ പരിശോധിക്കാം.`
                        : `Welcome to the official Parent Portal of Al-Madrasathul Islamiya Pallikkuth. Track ${selectedChild?.nameEn}'s academic marks, attendance records, fee status, and school circulars.`}
                    </p>
                  </div>

                  {selectedChild && (
                    <div className="bg-emerald-50/80 border border-emerald-200/80 rounded-xl p-3.5 sm:text-right shrink-0">
                      <div className="text-[10px] uppercase font-bold text-emerald-700">Active Student</div>
                      <div className="text-sm font-bold text-emerald-950 mt-0.5">
                        {selectedChild.nameEn}
                      </div>
                      <div className="text-xs text-emerald-800 font-medium">
                        Class: {(classesMap[selectedChild.classId] || selectedChild.classId || '').replace(/^Class\s*/i, '')} • Roll: {selectedChild.rollNo}
                      </div>
                    </div>
                  )}
                </div>

                {/* 4 Summary Feature Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Card 1: Examination & Progress Report */}
                  <div className="bg-gradient-to-br from-emerald-50/70 to-teal-50/50 rounded-xl p-4 border border-emerald-100 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold uppercase text-emerald-800">
                          Academic Result
                        </span>
                        <Award className="w-4 h-4 text-emerald-700" />
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 line-clamp-1">
                        {selectedExam?.nameEn || 'Half-Yearly Exam'}
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">
                        {isExamPublished
                          ? 'Results officially published & verified'
                          : 'Valuation complete / pending release'}
                      </p>
                      {activeReport && activeReport.percentage && (
                        <div className="mt-2 text-xs font-mono font-bold text-emerald-900">
                          Score: {activeReport.percentage}% {activeReport.classRank ? `• Rank #${activeReport.classRank}` : ''}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('report')}
                      className="mt-4 flex items-center justify-between text-xs font-bold text-emerald-800 hover:text-emerald-950 pt-2 border-t border-emerald-200/60 cursor-pointer"
                    >
                      <span>View Progress Card</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Card 2: Attendance */}
                  {(() => {
                    const childClassId = selectedChild?.classId || '';
                    const classAttConfig = attendanceConfigs[childClassId];
                    const seed = selectedChild ? ((Number(selectedChild.rollNo || 1) * 3) % 4) : 1;
                    const totalWorkingDays = classAttConfig?.totalWorkingDays ?? selectedChild?.attendance?.totalWorkingDays ?? 92;
                    const attendedDays = (selectedChild && classAttConfig?.studentDaysAttended?.[selectedChild.id] !== undefined)
                      ? classAttConfig.studentDaysAttended[selectedChild.id]
                      : (selectedChild?.attendance?.daysAttended ?? Math.max(84, totalWorkingDays - seed - 2));
                    const percentage = totalWorkingDays > 0 ? ((attendedDays / totalWorkingDays) * 100).toFixed(1) : '100.0';

                    return (
                      <div className="bg-gradient-to-br from-blue-50/70 to-cyan-50/50 rounded-xl p-4 border border-blue-100 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold uppercase text-blue-800">
                              Attendance Rate
                            </span>
                            <CalendarCheck className="w-4 h-4 text-blue-700" />
                          </div>
                          <div className="text-xl font-black font-mono text-blue-950">
                            {percentage}%
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            {attendedDays} attended of {totalWorkingDays} working days
                          </p>
                          <span className="inline-block mt-2 text-[10px] font-bold bg-blue-100 text-blue-900 px-2 py-0.5 rounded-full">
                            Punctual & Regular
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveTab('attendance')}
                          className="mt-4 flex items-center justify-between text-xs font-bold text-blue-800 hover:text-blue-950 pt-2 border-t border-blue-200/60 cursor-pointer"
                        >
                          <span>Detailed Attendance</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })()}

                  {/* Card 3: Fees */}
                  {(() => {
                    const paidMonthsSet = new Set<string>();
                    childPayments.forEach(p => {
                      (p.tuitionFeeMonths || []).forEach(m => paidMonthsSet.add(m));
                    });
                    const totalPaid = childPayments.reduce((sum, p) => sum + (Number(p.totalAmount) || 0), 0);

                    return (
                      <div className="bg-gradient-to-br from-purple-50/70 to-violet-50/50 rounded-xl p-4 border border-purple-100 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold uppercase text-purple-800">
                              Madrasa Fees
                            </span>
                            <CreditCard className="w-4 h-4 text-purple-700" />
                          </div>
                          <div className="text-xl font-black font-mono text-purple-950">
                            ₹{totalPaid.toLocaleString('en-IN')}
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            {paidMonthsSet.size} of 12 tuition months settled
                          </p>
                          <span className="inline-block mt-2 text-[10px] font-bold bg-purple-100 text-purple-900 px-2 py-0.5 rounded-full">
                            {childPayments.length} Receipts Issued
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveTab('fees')}
                          className="mt-4 flex items-center justify-between text-xs font-bold text-purple-800 hover:text-purple-950 pt-2 border-t border-purple-200/60 cursor-pointer"
                        >
                          <span>Manage Fees</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })()}

                  {/* Card 4: Madrasa Contact */}
                  <div className="bg-gradient-to-br from-amber-50/70 to-orange-50/50 rounded-xl p-4 border border-amber-100 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold uppercase text-amber-800">
                          Madrasa Helpdesk
                        </span>
                        <PhoneCall className="w-4 h-4 text-amber-700" />
                      </div>
                      <div className="text-sm font-bold text-slate-900">
                        Principal: ASLAM TK
                      </div>
                      <p className="text-xs text-slate-500 mt-1 font-mono">
                        Phone: 9447 485 432
                      </p>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">
                        amipallikkuth@gmail.com
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('contact')}
                      className="mt-4 flex items-center justify-between text-xs font-bold text-amber-800 hover:text-amber-950 pt-2 border-t border-amber-200/60 cursor-pointer"
                    >
                      <span>Contact Info</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Quick Action Navigation Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div
                  onClick={() => setActiveTab('attendance')}
                  className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-emerald-300 hover:shadow-xs transition cursor-pointer flex items-start gap-4"
                >
                  <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center shrink-0">
                    <CalendarCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Attendance Summary</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Review working days, attended classes, and monthly attendance percentages.
                    </p>
                  </div>
                </div>

                <div
                  onClick={() => setActiveTab('fees')}
                  className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-emerald-300 hover:shadow-xs transition cursor-pointer flex items-start gap-4"
                >
                  <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center shrink-0">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Madrasa Fees &amp; Receipts</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Track 12-month installment schedule, download payment vouchers and receipts.
                    </p>
                  </div>
                </div>

                <div
                  onClick={() => setActiveTab('report')}
                  className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-emerald-300 hover:shadow-xs transition cursor-pointer flex items-start gap-4"
                >
                  <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center shrink-0">
                    <Award className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Progress Report Card</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      View subject marks, grand totals, KMEB grades, and principal verification.
                    </p>
                  </div>
                </div>

                <div
                  onClick={() => setActiveTab('news')}
                  className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-emerald-300 hover:shadow-xs transition cursor-pointer flex items-start gap-4"
                >
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                    <Newspaper className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Madrasa News &amp; Circulars</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Stay updated with academic events, Milad fest, and official school notices.
                    </p>
                  </div>
                </div>

                <div
                  onClick={() => setActiveTab('notification')}
                  className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-emerald-300 hover:shadow-xs transition cursor-pointer flex items-start gap-4"
                >
                  <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                    <Bell className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Notification Alerts</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Urgent messages, exam hall ticket alerts, and fee payment receipts.
                    </p>
                  </div>
                </div>

                <div
                  onClick={() => setActiveTab('about')}
                  className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-emerald-300 hover:shadow-xs transition cursor-pointer flex items-start gap-4"
                >
                  <div className="w-10 h-10 rounded-xl bg-emerald-900 text-amber-300 flex items-center justify-center shrink-0">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">About</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      KMEB affiliation, A+ accreditation, digital learning mission, and values.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: DEDICATED INTERNAL ABOUT TAB */}
          {activeTab === 'about' && (
            <div className="space-y-6">
              {/* Institutional Profile & About Madrasa Section */}
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
                            <Sparkles className="w-3 h-3 text-amber-300" />
                            <span>Institutional Overview</span>
                          </span>
                        </div>
                        <h2 className="text-xl sm:text-2xl font-bold font-serif text-white tracking-tight">
                          Al-Madrasathul Islamiya Pallikkuth
                        </h2>
                        {/* Affiliation Number Details in place of Malayalam translation */}
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

                  {/* Concise Mobile-Friendly Statement */}
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

                  {/* Institutional Contact & Credentials Info Box */}
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

                  {/* NEW "FOLLOW US" SOCIAL MEDIA SECTION */}
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
                      {/* Instagram Button */}
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

                      {/* Facebook Button */}
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

                      {/* YouTube Button */}
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

          {/* TAB 2: ATTENDANCE SUMMARY VIEW */}
          {activeTab === 'attendance' && (
            <div className="space-y-6">
              {(() => {
                const childClassId = selectedChild?.classId || '';
                const classAttConfig = attendanceConfigs[childClassId];

                const seed = selectedChild ? ((Number(selectedChild.rollNo || 1) * 3) % 4) : 1;
                const totalWorkingDays = classAttConfig?.totalWorkingDays ?? selectedChild?.attendance?.totalWorkingDays ?? 92;
                const attendedDays = (selectedChild && classAttConfig?.studentDaysAttended?.[selectedChild.id] !== undefined)
                  ? classAttConfig.studentDaysAttended[selectedChild.id]
                  : (selectedChild?.attendance?.daysAttended ?? Math.max(84, totalWorkingDays - seed - 2));
                const leavesTaken = Math.max(0, totalWorkingDays - attendedDays);
                const percentage = totalWorkingDays > 0 ? ((attendedDays / totalWorkingDays) * 100).toFixed(1) : '100.0';

                const baseMonths = [
                  { key: '2026-06', month: isMl ? 'ജൂൺ 2026' : 'June 2026', working: 18 },
                  { key: '2026-07', month: isMl ? 'ജൂലൈ 2026' : 'July 2026', working: 22 },
                  { key: '2026-08', month: isMl ? 'ഓഗസ്റ്റ് 2026' : 'August 2026', working: 20 },
                  { key: '2026-09', month: isMl ? 'സെപ്റ്റംബർ 2026' : 'September 2026', working: 20 },
                  { key: '2026-10', month: isMl ? 'ഒക്ടോബർ 2026' : 'October 2026', working: 18 },
                ];

                const totalBenchmark = baseMonths.reduce((sum, m) => sum + m.working, 0);
                const effectiveTotalWorking = Math.max(totalWorkingDays, totalBenchmark);

                const records = classAttConfig?.dailyRecords || {};

                let remainingAttended = attendedDays;
                const monthlyRecords = baseMonths.map((m, idx) => {
                  const monthDateKeys = Object.keys(records).filter(k => k.startsWith(m.key));
                  let mAttended: number;

                  if (monthDateKeys.length > 0) {
                    mAttended = monthDateKeys.filter(k => records[k]?.statusMap?.[selectedChild?.id || ''] !== false).length;
                    const unrecorded = Math.max(0, m.working - monthDateKeys.length);
                    const estRemainder = Math.min(unrecorded, Math.round(remainingAttended * (m.working / effectiveTotalWorking)));
                    mAttended = Math.min(m.working, mAttended + estRemainder);
                  } else {
                    if (idx === baseMonths.length - 1) {
                      mAttended = Math.min(m.working, Math.max(0, remainingAttended));
                    } else {
                      mAttended = Math.min(m.working, Math.round((attendedDays * m.working) / effectiveTotalWorking));
                      remainingAttended = Math.max(0, remainingAttended - mAttended);
                    }
                  }

                  const mLeaves = Math.max(0, m.working - mAttended);
                  const mPct = m.working > 0 ? ((mAttended / m.working) * 100).toFixed(1) + '%' : '100%';
                  return {
                    month: m.month,
                    working: m.working,
                    attended: mAttended,
                    leaves: mLeaves,
                    pct: mPct,
                    status: Number(mPct.replace('%', '')) >= 80 ? 'Good' : 'Needs Regularity',
                  };
                });

                return (
                  <div className="space-y-6">
                    {/* Header Card */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <CalendarCheck className="w-5 h-5 text-emerald-800" />
                            <h2 className="text-base sm:text-lg font-bold text-slate-900">
                              {isMl ? 'ഹാജർ നിലവാര രേഖ' : 'Student Attendance Record'}
                            </h2>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            Official attendance log for {selectedChild?.nameEn} (Class: {(classesMap[selectedChild?.classId || ''] || selectedChild?.classId || '').replace(/^Class\s*/i, '')})
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold px-3 py-1 rounded-full text-xs font-mono">
                            {percentage}% Attendance Rate
                          </span>
                        </div>
                      </div>

                      {/* 4 Dedicated Attendance KPI Badges */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 pt-5 text-xs">
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                          <span className="text-[11px] font-bold text-slate-500 uppercase block">
                            Total Working Days
                          </span>
                          <span className="text-2xl font-black text-slate-900 font-mono mt-1 block">
                            {totalWorkingDays}
                          </span>
                          <span className="text-[10px] text-slate-400">Academic Year 2026–27</span>
                        </div>

                        <div className="bg-emerald-50/70 p-4 rounded-xl border border-emerald-200">
                          <span className="text-[11px] font-bold text-emerald-800 uppercase block">
                            Attended Days
                          </span>
                          <span className="text-2xl font-black text-emerald-900 font-mono mt-1 block">
                            {attendedDays}
                          </span>
                          <span className="text-[10px] text-emerald-700 font-semibold">Present in Classes</span>
                        </div>

                        <div className="bg-amber-50/70 p-4 rounded-xl border border-amber-200">
                          <span className="text-[11px] font-bold text-amber-800 uppercase block">
                            Leaves Taken
                          </span>
                          <span className="text-2xl font-black text-amber-900 font-mono mt-1 block">
                            {leavesTaken}
                          </span>
                          <span className="text-[10px] text-amber-700">Authorized / Medical</span>
                        </div>

                        <div className="bg-emerald-900 text-white p-4 rounded-xl shadow-xs">
                          <span className="text-[11px] font-bold text-emerald-200 uppercase block">
                            Attendance Badge
                          </span>
                          <span className="text-2xl font-black text-emerald-300 font-mono mt-1 block">
                            {percentage}%
                          </span>
                          <span className="text-[10px] text-emerald-100">
                            {Number(percentage) >= 80 ? '✓ Qualified for Exams' : 'Needs Regularity'}
                          </span>
                        </div>
                      </div>

                      {/* Progress Bar Gauge */}
                      <div className="mt-5 pt-4 border-t border-slate-100">
                        <div className="flex items-center justify-between text-xs text-slate-600 mb-1.5 font-medium">
                          <span>Overall Attendance Compliance</span>
                          <span className="font-bold text-emerald-800">{percentage}% (Minimum 80% required)</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                          <div
                            className="bg-emerald-700 h-2.5 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, Math.max(10, Number(percentage)))}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>

                    {/* Monthly Attendance Breakdown Table */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                      <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
                        <h3 className="text-sm font-bold text-slate-900">
                          Month-wise Attendance Breakdown (2026–2027)
                        </h3>
                        <span className="text-xs text-slate-500">Morning Session Records</span>
                      </div>

                      <div className="overflow-x-auto w-full scrollbar-thin">
                        <table className="w-full text-left text-xs min-w-[600px] border-collapse">
                          <thead>
                            <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                              <th className="py-2.5 px-4 whitespace-nowrap">Month</th>
                              <th className="py-2.5 px-4 text-center whitespace-nowrap">Working Days</th>
                              <th className="py-2.5 px-4 text-center whitespace-nowrap">Days Present</th>
                              <th className="py-2.5 px-4 text-center whitespace-nowrap">Leaves</th>
                              <th className="py-2.5 px-4 text-right whitespace-nowrap">Attendance %</th>
                              <th className="py-2.5 px-4 text-center whitespace-nowrap">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {monthlyRecords.map((rec, i) => (
                              <tr key={i} className="hover:bg-slate-50 transition">
                                <td className="py-3 px-4 font-bold text-slate-800 whitespace-nowrap">{rec.month}</td>
                                <td className="py-3 px-4 text-center font-mono text-slate-600">{rec.working}</td>
                                <td className="py-3 px-4 text-center font-mono font-bold text-emerald-900">{rec.attended}</td>
                                <td className="py-3 px-4 text-center font-mono text-amber-800">{rec.leaves}</td>
                                <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">{rec.pct}</td>
                                <td className="py-3 px-4 text-center">
                                  <span
                                    className={`inline-block text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                                      rec.status === 'Good'
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : 'bg-amber-100 text-amber-800'
                                    }`}
                                  >
                                    {rec.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Guidelines & Teacher Note */}
                    <div className="bg-emerald-50/60 rounded-2xl border border-emerald-200 p-5 text-xs text-emerald-950 space-y-2">
                      <div className="flex items-center gap-2 font-bold text-emerald-900">
                        <BookOpen className="w-4 h-4 text-emerald-800" />
                        <span>Madrasa Attendance & Punctuality Policy</span>
                      </div>
                      <p className="leading-relaxed text-emerald-900/80">
                        Class teachers take attendance promptly during the morning assembly at 07:15 AM.
                        If a student is unable to attend due to illness or family obligations, please inform the class teacher
                        in advance or provide a written leave note from the parent/guardian.
                      </p>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* TAB 3: Immediate Progress Report Card Display Section */}
          {activeTab === 'report' && (
            <div className="space-y-4">
              {fetchingReport ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-800 mx-auto mb-3" />
                  <h3 className="text-sm font-bold text-slate-800">
                    Loading Progress Report for {selectedChild?.nameEn}...
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Fetching evaluation results, rankings, and subject assessments.
                  </p>
                </div>
              ) : reportError ? (
                <div className="bg-white rounded-2xl border border-rose-200 p-6 shadow-xs flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 text-rose-800 text-xs">
                    <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                    <div>
                      <h4 className="font-bold text-rose-950 text-sm">Unable to load report</h4>
                      <p className="mt-0.5">{reportError}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => loadReport(selectedChildId, selectedExamId)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Retry
                  </button>
                </div>
              ) : shouldShowReport && reportData?.report ? (
                <div className="space-y-4">
                  <ProgressReportCard
                    report={reportData.report}
                    settings={reportData.settings}
                  />
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-amber-200 p-8 shadow-xs">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <h3 className="font-bold text-amber-950 text-base">
                        Progress Report Pending Publication
                      </h3>
                      <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                        The progress report for <strong>{selectedExam?.nameEn || 'this examination'}</strong> has not been published yet. Please check back soon.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: FEES SECTION (Simplified from "Madrasa Fees & Receipts" to "Fees") */}
          {activeTab === 'fees' && (
            <div className="space-y-6">
              {/* Month-by-Month Progress Tracker Card */}
              {(() => {
                const paidMonthsSet = new Set<string>();
                childPayments.forEach(p => {
                  (p.tuitionFeeMonths || []).forEach(m => paidMonthsSet.add(m));
                });
                const totalPaidAmount = childPayments.reduce((sum, p) => sum + (Number(p.totalAmount) || 0), 0);
                const settledMonthsCount = paidMonthsSet.size;

                return (
                  <div className="space-y-6">
                    {/* Summary KPI Strip */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-xs">
                      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                        <span className="text-[11px] font-bold text-slate-500 uppercase block">Tuition Installments Settled</span>
                        <span className="text-2xl font-black text-emerald-900 font-mono mt-1 block">
                          {settledMonthsCount} / 12 Months
                        </span>
                        <span className="text-[10px] text-slate-400">Academic Year 2026–2027</span>
                      </div>

                      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                        <span className="text-[11px] font-bold text-slate-500 uppercase block">Total Fees Paid</span>
                        <span className="text-2xl font-black text-slate-900 font-mono mt-1 block">
                          ₹{totalPaidAmount.toLocaleString('en-IN')}
                        </span>
                        <span className="text-[10px] text-slate-400">Tuition + Special & Exam Funds</span>
                      </div>

                      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                        <span className="text-[11px] font-bold text-slate-500 uppercase block">Official Receipts</span>
                        <span className="text-2xl font-black text-purple-900 font-mono mt-1 block">
                          {childPayments.length} Receipts
                        </span>
                        <span className="text-[10px] text-slate-400">Issued by Madrasa Office</span>
                      </div>
                    </div>

                    {/* 12-Month Interactive Tracker Card */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                      <div>
                        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                          <CreditCard className="w-4 h-4 text-emerald-800" />
                          12-Month Tuition Installment Progress Tracker for {selectedChild?.nameEn}
                        </h3>
                        <p className="text-xs text-slate-500">
                          Tuition fee is ₹300 per month (June 2026 – May 2027). Green badges denote settled installments.
                        </p>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 pt-2">
                        {TUITION_FEE_MONTHS.map(month => {
                          const isPaid = paidMonthsSet.has(month);
                          return (
                            <div
                              key={month}
                              className={`p-3 rounded-xl border text-center transition ${
                                isPaid
                                  ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950 shadow-2xs'
                                  : 'bg-slate-50 border-slate-200 text-slate-400'
                              }`}
                            >
                              <div className="text-[10px] font-bold uppercase tracking-wider mb-1">
                                {month.split(' ')[0]}
                              </div>
                              <div className="text-xs font-mono font-black mb-1">
                                {month.split(' ')[1]}
                              </div>
                              {isPaid ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-white px-2 py-0.5 rounded-full border border-emerald-200 shadow-2xs">
                                  ✓ Paid
                                </span>
                              ) : (
                                <span className="inline-block text-[10px] font-medium text-slate-400 bg-slate-200/60 px-2 py-0.5 rounded-full">
                                  Pending
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Receipts History Table */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                      <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
                        <h4 className="text-sm font-bold text-slate-900">
                          Payment Receipts History ({childPayments.length})
                        </h4>
                      </div>

                      {childPayments.length === 0 ? (
                        <div className="p-8 text-center text-xs text-slate-400">
                          No fee payment receipts recorded yet for {selectedChild?.nameEn}.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                                <th className="py-2.5 px-3">Receipt #</th>
                                <th className="py-2.5 px-3">Date</th>
                                <th className="py-2.5 px-3">Tuition Months Covered</th>
                                <th className="py-2.5 px-3 text-right">Amount (₹)</th>
                                <th className="py-2.5 px-3 text-right">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {childPayments.map(p => (
                                <tr key={p.id} className="hover:bg-slate-50 transition">
                                  <td className="py-2.5 px-3 font-mono font-bold text-emerald-900">
                                    {p.receiptNo}
                                  </td>
                                  <td className="py-2.5 px-3 font-mono text-slate-600">
                                    {p.date}
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-700">
                                    {(p.tuitionFeeMonths || []).length > 0
                                      ? p.tuitionFeeMonths.join(', ')
                                      : 'Special / Exam Fee'}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                                    ₹{p.totalAmount.toLocaleString('en-IN')}
                                  </td>
                                  <td className="py-2.5 px-3 text-right">
                                    <button
                                      type="button"
                                      onClick={() => setActiveReceipt(p)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 rounded-lg transition border border-emerald-300 cursor-pointer"
                                    >
                                      <Printer className="w-3.5 h-3.5" />
                                      View Receipt
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* TAB 5: NEWS & ANNOUNCEMENTS VIEW */}
          {activeTab === 'news' && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
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

                  {/* Filter Pills */}
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                    {(['all', 'academic', 'events', 'general'] as const).map(tabKey => (
                      <button
                        key={tabKey}
                        type="button"
                        onClick={() => setNewsFilter(tabKey)}
                        className={`px-3 py-1 text-xs font-semibold rounded-lg transition capitalize cursor-pointer ${
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

                {/* News Cards Feed */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-5">
                  {[
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
                    },
                  ]
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
                            onClick={() => setSelectedNews(item as any)}
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
            </div>
          )}

          {/* TAB 6: NOTIFICATIONS & CIRCULARS VIEW */}
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
                      Real-time alerts, circular notices, and fee receipts for your child
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

                      <div className="shrink-0">
                        {notif.type === 'exam' ? (
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              setActiveTab('report');
                            }}
                            className="text-[11px] font-bold text-emerald-800 hover:underline cursor-pointer"
                          >
                            View Result
                          </button>
                        ) : notif.type === 'fee' ? (
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              setActiveTab('fees');
                            }}
                            className="text-[11px] font-bold text-emerald-800 hover:underline cursor-pointer"
                          >
                            View Fees
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: CONTACT MADRASA CARD VIEW */}
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
                      <User className="w-4 h-4 text-emerald-800" />
                      <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                        Sadr Muallim / Principal
                      </span>
                    </div>
                    <div className="text-base font-bold text-slate-900">
                      ASLAM TK (അസ്‌ലം ടി.കെ.)
                    </div>
                    <p className="text-xs text-slate-500">
                      Available for parent consultations regarding student performance and moral training.
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
                      Sat – Wed: 07:00 AM – 12:30 PM & 04:30 PM – 06:30 PM
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
                        placeholder="Subject (e.g. Leave request, Progress report query, Fee receipt)"
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

          {/* MODAL: VIEW DETAILED NEWS / CIRCULAR */}
          {selectedNews && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
              <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[85vh] overflow-y-auto">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                    {isMl ? selectedNews.categoryMl : selectedNews.categoryEn}
                  </span>
                  <button
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

      {/* MODAL: VIEW & PRINT OFFICIAL FEE RECEIPT */}
      {activeReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4 print:hidden">
              <span className="text-xs font-bold text-slate-700">Official Fee Receipt</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Receipt
                </button>
                <button
                  onClick={() => setActiveReceipt(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Official Slip */}
            <div className="bg-white text-slate-900 border-2 border-emerald-900 p-6 rounded-xl font-sans relative">
              <div className="text-center border-b border-emerald-800 pb-3 mb-3">
                <div className="font-serif text-emerald-900 text-sm font-bold" dir="rtl">
                  بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
                </div>
                <h1 className="text-base font-black uppercase text-emerald-950 font-serif mt-1">
                  Al-Madrasathul Islamiya Pallikkuth
                </h1>
                <h2 className="text-xs font-bold text-emerald-900">
                  അൽ മദ്റസത്തുൽ ഇസ്ലാമിയ്യ പള്ളിക്കുത്ത്
                </h2>
                <div className="text-[10px] font-semibold text-emerald-800 tracking-wide mt-0.5">
                  Islamic Education &amp; Digital Learning
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Reg. No: KEC-8492 • Official Fee Receipt (2026–2027)
                </p>
              </div>

              <div className="flex items-center justify-between text-xs mb-3 font-mono bg-emerald-50/70 p-2 rounded-lg border border-emerald-100">
                <div>
                  <span className="text-slate-500">Receipt No: </span>
                  <strong className="text-emerald-950 text-sm">{activeReceipt.receiptNo}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Date: </span>
                  <strong className="text-slate-800">{activeReceipt.date}</strong>
                </div>
              </div>

              <div className="text-xs space-y-1 mb-4 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <div className="flex justify-between">
                  <span className="text-slate-500">Student Name:</span>
                  <strong className="text-slate-900">{activeReceipt.studentName}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Admission No:</span>
                  <span className="font-mono font-bold text-slate-800">{activeReceipt.admissionNo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Class:</span>
                  <strong className="text-emerald-900">{activeReceipt.className}</strong>
                </div>
              </div>

              <table className="w-full text-xs mb-4 border-collapse">
                <thead>
                  <tr className="border-b border-slate-300 text-slate-600 font-bold">
                    <th className="py-1.5 text-left">Description</th>
                    <th className="py-1.5 text-right">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeReceipt.admissionFee > 0 && (
                    <tr>
                      <td className="py-1 text-slate-800">Admission Fee</td>
                      <td className="py-1 text-right font-mono">₹{activeReceipt.admissionFee}</td>
                    </tr>
                  )}
                  {activeReceipt.tuitionFeeAmount > 0 && (
                    <tr>
                      <td className="py-1 text-slate-800">
                        Tuition Fee ({activeReceipt.tuitionFeeMonths?.length || 0} months)
                        <div className="text-[10px] text-slate-500">
                          {(activeReceipt.tuitionFeeMonths || []).join(', ')}
                        </div>
                      </td>
                      <td className="py-1 text-right font-mono font-bold">₹{activeReceipt.tuitionFeeAmount}</td>
                    </tr>
                  )}
                  {activeReceipt.specialFeeComponents && Object.entries(activeReceipt.specialFeeComponents).map(([k, val]) => {
                    if (!val) return null;
                    return (
                      <tr key={k}>
                        <td className="py-1 text-slate-800 capitalize">{k.replace(/([A-Z])/g, ' $1')}</td>
                        <td className="py-1 text-right font-mono">₹{val}</td>
                      </tr>
                    );
                  })}
                  {activeReceipt.donationAmount > 0 && (
                    <tr>
                      <td className="py-1 text-slate-800">Donation / Other</td>
                      <td className="py-1 text-right font-mono">₹{activeReceipt.donationAmount}</td>
                    </tr>
                  )}
                  <tr className="border-t-2 border-emerald-900 font-bold">
                    <td className="py-2 text-emerald-950 uppercase text-xs">Total Received</td>
                    <td className="py-2 text-right font-mono text-emerald-950 text-sm font-black">
                      ₹{activeReceipt.totalAmount.toLocaleString('en-IN')}
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className="text-[10px] text-slate-600 italic mb-6">
                <strong>In Words: </strong> {activeReceipt.amountInWords}
              </div>

              <div className="flex items-end justify-between pt-6 border-t border-slate-200 text-xs">
                <div>
                  <div className="text-[10px] text-slate-400">Collected By:</div>
                  <div className="font-semibold text-slate-700">{activeReceipt.collectedBy || 'Office'}</div>
                </div>
                <div className="text-center">
                  <div className="font-serif italic font-bold text-emerald-900 text-xs mb-1">ASLAM TK</div>
                  <div className="border-t border-slate-400 pt-1 text-[10px] font-bold text-slate-600">
                    Authorized Signatory
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
