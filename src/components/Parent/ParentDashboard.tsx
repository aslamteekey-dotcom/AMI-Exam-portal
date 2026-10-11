import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Student, Examination, StudentProgressReport, InstitutionSettings } from '../../types';
import { ProgressReportCard } from '../Report/ProgressReportCard';
import { User, GraduationCap, FileText, AlertCircle, Eye, Calendar, Award } from 'lucide-react';

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
      const examsData = await resExams.json();

      const cMap: Record<string, string> = {};
      classesData.forEach((c: any) => {
        cMap[c.id] = isMl ? c.nameMl : c.name;
      });
      setClassesMap(cMap);

      const kids = authData.children || [];
      setChildren(kids);
      setExaminations(examsData);

      if (kids.length > 0) {
        setSelectedChildId(kids[0].id);
      }
      if (examsData.length > 0) {
        setSelectedExamId(examsData[0].id);
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

  // Load report when student or exam changes
  const handleViewReport = async (childId: string, examId: string) => {
    setSelectedChildId(childId);
    setSelectedExamId(examId);
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

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20 text-slate-500">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-700"></div>
        <span className="ml-3 font-medium">Loading parent portal...</span>
      </div>
    );
  }

  // If a report is actively open and loaded
  if (reportData) {
    return (
      <ProgressReportCard
        report={reportData.report}
        settings={reportData.settings}
        onBack={() => setReportData(null)}
      />
    );
  }

  const selectedChild = children.find(c => c.id === selectedChildId);
  const selectedExam = examinations.find(e => e.id === selectedExamId);

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-emerald-900 to-emerald-800 text-white rounded-2xl p-6 shadow-sm">
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
          {/* Children Selector Tabs */}
          <div>
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">
              {t.navMyChildren} ({children.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {children.map(child => {
                const isSelected = child.id === selectedChildId;
                return (
                  <div
                    key={child.id}
                    onClick={() => setSelectedChildId(child.id)}
                    className={`p-4 rounded-2xl border cursor-pointer transition flex items-center justify-between ${
                      isSelected
                        ? 'bg-emerald-50/80 border-emerald-600 shadow-xs ring-1 ring-emerald-600'
                        : 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
                          isSelected
                            ? 'bg-emerald-800 text-white'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {child.rollNo}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm">
                          {isMl && child.nameMl ? child.nameMl : child.nameEn}
                        </h3>
                        <p className="text-xs text-slate-500">
                          {classesMap[child.classId] || child.classId} • {child.admissionNo}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Available Examinations for Selected Child */}
          {selectedChild && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Examination Progress Reports for {isMl && selectedChild.nameMl ? selectedChild.nameMl : selectedChild.nameEn}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Academic Year 2026–2027 • Class {classesMap[selectedChild.classId]}
                  </p>
                </div>
              </div>

              {/* List of examinations */}
              <div className="divide-y divide-slate-100">
                {examinations.map(exam => {
                  return (
                    <div
                      key={exam.id}
                      className="py-4 flex flex-wrap items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-900 flex items-center justify-center">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-800 text-sm">
                            {isMl ? exam.nameMl : exam.nameEn}
                          </h4>
                          <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                            <Calendar className="w-3.5 h-3.5" />
                            <span>
                              {exam.startDate} to {exam.endDate}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {exam.isPublished ? (
                          <span className="text-xs font-semibold text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-full">
                            Results Published
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-amber-800 bg-amber-100 px-2.5 py-1 rounded-full">
                            Not Yet Published
                          </span>
                        )}

                        <button
                          onClick={() => handleViewReport(selectedChild.id, exam.id)}
                          disabled={fetchingReport}
                          className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition shadow-xs disabled:opacity-50"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          {fetchingReport && selectedExamId === exam.id ? 'Loading...' : 'View Progress Report'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Notice Banner if Unpublished */}
              {isUnpublished && (
                <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-amber-950 text-sm">
                      {t.unpublishedNoticeTitle}
                    </h4>
                    <p className="mt-1 leading-relaxed">
                      {t.unpublishedNoticeDesc}
                    </p>
                  </div>
                </div>
              )}

              {/* Generic error */}
              {reportError && (
                <div className="mt-4 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-rose-950 text-sm">Error</h4>
                    <p className="mt-1">{reportError}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
