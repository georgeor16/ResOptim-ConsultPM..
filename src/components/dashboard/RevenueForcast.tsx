import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { AppData } from '@/lib/types';
import { convertCurrency, formatMoney, type CurrencyCode } from '@/lib/currency';
import type { FxRates } from '@/lib/currency';

interface Props {
  data: AppData;
  baseCurrency: CurrencyCode;
  rates: FxRates;
}

export default function RevenueForecast({ data, baseCurrency, rates }: Props) {
  const conv = (amount: number, from: string) =>
    convertCurrency(amount, from as CurrencyCode, baseCurrency, rates);

  const chartData = useMemo(() => {
    const now = new Date();
    const months: { name: string; revenue: number; cost: number; profit: number }[] = [];

    for (let i = 0; i < 12; i++) {
      const month = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + i + 1, 0);
      const label = month.toLocaleString('default', { month: 'short', year: '2-digit' });

      // Projects active during this month
      const activeProjects = data.projects.filter(p => {
        if (p.status === 'Completed') return false;
        const start = new Date(p.startDate);
        const end = new Date(p.endDate);
        return start <= monthEnd && end >= month;
      });

      const revenue = activeProjects.reduce((s, p) => s + conv(p.monthlyFee, p.currency || 'USD'), 0);
      const cost = activeProjects.reduce((s, project) => {
        const allocs = data.allocations.filter(a => a.projectId === project.id);
        return s + allocs.reduce((c, alloc) => {
          const user = data.users.find(u => u.id === alloc.userId);
          return c + (user ? conv(user.monthlySalary * (alloc.ftePercent / 100), user.currency || 'USD') : 0);
        }, 0);
      }, 0);

      months.push({ name: label, revenue: Math.round(revenue), cost: Math.round(cost), profit: Math.round(revenue - cost) });
    }

    return months;
  }, [data, baseCurrency, rates]);

  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="font-semibold text-foreground text-sm mb-4">12-Month Revenue & Cost Forecast</h3>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                formatter={(value: number) => formatMoney(value, baseCurrency)}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="revenue" name="Revenue" fill="hsl(var(--accent))" radius={[3, 3, 0, 0]} />
              <Bar dataKey="cost" name="Cost" fill="hsl(var(--warning))" radius={[3, 3, 0, 0]} />
              <Bar dataKey="profit" name="Profit" fill="hsl(var(--success))" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
