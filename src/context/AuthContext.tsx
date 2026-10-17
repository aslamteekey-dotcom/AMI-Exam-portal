import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';
import { Language, translations } from '../i18n';
import { clientStorageApi } from '../services/clientStorageApi';
import { db } from '../services/firebase';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { logAuditEvent } from '../services/auditLogger';

// Pure client-side authentication and mock API routes running 100% in-browser on Vercel

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  lang: Language;
  t: typeof translations['en'];
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

  const t = translations[lang];

  const fetchWithAuth = async (url: string, options: RequestInit = {}): Promise<Response> => {
    return clientStorageApi.handleRequest(url, options);
  };

  const refreshUser = async () => {
    const current = clientStorageApi.getCurrentUser();
    if (current && current.role === 'teacher') {
      try {
        const tDoc = await getDoc(doc(db, 'teachers', current.id));
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
        console.warn('Could not refresh teacher doc from Firestore:', fErr);
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
      // 1. Fresh cloud fetch on login: fetch fresh teachers from Firestore to ensure assignments and credentials sync across devices
      try {
        const teachersSnap = await getDocs(collection(db, 'teachers'));
        if (!teachersSnap.empty) {
          const remoteTeachers = teachersSnap.docs.map(d => ({
            ...d.data(),
            id: d.id,
          } as User));
          clientStorageApi.syncTeachersFromRemote(remoteTeachers);
        }
      } catch (syncErr) {
        console.warn('Could not pre-sync teachers from Firestore on login:', syncErr);
      }

      const res = clientStorageApi.login(username, pass);
      if (!res.success || !res.user || !res.token) {
        return { success: false, error: res.error || 'Authentication failed. Please check your credentials.' };
      }

      // If user is teacher, ensure their fresh document with assignedSubjects is active
      if (res.user.role === 'teacher') {
        try {
          const tDoc = await getDoc(doc(db, 'teachers', res.user.id));
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
          console.warn('Could not fetch teacher doc from Firestore during login:', fErr);
        }
      }

      setToken(res.token);
      setUser(res.user);

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

