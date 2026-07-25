# Pagora

Pagora is a personal credit-card tracking app. It helps you record what each
card charge was really for, how much of it has been paid, and which purchases
are still pending after partial or early payments.

The goal is not to replace the bank statement. The goal is to add the missing
context banks usually do not give: "what exactly am I paying for?"

## Why it exists

Credit-card statements usually show the merchant, date, and amount, but not the
real reason behind the purchase. When you make early payments or pay only part
of the card balance, the bank reduces the total balance, but it does not tell
you which specific purchases that money covered.

Pagora lets you:

- Register credit cards and their basic billing details.
- Add charges with a human-readable name and amount.
- Split a purchase into scheduled monthly installments while keeping a
  synchronized full-amount parent charge.
- Track paid and pending amounts per charge.
- Pay one specific charge.
- Pay several charges in order with a single amount.
- Keep a payment log for later review.

This makes it easier to know what you already covered, what moved into the next
billing cycle, and what remains unpaid.

## Current Status

This is an active work in progress. The core idea and data model are already in
place, but the product, copy, and UX are still being refined.

## Stack

- Next.js
- React
- TypeScript
- Prisma
- PostgreSQL
- Tailwind CSS
- shadcn/ui
- Zustand
- Discord OAuth

## Development

Install dependencies:

```bash
pnpm install
```

Start the local database:

```bash
docker compose up -d
```

Run migrations and generate Prisma client:

```bash
pnpm prisma migrate dev
pnpm prisma generate
```

Start the development server:

```bash
pnpm dev
```

Open http://localhost:3000.

## MCP Access

Pagora exposes a protected MCP HTTP endpoint at:

```txt
/api/mcp
```

Agents must authenticate every request with a bearer token:

```http
Authorization: Bearer pagora_...
```

Token management uses the normal Pagora web session:

- `GET /api/agent-tokens` lists token metadata.
- `POST /api/agent-tokens` creates a token and returns the raw token once.
- `DELETE /api/agent-tokens/:token_id` revokes a token.

Create-token body:

```json
{
  "name": "local agent",
  "scopes": ["cards:read", "charges:read", "charges:write", "payments:write"],
  "expires_at": "2026-12-31T23:59:59.000Z"
}
```

Available scopes:

- `cards:read`
- `charges:read`
- `charges:write`
- `payments:write`

Available MCP tools:

- `list_cards`
- `list_charges`
- `create_charge`
- `pay_charge`
- `pay_card_amount`
- `summarize_card`

Example MCP request:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list"
}
```

Protected-resource metadata is exposed at:

```txt
/.well-known/oauth-protected-resource
```

MCP deployment/version metadata is public so agents can verify rollouts:

```txt
/api/mcp/version
```

Authenticated agents can also call the MCP tool `get_mcp_version`.

## Client-first synchronization

Each card is cached locally in IndexedDB, scoped by user and card. Opening a
card renders that local copy first and then requests only changes after its
last synchronization cursor.

Every charge, category, or payment mutation increments `Card.sync_version`
and writes small `card_changes` entries in the same database transaction. The
sync endpoint returns upserts plus deletion tombstones; a request at the
current cursor returns `204 No Content`. A full snapshot is only required for
a new cache, an invalid cursor, or conflict recovery.

Creating, editing, and deleting charges is local-first. Pagora applies the
change immediately, persists the updated card and an ordered command in the
same IndexedDB transaction, and pushes that outbox when a connection is
available. Client mutation IDs make retries idempotent, including the case
where the server committed a command but its response never reached the
browser. Causal dependencies preserve offline sequences such as
create -> edit -> delete.

Installment plans use one atomic outbox command for the parent and every
monthly charge. The parent is an informational summary and is excluded from
financial totals; each installment carries the payable amount and scheduled
date. Paying an installment updates both rows in one server transaction.
Card-level payment allocation is idempotent, skips the summary, and never
prepays future installments.

If another member changed the same charge first, Pagora keeps the conflict in
IndexedDB and asks the user whether to accept the server version or retry the
local change against the latest revision. Multiple tabs coordinate pushes
with the browser Locks API and notify one another through `BroadcastChannel`.

Payments, sharing, agent tokens, and direct category administration intentionally
remain online-only. They represent financial, security, or shared configuration
operations and run only after pending charge changes have synchronized.

Pagora is also installable as a PWA. A Serwist service worker precaches a generic
offline shell and the versioned Next.js assets needed to run it. It never caches
authenticated dashboard HTML, API responses, Server Actions, or RSC payloads.
The shell reads the last verified user/card bootstrap and each card snapshot from
IndexedDB, so a previously opened card can be reopened, refreshed, and edited
without a connection. A card must be opened online at least once before it is
available offline. Logging out removes the visible snapshots and offline
bootstrap while preserving the user-scoped outbox and conflicts for recovery on
the next login.

## Notes

Amounts are stored as integers in cents to avoid floating-point money issues.
