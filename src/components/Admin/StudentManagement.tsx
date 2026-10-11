import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Student, ClassItem } from '../../types';
import {
  Users,
  Search,
  Plus,
  Upload,
  Download,
  Edit2,
  Trash2,
  CheckCircle,
  AlertTriangle,
  X,
  FileSpreadsheet,
} from 'lucide-react';

export const StudentManagement: React.FC = () => {
  const { fetchWithAuth, lang, t } = useAuth();
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Add / Edit Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [formData, setFormData] = useState({
    admissionNo: '',
    rollNo: '',
    nameEn: '',
    nameMl: '',
    classId: '',
    parentNameEn: '',
    parentPhone: '',
    gender: 'M' as 'M' | 'F',
  });

  // CSV Import Modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [importClassId, setImportClassId] = useState('');
  const [csvText, setCsvText] = useState('');
  const [importPreview, setImportPreview] = useState<any>(null);
  const [isProcessingImport, setIsProcessingImport] = useState(false);

  const isMl = lang === 'ml';

  const loadData = async () => {
    setLoading(true);
    try {
      const [resCls, resStd] = await Promise.all([
        fetchWithAuth('/api/classes'),
        fetchWithAuth('/api/students'),
      ]);
      const clsData = await resCls.json();
      const stdData = await resStd.json();
      setClasses(clsData);
      setStudents(stdData);
      if (clsData.length > 0 && !importClassId) {
        setImportClassId(clsData[0].id);
      }
    } catch (err) {
      console.error('Error loading students:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenAdd = () => {
    setEditingStudent(null);
    setFormData({
      admissionNo: `ADM-2026-${String(students.length + 1).padStart(3, '0')}`,
      rollNo: String(students.length + 1),
      nameEn: '',
      nameMl: '',
      classId: selectedClassId || classes[0]?.id || '',
      parentNameEn: '',
      parentPhone: '',
      gender: 'M',
    });
    setShowAddModal(true);
  };

  const handleOpenEdit = (student: Student) => {
    setEditingStudent(student);
    setFormData({
      admissionNo: student.admissionNo,
      rollNo: String(student.rollNo),
      nameEn: student.nameEn,
      nameMl: student.nameMl || '',
      classId: student.classId,
      parentNameEn: student.parentNameEn || '',
      parentPhone: student.parentPhone || '',
      gender: student.gender || 'M',
    });
    setShowAddModal(true);
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingStudent) {
        const res = await fetchWithAuth(`/api/students/${editingStudent.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...formData,
            rollNo: Number(formData.rollNo),
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to update student');
        }
      } else {
        const res = await fetchWithAuth('/api/students', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...formData,
            rollNo: Number(formData.rollNo),
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to add student');
        }
      }

      setShowAddModal(false);
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // CSV Import Preview
  const handleCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async event => {
      const text = event.target?.result as string;
      setCsvText(text);
      previewCsv(text, importClassId);
    };
    reader.readAsText(file);
  };

  const previewCsv = async (text: string, cId: string) => {
    try {
      const res = await fetchWithAuth('/api/students/import-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText: text, targetClassId: cId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      const data = await res.json();
      setImportPreview(data);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCommitImport = async () => {
    if (!importPreview?.records || !importClassId) return;
    setIsProcessingImport(true);
    try {
      const res = await fetchWithAuth('/api/students/import-commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          records: importPreview.records,
          targetClassId: importClassId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        alert(`Successfully imported ${data.importedCount} student records!`);
        setShowImportModal(false);
        setImportPreview(null);
        setCsvText('');
        loadData();
      }
    } catch (err) {
      alert('Failed to import records');
    } finally {
      setIsProcessingImport(false);
    }
  };

  const handleExportCsv = async () => {
    try {
      const res = await fetchWithAuth(`/api/students/export-csv${selectedClassId ? `?classId=${selectedClassId}` : ''}`);
      if (!res.ok) throw new Error('Failed to export students CSV');
      const text = await res.text();
      const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `students_list${selectedClassId ? `_${selectedClassId}` : ''}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'Error exporting CSV');
    }
  };

  // Filter students
  const filteredStudents = students.filter(s => {
    const matchClass = selectedClassId ? s.classId === selectedClassId : true;
    const q = searchQuery.toLowerCase();
    const matchSearch =
      s.nameEn.toLowerCase().includes(q) ||
      (s.nameMl && s.nameMl.includes(q)) ||
      s.admissionNo.toLowerCase().includes(q) ||
      String(s.rollNo).includes(q);
    return matchClass && matchSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header and Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{t.navStudents} ({students.length})</h2>
          <p className="text-xs text-slate-500">
            Maintain student admissions, roll numbers, class enrollments, and parent links.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition shadow-2xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            {t.exportCsv}
          </button>

          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition"
          >
            <Upload className="w-3.5 h-3.5" />
            {t.importCsv}
          </button>

          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition shadow-xs"
          >
            <Plus className="w-4 h-4" />
            Add Student
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="font-semibold text-slate-600">{t.filterClass}:</span>
          <select
            value={selectedClassId}
            onChange={e => setSelectedClassId(e.target.value)}
            className="p-2 border border-slate-300 rounded-lg bg-slate-50 text-xs font-medium focus:outline-none"
          >
            <option value="">{t.allClasses}</option>
            {classes.map(c => (
              <option key={c.id} value={c.id}>
                {isMl ? c.nameMl : c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by name, roll, adm..."
            className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg bg-slate-50/50 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-700"
          />
        </div>
      </div>

      {/* Students Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-100 text-slate-700 font-bold border-b">
            <tr>
              <th className="p-3 text-center w-12">{t.rollNo}</th>
              <th className="p-3">{t.studentName}</th>
              <th className="p-3">{t.admissionNo}</th>
              <th className="p-3">{t.class}</th>
              <th className="p-3">{t.parent}</th>
              <th className="p-3 text-center w-24">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredStudents.map(student => {
              const cls = classes.find(c => c.id === student.classId);
              return (
                <tr key={student.id} className="hover:bg-slate-50 transition">
                  <td className="p-3 text-center font-mono font-bold text-slate-700">
                    {student.rollNo}
                  </td>
                  <td className="p-3">
                    <div className="font-bold text-slate-900">{student.nameEn}</div>
                    <div className="text-[11px] text-slate-500">{student.nameMl}</div>
                  </td>
                  <td className="p-3 font-mono font-semibold text-slate-600">
                    {student.admissionNo}
                  </td>
                  <td className="p-3">
                    <span className="bg-emerald-50 text-emerald-900 border border-emerald-200 px-2 py-0.5 rounded-md font-semibold">
                      {isMl ? cls?.nameMl : cls?.name}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="font-medium text-slate-800">{student.parentNameEn || '—'}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{student.parentPhone}</div>
                  </td>
                  <td className="p-3 text-center">
                    <button
                      onClick={() => handleOpenEdit(student)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition"
                      title="Edit student"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Student Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-4">
              {editingStudent ? 'Edit Student Details' : 'Add New Student'}
            </h3>
            <form onSubmit={handleSaveStudent} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{t.admissionNo}</label>
                  <input
                    type="text"
                    value={formData.admissionNo}
                    onChange={e => setFormData({ ...formData, admissionNo: e.target.value })}
                    className="w-full p-2 border rounded-lg font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{t.rollNo}</label>
                  <input
                    type="number"
                    value={formData.rollNo}
                    onChange={e => setFormData({ ...formData, rollNo: e.target.value })}
                    className="w-full p-2 border rounded-lg font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Student Name (English)</label>
                <input
                  type="text"
                  value={formData.nameEn}
                  onChange={e => setFormData({ ...formData, nameEn: e.target.value })}
                  placeholder="e.g. Ahmad Rayan"
                  className="w-full p-2 border rounded-lg"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Student Name (Malayalam)</label>
                <input
                  type="text"
                  value={formData.nameMl}
                  onChange={e => setFormData({ ...formData, nameMl: e.target.value })}
                  placeholder="ഉദാ: അഹ്മദ് റയാൻ"
                  className="w-full p-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">{t.class}</label>
                <select
                  value={formData.classId}
                  onChange={e => setFormData({ ...formData, classId: e.target.value })}
                  className="w-full p-2 border rounded-lg bg-slate-50"
                  required
                >
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>
                      {isMl ? c.nameMl : c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Parent Name</label>
                  <input
                    type="text"
                    value={formData.parentNameEn}
                    onChange={e => setFormData({ ...formData, parentNameEn: e.target.value })}
                    placeholder="e.g. Shamsudheen P."
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Parent Phone</label>
                  <input
                    type="text"
                    value={formData.parentPhone}
                    onChange={e => setFormData({ ...formData, parentPhone: e.target.value })}
                    placeholder="+91 9845..."
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3.5 py-2 text-slate-600 bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-bold text-white bg-emerald-800 rounded-lg hover:bg-emerald-900"
                >
                  Save Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV Import Modal with Live Preview & Error Reporting */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto space-y-4 text-xs">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-800" />
                Import Students from Excel-Compatible CSV
              </h3>
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setImportPreview(null);
                }}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Target Class for Import:</label>
              <select
                value={importClassId}
                onChange={e => {
                  setImportClassId(e.target.value);
                  if (csvText) previewCsv(csvText, e.target.value);
                }}
                className="w-full p-2 border rounded-lg bg-slate-50 font-bold"
              >
                {classes.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.nameMl})
                  </option>
                ))}
              </select>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <span className="font-bold text-slate-700 block">CSV File Format Requirements:</span>
              <p className="text-[11px] text-slate-500 font-mono">
                admission_no, roll_no, student_name, name_ml, parent_name, phone
              </p>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleCsvFileChange}
                className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
              />
            </div>

            {/* Live Preview & Error Table */}
            {importPreview && (
              <div className="space-y-3">
                <div className="flex items-center justify-between font-bold">
                  <span>
                    Preview: {importPreview.totalRows} rows ({importPreview.validRows} valid, {importPreview.errorRows} errors)
                  </span>
                </div>

                <div className="border border-slate-200 rounded-lg max-h-48 overflow-y-auto">
                  <table className="w-full text-[11px] text-left">
                    <thead className="bg-slate-100 font-bold sticky top-0">
                      <tr>
                        <th className="p-2">Row</th>
                        <th className="p-2">Admission No</th>
                        <th className="p-2">Name</th>
                        <th className="p-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {importPreview.records.map((r: any, idx: number) => (
                        <tr key={idx} className={r.isValid ? 'bg-white' : 'bg-rose-50'}>
                          <td className="p-2 font-mono">{r.rowNumber}</td>
                          <td className="p-2 font-mono">{r.admissionNo}</td>
                          <td className="p-2 font-medium">{r.nameEn}</td>
                          <td className="p-2">
                            {r.isValid ? (
                              <span className="text-emerald-700 font-bold">Valid</span>
                            ) : (
                              <span className="text-rose-700 font-bold">{r.errors.join(', ')}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="px-3.5 py-2 text-slate-600 bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!importPreview || importPreview.validRows === 0 || isProcessingImport}
                onClick={handleCommitImport}
                className="px-4 py-2 font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg disabled:opacity-50"
              >
                {isProcessingImport ? 'Importing...' : `Confirm Import (${importPreview?.validRows || 0} students)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
