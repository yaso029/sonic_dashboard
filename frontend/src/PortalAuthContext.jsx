import { createContext, useContext, useState } from 'react';

const PortalAuthContext = createContext(null);

export function PortalAuthProvider({ children }) {
  const [portalUser, setPortalUser] = useState(() => {
    const u = localStorage.getItem('portal_user');
    return u ? JSON.parse(u) : null;
  });

  const login = (userData, token) => {
    localStorage.setItem('portal_token', token);
    localStorage.setItem('portal_user', JSON.stringify(userData));
    setPortalUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('portal_token');
    localStorage.removeItem('portal_user');
    setPortalUser(null);
  };

  return (
    <PortalAuthContext.Provider value={{ portalUser, login, logout }}>
      {children}
    </PortalAuthContext.Provider>
  );
}

export const usePortalAuth = () => useContext(PortalAuthContext);
