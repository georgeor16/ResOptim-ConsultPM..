import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  loadOrgExternalConfig,
  saveOrgExternalConfig,
  getDefaultExternalConfig,
  ROUTING_CATEGORY_LABELS,
  type OrgExternalNotificationConfig,
  type RoutingCategoryKey,
  type ExternalChannelType,
  type EmailConfig,
  type SlackConfig,
  type TeamsConfig,
  type PushConfig,
} from '@/lib/externalNotifications';
import type { NotificationPriority } from '@/lib/notifications';
import { loadNotificationPreferences, saveNotificationPreferences } from '@/lib/notifications';
import {
  loadScheduledPauses,
  saveScheduledPauses,
  loadOneOffPause,
  saveOneOffPause,
  isInScheduledPauseWindow,
  getActiveScheduledPause,
  getOneOffPauseRemainingMinutes,
  type ScheduledPause,
} from '@/lib/scheduledPause';
import {
  loadDndProfiles,
  saveDndProfiles,
  loadActiveDnd,
  getActiveDndStateNoClear,
  saveActiveDnd,
  getDndRemainingMinutes,
  computeDndEndsAt,
  type DndProfile,
} from '@/lib/dndProfiles';
import { addNotification } from '@/lib/notifications';
import { useAuth } from '@/contexts/AuthContext';
import { Mail, MessageCircle, Users, Smartphone, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChannelChips, type ChannelId } from '@/components/ChannelChips';
import { ChannelOnboardingSheet } from '@/components/ChannelOnboardingSheet';
import { ManageNotificationsModal } from '@/components/ManageNotificationsModal';

const ROUTING_KEYS = Object.keys(ROUTING_CATEGORY_LABELS) as RoutingCategoryKey[];

interface ExternalNotificationsSettingsProps {
  orgId: string;
  onConfigChange?: (config: OrgExternalNotificationConfig) => void;
  /** Pre-fill email onboarding with this address. */
  profileEmail?: string;
}

