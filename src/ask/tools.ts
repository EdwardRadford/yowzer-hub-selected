// ask/tools.ts — THE TOOL SURFACE. Everything the Hub can see and everything
// the Hub can do, as one registry the model chooses from.
//
// Ed, verbatim: "the chat feature has to be outstanding. dont lock it down too
// much - it needs to be quick and accurate." DESIGN/SYSTEM.md: "Ask… has every
// tool the Hub has — every read model and every mutation in packages/data —
// with writes routed through the operator's ledger so they are logged,
// undoable, and honour the dial, the rails and Pause. No topic fences."
//
// So there are no topic fences in here. There is no allow-list of questions, no
// intent router deciding what Ask is permitted to look at, and no accessor held
// back because a question about it "isn't what Ask is for". The model sees the
// whole business and picks.
//
// ONE REGISTRY, DERIVED TWICE — the schemas Anthropic receives and the code
// that runs a call are THE SAME OBJECTS (agents/strategy-tools.ts's lesson:
// 1.0 kept a hand-written schema array beside a hand-written dispatch switch,
// and they drifted). `askToolDefinitions()` and `buildAskToolExecutor()` are
// both projections of ASK_TOOLS.
//
// ── THE TWO KINDS OF WRITE, AND WHY THERE ARE TWO ─────────────────────────
//
// LEDGER WRITES (`via: 'ledger'`) — anything done TO the business or a
// customer: create a job, move a stage, book a fitting, draft or edit a quote,
// chase somebody. Every one of these is proposed through operator/propose.ts
// with a mapped `capability`, exactly like a producer's own proposal, so it is:
//   · decided by the owner's DIAL (done now, or queued on Decide as an ask),
//   · held by the RAILS (never-contact, quote value, tone, quiet hours),
//   · blocked entirely while PAUSED (the row parks at 'proposed'),
//   · logged in one ledger with an UNDO, and
//   · shadow until OPERATOR_LIVE=true, like everything else the operator does.
// Ask gets NO privileged path. "Callum asked me to" is a reason, not a bypass.
//
// CONTROL WRITES (`via: 'direct'`) — the OWNER'S OWN CONTROLS: Pause/Resume,
// approving or declining a queued decision, the dial, the rails, the house
// rules, the custom domain. These deliberately do NOT go through the ledger,
// for three reasons that all point the same way:
//   1. There is no ActionKind for them (operator/contract.ts), and inventing a
//      fake one to route through would be a lie about what the ledger holds.
//   2. Pause is the KILL SWITCH. Routing it through the machinery it switches
//      off is a circular dependency with an obvious failure mode: "pause
//      everything" must work when everything else is broken.
//   3. Approving a queued action IS the human decision the ledger was waiting
//      for. Queueing an approval for approval is a loop.
// They are not unguarded: each one calls the same request-path function the
// settings screen calls, which enforces the same owner/manager role check and
// the same RLS as a click would.
//
// ALL OF IT IS REACHABLE NOW (2026-09-03). This paragraph used to name five
// mutations Ask could describe but never do — sending a quote, creating and
// sending a proof, revising a quote, cancelling a fitting — because none of
// them had an `ActionKind` in operator/contract.ts to travel on. The contract
// gained `send_quote`, `create_proof`, `send_proof`, `revise_quote`,
// `cancel_fitting` and `unblock_stage`; operator/execute.ts gained the ports;
// and all six are ordinary ledger writes below. Nothing else had to change,
// which is the whole point of the seam.

import { canSeeMoney, type Ctx } from '../ctx';
import type { ClaudeToolDefinition } from '../ai/types';
import type { Capability, ActionKind, ProposedAction } from '../operator/contract';
import { OperatorForbiddenError, type ActionRecord } from '../operator/types';
import type { Executors } from '../operator/execute';
import { proposeActionWithOutcome, type ProposeOutcome } from '../operator/propose';
import { productionExecutors } from '../operator/run';
import { approveAction, declineAction, getAction } from '../operator/decide';
import { pauseOperator, resumeOperator, getOperatorStatus } from '../operator/pause';
import { getDialAndRails, resolvedDial, setAutonomy, setRails, isCapability, isAutonomyMode, type Rails } from '../operator/dial';
import { getHouseRules, saveHouseRules } from '../operator/house-rules';
import { getFeed } from '../operator/feed';
// The seven read models Ask could not reach until 2026-09-03 — see READ_TOOLS.
import { searchMemory } from '../memory';
import { suggest } from '../estimator';
import { negotiate } from '../engines/negotiation';
import { taxTreatmentFor } from '../tax';
import { assetsFor } from '../sites';
import { hoursOnJob } from '../time';
import { weeklyReview } from '../engines/review';

import { getTenantBusinessConfig } from '../config';
import { getAskCounts } from '../counts';
import {
  getFinancialSummary,
  getOverdueInvoices,
  getRecentInvoices,
  getCustomerInvoices,
  getInvoiceByNumber,
  getInvoiceSuperlative,
  getSupplierSpendSummary,
  REVENUE_INCLUDED_STATUSES,
  OUTSTANDING_EXCLUDED_STATUSES,
  type CustomerInvoice,
} from '../money';
import {
  getCustomer,
  searchCustomersByName,
  findCustomersByPhone,
  getCustomerExtremes,
  getLastContactAt,
  type CustomerSearchMatch,
  type PhoneLookupMatch,
} from '../customers';
import { getJobDetail, getJobStatusOverview, isStoppedJob, coldEnquiriesFrom, type JobStatusOverviewItem } from '../jobs';
import { londonDayNumber, londonDayNumberFromDateKey } from '../day-boundary';
import { getDay } from '../day';
import { getWaiting } from '../waiting';
import { getFigures } from '../figures';
import { getBriefing } from '../briefing';
import { getSeasonalityIndex } from '../engines/seasonality';
import { getReorderDueCustomers } from '../engines/reorder-cadence';
import { getMaterialCostCreep } from '../engines/cost-creep';
import { getQuoteFunnel } from '../engines/quote-funnel';
import { getCustomerHealthSignals } from '../engines/customer-health';
import { getCashFlowForecast, getCustomerPaymentAnomalies } from '../engines/cash-forecast';
import { suggestPrice, getPriceBookCoverage, getPriceBookTierAcceptance } from '../price-book';
import { buildPriceBasis, type PriceBasisProvenance } from '../pricing/provenance';
import { setCustomDomain } from '../tenants';
import { degradations } from '../health/run';
import { getCompleteness } from '../completeness';
import { wrapCustomerText } from './untrusted-wrap';

// ===========================================================================
// THE SHAPES
// ===========================================================================

/** Everything a tool needs to run one call. Assembled once per question by ask.ts. */
export interface AskToolCtx {
  ctx: Ctx;
  /** Injectable clock — every accessor that takes a `now` gets THIS one, so an answer is internally consistent even if it takes ten seconds to write. */
  now: Date;
  /** The owner's own words, verbatim — becomes the ledger `reasoning` on a write, so Decide says why a queued action exists. */
  question: string;
  /** TEST SEAM: replaces the real operator. Omit in production. */
  propose?: ProposeFn;
  /** The operator's ports. Defaults to `productionExecutors()`; every test injects its own. */
  executors?: Executors;
  /** Overrides the OPERATOR_LIVE env read, exactly as ExecuteDeps.live does. */
  live?: boolean;
}

export type ProposeFn = (
  tenantId: string,
  action: ProposedAction,
  deps: { executors: Executors; live?: boolean; now?: Date },
) => Promise<ProposeOutcome>;

/** What a pure `build` needs beyond the facts. */
export interface AskBuildMeta {
  now: Date;
  ctx: Ctx;
  /** The question that caused this write, trimmed — the ledger's reasoning is built from it. */
  question: string;
}

/** The two forms of the same phrase a write needs: "book Dean in for J-1042" / "booked Dean in for J-1042". */
export interface AskPhrases {
  /** Infinitive — "move J-1042 to make". Used in the reasoning and in "I would have…". */
  todo: string;
  /** Past — "moved J-1042 to make". Used in "Done — I…". */
  did: string;
}

interface AskToolBase {
  name: string;
  /** Written FOR THE MODEL: what it answers, and where it matters, what it does NOT. */
  description: string;
  /** Anthropic's `input_schema` — a JSON Schema object. Named as the wire names it, since that is what it is. */
  input_schema: Record<string, unknown>;
  /** True when the underlying accessor is canSeeMoney-gated. The executor refuses outright rather than returning an empty shape — the model must know WHY it got nothing. */
  moneyGated: boolean;
}

export interface AskReadTool extends AskToolBase {
  kind: 'read';
  run(c: AskToolCtx, input: Record<string, unknown>): Promise<unknown>;
}

export interface AskLedgerWriteTool extends AskToolBase {
  kind: 'write';
  via: 'ledger';
  capability: Capability;
  actionKind: ActionKind;
  /** IO + validation: ids resolved, emails looked up, £ figures GROUNDED from the database. Throws AskToolRefusal with a sentence the model can act on. */
  resolve(c: AskToolCtx, input: Record<string, unknown>): Promise<AskFacts>;
  /** PURE. Facts in, a valid ProposedAction out. Unit-tested with no database — see tools.test.ts. */
  build(facts: AskFacts, meta: AskBuildMeta): ProposedAction;
  /** PURE. How this write reads in plain words, both tenses. */
  phrases(facts: AskFacts): AskPhrases;
}

export interface AskControlWriteTool extends AskToolBase {
  kind: 'write';
  via: 'direct';
  /** Returns the sentence the employee says about what just happened. */
  run(c: AskToolCtx, input: Record<string, unknown>): Promise<string>;
}

export type AskWriteTool = AskLedgerWriteTool | AskControlWriteTool;
export type AskTool = AskReadTool | AskWriteTool;

/** The resolved facts a pure `build` consumes. Deliberately loose — every tool's own shape, verified by that tool's `resolve`. */
export type AskFacts = Record<string, unknown>;

/** A tool declining, in words the MODEL reads and can act on ("that customer has no email address — ask for one"). Never an internal error string. */
export class AskToolRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AskToolRefusal';
  }
}

// ===========================================================================
// SMALL PURE HELPERS
// ===========================================================================

const NO_ARGS: Record<string, unknown> = { type: 'object', properties: {}, required: [] };

