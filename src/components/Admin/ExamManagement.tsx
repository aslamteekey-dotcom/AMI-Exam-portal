import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Examination, AcademicYear } from '../../types';
import { db, handleFirestoreError, OperationType } from '../../services/firebase';
import { firestoreSync, cleanForFirestore } from '../../services/firestoreSync';
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import {
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Globe,
  Plus,
  ShieldCheck,
  RotateCcw,
  Edit2,
  Trash2,
  X,
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
  const [newPassMark, setNewPassMark] = useState('35');
  const [scheduledDate, setScheduledDate] = useState('');

  // Edit Modal State
  const [editingExam, setEditingExam] = useState<Examination | null>(null);
  const [editNameEn, setEditNameEn] = useState('');
  const [editNameMl, setEditNameMl] = useState('');
  const [editAyId, setEditAyId] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editPassMark, setEditPassMark] = useState('35');

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

    // Real-time Firestore sync
    let unsub: (() => void) | undefined;
    try {
      unsub = onSnapshot(
        collection(db, 'exams'),
        snapshot => {
          if (!snapshot.empty) {
            const remoteExams = snapshot.docs.map(docSnap => ({
              ...docSnap.data(),
              id: docSnap.id,
            } as Examination));
            setExaminations(remoteExams);
          }
        },
        error => {
          handleFirestoreError(error, OperationType.GET, 'exams');
        }
      );
    } catch (err) {
      console.warn('Failed to attach exams onSnapshot listener:', err);
    }

    return () => {
      if (unsub) unsub();
    };
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
      const examPayload = {
        academicYearId: newAyId,
        nameEn: newExamNameEn.trim(),
        nameMl: (newExamNameMl || newExamNameEn).trim(),
        startDate: newStartDate,
        endDate: newEndDate,
        passMarkPercentage: Number(newPassMark) || 35,
      };

      const res = await fetchWithAuth('/api/examinations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(examPayload),
      });

      if (res.ok) {
        const created = await res.json();
        // Await persistent Firestore write
        try {
          await setDoc(doc(db, 'exams', created.id), cleanForFirestore(created));
        } catch (fErr) {
          console.warn('Firestore exam write warning:', fErr);
        }

        setShowNewExamModal(false);
        setNewExamNameEn('');
        setNewExamNameMl('');
        setNewStartDate('');
        setNewEndDate('');
        setNewPassMark('35');
        await loadData();
        setSelectedExamId(created.id);
      }
    } catch (err) {
      alert('Failed to create examination');
    }
  };

  const handleOpenEdit = (exam: Examination) => {
    setEditingExam(exam);
    setEditNameEn(exam.nameEn);
    setEditNameMl(exam.nameMl || exam.nameEn);
    setEditAyId(exam.academicYearId);
    setEditStartDate(exam.startDate || '');
    setEditEndDate(exam.endDate || '');
    setEditPassMark(String(exam.passMarkPercentage || 35));
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExam) return;

    try {
      const updatedData = {
        academicYearId: editAyId,
        nameEn: editNameEn.trim(),
        nameMl: editNameMl.trim() || editNameEn.trim(),
        startDate: editStartDate,
        endDate: editEndDate,
        passMarkPercentage: Number(editPassMark) || 35,
      };

      // 1. Persistent Firestore write
      try {
        await setDoc(doc(db, 'exams', editingExam.id), cleanForFirestore(updatedData), { merge: true });
      } catch (fErr) {
        console.warn('Firestore exam edit warning:', fErr);
      }

      // 2. Update local state / backend
      const res = await fetchWithAuth(`/api/examinations/${editingExam.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update examination');
      }

      setEditingExam(null);
      await loadData();
      alert('Examination details updated successfully!');
    } catch (err: any) {
      alert(err.message || 'Error updating examination');
    }
  };

  const handleDeleteExam = async (exam: Examination) => {
    const confirm = window.confirm(
      `Are you sure you want to permanently delete examination "${exam.nameEn}" (${exam.nameMl})? All associated draft mark sheets for this exam will also be removed.`
    );
    if (!confirm) return;

    try {
      // 1. Delete from Firestore
      try {
        await deleteDoc(doc(db, 'exams', exam.id));
      } catch (fErr) {
        console.warn('Firestore delete exam warning:', fErr);
      }

      // 2. Delete from API / local storage
      const res = await fetchWithAuth(`/api/examinations/${exam.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete examination');
      }

      await loadData();
      alert('Examination deleted successfully.');
    } catch (err: any) {
      alert(err.message || 'Error deleting examination');
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
          <h2 className="text-lg font-bold text-slate-900">{t.navExams} ({examinations.length})</h2>
          <p className="text-xs text-slate-500">
            Configure academic sessions, schedule examinations, pass mark criteria, and control result publication for parents.
          </p>
        </div>

        <button
          onClick={() => {
            setNewAyId(academicYears[0]?.id || 'ay_2026_2027');
            setShowNewExamModal(true);
          }}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition shadow-xs cursor-pointer"
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
                  
                  <div className="flex items-center gap-1.5">
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

                    {/* Dedicated Edit and Delete Action Buttons */}
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        handleOpenEdit(exam);
                      }}
                      className="p-1 rounded-lg text-slate-400 hover:text-emerald-800 hover:bg-slate-100 transition"
                      title="Edit examination settings"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        handleDeleteExam(exam);
                      }}
                      className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                      title="Delete examination"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <h3 className="font-bold text-slate-900 text-base">
                  {isMl ? exam.nameMl : exam.nameEn}
                </h3>
                {exam.nameMl && exam.nameMl !== exam.nameEn && (
                  <p className="text-xs text-slate-500">{exam.nameMl}</p>
                )}
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    {exam.startDate ? `${exam.startDate} to ${exam.endDate || '—'}` : 'Dates not set'}
                  </span>
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-medium">
                <span className="font-semibold text-slate-700">
                  Pass Mark: <span className="font-mono text-emerald-800 font-bold">{exam.passMarkPercentage || 35}%</span>
                </span>
                <span className={`font-bold ${isSelected ? 'text-emerald-800' : 'text-slate-400'}`}>
                  {isSelected ? '✓ Selected' : 'Click to Select'}
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
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition shadow-xs cursor-pointer"
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
                      className="px-2.5 py-1 text-xs font-bold bg-slate-800 text-white rounded-lg hover:bg-slate-900 cursor-pointer"
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
                {readiness?.totalRequiredSheets ?? readiness?.totalExpectedSheets ?? 0}
              </span>
            </div>
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-200">
              <span className="text-[11px] font-bold text-blue-700 uppercase block">Submitted</span>
              <span className="text-xl font-black text-blue-900 font-mono mt-0.5 block">
                {readiness?.totalSubmitted ?? readiness?.submittedSheets ?? 0}
              </span>
            </div>
            <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200">
              <span className="text-[11px] font-bold text-emerald-700 uppercase block">Approved</span>
              <span className="text-xl font-black text-emerald-900 font-mono mt-0.5 block">
                {readiness?.totalApproved ?? readiness?.approvedSheets ?? 0}
              </span>
            </div>
            <div className="bg-purple-50 p-4 rounded-xl border border-purple-200">
              <span className="text-[11px] font-bold text-purple-700 uppercase block">Locked</span>
              <span className="text-xl font-black text-purple-900 font-mono mt-0.5 block">
                {readiness?.totalLocked ?? readiness?.lockedSheets ?? 0}
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
                  {(readiness?.items || readiness?.sheetDetails || []).map((item: any, i: number) => (
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

      {/* Edit Exam Modal */}
      {editingExam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-emerald-800" />
                Edit Examination Details
              </h3>
              <button
                onClick={() => setEditingExam(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Academic Year</label>
                <select
                  value={editAyId}
                  onChange={e => setEditAyId(e.target.value)}
                  className="w-full p-2.5 border rounded-lg bg-slate-50 focus:outline-emerald-700"
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
                <label className="block font-bold text-slate-700 mb-1">Examination Title (English)</label>
                <input
                  type="text"
                  value={editNameEn}
                  onChange={e => setEditNameEn(e.target.value)}
                  className="w-full p-2.5 border rounded-lg focus:outline-emerald-700"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Examination Title (Malayalam)</label>
                <input
                  type="text"
                  value={editNameMl}
                  onChange={e => setEditNameMl(e.target.value)}
                  className="w-full p-2.5 border rounded-lg focus:outline-emerald-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={editStartDate}
                    onChange={e => setEditStartDate(e.target.value)}
                    className="w-full p-2.5 border rounded-lg focus:outline-emerald-700"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={editEndDate}
                    onChange={e => setEditEndDate(e.target.value)}
                    className="w-full p-2.5 border rounded-lg focus:outline-emerald-700"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Pass Marks / Minimum Criteria (%)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={editPassMark}
                    onChange={e => setEditPassMark(e.target.value)}
                    className="w-32 p-2.5 border rounded-lg font-mono focus:outline-emerald-700"
                    required
                  />
                  <span className="text-slate-500 font-bold">% required to Pass</span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingExam(null)}
                  className="px-3.5 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-bold text-white bg-emerald-800 rounded-lg hover:bg-emerald-900 cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Exam Modal */}
      {showNewExamModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">Create New Examination</h3>
              <button
                onClick={() => setShowNewExamModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleCreateExam} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Academic Year</label>
                <select
                  value={newAyId}
                  onChange={e => setNewAyId(e.target.value)}
                  className="w-full p-2.5 border rounded-lg bg-slate-50 focus:outline-emerald-700"
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
                  className="w-full p-2.5 border rounded-lg focus:outline-emerald-700"
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
                  className="w-full p-2.5 border rounded-lg focus:outline-emerald-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={newStartDate}
                    onChange={e => setNewStartDate(e.target.value)}
                    className="w-full p-2.5 border rounded-lg focus:outline-emerald-700"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={newEndDate}
                    onChange={e => setNewEndDate(e.target.value)}
                    className="w-full p-2.5 border rounded-lg focus:outline-emerald-700"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Pass Marks / Minimum Criteria (%)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={newPassMark}
                    onChange={e => setNewPassMark(e.target.value)}
                    className="w-32 p-2.5 border rounded-lg font-mono focus:outline-emerald-700"
                    required
                  />
                  <span className="text-slate-500 font-bold">% required to Pass</span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewExamModal(false)}
                  className="px-3.5 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-bold text-white bg-emerald-800 rounded-lg hover:bg-emerald-900 cursor-pointer"
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
