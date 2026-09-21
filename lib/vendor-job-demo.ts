import { homes, initialMaintenance } from "@/lib/data";
import { vendors as demoVendors } from "@/lib/vendor-demo";
import { getDemoOpportunityByJob } from "@/lib/vendor-auction-demo";
import {
  mediaKind,
  type JobLog,
  type JobLogKind,
  type JobSite,
} from "@/lib/vendor-job";

type JobStore = { jobs: Map<string, JobSite> };

const store: JobStore =
  ((globalThis as typeof globalThis & { __homeopsJobs?: JobStore }).__homeopsJobs ??= {
    jobs: new Map(),
  });

function token() {
  return `job-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

function seedIfNeeded() {
  if (store.jobs.size) return;
  const job = initialMaintenance.find((row) => row.id === "m1");
  const vendor = demoVendors.find((row) => row.id === "v1");
  const home = homes.find((row) => row.id === job?.homeId);
  if (!job || !vendor) return;
  const awardedAt = new Date(Date.now() - 150 * 60 * 1000).toISOString();
  store.jobs.set("m1", {
    id: "job-m1",
    maintenanceRequestId: "m1",
    vendorId: "v1",
    vendorName: vendor.name,
    title: job.title,
    address: home?.address || "100 Demo Avenue",
    city: home?.city || "Example City, UT",
    token: "job-demo-heating-m1",
    notifiedAt: new Date(Date.now() - 180 * 60 * 1000).toISOString(),
    firstResponseAt: new Date(Date.now() - 165 * 60 * 1000).toISOString(),
    awardedAt,
    arrivedAt: null,
    departedAt: null,
    completedAt: null,
    locationConfirmed: false,
    latitude: null,
    longitude: null,
    quotedAmountCents: Math.round(job.estimate * 100),
    logs: [],
  });
}

seedIfNeeded();

function firstResponseFromOpportunity(jobId: string, vendorId: string) {
  const opportunity = getDemoOpportunityByJob(jobId);
  if (!opportunity) return { notifiedAt: null as string | null, firstResponseAt: null as string | null };
  const invite = opportunity.invites.find((row) => row.vendorId === vendorId);
  const bid = opportunity.bids.find((row) => row.vendorId === vendorId);
  const notifiedAt = invite?.notifiedAt || opportunity.startsAt;
  const firstResponseAt = [invite?.viewedAt, bid?.submittedAt].filter(Boolean).sort()[0] || null;
  return { notifiedAt, firstResponseAt };
}

export function getDemoJobByToken(tokenValue: string) {
  seedIfNeeded();
  return [...store.jobs.values()].find((row) => row.token === tokenValue) || null;
}

export function getDemoJobByRequest(jobId: string) {
  seedIfNeeded();
  return store.jobs.get(jobId) || [...store.jobs.values()].find((row) => row.maintenanceRequestId === jobId) || null;
}

export function listDemoJobsForVendor(vendorId: string) {
  seedIfNeeded();
  return [...store.jobs.values()]
    .filter((row) => row.vendorId === vendorId)
    .sort((a, b) => new Date(b.awardedAt).getTime() - new Date(a.awardedAt).getTime());
}

export function ensureDemoJobSite(input: {
  jobId: string;
  vendorId: string;
  quotedAmountCents?: number | null;
}) {
  seedIfNeeded();
  const existing = getDemoJobByRequest(input.jobId);
  if (existing) {
    if (existing.vendorId === input.vendorId) return existing;
    existing.vendorId = input.vendorId;
    existing.vendorName = demoVendors.find((row) => row.id === input.vendorId)?.name || existing.vendorName;
    return existing;
  }
  const job = initialMaintenance.find((row) => row.id === input.jobId);
  const vendor = demoVendors.find((row) => row.id === input.vendorId);
  const home = homes.find((row) => row.id === job?.homeId);
  const stamps = firstResponseFromOpportunity(input.jobId, input.vendorId);
  const site: JobSite = {
    id: `job-${input.jobId}`,
    maintenanceRequestId: input.jobId,
    vendorId: input.vendorId,
    vendorName: vendor?.name || "Vendor",
    title: job?.title || "Assigned job",
    address: home?.address || "",
    city: home?.city || "",
    token: token(),
    notifiedAt: stamps.notifiedAt,
    firstResponseAt: stamps.firstResponseAt,
    awardedAt: new Date().toISOString(),
    arrivedAt: null,
    departedAt: null,
    completedAt: null,
    locationConfirmed: false,
    latitude: null,
    longitude: null,
    quotedAmountCents: input.quotedAmountCents ?? (job?.estimate ? Math.round(job.estimate * 100) : null),
    logs: [],
  };
  store.jobs.set(input.jobId, site);
  return site;
}

function addLog(job: JobSite, input: Omit<JobLog, "id" | "createdAt"> & { createdAt?: string }) {
  const log: JobLog = {
    id: `log-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    createdAt: input.createdAt || new Date().toISOString(),
    kind: input.kind,
    body: input.body ?? null,
    mimeType: input.mimeType,
    fileName: input.fileName,
    dataUrl: input.dataUrl,
    storagePath: input.storagePath,
    url: input.url,
    latitude: input.latitude,
    longitude: input.longitude,
  };
  job.logs = [...job.logs, log];
  return log;
}

