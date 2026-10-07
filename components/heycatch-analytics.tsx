"use client";

import { analytics } from "@heycatch/sdk";

analytics.init({
  projectKey: "hck_pk_mXc0gtQUqyM0DSQdUfQCORLW85pMGXxA",
  install: {
    framework: "nextjs",
    frameworkVersion: "15",
    agent: "cursor",
  },
});

export default function HeyCatchAnalytics() {
  return null;
}
