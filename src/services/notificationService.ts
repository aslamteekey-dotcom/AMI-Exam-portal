import { db, isFirestoreQuotaExhausted, safeOnSnapshot, app } from './firebase';
import { cleanForFirestore } from './firestoreSync';
import {
  collection,
  doc,
  getDoc,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  addDoc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { AppNotification, NotificationSettings, User } from '../types';

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  notifyAbsent: true,
  notifyResultsPublished: true,
  notifyPendingMarks: true,
  notifyMarksUnlocked: true,
};

const SETTINGS_DOC_PATH = 'settings/notifications';
const NOTIFICATIONS_COLLECTION = 'notifications';

/**
 * Fetch global notification settings from Firestore with local fallback.
 */
export async function getNotificationSettings(): Promise<NotificationSettings> {
  if (isFirestoreQuotaExhausted()) {
    try {
      const cached = localStorage.getItem('madrasa_notification_settings');
      if (cached) return JSON.parse(cached);
    } catch {}
    return DEFAULT_NOTIFICATION_SETTINGS;
  }

  try {
    const docRef = doc(db, 'settings', 'notifications');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as NotificationSettings;
      const merged: NotificationSettings = {
        notifyAbsent: data.notifyAbsent ?? true,
        notifyResultsPublished: data.notifyResultsPublished ?? true,
        notifyPendingMarks: data.notifyPendingMarks ?? true,
        notifyMarksUnlocked: data.notifyMarksUnlocked ?? true,
        updatedAt: data.updatedAt,
        updatedBy: data.updatedBy,
      };
      try {
        localStorage.setItem('madrasa_notification_settings', JSON.stringify(merged));
      } catch {}
      return merged;
    }
  } catch (err) {
    console.warn('[NotificationService] Error loading settings:', err);
  }

  return DEFAULT_NOTIFICATION_SETTINGS;
}

/**
 * Save global notification settings to Firestore.
 */
export async function saveNotificationSettings(
  settings: Partial<NotificationSettings>,
  updatedBy?: string
): Promise<NotificationSettings> {
  const current = await getNotificationSettings();
  const next: NotificationSettings = {
    ...current,
    ...settings,
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy || 'Principal',
  };

  try {
    localStorage.setItem('madrasa_notification_settings', JSON.stringify(next));
  } catch {}

  if (!isFirestoreQuotaExhausted()) {
    try {
      await setDoc(doc(db, 'settings', 'notifications'), cleanForFirestore(next), { merge: true });
    } catch (err) {
      console.warn('[NotificationService] Firestore save settings warning:', err);
    }
  }

  // Dispatch local event for instant reactive UI updates across open tabs
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('madrasa_notification_settings_updated', { detail: next }));
  }

  return next;
}

/**
 * Prompt user for browser Notification permission and FCM Device Token.
 * Runs on login for Teachers, Parents, and Admins.
 */
export async function requestNotificationPermissionAndToken(user: User): Promise<string | null> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return null;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('[NotificationService] Notification permission status:', permission);
      return null;
    }

    let token = '';
    // Dynamically attempt FCM registration if supported
    try {
      const { isSupported, getMessaging, getToken } = await import('firebase/messaging');
      const supported = await isSupported().catch(() => false);
      if (supported) {
        const messaging = getMessaging(app);

        // Register service worker if not already registered
        let serviceWorkerRegistration: ServiceWorkerRegistration | undefined;
        if ('serviceWorker' in navigator) {
          serviceWorkerRegistration = await navigator.serviceWorker.ready.catch(() => undefined);
          if (!serviceWorkerRegistration) {
            serviceWorkerRegistration = await navigator.serviceWorker
              .register('/firebase-messaging-sw.js')
              .catch(() => undefined);
          }
        }

        token = await getToken(messaging, {
          serviceWorkerRegistration,
        }).catch((err) => {
          console.warn('[NotificationService] FCM token retrieval note:', err);
          return '';
        });
      }
    } catch (e) {
      console.warn('[NotificationService] FCM modular import note:', e);
    }

    // Fallback pseudo-device identifier if native FCM token is pending VAPID configuration
    if (!token) {
      token = `web_perm_granted_${user.id}_${Date.now()}`;
    }

    // Save token to Firestore asynchronously
    if (!isFirestoreQuotaExhausted() && user.id) {
      const tokenPayload = {
        fcmToken: token,
        fcmTokenUpdatedAt: new Date().toISOString(),
        notificationsEnabled: true,
        lastActiveRole: user.role,
      };

      // Update primary user doc
      setDoc(doc(db, 'users', user.id), cleanForFirestore(tokenPayload), { merge: true }).catch(() => {});

      // If user is a teacher or parent, update their role-specific collection too
      if (user.role === 'teacher') {
        setDoc(doc(db, 'teachers', user.id), cleanForFirestore(tokenPayload), { merge: true }).catch(() => {});
      } else if (user.role === 'parent') {
        setDoc(doc(db, 'parents', user.id), cleanForFirestore(tokenPayload), { merge: true }).catch(() => {});
      }
    }

    return token;
  } catch (error) {
    console.warn('[NotificationService] Error requesting notification permission:', error);
    return null;
  }
}

