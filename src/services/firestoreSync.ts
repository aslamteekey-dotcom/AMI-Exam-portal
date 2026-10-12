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

  // Setup real-time listeners for the 5 collections
  public subscribeToCollections(callbacks: {
    onStudents?: (students: Student[]) => void;
    onTeachers?: (teachers: User[]) => void;
    onClasses?: (classes: ClassItem[]) => void;
    onSubjects?: (subjects: SubjectItem[]) => void;
    onMarks?: (marks: MarkSheet[]) => void;
  }): () => void {
    this.stopSubscriptions();

    // 1. Students
    if (callbacks.onStudents) {
      try {
        const unsub = onSnapshot(
          collection(db, 'students'),
          snapshot => {
            if (!snapshot.empty) {
              const students = snapshot.docs.map(doc => doc.data() as Student);
              callbacks.onStudents?.(students);
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
        const unsub = onSnapshot(
          collection(db, 'teachers'),
          snapshot => {
            if (!snapshot.empty) {
              const teachers = snapshot.docs.map(doc => doc.data() as User);
              callbacks.onTeachers?.(teachers);
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

    // 3. Classes
    if (callbacks.onClasses) {
      try {
        const unsub = onSnapshot(
          collection(db, 'classes'),
          snapshot => {
            if (!snapshot.empty) {
              const classes = snapshot.docs.map(doc => doc.data() as ClassItem);
              callbacks.onClasses?.(classes);
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

    // 4. Subjects
    if (callbacks.onSubjects) {
      try {
        const unsub = onSnapshot(
          collection(db, 'subjects'),
          snapshot => {
            if (!snapshot.empty) {
              const subjects = snapshot.docs.map(doc => doc.data() as SubjectItem);
              callbacks.onSubjects?.(subjects);
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

    // 5. Marks
    if (callbacks.onMarks) {
      try {
        const unsub = onSnapshot(
          collection(db, 'marks'),
          snapshot => {
            if (!snapshot.empty) {
              const marks = snapshot.docs.map(doc => doc.data() as MarkSheet);
              callbacks.onMarks?.(marks);
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
    }
  }

  // Delete student
  public async deleteStudent(studentId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'students', studentId));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `students/${studentId}`);
    }
  }

  // Sync teacher
  public async syncTeacher(teacher: User): Promise<void> {
    try {
      await setDoc(doc(db, 'teachers', teacher.id), teacher);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `teachers/${teacher.id}`);
    }
  }

  // Delete teacher
  public async deleteTeacher(teacherId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'teachers', teacherId));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `teachers/${teacherId}`);
    }
  }

  // Sync class
  public async syncClass(classItem: ClassItem): Promise<void> {
    try {
      await setDoc(doc(db, 'classes', classItem.id), classItem);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `classes/${classItem.id}`);
    }
  }

  // Sync subject
  public async syncSubject(subject: SubjectItem): Promise<void> {
    try {
      await setDoc(doc(db, 'subjects', subject.id), subject);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `subjects/${subject.id}`);
    }
  }

  // Sync mark sheet
  public async syncMarkSheet(markSheet: MarkSheet): Promise<void> {
    try {
      await setDoc(doc(db, 'marks', markSheet.id), markSheet);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `marks/${markSheet.id}`);
    }
  }

  // Batch upload whole dataset to Firestore (e.g. migration or initial seed sync)
  public async pushFullStateToFirestore(data: {
    students: Student[];
    teachers: User[];
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
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, 'purgeDemoData');
    }
  }
}

export const firestoreSync = FirestoreSyncService.getInstance();