function schema(properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> {
  return { type: 'object', properties, required };
}

/** An integer argument, clamped. Anything unparseable falls back to the accessor's own default (undefined), never to a guess. */
function intArg(input: Record<string, unknown>, key: string, min: number, max: number): number | undefined {
  const raw = input[key];
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function numberArg(input: Record<string, unknown>, key: string): number | undefined {
  const raw = input[key];
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  return Number.isFinite(value) ? value : undefined;
}

function stringArg(input: Record<string, unknown>, key: string): string | null {
  const raw = input[key];
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
}

/**
 * `"YYYY-MM-DD"` -> its Europe/London day number (day-boundary.ts's own
 * `londonDayNumberFromDateKey`), for a tool argument that names a CALENDAR
 * DAY rather than an instant. Absent is fine (returns undefined, unset); a
 * present-but-unparseable value is a refusal, not a silently ignored filter
 * — a date question that gets the WHOLE board back with no explanation is a
 * worse answer than an honest "I couldn't read that date".
 */
function dateKeyArg(input: Record<string, unknown>, key: string, tool: string): number | undefined {
  const raw = stringArg(input, key);
  if (raw === null) return undefined;
  const dayNumber = londonDayNumberFromDateKey(raw);
  if (dayNumber === null) throw new AskToolRefusal(`${tool}'s "${key}" needs the shape YYYY-MM-DD (got "${raw}").`);
  return dayNumber;
}

/** A required string argument, or a refusal the model can act on. */
function requireString(input: Record<string, unknown>, key: string, tool: string): string {
  const value = stringArg(input, key);
  if (!value) throw new AskToolRefusal(`${tool} needs "${key}". Take the id from another tool's result — never invent one.`);
  return value;
}

function requireFact(facts: AskFacts, key: string): string {
  const value = facts[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`ask/tools: fact "${key}" is required and was missing — resolve() must set it before build().`);
  }
  return value;
}

function optionalFact(facts: AskFacts, key: string): string | undefined {
  const value = facts[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

/**
 * FNV-1a, 32-bit, hex. Small, pure, deterministic and dependency-free — this is
 * an idempotency discriminator, not a security primitive.
 */
export function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** The London calendar day, `YYYY-MM-DD`. */
function londonDayStamp(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/**
 * THE IDEMPOTENCY KEY for anything Ask proposes.
 *
 * Scoped to the tool, the person who asked, the London DAY and a hash of the
 * arguments — so asking twice in one conversation ("book it… actually book it")
 * is ONE ledger row, while the same instruction genuinely given again next week
 * is a new one. Pure and exported so the invariant is testable.
 */
export function askIdempotencyKey(tool: string, userId: string, facts: unknown, now: Date): string {
  return `ask:${tool}:${userId}:${londonDayStamp(now)}:${stableHash(JSON.stringify(facts ?? {}))}`;
}

/** The ledger `reasoning` every Ask write carries: why this row exists, in one sentence, on the Decide line. */
export function askReasoning(phrases: AskPhrases): string {
  return `You asked me to ${phrases.todo}`;
}

/** Pounds → integer pence, or null. */
function toPence(pounds: number | undefined): number | null {
  return pounds === undefined || !Number.isFinite(pounds) ? null : Math.round(pounds * 100);
}

/**
 * ROUND MONEY AT THE SOURCE — every number a tool hands to the model, rounded
 * to at most 2 decimal places. Engines compute in floating-point pounds
 * (seasonality's multi-year averages, cash-forecast's medians, and anything
 * else derived rather than stored) and float noise like `12164.998` leaking
 * into an answer is a bug in THIS boundary, not in every engine that could
 * ever produce one — so it is fixed once, here, rather than chased through
 * each engine. Applied to every read tool's result before it reaches the
 * model. Harmless on non-money numbers (counts, percentages, day-gaps are
 * already whole or already short) and on `…Pence` fields (already integer).
 */
export function moneyOut<T>(value: T): T {
  const round = (v: unknown): unknown => {
    if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : v;
    if (Array.isArray(v)) return v.map(round);
    if (v !== null && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(v as Record<string, unknown>)) out[key] = round(child);
      return out;
    }
    return v;
  };
  return round(value) as T;
}

/**
 * DROPS null/undefined KEYS FROM ONE FLAT OBJECT — never touches a present
 * value, so this can never change what a model reads as TRUE, only remove the
 * `"field":null` boilerplate for a field that carries no information anyway.
 * Added for jobs_overview (2026-09-04): the unfiltered board is dozens of jobs
 * each carrying several fields that are null on any ordinary (not blocked, not
 * stopped) job — blockedReason, stoppedReasonCode/Note/ReturnBy — and repeating
 * `"blockedReason":null,"stoppedReasonCode":null,...` on every one of them was
 * a meaningful slice of a ~13,000-token tool result on the whole-board
 * questions (measured: QA/ask-results/<date>-latency.md), which is real model
 * TTFT and generation time on the NEXT round, not database time (every
 * jobs_overview call itself runs in under 25ms on the seeded demo).
 * Deliberately ONE LEVEL — every caller passes a flat row, never a tree, so
 * there is no recursion to get wrong.
 */
export function dropNullFields<T extends Record<string, unknown>>(row: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value !== null && value !== undefined) (out as Record<string, unknown>)[key] = value;
  }
  return out;
}

/**
 * ONE customer's money, summed from invoice rows the tool ALREADY fetched —
 * never left for the model to add up. Mirrors getFinancialSummary's own
 * definitions (REVENUE_INCLUDED_STATUSES, OUTSTANDING_EXCLUDED_STATUSES) but
 * scoped to one customer's rows rather than a fresh query, since
 * getCustomerInvoices already returned everything needed. `null` for a login
 * that cannot see money (money fields on CustomerInvoice are null'd already).
 */
export interface CustomerMoneySummary {
  /** Sum of ACCREC invoice totals issued in the trailing 12 months, AUTHORISED or PAID only. */
  revenueLast12mPence: number | null;
  /** Sum of amountPaid across every ACCREC invoice that is not voided or deleted. */
  paidTotalPence: number | null;
  /** Sum of amountDue across every ACCREC invoice not yet paid/voided/deleted — matches `customer`'s own `balance`. */
  outstandingPence: number | null;
}

export function customerMoneySummary(invoices: readonly CustomerInvoice[], now: Date, canSeeMoneyHere: boolean): CustomerMoneySummary {
  if (!canSeeMoneyHere) return { revenueLast12mPence: null, paidTotalPence: null, outstandingPence: null };

  const twelveMonthsAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  let revenue = 0;
  let paid = 0;
  let outstanding = 0;
  for (const inv of invoices) {
    if (inv.type !== 'ACCREC') continue; // getCustomerInvoices only ever returns ACCREC/ACCPAY — bills are the OTHER side of the ledger.
    const status = inv.status ?? '';
    if (
      inv.total !== null &&
      REVENUE_INCLUDED_STATUSES.includes(status) &&
      inv.issuedAt !== null &&
      new Date(inv.issuedAt).getTime() >= twelveMonthsAgo.getTime()
    ) {
      revenue += inv.total;
    }
    if (inv.amountPaid !== null && !['VOIDED', 'DELETED'].includes(status)) paid += inv.amountPaid;
    if (inv.amountDue !== null && !OUTSTANDING_EXCLUDED_STATUSES.includes(status)) outstanding += inv.amountDue;
  }
  return {
    revenueLast12mPence: Math.round(revenue * 100),
    paidTotalPence: Math.round(paid * 100),
    outstandingPence: Math.round(outstanding * 100),
  };
}

// ===========================================================================
// THE READ TOOLS
// ===========================================================================
// Every accessor and engine in the package that takes a `(ctx, …)` and returns
// data. Descriptions say what a figure MEANS where a wrong reading would produce
// a wrong number — "totalOverdue is tenant-wide, `overdue[]` is a capped list;
// never add the list up" is the single most valuable sentence in this file.

/**
 * The stage a job is actually ON: the first one still in flight (in_progress,
 * then blocked, then not started), falling back to the last completed one.
 * getJobDetail returns the whole ordered stage list rather than a single
 * "current stage" field, so this is the one place that reads it that way.
 */
function currentStageOf(job: { stages: { stage: string; status: string; sortOrder: number }[] }): string | null {
  const ordered = [...job.stages].sort((a, b) => a.sortOrder - b.sortOrder);
  const live = ordered.find((s) => s.status === 'in_progress') ?? ordered.find((s) => s.status === 'blocked') ?? ordered.find((s) => s.status === 'not_started');
  if (live) return live.stage;
  const done = [...ordered].reverse().find((s) => s.status === 'complete' || s.status === 'completed');
  return done?.stage ?? null;
}

/** The three ways setCustomDomain can refuse, as sentences rather than codes. */
const SET_DOMAIN_REFUSAL: Readonly<Record<'forbidden' | 'invalid_hostname' | 'taken', string>> = {
  forbidden: 'Only the owner can point the Hub at a domain.',
  invalid_hostname: 'That is not a hostname I can use — it needs to look like hub.example.co.uk.',
  taken: 'Another business has already claimed that domain.',
};

/** "What work is at risk", composed the way /today composes it — stopped work first, then early leads nobody has touched, with no job in both lists. */
async function jobsAtRisk(ctx: Ctx, now: Date): Promise<{ stalled: unknown[]; cold: unknown[] }> {
  const overview = await getJobStatusOverview(ctx, { now });
  const strip = (j: JobStatusOverviewItem) => ({
    jobId: j.jobId,
    ref: j.ref,
    title: j.title,
    customerName: j.customerName,
    stage: j.currentStage,
    daysSinceLastEvent: j.daysSinceLastEvent,
  });
  const stalledItems = overview.jobs.filter(isStoppedJob);
  const stalledIds = new Set(stalledItems.map((j) => j.jobId));
  const coldIds = new Set(coldEnquiriesFrom(overview.jobs, stalledIds, now).map((c) => c.jobId));
  return { stalled: stalledItems.map(strip), cold: overview.jobs.filter((j) => coldIds.has(j.jobId)).map(strip) };
}

export interface ConcentrationCustomer {
  customerId: string;
  name: string;
  revenuePence: number;
  /** This customer's share of total revenue, 0-100, one decimal place. */
  sharePct: number;
}

export interface Concentration {
  /** How many customers `customers` actually holds — fewer than requested `topN` when the book has fewer customers than that. */
  topN: number;
  /** Best-first, same ordering as financial_summary's own topCustomers. */
  customers: ConcentrationCustomer[];
  /** The SUM of `customers`' revenue — never re-add the list, this IS the total. */
  topNSumPence: number;
  /** `topNSumPence` as a share of total revenue, 0-100, one decimal place — "top two share" lives here, already computed. */
  topNSharePct: number;
  totalRevenuePence: number;
  /** Trailing months this is measured over — same window financial_summary used. */
  windowMonths: number;
}

/**
 * Top-N customer revenue concentration — same threshold logic
 * producers/alerts.ts's concentrationAlertProducer uses (top TWO, 50%), but
 * generalised to any N so "what share do our top three hold" has an answer
 * with the sum already done. Built on getFinancialSummary's own
 * topCustomers/totalRevenue rather than a fresh query — one source of truth
 * for "who earns us the most". Money-gated (financial_summary is).
 */
async function getConcentration(ctx: Ctx, now: Date, topN: number): Promise<Concentration | null> {
  const summary = await getFinancialSummary(ctx, { now });
  if (!summary) return null;
  const top = summary.topCustomers.slice(0, Math.max(1, topN));
  const topNSum = top.reduce((sum, cust) => sum + cust.revenue, 0);
  const share = (part: number): number => (summary.totalRevenue > 0 ? Math.round((part / summary.totalRevenue) * 1000) / 10 : 0);
  return {
    topN: top.length,
    customers: top.map((cust) => ({
      customerId: cust.customerId,
      name: cust.name,
      revenuePence: Math.round(cust.revenue * 100),
      sharePct: share(cust.revenue),
    })),
    topNSumPence: Math.round(topNSum * 100),
    topNSharePct: share(topNSum),
    totalRevenuePence: Math.round(summary.totalRevenue * 100),
    windowMonths: summary.windowMonths,
  };
}

const READ_TOOLS: readonly AskReadTool[] = [
  // ─── THE SEVEN THAT WERE BUILT BUT UNASKABLE (2026-09-03) ───────────────
  //
  // Every one of these is a read model somebody built, tested and shipped,
  // and that Ask had no way to call — so "how many hours went on the Bell
  // Inn?" got a shrug from an employee that had the answer in a table.
  // DESIGN/SYSTEM.md's rule 10 is "the Hub can do anything it can possibly
  // do"; these seven were the gap between that sentence and the truth.
  {
    name: 'search_memory',
    description:
      'Search everything ever written down about this business — job notes, event trails, past decisions — in plain words. Use it when somebody asks about something that happened and you do not know where it lives.',
    input_schema: schema(
      {
        query: { type: 'string', description: 'What to look for, in the words a person would use.' },
        limit: { type: 'number', description: 'How many matches. Defaults to a sensible few.' },
      },
      ['query'],
    ),
    kind: 'read',
    moneyGated: false,
    run: (c, input) => searchMemory(c.ctx, requireString(input, 'query', 'search_memory'), { limit: intArg(input, 'limit', 1, 50) }),
  },
  {
    name: 'suggest_price',
    description:
      "What this shop would charge for a line of work: its own product book first (real materials, labour and machine rates), then what it has charged for similar work before. Say WHAT the line is, in the shop's own words.",
    input_schema: schema({ description: { type: 'string', description: 'The line, e.g. "shop fascia, printed vinyl on ACM".' } }, ['description']),
    kind: 'read',
    moneyGated: true,
    run: (c, input) => suggest(c.ctx, requireString(input, 'description', 'suggest_price')),
  },
  {
    name: 'negotiate',
    description:
      'A customer has asked for a discount. Say what it does to the margin and whether it is worth taking — grounded in this shop’s own floor, never a guess. Give the ask as a new TOTAL in pence, or as a percentage off.',
    input_schema: schema(
      {
        quoteId: { type: 'string' },
        askedPence: { type: 'number', description: 'The new total they want to pay, in PENCE.' },
        percent: { type: 'number', description: 'Or the discount they asked for, as a percentage.' },
      },
      ['quoteId'],
    ),
    kind: 'read',
    moneyGated: true,
    run: (c, input) =>
      negotiate(c.ctx, {
        quoteId: requireString(input, 'quoteId', 'negotiate'),
        askedPence: numberArg(input, 'askedPence'),
        percent: numberArg(input, 'percent'),
      }),
  },
  {
    name: 'tax_treatment',
    description:
      'Whether a job or quote falls inside CIS or the VAT domestic reverse charge, and what to put on the invoice. Ask BEFORE quoting construction work for another trade — finding out afterwards means reissuing.',
    input_schema: schema({
      quoteId: { type: 'string' },
      jobId: { type: 'string', description: 'Use when there is no quote yet.' },
    }),
    kind: 'read',
    moneyGated: false,
    run: (c, input) =>
      taxTreatmentFor(c.ctx, {
        quoteId: stringArg(input, 'quoteId') ?? undefined,
        jobId: stringArg(input, 'jobId') ?? undefined,
      }),
  },
  {
    name: 'customer_signs',
    description:
      "Every sign this customer has, where it is, when it went up and when it was last looked at. The record behind a maintenance offer, a storm check-in or “what did we do for them?”",
    input_schema: schema({ customerId: { type: 'string', description: 'From find_customer.' } }, ['customerId']),
    kind: 'read',
    moneyGated: false,
    run: (c, input) => assetsFor(c.ctx, requireString(input, 'customerId', 'customer_signs')),
  },
  {
    name: 'hours_on_job',
    description:
      'How long a job has actually taken — clocked hours, by person and by kind, with the quoted estimate beside it where there is one.',
    input_schema: schema({ jobId: { type: 'string' } }, ['jobId']),
    kind: 'read',
    moneyGated: false,
    run: (c, input) => hoursOnJob(c.ctx, requireString(input, 'jobId', 'hours_on_job')),
  },
  {
    name: 'week_in_review',
    description:
      'Last week, written out: what came in, what went out, what changed and what it means. Use it for "how did we do?" rather than assembling an answer from six other tools.',
    input_schema: NO_ARGS,
    kind: 'read',
    moneyGated: true,
    run: (c) => weeklyReview(c.ctx),
  },

  {
    name: 'business_config',
    description: "The business's own identity — name, trade, who runs the day. Call it when you need to name the business or its people.",
    input_schema: NO_ARGS,
    kind: 'read',
    moneyGated: false,
    run: (c) => getTenantBusinessConfig(c.ctx),
  },
  {
    name: 'briefing',
    description:
      'TODAY, as the employee already sees it on the home screen: the headline for the day, what I have done, what needs the owner, and the stories behind each. The fastest way to answer "what is going on" or "what should I look at" — it is one query and it is already composed.',
    input_schema: NO_ARGS,
    kind: 'read',
    moneyGated: false,
    run: (c) => getBriefing(c.ctx, { now: c.now }),
  },
  {
    name: 'day',
    description:
      "The DIARY for one day: fittings and surveys with their times and who is on them, plus the work in the workshop. Use it for 'who is fitting today', 'what is Dean on', 'what is on tomorrow'. `date` is any instant inside the day you want (ISO); default today. ONLY the fittings/surveys are actually scoped to `date` — the workshop-stage sections (who is in make, what is blocked) always reflect the CURRENT state, whatever `date` you pass, because there is no historical snapshot of the board. So this tool is for TODAY or TOMORROW, never a past day — asking it about last Friday gets you a truthful diary for that date but today's workshop makeup relabelled as if it were Friday's, which is misleading. For 'what came in last Friday' or any other retrospective question, use jobs_overview instead and read each job's own createdAt.",
    input_schema: schema({ date: { type: 'string', description: 'ISO date or timestamp inside the day you want. Default today.' } }),
    kind: 'read',
    moneyGated: false,
    run: (c, input) => {
      const raw = stringArg(input, 'date');
      const date = raw ? new Date(raw) : c.now;
      return getDay(c.ctx, { date: Number.isNaN(date.getTime()) ? c.now : date });
    },
  },
  {
    name: 'waiting',
    description:
      'Everything WAITING ON SOMEONE ELSE — quotes out, proofs out, approvals, deliveries — late first, with how long each has been out. The answer to "what are we waiting on" and "who has not come back to us".',
    input_schema: NO_ARGS,
    kind: 'read',
    moneyGated: false,
    run: (c) => getWaiting(c.ctx, { now: c.now }),
  },
  {
    name: 'figures',
    description:
      "The home screen's own tallies: `overduePence`/`overdueCount` (tenant-wide, integer PENCE), `chasedCount` (chases sent this week), `quotesGoingCold`, `dueToReorder`, `doneForYouToday`, and tomorrow's diary counts. NOTE `cashInThisWeekPence` is the cash forecast's MEDIAN EXPECTED INFLOW for this week — money we expect to ARRIVE, never money already received; say \"expected in\", never \"has come in\". `cashOutThisWeekPence` is always null: nothing in this system forecasts outflow. Money-gated.",
    input_schema: NO_ARGS,
    kind: 'read',
    moneyGated: true,
    run: (c) => getFigures(c.ctx, { now: c.now }),
  },
  {
    name: 'counts',
    description: 'The plain tenant-wide tallies (open jobs, customers, quotes out, and the rest) — the denominator for any "how big is this" judgement.',
    input_schema: NO_ARGS,
    kind: 'read',
    moneyGated: false,
    run: (c) => getAskCounts(c.ctx),
  },
  {
    name: 'financial_summary',
    description:
      'The revenue picture: revenue by calendar month (oldest first), total, invoice count, average invoice value, top customers, plus everything outstanding and the overdue slice. `months` sets the trailing window (default 12). `outstanding`/`overdue` are tenant-wide and NOT limited to the window. Money-gated.',
    input_schema: schema({ months: { type: 'integer', description: 'Trailing calendar months. Default 12.' } }),
    kind: 'read',
    moneyGated: true,
    run: (c, input) => getFinancialSummary(c.ctx, { months: intArg(input, 'months', 1, 120), now: c.now }),
  },
  {
    name: 'concentration',
    description:
      'How much of revenue sits with the top few customers — "what share do our top two/three hold" or "combined revenue from X and Y". `customers` lists each one\'s own revenue; `topNSumPence` and `topNSharePct` are the SUM and SHARE ALREADY COMPUTED — never add the individual figures yourself, quote these. `topN` defaults to 2 (the concentration-risk pairing producers/alerts.ts watches). Money-gated.',
    input_schema: schema({ topN: { type: 'integer', description: 'How many top customers to sum. Default 2.' } }),
    kind: 'read',
    moneyGated: true,
    run: (c, input) => getConcentration(c.ctx, c.now, intArg(input, 'topN', 1, 10) ?? 2),
  },
  {
    name: 'overdue_invoices',
    description:
      'Money owed and late. `totalOverdue`/`count` are the TRUE tenant-wide figures; `overdue[]` is a capped worst-first list for naming specific debts — NEVER add that list up and present the sum as the total. `agedTotal`/`agedCount` are the slice past 90 days. Money-gated.',
    input_schema: schema({ limit: { type: 'integer', description: 'How many individual invoices to list. Default 10.' } }),
    kind: 'read',
    moneyGated: true,
    run: (c, input) => getOverdueInvoices(c.ctx, { limit: intArg(input, 'limit', 1, 50), now: c.now }),
  },
  {
    name: 'recent_invoices',
    description: 'The most recently issued sales invoices, newest first, paid and unpaid alike. "What have we been invoicing lately." Money-gated.',
    input_schema: schema({ limit: { type: 'integer', description: 'How many. Default 5.' } }),
    kind: 'read',
    moneyGated: true,
    run: (c, input) => getRecentInvoices(c.ctx, { limit: intArg(input, 'limit', 1, 50) }),
  },
  {
    name: 'invoice_by_number',
    description:
      'ONE invoice by its number — "INV-104", "104", or a supplier bill reference. Returns the invoice with its lines and what is still owed, or an ambiguity list when a bare number matches both a sales invoice and a bill. Money-gated.',
    input_schema: schema({ number: { type: 'string', description: 'The invoice number as the person said it.' } }, ['number']),
    kind: 'read',
    moneyGated: true,
    run: (c, input) => getInvoiceByNumber(c.ctx, requireString(input, 'number', 'invoice_by_number')),
  },
  {
    name: 'invoice_superlative',
    description: 'The single biggest or smallest invoice ever raised, with the customer and the date. Money-gated.',
    input_schema: schema({ direction: { type: 'string', enum: ['biggest', 'smallest'], description: 'Which end.' } }, ['direction']),
    kind: 'read',
    moneyGated: true,
    run: (c, input) => getInvoiceSuperlative(c.ctx, stringArg(input, 'direction') === 'smallest' ? 'smallest' : 'biggest'),
  },
  {
    name: 'customer_invoices',
    description:
      "ONE customer's invoice history with line items, newest first — what they actually buy, at what value, and what is still owed. `invoices` is the list; `revenueLast12mPence`, `paidTotalPence` and `outstandingPence` are ALREADY SUMMED for you from these same rows — never add the list up yourself, use these. Needs a customerId from find_customer or another tool. Money-gated.",
    input_schema: schema(
      { customerId: { type: 'string' }, limit: { type: 'integer', description: 'How many invoices. Default 200.' } },
      ['customerId'],
    ),
    kind: 'read',
    moneyGated: true,
    run: async (c, input) => {
      const invoices = await getCustomerInvoices(c.ctx, requireString(input, 'customerId', 'customer_invoices'), {
        limit: intArg(input, 'limit', 1, 200),
      });
      // moneyGated is true on this tool, so the executor already refused a
      // non-money login before this ever runs — canSeeMoneyHere is always true here.
      return { invoices, ...customerMoneySummary(invoices, c.now, true) };
    },
  },
  {
    name: 'supplier_spend',
    description: 'What the business spends with its suppliers: top suppliers by gross spend, what is owed to each, and the totals. The cost side of margin. Money-gated.',
    input_schema: schema({ supplierId: { type: 'string', description: 'Optional — scope every figure to one supplier.' } }),
    kind: 'read',
    moneyGated: true,
    run: (c, input) => {
      const supplierId = stringArg(input, 'supplierId');
      return getSupplierSpendSummary(c.ctx, supplierId ? { supplierId } : {});
    },
  },
  {
    name: 'find_customer',
    description:
      'Find a customer by name (fuzzy — "belle in" finds The Bell Inn) or by phone number — returns the customerId every other customer tool needs, but NOT their record. If you want their record (what they owe, their jobs, contact details), call `customer_by_name` instead and get both in one call; use find_customer on its own when you only need the id for something else (book_fitting, create_job, chase_customer) or the name might be ambiguous. PREFERS a real customer (a Dropbox folder or something created in the Hub) — a Xero-only contact is still returned, never hidden, but tagged `isCanonical: false` and flagged in `note`. Not money-gated.',
    input_schema: schema({ query: { type: 'string', description: 'A name, part of a name, or a phone number.' } }, ['query']),
    kind: 'read',
    moneyGated: false,
    run: async (c, input) => {
      const query = requireString(input, 'query', 'find_customer');
      const byName = await searchCustomersByName(c.ctx, query);
      if (byName.length > 0) {
        // searchCustomersByName already ranks canonical matches first (Ed's
        // canon: "the only customers should be Dropbox folders") — this note
        // only ever fires when the BEST match is a Xero contact, i.e. no
        // real customer matched at all.
        const note = !byName[0].isCanonical
          ? `${byName[0].displayName} is a Xero contact, not a customer — they have no folder. Invoices still reconcile to them.`
          : undefined;
        return { matchedBy: 'name', matches: byName, note };
      }
      const byPhone = /\d{5,}/.test(query.replace(/\D/g, '')) ? await findCustomersByPhone(c.ctx, query) : [];
      return { matchedBy: byPhone.length > 0 ? 'phone' : 'nothing', matches: byPhone };
    },
  },
  {
    name: 'customer',
    description:
      'ONE customer in full: contact details, what they owe, their jobs, their notes and when we last spoke — plus `revenueLast12mPence`, `paidTotalPence` and `outstandingPence`, ALREADY SUMMED from their invoices, never to be recomputed. Money fields are null for a user who may not see money; everything else still returns. Needs a customerId — if you only have a NAME, call `customer_by_name` instead and save a round trip.',
    input_schema: schema({ customerId: { type: 'string' } }, ['customerId']),
    kind: 'read',
    moneyGated: false,
    run: async (c, input) => {
      const customerId = requireString(input, 'customerId', 'customer');
      const customer = await getCustomer(c.ctx, customerId);
      if (!customer) return customer;
      const canSee = canSeeMoney(c.ctx);
      const invoices = canSee ? await getCustomerInvoices(c.ctx, customerId, { limit: 200 }) : [];
      return { ...customer, ...customerMoneySummary(invoices, c.now, canSee) };
    },
  },
  {
    name: 'customer_by_name',
    description:
      'THE FAST LOOKUP for "what does X owe", "when did we last do work for X", "who is the contact for X" and every other question that names a customer and wants their record — resolves the name AND returns the SAME full record `customer` does, in ONE call instead of find_customer-then-customer\'s two. When `customer` is present in the result, THAT IS THE FULL RECORD — contact details, balance, jobs, notes, everything `customer` itself returns — so answer straight from it and do NOT call `customer` or `find_customer` again for the same person. `customer` is absent only when the name was ambiguous (more than one match — see `matches`, ask which one or call `customer` with the right id) or matched nobody. Prefer this over find_customer whenever you want the RECORD; use find_customer on its own only when you need just an id for a different tool (book_fitting, create_job, chase_customer). Not money-gated (money fields inside the record follow the same rule `customer` does).',
    input_schema: schema({ query: { type: 'string', description: 'A name, part of a name, or a phone number.' } }, ['query']),
    kind: 'read',
    moneyGated: false,
    run: async (c, input) => {
      const query = requireString(input, 'query', 'customer_by_name');
      const byName = await searchCustomersByName(c.ctx, query);

      let matches: readonly (CustomerSearchMatch | PhoneLookupMatch)[];
      let matchedBy: 'name' | 'phone' | 'nothing';
      if (byName.length > 0) {
        matches = byName;
        matchedBy = 'name';
      } else {
        const byPhone = /\d{5,}/.test(query.replace(/\D/g, '')) ? await findCustomersByPhone(c.ctx, query) : [];
        matches = byPhone;
        matchedBy = byPhone.length > 0 ? 'phone' : 'nothing';
      }
      if (matches.length === 0) return { matchedBy, matches: [] };

      // CONFIDENT MATCH — either the only candidate, or (name search only) a
      // near-exact trigram hit (score ~1.0, i.e. the query IS this customer's
      // name/business name, case/whitespace aside) clearly ahead of whatever
      // fuzzy neighbours pg_trgm also returned. "Merriman Motors" fuzzy-matches
      // Merriman Accountants, Merriman Joinery, Bracken Motors and Marsh Motors
      // too — find_customer's OLD two-tool path never blocked on that; the
      // model just read the ordered list and picked the exact one itself
      // (score-ordered, exact match first). Auto-resolving the SAME confident
      // case here is not a new judgement call, just moving one the model
      // already made reliably server-side, deterministically, before either
      // tool call happens. Below that confidence the tool withholds the
      // record and returns candidates — same as it always did.
      const top = matches[0];
      const topScore = 'score' in top ? top.score : 1; // a phone match is exact by construction (digit equality) — see findCustomersByPhone's own header.
      const confident = matches.length === 1 || (matchedBy === 'name' && topScore >= 0.999);
      if (!confident) {
        // AMBIGUOUS — same shape find_customer would return: a genuine
        // ambiguity still costs a second round (ask which one, or fall back to
        // find_customer + customer). NO `customer` key here — its absence IS
        // the "you still need another call" signal the tool description
        // promises.
        const note = 'isCanonical' in top && !top.isCanonical
          ? `${top.displayName} is a Xero contact, not a customer — they have no folder. Invoices still reconcile to them.`
          : undefined;
        return { matchedBy, matches, note };
      }
      // Confident — go straight to the full record, NESTED under `customer` so
      // its presence is an unambiguous "you already have everything `customer`
      // would have given you" — a flat merge here (round one of this fix) left
      // the model unable to tell "a search result" from "the record", and it
      // called `customer` again anyway, spending the exact round trip this
      // tool exists to remove. getCustomer(id) resolves a billing-alias id to
      // its canonical account on its own (one hop, customers.ts's own note),
      // exactly as `customer` does with the id find_customer would have
      // returned, so this is byte-for-byte the same lookup as the two-tool
      // path, one round trip cheaper.
      const only = matches[0];
      const customer = await getCustomer(c.ctx, only.id);
      if (!customer) return { matchedBy, matches };
      const canSee = canSeeMoney(c.ctx);
      const invoices = canSee ? await getCustomerInvoices(c.ctx, only.id, { limit: 200 }) : [];
      return { matchedBy, matches, customer: { ...customer, ...customerMoneySummary(invoices, c.now, canSee) } };
    },
  },
  {
    name: 'customer_last_contact',
    description: 'When we last had any contact with one customer, and through what. Use it before saying "we have not spoken since…". Not money-gated.',
    input_schema: schema({ customerId: { type: 'string' } }, ['customerId']),
    kind: 'read',
    moneyGated: false,
    run: (c, input) => getLastContactAt(c.ctx, requireString(input, 'customerId', 'customer_last_contact')),
  },
  {
    name: 'customer_extremes',
    description: 'The best and worst of the customer book — biggest by revenue, oldest, quietest, slowest to pay. Money-gated.',
    input_schema: NO_ARGS,
    kind: 'read',
    moneyGated: true,
    run: (c) => getCustomerExtremes(c.ctx),
  },
  {
    name: 'customer_health',
    description:
      "Customers who have gone quiet relative to their OWN usual ordering gap, most valuable and most overdue first — the churn signal. Complements reorder_due_customers: this one is drift, that one is rhythm. Money-gated.",
    input_schema: schema({ limit: { type: 'integer', description: 'How many. Default 30.' } }),
    kind: 'read',
    moneyGated: true,
    run: (c, input) => getCustomerHealthSignals(c.ctx, { limit: intArg(input, 'limit', 1, 50), now: c.now }),
  },
  {
    name: 'reorder_due_customers',
    description:
      'Customers whose own order history shows a regular rhythm and who are now DUE the next one, most pressing first. High precision — an erratic buyer never appears. The cheapest revenue in the business. Money-gated.',
    input_schema: schema({ limit: { type: 'integer', description: 'How many. Default 5.' } }),
    kind: 'read',
    moneyGated: true,
    run: (c, input) => getReorderDueCustomers(c.ctx, c.now, { limit: intArg(input, 'limit', 1, 25) }),
  },
  {
    name: 'payment_anomalies',
    description:
      'Customers paying MATERIALLY SLOWER than their own past behaviour — the "they always pay in 14 days and this one is at 40" signal. Keyed by customerId. Money-gated.',
    input_schema: NO_ARGS,
    kind: 'read',
    moneyGated: true,
    run: (c) => getCustomerPaymentAnomalies(c.ctx, { now: c.now }),
  },
  {
    name: 'jobs_overview',
    description:
      'EVERY live (open, non-terminal) job with its stage, who is on it, how long since anything happened, whether it is stopped, and when it CAME IN (`createdAt`). The board. Use it for "what is on", "what is stuck", "what is in make", and — via `createdFrom`/`createdTo` — retrospective questions like "what came in last Friday". ALWAYS carries `stageCounts` (how many open jobs are in each stage, ACROSS THE WHOLE BOARD — never affected by `stage`/`createdFrom`/`createdTo`, because it answers "what does the board look like right now", not a date question) — for "how many jobs are in the Make/artwork/whatever stage" that number alone answers it; you do not need the per-job list. Pass `stage` to get back only that stage\'s jobs (a fraction of the whole board) instead of every job on it — do that whenever the question is about ONE stage. HONEST LIMIT on `createdFrom`/`createdTo`: this tool only ever lists jobs that are STILL OPEN today, so "what came in on day X" only surfaces jobs from that day that have not since been won, lost or completed — it is not a full history of everything raised that day, and is silent (not wrong) about anything that already closed out.',
    input_schema: schema({
      staleDays: { type: 'integer', description: 'Days of silence before a job counts as stale. Default 3.' },
      stage: { type: 'string', description: 'Optional — return only jobs whose current stage matches this (case-insensitive), e.g. "artwork" or "make". Leave unset for the whole board.' },
      createdFrom: { type: 'string', description: 'Optional — only jobs created on or after this Europe/London calendar day, "YYYY-MM-DD". Pairs with createdTo for a range, e.g. "what came in last Friday".' },
      createdTo: { type: 'string', description: 'Optional — only jobs created on or before this Europe/London calendar day, "YYYY-MM-DD". A single day question sets createdFrom and createdTo to the same date.' },
    }),
    kind: 'read',
    moneyGated: false,
    run: async (c, input) => {
      const overview = await getJobStatusOverview(c.ctx, { staleDays: intArg(input, 'staleDays', 1, 60), now: c.now });
      // stageCounts — cheap to derive from rows already fetched, and it is
      // the whole answer to "how many are in X" without the model reading a
      // per-job list at all. '(none)' groups jobs with no active stage left
      // (JobStatusOverviewItem.currentStage can be null) rather than dropping
      // them from the tally. Computed off the WHOLE board, before either the
      // stage or the date filter below — see the tool's own description for
      // why: it is "what does the board look like now", not scoped to either.
      const stageCounts: Record<string, number> = {};
      for (const job of overview.jobs) {
        const key = job.currentStage ?? '(none)';
        stageCounts[key] = (stageCounts[key] ?? 0) + 1;
      }
      const stageFilter = stringArg(input, 'stage')?.toLowerCase();
      const createdFrom = dateKeyArg(input, 'createdFrom', 'jobs_overview');
      const createdTo = dateKeyArg(input, 'createdTo', 'jobs_overview');
      let filtered = stageFilter ? overview.jobs.filter((j) => j.currentStage?.toLowerCase() === stageFilter) : overview.jobs;
      if (createdFrom !== undefined || createdTo !== undefined) {
        filtered = filtered.filter((j) => {
          const day = londonDayNumber(new Date(j.createdAt));
          if (createdFrom !== undefined && day < createdFrom) return false;
          if (createdTo !== undefined && day > createdTo) return false;
          return true;
        });
      }
      // dropNullFields — see its own doc comment. Every field this loses is
      // one whose OWN value was null, so nothing the model could have read is
      // lost, only the repeated "field":null noise on jobs that are neither
      // blocked nor stopped (the common case).
      const jobs = filtered.map((j) => dropNullFields(j as unknown as Record<string, unknown>));
      return { ...overview, jobs, stageCounts };
    },
  },
  {
    name: 'job',
    description:
      'ONE job in full: the customer, the stage and its history, quotes, proofs, fittings, events and what is blocking it. The answer to "why is X held up". Needs a jobId — find it with jobs_overview or find_customer.',
    input_schema: schema({ jobId: { type: 'string' } }, ['jobId']),
    kind: 'read',
    moneyGated: false,
    run: (c, input) => getJobDetail(c.ctx, requireString(input, 'jobId', 'job')),
  },
  {
    name: 'jobs_at_risk',
    description:
      '`stalled` (work that has actively stopped) and `cold` (early enquiries untouched for a week or more, quietly turning into lost revenue). No job appears in both.',
    input_schema: NO_ARGS,
    kind: 'read',
    moneyGated: false,
    run: (c) => jobsAtRisk(c.ctx, c.now),
  },
  {
    name: 'quote_funnel',
    description:
      'How quoting actually converts: hours to get a quote out, % within 48h, win rate, days to decision, median first-job value. EVERY metric carries an `n` — when `n` is small the metric is NOT trustworthy and you must say so rather than reason from it. Money-gated.',
    input_schema: schema({ windowDays: { type: 'integer', description: 'Trailing window in days. Standard window by default.' } }),
    kind: 'read',
    moneyGated: true,
    run: (c, input) => getQuoteFunnel(c.ctx, { windowDays: intArg(input, 'windowDays', 7, 730), now: c.now }),
  },
  {
    name: 'cash_forecast',
    description:
      'What is expected IN over the next few months, from real invoices and how this shop actually gets paid, with the run-rate baseline and the seasonal note. Money-gated.',
    input_schema: schema({ horizonMonths: { type: 'integer', description: 'Forward months. Default 3.' } }),
    kind: 'read',
    moneyGated: true,
    run: (c, input) => getCashFlowForecast(c.ctx, { horizonMonths: intArg(input, 'horizonMonths', 1, 12), now: c.now }),
  },
  {
    name: 'seasonality',
    description:
      "The shop's OWN multi-year seasonal pattern learned from its revenue archive, and the next quiet month coming. Null when there is not enough history — say so rather than guessing. Money-gated.",
    input_schema: NO_ARGS,
    kind: 'read',
    moneyGated: true,
    run: (c) => getSeasonalityIndex(c.ctx, c.now),
  },
  {
    name: 'cost_creep',
    description: 'Materials whose unit price has quietly crept up, worst first, with the earliest and latest prices and the % rise. Silent margin erosion. Money-gated.',
    input_schema: NO_ARGS,
    kind: 'read',
    moneyGated: true,
    run: (c) => getMaterialCostCreep(c.ctx),
  },
  {
    name: 'price_probe',
    description:
      'What this shop has CHARGED before for a line like this: the suggested price when the history agrees, the band it sits in, how many past lines stand behind it and the actual descriptions they came from. The only honest basis for a price. Money-gated.',
    input_schema: schema({ description: { type: 'string', description: 'The line as it would be written on a quote.' }, itemCode: { type: 'string' } }, ['description']),
    kind: 'read',
    moneyGated: true,
    run: (c, input) =>
      suggestPrice(c.ctx, { description: requireString(input, 'description', 'price_probe'), itemCode: stringArg(input, 'itemCode') }),
  },
  {
    name: 'price_book_health',
    description: 'How much of the price book is actually usable — coverage, and how often each tier of suggestion gets accepted. Money-gated.',
    input_schema: NO_ARGS,
    kind: 'read',
    moneyGated: true,
    run: async (c) => ({
      coverage: await getPriceBookCoverage(c.ctx),
      tierAcceptance: await getPriceBookTierAcceptance(c.ctx),
    }),
  },
  {
    name: 'settings',
    description:
      'The owner\'s CONTROLS as they stand: the dial (which capabilities I do myself and which I ask about), the rails (never-contact, quote ceiling, tone ceiling, quiet hours), the house rules in the owner\'s own words, and whether I am paused. Read this before saying what you are allowed to do.',
    input_schema: NO_ARGS,
    kind: 'read',
    moneyGated: false,
    run: async (c) => {
      const [dialAndRails, houseRules, status] = await Promise.all([
        getDialAndRails(c.ctx),
        getHouseRules(c.ctx),
        getOperatorStatus(c.ctx),
      ]);
      return { dial: resolvedDial(dialAndRails.dial), rails: dialAndRails.rails, houseRules, paused: status.paused };
    },
  },
  {
    name: 'decisions',
    description:
      "The operator's ledger for a day: `needs_you` (queued, waiting on a human — these are what Decide shows), `did_for_you` (already done, with undo), `fyi`. Use it for 'what needs me', 'what have you done', and to find the id of a decision to approve or decline.",
    input_schema: schema({ date: { type: 'string', description: 'ISO date inside the day. Default today.' } }),
    kind: 'read',
    moneyGated: false,
    run: (c, input) => {
      const raw = stringArg(input, 'date');
      const day = raw ? new Date(raw) : c.now;
      return getFeed(c.ctx, { day: Number.isNaN(day.getTime()) ? c.now : day });
    },
  },
  {
    name: 'what_i_can_see',
    description:
      'WHAT I CAN AND CANNOT SEE about this business, subject by subject: the books, the inbox, the work, the quotes, the diary, the customers, the prices, the calendar, the files, texts, card payments, the vans, the weather. Each one says whether I can see it, why not when I cannot, what would fix it, and how fresh it is. CALL THIS BEFORE ANSWERING ANY "is anything overdue / is anyone waiting / is everything fine" QUESTION: a tool that comes back empty because nothing is connected is not the same answer as nothing being wrong, and only this tool tells the two apart.',
    input_schema: NO_ARGS,
    kind: 'read',
    moneyGated: false,
    run: (c) => getCompleteness(c.ctx, { now: c.now }),
  },
  {
    name: 'system_health',
    description:
      'Anything DEGRADED in the plumbing right now — an expiring connection, a stale sync, a failing check — each with a sentence a human can act on. Empty means everything is fine.',
    input_schema: NO_ARGS,
    kind: 'read',
    moneyGated: false,
    // Projected: the raw rows carry meta.instance, latency and ids that are Ed's business, not a tenant's (2026-09-10 security review, item 6).
    run: async (c) => (await degradations(c.ctx.tenantId, { now: c.now })).map((d) => ({ checkId: d.checkId, status: d.status, sentence: d.sentence })),
  },
];

// ===========================================================================
// THE LEDGER WRITES
// ===========================================================================
// CAPABILITY MAPPING, written out so it is a decision and not an accident:
//   create_job      → enquiry_intake     (a new job entering the system IS intake)
//   move_job_stage  → stalled_job_nudge  (the capability that moves work along)
//   book_fitting    → stalled_job_nudge  (same: getting the job to the next step)
//   create_quote    → quote_draft
//   update_quote    → quote_draft
//   chase_customer  → overdue_chase      (the one outbound kind Ask can propose)
// Each mapping decides which of the owner's dial switches governs it, which is
// the whole point: a shop that has dialled "drafting quotes" to ask does not
// suddenly get unattended quotes because someone asked for one in a chat.

const LEDGER_WRITE_TOOLS: readonly AskLedgerWriteTool[] = [
  {
    name: 'create_job',
    description:
      'Create a JOB. Goes through the operator like any other action: your dial decides whether it happens now or waits for you on Decide, and it can be undone. Give it a customerId when you know one.',
    input_schema: schema(
      {
        title: { type: 'string', description: 'What the job is, as the shop would write it: "shop fascia for The Bell Inn".' },
        customerId: { type: 'string', description: 'From find_customer. Omit only for a genuinely unknown enquirer.' },
        description: { type: 'string' },
        valueEstimatePounds: { type: 'number', description: 'Ballpark value in POUNDS, only if the person said one.' },
        dueDate: { type: 'string', description: 'YYYY-MM-DD.' },
        priority: { type: 'string', enum: ['normal', 'rush', 'urgent'] },
      },
      ['title'],
    ),
    kind: 'write',
    via: 'ledger',
    capability: 'enquiry_intake',
    actionKind: 'create_job',
    moneyGated: false,
    async resolve(c, input) {
      const title = requireString(input, 'title', 'create_job');
      const customerId = stringArg(input, 'customerId');
      let customerName: string | undefined;
      if (customerId) {
        const customer = await getCustomer(c.ctx, customerId);
        if (!customer) throw new AskToolRefusal(`No customer with id ${customerId} — look them up with find_customer first.`);
        customerName = customer.name;
      }
      return {
        title,
        customerId: customerId ?? undefined,
        customerName,
        description: stringArg(input, 'description') ?? undefined,
        valueEstimatePounds: numberArg(input, 'valueEstimatePounds'),
        dueDate: stringArg(input, 'dueDate') ?? undefined,
        priority: stringArg(input, 'priority') ?? undefined,
      };
    },
    phrases(facts) {
      const title = requireFact(facts, 'title');
      const who = optionalFact(facts, 'customerName');
      const tail = who ? `${title} for ${who}` : title;
      return { todo: `open a job for ${tail}`, did: `opened a job for ${tail}` };
    },
    build(facts, meta) {
      const priority = optionalFact(facts, 'priority');
      const valuePounds = typeof facts.valueEstimatePounds === 'number' ? facts.valueEstimatePounds : undefined;
      const key = askIdempotencyKey('create_job', meta.ctx.userId, [facts.title, facts.customerId], meta.now);
      return {
        capability: 'enquiry_intake',
        kind: 'create_job',
        target: { customerId: optionalFact(facts, 'customerId') },
        reasoning: askReasoning(this.phrases(facts)),
        payload: {
          title: requireFact(facts, 'title'),
          description: optionalFact(facts, 'description'),
          valueEstimatePounds: valuePounds,
          dueDate: optionalFact(facts, 'dueDate'),
          priority: priority === 'rush' || priority === 'urgent' ? priority : 'normal',
          idempotencyKey: key,
        },
        reversibility: 'reversible',
        idempotencyKey: key,
        amountPence: toPence(valuePounds),
      };
    },
  },
  {
    name: 'move_job_stage',
    description:
      'Move a job to another stage: enquiry, survey, quote, design, artwork, make, fit, invoice, complete. Goes through the operator — dial, rails, Pause and undo all apply.',
    input_schema: schema(
      {
        jobId: { type: 'string' },
        toStage: { type: 'string', enum: ['enquiry', 'survey', 'quote', 'design', 'artwork', 'make', 'fit', 'invoice', 'complete'] },
        note: { type: 'string', description: 'Why — lands on the job\'s own event trail.' },
      },
      ['jobId', 'toStage'],
    ),
    kind: 'write',
    via: 'ledger',
    capability: 'stalled_job_nudge',
    actionKind: 'move_job_stage',
    moneyGated: false,
    async resolve(c, input) {
      const jobId = requireString(input, 'jobId', 'move_job_stage');
      const job = await getJobDetail(c.ctx, jobId);
      if (!job) throw new AskToolRefusal(`No job with id ${jobId} — find it with jobs_overview first.`);
      return {
        jobId,
        jobRef: job.job.ref ?? jobId,
        fromStage: currentStageOf(job) ?? undefined,
        toStage: requireString(input, 'toStage', 'move_job_stage'),
        note: stringArg(input, 'note') ?? undefined,
      };
    },
    phrases(facts) {
      const ref = requireFact(facts, 'jobRef');
      const to = requireFact(facts, 'toStage');
      return { todo: `move ${ref} to ${to}`, did: `moved ${ref} to ${to}` };
    },
    build(facts, meta) {
      const key = askIdempotencyKey('move_job_stage', meta.ctx.userId, [facts.jobId, facts.toStage], meta.now);
      return {
        capability: 'stalled_job_nudge',
        kind: 'move_job_stage',
        target: { jobId: requireFact(facts, 'jobId') },
        reasoning: askReasoning(this.phrases(facts)),
        payload: { toStage: requireFact(facts, 'toStage'), note: optionalFact(facts, 'note') },
        reversibility: 'reversible',
        idempotencyKey: key,
        amountPence: null,
      };
    },
  },
  {
    name: 'book_fitting',
    description:
      'Book a fitting or survey on a job: when, and who is on it. Times are ISO timestamps in UK local time. Goes through the operator — the dial decides whether it is booked now or waits for you, and it can be cancelled by undo.',
    input_schema: schema(
      {
        jobId: { type: 'string' },
        start: { type: 'string', description: 'ISO timestamp, e.g. 2026-09-04T10:00:00+01:00. Must be in the future.' },
        end: { type: 'string', description: 'ISO timestamp. Optional — "the morning, done when it is done" is a real booking.' },
        fitterUserId: { type: 'string', description: 'The fitter, from the day or jobs tools. Omit if nobody was named.' },
        notes: { type: 'string' },
      },
      ['jobId', 'start'],
    ),
    kind: 'write',
    via: 'ledger',
    capability: 'stalled_job_nudge',
    actionKind: 'book_fitting',
    moneyGated: false,
    async resolve(c, input) {
      const jobId = requireString(input, 'jobId', 'book_fitting');
      const start = requireString(input, 'start', 'book_fitting');
      const startAt = new Date(start);
      if (Number.isNaN(startAt.getTime())) throw new AskToolRefusal(`"${start}" is not a date I can read — give the start as an ISO timestamp.`);
      if (startAt.getTime() <= c.now.getTime()) throw new AskToolRefusal('That start time is in the past — a fitting has to be booked forward.');
      const job = await getJobDetail(c.ctx, jobId);
      if (!job) throw new AskToolRefusal(`No job with id ${jobId} — find it with jobs_overview first.`);
      return {
        jobId,
        jobRef: job.job.ref ?? jobId,
        customerName: job.customer?.name ?? undefined,
        start: startAt.toISOString(),
        end: stringArg(input, 'end') ?? undefined,
        fitterUserId: stringArg(input, 'fitterUserId') ?? undefined,
        notes: stringArg(input, 'notes') ?? undefined,
      };
    },
    phrases(facts) {
      const ref = requireFact(facts, 'jobRef');
      const when = formatLondon(new Date(requireFact(facts, 'start')));
      return { todo: `book the fitting for ${ref} on ${when}`, did: `booked the fitting for ${ref} on ${when}` };
    },
    build(facts, meta) {
      const key = askIdempotencyKey('book_fitting', meta.ctx.userId, [facts.jobId, facts.start, facts.fitterUserId], meta.now);
      return {
        capability: 'stalled_job_nudge',
        kind: 'book_fitting',
        target: { jobId: requireFact(facts, 'jobId') },
        reasoning: askReasoning(this.phrases(facts)),
        payload: {
          start: requireFact(facts, 'start'),
          end: optionalFact(facts, 'end'),
          fitterUserId: optionalFact(facts, 'fitterUserId'),
          notes: optionalFact(facts, 'notes'),
        },
        reversibility: 'reversible',
        idempotencyKey: key,
        amountPence: null,
      };
    },
  },
  {
    name: 'create_quote',
    description:
      'Draft a QUOTE on a job from priced lines. ALWAYS call price_probe for each line first and use what this shop has actually charged — a price you made up is a price the owner has to catch. The draft goes through the operator: your dial and your quote-value rail decide whether it is raised now or waits for you.',
    input_schema: schema(
      {
        jobId: { type: 'string' },
        lines: {
          type: 'array',
          description: 'One entry per quote line.',
          items: schema(
            {
              description: { type: 'string', description: 'The line as it should read on the quote.' },
              qty: { type: 'number', description: 'Default 1.' },
              unitPounds: { type: 'number', description: 'Unit price in POUNDS, from price_probe wherever the price book has history.' },
            },
            ['description', 'unitPounds'],
          ),
        },
        notes: { type: 'string' },
      },
      ['jobId', 'lines'],
    ),
    kind: 'write',
    via: 'ledger',
    capability: 'quote_draft',
    actionKind: 'create_quote',
    moneyGated: true,
    async resolve(c, input) {
      const jobId = requireString(input, 'jobId', 'create_quote');
      const rawLines = Array.isArray(input.lines) ? (input.lines as Record<string, unknown>[]) : [];
      if (rawLines.length === 0) throw new AskToolRefusal('A quote needs at least one line — say what is being quoted for and what it costs.');
      const job = await getJobDetail(c.ctx, jobId);
      if (!job) throw new AskToolRefusal(`No job with id ${jobId} — find it with jobs_overview first.`);

      // EVERY line's price is re-checked against the price book HERE, not by the
      // model: whatever it typed, the ledger row carries the shop's real history
      // beside it, so a human on Decide sees the gap without having to look it up.
      const lines = [];
      for (const raw of rawLines) {
        const description = stringArg(raw, 'description');
        const unitPounds = numberArg(raw, 'unitPounds');
        if (!description || unitPounds === undefined) throw new AskToolRefusal('Every quote line needs a description and a unit price in pounds.');
        const suggestion = await suggestPrice(c.ctx, { description });
        lines.push({
          description,
          qty: numberArg(raw, 'qty') ?? 1,
          unitPence: Math.round(unitPounds * 100),
          provenance: suggestion ? buildPriceBasis(suggestion, c.now.toISOString()) : null,
        });
      }
      return {
        jobId,
        jobRef: job.job.ref ?? jobId,
        customerId: job.job.customerId ?? undefined,
        customerName: job.customer?.name ?? undefined,
        lines,
        notes: stringArg(input, 'notes') ?? undefined,
      };
    },
    phrases(facts) {
      const ref = requireFact(facts, 'jobRef');
      return { todo: `draft the quote for ${ref}`, did: `drafted the quote for ${ref}` };
    },
    build(facts, meta) {
      const lines = (facts.lines ?? []) as { description: string; qty: number; unitPence: number; provenance: PriceBasisProvenance | null }[];
      const subtotalPence = lines.reduce((sum, l) => sum + Math.round(l.unitPence * l.qty), 0);
      const key = askIdempotencyKey('create_quote', meta.ctx.userId, [facts.jobId, lines], meta.now);
      return {
        capability: 'quote_draft',
        kind: 'create_quote',
        target: { jobId: requireFact(facts, 'jobId'), customerId: optionalFact(facts, 'customerId') },
        reasoning: askReasoning(this.phrases(facts)),
        // The shape operator/run.ts's QuotePort reads (producers/quote-draft.ts's
        // QuoteDraftPayload) — `upsellNudges` is required there, and Ask makes none.
        payload: {
          customerId: optionalFact(facts, 'customerId') ?? '',
          jobId: requireFact(facts, 'jobId'),
          lines,
          subtotalPence,
          upsellNudges: [],
        },
        reversibility: 'reversible',
        idempotencyKey: key,
        amountPence: subtotalPence,
      };
    },
  },
  {
    name: 'chase_customer',
    description:
      'Send a customer a chase or a nudge about money they owe. You write the message; I ground every £ figure in it against what they ACTUALLY owe and refuse to send one that does not match. Goes through the operator: the dial, the never-contact list, your tone ceiling and quiet hours all apply, and nothing goes out at all while I am paused.',
    input_schema: schema(
      {
        customerId: { type: 'string', description: 'From find_customer.' },
        subject: { type: 'string' },
        body: { type: 'string', description: 'The whole message, as it should be sent. Plain UK English, first person, no placeholders.' },
        tone: { type: 'string', enum: ['friendly', 'firm', 'final'], description: 'How firm this draft is. Be honest — the owner\'s tone ceiling is judged on it.' },
      },
      ['customerId', 'body'],
    ),
    kind: 'write',
    via: 'ledger',
    capability: 'overdue_chase',
    actionKind: 'send_email',
    moneyGated: true,
    async resolve(c, input) {
      const customerId = requireString(input, 'customerId', 'chase_customer');
      const body = requireString(input, 'body', 'chase_customer');
      const customer = await getCustomer(c.ctx, customerId);
      if (!customer) throw new AskToolRefusal(`No customer with id ${customerId} — look them up with find_customer first.`);
      if (!customer.email) throw new AskToolRefusal(`I have no email address for ${customer.name} — I cannot send them anything until there is one on their record.`);

      // THE GROUNDING SET, built from the DATABASE and never from the model:
      // every £ figure this customer's unpaid invoices could legitimately
      // justify. operator/execute.ts re-checks the body against exactly this
      // list before anything is sent, and REFUSES on a mismatch.
      const invoices = await getCustomerInvoices(c.ctx, customerId, { limit: 200 });
      const groundedPence: number[] = [];
      for (const inv of invoices as { amountDue?: number | null; total?: number | null }[]) {
        if (typeof inv.amountDue === 'number') groundedPence.push(Math.round(inv.amountDue * 100));
        if (typeof inv.total === 'number') groundedPence.push(Math.round(inv.total * 100));
      }
      const owed = groundedPence.length > 0 ? Math.max(...groundedPence) : null;

      return {
        customerId,
        customerName: customer.name,
        to: customer.email,
        subject: stringArg(input, 'subject') ?? undefined,
        body,
        tone: stringArg(input, 'tone') ?? 'friendly',
        groundedPence,
        amountPence: owed,
      };
    },
    phrases(facts) {
      const who = requireFact(facts, 'customerName');
      return { todo: `chase ${who}`, did: `chased ${who}` };
    },
    build(facts, meta) {
      const tone = facts.tone === 'firm' || facts.tone === 'final' ? facts.tone : 'friendly';
      const key = askIdempotencyKey('chase_customer', meta.ctx.userId, [facts.customerId, facts.body], meta.now);
      return {
        capability: 'overdue_chase',
        kind: 'send_email',
        target: { customerId: requireFact(facts, 'customerId') },
        reasoning: askReasoning(this.phrases(facts)),
        payload: {
          to: requireFact(facts, 'to'),
          subject: optionalFact(facts, 'subject'),
          body: requireFact(facts, 'body'),
          groundedPence: Array.isArray(facts.groundedPence) ? (facts.groundedPence as number[]) : [],
          tone,
        },
        reversibility: 'irreversible',
        idempotencyKey: key,
        amountPence: typeof facts.amountPence === 'number' ? facts.amountPence : null,
      };
    },
  },

  // ─── THE FIVE THAT USED TO BE UNREACHABLE (2026-09-03) ──────────────────
  //
  // This file's header used to name them as "not yet reachable, and named
  // here rather than quietly missing": sending a quote, creating and sending
  // a proof, revising a quote, cancelling a fitting. Every one was a real
  // mutation with no `ActionKind` to carry it, so there was no honest way to
  // put it through the ledger — and putting it anywhere else would have
  // broken the rule at the top of this file.
  //
  // operator/contract.ts now has all six kinds (`unblock_stage` too), and
  // operator/execute.ts dispatches them through real ports. So they are here,
  // on exactly the same terms as everything else: the owner's dial decides
  // do-or-ask, the rails apply, Pause stops them, and each one is on the
  // ledger with the truest undo it honestly has.

  {
    name: 'send_quote',
    description:
      'Send a quote to the customer with an "accept online" link. Goes through the operator: your dial decides whether it goes now or waits on Decide. Once it has gone it cannot be recalled.',
    input_schema: schema(
      {
        quoteId: { type: 'string', description: 'The quote to send.' },
        to: { type: 'string', description: 'Override the address. Omit to use the one on the customer record.' },
        expiresInDays: { type: 'number', description: 'How long the accept link lives. Defaults to 14.' },
      },
      ['quoteId'],
    ),
    kind: 'write',
    via: 'ledger',
    // 'quote_draft' is the dial switch that governs quoting, and sending one
    // is the loudest thing that switch does — never a separate, quieter one.
    capability: 'quote_draft',
    actionKind: 'send_quote',
    moneyGated: true,
    async resolve(c, input) {
      const quoteId = requireString(input, 'quoteId', 'send_quote');
      return {
        quoteId,
        to: stringArg(input, 'to') ?? undefined,
        expiresInDays: numberArg(input, 'expiresInDays'),
      };
    },
    phrases() {
      return { todo: 'send the quote to the customer', did: 'sent the quote to the customer' };
    },
    build(facts, meta) {
      const key = askIdempotencyKey('send_quote', meta.ctx.userId, [facts.quoteId], meta.now);
      return {
        capability: 'quote_draft',
        kind: 'send_quote',
        target: { quoteId: requireFact(facts, 'quoteId') },
        reasoning: askReasoning(this.phrases(facts)),
        payload: {
          to: optionalFact(facts, 'to'),
          expiresInDays: typeof facts.expiresInDays === 'number' ? facts.expiresInDays : undefined,
        },
        // It reaches a customer. Same posture as any other send.
        reversibility: 'irreversible',
        idempotencyKey: key,
        amountPence: null,
      };
    },
  },

  {
    name: 'revise_quote',
    description:
      'Supersede a quote with a fresh draft carrying its lines — the right thing when a sent or accepted quote needs changing. Withdraws the old one and kills any unused accept links on it.',
    input_schema: schema(
      {
        quoteId: { type: 'string', description: 'The quote being corrected — the OLD one.' },
        reason: { type: 'string', description: 'Why. Kept on the job trail; never shown to the customer.' },
      },
      ['quoteId'],
    ),
    kind: 'write',
    via: 'ledger',
    capability: 'quote_draft',
    actionKind: 'revise_quote',
    moneyGated: true,
    async resolve(c, input) {
      return {
        quoteId: requireString(input, 'quoteId', 'revise_quote'),
        reason: stringArg(input, 'reason') ?? undefined,
      };
    },
    phrases() {
      return { todo: 'revise the quote', did: 'revised the quote — the new draft is ready to edit' };
    },
    build(facts, meta) {
      const key = askIdempotencyKey('revise_quote', meta.ctx.userId, [facts.quoteId, facts.reason], meta.now);
      return {
        capability: 'quote_draft',
        kind: 'revise_quote',
        target: { quoteId: requireFact(facts, 'quoteId') },
        reasoning: askReasoning(this.phrases(facts)),
        payload: { reason: optionalFact(facts, 'reason') },
        // The new row is a draft nobody has seen, so deleting it puts the
        // world back — bar the old quote staying withdrawn, which the undo
        // reason says out loud.
        reversibility: 'reversible',
        idempotencyKey: key,
        amountPence: null,
      };
    },
  },

  {
    name: 'create_proof',
    description:
      'Put an artwork proof on a job, ready to send. Needs the stored file it is a proof OF.',
    input_schema: schema(
      {
        jobId: { type: 'string' },
        fileRef: { type: 'string', description: 'The stored file this proof is of.' },
        sentTo: { type: 'string', description: 'Who it will go to, if you know. Informational until it is actually sent.' },
      },
      ['jobId', 'fileRef'],
    ),
    kind: 'write',
    via: 'ledger',
    capability: 'proof_loop',
    actionKind: 'create_proof',
    moneyGated: false,
    async resolve(c, input) {
      const jobId = requireString(input, 'jobId', 'create_proof');
      const job = await getJobDetail(c.ctx, jobId);
      if (!job) throw new AskToolRefusal(`No job with id ${jobId} — look it up with find_job first.`);
      return {
        jobId,
        jobTitle: job.job.title,
        customerId: job.job.customerId ?? undefined,
        fileRef: requireString(input, 'fileRef', 'create_proof'),
        sentTo: stringArg(input, 'sentTo') ?? undefined,
      };
    },
    phrases(facts) {
      const what = requireFact(facts, 'jobTitle');
      return { todo: `put a proof on ${what}`, did: `put a proof on ${what}` };
    },
    build(facts, meta) {
      const key = askIdempotencyKey('create_proof', meta.ctx.userId, [facts.jobId, facts.fileRef], meta.now);
      return {
        capability: 'proof_loop',
        kind: 'create_proof',
        target: { jobId: requireFact(facts, 'jobId'), customerId: optionalFact(facts, 'customerId') },
        reasoning: askReasoning(this.phrases(facts)),
        payload: { fileRef: requireFact(facts, 'fileRef'), sentTo: optionalFact(facts, 'sentTo') },
        reversibility: 'reversible',
        idempotencyKey: key,
        amountPence: null,
      };
    },
  },

  {
    name: 'send_proof',
    description:
      'Send an existing proof to the customer with an approve/request-changes link. Once it has gone it cannot be recalled.',
    input_schema: schema(
      {
        proofId: { type: 'string' },
        to: { type: 'string', description: 'Override the address. Omit to use the one on the customer record.' },
      },
      ['proofId'],
    ),
    kind: 'write',
    via: 'ledger',
    capability: 'proof_loop',
    actionKind: 'send_proof',
    moneyGated: false,
    async resolve(c, input) {
      return {
        proofId: requireString(input, 'proofId', 'send_proof'),
        to: stringArg(input, 'to') ?? undefined,
      };
    },
    phrases() {
      return { todo: 'send the proof to the customer', did: 'sent the proof to the customer' };
    },
    build(facts, meta) {
      const key = askIdempotencyKey('send_proof', meta.ctx.userId, [facts.proofId], meta.now);
      return {
        capability: 'proof_loop',
        kind: 'send_proof',
        target: {},
        reasoning: askReasoning(this.phrases(facts)),
        payload: { proofId: requireFact(facts, 'proofId'), to: optionalFact(facts, 'to') },
        reversibility: 'irreversible',
        idempotencyKey: key,
        amountPence: null,
      };
    },
  },

  {
    name: 'cancel_fitting',
    description:
      'Stand a booked fitting down. The customer has been told a date, so this asks unless your dial says otherwise — and it cannot be undone: re-book instead.',
    input_schema: schema(
      {
        jobId: { type: 'string' },
        bookingRef: { type: 'string', description: 'The FIT- reference of the booking.' },
        reason: { type: 'string', description: 'Why — lands on the job trail.' },
      },
      ['jobId', 'bookingRef'],
    ),
    kind: 'write',
    via: 'ledger',
    capability: 'fitting_scheduler',
    actionKind: 'cancel_fitting',
    moneyGated: false,
    async resolve(c, input) {
      const jobId = requireString(input, 'jobId', 'cancel_fitting');
      const job = await getJobDetail(c.ctx, jobId);
      if (!job) throw new AskToolRefusal(`No job with id ${jobId} — look it up with find_job first.`);
      return {
        jobId,
        jobTitle: job.job.title,
        customerId: job.job.customerId ?? undefined,
        bookingRef: requireString(input, 'bookingRef', 'cancel_fitting'),
        reason: stringArg(input, 'reason') ?? undefined,
      };
    },
    phrases(facts) {
      const ref = requireFact(facts, 'bookingRef');
      const what = optionalFact(facts, 'jobTitle');
      const tail = what ? `${ref} on ${what}` : ref;
      return { todo: `cancel the fitting ${tail}`, did: `cancelled the fitting ${tail}` };
    },
    build(facts, meta) {
      const key = askIdempotencyKey('cancel_fitting', meta.ctx.userId, [facts.jobId, facts.bookingRef], meta.now);
      return {
        capability: 'fitting_scheduler',
        kind: 'cancel_fitting',
        target: { jobId: requireFact(facts, 'jobId'), customerId: optionalFact(facts, 'customerId') },
        reasoning: askReasoning(this.phrases(facts)),
        payload: { bookingRef: requireFact(facts, 'bookingRef'), reason: optionalFact(facts, 'reason') },
        // The slot is given up and may be taken. "Book it again" is the truth;
        // an Undo button here would be a lie that sometimes worked.
        reversibility: 'irreversible',
        idempotencyKey: key,
        amountPence: null,
      };
    },
  },

  {
    name: 'unblock_stage',
    description:
      'Clear a workshop blocker so a job can move again. Say WHY — a block cleared with no reason is a mystery six weeks later.',
    input_schema: schema(
      {
        jobId: { type: 'string' },
        note: { type: 'string', description: 'What was in the way and what changed.' },
      },
      ['jobId'],
    ),
    kind: 'write',
    via: 'ledger',
    capability: 'production_scheduler',
    actionKind: 'unblock_stage',
    moneyGated: false,
    async resolve(c, input) {
      const jobId = requireString(input, 'jobId', 'unblock_stage');
      const job = await getJobDetail(c.ctx, jobId);
      if (!job) throw new AskToolRefusal(`No job with id ${jobId} — look it up with find_job first.`);
      return { jobId, jobTitle: job.job.title, customerId: job.job.customerId ?? undefined, note: stringArg(input, 'note') ?? undefined };
    },
    phrases(facts) {
      const what = requireFact(facts, 'jobTitle');
      return { todo: `get ${what} moving again`, did: `got ${what} moving again` };
    },
    build(facts, meta) {
      const key = askIdempotencyKey('unblock_stage', meta.ctx.userId, [facts.jobId, facts.note], meta.now);
      return {
        capability: 'production_scheduler',
        kind: 'unblock_stage',
        target: { jobId: requireFact(facts, 'jobId'), customerId: optionalFact(facts, 'customerId') },
        reasoning: askReasoning(this.phrases(facts)),
        payload: { note: optionalFact(facts, 'note') },
        reversibility: 'reversible',
        idempotencyKey: key,
        amountPence: null,
      };
    },
  },
];

/** "Thursday 4 September at 10:00" — London wall clock, the way the copy rules write a time. */
export function formatLondon(when: Date): string {
  const date = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'long' }).format(when);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false }).format(when);
  return `${date} at ${time}`;
}

