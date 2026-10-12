import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOK_KINDS, isBookKind, type BookKind } from "@/lib/books";
import { loadQboConnection, persistQboCredentials, updateQboConnection, type QboConnection } from "@/lib/qbo/connection";
import {
  dollarsToCentsExact,
  HOMEOPS_NOTE_PREFIX,
  linesFromQboEntity,
  matchQboProperty,
  type InterpretedLine,
  type QboAlias,
  type QboLookups,
} from "@/lib/qbo/interpret";
import { credentialsFromEncrypted, qboQuery, QboAuthError, quickBooksRequest, type QboSession } from "@/lib/qbo/quickbooks";
import { AUTOMATIC_INTERVAL_MS, nextRecurringRun, type QboSchedule, type QboSyncMode } from "@/lib/qbo/schedule";

const ENTITIES = ["Purchase", "BillPayment", "Payment", "SalesReceipt", "Deposit", "RefundReceipt", "JournalEntry", "Invoice", "Bill"] as const;
const PAGE = 100;
const PAGES = 8;
const LOCK_MS = 10 * 60 * 1000;

type HomeRow = { id: string; address1: string; city: string; state: string; property_code?: string | null; owner_id?: string | null };
type SyncTrigger = QboSyncMode;

export type QboSyncResult = {
  ok: boolean;
  skipped?: boolean;
  error?: string;
  pulled: number;
  pushed: number;
  matched: number;
  review: number;
  openItems: number;
  removed: number;
  errors: string[];
};

export async function runQboSync(admin: SupabaseClient, organizationId: string, trigger: SyncTrigger): Promise<QboSyncResult> {
  const connection = await loadQboConnection(admin, organizationId);
  if (!connection || connection.status === "disconnected" || !connection.realmId || !connection.encryptedCredentials) {
    return { ok: false, error: "Connect QuickBooks first.", pulled: 0, pushed: 0, matched: 0, review: 0, openItems: 0, removed: 0, errors: [] };
  }
  if (lockActive(connection.metadata)) {
    return { ok: true, skipped: true, pulled: 0, pushed: 0, matched: 0, review: 0, openItems: 0, removed: 0, errors: [] };
  }

  const started = new Date();
  const metadata = { ...connection.metadata };
  const cursors = { ...(metadata.cursors as Record<string, string> | undefined) };
  metadata.history_start = typeof metadata.history_start === "string" ? metadata.history_start : monthsAgo(18);
  metadata.sync_lock = started.toISOString();
  metadata.cursors = cursors;
  await updateQboConnection(admin, organizationId, { metadata });

  const { data: run, error: runError } = await admin.from("qbo_sync_runs").insert({
    organization_id: organizationId,
    connection_id: connection.id,
    trigger,
    status: "running",
  }).select("id").single();
  if (runError) {
    metadata.sync_lock = null;
    await updateQboConnection(admin, organizationId, { metadata });
    throw new Error(runError.message);
  }

  const result: QboSyncResult = { ok: false, pulled: 0, pushed: 0, matched: 0, review: 0, openItems: 0, removed: 0, errors: [] };
  let schedule = { ...connection.schedule };
  let nextRunAt = connection.nextRunAt;
  let status: QboConnection["status"] = "connected";
  try {
    const session = sessionFrom(admin, connection);
    let accounts = new Map<string, QboAccount>();
    try {
      accounts = await loadAccounts(session);
    } catch (error) {
      if (error instanceof QboAuthError) throw error;
      pushError(result, error instanceof Error ? error.message : "QuickBooks accounts could not be read.");
    }
    const classes = await loadClasses(session);
    const lookups = lookupsFrom(accounts, classes);
    const homes = await loadHomes(admin, organizationId);
    const aliases = await loadAliases(admin, organizationId);

    for (const entity of ENTITIES) {
      try {
        const pulled = await pullEntity({ admin, organizationId, session, entity, cursors, historyStart: String(metadata.history_start), lookups, homes, aliases, started });
        result.pulled += pulled.pulled;
        result.matched += pulled.matched;
        result.review += pulled.review;
        result.openItems += pulled.openItems;
        result.removed += pulled.removed;
        cursors[entity] = pulled.cursor;
      } catch (error) {
        if (error instanceof QboAuthError) throw error;
        pushError(result, `${entity}: ${error instanceof Error ? error.message : "QuickBooks query failed."}`);
      }
    }

    if (connection.lastSyncedAt && Date.now() - Date.parse(connection.lastSyncedAt) < 29 * 24 * 60 * 60 * 1000) {
      try {
        result.removed += await pullDeletes(admin, organizationId, session, connection.lastSyncedAt);
      } catch (error) {
        if (error instanceof QboAuthError) throw error;
        pushError(result, error instanceof Error ? error.message : "QuickBooks delete check failed.");
      }
    }

    const pushed = await pushHomeOps({ admin, organizationId, session, accounts, classes, homes });
    result.pushed += pushed.pushed;
    if (pushed.error) pushError(result, pushed.error);

    result.ok = result.errors.length === 0 || result.pulled + result.pushed > 0;
    const timing = advanceSchedule(connection.syncMode, trigger, schedule, connection.nextRunAt, true);
    schedule = timing.schedule;
    nextRunAt = timing.nextRunAt;
    await finish(admin, organizationId, run.id, connection, metadata, cursors, result, status, nextRunAt, schedule, started);
    return result;
  } catch (error) {
    const auth = error instanceof QboAuthError;
    const message = error instanceof Error ? error.message : "QuickBooks sync failed.";
    result.error = message;
    pushError(result, message);
    status = auth ? "error" : "connected";
    if (auth) nextRunAt = null;
    else if (connection.syncMode === "automatic") nextRunAt = new Date(Date.now() + AUTOMATIC_INTERVAL_MS).toISOString();
    await finish(admin, organizationId, run.id, connection, metadata, cursors, result, status, nextRunAt, schedule, started);
    return result;
  }
}

