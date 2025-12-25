import React, { createContext, useContext, useMemo } from "react";

const AuthProviderContext = createContext("xumm");

export const AuthProviderProvider = ({ authProvider, children }) => {
  const value = useMemo(() => (authProvider ? authProvider.toLowerCase() : "xumm"), [authProvider]);
  return (
    <AuthProviderContext.Provider value={value}>
      {children}
    </AuthProviderContext.Provider>
  );
};

export const useAuthProvider = () => useContext(AuthProviderContext);

export default AuthProviderContext;
