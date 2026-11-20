# Saving progress with an email: owner setup (D150)

Saving progress is optional for players and stays switched off until every step below is done. Until then the game shows nothing new: guest play and profiles work exactly as before.

Never paste a key into a chat, a commit or a file in this repository. Keys go only into the Supabase and Netlify dashboards.

## What you need first

- **A domain you own.** Resend's free plan (3,000 emails a month, 100 a day, at the time of writing) can only send from a domain you have verified. Its test sender `onboarding@resend.dev` delivers only to your own Resend account address, so players would never get their codes. A `netlify.app` address cannot be verified because you do not control its DNS. Check the current limits at resend.com/pricing.

## Steps, in order

1. **Domain.** Buy one, or use one you already own.
2. **Resend account.** Sign up at resend.com. Open Domains, choose Add Domain and use a subdomain such as `mail.yourdomain.com`. Add the DNS records Resend shows (SPF and DKIM as TXT records, and an MX record) at your DNS provider. Wait until Resend shows the domain as Verified (minutes to a few hours).
3. **Resend API key.** Open API Keys, create a key with Sending access, limited to that domain. Copy it straight into step 4; do not save it anywhere else.
4. **Supabase SMTP.** In the Supabase dashboard: Authentication, Emails, SMTP Settings. Turn on custom SMTP:
   - Host `smtp.resend.com`, port `465`, username `resend`, password: the API key.
   - Sender email `no-reply@mail.yourdomain.com`, sender name `Checkervia`.
5. **The code email.** Authentication, Emails, Templates, Magic Link. Set the subject to `Your Checkervia code` and the body to the template below. It must contain `{{ .Token }}`, or players get a link instead of a code.
6. **Codes.** Authentication, Sign In / Providers, Email: set Email OTP Expiration to `600` seconds and Email OTP Length to `6`. Keep **Allow new users to sign up turned off**: the admin login refuses to work while it is on, and our function makes player users itself.
7. **Rate limits.** Authentication, Rate Limits: set emails per hour to about `60`. The game's own limits keep the daily total under 90.
8. **Migration 9.** Ask for `docs/07-deployment/accounts-migration-9.sql` to be applied (it is applied only after your explicit approval, like migrations 5 to 8).
9. **Netlify.** In Site configuration, Environment variables: check that `SUPABASE_ANON_KEY` is set (the admin already uses it), then add `ACCOUNTS_ENABLED` with the value `1`. No Resend key goes into Netlify.
10. **Deploy and test** with your own email: save a profile on one browser, then log in on another.

## The code email template

```html
<h2>Your Checkervia code</h2>
<p>Enter this code in Checkervia to save or open your profile:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:6px">{{ .Token }}</p>
<p>It works for 10 minutes. If you did not ask for it, you can ignore this email.</p>
```

## Before every step is done

The account function answers `enabled: false` and the game hides every account control. Tests and the development preview (`?lb=populated`) use a fake sender that shows the code in the corner of the screen instead of emailing it.
