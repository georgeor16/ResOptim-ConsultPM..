import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Mail, MessageCircle, Users, Smartphone, Bell, X } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { SchedulePausePanel } from '@/components/SchedulePausePanel';
import { DndSection } from '@/components/DndSection';
import { DndProfileManager } from '@/components/DndProfileManager';
import type { ScheduledPause } from '@/lib/scheduledPause';
import type { DndProfile, ActiveDndState } from '@/lib/dndProfiles';
import {
  ROUTING_CATEGORY_LABELS,
  type OrgExternalNotificationConfig,
  type RoutingCategoryKey,
  type ExternalChannelType,
} from '@/lib/externalNotifications';
import type { NotificationPriority } from '@/lib/notifications';
import type { ChannelId } from './ChannelChips';

const PRIORITIES: NotificationPriority[] = ['critical', 'attention', 'info'];
const PRIORITY_LABELS: Record<NotificationPriority, string> = {
  critical: 'Critical',
  attention: 'Attention',
  info: 'Informational',
};

const CHANNELS: { type: ExternalChannelType; icon: typeof Mail; channelId: ChannelId }[] = [
  { type: 'email', icon: Mail, channelId: 'email' },
  { type: 'slack', icon: MessageCircle, channelId: 'slack' },
  { type: 'teams', icon: Users, channelId: 'teams' },
  { type: 'push', icon: Smartphone, channelId: 'push' },
];

const ROUTING_KEYS = Object.keys(ROUTING_CATEGORY_LABELS) as RoutingCategoryKey[];

const ROW_BORDER: Record<NotificationPriority, string> = {
  critical: 'border-l-[3px] border-l-red-500/40',
  attention: 'border-l-[3px] border-l-amber-500/40',
  info: 'border-l-[3px] border-l-white/10',
};

interface ManageNotificationsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: OrgExternalNotificationConfig;
  orgId: string;
  getChannels: (category: RoutingCategoryKey, priority: NotificationPriority) => ExternalChannelType[];
  toggleChannel: (category: RoutingCategoryKey, priority: NotificationPriority, channel: ExternalChannelType) => void;
  setChannelsForAllCategories: (priority: NotificationPriority, channels: ExternalChannelType[]) => void;
  onReset: () => void;
  isChannelConnected: (channel: ExternalChannelType) => boolean;
  onOpenOnboarding: (channelId: ChannelId) => void;
  /** Personal Quick alerts master toggle — when false, external delivery is paused. */
  quickAlertsOn: boolean;
  onQuickAlertsChange: (on: boolean) => void;
  /** When true, org admin has paused external delivery; toggle is disabled. */
  orgExternalPaused?: boolean;
  /** Effective paused = manual off OR in scheduled window OR one-off active (for UI). */
  effectivePaused?: boolean;
  /** True when currently inside a scheduled pause window (for banner text). */
  scheduledPauseActive?: boolean;
  /** Remaining minutes of one-off pause; 0 if none. */
  oneOffRemainingMinutes?: number;
  schedules: ScheduledPause[];
  onSchedulesChange: (s: ScheduledPause[]) => void;
  onRemoveSchedule: (id: string) => void;
  onOneOffStart: (endsAt: string) => void;
  onOneOffClear: () => void;
  /** Do Not Disturb */
  dndProfiles: DndProfile[];
  activeDnd: ActiveDndState | null;
  dndRemainingMinutes: number;
  onActivateDnd: (profile: DndProfile) => void;
  onResumeDnd: () => void;
  onSaveDndProfiles: (profiles: DndProfile[]) => void;
}

