import { useState } from 'react';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { DndProfile, DndWindowType } from '@/lib/dndProfiles';
import {
  DND_ICON_OPTIONS,
  genProfileId,
  resetStarterToDefault,
  type DayOfWeek,
} from '@/lib/dndProfiles';
import { DAY_LABELS, DAYS, WEEKDAYS } from '@/lib/scheduledPause';

const WINDOW_TYPE_LABELS: Record<DndWindowType, string> = {
  fixed_duration: 'Fixed duration',
  until_time: 'Until time',
  date_range: 'Date range',
  recurring: 'Recurring schedule',
};

function windowSummary(p: DndProfile): string {
  const c = p.windowConfig;
  if (p.windowType === 'fixed_duration' && c.fixed_duration) {
    const { hours, minutes } = c.fixed_duration;
    return `${hours}h ${minutes}m · Critical: ${p.suppressCritical ? 'on' : 'off'}`;
  }
  if (p.windowType === 'until_time' && c.until_time) return `Until ${c.until_time.time} · Critical: ${p.suppressCritical ? 'on' : 'off'}`;
  if (p.windowType === 'date_range' && c.date_range) return `Date range · Critical: ${p.suppressCritical ? 'on' : 'off'}`;
  if (p.windowType === 'recurring' && c.recurring) return `Recurring · Critical: ${p.suppressCritical ? 'on' : 'off'}`;
  return `Critical: ${p.suppressCritical ? 'on' : 'off'}`;
}

interface DndProfileManagerProps {
  profiles: DndProfile[];
  onSaveProfiles: (profiles: DndProfile[]) => void;
  onBack: () => void;
  onActivate: (profile: DndProfile) => void;
}

