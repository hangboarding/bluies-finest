# Setting up the Supabase backend

Without these steps the app runs in **demo mode** (data stays in one browser).
Follow them once to turn on real accounts, the shared feed, likes and comments.
It takes about 15 minutes and everything here is on Supabase's free plan.

## 1. Create a free Supabase project

1. Go to <https://supabase.com> and sign up (GitHub login is easiest).
2. Click **New project**. Pick any name (e.g. `bluies-finest`), set a database
   password (save it somewhere, you rarely need it), choose the region closest
   to you, and click **Create new project**.
3. Wait a minute or two until the dashboard says the project is ready.

## 2. Create the database tables

1. In the left sidebar open **SQL Editor** and click **New query**.
2. Open `supabase/schema.sql` from this repo, copy **all** of it, paste it in.
3. Click **Run**. You should see "Success. No rows returned".

It is safe to run the file again later (for example after an update to it).

## 3. Copy your project URL and key

1. In the sidebar open **Project Settings -> API** (in newer dashboards: **Project Settings -> API Keys**,
   and the URL is under **Data API**).
2. Copy the **Project URL** (looks like `https://abcdefgh.supabase.co`).
3. Copy the **publishable** key (starts with `sb_publishable_`). Older projects call
   this the **anon / public** key — either works. It's designed to be public; the
   database rules protect your data. **Never** use the **secret** key
   (`sb_secret_…`, formerly `service_role`) in the app — it bypasses all security.
   The variable is still named `VITE_SUPABASE_ANON_KEY`; put the publishable key in it.

## 4. Use them locally

1. In the project folder, copy `.env.example` to a new file called `.env.local`.
2. Fill it in:

   ```
   VITE_SUPABASE_URL=https://abcdefgh.supabase.co
   VITE_SUPABASE_ANON_KEY=sb_publishable_...
   ```

3. Restart `npm run dev`. The app now uses Supabase instead of demo mode.
   (`.env.local` is not committed to git.)

## 5. Use them on GitHub Pages

1. On GitHub open your repo -> **Settings -> Secrets and variables -> Actions**.
2. Click **New repository secret** twice and add:
   - Name `VITE_SUPABASE_URL`, value = your Project URL
   - Name `VITE_SUPABASE_ANON_KEY`, value = your publishable key
3. Re-run the deploy workflow (or push a commit) so the site is rebuilt with them.

## 6. Tell Supabase where the app lives

Emails (confirm account, reset password) link back to your site, so Supabase
must know its address.

1. Open **Authentication -> URL Configuration**.
2. **Site URL**: your GitHub Pages address, e.g. `https://yourname.github.io/hangleaderboard/`
3. Under **Redirect URLs** click **Add URL** and add:
   - `https://yourname.github.io/hangleaderboard/**`
   - `http://localhost:5173/**` (so links also work while developing)
4. Click **Save**.

Tip: password-reset and confirmation links work best when opened in the same
browser the request was made from.

### About email confirmation

By default Supabase makes new users click a link in an email before they can
sign in. That's the safer choice, so we recommend leaving it on. If you ever
want to turn it off, it is under **Authentication -> Sign In / Providers -> Email -> Confirm email**.
**Important:** Supabase's built-in email sender is only for testing. It sends
very few emails per hour and may only deliver to addresses of people on your
Supabase team. For friends to receive confirmation and password-reset emails,
set up a free email sender (e.g. Resend or Brevo) under **Authentication ->
Emails -> SMTP Settings**. Without it, the "confirm email" and "forgot
password" emails may never arrive.

## 7. Invite codes

Nobody can sign up without a valid invite code. The setup script creates one
code, **`BLUIES`**, with unlimited uses. Codes are not case-sensitive.

**See your codes and how often they've been used:** open **Table Editor ->
invite_codes**. (Only you can see this table; the app can't read it.)

**Change the code** (e.g. if `BLUIES` leaks) - in the SQL Editor run:

```sql
update public.invite_codes set code = 'NEWCODE' where code = 'BLUIES';
```

**Add a code for one person** (works once):

```sql
insert into public.invite_codes (code, max_uses) values ('FORSAM', 1);
```

**Switch a code off:**

```sql
update public.invite_codes set max_uses = uses where code = 'BLUIES';
```

Use capital letters when typing codes into SQL.

## 8. Make yourself admin

Admins can delete anyone's sessions or comments. First sign up in the app,
then in the SQL Editor run (with your email):

```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'you@example.com');
```

Sign out and back in (or reload) to see admin controls. Users can never make
themselves admin from the app.

## Handy extras

- **See who has signed up:** **Authentication -> Users**.
- **Remove someone completely:** delete them in **Authentication -> Users**.
  All their sessions, likes, comments and private data are removed with them.
  (Their avatar picture stays in **Storage -> avatars**; delete their folder there too.)
- **Free projects pause** after about a week with no activity. If the app stops
  working, open the Supabase dashboard and click **Restore project**.