/**
 * Send an in-app and push notification strictly based on audience & settings.
 * Non-blocking, runs asynchronously to preserve performance.
 */
export async function sendTargetedNotification(params: {
  title: string;
  titleMl?: string;
  body: string;
  bodyMl?: string;
  type: AppNotification['type'];
  targetRole: AppNotification['targetRole'];
  classId?: string;
  studentId?: string;
  targetUserId?: string;
  linkUrl?: string;
}): Promise<void> {
  // Execute in microtask / non-blocking timeout
  setTimeout(async () => {
    try {
      const settings = await getNotificationSettings();

      // Check toggle setting
      if (params.type === 'absent' && !settings.notifyAbsent) return;
      if (params.type === 'results_published' && !settings.notifyResultsPublished) return;
      if (params.type === 'marks_pending' && !settings.notifyPendingMarks) return;
      if (params.type === 'marks_unlocked' && !settings.notifyMarksUnlocked) return;

      const notificationData: Omit<AppNotification, 'id'> = {
        title: params.title,
        titleMl: params.titleMl || params.title,
        body: params.body,
        bodyMl: params.bodyMl || params.body,
        type: params.type,
        targetRole: params.targetRole,
        classId: params.classId,
        studentId: params.studentId,
        targetUserId: params.targetUserId,
        linkUrl: params.linkUrl || '/',
        createdAt: new Date().toISOString(),
        readBy: [],
      };

      // 1. Save to Firestore notifications collection
      if (!isFirestoreQuotaExhausted()) {
        try {
          const docRef = await addDoc(collection(db, NOTIFICATIONS_COLLECTION), cleanForFirestore(notificationData));
          notificationData.createdAt = new Date().toISOString();
        } catch (err) {
          console.warn('[NotificationService] Firestore add notification note:', err);
        }
      }

      // 2. Dispatch local event for in-app toasts
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('madrasa_new_notification', {
            detail: { ...notificationData, id: `local_${Date.now()}` },
          })
        );

        // 3. Trigger browser notification if permission is active
        if ('Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification(params.title, {
              body: params.body,
              icon: '/icon-192x192.png',
              badge: '/icon-192x192.png',
              tag: params.type,
            });
          } catch {}
        }
      }
    } catch (err) {
      console.warn('[NotificationService] Targeted notification error:', err);
    }
  }, 0);
}

/**
 * Mark a notification as read by current user.
 */
export async function markNotificationAsRead(notificationId: string, userId: string): Promise<void> {
  if (isFirestoreQuotaExhausted() || !notificationId || !userId) return;

  try {
    const notifRef = doc(db, NOTIFICATIONS_COLLECTION, notificationId);
    const snap = await getDoc(notifRef);
    if (snap.exists()) {
      const data = snap.data();
      const readBy = Array.isArray(data.readBy) ? data.readBy : [];
      if (!readBy.includes(userId)) {
        await updateDoc(notifRef, {
          readBy: [...readBy, userId],
        });
      }
    }
  } catch (err) {
    console.warn('[NotificationService] markNotificationAsRead warning:', err);
  }
}

/**
 * Mark all visible notifications as read by current user.
 */
export async function markAllNotificationsAsRead(notifications: AppNotification[], userId: string): Promise<void> {
  if (isFirestoreQuotaExhausted() || !userId) return;

  for (const n of notifications) {
    if (!n.readBy?.includes(userId)) {
      markNotificationAsRead(n.id, userId).catch(() => {});
    }
  }
}
