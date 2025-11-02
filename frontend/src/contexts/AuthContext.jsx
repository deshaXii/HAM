import React, { createContext, useContext, useEffect, useState } from "react";
import { apiMe, setToken as apiSetToken } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // Important to prevent rendering before we know the auth state

  useEffect(() => {
    (async () => {
      try {
        const me = await apiMe(); // لو فيه JWT صالح
        setUser(me); // هيبقى {id,name,email,role} أو null
      } catch (e) {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const logout = () => {
    apiSetToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
