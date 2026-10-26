import { useState, useEffect, useCallback, useMemo } from 'react';
import { db, safeOnSnapshot, isFirestoreQuotaExhausted } from '../services/firebase';
import {
  collection,
  doc,
  getDocs,
  updateDoc,
  setDoc,
  query,
  where,
} from 'firebase/firestore';
import { AttendanceUnlockRequest, DailyAttendanceRecord, isClassMatch } from '../types';
import { cleanForFirestore } from '../services/firestoreSync';

export interface DateLockStatus {
  dateStr: string;
  isFuture: boolean;
  isHoliday: boolean;
  isRecorded: boolean;
  isLocked: boolean;
  isUnlockedByPrincipal: boolean;
  isPendingApproval: boolean;
  isRejected: boolean;
  activeRequest?: AttendanceUnlockRequest;
  canEdit: boolean;
}

export interface UseAttendanceLocksOptions {
  classId: string;
  isDateHoliday?: (dateStr: string, classId?: string) => boolean;
  todayStr: string;
  academicYearStartDate?: string;
  dailyRecords?: Record<string, DailyAttendanceRecord>;
  classLockedDays?: Record<string, boolean>;
}

export const useAttendanceLocks = ({
  classId,
  isDateHoliday,
  todayStr,
  academicYearStartDate = '2026-06-01',
  dailyRecords = {},
  classLockedDays = {},
}: UseAttendanceLocksOptions) => {
  const [unlockRequests, setUnlockRequests] = useState<AttendanceUnlockRequest[]>([]);
  const [centralLockedDays, setCentralLockedDays] = useState<Record<string, boolean>>({});
  const [localLockedOverrides, setLocalLockedOverrides] = useState<Record<string, boolean>>({});

  // 1. Real-time Firestore Listener on attendanceUnlockRequests
  useEffect(() => {
    if (isFirestoreQuotaExhausted()) return;

    const unsubs: (() => void)[] = [];

    try {
      const unsubPrimary = safeOnSnapshot(
        collection(db, 'attendanceUnlockRequests'),
        snapshot => {
          const reqs: AttendanceUnlockRequest[] = snapshot.docs.map(docSnap => {
            const data = docSnap.data() as AttendanceUnlockRequest;
            return {
              ...data,
              id: docSnap.id,
              createdAt: data.createdAt || data.requestedAt,
              requestedAt: data.requestedAt || data.createdAt,
            };
          });
          setUnlockRequests(reqs);
        },
        error => {
          console.warn('Real-time attendanceUnlockRequests listener error:', error);
        }
      );
      unsubs.push(unsubPrimary);
    } catch (e) {
      console.warn('Failed to subscribe to attendanceUnlockRequests:', e);
    }

    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, []);

  // 2. Real-time Firestore Listener on attendanceLocks
  useEffect(() => {
    if (!classId || isFirestoreQuotaExhausted()) return;

    const unsubs: (() => void)[] = [];

    try {
      const unsubLocks = safeOnSnapshot(
        collection(db, 'attendanceLocks'),
        snapshot => {
          const mergedLocks: Record<string, boolean> = {};
          snapshot.docs.forEach(docSnap => {
            const data = docSnap.data() as any;
            if (data && (data.classId === classId || docSnap.id.startsWith(`${classId}_`))) {
              if (data.lockedDays && typeof data.lockedDays === 'object') {
                Object.assign(mergedLocks, data.lockedDays);
              }
            }
          });
          setCentralLockedDays(mergedLocks);
        },
        error => {
          console.warn('Real-time attendanceLocks listener error:', error);
        }
      );
      unsubs.push(unsubLocks);
    } catch (e) {
      console.warn('Failed to subscribe to attendanceLocks:', e);
    }

    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, [classId]);

  // Find active or matching request for a date and class
  const getRequestForDate = useCallback(
    (dateStr: string, targetClassId?: string): AttendanceUnlockRequest | undefined => {
      const targetClass = targetClassId || classId;
      if (!targetClass) return undefined;

      const matching = unlockRequests.filter(r => {
        if (r.classId && r.classId !== targetClass && !isClassMatch([targetClass], r.classId)) {
          return false;
        }
        if ((r.mode === 'range' || (r.startDate && r.endDate)) && r.startDate && r.endDate) {
          return dateStr >= r.startDate && dateStr <= r.endDate;
        }
        return r.date === dateStr || r.startDate === dateStr;
      });

      if (matching.length === 0) return undefined;

      // Priority: 1. Approved (Active), 2. Pending, 3. Most recently updated
      const approved = matching.find(r => r.status === 'approved');
      if (approved) return approved;

      const pending = matching.find(r => r.status === 'pending');
      if (pending) return pending;

      // Sort by latest timestamp
      matching.sort((a, b) => {
        const timeA = new Date(a.resolvedAt || a.approvedAt || a.createdAt || a.requestedAt || 0).getTime();
        const timeB = new Date(b.resolvedAt || b.approvedAt || b.createdAt || b.requestedAt || 0).getTime();
        return timeB - timeA;
      });

      return matching[0];
    },
    [unlockRequests, classId]
  );

  // Check if date is recorded with student marks
  const isDateRecorded = useCallback(
    (dateStr: string, recordOverride?: DailyAttendanceRecord): boolean => {
      const rec = recordOverride || dailyRecords[dateStr];
      if (!rec) return false;
      if ((rec.isHoliday || (rec as any).status === 'holiday') && !(isDateHoliday && isDateHoliday(dateStr, classId))) {
        return false;
      }
      const hasStudentMarks =
        (rec.presentStudentIds && rec.presentStudentIds.length > 0) ||
        (rec.absentStudentIds && rec.absentStudentIds.length > 0) ||
        (rec.statusMap && Object.keys(rec.statusMap).length > 0);
      return Boolean(hasStudentMarks || rec.markedAt);
    },
    [dailyRecords, isDateHoliday, classId]
  );

  // Unified single-source-of-truth lock status evaluator
  const getDateLockStatus = useCallback(
    (dateStr: string, recordOverride?: DailyAttendanceRecord): DateLockStatus => {
      const isFuture = dateStr > todayStr;
      const isHoliday = Boolean(isDateHoliday && isDateHoliday(dateStr, classId));
      const rec = recordOverride || dailyRecords[dateStr];
      const isRecorded = isDateRecorded(dateStr, rec);

      // Future dates are always locked and cannot be edited
      if (isFuture) {
        return {
          dateStr,
          isFuture: true,
          isHoliday,
          isRecorded,
          isLocked: true,
          isUnlockedByPrincipal: false,
          isPendingApproval: false,
          isRejected: false,
          canEdit: false,
        };
      }

      // Official holidays are always locked and attendance is exempt
      if (isHoliday) {
        return {
          dateStr,
          isFuture: false,
          isHoliday: true,
          isRecorded,
          isLocked: true,
          isUnlockedByPrincipal: false,
          isPendingApproval: false,
          isRejected: false,
          canEdit: false,
        };
      }

      // Local cancel/relock override active
      if (localLockedOverrides[dateStr] === true) {
        return {
          dateStr,
          isFuture: false,
          isHoliday: false,
          isRecorded,
          isLocked: true,
          isUnlockedByPrincipal: false,
          isPendingApproval: false,
          isRejected: false,
          canEdit: false,
        };
      }

      // Check unlock requests in real-time
      const activeReq = getRequestForDate(dateStr, classId);

      if (activeReq?.status === 'approved') {
        // Check if the date has been explicitly re-locked after approval
        const reqApprovedTime = activeReq.approvedAt ? new Date(activeReq.approvedAt).getTime() : 0;
        const relockedTime = rec?.relockedAt ? new Date(rec.relockedAt).getTime() : 0;
        const isRelockedAfterApproval = Boolean(
          relockedTime > 0 &&
          reqApprovedTime > 0 &&
          relockedTime >= reqApprovedTime &&
          rec?.isLocked === true &&
          rec?.unlocked === false
        );

        if (!isRelockedAfterApproval) {
          // Date is UNLOCKED BY PRINCIPAL in real-time!
          return {
            dateStr,
            isFuture: false,
            isHoliday: false,
            isRecorded,
            isLocked: false,
            isUnlockedByPrincipal: true,
            isPendingApproval: false,
            isRejected: false,
            activeRequest: activeReq,
            canEdit: true,
          };
        }
      }

      if (activeReq?.status === 'pending') {
        return {
          dateStr,
          isFuture: false,
          isHoliday: false,
          isRecorded,
          isLocked: true,
          isUnlockedByPrincipal: false,
          isPendingApproval: true,
          isRejected: false,
          activeRequest: activeReq,
          canEdit: false,
        };
      }

      if (activeReq?.status === 'rejected') {
        return {
          dateStr,
          isFuture: false,
          isHoliday: false,
          isRecorded,
          isLocked: true,
          isUnlockedByPrincipal: false,
          isPendingApproval: false,
          isRejected: true,
          activeRequest: activeReq,
          canEdit: false,
        };
      }

      // If recorded and not unlocked by Principal => Locked
      if (isRecorded) {
        return {
          dateStr,
          isFuture: false,
          isHoliday: false,
          isRecorded: true,
          isLocked: true,
          isUnlockedByPrincipal: false,
          isPendingApproval: false,
          isRejected: false,
          activeRequest: activeReq,
          canEdit: false,
        };
      }

      // If central locks or class config marks this date as locked
      const isMarkedLockedInDoc = Boolean(
        centralLockedDays[dateStr] === true ||
        classLockedDays[dateStr] === true ||
        (rec && rec.isLocked === true && !rec.unlocked)
      );

      if (isMarkedLockedInDoc) {
        return {
          dateStr,
          isFuture: false,
          isHoliday: false,
          isRecorded: false,
          isLocked: true,
          isUnlockedByPrincipal: false,
          isPendingApproval: false,
          isRejected: false,
          activeRequest: activeReq,
          canEdit: false,
        };
      }

      // Open for initial marking (today or past unrecorded working day)
      return {
        dateStr,
        isFuture: false,
        isHoliday: false,
        isRecorded: false,
        isLocked: false,
        isUnlockedByPrincipal: false,
        isPendingApproval: false,
        isRejected: false,
        activeRequest: activeReq,
        canEdit: true,
      };
    },
    [
      todayStr,
      classId,
      dailyRecords,
      centralLockedDays,
      classLockedDays,
      localLockedOverrides,
      isDateHoliday,
      isDateRecorded,
      getRequestForDate,
    ]
  );

  const isDateLocked = useCallback(
    (dateStr: string, recordOverride?: DailyAttendanceRecord): boolean => {
      return getDateLockStatus(dateStr, recordOverride).isLocked;
    },
    [getDateLockStatus]
  );

  const isDateEditing = useCallback(
    (dateStr: string, recordOverride?: DailyAttendanceRecord): boolean => {
      const status = getDateLockStatus(dateStr, recordOverride);
      return status.canEdit && status.isUnlockedByPrincipal;
    },
    [getDateLockStatus]
  );

  // Local re-lock (e.g. user clicking "Cancel" editing)
  const relockDate = useCallback((dateStr: string) => {
    setLocalLockedOverrides(prev => ({
      ...prev,
      [dateStr]: true,
    }));
  }, []);

  const clearLocalOverride = useCallback((dateStr: string) => {
    setLocalLockedOverrides(prev => {
      const next = { ...prev };
      delete next[dateStr];
      return next;
    });
  }, []);

  // Resolve unlock requests in Firestore for dates that were just saved
  const resolveUnlockRequests = useCallback(
    async (
      targetDates: string | string[],
      targetClassId: string,
      authorName: string = 'Class Teacher'
    ) => {
      const datesList = Array.isArray(targetDates) ? targetDates : [targetDates];
      if (datesList.length === 0 || !targetClassId) return;

      const nowIso = new Date().toISOString();

      try {
        // Find matching requests in attendanceUnlockRequests
        const q = query(
          collection(db, 'attendanceUnlockRequests'),
          where('classId', '==', targetClassId)
        );
        const snap = await getDocs(q);

        for (const docSnap of snap.docs) {
          const data = docSnap.data() as AttendanceUnlockRequest;
          if (data.status === 'approved' || data.status === 'pending') {
            const matches = datesList.some(dStr => {
              if ((data.mode === 'range' || (data.startDate && data.endDate)) && data.startDate && data.endDate) {
                return dStr >= data.startDate && dStr <= data.endDate;
              }
              return data.date === dStr || data.startDate === dStr;
            });

            if (matches) {
              await updateDoc(doc(db, 'attendanceUnlockRequests', docSnap.id), {
                status: 'completed',
                completedAt: nowIso,
                resolvedAt: nowIso,
                resolvedBy: authorName,
                resolutionNote: 'Attendance corrections submitted and locked',
              }).catch(() => {});
            }
          }
        }

        // Also resolve in legacy attendanceEditRequests if exists
        for (const dStr of datesList) {
          const reqId = `${targetClassId}_${dStr}`;
          try {
            await setDoc(
              doc(db, 'attendanceEditRequests', reqId),
              {
                status: 'resolved',
                resolvedAt: nowIso,
                resolvedBy: authorName,
              },
              { merge: true }
            );
          } catch {}
        }
      } catch (err) {
        console.warn('Error resolving unlock requests in Firestore:', err);
      } finally {
        // Clear any local overrides for saved dates
        datesList.forEach(d => clearLocalOverride(d));
      }
    },
    [clearLocalOverride]
  );

  return {
    unlockRequests,
    centralLockedDays,
    localLockedOverrides,
    getRequestForDate,
    isDateRecorded,
    getDateLockStatus,
    isDateLocked,
    isDateEditing,
    relockDate,
    clearLocalOverride,
    resolveUnlockRequests,
  };
};
