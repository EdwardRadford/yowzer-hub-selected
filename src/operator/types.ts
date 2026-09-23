// operator/types.ts — the small shared vocabulary every other file in this
// folder speaks. Deliberately separate from contract.ts: THAT file is the wire
// format between producers and the operator and must stay tiny and stable;
// THIS file is the operator's own internal shape (the ledger row, the status
// machine, the dial's vocabulary), which producers never see and never import.

import { actions } from '../schema-operator';
import type { ActionKind, Capability, ChaseTone, Reversibility } from './contract';

/**
 * The ledger's status machine. See schema-operator.ts's `actions` doc comment
 * for the transition diagram — this union is the same set, in TypeScript, so a
 * switch over it fails to compile when the set changes.
 */
export type ActionStatus =
  | 'proposed'          // written, not yet decided — the state a paused operator leaves rows in
  | 'awaiting_human'    // the dial (or a rail) said ask; it is on the needs-you tier
  | 'approved'          // a human said yes; execution follows in the same call
  | 'declined'          // a human said no; terminal
  | 'executed'          // the side effect really happened (OPERATOR_LIVE)
  | 'shadow_executed'   // fully resolved, side effect deliberately skipped, payload recorded
  | 'undone'            // reversed after the fact
  | 'failed';           // a guardrail refused it, or an executor threw

/** What the dial decided for one action. The two values the ledger column stores — a refused action never gets one, because nothing was decided. */
export type AutonomyDecision = 'did' | 'asked';

/**
 * The owner's per-capability setting. Not a ladder — every value is available
 * on day one.
 *
 *   'do'    — get on with it, unattended.
 *   'ask'   — do the work, but queue the result for a human.
 *   'never' — DON'T. Added 2026-09-03, because the first real client said "we
 *             will never offer sign maintenance" and there was no way to say
 *             it: on 'ask' the producer still ran every tick, still spent
 *             model calls, and still landed proposals on Decide for the owner
 *             to decline for ever. 'never' switches the capability OFF — the
 *             scheduler does not run its producer at all (dial.ts's
 *             isSwitchedOff, scheduler.ts's skippedNever), and a proposal for
 *             it is refused before it can reach the ledger.
 */
export type AutonomyMode = 'do' | 'ask' | 'never';

/** Ordinal rank for contract.ts's ChaseTone, so a ceiling comparison is an integer comparison rather than a string one. */
export const CHASE_TONE_RANK: Readonly<Record<ChaseTone, number>> = { friendly: 0, firm: 1, final: 2 };

/** True when `value` is one of the three tones — used to read a tone off an `unknown` payload without trusting it. */
export function isChaseTone(value: unknown): value is ChaseTone {
  return value === 'friendly' || value === 'firm' || value === 'final';
}

/**
 * ONE ledger row, as every accessor in this folder returns it. Dates are Date
 * objects (drizzle's own timestamp mapping), not ISO strings — the feed
 * formats; the ledger stores.
 */
export interface ActionRecord {
  id: string;
  tenantId: string;
  capability: Capability;
  kind: ActionKind;
  customerId: string | null;
  jobId: string | null;
  quoteId: string | null;
  invoiceId: string | null;
  payload: unknown;
  /** The final reasoning, INCLUDING any rail suffix — what the feed line shows verbatim. */
  reasoning: string;
  status: ActionStatus;
  autonomyDecision: AutonomyDecision | null;
  reversibility: Reversibility;
  idempotencyKey: string;
  amountPence: number | null;
  decidedBy: string | null;
  /** WHO this was asked of (operator/delegation.ts). Null = the decider seats generally. A non-decider whose id is here may answer it — see decide.ts's assertMayDecideTx — so every screen that renders the buttons has to be able to read it. */
  assignedTo: string | null;
  /** When it was handed up because nobody answered in time. Null on everything answered, and on everything still inside its window. */
  escalatedAt: Date | null;
  failureReason: string | null;
  executionResult: unknown;
  undoInfo: UndoInfo | null;
  proposedAt: Date;
  decidedAt: Date | null;
  executedAt: Date | null;
  undoneAt: Date | null;
}

