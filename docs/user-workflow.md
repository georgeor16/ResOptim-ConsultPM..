# CLAUDE.md — Working Instructions for This Repo

This file is read by Claude Code at the start of every session. Follow these instructions consistently.

---

## Project Overview

**Name:** Mind the Bridge — Internal Resource Optimization & PM Tool  
**Stack:** Cursor + Claude Code + Supabase + Git  
**Purpose:** Internal tool for the MtB consulting team covering project management, resource allocation, and bandwidth planning.

---

## Core Features (current)

- FTE% allocation per team member per project
- Bandwidth warnings (overallocation detection)
- Gantt chart view (project timelines)
- Scheduling Assistant
- Per-member calendar profiles
- Export functionality

---

## Documentation Workflow — Follow This Every Session

### Start of session
When the user describes what they are about to build, do the following:
1. Read `/docs/architecture.md` and the relevant file in `/docs/features/`
2. Generate a **stub** outlining what will likely change and what decisions need to be made
3. Flag any conflicts or risks with the existing architecture

### At each commit
When the user describes what they just built (or pastes a commit message/diff), do the following:
1. Update `/docs/architecture.md` if the system structure changed
2. Update the relevant `/docs/features/*.md` file
3. Update `/docs/supabase-schema.md` if any tables, columns, or relationships changed
4. Log the decision in `/docs/decisions.md` if a meaningful architectural or product choice was made
5. Update `/docs/user-workflow.md` to reflect any new or changed user-facing behaviour
6. Commit the updated docs **alongside the code** — never separately

### After each new feature
Always run this prompt in Claude Code after completing any feature:
> "Update docs/user-workflow.md to include [feature name]."

This keeps the onboarding map current for future team members. Never skip this step.

### End of session
When the user says "end of session" or "wrap up":
1. Do a full review pass of all `/docs` files
2. Flag anything that is stale or inconsistent with the current codebase
3. Check `/docs/user-workflow.md` — does it reflect everything a new team member would need to understand the platform?
4. Output a short **session summary** (3–5 bullets) ready to paste into Notion

---

## Docs Structure

```
/docs
├── architecture.md        ← system overview, component map, data flow
├── supabase-schema.md     ← tables, columns, relationships, RLS rules
├── user-workflow.md       ← user journey + system flow — update every feature
├── decisions.md           ← key decisions log (what, why, tradeoffs)
├── session-summaries.md   ← end of session summaries
└── features/
    ├── gantt.md
    ├── scheduling-assistant.md
    ├── fte-bandwidth.md
    ├── calendar-profiles.md
    └── export.md
```

---

## Prompts to Use

**Start of session:**
> "I'm about to build [X]. Based on /docs/architecture.md, generate a stub for what will change and what decisions I'll need to make."

**At each commit:**
> "I just built [X — brief description or paste commit message]. Update the relevant docs."

**After each new feature:**
> "Update docs/user-workflow.md to include [feature name]."

**End of session:**
> "End of session. Review /docs, check user-workflow.md is current, and give me a summary to push to Notion."

---

## Notion Sync

Notion is the **stakeholder-facing layer**, not the working layer. The Git repo is the real-time source of truth. Notion pages auto-sync via GitHub Action on every push to main that includes a /docs change.

---

## Rules

- Never document at the end of a session without a review pass first
- Always commit docs alongside code — never in a separate commit
- Supabase schema changes must be reflected in `/docs/supabase-schema.md` immediately — this one cannot slip
- user-workflow.md must be updated after every new feature — this is the onboarding map for new team members
- Keep `/docs/decisions.md` honest — include tradeoffs, not just what was chosen