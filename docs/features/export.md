# Export — Feature Doc

_Last updated: 2026-03-19_

---

## Overview
Export project data in multiple formats with granular filters.

## Formats

| Format | Status | Notes |
|---|---|---|
| PDF | ✅ Done | jsPDF + html2canvas, landscape A4 |
| PNG | ✅ Done | html2canvas @2x scale |
| Google Slides | ✅ Done | Chart screenshot + allocation table via Slides API |
| Google Docs | ✅ Done | Chart image + allocation table via Docs API |
| CSV | ❓ Open | Not yet decided |

## Granular Filters
- Time period: this week / this month / this quarter / this half year / this year / custom range
- Projects (multi-select checkbox)
- Team members (multi-select checkbox)
- Clients (multi-select checkbox)
- Content toggles: FTE % data, member names, financial/margin data, bandwidth overlay, unscheduled tasks

## Google Slides / Docs — OAuth Flow

Authentication uses Google OAuth 2.0 with server-side token exchange (keeps refresh tokens off the client).

### Setup requirements (one-time per environment)
1. Create a Google Cloud project
2. Enable: Google Slides API, Google Docs API, Google Drive API
3. Configure OAuth consent screen (internal, scopes: `presentations`, `documents`, `drive.file`)
4. Create OAuth 2.0 credentials → set `GOOGLE_REDIRECT_URI` to `<app-url>/` (or your callback path)
5. Store secrets in Supabase:
   ```
   supabase secrets set GOOGLE_CLIENT_ID=...
   supabase secrets set GOOGLE_CLIENT_SECRET=...
   supabase secrets set GOOGLE_REDIRECT_URI=...
   supabase secrets set GOOGLE_OAUTH_FUNCTION_URL=<supabase-functions-url>/google-oauth
   ```

### Runtime flow
1. User selects Google Slides or Docs format in export panel
2. If not connected → "Connect Google Account" button → redirects to Google consent screen
3. Google redirects back to the app with `?code=` param
4. `GanttExportPanel` detects the callback and calls `handleGoogleOAuthCallback(code)` → Edge Function exchanges code for tokens, stores in `user_google_tokens`
5. Panel shows connected email + "Disconnect" button
6. On Export: chart captured as PNG via html2canvas, allocation table built from filtered data, both sent to `google-export` Edge Function
7. Edge Function auto-refreshes token if within 60s of expiry
8. Returns file URL → opens in new browser tab

### Export content
- **Slide 1 / Doc start**: Title text box (export title + period label)
- **Image**: Gantt chart screenshot (480pt wide)
- **Table**: Member | Project | FTE % | Period (up to 19 data rows + header)
- When appending to existing file: new slide added / content appended after last element

## Files
- `src/components/GanttExportPanel.tsx` — UI panel with OAuth connect/disconnect + export trigger
- `src/lib/googleAuth.ts` — OAuth initiation, callback handling, connection status
- `src/lib/ganttExportGoogle.ts` — `exportGanttToSlides`, `exportGanttToDocs`, `buildExportTableData`
- `src/lib/ganttExportRun.ts` — PDF/PNG export (reused for chart capture)
- `src/lib/ganttExport.ts` — config, filters, period presets
- `supabase/functions/google-oauth/index.ts` — OAuth exchange/refresh/revoke Edge Function
- `supabase/functions/google-export/index.ts` — Slides/Docs creation Edge Function
- `supabase/migrations/013_google_oauth_tokens.sql` — `user_google_tokens` table + RLS

## Open Questions
- CSV export in scope?
