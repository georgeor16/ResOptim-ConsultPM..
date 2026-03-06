import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Settings2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/contexts/AuthContext';
import {
  addNotification,
  acknowledgeNotification,
  formatRelativeTime,
  getNotificationCounts,
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
import { cn } from '@/lib/utils';

export function NotificationBell() {
  const { currentUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  useEffect(() => {
    if (!currentUser) return;
    setNotifications(loadUserNotifications(currentUser.id));
  }, [currentUser, open]);

  if (!currentUser) return null;

  const counts = getNotificationCounts(currentUser.id);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative ml-auto mr-2 h-8 w-8 rounded-full bg-background/70 backdrop-blur-sm border border-border/60 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background/90 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
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

  useEffect(() => {
    if (!currentUser) return;
    setNotifications(loadUserNotifications(currentUser.id));
    setPrefs(loadNotificationPreferences(currentUser.id));
  }, [currentUser, open]);

  if (!currentUser || !prefs) return null;

  const unread = notifications.filter(n => !n.read).length;
  const filtered = notifications.filter(n => {
    if (n.audience && !n.audience.includes(currentUser.role)) return false;
    // Basic role scope filtering for org alerts (managers see only those with their teamId or transparency)
    if (n.scope === 'org' && currentUser.role === 'manager') {
      if (n.teamId && currentUser.teamId && n.teamId === currentUser.teamId) return true;
      if (Array.isArray(n.affectedTeamIds) && currentUser.teamId && n.affectedTeamIds.includes(currentUser.teamId)) return true;
      // otherwise hide org-wide details from managers
      return false;
    }
    if (n.scope === 'org' && currentUser.role === 'member') {
      return false;
    }
    return true;
  });

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
          <div className="px-5 py-4 space-y-3">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground/80">No notifications yet.</p>
            ) : (
              filtered.slice(0, 50).map(n => (
                <div
                  key={n.id}
                  className={cn(
                    'w-full text-left rounded-lg px-3 py-2.5 text-xs transition-colors',
                    'bg-card/40 border border-white/5 hover:bg-card/70',
                    !n.read && 'ring-1 ring-accent/40',
                  )}
                >
                  <button type="button" onClick={() => handleClickNotification(n)} className="w-full text-left">
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

                  {n.requiresAck && !n.acknowledgedAt && (
                    <div className="pt-2 flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 rounded-full text-[11px]"
                        onClick={() => {
                          acknowledgeNotification(currentUser.id, n.id, currentUser.id);
                          setNotifications(loadUserNotifications(currentUser.id));
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
              ))
            )}
            {notifications.length > 50 && (
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

