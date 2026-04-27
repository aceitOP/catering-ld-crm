import { createContext, useContext, useEffect, useState } from 'react';
import { clientAuthApi, clientPortalApi } from '../api';
import { CLIENT_PORTAL_TOKEN_KEY } from '../api/core';
import { safeGetItem, safeRemoveItem, safeSetItem } from '../utils/storage';
import { clearFrontendSentryUser, setFrontendSentryUser } from '../sentry';

const ClientPortalContext = createContext(null);

export function ClientPortalAuthProvider({ children }) {
  const [clientUser, setClientUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshClientUser = async () => {
    const response = await clientPortalApi.me();
    setClientUser(response.data);
    setFrontendSentryUser({
      id: response.data?.id || response.data?.email,
      email: response.data?.email,
      role: 'client_portal',
      name: response.data?.jmeno || response.data?.nazev || response.data?.email,
    });
    return response.data;
  };

  useEffect(() => {
    const token = safeGetItem(CLIENT_PORTAL_TOKEN_KEY);
    if (!token) {
      setLoading(false);
      return;
    }

    refreshClientUser()
      .catch(() => {
        safeRemoveItem(CLIENT_PORTAL_TOKEN_KEY);
        setClientUser(null);
        clearFrontendSentryUser();
      })
      .finally(() => setLoading(false));
  }, []);

  const requestLink = async (email) => clientAuthApi.requestLink({ email });

  const consumeLink = async (token) => {
    const response = await clientAuthApi.consumeLink({ token });
    safeSetItem(CLIENT_PORTAL_TOKEN_KEY, response.data.token);
    return refreshClientUser();
  };

  const logout = () => {
    safeRemoveItem(CLIENT_PORTAL_TOKEN_KEY);
    setClientUser(null);
    clearFrontendSentryUser();
  };

  return (
    <ClientPortalContext.Provider
      value={{
        clientUser,
        loading,
        requestLink,
        consumeLink,
        refreshClientUser,
        logout,
      }}
    >
      {children}
    </ClientPortalContext.Provider>
  );
}

export function useClientPortalAuth() {
  return useContext(ClientPortalContext);
}