// ===========================================================================
// THE CONTROL WRITES — the owner's own controls (see the file header)
// ===========================================================================

const CONTROL_WRITE_TOOLS: readonly AskControlWriteTool[] = [
  {
    name: 'pause',
    description:
      'PAUSE everything: nothing goes out, nothing executes, proposals just queue. The kill switch. Owner or manager only. Use it the moment someone says stop, pause, hold everything or freeze.',
    input_schema: NO_ARGS,
    kind: 'write',
    via: 'direct',
    moneyGated: false,
    async run(c) {
      await pauseOperator(c.ctx);
      return 'paused everything — nothing goes out until you resume';
    },
  },
  {
    name: 'resume',
    description: 'Undo a pause: I start acting again on the settings you already have. Owner or manager only.',
    input_schema: NO_ARGS,
    kind: 'write',
    via: 'direct',
    moneyGated: false,
    async run(c) {
      await resumeOperator(c.ctx);
      return 'resumed — I am acting on your dial again';
    },
  },
  {
    name: 'approve_decision',
    description: 'Approve one queued decision so it happens. Get the id from the `decisions` tool (`needs_you`). This IS the human decision the ledger was waiting for.',
    input_schema: schema({ decisionId: { type: 'string' } }, ['decisionId']),
    kind: 'write',
    via: 'direct',
    moneyGated: false,
    async run(c, input) {
      const id = requireString(input, 'decisionId', 'approve_decision');
      const before = await getAction(c.ctx, id);
      if (!before) throw new AskToolRefusal(`There is no decision with id ${id} — list them with the decisions tool.`);
      const after = await approveAction(c.ctx, id, { executors: c.executors ?? productionExecutors(), live: c.live });
      // SHADOW IS NOT DONE. An approval that resolved in full and then skipped
      // the side effect must never read as "done" — the employee says which.
      if (after.status === 'shadow_executed') {
        return `approved it — ${before.reasoning}. I am still in rehearsal, though, so nothing actually left the building and nothing was really changed`;
      }
      if (after.status === 'failed') {
        return `tried to approve it and could not — ${after.failureReason ?? 'the action failed and the reason was not recorded'}`;
      }
      return `approved it — ${before.reasoning}`;
    },
  },
  {
    name: 'decline_decision',
    description: 'Decline one queued decision so it never happens. Get the id from the `decisions` tool.',
    input_schema: schema({ decisionId: { type: 'string' } }, ['decisionId']),
    kind: 'write',
    via: 'direct',
    moneyGated: false,
    async run(c, input) {
      const id = requireString(input, 'decisionId', 'decline_decision');
      const before = await getAction(c.ctx, id);
      if (!before) throw new AskToolRefusal(`There is no decision with id ${id} — list them with the decisions tool.`);
      await declineAction(c.ctx, id);
      return `declined it — ${before.reasoning}`;
    },
  },
  {
    name: 'set_dial',
    description:
      'Change ONE capability on the dial: "do" (I do it myself), "ask" (I queue it for you) or "never" (this business does not do it — I stop running it altogether). Owner or manager only. Read `settings` first so you change the right one.',
    input_schema: schema(
      {
        capability: {
          type: 'string',
          description: 'One of: overdue_chase, reorder_nudge, lead_revival, win_back, quote_draft, quote_upsell, proof_loop, enquiry_intake, stalled_job_nudge, seasonality_push, cost_creep_alert, cash_flow_alert, concentration_alert, gdpr_erasure.',
        },
        mode: { type: 'string', enum: ['do', 'ask', 'never'] },
      },
      ['capability', 'mode'],
    ),
    kind: 'write',
    via: 'direct',
    moneyGated: false,
    async run(c, input) {
      const capability = requireString(input, 'capability', 'set_dial');
      const mode = requireString(input, 'mode', 'set_dial');
      if (!isCapability(capability)) throw new AskToolRefusal(`"${capability}" is not one of the capabilities on the dial.`);
      if (!isAutonomyMode(mode)) throw new AskToolRefusal('A dial setting is "do", "ask" or "never".');
      await setAutonomy(c.ctx, capability, mode);
      const words = capability.replace(/_/g, ' ');
      if (mode === 'do') return `set your dial so I handle ${words} myself`;
      if (mode === 'ask') return `set your dial so I ask you about ${words}`;
      return `switched ${words} off — I will not run it at all`;
    },
  },
  {
    name: 'set_rails',
    description:
      'Replace the RAILS wholesale — the limits I work inside. Send every rail you want kept, because this replaces the lot (that is the only way to express "clear this one"). Read `settings` first. Owner or manager only.',
    input_schema: schema({
      maxQuotePoundsWithoutApproval: { type: 'number', description: 'Above this quote value I ask. Omit to clear.' },
      maxAmountPoundsWithoutApproval: { type: 'number', description: 'Above this amount ANY action asks. Omit to clear.' },
      chaseToneCeiling: { type: 'string', enum: ['friendly', 'firm', 'final'], description: 'The firmest tone I may use unattended.' },
      neverContactCustomerIds: { type: 'array', items: { type: 'string' }, description: 'Customers I must never message unattended.' },
      quietHoursStartHour: { type: 'integer', description: 'London hour 0-23 when quiet hours begin.' },
      quietHoursEndHour: { type: 'integer', description: 'London hour 0-23 when they end.' },
    }),
    kind: 'write',
    via: 'direct',
    moneyGated: false,
    async run(c, input) {
      const quote = numberArg(input, 'maxQuotePoundsWithoutApproval');
      const amount = numberArg(input, 'maxAmountPoundsWithoutApproval');
      const tone = stringArg(input, 'chaseToneCeiling');
      const start = intArg(input, 'quietHoursStartHour', 0, 23);
      const end = intArg(input, 'quietHoursEndHour', 0, 23);
      const rails: Rails = {
        maxQuotePenceWithoutApproval: quote === undefined ? undefined : Math.round(quote * 100),
        maxAmountPenceWithoutApproval: amount === undefined ? undefined : Math.round(amount * 100),
        chaseToneCeiling: tone === 'friendly' || tone === 'firm' || tone === 'final' ? tone : undefined,
        neverContactCustomerIds: Array.isArray(input.neverContactCustomerIds)
          ? (input.neverContactCustomerIds as unknown[]).filter((v): v is string => typeof v === 'string')
          : undefined,
        quietHours: start !== undefined && end !== undefined ? { startHour: start, endHour: end } : undefined,
      };
      await setRails(c.ctx, rails);
      return 'saved your rails';
    },
  },
  {
    name: 'save_house_rules',
    description:
      'Save the HOUSE RULES — the owner\'s own standing instructions, in their own words ("never chase Aldermoor, they always pay", "no fittings on a Friday"). Replaces the whole list, so send the ones being kept as well. Owner or manager only.',
    input_schema: schema({ rules: { type: 'array', items: { type: 'string' }, description: 'One rule per entry, in the owner\'s own words.' } }, ['rules']),
    kind: 'write',
    via: 'direct',
    moneyGated: false,
    async run(c, input) {
      const rules = Array.isArray(input.rules) ? (input.rules as unknown[]).filter((v): v is string => typeof v === 'string') : [];
      if (rules.length === 0) throw new AskToolRefusal('Say the rule in your own words and I will write it down.');
      const saved = await saveHouseRules(c.ctx, rules);
      return saved.length === 1 ? 'written your house rule down' : `written your ${saved.length} house rules down`;
    },
  },
  {
    name: 'set_custom_domain',
    description: 'Point the Hub at one of the business\'s own domains (or clear it). Owner only.',
    input_schema: schema({ domain: { type: 'string', description: 'A hostname like hub.example.co.uk, or empty to clear it.' } }),
    kind: 'write',
    via: 'direct',
    moneyGated: false,
    async run(c, input) {
      const domain = stringArg(input, 'domain');
      const result = await setCustomDomain(c.ctx, { tenantId: c.ctx.tenantId, domain });
      if (!result.ok) throw new AskToolRefusal(SET_DOMAIN_REFUSAL[result.error]);
      return domain ? `pointed the Hub at ${domain}` : 'cleared your custom domain';
    },
  },
];

