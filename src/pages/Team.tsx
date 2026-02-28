import { useMemo, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { loadData } from '@/lib/store';
import { Card, CardContent } from '@/components/ui/card';
import { getBaseCurrency, convertCurrency, formatMoney, refreshFxRates, loadFxRates, getCurrencySymbol, type CurrencyCode } from '@/lib/currency';
import type { FxRates } from '@/lib/currency';

export default function Team() {
  const { isManagerOrAbove, isAdmin } = useAuth();
  const data = useMemo(() => loadData(), []);
  const baseCurrency = getBaseCurrency();
  const [rates, setRates] = useState<FxRates>(loadFxRates());

  useEffect(() => {
    refreshFxRates().then(setRates);
  }, []);

  if (!isManagerOrAbove) {
    return <div className="text-center py-12 text-muted-foreground">Access restricted</div>;
  }

  const conv = (amount: number, from: string) =>
    convertCurrency(amount, from as CurrencyCode, baseCurrency, rates);

  const activeProjects = data.projects.filter(p => p.status === 'Active');

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Team Overview</h1>
        <p className="text-sm text-muted-foreground">Financial summary & utilization · Base: {baseCurrency}</p>
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
              </tr>
            </thead>
            <tbody>
              {data.users.map(user => {
                const userCurrency = (user.currency || 'EUR') as CurrencyCode;
                const userAllocations = data.allocations.filter(a =>
                  a.userId === user.id && activeProjects.some(p => p.id === a.projectId)
                );
                const totalFTE = userAllocations.reduce((s, a) => s + a.ftePercent, 0);
                const impliedCost = conv(user.monthlySalary * (totalFTE / 100), userCurrency);
                const utilization = totalFTE;

                const roleLabel = (role: string) => {
                  switch (role) {
                    case 'admin': return 'CEO';
                    case 'manager': return 'Director';
                    case 'member': return 'Advisor';
                    default: return role;
                  }
                };

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
                        <span className="font-medium">{user.name}</span>
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground">{roleLabel(user.role)}</td>
                    {isAdmin && (
                      <td className="p-3 text-right">
                        {getCurrencySymbol(userCurrency)}{user.monthlySalary.toLocaleString()}
                        {userCurrency !== baseCurrency && (
                          <span className="text-xs text-muted-foreground ml-1">
                            ({formatMoney(conv(user.monthlySalary, userCurrency), baseCurrency)})
                          </span>
                        )}
                      </td>
                    )}
                    <td className="p-3 text-right">{getCurrencySymbol(userCurrency)}{user.billableHourlyRate}/h</td>
                    <td className="p-3 text-center text-xs text-muted-foreground">{userCurrency}</td>
                    <td className="p-3 text-right">
                      <span className={utilizationColor + ' font-medium'}>{totalFTE}%</span>
                    </td>
                    {isAdmin && <td className="p-3 text-right">{formatMoney(impliedCost, baseCurrency)}</td>}
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