function sessionFrom(admin: SupabaseClient, connection: QboConnection): QboSession {
  return {
    realmId: connection.realmId,
    credentials: credentialsFromEncrypted(connection.encryptedCredentials),
    persist: (next) => persistQboCredentials(admin, connection, next),
  };
}

async function finish(
  admin: SupabaseClient,
  organizationId: string,
  runId: string,
  connection: QboConnection,
  metadata: Record<string, unknown>,
  cursors: Record<string, string>,
  result: QboSyncResult,
  status: QboConnection["status"],
  nextRunAt: string | null,
  schedule: QboSchedule,
  started: Date,
) {
  const error = result.errors[0] || "";
  metadata.cursors = cursors;
  metadata.sync_lock = null;
  await updateQboConnection(admin, organizationId, {
    status,
    metadata,
    schedule,
    next_run_at: nextRunAt,
    last_error: error.slice(0, 500),
    last_synced_at: result.ok ? started.toISOString() : connection.lastSyncedAt,
  });
  await admin.from("qbo_sync_runs").update({
    status: result.ok ? "complete" : "failed",
    finished_at: new Date().toISOString(),
    pulled: result.pulled,
    pushed: result.pushed,
    matched: result.matched,
    review: result.review,
    error: error.slice(0, 500),
    summary: { openItems: result.openItems, removed: result.removed, errors: result.errors.slice(0, 8) },
  }).eq("id", runId);
}

