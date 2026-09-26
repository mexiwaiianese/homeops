import { createDemoMaintenance, listDemoMaintenanceForTenant, type DemoMaintenance } from "@/lib/maintenance-demo";
import { issueCategories, type TenantRequest, type TenantRequestStatus } from "@/lib/tenant-portal";
import type { TenantContext } from "@/lib/tenant-auth";

type Ctx = NonNullable<TenantContext>;

// Tenant-reported issues become ordinary maintenance_requests. From there the manager board
// triages them and, once approved, the same rows flow into auctions, auto-assign, and the
// vendor desk. Nothing tenant-specific is bolted on to the work order itself.

function mapDemo(row: DemoMaintenance): TenantRequest {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    priority: row.priority.toLowerCase() as TenantRequest["priority"],
    status: row.status.toLowerCase() as TenantRequestStatus,
    vendorName: row.vendorName ?? null,
    openedAt: row.openedAt,
    updatedAt: row.updatedAt,
    availability: row.availability,
    category: row.category,
  };
}

function mapLive(row: any): TenantRequest {
  const vendor = Array.isArray(row.vendors) ? row.vendors[0] : row.vendors;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    vendorName: vendor?.name ?? null,
    openedAt: row.opened_at,
    updatedAt: row.updated_at,
    availability: row.diagnosis?.availability ?? null,
    category: row.diagnosis?.category ?? null,
  };
}

export async function listTenantRequests(ctx: Ctx): Promise<TenantRequest[]> {
  if (ctx.mode === "demo") return listDemoMaintenanceForTenant(ctx.tenant.id).map(mapDemo);
  const { data, error } = await ctx.admin
    .from("maintenance_requests")
    .select("id, title, description, priority, status, opened_at, updated_at, diagnosis, vendors(name)")
    .eq("tenant_id", ctx.tenant.id)
    .eq("organization_id", ctx.organizationId)
    .order("opened_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapLive);
}

export type NewTenantRequest = {
  title: string;
  description: string;
  category?: string | null;
  emergency?: boolean;
  availability?: string | null;
  permissionToEnter?: boolean;
};

export function validateTenantRequest(body: any): { ok: true; input: NewTenantRequest } | { ok: false; error: string } {
  const title = String(body?.title || "").trim();
  const description = String(body?.description || "").trim();
  if (title.length < 3) return { ok: false, error: "Give the issue a short title." };
  if (description.length < 10) return { ok: false, error: "Describe what is happening in a sentence or two." };
  const category = typeof body?.category === "string" && issueCategories.some((row) => row.id === body.category) ? body.category : null;
  return {
    ok: true,
    input: {
      title: title.slice(0, 140),
      description: description.slice(0, 5000),
      category,
      emergency: body?.emergency === true,
      availability: typeof body?.availability === "string" ? body.availability.trim().slice(0, 300) || null : null,
      permissionToEnter: body?.permissionToEnter === true,
    },
  };
}

export async function createTenantRequest(ctx: Ctx, input: NewTenantRequest) {
  if (ctx.mode === "demo") {
    const result = createDemoMaintenance({
      tenantId: ctx.tenant.id,
      title: input.title,
      description: input.description,
      emergency: input.emergency,
      availability: input.availability,
      category: input.category,
    });
    if ("error" in result) return { error: result.error, status: result.status };
    return { request: mapDemo(result.request) };
  }
  if (!ctx.tenant.homeId) return { error: "We could not find an active lease for your account. Contact your property manager.", status: 409 as const };
  const { data, error } = await ctx.admin
    .from("maintenance_requests")
    .insert({
      organization_id: ctx.organizationId,
      home_id: ctx.tenant.homeId,
      tenant_id: ctx.tenant.id,
      title: input.title,
      description: input.description,
      priority: input.emergency ? "emergency" : "normal",
      status: "diagnose",
      diagnosis: {
        source: "tenant_portal",
        category: input.category,
        availability: input.availability,
        permissionToEnter: input.permissionToEnter ?? false,
      },
    })
    .select("id, title, description, priority, status, opened_at, updated_at, diagnosis, vendors(name)")
    .single();
  if (error) return { error: error.message, status: 400 as const };
  await ctx.admin.from("activity_events").insert({
    organization_id: ctx.organizationId,
    home_id: ctx.tenant.homeId,
    subject_type: "maintenance_request",
    subject_id: data.id,
    event_type: "tenant_portal_request",
    body: input.description,
    metadata: { category: input.category, emergency: input.emergency ?? false, tenantId: ctx.tenant.id },
  });
  return { request: mapLive(data) };
}
