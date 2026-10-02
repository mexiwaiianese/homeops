"use client";

import AccessSignIn from "@/components/access-sign-in";

export default function LoginPage() {
  return (
    <main className="loginShell">
      <section className="loginBrand">
        <img className="loginBrandMark" src="/brand/portonos-mark.png" alt="portonOS" />
        <p className="eyebrow">EVERYTHING BEHIND EVERY DOOR</p>
        <h1>Sign in to your account.</h1>
        <p>We send a one-time link to the email on your account. Managers, owners, vendors, and platform admins all use this screen.</p>
      </section>
      <section className="loginCard">
        <img className="loginLockup" src="/brand/portonos-wordmark.png" alt="" />
        <p className="eyebrow">SIGN IN</p>
        <AccessSignIn
          heading="Email a sign-in link"
          lede="One email field. The link opens the desk that belongs to that account."
          redirectTo="/app"
        />
      </section>
    </main>
  );
}
