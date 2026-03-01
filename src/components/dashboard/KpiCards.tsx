import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, AlertTriangle, DollarSign, Users } from 'lucide-react';
import { formatMoney, convertCurrency, type CurrencyCode } from '@/lib/currency';
import type { FxRates } from '@/lib/currency';
import type { AppData } from '@/lib/types';
import type { Project } from '@/lib/types';

interface KpiCardsProps {
  data: AppData;
  activeProjects: Project[];
  baseCurrency: CurrencyCode;
  rates: FxRates;
}

export default function KpiCards({ data, activeProjects, baseCurrency, rates }: KpiCardsProps) {
  const conv = (amount: number, from: string) =>
    convertCurrency(amount, from as CurrencyCode, baseCurrency, rates);

  const totalRevenue = activeProjects.reduce((sum, p) => sum + conv(p.monthlyFee, p.currency || 'USD'), 0);
  const totalCost = activeProjects.reduce((sum, project) => {
    const projectAllocations = data.allocations.filter(a => a.projectId === project.id);
    return sum + projectAllocations.reduce((c, alloc) => {
      const user = data.users.find(u => u.id === alloc.userId);
      return c + (user ? conv(user.monthlySalary * (alloc.ftePercent / 100), user.currency || 'USD') : 0);
    }, 0);
  }, 0);
  const blendedMargin = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0;

  const overageCount = activeProjects.filter(project => {
    const projectAllocations = data.allocations.filter(a => a.projectId === project.id);
    return projectAllocations.some(alloc => {
      const logged = data.timelogs.filter(t => t.projectId === project.id && t.userId === alloc.userId)
        .reduce((s, t) => s + t.hours, 0);
      return logged > alloc.agreedMonthlyHours * 0.9;
    });
  }).length;

  const totalCapacity = data.users.length * 100;
  const totalAllocated = data.allocations
    .filter(a => activeProjects.some(p => p.id === a.projectId))
    .reduce((sum, a) => sum + a.ftePercent, 0);
  const utilizationPct = totalCapacity > 0 ? (totalAllocated / totalCapacity) * 100 : 0;
  const overallocatedCount = data.users.filter(u => {
    const userFte = data.allocations
      .filter(a => a.userId === u.id && activeProjects.some(p => p.id === a.projectId))
      .reduce((s, a) => s + a.ftePercent, 0);
    return userFte > 100;
  }).length;

  const marginColor = (m: number) => {
    if (m > 30) return 'financial-positive';
    if (m > 10) return 'financial-warning';
    return 'financial-negative';
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
            <DollarSign className="h-3.5 w-3.5" />
            Active Revenue
          </div>
          <p className="text-2xl font-bold">{formatMoney(totalRevenue, baseCurrency)}</p>
          <p className="text-xs text-muted-foreground">/month ({baseCurrency})</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
            <TrendingUp className="h-3.5 w-3.5" />
            Team Cost
          </div>
          <p className="text-2xl font-bold">{formatMoney(totalCost, baseCurrency)}</p>
          <p className="text-xs text-muted-foreground">/month ({baseCurrency})</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
            <TrendingUp className="h-3.5 w-3.5" />
            Blended Margin
          </div>
          <p className={`text-2xl font-bold ${marginColor(blendedMargin)}`}>
            {blendedMargin.toFixed(1)}%
          </p>
          <p className="text-xs text-muted-foreground">{formatMoney(totalRevenue - totalCost, baseCurrency)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            Overage Risk
          </div>
          <p className={`text-2xl font-bold ${overageCount > 0 ? 'financial-warning' : 'financial-positive'}`}>
            {overageCount}
          </p>
          <p className="text-xs text-muted-foreground">projects at risk</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
            <Users className="h-3.5 w-3.5" />
            Team Capacity
          </div>
          <p className={`text-2xl font-bold ${utilizationPct > 100 ? 'financial-negative' : utilizationPct > 85 ? 'financial-warning' : 'financial-positive'}`}>
            {utilizationPct.toFixed(0)}%
          </p>
          <p className="text-xs text-muted-foreground">
            {totalAllocated}% / {totalCapacity}% FTE{overallocatedCount > 0 && ` · ${overallocatedCount} over`}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
