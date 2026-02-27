import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { User, Role } from '@/lib/types';
import { loadData, saveData, isSeeded } from '@/lib/store';
import { createSeedData } from '@/lib/seed';

interface AuthContextType {
  currentUser: User | null;
  users: User[];
  switchUser: (userId: string) => void;
  hasRole: (...roles: Role[]) => boolean;
  isAdmin: boolean;
  isManagerOrAbove: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    if (!isSeeded()) {
      const seed = createSeedData();
      saveData(seed);
    }
    const data = loadData();
    setUsers(data.users);
    // Default to admin user
    const saved = localStorage.getItem('current_user_id');
    const user = saved ? data.users.find(u => u.id === saved) : data.users[0];
    setCurrentUser(user || data.users[0]);
  }, []);

  const switchUser = (userId: string) => {
    const user = users.find(u => u.id === userId);
    if (user) {
      setCurrentUser(user);
      localStorage.setItem('current_user_id', userId);
    }
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
      hasRole,
      isAdmin: currentUser?.role === 'admin',
      isManagerOrAbove: currentUser?.role === 'admin' || currentUser?.role === 'manager',
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
