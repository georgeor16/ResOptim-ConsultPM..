import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChannelId } from './ChannelChips';
import type {
  OrgExternalNotificationConfig,
  EmailConfig,
  SlackConfig,
  TeamsConfig,
  PushConfig,
} from '@/lib/externalNotifications';

const EMAIL_STEPS = 3;
const SLACK_STEPS = 3;
const TEAMS_STEPS = 4;
const PUSH_STEPS = 2;

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const m = window.matchMedia('(max-width: 640px)');
    setMobile(m.matches);
    const f = () => setMobile(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return mobile;
}

interface ChannelOnboardingSheetProps {
  channel: ChannelId | null;
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
  config: OrgExternalNotificationConfig;
  setEmail: (p: Partial<EmailConfig>) => void;
  setSlack: (p: Partial<SlackConfig>) => void;
  setTeams: (p: Partial<TeamsConfig>) => void;
  setPush: (p: Partial<PushConfig>) => void;
  profileEmail?: string;
  startStep?: number;
  orgId: string;
}

export function ChannelOnboardingSheet({
  channel,
  open,
  onClose,
  onComplete,
  config,
  setEmail,
  setSlack,
  setTeams,
  setPush,
  profileEmail = '',
  startStep = 0,
  orgId,
}: ChannelOnboardingSheetProps) {
  const totalSteps = channel === 'email' ? EMAIL_STEPS : channel === 'slack' ? SLACK_STEPS : channel === 'teams' ? TEAMS_STEPS : PUSH_STEPS;
  const [step, setStep] = useState(startStep);
  const [emailAddress, setEmailAddress] = useState(profileEmail);
  const [slackWebhook, setSlackWebhook] = useState(config.slack?.webhookUrl ?? '');
  const [teamsMethod, setTeamsMethod] = useState<'webhook' | 'azure'>(config.teams?.method ?? 'webhook');
  const [teamsWebhookUrl, setTeamsWebhookUrl] = useState(config.teams?.webhookUrl ?? '');
  const [azureClientId, setAzureClientId] = useState(config.teams?.azureClientId ?? '');
  const [azureTenantId, setAzureTenantId] = useState(config.teams?.azureTenantId ?? '');
  const [azureSecret, setAzureSecret] = useState(config.teams?.azureClientSecret ?? '');
  const [emailTestSent, setEmailTestSent] = useState(false);
  const [pushPermissionRequested, setPushPermissionRequested] = useState(false);
  const [slackShowWebhook, setSlackShowWebhook] = useState(false);
  const [teamsShowWebhookGuide, setTeamsShowWebhookGuide] = useState(false);
  const [teamsShowAzureGuide, setTeamsShowAzureGuide] = useState(false);

  useEffect(() => {
    if (open) setStep(startStep);
  }, [open, startStep]);

  useEffect(() => {
    setEmailAddress(profileEmail || (config.email?.senderAddress ?? ''));
    setSlackWebhook(config.slack?.webhookUrl ?? '');
  }, [open, profileEmail, config.email?.senderAddress, config.slack?.webhookUrl]);

  const isMobile = useIsMobile();

  if (!channel) return null;

  const handleCancel = () => {
    onClose();
  };

  const progressValue = totalSteps > 0 ? (step / totalSteps) * 100 : 0;

  const handleEmailStep1 = () => {
    setEmailTestSent(true);
    setStep(1);
  };

  const handleEmailStep2 = (gotIt: boolean) => {
    if (gotIt) setStep(2);
  };

  const handleEmailStep3 = () => {
    setEmail({ enabled: true, senderAddress: emailAddress.trim() });
    onComplete();
    onClose();
  };

  const handleSlackConnectWorkspace = () => setTimeout(() => setStep(1), 600);
  const handleSlackContinueFromStep0 = () => setStep(1);
  const handleSlackSendTest = () => setStep(2);
  const handleSlackEnable = () => {
    setSlack({ enabled: true, webhookUrl: slackWebhook.trim() || undefined, connected: !!slackWebhook.trim() });
    onComplete();
    onClose();
  };

  const handleTeamsStep1 = (method: 'webhook' | 'azure') => {
    setTeamsMethod(method);
    setTeams({ method });
    setStep(1);
  };

  const handleTeamsStep2 = () => {
    if (teamsMethod === 'webhook') {
      setTeams({ webhookUrl: teamsWebhookUrl.trim() || undefined });
    }
    setStep(2);
  };

  const handleTeamsStep3 = () => setStep(3);

  const handleTeamsStep4 = () => {
    if (teamsMethod === 'webhook') {
      setTeams({ enabled: true, method: 'webhook', webhookUrl: teamsWebhookUrl.trim() || undefined });
    } else {
      setTeams({ enabled: true, method: 'azure', azureClientId, azureTenantId, azureClientSecret: azureSecret });
    }
    onComplete();
    onClose();
  };

  const handlePushStep1 = async () => {
    setPushPermissionRequested(true);
    if (typeof Notification !== 'undefined') {
      const result = await Notification.requestPermission();
      if (result === 'granted') setStep(1);
    } else setStep(1);
  };

  const handlePushStep2 = () => {
    setPush({ enabled: true });
    onComplete();
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={o => !o && onClose()}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={cn(
          'w-full max-w-md p-0 flex flex-col [&>button]:hidden',
          'bg-white/8 dark:bg-white/5 backdrop-blur-xl border border-white/15',
          isMobile ? 'rounded-t-xl max-h-[85vh]' : 'rounded-l-xl border-l'
        )}
      >
        <SheetHeader className="px-5 pt-5 pb-2 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-sm font-semibold">
              {channel === 'email' && 'Email notifications'}
              {channel === 'slack' && 'Slack'}
              {channel === 'teams' && 'Microsoft Teams'}
              {channel === 'push' && 'Push notifications'}
            </SheetTitle>
            <button
              type="button"
              onClick={handleCancel}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
          <div className="pt-3">
            <Progress value={progressValue} className="h-1.5 opacity-60 bg-muted/50" />
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-6 min-h-0">
          {/* Email */}
          {channel === 'email' && step === 0 && (
            <div key={step} className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="space-y-2">
                <Label className="text-xs">Delivery address</Label>
                <Input
                  type="email"
                  value={emailAddress}
                  onChange={e => setEmailAddress(e.target.value)}
                  placeholder="you@org.com"
                  className="bg-muted/30 border-white/10"
                />
                <p className="text-[11px] text-muted-foreground">Notifications will be sent to this address.</p>
              </div>
              <Button className="w-full rounded-full" onClick={handleEmailStep1}>
                Send test email
              </Button>
            </div>
          )}
          {channel === 'email' && step === 1 && (
            <div key={step} className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <p className="text-sm text-muted-foreground">
                Check your inbox — a test email was just sent to <strong className="text-foreground">{emailAddress || 'your address'}</strong>.
              </p>
              <div className="flex gap-2">
                <Button className="flex-1 rounded-full" onClick={() => handleEmailStep2(true)}>
                  Got it — looks good
                </Button>
                <Button variant="outline" className="flex-1 rounded-full" onClick={() => handleEmailStep2(false)}>
                  Didn&apos;t receive it
                </Button>
              </div>
            </div>
          )}
          {channel === 'email' && step === 2 && (
            <div key={step} className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="space-y-2">
                <Label className="text-xs">Severity filter</Label>
                <Select defaultValue="critical_attention" onValueChange={() => {}}>
                  <SelectTrigger className="bg-muted/30 border-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical_only">Critical only</SelectItem>
                    <SelectItem value="critical_attention">Critical + Attention</SelectItem>
                    <SelectItem value="all">All</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full rounded-full" onClick={handleEmailStep3}>
                Enable email notifications
              </Button>
            </div>
          )}

          {/* Slack */}
          {channel === 'slack' && step === 0 && (
            <div key={step} className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex justify-center">
                <div className="rounded-xl bg-[#4A154B]/20 p-4">
                  <MessageCircle className="h-10 w-10 text-[#4A154B] dark:text-[#E01E5A]" />
                </div>
              </div>
              <p className="text-[11px] text-center text-muted-foreground">You&apos;ll be redirected to Slack to authorise access — takes 30 seconds.</p>
              <Button className="w-full rounded-full" onClick={handleSlackConnectWorkspace}>
                Connect Slack workspace
              </Button>
              <Collapsible open={slackShowWebhook} onOpenChange={setSlackShowWebhook}>
                <CollapsibleTrigger asChild>
                  <button type="button" className="text-xs text-muted-foreground hover:text-foreground underline">
                    Or paste webhook URL
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-4 space-y-2">
                  <Input
                    value={slackWebhook}
                    onChange={e => setSlackWebhook(e.target.value)}
                    placeholder="https://hooks.slack.com/services/..."
                    className="bg-muted/30 border-white/10 font-mono text-xs"
                  />
                  <Button variant="outline" className="w-full rounded-full" size="sm" onClick={handleSlackContinueFromStep0}>
                    Continue with webhook
                  </Button>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}
          {channel === 'slack' && step === 1 && (
            <div key={step} className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <p className="text-[11px] text-muted-foreground">Critical alerts will be posted to the default channel of this webhook. You can change it later in settings.</p>
              <Button className="w-full rounded-full" onClick={handleSlackSendTest}>
                Send test message
              </Button>
            </div>
          )}
          {channel === 'slack' && step === 2 && (
            <div key={step} className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="rounded-lg border border-white/10 bg-muted/20 p-3 text-xs text-muted-foreground">
                Preview: A real Slack message will show the alert title and body with a link to the app.
              </div>
              <Button className="w-full rounded-full" onClick={handleSlackEnable}>
                Enable Slack notifications
              </Button>
            </div>
          )}

          {/* Teams */}
          {channel === 'teams' && step === 0 && (
            <div key={step} className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <p className="text-xs text-muted-foreground">Choose how to connect:</p>
              <button
                type="button"
                onClick={() => handleTeamsStep1('webhook')}
                className="w-full rounded-xl border border-white/10 bg-muted/20 p-4 text-left hover:bg-muted/30 transition-colors"
              >
                <p className="font-medium text-sm">Incoming Webhook</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Quick setup, no admin required</p>
              </button>
              <button
                type="button"
                onClick={() => handleTeamsStep1('azure')}
                className="w-full rounded-xl border border-white/10 bg-muted/20 p-4 text-left hover:bg-muted/30 transition-colors"
              >
                <p className="font-medium text-sm">Azure App Registration</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Full features including interactive buttons</p>
              </button>
            </div>
          )}
          {channel === 'teams' && step === 1 && teamsMethod === 'webhook' && (
            <div key="teams-webhook" className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <p className="text-xs text-muted-foreground">In Microsoft Teams, go to the channel you want to use → Connectors → Incoming Webhook → copy the URL.</p>
              <Input
                value={teamsWebhookUrl}
                onChange={e => setTeamsWebhookUrl(e.target.value)}
                placeholder="https://outlook.office.com/webhook/..."
                className="bg-muted/30 border-white/10 font-mono text-xs"
              />
              <Collapsible open={teamsShowWebhookGuide} onOpenChange={setTeamsShowWebhookGuide}>
                <CollapsibleTrigger asChild>
                  <button type="button" className="text-xs text-muted-foreground hover:text-foreground underline">
                    Show me how
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3 space-y-2 text-[11px] text-muted-foreground border-l-2 border-white/10 pl-3">
                  <p>1. Open the channel in Teams → click ⋯ next to the channel name.</p>
                  <p>2. Choose Connectors → search for Incoming Webhook → Configure.</p>
                  <p>3. Name the webhook → Create → copy the URL and paste above.</p>
                </CollapsibleContent>
              </Collapsible>
              <Button className="w-full rounded-full" onClick={handleTeamsStep2}>
                Verify and continue
              </Button>
            </div>
          )}
          {channel === 'teams' && step === 1 && teamsMethod === 'azure' && (
            <div key="teams-azure" className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs">Client ID</Label>
                  <Collapsible open={teamsShowAzureGuide} onOpenChange={setTeamsShowAzureGuide}>
                    <CollapsibleTrigger asChild>
                      <button type="button" className="text-[11px] text-muted-foreground hover:text-foreground underline">Where do I find this?</button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2 text-[11px] text-muted-foreground border-l-2 border-white/10 pl-3">
                      Azure Portal → App registrations → Your app → Application (client) ID.
                    </CollapsibleContent>
                  </Collapsible>
                </div>
                <Input value={azureClientId} onChange={e => setAzureClientId(e.target.value)} className="bg-muted/30 border-white/10" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Tenant ID</Label>
                <Input value={azureTenantId} onChange={e => setAzureTenantId(e.target.value)} className="bg-muted/30 border-white/10" placeholder="Often your org’s .onmicrosoft.com domain" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Client secret</Label>
                <Input type="password" value={azureSecret} onChange={e => setAzureSecret(e.target.value)} className="bg-muted/30 border-white/10" />
              </div>
              <Button className="w-full rounded-full" onClick={handleTeamsStep2}>
                Verify connection
              </Button>
            </div>
          )}
          {channel === 'teams' && step === 2 && (
            <div key={step} className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <p className="text-xs text-muted-foreground">Pick the channel where alerts will be posted. You can change it later.</p>
              <Button className="w-full rounded-full" onClick={handleTeamsStep3}>
                Continue
              </Button>
            </div>
          )}
          {channel === 'teams' && step === 3 && (
            <div key={step} className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="rounded-lg border border-white/10 bg-muted/20 p-3 text-xs text-muted-foreground">
                Alerts will appear as Adaptive Cards in your chosen channel.
              </div>
              <Button className="w-full rounded-full" onClick={handleTeamsStep4}>
                Enable Teams notifications
              </Button>
            </div>
          )}

          {/* Push */}
          {channel === 'push' && step === 0 && (
            <div key={step} className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <p className="text-sm text-center text-muted-foreground">
                Get Critical alerts on this device even when the app is closed.
              </p>
              <Button className="w-full rounded-full" onClick={handlePushStep1}>
                Enable push notifications
              </Button>
              {pushPermissionRequested && typeof Notification !== 'undefined' && Notification.permission === 'denied' && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-[11px] text-amber-700 dark:text-amber-300 space-y-2">
                  <p className="font-medium">Push notifications were blocked</p>
                  <p>To enable them: open your browser settings (e.g. Chrome → Settings → Privacy and security → Site settings → Notifications) and allow notifications for this site. Then refresh and try again.</p>
                </div>
              )}
            </div>
          )}
          {channel === 'push' && step === 1 && (
            <div key={step} className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <p className="text-sm text-muted-foreground">Push notifications are active on this device ✓</p>
              <div className="space-y-2">
                <Label className="text-xs">Severity filter</Label>
                <Select defaultValue="critical_attention" onValueChange={() => {}}>
                  <SelectTrigger className="bg-muted/30 border-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical_only">Critical only</SelectItem>
                    <SelectItem value="critical_attention">Critical + Attention</SelectItem>
                    <SelectItem value="all">All</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full rounded-full" onClick={handlePushStep2}>
                Done
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
