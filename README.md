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

## Notes

Amounts are stored as integers in cents to avoid floating-point money issues.
