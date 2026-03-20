# Google Export Setup Guide

_Last updated: 2026-03-19_

One-time deployment setup for the Google Slides + Google Docs export integration.
Code is fully implemented — this guide covers the infrastructure steps to make it live.

---

## Prerequisites

- `supabase` CLI installed and logged in (`supabase login`)
- Your Supabase project ref (Settings → General in the Supabase dashboard)
- Your app's public URL (e.g. `https://yourapp.vercel.app`)

---

## Step 1 — Create the GCP Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click the project selector (top-left) → **New Project**
3. Name it (e.g. `mtb-pm-tool`) → **Create**
4. Select the new project from the selector once created

---

## Step 2 — Enable the Required APIs

In GCP Console → **APIs & Services → Library**, search for and enable each:

| API | Search term |
|---|---|
| Google Slides API | `Slides` |
| Google Docs API | `Docs` |
| Google Drive API | `Drive` |

Click each result → **Enable**. Wait for each before enabling the next.

---

## Step 3 — Configure the OAuth Consent Screen

1. Go to **APIs & Services → OAuth consent screen**
2. User type: **Internal** (for Google Workspace org — recommended for internal tool)
   - If no Google Workspace: choose **External** and add test user emails
3. Fill in:
   - App name: `Mind the Bridge PM`
   - User support email: your email
   - Developer contact email: your email
4. **Save and Continue**
5. On the **Scopes** screen → **Add or Remove Scopes** → add:
   - `https://www.googleapis.com/auth/presentations`
   - `https://www.googleapis.com/auth/documents`
   - `https://www.googleapis.com/auth/drive.file`
   - `email`
   - `profile`
6. **Update → Save and Continue → Back to Dashboard**

---

## Step 4 — Create OAuth 2.0 Credentials

1. **APIs & Services → Credentials → + Create Credentials → OAuth client ID**
2. Application type: **Web application**
3. Name: `MtB PM Export`
4. Under **Authorized redirect URIs** → **+ Add URI**:
   - `https://yourapp.vercel.app/` (production — trailing slash matters)
   - `http://localhost:5173/` (local development)
5. **Create** → copy the **Client ID** and **Client Secret** (save securely)

---

## Step 5 — Set Supabase Secrets

Link your CLI to the project (if not already):
```bash
supabase link --project-ref <your-project-ref>
```

Set the four secrets:
```bash
supabase secrets set GOOGLE_CLIENT_ID=<paste-client-id>
supabase secrets set GOOGLE_CLIENT_SECRET=<paste-client-secret>
supabase secrets set GOOGLE_REDIRECT_URI=https://yourapp.vercel.app/
supabase secrets set GOOGLE_OAUTH_FUNCTION_URL=https://<your-project-ref>.supabase.co/functions/v1/google-oauth
```

Verify:
```bash
supabase secrets list
# Should show all four keys (values hidden)
```

---

## Step 6 — Run the Database Migration

Push migration `013_google_oauth_tokens.sql`:
```bash
supabase db push
```

Verify in Supabase dashboard → **Table Editor** → `user_google_tokens` exists with columns: `user_id`, `access_token`, `refresh_token`, `expires_at`, `email`.

Check **Authentication → Policies** → `user_google_tokens` has policy: `users can manage own google tokens`.

---

## Step 7 — Deploy Edge Functions

```bash
supabase functions deploy google-oauth
supabase functions deploy google-export
```

Verify: Supabase dashboard → **Edge Functions** → both show **Active**.

Quick reachability check (should return `{"error":"Method not allowed"}`):
```bash
curl -X GET https://<your-project-ref>.supabase.co/functions/v1/google-oauth
```

---

## Step 8 — Smoke Test

1. Open the app in the browser
2. Open any Gantt export panel
3. Select **Google Slides** format
4. Click **Connect Google Account** → Google consent screen appears
5. Approve → redirected back → panel shows connected email
6. Click **Export** → Google Slides presentation opens in a new tab with the Gantt chart + allocation table

---

## Verification Checklist

- [ ] GCP project created; Slides API, Docs API, Drive API all enabled
- [ ] OAuth consent screen: Internal, correct scopes added
- [ ] OAuth credentials: redirect URIs include prod URL + `localhost:5173`
- [ ] `supabase secrets list` shows all four secrets
- [ ] `user_google_tokens` table visible in Table Editor
- [ ] RLS policy `users can manage own google tokens` present
- [ ] Both Edge Functions show Active in Supabase dashboard
- [ ] End-to-end smoke test passes

---

## Relevant Source Files

| File | Purpose |
|---|---|
| `supabase/functions/google-oauth/index.ts` | OAuth exchange/refresh/revoke |
| `supabase/functions/google-export/index.ts` | Slides/Docs/Drive API calls |
| `supabase/migrations/013_google_oauth_tokens.sql` | Token storage table + RLS |
| `src/lib/googleAuth.ts` | Frontend OAuth helpers |
| `src/lib/ganttExportGoogle.ts` | Export orchestration |
| `src/components/GanttExportPanel.tsx` | Export UI panel |