// ===========================================================================
// THE REGISTRY
// ===========================================================================

export const ASK_TOOLS: readonly AskTool[] = [...READ_TOOLS, ...LEDGER_WRITE_TOOLS, ...CONTROL_WRITE_TOOLS];

const TOOLS_BY_NAME: ReadonlyMap<string, AskTool> = new Map(ASK_TOOLS.map((t) => [t.name, t]));

export function askTool(name: string): AskTool | undefined {
  return TOOLS_BY_NAME.get(name);
}

/** The registry as Anthropic tool definitions — derived, never hand-maintained alongside it. */
export function askToolDefinitions(): ClaudeToolDefinition[] {
  return ASK_TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.input_schema }));
}

// ===========================================================================
// FAMILIES — WHICH TOOLS A QUESTION ACTUALLY NEEDS (2026-09-03, Wave 9)
// ===========================================================================
// THE MEASUREMENT THAT CAUSED THIS. One Ask call sent ~28,000 tokens before
// the person had finished typing: the system prompt is ~3k of it and the
// other ~25k is SIXTY-ONE tool definitions, every one of them, on every
// question, including "what does the Bell Inn owe?". A shop asks a hundred
// questions a week; at Sonnet's input rate that is the whole cost story.
//
// SO: the router (route.ts's `familiesFor`) says which FAMILIES a question
// belongs to, and this file turns those families into the tool array the
// call actually carries. A plain money lookup gets ~14 tools instead of 61.
//
// TWO RULES, and they are the whole design:
//
//   1. A FAMILY SET IS STABLE, NEVER PER-QUESTION. The tools array is part of
//      Anthropic's cached prefix (it is serialised BEFORE `system`, and the
//      cache_control marker on the system block covers everything above it —
//      ai/anthropic-client.ts's own note). A set assembled per question would
//      therefore miss the cache on EVERY call and cost more than sending all
//      61 did. The subsets are keyed on the family set alone, sorted by name,
//      and there are a small fixed number of them — so the second money
//      question of the morning reads its prefix out of the cache at a tenth
//      of the price.
//
//   2. WHEN IN DOUBT, SEND EVERYTHING. Ask's brief is "not locked down": a
//      question that reaches for a tool that is not there answers worse, and
//      that is a far worse outcome than a few pence. The router falls back to
//      'everything' whenever it cannot place a question, and EVERY deep
//      question (judgement, multi-step, any write) carries the full set.
//
// A NEW TOOL WITH NO FAMILY IS A BUILD FAILURE, not a silent omission —
// tools.test.ts asserts every name in ASK_TOOLS appears below.