async function pullEntity(input: {
  admin: SupabaseClient;
  organizationId: string;
  session: QboSession;
  entity: typeof ENTITIES[number];
  cursors: Record<string, string>;
  historyStart: string;
  lookups: QboLookups;
  homes: HomeRow[];
  aliases: QboAlias[];
  started: Date;
}) {
  const cursor = input.cursors[input.entity];
  const where = cursor
    ? `MetaData.LastUpdatedTime > '${shiftDate(cursor, -2)}'`
    : `TxnDate >= '${input.historyStart}'`;
  const order = cursor ? "MetaData.LastUpdatedTime" : "TxnDate";
  const fetched = await queryPages(input.session, input.entity, where, order);
  const lines: InterpretedLine[] = [];
  const closers: string[] = [];
  for (const row of fetched.rows) {
    if ((input.entity === "Invoice" || input.entity === "Bill") && dollarsToCentsExact(row.Balance == null ? row.TotalAmt : row.Balance) <= 0) {
      closers.push(`qbo:${input.entity}:${row.Id}`);
      continue;
    }
    lines.push(...linesFromQboEntity(input.entity, row, input.lookups));
  }
  const applied = await applyLines(input.admin, input.organizationId, lines, input.homes, input.aliases);
  const removed = await closeQboRows(input.admin, input.organizationId, closers);
  const newest = fetched.rows.map((row) => String(row.MetaData?.LastUpdatedTime || "")).filter(Boolean).sort().at(-1);
  return {
    ...applied,
    removed,
    cursor: fetched.hitCap && newest ? newest : input.started.toISOString(),
  };
}

async function queryPages(session: QboSession, entity: string, where: string, order: string) {
  const rows: Record<string, any>[] = [];
  for (let page = 0; page < PAGES; page += 1) {
    const start = page * PAGE + 1;
    const sql = `select * from ${entity} where ${where} order by ${order} startposition ${start} maxresults ${PAGE}`;
    const payload = await qboQuery(session, sql);
    const batch = ((payload.QueryResponse as { [key: string]: Record<string, any>[] } | undefined)?.[entity]) || [];
    rows.push(...batch);
    if (batch.length < PAGE) return { rows, hitCap: false };
  }
  return { rows, hitCap: true };
}

async function applyLines(admin: SupabaseClient, organizationId: string, lines: InterpretedLine[], homes: HomeRow[], aliases: QboAlias[]) {
  const existing = new Map<string, { id: string; reviewed_at: string | null; raw_data: Record<string, unknown> }>();
  const ids = lines.map((line) => line.externalId);
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await admin
      .from("financial_transactions")
      .select("id, external_id, reviewed_at, raw_data")
      .eq("organization_id", organizationId)
      .in("external_id", ids.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const row of data || []) existing.set(String(row.external_id), row);
  }

  let matched = 0;
  let review = 0;
  let openItems = 0;
  const inserts: Record<string, unknown>[] = [];
  for (const line of lines) {
    const property = matchQboProperty({
      homes,
      aliases,
      qbClass: line.qbClass,
      qbLocation: line.qbLocation,
      qbCustomer: line.qbCustomer,
      description: line.description,
      memo: line.memo,
    });
    const allocation = property.propertyId ? "matched" : line.kind === "overhead" ? "overhead" : "review";
    if (!line.cash) openItems += 1;
    else if (allocation === "matched") matched += 1;
    else if (allocation === "review") review += 1;
    const home = homes.find((item) => item.id === property.propertyId);
    const raw = {
      direction: "inbound",
      entity: line.externalId.split(":")[1] || "",
      balanceCents: line.balanceCents,
      cash: line.cash,
    };
    const prior = existing.get(line.externalId);
    if (prior) {
      const patch: Record<string, unknown> = {
        tx_date: line.txDate,
        vendor_name: line.vendorName,
        description: line.description,
        memo: line.memo,
        account_name: line.accountName,
        amount_cents: line.amountCents,
        qbo_cash: line.cash,
        raw_data: { ...(prior.raw_data || {}), qbo: raw },
        updated_at: new Date().toISOString(),
      };
      if (!prior.reviewed_at) {
        Object.assign(patch, {
          flow_type: line.flowType,
          kind: line.kind,
          normalized_category: line.accountName,
          qb_class: line.qbClass || null,
          qb_location: line.qbLocation || null,
          qb_customer_project: line.qbCustomer || null,
          property_id: property.propertyId,
          owner_id: home?.owner_id || null,
          allocation_status: allocation,
          match_confidence: property.confidence,
          match_reason: property.reason,
        });
      }
      const { error } = await admin.from("financial_transactions").update(patch).eq("id", prior.id);
      if (error) throw new Error(error.message);
      continue;
    }
    inserts.push({
      organization_id: organizationId,
      external_id: line.externalId,
      tx_date: line.txDate,
      vendor_name: line.vendorName,
      description: line.description,
      memo: line.memo,
      account_name: line.accountName,
      qb_class: line.qbClass || null,
      qb_location: line.qbLocation || null,
      qb_customer_project: line.qbCustomer || null,
      amount_cents: line.amountCents,
      flow_type: line.flowType,
      property_id: property.propertyId,
      owner_id: home?.owner_id || null,
      allocation_status: allocation,
      normalized_category: line.accountName,
      match_confidence: property.confidence,
      match_reason: property.reason,
      source: "quickbooks_online",
      kind: line.kind,
      qbo_cash: line.cash,
      raw_data: { qbo: raw },
    });
  }
  for (let i = 0; i < inserts.length; i += 200) {
    const { error } = await admin.from("financial_transactions").insert(inserts.slice(i, i + 200));
    if (error) throw new Error(error.message);
  }
  return { pulled: lines.length, matched, review, openItems };
}

