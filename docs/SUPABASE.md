# Setting up the Supabase backend

Without these steps the app runs in **demo mode**, where data stays in one browser. Follow them once to turn on real accounts, the shared feed, hearts and comments. It takes about 15 minutes, and everything here is on Supabase's free plan.

> **Already set up before late November 2026?** Run any of these update scripts you haven't yet, in the SQL Editor (all safe to run again): [`hardening.sql`](../supabase/hardening.sql), [`admin.sql`](../supabase/admin.sql), [`seasons.sql`](../supabase/seasons.sql) (seasons and group challenges), [`issues.sql`](../supabase/issues.sql) (Report an issue). Then do steps 7 and 8 below if you haven't already.
>
> **Phone notifications** need a few extra one-time steps: see [PUSH.md](PUSH.md).

## 1. Create a project

1. Sign up at <https://supabase.com> (GitHub login is easiest) and click **New project**.
2. Name it (e.g. `bluies-finest`), set a database password (save it somewhere) and pick the nearest region.
3. Wait a minute until it says it's ready.

## 2. Create the database

1. Go to **SQL Editor → New query**.
2. Paste in **all** of [`supabase/schema.sql`](../supabase/schema.sql) and click **Run**. You should see "Success. No rows returned".

This creates every table, security rule, invite-code sign-up, photo storage, server-side scoring and admin access. It's safe to run again.

## 3. Copy your URL and key

Go to **Project Settings → API Keys** (the URL is under **Data API**) and copy:
- the **Project URL**, e.g. `https://abcdefgh.supabase.co`
- the **publishable** key, `sb_publishable_…` (older projects call it the *anon / public* key)

The publishable key is designed to be public, because the database rules protect the data. **Never** put the **secret** key (`sb_secret_…`, formerly `service_role`) in the app or on GitHub, because it bypasses all security.

## 4. Connect the app

**On GitHub:** open the repo → **Settings → Secrets and variables → Actions** and add two repository secrets:
- `VITE_SUPABASE_URL`: your project URL
- `VITE_SUPABASE_ANON_KEY`: your publishable key (the name says "anon", but put the publishable key here)

Then push a commit, or re-run the deploy from the **Actions** tab, to rebuild the site with them.

**Locally (optional):** copy `.env.example` to `.env.local`, fill in the same two values, and restart `npm run dev`.

## 5. Tell Supabase where the app lives

Open **Authentication → URL Configuration**:
- **Site URL:** `https://hangboarding.github.io/bluies-finest/`. Include the trailing slash.
- **Redirect URLs:** add `https://hangboarding.github.io/bluies-finest/**` and `http://localhost:5173/**`.

## 6. Make password-reset links work on any device

This change makes reset links open correctly even in a different browser from the one that asked for them, for example when someone requests a reset from the installed app and opens the email in Safari.

Open **Authentication → Emails → Templates → Reset Password** and change the link to:

```html
<a href="{{ .SiteURL }}?token_hash={{ .TokenHash }}&type=recovery#reset">Reset your password</a>
```

## 7. Send emails (confirmations and password resets)

Supabase's built-in email sender only delivers to members of your Supabase team, a few times an hour, so your friends wouldn't get anything. Use a free Gmail account as the sender instead:

1. Create a Gmail account for the app.
2. Turn on 2-Step Verification for that account.
3. Create an **app password** at <https://myaccount.google.com/apppasswords>.
4. In Supabase, open **Authentication → Emails → SMTP Settings**, turn on custom SMTP, and enter:

| Field | Value |
|---|---|
| Sender email | the Gmail address |
| Sender name | `Bluies Finest` |
| Host | `smtp.gmail.com` |
| Port | `465` |
| Username | the Gmail address |
| Password | the 16-character app password |

5. Optionally raise the email limit under **Authentication → Rate Limits**.

If you own a domain, a service like Resend also works. Leave **Confirm email** turned on (Authentication → Sign In / Providers → Email). On that same page, set **Minimum password length** to **8** to match the app.

## 8. Make yourself admin

Sign up in the app first, then run this in the SQL Editor with your email:

```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'you@example.com');
```

Reload the app. **Profile → Admin tools** now lets you manage invite codes, see members, and remove sessions or comments. Nobody can make themselves admin from the app.

## Invite codes

Nobody can sign up without a valid code. A new project starts with one code, `BLUIES`, which has unlimited uses. **Change it straight away:** that code is visible in the public repo. Manage codes from **Profile → Admin tools**:
- add a code, optionally with a use limit (e.g. 1 for a single person)
- change a code's limit
- copy or delete a code

Codes aren't case-sensitive when people sign up.

## Good to know

- **Free projects pause** after about a week with no activity. If the app stops loading, open the Supabase dashboard and click **Restore project**. No data is lost.
- **Removing someone completely:** delete them in **Authentication → Users**. Their sessions, hearts, comments and private data go with them. Also delete their folder in **Storage → avatars**.
- **Backups:** the free plan doesn't include downloadable backups. Use **Profile → Admin tools → Back up everything** every month or so. Each member can also download their own data from Profile.
- **Updates:** Dependabot opens pull requests on GitHub when dependencies have updates. The tests run on each one automatically; merge it if they pass.