/** The raw drizzle row, before the narrowing below. Exported so a caller writing its own query can still hand the result to toActionRecord. */
export type ActionRow = typeof actions.$inferSelect;

/**
 * The ONE place a `actions` row becomes an ActionRecord. Every accessor in
 * this folder returns records through here, so the union narrowing (the
 * database stores `status` as text; the CHECK constraint is what makes the
 * cast honest) happens once rather than at six call sites with six chances to
 * drift.
 */
export function toActionRecord(row: ActionRow): ActionRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    capability: row.capability as Capability,
    kind: row.kind as ActionKind,
    customerId: row.customerId,
    jobId: row.jobId,
    quoteId: row.quoteId,
    invoiceId: row.invoiceId,
    payload: row.payload,
    reasoning: row.reasoning,
    status: row.status as ActionStatus,
    autonomyDecision: row.autonomyDecision as AutonomyDecision | null,
    reversibility: row.reversibility as Reversibility,
    idempotencyKey: row.idempotencyKey,
    amountPence: row.amountPence,
    decidedBy: row.decidedBy,
    assignedTo: row.assignedTo,
    escalatedAt: row.escalatedAt,
    failureReason: row.failureReason,
    executionResult: row.executionResult,
    undoInfo: (row.undoInfo ?? null) as UndoInfo | null,
    proposedAt: row.proposedAt,
    decidedAt: row.decidedAt,
    executedAt: row.executedAt,
    undoneAt: row.undoneAt,
  };
}

/**
 * How (and whether) one EXECUTED row can be reversed. Written at execution
 * time, never inferred later — the fact that matters ("was it delivered?") is
 * only knowable at the moment the side effect happened.
 *
 * NEVER A FAKE UNDO: a message that has left the building carries
 * `{ undoable: false, reason: 'delivered' }`, and undo.ts refuses on it with
 * that reason shown to the human rather than pretending.
 */
export type UndoInfo =
  | { undoable: true; kind: UndoKind; scheduledId?: string; quoteId?: string; jobId?: string; fromStage?: string | null; bookingRef?: string; previous?: unknown }
  | { undoable: false; reason: string };

/** What undoing this row actually does. 'nothing_happened' is the shadow case — the ledger flips, no port is called. */
export type UndoKind =
  | 'nothing_happened'
  | 'clear_flag'
  | 'cancel_scheduled_send'
  | 'delete_quote'
  | 'restore_quote'
  | 'delete_job'
  | 'move_job_stage_back'
  | 'cancel_fitting';

/** Thrown by every path that refuses to touch the outside world because the kill switch is down. */
export class OperatorPausedError extends Error {
  readonly tenantId: string;

  constructor(tenantId: string) {
    super('The operator is paused for this tenant — nothing executes until it is resumed.');
    this.name = 'OperatorPausedError';
    this.tenantId = tenantId;
  }
}

/** Thrown when the caller's role is not allowed to make this decision. Mirrors the accessor layer's "refuse, never partially serve" posture. */
export class OperatorForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OperatorForbiddenError';
  }
}

/** Thrown when an action id does not exist in the caller's tenant, or is in a status this operation cannot act on. */
export class ActionNotActionableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActionNotActionableError';
  }
}

/**
 * Thrown by decide.ts's editAction when the owner's edit, merged onto the
 * stored payload (payload-validate.ts), no longer satisfies its own kind — a
 * required field the merge still couldn't find, or a field left malformed.
 * A SUBCLASS OF OperatorForbiddenError, deliberately: the web app's
 * `refusalFor` (apps/web/lib/decide.ts) already prints an OperatorForbiddenError's
 * `message` verbatim as the refusal sentence on the page, via `instanceof`,
 * which matches a subclass exactly as it matches the base class — so this
 * refuses in plain English on the existing screen without that file needing
 * a new case for it.
 */
export class ActionEditInvalidError extends OperatorForbiddenError {
  constructor(message: string) {
    super(message);
    this.name = 'ActionEditInvalidError';
  }
}
