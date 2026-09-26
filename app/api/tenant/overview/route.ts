import { NextResponse } from "next/server";
import { appOrigin } from "@/lib/rent";
import { stripePublishableKey } from "@/lib/stripe";
import { getTenantContext } from "@/lib/tenant-auth";
import { listTenantCharges, listTenantPaymentMethods, stripeReady } from "@/lib/tenant-billing";
import { listTenantRequests } from "@/lib/tenant-requests";

// One call powers the whole portal: who you are, what you owe, how you pay, what you reported.

export async function GET(request: Request) {
  const context = await getTenantContext();
  if (!context) return NextResponse.json({ error: "Sign in to view your portal." }, { status: 401 });
  try {
    const [charges, paymentMethods, requests] = await Promise.all([
      listTenantCharges(context, appOrigin(request)),
      listTenantPaymentMethods(context).catch(() => []),
      listTenantRequests(context),
    ]);
    const open = charges.filter((row) => row.remainingCents > 0 && row.status !== "void");
    return NextResponse.json({
      mode: context.mode,
      tenant: context.tenant,
      stripe: stripeReady(),
      publishableKey: stripeReady() ? stripePublishableKey() : null,
      summary: {
        dueCents: open.reduce((sum, row) => sum + row.remainingCents, 0),
        dueCount: open.length,
        nextDueOn: open.map((row) => row.dueOn).sort()[0] || null,
      },
      charges,
      paymentMethods,
      requests,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load your portal." }, { status: 500 });
  }
}
