import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { User, Role } from '@/lib/types';
import { loadData, saveData, saveDataToSupabase, isSeeded } from '@/lib/store';
import { createSeedData } from '@/lib/seed';

interface AuthContextType {
  currentUser: User | null;
  users: User[];
  switchUser: (userId: string) => void;
  refreshUsers: () => Promise<void>;
  hasRole: (...roles: Role[]) => boolean;
  isAdmin: boolean;
  isManagerOrAbove: boolean;
  dataLoaded: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const seeded = await isSeeded();
      if (!seeded) {
        const seed = createSeedData();
        try {
          await saveDataToSupabase(seed);
        } catch {
          saveData(seed);
        }
      }
      if (cancelled) return;
      const data = await loadData();
      if (cancelled) return;
      const userList = Array.isArray(data?.users) ? data.users : [];
      setUsers(userList);
      const saved = localStorage.getItem('current_user_id');
      const user = saved ? userList.find((u: User) => u.id === saved) : userList[0];
      setCurrentUser(user || userList[0] || null);
      setDataLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const switchUser = (userId: string) => {
    const user = users.find(u => u.id === userId);
    if (user) {
      setCurrentUser(user);
      localStorage.setItem('current_user_id', userId);
    }
  };

  const refreshUsers = async () => {
    const data = await loadData();
    setUsers(data.users);
    setCurrentUser(prev => {
      if (!prev) return data.users[0] || null;
      const stillExists = data.users.some(u => u.id === prev.id);
      if (stillExists) return data.users.find(u => u.id === prev.id) ?? prev;
      const saved = localStorage.getItem('current_user_id');
      const next = saved ? data.users.find(u => u.id === saved) : data.users[0];
      if (next) localStorage.setItem('current_user_id', next.id);
      return next || null;
    });
  };

  const hasRole = (...roles: Role[]) => {
    if (!currentUser) return false;
    return roles.includes(currentUser.role);
  };

  return (
    <AuthContext.Provider value={{
      currentUser,
      users,
      switchUser,
      refreshUsers,
      hasRole,
      isAdmin: currentUser?.role === 'admin',
      isManagerOrAbove: currentUser?.role === 'admin' || currentUser?.role === 'manager',
      dataLoaded,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
