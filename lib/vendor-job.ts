export type JobLogKind = "arrive" | "leave" | "confirm" | "note" | "photo" | "video" | "audio";

export type JobLog = {
  id: string;
  kind: JobLogKind;
  body: string | null;
  mimeType?: string | null;
  fileName?: string | null;
  dataUrl?: string | null;
  storagePath?: string | null;
  url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  createdAt: string;
};

export type JobSite = {
  id: string;
  maintenanceRequestId: string;
  vendorId: string;
  vendorName: string;
  title: string;
  address: string;
  city: string;
  token: string;
  notifiedAt: string | null;
  firstResponseAt: string | null;
  awardedAt: string;
  arrivedAt: string | null;
  departedAt: string | null;
  completedAt: string | null;
  locationConfirmed: boolean;
  latitude: number | null;
  longitude: number | null;
  quotedAmountCents: number | null;
  logs: JobLog[];
};

export type JobTiming = {
  responseMinutes: number | null;
  completionMinutes: number | null;
  responseLabel: string;
  completionLabel: string;
  responseDetail: string;
  completionDetail: string;
  onSite: boolean;
  finished: boolean;
};

export const JOB_MEDIA_MAX_BYTES = 12 * 1024 * 1024;
export const JOB_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "audio/mpeg",
  "audio/mp4",
  "audio/webm",
  "audio/wav",
  "audio/ogg",
  "audio/x-m4a",
];

export function jobFieldPath(token: string) {
  return `/vendors/job/${token}`;
}

export function minutesBetween(start?: string | null, end?: string | null) {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.round(ms / 60000));
}

export function formatDuration(minutes: number | null, empty = "Not recorded yet") {
  if (minutes == null) return empty;
  if (minutes < 1) return "Under 1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
  const days = Math.floor(hours / 24);
  const remainHours = hours % 24;
  return remainHours ? `${days}d ${remainHours} hr` : `${days}d`;
}

export function jobSiteStatus(job: Pick<JobSite, "completedAt" | "arrivedAt" | "departedAt">) {
  if (job.completedAt) return "completed" as const;
  if (job.arrivedAt && !job.departedAt) return "on_site" as const;
  if (job.departedAt) return "departed" as const;
  return "assigned" as const;
}

export function computeJobTiming(job: JobSite, now = new Date().toISOString()): JobTiming {
  const responseMinutes = minutesBetween(job.notifiedAt, job.firstResponseAt);
  const finishedAt = job.departedAt || job.completedAt || now;
  const completionMinutes = minutesBetween(job.awardedAt, finishedAt);
  const onSite = Boolean(job.arrivedAt && !job.departedAt && !job.completedAt);
  const finished = Boolean(job.departedAt || job.completedAt);
  return {
    responseMinutes,
    completionMinutes: job.awardedAt ? completionMinutes : null,
    responseLabel: formatDuration(responseMinutes),
    completionLabel: formatDuration(
      job.awardedAt ? completionMinutes : null,
      onSite ? "Still on site" : "Waiting for departure",
    ),
    responseDetail: responseMinutes == null
      ? "No opportunity response timestamp yet. This is the time from invite to first view or bid."
      : `Invite/opportunity to first view or bid.`,
    completionDetail: !job.awardedAt
      ? "Award time is missing."
      : finished
        ? "Award to vendor departure (or close if they never marked leave)."
        : "Award to now. This will freeze when the crew marks leave or the manager documents the job.",
    onSite,
    finished,
  };
}

export function mediaKind(mimeType?: string | null): "photo" | "video" | "audio" | null {
  if (!mimeType) return null;
  if (mimeType.startsWith("image/")) return "photo";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return null;
}

export function allowedJobMedia(file: { type?: string; size?: number }) {
  if ((file.size ?? 0) > JOB_MEDIA_MAX_BYTES) return "File exceeds 12 MB.";
  const type = file.type || "";
  if (!JOB_MEDIA_TYPES.includes(type) && !mediaKind(type)) {
    return "Use a photo, video, or audio file. Do not upload W-9s, insurance, or tax documents here.";
  }
  return null;
}

export function publicJob(job: JobSite, origin?: string) {
  const timing = computeJobTiming(job);
  return {
    id: job.id,
    maintenanceRequestId: job.maintenanceRequestId,
    vendorId: job.vendorId,
    vendorName: job.vendorName,
    title: job.title,
    address: job.address,
    city: job.city,
    token: job.token,
    fieldUrl: `${(origin || "").replace(/\/$/, "")}${jobFieldPath(job.token)}`,
    status: jobSiteStatus(job),
    notifiedAt: job.notifiedAt,
    firstResponseAt: job.firstResponseAt,
    awardedAt: job.awardedAt,
    arrivedAt: job.arrivedAt,
    departedAt: job.departedAt,
    completedAt: job.completedAt,
    locationConfirmed: job.locationConfirmed,
    latitude: job.latitude,
    longitude: job.longitude,
    quotedAmountCents: job.quotedAmountCents,
    timing,
    logs: job.logs.map((log) => ({
      id: log.id,
      kind: log.kind,
      body: log.body,
      mimeType: log.mimeType,
      fileName: log.fileName,
      url: log.url || log.dataUrl || null,
      latitude: log.latitude,
      longitude: log.longitude,
      createdAt: log.createdAt,
    })),
  };
}
