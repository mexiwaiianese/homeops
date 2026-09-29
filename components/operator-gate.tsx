import { googleAuthEnabled } from "@/lib/google-auth";
import OperatorGoogleLogin from "@/components/operator-google-login";
import { getOperatorAdmin } from "@/lib/operator-admin";

/** Renders children only for the operator admin's Google session. Everyone else gets the Google button. */
export default async function OperatorGate({
  nextPath,
  error,
  title,
  children,
}: {
  nextPath: string;
  error?: string;
  title: string;
  children: React.ReactNode;
}) {
  if (!googleAuthEnabled) return children;
  const { allowed, user } = await getOperatorAdmin();
  if (allowed) return children;
  return (
    <main className="intakeShell">
      <section className="intakeCard jobCard">
        <p className="eyebrow">OPERATOR TOOLS</p>
        <h1>{title}</h1>
        <p>Sign in with the admin Google account to continue.</p>
        {user?.email && <p>This browser is signed in as {user.email}, which is not the admin account.</p>}
        <OperatorGoogleLogin nextPath={nextPath} error={error} />
      </section>
    </main>
  );
}

/** Renders children only for the operator admin's Google session. Everyone else gets the Google button. */
export default async function OperatorGate({
  nextPath,
  error,
  title,
  children,
}: {
  nextPath: string;
  error?: string;
  title: string;
  children: React.ReactNode;
}) {
  const { allowed, user } = await getOperatorAdmin();
  if (allowed) return children;
  return (
    <main className="intakeShell">
      <section className="intakeCard jobCard">
        <p className="eyebrow">OPERATOR TOOLS</p>
        <h1>{title}</h1>
        <p>Sign in with the admin Google account to continue.</p>
        {user?.email && <p>This browser is signed in as {user.email}, which is not the admin account.</p>}
        <OperatorGoogleLogin nextPath={nextPath} error={error} />
      </section>
    </main>
  );
}
