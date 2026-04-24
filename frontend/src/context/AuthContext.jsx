import { createContext, useContext, useEffect, useState } from 'react';
import { authApi, nastaveniApi } from '../api';
import { isModuleEnabled } from '../data/moduleConfig';
import { safeGetItem, safeRemoveItem, safeSetItem } from '../utils/storage';

const AuthContext = createContext(null);
const DEFAULT_BRANDING = {
  app_title: 'Catering CRM',
  app_logo_data_url: '',
  app_color_theme: 'ocean',
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [branding, setBranding] = useState(DEFAULT_BRANDING);
  const [loading, setLoading] = useState(true);

  const refreshBranding = async () => {
    const response = await nastaveniApi.publicBranding();
    const nextBranding = {
      app_title: response.data?.app_title || 'Catering CRM',
      app_logo_data_url: response.data?.app_logo_data_url || '',
      app_color_theme: response.data?.app_color_theme || 'ocean',
    };
    setBranding(nextBranding);
    return nextBranding;
  };

  const refreshUser = async () => {
    const response = await authApi.me();
    setUser(response.data);
    return response.data;
  };

  useEffect(() => {
    document.title = branding.app_title || 'Catering CRM';
  }, [branding.app_title]);

  useEffect(() => {
    document.documentElement.dataset.brandTheme = branding.app_color_theme || 'ocean';
  }, [branding.app_color_theme]);

  useEffect(() => {
    const token = safeGetItem('token');
    Promise.all([
      refreshBranding().catch(() => setBranding(DEFAULT_BRANDING)),
      token ? refreshUser().catch(() => {
        safeRemoveItem('token');
        setUser(null);
      }) : Promise.resolve(null),
    ]).finally(() => setLoading(false));
  }, []);

  const login = async (email, heslo) => {
    const response = await authApi.login({ email, heslo });
    safeSetItem('token', response.data.token);
    setUser(response.data.uzivatel);
    return response.data.uzivatel;
  };

  const logout = () => {
    safeRemoveItem('token');
    setUser(null);
  };

  const hasModule = (moduleKey) => isModuleEnabled(user?.modules, moduleKey);

  return (
    <AuthContext.Provider
      value={{
        user,
        branding,
        loading,
        login,
        logout,
        refreshBranding,
        refreshUser,
        hasModule,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
