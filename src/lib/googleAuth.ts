/**
 * Google OAuth helpers — frontend side.
 *
 * All token exchange and storage happens server-side via the google-oauth
 * Supabase Edge Function. The client only handles:
 *  1. Redirecting the user to Google's consent page
 *  2. Passing the returned auth code to the Edge Function
 *  3. Querying connection status from user_google_tokens via Supabase
 */

import { supabase } from './supabase';

const OAUTH_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-oauth`;

/** OAuth state key stored in sessionStorage to survive the redirect round-trip. */
const OAUTH_STATE_KEY = 'google_oauth_pending';

export interface GoogleConnectionStatus {
  connected: boolean;
  email: string | null;
}

async function getAuthHeader(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session ? `Bearer ${data.session.access_token}` : null;
}

/**
 * Initiates Google OAuth by fetching the authorization URL from the Edge
 * Function and redirecting the browser to Google's consent screen.
 */
export async function initiateGoogleOAuth(): Promise<void> {
  const authHeader = await getAuthHeader();
  if (!authHeader) throw new Error('Not authenticated with Supabase');

  const res = await fetch(`${OAUTH_FN_URL}?action=auth_url`, {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Failed to get OAuth URL');

  const { url } = await res.json() as { url: string };
  // Mark session so the callback page knows to handle the code
  sessionStorage.setItem(OAUTH_STATE_KEY, '1');
  window.location.href = url;
}

/**
 * Called on the OAuth callback page (or after redirect returns with ?code=).
 * Passes the auth code to the Edge Function to exchange for tokens.
 */
export async function handleGoogleOAuthCallback(code: string): Promise<{ email: string | null }> {
  const authHeader = await getAuthHeader();
  if (!authHeader) throw new Error('Not authenticated with Supabase');

  const res = await fetch(`${OAUTH_FN_URL}?action=exchange`, {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? 'OAuth exchange failed');
  }

  sessionStorage.removeItem(OAUTH_STATE_KEY);
  return res.json() as Promise<{ email: string | null }>;
}

/**
 * Checks whether the current user has a connected Google account.
 * Reads directly from user_google_tokens via Supabase (RLS-scoped).
 */
export async function getGoogleConnectionStatus(): Promise<GoogleConnectionStatus> {
  if (!supabase) return { connected: false, email: null };

  const { data, error } = await supabase
    .from('user_google_tokens')
    .select('email')
    .maybeSingle();

  if (error || !data) return { connected: false, email: null };
  return { connected: true, email: data.email ?? null };
}

/**
 * Revokes the Google connection: tells the Edge Function to revoke the token
 * with Google and delete the row from user_google_tokens.
 */
export async function revokeGoogleConnection(): Promise<void> {
  const authHeader = await getAuthHeader();
  if (!authHeader) throw new Error('Not authenticated with Supabase');

  await fetch(`${OAUTH_FN_URL}?action=revoke`, {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
  });
}

/**
 * Returns true if the current URL contains a Google OAuth callback code
 * and we initiated the flow (session marker is set).
 */
export function isGoogleOAuthCallback(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.has('code') && sessionStorage.getItem(OAUTH_STATE_KEY) === '1';
}

/**
 * Extracts the OAuth code from the current URL's search params.
 */
export function getOAuthCodeFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('code');
}