async function closeQboRows(admin: SupabaseClient, organizationId: string, externalIds: string[]) {
  if (!externalIds.length) return 0;
  let removed = 0;
  for (let i = 0; i < externalIds.length; i += 100) {
    const chunk = externalIds.slice(i, i + 100);
    const { data, error } = await admin
      .from("financial_transactions")
      .delete()
      .eq("organization_id", organizationId)
      .eq("source", "quickbooks_online")
      .is("reviewed_at", null)
      .in("external_id", chunk)
      .select("id");
    if (error) throw new Error(error.message);
    removed += data?.length || 0;
  }
  return removed;
}

async function pullDeletes(admin: SupabaseClient, organizationId: string, session: QboSession, changedSince: string) {
  const payload = await quickBooksRequest(session, `cdc?entities=${ENTITIES.join(",")}&changedSince=${encodeURIComponent(changedSince)}`);
  let removed = 0;
  const blocks = (payload.CDCResponse as { QueryResponse?: Record<string, unknown>[] }[] | undefined) || [];
  for (const block of blocks) {
    for (const query of block.QueryResponse || []) {
      for (const [key, value] of Object.entries(query)) {
        if (!Array.isArray(value)) continue;
        for (const row of value) {
          if (row?.status !== "Deleted" || !row.Id) continue;
          removed += await deleteParent(admin, organizationId, key, String(row.Id));
        }
      }
    }
  }
  return removed;
}

async function deleteParent(admin: SupabaseClient, organizationId: string, entity: string, id: string) {
  const exact = `qbo:${entity}:${id}`;
  const { data, error } = await admin
    .from("financial_transactions")
    .select("id, external_id, reviewed_at")
    .eq("organization_id", organizationId)
    .eq("source", "quickbooks_online")
    .like("external_id", `${exact}%`);
  if (error) throw new Error(error.message);
  const ids = (data || [])
    .filter((row) => !row.reviewed_at && (row.external_id === exact || String(row.external_id).startsWith(`${exact}:`)))
    .map((row) => row.id);
  if (!ids.length) return 0;
  const deleted = await admin.from("financial_transactions").delete().in("id", ids).select("id");
  if (deleted.error) throw new Error(deleted.error.message);
  return deleted.data?.length || 0;
}

