import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pencil } from 'lucide-react';
import { updateItem } from '@/lib/store';
import { SUPPORTED_CURRENCIES, type CurrencyCode } from '@/lib/currency';
import type { Project, ProjectCategory, ProjectStatus, Priority } from '@/lib/types';
import { logActivityEvent } from '@/lib/notifications';

const CATEGORIES: ProjectCategory[] = ['Scouting', 'Event', 'Full Report', 'Light Report', 'Other'];
const STATUSES: ProjectStatus[] = ['Active', 'On Hold', 'Completed'];
const PRIORITIES: Priority[] = ['High', 'Medium', 'Low'];

interface Props {
  project: Project;
  onUpdated: () => void;
}

export default function EditProjectDialog({ project, onUpdated }: Props) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...project });

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) setForm({ ...project, feeType: project.feeType ?? 'monthly', categoryOtherSpec: project.categoryOtherSpec ?? '' });
    setOpen(isOpen);
  };

  const handleSubmit = async () => {
    if (form.category === 'Other' && !form.categoryOtherSpec?.trim()) return;
    const statusChanged = form.status !== project.status;
    await updateItem('projects', form);
    if (statusChanged) {
      logActivityEvent({
        userId: 'system',
        projectId: project.id,
        type: 'project_status_changed',
        message: `Project "${project.name}" status changed to ${form.status}`,
      });
    }
    setOpen(false);
    onUpdated();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Pencil className="h-4 w-4 mr-1" /> Edit Project
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Project</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Project Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Client *</Label>
              <Input value={form.client} onChange={e => setForm(f => ({ ...f, client: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Category</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v as ProjectCategory, categoryOtherSpec: v === 'Other' ? f.categoryOtherSpec : undefined }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Priority</Label>
              <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v as Priority }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as ProjectStatus }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {form.category === 'Other' && (
              <div className="space-y-1.5 col-span-3">
                <Label className="text-xs">Specify (required for Other) *</Label>
                <Input
                  value={form.categoryOtherSpec ?? ''}
                  onChange={e => setForm(f => ({ ...f, categoryOtherSpec: e.target.value }))}
                  placeholder="e.g. Advisory, Training"
                />
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Start Date</Label>
              <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">End Date</Label>
              <Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Currency</Label>
              <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                <SelectTrigger className="w-[90px]">{form.currency}</SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map(c => (
                    <SelectItem key={c.code} value={c.code}>{c.code} — {c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Fee</Label>
              <div className="flex gap-2 flex-wrap">
                <Select value={form.feeType ?? 'monthly'} onValueChange={v => setForm(f => ({ ...f, feeType: v as 'monthly' | 'project' }))}>
                  <SelectTrigger className="w-[95px] shrink-0">{(form.feeType ?? 'monthly') === 'monthly' ? 'Monthly' : 'Project'}</SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="project">Project</SelectItem>
                  </SelectContent>
                </Select>
                <Input type="number" value={form.monthlyFee} onChange={e => setForm(f => ({ ...f, monthlyFee: Number(e.target.value) }))} className="flex-1 min-w-[160px] w-40" />
              </div>
            </div>
          </div>
          <Button onClick={handleSubmit} disabled={!form.name || !form.client || (form.category === 'Other' && !form.categoryOtherSpec?.trim())} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
