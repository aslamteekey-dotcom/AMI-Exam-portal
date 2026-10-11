import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';
import { Language, translations } from '../i18n';
import { clientStorageApi } from '../services/clientStorageApi';

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
  };

  const t = translations[lang];

  const fetchWithAuth = async (url: string, options: RequestInit = {}): Promise<Response> => {
    return clientStorageApi.handleRequest(url, options);
  };

  const refreshUser = async () => {
    const current = clientStorageApi.getCurrentUser();
    setUser(current);
    setIsLoading(false);
  };

  useEffect(() => {
    refreshUser();
  }, [token]);

  const login = async (username: string, pass: string) => {
    try {
      const res = clientStorageApi.login(username, pass);
      if (!res.success || !res.user || !res.token) {
        return { success: false, error: res.error || 'Authentication failed. Please check your credentials.' };
      }
      setToken(res.token);
      setUser(res.user);
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

