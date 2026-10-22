import { db, isFirestoreQuotaExhausted, markFirestoreQuotaExhausted, isQuotaError } from './firebase';
import { doc, setDoc } from 'firebase/firestore';
import { cleanForFirestore } from './firestoreSync';
import { clientStorageApi } from './clientStorageApi';
import { AuditLog, User } from '../types';

export interface AuditEventParams {
  action:
    | 'MARKS_SUBMITTED'
    | 'MARKS_APPROVED'
    | 'MARKS_LOCKED'
    | 'RESULTS_PUBLISHED'
    | 'STUDENT_CREATED'
    | 'STUDENT_UPDATED'
    | 'STUDENT_DELETED'
    | 'EXAM_REG_UPDATED'
    | 'ATTENDANCE_MARKED'
    | 'HOLIDAY_MARKED'
    | 'TEACHER_LOGIN'
    | 'ADMIN_LOGIN'
    | string;
  details: string;
  user?: string; // currentUser.name
  role?: string; // currentUser.role
  userId?: string;
  currentUser?: User | null;
  recordType?: string;
  recordId?: string;
  previousValue?: any;
  newValue?: any;
}

/**
 * Centrally log immutable audit events across the portal.
 * Writes to Firestore 'auditLogs' collection, syncs to local storage,
 * and notifies live subscribers.
 */
export async function logAuditEvent(params: AuditEventParams): Promise<AuditLog> {
  const currentUser = params.currentUser || clientStorageApi.getCurrentUser();
  const userName = params.user || currentUser?.name || 'System User';
  const userRole = params.role || currentUser?.role || 'system';
  const userId = params.userId || currentUser?.id || 'usr_sys';

  const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const timestamp = new Date().toISOString();

  const auditRecord: AuditLog = {
    id: logId,
    timestamp,
    user: userName,
    userName: userName,
    role: userRole,
    userRole: userRole,
    userId,
    action: params.action,
    details: params.details,
    recordType: params.recordType || 'audit',
    recordId: params.recordId || logId,
    previousValue: params.previousValue,
    newValue: params.newValue,
  };

  // 1. Immediately store in local database for synchronous API read reflection
  try {
    clientStorageApi.recordAuditLog(auditRecord);
  } catch (err) {
    console.warn('Local audit log storage warning:', err);
  }

  // 2. Persist to Firestore 'auditLogs' collection if cloud quota is available
  if (!isFirestoreQuotaExhausted()) {
    try {
      const docRef = doc(db, 'auditLogs', logId);
      await setDoc(docRef, cleanForFirestore(auditRecord), { merge: true });
    } catch (fireErr) {
      if (isQuotaError(fireErr)) {
        markFirestoreQuotaExhausted();
      }
      console.warn('Firestore auditLogs setDoc notice:', fireErr);
    }
  }

  // 3. Dispatch browser event for active dashboard view listeners
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('madrasa_audit_log_added', { detail: auditRecord })
    );
  }

  return auditRecord;
}
