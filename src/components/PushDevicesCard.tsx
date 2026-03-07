import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  getPushDevices,
  addPushDevice,
  removePushDevice,
  updatePushDevice,
  loadPushPreferences,
  savePushPreferences,
  isPushSupported,
  getPushPermissionState,
  isPushPromptInCooldown,
  setPushPromptDismissed,
  isDeviceInactive,
  type PushDevice,
  type PushSeverityFilter,
  type PushAttentionBatching,
} from '@/lib/pushNotifications';
import { Smartphone, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const SEVERITY_OPTIONS: { value: PushSeverityFilter; label: string }[] = [
  { value: 'critical_only', label: 'Critical only' },
  { value: 'critical_attention', label: 'Critical + Attention' },
  { value: 'all', label: 'All' },
];

const BATCHING_OPTIONS: { value: PushAttentionBatching; label: string }[] = [
  { value: 'immediate', label: 'Immediate' },
  { value: '15min', label: 'Every 15 min' },
  { value: '1hour', label: 'Every hour' },
];

interface PushDevicesCardProps {
  userId: string;
}

export function PushDevicesCard({ userId }: PushDevicesCardProps) {
  const [devices, setDevices] = useState<PushDevice[]>(() => getPushDevices(userId));
  const [prefs, setPrefs] = useState(() => loadPushPreferences(userId));
  const [promptOpen, setPromptOpen] = useState(false);
  const supported = isPushSupported();
  const permission = getPushPermissionState();
  const inCooldown = isPushPromptInCooldown();

  useEffect(() => {
    setDevices(getPushDevices(userId));
    setPrefs(loadPushPreferences(userId));
  }, [userId]);

  const showPrompt = supported && permission !== 'granted' && !inCooldown && !promptOpen;

  const handleEnableClick = async () => {
    if (typeof Notification === 'undefined') return;
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      const name = typeof navigator !== 'undefined' && navigator.userAgent ? navigator.userAgent.slice(0, 50) : 'This browser';
      const { ok, error } = addPushDevice(userId, {
        name: name || 'PWA',
        type: 'pwa',
        enabled: true,
      });
      if (ok) setDevices(getPushDevices(userId));
      setPromptOpen(false);
    } else {
      setPushPromptDismissed();
      setPromptOpen(false);
    }
  };

  const handleNotNow = () => {
    setPushPromptDismissed();
    setPromptOpen(false);
  };

  const handleRemove = (deviceId: string) => {
    removePushDevice(userId, deviceId);
    setDevices(getPushDevices(userId));
  };

  const handleToggleEnabled = (deviceId: string, enabled: boolean) => {
    updatePushDevice(userId, deviceId, { enabled });
    setDevices(getPushDevices(userId));
  };

  const deviceTypeLabel = (d: PushDevice) => (d.type === 'pwa' ? 'Browser' : d.type === 'ios' ? 'iOS' : 'Android');

  return (
    <Card className="bg-card/50 border-white/10">
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-muted-foreground" />
          Push devices
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Get Critical and Attention alerts on this device. Max 10 devices; remove one to add another.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {showPrompt && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-3 space-y-2">
            <p className="text-xs text-foreground/90">
              Get Critical alerts on this device even when the app is closed — enable push notifications?
            </p>
            <div className="flex gap-2">
              <Button size="sm" className="h-8 text-xs" onClick={handleEnableClick}>
                Enable
              </Button>
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={handleNotNow}>
                Not now
              </Button>
            </div>
          </div>
        )}

        {permission === 'denied' && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            Push notifications are blocked in your browser — update your browser settings to enable them.
          </p>
        )}

        <div className="space-y-2">
          <Label className="text-xs">Severity filter</Label>
          <Select
            value={prefs.severityFilter}
            onValueChange={v => {
              const next = { ...prefs, severityFilter: v as PushSeverityFilter };
              savePushPreferences(next);
              setPrefs(next);
            }}
          >
            <SelectTrigger className="h-8 text-xs bg-background/50 border-white/10 w-full max-w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEVERITY_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Attention batching</Label>
          <Select
            value={prefs.attentionBatching}
            onValueChange={v => {
              const next = { ...prefs, attentionBatching: v as PushAttentionBatching };
              savePushPreferences(next);
              setPrefs(next);
            }}
          >
            <SelectTrigger className="h-8 text-xs bg-background/50 border-white/10 w-full max-w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BATCHING_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <label className="flex items-center gap-2">
          <Checkbox
            checked={prefs.soundForAttention}
            onCheckedChange={v => {
              const next = { ...prefs, soundForAttention: !!v };
              savePushPreferences(next);
              setPrefs(next);
            }}
          />
          <span className="text-xs text-muted-foreground">Sound for Attention tier (Critical is always on)</span>
        </label>

        {devices.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs">Registered devices</Label>
            <div className="space-y-1.5">
              {devices.map(d => (
                <div
                  key={d.id}
                  className={cn(
                    'flex items-center justify-between rounded-lg border px-3 py-2 text-xs bg-muted/10 border-white/10',
                    isDeviceInactive(d) && 'opacity-75'
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Checkbox
                      checked={d.enabled}
                      onCheckedChange={v => handleToggleEnabled(d.id, !!v)}
                    />
                    <div className="min-w-0">
                      <p className="font-medium truncate">{d.name || deviceTypeLabel(d)}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {deviceTypeLabel(d)} · {new Date(d.registeredAt).toLocaleDateString()}
                        {d.lastPushAt && ` · Last push ${new Date(d.lastPushAt).toLocaleDateString()}`}
                        {isDeviceInactive(d) && ' · May be inactive'}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => handleRemove(d.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {devices.length === 0 && !showPrompt && permission !== 'granted' && supported && (
          <p className="text-[11px] text-muted-foreground">No push devices. Enable push above to add this device.</p>
        )}
      </CardContent>
    </Card>
  );
}
