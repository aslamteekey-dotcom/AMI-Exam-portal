import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, isFirestoreQuotaExhausted, markFirestoreQuotaExhausted, isQuotaError } from './firebase';
import { Student, User, ClassItem, SubjectItem, MarkSheet, Examination, FeePayment, ClassAttendanceConfig, InstitutionHoliday, SpecialWorkingDay, AuditLog, InstitutionSettings, assignClassSequentialRollNumbers } from '../types';

/**
 * Removes undefined fields from objects before saving to Firestore,
 * preventing 'Function setDoc() called with invalid data. Unsupported field value: undefined' errors.
 */
export function cleanForFirestore<T>(data: T): T {
  if (data === null || data === undefined) return data;
  if (Array.isArray(data)) {
    return data.map(item => cleanForFirestore(item)) as unknown as T;
  }
  if (typeof data === 'object' && !(data instanceof Date)) {
    const res: Record<string, any> = {};
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined) {
        res[key] = cleanForFirestore(val);
      }
    }
    return res as T;
  }
  return data;
}

export class FirestoreSyncService {
  private static instance: FirestoreSyncService;
  private unsubscribers: Unsubscribe[] = [];
  private isOnline = navigator.onLine;

  private constructor() {
    window.addEventListener('online', () => {
      this.isOnline = true;
    });
    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  public static getInstance(): FirestoreSyncService {
    if (!FirestoreSyncService.instance) {
      FirestoreSyncService.instance = new FirestoreSyncService();
    }
    return FirestoreSyncService.instance;
  }

  private handleSnapshotError(err: unknown, collectionName: string): void {
    if (isQuotaError(err)) {
      markFirestoreQuotaExhausted();
      this.stopSubscriptions();
    } else {
      handleFirestoreError(err, OperationType.GET, collectionName);
    }
  }

  private handleWriteError(err: unknown, op: OperationType, path: string): void {
    if (isQuotaError(err)) {
      markFirestoreQuotaExhausted();
      this.stopSubscriptions();
      return;
    }
    handleFirestoreError(err, op, path);
  }

  // Setup real-time listeners for all collections
  public subscribeToCollections(callbacks: {
    onStudents?: (students: Student[]) => void;
    onTeachers?: (teachers: User[]) => void;
    onParents?: (parents: User[]) => void;
    onClasses?: (classes: ClassItem[]) => void;
    onSubjects?: (subjects: SubjectItem[]) => void;
    onMarks?: (marks: MarkSheet[]) => void;
    onExams?: (exams: Examination[]) => void;
    onFees?: (fees: FeePayment[]) => void;
    onAdmins?: (admins: User[]) => void;
    onAttendance?: (configs: ClassAttendanceConfig[]) => void;
    onHolidays?: (holidays: InstitutionHoliday[]) => void;
    onSpecialWorkingDays?: (days: SpecialWorkingDay[]) => void;
    onAuditLogs?: (logs: AuditLog[]) => void;
    getInitialStudents?: () => Student[];
    getInitialTeachers?: () => User[];
    getInitialParents?: () => User[];
    getInitialClasses?: () => ClassItem[];
    getInitialSubjects?: () => SubjectItem[];
    getInitialMarks?: () => MarkSheet[];
    getInitialExams?: () => Examination[];
  }): () => void {
    this.stopSubscriptions();

    if (isFirestoreQuotaExhausted()) {
      console.info('[FirestoreSync] Cloud subscriptions skipped: daily quota is exhausted. Operating in local storage mode.');
      return () => {};
    }

    const SEED_FLAG_KEY = 'madrasa_firestore_seeded_flag';
    const isGloballySeeded = () => localStorage.getItem(SEED_FLAG_KEY) === 'true';
    const markGloballySeeded = () => {
      try {
        localStorage.setItem(SEED_FLAG_KEY, 'true');
      } catch {}
    };

    // 1. Students
    if (callbacks.onStudents) {
      try {
        let localSeeded = false;
        const unsub = onSnapshot(
          collection(db, 'students'),
          async snapshot => {
            if (!snapshot.empty) {
              markGloballySeeded();
              // 1. Purge rogue mock students and deduplicate multiple documents with same admission number
              const seenAdmissions = new Map<string, string>(); // admNo -> canonical doc.id
              const duplicateDocIdsToDelete: string[] = [];

              snapshot.docs.forEach(d => {
                const data = d.data() as any;
                const adm = String(data?.admissionNo || '').trim();
                const name = String(data?.nameEn || '').trim();

                // Rogue mock students removal
                if (
                  ['st_501', 'st_301', 'st_903'].includes(d.id) ||
                  ['5001', '3001', '9003'].includes(adm) ||
                  ['Ahmed Nihal', 'Adil Mansoor', 'Adil Ibrahim'].includes(name)
                ) {
                  duplicateDocIdsToDelete.push(d.id);
                  return;
                }

                // If document is legacy 'st_701' and there's also '862' (or duplicate admission numbers)
                if (adm) {
                  if (seenAdmissions.has(adm)) {
                    const existingId = seenAdmissions.get(adm)!;
                    // Prefer doc whose ID matches admissionNo or non-st_ ID
                    if (existingId.startsWith('st_') && !d.id.startsWith('st_')) {
                      duplicateDocIdsToDelete.push(existingId);
                      seenAdmissions.set(adm, d.id);
                    } else {
                      duplicateDocIdsToDelete.push(d.id);
                    }
                  } else {
                    seenAdmissions.set(adm, d.id);
                  }
                }
              });

              duplicateDocIdsToDelete.forEach(dupId => {
                deleteDoc(doc(db, 'students', dupId)).catch(() => {});
              });

              const rawStudents = snapshot.docs
                .filter(d => !duplicateDocIdsToDelete.includes(d.id))
                .map(doc => {
                  const data = doc.data() as any;
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
                  return {
                    ...data,
                    id: doc.id,
                    examRegisterNumbers: regNos,
                    examRegisterNos: regNos,
                    examRegNo: data.examRegNo || (data as any).regNo || Object.values(regNos)[0] || '',
                    regNo: (data as any).regNo || data.examRegNo || Object.values(regNos)[0] || '',
                  } as Student;
                })
                .filter(
                  st =>
                    st &&
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

              // Strict deduplication by admissionNo or id
              const uniqueStudents = Array.from(
                new Map(rawStudents.map(s => [s.admissionNo?.toString() || s.id, s])).values()
              );
              const resequenced = assignClassSequentialRollNumbers(uniqueStudents);
              callbacks.onStudents?.(resequenced);
            } else {
              // Collection is empty in Firestore
              if (!isGloballySeeded() && !localSeeded && callbacks.getInitialStudents) {
                localSeeded = true;
                markGloballySeeded();
                try {
                  const initialList = callbacks.getInitialStudents();
                  if (Array.isArray(initialList) && initialList.length > 0) {
                    const uniqueInit = Array.from(
                      new Map(initialList.map(s => [s.admissionNo?.toString() || s.id, s])).values()
                    );
                    callbacks.onStudents?.(uniqueInit);
                    for (const st of uniqueInit) {
                      await setDoc(doc(db, 'students', st.id), cleanForFirestore(st));
                    }
                  } else {
                    callbacks.onStudents?.([]);
                  }
                } catch (seedErr) {
                  console.warn('Initial student seed error:', seedErr);
                  callbacks.onStudents?.([]);
                }
              } else {
                // Already seeded once or intentionally cleared: strictly keep empty
                callbacks.onStudents?.([]);
              }
            }
          },
          err => {
            this.handleSnapshotError(err, 'students');
          }
        );
        this.unsubscribers.push(unsub);
      } catch (e) {
        this.handleSnapshotError(e, 'students');
      }
    }

    // 2. Teachers
    if (callbacks.onTeachers) {
      try {
        let localSeeded = false;
        const unsub = onSnapshot(
          collection(db, 'teachers'),
          async snapshot => {
            if (!snapshot.empty) {
              markGloballySeeded();
              const teachers = snapshot.docs.map(doc => ({
                ...doc.data(),
                id: doc.id,
              } as User));
              callbacks.onTeachers?.(teachers);
            } else {
              // Collection is empty in Firestore
              if (!isGloballySeeded() && !localSeeded && callbacks.getInitialTeachers) {
                localSeeded = true;
                markGloballySeeded();
                try {
                  const initialList = callbacks.getInitialTeachers();
                  if (Array.isArray(initialList) && initialList.length > 0) {
                    callbacks.onTeachers?.(initialList);
                    for (const t of initialList) {
                      await setDoc(doc(db, 'teachers', t.id), cleanForFirestore(t));
                    }
                  } else {
                    callbacks.onTeachers?.([]);
                  }
                } catch (seedErr) {
                  console.warn('Initial teacher seed error:', seedErr);
                  callbacks.onTeachers?.([]);
                }
              } else {
                callbacks.onTeachers?.([]);
              }
            }
          },
          err => {
            this.handleSnapshotError(err, 'teachers');
          }
        );
        this.unsubscribers.push(unsub);
      } catch (e) {
        this.handleSnapshotError(e, 'teachers');
      }
    }

    // 3. Parents
    if (callbacks.onParents) {
      try {
        let localSeeded = false;
        const unsub = onSnapshot(
          collection(db, 'parents'),
          async snapshot => {
            if (!snapshot.empty) {
              markGloballySeeded();
              const parents = snapshot.docs.map(doc => ({
                ...doc.data(),
                id: doc.id,
              } as User));
              callbacks.onParents?.(parents);
            } else {
              if (!isGloballySeeded() && !localSeeded && callbacks.getInitialParents) {
                localSeeded = true;
                markGloballySeeded();
                try {
                  const initialList = callbacks.getInitialParents();
                  if (Array.isArray(initialList) && initialList.length > 0) {
                    callbacks.onParents?.(initialList);
                    for (const p of initialList) {
                      await setDoc(doc(db, 'parents', p.id), cleanForFirestore(p));
                    }
                  } else {
                    callbacks.onParents?.([]);
                  }
                } catch (seedErr) {
                  console.warn('Initial parent seed error:', seedErr);
                  callbacks.onParents?.([]);
                }
              } else {
                callbacks.onParents?.([]);
              }
            }
          },
          err => {
            this.handleSnapshotError(err, 'parents');
          }
        );
        this.unsubscribers.push(unsub);
      } catch (e) {
        this.handleSnapshotError(e, 'parents');
      }
    }

    // 4. Classes
    if (callbacks.onClasses) {
      try {
        let localSeeded = false;
        const unsub = onSnapshot(
          collection(db, 'classes'),
          async snapshot => {
            if (!snapshot.empty) {
              markGloballySeeded();
              const classes = snapshot.docs.map(doc => ({
                ...doc.data(),
                id: doc.id,
              } as ClassItem));
              callbacks.onClasses?.(classes);
            } else {
              if (!isGloballySeeded() && !localSeeded && callbacks.getInitialClasses) {
                localSeeded = true;
                markGloballySeeded();
                try {
                  const initialList = callbacks.getInitialClasses();
                  if (Array.isArray(initialList) && initialList.length > 0) {
                    callbacks.onClasses?.(initialList);
                    for (const c of initialList) {
                      await setDoc(doc(db, 'classes', c.id), cleanForFirestore(c));
                    }
                  } else {
                    callbacks.onClasses?.([]);
                  }
                } catch (seedErr) {
                  console.warn('Initial class seed error:', seedErr);
                  callbacks.onClasses?.([]);
                }
              } else {
                callbacks.onClasses?.([]);
              }
            }
          },
          err => {
            this.handleSnapshotError(err, 'classes');
          }
        );
        this.unsubscribers.push(unsub);
      } catch (e) {
        this.handleSnapshotError(e, 'classes');
      }
    }

    // 5. Subjects
    if (callbacks.onSubjects) {
      try {
        let localSeeded = false;
        const unsub = onSnapshot(
          collection(db, 'subjects'),
          async snapshot => {
            if (!snapshot.empty) {
              markGloballySeeded();
              const subjects = snapshot.docs.map(doc => ({
                ...doc.data(),
                id: doc.id,
              } as SubjectItem));
              callbacks.onSubjects?.(subjects);
            } else {
              if (!isGloballySeeded() && !localSeeded && callbacks.getInitialSubjects) {
                localSeeded = true;
                markGloballySeeded();
                try {
                  const initialList = callbacks.getInitialSubjects();
                  if (Array.isArray(initialList) && initialList.length > 0) {
                    callbacks.onSubjects?.(initialList);
                    for (const s of initialList) {
                      await setDoc(doc(db, 'subjects', s.id), cleanForFirestore(s));
                    }
                  } else {
                    callbacks.onSubjects?.([]);
                  }
                } catch (seedErr) {
                  console.warn('Initial subject seed error:', seedErr);
                  callbacks.onSubjects?.([]);
                }
              } else {
                callbacks.onSubjects?.([]);
              }
            }
          },
          err => {
            this.handleSnapshotError(err, 'subjects');
          }
        );
        this.unsubscribers.push(unsub);
      } catch (e) {
        this.handleSnapshotError(e, 'subjects');
      }
    }

    // 6. Marks
    if (callbacks.onMarks) {
      try {
        let localSeeded = false;
        const unsub = onSnapshot(
          collection(db, 'marks'),
          async snapshot => {
            if (!snapshot.empty) {
              markGloballySeeded();
              const marks = snapshot.docs.map(doc => ({
                ...doc.data(),
                id: doc.id,
              } as MarkSheet));
              callbacks.onMarks?.(marks);
            } else {
              if (!isGloballySeeded() && !localSeeded && callbacks.getInitialMarks) {
                localSeeded = true;
                markGloballySeeded();
                try {
                  const initialList = callbacks.getInitialMarks();
                  if (Array.isArray(initialList) && initialList.length > 0) {
                    callbacks.onMarks?.(initialList);
                    for (const m of initialList) {
                      await setDoc(doc(db, 'marks', m.id), cleanForFirestore(m));
                    }
                  } else {
                    callbacks.onMarks?.([]);
                  }
                } catch (seedErr) {
                  console.warn('Initial marks seed error:', seedErr);
                  callbacks.onMarks?.([]);
                }
              } else {
                callbacks.onMarks?.([]);
              }
            }
          },
          err => {
            this.handleSnapshotError(err, 'marks');
          }
        );
        this.unsubscribers.push(unsub);
      } catch (e) {
        this.handleSnapshotError(e, 'marks');
      }
    }

    // 7. Exams
    if (callbacks.onExams) {
      try {
        let localSeeded = false;
        const unsub = onSnapshot(
          collection(db, 'exams'),
          async snapshot => {
            if (!snapshot.empty) {
              markGloballySeeded();
              const exams = snapshot.docs.map(doc => ({
                ...doc.data(),
                id: doc.id,
              } as Examination));
              callbacks.onExams?.(exams);
            } else {
              if (!isGloballySeeded() && !localSeeded && callbacks.getInitialExams) {
                localSeeded = true;
                markGloballySeeded();
                try {
                  const initialList = callbacks.getInitialExams();
                  if (Array.isArray(initialList) && initialList.length > 0) {
                    callbacks.onExams?.(initialList);
                    for (const ex of initialList) {
                      await setDoc(doc(db, 'exams', ex.id), cleanForFirestore(ex));
                    }
                  } else {
                    callbacks.onExams?.([]);
                  }
                } catch (seedErr) {
                  console.warn('Initial exams seed error:', seedErr);
                  callbacks.onExams?.([]);
                }
              } else {
                callbacks.onExams?.([]);
              }
            }
          },
          err => {
            this.handleSnapshotError(err, 'exams');
          }
        );
        this.unsubscribers.push(unsub);
      } catch (e) {
        this.handleSnapshotError(e, 'exams');
      }
    }

    // 8. Fee Payments
    if (callbacks.onFees) {
      try {
        const unsub = onSnapshot(
          collection(db, 'fee_payments'),
          snapshot => {
            const fees = snapshot.docs.map(doc => ({
              ...doc.data(),
              id: doc.id,
            } as FeePayment));
            callbacks.onFees?.(fees);
          },
          err => {
            this.handleSnapshotError(err, 'fee_payments');
          }
        );
        this.unsubscribers.push(unsub);
      } catch (e) {
        this.handleSnapshotError(e, 'fee_payments');
      }
    }

    // 9. Sub-Admins
    if (callbacks.onAdmins) {
      try {
        const unsub = onSnapshot(
          collection(db, 'admins'),
          snapshot => {
            const admins = snapshot.docs.map(doc => ({
              ...doc.data(),
              id: doc.id,
            } as User));
            callbacks.onAdmins?.(admins);
          },
          err => {
            this.handleSnapshotError(err, 'admins');
          }
        );
        this.unsubscribers.push(unsub);
      } catch (e) {
        this.handleSnapshotError(e, 'admins');
      }
    }

    // 10. Attendance
    if (callbacks.onAttendance) {
      try {
        const unsub = onSnapshot(
          collection(db, 'attendance'),
          snapshot => {
            const configs = snapshot.docs.map(doc => ({
              ...doc.data(),
              classId: doc.id,
            } as ClassAttendanceConfig));
            callbacks.onAttendance?.(configs);
          },
          err => {
            this.handleSnapshotError(err, 'attendance');
          }
        );
        this.unsubscribers.push(unsub);
      } catch (e) {
        this.handleSnapshotError(e, 'attendance');
      }
    }

    // 11. Institution Holidays
    if (callbacks.onHolidays) {
      try {
        const unsub = onSnapshot(
          collection(db, 'institutionHolidays'),
          snapshot => {
            const holidays = snapshot.docs.map(doc => ({
              ...doc.data(),
              id: doc.id,
              date: doc.data().date || doc.id,
            } as InstitutionHoliday));
            callbacks.onHolidays?.(holidays);
          },
          err => {
            this.handleSnapshotError(err, 'institutionHolidays');
          }
        );
        this.unsubscribers.push(unsub);
      } catch (e) {
        this.handleSnapshotError(e, 'institutionHolidays');
      }
    }

    // 12. Special Working Days (Principal Sunday Unlock)
    if (callbacks.onSpecialWorkingDays) {
      try {
        const unsub = onSnapshot(
          collection(db, 'specialWorkingDays'),
          snapshot => {
            const days = snapshot.docs.map(doc => ({
              ...doc.data(),
              id: doc.id,
              date: doc.data().date || doc.id,
            } as SpecialWorkingDay));
            callbacks.onSpecialWorkingDays?.(days);
          },
          err => {
            this.handleSnapshotError(err, 'specialWorkingDays');
          }
        );
        this.unsubscribers.push(unsub);
      } catch (e) {
        this.handleSnapshotError(e, 'specialWorkingDays');
      }
    }

    // 13. Audit Logs
    if (callbacks.onAuditLogs) {
      try {
        const unsub = onSnapshot(
          collection(db, 'auditLogs'),
          snapshot => {
            const logs = snapshot.docs.map(doc => ({
              ...doc.data(),
              id: doc.id,
            } as AuditLog));
            callbacks.onAuditLogs?.(logs);
          },
          err => {
            this.handleSnapshotError(err, 'auditLogs');
          }
        );
        this.unsubscribers.push(unsub);
      } catch (e) {
        this.handleSnapshotError(e, 'auditLogs');
      }
    }

    // Automated Data Cleanup: Purge erroneous June 24 holiday from Class 5 and any stale restored holidays
    // Executed at most once in background, skipped if quota is exhausted
    const CLEANUP_KEY = 'madrasa_firestore_holiday_cleanups_v2';
    if (!localStorage.getItem(CLEANUP_KEY) && !isFirestoreQuotaExhausted()) {
      Promise.all([
        this.cleanupJune24Class5Holiday(),
        this.cleanupRestoredHolidays(),
      ])
        .then(() => {
          try {
            localStorage.setItem(CLEANUP_KEY, 'true');
          } catch {}
        })
        .catch(err => {
          if (isQuotaError(err)) {
            markFirestoreQuotaExhausted();
            this.stopSubscriptions();
          }
          console.warn('automated holiday cleanup notice:', err);
        });
    }

    return () => this.stopSubscriptions();
  }

  public stopSubscriptions() {
    this.unsubscribers.forEach(unsub => {
      try {
        unsub();
      } catch {}
    });
    this.unsubscribers = [];
  }

  // Sync single student to their canonical document ID
  public async syncStudent(student: Student): Promise<void> {
    if (isFirestoreQuotaExhausted()) return;
    try {
      const canonicalId = student.id || String(student.admissionNo).trim();
      if (!canonicalId) return;
      const cleanData = cleanForFirestore({ ...student, id: canonicalId });
      await setDoc(doc(db, 'students', canonicalId), cleanData, { merge: true });

      // Clean up legacy alias doc if student ID and admission number differed, so duplicate docs are not kept in Firestore
      const admKey = String(student.admissionNo || '').trim();
      if (admKey && admKey !== canonicalId && canonicalId.startsWith('st_')) {
        deleteDoc(doc(db, 'students', admKey)).catch(() => {});
      }
    } catch (e) {
      this.handleWriteError(e, OperationType.WRITE, `students/${student.id || student.admissionNo}`);
    }
  }

  // Direct persistence for Exam Register Numbers in Firestore across schema variations
  public async updateExamRegisterNumbers(
    examId: string,
    registerNumbers: Record<string, string>,
    students: Student[]
  ): Promise<void> {
    if (isFirestoreQuotaExhausted()) return;
    try {
      for (const [sId, regNo] of Object.entries(registerNumbers)) {
        const targetStudent = students.find(s => s.id === sId || s.admissionNo === sId);
        const regVal = String(regNo || '').trim();
        const updatePayload: Record<string, any> = {
          examRegNo: regVal,
          regNo: regVal,
          examRegisterNumbers: {
            [examId]: regVal,
          },
          examRegisterNos: {
            [examId]: regVal,
          },
          [`examRegisterNos.${examId}`]: regVal,
          [`examRegisterNumbers.${examId}`]: regVal,
          updatedAt: new Date().toISOString(),
        };

        const targetIds = new Set<string>();
        targetIds.add(sId);
        if (targetStudent) {
          if (targetStudent.id) targetIds.add(targetStudent.id);
          if (targetStudent.admissionNo) targetIds.add(String(targetStudent.admissionNo).trim());
        }

        for (const docId of targetIds) {
          if (docId) {
            await setDoc(doc(db, 'students', docId), cleanForFirestore(updatePayload), { merge: true });
          }
        }
      }
    } catch (e) {
      this.handleWriteError(e, OperationType.WRITE, 'students/examRegisterNumbers');
    }
  }

  // Delete student
  public async deleteStudent(studentId: string, admissionNo?: string): Promise<void> {
    if (isFirestoreQuotaExhausted()) return;
    try {
      if (studentId) {
        await deleteDoc(doc(db, 'students', studentId)).catch(() => {});
      }
      const admKey = String(admissionNo || '').trim();
      if (admKey) {
        if (admKey !== studentId) {
          await deleteDoc(doc(db, 'students', admKey)).catch(() => {});
        }
        try {
          const q = query(collection(db, 'students'), where('admissionNo', '==', admKey));
          const snap = await getDocs(q);
          for (const d of snap.docs) {
            await deleteDoc(doc(db, 'students', d.id)).catch(() => {});
          }
        } catch (qErr) {
          console.warn('Firestore query by admissionNo delete error:', qErr);
        }
      }
    } catch (e) {
      this.handleWriteError(e, OperationType.DELETE, `students/${studentId}`);
    }
  }

  // Delete batch of students
  public async deleteStudentsBatch(studentIds: string[]): Promise<void> {
    if (isFirestoreQuotaExhausted()) return;
    try {
      for (const id of studentIds) {
        await deleteDoc(doc(db, 'students', id));
      }
    } catch (e) {
      this.handleWriteError(e, OperationType.DELETE, 'students/batch');
    }
  }

  // Sync teacher
  public async syncTeacher(teacher: User): Promise<void> {
    if (isFirestoreQuotaExhausted()) return;
    try {
      const asgs = Array.isArray(teacher.assignedSubjects)
        ? teacher.assignedSubjects
        : (Array.isArray(teacher.assignments) ? teacher.assignments : []);
      const docData = {
        ...teacher,
        assignments: asgs,
        assignedSubjects: asgs,
      };
      await setDoc(doc(db, 'teachers', teacher.id), cleanForFirestore(docData), { merge: true });
    } catch (e) {
      this.handleWriteError(e, OperationType.WRITE, `teachers/${teacher.id}`);
    }
  }

  // Delete teacher
  public async deleteTeacher(teacherId: string): Promise<void> {
    if (isFirestoreQuotaExhausted()) return;
    try {
      await deleteDoc(doc(db, 'teachers', teacherId));
    } catch (e) {
      this.handleWriteError(e, OperationType.DELETE, `teachers/${teacherId}`);
    }
  }

  // Sync parent
  public async syncParent(parent: User): Promise<void> {
    if (isFirestoreQuotaExhausted()) return;
    try {
      await setDoc(doc(db, 'parents', parent.id), cleanForFirestore(parent));
    } catch (e) {
      this.handleWriteError(e, OperationType.WRITE, `parents/${parent.id}`);
    }
  }

  // Delete parent
  public async deleteParent(parentId: string): Promise<void> {
    if (isFirestoreQuotaExhausted()) return;
    try {
      await deleteDoc(doc(db, 'parents', parentId));
    } catch (e) {
      this.handleWriteError(e, OperationType.DELETE, `parents/${parentId}`);
    }
  }

  // Sync class
  public async syncClass(classItem: ClassItem): Promise<void> {
    if (isFirestoreQuotaExhausted()) return;
    try {
      await setDoc(doc(db, 'classes', classItem.id), cleanForFirestore(classItem));
    } catch (e) {
      this.handleWriteError(e, OperationType.WRITE, `classes/${classItem.id}`);
    }
  }

  // Delete class
  public async deleteClass(classId: string): Promise<void> {
    if (isFirestoreQuotaExhausted()) return;
    try {
      await deleteDoc(doc(db, 'classes', classId));
    } catch (e) {
      this.handleWriteError(e, OperationType.DELETE, `classes/${classId}`);
    }
  }

  // Sync subject
  public async syncSubject(subject: SubjectItem): Promise<void> {
    if (isFirestoreQuotaExhausted()) return;
    try {
      await setDoc(doc(db, 'subjects', subject.id), cleanForFirestore(subject));
    } catch (e) {
      this.handleWriteError(e, OperationType.WRITE, `subjects/${subject.id}`);
    }
  }

  // Delete subject
  public async deleteSubject(subjectId: string): Promise<void> {
    if (isFirestoreQuotaExhausted()) return;
    try {
      await deleteDoc(doc(db, 'subjects', subjectId));
    } catch (e) {
      this.handleWriteError(e, OperationType.DELETE, `subjects/${subjectId}`);
    }
  }

  // Sync mark sheet
  public async syncMarkSheet(markSheet: MarkSheet): Promise<void> {
    if (isFirestoreQuotaExhausted()) return;
    try {
      await setDoc(doc(db, 'marks', markSheet.id), cleanForFirestore(markSheet));
    } catch (e) {
      this.handleWriteError(e, OperationType.WRITE, `marks/${markSheet.id}`);
    }
  }

  // Sync exam
  public async syncExam(exam: Examination): Promise<void> {
    if (isFirestoreQuotaExhausted()) return;
    try {
      const cleanData = cleanForFirestore(exam);
      await Promise.allSettled([
        setDoc(doc(db, 'exams', exam.id), cleanData, { merge: true }),
        setDoc(doc(db, 'examinations', exam.id), cleanData, { merge: true }),
      ]);
    } catch (e) {
      this.handleWriteError(e, OperationType.WRITE, `exams/${exam.id}`);
    }
  }

  // Delete exam
  public async deleteExam(examId: string): Promise<void> {
    if (isFirestoreQuotaExhausted()) return;
    try {
      await Promise.allSettled([
        deleteDoc(doc(db, 'exams', examId)),
        deleteDoc(doc(db, 'examinations', examId)),
      ]);
    } catch (e) {
      this.handleWriteError(e, OperationType.DELETE, `exams/${examId}`);
    }
  }

  // Sync fee payment
  public async syncFeePayment(fee: FeePayment): Promise<void> {
    if (isFirestoreQuotaExhausted()) return;
    try {
      await setDoc(doc(db, 'fee_payments', fee.id), cleanForFirestore(fee), { merge: true });
    } catch (e) {
      this.handleWriteError(e, OperationType.WRITE, `fee_payments/${fee.id}`);
    }
  }

  // Delete fee payment
  public async deleteFeePayment(feeId: string): Promise<void> {
    if (isFirestoreQuotaExhausted()) return;
    try {
      await deleteDoc(doc(db, 'fee_payments', feeId));
    } catch (e) {
      this.handleWriteError(e, OperationType.DELETE, `fee_payments/${feeId}`);
    }
  }

  // Sync sub-admin
  public async syncAdmin(admin: User): Promise<void> {
    if (isFirestoreQuotaExhausted()) return;
    try {
      await setDoc(doc(db, 'admins', admin.id), cleanForFirestore(admin), { merge: true });
    } catch (e) {
      this.handleWriteError(e, OperationType.WRITE, `admins/${admin.id}`);
    }
  }

  // Delete sub-admin
  public async deleteAdmin(adminId: string): Promise<void> {
    if (isFirestoreQuotaExhausted()) return;
    try {
      await deleteDoc(doc(db, 'admins', adminId));
    } catch (e) {
      this.handleWriteError(e, OperationType.DELETE, `admins/${adminId}`);
    }
  }

  // Sync institution settings
  public async syncSettings(settings: InstitutionSettings): Promise<void> {
    if (isFirestoreQuotaExhausted()) return;
    try {
      const cleanData = cleanForFirestore(settings);
      await Promise.allSettled([
        setDoc(doc(db, 'settings', 'institution'), cleanData, { merge: true }),
        setDoc(doc(db, 'settings', 'profile'), cleanData, { merge: true }),
      ]);
    } catch (e) {
      this.handleWriteError(e, OperationType.WRITE, 'settings/institution');
    }
  }

  // Sync class attendance config
  public async syncAttendance(config: ClassAttendanceConfig): Promise<void> {
    if (isFirestoreQuotaExhausted()) return;
    try {
      await setDoc(doc(db, 'attendance', config.classId), cleanForFirestore(config), { merge: true });
      if (config.studentDaysAttended) {
        for (const [sId, days] of Object.entries(config.studentDaysAttended)) {
          try {
            await setDoc(
              doc(db, 'students', sId),
              cleanForFirestore({
                attendance: {
                  daysAttended: days,
                  totalWorkingDays: config.totalWorkingDays,
                },
              }),
              { merge: true }
            );
          } catch {}
        }
      }
    } catch (e) {
      this.handleWriteError(e, OperationType.WRITE, `attendance/${config.classId}`);
    }
  }

  // Sync institution holiday to Firestore
  public async syncHoliday(holiday: InstitutionHoliday): Promise<void> {
    if (isFirestoreQuotaExhausted()) return;
    try {
      const docId = holiday.date || holiday.id;
      await setDoc(doc(db, 'institutionHolidays', docId), cleanForFirestore(holiday), { merge: true });
    } catch (e) {
      this.handleWriteError(e, OperationType.WRITE, `institutionHolidays/${holiday.date || holiday.id}`);
    }
  }

  // Delete institution holiday from Firestore (handles ID, date, and range lookups)
  public async deleteHoliday(dateOrId: string): Promise<void> {
    if (isFirestoreQuotaExhausted()) return;
    try {
      await deleteDoc(doc(db, 'institutionHolidays', dateOrId)).catch(() => {});
      const affectedDates = new Set<string>([dateOrId]);

      try {
        const snap = await getDocs(collection(db, 'institutionHolidays'));
        for (const d of snap.docs) {
          const data = d.data();
          const docDate = data.date || d.id;
          const rStart = data.rangeStart || data.startDate;
          const rEnd = data.rangeEnd || data.endDate;

          const isMatch =
            d.id === dateOrId ||
            docDate === dateOrId ||
            d.id.includes(dateOrId) ||
            (data.rangeGroupId && (data.rangeGroupId === dateOrId || d.id.includes(data.rangeGroupId))) ||
            (rStart && rEnd && dateOrId >= rStart && dateOrId <= rEnd);

          if (isMatch) {
            if (docDate) affectedDates.add(docDate);
            if (rStart && rEnd) {
              const pStart = new Date(rStart);
              const pEnd = new Date(rEnd);
              let c = new Date(pStart);
              while (c <= pEnd) {
                const y = c.getFullYear();
                const m = String(c.getMonth() + 1).padStart(2, '0');
                const day = String(c.getDate()).padStart(2, '0');
                affectedDates.add(`${y}-${m}-${day}`);
                c.setDate(c.getDate() + 1);
              }
            }
            await deleteDoc(doc(db, 'institutionHolidays', d.id)).catch(() => {});
          }
        }
      } catch {}

      // Immediately purge stale isHoliday / status: OFF flags from attendance documents across all classes
      try {
        const attSnap = await getDocs(collection(db, 'attendance'));
        for (const aDoc of attSnap.docs) {
          // If this doc is an individual daily record doc e.g. classId_date
          if (aDoc.id.includes('_')) {
            const matchedDate = Array.from(affectedDates).find(ad => aDoc.id.endsWith(ad));
            if (matchedDate) {
              const data = aDoc.data();
              if (data.isHoliday || data.status === 'OFF' || data.status === 'holiday') {
                const hasMarks = (data.presentStudentIds && data.presentStudentIds.length > 0) || (data.absentStudentIds && data.absentStudentIds.length > 0);
                if (!hasMarks) {
                  await deleteDoc(doc(db, 'attendance', aDoc.id)).catch(() => {});
                } else {
                  await setDoc(doc(db, 'attendance', aDoc.id), { ...data, isHoliday: false, status: undefined, holidayReason: undefined }, { merge: true });
                }
              }
            }
            continue;
          }

          const cfg = aDoc.data() as ClassAttendanceConfig;
          if (!cfg.dailyRecords) continue;
          let changed = false;
          const updatedDaily = { ...cfg.dailyRecords };

          affectedDates.forEach(dStr => {
            if (updatedDaily[dStr]) {
              const rec = updatedDaily[dStr];
              if (rec.isHoliday || (rec as any).status === 'OFF' || (rec as any).status === 'holiday') {
                changed = true;
                const hasMarks =
                  (rec.presentStudentIds && rec.presentStudentIds.length > 0) ||
                  (rec.absentStudentIds && rec.absentStudentIds.length > 0) ||
                  (rec.statusMap && Object.keys(rec.statusMap).length > 0);
                if (hasMarks) {
                  const { isHoliday, holidayReason, ...rest } = rec;
                  const cleanedItem: any = { ...rest, isHoliday: false };
                  delete cleanedItem.status;
                  delete cleanedItem.holidayReason;
                  updatedDaily[dStr] = cleanedItem;
                } else {
                  delete updatedDaily[dStr];
                }
              }
            }
          });

          if (changed) {
            const remainingHolidays = Object.keys(updatedDaily).filter(k => updatedDaily[k]?.isHoliday).length;
            const totalWorking = Math.max(1, 88 - remainingHolidays);
            await setDoc(doc(db, 'attendance', aDoc.id), cleanForFirestore({
              ...cfg,
              totalWorkingDays: totalWorking,
              dailyRecords: updatedDaily,
              updatedAt: new Date().toISOString(),
            }), { merge: true });
          }
        }
      } catch {}
    } catch (e) {
      this.handleWriteError(e, OperationType.DELETE, `institutionHolidays/${dateOrId}`);
    }
  }

  // Sync special working Sunday to Firestore
  public async syncSpecialWorkingDay(workingDay: SpecialWorkingDay): Promise<void> {
    if (isFirestoreQuotaExhausted()) return;
    try {
      const docId = workingDay.date || workingDay.id;
      await setDoc(doc(db, 'specialWorkingDays', docId), cleanForFirestore(workingDay), { merge: true });
    } catch (e) {
      this.handleWriteError(e, OperationType.WRITE, `specialWorkingDays/${workingDay.date || workingDay.id}`);
    }
  }

  // Delete special working Sunday from Firestore
  public async deleteSpecialWorkingDay(dateOrId: string): Promise<void> {
    if (isFirestoreQuotaExhausted()) return;
    try {
      await deleteDoc(doc(db, 'specialWorkingDays', dateOrId));
      try {
        const snap = await getDocs(query(collection(db, 'specialWorkingDays'), where('date', '==', dateOrId)));
        snap.forEach(d => {
          deleteDoc(doc(db, 'specialWorkingDays', d.id)).catch(() => {});
        });
      } catch {}
    } catch (e) {
      this.handleWriteError(e, OperationType.DELETE, `specialWorkingDays/${dateOrId}`);
    }
  }

  // Automated Cleanup: Purge restored holidays (e.g. Oct 12–17) and stale isHoliday/status: OFF flags across all classes
  public async cleanupRestoredHolidays(): Promise<void> {
    if (isFirestoreQuotaExhausted()) return;
    const CLEANUP_KEY = 'madrasa_holidays_cleanup_v3_done';
    if (typeof window !== 'undefined' && localStorage.getItem(CLEANUP_KEY) === 'true') {
      return;
    }
    try {
      const holSnap = await getDocs(collection(db, 'institutionHolidays'));
      const activeHolidayDates = new Set<string>();

      // Specifically purge restored Oct 12–17 holidays ("KMEB Spec... OFF") from institutionHolidays
      for (const d of holSnap.docs) {
        const data = d.data();
        const docDate = data.date || d.id;
        const rStart = data.rangeStart || data.startDate;
        const rEnd = data.rangeEnd || data.endDate;
        const reason = String(data.reason || '').toLowerCase();

        const isRestoredOctRange =
          (docDate >= '2026-10-12' && docDate <= '2026-10-17') ||
          d.id.includes('2026-10-12') ||
          d.id.includes('2026-10-13') ||
          d.id.includes('2026-10-14') ||
          d.id.includes('2026-10-15') ||
          d.id.includes('2026-10-16') ||
          d.id.includes('2026-10-17') ||
          reason.includes('kmeb spec') ||
          (rStart === '2026-10-12' && rEnd === '2026-10-17');

        if (isRestoredOctRange) {
          await deleteDoc(doc(db, 'institutionHolidays', d.id)).catch(() => {});
          continue; // Skip adding to activeHolidayDates!
        }

        activeHolidayDates.add(docDate);
        if (rStart && rEnd) {
          const s = new Date(rStart);
          const e = new Date(rEnd);
          let curr = new Date(s);
          while (curr <= e) {
            const y = curr.getFullYear();
            const m = String(curr.getMonth() + 1).padStart(2, '0');
            const day = String(curr.getDate()).padStart(2, '0');
            activeHolidayDates.add(`${y}-${m}-${day}`);
            curr.setDate(curr.getDate() + 1);
          }
        }
      }

      // Also clean up any lingering Oct 12–17 holiday daily records from all attendance documents
      const restoredDates = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17'];

      const attSnap = await getDocs(collection(db, 'attendance'));
      for (const aDoc of attSnap.docs) {
        // Individual daily docs e.g. classId_date
        if (aDoc.id.includes('_')) {
          const matchedOct = restoredDates.find(od => aDoc.id.endsWith(od));
          if (matchedOct) {
            const data = aDoc.data();
            if (data.isHoliday || data.status === 'OFF' || data.status === 'holiday') {
              const hasMarks = (data.presentStudentIds && data.presentStudentIds.length > 0) || (data.absentStudentIds && data.absentStudentIds.length > 0);
              if (!hasMarks) {
                await deleteDoc(doc(db, 'attendance', aDoc.id)).catch(() => {});
              } else {
                await setDoc(doc(db, 'attendance', aDoc.id), { ...data, isHoliday: false, status: undefined, holidayReason: undefined }, { merge: true });
              }
            }
          }
          continue;
        }

        const cfg = aDoc.data() as ClassAttendanceConfig;
        if (!cfg.dailyRecords) continue;
        let modified = false;
        const updatedDaily = { ...cfg.dailyRecords };

        for (const [dStr, rec] of Object.entries(updatedDaily)) {
          const isMarkedHoliday = rec?.isHoliday === true || (rec as any)?.status === 'OFF' || (rec as any)?.status === 'holiday';
          const isRestoredDate = restoredDates.includes(dStr);
          if (isMarkedHoliday) {
            const parts = dStr.split('-');
            const isSun = parts.length === 3 ? new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])).getDay() === 0 : false;
            // If date is not in activeHolidayDates and not a Sunday, or is in restoredDates
            if ((!activeHolidayDates.has(dStr) && !isSun) || isRestoredDate) {
              modified = true;
              const hasMarks =
                (rec.presentStudentIds && rec.presentStudentIds.length > 0) ||
                (rec.absentStudentIds && rec.absentStudentIds.length > 0) ||
                (rec.statusMap && Object.keys(rec.statusMap).length > 0);
              if (hasMarks) {
                const { isHoliday, holidayReason, ...rest } = rec;
                const cleanedItem: any = { ...rest, isHoliday: false };
                delete cleanedItem.status;
                delete cleanedItem.holidayReason;
                updatedDaily[dStr] = cleanedItem;
              } else {
                delete updatedDaily[dStr];
              }
            }
          }
        }

        if (modified) {
          const remainingHolidays = Object.keys(updatedDaily).filter(k => updatedDaily[k]?.isHoliday || activeHolidayDates.has(k)).length;
          const totalWorking = Math.max(1, 88 - remainingHolidays);
          await setDoc(doc(db, 'attendance', aDoc.id), cleanForFirestore({
            ...cfg,
            totalWorkingDays: totalWorking,
            dailyRecords: updatedDaily,
            updatedAt: new Date().toISOString(),
          }));
        }
      }
      try {
        localStorage.setItem(CLEANUP_KEY, 'true');
      } catch {}
    } catch (e) {
      this.handleWriteError(e, OperationType.WRITE, 'cleanupRestoredHolidays');
    }
  }

  // Automated Cleanup: Completely remove erroneous June 24 holiday from Class 5
  public async cleanupJune24Class5Holiday(): Promise<void> {
    if (isFirestoreQuotaExhausted()) return;
    const CLEANUP_JUNE24_KEY = 'madrasa_cleanup_june24_v2_done';
    if (typeof window !== 'undefined' && localStorage.getItem(CLEANUP_JUNE24_KEY) === 'true') {
      return;
    }
    try {
      const targetDates = ['2026-06-24', '24/06/2026', '24-06-2026'];
      // 1. Scan institutionHolidays collection
      const holSnap = await getDocs(collection(db, 'institutionHolidays'));
      for (const d of holSnap.docs) {
        const data = d.data();
        const docDate = data.date || d.id;
        if (targetDates.includes(docDate) || d.id.includes('2026-06-24')) {
          const targetClasses: string[] = Array.isArray(data.targetClasses) ? data.targetClasses : ['all'];
          const isTargeting5 = targetClasses.some(c => c === 'all' || c === 'cls_5' || c === 'class_5' || c === '5');
          if (isTargeting5) {
            const remaining = targetClasses.filter(c => c !== 'cls_5' && c !== 'class_5' && c !== '5');
            // If it only targeted Class 5 (or was marked specifically for Class 5)
            if (remaining.length === 0 || remaining.length === targetClasses.length - 1) {
              if (targetClasses.includes('cls_5') || targetClasses.includes('class_5') || targetClasses.length === 1) {
                await deleteDoc(doc(db, 'institutionHolidays', d.id));
              } else if (remaining.length > 0 && !targetClasses.includes('all')) {
                await setDoc(doc(db, 'institutionHolidays', d.id), { ...data, targetClasses: remaining }, { merge: true });
              } else {
                await deleteDoc(doc(db, 'institutionHolidays', d.id));
              }
            }
          }
        }
      }

      // 2. Check attendance collection for Class 5 documents
      const cls5Keys = ['cls_5', 'class_5', '5'];
      for (const key of cls5Keys) {
        try {
          const attRef = doc(db, 'attendance', key);
          const attSnap = await getDocs(query(collection(db, 'attendance')));
          const matched = attSnap.docs.find(docSnap => docSnap.id === key);
          if (matched) {
            const attData = matched.data() as ClassAttendanceConfig;
            if (attData.dailyRecords && attData.dailyRecords['2026-06-24']) {
              if (attData.dailyRecords['2026-06-24'].isHoliday) {
                const updatedDaily = { ...attData.dailyRecords };
                delete updatedDaily['2026-06-24'];
                const holidayCount = Object.values(updatedDaily).filter(r => r.isHoliday).length;
                const totalWorking = Math.max(1, 88 - holidayCount);
                await setDoc(
                  attRef,
                  cleanForFirestore({
                    ...attData,
                    totalWorkingDays: totalWorking,
                    dailyRecords: updatedDaily,
                    updatedAt: new Date().toISOString(),
                  })
                );
              }
            }
          }
        } catch {}
      }
      try {
        localStorage.setItem(CLEANUP_JUNE24_KEY, 'true');
      } catch {}
    } catch (e) {
      this.handleWriteError(e, OperationType.WRITE, 'cleanupJune24Class5Holiday');
    }
  }

  // Sync audit log to Firestore
  public async syncAuditLog(log: AuditLog): Promise<void> {
    if (isFirestoreQuotaExhausted()) return;
    try {
      await setDoc(doc(db, 'auditLogs', log.id), cleanForFirestore(log), { merge: true });
    } catch (e) {
      this.handleWriteError(e, OperationType.WRITE, `auditLogs/${log.id}`);
    }
  }

  // Batch upload whole dataset to Firestore (e.g. migration or initial seed sync)
  public async pushFullStateToFirestore(data: {
    students: Student[];
    teachers: User[];
    parents?: User[];
    classes: ClassItem[];
    subjects: SubjectItem[];
    marks: MarkSheet[];
    exams?: Examination[];
  }): Promise<void> {
    if (isFirestoreQuotaExhausted()) return;
    try {
      // Students
      for (const st of data.students) {
        await setDoc(doc(db, 'students', st.id), cleanForFirestore(st));
      }
      // Teachers
      for (const t of data.teachers) {
        await setDoc(doc(db, 'teachers', t.id), cleanForFirestore(t));
      }
      // Parents
      if (data.parents) {
        for (const p of data.parents) {
          await setDoc(doc(db, 'parents', p.id), cleanForFirestore(p));
        }
      }
      // Classes
      for (const c of data.classes) {
        await setDoc(doc(db, 'classes', c.id), cleanForFirestore(c));
      }
      // Subjects
      for (const s of data.subjects) {
        await setDoc(doc(db, 'subjects', s.id), cleanForFirestore(s));
      }
      // Marks
      for (const m of data.marks) {
        await setDoc(doc(db, 'marks', m.id), cleanForFirestore(m));
      }
      // Exams
      if (data.exams) {
        for (const ex of data.exams) {
          await setDoc(doc(db, 'exams', ex.id), cleanForFirestore(ex));
        }
      }
    } catch (e) {
      this.handleWriteError(e, OperationType.WRITE, 'batch_full_state');
    }
  }

  // Contextual module-specific purges
  public async purgeDemoStudentsFromFirestore(): Promise<void> {
    if (isFirestoreQuotaExhausted()) return;
    try {
      const studentSnap = await getDocs(collection(db, 'students'));
      for (const d of studentSnap.docs) {
        await deleteDoc(d.ref);
      }
      const marksSnap = await getDocs(collection(db, 'marks'));
      for (const d of marksSnap.docs) {
        await deleteDoc(d.ref);
      }
    } catch (e) {
      this.handleWriteError(e, OperationType.DELETE, 'purgeDemoStudents');
    }
  }

  public async purgeDemoTeachersFromFirestore(): Promise<void> {
    if (isFirestoreQuotaExhausted()) return;
    try {
      const teachersSnap = await getDocs(collection(db, 'teachers'));
      for (const d of teachersSnap.docs) {
        const data = d.data();
        if (data.role !== 'admin' && data.username !== 'principal') {
          await deleteDoc(d.ref);
        }
      }
    } catch (e) {
      this.handleWriteError(e, OperationType.DELETE, 'purgeDemoTeachers');
    }
  }

  public async purgeDemoParentsFromFirestore(): Promise<void> {
    if (isFirestoreQuotaExhausted()) return;
    try {
      const parentsSnap = await getDocs(collection(db, 'parents'));
      for (const d of parentsSnap.docs) {
        await deleteDoc(d.ref);
      }
    } catch (e) {
      this.handleWriteError(e, OperationType.DELETE, 'purgeDemoParents');
    }
  }

  // Complete clear dummy / demo data from Firestore and keep admin
  public async purgeDemoDataFromFirestore(): Promise<void> {
    if (isFirestoreQuotaExhausted()) return;
    try {
      await this.purgeDemoStudentsFromFirestore();
      await this.purgeDemoTeachersFromFirestore();
      await this.purgeDemoParentsFromFirestore();
    } catch (e) {
      this.handleWriteError(e, OperationType.DELETE, 'purgeDemoData');
    }
  }
}

export const firestoreSync = FirestoreSyncService.getInstance();
