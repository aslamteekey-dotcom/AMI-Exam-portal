import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ExamManagement } from './ExamManagement';
import { ClassSubjectConfig } from './ClassSubjectConfig';
import { StudentManagement } from './StudentManagement';
import { TeacherManagement } from './TeacherManagement';
import { ParentManagement } from './ParentManagement';
import { MarkMonitoring } from './MarkMonitoring';
import { BulkReportsPrint } from './BulkReportsPrint';
import { AuditLogsView } from './AuditLogsView';
import { BackupSettings } from './BackupSettings';
import { MarkVerificationModal } from './MarkVerificationModal';
import {
  Users,
  GraduationCap,
  Layers,
  BookOpen,
  Clock,
  CheckCircle2,
  Lock,
  Globe,
  AlertTriangle,
  RotateCcw,
  FileText,
  Shield,
  Settings,
  Eye,
  Calendar,
} from 'lucide-react';

export const AdminDashboard: React.FC = () => {
  const { user, fetchWithAuth, lang, t } = useAuth();
  const [activeTab, setActiveTab] = useState<
    | 'overview'
    | 'exams'
    | 'classes_subjects'
    | 'students'
    | 'teachers'
    | 'parents'
    | 'monitoring'
    | 'reports'
    | 'audit_logs'
    | 'settings'
  >('overview');

  const defaultOverview = {
    totalStudents: 0,
    totalTeachers: 0,
    totalClasses: 0,
    totalSubjects: 0,
    isPublished: false,
    stats: {
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
    },
    recentLogs: [],
  };

  const [loading, setLoading] = useState(true);
  const [overviewData, setOverviewData] = useState<any>(defaultOverview);

  // Quick verify modal from overview
  const [verifyTarget, setVerifyTarget] = useState<{
    classId: string;
    subjectId: string;
    examinationId: string;
  } | null>(null);

  const isMl = lang === 'ml';

  const loadOverview = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/monitoring/overview');
      if (res.ok) {
        const data = await res.json();
        setOverviewData({
          ...defaultOverview,
          ...data,
          stats: {
            ...defaultOverview.stats,
            ...(data?.stats || {}),
          },
        });
      }
    } catch (err) {
      console.error('Error loading admin overview:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, []);

  return (
    <div className="space-y-6">
      {/* Principal Header Banner */}
      <div className="bg-gradient-to-r from-emerald-950 via-emerald-900 to-emerald-800 text-white rounded-2xl p-6 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="font-serif text-emerald-300 text-sm mb-1" dir="rtl">
              بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ • إدارة المدرسة
            </div>
            <h1 className="text-xl md:text-2xl font-bold font-serif">
              {isMl && user?.nameMl ? user.nameMl : user?.name}
            </h1>
            <p className="text-xs text-emerald-200 mt-1">
              Principal Administrator Portal • Al-Madrasathul Islamiya Pallikkuth
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs bg-emerald-800/80 border border-emerald-700 text-emerald-100 font-semibold px-3 py-1.5 rounded-xl">
              Academic Year: 2026–2027
            </span>
            {overviewData?.isPublished ? (
              <span className="text-xs bg-emerald-500 text-emerald-950 font-bold px-3 py-1.5 rounded-xl flex items-center gap-1 shadow-xs">
                <Globe className="w-3.5 h-3.5" />
                Results Published
              </span>
            ) : (
              <span className="text-xs bg-amber-500 text-amber-950 font-bold px-3 py-1.5 rounded-xl flex items-center gap-1 shadow-xs">
                <Clock className="w-3.5 h-3.5" />
                Results In Review
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Navigation Tabs Bar */}
      <div className="bg-white p-1.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-1 overflow-x-auto text-xs font-bold scrollbar-none">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-3.5 py-2 rounded-xl whitespace-nowrap transition ${
            activeTab === 'overview'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          {t.navDashboard}
        </button>

        <button
          onClick={() => setActiveTab('monitoring')}
          className={`px-3.5 py-2 rounded-xl whitespace-nowrap transition ${
            activeTab === 'monitoring'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          {t.navMarkMonitoring}
        </button>

        <button
          onClick={() => setActiveTab('reports')}
          className={`px-3.5 py-2 rounded-xl whitespace-nowrap transition ${
            activeTab === 'reports'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          {t.navProgressReport}
        </button>

        <button
          onClick={() => setActiveTab('exams')}
          className={`px-3.5 py-2 rounded-xl whitespace-nowrap transition ${
            activeTab === 'exams'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          {t.navExams}
        </button>

        <button
          onClick={() => setActiveTab('classes_subjects')}
          className={`px-3.5 py-2 rounded-xl whitespace-nowrap transition ${
            activeTab === 'classes_subjects'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          {t.navClassesSubjects}
        </button>

        <button
          onClick={() => setActiveTab('students')}
          className={`px-3.5 py-2 rounded-xl whitespace-nowrap transition ${
            activeTab === 'students'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          {t.navStudents}
        </button>

        <button
          onClick={() => setActiveTab('teachers')}
          className={`px-3.5 py-2 rounded-xl whitespace-nowrap transition ${
            activeTab === 'teachers'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          {t.navTeachers}
        </button>

        <button
          onClick={() => setActiveTab('parents')}
          className={`px-3.5 py-2 rounded-xl whitespace-nowrap transition ${
            activeTab === 'parents'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          {t.navParents}
        </button>

        <button
          onClick={() => setActiveTab('audit_logs')}
          className={`px-3.5 py-2 rounded-xl whitespace-nowrap transition ${
            activeTab === 'audit_logs'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          {t.navAuditLogs}
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`px-3.5 py-2 rounded-xl whitespace-nowrap transition ${
            activeTab === 'settings'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          {t.navSettings}
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* 1. Core Summary Cards (10 required metrics) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3.5 text-xs">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase block">Total Students</span>
              <span className="text-2xl font-black text-slate-900 font-mono mt-1 block">
                {overviewData?.totalStudents ?? 0}
              </span>
              <span className="text-[10px] text-slate-400">Classes 1–9 Active</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase block">Total Teachers</span>
              <span className="text-2xl font-black text-blue-900 font-mono mt-1 block">
                {overviewData?.totalTeachers ?? 0}
              </span>
              <span className="text-[10px] text-slate-400">Usthads Assigned</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase block">Classes & Grades</span>
              <span className="text-2xl font-black text-slate-900 font-mono mt-1 block">
                {overviewData?.totalClasses ?? 0}
              </span>
              <span className="text-[10px] text-slate-400">Class 1 to Class 9</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase block">Total Subjects</span>
              <span className="text-2xl font-black text-slate-900 font-mono mt-1 block">
                {overviewData?.totalSubjects ?? 0}
              </span>
              <span className="text-[10px] text-slate-400">50 Max Marks each</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase block">Not Started</span>
              <span className="text-2xl font-black text-slate-400 font-mono mt-1 block">
                {overviewData?.stats?.countNotStarted ?? 0}
              </span>
              <span className="text-[10px] text-slate-400">Sheets uninitiated</span>
            </div>

            <div className="bg-amber-50/60 p-4 rounded-2xl border border-amber-200 shadow-2xs">
              <span className="text-[11px] font-bold text-amber-800 uppercase block">In Progress</span>
              <span className="text-2xl font-black text-amber-900 font-mono mt-1 block">
                {overviewData?.stats?.countDraft ?? 0}
              </span>
              <span className="text-[10px] text-amber-700">Teacher Drafts</span>
            </div>

            <div className="bg-blue-50/60 p-4 rounded-2xl border border-blue-200 shadow-2xs">
              <span className="text-[11px] font-bold text-blue-800 uppercase block">Submitted</span>
              <span className="text-2xl font-black text-blue-900 font-mono mt-1 block">
                {overviewData?.stats?.countSubmitted ?? 0}
              </span>
              <span className="text-[10px] text-blue-700">Awaiting Verification</span>
            </div>

            <div className="bg-emerald-50/60 p-4 rounded-2xl border border-emerald-200 shadow-2xs">
              <span className="text-[11px] font-bold text-emerald-800 uppercase block">Approved</span>
              <span className="text-2xl font-black text-emerald-900 font-mono mt-1 block">
                {overviewData?.stats?.countApproved ?? 0}
              </span>
              <span className="text-[10px] text-emerald-700">Verified by Principal</span>
            </div>

            <div className="bg-purple-50/60 p-4 rounded-2xl border border-purple-200 shadow-2xs">
              <span className="text-[11px] font-bold text-purple-800 uppercase block">Locked</span>
              <span className="text-2xl font-black text-purple-900 font-mono mt-1 block">
                {overviewData?.stats?.countLocked ?? 0}
              </span>
              <span className="text-[10px] text-purple-700">Prevented Edits</span>
            </div>

            <div className="bg-emerald-900 text-white p-4 rounded-2xl shadow-2xs">
              <span className="text-[11px] font-bold text-emerald-200 uppercase block">Results Status</span>
              <span className="text-lg font-bold mt-1 block">
                {overviewData?.isPublished ? 'Published' : 'In Review'}
              </span>
              <span className="text-[10px] text-emerald-300">
                {overviewData?.isPublished ? 'Parent Access Enabled' : 'Parent Access Hidden'}
              </span>
            </div>
          </div>

          {/* Quick Actions & Navigation Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div
              onClick={() => setActiveTab('monitoring')}
              className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs hover:border-emerald-600 cursor-pointer transition"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-800 flex items-center justify-center mb-3">
                <Clock className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900 text-sm">Verify Submitted Marks</h3>
              <p className="text-xs text-slate-500 mt-1">
                Inspect sheets submitted by teachers, approve, lock, or return for correction.
              </p>
            </div>

            <div
              onClick={() => setActiveTab('reports')}
              className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs hover:border-emerald-600 cursor-pointer transition"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-800 flex items-center justify-center mb-3">
                <FileText className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900 text-sm">Class Progress Reports & Print</h3>
              <p className="text-xs text-slate-500 mt-1">
                Generate and print authentic A4 Progress Reports with Malayalam & English translations.
              </p>
            </div>

            <div
              onClick={() => setActiveTab('exams')}
              className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs hover:border-emerald-600 cursor-pointer transition"
            >
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-800 flex items-center justify-center mb-3">
                <Globe className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900 text-sm">Publish Examination Results</h3>
              <p className="text-xs text-slate-500 mt-1">
                Review the publication readiness checklist and publish or schedule for parents.
              </p>
            </div>
          </div>

          {/* Recent Audit Logs Strip */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-800" />
                Recent System Activity Audit Logs
              </h3>
              <button
                onClick={() => setActiveTab('audit_logs')}
                className="text-xs font-bold text-emerald-800 hover:underline"
              >
                View Full Audit Trail →
              </button>
            </div>

            <div className="divide-y divide-slate-100 text-xs">
              {(overviewData?.recentLogs || []).slice(0, 5).map((log: any) => (
                <div key={log.id} className="py-2.5 flex items-start justify-between gap-4">
                  <div>
                    <span className="font-bold text-slate-800">{log.userName}</span>
                    <span className="text-slate-400 ml-1">({log.userRole}):</span>
                    <span className="text-slate-600 ml-1.5">{log.details}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'monitoring' && <MarkMonitoring />}
      {activeTab === 'reports' && <BulkReportsPrint />}
      {activeTab === 'exams' && <ExamManagement />}
      {activeTab === 'classes_subjects' && <ClassSubjectConfig />}
      {activeTab === 'students' && <StudentManagement />}
      {activeTab === 'teachers' && <TeacherManagement />}
      {activeTab === 'parents' && <ParentManagement />}
      {activeTab === 'audit_logs' && <AuditLogsView />}
      {activeTab === 'settings' && <BackupSettings />}
    </div>
  );
};
