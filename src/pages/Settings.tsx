import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trash2, Plus, X, Layers, Globe, Sun, Moon, Monitor } from 'lucide-react';
import { loadCustomTemplates, saveCustomTemplates, FIXED_TEMPLATES, type CategoryTemplate, type PhaseTemplate, type TeamRequirement } from '@/lib/templates';
import type { Organisation, ProjectCategory, RoleTaxonomy, SkillTaxonomy } from '@/lib/types';
import TemplatePreview from '@/components/TemplatePreview';
import { SUPPORTED_CURRENCIES, getBaseCurrency, setBaseCurrency, type CurrencyCode } from '@/lib/currency';
import { useTheme } from 'next-themes';
import { genId, loadData, saveData } from '@/lib/store';
import { logAuditEvent } from '@/lib/auditTrail';
import { useNavigate } from 'react-router-dom';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { GripVertical, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const TEMPLATABLE_CATEGORIES: ProjectCategory[] = ['Scouting', 'Event', 'Full Report', 'Light Report', 'Other'];

export default function SettingsPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [customTemplates, setCustomTemplates] = useState<CategoryTemplate[]>(loadCustomTemplates());
  const [editingCategory, setEditingCategory] = useState<ProjectCategory | null>(null);
  const [editPhases, setEditPhases] = useState<PhaseTemplate[]>([]);
  const [editTeam, setEditTeam] = useState<TeamRequirement[]>([]);
  const [editTimeline, setEditTimeline] = useState(4);
  const [baseCurrencyState, setBaseCurrencyState] = useState<CurrencyCode>(getBaseCurrency());
  const { theme, setTheme } = useTheme();
  const [orgData, setOrgData] = useState<{ organisation: Organisation; all: Awaited<ReturnType<typeof loadData>> } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    if (!isAdmin) return;
    loadData().then((d) => {
      const existingOrg = d.organisations?.[0];
      const org: Organisation = existingOrg ?? { id: 'org-1', name: 'Organisation' };
      const next = {
        ...d,
        organisations: existingOrg ? d.organisations : [org],
        roles: Array.isArray(d.roles) ? d.roles : [],
        skills: Array.isArray(d.skills) ? d.skills : [],
      };
      if (!existingOrg) saveData(next);
      setOrgData({ organisation: org, all: next });
    });
  }, [isAdmin]);

  const activeRoles = useMemo(() => {
    const orgId = orgData?.organisation.id;
    if (!orgId) return [] as RoleTaxonomy[];
    return (orgData?.all.roles ?? []).filter(r => r.orgId === orgId && !r.archived);
  }, [orgData?.organisation.id, orgData?.all.roles]);

  const activeSkills = useMemo(() => {
    const orgId = orgData?.organisation.id;
    if (!orgId) return [] as SkillTaxonomy[];
    return (orgData?.all.skills ?? []).filter(s => s.orgId === orgId && !s.archived);
  }, [orgData?.organisation.id, orgData?.all.skills]);

  // Theme is available to all users; admin sections are gated below

  const handleResetData = () => {
    if (confirm('This will delete all data and re-seed. Continue?')) {
      localStorage.removeItem('consulting_pm_data');
      localStorage.removeItem('current_user_id');
      localStorage.removeItem('consulting_pm_custom_templates');
      window.location.reload();
    }
  };

  const persistAll = (nextAll: Awaited<ReturnType<typeof loadData>>) => {
    saveData(nextAll);
    window.dispatchEvent(new Event('allocations-updated'));
  };

  const persistOrg = (org: Organisation) => {
    setOrgData((prev) => {
      if (!prev) return prev;
      const nextAll = { ...prev.all };
      nextAll.organisations = (nextAll.organisations ?? []).map(o => (o.id === org.id ? org : o));
      persistAll(nextAll);
      return { organisation: org, all: nextAll };
    });
  };

  // taxonomy editors manage roles/skills/users directly (see RoleEditor/SkillEditor below)

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

          {/* Organisation taxonomy */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Layers className="h-4 w-4" />
                Taxonomy
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {(() => {
                const n = (orgData?.all.users ?? []).filter(u => !u.primaryRole).length;
                if (n <= 0) return null;
                return (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
                    <p className="text-amber-700 dark:text-amber-300">
                      <span className="font-medium">{n}</span> members have no role assigned — complete their profiles to enable bottleneck detection.
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 h-8 text-xs text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
                      onClick={() => navigate('/bandwidth?unclassified=1')}
                    >
                      Review members
                    </Button>
                  </div>
                );
              })()}
              <p className="text-xs text-muted-foreground">
                Define roles and skills used across bottlenecks, forecasting, and member profiles.
              </p>

              <Tabs defaultValue="roles">
                <TabsList className="bg-muted/30 border border-white/10 rounded-full">
                  <TabsTrigger value="roles" className="text-xs px-3">Roles</TabsTrigger>
                  <TabsTrigger value="skills" className="text-xs px-3">Skills</TabsTrigger>
                </TabsList>

                <TabsContent value="roles" className="mt-4 space-y-3">
                  <RoleEditor
                    orgId={orgData?.organisation.id ?? 'org-1'}
                    roles={orgData?.all.roles ?? []}
                    users={orgData?.all.users ?? []}
                    sensors={sensors}
                    onUpdate={(roles, users) => {
                      if (!orgData) return;
                      const nextAll = { ...orgData.all, roles, users };
                      saveData(nextAll);
                      window.dispatchEvent(new Event('allocations-updated'));
                      setOrgData({ ...orgData, all: nextAll });
                    }}
                  />
                </TabsContent>

                <TabsContent value="skills" className="mt-4 space-y-3">
                  <SkillEditor
                    orgId={orgData?.organisation.id ?? 'org-1'}
                    skills={orgData?.all.skills ?? []}
                    users={orgData?.all.users ?? []}
                    sensors={sensors}
                    onUpdate={(skills, users) => {
                      if (!orgData) return;
                      const nextAll = { ...orgData.all, skills, users };
                      saveData(nextAll);
                      window.dispatchEvent(new Event('allocations-updated'));
                      setOrgData({ ...orgData, all: nextAll });
                    }}
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function byOrderName<T extends { order?: number; name: string }>(a: T, b: T): number {
  return (a.order ?? 9999) - (b.order ?? 9999) || a.name.localeCompare(b.name);
}

function countMembersWithRole(users: Awaited<ReturnType<typeof loadData>>['users'], roleId: string): number {
  return users.filter(u => u.primaryRole === roleId).length;
}

function countMembersWithSkill(users: Awaited<ReturnType<typeof loadData>>['users'], skillId: string): number {
  return users.filter(u => Array.isArray(u.skills) && u.skills.includes(skillId)).length;
}

function SortableRow({
  id,
  children,
  disabled,
}: {
  id: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('rounded-lg border border-white/10 bg-background/30 px-2 py-2', isDragging && 'opacity-70')}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          className={cn('mt-1 h-6 w-6 rounded-md text-muted-foreground hover:text-foreground', disabled && 'opacity-40')}
          {...attributes}
          {...listeners}
          title="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}

function RoleEditor({
  orgId,
  roles,
  users,
  sensors,
  onUpdate,
}: {
  orgId: string;
  roles: RoleTaxonomy[];
  users: Awaited<ReturnType<typeof loadData>>['users'];
  sensors: ReturnType<typeof useSensors>;
  onUpdate: (roles: RoleTaxonomy[], users: Awaited<ReturnType<typeof loadData>>['users']) => void;
}) {
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState('');
  const [mergeOpenId, setMergeOpenId] = useState<string | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [mergeConfirm, setMergeConfirm] = useState<{ fromId: string; intoId: string } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const list = roles.filter(r => r.orgId === orgId);
  const active = list.filter(r => !r.archived).slice().sort(byOrderName);
  const archived = list.filter(r => r.archived).slice().sort(byOrderName);

  const commitRename = (roleId: string, nextNameRaw: string) => {
    const nextName = nextNameRaw.trim();
    if (!nextName) return;
    const now = new Date().toISOString();
    const nextRoles = roles.map(r => (r.id === roleId ? { ...r, name: nextName, updatedAt: now } : r));
    onUpdate(nextRoles, users);
    logAuditEvent({ orgId, type: 'taxonomy_role_renamed', message: `Role renamed to "${nextName}".`, meta: { roleId, name: nextName } });
  };

  const onDragEnd = (event: DragEndEvent, within: 'active' | 'archived') => {
    const { active: a, over } = event;
    if (!over || a.id === over.id) return;
    const src = within === 'active' ? active : archived;
    const oldIndex = src.findIndex(r => r.id === a.id);
    const newIndex = src.findIndex(r => r.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const moved = arrayMove(src, oldIndex, newIndex);
    const now = new Date().toISOString();
    const orderMap = new Map(moved.map((r, idx) => [r.id, idx] as const));
    const nextRoles = roles.map(r => (orderMap.has(r.id) ? { ...r, order: orderMap.get(r.id)!, updatedAt: now } : r));
    onUpdate(nextRoles, users);
    logAuditEvent({ orgId, type: 'taxonomy_reordered', message: 'Roles reordered.', meta: { kind: 'role', within } });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs">Active roles</Label>
        {active.length === 0 ? (
          <p className="text-xs text-muted-foreground">No roles yet.</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => onDragEnd(e, 'active')}>
            <SortableContext items={active.map(r => r.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {active.map((r) => {
                  const usage = countMembersWithRole(users, r.id);
                  const isEditing = editingId === r.id;
                  return (
                    <SortableRow key={r.id} id={r.id}>
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="min-w-0 flex-1">
                          {isEditing ? (
                            <Input
                              autoFocus
                              value={editingDraft}
                              onChange={(e) => setEditingDraft(e.target.value)}
                              onBlur={() => { commitRename(r.id, editingDraft); setEditingId(null); }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') { commitRename(r.id, editingDraft); setEditingId(null); }
                                if (e.key === 'Escape') { setEditingId(null); }
                              }}
                              className="h-9"
                            />
                          ) : (
                            <button
                              type="button"
                              className="text-left text-sm font-medium text-foreground/90 truncate hover:underline"
                              onClick={() => { setEditingId(r.id); setEditingDraft(r.name); }}
                              title="Click to rename"
                            >
                              {r.name}
                            </button>
                          )}
                          <p className="text-[11px] text-muted-foreground mt-0.5">{usage} member{usage !== 1 ? 's' : ''}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="color"
                            value={r.color ?? '#64748b'}
                            onChange={(e) => {
                              const now = new Date().toISOString();
                              const nextRoles = roles.map(x => x.id === r.id ? { ...x, color: e.target.value, updatedAt: now } : x);
                              onUpdate(nextRoles, users);
                            }}
                            className="h-9 w-12 p-1"
                            title="Color"
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => { setMergeOpenId(r.id); setMergeTargetId(''); setMergeConfirm(null); }}
                          >
                            Merge
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              const now = new Date().toISOString();
                              const nextRoles = roles.map(x => x.id === r.id ? { ...x, archived: true, updatedAt: now } : x);
                              onUpdate(nextRoles, users);
                              logAuditEvent({ orgId, type: 'taxonomy_role_archived', message: `Role archived: "${r.name}".`, meta: { roleId: r.id, name: r.name } });
                            }}
                          >
                            Archive
                          </Button>
                        </div>
                      </div>

                      {mergeOpenId === r.id && (
                        <div className="mt-2 rounded-lg border border-white/10 bg-muted/20 p-2 space-y-2">
                          <p className="text-[11px] text-muted-foreground">
                            Merge <span className="text-foreground/80 font-medium">{r.name}</span> into…
                          </p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Select value={mergeTargetId} onValueChange={(v) => { setMergeTargetId(v); setMergeConfirm({ fromId: r.id, intoId: v }); }}>
                              <SelectTrigger className="h-8 w-[220px] text-xs">
                                <SelectValue placeholder="Select target role" />
                              </SelectTrigger>
                              <SelectContent>
                                {active.filter(x => x.id !== r.id).map(x => (
                                  <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button variant="outline" size="sm" className="h-8" onClick={() => { setMergeOpenId(null); setMergeConfirm(null); }}>
                              Cancel
                            </Button>
                          </div>

                          {mergeConfirm && (
                            <div className="rounded-lg border border-white/10 bg-background/40 p-2">
                              {(() => {
                                const from = roles.find(x => x.id === mergeConfirm.fromId);
                                const into = roles.find(x => x.id === mergeConfirm.intoId);
                                const n = countMembersWithRole(users, mergeConfirm.fromId);
                                if (!from || !into) return null;
                                return (
                                  <div className="space-y-2">
                                    <p className="text-xs text-muted-foreground">
                                      <span className="font-medium text-foreground/80">{n}</span> member{n !== 1 ? 's' : ''} will be reassigned from{' '}
                                      <span className="font-medium text-foreground/80">{from.name}</span> to{' '}
                                      <span className="font-medium text-foreground/80">{into.name}</span>. This cannot be undone.
                                    </p>
                                    <div className="flex items-center gap-2">
                                      <Button
                                        size="sm"
                                        className="h-8"
                                        onClick={() => {
                                          const now = new Date().toISOString();
                                          const nextUsers = users.map(u => (u.primaryRole === from.id ? { ...u, primaryRole: into.id, updatedAt: now } : u));
                                          const nextRoles = roles.map(rr => rr.id === from.id ? { ...rr, archived: true, updatedAt: now } : rr);
                                          onUpdate(nextRoles, nextUsers);
                                          logAuditEvent({
                                            orgId,
                                            type: 'taxonomy_role_merged',
                                            message: `Merged role "${from.name}" into "${into.name}" (${n} members reassigned).`,
                                            meta: { fromId: from.id, intoId: into.id, reassignedCount: n },
                                          });
                                          setMergeOpenId(null);
                                          setMergeConfirm(null);
                                          setMergeTargetId('');
                                        }}
                                      >
                                        Confirm merge
                                      </Button>
                                      <Button variant="outline" size="sm" className="h-8" onClick={() => { setMergeConfirm(null); setMergeTargetId(''); }}>
                                        Back
                                      </Button>
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      )}
                    </SortableRow>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {/* Add role input */}
        <div className="rounded-lg border border-white/10 bg-background/30 px-3 py-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Add role… (Enter to create)"
            className="h-9"
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              const name = newName.trim();
              if (!name) return;
              const exists = roles.some(r => r.orgId === orgId && r.name.toLowerCase() === name.toLowerCase());
              if (exists) return;
              const now = new Date().toISOString();
              const maxOrder = Math.max(-1, ...roles.filter(r => r.orgId === orgId).map(r => r.order ?? -1));
              const next: RoleTaxonomy = { id: genId(), name, orgId, archived: false, order: maxOrder + 1, createdAt: now, updatedAt: now };
              onUpdate([...roles, next], users);
              logAuditEvent({ orgId, type: 'taxonomy_role_created', message: `Role created: "${name}".`, meta: { roleId: next.id, name } });
              setNewName('');
            }}
          />
        </div>
      </div>

      {/* Archived */}
      <Collapsible open={showArchived} onOpenChange={setShowArchived}>
        <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
          <ChevronDown className={cn('h-4 w-4 transition-transform', !showArchived && '-rotate-90')} />
          Archived ({archived.length})
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2 space-y-2">
          {archived.length === 0 ? (
            <p className="text-xs text-muted-foreground">No archived roles.</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => onDragEnd(e, 'archived')}>
              <SortableContext items={archived.map(r => r.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {archived.map((r) => {
                    const usage = countMembersWithRole(users, r.id);
                    const canDelete = usage === 0;
                    const confirmArmed = deleteConfirmId === r.id;
                    return (
                      <SortableRow key={r.id} id={r.id}>
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground/80 truncate">{r.name}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{usage} member{usage !== 1 ? 's' : ''}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => {
                                const now = new Date().toISOString();
                                const nextRoles = roles.map(x => x.id === r.id ? { ...x, archived: false, updatedAt: now } : x);
                                onUpdate(nextRoles, users);
                                logAuditEvent({ orgId, type: 'taxonomy_role_unarchived', message: `Role unarchived: "${r.name}".`, meta: { roleId: r.id } });
                              }}
                            >
                              Unarchive
                            </Button>
                            {canDelete && (
                              <Button
                                variant={confirmArmed ? 'destructive' : 'outline'}
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => {
                                  if (!confirmArmed) { setDeleteConfirmId(r.id); return; }
                                  const nextRoles = roles.filter(x => x.id !== r.id);
                                  onUpdate(nextRoles, users);
                                  logAuditEvent({ orgId, type: 'taxonomy_role_deleted', message: `Role deleted: "${r.name}".`, meta: { roleId: r.id, name: r.name } });
                                  setDeleteConfirmId(null);
                                }}
                                title="Delete is only available when no members are assigned and role is archived."
                              >
                                {confirmArmed ? 'Confirm delete' : 'Delete'}
                              </Button>
                            )}
                          </div>
                        </div>
                        {canDelete && confirmArmed && (
                          <p className="text-[11px] text-muted-foreground mt-2">
                            Permanent deletion. This cannot be undone.
                          </p>
                        )}
                      </SortableRow>
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function SkillEditor({
  orgId,
  skills,
  users,
  sensors,
  onUpdate,
}: {
  orgId: string;
  skills: SkillTaxonomy[];
  users: Awaited<ReturnType<typeof loadData>>['users'];
  sensors: ReturnType<typeof useSensors>;
  onUpdate: (skills: SkillTaxonomy[], users: Awaited<ReturnType<typeof loadData>>['users']) => void;
}) {
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState('');
  const [mergeOpenId, setMergeOpenId] = useState<string | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [mergeConfirm, setMergeConfirm] = useState<{ fromId: string; intoId: string } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const list = skills.filter(s => s.orgId === orgId);
  const active = list.filter(s => !s.archived).slice().sort(byOrderName);
  const archived = list.filter(s => s.archived).slice().sort(byOrderName);

  const commitRename = (skillId: string, nextNameRaw: string) => {
    const nextName = nextNameRaw.trim();
    if (!nextName) return;
    const now = new Date().toISOString();
    const nextSkills = skills.map(s => (s.id === skillId ? { ...s, name: nextName, updatedAt: now } : s));
    onUpdate(nextSkills, users);
    logAuditEvent({ orgId, type: 'taxonomy_skill_renamed', message: `Skill renamed to "${nextName}".`, meta: { skillId, name: nextName } });
  };

  const onDragEnd = (event: DragEndEvent, within: 'active' | 'archived') => {
    const { active: a, over } = event;
    if (!over || a.id === over.id) return;
    const src = within === 'active' ? active : archived;
    const oldIndex = src.findIndex(s => s.id === a.id);
    const newIndex = src.findIndex(s => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const moved = arrayMove(src, oldIndex, newIndex);
    const now = new Date().toISOString();
    const orderMap = new Map(moved.map((s, idx) => [s.id, idx] as const));
    const nextSkills = skills.map(s => (orderMap.has(s.id) ? { ...s, order: orderMap.get(s.id)!, updatedAt: now } : s));
    onUpdate(nextSkills, users);
    logAuditEvent({ orgId, type: 'taxonomy_reordered', message: 'Skills reordered.', meta: { kind: 'skill', within } });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs">Active skills</Label>
        {active.length === 0 ? (
          <p className="text-xs text-muted-foreground">No skills yet.</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => onDragEnd(e, 'active')}>
            <SortableContext items={active.map(s => s.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {active.map((s) => {
                  const usage = countMembersWithSkill(users, s.id);
                  const isEditing = editingId === s.id;
                  return (
                    <SortableRow key={s.id} id={s.id}>
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0 flex-1">
                          {isEditing ? (
                            <Input
                              autoFocus
                              value={editingDraft}
                              onChange={(e) => setEditingDraft(e.target.value)}
                              onBlur={() => { commitRename(s.id, editingDraft); setEditingId(null); }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') { commitRename(s.id, editingDraft); setEditingId(null); }
                                if (e.key === 'Escape') { setEditingId(null); }
                              }}
                              className="h-9"
                            />
                          ) : (
                            <button
                              type="button"
                              className="text-left text-sm font-medium text-foreground/90 truncate hover:underline"
                              onClick={() => { setEditingId(s.id); setEditingDraft(s.name); }}
                              title="Click to rename"
                            >
                              {s.name}
                            </button>
                          )}
                          <p className="text-[11px] text-muted-foreground mt-0.5">{usage} member{usage !== 1 ? 's' : ''}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            value={s.category ?? ''}
                            onChange={(e) => {
                              const now = new Date().toISOString();
                              const nextSkills = skills.map(x => x.id === s.id ? { ...x, category: e.target.value, updatedAt: now } : x);
                              onUpdate(nextSkills, users);
                            }}
                            placeholder="Category"
                            className="h-9 w-[160px]"
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => { setMergeOpenId(s.id); setMergeTargetId(''); setMergeConfirm(null); }}
                          >
                            Merge
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              const now = new Date().toISOString();
                              const nextSkills = skills.map(x => x.id === s.id ? { ...x, archived: true, updatedAt: now } : x);
                              onUpdate(nextSkills, users);
                              logAuditEvent({ orgId, type: 'taxonomy_skill_archived', message: `Skill archived: "${s.name}".`, meta: { skillId: s.id, name: s.name } });
                            }}
                          >
                            Archive
                          </Button>
                        </div>
                      </div>

                      {mergeOpenId === s.id && (
                        <div className="mt-2 rounded-lg border border-white/10 bg-muted/20 p-2 space-y-2">
                          <p className="text-[11px] text-muted-foreground">
                            Merge <span className="text-foreground/80 font-medium">{s.name}</span> into…
                          </p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Select value={mergeTargetId} onValueChange={(v) => { setMergeTargetId(v); setMergeConfirm({ fromId: s.id, intoId: v }); }}>
                              <SelectTrigger className="h-8 w-[220px] text-xs">
                                <SelectValue placeholder="Select target skill" />
                              </SelectTrigger>
                              <SelectContent>
                                {active.filter(x => x.id !== s.id).map(x => (
                                  <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button variant="outline" size="sm" className="h-8" onClick={() => { setMergeOpenId(null); setMergeConfirm(null); }}>
                              Cancel
                            </Button>
                          </div>

                          {mergeConfirm && (
                            <div className="rounded-lg border border-white/10 bg-background/40 p-2">
                              {(() => {
                                const from = skills.find(x => x.id === mergeConfirm.fromId);
                                const into = skills.find(x => x.id === mergeConfirm.intoId);
                                const n = countMembersWithSkill(users, mergeConfirm.fromId);
                                if (!from || !into) return null;
                                return (
                                  <div className="space-y-2">
                                    <p className="text-xs text-muted-foreground">
                                      <span className="font-medium text-foreground/80">{n}</span> member{n !== 1 ? 's' : ''} will be reassigned from{' '}
                                      <span className="font-medium text-foreground/80">{from.name}</span> to{' '}
                                      <span className="font-medium text-foreground/80">{into.name}</span>. This cannot be undone.
                                    </p>
                                    <div className="flex items-center gap-2">
                                      <Button
                                        size="sm"
                                        className="h-8"
                                        onClick={() => {
                                          const now = new Date().toISOString();
                                          const nextUsers = users.map(u => {
                                            const list = Array.isArray(u.skills) ? u.skills : [];
                                            if (!list.includes(from.id)) return u;
                                            const replaced = list.map(id => (id === from.id ? into.id : id));
                                            const uniq = Array.from(new Set(replaced));
                                            return { ...u, skills: uniq, updatedAt: now };
                                          });
                                          const nextSkills = skills.map(ss => ss.id === from.id ? { ...ss, archived: true, updatedAt: now } : ss);
                                          onUpdate(nextSkills, nextUsers);
                                          logAuditEvent({
                                            orgId,
                                            type: 'taxonomy_skill_merged',
                                            message: `Merged skill "${from.name}" into "${into.name}" (${n} members reassigned).`,
                                            meta: { fromId: from.id, intoId: into.id, reassignedCount: n },
                                          });
                                          setMergeOpenId(null);
                                          setMergeConfirm(null);
                                          setMergeTargetId('');
                                        }}
                                      >
                                        Confirm merge
                                      </Button>
                                      <Button variant="outline" size="sm" className="h-8" onClick={() => { setMergeConfirm(null); setMergeTargetId(''); }}>
                                        Back
                                      </Button>
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      )}
                    </SortableRow>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {/* Add skill input */}
        <div className="rounded-lg border border-white/10 bg-background/30 px-3 py-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Add skill… (Enter to create)"
            className="h-9"
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              const name = newName.trim();
              if (!name) return;
              const exists = skills.some(s => s.orgId === orgId && s.name.toLowerCase() === name.toLowerCase());
              if (exists) return;
              const now = new Date().toISOString();
              const maxOrder = Math.max(-1, ...skills.filter(s => s.orgId === orgId).map(s => s.order ?? -1));
              const next: SkillTaxonomy = { id: genId(), name, orgId, archived: false, order: maxOrder + 1, createdAt: now, updatedAt: now };
              onUpdate([...skills, next], users);
              logAuditEvent({ orgId, type: 'taxonomy_skill_created', message: `Skill created: "${name}".`, meta: { skillId: next.id, name } });
              setNewName('');
            }}
          />
        </div>
      </div>

      {/* Archived */}
      <Collapsible open={showArchived} onOpenChange={setShowArchived}>
        <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
          <ChevronDown className={cn('h-4 w-4 transition-transform', !showArchived && '-rotate-90')} />
          Archived ({archived.length})
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2 space-y-2">
          {archived.length === 0 ? (
            <p className="text-xs text-muted-foreground">No archived skills.</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => onDragEnd(e, 'archived')}>
              <SortableContext items={archived.map(s => s.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {archived.map((s) => {
                    const usage = countMembersWithSkill(users, s.id);
                    const canDelete = usage === 0;
                    const confirmArmed = deleteConfirmId === s.id;
                    return (
                      <SortableRow key={s.id} id={s.id}>
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground/80 truncate">{s.name}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{usage} member{usage !== 1 ? 's' : ''}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => {
                                const now = new Date().toISOString();
                                const nextSkills = skills.map(x => x.id === s.id ? { ...x, archived: false, updatedAt: now } : x);
                                onUpdate(nextSkills, users);
                                logAuditEvent({ orgId, type: 'taxonomy_skill_unarchived', message: `Skill unarchived: "${s.name}".`, meta: { skillId: s.id } });
                              }}
                            >
                              Unarchive
                            </Button>
                            {canDelete && (
                              <Button
                                variant={confirmArmed ? 'destructive' : 'outline'}
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => {
                                  if (!confirmArmed) { setDeleteConfirmId(s.id); return; }
                                  const nextSkills = skills.filter(x => x.id !== s.id);
                                  onUpdate(nextSkills, users);
                                  logAuditEvent({ orgId, type: 'taxonomy_skill_deleted', message: `Skill deleted: "${s.name}".`, meta: { skillId: s.id, name: s.name } });
                                  setDeleteConfirmId(null);
                                }}
                              >
                                {confirmArmed ? 'Confirm delete' : 'Delete'}
                              </Button>
                            )}
                          </div>
                        </div>
                        {canDelete && confirmArmed && (
                          <p className="text-[11px] text-muted-foreground mt-2">
                            Permanent deletion. This cannot be undone.
                          </p>
                        )}
                      </SortableRow>
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