async function pushHomeOps(input: {
  admin: SupabaseClient;
  organizationId: string;
  session: QboSession;
  accounts: Map<string, QboAccount>;
  classes: Map<string, string>;
  homes: HomeRow[];
}) {
  const fresh = await input.admin
    .from("financial_transactions")
    .select("*")
    .eq("organization_id", input.organizationId)
    .in("source", ["homeops", "rent", "bill", "owner"])
    .is("external_id", null)
    .order("tx_date", { ascending: false })
    .limit(40);
  if (fresh.error) throw new Error(fresh.error.message);
  const linked = await input.admin
    .from("financial_transactions")
    .select("*")
    .eq("organization_id", input.organizationId)
    .in("source", ["homeops", "rent", "bill", "owner"])
    .like("external_id", "qbo:JournalEntry:%")
    .order("updated_at", { ascending: false })
    .limit(40);
  if (linked.error) throw new Error(linked.error.message);
  const pending = [
    ...(fresh.data || []),
    ...(linked.data || []).filter((row) => snapshot(row) !== row.raw_data?.qbo?.snapshot),
  ].slice(0, 40);

  let pushed = 0;
  let errorMessage = "";
  const bank = await ensureBank(input.session, input.accounts);
  for (const row of pending) {
    if (!row.amount_cents || !row.tx_date) continue;
    try {
      const rawKind = String(row.kind || "");
      const kind: BookKind = isBookKind(rawKind) ? rawKind : row.flow_type === "income" ? "other_income" : "repairs";
      const category = await ensureNamedAccount(input.session, input.accounts, BOOK_KINDS[kind].account, accountSpec(kind));
      const home = input.homes.find((item) => item.id === row.property_id);
      const classId = home ? await ensureClass(input.session, input.classes, home.address1) : "";
      const existingId = /^qbo:JournalEntry:(\d+)$/.exec(String(row.external_id || ""))?.[1] || "";
      const syncToken = existingId ? String(row.raw_data?.qbo?.syncToken || "") || await journalSyncToken(input.session, existingId) : "";
      const created = await quickBooksRequest(input.session, "journalentry", {
        method: "POST",
        body: JSON.stringify(journalBody(row, kind, bank, category, classId, existingId, syncToken)),
      });
      const journal = created.JournalEntry as { Id?: string; SyncToken?: string } | undefined;
      if (!journal?.Id) throw new Error("QuickBooks did not return the journal entry.");
      const qbo = {
        direction: "outbound",
        entity: "JournalEntry",
        id: journal.Id,
        syncToken: journal.SyncToken || "",
        snapshot: snapshot(row),
      };
      const { error } = await input.admin.from("financial_transactions").update({
        external_id: `qbo:JournalEntry:${journal.Id}`,
        raw_data: { ...(row.raw_data || {}), qbo },
        updated_at: new Date().toISOString(),
      }).eq("id", row.id);
      if (error) throw new Error(error.message);
      pushed += 1;
    } catch (error) {
      if (error instanceof QboAuthError) throw error;
      errorMessage = error instanceof Error ? error.message : "A HomeOps entry could not be copied to QuickBooks.";
    }
  }
  return { pushed, error: errorMessage };
}

function journalBody(row: Record<string, any>, kind: BookKind, bankId: string, categoryId: string, classId: string, existingId: string, syncToken: string) {
  const amount = Math.round(Number(row.amount_cents)) / 100;
  const description = [row.description, row.vendor_name].filter(Boolean).join(" · ").slice(0, 4000);
  const categoryOnDebit = kind === "owner_disbursement" || kind === "deposit_return" || BOOK_KINDS[kind].flow === "expense";
  const classRef = classId ? { ClassRef: { value: classId } } : {};
  const line = (posting: "Debit" | "Credit", accountId: string, withClass: boolean) => ({
    Amount: amount,
    Description: description,
    DetailType: "JournalEntryLineDetail",
    JournalEntryLineDetail: {
      PostingType: posting,
      AccountRef: { value: accountId },
      ...(withClass ? classRef : {}),
    },
  });
  return {
    ...(existingId ? { Id: existingId, SyncToken: syncToken || "0" } : {}),
    TxnDate: String(row.tx_date).slice(0, 10),
    PrivateNote: `${HOMEOPS_NOTE_PREFIX}${row.id}`,
    DocNumber: `HO${String(row.id).replace(/-/g, "").slice(0, 12)}`,
    Line: categoryOnDebit
      ? [line("Debit", categoryId, true), line("Credit", bankId, false)]
      : [line("Debit", bankId, false), line("Credit", categoryId, true)],
  };
}

