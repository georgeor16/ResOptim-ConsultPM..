import type { ProjectCategory } from './types';

export interface PhaseTemplate {
  name: string;
  durationWeeks: number;
  ftePercent: number;
}

export interface TeamRequirement {
  role: string; // e.g. "Senior Advisor or above", "Advisor"
  label: string; // "lead" | "contributor"
}

export interface CategoryTemplate {
  category: ProjectCategory;
  timelineWeeks: number;
  phases: PhaseTemplate[];
  minimumTeam: TeamRequirement[];
  isFixed: boolean; // true = built-in, false = admin-configured
}

// Fixed templates (Scouting has no template; use manual phases or add custom in Settings)
export const FIXED_TEMPLATES: CategoryTemplate[] = [
  {
    category: 'Full Report' as ProjectCategory,
    timelineWeeks: 6,
    phases: [
      { name: 'Briefing', durationWeeks: 1, ftePercent: 25 },
      { name: 'Research & Data Collection', durationWeeks: 2, ftePercent: 50 },
      { name: 'Draft Writing', durationWeeks: 2, ftePercent: 75 },
      { name: 'Review & Delivery', durationWeeks: 1, ftePercent: 50 },
    ],
    minimumTeam: [
      { role: 'Senior Advisor or above', label: 'lead' },
      { role: 'Advisor', label: 'contributor' },
    ],
    isFixed: true,
  },
  {
    category: 'Light Report' as ProjectCategory,
    timelineWeeks: 3,
    phases: [
      { name: 'Scoping', durationWeeks: 0.5, ftePercent: 25 },
      { name: 'Research & Draft', durationWeeks: 2, ftePercent: 50 },
      { name: 'Review & Delivery', durationWeeks: 0.5, ftePercent: 50 },
    ],
    minimumTeam: [
      { role: 'Advisor or above', label: 'lead' },
    ],
    isFixed: true,
  },
  {
    category: 'Event' as ProjectCategory,
    timelineWeeks: 10,
    phases: [
      { name: 'Concept & Planning', durationWeeks: 2, ftePercent: 30 },
      { name: 'Outreach & Logistics', durationWeeks: 4, ftePercent: 60 },
      { name: 'Content Preparation', durationWeeks: 2, ftePercent: 50 },
      { name: 'Execution', durationWeeks: 1, ftePercent: 100 },
      { name: 'Post-Event Wrap-up', durationWeeks: 1, ftePercent: 25 },
    ],
    minimumTeam: [
      { role: 'Director or above', label: 'lead' },
      { role: 'Any', label: 'contributor' },
      { role: 'Any', label: 'contributor' },
    ],
    isFixed: true,
  },
];

const CUSTOM_TEMPLATES_KEY = 'consulting_pm_custom_templates';

export function loadCustomTemplates(): CategoryTemplate[] {
  const raw = localStorage.getItem(CUSTOM_TEMPLATES_KEY);
  if (raw) {
    try { return JSON.parse(raw); } catch { /* ignore */ }
  }
  return [];
}

export function saveCustomTemplates(templates: CategoryTemplate[]): void {
  localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(templates));
}

export function getTemplateForCategory(category: ProjectCategory): CategoryTemplate | null {
  const fixed = FIXED_TEMPLATES.find(t => t.category === category);
  if (fixed) return fixed;
  const custom = loadCustomTemplates().find(t => t.category === category);
  return custom || null;
}
