import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Student, ClassItem, sortStudentsBoysFirst } from '../../types';
import { db, handleFirestoreError, OperationType } from '../../services/firebase';
import { firestoreSync, cleanForFirestore } from '../../services/firestoreSync';
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
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
  Loader2,
  Hash,
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
  const [replaceExisting, setReplaceExisting] = useState(false);

  const isMl = lang === 'ml';

  const [deleteClassId, setDeleteClassId] = useState('');

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

    // Real-time listener for Firestore 'students' collection
    let unsub: (() => void) | undefined;
    try {
      unsub = onSnapshot(
        collection(db, 'students'),
        (snapshot) => {
          if (!snapshot.empty) {
            const remoteStudents = snapshot.docs.map((d) => ({
              ...d.data(),
              id: d.id,
            } as Student));
            // Update React state strictly with Firestore documents
            setStudents(remoteStudents);
          } else {
            setStudents([]);
          }
        },
        (error) => {
          console.error('Firestore students onSnapshot error:', error);
          handleFirestoreError(error, OperationType.GET, 'students');
        }
      );
    } catch (err) {
      console.warn('Failed to attach student onSnapshot listener:', err);
    }

    return () => {
      if (unsub) unsub();
    };
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
        const updateData: Partial<Student> = {
          admissionNo: formData.admissionNo.trim(),
          rollNo: Number(formData.rollNo),
          nameEn: formData.nameEn.trim(),
          nameMl: formData.nameMl.trim() || formData.nameEn.trim(),
          classId: formData.classId,
          parentNameEn: formData.parentNameEn.trim(),
          parentPhone: formData.parentPhone.trim(),
          gender: formData.gender,
        };

        // 1. Persistent Firestore write
        try {
          await setDoc(doc(db, 'students', editingStudent.id), cleanForFirestore(updateData), { merge: true });
        } catch (firestoreErr: any) {
          console.error('Firestore write error when updating student:', firestoreErr);
          handleFirestoreError(firestoreErr, OperationType.WRITE, `students/${editingStudent.id}`);
          alert(`Firestore error: ${firestoreErr.message || 'Failed to update student in cloud database'}`);
          return;
        }

        const res = await fetchWithAuth(`/api/students/${editingStudent.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to update student');
        }
      } else {
        const studentId = formData.admissionNo.trim();
        const newStudentData: Student = {
          id: studentId,
          admissionNo: studentId,
          rollNo: Number(formData.rollNo) || 1,
          nameEn: formData.nameEn.trim(),
          nameMl: formData.nameMl.trim() || formData.nameEn.trim(),
          classId: formData.classId,
          academicYearId: 'ay_2026_2027',
          parentNameEn: formData.parentNameEn.trim(),
          parentNameMl: formData.nameMl.trim() || formData.parentNameEn.trim(),
          parentPhone: formData.parentPhone.trim(),
          status: 'active',
          gender: formData.gender || 'M',
        };

        // 1. Persistent Firestore write
        try {
          await setDoc(doc(db, 'students', studentId), cleanForFirestore(newStudentData), { merge: true });
        } catch (firestoreErr: any) {
          console.error('Firestore write error when adding student:', firestoreErr);
          handleFirestoreError(firestoreErr, OperationType.WRITE, `students/${studentId}`);
          alert(`Firestore error: ${firestoreErr.message || 'Failed to save student to cloud database'}`);
          return;
        }

        const res = await fetchWithAuth('/api/students', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newStudentData),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to add student');
        }
      }

      setShowAddModal(false);
      await loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteStudent = async (student: Student) => {
    const confirm = window.confirm(
      `Are you sure you want to delete student "${student.nameEn}" (${student.admissionNo})?`
    );
    if (!confirm) return;

    try {
      // 1. Delete from Firestore
      try {
        await deleteDoc(doc(db, 'students', student.id));
      } catch (firestoreErr: any) {
        console.warn('Firestore student delete error:', firestoreErr);
      }

      // 2. Delete from local state
      const res = await fetchWithAuth(`/api/students/${student.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete student');
      }
      await loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteAllStudents = async () => {
    const confirm = window.confirm(
      'Are you sure you want to permanently delete ALL students? This will delete all student records and associated marks from Firestore and the portal.'
    );
    if (!confirm) return;

    try {
      setLoading(true);
      await firestoreSync.purgeDemoStudentsFromFirestore();
      const res = await fetchWithAuth('/api/students', { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete students');
      }
      await loadData();
      alert('All students deleted successfully.');
    } catch (err: any) {
      alert(err.message || 'Error deleting all students');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteByClass = async () => {
    if (!deleteClassId) {
      alert('Please select a class to delete.');
      return;
    }
    const targetClass = classes.find(c => c.id === deleteClassId);
    const className = targetClass ? targetClass.name : deleteClassId;
    const confirm = window.confirm(
      `Are you sure you want to permanently delete all students in ${className}? This cannot be undone.`
    );
    if (!confirm) return;

    try {
      setLoading(true);
      const toDelete = students.filter(s => s.classId === deleteClassId);
      for (const st of toDelete) {
        await deleteDoc(doc(db, 'students', st.id)).catch(() => {});
      }
      const res = await fetchWithAuth(`/api/students?classId=${deleteClassId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete class students');
      }
      await loadData();
      alert(`All students in ${className} deleted successfully.`);
    } catch (err: any) {
      alert(err.message || 'Error deleting students by class');
    } finally {
      setLoading(false);
    }
  };

  const handleClearDemoStudents = async () => {
    const confirm = window.confirm(
      'Clear demo students from Firestore and local storage? Real student entries will remain intact.'
    );
    if (!confirm) return;

    try {
      setLoading(true);
      await firestoreSync.purgeDemoStudentsFromFirestore();
      const res = await fetchWithAuth('/api/students/clear-demo', { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to clear demo students');
      }
      await loadData();
      alert('Demo students cleared successfully.');
    } catch (err: any) {
      alert(err.message || 'Error clearing demo students');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadSampleCsv = () => {
    const sample = `Admission No, Name, Class, Gender, Parent Name, Phone
ADM-2026-001, Muhammed Bilal, Class 1, M, Shamsudheen, 9447123456
ADM-2026-002, Fathima Zahra, Class 2, F, Abdul Kareem, 9447654321
ADM-2026-003, Rayan Ahmed, Class 5, M, Moideen Kutty, 9846112233
ADM-2026-004, Ayisha Maryam, Class 3, F, Hamza Haji, 9745001122`;
    const blob = new Blob([sample], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'students_sample_template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
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
    if (isProcessingImport) return;
    if (!importPreview?.records || importPreview.records.length === 0) return;
    setIsProcessingImport(true);

    try {
      // 1. Clean slate option: If checked, delete existing class records before importing
      if (replaceExisting) {
        try {
          const targetClasses = importClassId
            ? [importClassId]
            : Array.from(new Set(importPreview.records.map((r: any) => r.classId).filter(Boolean)));

          const studentsToDelete = targetClasses.length > 0
            ? students.filter(s => targetClasses.includes(s.classId))
            : students;

          for (const st of studentsToDelete) {
            try {
              await deleteDoc(doc(db, 'students', st.id));
              if (st.admissionNo && st.admissionNo !== st.id) {
                await deleteDoc(doc(db, 'students', String(st.admissionNo).trim()));
              }
            } catch (e) {
              console.warn('Error deleting existing student for clean slate:', e);
            }
          }
        } catch (csErr) {
          console.warn('Clean slate pre-deletion warning:', csErr);
        }
      }

      const res = await fetchWithAuth('/api/students/import-commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          records: importPreview.records,
          targetClassId: importClassId || undefined,
          replaceExisting,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to commit import');
      }

      const data = await res.json();

      // 2. Strict Deduplication in Firestore using sanitized Admission No as document key
      // Do NOT generate random auto-IDs with addDoc.
      // Guarantees that even if uploaded multiple times, existing records are updated rather than duplicated.
      try {
        if (Array.isArray(importPreview.records)) {
          for (const student of importPreview.records) {
            if (student.isValid) {
              const sanitizedAdm = String(student.admissionNo).trim();
              const studentData = cleanForFirestore({
                id: sanitizedAdm,
                admissionNo: sanitizedAdm,
                rollNo: Number(student.rollNo) || 1,
                nameEn: String(student.nameEn).trim(),
                nameMl: student.nameMl ? String(student.nameMl).trim() : String(student.nameEn).trim(),
                classId: student.classId || importClassId || classes[0]?.id || 'cls_1',
                academicYearId: 'ay_2026_2027',
                parentNameEn: student.parentNameEn ? String(student.parentNameEn).trim() : '',
                parentNameMl: student.parentNameMl ? String(student.parentNameMl).trim() : (student.parentNameEn ? String(student.parentNameEn).trim() : ''),
                parentPhone: student.parentPhone ? String(student.parentPhone).trim() : '',
                gender: (student.gender || 'M').toUpperCase().startsWith('F') ? 'F' : 'M',
                status: 'active',
              });

              await setDoc(doc(db, 'students', String(student.admissionNo).trim()), studentData, { merge: true });
            }
          }
        }
      } catch (fErr) {
        console.warn('Firestore bulk import write warning:', fErr);
      }

      alert(`Successfully imported ${data.importedCount} student records across classes!`);
      setShowImportModal(false);
      setImportPreview(null);
      setCsvText('');
      setReplaceExisting(false);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to import records');
    } finally {
      setIsProcessingImport(false);
    }
  };

  const handleExportCsv = () => {
    try {
      const rows = filteredStudents.map(s => {
        const cls = classes.find(c => c.id === s.classId);
        const cName = cls?.name || 'Class 1';
        return `"${s.admissionNo}","${s.nameEn}","${cName}","${s.gender || 'M'}","${s.parentNameEn || ''}","${s.parentPhone || ''}"`;
      });
      const csvContent = ['Admission No, Name, Class, Gender, Parent Name, Phone', ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
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

  const handleResequenceRollNumbers = async () => {
    try {
      const res = await fetchWithAuth('/api/students/resequence-rolls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId: selectedClassId || undefined }),
      });
      if (res.ok) {
        await loadData();
        alert('Class roll numbers successfully resequenced (Boys A-Z: 1, 2, 3... followed by Girls A-Z).');
      }
    } catch (err: any) {
      alert(err.message || 'Error resequencing roll numbers');
    }
  };

  // Filter students with strict sorting: Boys first, then Girls; alphabetical A to Z within each
  const filteredStudents = sortStudentsBoysFirst(
    students.filter(s => {
      const matchClass = selectedClassId ? s.classId === selectedClassId : true;
      const q = searchQuery.toLowerCase();
      const matchSearch =
        s.nameEn.toLowerCase().includes(q) ||
        (s.nameMl && s.nameMl.includes(q)) ||
        s.admissionNo.toLowerCase().includes(q) ||
        String(s.rollNo).includes(q);
      return matchClass && matchSearch;
    })
  );

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
            onClick={handleDownloadSampleCsv}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-800 bg-white hover:bg-emerald-50 border border-emerald-300 rounded-xl transition shadow-2xs cursor-pointer"
            title="Download CSV Template with Demo Structure"
          >
            <Download className="w-3.5 h-3.5 text-emerald-700" />
            Download Sample CSV
          </button>

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
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            {t.importCsv}
          </button>

          <button
            onClick={handleClearDemoStudents}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-xl transition cursor-pointer"
            title="Purge only mock student records from database"
          >
            <Trash2 className="w-3.5 h-3.5 text-amber-700" />
            Clear Demo Students
          </button>

          <button
            onClick={handleDeleteAllStudents}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-300 rounded-xl transition cursor-pointer"
            title="Permanently remove all students"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-700" />
            Delete All Students
          </button>

          <button
            type="button"
            onClick={handleResequenceRollNumbers}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-300 rounded-xl transition shadow-2xs cursor-pointer"
            title="Auto-resequence class roll numbers strictly (Boys A-Z first: 1, 2, 3... then Girls A-Z)"
          >
            <Hash className="w-3.5 h-3.5 text-teal-700" />
            Resequence Roll Nos
          </button>

          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Student
          </button>
        </div>
      </div>

      {/* Filter, Search & Delete by Class Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
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

          {/* Delete by Class Selector */}
          <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200">
            <select
              value={deleteClassId}
              onChange={e => setDeleteClassId(e.target.value)}
              className="p-2 border border-rose-200 rounded-lg bg-rose-50/50 text-xs font-medium text-rose-900 focus:outline-none"
            >
              <option value="">Select Class to Delete...</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleDeleteByClass}
              disabled={!deleteClassId}
              className="px-3 py-2 text-xs font-bold text-rose-700 bg-rose-100 hover:bg-rose-200 rounded-lg transition disabled:opacity-40 cursor-pointer"
            >
              Delete Class Students
            </button>
          </div>
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

      {/* Students Table strictly aligned with CSV: Admission No | Name | Class | Gender | Parent Name | Phone | Actions */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden w-full">
        <div className="overflow-x-auto w-full scrollbar-thin">
          <table className="w-full min-w-[760px] text-xs text-left">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b">
              <tr>
                <th className="p-3 text-center w-14 font-mono whitespace-nowrap">Roll No</th>
                <th className="p-3 font-mono whitespace-nowrap">Admission No</th>
                <th className="p-3 whitespace-nowrap">Name</th>
                <th className="p-3 whitespace-nowrap">Class</th>
                <th className="p-3 text-center whitespace-nowrap">Gender</th>
                <th className="p-3 whitespace-nowrap">Parent Name</th>
                <th className="p-3 whitespace-nowrap">Phone</th>
                <th className="p-3 text-center w-24 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    No students found. Add a student or import via CSV.
                  </td>
                </tr>
              ) : (
                filteredStudents.map(student => {
                  const cls = classes.find(c => c.id === student.classId);
                  return (
                    <tr key={student.id} className="hover:bg-slate-50 transition">
                      <td className="p-3 text-center font-mono font-bold text-slate-700 whitespace-nowrap">
                        {student.rollNo}
                      </td>
                      <td className="p-3 font-mono font-semibold text-slate-700 whitespace-nowrap">
                        {student.admissionNo}
                      </td>
                      <td className="p-3 min-w-[140px] whitespace-nowrap">
                        <span className="font-bold text-slate-900">{student.nameEn}</span>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <span className="bg-emerald-50 text-emerald-900 border border-emerald-200 px-2 py-0.5 rounded-md font-semibold">
                          {isMl ? cls?.nameMl : cls?.name}
                        </span>
                      </td>
                      <td className="p-3 text-center whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            student.gender === 'F'
                              ? 'bg-pink-100 text-pink-800 border border-pink-200'
                              : 'bg-blue-100 text-blue-800 border border-blue-200'
                          }`}
                        >
                          {student.gender || 'M'}
                        </span>
                      </td>
                      <td className="p-3 min-w-[140px] whitespace-nowrap">
                        <span className="font-medium text-slate-800">{student.parentNameEn || '—'}</span>
                      </td>
                      <td className="p-3 font-mono text-slate-600 whitespace-nowrap">
                        {student.parentPhone || '—'}
                      </td>
                      <td className="p-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleOpenEdit(student)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition cursor-pointer"
                            title="Edit student"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteStudent(student)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                            title="Delete student"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Student Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-4 sm:p-6 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto">
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
                  <p className="text-[10px] text-slate-500 mt-1">
                    Auto-sequenced: Boys A-Z (1, 2, 3...) then Girls A-Z.
                  </p>
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
                disabled={isProcessingImport}
                onClick={() => {
                  setShowImportModal(false);
                  setImportPreview(null);
                  setReplaceExisting(false);
                }}
                className="text-slate-400 hover:text-slate-600 font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
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
                disabled={isProcessingImport}
                className="w-full p-2 border rounded-lg bg-slate-50 font-bold disabled:opacity-50"
              >
                <option value="">Auto-Detect from CSV Class Column (Multi-Class Upload)</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.nameMl})
                  </option>
                ))}
              </select>
            </div>

            {/* Clean Slate Option */}
            <div className="flex items-center gap-2.5 p-3 bg-amber-50/80 border border-amber-200 rounded-xl">
              <input
                type="checkbox"
                id="replaceExistingCheckbox"
                checked={replaceExisting}
                onChange={e => setReplaceExisting(e.target.checked)}
                disabled={isProcessingImport}
                className="w-4 h-4 text-emerald-800 rounded border-slate-300 focus:ring-emerald-700 cursor-pointer disabled:cursor-not-allowed"
              />
              <label htmlFor="replaceExistingCheckbox" className="text-xs font-semibold text-amber-950 cursor-pointer select-none">
                Replace / Clear existing class records before importing
              </label>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700 block">CSV File Format (Required Columns):</span>
                <button
                  type="button"
                  onClick={handleDownloadSampleCsv}
                  className="text-[11px] font-bold text-emerald-800 hover:text-emerald-950 underline flex items-center gap-1 cursor-pointer"
                >
                  <Download className="w-3 h-3" />
                  Download Sample CSV
                </button>
              </div>
              <p className="text-[11px] text-slate-600 font-mono bg-white p-2 rounded-lg border border-slate-200">
                Admission No, Name, Class, Gender, Parent Name, Phone
              </p>
              <p className="text-[11px] text-slate-500">
                Supports multi-class records! The parser automatically matches the <em>Class</em> column (e.g. Class 1, Class 5) to enroll students in their respective classes.
              </p>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleCsvFileChange}
                className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer"
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

                <div className="border border-slate-200 rounded-lg max-h-48 overflow-y-auto overflow-x-auto w-full scrollbar-thin">
                  <table className="w-full min-w-[500px] text-[11px] text-left">
                    <thead className="bg-slate-100 font-bold sticky top-0">
                      <tr>
                        <th className="p-2 whitespace-nowrap">Row</th>
                        <th className="p-2 whitespace-nowrap">Admission No</th>
                        <th className="p-2 whitespace-nowrap">Name</th>
                        <th className="p-2 whitespace-nowrap">Class</th>
                        <th className="p-2 whitespace-nowrap">Gender</th>
                        <th className="p-2 whitespace-nowrap">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {importPreview.records.map((r: any, idx: number) => (
                        <tr key={idx} className={r.isValid ? 'bg-white' : 'bg-rose-50'}>
                          <td className="p-2 font-mono">{r.rowNumber}</td>
                          <td className="p-2 font-mono">{r.admissionNo}</td>
                          <td className="p-2 font-medium">{r.nameEn}</td>
                          <td className="p-2 font-medium text-emerald-800">{r.className || 'Class 1'}</td>
                          <td className="p-2 font-bold">{r.gender || 'M'}</td>
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
                disabled={isProcessingImport}
                onClick={() => {
                  setShowImportModal(false);
                  setImportPreview(null);
                  setReplaceExisting(false);
                }}
                className="px-3.5 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!importPreview || importPreview.validRows === 0 || isProcessingImport}
                onClick={handleCommitImport}
                className="px-4 py-2 font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-xs cursor-pointer"
              >
                {isProcessingImport ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Importing ({importPreview?.validRows || 0} students)...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 text-emerald-200" />
                    <span>Confirm Import ({importPreview?.validRows || 0} students)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
