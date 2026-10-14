import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { User, ClassItem, SubjectItem, TeacherAssignment } from '../../types';
import { db, handleFirestoreError, OperationType } from '../../services/firebase';
import { firestoreSync, cleanForFirestore } from '../../services/firestoreSync';
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import {
  Users,
  Plus,
  Trash2,
  BookOpen,
  Shield,
  Check,
  CheckCircle2,
  Edit2,
  KeyRound,
  Eye,
  EyeOff,
  AlertTriangle,
  X,
} from 'lucide-react';

export const TeacherManagement: React.FC = () => {
  const { fetchWithAuth, lang, t } = useAuth();
  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);

  // Create Teacher Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [tName, setTName] = useState('');
  const [tNameMl, setTNameMl] = useState('');
  const [tUsername, setTUsername] = useState('');
  const [tPassword, setTPassword] = useState('teacher123');
  const [tPhone, setTPhone] = useState('');
  const [tInChargeClassId, setTInChargeClassId] = useState('');

  // Edit Teacher Modal
  const [editingTeacher, setEditingTeacher] = useState<any | null>(null);
  const [editName, setEditName] = useState('');
  const [editNameMl, setEditNameMl] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editInChargeClassId, setEditInChargeClassId] = useState('');

  // Class In-Charge Modal
  const [inChargeModalTeacher, setInChargeModalTeacher] = useState<any | null>(null);
  const [selectedInChargeClassId, setSelectedInChargeClassId] = useState<string>('');

  // Password Reset / Edit Modal
  const [passwordTargetTeacher, setPasswordTargetTeacher] = useState<any | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showPasswordMap, setShowPasswordMap] = useState<Record<string, boolean>>({});

  // Assign Class & Subject Modal
  const [assignTeacher, setAssignTeacher] = useState<any | null>(null);
  const [assignClassId, setAssignClassId] = useState('');
  const [assignSubjectId, setAssignSubjectId] = useState('');

  // Toast Notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const isMl = lang === 'ml';

  const loadData = async () => {
    setLoading(true);
    try {
      const [resT, resC, resS, resA] = await Promise.all([
        fetchWithAuth('/api/teachers'),
        fetchWithAuth('/api/classes'),
        fetchWithAuth('/api/subjects'),
        fetchWithAuth('/api/teacher-assignments'),
      ]);
      const tData = await resT.json();
      const cData = await resC.json();
      const sData = await resS.json();
      const aData = await resA.json();

      setTeachers(tData);
      setClasses(cData);
      setSubjects(sData);
      setAssignments(aData);
      if (cData.length > 0 && !assignClassId) setAssignClassId(cData[0].id);
      if (sData.length > 0 && !assignSubjectId) setAssignSubjectId(sData[0].id);
    } catch (err) {
      console.error('Error loading teachers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Real-time listener for Firestore 'teachers' collection
    let unsub: (() => void) | undefined;
    try {
      unsub = onSnapshot(
        collection(db, 'teachers'),
        (snapshot) => {
          if (!snapshot.empty) {
            const remoteTeachers = snapshot.docs.map((docSnap) => ({
              ...docSnap.data(),
              id: docSnap.id,
            } as User));

            // Sync state strictly with Firestore snapshot docs (never re-injecting 2 default teachers)
            setTeachers((prevTeachers) => {
              return remoteTeachers.map((rt) => {
                const prev = prevTeachers.find((p) => p.id === rt.id);
                const asgs = Array.isArray((rt as any).assignedSubjects)
                  ? (rt as any).assignedSubjects
                  : (Array.isArray(rt.assignments) ? rt.assignments : (prev?.assignments || []));
                return {
                  ...rt,
                  assignments: asgs,
                  assignedSubjects: asgs,
                };
              });
            });
          } else {
            setTeachers([]);
          }
        },
        (error) => {
          console.error('Firestore teachers onSnapshot error:', error);
          handleFirestoreError(error, OperationType.GET, 'teachers');
        }
      );
    } catch (err) {
      console.warn('Failed to attach teacher onSnapshot listener:', err);
    }

    return () => {
      if (unsub) unsub();
    };
  }, []);

  const toggleShowPassword = (teacherId: string) => {
    setShowPasswordMap(prev => ({
      ...prev,
      [teacherId]: !prev[teacherId],
    }));
  };

  const handleAddTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tName.trim() || !tUsername.trim()) {
      alert('Teacher Name and Username are required');
      return;
    }

    const teacherId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newTeacherData: User = {
      id: teacherId,
      username: tUsername.trim(),
      name: tName.trim(),
      nameMl: tNameMl.trim() || tName.trim(),
      role: 'teacher',
      plainPassword: tPassword.trim() || 'teacher123',
      phone: tPhone.trim(),
      inChargeClassId: tInChargeClassId || undefined,
      active: true,
      createdAt: new Date().toISOString(),
    };

    try {
      // 1. Persistent Firestore write directly to 'teachers' collection
      try {
        await setDoc(doc(db, 'teachers', teacherId), cleanForFirestore(newTeacherData));
      } catch (firestoreErr: any) {
        console.error('Firestore write error when adding teacher:', firestoreErr);
        handleFirestoreError(firestoreErr, OperationType.WRITE, `teachers/${teacherId}`);
        alert(`Firestore error: ${firestoreErr.message || 'Failed to save teacher to cloud database'}`);
        return;
      }

      // 2. Also register in local/client storage with the exact same ID
      const res = await fetchWithAuth('/api/teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: teacherId,
          name: tName.trim(),
          nameMl: tNameMl.trim() || tName.trim(),
          username: tUsername.trim(),
          plainPassword: tPassword.trim() || 'teacher123',
          password: tPassword.trim() || 'teacher123',
          phone: tPhone.trim(),
          inChargeClassId: tInChargeClassId || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create teacher account');
      }

      setShowAddModal(false);
      setTName('');
      setTNameMl('');
      setTUsername('');
      setTPassword('teacher123');
      setTPhone('');
      setTInChargeClassId('');
      await loadData();
    } catch (err: any) {
      console.error('Error in handleAddTeacher:', err);
      alert(err.message || 'Failed to add teacher');
    }
  };

  const handleCreateTeacher = handleAddTeacher;

  const handleClearDemoTeachers = async () => {
    const confirm = window.confirm(
      'Clear all demo teachers from Firestore and local storage? Real teacher entries and Admin will remain intact.'
    );
    if (!confirm) return;

    try {
      setLoading(true);
      await firestoreSync.purgeDemoTeachersFromFirestore();
      const res = await fetchWithAuth('/api/teachers/clear-demo', { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to clear demo teachers');
      }
      await loadData();
      alert('Demo teachers cleared successfully.');
    } catch (err: any) {
      alert(err.message || 'Error clearing demo teachers');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveInCharge = async () => {
    if (!inChargeModalTeacher) return;
    try {
      const classVal = selectedInChargeClassId || '';

      // 1. Persistent Firestore write
      try {
        await setDoc(
          doc(db, 'teachers', inChargeModalTeacher.id),
          cleanForFirestore({ inChargeClassId: classVal }),
          { merge: true }
        );
      } catch (fErr: any) {
        console.error('Firestore in-charge write error:', fErr);
        handleFirestoreError(fErr, OperationType.WRITE, `teachers/${inChargeModalTeacher.id}`);
      }

      // 2. Local update
      const res = await fetchWithAuth(`/api/teachers/${inChargeModalTeacher.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inChargeClassId: classVal }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to assign class in-charge');
      }
      setInChargeModalTeacher(null);
      await loadData();
      alert('Class In-Charge role updated successfully!');
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleOpenEdit = (teacher: any) => {
    setEditingTeacher(teacher);
    setEditName(teacher.name);
    setEditNameMl(teacher.nameMl || '');
    setEditUsername(teacher.username);
    setEditPhone(teacher.phone || '');
    setEditInChargeClassId(teacher.inChargeClassId || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTeacher) return;
    try {
      const updateData = {
        name: editName.trim(),
        nameMl: editNameMl.trim() || editName.trim(),
        username: editUsername.trim(),
        phone: editPhone.trim(),
        inChargeClassId: editInChargeClassId || undefined,
      };

      // 1. Update in Firestore
      try {
        await setDoc(doc(db, 'teachers', editingTeacher.id), cleanForFirestore(updateData), { merge: true });
      } catch (firestoreErr: any) {
        console.error('Firestore teacher edit error:', firestoreErr);
        handleFirestoreError(firestoreErr, OperationType.WRITE, `teachers/${editingTeacher.id}`);
      }

      // 2. Update local state
      const res = await fetchWithAuth(`/api/teachers/${editingTeacher.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update teacher account');
      }
      setEditingTeacher(null);
      await loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteTeacher = async (teacher: any) => {
    const confirm = window.confirm(
      `Are you sure you want to delete teacher account "${teacher.name}" (@${teacher.username})? All their class/subject assignments will be removed.`
    );
    if (!confirm) return;

    try {
      // 1. Delete from Firestore
      try {
        await deleteDoc(doc(db, 'teachers', teacher.id));
      } catch (firestoreErr: any) {
        console.error('Firestore teacher delete error:', firestoreErr);
        handleFirestoreError(firestoreErr, OperationType.DELETE, `teachers/${teacher.id}`);
      }

      // 2. Delete from local state
      const res = await fetchWithAuth(`/api/teachers/${teacher.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete teacher account');
      }
      await loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleOpenResetPassword = (teacher: any) => {
    setPasswordTargetTeacher(teacher);
    setNewPassword(teacher.plainPassword && teacher.plainPassword !== '—' ? teacher.plainPassword : '');
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordTargetTeacher || !newPassword.trim()) {
      alert('Please enter a valid password.');
      return;
    }

    try {
      // 1. Update password in Firestore
      try {
        await setDoc(
          doc(db, 'teachers', passwordTargetTeacher.id),
          cleanForFirestore({ plainPassword: newPassword.trim() }),
          { merge: true }
        );
      } catch (firestoreErr: any) {
        console.error('Firestore teacher password update error:', firestoreErr);
        handleFirestoreError(firestoreErr, OperationType.WRITE, `teachers/${passwordTargetTeacher.id}`);
      }

      // 2. Update in local state
      const res = await fetchWithAuth(`/api/users/${passwordTargetTeacher.id}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newPassword: newPassword.trim(),
          password: newPassword.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update password');
      }
      setPasswordTargetTeacher(null);
      setNewPassword('');
      await loadData();
      alert(`Password for ${passwordTargetTeacher.name} updated successfully!`);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleAddAssignment = async () => {
    if (!assignTeacher || !assignClassId || !assignSubjectId) return;

    // Check for conflicting assignment with another teacher
    const conflictingAllocation = assignments.find(
      a => a.classId === assignClassId && a.subjectId === assignSubjectId && a.teacherId !== assignTeacher.id
    );
    if (conflictingAllocation) {
      const conflictingTeacher = teachers.find(t => t.id === conflictingAllocation.teacherId);
      const targetClass = classes.find(c => c.id === assignClassId);
      const targetSubject = subjects.find(s => s.id === assignSubjectId);
      const confirmReassign = window.confirm(
        `The subject "${targetSubject?.nameMl || targetSubject?.nameEn}" for "${targetClass?.name}" is currently allocated to teacher "${conflictingTeacher?.name || 'another teacher'}".\n\nDo you want to reassign this subject to "${assignTeacher.name}"?`
      );
      if (!confirmReassign) {
        return;
      }
    }

    const newAsg: TeacherAssignment = {
      id: `asg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      teacherId: assignTeacher.id,
      classId: assignClassId,
      subjectId: assignSubjectId,
    };

    // 1. Instant local state update for zero lag
    setAssignments(prev => [
      ...prev.filter(a => !(a.classId === assignClassId && a.subjectId === assignSubjectId)),
      newAsg,
    ]);

    setTeachers(prev => prev.map(t => {
      const isTarget = t.id === assignTeacher.id;
      const currentList = Array.isArray((t as any).assignedSubjects)
        ? (t as any).assignedSubjects
        : (Array.isArray(t.assignments) ? t.assignments : []);
      const filtered = currentList.filter((a: any) => !(a.classId === assignClassId && a.subjectId === assignSubjectId));
      if (isTarget) {
        return {
          ...t,
          assignments: [...filtered, newAsg],
          assignedSubjects: [...filtered, newAsg],
        };
      }
      return {
        ...t,
        assignments: filtered,
        assignedSubjects: filtered,
      };
    }));

    // Close modal immediately and show success toast
    setAssignTeacher(null);
    setToastMessage('Subject assigned successfully');

    try {
      // 2. Commit directly to Firestore 'teachers' collection
      try {
        const existingAsgs = Array.isArray(assignTeacher.assignedSubjects)
          ? assignTeacher.assignedSubjects
          : (Array.isArray(assignTeacher.assignments) ? assignTeacher.assignments : []);
        const updated = [
          ...existingAsgs.filter((a: any) => !(a.classId === assignClassId && a.subjectId === assignSubjectId)),
          newAsg,
        ];
        const updatedTeacher = {
          ...assignTeacher,
          assignments: updated,
          assignedSubjects: updated,
        };
        await setDoc(
          doc(db, 'teachers', assignTeacher.id),
          cleanForFirestore(updatedTeacher),
          { merge: true }
        );

        // Also clean up conflicting teacher in Firestore if reassigned
        if (conflictingAllocation) {
          const prevTeacherObj = teachers.find(t => t.id === conflictingAllocation.teacherId);
          if (prevTeacherObj) {
            const prevExisting = (prevTeacherObj.assignments || prevTeacherObj.assignedSubjects || []).filter(
              (a: any) => !(a.classId === assignClassId && a.subjectId === assignSubjectId)
            );
            await setDoc(
              doc(db, 'teachers', prevTeacherObj.id),
              cleanForFirestore({ ...prevTeacherObj, assignments: prevExisting, assignedSubjects: prevExisting }),
              { merge: true }
            );
          }
        }
      } catch (fErr: any) {
        console.error('Firestore assignment write error:', fErr);
        handleFirestoreError(fErr, OperationType.WRITE, `teachers/${assignTeacher.id}`);
      }

      // 3. Local storage / backend API
      const res = await fetchWithAuth('/api/teacher-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newAsg, reassign: true, force: true }),
      });
      if (!res.ok) {
        const err = await res.json();
        console.warn('API assignment warning:', err);
      }
    } catch (err: any) {
      console.error('Error adding teacher assignment:', err);
    }
  };

  const handleRemoveAssignment = async (assignId: string, teacherId?: string) => {
    if (!window.confirm('Remove this subject assignment?')) return;
    try {
      // 1. Commit directly to Firestore 'teachers' collection
      if (teacherId) {
        try {
          const tObj = teachers.find(t => t.id === teacherId);
          if (tObj) {
            const existingAsgs = Array.isArray((tObj as any).assignedSubjects)
              ? (tObj as any).assignedSubjects
              : (Array.isArray(tObj.assignments) ? tObj.assignments : []);
            const updated = existingAsgs.filter((a: any) => a.id !== assignId);
            const updatedTeacher = {
              ...tObj,
              assignments: updated,
              assignedSubjects: updated,
            };
            await setDoc(
              doc(db, 'teachers', teacherId),
              cleanForFirestore(updatedTeacher),
              { merge: true }
            );
          }
        } catch (fErr: any) {
          console.error('Firestore remove assignment error:', fErr);
          handleFirestoreError(fErr, OperationType.WRITE, `teachers/${teacherId}`);
        }
      }

      const res = await fetchWithAuth(`/api/teacher-assignments/${assignId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await loadData();
      }
    } catch (err: any) {
      console.error('Error removing assignment:', err);
      alert('Failed to delete assignment');
    }
  };

  // Helper to get subject display name strictly in Malayalam
  const getSubjectMalayalamName = (sub: SubjectItem, clsNumericGrade?: number) => {
    if (clsNumericGrade === 9 && (sub.id === 'sub_history_buhuth' || sub.code === 'HST')) {
      return 'ബുഹൂസ്';
    }
    return sub.nameMl || sub.nameEn;
  };

  if (loading) {
    return <div className="text-center py-10 text-xs text-slate-500">Loading teacher accounts...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-2 bg-emerald-800 text-white px-4 py-2.5 rounded-xl shadow-xl text-xs font-bold border border-emerald-600 animate-in fade-in slide-in-from-top-2 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-300" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{t.navTeachers} ({teachers.length})</h2>
          <p className="text-xs text-slate-500">
            Full management controls: edit teacher names, assign subjects/classes, reset passwords, and delete accounts.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Create Teacher Account
        </button>
      </div>

      {teachers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500">
          <Users className="w-10 h-10 mx-auto text-slate-400 mb-2" />
          <h3 className="font-bold text-slate-800 text-sm">No Teachers Added Yet</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            The database is in a fresh clean state. Click the "Create Teacher Account" button above to add teachers and assign them to classes and subjects.
          </p>
        </div>
      ) : (
        /* Teachers Cards List */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teachers.map(teacher => {
            const teacherAssigned = Array.isArray((teacher as any).assignedSubjects)
              ? (teacher as any).assignedSubjects
              : (Array.isArray(teacher.assignments) ? teacher.assignments : []);
            const fromList = assignments.filter(a => a.teacherId === teacher.id);
            const tAssignments: TeacherAssignment[] = fromList.length > 0 ? fromList : teacherAssigned;
            const isPasswordVisible = !!showPasswordMap[teacher.id];

            return (
              <div
                key={teacher.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4 flex flex-col justify-between hover:shadow-sm transition"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-blue-800 bg-blue-100 px-2 py-0.5 rounded-full">
                      Teacher Account
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEdit(teacher)}
                        className="p-1 text-slate-400 hover:text-emerald-700 hover:bg-slate-100 rounded-lg transition"
                        title="Edit Teacher"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteTeacher(teacher)}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                        title="Delete Teacher"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <h3 className="font-bold text-slate-900 text-base mt-2 whitespace-nowrap overflow-hidden text-ellipsis">
                    {teacher.name}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">@{teacher.username}</p>
                  {teacher.phone && (
                    <p className="text-xs text-slate-500 mt-0.5">📞 {teacher.phone}</p>
                  )}

                  {/* Class In-Charge (Class Teacher) Role Box */}
                  {(() => {
                    const inChargeClass = classes.find(c => c.id === teacher.inChargeClassId);
                    return (
                      <div className="mt-2.5 p-2 rounded-xl bg-emerald-50/80 border border-emerald-200 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Shield className="w-3.5 h-3.5 text-emerald-800 shrink-0" />
                          <div className="truncate">
                            <span className="text-[10px] uppercase font-bold text-emerald-800 block">Class In-Charge (Class Teacher)</span>
                            <span className="font-bold text-slate-900 text-xs">
                              {inChargeClass ? inChargeClass.name : 'Not Assigned'}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setInChargeModalTeacher(teacher);
                            setSelectedInChargeClassId(teacher.inChargeClassId || '');
                          }}
                          className="px-2 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100 rounded-lg transition shrink-0 ml-2"
                        >
                          {teacher.inChargeClassId ? 'Change' : 'Assign'}
                        </button>
                      </div>
                    );
                  })()}

                  {/* Password & Credentials Management Box */}
                  <div className="mt-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                        <KeyRound className="w-3 h-3 text-slate-400" /> Login Password:
                      </span>
                      <button
                        onClick={() => handleOpenResetPassword(teacher)}
                        className="text-[10px] font-bold text-emerald-800 hover:underline"
                      >
                        Reset / Edit
                      </button>
                    </div>

                    <div className="flex items-center justify-between bg-white px-2 py-1 rounded-lg border border-slate-200">
                      <span className="font-mono text-xs font-semibold text-slate-800">
                        {isPasswordVisible ? teacher.plainPassword || '—' : '••••••••'}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleShowPassword(teacher.id)}
                        className="text-slate-400 hover:text-slate-600 p-0.5"
                        title={isPasswordVisible ? 'Hide Password' : 'Show Password'}
                      >
                        {isPasswordVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Assigned Subjects List - Sorted ascending Class 1 to Class 9 */}
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Assigned Classes & Subjects ({tAssignments.length}):
                    </span>
                    {(() => {
                      const sortedAssignments = [...tAssignments].sort((a: TeacherAssignment, b: TeacherAssignment) => {
                        const gradeA = classes.find(c => c.id === a.classId)?.numericGrade ?? 999;
                        const gradeB = classes.find(c => c.id === b.classId)?.numericGrade ?? 999;
                        if (gradeA !== gradeB) return gradeA - gradeB;
                        const subA = subjects.find(s => s.id === a.subjectId)?.nameEn || '';
                        const subB = subjects.find(s => s.id === b.subjectId)?.nameEn || '';
                        return subA.localeCompare(subB);
                      });

                      if (sortedAssignments.length === 0) {
                        return <span className="text-xs text-slate-400 italic">No classes assigned yet</span>;
                      }

                      return (
                        <div className="space-y-1 max-h-36 overflow-y-auto">
                          {sortedAssignments.map((a: TeacherAssignment) => {
                            const cls = classes.find(c => c.id === a.classId);
                            const sub = subjects.find(s => s.id === a.subjectId);
                            const subMlName = sub ? getSubjectMalayalamName(sub, cls?.numericGrade) : '—';

                            return (
                              <div
                                key={a.id}
                                className="flex items-center justify-between text-xs bg-slate-50 p-2 rounded-lg border border-slate-200"
                              >
                                <span className="font-semibold text-slate-800">
                                  {cls?.name} • <span className="text-emerald-950 font-bold">{subMlName}</span>
                                </span>
                                <button
                                  onClick={() => handleRemoveAssignment(a.id, teacher.id)}
                                  className="text-slate-400 hover:text-rose-600 p-0.5 transition cursor-pointer"
                                  title="Remove assignment"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => setAssignTeacher(teacher)}
                    className="w-full py-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Assign Class & Subject
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Teacher Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">Create New Teacher Account</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddTeacher} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Teacher Name (English)</label>
                <input
                  type="text"
                  value={tName}
                  onChange={e => setTName(e.target.value)}
                  placeholder="e.g. Ibrahim Moulavi"
                  className="w-full p-2 border rounded-lg focus:outline-emerald-700"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Teacher Name (Malayalam)</label>
                <input
                  type="text"
                  value={tNameMl}
                  onChange={e => setTNameMl(e.target.value)}
                  placeholder="ഉദാ: ഉസ്താദ് ഇബ്രാഹിം മൗലവി"
                  className="w-full p-2 border rounded-lg focus:outline-emerald-700"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Login Username</label>
                <input
                  type="text"
                  value={tUsername}
                  onChange={e => setTUsername(e.target.value)}
                  placeholder="e.g. teacher.ibrahim"
                  className="w-full p-2 border rounded-lg font-mono focus:outline-emerald-700"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Login Password</label>
                <input
                  type="text"
                  value={tPassword}
                  onChange={e => setTPassword(e.target.value)}
                  className="w-full p-2 border rounded-lg font-mono focus:outline-emerald-700"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Phone Number</label>
                <input
                  type="text"
                  value={tPhone}
                  onChange={e => setTPhone(e.target.value)}
                  placeholder="+91 9847..."
                  className="w-full p-2 border rounded-lg focus:outline-emerald-700"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Assign Class In-Charge (Class Teacher)
                </label>
                <select
                  value={tInChargeClassId}
                  onChange={e => setTInChargeClassId(e.target.value)}
                  className="w-full p-2 border rounded-lg bg-slate-50 font-medium focus:outline-emerald-700"
                >
                  <option value="">None (Subject Teacher only)</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.nameMl})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  A teacher can be assigned as Class In-charge for exactly one class.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3.5 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-bold text-white bg-emerald-800 rounded-lg hover:bg-emerald-900 cursor-pointer"
                >
                  Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Teacher Modal */}
      {editingTeacher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">Edit Teacher Account</h3>
              <button
                onClick={() => setEditingTeacher(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Teacher Name (English)</label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full p-2 border rounded-lg focus:outline-emerald-700"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Teacher Name (Malayalam)</label>
                <input
                  type="text"
                  value={editNameMl}
                  onChange={e => setEditNameMl(e.target.value)}
                  className="w-full p-2 border rounded-lg focus:outline-emerald-700"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Login Username</label>
                <input
                  type="text"
                  value={editUsername}
                  onChange={e => setEditUsername(e.target.value)}
                  className="w-full p-2 border rounded-lg font-mono focus:outline-emerald-700"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Phone Number</label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={e => setEditPhone(e.target.value)}
                  className="w-full p-2 border rounded-lg focus:outline-emerald-700"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Assign Class In-Charge (Class Teacher)
                </label>
                <select
                  value={editInChargeClassId}
                  onChange={e => setEditInChargeClassId(e.target.value)}
                  className="w-full p-2 border rounded-lg bg-slate-50 font-medium focus:outline-emerald-700"
                >
                  <option value="">None (Subject Teacher only)</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.nameMl})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  A teacher can be assigned as Class In-charge for exactly one class.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingTeacher(null)}
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

      {/* Reset / Edit Password Modal */}
      {passwordTargetTeacher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-emerald-800" />
                Reset Password
              </h3>
              <button
                onClick={() => setPasswordTargetTeacher(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              Update login password for <strong>{passwordTargetTeacher.name}</strong> (@{passwordTargetTeacher.username}):
            </p>

            <form onSubmit={handleSavePassword} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">New Password</label>
                <input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full p-2 border rounded-lg font-mono focus:outline-emerald-700"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPasswordTargetTeacher(null)}
                  className="px-3 py-1.5 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 font-bold text-white bg-emerald-800 rounded-lg hover:bg-emerald-900 cursor-pointer"
                >
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Class & Subject Modal */}
      {assignTeacher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-bold text-slate-900">
                Assign Class & Subject to {assignTeacher.name}
              </h3>
              <button
                onClick={() => setAssignTeacher(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              Select class and subject. Teacher will only have access to enter marks for their assigned matrix.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Class</label>
                <select
                  value={assignClassId}
                  onChange={e => setAssignClassId(e.target.value)}
                  className="w-full p-2 border rounded-lg bg-slate-50 font-semibold focus:outline-emerald-700"
                >
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.nameMl})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Subject (വിഷയം — strictly in Malayalam)
                </label>
                <select
                  value={assignSubjectId}
                  onChange={e => setAssignSubjectId(e.target.value)}
                  className="w-full p-2 border rounded-lg bg-slate-50 font-semibold focus:outline-emerald-700"
                >
                  {subjects.map(s => {
                    const selClass = classes.find(c => c.id === assignClassId);
                    const subMl = getSubjectMalayalamName(s, selClass?.numericGrade);
                    return (
                      <option key={s.id} value={s.id}>
                        {subMl} ({s.code})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setAssignTeacher(null)}
                  className="px-3.5 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAddAssignment}
                  className="px-4 py-2 font-bold text-white bg-emerald-800 rounded-lg hover:bg-emerald-900 cursor-pointer"
                >
                  Confirm Assignment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assign Class In-Charge Modal */}
      {inChargeModalTeacher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-emerald-800" />
                Assign Class In-Charge (Class Teacher)
              </h3>
              <button
                onClick={() => setInChargeModalTeacher(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              Designate <strong>{inChargeModalTeacher.name}</strong> as the official Class Teacher / In-charge for a single class. As Class In-charge, they will have comprehensive permissions to oversee students and edit marks across all subjects for their class.
            </p>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Select In-Charge Class:</label>
                <select
                  value={selectedInChargeClassId}
                  onChange={e => setSelectedInChargeClassId(e.target.value)}
                  className="w-full p-2.5 border rounded-lg bg-slate-50 font-semibold focus:outline-emerald-700 text-xs"
                >
                  <option value="">None (Remove Class In-Charge Role)</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.nameMl})
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] leading-relaxed">
                <strong>Policy:</strong> Exactly ONE Class In-charge role is allowed per teacher. Assigning a new class replaces any prior class in-charge assignment.
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setInChargeModalTeacher(null)}
                  className="px-3.5 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveInCharge}
                  className="px-4 py-2 font-bold text-white bg-emerald-800 rounded-lg hover:bg-emerald-900 cursor-pointer"
                >
                  Save In-Charge Role
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