/**
 * The question families. `core` is not a family the router assigns: it is the
 * handful of tools EVERY call carries whatever the question turned out to be
 * (who is this customer, what can I even see, what is the money position).
 * `everything` is the escape hatch — the full registry.
 */
export type AskToolFamily = 'money' | 'customers' | 'jobs' | 'quotes' | 'inbox' | 'settings' | 'writes' | 'everything';

/**
 * ALWAYS SENT. Four tools, chosen because they are what an answer needs when
 * the question turned out not to be what the router thought it was: the two
 * ways to resolve a name, the money position, and "what am I even looking
 * at". Four definitions is ~1,200 tokens — the floor is deliberately tiny.
 */
export const ASK_CORE_TOOLS: readonly string[] = ['customer_by_name', 'figures', 'find_customer', 'what_i_can_see'];

/**
 * Every tool, tagged. A tool may sit in more than one family ("what are we
 * waiting on?" is a jobs question, a quotes question and an inbox question),
 * and the union of the assigned families is what goes on the wire.
 *
 * ONE TABLE, not a `families:` field on each of the sixty-one literals above:
 * the tuning that matters here is "is a money question carrying too much?",
 * which is a question about the WHOLE table, and a table you can read in one
 * screen is the only way to answer it. Exhaustiveness is enforced by test.
 */
