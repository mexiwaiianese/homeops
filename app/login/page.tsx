"use client";

import Image from "next/image";
import AccessSignIn from "@/components/access-sign-in";
import { useHomeHref } from "@/lib/home-href-client";

export default function LoginPage() {
  const home = useHomeHref();
  return (
    <main className="loginShell">
      <section className="loginBrand">
        <a className="brandHomeLink" href={home} aria-label="portonOS home">
          <Image className="loginBrandMark" src="/brand/portonos-mark.png" alt="portonOS" width={62} height={62} />
        </a>
        <p className="eyebrow">EVERYTHING BEHIND EVERY DOOR</p>
        <h1>Sign in to your account.</h1>
        <p>We send a one-time link to the email on your account. Managers, owners, vendors, and platform admins all use this screen.</p>
      </section>
      <section className="loginCard">
        <a className="brandHomeLink" href={home} aria-label="portonOS home">
          <Image className="loginLockup" src="/brand/portonos-wordmark.png" alt="portonOS" width={320} height={96} />
        </a>
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
