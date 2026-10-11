import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Examination, AcademicYear } from '../../types';
import {
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Globe,
  Plus,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';

export const ExamManagement: React.FC = () => {
  const { fetchWithAuth, lang, t } = useAuth();
  const [loading, setLoading] = useState(true);
  const [examinations, setExaminations] = useState<Examination[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [readiness, setReadiness] = useState<any>(null);

  // Modals / forms
  const [showNewExamModal, setShowNewExamModal] = useState(false);
  const [newExamNameEn, setNewExamNameEn] = useState('');
  const [newExamNameMl, setNewExamNameMl] = useState('');
  const [newAyId, setNewAyId] = useState('');
  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');

  const isMl = lang === 'ml';

  const loadData = async () => {
    setLoading(true);
    try {
      const [resExams, resAys] = await Promise.all([
        fetchWithAuth('/api/examinations'),
        fetchWithAuth('/api/academic-years'),
      ]);
      const exams = await resExams.json();
      const ays = await resAys.json();
      setExaminations(exams);
      setAcademicYears(ays);

      const activeId = selectedExamId || exams[0]?.id;
      if (activeId) {
        setSelectedExamId(activeId);
        loadReadiness(activeId);
      }
    } catch (err) {
      console.error('Error loading exams:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadReadiness = async (examId: string) => {
    try {
      const res = await fetchWithAuth(`/api/examinations/${examId}/readiness`);
      if (res.ok) {
        const r = await res.json();
        setReadiness(r);
      }
    } catch (err) {
      console.error('Error loading readiness:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSelectExam = (examId: string) => {
    setSelectedExamId(examId);
    loadReadiness(examId);
  };

  const handlePublishNow = async () => {
    if (!selectedExamId) return;
    const confirm = window.confirm(
      'Are you sure you want to publish examination results immediately? All parents will now be able to view and print their children\'s progress reports.'
    );
    if (!confirm) return;

    try {
      const res = await fetchWithAuth(`/api/examinations/${selectedExamId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'publish_now' }),
      });
      if (res.ok) {
        alert('Results successfully published!');
        loadData();
      }
    } catch (err) {
      alert('Failed to publish results');
    }
  };

  const handleSchedulePublish = async () => {
    if (!scheduledDate) {
      alert('Please select a valid scheduled date & time.');
      return;
    }
    try {
      const res = await fetchWithAuth(`/api/examinations/${selectedExamId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'schedule', scheduledPublishDate: scheduledDate }),
      });
      if (res.ok) {
        alert(`Results publication scheduled for ${scheduledDate}`);
        loadData();
      }
    } catch (err) {
      alert('Failed to schedule publication');
    }
  };

  const handleRevokePublish = async () => {
    const confirm = window.confirm(
      'Are you sure you want to revoke result publication? Parents will no longer be able to see results until published again.'
    );
    if (!confirm) return;

    try {
      const res = await fetchWithAuth(`/api/examinations/${selectedExamId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revoke' }),
      });
      if (res.ok) {
        alert('Result publication revoked.');
        loadData();
      }
    } catch (err) {
      alert('Failed to revoke publication');
    }
  };

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExamNameEn || !newAyId) return;

    try {
      const res = await fetchWithAuth('/api/examinations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          academicYearId: newAyId,
          nameEn: newExamNameEn,
          nameMl: newExamNameMl || newExamNameEn,
          startDate: newStartDate,
          endDate: newEndDate,
          passMarkPercentage: 40,
        }),
      });
      if (res.ok) {
        setShowNewExamModal(false);
        setNewExamNameEn('');
        setNewExamNameMl('');
        loadData();
      }
    } catch (err) {
      alert('Failed to create examination');
    }
  };

  if (loading) {
    return <div className="text-center py-10 text-xs text-slate-500">Loading examinations...</div>;
  }

  const selectedExam = examinations.find(e => e.id === selectedExamId);

  return (
    <div className="space-y-6">
      {/* Title & Action */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{t.navExams}</h2>
          <p className="text-xs text-slate-500">
            Configure academic sessions, schedule examinations, and control result publication for parents.
          </p>
        </div>

        <button
          onClick={() => {
            setNewAyId(academicYears[0]?.id || '');
            setShowNewExamModal(true);
          }}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition shadow-xs"
        >
          <Plus className="w-4 h-4" />
          Create New Examination
        </button>
      </div>

      {/* Examinations Cards List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {examinations.map(exam => {
          const isSelected = exam.id === selectedExamId;
          const ay = academicYears.find(a => a.id === exam.academicYearId);

          return (
            <div
              key={exam.id}
              onClick={() => handleSelectExam(exam.id)}
              className={`p-5 rounded-2xl border cursor-pointer transition flex flex-col justify-between ${
                isSelected
                  ? 'bg-emerald-50/70 border-emerald-600 shadow-xs ring-1 ring-emerald-600'
                  : 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                    {ay?.year || '2026–2027'}
                  </span>
                  {exam.isPublished ? (
                    <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Published
                    </span>
                  ) : (
                    <span className="text-[11px] font-bold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full">
                      Draft / In Review
                    </span>
                  )}
                </div>

                <h3 className="font-bold text-slate-900 text-base">
                  {isMl ? exam.nameMl : exam.nameEn}
                </h3>
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    {exam.startDate} to {exam.endDate}
                  </span>
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-medium">
                <span>Pass Mark: {exam.passMarkPercentage}%</span>
                <span className="text-emerald-800 font-bold">
                  {isSelected ? 'Selected' : 'Select'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Publication Controls & Readiness Checklist */}
      {selectedExam && readiness && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Globe className="w-5 h-5 text-emerald-800" />
                Result Publication Control for {selectedExam.nameEn}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Authoritative Principal control: Results will only be accessible by parents once published.
              </p>
            </div>

            {/* Publication Actions */}
            <div className="flex flex-wrap items-center gap-2">
              {selectedExam.isPublished ? (
                <button
                  onClick={handleRevokePublish}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-300 rounded-xl transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Revoke Result Publication
                </button>
              ) : (
                <>
                  <button
                    onClick={handlePublishNow}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition shadow-xs"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Publish Immediately
                  </button>

                  <div className="flex items-center gap-1 bg-slate-50 p-1 border border-slate-200 rounded-xl">
                    <input
                      type="datetime-local"
                      value={scheduledDate}
                      onChange={e => setScheduledDate(e.target.value)}
                      className="text-xs px-2 py-1 bg-white border border-slate-300 rounded-lg focus:outline-none"
                    />
                    <button
                      onClick={handleSchedulePublish}
                      className="px-2.5 py-1 text-xs font-bold bg-slate-800 text-white rounded-lg hover:bg-slate-900"
                    >
                      Schedule
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Readiness Summary Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <span className="text-[11px] font-bold text-slate-500 uppercase block">Total Mark Sheets</span>
              <span className="text-xl font-black text-slate-900 font-mono mt-0.5 block">
                {readiness.totalRequiredSheets}
              </span>
            </div>
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-200">
              <span className="text-[11px] font-bold text-blue-700 uppercase block">Submitted</span>
              <span className="text-xl font-black text-blue-900 font-mono mt-0.5 block">
                {readiness.totalSubmitted}
              </span>
            </div>
            <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200">
              <span className="text-[11px] font-bold text-emerald-700 uppercase block">Approved</span>
              <span className="text-xl font-black text-emerald-900 font-mono mt-0.5 block">
                {readiness.totalApproved}
              </span>
            </div>
            <div className="bg-purple-50 p-4 rounded-xl border border-purple-200">
              <span className="text-[11px] font-bold text-purple-700 uppercase block">Locked</span>
              <span className="text-xl font-black text-purple-900 font-mono mt-0.5 block">
                {readiness.totalLocked}
              </span>
            </div>
          </div>

          {/* Checklist Matrix */}
          <div>
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
              Publication Readiness Checklist
            </h4>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 font-bold text-slate-700">
                  <tr>
                    <th className="p-2.5">Class</th>
                    <th className="p-2.5">Subject</th>
                    <th className="p-2.5">Assigned Teacher</th>
                    <th className="p-2.5 text-center">Status</th>
                    <th className="p-2.5 text-center">Ready for Publication</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {readiness.items.map((item: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="p-2.5 font-bold text-slate-800">{item.className}</td>
                      <td className="p-2.5 font-medium">{item.subjectName}</td>
                      <td className="p-2.5 text-slate-600">{item.teacherName}</td>
                      <td className="p-2.5 text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100">
                          {item.status}
                        </span>
                      </td>
                      <td className="p-2.5 text-center">
                        {item.isReady ? (
                          <span className="text-emerald-700 font-bold flex items-center justify-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Ready
                          </span>
                        ) : (
                          <span className="text-amber-700 font-bold flex items-center justify-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" /> Pending
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* New Exam Modal */}
      {showNewExamModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-4">Create New Examination</h3>
            <form onSubmit={handleCreateExam} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Academic Year</label>
                <select
                  value={newAyId}
                  onChange={e => setNewAyId(e.target.value)}
                  className="w-full p-2.5 border rounded-lg bg-slate-50"
                  required
                >
                  {academicYears.map(ay => (
                    <option key={ay.id} value={ay.id}>
                      {ay.year}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Examination Name (English)</label>
                <input
                  type="text"
                  value={newExamNameEn}
                  onChange={e => setNewExamNameEn(e.target.value)}
                  placeholder="e.g. Annual Examination 2027"
                  className="w-full p-2.5 border rounded-lg"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Examination Name (Malayalam)</label>
                <input
                  type="text"
                  value={newExamNameMl}
                  onChange={e => setNewExamNameMl(e.target.value)}
                  placeholder="ഉദാ: വാർഷിക പരീക്ഷ 2027"
                  className="w-full p-2.5 border rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={newStartDate}
                    onChange={e => setNewStartDate(e.target.value)}
                    className="w-full p-2.5 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={newEndDate}
                    onChange={e => setNewEndDate(e.target.value)}
                    className="w-full p-2.5 border rounded-lg"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewExamModal(false)}
                  className="px-3.5 py-2 text-slate-600 bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-bold text-white bg-emerald-800 rounded-lg hover:bg-emerald-900"
                >
                  Save Examination
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
