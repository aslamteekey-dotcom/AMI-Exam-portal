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

// In-memory cache for instant switching between classes and tabs without delays
const memoryRecordsCache = new Map<string, HikmaClassModelRecord>();

export interface HikmaModelSetting {
  modelId: HikmaModelId;
  totalMarks: number;
  passMark: number;
  gradeSystem: string;
}

export interface HikmaExamConfig {
  models: {
    model_1: HikmaModelSetting;
    model_2: HikmaModelSetting;
    model_3: HikmaModelSetting;
  };
  negativeMarkingPerWrong: number;
  positiveMarkPerCorrect: number;
  lastUpdated?: string;
}

export const DEFAULT_HIKMA_CONFIG: HikmaExamConfig = {
  models: {
    model_1: {
      modelId: 'model_1',
      totalMarks: 50,
      passMark: 18,
      gradeSystem: 'A: >= 40 (80%), B: >= 30 (60%), C: >= 20 (40%), D: < 20',
    },
    model_2: {
      modelId: 'model_2',
      totalMarks: 50,
      passMark: 18,
      gradeSystem: 'A: >= 40 (80%), B: >= 30 (60%), C: >= 20 (40%), D: < 20',
    },
    model_3: {
      modelId: 'model_3',
      totalMarks: 50,
      passMark: 18,
      gradeSystem: 'A: >= 40 (80%), B: >= 30 (60%), C: >= 20 (40%), D: < 20',
    },
  },
  negativeMarkingPerWrong: 0.25,
  positiveMarkPerCorrect: 1.0,
};

let cachedConfig: HikmaExamConfig | null = null;

export async function getHikmaExamConfig(): Promise<HikmaExamConfig> {
  if (cachedConfig) return cachedConfig;
  try {
    const local = localStorage.getItem('madrasa_hikma_exam_config');
    if (local) {
      const parsed = JSON.parse(local);
      if (parsed?.models?.model_1) {
        cachedConfig = parsed;
        return parsed;
      }
    }
  } catch {}

  if (db && !isFirestoreQuotaExhausted()) {
    try {
      const docRef = doc(db, 'hikma_exam_settings', 'global_config');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data() as HikmaExamConfig;
        if (data?.models?.model_1) {
          cachedConfig = data;
          localStorage.setItem('madrasa_hikma_exam_config', JSON.stringify(data));
          return data;
        }
      }
    } catch (e) {
      console.warn('Firestore fetch failed for HIKMA config:', e);
    }
  }

  cachedConfig = DEFAULT_HIKMA_CONFIG;
  return DEFAULT_HIKMA_CONFIG;
}

export async function saveHikmaExamConfig(config: HikmaExamConfig): Promise<void> {
  cachedConfig = config;
  const data = { ...config, lastUpdated: new Date().toISOString() };
  try {
    localStorage.setItem('madrasa_hikma_exam_config', JSON.stringify(data));
    window.dispatchEvent(new CustomEvent('hikma_config_updated', { detail: data }));
  } catch (e) {
    console.error('Failed to save HIKMA config to localStorage:', e);
  }

  if (db && !isFirestoreQuotaExhausted()) {
    try {
      const docRef = doc(db, 'hikma_exam_settings', 'global_config');
      await setDoc(docRef, data, { merge: true });
    } catch (e) {
      console.warn('Failed to save HIKMA config to Firestore:', e);
    }
  }
}

/**
 * Synchronously retrieves cached HIKMA record from memory or localStorage.
 */
export function getHikmaClassRecordSync(
  classId: string,
  modelId: HikmaModelId,
  classStudents: Student[] = []
): HikmaClassModelRecord | null {
  const key = `${STORAGE_PREFIX}${classId}_${modelId}`;
  if (memoryRecordsCache.has(key)) {
    const mem = memoryRecordsCache.get(key)!;
    if (classStudents.length > 0) {
      let updated = false;
      classStudents.forEach(st => {
        if (!mem.studentMarks[st.id]) {
          mem.studentMarks[st.id] = generateSeedMarksForStudent(st, modelId, mem.maxMarks || 50);
          updated = true;
        }
      });
      if (updated) saveHikmaClassRecordSync(mem);
    }
    return mem;
  }

  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed: HikmaClassModelRecord = JSON.parse(raw);
      if (parsed && parsed.studentMarks && Object.keys(parsed.studentMarks).length > 0) {
        if (classStudents.length > 0) {
          let updated = false;
          classStudents.forEach(st => {
            if (!parsed.studentMarks[st.id]) {
              parsed.studentMarks[st.id] = generateSeedMarksForStudent(st, modelId, parsed.maxMarks || 50);
              updated = true;
            }
          });
          if (updated) saveHikmaClassRecordSync(parsed);
        }
        memoryRecordsCache.set(key, parsed);
        return parsed;
      }
    }
  } catch {}
  return null;
}

