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
  QuerySnapshot,
  DocumentSnapshot,
  DocumentData,
  Query,
  DocumentReference,
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

export const QUOTA_STORAGE_KEY = 'madrasa_firestore_quota_exhausted_until';
export const QUOTA_STATUS_EVENT = 'madrasa_firestore_quota_status_changed';

/**
 * Checks whether an error is due to Firestore quota exhaustion or overload backoff.
 */
export function isQuotaError(error: unknown): boolean {
  if (!error) return false;
  const str = error instanceof Error ? error.message : String(error);
  const code = (error as any)?.code || '';
  return (
    str.includes('resource-exhausted') ||
    str.includes('Quota exceeded') ||
    str.includes('maximum backoff delay') ||
    str.includes('RESOURCE_EXHAUSTED') ||
    str.includes('overloading the backend') ||
    str.includes('QuotaExceeded') ||
    code === 'resource-exhausted' ||
    code === 'RESOURCE_EXHAUSTED' ||
    code === 8 // gRPC RESOURCE_EXHAUSTED
  );
}

/**
 * Checks if the Firestore quota circuit-breaker is currently active.
 */
export function isFirestoreQuotaExhausted(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(QUOTA_STORAGE_KEY);
    if (!raw) return false;
    const until = parseInt(raw, 10);
    if (isNaN(until)) return false;
    if (Date.now() < until) {
      return true;
    }
    // Cooldown elapsed
    localStorage.removeItem(QUOTA_STORAGE_KEY);
    return false;
  } catch {
    return false;
  }
}

/**
 * Marks Firestore as quota-exhausted for a cooldown duration (default 60 minutes)
 * to immediately stop polling/retries and protect the application runtime.
 */
export function markFirestoreQuotaExhausted(cooldownMinutes = 60): void {
  if (typeof window === 'undefined') return;
  try {
    const wasExhausted = isFirestoreQuotaExhausted();
    const until = Date.now() + cooldownMinutes * 60 * 1000;
    localStorage.setItem(QUOTA_STORAGE_KEY, until.toString());
    if (!wasExhausted) {
      window.dispatchEvent(
        new CustomEvent(QUOTA_STATUS_EVENT, { detail: { exhausted: true, until } })
      );
      console.warn(
        `[Firebase Circuit Breaker] Firestore daily quota exceeded. Offline local storage mode engaged until ${new Date(
          until
        ).toLocaleTimeString()}.`
      );
    }
  } catch {}
}

/**
 * Manually reset quota status to re-test cloud connectivity.
 */
export function resetFirestoreQuotaStatus(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(QUOTA_STORAGE_KEY);
    window.dispatchEvent(
      new CustomEvent(QUOTA_STATUS_EVENT, { detail: { exhausted: false, until: 0 } })
    );
    console.info('[Firebase Circuit Breaker] Firestore quota status reset. Resuming cloud connectivity checks.');
  } catch {}
}

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
  if (isQuotaError(error)) {
    markFirestoreQuotaExhausted();
  }
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
    timestamp: new Date().toISOString(),
  };
  // Avoid log spamming if quota is already known to be exhausted
  if (!isQuotaError(error)) {
    console.warn('Firestore Operation Notification:', JSON.stringify(errInfo));
  }
  return errInfo;
}

export async function testFirestoreConnection(): Promise<boolean> {
  if (isFirestoreQuotaExhausted()) {
    return false;
  }
  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Connection check timeout')), 3500)
    );
    await Promise.race([
      getDocFromServer(doc(db, 'system', 'connection_test')),
      timeoutPromise,
    ]);
    return true;
  } catch (error) {
    if (isQuotaError(error)) {
      markFirestoreQuotaExhausted();
    }
    console.info('Firestore connectivity check:', error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * Safely creates a Firestore onSnapshot listener that respects the quota circuit breaker
 * and automatically detaches if a quota-exhausted error occurs.
 */
export function safeOnSnapshot<T = DocumentData>(
  target: Query<T>,
  onNext: (snapshot: QuerySnapshot<T>) => void,
  onError?: (error: any) => void
): () => void;
export function safeOnSnapshot<T = DocumentData>(
  target: DocumentReference<T>,
  onNext: (snapshot: DocumentSnapshot<T>) => void,
  onError?: (error: any) => void
): () => void;
export function safeOnSnapshot(
  target: any,
  onNext: (snapshot: any) => void,
  onError?: (error: any) => void
): () => void {
  if (isFirestoreQuotaExhausted()) {
    return () => {};
  }
  let unsub: Unsubscribe | undefined;
  try {
    unsub = onSnapshot(
      target,
      (snapshot: any) => {
        onNext(snapshot);
      },
      (err: any) => {
        if (isQuotaError(err)) {
          markFirestoreQuotaExhausted();
          if (unsub) {
            try {
              unsub();
            } catch {}
          }
          return;
        }
        if (onError) {
          onError(err);
        } else {
          console.warn('Firestore onSnapshot error:', err);
        }
      }
    );
    return () => {
      if (unsub) {
        try {
          unsub();
        } catch {}
      }
    };
  } catch (err) {
    if (isQuotaError(err)) {
      markFirestoreQuotaExhausted();
    }
    return () => {};
  }
}
