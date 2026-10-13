import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Examination, ClassItem } from '../../types';
import { MarkVerificationModal } from './MarkVerificationModal';
import {
  Search,
  Filter,
  Eye,
  CheckCircle,
  Clock,
  Lock,
  AlertCircle,
  FileSpreadsheet,
  Download,
} from 'lucide-react';

export const MarkMonitoring: React.FC = () => {
  const { fetchWithAuth, lang, t } = useAuth();
  const [loading, setLoading] = useState(true);
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
      setExaminations(exams);
      setClasses(cls);

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
        setMatrix(data);
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

  const selectedExam = examinations.find(e => e.id === selectedExamId);

  return (
    <div className="space-y-6">
      {/* Title & Exam Selector */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{t.navMarkMonitoring}</h2>
          <p className="text-xs text-slate-500">
            Real-time examination submission tracking, principal verification, and mark corrections.
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
              <option value="draft">Draft / In Progress</option>
              <option value="submitted">Submitted (Awaiting Approval)</option>
              <option value="approved">Approved</option>
              <option value="locked">Locked</option>
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
                <th className="p-3 whitespace-nowrap">Assigned Usthad (Teacher)</th>
                <th className="p-3 text-center w-24 whitespace-nowrap">Students</th>
                <th className="p-3 text-center w-36 whitespace-nowrap">Status</th>
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
                      <span className="text-[11px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                        In Progress
                      </span>
                    )}
                    {status === 'submitted' && (
                      <span className="text-[11px] font-semibold text-blue-800 bg-blue-100 px-2 py-0.5 rounded-full flex items-center justify-center gap-1">
                        <Clock className="w-3 h-3" />
                        Submitted
                      </span>
                    )}
                    {status === 'approved' && (
                      <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center justify-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        Approved
                      </span>
                    )}
                    {status === 'locked' && (
                      <span className="text-[11px] font-semibold text-purple-800 bg-purple-100 px-2 py-0.5 rounded-full flex items-center justify-center gap-1">
                        <Lock className="w-3 h-3" />
                        Locked
                      </span>
                    )}
                    {status === 'returned_for_correction' && (
                      <span className="text-[11px] font-semibold text-rose-800 bg-rose-100 px-2 py-0.5 rounded-full">
                        Returned
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
                      Inspect & Verify
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
