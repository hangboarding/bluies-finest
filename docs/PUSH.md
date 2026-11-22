# Setting up phone notifications

Once this is set up, members can get a notification on their phone when someone hearts or comments on one of their sessions, even while the app is closed. For example: "Mika ❤️ hearted your Max Hangs" or "Priya commented on your Repeaters: “Strong effort!”". Tapping it opens the app on that post in **Activity**. Nobody gets notified about their own hearts or comments.

You only need to do this once. It takes about 20 minutes and is free. You need the Supabase backend working first (see [SUPABASE.md](SUPABASE.md)), and [Node.js](https://nodejs.org) installed for the `npx` commands. Run them in **PowerShell** or **Windows Terminal**, inside the project folder.

How it works: when someone hearts or comments, a Supabase **Database Webhook** calls a small server function called `notify`, which looks up whose session it was and sends the notification to their phone.

## 1. Make your notification keys (VAPID keys)

These keys prove the notifications come from your app.

```powershell
npx web-push generate-vapid-keys
```

It prints a **Public Key** and a **Private Key**. Keep this window open, or paste both into a password manager.

- The **public** key is safe to share. It goes into the app (step 7) and Supabase (step 3).
- The **private** key is secret. It goes **only** into Supabase (step 3). Never put it on GitHub, in `.env` files, or in a chat.

If you ever lose or leak the private key, make a new pair and repeat steps 3 and 7. Everyone will then need to turn notifications off and on again.

## 2. Make a webhook secret

This is a password that stops strangers from calling your `notify` function. Make up a long random string of letters and numbers (30 or more characters), or generate one in PowerShell:

```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 40 | ForEach-Object { [char]$_ })
```

Save it with your keys. You'll paste it in steps 3 and 6.

## 3. Add the secrets to Supabase

In the Supabase dashboard, open **Edge Functions → Secrets** and add these four:

| Name | Value |
|---|---|
| `VAPID_PUBLIC_KEY` | the public key from step 1 |
| `VAPID_PRIVATE_KEY` | the private key from step 1 |
| `VAPID_SUBJECT` | `mailto:` plus an email address you check, e.g. `mailto:you@example.com` |
| `WEBHOOK_SECRET` | the secret from step 2 |

You don't need to add `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY`; Supabase provides those to every function automatically.

**Command-line alternative** (after the login and link in step 5):

```powershell
npx supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com WEBHOOK_SECRET=...
```

## 4. Create the subscriptions table

1. Go to **SQL Editor → New query**.
2. Paste in **all** of [`supabase/push.sql`](../supabase/push.sql) and click **Run**. You should see "Success. No rows returned".

This stores which devices have notifications turned on. Each member can only see and change their own devices. It's safe to run again.

## 5. Deploy the `notify` function

The command line is the most reliable way:

```powershell
npx supabase login
npx supabase link --project-ref YOUR-PROJECT-REF
npx supabase functions deploy notify --no-verify-jwt
```

- `login` opens your browser to sign in to Supabase.
- Your **project ref** is the part of your project URL before `.supabase.co` (in `https://abcdefgh.supabase.co` it's `abcdefgh`). It's also under **Project Settings → General**.
- `link` may ask for the database password you set when creating the project.
- `--no-verify-jwt` is required. The webhook doesn't send a user login, so the function checks the `x-webhook-secret` header instead.

When it finishes, **Edge Functions** in the dashboard lists `notify`.

**Dashboard alternative (not tested with this function):** the dashboard can also create a function: go to **Edge Functions → Deploy a new function → Via Editor**, name it `notify`, paste in all of [`supabase/functions/notify/index.ts`](../supabase/functions/notify/index.ts) and deploy. Then open the function's settings and turn **off** JWT verification (the option may be called "Verify JWT" or "Enforce JWT verification"). If you can't find that option, use the command line instead, because the webhook won't work while it's on.

## 6. Create the two webhooks

Open **Database → Webhooks** (newer dashboards: **Integrations → Database Webhooks**). Turn webhooks on if asked, then click **Create a new hook**:

1. **Name:** `notify_likes`
2. **Table:** `likes`
3. **Events:** tick **Insert** only
4. **Type of webhook:** **Supabase Edge Functions**, then pick `notify` and method **POST**
5. **HTTP Headers:** add a header named `x-webhook-secret` with your secret from step 2 as the value. If there's an option to add an auth header with the service key, leave it off; it isn't needed.
6. Click **Create webhook**.

Repeat for a second hook named `notify_comments` on the `comments` table, also **Insert** only, with the same function and header.

## 7. Add the public key to the app

On GitHub, open the repo → **Settings → Secrets and variables → Actions** and add a repository secret:

- `VITE_VAPID_PUBLIC_KEY`: the **public** key from step 1 (never the private one)

Then push a commit, or re-run the deploy from the **Actions** tab, to rebuild the site with it. Until you do this, the app hides the notifications option.

**Locally (optional):** add `VITE_VAPID_PUBLIC_KEY=` with the public key to `.env.local` and restart `npm run dev`.

## 8. Turn it on (each member, on each phone)

- **Android (Chrome):** open the app, go to **Profile**, turn on **Notifications** and tap **Allow**.
- **iPhone / iPad (iOS 16.4 or newer):** Apple only allows notifications for apps on the Home Screen. Open the site in **Safari**, tap **Share → Add to Home Screen**, open the app **from the Home Screen icon**, then go to **Profile**, turn on **Notifications** and tap **Allow**.
- **Computer:** this works in Chrome, Edge and Firefox too.

Notifications are per device, so turn them on on each phone you use.

## Problem reports (Report an issue)

Members can send a report from **Profile → Report an issue**. Admins see every report under **Profile → Admin tools**, and open ones show in their notification bell. To set it up:

1. In the **SQL Editor**, run [`supabase/issues.sql`](../supabase/issues.sql). Reports work in the app from this point.
2. **Phone notifications to admins:** add a third webhook as in step 6, named `notify_issues`, on the `issues` table, **Insert** only, same function and header. Redeploy the function (step 5) so it has the issue code. Admins get a push on each phone where they've turned notifications on.
3. **Emails to admins (optional):** make a free account at [resend.com](https://resend.com), create an API key, then add these secrets (as in step 3):

   | Name | Value |
   |---|---|
   | `RESEND_API_KEY` | the API key from Resend |
   | `ISSUE_EMAIL_FROM` | optional. The sender, e.g. `Bluies Finest <reports@yourdomain.com>`; the domain must be verified in Resend. Leave it out to use Resend's test sender `onboarding@resend.dev`, which can only email the address your Resend account was made with. |
   | `APP_URL` | optional. The app's address, e.g. `https://hangboarding.github.io/bluies-finest/`, for a link in the email |

   Every member with **is_admin** ticked in the `profiles` table gets the email, at the address they sign in with. If you don't add `RESEND_API_KEY`, no emails are sent and everything else still works.

## Troubleshooting

**No notification arrives**
1. Make sure it's someone else hearting or commenting. You never get notified about your own actions.
2. **Check the webhook ran:** in the webhooks page from step 6 (or in **Logs**), look for recent calls to `notify`. Nothing there means the webhook isn't set up for that table, or **Insert** isn't ticked.
3. **Check the function logs:** **Edge Functions → notify → Logs**. The function replies with a short reason:
   - `401 Bad or missing x-webhook-secret header`: the header in step 6 doesn't exactly match `WEBHOOK_SECRET` from step 3 (check for spaces).
   - `401` mentioning JWT: the function was deployed without `--no-verify-jwt`. Redeploy it (step 5).
   - `Missing environment variable …`: add that secret (step 3). The function picks it up on its next call.
   - `owner has no push subscriptions`: that person hasn't turned notifications on, or their phone dropped the subscription. Ask them to turn it off and on again in **Profile**.
   - `sent: 1`: the notification was sent. If it still didn't show, it's the phone (see below).
4. **iPhone:** it must be opened from the Home Screen icon, not from Safari, and on iOS 16.4 or newer.
5. **Permission:** if you once tapped **Don't Allow**, the app can't ask again. Allow notifications in the phone's settings: on iPhone, **Settings → Notifications → Bluies Finest**; on Android, long-press the app icon → **App info → Notifications** (or Chrome → **Site settings → Notifications**). Also check Focus / Do Not Disturb.

**The Notifications option doesn't show in Profile:** the site was built without `VITE_VAPID_PUBLIC_KEY` (step 7), or the app is in demo mode.

**"permission denied for table sessions" in the notify logs?** Run [`supabase/service-role.sql`](../supabase/service-role.sql) in the SQL Editor. Newer Supabase projects don't let server functions read new tables until they're granted access.
