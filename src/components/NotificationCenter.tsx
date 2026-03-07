import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Settings2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/contexts/AuthContext';
import {
  acknowledgeNotification,
  formatRelativeTime,
  getNotificationCounts,
  getNotificationSection,
  loadActivityEvents,
  loadNotificationPreferences,
  loadUserNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationAccentBg,
  notificationTypeColor,
  saveNotificationPreferences,
  type ActivityEvent,
  type NotificationItem,
  type NotificationPreferences,
} from '@/lib/notifications';
import { isInScheduledPauseWindow, getOneOffPauseRemainingMinutes } from '@/lib/scheduledPause';
import { getActiveDndStateNoClear, getDndRemainingMinutes, saveActiveDnd } from '@/lib/dndProfiles';
import { Moon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { User } from '@/lib/types';

function NotificationCard({
  n,
  currentUser,
  onRefresh,
  onNavigate,
  onClick,
}: {
  n: NotificationItem;
  currentUser: User;
  onRefresh: () => void;
  onNavigate: (open: boolean) => void;
  onClick: (n: NotificationItem) => void;
}) {
  return (
    <div
      className={cn(
        'w-full text-left rounded-lg px-3 py-2.5 text-xs transition-colors',
        'bg-card/40 border border-white/5 hover:bg-card/70',
        !n.read && 'ring-1 ring-accent/40',
      )}
    >
      <button type="button" onClick={() => onClick(n)} className="w-full text-left">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className="flex items-center gap-2 min-w-0">
            <span className={cn('font-medium truncate', notificationTypeColor(n.type))}>{n.title}</span>
            {n.scope === 'org' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-white/10 bg-muted/20 text-muted-foreground">
                Org
              </span>
            )}
            {n.priority === 'critical' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30">
                Critical
              </span>
            )}
          </span>
          <span className="text-[10px] text-muted-foreground/80">{formatRelativeTime(n.createdAt)}</span>
        </div>
        <p className={cn('text-[11px] leading-snug text-muted-foreground/90', notificationAccentBg(n.type) && '')}>
          {n.message}
        </p>
      </button>

      {n.deliveryStatus && (n.deliveryStatus.email || n.deliveryStatus.slack || n.deliveryStatus.teams || n.deliveryStatus.push) && (
        <div className="mt-1.5 pt-1.5 border-t border-white/5 text-[10px] text-muted-foreground/80 space-y-0.5">
          {n.deliveryStatus.slack && (
            <span>
              {n.deliveryStatus.slack.failed
                ? 'Slack delivery failed — check connection in settings'
                : `Sent to Slack${n.deliveryStatus.slack.channel ? ` ${n.deliveryStatus.slack.channel}` : ''} · ${formatRelativeTime(n.deliveryStatus.slack.sentAt)}`}
            </span>
          )}
          {n.deliveryStatus.email && (
            <span>
              {n.deliveryStatus.email.failed
                ? 'Email delivery failed'
                : `Emailed to ${n.deliveryStatus.email.recipientCount ?? 1} recipient(s) · ${formatRelativeTime(n.deliveryStatus.email.sentAt)}`}
            </span>
          )}
          {n.deliveryStatus.teams && (
            <span>
              {n.deliveryStatus.teams.failed
                ? 'Teams delivery failed — check connection in settings'
                : `Sent to Teams · ${formatRelativeTime(n.deliveryStatus.teams.sentAt)}`}
            </span>
          )}
          {n.deliveryStatus.push && (
            <span>
              {n.deliveryStatus.push.failed
                ? 'Push delivery failed'
                : `Pushed to ${n.deliveryStatus.push.deviceCount ?? 0} device(s) · ${n.deliveryStatus.push.deliveredCount ?? 0} delivered${typeof n.deliveryStatus.push.failedCount === 'number' && n.deliveryStatus.push.failedCount > 0 ? ` · ${n.deliveryStatus.push.failedCount} failed` : ''} · ${formatRelativeTime(n.deliveryStatus.push.sentAt)}`}
            </span>
          )}
        </div>
      )}

      {n.requiresAck && !n.acknowledgedAt && (
        <div className="pt-2 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 rounded-full text-[11px]"
            onClick={() => {
              acknowledgeNotification(currentUser.id, n.id, currentUser.id);
              onRefresh();
            }}
          >
            Acknowledge
          </Button>
          {typeof n.alsoSentToManagersCount === 'number' && n.alsoSentToManagersCount > 0 && (
            <span className="text-[10px] text-muted-foreground/80">
              Also sent to {n.alsoSentToManagersCount} team managers
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function formatDndRemaining(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function NotificationBell() {
  const { currentUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [dndState, setDndState] = useState<ReturnType<typeof getActiveDndStateNoClear>>(null);

  useEffect(() => {
    if (!currentUser) return;
    setNotifications(loadUserNotifications(currentUser.id));
  }, [currentUser, open]);

  useEffect(() => {
    if (!currentUser) return;
    const refresh = () => {
      const raw = getActiveDndStateNoClear(currentUser.id);
      if (raw && new Date(raw.endsAt).getTime() <= Date.now()) setDndState(null);
      else setDndState(raw);
    };
    refresh();
    const t = setInterval(refresh, 60_000);
    return () => clearInterval(t);
  }, [currentUser]);

  if (!currentUser) return null;

  const counts = getNotificationCounts(currentUser.id);
  const prefs = loadNotificationPreferences(currentUser.id);
  const dndActive = dndState !== null;
  const quickAlertsPaused =
    prefs.quickAlertsEnabled === false ||
    isInScheduledPauseWindow(currentUser.id) ||
    getOneOffPauseRemainingMinutes(currentUser.id) > 0 ||
    dndActive;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative ml-auto mr-2 h-8 w-8 rounded-full bg-background/70 backdrop-blur-sm border border-border/60 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background/90 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {dndActive && (
          <span
            className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full flex items-center justify-center bg-white/60"
            title="Do Not Disturb active"
            style={{ color: 'rgba(0,0,0,0.5)' }}
          >
            <Moon className="h-2.5 w-2.5" strokeWidth={2.5} />
          </span>
        )}
        {!dndActive && quickAlertsPaused && (
          <span
            className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-amber-500/90 ring-2 ring-background"
            title="External notifications paused"
          />
        )}
        {(counts.unread > 0 || counts.criticalUnacked > 0) && (
          <span className="absolute -top-1 -right-1 flex items-center gap-1">
            {counts.criticalUnacked > 0 && (
              <span className="h-4 min-w-[16px] rounded-full bg-red-500 text-[10px] font-medium text-white flex items-center justify-center px-0.5 shadow-sm">
                {counts.criticalUnacked > 9 ? '9+' : counts.criticalUnacked}
              </span>
            )}
            {counts.unread > 0 && (
              <span className="h-4 min-w-[16px] rounded-full bg-accent text-[10px] font-medium text-accent-foreground flex items-center justify-center px-0.5 shadow-sm">
                {counts.unread > 9 ? '9+' : counts.unread}
              </span>
            )}
          </span>
        )}
      </button>
      <NotificationSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

interface NotificationSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function NotificationSheet({ open, onOpenChange }: NotificationSheetProps) {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [orgSectionOpen, setOrgSectionOpen] = useState(false);
  const [activeDnd, setActiveDnd] = useState<ReturnType<typeof getActiveDndStateNoClear>>(null);
  const [dndRemainingMinutes, setDndRemainingMinutes] = useState(0);

  useEffect(() => {
    if (!currentUser) return;
    setNotifications(loadUserNotifications(currentUser.id));
    setPrefs(loadNotificationPreferences(currentUser.id));
  }, [currentUser, open]);

  useEffect(() => {
    if (!currentUser || !open) return;
    const refresh = () => {
      const raw = getActiveDndStateNoClear(currentUser.id);
      if (raw && new Date(raw.endsAt).getTime() <= Date.now()) {
        setActiveDnd(null);
        setDndRemainingMinutes(0);
      } else {
        setActiveDnd(raw);
        setDndRemainingMinutes(raw ? Math.max(0, Math.ceil((new Date(raw.endsAt).getTime() - Date.now()) / 60000)) : 0);
      }
    };
    refresh();
    const t = setInterval(refresh, 60_000);
    return () => clearInterval(t);
  }, [currentUser, open]);

  useEffect(() => {
    if (open && currentUser && (currentUser.role === 'admin' || currentUser.role === 'manager')) {
      setOrgSectionOpen(true);
    }
  }, [open, currentUser]);

  if (!currentUser || !prefs) return null;

  const unread = notifications.filter(n => !n.read).length;
  const filtered = notifications.filter(n => {
    if (n.audience && n.audience.length > 0 && !n.audience.includes(currentUser.role)) return false;
    return true;
  });

  const bySection = filtered.reduce<{ organisation: NotificationItem[]; team: NotificationItem[] }>(
    (acc, n) => {
      const section = getNotificationSection(n.scope);
      acc[section].push(n);
      return acc;
    },
    { organisation: [], team: [] }
  );
  const orgUnread = bySection.organisation.filter(n => !n.read).length;
  const teamUnread = bySection.team.filter(n => !n.read).length;

  const handleMarkAllRead = () => {
    markAllNotificationsRead(currentUser.id);
    setNotifications(loadUserNotifications(currentUser.id));
  };

  const handleClickNotification = (n: NotificationItem) => {
    if (!n.read) {
      markNotificationRead(currentUser.id, n.id);
      setNotifications(loadUserNotifications(currentUser.id));
    }
    if (n.sharedSimulationId) {
      navigate(`/simulation/review/${n.sharedSimulationId}`);
      onOpenChange(false);
      return;
    }
    if (n.projectId) {
      navigate(`/projects/${n.projectId}`);
      onOpenChange(false);
    }
  };

  const toggleThreshold = (value: number) => {
    setPrefs(prev => {
      if (!prev) return prev;
      const has = prev.bandwidthThresholds.includes(value);
      const next: NotificationPreferences = {
        ...prev,
        bandwidthThresholds: has
          ? prev.bandwidthThresholds.filter(v => v !== value)
          : [...prev.bandwidthThresholds, value].sort((a, b) => a - b),
      };
      saveNotificationPreferences(next);
      return next;
    });
  };

  const togglePref = (key: keyof NotificationPreferences) => {
    if (key === 'userId' || key === 'bandwidthThresholds') return;
    setPrefs(prev => {
      if (!prev) return prev;
      const next = { ...prev, [key]: !prev[key] } as NotificationPreferences;
      saveNotificationPreferences(next);
      return next;
    });
  };

  const recentActivity: ActivityEvent[] = loadActivityEvents().slice(0, 5);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full max-w-md bg-background/90 backdrop-blur-xl border-l border-white/10 p-0 flex flex-col"
      >
        <SheetHeader className="px-5 pt-4 pb-2 flex flex-row items-center justify-between border-b border-white/10">
          <SheetTitle className="text-sm font-semibold text-foreground/90">Notifications</SheetTitle>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowSettings(s => !s)}
              className="h-7 w-7 rounded-full border border-border/60 bg-background/70 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background/90"
              aria-label="Notification settings"
            >
              <Settings2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={handleMarkAllRead}
              className={cn(
                'text-[11px] text-muted-foreground hover:text-foreground transition-colors',
                unread === 0 && 'opacity-50 cursor-default'
              )}
              disabled={unread === 0}
            >
              Mark all as read
            </button>
          </div>
        </SheetHeader>

        {activeDnd && (
          <div className="px-5 py-2 flex items-center justify-between gap-2 border-b border-white/10 bg-white/5 text-xs text-muted-foreground">
            <span>
              {activeDnd.profileIcon} {activeDnd.profileName} active · {formatDndRemaining(dndRemainingMinutes)} remaining
            </span>
            <button
              type="button"
              onClick={() => {
                saveActiveDnd(currentUser.id, null);
                setActiveDnd(null);
                setDndRemainingMinutes(0);
                window.dispatchEvent(new Event('dnd-resumed'));
              }}
              className="text-amber-600 dark:text-amber-400 hover:underline font-medium"
            >
              Resume
            </button>
          </div>
        )}

        {showSettings && (
          <div className="px-5 py-3 border-b border-white/10 text-xs text-muted-foreground/90 space-y-3 bg-background/80">
            <div className="font-medium text-foreground/90">Notification preferences</div>
            <div className="space-y-1.5">
              <label className="flex items-center justify-between gap-2">
                <span>Task updates</span>
                <Checkbox checked={prefs.taskUpdates} onCheckedChange={() => togglePref('taskUpdates')} />
              </label>
              <label className="flex items-center justify-between gap-2">
                <span>Reassignments</span>
                <Checkbox checked={prefs.reassignments} onCheckedChange={() => togglePref('reassignments')} />
              </label>
              <label className="flex items-center justify-between gap-2">
                <span>Bandwidth alerts</span>
                <Checkbox checked={prefs.bandwidth} onCheckedChange={() => togglePref('bandwidth')} />
              </label>
              <label className="flex items-center justify-between gap-2">
                <span>Project changes</span>
                <Checkbox checked={prefs.projectChanges} onCheckedChange={() => togglePref('projectChanges')} />
              </label>
            </div>
            <div className="space-y-1">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground/80">Bandwidth thresholds</div>
              <div className="flex gap-2 flex-wrap">
                {[75, 90, 100].map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => toggleThreshold(v)}
                    className={cn(
                      'px-2.5 py-0.5 rounded-full text-[11px] border transition-colors',
                      prefs.bandwidthThresholds.includes(v)
                        ? 'bg-accent/20 border-accent/40 text-accent-foreground'
                        : 'bg-muted/30 border-border text-muted-foreground hover:bg-muted/50'
                    )}
                  >
                    {v}%
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <ScrollArea className="flex-1">
          <div className="px-5 py-4 space-y-4">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground/80">No notifications yet.</p>
            ) : (
              <>
                {bySection.organisation.length > 0 && (
                  <Collapsible open={orgSectionOpen} onOpenChange={setOrgSectionOpen} className="space-y-2">
                    <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-muted/20 px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:bg-muted/30 transition-colors">
                      {orgSectionOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                      <span>Organisation</span>
                      {orgUnread > 0 && <span className="rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] text-accent-foreground">{orgUnread} new</span>}
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-2 pt-1">
                      {bySection.organisation.slice(0, 50).map(n => (
                        <NotificationCard key={n.id} n={n} currentUser={currentUser} onRefresh={() => setNotifications(loadUserNotifications(currentUser.id))} onNavigate={onOpenChange} onClick={handleClickNotification} />
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                )}
                {bySection.team.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-muted/20 px-3 py-2 text-xs font-medium text-muted-foreground">
                      <span>Your Team</span>
                      {teamUnread > 0 && <span className="rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] text-accent-foreground">{teamUnread} new</span>}
                    </div>
                    <div className="space-y-2 pt-0">
                      {bySection.team.slice(0, 50).map(n => (
                        <NotificationCard key={n.id} n={n} currentUser={currentUser} onRefresh={() => setNotifications(loadUserNotifications(currentUser.id))} onNavigate={onOpenChange} onClick={handleClickNotification} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            {filtered.length > 50 && (
              <p className="text-[11px] text-muted-foreground/70 pt-1">View older in audit exports.</p>
            )}
          </div>
        </ScrollArea>

        <div className="px-5 py-3 border-t border-white/10 bg-background/90">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-1.5">Recent activity</div>
          <div className="space-y-1.5 max-h-24 overflow-y-auto">
            {recentActivity.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/80">No recent changes.</p>
            ) : (
              recentActivity.map(ev => (
                <div key={ev.id} className="text-[11px] text-muted-foreground/90">
                  <span className="font-medium text-foreground/80">{ev.message}</span>
                  <span className="text-muted-foreground/60"> · {formatRelativeTime(ev.createdAt)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