const TOOL_FAMILIES: Readonly<Record<string, readonly AskToolFamily[]>> = {
  // ─── money: what we are owed, what we turned over, what we spent ────────
  financial_summary: ['money'],
  concentration: ['money'],
  overdue_invoices: ['money'],
  recent_invoices: ['money'],
  invoice_by_number: ['money'],
  invoice_superlative: ['money'],
  customer_invoices: ['money'],
  supplier_spend: ['money'],
  cash_forecast: ['money'],
  payment_anomalies: ['money'],
  // ─── customers: who they are, how they are behaving ─────────────────────
  customer: ['customers'],
  customer_last_contact: ['customers', 'inbox'],
  customer_extremes: ['customers'],
  customer_health: ['customers'],
  reorder_due_customers: ['customers'],
  customer_signs: ['customers', 'jobs'],
  search_memory: ['customers', 'inbox', 'jobs'],
  // ─── jobs and the day ───────────────────────────────────────────────────
  day: ['jobs'],
  briefing: ['jobs'],
  waiting: ['jobs', 'quotes', 'inbox'],
  jobs_overview: ['jobs'],
  job: ['jobs'],
  jobs_at_risk: ['jobs'],
  counts: ['jobs', 'customers'],
  hours_on_job: ['jobs'],
  week_in_review: ['jobs'],
  seasonality: ['jobs'],
  decisions: ['jobs', 'inbox', 'settings'],
  // ─── quotes and pricing ─────────────────────────────────────────────────
  quote_funnel: ['quotes'],
  suggest_price: ['quotes'],
  negotiate: ['quotes'],
  price_probe: ['quotes'],
  price_book_health: ['quotes'],
  cost_creep: ['quotes'],
  tax_treatment: ['quotes'],
  // ─── settings, the dial, the shop's own state ───────────────────────────
  settings: ['settings'],
  business_config: ['settings'],
  system_health: ['settings'],
  // ─── the core four, listed here too so the exhaustiveness test is honest ─
  find_customer: ['customers', 'inbox'],
  customer_by_name: ['customers'],
  figures: ['money'],
  what_i_can_see: ['settings'],
  // ─── every write. A write question is ALWAYS deep (route.ts), so this
  //     family is in practice only ever sent as part of 'everything' — it is
  //     tagged anyway so the table stays exhaustive and a future fast write
  //     path has somewhere to land. ────────────────────────────────────────
  create_job: ['writes'],
  move_job_stage: ['writes'],
  book_fitting: ['writes'],
  create_quote: ['writes'],
  chase_customer: ['writes'],
  send_quote: ['writes'],
  revise_quote: ['writes'],
  create_proof: ['writes'],
  send_proof: ['writes'],
  cancel_fitting: ['writes'],
  unblock_stage: ['writes'],
  pause: ['writes'],
  resume: ['writes'],
  approve_decision: ['writes'],
  decline_decision: ['writes'],
  set_dial: ['writes'],
  set_rails: ['writes'],
  save_house_rules: ['writes'],
  set_custom_domain: ['writes'],
};

