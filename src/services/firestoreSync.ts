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
import { Student, User, ClassItem, SubjectItem, MarkSheet } from '../types';

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

  // Setup real-time listeners for all 6 collections
  public subscribeToCollections(callbacks: {
    onStudents?: (students: Student[]) => void;
    onTeachers?: (teachers: User[]) => void;
    onParents?: (parents: User[]) => void;
    onClasses?: (classes: ClassItem[]) => void;
    onSubjects?: (subjects: SubjectItem[]) => void;
    onMarks?: (marks: MarkSheet[]) => void;
    getInitialStudents?: () => Student[];
    getInitialTeachers?: () => User[];
    getInitialParents?: () => User[];
    getInitialClasses?: () => ClassItem[];
    getInitialSubjects?: () => SubjectItem[];
    getInitialMarks?: () => MarkSheet[];
  }): () => void {
    this.stopSubscriptions();

    // 1. Students
    if (callbacks.onStudents) {
      try {
        let hasSeededStudents = false;
        const unsub = onSnapshot(
          collection(db, 'students'),
          async snapshot => {
            if (!snapshot.empty) {
              const students = snapshot.docs.map(doc => ({
                ...doc.data(),
                id: doc.id,
              } as Student));
              callbacks.onStudents?.(students);
            } else if (!hasSeededStudents) {
              hasSeededStudents = true;
              try {
                if (callbacks.getInitialStudents) {
                  const initialList = callbacks.getInitialStudents();
                  if (Array.isArray(initialList) && initialList.length > 0) {
                    for (const st of initialList) {
                      await setDoc(doc(db, 'students', st.id), st);
                    }
                  }
                }
              } catch (seedErr) {
                console.warn('Initial student seed error:', seedErr);
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
        let hasSeededInitialTeachers = false;
        const unsub = onSnapshot(
          collection(db, 'teachers'),
          async snapshot => {
            if (!snapshot.empty) {
              // If Firestore collection has data, NEVER re-inject the hardcoded initial 2 teachers
              const teachers = snapshot.docs.map(doc => ({
                ...doc.data(),
                id: doc.id,
              } as User));
              callbacks.onTeachers?.(teachers);
            } else if (!hasSeededInitialTeachers) {
              hasSeededInitialTeachers = true;
              // If Firestore is empty initially, seed it once, but do not keep overwriting user changes with mock arrays
              try {
                if (callbacks.getInitialTeachers) {
                  const initialList = callbacks.getInitialTeachers();
                  if (Array.isArray(initialList) && initialList.length > 0) {
                    for (const t of initialList) {
                      await setDoc(doc(db, 'teachers', t.id), t);
                    }
                  }
                }
              } catch (seedErr) {
                console.warn('Initial teacher seed error:', seedErr);
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
        let hasSeededInitialParents = false;
        const unsub = onSnapshot(
          collection(db, 'parents'),
          async snapshot => {
            if (!snapshot.empty) {
              const parents = snapshot.docs.map(doc => ({
                ...doc.data(),
                id: doc.id,
              } as User));
              callbacks.onParents?.(parents);
            } else if (!hasSeededInitialParents) {
              hasSeededInitialParents = true;
              try {
                if (callbacks.getInitialParents) {
                  const initialList = callbacks.getInitialParents();
                  if (Array.isArray(initialList) && initialList.length > 0) {
                    for (const p of initialList) {
                      await setDoc(doc(db, 'parents', p.id), p);
                    }
                  }
                }
              } catch (seedErr) {
                console.warn('Initial parent seed error:', seedErr);
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
        let hasSeededClasses = false;
        const unsub = onSnapshot(
          collection(db, 'classes'),
          async snapshot => {
            if (!snapshot.empty) {
              const classes = snapshot.docs.map(doc => ({
                ...doc.data(),
                id: doc.id,
              } as ClassItem));
              callbacks.onClasses?.(classes);
            } else if (!hasSeededClasses) {
              hasSeededClasses = true;
              try {
                if (callbacks.getInitialClasses) {
                  const initialList = callbacks.getInitialClasses();
                  if (Array.isArray(initialList) && initialList.length > 0) {
                    for (const c of initialList) {
                      await setDoc(doc(db, 'classes', c.id), c);
                    }
                  }
                }
              } catch (seedErr) {
                console.warn('Initial class seed error:', seedErr);
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
        let hasSeededSubjects = false;
        const unsub = onSnapshot(
          collection(db, 'subjects'),
          async snapshot => {
            if (!snapshot.empty) {
              const subjects = snapshot.docs.map(doc => ({
                ...doc.data(),
                id: doc.id,
              } as SubjectItem));
              callbacks.onSubjects?.(subjects);
            } else if (!hasSeededSubjects) {
              hasSeededSubjects = true;
              try {
                if (callbacks.getInitialSubjects) {
                  const initialList = callbacks.getInitialSubjects();
                  if (Array.isArray(initialList) && initialList.length > 0) {
                    for (const s of initialList) {
                      await setDoc(doc(db, 'subjects', s.id), s);
                    }
                  }
                }
              } catch (seedErr) {
                console.warn('Initial subject seed error:', seedErr);
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
        let hasSeededMarks = false;
        const unsub = onSnapshot(
          collection(db, 'marks'),
          async snapshot => {
            if (!snapshot.empty) {
              const marks = snapshot.docs.map(doc => ({
                ...doc.data(),
                id: doc.id,
              } as MarkSheet));
              callbacks.onMarks?.(marks);
            } else if (!hasSeededMarks) {
              hasSeededMarks = true;
              try {
                if (callbacks.getInitialMarks) {
                  const initialList = callbacks.getInitialMarks();
                  if (Array.isArray(initialList) && initialList.length > 0) {
                    for (const m of initialList) {
                      await setDoc(doc(db, 'marks', m.id), m);
                    }
                  }
                }
              } catch (seedErr) {
                console.warn('Initial marks seed error:', seedErr);
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

  // Sync single student
  public async syncStudent(student: Student): Promise<void> {
    try {
      await setDoc(doc(db, 'students', student.id), student);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `students/${student.id}`);
      throw e;
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

  // Sync teacher
  public async syncTeacher(teacher: User): Promise<void> {
    try {
      await setDoc(doc(db, 'teachers', teacher.id), teacher);
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
      await setDoc(doc(db, 'parents', parent.id), parent);
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
      await setDoc(doc(db, 'classes', classItem.id), classItem);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `classes/${classItem.id}`);
      throw e;
    }
  }

  // Sync subject
  public async syncSubject(subject: SubjectItem): Promise<void> {
    try {
      await setDoc(doc(db, 'subjects', subject.id), subject);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `subjects/${subject.id}`);
      throw e;
    }
  }

  // Sync mark sheet
  public async syncMarkSheet(markSheet: MarkSheet): Promise<void> {
    try {
      await setDoc(doc(db, 'marks', markSheet.id), markSheet);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `marks/${markSheet.id}`);
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
  }): Promise<void> {
    try {
      // Students
      for (const st of data.students) {
        await setDoc(doc(db, 'students', st.id), st);
      }
      // Teachers
      for (const t of data.teachers) {
        await setDoc(doc(db, 'teachers', t.id), t);
      }
      // Parents
      if (data.parents) {
        for (const p of data.parents) {
          await setDoc(doc(db, 'parents', p.id), p);
        }
      }
      // Classes
      for (const c of data.classes) {
        await setDoc(doc(db, 'classes', c.id), c);
      }
      // Subjects
      for (const s of data.subjects) {
        await setDoc(doc(db, 'subjects', s.id), s);
      }
      // Marks
      for (const m of data.marks) {
        await setDoc(doc(db, 'marks', m.id), m);
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'batch_full_state');
    }
  }

  // One-click clear dummy / demo data from Firestore and keep admin
  public async purgeDemoDataFromFirestore(): Promise<void> {
    try {
      // 1. Purge students
      const studentSnap = await getDocs(collection(db, 'students'));
      for (const d of studentSnap.docs) {
        await deleteDoc(d.ref);
      }

      // 2. Purge marks
      const marksSnap = await getDocs(collection(db, 'marks'));
      for (const d of marksSnap.docs) {
        await deleteDoc(d.ref);
      }

      // 3. Purge teachers (non-admin)
      const teachersSnap = await getDocs(collection(db, 'teachers'));
      for (const d of teachersSnap.docs) {
        const data = d.data();
        if (data.role !== 'admin' && data.username !== 'principal') {
          await deleteDoc(d.ref);
        }
      }

      // 4. Purge parents
      const parentsSnap = await getDocs(collection(db, 'parents'));
      for (const d of parentsSnap.docs) {
        await deleteDoc(d.ref);
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, 'purgeDemoData');
    }
  }
}

export const firestoreSync = FirestoreSyncService.getInstance();