export function ExternalNotificationsSettings({ orgId, onConfigChange, profileEmail }: ExternalNotificationsSettingsProps) {
  const { currentUser } = useAuth();
  const [config, setConfig] = useState<OrgExternalNotificationConfig>(() =>
    loadOrgExternalConfig(orgId)
  );
  const [onboardingChannel, setOnboardingChannel] = useState<ChannelId | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingStartStep, setOnboardingStartStep] = useState(0);
  const [connectingChannel, setConnectingChannel] = useState<ChannelId | null>(null);
  const [routingModalOpen, setRoutingModalOpen] = useState(false);
  const [quickAlertsOn, setQuickAlertsOn] = useState(true);
  const [schedules, setSchedules] = useState<ScheduledPause[]>([]);
  const [oneOffRemainingMinutes, setOneOffRemainingMinutes] = useState(0);
  const [dndProfiles, setDndProfiles] = useState<DndProfile[]>([]);
  const [activeDnd, setActiveDnd] = useState<ReturnType<typeof loadActiveDnd>>(null);
  const [dndRemainingMinutes, setDndRemainingMinutes] = useState(0);

  useEffect(() => {
    if (currentUser) {
      const prefs = loadNotificationPreferences(currentUser.id);
      setQuickAlertsOn(prefs.quickAlertsEnabled !== false);
      setSchedules(loadScheduledPauses(currentUser.id));
      setOneOffRemainingMinutes(getOneOffPauseRemainingMinutes(currentUser.id));
      setDndProfiles(loadDndProfiles(currentUser.id));
      setActiveDnd(loadActiveDnd(currentUser.id));
      setDndRemainingMinutes(getDndRemainingMinutes(currentUser.id));
    }
  }, [currentUser, routingModalOpen]);

  useEffect(() => {
    const open = () => setRoutingModalOpen(true);
    window.addEventListener('open-manage-notifications', open);
    return () => window.removeEventListener('open-manage-notifications', open);
  }, []);

  useEffect(() => {
    const onResumed = () => {
      if (currentUser) {
        setActiveDnd(null);
        setDndRemainingMinutes(0);
      }
    };
    window.addEventListener('dnd-resumed', onResumed);
    return () => window.removeEventListener('dnd-resumed', onResumed);
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const tick = () => {
      setOneOffRemainingMinutes(getOneOffPauseRemainingMinutes(currentUser.id));
      const dndCurrent = getActiveDndStateNoClear(currentUser.id);
      if (dndCurrent && new Date(dndCurrent.endsAt).getTime() <= Date.now()) {
        if (dndCurrent.notifyOnEnd) {
          addNotification({
            id: crypto.randomUUID(),
            userId: currentUser.id,
            type: 'project_status',
            category: 'project',
            title: `${dndCurrent.profileIcon} ${dndCurrent.profileName} ended`,
            message: 'External notifications resumed',
            createdAt: new Date().toISOString(),
            read: false,
          });
        }
        saveActiveDnd(currentUser.id, null);
      }
      setDndRemainingMinutes(getDndRemainingMinutes(currentUser.id));
      setActiveDnd(loadActiveDnd(currentUser.id));
    };
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, [currentUser]);

  const handleQuickAlertsChange = (on: boolean) => {
    if (!currentUser) return;
    const prefs = loadNotificationPreferences(currentUser.id);
    saveNotificationPreferences({ ...prefs, quickAlertsEnabled: on });
    setQuickAlertsOn(on);
  };

  const persist = (next: OrgExternalNotificationConfig) => {
    setConfig(next);
    saveOrgExternalConfig(next);
    onConfigChange?.(next);
  };

  const updateRouting = (category: RoutingCategoryKey, priority: NotificationPriority, channels: ExternalChannelType[]) => {
    const matrix = { ...config.routingMatrix };
    const row = { ...(matrix[category] ?? {}) };
    row[priority] = channels.length ? channels : ['in_app'];
    matrix[category] = row;
    persist({ ...config, routingMatrix: matrix });
  };

  const getChannels = (category: RoutingCategoryKey, priority: NotificationPriority): ExternalChannelType[] => {
    const row = config.routingMatrix[category]?.[priority];
    const list = row && row.length ? row : ['in_app'];
    return list.includes('in_app') ? list : ['in_app', ...list];
  };

  const toggleChannel = (category: RoutingCategoryKey, priority: NotificationPriority, channel: ExternalChannelType) => {
    const current = getChannels(category, priority).filter(c => c !== 'in_app');
    const has = current.includes(channel);
    const next = has ? current.filter(c => c !== channel) : [...current, channel];
    updateRouting(category, priority, ['in_app', ...next]);
  };

  const setChannelsForAllCategories = (priority: NotificationPriority, channels: ExternalChannelType[]) => {
    const matrix = { ...config.routingMatrix };
    const ROUTING_KEYS = Object.keys(ROUTING_CATEGORY_LABELS) as RoutingCategoryKey[];
    for (const cat of ROUTING_KEYS) {
      matrix[cat] = { ...(matrix[cat] ?? {}), [priority]: ['in_app', ...channels] };
    }
    persist({ ...config, routingMatrix: matrix });
  };

  const handleResetRouting = () => {
    const defaultConfig = getDefaultExternalConfig(orgId);
    persist({ ...config, routingMatrix: defaultConfig.routingMatrix });
  };

  const inScheduledWindow = currentUser ? isInScheduledPauseWindow(currentUser.id) : false;
  const scheduledPauseActive = currentUser ? getActiveScheduledPause(currentUser.id) !== null : false;
  const dndActive = activeDnd !== null;
  const effectivePaused = !quickAlertsOn || inScheduledWindow || oneOffRemainingMinutes > 0 || dndActive;

  const handleSchedulesChange = (next: ScheduledPause[]) => {
    if (!currentUser) return;
    saveScheduledPauses(currentUser.id, next);
    setSchedules(next);
  };

  const handleRemoveSchedule = (id: string) => {
    if (!currentUser) return;
    const next = schedules.filter(s => s.id !== id);
    saveScheduledPauses(currentUser.id, next);
    setSchedules(next);
  };

  const handleOneOffStart = (endsAt: string) => {
    if (!currentUser) return;
    saveOneOffPause(currentUser.id, { endsAt });
    setOneOffRemainingMinutes(getOneOffPauseRemainingMinutes(currentUser.id));
  };

  const handleOneOffClear = () => {
    if (!currentUser) return;
    saveOneOffPause(currentUser.id, null);
    setOneOffRemainingMinutes(0);
  };

  const handleActivateDnd = (profile: DndProfile) => {
    if (!currentUser) return;
    const now = new Date();
    const endsAt = computeDndEndsAt(profile, now);
    if (!endsAt) return; // e.g. date_range with no dates
    const state = {
      profileId: profile.id,
      profileName: profile.name,
      profileIcon: profile.icon,
      activatedAt: now.toISOString(),
      endsAt,
      suppressCritical: profile.suppressCritical,
      notifyOnEnd: profile.notifyOnEnd,
    };
    saveActiveDnd(currentUser.id, state);
    setActiveDnd(state);
    setDndRemainingMinutes(getDndRemainingMinutes(currentUser.id));
    const endLabel = endsAt.includes('T') ? new Date(endsAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : new Date(endsAt).toLocaleDateString();
    addNotification({
      id: crypto.randomUUID(),
      userId: currentUser.id,
      type: 'project_status',
      category: 'project',
      title: `${profile.icon} ${profile.name} activated`,
      message: `External notifications paused until ${endLabel}`,
      createdAt: new Date().toISOString(),
      read: false,
    });
  };

  const handleResumeDnd = () => {
    if (!currentUser) return;
    saveActiveDnd(currentUser.id, null);
    setActiveDnd(null);
    setDndRemainingMinutes(0);
  };

  const handleSaveDndProfiles = (profiles: DndProfile[]) => {
    if (!currentUser) return;
    saveDndProfiles(currentUser.id, profiles);
    setDndProfiles(loadDndProfiles(currentUser.id));
  };

  const isChannelConnected = (channel: ExternalChannelType): boolean => {
    if (channel === 'email') return !!(config.email?.senderAddress?.trim());
    if (channel === 'slack') return !!(config.slack?.webhookUrl?.trim() || config.slack?.connected);
    if (channel === 'teams') return config.teams?.method === 'webhook' ? !!config.teams?.webhookUrl?.trim() : !!(config.teams?.azureClientId && config.teams?.azureTenantId);
    if (channel === 'push') return !!config.push?.enabled;
    return false;
  };

  const setEmail = (partial: Partial<EmailConfig>) => {
    persist({
      ...config,
      email: { ...getDefaultExternalConfig(orgId).email!, ...config.email, ...partial },
    });
  };

  const setSlack = (partial: Partial<SlackConfig>) => {
    persist({
      ...config,
      slack: { ...getDefaultExternalConfig(orgId).slack!, ...config.slack, ...partial },
    });
  };

  const setTeams = (partial: Partial<TeamsConfig>) => {
    persist({
      ...config,
      teams: { ...getDefaultExternalConfig(orgId).teams!, ...config.teams, ...partial },
    });
  };

  const setPush = (partial: Partial<PushConfig>) => {
    persist({
      ...config,
      push: { ...getDefaultExternalConfig(orgId).push!, ...config.push, ...partial },
    });
  };

  const setQuietHours = (partial: OrgExternalNotificationConfig['quietHours']) => {
    persist({ ...config, quietHours: partial ? { ...config.quietHours, ...partial } : undefined });
  };

  const handleChannelClick = (channel: ChannelId) => {
    const isConnected =
      (channel === 'email' && !!config.email?.senderAddress?.trim()) ||
      (channel === 'slack' && !!(config.slack?.webhookUrl?.trim() || config.slack?.connected)) ||
      (channel === 'teams' && (config.teams?.method === 'webhook' ? !!config.teams?.webhookUrl?.trim() : !!(config.teams?.azureClientId && config.teams?.azureTenantId))) ||
      (channel === 'push' && !!config.push?.enabled);
    if (!isConnected) {
      setOnboardingChannel(channel);
      setOnboardingStartStep(0);
      setOnboardingOpen(true);
    }
  };

  const handleToggleChannel = (channel: ChannelId, enabled: boolean) => {
    if (channel === 'email') setEmail({ enabled });
    if (channel === 'slack') setSlack({ enabled });
    if (channel === 'teams') setTeams({ enabled });
    if (channel === 'push') setPush({ enabled });
  };

  const handleReconfigure = (channel: ChannelId) => {
    setOnboardingChannel(channel);
    setOnboardingStartStep(channel === 'email' ? 2 : channel === 'push' ? 1 : 1);
    setOnboardingOpen(true);
  };

  return (
    <Card className="bg-card/50 border-white/10">
      <CardHeader>
        <CardTitle className="text-sm font-medium">External Notifications</CardTitle>
        <p className="text-xs text-muted-foreground">
          Route organisation-level alerts to Email, Slack, Teams, and Push. Configuration is role-scoped and applies immediately.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Interactive channel chips */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Channels</Label>
          <ChannelChips
            config={config}
            connectingChannel={connectingChannel}
            onChannelClick={handleChannelClick}
            onToggleChannel={handleToggleChannel}
            onReconfigure={handleReconfigure}
          />
        </div>

        <ChannelOnboardingSheet
          channel={onboardingChannel}
          open={onboardingOpen}
          onClose={() => { setOnboardingOpen(false); setOnboardingChannel(null); }}
          onComplete={() => setConfig(loadOrgExternalConfig(orgId))}
          config={config}
          setEmail={setEmail}
          setSlack={setSlack}
          setTeams={setTeams}
          setPush={setPush}
          profileEmail={profileEmail}
          startStep={onboardingStartStep}
          orgId={orgId}
        />

        <div className="space-y-1.5">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setRoutingModalOpen(true)}
            className="rounded-full border-2 border-orange-500 bg-white/5 hover:bg-white/10 hover:border-orange-400 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Bell className="h-4 w-4 mr-2" />
            Manage Notifications
          </Button>
          {currentUser && effectivePaused && (
            <p className="text-xs text-muted-foreground">
              External notifications are currently paused.
            </p>
          )}
        </div>

        <ManageNotificationsModal
          open={routingModalOpen}
          onOpenChange={setRoutingModalOpen}
          config={config}
          orgId={orgId}
          getChannels={getChannels}
          toggleChannel={toggleChannel}
          setChannelsForAllCategories={setChannelsForAllCategories}
          onReset={handleResetRouting}
          isChannelConnected={isChannelConnected}
          onOpenOnboarding={(channelId) => {
            setRoutingModalOpen(false);
            setOnboardingChannel(channelId);
            setOnboardingStartStep(0);
            setOnboardingOpen(true);
          }}
          quickAlertsOn={quickAlertsOn}
          onQuickAlertsChange={handleQuickAlertsChange}
          orgExternalPaused={config.externalDeliveryPausedByOrg}
          effectivePaused={effectivePaused}
          scheduledPauseActive={scheduledPauseActive}
          oneOffRemainingMinutes={oneOffRemainingMinutes}
          schedules={schedules}
          onSchedulesChange={handleSchedulesChange}
          onRemoveSchedule={handleRemoveSchedule}
          onOneOffStart={handleOneOffStart}
          onOneOffClear={handleOneOffClear}
          dndProfiles={dndProfiles}
          activeDnd={activeDnd}
          dndRemainingMinutes={dndRemainingMinutes}
          onActivateDnd={handleActivateDnd}
          onResumeDnd={handleResumeDnd}
          onSaveDndProfiles={handleSaveDndProfiles}
        />

        <Tabs defaultValue="email" className="w-full">
          <TabsList className="bg-muted/30 border border-white/10 rounded-full w-full grid grid-cols-4">
            <TabsTrigger value="email" className="text-xs px-2 flex items-center gap-1">
              <Mail className="h-3.5 w-3.5" /> Email
            </TabsTrigger>
            <TabsTrigger value="slack" className="text-xs px-2 flex items-center gap-1">
              <MessageCircle className="h-3.5 w-3.5" /> Slack
            </TabsTrigger>
            <TabsTrigger value="teams" className="text-xs px-2 flex items-center gap-1">
              <Users className="h-3.5 w-3.5" /> Teams
            </TabsTrigger>
            <TabsTrigger value="push" className="text-xs px-2 flex items-center gap-1">
              <Smartphone className="h-3.5 w-3.5" /> Push
            </TabsTrigger>
          </TabsList>

          <TabsContent value="email" className="mt-4 space-y-4">
            <label className="flex items-center gap-2">
              <Checkbox
                checked={config.email?.enabled ?? false}
                onCheckedChange={v => setEmail({ enabled: !!v })}
              />
              <span className="text-sm">Enable email delivery</span>
            </label>
            {config.email?.enabled && (
              <>
                <div className="space-y-2">
                  <Label className="text-xs">Sender address</Label>
                  <Input
                    value={config.email?.senderAddress ?? ''}
                    onChange={e => setEmail({ senderAddress: e.target.value })}
                    placeholder="noreply@org.com"
                    className="bg-background/50 border-white/10 h-8 text-xs"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Reply-to (optional)</Label>
                  <Input
                    value={config.email?.replyToAddress ?? ''}
                    onChange={e => setEmail({ replyToAddress: e.target.value || undefined })}
                    placeholder="support@org.com"
                    className="bg-background/50 border-white/10 h-8 text-xs"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Attention alerts batch interval (hours)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={24}
                    value={config.email?.attentionBatchIntervalHours ?? 4}
                    onChange={e => setEmail({ attentionBatchIntervalHours: Math.max(1, Math.min(24, Number(e.target.value) || 4)) })}
                    className="bg-background/50 border-white/10 h-8 text-xs w-20"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Digest cadence</Label>
                  <Select
                    value={config.email?.digestCadence ?? 'weekly'}
                    onValueChange={v => setEmail({ digestCadence: v as 'daily' | 'weekly' | 'biweekly' })}
                  >
                    <SelectTrigger className="h-8 text-xs bg-background/50 border-white/10 w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="biweekly">Bi-weekly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="slack" className="mt-4 space-y-4">
            <label className="flex items-center gap-2">
              <Checkbox
                checked={config.slack?.enabled ?? false}
                onCheckedChange={v => setSlack({ enabled: !!v })}
              />
              <span className="text-sm">Enable Slack delivery</span>
            </label>
            {config.slack?.enabled && (
              <>
                <div className="rounded-lg border border-white/10 bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
                  Connect via an Incoming Webhook from your Slack workspace. Create one in Slack: Settings → Integrations → Incoming Webhooks, then paste the URL below.
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Webhook URL</Label>
                  <Input
                    type="url"
                    value={config.slack?.webhookUrl ?? ''}
                    onChange={e => setSlack({ webhookUrl: e.target.value, connected: !!e.target.value.trim() })}
                    placeholder="https://hooks.slack.com/services/..."
                    className="bg-background/50 border-white/10 h-8 text-xs font-mono"
                  />
                </div>
                {config.slack?.webhookUrl?.trim() ? (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="h-2 w-2 rounded-full bg-green-500/80 shrink-0" title="Connected" />
                    <span className="text-muted-foreground">Connected — messages will post to the default channel of the webhook unless you override below.</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="h-2 w-2 rounded-full bg-amber-500/80 shrink-0" title="Not connected" />
                    <span className="text-muted-foreground">Paste a webhook URL above to connect.</span>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Critical alerts channel</Label>
                    <Input
                      value={config.slack?.channelCritical ?? ''}
                      onChange={e => setSlack({ channelCritical: e.target.value || undefined })}
                      placeholder="#critical-alerts"
                      className="bg-background/50 border-white/10 h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Attention alerts channel</Label>
                    <Input
                      value={config.slack?.channelAttention ?? ''}
                      onChange={e => setSlack({ channelAttention: e.target.value || undefined })}
                      placeholder="#planning-alerts"
                      className="bg-background/50 border-white/10 h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Digest channel</Label>
                    <Input
                      value={config.slack?.channelDigest ?? ''}
                      onChange={e => setSlack({ channelDigest: e.target.value || undefined })}
                      placeholder="#weekly-digest"
                      className="bg-background/50 border-white/10 h-8 text-xs"
                    />
                  </div>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="teams" className="mt-4 space-y-4">
            <label className="flex items-center gap-2">
              <Checkbox
                checked={config.teams?.enabled ?? false}
                onCheckedChange={v => setTeams({ enabled: !!v })}
              />
              <span className="text-sm">Enable Microsoft Teams delivery</span>
            </label>
            {config.teams?.enabled && (
              <>
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs">Connection method</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-[10px] text-muted-foreground cursor-help border-b border-dotted border-muted-foreground/50">Which should I use?</span>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-[220px] text-xs">
                          <p><strong>Incoming Webhook</strong>: Quick to set up, no Azure admin required. Limited to posting messages — no interactive buttons.</p>
                          <p className="mt-1"><strong>Azure App</strong>: Enables Acknowledge buttons and adaptive cards. Recommended if you already use Microsoft ecosystem.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Select
                    value={config.teams?.method ?? 'webhook'}
                    onValueChange={v => setTeams({ method: v as 'webhook' | 'azure' })}
                  >
                    <SelectTrigger className="h-8 text-xs bg-background/50 border-white/10 w-full max-w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="webhook">Incoming Webhook (simple)</SelectItem>
                      <SelectItem value="azure">Azure App Registration (full)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {config.teams?.method === 'webhook' ? (
                  <>
                    <div className="rounded-lg border border-white/10 bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
                      Create an Incoming Webhook in your Teams channel (Connectors → Incoming Webhook), then paste the URL below.
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Webhook URL</Label>
                      <Input
                        type="url"
                        value={config.teams?.webhookUrl ?? ''}
                        onChange={e => setTeams({ webhookUrl: e.target.value })}
                        placeholder="https://outlook.office.com/webhook/..."
                        className="bg-background/50 border-white/10 h-8 text-xs font-mono"
                      />
                    </div>
                  </>
                ) : (
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <p>Azure App Registration allows interactive buttons (e.g. Acknowledge) and adaptive cards. Enter your app credentials below (stored locally).</p>
                    <div className="grid gap-2">
                      <div>
                        <Label className="text-xs">Client ID</Label>
                        <Input
                          value={config.teams?.azureClientId ?? ''}
                          onChange={e => setTeams({ azureClientId: e.target.value || undefined })}
                          placeholder="..."
                          className="bg-background/50 border-white/10 h-8 text-xs mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Tenant ID</Label>
                        <Input
                          value={config.teams?.azureTenantId ?? ''}
                          onChange={e => setTeams({ azureTenantId: e.target.value || undefined })}
                          placeholder="..."
                          className="bg-background/50 border-white/10 h-8 text-xs mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Client secret</Label>
                        <Input
                          type="password"
                          value={config.teams?.azureClientSecret ?? ''}
                          onChange={e => setTeams({ azureClientSecret: e.target.value || undefined })}
                          placeholder="..."
                          className="bg-background/50 border-white/10 h-8 text-xs mt-1"
                        />
                      </div>
                    </div>
                  </div>
                )}
                <div className="grid gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Critical / Attention / Digest channels</Label>
                    <Input
                      value={config.teams?.channelCritical ?? ''}
                      onChange={e => setTeams({ channelCritical: e.target.value || undefined })}
                      placeholder="Channel for critical"
                      className="bg-background/50 border-white/10 h-8 text-xs"
                    />
                  </div>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="push" className="mt-4 space-y-4">
            <label className="flex items-center gap-2">
              <Checkbox
                checked={config.push?.enabled ?? false}
                onCheckedChange={v => setPush({ enabled: !!v })}
              />
              <span className="text-sm">Enable push notifications (PWA & native)</span>
            </label>
            {config.push?.enabled && (
              <>
                <p className="text-xs text-muted-foreground">
                  Push uses the same routing matrix above. Critical and Attention are enabled by default. Users manage devices and preferences under Personal → Push devices.
                </p>
                <div className="space-y-2">
                  <Label className="text-xs">VAPID public key (PWA Web Push, optional)</Label>
                  <Input
                    value={config.push?.vapidPublicKey ?? ''}
                    onChange={e => setPush({ vapidPublicKey: e.target.value || undefined })}
                    placeholder="Base64 or URL-safe key for service worker subscription"
                    className="bg-background/50 border-white/10 h-8 text-xs font-mono"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Org-level push quiet hours can be set below; push respects the same quiet hours as other channels. Critical bypasses quiet hours.
                </p>
              </>
            )}
          </TabsContent>
        </Tabs>

        {/* Quiet hours (org-level) */}
        <div className="space-y-2">
          <Label className="text-xs">Organisation quiet hours (optional)</Label>
          <p className="text-[11px] text-muted-foreground">
            No Attention or Informational external notifications are sent during this window; they queue and deliver at the end. Critical always sends immediately.
          </p>
          <div className="flex flex-wrap gap-2 items-center">
            <Input
              type="time"
              value={config.quietHours?.start ?? ''}
              onChange={e => {
                const start = e.target.value;
                const prev = config.quietHours;
                const timezone = prev?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
                const end = prev?.end ?? '08:00';
                setQuietHours(start ? { start, end, timezone } : (prev?.end ? { ...prev, start: '' } : undefined));
              }}
              className="h-8 text-xs w-24 bg-background/50 border-white/10"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="time"
              value={config.quietHours?.end ?? ''}
              onChange={e => {
                const end = e.target.value;
                const prev = config.quietHours;
                const timezone = prev?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
                const start = prev?.start ?? '22:00';
                setQuietHours(end ? { start, end, timezone } : (prev?.start ? { ...prev, end: '' } : undefined));
              }}
              className="h-8 text-xs w-24 bg-background/50 border-white/10"
            />
            <Input
              value={config.quietHours?.timezone ?? ''}
              onChange={e => setQuietHours(config.quietHours ? { ...config.quietHours, timezone: e.target.value } : undefined)}
              placeholder="Timezone (e.g. Europe/London)"
              className="h-8 text-xs w-40 bg-background/50 border-white/10"
            />
          </div>
        </div>

        <label className="flex items-center gap-2">
          <Checkbox
            checked={config.criticalFallbackToEmail}
            onCheckedChange={v => persist({ ...config, criticalFallbackToEmail: !!v })}
          />
          <span className="text-xs">If Slack or Teams delivery fails for Critical alerts, retry via email</span>
        </label>
      </CardContent>
    </Card>
  );
}
