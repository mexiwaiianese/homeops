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
| `PERSONA_LOGIN_UNLOCK_DAYS` | Unlock cookie lifetime (default 14, max 90). Also how long an untouched per-tester sandbox lives. |
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
  async seed({ reset }) {
    // Optional: create demo records so personas exist on an empty backend.
    // reset=false must be idempotent (fill gaps, never overwrite). reset=true should discard the
    // caller's sandbox and rebuild it. "Create demo data" / "Reset demo data" in the panel,
    // served at POST <apiBase>/seed with { reset?: boolean }.
    return { ok: true, summary: "Created 1 organization, 3 customers." };
  },
  async onUnlock() {
    // Optional: runs after a correct access code. Give the tester a fresh sandbox here and return
    // any cookies that point the browser at it. `summary` is shown in the panel.
    return { summary: "Fresh sandbox ready." };
  },
  async onLock() {
    // Optional: runs when the tester forgets the code on this browser. Return cookies to clear.
  },
  async sandboxLabel() {
    // Optional: one line for the panel footer, e.g. "Sandbox a1b2c3 · created 5 min ago".
    return null;
  },
};
```

Mount `handlers.seed.POST` at `app/api/persona-login/seed/route.ts` if you implement `seed`.

## Per-tester sandboxes (HomeOps adapter)

Every beta tester gets a private, fully seeded copy of the demo data so the manager desk, owner
portal, tenant portal, and vendor desk all agree with each other and nobody sees another tester's
edits.

| Event | What happens |
| --- | --- |
| Correct access code entered (`POST /unlock`) | Previous sandbox for this browser deleted; a new organization `homeops-demo-ws-<random>` is created and seeded with the full data set. Any active persona is signed out. |
| Pages load / personas listed / sign in | The existing sandbox is reused as-is. Nothing is re-seeded or overwritten, so edits made as any persona persist across every portal. If the browser has no sandbox yet (open dev mode, allowlisted user, expired cookie) one is created on the spot. |
| "Create demo data" (`POST /seed`) | Fills in any rows missing from the current sandbox without touching existing ones. |
| "Reset demo data" (`POST /seed { reset: true }`) | Same as entering the code again, without the code. |
| "Forget access code" (`DELETE /unlock`) | Deletes this browser's sandbox and clears the pointer cookie. |
| Housekeeping | Sandboxes older than `PERSONA_LOGIN_UNLOCK_DAYS` are deleted whenever a new one is created (no browser can still hold a valid cookie for them). |

The browser keeps a signed, httpOnly `persona_login_workspace` cookie (`<organizationId>.<hmac>`).
A tampered cookie is ignored, and only organizations whose slug starts with `homeops-demo-ws-` are
ever deleted, so the switcher can never point at or remove a real customer organization.

What the seed covers (`lib/demo-seed-live.ts`): organization settings; owners, tenants, homes with
Home Passport assets, active leases (including the tenant with an outstanding balance); vendors with
credentials, service categories, contacts, owner preferences, calendar connections, autobid rules,
and a few closed jobs for the scorecards; the maintenance board with the awarded heating job on the
vendor desk; this month's rent charges and ACH payments; vendor bills; thirteen months of operating
ledger linked to those charges and bills; the draft rental listing and network connections; and the
recruitment catalog. Synthetic persona logins created for a sandbox are removed from Supabase Auth
when it is deleted.

Demo mode (no Supabase env) has one in-memory data set per server process. Entering the code or
pressing "Reset demo data" empties every store and re-seeds it, but two testers on the same demo
server share that data; isolation needs the database.

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