export function DndProfileManager({ profiles, onSaveProfiles, onBack, onActivate }: DndProfileManagerProps) {
  const [view, setView] = useState<'list' | 'edit'>('list');
  const [editingProfile, setEditingProfile] = useState<DndProfile | null>(null);
  const [draft, setDraft] = useState<DndProfile | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const startNew = () => {
    setDraft({
      id: genProfileId(),
      name: 'New profile',
      icon: '🌙',
      windowType: 'fixed_duration',
      windowConfig: { fixed_duration: { hours: 1, minutes: 0 } },
      suppressCritical: false,
      notifyOnEnd: true,
    });
    setEditingProfile(null);
    setView('edit');
  };

  const startEdit = (p: DndProfile) => {
    setDraft({ ...p, windowConfig: { ...p.windowConfig } });
    setEditingProfile(p);
    setView('edit');
  };

  const saveDraft = () => {
    if (!draft) return;
    const next = draft.id.startsWith('starter:')
      ? profiles.map(x => (x.id === draft.id ? draft : x))
      : editingProfile
        ? profiles.map(x => (x.id === draft.id ? draft : x))
        : [...profiles, draft];
    onSaveProfiles(next);
    setView('list');
    setDraft(null);
    setEditingProfile(null);
  };

  const removeProfile = (id: string) => {
    const p = profiles.find(x => x.id === id);
    if (p?.isStarter) {
      onSaveProfiles(profiles.map(x => (x.id === id ? { ...x, isArchived: true } : x)));
    } else {
      onSaveProfiles(profiles.filter(x => x.id !== id));
    }
    setDeleteConfirmId(null);
  };

  const resetStarter = (starterId: string) => {
    const restored = resetStarterToDefault(starterId);
    onSaveProfiles(profiles.map(x => (x.starterId === starterId ? { ...restored, id: x.id } : x)));
  };

  if (view === 'edit' && draft) {
    return (
      <div className="rounded-xl p-4 overflow-hidden transition-all duration-200" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <button type="button" onClick={() => { setView('list'); setDraft(null); setEditingProfile(null); }} className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/70 mb-4">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <div className="space-y-4">
          <div>
            <Label className="text-xs text-white/60">Profile name</Label>
            <Input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value.slice(0, 30) })} className="mt-1 h-8 bg-white/5 border-white/15 text-sm" maxLength={30} />
            {draft.name.length >= 20 && <p className="text-[11px] text-white/40 mt-0.5">{30 - draft.name.length} characters left</p>}
          </div>
          <div>
            <Label className="text-xs text-white/60">Icon</Label>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {DND_ICON_OPTIONS.map(ico => (
                <button key={ico} type="button" onClick={() => setDraft({ ...draft, icon: ico })} className={cn('w-8 h-8 rounded-lg flex items-center justify-center text-lg border transition-colors', draft.icon === ico ? 'border-emerald-500/50 bg-emerald-500/20' : 'border-white/15 bg-white/5 hover:bg-white/10')}>{ico}</button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs text-white/60">Pause window</Label>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {(Object.keys(WINDOW_TYPE_LABELS) as DndWindowType[]).map(t => (
                <button key={t} type="button" onClick={() => setDraft({ ...draft, windowType: t })} className={cn('rounded-full px-3 py-1.5 text-xs border', draft.windowType === t ? 'border-white/30 bg-white/10' : 'border-white/15 bg-white/5')}>{WINDOW_TYPE_LABELS[t]}</button>
              ))}
            </div>
          </div>
          {draft.windowType === 'fixed_duration' && (
            <div className="flex gap-2 items-center">
              <Input type="number" min={0} max={99} value={draft.windowConfig.fixed_duration?.hours ?? 0} onChange={e => setDraft({ ...draft, windowConfig: { fixed_duration: { hours: Math.max(0, parseInt(e.target.value, 10) || 0), minutes: draft.windowConfig.fixed_duration?.minutes ?? 0 } } })} className="w-14 h-8 text-xs bg-white/5 border-white/15" />
              <span className="text-xs text-white/50">h</span>
              <Input type="number" min={0} max={59} value={draft.windowConfig.fixed_duration?.minutes ?? 0} onChange={e => setDraft({ ...draft, windowConfig: { fixed_duration: { hours: draft.windowConfig.fixed_duration?.hours ?? 0, minutes: Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0)) } } })} className="w-14 h-8 text-xs bg-white/5 border-white/15" />
              <span className="text-xs text-white/50">m</span>
            </div>
          )}
          {draft.windowType === 'until_time' && (
            <Input type="time" value={draft.windowConfig.until_time?.time ?? '17:00'} onChange={e => setDraft({ ...draft, windowConfig: { until_time: { time: e.target.value } } })} className="w-28 h-8 text-xs bg-white/5 border-white/15" />
          )}
          {draft.windowType === 'date_range' && (
            <div className="flex gap-2">
              <Input type="date" value={draft.windowConfig.date_range?.startDate ?? ''} onChange={e => setDraft({ ...draft, windowConfig: { date_range: { startDate: e.target.value, endDate: draft.windowConfig.date_range?.endDate ?? '' } } })} className="w-36 h-8 text-xs bg-white/5 border-white/15" />
              <Input type="date" value={draft.windowConfig.date_range?.endDate ?? ''} onChange={e => setDraft({ ...draft, windowConfig: { date_range: { startDate: draft.windowConfig.date_range?.startDate ?? '', endDate: e.target.value } } })} className="w-36 h-8 text-xs bg-white/5 border-white/15" />
            </div>
          )}
          {draft.windowType === 'recurring' && (() => {
            const rec = draft.windowConfig.recurring ?? { fromTime: '09:00', untilTime: '17:00', days: [...WEEKDAYS] as DayOfWeek[] };
            return (
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map(d => {
                  const days = rec.days;
                  const on = days.includes(d as DayOfWeek);
                  return (
                    <button key={d} type="button" onClick={() => setDraft({ ...draft, windowConfig: { recurring: { ...rec, days: on ? days.filter(x => x !== d) : [...days, d].sort((a, b) => a - b) } } })} className={cn('w-8 h-8 rounded-lg text-[11px] border', on ? 'border-emerald-500/30 bg-emerald-500/20' : 'border-white/15 bg-white/5')}>{DAY_LABELS[d as DayOfWeek]}</button>
                  );
                })}
                <Input type="time" value={rec.fromTime} onChange={e => setDraft({ ...draft, windowConfig: { recurring: { ...rec, fromTime: e.target.value } } })} className="w-24 h-8 text-xs bg-white/5 border-white/15" />
                <Input type="time" value={rec.untilTime} onChange={e => setDraft({ ...draft, windowConfig: { recurring: { ...rec, untilTime: e.target.value } } })} className="w-24 h-8 text-xs bg-white/5 border-white/15" />
              </div>
            );
          })()}
          <div className="flex items-center justify-between">
            <Label className="text-xs text-white/60">Suppress Critical alerts</Label>
            <Switch checked={draft.suppressCritical} onCheckedChange={v => setDraft({ ...draft, suppressCritical: v })} />
          </div>
          {draft.suppressCritical && <p className="text-[11px] text-amber-400/80">You will not receive any external alerts — including Critical — while this profile is active</p>}
          <div className="flex items-center justify-between">
            <Label className="text-xs text-white/60">Notify me when this profile ends</Label>
            <Switch checked={draft.notifyOnEnd} onCheckedChange={v => setDraft({ ...draft, notifyOnEnd: v })} />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" onClick={saveDraft} className="rounded-full px-4 py-2 text-xs" style={{ background: 'rgba(255,255,255,0.12)' }}>Save profile</Button>
            {draft.starterId && <button type="button" onClick={() => { const r = resetStarterToDefault(draft.starterId!); setDraft({ ...r, id: draft.id }); }} className="text-xs text-white/50 underline">Reset to default</button>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/70">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Notification Delivery
      </button>
      <div className="rounded-xl overflow-hidden transition-all duration-200 max-h-[50vh] overflow-y-auto" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="divide-y divide-white/10">
          {profiles.filter(p => !p.isArchived).map(p => (
            <div key={p.id} className="flex items-center justify-between gap-2 px-4 py-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-lg shrink-0">{p.icon}</span>
                <div className="min-w-0">
                  <p className="text-sm text-white/90 truncate">{p.name}</p>
                  <p className="text-[11px] text-white/50">{windowSummary(p)}</p>
                  {p.isStarter && <span className="text-[10px] text-white/40">Built-in</span>}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button type="button" size="sm" variant="ghost" className="rounded-full h-7 text-xs" onClick={() => onActivate(p)}>Activate</Button>
                <button type="button" onClick={() => startEdit(p)} className="p-1.5 rounded-md text-white/50 hover:text-white/80"><Pencil className="h-3.5 w-3.5" /></button>
                {!p.isStarter && (
                  deleteConfirmId === p.id ? (
                    <span className="flex items-center gap-1 text-[11px]">
                      <button type="button" onClick={() => removeProfile(p.id)} className="underline text-destructive">Confirm</button>
                      <button type="button" onClick={() => setDeleteConfirmId(null)} className="underline">Cancel</button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setDeleteConfirmId(p.id)} className="p-1.5 rounded-md text-white/50 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                  )
                )}
                {p.isStarter && p.isArchived !== true && (
                  <button type="button" onClick={() => resetStarter(p.starterId!)} className="text-[10px] text-white/40 underline">Reset</button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="p-3 border-t border-white/10">
          <Button type="button" variant="ghost" size="sm" className="rounded-full w-full border border-dashed border-white/20 text-white/60 hover:text-white/80" onClick={startNew}>+ New profile</Button>
        </div>
      </div>
    </div>
  );
}
