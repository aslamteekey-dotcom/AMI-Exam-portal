import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { User, Student, ClassItem } from '../../types';
import { db, handleFirestoreError, OperationType } from '../../services/firebase';
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import {
  Users,
  Plus,
  Link,
  Check,
  UserCheck,
  Edit2,
  Trash2,
  KeyRound,
  Eye,
  EyeOff,
  X,
  Sparkles,
  Search,
  CheckSquare,
  Square,
  GraduationCap,
} from 'lucide-react';

export const ParentManagement: React.FC = () => {
  const { fetchWithAuth, lang, t } = useAuth();
  const [loading, setLoading] = useState(true);
  const [parents, setParents] = useState<any[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);

  // Create Parent Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [pName, setPName] = useState('');
  const [pNameMl, setPNameMl] = useState('');
  const [pUsername, setPUsername] = useState('');
  const [pPassword, setPPassword] = useState('');
  const [pPhone, setPPhone] = useState('');
  const [createChildIds, setCreateChildIds] = useState<string[]>([]);

  // Edit Parent Modal
  const [editingParent, setEditingParent] = useState<any | null>(null);
  const [editName, setEditName] = useState('');
  const [editNameMl, setEditNameMl] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPhone, setEditPhone] = useState('');

  // Password Reset / Edit Modal
  const [passwordTargetParent, setPasswordTargetParent] = useState<any | null>(null);
  const [newPasswordVal, setNewPasswordVal] = useState('');
  const [showPasswordMap, setShowPasswordMap] = useState<Record<string, boolean>>({});

  // Multi-Student Linking Modal
  const [linkingParent, setLinkingParent] = useState<any | null>(null);
  const [selectedStudentIdsToLink, setSelectedStudentIdsToLink] = useState<string[]>([]);
  const [linkSearchQuery, setLinkSearchQuery] = useState('');

  const isMl = lang === 'ml';

  const loadData = async () => {
    setLoading(true);
    try {
      const [resP, resS, resC] = await Promise.all([
        fetchWithAuth('/api/parents'),
        fetchWithAuth('/api/students'),
        fetchWithAuth('/api/classes'),
      ]);
      const pData = await resP.json();
      const sData = await resS.json();
      const cData = await resC.json();
      setParents(pData);
      setStudents(sData);
      setClasses(cData);
    } catch (err) {
      console.error('Error loading parents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Real-time listener for Firestore 'parents' collection
    let unsub: (() => void) | undefined;
    try {
      unsub = onSnapshot(
        collection(db, 'parents'),
        (snapshot) => {
          if (!snapshot.empty) {
            const remoteParents = snapshot.docs.map((d) => ({
              ...d.data(),
              id: d.id,
            } as User));

            // Sync state strictly with Firestore documents
            setParents((prev) => {
              return remoteParents.map((rp) => {
                const prevP = prev.find((item) => item.id === rp.id);
                return {
                  ...rp,
                  linkedStudents: prevP?.linkedStudents || [],
                };
              });
            });
          }
        },
        (error) => {
          console.error('Firestore parents onSnapshot error:', error);
          handleFirestoreError(error, OperationType.GET, 'parents');
        }
      );
    } catch (err) {
      console.warn('Failed to attach parents onSnapshot listener:', err);
    }

    return () => {
      if (unsub) unsub();
    };
  }, []);

  const toggleShowPassword = (parentId: string) => {
    setShowPasswordMap(prev => ({
      ...prev,
      [parentId]: !prev[parentId],
    }));
  };

  // Determine which child is the elder child of a parent
  const getElderChild = (children: Student[]) => {
    if (!children || children.length === 0) return null;
    const sorted = [...children].sort((a, b) => {
      const classA = classes.find(c => c.id === a.classId)?.numericGrade || 0;
      const classB = classes.find(c => c.id === b.classId)?.numericGrade || 0;
      if (classB !== classA) return classB - classA; // higher class is elder
      return a.admissionNo.localeCompare(b.admissionNo); // lowest admission number
    });
    return sorted[0];
  };

  const handleCreateParent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // If password is blank and child selected, use elder child's admission number
      let pass = pPassword.trim();
      if (!pass && createChildIds.length > 0) {
        const selKids = students.filter(s => createChildIds.includes(s.id));
        const elder = getElderChild(selKids);
        if (elder) pass = elder.admissionNo;
      }
      if (!pass) pass = 'parent123';

      const parentId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const newParentData: User = {
        id: parentId,
        username: pUsername.trim() || pName.trim(),
        name: pName.trim(),
        nameMl: pNameMl.trim() || pName.trim(),
        role: 'parent',
        plainPassword: pass,
        phone: pPhone.trim(),
        active: true,
        createdAt: new Date().toISOString(),
      };

      // 1. Persistent Firestore write
      try {
        await setDoc(doc(db, 'parents', parentId), newParentData);
      } catch (firestoreErr: any) {
        console.error('Firestore write error when adding parent:', firestoreErr);
        handleFirestoreError(firestoreErr, OperationType.WRITE, `parents/${parentId}`);
        alert(`Firestore error: ${firestoreErr.message || 'Failed to save parent to cloud database'}`);
        return;
      }

      // 2. Also register in local storage/API
      const res = await fetchWithAuth('/api/parents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: parentId,
          name: pName.trim(),
          nameMl: pNameMl.trim() || pName.trim(),
          username: pUsername.trim() || pName.trim(),
          password: pass,
          phone: pPhone.trim(),
          studentIds: createChildIds,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create parent account');
      }
      setShowAddModal(false);
      setPName('');
      setPNameMl('');
      setPUsername('');
      setPPassword('');
      setPPhone('');
      setCreateChildIds([]);
      await loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleOpenEdit = (parent: any) => {
    setEditingParent(parent);
    setEditName(parent.name);
    setEditNameMl(parent.nameMl || '');
    setEditUsername(parent.username);
    setEditPhone(parent.phone || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingParent) return;
    try {
      const updateData = {
        name: editName.trim(),
        nameMl: editNameMl.trim() || editName.trim(),
        username: editUsername.trim(),
        phone: editPhone.trim(),
      };

      // 1. Persistent Firestore write
      try {
        await setDoc(doc(db, 'parents', editingParent.id), updateData, { merge: true });
      } catch (firestoreErr: any) {
        console.warn('Firestore parent edit warning:', firestoreErr);
      }

      // 2. Local update
      const res = await fetchWithAuth(`/api/parents/${editingParent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update parent account');
      }
      setEditingParent(null);
      await loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteParent = async (parent: any) => {
    const confirm = window.confirm(
      `Are you sure you want to delete parent account "${parent.name}" (@${parent.username})? Any linked children will be detached from this account.`
    );
    if (!confirm) return;

    try {
      // 1. Delete from Firestore
      try {
        await deleteDoc(doc(db, 'parents', parent.id));
      } catch (firestoreErr: any) {
        console.warn('Firestore parent delete warning:', firestoreErr);
      }

      // 2. Delete from local state
      const res = await fetchWithAuth(`/api/parents/${parent.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete parent account');
      }
      await loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleOpenResetPassword = (parent: any) => {
    setPasswordTargetParent(parent);
    setNewPasswordVal(parent.plainPassword && parent.plainPassword !== '—' ? parent.plainPassword : '');
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordTargetParent || !newPasswordVal.trim()) return;

    try {
      // 1. Update password in Firestore
      try {
        await setDoc(
          doc(db, 'parents', passwordTargetParent.id),
          { plainPassword: newPasswordVal.trim() },
          { merge: true }
        );
      } catch (firestoreErr: any) {
        console.warn('Firestore parent password update warning:', firestoreErr);
      }

      // 2. Local update
      const res = await fetchWithAuth(`/api/users/${passwordTargetParent.id}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: newPasswordVal.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update password');
      }
      setPasswordTargetParent(null);
      setNewPasswordVal('');
      await loadData();
      alert(`Password for parent ${passwordTargetParent.name} updated successfully!`);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleOpenLinkModal = (parent: any) => {
    setLinkingParent(parent);
    const currentlyLinked = students.filter(s => s.parentUserId === parent.id).map(s => s.id);
    setSelectedStudentIdsToLink(currentlyLinked);
    setLinkSearchQuery('');
  };

  const handleSaveMultiLink = async () => {
    if (!linkingParent) return;

    try {
      const res = await fetchWithAuth(`/api/parents/${linkingParent.id}/link-students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentIds: selectedStudentIdsToLink }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to link children');
      }
      const data = await res.json();
      setLinkingParent(null);
      loadData();
      alert(`Children linked successfully! Login password updated to elder child's admission number: ${data.parentPassword}`);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleUnlinkChild = async (parentId: string, studentId: string) => {
    if (!window.confirm('Unlink this student from the parent account?')) return;
    try {
      const res = await fetchWithAuth(`/api/parents/${parentId}/unlink-student`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId }),
      });
      if (res.ok) {
        loadData();
      }
    } catch (err) {
      alert('Failed to unlink child');
    }
  };

  if (loading) {
    return <div className="text-center py-10 text-xs text-slate-500">Loading parent accounts...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{t.navParents} ({parents.length})</h2>
          <p className="text-xs text-slate-500">
            Multi-student sibling linking: once linked, parent login password is automatically set to the elder child's Admission Number.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Create Parent Account
        </button>
      </div>

      {parents.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500">
          <Users className="w-10 h-10 mx-auto text-slate-400 mb-2" />
          <h3 className="font-bold text-slate-800 text-sm">No Parent Accounts Added Yet</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Parent accounts will be generated automatically when you upload student CSV/Excel files (Parent Name is Username, Admission Number is Password), or you can create them manually here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {parents.map(parent => {
            const linkedStudents = students.filter(s => s.parentUserId === parent.id);
            const elderChild = getElderChild(linkedStudents);
            const isPasswordVisible = !!showPasswordMap[parent.id];

            return (
              <div
                key={parent.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4 flex flex-col justify-between hover:shadow-sm transition"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                      Parent Account
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEdit(parent)}
                        className="p-1 text-slate-400 hover:text-emerald-700 hover:bg-slate-100 rounded-lg transition"
                        title="Edit Parent Name"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteParent(parent)}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                        title="Delete Parent Account"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <h3 className="font-bold text-slate-900 text-base mt-2">
                    {parent.name}
                  </h3>
                  {parent.nameMl && parent.nameMl !== parent.name && (
                    <p className="text-xs text-slate-600 font-medium">{parent.nameMl}</p>
                  )}
                  <p className="text-xs text-slate-500 font-mono">@{parent.username}</p>
                  {parent.phone && (
                    <p className="text-xs text-slate-500 mt-0.5">📞 {parent.phone}</p>
                  )}

                  {/* Password & Credentials Box */}
                  <div className="mt-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                        <KeyRound className="w-3 h-3 text-slate-400" /> Login Password:
                      </span>
                      <button
                        onClick={() => handleOpenResetPassword(parent)}
                        className="text-[10px] font-bold text-emerald-800 hover:underline"
                      >
                        Reset / Edit
                      </button>
                    </div>

                    <div className="flex items-center justify-between bg-white px-2 py-1 rounded-lg border border-slate-200">
                      <span className="font-mono text-xs font-semibold text-slate-800">
                        {isPasswordVisible ? parent.plainPassword || '—' : '••••••••'}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleShowPassword(parent.id)}
                        className="text-slate-400 hover:text-slate-600 p-0.5"
                        title={isPasswordVisible ? 'Hide Password' : 'Show Password'}
                      >
                        {isPasswordVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    {elderChild && (
                      <div className="flex items-center gap-1 text-[10px] text-emerald-700 font-medium">
                        <Sparkles className="w-3 h-3 shrink-0" />
                        <span>Elder Child: <strong>{elderChild.nameEn}</strong> (Adm: {elderChild.admissionNo})</span>
                      </div>
                    )}
                  </div>

                  {/* Linked Children */}
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Linked Children ({linkedStudents.length}):
                      </span>
                    </div>

                    {linkedStudents.length === 0 ? (
                      <span className="text-xs text-slate-400 italic">No children linked yet</span>
                    ) : (
                      <div className="space-y-1.5 max-h-36 overflow-y-auto">
                        {linkedStudents.map(s => {
                          const cls = classes.find(c => c.id === s.classId);
                          const isElder = elderChild?.id === s.id;

                          return (
                            <div
                              key={s.id}
                              className={`flex items-center justify-between text-xs p-2 rounded-lg border ${
                                isElder
                                  ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950'
                                  : 'bg-slate-50 border-slate-200 text-slate-800'
                              }`}
                            >
                              <div>
                                <div className="font-semibold flex items-center gap-1">
                                  {s.nameEn}
                                  {isElder && (
                                    <span className="text-[9px] font-bold bg-emerald-700 text-white px-1.5 py-0.2 rounded-full">
                                      Elder
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-500 font-mono">
                                  {cls?.name} • Adm: {s.admissionNo} • Roll: {s.rollNo}
                                </div>
                              </div>

                              <button
                                onClick={() => handleUnlinkChild(parent.id, s.id)}
                                className="text-slate-400 hover:text-rose-600 p-1"
                                title="Unlink child"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => handleOpenLinkModal(parent)}
                    className="w-full py-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Link className="w-3.5 h-3.5" />
                    Link Multiple Children
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Parent Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">Create Parent Portal Account</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateParent} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Parent Name (English)</label>
                <input
                  type="text"
                  value={pName}
                  onChange={e => {
                    setPName(e.target.value);
                    if (!pUsername) setPUsername(e.target.value.toLowerCase().replace(/\s+/g, '.'));
                  }}
                  placeholder="e.g. Hamza Pallikkuth"
                  className="w-full p-2 border rounded-lg focus:outline-emerald-700"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Parent Name (Malayalam)</label>
                <input
                  type="text"
                  value={pNameMl}
                  onChange={e => setPNameMl(e.target.value)}
                  placeholder="ഉദാ: ഹംസ പള്ളിക്കുത്ത്"
                  className="w-full p-2 border rounded-lg focus:outline-emerald-700"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Login Username</label>
                <input
                  type="text"
                  value={pUsername}
                  onChange={e => setPUsername(e.target.value)}
                  placeholder="e.g. hamza.pallikkuth"
                  className="w-full p-2 border rounded-lg font-mono focus:outline-emerald-700"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Login Password <span className="text-[10px] font-normal text-slate-500">(Auto-set to elder child's admission number if linked)</span>
                </label>
                <input
                  type="text"
                  value={pPassword}
                  onChange={e => setPPassword(e.target.value)}
                  placeholder="e.g. ADM-2026-001 or custom"
                  className="w-full p-2 border rounded-lg font-mono focus:outline-emerald-700"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Phone Number</label>
                <input
                  type="text"
                  value={pPhone}
                  onChange={e => setPPhone(e.target.value)}
                  placeholder="+91 9745..."
                  className="w-full p-2 border rounded-lg focus:outline-emerald-700"
                />
              </div>

              {/* Select Initial Children */}
              <div className="pt-2">
                <label className="block font-bold text-slate-700 mb-1">Link Children (Select Sibling Students):</label>
                <div className="border border-slate-200 rounded-xl p-2 max-h-36 overflow-y-auto space-y-1">
                  {students.map(s => {
                    const isSelected = createChildIds.includes(s.id);
                    const cls = classes.find(c => c.id === s.classId);
                    return (
                      <div
                        key={s.id}
                        onClick={() => {
                          if (isSelected) {
                            setCreateChildIds(createChildIds.filter(id => id !== s.id));
                          } else {
                            setCreateChildIds([...createChildIds, s.id]);
                          }
                        }}
                        className={`flex items-center justify-between p-1.5 rounded-lg text-xs cursor-pointer ${
                          isSelected ? 'bg-emerald-50 text-emerald-950 font-bold border border-emerald-300' : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <span>{s.nameEn} ({cls?.name})</span>
                        <span className="font-mono text-[10px] text-slate-400">Adm: {s.admissionNo}</span>
                      </div>
                    );
                  })}
                </div>
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

      {/* Edit Parent Modal */}
      {editingParent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">Edit Parent Account</h3>
              <button
                onClick={() => setEditingParent(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Parent Name (English)</label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full p-2 border rounded-lg focus:outline-emerald-700"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Parent Name (Malayalam)</label>
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

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingParent(null)}
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
      {passwordTargetParent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-emerald-800" />
                Reset Parent Password
              </h3>
              <button
                onClick={() => setPasswordTargetParent(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              Update login password for parent <strong>{passwordTargetParent.name}</strong> (@{passwordTargetParent.username}):
            </p>

            <form onSubmit={handleSavePassword} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">New Password</label>
                <input
                  type="text"
                  value={newPasswordVal}
                  onChange={e => setNewPasswordVal(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full p-2 border rounded-lg font-mono focus:outline-emerald-700"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPasswordTargetParent(null)}
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

      {/* Multi-Student Linking Modal */}
      {linkingParent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-base font-bold text-slate-900">
                  Link Children to {linkingParent.name}
                </h3>
                <button
                  onClick={() => setLinkingParent(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-xs text-slate-500 mb-3">
                Check all siblings to link to this parent account. The parent password will automatically be synchronized to the <strong>elder child's Admission Number</strong>.
              </p>

              {/* Search filter */}
              <div className="relative mb-3">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={linkSearchQuery}
                  onChange={e => setLinkSearchQuery(e.target.value)}
                  placeholder="Search student by name, admission no, or class..."
                  className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-emerald-700"
                />
              </div>

              {/* Students Selection List */}
              <div className="border border-slate-200 rounded-xl p-2 max-h-64 overflow-y-auto space-y-1">
                {students
                  .filter(s => {
                    const q = linkSearchQuery.toLowerCase();
                    const cls = classes.find(c => c.id === s.classId);
                    return (
                      s.nameEn.toLowerCase().includes(q) ||
                      (s.nameMl && s.nameMl.includes(q)) ||
                      s.admissionNo.toLowerCase().includes(q) ||
                      (cls && cls.name.toLowerCase().includes(q))
                    );
                  })
                  .map(s => {
                    const isChecked = selectedStudentIdsToLink.includes(s.id);
                    const cls = classes.find(c => c.id === s.classId);
                    const currentOtherParent =
                      s.parentUserId && s.parentUserId !== linkingParent.id
                        ? parents.find(p => p.id === s.parentUserId)
                        : null;

                    return (
                      <div
                        key={s.id}
                        onClick={() => {
                          if (isChecked) {
                            setSelectedStudentIdsToLink(selectedStudentIdsToLink.filter(id => id !== s.id));
                          } else {
                            setSelectedStudentIdsToLink([...selectedStudentIdsToLink, s.id]);
                          }
                        }}
                        className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition ${
                          isChecked
                            ? 'bg-emerald-50 text-emerald-950 font-semibold border border-emerald-300'
                            : 'hover:bg-slate-50 text-slate-700 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-emerald-700 shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300 shrink-0" />
                          )}
                          <div>
                            <div>{s.nameEn}</div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {cls?.name} • Roll: {s.rollNo} • Adm: {s.admissionNo}
                              {currentOtherParent && (
                                <span className="text-amber-700 ml-1">
                                  (Linked to {currentOtherParent.name})
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <span className="text-[11px] font-mono text-slate-500">{s.admissionNo}</span>
                      </div>
                    );
                  })}
              </div>

              {/* Selection Summary */}
              <div className="mt-3 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center justify-between">
                <span>Selected Children: <strong>{selectedStudentIdsToLink.length}</strong></span>
                {selectedStudentIdsToLink.length > 0 && (() => {
                  const selStudents = students.filter(s => selectedStudentIdsToLink.includes(s.id));
                  const elder = getElderChild(selStudents);
                  return elder ? (
                    <span className="text-[11px]">
                      New Login Password: <strong className="font-mono bg-white px-1.5 py-0.5 rounded border border-emerald-300">{elder.admissionNo}</strong>
                    </span>
                  ) : null;
                })()}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t mt-4">
              <button
                type="button"
                onClick={() => setLinkingParent(null)}
                className="px-3.5 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveMultiLink}
                className="px-4 py-2 font-bold text-white bg-emerald-800 rounded-lg hover:bg-emerald-900 text-xs cursor-pointer"
              >
                Confirm Link ({selectedStudentIdsToLink.length} Children)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
