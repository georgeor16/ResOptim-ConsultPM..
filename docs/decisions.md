# Decision Log — MtB PM Tool

_Last updated: 2026-03-13_
_Log every meaningful architectural or product decision here. Include tradeoffs._

---

## Template

### [Decision title]
- **Date:**
- **What:** 
- **Why:** 
- **Tradeoffs:** 
- **Alternatives considered:** 

---

## Decisions

### Gantt chart is read-only
- **Date:** 2026-03-13
- **What:** Gantt chart is a read-only mirror of Tasks by Phase data
- **Why:** Keeps editing surfaces consolidated in one place, prevents data conflicts
- **Tradeoffs:** Users cannot edit directly from Gantt view
- **Alternatives considered:** Bidirectional Gantt editing — rejected to keep architecture clean

### Documentation lives in Git repo
- **Date:** 2026-03-13
- **What:** All technical docs stored as markdown in /docs, synced to Notion via GitHub Action
- **Why:** Docs version-control alongside code, no extra tooling needed
- **Tradeoffs:** Notion is always slightly behind Git (syncs on push only)
- **Alternatives considered:*aser.io, Notion-native docs — rejected to keep everything in one repo
