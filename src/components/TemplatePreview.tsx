import type { CategoryTemplate } from '@/lib/templates';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Users, Layers } from 'lucide-react';

interface TemplatePreviewProps {
  template: CategoryTemplate;
}

export default function TemplatePreview({ template }: TemplatePreviewProps) {
  const totalWeeks = template.timelineWeeks;

  return (
    <Card className="border-accent/40 bg-accent/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Layers className="h-4 w-4 text-accent" />
          Template: {template.category}
          <Badge variant="outline" className="ml-auto text-xs">
            <Clock className="h-3 w-3 mr-1" />
            {totalWeeks} weeks
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {/* Phase timeline bar */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Phases & FTE</p>
          <div className="flex gap-0.5 h-8 rounded-md overflow-hidden">
            {template.phases.map((phase, i) => {
              const widthPercent = (phase.durationWeeks / totalWeeks) * 100;
              const hue = 170 + i * 35;
              return (
                <div
                  key={i}
                  className="flex items-center justify-center text-[9px] font-semibold text-white relative group"
                  style={{
                    width: `${widthPercent}%`,
                    backgroundColor: `hsl(${hue}, 50%, 42%)`,
                    minWidth: '24px',
                  }}
                  title={`${phase.name}: ${phase.durationWeeks}w @ ${phase.ftePercent}% FTE`}
                >
                  <span className="truncate px-1">{phase.ftePercent}%</span>
                </div>
              );
            })}
          </div>
          <div className="flex gap-0.5">
            {template.phases.map((phase, i) => {
              const widthPercent = (phase.durationWeeks / totalWeeks) * 100;
              return (
                <div
                  key={i}
                  className="text-[9px] text-muted-foreground truncate text-center"
                  style={{ width: `${widthPercent}%`, minWidth: '24px' }}
                >
                  {phase.name}
                </div>
              );
            })}
          </div>
        </div>

        {/* Phase details table */}
        <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
          <span className="font-medium text-muted-foreground">Phase</span>
          <span className="font-medium text-muted-foreground">Duration</span>
          <span className="font-medium text-muted-foreground">FTE</span>
          {template.phases.map((phase, i) => (
            <>
              <span key={`n${i}`} className="text-foreground">{phase.name}</span>
              <span key={`d${i}`} className="text-foreground">{phase.durationWeeks}w</span>
              <span key={`f${i}`} className="text-foreground">{phase.ftePercent}%</span>
            </>
          ))}
        </div>

        {/* Team requirements */}
        <div className="flex items-center gap-2 text-xs">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Min. team:</span>
          {template.minimumTeam.map((t, i) => (
            <Badge key={i} variant="secondary" className="text-[10px]">
              {t.label} ({t.role})
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
