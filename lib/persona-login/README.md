# Persona login

One-click "open the app as X" for local development and authorized beta testers. Fail-closed in
production. Framework code lives here with zero app imports; each app writes a small adapter.

```
lib/persona-login/                 portable core (copy as-is)
  config.ts    env parsing + enable/disable rules
  gate.ts      unlock cookie (HMAC), access code check, rate limit, allowlist
  handlers.ts  createPersonaLoginHandlers(adapter) -> GET/POST/DELETE + unlock
  types.ts     Persona, PersonaLoginAdapter, ...
components/persona-login/          portable UI (copy as-is)
  persona-login-panel.tsx          full switcher page body (all groups, unlock form, sign-out)
  persona-quick-login.tsx          compact one-group picker to embed under a real sign-in form
  persona-login.css
lib/persona-login-<app>.ts         YOUR adapter (HomeOps: lib/persona-login-homeops.ts)
app/api/persona-login/route.ts     mounts GET/POST/DELETE
app/api/persona-login/unlock/route.ts
app/dev/personas/page.tsx          the page (404 when disabled)
```

## Enable rules (`config.ts`)

| Env | Effect |
| --- | --- |
| `PERSONA_LOGIN_ENABLED` | unset → on outside production, off in production. `true`/`false` overrides. |
| `PERSONA_LOGIN_ACCESS_CODE` | Shared tester code, ≥ 12 chars. In production you need this **or** an allowlist. |
| `PERSONA_LOGIN_ALLOWED_EMAILS` | Comma list. A real signed-in user with one of these emails skips the code. |
| `PERSONA_LOGIN_UNLOCK_DAYS` | Unlock cookie lifetime (default 14, max 90). |
| `PERSONA_LOGIN_COOKIE_SECRET` | Optional HMAC key. Default derives from code + allowlist, so rotating the code logs every tester out. |

Local dev with nothing set: wide open at `/dev/personas`. Set a code locally if the machine is shared.

## How access works (`gate.ts`)

1. Feature off → every endpoint returns 404 and the page renders `notFound()`. Nothing is advertised.
2. No code and no allowlist (dev only) → open.
3. Correct code → `persona_login_unlock` httpOnly cookie, HMAC-SHA256 signed with expiry. Unlock
   attempts are rate limited per IP (10 per 15 min, in-process).
4. Allowlisted email → allowed, and the unlock cookie is issued on first switch so the tester keeps
   access after their own session is replaced by a persona.

Every sign-in, sign-out, unlock, rejected code, and rate-limit hit is logged as `[persona-login] …`.
Testers only ever see labels; `Persona.meta` (emails, ids) is stripped from API responses. Personas
are defined server-side, so a tester cannot type an arbitrary email and become that account.

## Writing an adapter

```ts
import type { PersonaLoginAdapter } from "@/lib/persona-login";

export const myAppPersonaLogin: PersonaLoginAdapter = {
  async listPersonas() {
    return [
      { id: "admin", group: "staff", groupLabel: "Staff", label: "Admin", landingPath: "/admin", meta: { email: "admin@test.example" } },
      { id: "customer:1", group: "customer", label: "Customer One", landingPath: "/app", meta: { userId: "1" } },
    ];
  },
  async signIn(persona) {
    // Establish the session however your app does it. Either return cookies…
    return { ok: true, cookies: [{ name: "my_session", value: "…", options: { httpOnly: true, path: "/", maxAge: 86400 } }] };
    // …or set them with next/headers cookies() (e.g. Supabase verifyOtp) and return { ok: true }.
  },
  async signOut() {
    // Clear everything a persona could have set. Return cookies to expire.
    return [{ name: "my_session", value: "", options: { path: "/", maxAge: 0 } }];
  },
  async currentUserEmail() {
    // Optional: lets PERSONA_LOGIN_ALLOWED_EMAILS work.
    return null;
  },
  async seed() {
    // Optional, idempotent: create demo records so personas exist on an empty backend.
    // Shows a "Create demo data" button when the list is empty; served at POST <apiBase>/seed.
    return { ok: true, summary: "Created 1 organization, 3 customers." };
  },
};
```

Mount `handlers.seed.POST` at `app/api/persona-login/seed/route.ts` if you implement `seed`.

Mount it:

```ts
// app/api/persona-login/route.ts
import { createPersonaLoginHandlers } from "@/lib/persona-login";
import { myAppPersonaLogin } from "@/lib/persona-login-myapp";
export const dynamic = "force-dynamic";
const handlers = createPersonaLoginHandlers(myAppPersonaLogin);
export const GET = handlers.GET; export const POST = handlers.POST; export const DELETE = handlers.DELETE;

// app/api/persona-login/unlock/route.ts
export const POST = handlers.unlock.POST; export const DELETE = handlers.unlock.DELETE;

// app/dev/personas/page.tsx
if (!isPersonaLoginEnabled()) notFound();
return <PersonaLoginPanel appName="My App" signInHref="/login" />;

// Under any real sign-in form (renders nothing when the feature is off; children are the fallback)
<PersonaQuickLogin group="customer" title="Open as a customer" />
```

## Setting the access code

`PERSONA_LOGIN_ACCESS_CODE` is an environment variable, 12+ characters. Rotate it to log every tester out.
Vercel: Settings → Environment Variables → edit (Production) → Redeploy. CLI:
`vercel env add PERSONA_LOGIN_ACCESS_CODE production --value "…" --no-sensitive --force` then `vercel redeploy <prod-url> --target production`.

### Supabase Auth personas

The HomeOps adapter shows the pattern for Supabase: with the service-role client call
`auth.admin.generateLink({ type: "magiclink", email })`, then on the SSR client (in a route handler,
so it can write cookies) call `auth.verifyOtp({ type: "magiclink", token_hash })`. No email is sent.
`generateLink` creates the auth user if it does not exist, so a fresh test mailbox works on the first
click. App-level linkage (memberships, owner/vendor user rows) still follows your normal rules.

## Porting checklist

1. Copy `lib/persona-login/` and `components/persona-login/`.
2. Write `lib/persona-login-<app>.ts` implementing `PersonaLoginAdapter`.
3. Add the two API route files and the page.
4. Add the `PERSONA_LOGIN_*` block to `.env.example`.
5. Confirm `npm run build && NODE_ENV=production npm start` returns 404 from `/dev/personas` with no env set.

## Deliberately not included

- No middleware changes; access is decided per request in the handlers.
- No persistent audit table. Console logs are enough for a beta; add an insert in `signIn` if you need history.
- No distributed rate limit. Put the host behind an edge limiter if the URL is widely shared.
