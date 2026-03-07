import { useState, Fragment } from 'react';
import { Mail, MessageCircle, Users, Smartphone, Loader2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { OrgExternalNotificationConfig } from '@/lib/externalNotifications';

export type ChannelId = 'email' | 'slack' | 'teams' | 'push';

export type ChipState = 'not_connected' | 'connected_on' | 'connected_off' | 'connecting';

const CHANNELS: { id: ChannelId; label: string; icon: typeof Mail }[] = [
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'slack', label: 'Slack', icon: MessageCircle },
  { id: 'teams', label: 'Teams', icon: Users },
  { id: 'push', label: 'Push', icon: Smartphone },
];

function getChannelState(channel: ChannelId, config: OrgExternalNotificationConfig): ChipState {
  if (channel === 'email') {
    const hasSetup = !!config.email?.senderAddress?.trim();
    if (!hasSetup) return 'not_connected';
    return config.email?.enabled ? 'connected_on' : 'connected_off';
  }
  if (channel === 'slack') {
    const hasConnection = !!(config.slack?.webhookUrl?.trim() || config.slack?.connected);
    if (!hasConnection) return 'not_connected';
    return config.slack?.enabled ? 'connected_on' : 'connected_off';
  }
  if (channel === 'teams') {
    const hasConnection = config.teams?.method === 'webhook'
      ? !!config.teams?.webhookUrl?.trim()
      : !!(config.teams?.azureClientId && config.teams?.azureTenantId);
    if (!hasConnection) return 'not_connected';
    return config.teams?.enabled ? 'connected_on' : 'connected_off';
  }
  if (channel === 'push') {
    if (!config.push?.enabled) return 'not_connected';
    return 'connected_on';
  }
  return 'not_connected';
}

interface ChannelChipsProps {
  config: OrgExternalNotificationConfig;
  connectingChannel: ChannelId | null;
  onChannelClick: (channel: ChannelId) => void;
  onToggleChannel: (channel: ChannelId, enabled: boolean) => void;
  onReconfigure: (channel: ChannelId) => void;
  /** Only true for Team Manager read-only card; Admin surface must never pass readOnly so chips stay clickable. */
  readOnly?: boolean;
}

export function ChannelChips({
  config,
  connectingChannel,
  onChannelClick,
  onToggleChannel,
  onReconfigure,
  readOnly = false,
}: ChannelChipsProps) {
  const [openPopover, setOpenPopover] = useState<ChannelId | null>(null);

  const getStatusLabel = (channel: ChannelId, state: ChipState): string => {
    if (state === 'connecting') return 'Connecting…';
    if (channel === 'email') return state === 'connected_on' ? 'Email on' : state === 'connected_off' ? 'Email off' : 'Email not connected';
    if (channel === 'slack') return state === 'connected_on' ? 'Slack on' : state === 'connected_off' ? 'Slack off' : 'Slack not connected';
    if (channel === 'teams') return state === 'connected_on' ? 'Teams on' : state === 'connected_off' ? 'Teams off' : 'Teams not connected';
    if (channel === 'push') return state === 'connected_on' ? 'Push on' : state === 'connected_off' ? 'Push off' : 'Push not connected';
    return '';
  };

  const getConnectionSummary = (channel: ChannelId): string => {
    if (channel === 'email') return config.email?.senderAddress ? `Sending to ${config.email.senderAddress}` : 'Email';
    if (channel === 'slack') return config.slack?.channelCritical ? `#${config.slack.channelCritical}` : (config.slack?.webhookUrl ? 'Webhook connected' : 'Connected');
    if (channel === 'teams') return config.teams?.webhookUrl ? 'Webhook connected' : (config.teams?.azureClientId ? 'Azure connected' : 'Connected');
    if (channel === 'push') return 'Push enabled';
    return 'Connected';
  };

  return (
    <div className="flex flex-wrap gap-4">
      {CHANNELS.map(({ id, icon: Icon }) => {
        const state = connectingChannel === id ? 'connecting' : getChannelState(id, config);
        const isConnected = state === 'connected_on' || state === 'connected_off';
        const isOn = state === 'connected_on';

        const chip = (
          <button
            type="button"
            onClick={() => !readOnly && onChannelClick(id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all cursor-pointer',
              'hover:brightness-110 hover:shadow-sm',
              state === 'connecting' && 'pointer-events-none',
              state === 'not_connected' && 'border-white/20 bg-muted/20 text-muted-foreground hover:bg-muted/30 hover:border-white/30',
              state === 'connected_on' && 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300 hover:bg-green-500/15',
              state === 'connected_off' && 'border-amber-500/20 bg-amber-500/5 text-amber-700/80 dark:text-amber-400/80 hover:bg-amber-500/10',
              state === 'connecting' && 'border-primary/30 bg-primary/10 text-primary'
            )}
          >
            {state === 'connecting' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Icon className="h-3.5 w-3.5 shrink-0" />
            )}
            <span>{getStatusLabel(id, state)}</span>
          </button>
        );

        if (readOnly) {
          return (
            <span
              key={id}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium cursor-default',
                state === 'not_connected' && 'border-white/20 bg-muted/20 text-muted-foreground',
                state === 'connected_on' && 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300',
                state === 'connected_off' && 'border-amber-500/20 bg-amber-500/5 text-amber-700/80 dark:text-amber-400/80',
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span>{getStatusLabel(id, state)}</span>
            </span>
          );
        }

        if (isConnected) {
          return (
            <Popover key={id} open={openPopover === id} onOpenChange={open => setOpenPopover(open ? id : null)}>
              <PopoverTrigger asChild>
                {chip}
              </PopoverTrigger>
              <PopoverContent
                align="start"
                sideOffset={8}
                className="w-64 rounded-xl border border-white/15 bg-background/90 backdrop-blur-md shadow-lg p-3"
              >
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">{getConnectionSummary(id)}</p>
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor={`toggle-${id}`} className="text-xs font-medium">
                      Deliver to this channel
                    </Label>
                    <Switch
                      id={`toggle-${id}`}
                      checked={isOn}
                      onCheckedChange={v => onToggleChannel(id, !!v)}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => { setOpenPopover(null); onReconfigure(id); }}
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    Reconfigure
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          );
        }

        return <Fragment key={id}>{chip}</Fragment>;
      })}
    </div>
  );
}
