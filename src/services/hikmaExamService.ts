import {
  HikmaModelId,
  HikmaStudentMark,
  HikmaClassModelRecord,
  calculateHikmaStudentScore,
  HIKMA_EXAM_ID,
  HIKMA_MODELS,
  Student,
} from '../types';
import { db, isFirestoreQuotaExhausted } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const STORAGE_PREFIX = 'madrasa_hikma_record_';

/**
 * Generates realistic seed data for a student across Model 1, 2, and 3
 * with a realistic progression showing comparative negative marking.
 */
export function generateSeedMarksForStudent(
  student: Student,
  modelId: HikmaModelId,
  maxMarks: number = 50
): HikmaStudentMark {
  // Use student ID / admission number to create a deterministic baseline
  const numId = parseInt(student.admissionNo || student.id.replace(/\D/g, '') || '10', 10);
  const baseSeed = (numId * 17) % 15; // 0 to 14

  let correct = 0;
  let wrong = 0;
  let unattempted = 0;

  if (maxMarks === 25) {
    if (modelId === 'model_1') {
      correct = 18 + (baseSeed % 5); // 18 to 22
      wrong = 2 + (baseSeed % 3);    // 2 to 4
    } else if (modelId === 'model_2') {
      correct = 20 + (baseSeed % 4); // 20 to 23
      wrong = 1 + (baseSeed % 3);    // 1 to 3
    } else {
      correct = 21 + (baseSeed % 4); // 21 to 24
      wrong = 1 + (baseSeed % 2);    // 1 to 2
    }
    unattempted = Math.max(0, maxMarks - (correct + wrong));
  } else {
    // Default 50 max marks
    if (modelId === 'model_1') {
      correct = 36 + (baseSeed % 10); // 36 to 45
      wrong = 4 + (baseSeed % 5);     // 4 to 8
    } else if (modelId === 'model_2') {
      correct = 39 + (baseSeed % 9);  // 39 to 47
      wrong = 3 + (baseSeed % 4);     // 3 to 6
    } else {
      correct = 42 + (baseSeed % 7);  // 42 to 48
      wrong = 2 + (baseSeed % 3);     // 2 to 4
    }
    unattempted = Math.max(0, maxMarks - (correct + wrong));
  }

  const score = calculateHikmaStudentScore(correct, wrong, unattempted, maxMarks, false);

  return {
    studentId: student.id,
    studentName: student.nameEn,
    studentNameMl: student.nameMl,
    rollNo: student.rollNo,
    admissionNo: student.admissionNo,
    isAbsent: false,
    correctAnswers: score.correctAnswers,
    wrongAnswers: score.wrongAnswers,
    unattempted: score.unattempted,
    totalPositive: score.totalPositive,
    minusMarks: score.minusMarks,
    grandTotal: score.grandTotal,
    maxMarks,
  };
}

/**
 * Retrieves the HIKMA Model Exam record for a specific class and model.
 * If not present in local storage or Firestore, seeds deterministic marks for all class students.
 */
