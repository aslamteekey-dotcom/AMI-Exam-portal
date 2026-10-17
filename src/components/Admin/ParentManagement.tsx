import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { User, Student, ClassItem, sortStudentsBoysFirst } from '../../types';
import { db, handleFirestoreError, OperationType } from '../../services/firebase';
import { firestoreSync, cleanForFirestore } from '../../services/firestoreSync';
import { collection, doc, setDoc, deleteDoc, onSnapshot, writeBatch } from 'firebase/firestore';
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
  Loader2,
  Filter,
  Phone,
  ShieldCheck,
} from 'lucide-react';

export const ParentManagement: React.FC = () => {
  const { fetchWithAuth, lang, t } = useAuth();
  const [loading, setLoading] = useState(true);
  const [parents, setParents] = useState<any[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [filterClassId, setFilterClassId] = useState('');

  // Automated Parent Credentials & Sync Modal
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncClassId, setSyncClassId] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);

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
  const [nameEn, setNameEn] = useState('');
  const [nameMl, setNameMl] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

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
      const uniqueStudents = Array.from(
        new Map((sData || []).map((s: Student) => [s.admissionNo?.toString() || s.id, s])).values()
      ) as Student[];
      setStudents(sortStudentsBoysFirst<Student>(uniqueStudents));
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
        if (elder) pass = `Admn@${elder.admissionNo}`;
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
        await setDoc(doc(db, 'parents', parentId), cleanForFirestore(newParentData));
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

  // Automated Parent Credentials & Sync Handler
  const handleGenerateSyncParentAccounts = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetchWithAuth('/api/parents/sync-from-students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId: syncClassId || undefined }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate/sync parent accounts');
      }
      const data = await res.json();
      setSyncResult(data);
      await loadData();
    } catch (err: any) {
      console.error('Error generating parent accounts:', err);
      alert(err.message || 'Error generating parent accounts');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleOpenEdit = (parent: any) => {
    setEditingParent(parent);
    setNameEn(parent.nameEn || parent.name || '');
    setNameMl(parent.nameMl || '');
    setUsername(parent.username || '');
    setPhone(parent.phone || '');
  };

  const handleSaveParent = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingParent) return;

    const trimmedNameEn = nameEn.trim();
    const trimmedNameMl = nameMl.trim() || trimmedNameEn;
    const trimmedUsername = username.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedNameEn) {
      alert('Parent Name (English) is required');
      return;
    }
    if (!trimmedUsername) {
      alert('Login Username is required');
      return;
    }

    setIsSavingEdit(true);
    try {
      const nowIso = new Date().toISOString();
      const parentUpdate = {
        name: trimmedNameEn,
        nameEn: trimmedNameEn,
        nameMl: trimmedNameMl,
        username: trimmedUsername,
        phone: trimmedPhone,
        updatedAt: nowIso,
      };

      // 1. Persistent Firestore write to 'parents' and 'users' collections
      try {
        await setDoc(doc(db, 'parents', editingParent.id), cleanForFirestore(parentUpdate), { merge: true });
        await setDoc(doc(db, 'users', editingParent.id), cleanForFirestore(parentUpdate), { merge: true });
      } catch (firestoreErr: any) {
        console.warn('Firestore parent edit warning:', firestoreErr);
      }

      // 2. Also update all associated student records in Firestore 'students' collection
      const originalPhone = String(editingParent.phone || '').trim();
      const originalName = String(editingParent.name || editingParent.nameEn || '').trim().toLowerCase();

      const associatedStudents = students.filter(
        s =>
          s.parentUserId === editingParent.id ||
          (originalPhone && String(s.parentPhone || '').trim() === originalPhone) ||
          (originalName && String(s.parentNameEn || '').trim().toLowerCase() === originalName)
      );

      if (associatedStudents.length > 0) {
        try {
          const batch = writeBatch(db);
          for (const st of associatedStudents) {
            const studentUpdate = {
              parentNameEn: trimmedNameEn,
              parentNameMl: trimmedNameMl,
              parentPhone: trimmedPhone,
              parentUserId: editingParent.id,
              updatedAt: nowIso,
            };
            if (st.id) {
              batch.set(doc(db, 'students', st.id), cleanForFirestore(studentUpdate), { merge: true });
            }
          }
          await batch.commit();
        } catch (batchErr) {
          console.warn('Firestore batch student sync warning:', batchErr);
          for (const st of associatedStudents) {
            const updatedSt: Student = {
              ...st,
              parentNameEn: trimmedNameEn,
              parentNameMl: trimmedNameMl,
              parentPhone: trimmedPhone,
              parentUserId: editingParent.id,
            };
            firestoreSync.syncStudent(updatedSt).catch(() => {});
          }
        }
      }

      // 3. Local database API update
      const res = await fetchWithAuth(`/api/parents/${editingParent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedNameEn,
          nameEn: trimmedNameEn,
          nameMl: trimmedNameMl,
          username: trimmedUsername,
          phone: trimmedPhone,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update parent account');
      }

      // 4. Update local state immediately for instant re-rendering without reload
      setParents(prev =>
        prev.map(p => {
          if (p.id === editingParent.id) {
            return {
              ...p,
              name: trimmedNameEn,
              nameEn: trimmedNameEn,
              nameMl: trimmedNameMl,
              username: trimmedUsername,
              phone: trimmedPhone,
            };
          }
          return p;
        })
      );

      setStudents(prev =>
        prev.map(s => {
          if (
            s.parentUserId === editingParent.id ||
            (originalPhone && String(s.parentPhone || '').trim() === originalPhone) ||
            (originalName && String(s.parentNameEn || '').trim().toLowerCase() === originalName)
          ) {
            return {
              ...s,
              parentNameEn: trimmedNameEn,
              parentNameMl: trimmedNameMl,
              parentPhone: trimmedPhone,
              parentUserId: editingParent.id,
            };
          }
          return s;
        })
      );

      // 5. UI Feedback & Modal Close
      setSuccessToast('Parent details updated successfully!');
      setTimeout(() => {
        setSuccessToast(null);
      }, 3500);

      setEditingParent(null);
      loadData();
    } catch (err: any) {
      console.error('Error updating parent account:', err);
      alert(err.message || 'Error updating parent account');
    } finally {
      setIsSavingEdit(false);
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
          cleanForFirestore({ plainPassword: newPasswordVal.trim() }),
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

  const [selectedParentIds, setSelectedParentIds] = useState<string[]>([]);

  const handleDeleteClassParents = async () => {
    if (!filterClassId) {
      alert('Please select a class from the filter dropdown first.');
      return;
    }
    const cls = classes.find(c => c.id === filterClassId);
    const confirmed = window.confirm(
      `Are you sure you want to delete all parent accounts associated with students of "${cls?.name}"?`
    );
    if (!confirmed) return;

    try {
      setLoading(true);
      const res = await fetchWithAuth(`/api/parents/class/${filterClassId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete class parents');
      }
      const data = await res.json();
      await loadData();
      alert(`Successfully removed ${data.deletedCount || 0} parent accounts for ${cls?.name}.`);
    } catch (err: any) {
      alert(err.message || 'Error removing class parents');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkDeleteSelected = async () => {
    if (selectedParentIds.length === 0) {
      alert('No parent accounts selected for removal.');
      return;
    }
    const confirmed = window.confirm(
      `Are you sure you want to delete the ${selectedParentIds.length} selected parent accounts?`
    );
    if (!confirmed) return;

    try {
      setLoading(true);
      const res = await fetchWithAuth('/api/parents/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentIds: selectedParentIds }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete selected parents');
      }
      setSelectedParentIds([]);
      await loadData();
      alert('Selected parent accounts deleted successfully.');
    } catch (err: any) {
      alert(err.message || 'Error deleting parents');
    } finally {
      setLoading(false);
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

  const filteredParents = parents.filter(parent => {
    const linked = students.filter(s => s.parentUserId === parent.id);
    const matchesClass = filterClassId
      ? linked.some(s => s.classId === filterClassId)
      : true;
    const q = searchQuery.toLowerCase().trim();
    if (!q) return matchesClass;
    const matchesQuery =
      (parent.name && parent.name.toLowerCase().includes(q)) ||
      (parent.nameMl && parent.nameMl.toLowerCase().includes(q)) ||
      (parent.username && parent.username.toLowerCase().includes(q)) ||
      (parent.phone && parent.phone.toLowerCase().includes(q)) ||
      linked.some(
        s =>
          s.nameEn.toLowerCase().includes(q) ||
          (s.nameMl && s.nameMl.toLowerCase().includes(q)) ||
          s.admissionNo.toLowerCase().includes(q)
      );
    return matchesClass && matchesQuery;
  });

  return (
    <div className="space-y-6 relative">
      {/* Success Feedback Toast Notification */}
      {successToast && (
        <div className="fixed top-20 right-6 z-50 flex items-center gap-2 bg-emerald-800 text-white px-4 py-3 rounded-xl shadow-2xl border border-emerald-600 text-xs font-semibold">
          <Check className="w-4 h-4 text-emerald-300 shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{t.navParents} ({parents.length})</h2>
          <p className="text-xs text-slate-500">
            Multi-student sibling linking: once linked, parent login password is automatically set to the elder child's Admission Number.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setSyncClassId('');
              setSyncResult(null);
              setShowSyncModal(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-xl transition shadow-2xs cursor-pointer"
            title="Generate & sync automated parent credentials from student phone numbers"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
            Generate / Sync Parent Accounts
          </button>

          {filterClassId && (
            <button
              onClick={handleDeleteClassParents}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-300 rounded-xl transition cursor-pointer"
              title="Delete all parent accounts linked to this class"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-700" />
              Delete Class Parents
            </button>
          )}

          {selectedParentIds.length > 0 && (
            <button
              onClick={handleBulkDeleteSelected}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-rose-700 hover:bg-rose-800 rounded-xl transition shadow-xs cursor-pointer"
              title="Delete all checked parent accounts"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Selected ({selectedParentIds.length})
            </button>
          )}

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Create Parent Account
          </button>
        </div>
      </div>

      {/* Search and Class Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-600 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-slate-400" /> Filter by Class:
            </span>
            <select
              value={filterClassId}
              onChange={e => {
                setFilterClassId(e.target.value);
                setSelectedParentIds([]);
              }}
              className="p-2 border border-slate-300 rounded-lg bg-slate-50 text-xs font-medium focus:outline-none"
            >
              <option value="">All Classes</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>
                  {isMl ? c.nameMl : c.name}
                </option>
              ))}
            </select>
          </div>
          {filterClassId && (
            <button
              onClick={() => {
                setFilterClassId('');
                setSelectedParentIds([]);
              }}
              className="text-xs text-rose-600 hover:underline font-medium cursor-pointer"
            >
              Reset Filter
            </button>
          )}

          {filteredParents.length > 0 && (
            <button
              onClick={() => {
                if (selectedParentIds.length === filteredParents.length) {
                  setSelectedParentIds([]);
                } else {
                  setSelectedParentIds(filteredParents.map(p => p.id));
                }
              }}
              className="text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg border border-slate-300 transition cursor-pointer"
            >
              {selectedParentIds.length === filteredParents.length
                ? 'Deselect All'
                : `Select All (${filteredParents.length})`}
            </button>
          )}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by parent, phone, child, adm..."
            className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg bg-slate-50/50 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-700"
          />
        </div>
      </div>

      {filteredParents.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500">
          <Users className="w-10 h-10 mx-auto text-slate-400 mb-2" />
          <h3 className="font-bold text-slate-800 text-sm">
            {parents.length === 0 ? 'No Parent Accounts Added Yet' : 'No Parent Accounts Match Your Search'}
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            {parents.length === 0
              ? 'Click "Generate / Sync Parent Accounts" above to automatically create accounts from students\' phone numbers, or add them manually.'
              : 'Try clearing the search query or class filter to view other parent accounts.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredParents.map(parent => {
            const linkedStudents = students.filter(s => s.parentUserId === parent.id);
            const elderChild = getElderChild(linkedStudents);
            const isPasswordVisible = !!showPasswordMap[parent.id];
            const isSelected = selectedParentIds.includes(parent.id);

            return (
              <div
                key={parent.id}
                className={`bg-white rounded-2xl border p-5 shadow-xs space-y-4 flex flex-col justify-between hover:shadow-sm transition ${
                  isSelected ? 'border-emerald-600 ring-2 ring-emerald-500/20 bg-emerald-50/10' : 'border-slate-200'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedParentIds(prev => [...prev, parent.id]);
                          } else {
                            setSelectedParentIds(prev => prev.filter(id => id !== parent.id));
                          }
                        }}
                        className="rounded border-slate-300 text-emerald-800 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                      />
                      <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                        Parent Account
                      </span>
                    </label>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEdit(parent)}
                        className="p-1 text-slate-400 hover:text-emerald-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                        title="Edit Parent Name"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteParent(parent)}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                        title="Delete Parent Account"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Single Clean Line for Parent Name */}
                  <h3 className="font-bold text-slate-900 text-base mt-2 whitespace-nowrap overflow-hidden text-ellipsis">
                    {parent.name}
                  </h3>
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
                type="button"
                disabled={isSavingEdit}
                onClick={() => setEditingParent(null)}
                className="text-slate-400 hover:text-slate-600 disabled:opacity-50 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveParent} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Parent Name (English)</label>
                <input
                  type="text"
                  value={nameEn}
                  onChange={e => setNameEn(e.target.value)}
                  className="w-full p-2 border rounded-lg focus:outline-emerald-700"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Parent Name (Malayalam)</label>
                <input
                  type="text"
                  value={nameMl}
                  onChange={e => setNameMl(e.target.value)}
                  className="w-full p-2 border rounded-lg focus:outline-emerald-700"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Login Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full p-2 border rounded-lg font-mono focus:outline-emerald-700"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Phone Number</label>
                <input
                  type="text"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full p-2 border rounded-lg focus:outline-emerald-700"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  disabled={isSavingEdit}
                  onClick={() => setEditingParent(null)}
                  className="px-3.5 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="flex items-center gap-1.5 px-4 py-2 font-bold text-white bg-emerald-800 rounded-lg hover:bg-emerald-900 cursor-pointer disabled:opacity-50"
                >
                  {isSavingEdit ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
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

      {/* Generate / Sync Parent Accounts Modal */}
      {showSyncModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-4 sm:p-6 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto space-y-4 text-xs">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-emerald-800" />
                Generate / Sync Parent Accounts
              </h3>
              <button
                disabled={isSyncing}
                onClick={() => setShowSyncModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold disabled:opacity-40 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-slate-600 leading-relaxed">
                Automatically generate or update parent login accounts based on student phone and guardian records:
              </p>

              <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2 text-emerald-950">
                <div className="font-bold flex items-center gap-1.5 text-emerald-900">
                  <ShieldCheck className="w-4 h-4 text-emerald-800" />
                  Automated Credentials Rules:
                </div>
                <ul className="list-disc list-inside space-y-1 text-slate-700">
                  <li>
                    <strong>Username:</strong> Student's Parent Phone Number (e.g. <span className="font-mono font-semibold">9744096055</span>)
                  </li>
                  <li>
                    <strong>Password:</strong> <span className="font-mono font-semibold">Admn@</span> + Admission No (e.g. <span className="font-mono font-semibold">Admn@0984</span>)
                  </li>
                  <li>
                    <strong>Multi-Student Sibling Support:</strong> Siblings sharing the same phone number are automatically grouped under one parent account with all their progress report cards accessible!
                  </li>
                </ul>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Target Scope (All Students or Filter by Class):
                </label>
                <select
                  value={syncClassId}
                  onChange={e => setSyncClassId(e.target.value)}
                  disabled={isSyncing}
                  className="w-full p-2.5 border rounded-lg bg-slate-50 font-medium focus:outline-emerald-700"
                >
                  <option value="">All Students (Entire Madrasa)</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.nameMl})
                    </option>
                  ))}
                </select>
              </div>

              {syncResult && (
                <div className="p-3 bg-emerald-100/70 border border-emerald-300 rounded-xl text-emerald-900 space-y-1">
                  <div className="font-bold flex items-center gap-1">
                    <Check className="w-4 h-4 text-emerald-800" />
                    Parent Accounts Synced Successfully!
                  </div>
                  <p className="text-[11px]">
                    Created / updated <strong>{syncResult.syncedAccounts}</strong> parent accounts across <strong>{syncResult.totalStudentsProcessed}</strong> student records.
                  </p>
                  <p className="text-[11px] font-mono text-emerald-800">
                    Format: Username = Phone No, Password = Admn@&lt;AdmissionNo&gt;
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t">
              <button
                type="button"
                disabled={isSyncing}
                onClick={() => setShowSyncModal(false)}
                className="px-4 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-40 cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                disabled={isSyncing}
                onClick={handleGenerateSyncParentAccounts}
                className="flex items-center gap-2 px-4 py-2 font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {isSyncing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Generating & Syncing...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-emerald-200" />
                    <span>Confirm & Generate</span>
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
