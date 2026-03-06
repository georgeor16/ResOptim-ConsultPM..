import { useState } from 'react';
import type { AppData } from '@/lib/types';
import type { SimulationStep, SimulationDeltaSummary } from '@/lib/simulation';
import {
  createSharedSimulation,
  getShareUrl,
  EXPIRY_OPTIONS,
  type SharedSimulationAccess,
} from '@/lib/sharedSimulations';
import { addNotification } from '@/lib/notifications';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Share2, Link2, Bell, FileDown, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type ShareTab = 'link' | 'inapp' | 'export';

interface ShareSimulationPopoverProps {
  baseData: AppData;
  steps: SimulationStep[];
  simulatedData: AppData;
  delta: SimulationDeltaSummary;
  projectLabel: string;
  ownerId: string;
  ownerName: string;
  /** Other users (excluding owner) for in-app share */
  colleagueUsers: { id: string; name: string }[];
  onShared?: (shareId: string) => void;
  children: React.ReactNode;
}

export function ShareSimulationPopover({
  baseData,
  steps,
  simulatedData,
  delta,
  projectLabel,
  ownerId,
  ownerName,
  colleagueUsers,
  onShared,
  children,
}: ShareSimulationPopoverProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<ShareTab>('link');
  const [expiresInDays, setExpiresInDays] = useState<number | null>(30);
  const [access, setAccess] = useState<SharedSimulationAccess>('internal');
  const [accessCode, setAccessCode] = useState('');
  const [anonymizeNames, setAnonymizeNames] = useState(false);
  const [includeFte, setIncludeFte] = useState(true);
  const [includeFinancial, setIncludeFinancial] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [linkCopied, setLinkCopied] = useState(false);

  const handleShareViaLink = () => {
    const snapshot = createSharedSimulation({
      ownerId,
      ownerName,
      baseData,
      steps,
      simulatedData,
      delta,
      projectLabel,
      access,
      accessCode: access === 'password' ? accessCode || undefined : undefined,
      expiresInDays,
      anonymizeNames: access === 'external' ? anonymizeNames : undefined,
      includeFte: access === 'external' ? includeFte : true,
      includeFinancial: access === 'external' ? includeFinancial : true,
    });
    const url = getShareUrl(snapshot.id);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
        toast.success('Link copied to clipboard');
      });
    }
    onShared?.(snapshot.id);
    setOpen(false);
  };

  const handleShareViaInApp = () => {
    const userIds = [...selectedUserIds];
    if (userIds.length === 0) {
      toast.error('Select at least one colleague');
      return;
    }
    const names: Record<string, string> = {};
    colleagueUsers.forEach((u) => { names[u.id] = u.name; });
    const snapshot = createSharedSimulation({
      ownerId,
      ownerName,
      baseData,
      steps,
      simulatedData,
      delta,
      projectLabel,
      access: 'internal',
      expiresInDays: 30,
      reviewerUserIds: userIds,
      reviewerUserNames: names,
    });
    const url = getShareUrl(snapshot.id);
    const n = steps.length;
    const m = delta.affectedProjectIds.size;
    userIds.forEach((userId) => {
      addNotification({
        id: `notif-${Date.now()}-${userId}`,
        userId,
        type: 'simulation_shared',
        category: 'project',
        title: 'Simulation shared for review',
        message: `${ownerName} has shared a simulation for your review — ${n} changes across ${m} project${m !== 1 ? 's' : ''}`,
        sharedSimulationId: snapshot.id,
        createdAt: new Date().toISOString(),
        read: false,
      });
    });
    toast.success(`Shared with ${userIds.length} reviewer${userIds.length !== 1 ? 's' : ''}`);
    onShared?.(snapshot.id);
    setOpen(false);
  };

  const handleExport = () => {
    const snapshot = createSharedSimulation({
      ownerId,
      ownerName,
      baseData,
      steps,
      simulatedData,
      delta,
      projectLabel,
      access: 'internal',
      expiresInDays: 30,
      anonymizeNames,
      includeFte,
      includeFinancial,
    });
    const url = getShareUrl(snapshot.id);
    const summary = [
      `Simulation: ${projectLabel}`,
      `Owner: ${ownerName}`,
      `Steps: ${steps.length}`,
      `New conflicts: ${delta.newConflicts}`,
      `Resolved: ${delta.resolvedConflicts}`,
      `Members affected: ${delta.affectedMemberIds.size}`,
      `Projects affected: ${delta.affectedProjectIds.size}`,
      '',
      'Step log:',
      ...steps.map((s, i) => `  ${i + 1}. ${s.label}`),
    ].join('\n');
    const blob = new Blob([summary], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `simulation-summary-${snapshot.id.slice(0, 8)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success('Summary downloaded');
    onShared?.(snapshot.id);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent
        className="w-[340px] p-0 bg-background/95 backdrop-blur-xl border border-white/10 rounded-xl"
        align="end"
      >
        <div className="p-3 border-b border-white/10">
          <p className="text-sm font-medium text-foreground/90">Share simulation</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {steps.length} change{steps.length !== 1 ? 's' : ''} · {delta.affectedProjectIds.size} project{delta.affectedProjectIds.size !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex border-b border-white/10">
          {(['link', 'inapp', 'export'] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={cn(
                'flex-1 py-2 text-xs font-medium transition-colors',
                tab === t
                  ? 'text-foreground border-b-2 border-amber-500/60 bg-amber-500/5'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setTab(t)}
            >
              {t === 'link' && <Link2 className="h-3.5 w-3.5 inline-block mr-1 align-middle" />}
              {t === 'inapp' && <Bell className="h-3.5 w-3.5 inline-block mr-1 align-middle" />}
              {t === 'export' && <FileDown className="h-3.5 w-3.5 inline-block mr-1 align-middle" />}
              {t === 'link' && 'Link'}
              {t === 'inapp' && 'In-app'}
              {t === 'export' && 'Export'}
            </button>
          ))}
        </div>
        <div className="p-3 space-y-3 max-h-[280px] overflow-y-auto">
          {tab === 'link' && (
            <>
              <div>
                <Label className="text-xs text-muted-foreground">Expiry</Label>
                <Select
                  value={expiresInDays == null ? 'never' : String(expiresInDays)}
                  onValueChange={(v) => setExpiresInDays(v === 'never' ? null : Number(v))}
                >
                  <SelectTrigger className="mt-1 h-8 text-xs bg-background/60 border-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPIRY_OPTIONS.map((opt) => (
                      <SelectItem key={String(opt.value ?? 'never')} value={opt.value == null ? 'never' : String(opt.value)}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Access</Label>
                <Select value={access} onValueChange={(v) => setAccess(v as SharedSimulationAccess)}>
                  <SelectTrigger className="mt-1 h-8 text-xs bg-background/60 border-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal">Internal only (login required)</SelectItem>
                    <SelectItem value="external">External (no login)</SelectItem>
                    <SelectItem value="password">Password protected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {access === 'password' && (
                <div>
                  <Label className="text-xs text-muted-foreground">Access code</Label>
                  <Input
                    type="text"
                    placeholder="e.g. 1234"
                    value={accessCode}
                    onChange={(e) => setAccessCode(e.target.value)}
                    className="mt-1 h-8 text-xs bg-background/60 border-white/10"
                  />
                </div>
              )}
              {access === 'external' && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Privacy</Label>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="anon"
                      checked={anonymizeNames}
                      onCheckedChange={(v) => setAnonymizeNames(v === true)}
                    />
                    <label htmlFor="anon" className="text-xs text-muted-foreground">Anonymize names</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="fte"
                      checked={includeFte}
                      onCheckedChange={(v) => setIncludeFte(v === true)}
                    />
                    <label htmlFor="fte" className="text-xs text-muted-foreground">Include FTE %</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="fin"
                      checked={includeFinancial}
                      onCheckedChange={(v) => setIncludeFinancial(v === true)}
                    />
                    <label htmlFor="fin" className="text-xs text-muted-foreground">Include financial data</label>
                  </div>
                </div>
              )}
              <Button size="sm" className="w-full bg-amber-500/20 text-amber-700 dark:text-amber-400 hover:bg-amber-500/30" onClick={handleShareViaLink}>
                {linkCopied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                {linkCopied ? 'Copied' : 'Copy link'}
              </Button>
            </>
          )}
          {tab === 'inapp' && (
            <>
              <div>
                <Label className="text-xs text-muted-foreground">Select colleagues</Label>
                <div className="mt-2 space-y-1.5 max-h-32 overflow-y-auto rounded-lg border border-white/10 p-2">
                  {colleagueUsers.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={selectedUserIds.has(u.id)}
                        onCheckedChange={(v) => {
                          setSelectedUserIds((prev) => {
                            const next = new Set(prev);
                            if (v === true) next.add(u.id);
                            else next.delete(u.id);
                            return next;
                          });
                        }}
                      />
                      <span className="text-xs text-foreground/90">{u.name}</span>
                    </label>
                  ))}
                  {colleagueUsers.length === 0 && (
                    <p className="text-xs text-muted-foreground">No other team members</p>
                  )}
                </div>
              </div>
              <Button size="sm" className="w-full bg-amber-500/20 text-amber-700 dark:text-amber-400 hover:bg-amber-500/30" onClick={handleShareViaInApp}>
                <Bell className="h-4 w-4 mr-2" />
                Send notification
              </Button>
            </>
          )}
          {tab === 'export' && (
            <>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Include in export</Label>
                <div className="flex items-center gap-2">
                  <Checkbox id="ex-fte" checked={includeFte} onCheckedChange={(v) => setIncludeFte(v === true)} />
                  <label htmlFor="ex-fte" className="text-xs text-muted-foreground">FTE % data</label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="ex-names" checked={!anonymizeNames} onCheckedChange={(v) => setAnonymizeNames(v !== true)} />
                  <label htmlFor="ex-names" className="text-xs text-muted-foreground">Member names</label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="ex-fin" checked={includeFinancial} onCheckedChange={(v) => setIncludeFinancial(v === true)} />
                  <label htmlFor="ex-fin" className="text-xs text-muted-foreground">Financial data</label>
                </div>
              </div>
              <Button size="sm" className="w-full bg-amber-500/20 text-amber-700 dark:text-amber-400 hover:bg-amber-500/30" onClick={handleExport}>
                <FileDown className="h-4 w-4 mr-2" />
                Download summary
              </Button>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
