import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus } from 'lucide-react';
import { addItem, genId } from '@/lib/store';
import { getCurrencySymbol, type CurrencyCode } from '@/lib/currency';
import type { User } from '@/lib/types';

interface Props {
  projectId: string;
  projectCurrency: CurrencyCode;
  availableUsers: User[];
  onAdded: () => void;
}

export default function AddMemberDialog({ projectId, projectCurrency, availableUsers, onAdded }: Props) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ userId: '', ftePercent: '50', agreedMonthlyHours: '80', billableHourlyRate: '' });

  const selectedUser = availableUsers.find(u => u.id === form.userId);

  const handleUserChange = (userId: string) => {
    const user = availableUsers.find(u => u.id === userId);
    setForm(f => ({
      ...f,
      userId,
      billableHourlyRate: user ? user.billableHourlyRate.toFixed(2) : '',
    }));
  };

  const handleSubmit = () => {
    if (!form.userId) return;
    addItem('allocations', {
      id: genId(),
      projectId,
      userId: form.userId,
      ftePercent: Number(form.ftePercent),
      agreedMonthlyHours: Number(form.agreedMonthlyHours),
      billableHourlyRate: Number(form.billableHourlyRate),
    });
    setForm({ userId: '', ftePercent: '50', agreedMonthlyHours: '80', billableHourlyRate: '' });
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
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">FTE %</Label>
              <Input type="number" value={form.ftePercent} onChange={e => setForm(f => ({ ...f, ftePercent: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Monthly Hours</Label>
              <Input type="number" value={form.agreedMonthlyHours} onChange={e => setForm(f => ({ ...f, agreedMonthlyHours: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Billable Rate ({sym}/h)</Label>
              <Input type="number" value={form.billableHourlyRate} onChange={e => setForm(f => ({ ...f, billableHourlyRate: e.target.value }))} />
            </div>
          </div>
          <Button onClick={handleSubmit} disabled={!form.userId} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
            Add to Project
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
