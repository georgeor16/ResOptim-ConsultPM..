import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

export default function Login() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Redirect if already authenticated
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate('/', { replace: true });
    });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setLoading(true);
    setError(null);
    setInfo(null);

    if (mode === 'signin') {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) {
        setError(authError.message);
        setLoading(false);
      }
      // On success, onAuthStateChange in AuthContext handles the redirect
    } else {
      const { error: authError } = await supabase.auth.signUp({ email, password });
      if (authError) {
        const isLeakedPassword = authError.message.toLowerCase().includes('commonly used password')
          || authError.message.toLowerCase().includes('leaked');
        setError(
          isLeakedPassword
            ? 'This password has appeared in a data breach. Please choose a different password.'
            : authError.message
        );
      } else {
        setInfo('Account created. Check your email to confirm, or sign in now if email confirmation is disabled.');
        setMode('signin');
      }
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setMode(m => m === 'signin' ? 'signup' : 'signin');
    setError(null);
    setInfo(null);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8 rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-sm font-bold text-primary-foreground">PM</span>
          </div>
          <div>
            <p className="text-sm font-semibold">ConsultPM</p>
            <p className="text-xs text-muted-foreground">Resource Manager</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <h2 className="text-base font-semibold">
            {mode === 'signin' ? 'Sign in to your account' : 'Create an account'}
          </h2>

          <div className="space-y-1">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {info && <p className="text-sm text-muted-foreground">{info}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-opacity"
          >
            {loading
              ? mode === 'signin' ? 'Signing in…' : 'Creating account…'
              : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button
            type="button"
            onClick={toggleMode}
            className="underline underline-offset-2 hover:text-foreground transition-colors"
          >
            {mode === 'signin' ? 'Create one' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}
