import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Student, Examination, StudentProgressReport, InstitutionSettings, sortStudentsBoysFirst } from '../../types';
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
} from 'lucide-react';

export const ParentDashboard: React.FC = () => {
  const { user, fetchWithAuth, lang, t } = useAuth();
  const [loading, setLoading] = useState(true);
  const [children, setChildren] = useState<Student[]>([]);
  const [classesMap, setClassesMap] = useState<Record<string, string>>({});
  const [examinations, setExaminations] = useState<Examination[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>('');
  const [selectedExamId, setSelectedExamId] = useState<string>('');

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
      const [resAuth, resClasses, resExams] = await Promise.all([
        fetchWithAuth('/api/auth/me'),
        fetchWithAuth('/api/classes'),
        fetchWithAuth('/api/examinations'),
      ]);

      const authData = await resAuth.json();
      const classesData = await resClasses.json();
      const examsData: Examination[] = await resExams.json();

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
        // Prefer published exam first, otherwise first exam
        const publishedExam = examsData.find(e => e.isPublished) || examsData[0];
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
  }, [lang]);

  // Automatically fetch and load progress report card whenever selected student or examination changes
  const loadReport = async (childId: string, examId: string) => {
    if (!childId || !examId) return;
    setFetchingReport(true);
    setIsUnpublished(false);
    setReportError(null);
    setReportData(null);

    try {
      const res = await fetchWithAuth(`/api/reports/student/${childId}/exam/${examId}`);
      if (!res.ok) {
        const errJson = await res.json();
        if (errJson.isUnpublished) {
          setIsUnpublished(true);
        } else {
          setReportError(errJson.error || 'Unable to retrieve progress report');
        }
        return;
      }
      const data = await res.json();
      setReportData(data);
    } catch (err: any) {
      setReportError(err.message || 'Network error');
    } finally {
      setFetchingReport(false);
    }
  };

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

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-emerald-900 to-emerald-800 text-white rounded-2xl p-6 shadow-sm print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="font-serif text-emerald-300 text-sm mb-1" dir="rtl">
              بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
            </div>
            <h1 className="text-xl md:text-2xl font-bold font-serif">
              {isMl && user?.nameMl ? user.nameMl : user?.name}
            </h1>
            <p className="text-xs text-emerald-200 mt-1">
              {t.parentRole} • Al-Madrasathul Islamiya Pallikkuth
            </p>
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
                  {children.map(child => (
                    <option key={child.id} value={child.id}>
                      {child.nameEn} {child.nameMl ? `(${child.nameMl})` : ''} — Class {classesMap[child.classId] || child.classId} (Adm: {child.admissionNo})
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
                        <p className="text-xs text-slate-500 font-medium">
                          {classesMap[child.classId] || child.classId} • Adm: <span className="font-mono">{child.admissionNo}</span>
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

          {/* Immediate Progress Report Card Display Section */}
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
            ) : isUnpublished ? (
              <div className="bg-white rounded-2xl border border-amber-200 p-8 shadow-xs">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-bold text-amber-950 text-base">
                      {t.unpublishedNoticeTitle}
                    </h3>
                    <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                      The examination results for <strong>{selectedExam?.nameEn}</strong> are currently under evaluation or awaiting final verification and publication by the Principal. Please check back shortly.
                    </p>
                  </div>
                </div>
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
            ) : reportData ? (
              <div className="space-y-4">
                <ProgressReportCard
                  report={reportData.report}
                  settings={reportData.settings}
                />
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
