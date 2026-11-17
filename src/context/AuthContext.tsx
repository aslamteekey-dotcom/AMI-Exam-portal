import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { User, InstitutionSettings } from '../types';
import { Language, translations } from '../i18n';
import { clientStorageApi, clientHashPassword } from '../services/clientStorageApi';
import { db, isFirestoreQuotaExhausted, markFirestoreQuotaExhausted, isQuotaError } from '../services/firebase';
import { collection, getDocs, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { logAuditEvent } from '../services/auditLogger';
import { requestNotificationPermissionAndToken } from '../services/notificationService';

// Disable caching for Vercel / server routes
export const revalidate = 0;
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  authError: string | null;
  clearAuthError: () => void;
  lang: Language;
  t: typeof translations['en'];
  institutionSettings: InstitutionSettings | null;
  updateInstitutionSettings: (newSettings: Partial<InstitutionSettings>) => Promise<void>;
  setLang: (l: Language) => void;
  login: (username: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Strictly null until verified from live database (prevents stale/dummy teacher flash)
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('madrasa_auth_token'));
  const [lang, setLangState] = useState<Language>(() => (localStorage.getItem('madrasa_lang') as Language) || 'en');
  const [isLoading, setIsLoading] = useState<boolean>(() => Boolean(localStorage.getItem('madrasa_auth_token')));
  const [authError, setAuthError] = useState<string | null>(null);
  const [institutionSettings, setInstitutionSettings] = useState<InstitutionSettings | null>(() =>
    clientStorageApi.getSettings()
  );
  const cachePurgedRef = useRef(false);

  const clearAuthError = () => setAuthError(null);

  const runCacheBustingPurge = () => {
    if (cachePurgedRef.current) return;
    cachePurgedRef.current = true;
    clientStorageApi.purgeCorruptedTeacherCache();
    // If purge removed a dummy teacher's token, sync React token state
    const survivingToken = localStorage.getItem('madrasa_auth_token');
    if (!survivingToken && token) {
      setToken(null);
      setIsLoading(false);
    }
  };

  // Automated cache-busting on initialization: purge corrupted/dummy teacher localStorage keys
  // while preserving valid auth tokens
  useEffect(() => {
    runCacheBustingPurge();
  }, []);

  const setLang = (l: Language) => {
    setLangState(l);
    localStorage.setItem('madrasa_lang', l);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = l;
    }
  };

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
  }, [lang]);

  // Dynamically update document title whenever institution settings or language changes
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const activeName =
        lang === 'ml'
          ? institutionSettings?.madrasaNameMl || institutionSettings?.madrasaNameEn
          : institutionSettings?.madrasaNameEn || institutionSettings?.madrasaNameMl;
      if (activeName) {
        document.title = activeName;
      }
    }
  }, [institutionSettings, lang]);

  // Real-time synchronization of Institution Settings (Madrasa Name, Contacts, Branding) from Firestore
  useEffect(() => {
    // 1. Initial fetch from API with no-store cache control
    clientStorageApi
      .handleRequest('/api/settings', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        if (data && (data.madrasaNameEn || data.institutionName)) {
          setInstitutionSettings(prev => ({ ...(prev || {}), ...data }));
        }
      })
      .catch(() => {});

    // 2. Real-time Firestore onSnapshot listener
    if (!isFirestoreQuotaExhausted()) {
      try {
        const unsub = onSnapshot(doc(db, 'settings', 'institution'), snapshot => {
          if (snapshot.exists()) {
            const data = snapshot.data() as InstitutionSettings;
            const nameEn = data.madrasaNameEn || data.institutionName || '';
            const nameMl = data.madrasaNameMl || data.institutionNameMl || '';
            const normalized = {
              ...data,
              madrasaNameEn: nameEn,
              institutionName: nameEn,
              madrasaNameMl: nameMl,
              institutionNameMl: nameMl,
            };
            setInstitutionSettings(prev => {
              const merged = { ...(prev || {}), ...normalized };
              try {
                localStorage.setItem('madrasa_institution_settings', JSON.stringify(merged));
              } catch {}
              return merged;
            });
            clientStorageApi.updateSettingsFromRemote(normalized);
          }
        });

        return () => unsub();
      } catch (err) {
        console.warn('Real-time settings listener error:', err);
      }
    }
  }, []);

  // Listen for local settings update broadcasts
  useEffect(() => {
    const handleSettingsUpdated = (e: any) => {
      if (e.detail) {
        setInstitutionSettings(prev => ({ ...(prev || {}), ...e.detail }));
      }
    };
    window.addEventListener('madrasa_settings_updated', handleSettingsUpdated);
    return () => window.removeEventListener('madrasa_settings_updated', handleSettingsUpdated);
  }, []);

  const updateInstitutionSettings = async (newSettings: Partial<InstitutionSettings>) => {
    const nameEn = (newSettings.madrasaNameEn !== undefined ? newSettings.madrasaNameEn : newSettings.institutionName) ?? institutionSettings?.madrasaNameEn ?? '';
    const nameMl = (newSettings.madrasaNameMl !== undefined ? newSettings.madrasaNameMl : newSettings.institutionNameMl) ?? institutionSettings?.madrasaNameMl ?? '';
    const updated = {
      ...(institutionSettings || {}),
      ...newSettings,
      madrasaNameEn: nameEn,
      institutionName: nameEn,
      madrasaNameMl: nameMl,
      institutionNameMl: nameMl,
    } as InstitutionSettings;

    setInstitutionSettings(updated);
    try {
      localStorage.setItem('madrasa_institution_settings', JSON.stringify(updated));
    } catch {}

    await fetchWithAuth('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
  };

  const t = translations[lang];

  const fetchWithAuth = async (url: string, options: RequestInit = {}): Promise<Response> => {
    // Enforce no-store on all authenticated fetch requests
    return clientStorageApi.handleRequest(url, {
      cache: 'no-store',
      ...options,
    });
  };

  const refreshUser = async () => {
    runCacheBustingPurge();

    const activeToken = localStorage.getItem('madrasa_auth_token');
    if (!activeToken) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setAuthError(null);

    const current = clientStorageApi.getCurrentUser();
    if (!current) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    if (current.role === 'teacher') {
      // Strictly fetch teacher profile from live Firestore — never fall back to local/mock teacher data
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Database connection timed out')), 10000)
        );
        let tSnap = await Promise.race([
          getDoc(doc(db, 'teachers', current.id)),
          timeoutPromise,
        ]);

        if (!tSnap.exists() && current.username) {
          const allTeachersSnap = await Promise.race([
            getDocs(collection(db, 'teachers')),
            timeoutPromise,
          ]);
          const matched = allTeachersSnap.docs.find(
            d => String(d.data()?.username || '').trim().toLowerCase() === String(current.username).trim().toLowerCase()
          );
          if (matched) {
            tSnap = matched as any;
          }
        }

        if (!tSnap.exists()) {
          clientStorageApi.logout();
          setToken(null);
          setUser(null);
          setAuthError('Your teacher account was not found in the live database. Please sign in again.');
          setIsLoading(false);
          return;
        }

        const tData = tSnap.data();
        if (tData.active === false) {
          clientStorageApi.logout();
          setToken(null);
          setUser(null);
          setAuthError('Your teacher account has been deactivated.');
          setIsLoading(false);
          return;
        }

        const asgs = Array.isArray(tData.assignedSubjects)
          ? tData.assignedSubjects
          : (Array.isArray(tData.assignments) ? tData.assignments : []);

        const liveTeacherUser: User = {
          ...(tData as User),
          id: tSnap.id,
          role: 'teacher',
          assignments: asgs,
          assignedSubjects: asgs,
        };

        clientStorageApi.setCurrentUser(liveTeacherUser);
        clientStorageApi.syncTeachersFromRemote([liveTeacherUser]);
        setUser(liveTeacherUser);
        setAuthError(null);
        setIsLoading(false);
        return;
      } catch (fErr) {
        if (isQuotaError(fErr)) {
          markFirestoreQuotaExhausted();
        }
        console.error('Failed to verify teacher profile from live Firestore:', fErr);
        // Never fallback to cached/dummy teacher data on DB fetch failure
        setUser(null);
        setAuthError('Failed to fetch teacher profile from live database. Please check your connection and try again.');
        setIsLoading(false);
        return;
      }
    }

    if (current.role === 'parent' && !isFirestoreQuotaExhausted()) {
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 5000)
        );
        const pDoc = await Promise.race([
          getDoc(doc(db, 'parents', current.id)),
          timeoutPromise,
        ]);
        if (pDoc.exists()) {
          const pData = pDoc.data();
          const updatedUser: User = {
            ...current,
            ...pData,
            id: pDoc.id,
            role: 'parent',
          } as User;
          clientStorageApi.setCurrentUser(updatedUser);
          setUser(updatedUser);
          setIsLoading(false);
          return;
        }
      } catch (fErr) {
        if (isQuotaError(fErr)) {
          markFirestoreQuotaExhausted();
        }
        console.warn('Could not refresh parent doc from Firestore:', fErr);
      }
    }

    setUser(current);
    setIsLoading(false);
  };

  useEffect(() => {
    refreshUser();
  }, [token]);

  const login = async (username: string, pass: string) => {
    setAuthError(null);
    const trimmedUsername = username.trim();
    const trimmedLower = trimmedUsername.toLowerCase();
    const trimmedPass = pass.trim();
    const cleanDigits = trimmedLower.replace(/\D/g, '');

    try {
      // Admin / Principal shortcut
      if (trimmedLower === 'principal' || trimmedLower === 'admin') {
        const adminRes = clientStorageApi.login(trimmedUsername, trimmedPass);
        if (!adminRes.success || !adminRes.user || !adminRes.token) {
          return { success: false, error: adminRes.error || 'Authentication failed. Please check your credentials.' };
        }
        setToken(adminRes.token);
        setUser(adminRes.user);
        requestNotificationPermissionAndToken(adminRes.user).catch(e =>
          console.warn('[FCM] Notification token request error:', e)
        );
        logAuditEvent({
          action: 'ADMIN_LOGIN',
          details: `Admin ${adminRes.user.name} logged in successfully.`,
          user: adminRes.user.name,
          role: adminRes.user.role,
          userId: adminRes.user.id,
          currentUser: adminRes.user,
        }).catch(e => console.warn('Audit log error:', e));
        return { success: true };
      }

      // Strictly authenticate teachers against the live Firestore database (no local mock fallback)
      let remoteTeachers: User[] = [];
      let firestoreTeachersReachable = false;
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Database connection timed out')), 10000)
        );
        const teachersSnap = await Promise.race([
          getDocs(collection(db, 'teachers')),
          timeoutPromise,
        ]);
        firestoreTeachersReachable = true;
        remoteTeachers = teachersSnap.docs.map(d => ({
          ...(d.data() as User),
          id: d.id,
          role: 'teacher',
        }));
        clientStorageApi.syncTeachersFromRemote(remoteTeachers);
      } catch (syncErr) {
        if (isQuotaError(syncErr)) {
          markFirestoreQuotaExhausted();
        }
        console.error('Live Firestore teacher authentication failed:', syncErr);
      }

      if (firestoreTeachersReachable) {
        const matchedTeacher = remoteTeachers.find(t => {
          const uname = String(t.username || '').trim().toLowerCase();
          const uDigits = uname.replace(/\D/g, '');
          const pDigits = String(t.phone || '').replace(/\D/g, '');
          return (
            uname === trimmedLower ||
            (cleanDigits.length >= 6 && uDigits === cleanDigits) ||
            (cleanDigits.length >= 6 && pDigits === cleanDigits)
          );
        });

        if (matchedTeacher) {
          if (matchedTeacher.active === false) {
            return { success: false, error: 'Account is deactivated' };
          }

          const isPasswordMatch =
            matchedTeacher.plainPassword === trimmedPass ||
            (matchedTeacher as any).passwordHash === clientHashPassword(trimmedPass);

          if (!isPasswordMatch) {
            return { success: false, error: 'Invalid password' };
          }

          // Re-fetch authoritative live teacher document by ID
          let authoritativeDocData: any = matchedTeacher;
          try {
            const tDoc = await Promise.race([
              getDoc(doc(db, 'teachers', matchedTeacher.id)),
              new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 8000)),
            ]);
            if (tDoc.exists()) {
              authoritativeDocData = { ...tDoc.data(), id: tDoc.id };
            }
          } catch (docErr) {
            console.warn('Could not re-fetch single teacher doc, using live query snapshot:', docErr);
          }

          const asgs = Array.isArray(authoritativeDocData.assignedSubjects)
            ? authoritativeDocData.assignedSubjects
            : (Array.isArray(authoritativeDocData.assignments) ? authoritativeDocData.assignments : []);

          const liveTeacherUser: User = {
            ...(authoritativeDocData as User),
            id: authoritativeDocData.id || matchedTeacher.id,
            role: 'teacher',
            assignments: asgs,
            assignedSubjects: asgs,
          };

          clientStorageApi.setCurrentUser(liveTeacherUser);
          const issuedToken = localStorage.getItem('madrasa_auth_token') || `token_${liveTeacherUser.id}_${Date.now()}`;
          localStorage.setItem('madrasa_auth_token', issuedToken);
          setToken(issuedToken);
          setUser(liveTeacherUser);

          requestNotificationPermissionAndToken(liveTeacherUser).catch(e =>
            console.warn('[FCM] Notification token request error:', e)
          );

          logAuditEvent({
            action: 'TEACHER_LOGIN',
            details: `Teacher ${liveTeacherUser.name} logged in successfully.`,
            user: liveTeacherUser.name,
            role: liveTeacherUser.role,
            userId: liveTeacherUser.id,
            currentUser: liveTeacherUser,
          }).catch(e => console.warn('Audit log error:', e));

          return { success: true };
        }
      }

      // Check live parents (and sub-admins) if user is not a teacher in live Firestore
      if (!isFirestoreQuotaExhausted()) {
        try {
          const parentsSnap = await Promise.race([
            getDocs(collection(db, 'parents')),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 6000)),
          ]);
          if (!parentsSnap.empty) {
            const remoteParents: User[] = parentsSnap.docs.map(d => ({
              ...(d.data() as User),
              id: d.id,
              role: 'parent' as const,
            }));
            const dbRef = clientStorageApi.getDB();
            const nonParents = dbRef.users.filter(u => u.role !== 'parent');
            dbRef.users = [...nonParents, ...remoteParents];
          }
        } catch {}
      }

      // Check local non-teacher accounts (parents / sub-admins)
      const res = clientStorageApi.login(trimmedUsername, trimmedPass);
      if (!res.success || !res.user || !res.token) {
        if (!firestoreTeachersReachable) {
          return {
            success: false,
            error: 'Unable to reach the live database to verify credentials. Please check your connection and try again.',
          };
        }
        return { success: false, error: res.error || 'Authentication failed. Please check your credentials.' };
      }

      // Safety guard: never allow a non-live teacher login fallback
      if (res.user.role === 'teacher') {
        clientStorageApi.logout();
        return {
          success: false,
          error: 'Unable to verify teacher account against the live database. Please try again.',
        };
      }

      // If user is parent, ensure fresh parent doc from Firestore with linkedStudentIds is loaded
      if (res.user.role === 'parent' && !isFirestoreQuotaExhausted()) {
        try {
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), 4000)
          );
          const pDoc = await Promise.race([
            getDoc(doc(db, 'parents', res.user.id)),
            timeoutPromise,
          ]);
          if (pDoc.exists()) {
            const pData = pDoc.data();
            const updatedUser: User = {
              ...res.user,
              ...pData,
              id: pDoc.id,
              role: 'parent',
            } as User;
            clientStorageApi.setCurrentUser(updatedUser);
            res.user = updatedUser;
          }
        } catch (fErr) {
          if (isQuotaError(fErr)) {
            markFirestoreQuotaExhausted();
          }
          console.warn('Could not fetch parent doc from Firestore during login:', fErr);
        }
      }

      setToken(res.token);
      setUser(res.user);

      requestNotificationPermissionAndToken(res.user).catch(e =>
        console.warn('[FCM] Notification token request error:', e)
      );

      if (res.user.role === 'admin') {
        logAuditEvent({
          action: 'ADMIN_LOGIN',
          details: `Admin ${res.user.name} logged in successfully.`,
          user: res.user.name,
          role: res.user.role,
          userId: res.user.id,
          currentUser: res.user,
        }).catch(e => console.warn('Audit log error:', e));
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Login error' };
    }
  };

  const logout = () => {
    clientStorageApi.logout();
    setToken(null);
    setUser(null);
    setAuthError(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        authError,
        clearAuthError,
        lang,
        t,
        institutionSettings,
        updateInstitutionSettings,
        setLang,
        login,
        logout,
        refreshUser,
        fetchWithAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

