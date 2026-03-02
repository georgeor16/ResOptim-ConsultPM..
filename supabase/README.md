# Supabase setup

1. **Create a project** at [supabase.com](https://supabase.com) if you don’t have one.

2. **Run the migration**  
   In the Supabase dashboard: **SQL Editor** → New query → paste the contents of `migrations/001_initial_schema.sql` → Run.

3. **Get your credentials**  
   **Project Settings** → **API**: copy **Project URL** and **anon public** key.

4. **Configure the app**  
   In the project root, copy `.env.example` to `.env` and set:
   - `VITE_SUPABASE_URL` = your Project URL  
   - `VITE_SUPABASE_ANON_KEY` = your anon key  

5. **Restart the dev server**  
   Run `npm run dev` again so env vars are picked up.

With these set, the app uses Supabase for all data; changes are saved automatically. If the env vars are not set, the app keeps using localStorage.