/** The families one tool belongs to. `[]` for a name that is not a tool. */
export function familiesOfTool(name: string): readonly AskToolFamily[] {
  return TOOL_FAMILIES[name] ?? [];
}

/** The whole table, for the exhaustiveness test and the offline token count. */
export function askToolFamilyTable(): Readonly<Record<string, readonly AskToolFamily[]>> {
  return TOOL_FAMILIES;
}

/**
 * The tool NAMES for a set of families — sorted, deduplicated, deterministic.
 * Sorted by name rather than left in registry order for the reason rule 1
 * gives: two calls that resolve to the same families must produce a
 * byte-identical tools array, or the cached prefix misses.
 */
export function askToolNamesFor(families: readonly AskToolFamily[]): string[] {
  if (families.length === 0 || families.includes('everything')) return ASK_TOOLS.map((t) => t.name).sort();
  const wanted = new Set<string>(ASK_CORE_TOOLS);
  for (const tool of ASK_TOOLS) {
    if (familiesOfTool(tool.name).some((f) => families.includes(f))) wanted.add(tool.name);
  }
  return [...wanted].sort();
}

/**
 * The tool DEFINITIONS for a set of families — what ask.ts puts on the wire.
 * An empty family list, or `everything`, is the full registry.
 */
export function askToolDefinitionsFor(families: readonly AskToolFamily[]): ClaudeToolDefinition[] {
  const names = new Set(askToolNamesFor(families));
  return ASK_TOOLS.filter((t) => names.has(t.name))
    .map((t) => ({ name: t.name, description: t.description, inputSchema: t.input_schema }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** What the model is told when a money tool is called by a role that cannot see money. An explicit refusal, never an empty result — the model must say "you cannot see that", not "there is nothing there". */
export const MONEY_REFUSAL =
  'Not available to this login: money figures are for the owner, manager and operator only. Answer from the rest, and say plainly, once, that the figures are not yours to see.';

/** Plain-words tool names for the status line — "looking at the invoices…". Anything unlisted falls back to the tool's own name with the underscores taken out. */
const TOOL_LABEL: Readonly<Record<string, string>> = {
  briefing: 'reading today',
  day: 'checking the diary',
  waiting: 'checking what we are waiting on',
  figures: 'looking at the money',
  counts: 'counting things up',
  financial_summary: 'looking at the revenue',
  concentration: 'checking customer concentration',
  overdue_invoices: 'looking at the invoices',
  recent_invoices: 'looking at recent invoices',
  invoice_by_number: 'pulling up that invoice',
  invoice_superlative: 'looking at the invoices',
  customer_invoices: 'reading their invoice history',
  supplier_spend: 'looking at supplier spend',
  find_customer: 'looking them up',
  customer: 'reading their record',
  customer_by_name: 'looking them up',
  customer_last_contact: 'checking when we last spoke',
  customer_extremes: 'looking across the customer book',
  customer_health: 'checking who has gone quiet',
  reorder_due_customers: 'checking who is due another order',
  payment_anomalies: 'checking how people are paying',
  jobs_overview: 'looking at the board',
  job: 'opening the job',
  jobs_at_risk: 'checking what is stuck',
  quote_funnel: 'checking how quoting is converting',
  cash_forecast: 'looking at what is coming in',
  seasonality: 'checking the seasonal pattern',
  cost_creep: 'checking material prices',
  price_probe: 'checking what we have charged before',
  price_book_health: 'checking the price book',
  settings: 'checking what you have told me to do',
  decisions: 'checking what needs you',
  what_i_can_see: 'checking what I can actually see',
  system_health: 'checking the plumbing',
  create_job: 'opening the job',
  move_job_stage: 'moving the job on',
  book_fitting: 'putting it in the diary',
  create_quote: 'drafting the quote',
  chase_customer: 'writing the chase',
  pause: 'pausing everything',
  resume: 'starting again',
  approve_decision: 'approving it',
  decline_decision: 'declining it',
  set_dial: 'changing your dial',
  set_rails: 'saving your rails',
  save_house_rules: 'writing your rule down',
  set_custom_domain: 'setting your domain',
};

export function toolLabel(name: string): string {
  return TOOL_LABEL[name] ?? name.replace(/_/g, ' ');
}

// ===========================================================================
// THE EXECUTOR
// ===========================================================================

/** One executed call, as ask.ts records it. Mirrors agents/runtime.ts's AgentToolCall so the numeric-egress helpers work on both unchanged. */
export interface AskToolCall {
  name: string;
  input: Record<string, unknown>;
  ok: boolean;
  data?: unknown;
  error?: string;
}

export type AskToolResult = { ok: true; data: unknown } | { ok: false; message: string };

/** Turns a ledger outcome into the sentence the employee says. PURE, and exported so every branch is unit-tested without a database. */
export function describeLedgerOutcome(outcome: ProposeOutcome, phrases: AskPhrases): { text: string; actionId: string } {
  const action: ActionRecord = outcome.action;
  const already = outcome.created ? '' : ' (I already had that one, so nothing was duplicated)';
  switch (action.status) {
    case 'executed':
      return { text: `Done — I ${phrases.did}.${already}`, actionId: action.id };
    case 'shadow_executed':
      return {
        text: `I would have ${phrases.did} — I am still in rehearsal, so nothing actually left the building. It is on Done with everything it would have carried.${already}`,
        actionId: action.id,
      };
    case 'awaiting_human':
      return { text: `Queued for you — ${action.reasoning}. It is the first thing on Decide.${already}`, actionId: action.id };
    case 'proposed':
      return {
        text: `You have got me paused, so I have parked it — ${phrases.todo} is waiting and nothing goes out until you resume.${already}`,
        actionId: action.id,
      };
    case 'declined':
      return { text: `That one was already declined, so I have left it alone.`, actionId: action.id };
    case 'failed':
      return { text: `I could not — ${action.failureReason ?? 'the action failed and the reason was not recorded'}.`, actionId: action.id };
    default:
      return { text: `I have put it in the ledger — it is ${action.status.replace(/_/g, ' ')}.${already}`, actionId: action.id };
  }
}

/**
 * The executor ask.ts drives. Four failure modes, ALL reported back to the model
 * as an error tool_result rather than thrown, so one bad call degrades an answer
 * instead of killing it:
 *   · an unknown tool name (the model invented one),
 *   · a money tool called by a role that cannot see money,
 *   · a tool refusing with a sentence (AskToolRefusal — bad id, no email, past date),
 *   · the accessor or the operator itself throwing.
 */
export function buildAskToolExecutor(c: AskToolCtx): (name: string, input: Record<string, unknown>) => Promise<AskToolResult> {
  return async (name, input) => {
    const tool = TOOLS_BY_NAME.get(name);
    if (!tool) {
      return { ok: false, message: `There is no tool called "${name}". Available: ${ASK_TOOLS.map((t) => t.name).join(', ')}.` };
    }
    if (tool.moneyGated && !canSeeMoney(c.ctx)) {
      return { ok: false, message: MONEY_REFUSAL };
    }
    try {
      if (tool.kind === 'read') {
        // EVERY result, no exceptions — see ask/untrusted-wrap.ts's header.
        // moneyOut FIRST: round every float to 2dp before customer text gets
        // wrapped in tags, so a stray "12164.998" never reaches the model.
        return { ok: true, data: wrapCustomerText(moneyOut(await tool.run(c, input))) };
      }
      if (tool.via === 'direct') {
        return { ok: true, data: { done: `Done — I have ${await tool.run(c, input)}.` } };
      }
      const facts = await tool.resolve(c, input);
      const action = tool.build(facts, { now: c.now, ctx: c.ctx, question: c.question });
      const propose: ProposeFn = c.propose ?? ((tenantId, a, deps) => proposeActionWithOutcome(tenantId, a, deps));
      const outcome = await propose(c.ctx.tenantId, action, {
        executors: c.executors ?? productionExecutors(),
        live: c.live,
        now: c.now,
      });
      const described = describeLedgerOutcome(outcome, tool.phrases(facts));
      // amountPence rides along so the £ figure this write JUST grounded (an
      // invoice's real balance, a quote's real total) is visible to
      // collectAskAllowedPence — without it, a write tool's own result carried
      // only a phrase ("chased Whitmore Haulage") and never a number, so a
      // follow-up turn that correctly restated the very figure this action had
      // already verified (e.g. "make it friendlier", still £2,982.08) got that
      // TRUE figure egress-withheld into "[figure withheld]" mid-draft, because
      // nothing in THAT turn's own tool calls carried it forward. Found
      // 2026-09-03 testing a real multi-turn chase conversation.
      return { ok: true, data: { done: described.text, decisionId: described.actionId, status: outcome.action.status, amountPence: action.amountPence } };
    } catch (error) {
      // A REFUSAL IS A SENTENCE, NOT A CRASH. AskToolRefusal is this file's own
      // (bad id, no email, a date in the past); OperatorForbiddenError is the
      // operator's (a switched-off capability, a seat that may not change the
      // controls). Both are written to be read out loud — the model gets the
      // sentence and says it, and neither one ends an answer.
      if (error instanceof AskToolRefusal || error instanceof OperatorForbiddenError) return { ok: false, message: error.message };
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  };
}
