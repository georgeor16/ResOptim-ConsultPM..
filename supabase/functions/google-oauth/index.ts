/**
 * google-oauth Edge Function
 *
 * Handles Google OAuth 2.0 server-side exchange to keep refresh tokens off the client.
 *
 * Actions (passed as ?action=<action> query param):
 *   auth_url  — returns the Google OAuth authorization URL for the client to redirect to
 *   exchange  — exchanges an auth code for tokens and stores them in user_google_tokens
 *   refresh   — refreshes an expired access_token using the stored refresh_token
 *   revoke    — revokes the Google token and deletes the row
 *
 * Required environment variables (set via `supabase secrets set`):
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   GOOGLE_REDIRECT_URI   — e.g. https://yourapp.com/auth/google/callback
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GOOGLE_AUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v1/userinfo';

const SCOPES = [
  'https://www.googleapis.com/auth/presentations',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive.file',
  'email',
  'profile',
].join(' ');

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

function err(message: string, status = 400) {
  return json({ error: message }, status);
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      },
    });
  }

  if (req.method !== 'POST') return err('Method not allowed', 405);

  const url = new URL(req.url);
  const action = url.searchParams.get('action');

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  const redirectUri = Deno.env.get('GOOGLE_REDIRECT_URI');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!clientId || !clientSecret || !redirectUri || !supabaseUrl || !serviceRoleKey) {
    return err('Server misconfiguration: missing environment variables', 500);
  }

  // Service-role client for writing tokens
  const adminSupabase = createClient(supabaseUrl, serviceRoleKey);

  // ── auth_url ──────────────────────────────────────────────────────────────
  if (action === 'auth_url') {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline',
      prompt: 'consent',
    });
    return json({ url: `${GOOGLE_AUTH_BASE}?${params}` });
  }

  // ── exchange ──────────────────────────────────────────────────────────────
  if (action === 'exchange') {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return err('Missing Authorization header', 401);

    // Verify the Supabase JWT to get user_id
    const userSupabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '');
    const { data: { user }, error: userErr } = await userSupabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (userErr || !user) return err('Unauthorized', 401);

    const body = await req.json() as { code?: string };
    if (!body.code) return err('Missing code');

    // Exchange auth code for tokens
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: body.code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = await tokenRes.json() as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
    };
    if (tokens.error || !tokens.access_token || !tokens.refresh_token) {
      return err(`Google token exchange failed: ${tokens.error ?? 'unknown'}`, 502);
    }

    // Fetch Google account email
    const infoRes = await fetch(`${GOOGLE_USERINFO_URL}?access_token=${tokens.access_token}`);
    const info = await infoRes.json() as { email?: string };

    const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();

    const { error: upsertErr } = await adminSupabase.from('user_google_tokens').upsert({
      user_id: user.id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
      email: info.email ?? null,
    }, { onConflict: 'user_id' });

    if (upsertErr) return err('Failed to store tokens', 500);

    return json({ email: info.email });
  }

  // ── refresh ───────────────────────────────────────────────────────────────
  if (action === 'refresh') {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return err('Missing Authorization header', 401);

    const userSupabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '');
    const { data: { user }, error: userErr } = await userSupabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (userErr || !user) return err('Unauthorized', 401);

    const { data: row, error: fetchErr } = await adminSupabase
      .from('user_google_tokens')
      .select('refresh_token')
      .eq('user_id', user.id)
      .single();

    if (fetchErr || !row) return err('No stored refresh token', 404);

    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: row.refresh_token,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
      }),
    });
    const tokens = await tokenRes.json() as {
      access_token?: string;
      expires_in?: number;
      error?: string;
    };
    if (tokens.error || !tokens.access_token) {
      return err(`Token refresh failed: ${tokens.error ?? 'unknown'}`, 502);
    }

    const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();

    await adminSupabase.from('user_google_tokens').update({
      access_token: tokens.access_token,
      expires_at: expiresAt,
    }).eq('user_id', user.id);

    return json({ ok: true });
  }

  // ── revoke ────────────────────────────────────────────────────────────────
  if (action === 'revoke') {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return err('Missing Authorization header', 401);

    const userSupabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '');
    const { data: { user }, error: userErr } = await userSupabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (userErr || !user) return err('Unauthorized', 401);

    const { data: row } = await adminSupabase
      .from('user_google_tokens')
      .select('access_token')
      .eq('user_id', user.id)
      .single();

    if (row?.access_token) {
      // Best-effort revoke with Google
      await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(row.access_token)}`, {
        method: 'POST',
      }).catch(() => {});
    }

    await adminSupabase.from('user_google_tokens').delete().eq('user_id', user.id);

    return json({ ok: true });
  }

  return err('Unknown action', 400);
});
