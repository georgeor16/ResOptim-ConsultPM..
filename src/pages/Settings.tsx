import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Plus, X, Layers, Globe, Sun, Moon, Monitor } from 'lucide-react';
import { loadCustomTemplates, saveCustomTemplates, FIXED_TEMPLATES, type CategoryTemplate, type PhaseTemplate, type TeamRequirement } from '@/lib/templates';
import type { ProjectCategory } from '@/lib/types';
import TemplatePreview from '@/components/TemplatePreview';
import { SUPPORTED_CURRENCIES, getBaseCurrency, setBaseCurrency, type CurrencyCode } from '@/lib/currency';
import { useTheme } from 'next-themes';

const TEMPLATABLE_CATEGORIES: ProjectCategory[] = ['Scouting', 'Event', 'Full Report', 'Light Report', 'Other'];

export default function SettingsPage() {
  const { isAdmin } = useAuth();
  const [customTemplates, setCustomTemplates] = useState<CategoryTemplate[]>(loadCustomTemplates());
  const [editingCategory, setEditingCategory] = useState<ProjectCategory | null>(null);
  const [editPhases, setEditPhases] = useState<PhaseTemplate[]>([]);
  const [editTeam, setEditTeam] = useState<TeamRequirement[]>([]);
  const [editTimeline, setEditTimeline] = useState(4);
  const [baseCurrencyState, setBaseCurrencyState] = useState<CurrencyCode>(getBaseCurrency());
  const { theme, setTheme } = useTheme();

  // Theme is available to all users; admin sections are gated below

  const handleResetData = () => {
    if (confirm('This will delete all data and re-seed. Continue?')) {
      localStorage.removeItem('consulting_pm_data');
      localStorage.removeItem('current_user_id');
      localStorage.removeItem('consulting_pm_custom_templates');
      window.location.reload();
    }
  };

  const categoriesWithoutTemplate = TEMPLATABLE_CATEGORIES.filter(
    c => !customTemplates.some(t => t.category === c)
  );

  const startEditing = (cat: ProjectCategory) => {
    const existing = customTemplates.find(t => t.category === cat);
    if (existing) {
      setEditPhases(existing.phases.map(p => ({ ...p })));
      setEditTeam(existing.minimumTeam.map(t => ({ ...t })));
      setEditTimeline(existing.timelineWeeks);
    } else {
      setEditPhases([{ name: 'Phase 1', durationWeeks: 2, ftePercent: 50 }]);
      setEditTeam([{ role: 'Any', label: 'lead' }]);
      setEditTimeline(4);
    }
    setEditingCategory(cat);
  };

  const saveTemplate = () => {
    if (!editingCategory) return;
    const newTemplate: CategoryTemplate = {
      category: editingCategory,
      timelineWeeks: editTimeline,
      phases: editPhases,
      minimumTeam: editTeam,
      isFixed: false,
    };
    const updated = customTemplates.filter(t => t.category !== editingCategory);
    updated.push(newTemplate);
    setCustomTemplates(updated);
    saveCustomTemplates(updated);
    setEditingCategory(null);
  };

  const deleteTemplate = (cat: ProjectCategory) => {
    const updated = customTemplates.filter(t => t.category !== cat);
    setCustomTemplates(updated);
    saveCustomTemplates(updated);
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Application configuration</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Sun className="h-4 w-4" />
            Appearance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label className="text-xs">Theme</Label>
          <div className="flex gap-2">
            {([
              { value: 'light', label: 'Light', icon: Sun },
              { value: 'dark', label: 'Dark', icon: Moon },
              { value: 'system', label: 'System', icon: Monitor },
            ] as const).map(({ value, label, icon: Icon }) => (
              <Button
                key={value}
                variant={theme === value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTheme(value)}
                className="flex items-center gap-2"
              >
                <Icon className="h-4 w-4" />
                {label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {isAdmin && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Currency & FX
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs">Base Reporting Currency</Label>
                <p className="text-xs text-muted-foreground">All financial figures across Dashboard, Team, and Project views will be converted to this currency using daily FX rates from frankfurter.app.</p>
                <Select value={baseCurrencyState} onValueChange={(v) => { setBaseCurrencyState(v as CurrencyCode); setBaseCurrency(v as CurrencyCode); }}>
                  <SelectTrigger className="w-48">{baseCurrencyState}</SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_CURRENCIES.map(c => (
                      <SelectItem key={c.code} value={c.code}>{c.code} — {c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Data Management</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                All data is stored in localStorage. Reset to re-seed with default data.
              </p>
              <Button variant="destructive" onClick={handleResetData}>
                <Trash2 className="h-4 w-4 mr-2" />
                Reset All Data
              </Button>
            </CardContent>
          </Card>

          {/* Fixed Templates (read-only) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Layers className="h-4 w-4" />
                Built-in Category Templates
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">These templates are pre-loaded and cannot be edited.</p>
              {FIXED_TEMPLATES.map(t => (
                <TemplatePreview key={t.category} template={t} />
              ))}
            </CardContent>
          </Card>

          {/* Custom Templates */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Layers className="h-4 w-4" />
                Custom Category Templates
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">Configure templates for other categories. When selected during project creation, phases and timeline will be pre-filled.</p>

              {customTemplates.map(t => (
                <div key={t.category} className="space-y-2">
                  <TemplatePreview template={t} />
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => startEditing(t.category)}>Edit</Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteTemplate(t.category)}>Delete</Button>
                  </div>
                </div>
              ))}

              {editingCategory ? (
                <Card className="border-primary/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Editing: {editingCategory}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Timeline (weeks)</Label>
                      <Input type="number" min={1} value={editTimeline} onChange={e => setEditTimeline(Number(e.target.value))} className="w-32" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Phases</Label>
                      {editPhases.map((p, i) => (
                        <div key={i} className="grid grid-cols-[1fr_80px_80px_32px] gap-2 items-center">
                          <Input value={p.name} onChange={e => { const u = [...editPhases]; u[i] = { ...u[i], name: e.target.value }; setEditPhases(u); }} placeholder="Phase name" />
                          <Input type="number" min={0.5} step={0.5} value={p.durationWeeks} onChange={e => { const u = [...editPhases]; u[i] = { ...u[i], durationWeeks: Number(e.target.value) }; setEditPhases(u); }} />
                          <Input type="number" min={0} max={100} value={p.ftePercent} onChange={e => { const u = [...editPhases]; u[i] = { ...u[i], ftePercent: Number(e.target.value) }; setEditPhases(u); }} />
                          <Button variant="ghost" size="icon" onClick={() => setEditPhases(editPhases.filter((_, j) => j !== i))}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                      <Button variant="outline" size="sm" onClick={() => setEditPhases([...editPhases, { name: '', durationWeeks: 1, ftePercent: 50 }])}>
                        <Plus className="h-3 w-3 mr-1" /> Phase
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Minimum Team</Label>
                      {editTeam.map((t, i) => (
                        <div key={i} className="grid grid-cols-[1fr_1fr_32px] gap-2 items-center">
                          <Select value={t.label} onValueChange={v => { const u = [...editTeam]; u[i] = { ...u[i], label: v }; setEditTeam(u); }}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="lead">Lead</SelectItem>
                              <SelectItem value="contributor">Contributor</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input value={t.role} onChange={e => { const u = [...editTeam]; u[i] = { ...u[i], role: e.target.value }; setEditTeam(u); }} placeholder="Role requirement" />
                          <Button variant="ghost" size="icon" onClick={() => setEditTeam(editTeam.filter((_, j) => j !== i))}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                      <Button variant="outline" size="sm" onClick={() => setEditTeam([...editTeam, { role: 'Any', label: 'contributor' }])}>
                        <Plus className="h-3 w-3 mr-1" /> Member
                      </Button>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button size="sm" onClick={saveTemplate}>Save Template</Button>
                      <Button variant="outline" size="sm" onClick={() => setEditingCategory(null)}>Cancel</Button>
                    </div>
                  </CardContent>
                </Card>
              ) : categoriesWithoutTemplate.length > 0 ? (
                <div className="flex gap-2 flex-wrap">
                  {categoriesWithoutTemplate.map(c => (
                    <Button key={c} variant="outline" size="sm" onClick={() => startEditing(c)}>
                      <Plus className="h-3 w-3 mr-1" /> {c}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">All categories have templates configured.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Integrations</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Google Calendar, Google Drive, Slack webhook, and export integrations coming soon. Connect Lovable Cloud to enable these features.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
