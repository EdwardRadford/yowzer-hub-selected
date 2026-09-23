// operator/contract.ts - THE shared contract between the things that PROPOSE
// actions (the outreach/quoting/ops agents) and the thing that DECIDES and
// EXECUTES them (the operator). Both sides build to this file; neither imports
// the other. Keep it small and boring - it is a wire format, not a framework.
//
// Lifecycle (owned by the operator):
//   proposed -> (dial says "do it") -> executed | shadow_executed
//            -> (dial says "ask")   -> awaiting_human -> approved -> executed | declined
//   executed -> undone (when reversible)
// The feed on every seat is a projection of this ledger.

/** The capability that produced the action - the unit the owner's dial toggles between "do it" and "ask me". */
export type Capability =
  | 'overdue_chase'
  | 'reorder_nudge'
  | 'lead_revival'
  | 'win_back'
  | 'quote_draft'
  | 'quote_upsell'
  | 'proof_loop'
  | 'enquiry_intake'
  | 'stalled_job_nudge'
  | 'seasonality_push'
  | 'cost_creep_alert'
  | 'cash_flow_alert'
  | 'concentration_alert'
  | 'gdpr_erasure'
  | 'send_cap_hit'
  // Added 2026-09-03 (the integration pass). Every one of these is a producer
  // that already existed and was casting its capability string through
  // `as Capability` because it did not own this file. The casts are gone.
  | 'customer_reply'
  | 'job_completion'
  | 'anomaly_alert'
  | 'post_mortem'
  | 'review_ask'
  | 'auto_invoice'
  | 'purchasing'
  | 'production_scheduler'
  | 'fitting_scheduler'
  | 'status_update'
  | 'referral_partner'
  | 'maintenance_offer'
  | 'prospecting'
  | 'weather_fitting'
  | 'storm_outreach'
  | 'vehicle_reminder'
  | 'case_study'
  | 'compliance'
  // Added 2026-09-05 (the simulated week): somebody is off, their fittings need cover.
  | 'absence_cover';

/** What the action physically does. The executor dispatches on this. */
export type ActionKind =
  | 'send_email'
  | 'send_sms'
  | 'create_quote'
  | 'update_quote'
  | 'create_job'
  | 'move_job_stage'
  | 'book_fitting'
  | 'flag_for_review' // no side effect - a signal surfaced to a human (FYI / needs-you without a send)
  | 'erase_customer'
  // Added 2026-09-03. `create_invoice` is the auto-invoice producer's kind.
  // The other six make the mutations Ask could NAME but never REACH into
  // real, ledgered, dial-governed actions: sendQuote, createProof, sendProof,
  // reviseQuote, cancelFitting, and the scheduler's unblockStage.
  | 'create_invoice'
  | 'send_quote'
  | 'create_proof'
  | 'send_proof'
  | 'revise_quote'
  | 'cancel_fitting'
  | 'unblock_stage';

/** Consequence class - the operator's default posture per kind before the owner's dial is applied. */
export type Reversibility = 'reversible' | 'irreversible';

export interface ActionTarget {
  customerId?: string;
  jobId?: string;
  quoteId?: string;
  invoiceId?: string;
}

/** How firm a chase message is. Ordered friendly < firm < final - the owner's `chase_tone_ceiling` rail is a cap on this. */
export type ChaseTone = 'friendly' | 'firm' | 'final';

/** An outbound message payload (send_email / send_sms). Every one passes the outbound guardrails before execution. */
export interface MessagePayload {
  to: string;
  subject?: string;
  body: string;
  /** Every £ figure the producer grounded this message in, as integer pence - the numeric-egress guard verifies the body against these. */
  groundedPence: number[];
  /**
   * ADDED ADDITIVELY (2026-09-02, the operator build) - OPTIONAL, so every
   * producer written against the original shape still type-checks and behaves
   * identically.
   *
   * WHY IT HAD TO EXIST: `chase_tone_ceiling` is one of the owner's named
   * rails ("never get firmer than this without asking me"), and there was no
   * field on the wire for a producer to declare how firm its draft actually
   * is. Without it the rail could only be enforced by sniffing the body text,
   * which is exactly the kind of guess a safety rail must never be built on.
   * Omitted = the producer makes no tone claim, and the tone rail cannot trip.
   */
  tone?: ChaseTone;
  /**
   * ADDED ADDITIVELY (2026-09-03) — where this message sits in a conversation,
   * so a reply threads instead of arriving as a fresh email. Set by the
   * inbound side (channels/email, channels/twilio) when it is answering
   * something; absent means "this is a new conversation".
   */
  meta?: {
    /** The provider's conversation id — Gmail's `threadId`. Nullable because the inbox column is. */
    threadId?: string | null;
    /** The RFC822 Message-ID being replied to, when the ingest captured one. */
    inReplyTo?: string | null;
    /** The inbox row this answers, so the ledger row and the message can be matched up later. */
    providerId?: string;
    channel?: 'email' | 'sms' | 'whatsapp';
  };
  /**
   * The one-click opt-out link for this recipient. The consent gate fills it
   * in for marketing sends; the sender turns it into List-Unsubscribe headers.
   */
  unsubscribeUrl?: string;
}

