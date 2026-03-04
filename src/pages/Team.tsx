import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { loadData, addItem, updateItem, deleteItem, genId } from '@/lib/store';
import type { AppData, CalendarProfile, User } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Trash2, Calendar } from 'lucide-react';
import { CalendarProfileEditor } from '@/components/CalendarProfileEditor';
import { getBaseCurrency, convertCurrency, formatMoney, refreshFxRates, loadFxRates, getCurrencySymbol, SUPPORTED_CURRENCIES, type CurrencyCode, type FxRates } from '@/lib/currency';
import type { Role } from '@/lib/types';

const AVATAR_COLORS = [
  'hsl(170, 60%, 40%)', 'hsl(222, 47%, 30%)', 'hsl(270, 50%, 45%)',
  'hsl(38, 70%, 50%)', 'hsl(340, 60%, 50%)', 'hsl(200, 60%, 45%)',
  'hsl(150, 50%, 35%)', 'hsl(10, 65%, 50%)', 'hsl(260, 55%, 50%)',
];

export default function Team() {
  const { isManagerOrAbove, isAdmin, refreshUsers } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [data, setData] = useState<AppData | null>(null);
  const baseCurrency = getBaseCurrency();
  const [rates, setRates] = useState<FxRates>(loadFxRates());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [calendarUser, setCalendarUser] = useState<User | null>(null);
  const [form, setForm] = useState({
    name: '', email: '', role: 'member' as Role,
    annualSalary: '', currency: 'USD' as CurrencyCode,
  });

  useEffect(() => {
    loadData().then(setData);
  }, [refreshKey]);
  useEffect(() => {
    refreshFxRates().then(setRates);
  }, []);

  const computedHourlyRate = form.annualSalary ? parseFloat(form.annualSalary) / 12 / 160 : 0;
  const computedBillableRate = computedHourlyRate * 1.25;
  const computedMonthlySalary = form.annualSalary ? parseFloat(form.annualSalary) / 12 : 0;

  if (!isManagerOrAbove) {
    return <div className="text-center py-12 text-muted-foreground">Access restricted</div>;
  }
  if (!data) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-muted-foreground">Loading...</div>
    );
  }

  const conv = (amount: number, from: string) =>
    convertCurrency(amount, from as CurrencyCode, baseCurrency, rates);

  const activeProjects = data.projects.filter(p => p.status === 'Active');

  const handleAddMember = async () => {
    if (!form.name || !form.email) return;
    const color = AVATAR_COLORS[data.users.length % AVATAR_COLORS.length];
    await addItem('users', {
      id: genId(),
      name: form.name,
      email: form.email,
      role: form.role,
      monthlySalary: computedMonthlySalary,
      billableHourlyRate: computedBillableRate,
      currency: form.currency,
      avatarColor: color,
    });
    setForm({ name: '', email: '', role: 'member', annualSalary: '', currency: 'USD' });
    setDialogOpen(false);
    await refreshUsers();
    setRefreshKey(k => k + 1);
  };

  const roleLabel = (role: string) => {
    switch (role) {
      case 'admin': return 'CEO';
      case 'manager': return 'Director';
      case 'member': return 'Advisor';
      default: return role;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Team Overview</h1>
          <p className="text-sm text-muted-foreground">Financial summary & utilization · Base: {baseCurrency}</p>
        </div>
        {isAdmin && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-accent text-accent-foreground hover:bg-accent/90">
                <Plus className="h-4 w-4 mr-2" /> Add Member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Team Member</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Full Name *</Label>
                    <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Jane Smith" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Email *</Label>
                    <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="jane@company.com" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Role</Label>
                  <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v as Role }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">CEO / Admin</SelectItem>
                      <SelectItem value="manager">Director / Manager</SelectItem>
                      <SelectItem value="member">Advisor / Member</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Currency</Label>
                  <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v as CurrencyCode }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_CURRENCIES.map(c => (
                        <SelectItem key={c.code} value={c.code}>{c.symbol} {c.code} — {c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Annual Salary ({getCurrencySymbol(form.currency)})</Label>
                    <Input type="number" value={form.annualSalary} onChange={e => setForm(f => ({ ...f, annualSalary: e.target.value }))} placeholder="60000" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Hourly Rate ({getCurrencySymbol(form.currency)}/h)</Label>
                    <Input type="number" value={computedHourlyRate.toFixed(2)} readOnly className="bg-muted" />
                    <p className="text-[10px] text-muted-foreground">annual ÷ 12 ÷ 160</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Billable Rate ({getCurrencySymbol(form.currency)}/h)</Label>
                    <Input type="number" value={computedBillableRate.toFixed(2)} readOnly className="bg-muted" />
                    <p className="text-[10px] text-muted-foreground">+25% markup</p>
                  </div>
                </div>
                <Button onClick={handleAddMember} disabled={!form.name || !form.email} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                  Add Member
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left p-3 font-medium text-muted-foreground">Name</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Role</th>
                {isAdmin && <th className="text-right p-3 font-medium text-muted-foreground">Monthly Salary</th>}
                <th className="text-right p-3 font-medium text-muted-foreground">Billable Rate</th>
                <th className="text-center p-3 font-medium text-muted-foreground">Ccy</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Total FTE%</th>
                {isAdmin && <th className="text-right p-3 font-medium text-muted-foreground">Implied Cost ({baseCurrency})</th>}
                <th className="text-right p-3 font-medium text-muted-foreground">Utilization</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Projects</th>
                {isAdmin && <th className="text-center p-3 font-medium text-muted-foreground"></th>}
              </tr>
            </thead>
            <tbody>
              {data.users.map(user => {
                const userCurrency = (user.currency || 'USD') as CurrencyCode;
                const userAllocations = data.allocations.filter(a =>
                  a.userId === user.id && activeProjects.some(p => p.id === a.projectId)
                );
                const totalFTE = userAllocations.reduce((s, a) => s + a.ftePercent, 0);
                const impliedCost = conv(user.monthlySalary * (totalFTE / 100), userCurrency);
                const utilization = totalFTE;

                const utilizationColor = utilization > 100 ? 'financial-negative' : utilization > 80 ? 'financial-warning' : 'financial-positive';

                return (
                  <tr key={user.id} className="border-b hover:bg-secondary/30">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                          style={{ backgroundColor: user.avatarColor, color: 'white' }}
                        >
                          {user.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div>
                          <span className="font-medium">{user.name}</span>
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground">{roleLabel(user.role)}</td>
                    {isAdmin && (
                      <td className="p-3 text-right">
                        {getCurrencySymbol(userCurrency)}{Math.round(user.monthlySalary).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        {userCurrency !== baseCurrency && (
                          <span className="text-xs text-muted-foreground ml-1">
                            ({formatMoney(Math.round(conv(user.monthlySalary, userCurrency)), baseCurrency)})
                          </span>
                        )}
                      </td>
                    )}
                    <td className="p-3 text-right">{getCurrencySymbol(userCurrency)}{user.billableHourlyRate.toFixed(2)}/h</td>
                    <td className="p-3 text-center text-xs text-muted-foreground">{userCurrency}</td>
                    <td className="p-3 text-right">
                      <span className={utilizationColor + ' font-medium'}>{totalFTE}%</span>
                    </td>
                    {isAdmin && <td className="p-3 text-right">{formatMoney(Math.round(impliedCost), baseCurrency)}</td>}
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${utilization > 100 ? 'bg-danger' : utilization > 80 ? 'bg-warning' : 'bg-success'}`}
                            style={{ width: `${Math.min(utilization, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-8">{utilization}%</span>
                      </div>
                    </td>
                    <td className="p-3 text-right text-muted-foreground">{userAllocations.length}</td>
                    {isAdmin && (
                      <td className="p-3 text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground"
                          title="Edit calendar"
                          onClick={() => setCalendarUser(user)}
                        >
                          <Calendar className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={async () => {
                            await deleteItem('users', user.id);
                            await refreshUsers();
                            setRefreshKey(k => k + 1);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {calendarUser && (
        <Dialog open={!!calendarUser} onOpenChange={open => !open && setCalendarUser(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Calendar — {calendarUser.name}</DialogTitle>
            </DialogHeader>
            <CalendarProfileEditor
              user={data.users.find(u => u.id === calendarUser.id) ?? calendarUser}
              onSave={async (calendar: CalendarProfile) => {
                await updateItem('users', { ...calendarUser, calendar });
                setCalendarUser(null);
                await refreshUsers();
                setRefreshKey(k => k + 1);
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
