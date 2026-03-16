# FTE % & Bandwidth — Feature Doc

_Last updated: 2026-03-15_

---

## Overview
Core allocation engine. Tracks FTE% per member per project and warns on overallocation.

## Behaviour
- Duration unit dropdown with automatic FTE% derivation
- Month as base unit
- Multi-period FTE% view toggle (Week/Month/Quarter/Half Year/Year)
- Warning thresholds: green <75%, amber 75–89%, orange 90–99%, red/pulsing 100%+
- Task completion marking with automatic FTE% release

## Status
**Stage:** MVP done
Core FTE% allocation and overallocation warnings working end-to-end. Multi-period view toggle (Week/Month/Quarter/Half Year/Year) and automatic FTE% derivation from task duration still in progress.
