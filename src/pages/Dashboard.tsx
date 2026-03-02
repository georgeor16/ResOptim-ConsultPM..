import { useAuth } from '@/contexts/AuthContext';
import { loadData } from '@/lib/store';
import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getBaseCurrency, refreshFxRates, loadFxRates } from '@/lib/currency';
import type { FxRates } from '@/lib/currency';
import type { AppData } from '@/lib/types';
import KpiCards from '@/components/dashboard/KpiCards';
import ProjectCards from '@/components/dashboard/ProjectCards';
import OverdueResources from '@/components/dashboard/OverdueResources';
import RevenueForecast from '@/components/dashboard/RevenueForcast';
import UnifiedGantt from '@/components/dashboard/UnifiedGantt';
import TeamHeatmap from '@/components/dashboard/TeamHeatmap';
import CollapsibleSection from '@/components/dashboard/CollapsibleSection';

export default function Dashboard() {
  const { isManagerOrAbove, currentUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState<AppData | null>(null);
  const baseCurrency = getBaseCurrency();
  const [rates, setRates] = useState<FxRates>(loadFxRates());

  // Refetch when landing on dashboard so Gantt and all widgets stay in sync with changes
  useEffect(() => {
    loadData().then(setData);
  }, [location.pathname]);
  useEffect(() => {
    refreshFxRates().then(setRates);
  }, []);

  if (!data) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-muted-foreground">Loading...</div>
    );
  }

  const activeProjects = data.projects.filter(p => p.status === 'Active');

  const visibleProjects = isManagerOrAbove
    ? data.projects
    : data.projects.filter(p =>
        data.allocations.some(a => a.projectId === p.id && a.userId === currentUser?.id) ||
        data.tasks.some(t => t.projectId === p.id && (t.assigneeIds || []).includes(currentUser?.id || ''))
      );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {isManagerOrAbove ? `${activeProjects.length} active projects` : 'Your assigned projects'}
          </p>
        </div>
      <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const keys = Object.keys(localStorage).filter(k => k.startsWith('collapse:'));
              keys.forEach(k => localStorage.removeItem(k));
              window.location.reload();
            }}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset layout
          </Button>
          {isManagerOrAbove && (
            <Button onClick={() => navigate('/projects/new')} className="bg-accent text-accent-foreground hover:bg-accent/90">
              <Plus className="h-4 w-4 mr-2" />
              New Project
            </Button>
          )}
        </div>
      </div>

      {isManagerOrAbove && (
        <>
          <CollapsibleSection title="Key Metrics">
            <KpiCards data={data} activeProjects={activeProjects} baseCurrency={baseCurrency} rates={rates} />
          </CollapsibleSection>
          <CollapsibleSection title="Overdue Tasks">
            <OverdueResources data={data} />
          </CollapsibleSection>
        </>
      )}

      <CollapsibleSection title="Projects">
        <ProjectCards
          data={data}
          visibleProjects={visibleProjects}
          isManagerOrAbove={isManagerOrAbove}
          baseCurrency={baseCurrency}
          rates={rates}
        />
      </CollapsibleSection>

      {isManagerOrAbove && (
        <>
          <CollapsibleSection title="Project Timeline">
            <UnifiedGantt data={data} />
          </CollapsibleSection>
          <CollapsibleSection title="Team Utilization">
            <TeamHeatmap data={data} />
          </CollapsibleSection>
          <CollapsibleSection title="Revenue Forecast">
            <RevenueForecast data={data} baseCurrency={baseCurrency} rates={rates} />
          </CollapsibleSection>
        </>
      )}
    </div>
  );
}
