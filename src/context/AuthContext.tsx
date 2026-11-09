import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, InstitutionSettings } from '../types';
import { Language, translations } from '../i18n';
import { clientStorageApi } from '../services/clientStorageApi';
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
  const [user, setUser] = useState<User | null>(() => clientStorageApi.getCurrentUser());
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('madrasa_auth_token'));
  const [lang, setLangState] = useState<Language>(() => (localStorage.getItem('madrasa_lang') as Language) || 'en');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [institutionSettings, setInstitutionSettings] = useState<InstitutionSettings | null>(() =>
    clientStorageApi.getSettings()
  );

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
    const current = clientStorageApi.getCurrentUser();
    if (current && current.role === 'teacher' && !isFirestoreQuotaExhausted()) {
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 2500)
        );
        const tDoc = await Promise.race([
          getDoc(doc(db, 'teachers', current.id)),
          timeoutPromise,
        ]);
        if (tDoc.exists()) {
          const tData = tDoc.data();
          const asgs = Array.isArray(tData.assignedSubjects)
            ? tData.assignedSubjects
            : (Array.isArray(tData.assignments) ? tData.assignments : []);
          const updatedUser: User = {
            ...current,
            ...tData,
            assignments: asgs,
            assignedSubjects: asgs,
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
        console.warn('Could not refresh teacher doc from Firestore:', fErr);
      }
    } else if (current && current.role === 'parent' && !isFirestoreQuotaExhausted()) {
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 2500)
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
    try {
      // 1. Fresh cloud fetch on login: fetch fresh teachers from Firestore if quota is available
      if (!isFirestoreQuotaExhausted()) {
        try {
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), 2500)
          );
          const teachersSnap = await Promise.race([
            getDocs(collection(db, 'teachers')),
            timeoutPromise,
          ]);
          if (!teachersSnap.empty) {
            const remoteTeachers = teachersSnap.docs.map(d => ({
              ...d.data(),
              id: d.id,
            } as User));
            clientStorageApi.syncTeachersFromRemote(remoteTeachers);
          }
        } catch (syncErr) {
          if (isQuotaError(syncErr)) {
            markFirestoreQuotaExhausted();
          }
          console.warn('Could not pre-sync teachers from Firestore on login:', syncErr);
        }
      }

      const res = clientStorageApi.login(username, pass);
      if (!res.success || !res.user || !res.token) {
        return { success: false, error: res.error || 'Authentication failed. Please check your credentials.' };
      }

      // If user is teacher, ensure their fresh document with assignedSubjects is active
      if (res.user.role === 'teacher' && !isFirestoreQuotaExhausted()) {
        try {
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), 2500)
          );
          const tDoc = await Promise.race([
            getDoc(doc(db, 'teachers', res.user.id)),
            timeoutPromise,
          ]);
          if (tDoc.exists()) {
            const tData = tDoc.data();
            const asgs = Array.isArray(tData.assignedSubjects)
              ? tData.assignedSubjects
              : (Array.isArray(tData.assignments) ? tData.assignments : []);
            const updatedUser: User = {
              ...res.user,
              ...tData,
              assignments: asgs,
              assignedSubjects: asgs,
            } as User;
            clientStorageApi.setCurrentUser(updatedUser);
            res.user = updatedUser;
          }
        } catch (fErr) {
          if (isQuotaError(fErr)) {
            markFirestoreQuotaExhausted();
          }
          console.warn('Could not fetch teacher doc from Firestore during login:', fErr);
        }
      }

      // If user is parent, ensure fresh parent doc from Firestore with linkedStudentIds is loaded
      if (res.user.role === 'parent' && !isFirestoreQuotaExhausted()) {
        try {
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), 2500)
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

      // On user login (Teacher, Parent, or Admin), prompt for Notification Permissions & store FCM token
      requestNotificationPermissionAndToken(res.user).catch(e =>
        console.warn('[FCM] Notification token request error:', e)
      );

      // Trigger immutable audit logging for system access
      if (res.user.role === 'admin') {
        logAuditEvent({
          action: 'ADMIN_LOGIN',
          details: `Admin ${res.user.name} logged in successfully.`,
          user: res.user.name,
          role: res.user.role,
          userId: res.user.id,
          currentUser: res.user,
        }).catch(e => console.warn('Audit log error:', e));
      } else if (res.user.role === 'teacher') {
        logAuditEvent({
          action: 'TEACHER_LOGIN',
          details: `Teacher ${res.user.name} logged in successfully.`,
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
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
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

