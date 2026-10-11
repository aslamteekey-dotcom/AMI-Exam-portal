import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { TeacherAssignment, ClassItem, SubjectItem, Examination, MarkSheet } from '../../types';
import { MarkEntryScreen } from './MarkEntryScreen';
import { BookOpen, Users, Clock, CheckCircle, AlertCircle, Lock, Edit3 } from 'lucide-react';

export const TeacherDashboard: React.FC = () => {
  const { user, fetchWithAuth, lang, t } = useAuth();
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [examinations, setExaminations] = useState<Examination[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [markSheets, setMarkSheets] = useState<MarkSheet[]>([]);

  // Active Mark Entry Selection
  const [activeEntry, setActiveEntry] = useState<{
    classId: string;
    subjectId: string;
    examinationId: string;
  } | null>(null);

  const isMl = lang === 'ml';

  const loadData = async () => {
    setLoading(true);
    try {
      const [resAuth, resClasses, resSubjects, resExams] = await Promise.all([
        fetchWithAuth('/api/auth/me'),
        fetchWithAuth('/api/classes'),
        fetchWithAuth('/api/subjects'),
        fetchWithAuth('/api/examinations'),
      ]);

      const authData = await resAuth.json();
      const clsData = await resClasses.json();
      const subData = await resSubjects.json();
      const examData = await resExams.json();

      setAssignments(authData.assignments || []);
      setClasses(clsData);
      setSubjects(subData);
      setExaminations(examData);

      const activeExam = examData[0];
      if (activeExam) {
        setSelectedExamId(activeExam.id);
        const resSheets = await fetchWithAuth(`/api/mark-sheets?examinationId=${activeExam.id}`);
        if (resSheets.ok) {
          const sheetsData = await resSheets.json();
          setMarkSheets(sheetsData);
        }
      }
    } catch (err) {
      console.error('Error loading teacher data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleExamChange = async (examId: string) => {
    setSelectedExamId(examId);
    const resSheets = await fetchWithAuth(`/api/mark-sheets?examinationId=${examId}`);
    if (resSheets.ok) {
      const sheetsData = await resSheets.json();
      setMarkSheets(sheetsData);
    }
  };

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
        <span className="ml-3 font-medium">Loading assigned classes...</span>
      </div>
    );
  }

  const selectedExam = examinations.find(e => e.id === selectedExamId);

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-emerald-900 to-emerald-800 text-white rounded-2xl p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="font-serif text-emerald-300 text-sm mb-1" dir="rtl">
              أهلاً وسهلاً
            </div>
            <h1 className="text-xl md:text-2xl font-bold font-serif">
              {isMl && user?.nameMl ? user.nameMl : user?.name}
            </h1>
            <p className="text-xs text-emerald-200 mt-1">
              Usthad Teacher Portal • Al-Madrasathul Islamiya Pallikkuth
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
              className="bg-emerald-950 text-white text-xs font-semibold px-3 py-1.5 rounded-lg border border-emerald-700 focus:outline-none"
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

      {/* Assigned Classes & Subjects Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            {t.navMyAssignments} ({assignments.length})
          </h2>
          <p className="text-xs text-slate-500">
            Select an assigned class and subject to enter, review, or submit examination marks.
          </p>
        </div>
      </div>

      {assignments.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500">
          <BookOpen className="w-10 h-10 mx-auto text-slate-400 mb-2" />
          <h3 className="font-bold text-slate-800 text-sm">No Subjects Assigned</h3>
          <p className="text-xs text-slate-500 mt-1">
            The administrator has not assigned you any classes or subjects yet. Please contact the Principal.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {assignments.map(a => {
            const cls = classes.find(c => c.id === a.classId);
            const sub = subjects.find(s => s.id === a.subjectId);
            const ms = markSheets.find(
              m => m.examinationId === selectedExamId && m.classId === a.classId && m.subjectId === a.subjectId
            );

            // Strictly Malayalam subject display
            const subDisplayName =
              cls?.numericGrade === 9 && (sub?.id === 'sub_history_buhuth' || sub?.code === 'HST')
                ? 'ബുഹൂസ്'
                : sub?.nameMl || sub?.nameEn || '—';

            const status = ms?.status || 'not_started';

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

                    {/* Status Badge */}
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
                        Awaiting Approval
                      </span>
                    )}
                    {status === 'approved' && (
                      <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        {t.approved}
                      </span>
                    )}
                    {status === 'locked' && (
                      <span className="text-[11px] font-semibold text-purple-800 bg-purple-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Lock className="w-3 h-3" />
                        {t.locked}
                      </span>
                    )}
                    {status === 'returned_for_correction' && (
                      <span className="text-[11px] font-semibold text-rose-800 bg-rose-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Returned
                      </span>
                    )}
                  </div>

                  <h3 className="font-bold text-slate-900 text-base mb-1">
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
                    onClick={() =>
                      setActiveEntry({
                        classId: a.classId,
                        subjectId: a.subjectId,
                        examinationId: selectedExamId,
                      })
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition shadow-2xs"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    {status === 'submitted' || status === 'approved' || status === 'locked'
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
  );
};