/**
 * Synchronously retrieves all 3 model records from cache if available.
 */
export function getHikmaUnifiedClassRecordsSync(
  classId: string,
  classStudents: Student[] = []
): {
  model_1?: HikmaClassModelRecord;
  model_2?: HikmaClassModelRecord;
  model_3?: HikmaClassModelRecord;
} | null {
  const m1 = getHikmaClassRecordSync(classId, 'model_1', classStudents);
  const m2 = getHikmaClassRecordSync(classId, 'model_2', classStudents);
  const m3 = getHikmaClassRecordSync(classId, 'model_3', classStudents);

  if (m1 && m2 && m3) {
    return { model_1: m1, model_2: m2, model_3: m3 };
  }
  return null;
}

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
    registerNo: student.hikmaRegNo || student.examRegisterNumbers?.[HIKMA_EXAM_ID] || student.regNo || '',
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

/**
 * Saves or updates a student's HIKMA Exam Registration Number across Firestore and localStorage.
 */
export async function saveStudentHikmaRegNo(
  studentId: string,
  admissionNo: string,
  regNo: string
): Promise<void> {
  const cleanRegNo = String(regNo || '').trim();

  // 1. Update localStorage 'madrasa_students'
  try {
    const raw = localStorage.getItem('madrasa_students');
    if (raw) {
      const list: Student[] = JSON.parse(raw);
      if (Array.isArray(list)) {
        let changed = false;
        const updated = list.map(st => {
          if (st.id === studentId || st.admissionNo === admissionNo) {
            changed = true;
            return {
              ...st,
              hikmaRegNo: cleanRegNo,
              examRegisterNumbers: {
                ...(st.examRegisterNumbers || {}),
                [HIKMA_EXAM_ID]: cleanRegNo,
              },
            };
          }
          return st;
        });
        if (changed) {
          localStorage.setItem('madrasa_students', JSON.stringify(updated));
          window.dispatchEvent(new CustomEvent('madrasa_students_updated', { detail: updated }));
        }
      }
    }
  } catch (e) {
    console.warn('Failed to update madrasa_students in localStorage:', e);
  }

  // 2. Also update dedicated key in localStorage
  try {
    const key = 'madrasa_hikma_reg_numbers';
    const existing = JSON.parse(localStorage.getItem(key) || '{}');
    existing[studentId] = cleanRegNo;
    if (admissionNo) existing[admissionNo] = cleanRegNo;
    localStorage.setItem(key, JSON.stringify(existing));
  } catch {}

  // 3. Update any cached HIKMA model marks in memory and localStorage
  memoryRecordsCache.forEach((rec, cacheKey) => {
    if (rec.studentMarks && rec.studentMarks[studentId]) {
      rec.studentMarks[studentId].registerNo = cleanRegNo;
      saveHikmaClassRecordSync(rec);
    }
  });

  // 4. Save to Firestore if connected
  if (db && !isFirestoreQuotaExhausted()) {
    try {
      const docRef = doc(db, 'students', studentId);
      await setDoc(
        docRef,
        {
          hikmaRegNo: cleanRegNo,
          [`examRegisterNumbers.${HIKMA_EXAM_ID}`]: cleanRegNo,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (e) {
      console.warn('Failed to save student HIKMA reg no to Firestore:', e);
    }
  }

  window.dispatchEvent(new CustomEvent('hikma_exam_updated'));
}

/**
 * Batch saves multiple student registration numbers for HIKMA Exam.
 */
export async function batchSaveHikmaRegNumbers(
  regMap: Record<string, string>,
  students: Student[]
): Promise<void> {
  // Update localStorage 'madrasa_students'
  try {
    const raw = localStorage.getItem('madrasa_students');
    if (raw) {
      const list: Student[] = JSON.parse(raw);
      if (Array.isArray(list)) {
        const updated = list.map(st => {
          const reg = regMap[st.id] ?? regMap[st.admissionNo];
          if (reg !== undefined) {
            const clean = String(reg).trim();
            return {
              ...st,
              hikmaRegNo: clean,
              examRegisterNumbers: {
                ...(st.examRegisterNumbers || {}),
                [HIKMA_EXAM_ID]: clean,
              },
            };
          }
          return st;
        });
        localStorage.setItem('madrasa_students', JSON.stringify(updated));
        window.dispatchEvent(new CustomEvent('madrasa_students_updated', { detail: updated }));
      }
    }
  } catch (e) {
    console.warn('Failed to batch save madrasa_students in localStorage:', e);
  }

  // Save to dedicated map
  try {
    const key = 'madrasa_hikma_reg_numbers';
    const existing = JSON.parse(localStorage.getItem(key) || '{}');
    Object.entries(regMap).forEach(([id, reg]) => {
      existing[id] = String(reg).trim();
    });
    localStorage.setItem(key, JSON.stringify(existing));
  } catch {}

  // Update in Firestore
  if (db && !isFirestoreQuotaExhausted()) {
    const promises = Object.entries(regMap).map(async ([sId, reg]) => {
      const clean = String(reg).trim();
      const target = students.find(s => s.id === sId || s.admissionNo === sId);
      const actualId = target?.id || sId;
      try {
        const docRef = doc(db, 'students', actualId);
        await setDoc(
          docRef,
          {
            hikmaRegNo: clean,
            [`examRegisterNumbers.${HIKMA_EXAM_ID}`]: clean,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch (e) {
        console.warn(`Failed to sync reg no for student ${actualId}:`, e);
      }
    });
    await Promise.allSettled(promises);
  }

  window.dispatchEvent(new CustomEvent('hikma_exam_updated'));
}

/**
 * Strict filtering function for HIKMA Exam module:
 * Hikma exams are strictly organized by regular School Class (e.g. Class 1 to Class 9),
 * NOT Madrasa class (`student.class` or `student.classId`).
 *
 * This function returns true ONLY if the student's `schoolClass` matches the chosen target class/grade.
 */
export function isStudentInSchoolClass(
  student: Student,
  targetClassId: string,
  targetClassItem?: { id?: string; name?: string; numericGrade?: number } | null
): boolean {
  if (!student || student.status !== 'active') return false;

  const rawSc = student.schoolClass;
  if (!rawSc || typeof rawSc !== 'string' || !rawSc.trim()) {
    return false;
  }

  const sc = rawSc.trim();
  const scLower = sc.toLowerCase();

  // 1. Direct match with targetClassId (e.g. "cls_8" or "Class 8")
  if (targetClassId) {
    const cleanTargetId = targetClassId.trim();
    if (sc === cleanTargetId || scLower === cleanTargetId.toLowerCase()) {
      return true;
    }
  }

  // 2. Direct match with targetClassItem name or id
  if (targetClassItem) {
    if (targetClassItem.id && sc === targetClassItem.id) return true;
    if (targetClassItem.name && scLower === targetClassItem.name.trim().toLowerCase()) return true;
  }

  // 3. Normalized grade match (e.g., student.schoolClass is "Class 8", "Std 8", "Class-8", "8")
  const targetGradeNum =
    targetClassItem?.numericGrade ??
    (targetClassId ? parseInt(targetClassId.replace(/\D/g, ''), 10) : NaN);

  if (!isNaN(targetGradeNum) && targetGradeNum > 0) {
    // Check if schoolClass specifies e.g. "Class 8" or "Std 8" or "Grade 8"
    const match = sc.match(/(?:class|std|standard|grade)\s*[-:]?\s*(\d+)/i) || sc.match(/^(\d+)$/);
    if (match) {
      const parsedNum = parseInt(match[1], 10);
      if (parsedNum === targetGradeNum) {
        return true;
      }
    }

    // Pure digits check, excluding "Plus One (+1)" or "Plus Two (+2)" or "Pre-Primary"
    const isExcluded = /plus|college|degree|kg|primary/i.test(sc);
    if (!isExcluded) {
      const pureDigits = sc.replace(/\D/g, '');
      if (pureDigits && parseInt(pureDigits, 10) === targetGradeNum) {
        return true;
      }
    }
  }

  return false;
}


