"use client";

import { analytics } from "@heycatch/sdk";

analytics.init({
  projectKey: "hck_pk_mXc0gtQUqyM0DSQdUfQCORLW85pMGXxA",
  install: {
    framework: "nextjs",
    frameworkVersion: "15",
    agent: "cursor",
  },
  autocapture: false,
  maskAllText: true,
  maskAllElementAttributes: true,
  persistence: "localStorage",
  beforeSend(event) {
    if (!event) return null;
    const blob = JSON.stringify(event.properties || {});
    if (/access_token|refresh_token|client_secret|encrypted_credentials|\/financials|\/api\/financial|quickbooks/i.test(blob)) return null;
    return event;
  },
});

export default function HeyCatchAnalytics() {
  return null;
}