export function recordDemoJobAction(
  tokenValue: string,
  input: {
    action: "arrive" | "leave" | "confirm" | "note";
    note?: string;
    latitude?: number | null;
    longitude?: number | null;
    confirmed?: boolean;
  },
) {
  const job = getDemoJobByToken(tokenValue);
  if (!job) return { error: "This job link is not valid.", status: 404 as const };
  if (job.completedAt) return { error: "This job is already closed.", status: 409 as const };
  const now = new Date().toISOString();
  if (input.action === "arrive") {
    if (job.arrivedAt && !job.departedAt) return { error: "Crew is already marked on site.", status: 409 as const };
    job.arrivedAt = job.arrivedAt || now;
    job.departedAt = null;
    if (input.latitude != null) job.latitude = input.latitude;
    if (input.longitude != null) job.longitude = input.longitude;
    addLog(job, {
      kind: "arrive",
      body: "Crew marked arrival.",
      latitude: input.latitude,
      longitude: input.longitude,
    });
    return { job };
  }
  if (input.action === "confirm") {
    if (!job.arrivedAt) return { error: "Mark arrival before confirming the location.", status: 409 as const };
    job.locationConfirmed = true;
    if (input.latitude != null) job.latitude = input.latitude;
    if (input.longitude != null) job.longitude = input.longitude;
    addLog(job, {
      kind: "confirm",
      body: `Confirmed on site at ${job.address}.`,
      latitude: input.latitude ?? job.latitude,
      longitude: input.longitude ?? job.longitude,
    });
    return { job };
  }
  if (input.action === "leave") {
    if (!job.arrivedAt) return { error: "Mark arrival before leaving.", status: 409 as const };
    if (job.departedAt) return { error: "Crew already marked departure.", status: 409 as const };
    job.departedAt = now;
    addLog(job, { kind: "leave", body: "Crew marked departure." });
    return { job };
  }
  const note = (input.note || "").trim();
  if (!note) return { error: "Enter a note.", status: 400 as const };
  addLog(job, { kind: "note", body: note });
  return { job };
}

export function addDemoJobMedia(
  tokenValue: string,
  input: { kind?: JobLogKind; body?: string | null; mimeType: string; fileName: string; dataUrl: string },
) {
  const job = getDemoJobByToken(tokenValue);
  if (!job) return { error: "This job link is not valid.", status: 404 as const };
  if (job.completedAt) return { error: "This job is already closed.", status: 409 as const };
  const kind = input.kind || mediaKind(input.mimeType) || "photo";
  addLog(job, {
    kind,
    body: input.body || input.fileName,
    mimeType: input.mimeType,
    fileName: input.fileName,
    dataUrl: input.dataUrl,
  });
  return { job };
}

export function closeDemoJob(jobId: string) {
  const job = getDemoJobByRequest(jobId);
  if (!job) return null;
  const now = new Date().toISOString();
  job.completedAt = now;
  if (job.arrivedAt && !job.departedAt) job.departedAt = now;
  return job;
}

export const demoVendorSessionCookie = "homeops_vendor_demo";
