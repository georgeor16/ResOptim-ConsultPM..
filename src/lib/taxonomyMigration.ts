import type { AppData, Organisation, RoleTaxonomy, SkillTaxonomy, User } from './types';
import { logAuditEvent } from './auditTrail';

function nowIso(): string {
  return new Date().toISOString();
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function genId(): string {
  return crypto.randomUUID();
}

type LegacyTaxonomyLabel = { id: string; label: string; archived?: boolean };

function getPrimaryOrg(data: AppData): Organisation {
  const existing = data.organisations?.[0];
  if (existing) return existing;
  const org: Organisation = { id: 'org-1', name: 'Organisation' };
  data.organisations = [org];
  return org;
}

/** One-time migration: enforce ID-based references, without inferring/guessing from old labels. */
export function migrateRoleSkillTaxonomy(data: AppData): { data: AppData; changed: boolean } {
  let changed = false;
  const out: AppData = { ...data };

  const org = getPrimaryOrg(out);
  const orgId = org.id;

  // Legacy fields may still exist on org from older builds. Remove them (we do not infer).
  const legacyRoleTax = (org as unknown as { roleTaxonomy?: LegacyTaxonomyLabel[] }).roleTaxonomy ?? [];
  const legacySkillTax = (org as unknown as { skillTaxonomy?: LegacyTaxonomyLabel[] }).skillTaxonomy ?? [];

  const roles: RoleTaxonomy[] = Array.isArray(out.roles) ? [...out.roles] : [];
  const skills: SkillTaxonomy[] = Array.isArray(out.skills) ? [...out.skills] : [];

  const roleIdSet = new Set(roles.filter(r => r.orgId === orgId).map(r => r.id));
  const skillIdSet = new Set(skills.filter(s => s.orgId === orgId).map(s => s.id));

  const nextUsers: User[] = (out.users ?? []).map((u) => {
    let next = u;
    let userChanged = false;

    // primaryRole must be a valid RoleTaxonomy.id or null
    if (u.primaryRole && typeof u.primaryRole === 'string' && !roleIdSet.has(u.primaryRole)) {
      const legacyValue = u.primaryRole;
      next = { ...next, primaryRole: null, updatedAt: nowIso() };
      userChanged = true;
      try {
        logAuditEvent({
          orgId,
          type: 'taxonomy_role_renamed', // reusing existing type; stored message clarifies "cleared legacy"
          message: `Cleared legacy role value "${legacyValue}" for ${u.name} (requires human assignment).`,
          meta: { userId: u.id, legacyRoleValue: legacyValue },
        });
      } catch {
        // ignore
      }
    }

    // skills must be valid SkillTaxonomy.id[]; unknown entries are cleared (preserve in audit meta)
    if (Array.isArray(u.skills) && u.skills.length > 0) {
      const unknown = u.skills.filter(id => typeof id === 'string' && !skillIdSet.has(id));
      const kept = u.skills.filter(id => typeof id === 'string' && skillIdSet.has(id));
      if (unknown.length > 0) {
        next = { ...next, skills: kept, updatedAt: nowIso() };
        userChanged = true;
        try {
          logAuditEvent({
            orgId,
            type: 'taxonomy_skill_renamed',
            message: `Cleared ${unknown.length} legacy skill value(s) for ${u.name} (requires human assignment).`,
            meta: { userId: u.id, legacySkillValues: unknown },
          });
        } catch {
          // ignore
        }
      }
    }

    // Ensure empty states exist
    if (!next.skills) {
      next = { ...next, skills: [] };
      userChanged = true;
    }
    if (next.primaryRole === undefined) {
      next = { ...next, primaryRole: null };
      userChanged = true;
    }

    if (userChanged) changed = true;
    return next;
  });

  out.users = nextUsers;
  out.roles = roles;
  out.skills = skills;

  // Best-effort remove legacy fields so we don't keep re-reading them.
  if (legacyRoleTax.length > 0 || legacySkillTax.length > 0) {
    try {
      delete (org as unknown as { roleTaxonomy?: unknown }).roleTaxonomy;
      delete (org as unknown as { skillTaxonomy?: unknown }).skillTaxonomy;
      changed = true;
    } catch {
      // ignore
    }
  }

  return { data: out, changed };
}

