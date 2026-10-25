import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Examination, ClassItem, isClassResultsPublished } from '../../types';
import { MarkVerificationModal } from './MarkVerificationModal';
import {
  Search,
  Filter,
  Eye,
  CheckCircle,
  Clock,
  Lock,
  Unlock,
  AlertCircle,
  FileSpreadsheet,
  Download,
  Globe,
  RotateCcw,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';

export const MarkMonitoring: React.FC = () => {
  const { fetchWithAuth, lang, t } = useAuth();
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [examinations, setExaminations] = useState<Examination[]>([]);
  const [selectedExamId, setSelectedExamId] = useState('');
  const [matrix, setMatrix] = useState<any[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [filterClass, setFilterClass] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');

  // Active Inspect Modal
  const [inspectTarget, setInspectTarget] = useState<{
    classId: string;
    subjectId: string;
    examinationId: string;
  } | null>(null);

  const isMl = lang === 'ml';

  const loadData = async () => {
    setLoading(true);
    try {
      const [resExams, resCls] = await Promise.all([
        fetchWithAuth('/api/examinations'),
        fetchWithAuth('/api/classes'),
      ]);
      const exams = await resExams.json();
      const cls = await resCls.json();
      setExaminations(Array.isArray(exams) ? exams : []);
      setClasses(Array.isArray(cls) ? cls : []);

      const activeExamId = selectedExamId || exams[0]?.id;
      if (activeExamId) {
        setSelectedExamId(activeExamId);
        await loadMatrix(activeExamId);
      }
    } catch (err) {
      console.error('Error loading monitoring data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadMatrix = async (examId: string) => {
    try {
      const res = await fetchWithAuth(`/api/monitoring/matrix?examinationId=${examId}`);
      if (res.ok) {
        const data = await res.json();
        setMatrix(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error loading matrix:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleExamChange = (examId: string) => {
    setSelectedExamId(examId);
    loadMatrix(examId);
  };

  // Class-wise Lock Action
  const handleLockClass = async (classId: string) => {
    if (!selectedExamId || !classId) return;
    const confirm = window.confirm(
      'Are you sure you want to lock all mark sheets for this class? Once locked, neither the Subject Teacher nor the Class Teacher can make edits.'
    );
    if (!confirm) return;

    setActionLoading(`lock_${classId}`);
    try {
      const res = await fetchWithAuth(`/api/examinations/${selectedExamId}/classes/${classId}/lock`, {
        method: 'POST',
      });
      if (res.ok) {
        const updatedExam = await res.json();
        setExaminations(prev => prev.map(e => (e.id === updatedExam.id ? updatedExam : e)));
        await loadMatrix(selectedExamId);
        alert('All marks for this class have been locked successfully.');
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to lock class marks');
      }
    } catch (e: any) {
      alert(e.message || 'Error locking class marks');
    } finally {
      setActionLoading(null);
    }
  };

  // Class-wise Unlock Action
  const handleUnlockClass = async (classId: string) => {
    if (!selectedExamId || !classId) return;
    const confirm = window.confirm(
      'Unlock class marks? This will return the mark sheets to "approved" state and allow Class Teacher modifications.'
    );
    if (!confirm) return;

    setActionLoading(`unlock_${classId}`);
    try {
      const res = await fetchWithAuth(`/api/examinations/${selectedExamId}/classes/${classId}/unlock`, {
        method: 'POST',
      });
      if (res.ok) {
        const updatedExam = await res.json();
        setExaminations(prev => prev.map(e => (e.id === updatedExam.id ? updatedExam : e)));
        await loadMatrix(selectedExamId);
        alert('Class marks unlocked. Reverted to approved status.');
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to unlock class marks');
      }
    } catch (e: any) {
      alert(e.message || 'Error unlocking class marks');
    } finally {
      setActionLoading(null);
    }
  };

  // Class-wise Publish Action (Separate from Locking)
  const handleTogglePublishClass = async (classId: string, currentPublished: boolean) => {
    if (!selectedExamId || !classId) return;
    const actionWord = currentPublished ? 'unpublish' : 'publish';
    const confirm = window.confirm(
      currentPublished
        ? 'Unpublish results for this class? Parents will no longer be able to view report cards until re-published.'
        : 'Publish results for this class? Parents will be able to view their children’s verified report cards.'
    );
    if (!confirm) return;

    setActionLoading(`pub_${classId}`);
    try {
      const res = await fetchWithAuth(`/api/examinations/${selectedExamId}/classes/${classId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublished: !currentPublished }),
      });
      if (res.ok) {
        const updatedExam = await res.json();
        setExaminations(prev => prev.map(e => (e.id === updatedExam.id ? updatedExam : e)));
        alert(
          currentPublished
            ? 'Results unpublished for this class.'
            : 'Results officially published for this class! Parents can now access report cards.'
        );
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || `Failed to ${actionWord} results`);
      }
    } catch (e: any) {
      alert(e.message || `Error attempting to ${actionWord} class results`);
    } finally {
      setActionLoading(null);
    }
  };

  const selectedExam = examinations.find(e => e.id === selectedExamId);

  const filteredMatrix = matrix.filter(item => {
    const matchClass = filterClass ? item.classId === filterClass : true;
    const matchStatus = filterStatus ? item.status === filterStatus : true;
    const q = search.toLowerCase();
    const matchSearch =
      (item.subjectNameMl && item.subjectNameMl.toLowerCase().includes(q)) ||
      item.subjectNameEn.toLowerCase().includes(q) ||
      item.className.toLowerCase().includes(q) ||
      item.teacherName.toLowerCase().includes(q);
    return matchClass && matchStatus && matchSearch;
  });

  if (loading) {
    return <div className="text-center py-10 text-xs text-slate-500">Loading mark monitoring matrix...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Title & Exam Selector */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{t.navMarkMonitoring}</h2>
          <p className="text-xs text-slate-500">
            3-Tier Workflow (Subject Teacher → Class Teacher → Principal): Review submissions, execute Class-wise Locking, and independently Publish results for parents.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold text-slate-600">Select Exam:</label>
          <select
            value={selectedExamId}
            onChange={e => handleExamChange(e.target.value)}
            className="p-2 border border-slate-300 rounded-xl bg-white font-bold text-xs text-emerald-900 focus:outline-none"
          >
            {examinations.map(e => (
              <option key={e.id} value={e.id}>
                {isMl ? e.nameMl : e.nameEn}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 3-Tier Workflow Explainer Banner */}
      <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="w-4 h-4 text-emerald-300" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-200">
                Authoritative 3-Tier Mark Submission &amp; Approval Architecture
              </span>
            </div>
            <p className="text-xs text-emerald-100/90 leading-relaxed max-w-3xl">
              1. <strong>Subject Teacher</strong> enters &amp; submits marks (Draft → Submitted). <br />
              2. <strong>Class Teacher</strong> directly inspects/modifies marks and approves (Submitted → Approved). <br />
              3. <strong>Principal</strong> locks class marks (Approved → Locked) and independently publishes results for parents.
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-2 text-[11px] font-mono text-emerald-200 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
            <span>Locking &amp; Publishing Decoupled</span>
          </div>
        </div>
      </div>

      {/* Class-Wise Workflow Control Strip */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Class-Wise Mark Approval &amp; Independent Publication Control
          </h3>
          <span className="text-[11px] text-slate-500">
            {classes.length} Academic Classes
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {classes.map(cls => {
            const classItems = matrix.filter(m => m.classId === cls.id);
            const totalSubs = classItems.length;
            const draftCount = classItems.filter(m => m.status === 'draft' || m.status === 'not_started').length;
            const submittedCount = classItems.filter(m => m.status === 'submitted').length;
            const approvedCount = classItems.filter(m => m.status === 'approved').length;
            const lockedCount = classItems.filter(m => m.status === 'locked').length;

            const isClassLocked =
              (selectedExam?.lockedClasses && selectedExam.lockedClasses.includes(cls.id)) ||
              (totalSubs > 0 && lockedCount === totalSubs);

            const isClassPublished = isClassResultsPublished(selectedExam, cls.id);

            return (
              <div
                key={cls.id}
                className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs hover:shadow-xs transition space-y-3"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">
                      {isMl ? cls.nameMl || cls.name : cls.name}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      In-Charge: {(cls as any).classTeacherName || (cls as any).inChargeTeacherName || 'Class In-Charge'}
                    </span>
                  </div>

                  {/* Overall Class Status Pill */}
                  <div>
                    {isClassLocked ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-800 bg-purple-100 border border-purple-200 px-2 py-0.5 rounded-full">
                        <Lock className="w-2.5 h-2.5" />
                        Class Locked
                      </span>
                    ) : approvedCount > 0 ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full">
                        <CheckCircle className="w-2.5 h-2.5" />
                        {approvedCount} Approved
                      </span>
                    ) : submittedCount > 0 ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-800 bg-blue-100 border border-blue-200 px-2 py-0.5 rounded-full">
                        <Clock className="w-2.5 h-2.5" />
                        {submittedCount} Submitted
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                        {draftCount} In Progress
                      </span>
                    )}
                  </div>
                </div>

                {/* Status Badges Matrix Mini */}
                <div className="grid grid-cols-4 gap-1 text-center font-mono text-[10px]">
                  <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                    <span className="text-slate-400 block text-[9px] uppercase">Draft</span>
                    <span className="font-bold text-slate-700">{draftCount}</span>
                  </div>
                  <div className="bg-blue-50/70 p-1.5 rounded-lg border border-blue-100">
                    <span className="text-blue-600 block text-[9px] uppercase">Subm</span>
                    <span className="font-bold text-blue-800">{submittedCount}</span>
                  </div>
                  <div className="bg-emerald-50/70 p-1.5 rounded-lg border border-emerald-100">
                    <span className="text-emerald-600 block text-[9px] uppercase">Appr</span>
                    <span className="font-bold text-emerald-800">{approvedCount}</span>
                  </div>
                  <div className="bg-purple-50/70 p-1.5 rounded-lg border border-purple-100">
                    <span className="text-purple-600 block text-[9px] uppercase">Lock</span>
                    <span className="font-bold text-purple-800">{lockedCount}</span>
                  </div>
                </div>

                {/* Two Distinct Decoupled Actions: 1. Lock Marks, 2. Publish Results */}
                <div className="pt-1 space-y-2 border-t border-slate-100">
                  {/* Action 1: Class-Wise Lock Marks */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-slate-700 flex items-center gap-1">
                      <Lock className="w-3 h-3 text-purple-700" />
                      <span>Locking:</span>
                    </span>

                    {isClassLocked ? (
                      <button
                        type="button"
                        disabled={actionLoading === `unlock_${cls.id}`}
                        onClick={() => handleUnlockClass(cls.id)}
                        className="px-2.5 py-1 text-[11px] font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        title="Unlock class marks to allow Class Teacher corrections"
                      >
                        <Unlock className="w-3 h-3 text-amber-700" />
                        <span>Unlock Class</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={actionLoading === `lock_${cls.id}` || (approvedCount === 0 && lockedCount === 0)}
                        onClick={() => handleLockClass(cls.id)}
                        className="px-2.5 py-1 text-[11px] font-bold text-white bg-purple-800 hover:bg-purple-900 rounded-lg transition flex items-center gap-1 cursor-pointer disabled:opacity-40"
                        title="Lock approved marks so teachers cannot edit them"
                      >
                        <Lock className="w-3 h-3" />
                        <span>Lock Class Marks</span>
                      </button>
                    )}
                  </div>

                  {/* Action 2: Class-Wise Publish Results */}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                    <span className="text-[11px] font-semibold text-slate-700 flex items-center gap-1">
                      <Globe className="w-3 h-3 text-emerald-700" />
                      <span>Parents:</span>
                    </span>

                    <button
                      type="button"
                      disabled={actionLoading === `pub_${cls.id}`}
                      onClick={() => handleTogglePublishClass(cls.id, isClassPublished)}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition flex items-center gap-1 cursor-pointer disabled:opacity-50 ${
                        isClassPublished
                          ? 'bg-emerald-100 text-emerald-950 border border-emerald-300 hover:bg-emerald-200'
                          : 'bg-slate-100 text-slate-700 border border-slate-300 hover:bg-emerald-50 hover:text-emerald-900 hover:border-emerald-300'
                      }`}
                      title={isClassPublished ? 'Click to unpublish and hide results from parents' : 'Click to publish and make results accessible to parents'}
                    >
                      {isClassPublished ? (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                          <span>Published (Active)</span>
                        </>
                      ) : (
                        <>
                          <Globe className="w-3 h-3 text-slate-500" />
                          <span>Publish Results</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-600">Class:</span>
            <select
              value={filterClass}
              onChange={e => setFilterClass(e.target.value)}
              className="p-1.5 border border-slate-300 rounded-lg bg-slate-50 text-xs focus:outline-none"
            >
              <option value="">All Classes</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-600">Status:</span>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="p-1.5 border border-slate-300 rounded-lg bg-slate-50 text-xs focus:outline-none"
            >
              <option value="">All Statuses</option>
              <option value="not_started">Not Started</option>
              <option value="draft">1. Draft (Teacher In-Progress)</option>
              <option value="submitted">2. Submitted (Awaiting Class Teacher Approval)</option>
              <option value="approved">3. Approved (Awaiting Principal Lock)</option>
              <option value="locked">4. Locked (Principal Locked)</option>
              <option value="returned_for_correction">Returned for Correction</option>
            </select>
          </div>
        </div>

        <div className="relative w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search class, subject, teacher..."
            className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg bg-slate-50/50 text-xs focus:outline-none"
          />
        </div>
      </div>

      {/* Monitoring Matrix Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden w-full">
        <div className="overflow-x-auto w-full scrollbar-thin">
          <table className="w-full min-w-[680px] text-xs text-left">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b">
              <tr>
                <th className="p-3 w-28 whitespace-nowrap">Class</th>
                <th className="p-3 whitespace-nowrap">Subject</th>
                <th className="p-3 whitespace-nowrap">Assigned Teacher</th>
                <th className="p-3 text-center w-24 whitespace-nowrap">Students</th>
                <th className="p-3 text-center w-48 whitespace-nowrap">Workflow Status</th>
                <th className="p-3 text-center w-32 whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredMatrix.map((item, idx) => {
                const status = item.status;
                return (
                  <tr key={idx} className="hover:bg-slate-50 transition">
                    <td className="p-3 font-bold text-slate-800">
                      <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded">
                        {isMl ? item.classNameMl : item.className}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-slate-900 text-sm">
                        {item.numericGrade === 9 && (item.subjectId === 'sub_history_buhuth' || item.subjectCode === 'HST')
                          ? 'ബുഹൂസ്'
                          : item.subjectNameMl || item.subjectNameEn}
                      </div>
                    </td>
                    <td className="p-3">
                      <span
                        className={`font-medium ${
                          item.teacherName === 'Unassigned' ? 'text-rose-600 font-bold' : 'text-slate-700'
                        }`}
                      >
                        {item.teacherName}
                      </span>
                    </td>
                    <td className="p-3 text-center font-mono font-semibold text-slate-600">
                      {item.studentCount}
                    </td>
                    <td className="p-3 text-center">
                      {status === 'not_started' && (
                        <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                          Not Started
                        </span>
                      )}
                      {status === 'draft' && (
                        <span className="text-[11px] font-semibold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full">
                          1. Draft / In Progress
                        </span>
                      )}
                      {status === 'submitted' && (
                        <span className="text-[11px] font-semibold text-blue-800 bg-blue-100 px-2.5 py-0.5 rounded-full inline-flex items-center justify-center gap-1">
                          <Clock className="w-3 h-3" />
                          2. Submitted (Awaiting Class Teacher Approval)
                        </span>
                      )}
                      {status === 'approved' && (
                        <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full inline-flex items-center justify-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          3. Approved — Awaiting Principal Lock
                        </span>
                      )}
                      {status === 'locked' && (
                        <span className="text-[11px] font-semibold text-purple-800 bg-purple-100 px-2.5 py-0.5 rounded-full inline-flex items-center justify-center gap-1">
                          <Lock className="w-3 h-3" />
                          4. Locked by Principal
                        </span>
                      )}
                      {status === 'returned_for_correction' && (
                        <span className="text-[11px] font-semibold text-rose-800 bg-rose-100 px-2 py-0.5 rounded-full">
                          Returned for Correction
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() =>
                          setInspectTarget({
                            classId: item.classId,
                            subjectId: item.subjectId,
                            examinationId: selectedExamId,
                          })
                        }
                        className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition"
                      >
                        <Eye className="w-3 h-3" />
                        Inspect &amp; Verify
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inspect and Verification Modal */}
      {inspectTarget && (
        <MarkVerificationModal
          markSheetId=""
          classId={inspectTarget.classId}
          subjectId={inspectTarget.subjectId}
          examinationId={inspectTarget.examinationId}
          onClose={() => setInspectTarget(null)}
          onRefresh={() => loadMatrix(selectedExamId)}
        />
      )}
    </div>
  );
};