export function ManageNotificationsModal({
  open,
  onOpenChange,
  config,
  orgId,
  getChannels,
  toggleChannel,
  setChannelsForAllCategories,
  onReset,
  isChannelConnected,
  onOpenOnboarding,
  quickAlertsOn,
  onQuickAlertsChange,
  orgExternalPaused = false,
  effectivePaused = false,
  scheduledPauseActive = false,
  oneOffRemainingMinutes = 0,
  schedules,
  onSchedulesChange,
  onRemoveSchedule,
  onOneOffStart,
  onOneOffClear,
  dndProfiles,
  activeDnd,
  dndRemainingMinutes,
  onActivateDnd,
  onResumeDnd,
  onSaveDndProfiles,
}: ManageNotificationsModalProps) {
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [schedulePanelOpen, setSchedulePanelOpen] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [dndManageView, setDndManageView] = useState(false);

  const allExpanded = expandedCards.has('__all__');

  const handleGlobalToggle = (priority: NotificationPriority, channel: ExternalChannelType) => {
    const current = getChannels(ROUTING_KEYS[0], priority).filter(c => c !== 'in_app');
    const has = current.includes(channel);
    const next = has ? current.filter(c => c !== channel) : [...current, channel];
    setChannelsForAllCategories(priority, next);
  };

  const handleReset = () => {
    onReset();
    setShowResetConfirm(false);
    onOpenChange(false);
  };

  const toggleCardExpand = (key: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedCards(new Set(['__all__', ...ROUTING_KEYS]));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[560px] w-[calc(100%-2rem)] p-0 gap-0 border-0 bg-transparent shadow-none overflow-visible [&>button]:hidden"
        style={{
          background: 'rgba(255, 255, 255, 0.08)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '20px',
          boxShadow: '0 8px 40px rgba(0, 0, 0, 0.2)',
        }}
      >
        <div className="animate-in fade-in zoom-in-95 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-100">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute right-4 top-4 rounded-full p-1.5 text-white/60 hover:text-white/90 hover:bg-white/10 transition-colors z-10"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>

          <DialogHeader className="px-6 pt-6 pb-4 border-b border-white/10">
            <DialogTitle className="text-base font-normal text-white/90">
              Notification Delivery
            </DialogTitle>
            <p className="text-sm text-white/50 mt-0.5">
              Choose how you receive alerts by severity
            </p>
          </DialogHeader>

          <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
            {dndManageView ? (
              <DndProfileManager
                profiles={dndProfiles}
                onSaveProfiles={onSaveDndProfiles}
                onBack={() => setDndManageView(false)}
                onActivate={p => { onActivateDnd(p); setDndManageView(false); }}
              />
            ) : (
              <>
            {/* Quick alerts master toggle */}
            <div
              className="rounded-xl p-4 mb-4 transition-all duration-200"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-white/10 p-2 shrink-0">
                    <Bell className="h-4 w-4 text-white/80" />
                  </div>
                  <div>
                    <p className="text-sm font-normal text-white/90">Quick alerts</p>
                    <p className="text-xs text-white/50 mt-0.5">Enable or pause all external notifications at once</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={cn(
                      'text-xs transition-colors duration-200',
                      !effectivePaused ? 'text-white/50' : 'text-amber-400/90'
                    )}
                  >
                    {!effectivePaused ? 'On' : activeDnd ? `Paused · DND · ${activeDnd.profileIcon} ${activeDnd.profileName}` : 'Paused'}
                  </span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className={cn('relative', orgExternalPaused && 'opacity-60 pointer-events-none')}>
                          <Switch
                            checked={!effectivePaused}
                            onCheckedChange={v => {
                              if (!v && activeDnd) onResumeDnd();
                              onQuickAlertsChange(!!v);
                            }}
                            disabled={orgExternalPaused}
                            className={cn(
                              'data-[state=checked]:bg-emerald-500/80 data-[state=unchecked]:bg-white/20 transition-all duration-200'
                            )}
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="left">
                        {orgExternalPaused
                          ? 'External notifications are currently paused organisation-wide by your admin'
                          : !effectivePaused
                            ? 'External delivery on'
                            : 'External delivery paused — in-app only'}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            </div>

            {/* Do Not Disturb */}
            <DndSection
              profiles={dndProfiles}
              activeDnd={activeDnd}
              dndRemainingMinutes={dndRemainingMinutes}
              onActivate={onActivateDnd}
              onResume={() => { onResumeDnd(); onQuickAlertsChange(true); }}
              onOpenManageProfiles={() => setDndManageView(true)}
              onQuickAlertsChange={onQuickAlertsChange}
            />

            {(quickAlertsOn || oneOffRemainingMinutes > 0) && (
              <div className="mt-3 transition-all duration-200">
                <SchedulePausePanel
                  schedules={schedules}
                  oneOffRemainingMinutes={oneOffRemainingMinutes}
                  onSchedulesChange={onSchedulesChange}
                  onRemoveSchedule={onRemoveSchedule}
                  onOneOffStart={onOneOffStart}
                  onOneOffClear={onOneOffClear}
                  open={schedulePanelOpen}
                  onOpenChange={setSchedulePanelOpen}
                  editingScheduleId={editingScheduleId}
                  onEditSchedule={setEditingScheduleId}
                  showRecurringSchedule={quickAlertsOn}
                />
              </div>
            )}

            {effectivePaused && oneOffRemainingMinutes === 0 && (
              <div
                className="mb-4 rounded-[10px] px-4 py-3 text-sm text-amber-200/90 transition-all duration-200"
                style={{
                  background: 'rgba(245,158,11,0.08)',
                  border: '1px solid rgba(245,158,11,0.2)',
                }}
              >
                {activeDnd
                  ? `${activeDnd.profileIcon} ${activeDnd.profileName} active — notifications paused until ${new Date(activeDnd.endsAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}. `
                  : scheduledPauseActive
                    ? 'External notifications paused — scheduled until end of window. '
                    : 'External notifications paused — alerts will only appear in-app. '}
                {activeDnd && (
                  <button type="button" onClick={() => { onResumeDnd(); onQuickAlertsChange(true); }} className="underline font-medium">Resume now</button>
                )}
              </div>
            )}

            <div className="border-t border-white/10 pt-4 mb-4" />

            <div
              className={cn(
                'transition-all duration-200 ease-out',
                effectivePaused && 'opacity-40 pointer-events-none'
              )}
            >
              <button
                type="button"
                onClick={expandAll}
                className="text-xs text-white/50 hover:text-white/70 mb-3 block ml-auto"
              >
                Expand all
              </button>

              {/* Global defaults row */}
              <div
              className="rounded-xl p-4 mb-4 transition-colors hover:brightness-110"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <p className="text-sm text-white/75 mb-3">All categories</p>
              <p className="text-[11px] text-white/40 mb-3">Set defaults for all — override per category below</p>
              {PRIORITIES.map(priority => (
                <div
                  key={priority}
                  className={cn('flex items-center gap-3 py-2 pl-3 -ml-3 rounded-r', ROW_BORDER[priority])}
                >
                  <span className="text-xs text-white/50 w-20 shrink-0">{PRIORITY_LABELS[priority]}</span>
                  <div className="flex gap-1.5">
                    {CHANNELS.map(({ type, icon: Icon, channelId }) => {
                      const channels = getChannels(ROUTING_KEYS[0], priority).filter(c => c !== 'in_app');
                      const active = channels.includes(type);
                      const connected = isChannelConnected(type);
                      return (
                        <ChannelChipButton
                          key={type}
                          icon={Icon}
                          active={active}
                          connected={connected}
                          onToggle={() => (connected ? handleGlobalToggle(priority, type) : onOpenOnboarding(channelId))}
                          tooltipNotConnected="Not connected — click to set up"
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-white/10 pt-4 space-y-3">
              {ROUTING_KEYS.map(cat => {
                const expanded = allExpanded || expandedCards.has(cat);
                return (
                  <div
                    key={cat}
                    className="rounded-xl p-4 transition-colors hover:brightness-110"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm text-white/75">{ROUTING_CATEGORY_LABELS[cat]}</p>
                      {!expanded && (
                        <button
                          type="button"
                          onClick={() => toggleCardExpand(cat)}
                          className="text-xs text-white/50 hover:text-white/70"
                        >
                          + Attention · Info
                        </button>
                      )}
                    </div>

                    {/* Critical — always visible */}
                    <div className={cn('flex items-center gap-3 py-2 pl-3 -ml-3 rounded-r mt-2', ROW_BORDER.critical)}>
                      <span className="text-xs text-white/50 w-20 shrink-0">Critical</span>
                      <div className="flex gap-1.5">
                        {CHANNELS.map(({ type, icon: Icon, channelId }) => {
                          const channels = getChannels(cat, 'critical').filter(c => c !== 'in_app');
                          const active = channels.includes(type);
                          const connected = isChannelConnected(type);
                          return (
                            <ChannelChipButton
                              key={type}
                              icon={Icon}
                              active={active}
                              connected={connected}
                              onToggle={() => (connected ? toggleChannel(cat, 'critical', type) : onOpenOnboarding(channelId))}
                              tooltipNotConnected="Not connected — click to set up"
                            />
                          );
                        })}
                      </div>
                    </div>

                    {(expanded || allExpanded) && (
                      <div className="animate-in fade-in slide-in-from-bottom-1 duration-200">
                        <div className={cn('flex items-center gap-3 py-2 pl-3 -ml-3 rounded-r', ROW_BORDER.attention)}>
                          <span className="text-xs text-white/50 w-20 shrink-0">Attention</span>
                          <div className="flex gap-1.5">
                            {CHANNELS.map(({ type, icon: Icon, channelId }) => {
                              const channels = getChannels(cat, 'attention').filter(c => c !== 'in_app');
                              const active = channels.includes(type);
                              const connected = isChannelConnected(type);
                              return (
                                <ChannelChipButton
                                  key={type}
                                  icon={Icon}
                                  active={active}
                                  connected={connected}
                                  onToggle={() => (connected ? toggleChannel(cat, 'attention', type) : onOpenOnboarding(channelId))}
                                  tooltipNotConnected="Not connected — click to set up"
                                />
                              );
                            })}
                          </div>
                        </div>
                        <div className={cn('flex items-center gap-3 py-2 pl-3 -ml-3 rounded-r', ROW_BORDER.info)}>
                          <span className="text-xs text-white/50 w-20 shrink-0">Info</span>
                          <div className="flex gap-1.5">
                            {CHANNELS.map(({ type, icon: Icon, channelId }) => {
                              const channels = getChannels(cat, 'info').filter(c => c !== 'in_app');
                              const active = channels.includes(type);
                              const connected = isChannelConnected(type);
                              return (
                                <ChannelChipButton
                                  key={type}
                                  icon={Icon}
                                  active={active}
                                  connected={connected}
                                  onToggle={() => (connected ? toggleChannel(cat, 'info', type) : onOpenOnboarding(channelId))}
                                  tooltipNotConnected="Not connected — click to set up"
                                />
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {expanded && !allExpanded && (
                      <button
                        type="button"
                        onClick={() => toggleCardExpand(cat)}
                        className="text-[11px] text-white/40 mt-2"
                      >
                        Collapse
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            </div>
            </>
            )}
          </div>

          <div className="px-6 py-4 border-t border-white/10 flex items-center justify-between">
            <div>
              {showResetConfirm ? (
                <span className="text-xs text-white/60">
                  Reset all notification routing to defaults?{' '}
                  <button type="button" onClick={handleReset} className="underline text-white/90">Yes</button>
                  {' · '}
                  <button type="button" onClick={() => setShowResetConfirm(false)} className="underline text-white/70">Cancel</button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(true)}
                  className="text-xs text-white/50 hover:text-white/70 underline"
                >
                  Reset to defaults
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-full px-4 py-2 text-sm font-medium transition-colors"
              style={{ background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.9)' }}
            >
              Done
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChannelChipButton({
  icon: Icon,
  active,
  connected,
  onToggle,
  tooltipNotConnected,
}: {
  icon: typeof Mail;
  active: boolean;
  connected: boolean;
  onToggle: () => void;
  tooltipNotConnected: string;
}) {
  const btn = (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'w-7 h-7 rounded-lg flex items-center justify-center transition-all shrink-0',
        active && connected && 'bg-green-500/20 border border-green-500/30',
        !active && connected && 'border border-white/20 bg-white/5',
        !connected && 'border border-white/15 bg-white/5 opacity-60'
      )}
    >
      <Icon className={cn('h-3.5 w-3.5', active && connected ? 'text-green-400 opacity-100' : 'text-white/70 opacity-70')} />
    </button>
  );
  if (!connected) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{btn}</TooltipTrigger>
          <TooltipContent side="top" className="text-xs">{tooltipNotConnected}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return btn;
}
