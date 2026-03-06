import { useMemo, useState } from 'react';
import type { RoleTaxonomy, SkillTaxonomy, User } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, Tags, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  user: User;
  roleOptions: RoleTaxonomy[];
  skillOptions: SkillTaxonomy[];
  onSave: (next: { primaryRole?: string | null; skills?: string[] }) => void;
  onCreateSkill?: (name: string) => Promise<SkillTaxonomy> | SkillTaxonomy;
  align?: 'start' | 'end';
  size?: 'sm' | 'xs';
}

export function RoleSkillInlineEditor({
  user,
  roleOptions,
  skillOptions,
  onSave,
  onCreateSkill,
  align = 'end',
  size = 'xs',
}: Props) {
  const [open, setOpen] = useState(false);
  const [roleQuery, setRoleQuery] = useState('');
  const [skillQuery, setSkillQuery] = useState('');

  const skillNameById = useMemo(() => {
    const map = new Map<string, string>();
    (skillOptions ?? []).forEach(s => map.set(s.id, s.name));
    return map;
  }, [skillOptions]);

  const roleNameById = useMemo(() => {
    const map = new Map<string, string>();
    (roleOptions ?? []).forEach(r => map.set(r.id, r.name));
    return map;
  }, [roleOptions]);

  const activeRoles = useMemo(() => {
    const q = roleQuery.trim().toLowerCase();
    return (roleOptions ?? [])
      .filter(r => !r.archived)
      .filter(r => (q ? r.name.toLowerCase().includes(q) : true))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [roleOptions, roleQuery]);

  const activeSkills = useMemo(() => {
    const q = skillQuery.trim().toLowerCase();
    return (skillOptions ?? [])
      .filter(s => !s.archived)
      .filter(s => (q ? s.name.toLowerCase().includes(q) : true))
      .slice()
      .sort((a, b) => (a.category ?? '').localeCompare(b.category ?? '') || a.name.localeCompare(b.name));
  }, [skillOptions, skillQuery]);

  const groupedSkills = useMemo(() => {
    const groups = new Map<string, SkillTaxonomy[]>();
    for (const s of activeSkills) {
      const key = (s.category ?? '').trim() || 'Other';
      const arr = groups.get(key) ?? [];
      arr.push(s);
      groups.set(key, arr);
    }
    const keys = Array.from(groups.keys()).sort((a, b) => {
      if (a === 'Other') return 1;
      if (b === 'Other') return -1;
      return a.localeCompare(b);
    });
    return keys.map(k => ({ category: k, skills: groups.get(k) ?? [] }));
  }, [activeSkills]);

  const selectedSkillIds = Array.isArray(user.skills) ? user.skills : [];
  const selectedSkillNames = selectedSkillIds.map(id => skillNameById.get(id)).filter(Boolean) as string[];
  const currentRoleName = user.primaryRole ? roleNameById.get(user.primaryRole) : undefined;

  const canCreateSkill = useMemo(() => {
    const q = skillQuery.trim();
    if (!q) return false;
    const exists = (skillOptions ?? []).some(s => s.name.toLowerCase() === q.toLowerCase());
    return !exists;
  }, [skillQuery, skillOptions]);

  return (
    <Popover open={open} onOpenChange={(v) => {
      setOpen(v);
      if (v) {
        setRoleQuery('');
        setSkillQuery('');
      }
    }}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size={size === 'sm' ? 'sm' : 'icon'}
          className={cn(
            size === 'sm'
              ? 'h-8 px-2 text-xs text-muted-foreground hover:text-foreground'
              : 'h-7 w-7 text-muted-foreground hover:text-foreground'
          )}
          title="Edit role and skills"
        >
          <Tags className="h-3.5 w-3.5" />
          {size === 'sm' ? <span className="ml-1.5">Role & skills</span> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-[320px] bg-background/90 backdrop-blur border-white/10">
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Primary role</Label>
            <div className="rounded-lg border border-white/10 bg-background/40 p-2 space-y-2">
              <Input
                value={roleQuery}
                onChange={(e) => setRoleQuery(e.target.value)}
                placeholder="Type to filter roles…"
                className="h-9 bg-background/50 border-white/10"
              />
              <div className="max-h-36 overflow-y-auto space-y-1">
                <button
                  type="button"
                  className={cn(
                    'w-full text-left text-xs px-2 py-1.5 rounded-md border border-transparent hover:bg-muted/30',
                    !user.primaryRole && 'bg-muted/20'
                  )}
                  onClick={() => onSave({ primaryRole: null })}
                >
                  <span className={cn('text-muted-foreground', !user.primaryRole && 'text-foreground/80')}>
                    No role assigned
                  </span>
                </button>
                {activeRoles.map(r => (
                  <button
                    key={r.id}
                    type="button"
                    className={cn(
                      'w-full text-left text-xs px-2 py-1.5 rounded-md border border-transparent hover:bg-muted/30',
                      user.primaryRole === r.id && 'bg-muted/20'
                    )}
                    onClick={() => onSave({ primaryRole: r.id })}
                  >
                    <span className="text-foreground/90">{r.name}</span>
                  </button>
                ))}
                {activeRoles.length === 0 && (
                  <p className="text-[11px] text-muted-foreground px-2 py-1.5">No roles found.</p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Skills</Label>
            <div className="flex flex-wrap gap-1.5">
              {selectedSkillIds.length === 0 ? (
                <span className="text-xs text-muted-foreground">No skills</span>
              ) : (
                selectedSkillIds.map(id => (
                  <Badge key={id} variant="secondary" className="bg-muted/40 border border-white/10">
                    {skillNameById.get(id) ?? 'Unknown'}
                    <button
                      type="button"
                      className="ml-1.5 text-muted-foreground hover:text-foreground"
                      onClick={() => onSave({ skills: selectedSkillIds.filter(x => x !== id) })}
                      aria-label="Remove skill"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))
              )}
            </div>

            <div className="rounded-lg border border-white/10 bg-background/40 p-2 space-y-2">
              <Input
                value={skillQuery}
                onChange={(e) => setSkillQuery(e.target.value)}
                placeholder="Type to filter skills…"
                className="h-9 bg-background/50 border-white/10"
              />
              <div className="max-h-44 overflow-y-auto space-y-2">
                {groupedSkills.map(g => (
                  <div key={g.category}>
                    <p className={cn('text-[10px] uppercase tracking-wider px-2 mb-1', g.category === 'Other' ? 'text-muted-foreground/70' : 'text-muted-foreground')}>
                      {g.category}
                    </p>
                    <div className="space-y-1">
                      {g.skills.map(s => {
                        const selected = selectedSkillIds.includes(s.id);
                        return (
                          <button
                            key={s.id}
                            type="button"
                            className={cn(
                              'w-full text-left text-xs px-2 py-1.5 rounded-md hover:bg-muted/30',
                              selected && 'bg-muted/20'
                            )}
                            onClick={() => {
                              const next = selected
                                ? selectedSkillIds.filter(id => id !== s.id)
                                : [...selectedSkillIds, s.id];
                              onSave({ skills: next });
                            }}
                          >
                            <span className="text-foreground/90">{s.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {groupedSkills.length === 0 && (
                  <p className="text-[11px] text-muted-foreground px-2 py-1.5">No skills found.</p>
                )}
              </div>

              <div className="pt-1 border-t border-white/10">
                {onCreateSkill && canCreateSkill ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-muted-foreground hover:text-foreground"
                    onClick={async () => {
                      const name = skillQuery.trim();
                      if (!name) return;
                      const created = await onCreateSkill(name);
                      const next = [...selectedSkillIds, created.id];
                      onSave({ skills: next });
                      setSkillQuery('');
                    }}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    + Add skill “{skillQuery.trim()}”
                  </Button>
                ) : (
                  <p className="text-[10px] text-muted-foreground">
                    Add new skills from Settings → Taxonomy.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="text-[10px] text-muted-foreground">
              {currentRoleName ? `Role: ${currentRoleName}` : 'No role assigned'}
              {selectedSkillNames.length ? ` · Skills: ${selectedSkillNames.join(', ')}` : ''}
            </div>
            <Button variant="outline" size="sm" className="h-8" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

