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
} from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase';

export const ParentDashboard: React.FC = () => {
  const { user, fetchWithAuth, lang, t } = useAuth();
  const [loading, setLoading] = useState(true);
  const [children, setChildren] = useState<Student[]>([]);
  const [classesMap, setClassesMap] = useState<Record<string, string>>({});
  const [examinations, setExaminations] = useState<Examination[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>('');
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'report' | 'fees'>('report');
  const [childPayments, setChildPayments] = useState<FeePayment[]>([]);
  const [activeReceipt, setActiveReceipt] = useState<FeePayment | null>(null);
  const [settings, setSettings] = useState<InstitutionSettings | null>(null);

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

    // 2. Real-time Firestore listener for published examinations
    try {
      const unsubExams = onSnapshot(collection(db, 'exams'), snapshot => {
        if (!snapshot.empty) {
          const remoteExams = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Examination));
          setExaminations(remoteExams);
        }
      });
      unsubs.push(unsubExams);
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
      <div className="bg-gradient-to-r from-emerald-900 to-emerald-800 text-white rounded-2xl p-6 shadow-sm print:hidden">
        <div className="text-center font-serif text-emerald-300 text-base mb-3" dir="rtl">
          بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold font-serif">
              {isMl && user?.nameMl ? user.nameMl : user?.name}
            </h1>
            <p className="text-xs text-emerald-200 mt-1">
              {t.parentRole} • Al-Madrasathul Islamiya Pallikkuth
            </p>
            {selectedChild && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="bg-emerald-950/80 border border-emerald-400/50 text-emerald-200 px-3 py-1 rounded-full text-xs font-mono font-bold flex items-center gap-1.5 shadow-2xs">
                  <Hash className="w-3.5 h-3.5 text-emerald-300" />
                  <span className="text-[10px] uppercase font-sans text-emerald-300 font-bold">Exam Reg No:</span>
                  <span className="text-white text-sm">
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
                  Class: {classesMap[selectedChild.classId] || selectedChild.classId}
                </span>
              </div>
            )}
          </div>

          {/* Exam Selector Pill/Dropdown in Banner */}
          {examinations.length > 0 && (
            <div className="bg-white/10 backdrop-blur-xs p-3 rounded-xl border border-white/20">
              <label className="block text-[11px] font-bold text-emerald-200 uppercase tracking-wider mb-1">
                {t.examination}
              </label>
              <select
                value={selectedExamId}
                onChange={e => setSelectedExamId(e.target.value)}
                className="bg-emerald-950 text-white text-xs font-semibold px-3 py-1.5 rounded-lg border border-emerald-700 focus:outline-none cursor-pointer"
              >
                {examinations.map(e => (
                  <option key={e.id} value={e.id}>
                    {isMl ? e.nameMl : e.nameEn} {e.isPublished ? '✓' : '(Not Published)'}
                  </option>
                ))}
              </select>
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
                  {children.map(child => {
                    const childRegNo =
                      child.examRegisterNumbers?.[selectedExamId] ||
                      (child as any).examRegisterNos?.[selectedExamId] ||
                      (child as any).examRegNo;
                    return (
                      <option key={child.id} value={child.id}>
                        {child.nameEn} {child.nameMl ? `(${child.nameMl})` : ''} — Class {classesMap[child.classId] || child.classId} (Adm: {child.admissionNo}{childRegNo ? `, Reg: ${childRegNo}` : ''})
                      </option>
                    );
                  })}
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

          {/* View Mode Toggle: Progress Report vs Madrasa Fees */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2 print:hidden">
            <button
              type="button"
              onClick={() => setActiveTab('report')}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
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
              className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
                activeTab === 'fees'
                  ? 'bg-emerald-800 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              <span>Madrasa Fees & Receipts ({childPayments.length})</span>
            </button>
          </div>

          {/* TAB 1: Immediate Progress Report Card Display Section */}
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

          {/* TAB 2: Madrasa Fees & Receipts Section */}
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
                <p className="text-[10px] text-slate-500">
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
