import type { ReactNode } from 'react';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { useAuth } from '@/contexts/AuthContext';
import { NotificationBell } from '@/components/NotificationCenter';
import { SchedulingAssistantButton } from '@/components/SchedulingAssistant';
import { ConflictResolutionTrigger } from '@/components/ConflictResolutionSheet';
import { SimulationBanner } from '@/components/SimulationBanner';
import { useEffect } from 'react';
import { loadData } from '@/lib/store';
import { runOrganisationNotificationChecks } from '@/lib/orgNotificationEngine';

export function Layout({ children }: { children: ReactNode }) {
  const { currentUser, dataLoaded } = useAuth();

  if (!dataLoaded || !currentUser) {
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
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center border-b px-4 bg-card shrink-0">
            <SidebarTrigger className="mr-4" />
            <OrgNotificationRunner enabled={Boolean(currentUser)} />
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