export async function getHikmaClassRecord(
  classId: string,
  modelId: HikmaModelId,
  classStudents: Student[] = []
): Promise<HikmaClassModelRecord> {
  const key = `${STORAGE_PREFIX}${classId}_${modelId}`;

  // 1. Try local storage
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed: HikmaClassModelRecord = JSON.parse(raw);
      if (parsed && parsed.studentMarks && Object.keys(parsed.studentMarks).length > 0) {
        // Ensure any newly added student in class is also present
        let updated = false;
        classStudents.forEach(st => {
          if (!parsed.studentMarks[st.id]) {
            parsed.studentMarks[st.id] = generateSeedMarksForStudent(st, modelId, parsed.maxMarks || 50);
            updated = true;
          }
        });
        if (updated) {
          saveHikmaClassRecordSync(parsed);
        }
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Error reading HIKMA record from localStorage:', e);
  }

  // 2. Try Firestore if online
  if (db && !isFirestoreQuotaExhausted()) {
    try {
      const docRef = doc(db, 'hikma_model_records', `${classId}_${modelId}`);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data() as HikmaClassModelRecord;
        if (data && data.studentMarks) {
          saveHikmaClassRecordSync(data);
          return data;
        }
      }
    } catch (e) {
      console.warn('Firestore fetch failed for HIKMA record, falling back to seed:', e);
    }
  }

  // 3. Generate initial seed record
  const defaultMax = 50;
  const studentMarks: Record<string, HikmaStudentMark> = {};
  classStudents.forEach(st => {
    studentMarks[st.id] = generateSeedMarksForStudent(st, modelId, defaultMax);
  });

  const record: HikmaClassModelRecord = {
    examinationId: HIKMA_EXAM_ID,
    classId,
    modelId,
    maxMarks: defaultMax,
    status: 'draft',
    lastUpdated: new Date().toISOString(),
    studentMarks,
  };

  saveHikmaClassRecordSync(record);
  return record;
}

/**
 * Saves HIKMA class record synchronously to localStorage and fires update event.
 */
export function saveHikmaClassRecordSync(record: HikmaClassModelRecord): void {
  const key = `${STORAGE_PREFIX}${record.classId}_${record.modelId}`;
  try {
    localStorage.setItem(key, JSON.stringify(record));
    window.dispatchEvent(
      new CustomEvent('hikma_exam_updated', {
        detail: { classId: record.classId, modelId: record.modelId },
      })
    );
  } catch (e) {
    console.error('Failed to save HIKMA record to localStorage:', e);
  }
}

/**
 * Saves HIKMA class record to both localStorage and Firestore.
 */
export async function saveHikmaClassRecord(record: HikmaClassModelRecord): Promise<void> {
  saveHikmaClassRecordSync(record);

  if (db && !isFirestoreQuotaExhausted()) {
    try {
      const docRef = doc(db, 'hikma_model_records', `${record.classId}_${record.modelId}`);
      await setDoc(docRef, record, { merge: true });
    } catch (e) {
      console.warn('Failed to sync HIKMA record to Firestore:', e);
    }
  }
}

/**
 * Fetches all three models (Model 1, Model 2, Model 3) unified for a given class.
 */
export async function getHikmaUnifiedClassRecords(
  classId: string,
  classStudents: Student[] = []
): Promise<{
  model_1: HikmaClassModelRecord;
  model_2: HikmaClassModelRecord;
  model_3: HikmaClassModelRecord;
}> {
  const [m1, m2, m3] = await Promise.all([
    getHikmaClassRecord(classId, 'model_1', classStudents),
    getHikmaClassRecord(classId, 'model_2', classStudents),
    getHikmaClassRecord(classId, 'model_3', classStudents),
  ]);

  return {
    model_1: m1,
    model_2: m2,
    model_3: m3,
  };
}

/**
 * Fetches single student's HIKMA marks across Model 1, Model 2, and Model 3.
 */
export async function getHikmaStudentComparativeMarks(
  student: Student,
  classStudents: Student[] = []
): Promise<{
  model_1: HikmaStudentMark;
  model_2: HikmaStudentMark;
  model_3: HikmaStudentMark;
}> {
  const unified = await getHikmaUnifiedClassRecords(student.classId, classStudents.length ? classStudents : [student]);

  const m1 = unified.model_1.studentMarks[student.id] || generateSeedMarksForStudent(student, 'model_1', unified.model_1.maxMarks);
  const m2 = unified.model_2.studentMarks[student.id] || generateSeedMarksForStudent(student, 'model_2', unified.model_2.maxMarks);
  const m3 = unified.model_3.studentMarks[student.id] || generateSeedMarksForStudent(student, 'model_3', unified.model_3.maxMarks);

  return {
    model_1: m1,
    model_2: m2,
    model_3: m3,
  };
}
