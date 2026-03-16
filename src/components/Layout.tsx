import type { ReactNode } from 'react';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { useAuth } from '@/contexts/AuthContext';
import { NotificationBell } from '@/components/NotificationCenter';
import { SchedulingAssistantButton } from '@/components/SchedulingAssistant';
import { ConflictResolutionTrigger } from '@/components/ConflictResolutionSheet';
import { SimulationBanner } from '@/components/SimulationBanner';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadData } from '@/lib/store';
import { runOrganisationNotificationChecks } from '@/lib/orgNotificationEngine';
import { addNotification } from '@/lib/notifications';
import { isInScheduledPauseWindow, getActiveScheduledPause } from '@/lib/scheduledPause';
import { formatTimeForDisplay } from '@/lib/scheduledPause';
import { isSupabaseConfigured } from '@/lib/supabase';

export function Layout({ children }: { children: ReactNode }) {
  const { currentUser, sessionExists, dataLoaded } = useAuth();
  const navigate = useNavigate();

  // Redirect to login only when there is no auth session at all
  useEffect(() => {
    if (isSupabaseConfigured && dataLoaded && !sessionExists) {
      navigate('/login', { replace: true });
    }
  }, [dataLoaded, sessionExists, navigate]);

  if (!dataLoaded || !currentUser) {
    // If authenticated but no matching public.users row, show a clear message instead of looping
    if (isSupabaseConfigured && dataLoaded && sessionExists && !currentUser) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="text-center space-y-3 max-w-sm px-4">
            <p className="font-medium">Account not linked</p>
            <p className="text-sm text-muted-foreground">
              Your login email doesn't match any user in the system. Ask an admin to add your
              email to the team, or contact support.
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0 transition-[margin-left] duration-[220ms] ease-[cubic-bezier(0.4,0,0.2,1)]">
          <header className="h-12 flex items-center border-b px-4 bg-card shrink-0">
            <SidebarTrigger className="mr-4" />
            <OrgNotificationRunner enabled={Boolean(currentUser)} />
            {currentUser && <ScheduledPauseNotificationRunner userId={currentUser.id} />}
            <NotificationBell />
            <SchedulingAssistantButton />
          </header>
          <main className="flex-1 overflow-auto p-6 flex flex-col">
            <SimulationBanner />
            <div className="flex-1">{children}</div>
          </main>
        </div>
      </div>
      <ConflictResolutionTrigger />
    </SidebarProvider>
  );
}

function OrgNotificationRunner({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const run = async () => {
      try {
        const data = await loadData();
        if (cancelled) return;
        runOrganisationNotificationChecks(data);
      } catch {
        // ignore
      }
    };
    run();
    const handler = () => run();
    window.addEventListener('allocations-updated', handler);
    const t = window.setInterval(run, 60_000);
    return () => {
      cancelled = true;
      window.removeEventListener('allocations-updated', handler);
      window.clearInterval(t);
    };
  }, [enabled]);
  return null;
}

function ScheduledPauseNotificationRunner({ userId }: { userId: string }) {
  const wasInWindow = useRef(false);

  useEffect(() => {
    const check = () => {
      const now = new Date();
      const inWindow = isInScheduledPauseWindow(userId, now);
      const active = getActiveScheduledPause(userId, now);
      if (inWindow && !wasInWindow.current) {
        wasInWindow.current = true;
        const resumeTime = active ? formatTimeForDisplay(active.untilTime) : '';
        addNotification({
          id: crypto.randomUUID(),
          userId,
          type: 'project_status',
          category: 'project',
          title: 'Quick alerts paused',
          message: resumeTime ? `Scheduled pause started — resumes at ${resumeTime}` : 'Scheduled pause started',
          createdAt: new Date().toISOString(),
          read: false,
        });
      } else if (!inWindow && wasInWindow.current) {
        wasInWindow.current = false;
        addNotification({
          id: crypto.randomUUID(),
          userId,
          type: 'project_status',
          category: 'project',
          title: 'Quick alerts resumed',
          message: 'External notifications are active again',
          createdAt: new Date().toISOString(),
          read: false,
        });
      } else if (!inWindow) wasInWindow.current = false;
    };
    check();
    const t = setInterval(check, 60_000);
    return () => clearInterval(t);
  }, [userId]);
  return null;
}