async function journalSyncToken(session: QboSession, id: string) {
  if (!/^\d+$/.test(id)) return "";
  const payload = await qboQuery(session, `select SyncToken from JournalEntry where Id = '${id}'`);
  return String((payload.QueryResponse as { JournalEntry?: { SyncToken?: string }[] } | undefined)?.JournalEntry?.[0]?.SyncToken || "");
}

type QboAccount = { Id: string; Name: string; AccountType?: string; Active?: boolean };

async function loadAccounts(session: QboSession) {
  const accounts = new Map<string, QboAccount>();
  for (let page = 0; page < 10; page += 1) {
    const start = page * 100 + 1;
    const payload = await qboQuery(session, `select Id, Name, AccountType, Active from Account startposition ${start} maxresults 100`);
    const batch = ((payload.QueryResponse as { Account?: QboAccount[] } | undefined)?.Account) || [];
    for (const account of batch) if (account.Id) accounts.set(account.Id, account);
    if (batch.length < 100) break;
  }
  return accounts;
}

async function loadClasses(session: QboSession) {
  const classes = new Map<string, string>();
  try {
    const payload = await qboQuery(session, "select Id, Name from Class maxresults 1000");
    for (const item of ((payload.QueryResponse as { Class?: { Id?: string; Name?: string }[] } | undefined)?.Class) || []) {
      if (item.Id && item.Name) classes.set(item.Id, item.Name);
    }
  } catch {
    // Class tracking may be off. Door names still go out in the description.
  }
  return classes;
}

function lookupsFrom(accounts: Map<string, QboAccount>, classes: Map<string, string>): QboLookups {
  return {
    accountNames: new Map([...accounts].map(([id, account]) => [id, account.Name])),
    accountTypes: new Map([...accounts].filter(([, account]) => account.AccountType).map(([id, account]) => [id, account.AccountType || ""])),
    classNames: classes,
  };
}

async function ensureBank(session: QboSession, accounts: Map<string, QboAccount>) {
  const banks = [...accounts.values()].filter((account) => account.AccountType === "Bank" && account.Active !== false);
  const preferred = banks.find((account) => /check|operating|primary/i.test(account.Name)) || banks[0];
  if (preferred) return preferred.Id;
  try {
    return await ensureNamedAccount(session, accounts, "HomeOps Clearing", { type: "Bank", sub: "Checking" });
  } catch {
    return ensureNamedAccount(session, accounts, "HomeOps Clearing", { type: "Other Current Liability", sub: "OtherCurrentLiabilities" });
  }
}

async function ensureNamedAccount(session: QboSession, accounts: Map<string, QboAccount>, name: string, spec: { type: string; sub: string }) {
  const found = [...accounts.values()].find((account) => account.Name.toLowerCase() === name.toLowerCase() && account.Active !== false);
  if (found) return found.Id;
  try {
    const created = await quickBooksRequest(session, "account", {
      method: "POST",
      body: JSON.stringify({ Name: name.slice(0, 100), AccountType: spec.type, AccountSubType: spec.sub }),
    });
    const account = created.Account as QboAccount | undefined;
    if (!account?.Id) throw new Error(`QuickBooks did not create ${name}.`);
    accounts.set(account.Id, account);
    return account.Id;
  } catch (error) {
    const payload = await qboQuery(session, `select * from Account where Name = '${name.replace(/'/g, "\\'")}'`);
    const existing = ((payload.QueryResponse as { Account?: QboAccount[] } | undefined)?.Account) || [];
    if (existing[0]?.Id) {
      accounts.set(existing[0].Id, existing[0]);
      return existing[0].Id;
    }
    throw error;
  }
}

