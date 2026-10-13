import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ClassItem, SubjectItem, SubjectAssessmentRule } from '../../types';
import { db, handleFirestoreError, OperationType } from '../../services/firebase';
import { firestoreSync, cleanForFirestore } from '../../services/firestoreSync';
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import {
  BookOpen,
  Layers,
  CheckCircle,
  Info,
  Edit,
  Plus,
  Trash2,
  AlertCircle,
  X,
  Sparkles,
} from 'lucide-react';

export const ClassSubjectConfig: React.FC = () => {
  const { fetchWithAuth, lang, t } = useAuth();
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [selectedClass, setSelectedClass] = useState<ClassItem | null>(null);
  const [activeTab, setActiveTab] = useState<'class_curriculum' | 'all_subjects'>('class_curriculum');

  // Add Class Modal State
  const [showAddClassModal, setShowAddClassModal] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassNameMl, setNewClassNameMl] = useState('');
  const [newClassNumber, setNewClassNumber] = useState('');

  // Add Subject Modal State
  const [showAddSubjectModal, setShowAddSubjectModal] = useState(false);
  const [newSubjectNameMl, setNewSubjectNameMl] = useState('');
  const [newSubjectCode, setNewSubjectCode] = useState('');
  const [newSubjectWrittenMax, setNewSubjectWrittenMax] = useState('35');
  const [newSubjectOralMax, setNewSubjectOralMax] = useState('10');
  const [newSubjectCeMax, setNewSubjectCeMax] = useState('5');
  const [selectedTargetClassGrades, setSelectedTargetClassGrades] = useState<number[]>([1, 2, 3, 4, 5]);

  const isMl = lang === 'ml';

  const loadData = async () => {
    setLoading(true);
    try {
      const [resCls, resSubs] = await Promise.all([
        fetchWithAuth('/api/classes'),
        fetchWithAuth('/api/subjects'),
      ]);
      const clsData: ClassItem[] = await resCls.json();
      const subsData: SubjectItem[] = await resSubs.json();
      setClasses(clsData);
      setSubjects(subsData);
      if (clsData.length > 0) {
        setSelectedClass(clsData[0]);
      }
    } catch (err) {
      console.error('Error loading config:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Real-time Firestore sync for classes
    let unsubClasses: (() => void) | undefined;
    let unsubSubjects: (() => void) | undefined;
    try {
      unsubClasses = onSnapshot(
        collection(db, 'classes'),
        snapshot => {
          if (!snapshot.empty) {
            const remoteClasses = snapshot.docs.map(docSnap => ({
              ...docSnap.data(),
              id: docSnap.id,
            } as ClassItem));
            remoteClasses.sort((a, b) => a.numericGrade - b.numericGrade);
            setClasses(remoteClasses);
          }
        },
        error => {
          handleFirestoreError(error, OperationType.GET, 'classes');
        }
      );

      unsubSubjects = onSnapshot(
        collection(db, 'subjects'),
        snapshot => {
          if (!snapshot.empty) {
            const remoteSubjects = snapshot.docs.map(docSnap => ({
              ...docSnap.data(),
              id: docSnap.id,
            } as SubjectItem));
            setSubjects(remoteSubjects);
          }
        },
        error => {
          handleFirestoreError(error, OperationType.GET, 'subjects');
        }
      );
    } catch (err) {
      console.warn('Failed to attach classes/subjects listener:', err);
    }

    return () => {
      if (unsubClasses) unsubClasses();
      if (unsubSubjects) unsubSubjects();
    };
  }, []);

  // Class Management Handlers
  const handleAddClass = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(newClassNumber, 10);
    if (!num || num < 1) {
      alert('Please enter a valid class number (e.g. 10)');
      return;
    }

    const cId = `cls_${num}`;
    const cName = newClassName.trim() || `Class ${num}`;
    const cNameMl = newClassNameMl.trim() || `ക്ലാസ് ${num}`;

    const newClassItem: ClassItem = {
      id: cId,
      name: cName,
      nameMl: cNameMl,
      numericGrade: num,
      active: true,
    };

    try {
      // 1. Direct persistent Firestore write
      try {
        await setDoc(doc(db, 'classes', cId), cleanForFirestore(newClassItem));
      } catch (fErr: any) {
        console.error('Firestore class write error:', fErr);
        handleFirestoreError(fErr, OperationType.WRITE, `classes/${cId}`);
      }

      // 2. Local storage / backend API
      const res = await fetchWithAuth('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newClassItem),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create class');
      }

      setShowAddClassModal(false);
      setNewClassName('');
      setNewClassNameMl('');
      setNewClassNumber('');
      await loadData();
      alert(`Class "${cName}" successfully added and persisted!`);
    } catch (err: any) {
      alert(err.message || 'Error creating class');
    }
  };

  const handleDeleteClass = async (cls: ClassItem) => {
    const confirm = window.confirm(
      `Are you sure you want to delete "${cls.name}" (${cls.nameMl})? Any mapped curriculum and student enrollments for this class will be affected.`
    );
    if (!confirm) return;

    try {
      // 1. Delete from Firestore
      try {
        await deleteDoc(doc(db, 'classes', cls.id));
      } catch (fErr: any) {
        console.error('Firestore delete class error:', fErr);
        handleFirestoreError(fErr, OperationType.DELETE, `classes/${cls.id}`);
      }

      // 2. Delete from API
      const res = await fetchWithAuth(`/api/classes/${cls.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete class');
      }

      await loadData();
      alert(`Class "${cls.name}" removed successfully.`);
    } catch (err: any) {
      alert(err.message || 'Error deleting class');
    }
  };

  // Subject Management Handlers
  const handleToggleTargetGrade = (grade: number) => {
    setSelectedTargetClassGrades(prev =>
      prev.includes(grade) ? prev.filter(g => g !== grade) : [...prev, grade].sort((a, b) => a - b)
    );
  };

  const handleSelectAllTargetGrades = () => {
    setSelectedTargetClassGrades(classes.map(c => c.numericGrade));
  };

  const handleClearAllTargetGrades = () => {
    setSelectedTargetClassGrades([]);
  };

  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubjectNameMl.trim()) {
      alert('Subject Name strictly in Malayalam is required (e.g. ഖുർആൻ, ഫിഖ്ഹ്)');
      return;
    }
    if (selectedTargetClassGrades.length === 0) {
      alert('Please select at least one class that studies this subject.');
      return;
    }

    const writtenMax = parseInt(newSubjectWrittenMax, 10) || 35;
    const oralMax = parseInt(newSubjectOralMax, 10) || 10;
    const ceMax = parseInt(newSubjectCeMax, 10) || 5;

    const subId = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const code = (newSubjectCode.trim() || newSubjectNameMl.slice(0, 3)).toUpperCase();

    const newSubjectItem: SubjectItem = {
      id: subId,
      code,
      nameEn: newSubjectNameMl.trim(),
      nameMl: newSubjectNameMl.trim(),
      displayNameMl: newSubjectNameMl.trim(),
      applicableClasses: selectedTargetClassGrades,
      defaultComponents: [
        { componentKey: 'written', labelEn: 'Written', labelMl: 'എഴുത്ത് പരീക്ഷ', maxMarks: writtenMax },
        { componentKey: 'oral', labelEn: 'Oral', labelMl: 'വാചിക പരീക്ഷ', maxMarks: oralMax },
        { componentKey: 'ce', labelEn: 'CE', labelMl: 'തുടർമൂല്യനിർണ്ണയം', maxMarks: ceMax },
      ],
    };

    try {
      // 1. Direct persistent Firestore write
      try {
        await setDoc(doc(db, 'subjects', subId), cleanForFirestore(newSubjectItem));
      } catch (fErr: any) {
        console.error('Firestore subject write error:', fErr);
        handleFirestoreError(fErr, OperationType.WRITE, `subjects/${subId}`);
      }

      // 2. Local storage / backend API
      const res = await fetchWithAuth('/api/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSubjectItem),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create subject');
      }

      setShowAddSubjectModal(false);
      setNewSubjectNameMl('');
      setNewSubjectCode('');
      setNewSubjectWrittenMax('35');
      setNewSubjectOralMax('10');
      setNewSubjectCeMax('5');
      setSelectedTargetClassGrades([1, 2, 3, 4, 5]);
      await loadData();
      alert(`Subject "${newSubjectNameMl}" successfully created with assessment criteria!`);
    } catch (err: any) {
      alert(err.message || 'Error creating subject');
    }
  };

  const handleDeleteSubject = async (sub: SubjectItem) => {
    const confirm = window.confirm(
      `Are you sure you want to permanently delete subject "${sub.nameMl}" (${sub.code})? It will be removed from all assigned classes.`
    );
    if (!confirm) return;

    try {
      // 1. Delete from Firestore
      try {
        await deleteDoc(doc(db, 'subjects', sub.id));
      } catch (fErr: any) {
        console.error('Firestore delete subject error:', fErr);
        handleFirestoreError(fErr, OperationType.DELETE, `subjects/${sub.id}`);
      }

      // 2. Delete from API
      const res = await fetchWithAuth(`/api/subjects/${sub.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete subject');
      }

      await loadData();
      alert(`Subject "${sub.nameMl}" deleted successfully.`);
    } catch (err: any) {
      alert(err.message || 'Error deleting subject');
    }
  };

  if (loading) {
    return <div className="text-center py-10 text-xs text-slate-500">Loading curriculum settings...</div>;
  }

  // Get subjects applicable to selected class
  const classSubjects = selectedClass
    ? subjects.filter(s => s.applicableClasses.includes(selectedClass.numericGrade))
    : [];

  return (
    <div className="space-y-6">
      {/* Title & Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{t.navClassesSubjects}</h2>
          <p className="text-xs text-slate-500">
            Define custom classes, map Malayalam Madrasa subjects, and configure assessment breakdown criteria.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setNewClassName('');
              setNewClassNameMl('');
              const maxGrade = classes.reduce((max, c) => Math.max(max, c.numericGrade), 0);
              setNewClassNumber(String(maxGrade + 1));
              setShowAddClassModal(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-800 bg-white hover:bg-emerald-50 border border-emerald-300 rounded-xl transition shadow-2xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-emerald-700" />
            Add Class
          </button>

          <button
            onClick={() => {
              setNewSubjectNameMl('');
              setNewSubjectCode('');
              setNewSubjectWrittenMax('35');
              setNewSubjectOralMax('10');
              setNewSubjectCeMax('5');
              if (selectedClass) {
                setSelectedTargetClassGrades([selectedClass.numericGrade]);
              } else {
                setSelectedTargetClassGrades([1, 2, 3, 4, 5]);
              }
              setShowAddSubjectModal(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Subject (വിഷയം)
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-4 text-xs font-bold">
        <button
          onClick={() => setActiveTab('class_curriculum')}
          className={`pb-2.5 transition flex items-center gap-1.5 ${
            activeTab === 'class_curriculum'
              ? 'border-b-2 border-emerald-800 text-emerald-800'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          Class Curriculum & Subject Mappings
        </button>

        <button
          onClick={() => setActiveTab('all_subjects')}
          className={`pb-2.5 transition flex items-center gap-1.5 ${
            activeTab === 'all_subjects'
              ? 'border-b-2 border-emerald-800 text-emerald-800'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          All Subjects Directory ({subjects.length})
        </button>
      </div>

      {/* Madrasa Rule Notice Banner */}
      <div className="p-4 bg-emerald-50/80 border border-emerald-200 rounded-2xl text-xs space-y-1.5 text-emerald-950">
        <div className="flex items-center gap-2 font-bold text-emerald-900">
          <Info className="w-4 h-4 text-emerald-700" />
          <span>Institutional Assessment Rules & Curriculum Standards:</span>
        </div>
        <ul className="list-disc list-inside space-y-1 pl-1 text-[11px] text-emerald-900/90 leading-relaxed">
          <li>
            <strong>Class Naming Standard:</strong> Strictly "Class X" naming convention (Class 1 through Class 10).
          </li>
          <li>
            <strong>Language Standard:</strong> All Subject Names are strictly in Malayalam (ഖുർആൻ, ഫിഖ്ഹ്, താരീഖ്, അഖ്‌ലാഖ്, etc.). Assessment components (Written, Oral, CE) are in English.
          </li>
          <li>
            <strong>Class 1:</strong> Tilawah is omitted per syllabus.
          </li>
          <li>
            <strong>Classes 2–3:</strong> Tilawah component 2 is <em>Tilawati (10)</em>.
          </li>
          <li>
            <strong>Classes 4–9:</strong> Tilawah component 2 is <em>Tajweed (10)</em>.
          </li>
          <li>
            <strong>Total Max Marks:</strong> Default subjects total 50 marks. Component breakdown (Written, Oral, CE) sums to 50.
          </li>
        </ul>
      </div>

      {activeTab === 'class_curriculum' ? (
        <div className="space-y-6">
          {/* Class Selection Grid - Strictly Class X */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
              <span>Select Class:</span>
              <span className="text-slate-400 font-normal">Click a class to view its mapped subjects</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-10 gap-2">
              {classes.map(c => {
                const isSelected = selectedClass?.id === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedClass(c)}
                    className={`p-3 rounded-xl border text-center transition font-bold text-xs relative group cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-800 text-white border-emerald-900 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div>{isMl ? c.nameMl : c.name}</div>
                    <div className="text-[10px] font-normal opacity-80 mt-0.5">
                      Class {c.numericGrade}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Class Subjects View */}
          {selectedClass && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-3 gap-2">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Subjects for {isMl ? selectedClass.nameMl : selectedClass.name} ({classSubjects.length} subjects)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Total Max Marks:{' '}
                    <strong className="text-emerald-900 font-mono font-bold">
                      {classSubjects.length * 50}
                    </strong>{' '}
                    marks across all curriculum components
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setNewSubjectNameMl('');
                      setNewSubjectCode('');
                      setNewSubjectWrittenMax('35');
                      setNewSubjectOralMax('10');
                      setNewSubjectCeMax('5');
                      setSelectedTargetClassGrades([selectedClass.numericGrade]);
                      setShowAddSubjectModal(true);
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Subject to {selectedClass.name}
                  </button>

                  <button
                    onClick={() => handleDeleteClass(selectedClass)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition cursor-pointer"
                    title={`Delete ${selectedClass.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Class
                  </button>
                </div>
              </div>

              {classSubjects.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs">
                  No subjects currently mapped to {selectedClass.name}. Click "Add Subject" above to assign subjects to this class.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {classSubjects.map(sub => {
                    // Strictly Malayalam subject display
                    const displayName =
                      selectedClass.numericGrade === 9 && (sub.id === 'sub_history_buhuth' || sub.code === 'HST')
                        ? 'ബുഹൂസ്'
                        : sub.nameMl || sub.nameEn;

                    // Check override components
                    const components: SubjectAssessmentRule[] =
                      sub.classComponentOverrides && sub.classComponentOverrides[selectedClass.numericGrade]
                        ? sub.classComponentOverrides[selectedClass.numericGrade]
                        : sub.defaultComponents;

                    const totalMarks = components.reduce((sum, c) => sum + c.maxMarks, 0);

                    return (
                      <div
                        key={sub.id}
                        className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3 flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="font-bold text-slate-900 text-base">
                                {displayName}
                              </h4>
                              <span className="text-[10px] font-mono font-bold text-slate-400">{sub.code}</span>
                            </div>
                            <span className="text-xs font-mono font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                              {totalMarks} Marks
                            </span>
                          </div>

                          {/* Components Breakdown */}
                          <div className="mt-3 bg-white p-2.5 rounded-lg border border-slate-200 space-y-1.5 text-xs">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                              Assessment Components:
                            </span>
                            {components.map(comp => (
                              <div
                                key={comp.componentKey}
                                className="flex justify-between items-center text-slate-700 py-0.5 border-b border-slate-100 last:border-none"
                              >
                                <span className="font-medium text-slate-800">
                                  {comp.labelEn}
                                </span>
                                <span className="font-mono font-bold text-emerald-900">
                                  {comp.maxMarks}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-500">
                          <span>Class {selectedClass.numericGrade} Curriculum</span>
                          <button
                            onClick={() => handleDeleteSubject(sub)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded transition"
                            title="Delete subject"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* All Subjects Directory Tab */
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                All Subjects Directory ({subjects.length} subjects)
              </h3>
              <p className="text-xs text-slate-500">
                Overview of all subjects defined in the institution and which classes they are mapped to.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {subjects.map(sub => {
              const defaultTotal = (sub.defaultComponents || []).reduce((sum, c) => sum + c.maxMarks, 0);

              return (
                <div
                  key={sub.id}
                  className="p-5 rounded-2xl border border-slate-200 bg-white shadow-2xs space-y-3 flex flex-col justify-between hover:border-slate-300 transition"
                >
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">
                        {sub.code}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                          {defaultTotal} Marks
                        </span>
                        <button
                          onClick={() => handleDeleteSubject(sub)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded transition"
                          title="Delete subject"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <h4 className="font-bold text-slate-900 text-base mt-2">
                      {sub.nameMl}
                    </h4>

                    {/* Mapped Classes Badges */}
                    <div className="mt-3 space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Mapped Classes ({sub.applicableClasses.length}):
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {sub.applicableClasses.map(grade => (
                          <span
                            key={grade}
                            className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-900 border border-emerald-200"
                          >
                            Class {grade}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Default Assessment Breakdown */}
                    <div className="mt-3 bg-slate-50 p-2.5 rounded-lg border border-slate-200 space-y-1 text-xs">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Components:
                      </span>
                      {sub.defaultComponents?.map(c => (
                        <div key={c.componentKey} className="flex justify-between items-center text-slate-700 py-0.5 text-[11px]">
                          <span>{c.labelEn}</span>
                          <span className="font-mono font-bold text-emerald-900">{c.maxMarks}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Class Modal */}
      {showAddClassModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-emerald-800" />
                Add New Class
              </h3>
              <button
                onClick={() => setShowAddClassModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddClass} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Class Number (e.g. 10)</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={newClassNumber}
                  onChange={e => {
                    const val = e.target.value;
                    setNewClassNumber(val);
                    if (val) {
                      setNewClassName(`Class ${val}`);
                      setNewClassNameMl(`ക്ലാസ് ${val}`);
                    }
                  }}
                  placeholder="e.g. 10"
                  className="w-full p-2.5 border rounded-lg font-mono focus:outline-emerald-700"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Class Name (English)</label>
                <input
                  type="text"
                  value={newClassName}
                  onChange={e => setNewClassName(e.target.value)}
                  placeholder="e.g. Class 10"
                  className="w-full p-2.5 border rounded-lg focus:outline-emerald-700"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Class Name (Malayalam)</label>
                <input
                  type="text"
                  value={newClassNameMl}
                  onChange={e => setNewClassNameMl(e.target.value)}
                  placeholder="ഉദാ: ക്ലാസ് 10"
                  className="w-full p-2.5 border rounded-lg focus:outline-emerald-700"
                />
              </div>

              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 text-[11px] leading-relaxed">
                <strong>Persistence:</strong> Custom classes created here persist permanently to Firebase Firestore and will remain even if student demo data is cleared.
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddClassModal(false)}
                  className="px-3.5 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-bold text-white bg-emerald-800 rounded-lg hover:bg-emerald-900 cursor-pointer"
                >
                  Create Class
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Subject Modal */}
      {showAddSubjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-emerald-800" />
                Add New Subject (വിഷയം)
              </h3>
              <button
                onClick={() => setShowAddSubjectModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubject} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Subject Name (Strictly in Malayalam / മലയാളത്തിൽ) *
                </label>
                <input
                  type="text"
                  value={newSubjectNameMl}
                  onChange={e => setNewSubjectNameMl(e.target.value)}
                  placeholder="ഉദാ: ഖുർആൻ, ഫിഖ്ഹ്, അഖ്‌ലാഖ്, തഫ്സീർ, അദബ്"
                  className="w-full p-2.5 border rounded-lg text-sm font-semibold focus:outline-emerald-700"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Subject Code (e.g. QUR, FIQ, TAF)
                </label>
                <input
                  type="text"
                  value={newSubjectCode}
                  onChange={e => setNewSubjectCode(e.target.value.toUpperCase())}
                  placeholder="e.g. QUR"
                  className="w-full p-2.5 border rounded-lg font-mono focus:outline-emerald-700"
                />
              </div>

              {/* Default Assessment Breakdown */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">
                    Default Assessment Breakdown (Total: 50 Marks)
                  </span>
                  <span className="text-[11px] font-mono font-bold text-emerald-900">
                    {Number(newSubjectWrittenMax) + Number(newSubjectOralMax) + Number(newSubjectCeMax)} / 50 Marks
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Written Max:
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="50"
                      value={newSubjectWrittenMax}
                      onChange={e => setNewSubjectWrittenMax(e.target.value)}
                      className="w-full p-2 border rounded-lg font-mono text-center focus:outline-emerald-700"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Oral Max:
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="50"
                      value={newSubjectOralMax}
                      onChange={e => setNewSubjectOralMax(e.target.value)}
                      className="w-full p-2 border rounded-lg font-mono text-center focus:outline-emerald-700"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      CE Max:
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="50"
                      value={newSubjectCeMax}
                      onChange={e => setNewSubjectCeMax(e.target.value)}
                      className="w-full p-2 border rounded-lg font-mono text-center focus:outline-emerald-700"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Target Class Selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="font-bold text-slate-700">
                    Target Class Selection (Assign which classes study this subject):
                  </label>
                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={handleSelectAllTargetGrades}
                      className="text-emerald-800 font-bold hover:underline"
                    >
                      Select All
                    </button>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={handleClearAllTargetGrades}
                      className="text-slate-500 font-bold hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-2 border rounded-xl bg-slate-50">
                  {classes.map(c => {
                    const isChecked = selectedTargetClassGrades.includes(c.numericGrade);
                    return (
                      <label
                        key={c.id}
                        className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition ${
                          isChecked
                            ? 'bg-emerald-50 border-emerald-300 font-bold text-emerald-950'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleTargetGrade(c.numericGrade)}
                          className="rounded text-emerald-800 focus:ring-emerald-700"
                        />
                        <span>{c.name} ({c.nameMl})</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddSubjectModal(false)}
                  className="px-3.5 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-bold text-white bg-emerald-800 rounded-lg hover:bg-emerald-900 cursor-pointer"
                >
                  Save Subject
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
