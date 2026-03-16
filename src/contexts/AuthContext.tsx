import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { User, Role } from '@/lib/types';
import { loadData, saveData, saveDataToSupabase, isSeeded } from '@/lib/store';
import { createSeedData } from '@/lib/seed';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

interface AuthContextType {
  currentUser: User | null;
  sessionExists: boolean; // true when Supabase Auth session is active (even if no matching public.users row)
  users: User[];
  switchUser: (userId: string) => void;
  signOut: () => Promise<void>;
  refreshUsers: () => Promise<void>;
  hasRole: (...roles: Role[]) => boolean;
  isAdmin: boolean;
  isManagerOrAbove: boolean;
  dataLoaded: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

// ---------------------------------------------------------------------------
// Supabase Auth mode
// ---------------------------------------------------------------------------

function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [sessionExists, setSessionExists] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Seed once if needed (runs regardless of auth — no auth token required for seeding
  // because saveDataToSupabase uses the anon key for insert, which is covered by
  // the permissive seeding window before strict RLS was applied).
  useEffect(() => {
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
    })();
  }, []);

  // Load the public.users row for a given Supabase Auth session.
  // Matching order: auth_id → email fallback (auto-links auth_id on first match).
  const loadUserForSession = async (authUid: string, authEmail?: string) => {
    const data = await loadData();
    const userList: User[] = Array.isArray(data?.users) ? data.users : [];
    setUsers(userList);

    type UserWithAuthId = User & { auth_id?: string };
    let user: UserWithAuthId | undefined =
      userList.find((u: UserWithAuthId) => u.auth_id === authUid);

    // Email fallback — covers first login before auth_id is linked
    if (!user && authEmail) {
      user = userList.find(
        (u: UserWithAuthId) => u.email?.toLowerCase() === authEmail.toLowerCase()
      );
      // Auto-link auth_id so subsequent logins use the fast path
      if (user && supabase) {
        supabase
          .from('users')
          .update({ auth_id: authUid })
          .eq('id', user.id)
          .then(() => {}); // fire-and-forget
      }
    }

    setCurrentUser(user ?? null);
    setDataLoaded(true);
  };

  useEffect(() => {
    if (!supabase) return;

    // Check existing session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setSessionExists(true);
        loadUserForSession(session.user.id, session.user.email);
      } else {
        setSessionExists(false);
        setDataLoaded(true); // no session — Layout will redirect to /login
      }
    });

    // Listen for auth changes (login / logout / token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setSessionExists(true);
        loadUserForSession(session.user.id, session.user.email);
      } else {
        setSessionExists(false);
        setCurrentUser(null);
        setUsers([]);
        setDataLoaded(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut();
  };

  const refreshUsers = async () => {
    const data = await loadData();
    setUsers(data.users);
    if (currentUser) {
      const updated = data.users.find((u: User) => u.id === currentUser.id);
      if (updated) setCurrentUser(updated);
    }
  };

  const hasRole = (...roles: Role[]) => {
    if (!currentUser) return false;
    return roles.includes(currentUser.role);
  };

  const isAdmin = currentUser?.role === 'admin';
  const isManagerOrAbove = currentUser?.role === 'admin' || currentUser?.role === 'manager';

  return (
    <AuthContext.Provider value={{
      currentUser,
      sessionExists,
      users,
      switchUser: () => { /* no-op in auth mode */ },
      signOut,
      refreshUsers,
      hasRole,
      isAdmin,
      isManagerOrAbove,
      dataLoaded,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// localStorage (mock) mode — used when Supabase is not configured
// ---------------------------------------------------------------------------

function MockAuthProvider({ children }: { children: ReactNode }) {
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
      const stillExists = data.users.some((u: User) => u.id === prev.id);
      if (stillExists) return data.users.find((u: User) => u.id === prev.id) ?? prev;
      const saved = localStorage.getItem('current_user_id');
      const next = saved ? data.users.find((u: User) => u.id === saved) : data.users[0];
      if (next) localStorage.setItem('current_user_id', next.id);
      return next || null;
    });
  };

  const hasRole = (...roles: Role[]) => {
    if (!currentUser) return false;
    return roles.includes(currentUser.role);
  };

  const isAdmin = currentUser?.role === 'admin';
  const isManagerOrAbove = currentUser?.role === 'admin' || currentUser?.role === 'manager';

  return (
    <AuthContext.Provider value={{
      currentUser,
      sessionExists: true, // mock mode is always "logged in"
      users,
      switchUser,
      signOut: async () => {},
      refreshUsers,
      hasRole,
      isAdmin,
      isManagerOrAbove,
      dataLoaded,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Exported provider — picks the right implementation based on config
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  if (isSupabaseConfigured) {
    return <SupabaseAuthProvider>{children}</SupabaseAuthProvider>;
  }
  return <MockAuthProvider>{children}</MockAuthProvider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