async function ensureClass(session: QboSession, classes: Map<string, string>, name: string) {
  const key = name.toLowerCase();
  for (const [id, label] of classes) if (label.toLowerCase() === key) return id;
  try {
    const created = await quickBooksRequest(session, "class", {
      method: "POST",
      body: JSON.stringify({ Name: name.slice(0, 100) }),
    });
    const id = String((created.Class as { Id?: string } | undefined)?.Id || "");
    if (id) classes.set(id, name);
    return id;
  } catch {
    return "";
  }
}

function accountSpec(kind: BookKind) {
  if (kind === "owner_contribution") return { type: "Equity", sub: "OwnersEquity" };
  if (kind === "owner_disbursement") return { type: "Equity", sub: "PartnerDistributions" };
  if (kind === "deposit_hold" || kind === "deposit_return") return { type: "Other Current Liability", sub: "OtherCurrentLiabilities" };
  if (BOOK_KINDS[kind].flow === "income") return { type: "Income", sub: "ServiceFeeIncome" };
  if (kind === "insurance") return { type: "Expense", sub: "Insurance" };
  if (kind === "utilities") return { type: "Expense", sub: "Utilities" };
  if (kind === "taxes") return { type: "Expense", sub: "TaxesPaid" };
  if (kind === "overhead") return { type: "Expense", sub: "OfficeGeneralAdministrativeExpenses" };
  return { type: "Expense", sub: "RepairMaintenance" };
}

async function loadHomes(admin: SupabaseClient, organizationId: string) {
  const { data, error } = await admin.from("homes").select("id, address1, city, state, property_code, owner_id").eq("organization_id", organizationId);
  if (error) throw new Error(error.message);
  return (data || []) as HomeRow[];
}

async function loadAliases(admin: SupabaseClient, organizationId: string) {
  const { data, error } = await admin
    .from("property_source_aliases")
    .select("home_id, alias_type, alias_value")
    .eq("organization_id", organizationId)
    .eq("source_system", "quickbooks");
  if (error) throw new Error(error.message);
  return (data || []) as QboAlias[];
}

function snapshot(row: Record<string, any>) {
  return [row.tx_date, row.amount_cents, row.kind || "", row.flow_type, row.description || "", row.vendor_name || "", row.property_id || ""].join("|");
}

function advanceSchedule(mode: QboSyncMode, trigger: SyncTrigger, schedule: QboSchedule, currentNext: string | null, success: boolean) {
  if (mode === "automatic") {
    return { schedule, nextRunAt: new Date(Date.now() + AUTOMATIC_INTERVAL_MS).toISOString() };
  }
  if (mode === "once" && trigger === "once" && success) {
    return { schedule: { ...schedule, completedAt: new Date().toISOString() }, nextRunAt: null };
  }
  if (mode === "recurring" && trigger === "recurring" && success) {
    return { schedule, nextRunAt: nextRecurringRun(schedule).toISOString() };
  }
  return { schedule, nextRunAt: currentNext };
}

function lockActive(metadata: Record<string, unknown>) {
  const at = Date.parse(String(metadata.sync_lock || ""));
  return Number.isFinite(at) && Date.now() - at < LOCK_MS;
}

function monthsAgo(months: number) {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() - months);
  return date.toISOString().slice(0, 10);
}

function shiftDate(iso: string, days: number) {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function pushError(result: QboSyncResult, message: string) {
  if (result.errors.length < 8) result.errors.push(message);
}
