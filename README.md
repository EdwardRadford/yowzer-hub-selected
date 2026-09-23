# Yowzer Hub, selected source

Yowzer Hub is a multi-tenant operations platform I built for a sign manufacturing business. It runs
their quoting, chasing, booking and follow-up, reads the Xero and Dropbox they already used, and
escalates to a person only when one is genuinely needed. It is a commercial product, sold at £350 a
month, and I am the only engineer on it.

The full repository is private because it is a live system holding a real business's customer data.
This repository is the part worth reading: the contract the autonomous side of the system runs
under, the tool registry the model chooses from, and the database schema.

It will not build. It is here to be read.

## What is in here

| Path | What it is |
|---|---|
| `src/operator/contract.ts` | The capabilities and action kinds the system can propose. The trust model, as types. |
| `src/operator/types.ts` | The shape of a proposed action and its record in the ledger. |
| `src/ask/tools.ts` | The tool registry. Sixty-one tools: 42 read, 11 write through the ledger, 8 owner controls. The comments explain why the split is what it is. |
| `src/ai/types.ts` | Tool definition types passed to the model. |
| `schema/` | Thirteen migrations. Multi-tenancy and row-level security are visible here. |

## The idea, briefly

Every CRM sold to a small business asks it to type everything in, and nobody does, so the system
rots and the business goes back to a whiteboard. This one does the work and leaves the record
behind as a by-product instead.

That solves adoption and creates a harder problem, which is that nobody hands their livelihood to
something they cannot predict. Most of the design in these files exists to make an autonomous
system legible to the person carrying the risk:

- **One path for every workflow.** Queue, retrieve, verify, route, then resolve or escalate. Only
  one path means every automated decision leaves the same shaped trace, and you can reconstruct
  afterwards what it knew and why it acted.
- **Two kinds of write.** Anything done to a customer is proposed through a ledger where it is
  logged, attributed and undoable. The owner's own controls are not, and `src/ask/tools.ts`
  explains why at length. The short version: Pause is the kill switch, and a kill switch cannot
  depend on the machinery it switches off.
- **A dial rather than a switch.** Per capability, the owner chooses whether the system acts and
  tells them, or asks first. Trust is earned one capability at a time, and can be taken back the
  same way.
- **Rails it cannot cross.** Never-contact customers, a quote value above which a human always
  decides, quiet hours, tone. Enforced outside the model, because a prompt is a request and a rail
  is not.
- **Everything ships off.** Every customer-facing or money-touching capability deploys behind a
  flag that fails closed. Absent means off. Malformed means off.

Forty-two of the sixty-one tools only read. That ratio is the argument in one line: most of what an
agent should be able to do is look, and the things that change the world should be few, logged and
reversible.

## What is deliberately not here

The estimator, the negotiation engine, tax handling, pricing and tenant configuration. Those encode
how a real business prices its work, which is its commercial information rather than mine to
publish. Also absent: anything touching customer records, credentials or the request path of the
live system.

## Licence

No open licence. Published to be read, not reused.

Built by [Edward Radford](https://edwardradford.co.uk) · [case study](https://edwardradford.co.uk)
