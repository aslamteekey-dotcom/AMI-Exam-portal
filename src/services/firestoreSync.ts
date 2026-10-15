import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { Student, User, ClassItem, SubjectItem, MarkSheet, Examination, FeePayment, ClassAttendanceConfig } from '../types';

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
    getInitialStudents?: () => Student[];
    getInitialTeachers?: () => User[];
    getInitialParents?: () => User[];
    getInitialClasses?: () => ClassItem[];
    getInitialSubjects?: () => SubjectItem[];
    getInitialMarks?: () => MarkSheet[];
    getInitialExams?: () => Examination[];
  }): () => void {
    this.stopSubscriptions();

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
              const students = snapshot.docs.map(doc => ({
                ...doc.data(),
                id: doc.id,
              } as Student));
              callbacks.onStudents?.(students);
            } else {
              // Collection is empty in Firestore
              if (!isGloballySeeded() && !localSeeded && callbacks.getInitialStudents) {
                localSeeded = true;
                markGloballySeeded();
                try {
                  const initialList = callbacks.getInitialStudents();
                  if (Array.isArray(initialList) && initialList.length > 0) {
                    callbacks.onStudents?.(initialList);
                    for (const st of initialList) {
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
            handleFirestoreError(err, OperationType.GET, 'students');
          }
        );
        this.unsubscribers.push(unsub);
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, 'students');
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
            handleFirestoreError(err, OperationType.GET, 'teachers');
          }
        );
        this.unsubscribers.push(unsub);
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, 'teachers');
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
            handleFirestoreError(err, OperationType.GET, 'parents');
          }
        );
        this.unsubscribers.push(unsub);
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, 'parents');
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
            handleFirestoreError(err, OperationType.GET, 'classes');
          }
        );
        this.unsubscribers.push(unsub);
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, 'classes');
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
            handleFirestoreError(err, OperationType.GET, 'subjects');
          }
        );
        this.unsubscribers.push(unsub);
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, 'subjects');
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
            handleFirestoreError(err, OperationType.GET, 'marks');
          }
        );
        this.unsubscribers.push(unsub);
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, 'marks');
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
            handleFirestoreError(err, OperationType.GET, 'exams');
          }
        );
        this.unsubscribers.push(unsub);
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, 'exams');
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
            handleFirestoreError(err, OperationType.GET, 'fee_payments');
          }
        );
        this.unsubscribers.push(unsub);
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, 'fee_payments');
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
            handleFirestoreError(err, OperationType.GET, 'admins');
          }
        );
        this.unsubscribers.push(unsub);
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, 'admins');
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
            handleFirestoreError(err, OperationType.GET, 'attendance');
          }
        );
        this.unsubscribers.push(unsub);
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, 'attendance');
      }
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

  // Sync single student (strictly deduplicated across student.id and sanitized Admission No)
  public async syncStudent(student: Student): Promise<void> {
    try {
      const cleanData = cleanForFirestore({ ...student });
      if (student.id) {
        await setDoc(doc(db, 'students', student.id), cleanData, { merge: true });
      }
      const admKey = String(student.admissionNo || '').trim();
      if (admKey && admKey !== student.id) {
        await setDoc(doc(db, 'students', admKey), cleanData, { merge: true });
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `students/${student.admissionNo || student.id}`);
      throw e;
    }
  }

  // Direct persistence for Exam Register Numbers in Firestore across schema variations
  public async updateExamRegisterNumbers(
    examId: string,
    registerNumbers: Record<string, string>,
    students: Student[]
  ): Promise<void> {
    try {
      for (const [sId, regNo] of Object.entries(registerNumbers)) {
        const targetStudent = students.find(s => s.id === sId || s.admissionNo === sId);
        const regVal = String(regNo || '').trim();
        const updatePayload: Record<string, any> = {
          examRegNo: regVal,
          [`examRegisterNos.${examId}`]: regVal,
          [`examRegisterNumbers.${examId}`]: regVal,
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
      handleFirestoreError(e, OperationType.WRITE, 'students/examRegisterNumbers');
      console.warn('Error syncing exam register numbers to Firestore:', e);
    }
  }

  // Delete student
  public async deleteStudent(studentId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'students', studentId));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `students/${studentId}`);
      throw e;
    }
  }

  // Delete batch of students
  public async deleteStudentsBatch(studentIds: string[]): Promise<void> {
    try {
      for (const id of studentIds) {
        await deleteDoc(doc(db, 'students', id));
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, 'students/batch');
      throw e;
    }
  }

  // Sync teacher
  public async syncTeacher(teacher: User): Promise<void> {
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
      handleFirestoreError(e, OperationType.WRITE, `teachers/${teacher.id}`);
      throw e;
    }
  }

  // Delete teacher
  public async deleteTeacher(teacherId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'teachers', teacherId));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `teachers/${teacherId}`);
      throw e;
    }
  }

  // Sync parent
  public async syncParent(parent: User): Promise<void> {
    try {
      await setDoc(doc(db, 'parents', parent.id), cleanForFirestore(parent));
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `parents/${parent.id}`);
      throw e;
    }
  }

  // Delete parent
  public async deleteParent(parentId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'parents', parentId));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `parents/${parentId}`);
      throw e;
    }
  }

  // Sync class
  public async syncClass(classItem: ClassItem): Promise<void> {
    try {
      await setDoc(doc(db, 'classes', classItem.id), cleanForFirestore(classItem));
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `classes/${classItem.id}`);
      throw e;
    }
  }

  // Delete class
  public async deleteClass(classId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'classes', classId));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `classes/${classId}`);
      throw e;
    }
  }

  // Sync subject
  public async syncSubject(subject: SubjectItem): Promise<void> {
    try {
      await setDoc(doc(db, 'subjects', subject.id), cleanForFirestore(subject));
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `subjects/${subject.id}`);
      throw e;
    }
  }

  // Delete subject
  public async deleteSubject(subjectId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'subjects', subjectId));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `subjects/${subjectId}`);
      throw e;
    }
  }

  // Sync mark sheet
  public async syncMarkSheet(markSheet: MarkSheet): Promise<void> {
    try {
      await setDoc(doc(db, 'marks', markSheet.id), cleanForFirestore(markSheet));
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `marks/${markSheet.id}`);
      throw e;
    }
  }

  // Sync exam
  public async syncExam(exam: Examination): Promise<void> {
    try {
      const cleanData = cleanForFirestore(exam);
      await Promise.allSettled([
        setDoc(doc(db, 'exams', exam.id), cleanData, { merge: true }),
        setDoc(doc(db, 'examinations', exam.id), cleanData, { merge: true }),
      ]);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `exams/${exam.id}`);
      throw e;
    }
  }

  // Delete exam
  public async deleteExam(examId: string): Promise<void> {
    try {
      await Promise.allSettled([
        deleteDoc(doc(db, 'exams', examId)),
        deleteDoc(doc(db, 'examinations', examId)),
      ]);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `exams/${examId}`);
      throw e;
    }
  }

  // Sync fee payment
  public async syncFeePayment(fee: FeePayment): Promise<void> {
    try {
      await setDoc(doc(db, 'fee_payments', fee.id), cleanForFirestore(fee), { merge: true });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `fee_payments/${fee.id}`);
      throw e;
    }
  }

  // Delete fee payment
  public async deleteFeePayment(feeId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'fee_payments', feeId));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `fee_payments/${feeId}`);
      throw e;
    }
  }

  // Sync sub-admin
  public async syncAdmin(admin: User): Promise<void> {
    try {
      await setDoc(doc(db, 'admins', admin.id), cleanForFirestore(admin), { merge: true });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `admins/${admin.id}`);
      throw e;
    }
  }

  // Delete sub-admin
  public async deleteAdmin(adminId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'admins', adminId));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `admins/${adminId}`);
      throw e;
    }
  }

  // Sync class attendance config
  public async syncAttendance(config: ClassAttendanceConfig): Promise<void> {
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
      handleFirestoreError(e, OperationType.WRITE, `attendance/${config.classId}`);
      throw e;
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
      handleFirestoreError(e, OperationType.WRITE, 'batch_full_state');
    }
  }

  // Contextual module-specific purges
  public async purgeDemoStudentsFromFirestore(): Promise<void> {
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
      handleFirestoreError(e, OperationType.DELETE, 'purgeDemoStudents');
    }
  }

  public async purgeDemoTeachersFromFirestore(): Promise<void> {
    try {
      const teachersSnap = await getDocs(collection(db, 'teachers'));
      for (const d of teachersSnap.docs) {
        const data = d.data();
        if (data.role !== 'admin' && data.username !== 'principal') {
          await deleteDoc(d.ref);
        }
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, 'purgeDemoTeachers');
    }
  }

  public async purgeDemoParentsFromFirestore(): Promise<void> {
    try {
      const parentsSnap = await getDocs(collection(db, 'parents'));
      for (const d of parentsSnap.docs) {
        await deleteDoc(d.ref);
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, 'purgeDemoParents');
    }
  }

  // Complete clear dummy / demo data from Firestore and keep admin
  public async purgeDemoDataFromFirestore(): Promise<void> {
    try {
      await this.purgeDemoStudentsFromFirestore();
      await this.purgeDemoTeachersFromFirestore();
      await this.purgeDemoParentsFromFirestore();
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, 'purgeDemoData');
    }
  }
}

export const firestoreSync = FirestoreSyncService.getInstance();
