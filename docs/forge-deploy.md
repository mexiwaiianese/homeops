# Deploy HomeOps on Laravel Forge

HomeOps is a Next.js app. Keep it as a Node process on the same Forge server as Laravel; do not wrap it in a PHP/Laravel route, and do not deploy it to Vercel.

## Site layout

Create a **second Forge site** (new hostname or subdomain such as `ops.yourdomain.com`). Do not overwrite the existing Laravel document root.

1. Forge → Sites → New site → Git repository `mexiwaiianese/homeops`.
2. Web directory: `/` (Forge will still run nginx; we proxy to Node).
3. PHP version does not matter. Node 20+.
4. Add a Daemon:
   - Directory: `/home/forge/YOUR_SITE`
   - Command: `node .next/standalone/server.js`
   - Environment: `HOSTNAME=0.0.0.0` and `PORT=3010`
5. Replace the site `location /` block with `deploy/nginx-homeops.conf.example` (point `proxy_pass` at `127.0.0.1:3010` and fix the two `alias` paths).
6. Paste `deploy/forge-deploy.sh` into the site Deploy Script, then replace `YOUR_SITE` and the supervisor name.

`npm run build` already copies `public/` and `.next/static` into `.next/standalone`.

## Environment

Copy `.env.example` into Forge Environment. Required for production:

- `NEXT_PUBLIC_APP_URL` = the public Forge hostname (`https://ops.yourdomain.com`)
- Supabase keys if you want live data
- `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` when you are ready to take real rent

Stripe webhook URL:

```text
https://ops.yourdomain.com/api/rent/webhooks/stripe
```

Events: `payment_intent.succeeded`, `payment_intent.payment_failed`.

Leave Stripe keys empty to keep demo pay. Do not invent live keys.

## What not to do

- Do not import this repo into Vercel for production.
- Do not run `next start` from the Laravel public folder.
- Do not put `SUPABASE_SERVICE_ROLE_KEY` or `STRIPE_SECRET_KEY` in a `NEXT_PUBLIC_` variable.
