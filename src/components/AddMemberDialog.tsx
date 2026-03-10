import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus } from 'lucide-react';
import { addItem, genId } from '@/lib/store';
import { getCurrencySymbol, type CurrencyCode } from '@/lib/currency';
import { computeProjectFteFromPhases } from '@/lib/fte';
import type { User, Phase } from '@/lib/types';

const WEEKS_PER_MONTH = 52 / 12;

interface Props {
  projectId: string;
  projectCurrency: CurrencyCode;
  availableUsers: User[];
  phases: Phase[];
  onAdded: () => void;
}

export default function AddMemberDialog({ projectId, projectCurrency, availableUsers, phases, onAdded }: Props) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ userId: '', projectSharePercent: '0', billableHourlyRate: '' });

  const projectFteDemand = computeProjectFteFromPhases(
    phases.map(p => ({
      durationMonths: (p.plannedDurationWeeks ?? 0) / WEEKS_PER_MONTH,
      ftePercent: p.plannedFtePercent ?? 0,
    }))
  );

  const share = Math.max(0, Math.min(100, Number(form.projectSharePercent) || 0));
  const derivedFte = Math.round((share * projectFteDemand) / 100);
  const agreedMonthlyHours = Math.round((160 * derivedFte) / 100);

  const handleUserChange = (userId: string) => {
    const user = availableUsers.find(u => u.id === userId);
    setForm(f => ({
      ...f,
      userId,
      billableHourlyRate: user ? user.billableHourlyRate.toFixed(2) : '',
    }));
  };

  const handleSubmit = async () => {
    if (!form.userId) return;
    await addItem('allocations', {
      id: genId(),
      projectId,
      userId: form.userId,
      projectSharePercent: share,
      ftePercent: derivedFte,
      agreedMonthlyHours,
      billableHourlyRate: Number(form.billableHourlyRate),
    });
    setForm({ userId: '', projectSharePercent: '0', billableHourlyRate: '' });
    setOpen(false);
    onAdded();
  };

  const sym = getCurrencySymbol(projectCurrency);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-4 w-4 mr-1" /> Add Member
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Team Member</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Team Member *</Label>
            <Select value={form.userId} onValueChange={handleUserChange}>
              <SelectTrigger><SelectValue placeholder="Select member" /></SelectTrigger>
              <SelectContent>
                {availableUsers.map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">% of project they own</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={100}
                value={form.projectSharePercent === '0' ? '' : form.projectSharePercent}
                placeholder="0"
                onFocus={e => e.target.select()}
                onChange={e => setForm(f => ({ ...f, projectSharePercent: e.target.value || '0' }))}
                className="w-24"
              />
              <span className="text-xs text-muted-foreground">%</span>
              {derivedFte > 0 && (
                <span className="text-[11px] text-muted-foreground/70">
                  ≈{derivedFte}% of their time · {agreedMonthlyHours}h/mo
                </span>
              )}
              {phases.length === 0 && (
                <span className="text-[11px] text-muted-foreground/60">
                  (add phases to derive FTE)
                </span>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Billable Rate ({sym}/h)</Label>
            <Input
              type="number"
              value={form.billableHourlyRate}
              onChange={e => setForm(f => ({ ...f, billableHourlyRate: e.target.value }))}
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!form.userId}
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
          >
            Add to Project
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
