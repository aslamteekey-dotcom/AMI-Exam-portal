import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  getDocFromServer,
  Unsubscribe,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

export const firebaseConfig = {
  apiKey: "AIzaSyBZy_DnvfXrWp7YWuoiKavp6YwzGYQGqag",
  authDomain: "dashboard-d5e6f.firebaseapp.com",
  projectId: "dashboard-d5e6f",
  storageBucket: "dashboard-d5e6f.firebasestorage.app",
  messagingSenderId: "659200340796",
  appId: "1:659200340796:web:734a594885dc44fabb2439",
  measurementId: "G-34H48ZTFVH"
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  timestamp: string;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
    timestamp: new Date().toISOString(),
  };
  console.warn('Firestore Operation Notification:', JSON.stringify(errInfo));
  return errInfo;
}

export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'system', 'connection_test'));
    return true;
  } catch (error) {
    // If offline or permission check occurs, we gracefully log and return false
    console.info('Firestore initial connectivity ping check:', error instanceof Error ? error.message : error);
    return false;
  }
}