// ---------------------------------------------------------------------------
// Payloads for the WRITE kinds (2026-09-02, wave 5 - the ports are wired).
// A producer that proposes one of these kinds builds exactly this shape; the
// production ports in operator/run.ts map it onto the mutation. Kept here, not
// in producers/, so both sides build to one file (see the header).
// ---------------------------------------------------------------------------

/** One quote line as the producers describe it - integer pence, with where the price came from. */
export interface QuoteLinePayload {
  description: string;
  qty: number;
  unitPence: number;
  /** The price book's provenance object - passed straight through to the quote line's priceBasis. */
  provenance: unknown;
}

/** update_quote: edits a DRAFT only. Every field optional - omit to leave it alone. */
export interface UpdateQuotePayload {
  lines?: QuoteLinePayload[];
  notes?: string;
  terms?: string;
}

/** create_job */
export interface CreateJobPayload {
  title: string;
  description?: string;
  /** Pounds, not pence - jobs.value_estimate is a money column the mutation converts. */
  valueEstimatePounds?: number;
  /** YYYY-MM-DD */
  dueDate?: string;
  priority?: 'normal' | 'rush' | 'urgent';
  /** Dedupes a re-detected enquiry; the mutation returns the existing job for a repeat key. */
  idempotencyKey?: string;
  /** Defaults to 'enquiry'. */
  initialStage?: string;
  /** The customer to open when nothing matched the sender — enquiries/intake.ts find-or-creates it at execution. */
  customer?: { name: string; businessName?: string | null; email?: string | null; phone?: string | null };
}

/** move_job_stage: enquiry|survey|quote|design|artwork|make|fit|invoice|complete */
export interface MoveJobStagePayload {
  toStage: string;
  /** Why - lands on the job's event trail. */
  note?: string;
}

/** book_fitting: ISO timestamps. */
export interface BookFittingPayload {
  start: string;
  end?: string;
  fitterUserId?: string;
  siteAddress?: unknown;
  notes?: string;
}

/** One invoice line as the producers describe it — integer pence. `accountCode` is a nominal ledger code the accounting system understands; omitted means "let it apply the org's own default sales account". */
export interface InvoiceLinePayload {
  description: string;
  qty: number;
  unitPence: number;
  accountCode?: string;
}

/**
 * create_invoice: raise a sales invoice against a finished job.
 *
 * Lives here, not in ingest/xero/write.ts where it was born, for the same
 * reason MessagePayload lives here — one shape both the producer and the
 * executor build to, in a file neither side has to import the other to read.
 */
export interface CreateInvoicePayload {
  lines: InvoiceLinePayload[];
  dueDays?: number;
  reference?: string | null;
  /** The accepted quote this was built from — carried so the ledger row can say where the figures came from. */
  quoteId?: string;
}

/** send_quote: put an existing quote in front of the customer with an accept link. Targets the quote; `to` defaults to the customer's address on file. */
export interface SendQuotePayload {
  /** Overrides the customer's stored address. Omitted = the address on file. */
  to?: string;
  /** Defaults to 14. */
  expiresInDays?: number;
}

/** create_proof: a new artwork proof against a job, for the customer to approve. Targets the job. */
export interface CreateProofPayload {
  /** The stored file this proof is of — a files/ ref, not an upload. */
  fileRef: string;
  /** Informational default recipient; send_proof may still use a different one. */
  sentTo?: string;
}

/** send_proof: put an existing proof in front of the customer. */
export interface SendProofPayload {
  proofId: string;
  /** Omitted = the customer's address on file. */
  to?: string;
}

/** revise_quote: supersede a sent/accepted quote with a fresh draft carrying its lines. Unlike update_quote (draft-only) this creates a new version. Targets the OLD quote. */
export interface ReviseQuotePayload {
  /** Free text kept on the new row and the job event; never shown to a customer. */
  reason?: string;
}

/** cancel_fitting: stand a booked fitting down. Targets the job. */
export interface CancelFittingPayload {
  bookingRef: string;
  reason?: string;
}

/** unblock_stage: clear a workshop blocker so a job can move again. Targets the job. */
export interface UnblockStagePayload {
  /** WHY it is unblocked — lands on the job's event trail. */
  note?: string;
}

export interface ProposedAction {
  capability: Capability;
  kind: ActionKind;
  target: ActionTarget;
  /** The one-line "why" shown on the feed line. Plain UK English, one sentence. */
  reasoning: string;
  /** Kind-specific payload - MessagePayload for sends; quote lines for quotes; etc. */
  payload: unknown;
  /** Producer's own view; the operator may override (e.g. any send to a customer is treated as irreversible once delivered). */
  reversibility: Reversibility;
  /** Producers must be deterministic about this so the operator can dedupe: the same opportunity proposed twice yields the same key. */
  idempotencyKey: string;
  /** Money the action is about, in pence, for the feed and the state header. Null when it carries no £. */
  amountPence: number | null;
}
