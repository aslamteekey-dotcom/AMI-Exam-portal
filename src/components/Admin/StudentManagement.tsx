import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Student, ClassItem, sortStudentsBoysFirst, assignClassSequentialRollNumbers, recalculateClassRollsAndExamRegNos, normalizeGender, determineStudentGender } from '../../types';
import { db, handleFirestoreError, OperationType, safeOnSnapshot, isFirestoreQuotaExhausted } from '../../services/firebase';
import { firestoreSync, cleanForFirestore } from '../../services/firestoreSync';
import { handleHorizontalWheel } from '../../hooks/useHorizontalScroll';
import { collection, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { logAuditEvent } from '../../services/auditLogger';
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
  Calendar,
  GraduationCap,
} from 'lucide-react';

export const StudentManagement: React.FC = () => {
  const { fetchWithAuth, user, lang, t } = useAuth();
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Add / Edit Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [activeExamId, setActiveExamId] = useState<string>('exam_half_yearly_2026_27');
  const [formData, setFormData] = useState({
    admissionNo: '',
    rollNo: '',
    nameEn: '',
    nameMl: '',
    classId: '',
    parentNameEn: '',
    parentPhone: '',
    gender: 'Boy' as 'Boy' | 'Girl',
    dob: '',
    schoolClass: '',
    examRegNo: '',
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
      const [resCls, resStd, resSettings] = await Promise.all([
        fetchWithAuth('/api/classes'),
        fetchWithAuth('/api/students'),
        fetchWithAuth('/api/settings').catch(() => null),
      ]);
      const clsData = await resCls.json();
      const stdData: Student[] = await resStd.json();
      if (resSettings && resSettings.ok) {
        const sData = await resSettings.json().catch(() => null);
        if (sData?.activeExamId) setActiveExamId(sData.activeExamId);
      }
      setClasses(clsData);
      const filtered = (stdData || [])
        .filter(st => {
          if (!st) return false;
          const hasName = Boolean(String(st.nameEn || (st as any).name || '').trim());
          const hasAdm = Boolean(String(st.admissionNo || '').trim());
          if (!hasName || !hasAdm) return false;
          return (
            st.id !== 'st_501' &&
            st.id !== 'st_301' &&
            st.id !== 'st_903' &&
            st.admissionNo !== '5001' &&
            st.admissionNo !== '3001' &&
            st.admissionNo !== '9003' &&
            st.nameEn !== 'Ahmed Nihal' &&
            st.nameEn !== 'Adil Mansoor' &&
            st.nameEn !== 'Adil Ibrahim'
          );
        })
        .map(st => {
          const regNos = (st as any).examRegisterNos || st.examRegisterNumbers || {};
          const currentReg = String(
            st.examRegNo ||
            (st as any).regNo ||
            regNos[activeExamId] ||
            Object.values(regNos)[0] ||
            ''
          ).trim();
          return {
            ...st,
            gender: determineStudentGender(st, activeExamId),
            examRegNo: currentReg,
            regNo: currentReg,
            isRegNoLocked: Boolean((st as any).isRegNoLocked || currentReg),
          };
        });
      setStudents(assignClassSequentialRollNumbers(filtered, activeExamId));
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

    if (isFirestoreQuotaExhausted()) return;

    // Real-time listener for Firestore 'students' collection
    let unsub: (() => void) | undefined;
    try {
      unsub = safeOnSnapshot(
        collection(db, 'students'),
        async (snapshot) => {
          if (!snapshot.empty) {
            const rogueIds = ['st_501', 'st_301', 'st_903'];
            const rogueAdms = ['5001', '3001', '9003'];
            const rogueNames = ['Ahmed Nihal', 'Adil Mansoor', 'Adil Ibrahim'];

            // One-time Firestore Auto-Cleanup: Detect and purge any corrupt ghost documents (missing name or admissionNo)
            const corruptDocs = snapshot.docs.filter(d => {
              const data = d.data() as any;
              const hasName = Boolean(String(data?.nameEn || data?.name || '').trim());
              const hasAdm = Boolean(String(data?.admissionNo || '').trim());
              const adm = String(data?.admissionNo || '').trim();
              const name = String(data?.nameEn || data?.name || '').trim();
              return (
                !hasName ||
                !hasAdm ||
                rogueIds.includes(d.id) ||
                rogueAdms.includes(adm) ||
                rogueNames.includes(name)
              );
            });

            if (corruptDocs.length > 0) {
              console.info(`[Auto-Cleanup] Purging ${corruptDocs.length} corrupt ghost student documents from Firestore...`);
              corruptDocs.forEach(d => {
                deleteDoc(doc(db, 'students', d.id)).catch(e => {
                  console.warn(`[Auto-Cleanup] Error deleting corrupt doc ${d.id}:`, e);
                });
              });
            }

            const validStudents = snapshot.docs
              .filter(d => {
                const data = d.data() as any;
                const hasName = Boolean(String(data?.nameEn || data?.name || '').trim());
                const hasAdm = Boolean(String(data?.admissionNo || '').trim());
                if (!hasName || !hasAdm) return false;
                const adm = String(data?.admissionNo || '').trim();
                const name = String(data?.nameEn || data?.name || '').trim();
                return !rogueIds.includes(d.id) && !rogueAdms.includes(adm) && !rogueNames.includes(name);
              })
              .map((d) => {
                const data = d.data() as any;
                const determinedGen = determineStudentGender(data, activeExamId);
                const regNos: Record<string, string> = {
                  ...(data.examRegisterNumbers || {}),
                  ...(data.examRegisterNos || {}),
                };
                Object.keys(data).forEach(key => {
                  if (key.startsWith('examRegisterNumbers.') || key.startsWith('examRegisterNos.')) {
                    const examId = key.substring(key.indexOf('.') + 1);
                    if (examId && data[key]) {
                      regNos[examId] = String(data[key]).trim();
                    }
                  }
                });
                const currentReg = String(
                  data.examRegNo ||
                  data.regNo ||
                  regNos[activeExamId] ||
                  Object.values(regNos)[0] ||
                  ''
                ).trim();
                if (currentReg && !regNos[activeExamId]) {
                  regNos[activeExamId] = currentReg;
                }
                // Permanent Firestore sync: if raw doc had legacy 'M' / 'F' / 'Boy' (for female) or un-normalized, update in Firestore
                if (data.gender !== determinedGen) {
                  updateDoc(doc(db, 'students', d.id), { gender: determinedGen }).catch(() => {});
                  if (data.admissionNo && data.admissionNo !== d.id) {
                    updateDoc(doc(db, 'students', String(data.admissionNo).trim()), { gender: determinedGen }).catch(() => {});
                  }
                }
                return {
                  ...data,
                  id: d.id,
                  gender: determinedGen,
                  examRegisterNumbers: regNos,
                  examRegisterNos: regNos,
                  examRegNo: currentReg,
                  regNo: currentReg,
                  isRegNoLocked: Boolean(data.isRegNoLocked || currentReg),
                } as Student;
              });

            // Resequence roll numbers strictly for valid students
            const resequenced = assignClassSequentialRollNumbers<Student>(validStudents, activeExamId);
            setStudents(resequenced);

            // Synchronize with other tabs and Dashboard overview
            window.dispatchEvent(new CustomEvent('madrasa_students_updated', { detail: resequenced }));
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
      gender: 'Boy',
      dob: '',
      schoolClass: '',
      examRegNo: '',
    });
    setShowAddModal(true);
  };

  const handleOpenEdit = (student: Student) => {
    setEditingStudent(student);
    const existingRegNo =
      (student as any).examRegisterNos?.[activeExamId] ||
      student.examRegNo ||
      (student as any).regNo ||
      student.examRegisterNumbers?.[activeExamId] ||
      Object.values((student as any).examRegisterNos || {})[0] ||
      Object.values(student.examRegisterNumbers || {})[0] ||
      '';

    setFormData({
      admissionNo: student.admissionNo,
      rollNo: String(student.rollNo),
      nameEn: student.nameEn,
      nameMl: student.nameMl || '',
      classId: student.classId,
      parentNameEn: student.parentNameEn || '',
      parentPhone: student.parentPhone || '',
      gender: determineStudentGender(student, activeExamId),
      dob: student.dob || '',
      schoolClass: student.schoolClass || '',
      examRegNo: String(existingRegNo || ''),
    });
    setShowAddModal(true);
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const trimmedAdmission = (formData.admissionNo || '').trim().replace(/\s+/g, ' ');
      const trimmedNameEn = (formData.nameEn || '').trim().replace(/\s+/g, ' ');
      if (!trimmedAdmission) {
        alert('Admission Number is required.');
        return;
      }
      if (!trimmedNameEn) {
        alert('Student English Name is required.');
        return;
      }

      // Strict uniqueness check against existing students in the system
      const conflict = students.find(s => {
        if (editingStudent && (s.id === editingStudent.id || s.admissionNo === editingStudent.admissionNo)) {
          return false;
        }
        return (s.admissionNo?.toString() || '').trim().toLowerCase() === trimmedAdmission.toLowerCase();
      });

      if (conflict) {
        alert(`Admission Number [${trimmedAdmission}] already exists! Please use a unique Admission Number.`);
        return;
      }

      const trimmedExamReg = (formData.examRegNo || '').trim().replace(/\s+/g, ' ');
      const targetExamKey = activeExamId || 'exam_half_yearly_2026_27';

      if (editingStudent) {
        const updatedExamRegNos = {
          ...((editingStudent as any).examRegisterNos || {}),
          ...(editingStudent.examRegisterNumbers || {}),
          [targetExamKey]: trimmedExamReg,
        };
        if (trimmedExamReg) {
          Object.keys(updatedExamRegNos).forEach(k => {
            updatedExamRegNos[k] = trimmedExamReg;
          });
        }

        const updateData: Partial<Student> & Record<string, any> = {
          admissionNo: trimmedAdmission,
          rollNo: Number(formData.rollNo) || editingStudent.rollNo,
          nameEn: trimmedNameEn,
          nameMl: formData.nameMl.trim().replace(/\s+/g, ' ') || trimmedNameEn,
          classId: formData.classId,
          parentNameEn: (formData.parentNameEn || '').trim().replace(/\s+/g, ' '),
          parentPhone: (formData.parentPhone || '').trim(),
          gender: normalizeGender(formData.gender),
          dob: formData.dob.trim() || undefined,
          schoolClass: formData.schoolClass.trim() || undefined,
          examRegNo: trimmedExamReg,
          regNo: trimmedExamReg,
          examRegisterNos: updatedExamRegNos,
          examRegisterNumbers: updatedExamRegNos,
          isRegNoLocked: true,
          updatedAt: new Date().toISOString(),
        };

        // 1. Persist to ALL storage locations:
        // - Firestore students/{id} and students/{admissionNo}
        // - Firestore examinations/{targetExamKey} and exams/{targetExamKey}
        // - Firestore settings
        // - Immediate localStorage cache
        await firestoreSync.persistStudentExamRegisterNumber(
          editingStudent.id,
          editingStudent.admissionNo,
          targetExamKey,
          trimmedExamReg,
          updateData
        );

        // Direct in-memory mutation
        Object.assign(editingStudent, updateData);

        // 2. Re-sequence class roll numbers strictly (Boys A-Z first: 1, 2, 3..., then Girls A-Z)
        // NEVER auto-recalculate or overwrite existing exam register numbers!
        const targetClassId = formData.classId;
        const currentClassStudents = students
          .filter(s => s.classId === targetClassId && s.id !== editingStudent.id && s.admissionNo !== editingStudent.admissionNo)
          .concat([{ ...editingStudent, ...updateData } as Student]);

        const resequencedClass = assignClassSequentialRollNumbers(currentClassStudents, targetExamKey);

        // Retain explicitly edited examRegNo for the edited student
        const finalResequencedClass = resequencedClass.map(st => {
          if (st.id === editingStudent.id || (editingStudent.admissionNo && st.admissionNo === editingStudent.admissionNo)) {
            return {
              ...st,
              ...updateData,
              examRegNo: trimmedExamReg,
              regNo: trimmedExamReg,
              examRegisterNos: updatedExamRegNos,
              examRegisterNumbers: updatedExamRegNos,
              isRegNoLocked: true,
              updatedAt: new Date().toISOString(),
            };
          }
          return st;
        });

        // Update any other class students whose roll numbers shifted in Firestore
        for (const st of finalResequencedClass) {
          if (st.id !== editingStudent.id && st.admissionNo !== editingStudent.admissionNo) {
            try {
              await setDoc(doc(db, 'students', st.id), cleanForFirestore(st), { merge: true });
              if (st.admissionNo && st.admissionNo !== st.id) {
                await setDoc(doc(db, 'students', st.admissionNo), cleanForFirestore(st), { merge: true }).catch(() => {});
              }
            } catch (e) {
              console.warn('Firestore roll resequencing sync error:', e);
            }
          }
        }

        const resequencedMap = new Map(finalResequencedClass.map(s => [s.id, s]));

        // Immediately update React state so the card / directory updates instantly without requiring a page reload
        const updatedAll = students.map(s => {
          if (s.id === editingStudent.id || (editingStudent.admissionNo && s.admissionNo === editingStudent.admissionNo)) {
            return {
              ...s,
              ...updateData,
              examRegNo: trimmedExamReg,
              regNo: trimmedExamReg,
              examRegisterNos: updatedExamRegNos,
              examRegisterNumbers: updatedExamRegNos,
              isRegNoLocked: true,
            };
          }
          if (resequencedMap.has(s.id)) {
            return resequencedMap.get(s.id)!;
          }
          return s;
        });
        setStudents(updatedAll);

        const res = await fetchWithAuth(`/api/students/${editingStudent.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to update student');
        }

        // Broadcast updates for real-time reflection across other tabs (marks entry, parent portal, etc.)
        window.dispatchEvent(new CustomEvent('madrasa_students_updated', { detail: updatedAll }));
        window.dispatchEvent(new CustomEvent('madrasa_marks_updated'));

        logAuditEvent({
          action: 'STUDENT_UPDATED',
          details: `User ${user?.name || 'Administrator'} updated student ${editingStudent.nameEn} (Adm: ${editingStudent.admissionNo}, Gender: ${formData.gender}, RegNo: ${trimmedExamReg || 'N/A'}, Class: ${formData.classId}).`,
          currentUser: user,
          recordType: 'student',
          recordId: editingStudent.id,
        }).catch(e => console.warn('Audit log error:', e));
      } else {
        const studentId = trimmedAdmission;
        const updatedExamRegNos = trimmedExamReg ? { [targetExamKey]: trimmedExamReg } : undefined;
        const newStudentData: Student = {
          id: studentId,
          admissionNo: studentId,
          rollNo: Number(formData.rollNo) || 1,
          nameEn: trimmedNameEn,
          nameMl: formData.nameMl.trim().replace(/\s+/g, ' ') || trimmedNameEn,
          classId: formData.classId,
          academicYearId: 'ay_2026_2027',
          parentNameEn: (formData.parentNameEn || '').trim().replace(/\s+/g, ' '),
          parentNameMl: formData.nameMl.trim().replace(/\s+/g, ' ') || (formData.parentNameEn || '').trim().replace(/\s+/g, ' '),
          parentPhone: (formData.parentPhone || '').trim(),
          status: 'active',
          gender: normalizeGender(formData.gender),
          dob: formData.dob.trim() || undefined,
          schoolClass: formData.schoolClass.trim() || undefined,
          examRegNo: trimmedExamReg,
          regNo: trimmedExamReg,
          examRegisterNumbers: updatedExamRegNos,
          examRegisterNos: updatedExamRegNos,
          isRegNoLocked: Boolean(trimmedExamReg),
        };

        // 1. Persistent Firestore write
        try {
          await setDoc(doc(db, 'students', studentId), cleanForFirestore(newStudentData), { merge: true });
          if (trimmedExamReg) {
            await firestoreSync.persistStudentExamRegisterNumber(
              studentId,
              studentId,
              targetExamKey,
              trimmedExamReg,
              newStudentData
            );
          }
        } catch (firestoreErr: any) {
          console.error('Firestore write error when adding student:', firestoreErr);
          handleFirestoreError(firestoreErr, OperationType.WRITE, `students/${studentId}`);
          alert(`Firestore error: ${firestoreErr.message || 'Failed to save student to cloud database'}`);
          return;
        }

        // 2. Sequential roll numbers for this class (Boys A-Z first, then Girls A-Z)
        const targetClassId = formData.classId;
        const currentClassStudents = students
          .filter(s => s.classId === targetClassId)
          .concat([newStudentData]);

        const resequencedClass = assignClassSequentialRollNumbers(currentClassStudents, targetExamKey);

        for (const st of resequencedClass) {
          try {
            await setDoc(doc(db, 'students', st.id), cleanForFirestore(st), { merge: true });
            if (st.admissionNo && st.admissionNo !== st.id) {
              await setDoc(doc(db, 'students', st.admissionNo), cleanForFirestore(st), { merge: true }).catch(() => {});
            }
          } catch (e) {
            console.warn('Firestore resequencing sync error:', e);
          }
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

        logAuditEvent({
          action: 'STUDENT_CREATED',
          details: `User ${user?.name || 'Administrator'} registered new student ${newStudentData.nameEn} (Adm: ${newStudentData.admissionNo}, Gender: ${newStudentData.gender}, Class: ${formData.classId}).`,
          currentUser: user,
          recordType: 'student',
          recordId: studentId,
        }).catch(e => console.warn('Audit log error:', e));
      }

      setShowAddModal(false);
      await loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleResolveDuplicate = async (student: Student) => {
    const confirm = window.confirm(
      `Resolve duplicate: Remove redundant entry for "${student.nameEn}" (Doc ID: ${student.id}, Adm: ${student.admissionNo}) and keep the canonical record?`
    );
    if (!confirm) return;

    try {
      // 1. Immediately delete this specific document from local state
      setStudents(prev => prev.filter(s => s.id !== student.id));

      // 2. Delete from Firestore directly for this specific document ID
      try {
        await deleteDoc(doc(db, 'students', student.id));
      } catch (firestoreErr: any) {
        console.warn('Firestore duplicate student delete error:', firestoreErr);
      }

      // 3. Delete from backend/storage API with onlyThisDoc flag
      await fetchWithAuth(
        `/api/students/${student.id}?admissionNo=${encodeURIComponent(student.admissionNo || '')}&onlyThisDoc=true`,
        { method: 'DELETE' }
      );

      logAuditEvent({
        action: 'STUDENT_DELETED',
        details: `User ${user?.name || 'Administrator'} resolved duplicate record by removing redundant student entry ${student.nameEn} (ID: ${student.id}, Adm: ${student.admissionNo}).`,
        currentUser: user,
        recordType: 'student',
        recordId: student.id,
      }).catch(e => console.warn('Audit log error:', e));

      await loadData();
    } catch (err: any) {
      alert('Failed to resolve duplicate: ' + (err.message || 'Unknown error'));
      loadData();
    }
  };

  const handleDeleteStudent = async (student: Student) => {
    const confirm = window.confirm(
      `Are you sure you want to delete student "${student.nameEn}" (${student.admissionNo})?`
    );
    if (!confirm) return;

    try {
      // 1. Immediately delete from local state
      setStudents(prev =>
        prev.filter(s => s.id !== student.id && (!student.admissionNo || s.admissionNo !== student.admissionNo))
      );

      // 2. Delete from Firestore directly for document ID and also any duplicate documents with same admissionNo
      try {
        await deleteDoc(doc(db, 'students', student.id));
        if (student.admissionNo && student.admissionNo !== student.id) {
          await deleteDoc(doc(db, 'students', student.admissionNo)).catch(() => {});
        }
      } catch (firestoreErr: any) {
        console.warn('Firestore student delete error:', firestoreErr);
      }

      await firestoreSync.deleteStudent(student.id, student.admissionNo);

      // 3. Delete from backend/storage API
      const res = await fetchWithAuth(
        `/api/students/${student.id}?admissionNo=${encodeURIComponent(student.admissionNo || '')}`,
        {
          method: 'DELETE',
        }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete student');
      }

      logAuditEvent({
        action: 'STUDENT_DELETED',
        details: `User ${user?.name || 'Administrator'} deleted student ${student.nameEn} (Adm: ${student.admissionNo}).`,
        currentUser: user,
        recordType: 'student',
        recordId: student.id,
      }).catch(e => console.warn('Audit log error:', e));

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
      logAuditEvent({
        action: 'STUDENT_DELETED',
        details: `User ${user?.name || 'Administrator'} permanently deleted all student records.`,
        currentUser: user,
        recordType: 'student',
      }).catch(e => console.warn('Audit log error:', e));
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
      logAuditEvent({
        action: 'STUDENT_DELETED',
        details: `User ${user?.name || 'Administrator'} deleted all students of Class ${className} (${toDelete.length} students).`,
        currentUser: user,
        recordType: 'student',
        recordId: deleteClassId,
      }).catch(e => console.warn('Audit log error:', e));
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
      logAuditEvent({
        action: 'STUDENT_DELETED',
        details: `User ${user?.name || 'Administrator'} cleared demo students.`,
        currentUser: user,
        recordType: 'student',
      }).catch(e => console.warn('Audit log error:', e));
      alert('Demo students cleared successfully.');
    } catch (err: any) {
      alert(err.message || 'Error clearing demo students');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadSampleCsv = () => {
    const sample = `Admission No, Name, Class, Gender, Parent Name, Phone
ADM-2026-001, Muhammed Bilal, Class 1, Boy, Shamsudheen, 9447123456
ADM-2026-002, Fathima Zahra, Class 2, Girl, Abdul Kareem, 9447654321
ADM-2026-003, Rayan Ahmed, Class 5, Boy, Moideen Kutty, 9846112233
ADM-2026-004, Ayisha Maryam, Class 3, Girl, Hamza Haji, 9745112233`;
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
                gender: normalizeGender(student.gender),
                status: 'active',
              });

              await setDoc(doc(db, 'students', String(student.admissionNo).trim()), studentData, { merge: true });
            }
          }
        }
      } catch (fErr) {
        console.warn('Firestore bulk import write warning:', fErr);
      }

      logAuditEvent({
        action: 'STUDENT_CREATED',
        details: `User ${user?.name || 'Administrator'} imported ${data.importedCount} student records across classes via CSV.`,
        currentUser: user,
        recordType: 'student',
      }).catch(e => console.warn('Audit log error:', e));

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
        return `"${s.admissionNo}","${s.nameEn}","${cName}","${normalizeGender(s.gender)}","${s.parentNameEn || ''}","${s.parentPhone || ''}"`;
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

  // Admission number frequency calculation to detect duplicates in real-time
  const admFrequency = useMemo(() => {
    const counts = new Map<string, number>();
    students.forEach(s => {
      const adm = (s.admissionNo?.toString() || '').trim().toLowerCase();
      if (adm) {
        counts.set(adm, (counts.get(adm) || 0) + 1);
      }
    });
    return counts;
  }, [students]);

  const duplicateAdmissionsList = useMemo(() => {
    const list: string[] = [];
    admFrequency.forEach((cnt, adm) => {
      if (cnt > 1) list.push(adm);
    });
    return list;
  }, [admFrequency]);

  // Immediate validation check for Add / Edit Student modal
  const trimmedAdmissionNo = (formData.admissionNo || '').trim();
  const duplicateAdmissionConflict = useMemo(() => {
    if (!trimmedAdmissionNo) return null;
    return students.find(s => {
      if (editingStudent && (s.id === editingStudent.id || s.admissionNo === editingStudent.admissionNo)) {
        return false;
      }
      return (s.admissionNo?.toString() || '').trim().toLowerCase() === trimmedAdmissionNo.toLowerCase();
    });
  }, [trimmedAdmissionNo, students, editingStudent]);

  const isAdmissionNumberDuplicate = Boolean(duplicateAdmissionConflict);

  // Filter students with strict sorting: Boys first, then Girls; alphabetical A to Z within each
  const classStudents = students.filter(student => {
    // Exclude any ghost / corrupted record lacking name or admission number
    const hasName = Boolean(String(student.nameEn || (student as any).name || '').trim());
    const hasAdm = Boolean(String(student.admissionNo?.toString() || '').trim());
    if (!hasName || !hasAdm) return false;

    const matchClass = selectedClassId ? student.classId === selectedClassId : true;
    const q = (searchQuery || '').toLowerCase().trim();
    if (!q) return matchClass;

    const studentName = (student.nameEn || (student as any).name || '').toLowerCase();
    const malayalamName = (student.nameMl || '').toLowerCase();
    const admissionNo = (student.admissionNo?.toString() || '').toLowerCase();
    const parentName = ((student.parentNameEn || (student as any).parentName || (student as any).guardianName || '').toString()).toLowerCase();
    const gender = (student.gender || '').toLowerCase();
    const schoolClass = (student.schoolClass || (student as any).class || '').toLowerCase();
    const rollNo = String(student.rollNo || '');

    const matchSearch =
      studentName.includes(q) ||
      malayalamName.includes(q) ||
      admissionNo.includes(q) ||
      parentName.includes(q) ||
      gender.includes(q) ||
      schoolClass.includes(q) ||
      rollNo.includes(q);
    return matchClass && matchSearch;
  });

  const sortedStudents = sortStudentsBoysFirst(classStudents, activeExamId);
  const filteredStudents = sortedStudents.map((s, idx) => ({
    ...s,
    gender: determineStudentGender(s, activeExamId),
    rollNo: idx + 1,
  }));

  const boysCount = filteredStudents.filter(s => determineStudentGender(s, activeExamId) === 'Boy').length;
  const girlsCount = filteredStudents.filter(s => determineStudentGender(s, activeExamId) === 'Girl').length;

  return (
    <div className="space-y-6">
      {/* Header and Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            {t.navStudents} ({filteredStudents.length} Students: {boysCount} Boys, {girlsCount} Girls)
          </h2>
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

      {/* Duplicate Admission Number Alert Banner */}
      {duplicateAdmissionsList.length > 0 && (
        <div className="bg-red-50 border border-red-300 rounded-2xl p-4 text-xs text-red-900 flex items-start justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-sm text-red-800">
                Duplicate Admission Numbers Detected ({duplicateAdmissionsList.length})
              </p>
              <p className="mt-0.5 text-red-700">
                The following admission number(s) appear on multiple student records:{' '}
                <span className="font-mono font-bold bg-red-100 text-red-800 px-1.5 py-0.5 rounded border border-red-300">
                  {duplicateAdmissionsList.join(', ')}
                </span>
                . Duplicate rows are highlighted in red below. Use the <strong>Resolve / Delete</strong> button on any duplicate row to delete the redundant record.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Students Table strictly aligned with CSV: Admission No | Name | Class | Gender | Parent Name | Phone | Actions */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden w-full">
        <div
          onWheel={handleHorizontalWheel}
          className="overflow-x-auto w-full scrollbar-thin relative"
        >
          <table className="w-full min-w-[760px] text-xs text-left border-collapse">
            <thead className="sticky top-0 bg-slate-100 text-slate-700 font-bold border-b z-30">
              <tr>
                <th className="p-3 text-center w-12 font-mono whitespace-nowrap sticky left-0 bg-slate-100 z-40 shadow-[1px_0_0_0_#e5e7eb]">Roll No</th>
                <th className="p-3 whitespace-nowrap sticky left-12 bg-slate-100 z-40 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] min-w-[180px] md:min-w-[220px]">Name</th>
                <th className="p-3 font-mono text-center w-20 whitespace-nowrap">Adm No</th>
                <th className="p-3 whitespace-nowrap">Class</th>
                <th className="p-3 text-center whitespace-nowrap">Gender</th>
                <th className="p-3 whitespace-nowrap">Parent Name</th>
                <th className="p-3 whitespace-nowrap">Phone</th>
                <th className="p-3 text-center w-28 whitespace-nowrap">Actions</th>
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
                  const isDuplicate =
                    (admFrequency.get((student.admissionNo?.toString() || '').trim().toLowerCase()) || 0) > 1;

                  return (
                    <tr
                      key={student.id}
                      className={
                        isDuplicate
                          ? 'bg-red-50/90 border-l-4 border-red-500 hover:bg-red-100/70 transition group'
                          : 'hover:bg-slate-50 transition group'
                      }
                    >
                      <td
                        className={`p-3 text-center font-mono font-bold text-slate-700 whitespace-nowrap w-12 sticky left-0 z-20 shadow-[1px_0_0_0_#e5e7eb] ${
                          isDuplicate ? 'bg-red-50 group-hover:bg-red-100' : 'bg-white group-hover:bg-slate-50'
                        }`}
                      >
                        {student.rollNo}
                      </td>
                      <td
                        className={`p-3 min-w-[180px] md:min-w-[220px] whitespace-nowrap sticky left-12 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${
                          isDuplicate ? 'bg-red-50 group-hover:bg-red-100' : 'bg-white group-hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-slate-900">{student.nameEn || (student as any).name || '—'}</span>
                          {(() => {
                            const regNo =
                              (student as any).examRegisterNos?.[activeExamId] ||
                              student.examRegNo ||
                              (student as any).regNo ||
                              (student as any).examRegisterNumbers?.[activeExamId] ||
                              '-';
                            if (regNo && regNo !== '-') {
                              return (
                                <span className="px-1.5 py-0.5 rounded text-[9.5px] font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200" title="Exam Register Number">
                                  Reg: {regNo}
                                </span>
                              );
                            }
                            return null;
                          })()}
                          {student.schoolClass && (
                            <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200" title="Regular School Grade">
                              {student.schoolClass}
                            </span>
                          )}
                          {student.dob && (
                            <span className="text-[10px] text-slate-500 font-mono" title="Date of Birth">
                              🎂 {student.dob}
                            </span>
                          )}
                          {isDuplicate && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-300 shadow-2xs">
                              ⚠️ Duplicate Adm No
                            </span>
                          )}
                        </div>
                        {student.nameMl && (
                          <span className="text-[11px] text-slate-500 font-ml block leading-tight">
                            {student.nameMl}
                          </span>
                        )}
                      </td>
                      <td className="p-3 font-mono font-semibold whitespace-nowrap w-20 text-center">
                        <span
                          className={
                            isDuplicate
                              ? 'px-2 py-0.5 rounded-md bg-red-100 text-red-800 font-bold border border-red-300 inline-block shadow-2xs'
                              : 'text-slate-700'
                          }
                        >
                          {student.admissionNo}
                        </span>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <span
                          className={`bg-emerald-50 text-emerald-900 border border-emerald-200 px-2 py-0.5 rounded-md font-semibold ${
                            isMl ? 'font-ml' : ''
                          }`}
                        >
                          {isMl ? cls?.nameMl : cls?.name}
                        </span>
                      </td>
                      <td className="p-3 text-center whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            determineStudentGender(student, activeExamId) === 'Girl'
                              ? 'bg-pink-100 text-pink-800 border border-pink-200'
                              : 'bg-blue-100 text-blue-800 border border-blue-200'
                          }`}
                        >
                          {determineStudentGender(student, activeExamId)}
                        </span>
                      </td>
                      <td className="p-3 min-w-[140px] whitespace-nowrap">
                        <span className="font-medium text-slate-800 block">
                          {student.parentNameEn || '—'}
                        </span>
                        {student.parentNameMl && (
                          <span className="text-[11px] text-slate-500 font-ml block leading-tight">
                            {student.parentNameMl}
                          </span>
                        )}
                      </td>
                      <td className="p-3 font-mono text-slate-600 whitespace-nowrap">
                        {student.parentPhone || '—'}
                      </td>
                      <td className="p-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          {isDuplicate && (
                            <button
                              onClick={() => handleResolveDuplicate(student)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-2xs transition cursor-pointer mr-1"
                              title="Resolve duplicate entry: Permanently removes this redundant student record"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Resolve / Delete</span>
                            </button>
                          )}
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{t.admissionNo} *</label>
                  <input
                    type="text"
                    value={formData.admissionNo}
                    onChange={e => setFormData({ ...formData, admissionNo: e.target.value })}
                    className={`w-full p-2 border rounded-lg font-mono focus:outline-none focus:ring-2 ${
                      isAdmissionNumberDuplicate
                        ? 'border-red-500 bg-red-50 text-red-900 focus:ring-red-400'
                        : 'border-slate-300 focus:ring-emerald-700'
                    }`}
                    required
                  />
                  {isAdmissionNumberDuplicate && (
                    <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-red-600">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      Admission Number [{trimmedAdmissionNo}] already exists! Please use a unique Admission Number.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{t.rollNo}</label>
                  <input
                    type="number"
                    value={formData.rollNo}
                    onChange={e => setFormData({ ...formData, rollNo: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-emerald-700"
                    required
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Auto-sequenced: Boys A-Z, Girls A-Z.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Exam Register Number
                  </label>
                  <input
                    type="text"
                    name="examRegNo"
                    value={formData.examRegNo || ''}
                    onChange={e => setFormData({ ...formData, examRegNo: e.target.value })}
                    placeholder="e.g. 7101"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-700 focus:outline-none font-mono bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Student Name (English) *</label>
                <input
                  type="text"
                  value={formData.nameEn}
                  onChange={e => setFormData({ ...formData, nameEn: e.target.value })}
                  placeholder="e.g. Ahmad Rayan"
                  className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
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
                  className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{t.class} (Madrasa) *</label>
                  <select
                    value={formData.classId}
                    onChange={e => setFormData({ ...formData, classId: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-700 font-medium"
                    required
                  >
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>
                        {isMl ? c.nameMl : c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Gender *</label>
                  <select
                    value={normalizeGender(formData.gender)}
                    onChange={e => setFormData({ ...formData, gender: normalizeGender(e.target.value) })}
                    className="w-full p-2 border border-slate-300 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-700 font-medium"
                  >
                    <option value="Boy">Boy</option>
                    <option value="Girl">Girl</option>
                  </select>
                </div>
              </div>

              {/* Date of Birth & Regular School Class */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Date of Birth (DOB)</label>
                  <input
                    type="date"
                    name="dob"
                    value={formData.dob}
                    onChange={e => setFormData({ ...formData, dob: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700 bg-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">School Class / Regular Grade</label>
                  <select
                    value={formData.schoolClass}
                    onChange={e => setFormData({ ...formData, schoolClass: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-700 font-medium"
                  >
                    <option value="">Select Regular School Grade</option>
                    <option value="Pre-Primary / KG">Pre-Primary / KG</option>
                    <option value="Class 1">Class 1</option>
                    <option value="Class 2">Class 2</option>
                    <option value="Class 3">Class 3</option>
                    <option value="Class 4">Class 4</option>
                    <option value="Class 5">Class 5</option>
                    <option value="Class 6">Class 6</option>
                    <option value="Class 7">Class 7</option>
                    <option value="Class 8">Class 8</option>
                    <option value="Class 9">Class 9</option>
                    <option value="Class 10">Class 10</option>
                    <option value="Plus One (+1)">Plus One (+1)</option>
                    <option value="Plus Two (+2)">Plus Two (+2)</option>
                    <option value="College / Degree">College / Degree</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Parent Name</label>
                  <input
                    type="text"
                    value={formData.parentNameEn}
                    onChange={e => setFormData({ ...formData, parentNameEn: e.target.value })}
                    placeholder="e.g. Shamsudheen P."
                    className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Parent Phone</label>
                  <input
                    type="text"
                    value={formData.parentPhone}
                    onChange={e => setFormData({ ...formData, parentPhone: e.target.value })}
                    placeholder="+91 9845..."
                    className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3.5 py-2 text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAdmissionNumberDuplicate}
                  className="px-4 py-2 font-bold text-white bg-emerald-800 rounded-lg hover:bg-emerald-900 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-xs"
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
                        <th className="p-2 whitespace-nowrap text-center">Adm No</th>
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
                          <td className="p-2 font-bold">{normalizeGender(r.gender)}</td>
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
