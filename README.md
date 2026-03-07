# PadelRunde

Private web app for managing padel groups and running two tournament formats:

- `Americano` for `4` or `8` players
- `Cup` for `8` players with preliminary rounds and knockout finals

Production: [padelrun.de](https://padelrun.de)

## Features

- Private groups with member-based visibility
- Multiple tournaments per group
- Group admins and global super-admins
- Google sign-in via Clerk
- Convex-backed live data flow
- Match result entry with admin override
- Live standings and partner/opponent stats
- Backoffice for global permissions and orphaned data cleanup

## Tournament Rules

### Americano

- Supported player counts: `4` or `8`
- Every player partners with every other player exactly once
- Opponent repetition is minimized
- Each match totals `32` points
- `16:16` draws are allowed
- Standings are sorted by:
  1. points
  2. wins
  3. point differential

### Cup

- Exactly `8` players
- `5` preliminary rounds
- Semifinals:
  - `1 + 8` vs `2 + 7`
  - `3 + 6` vs `4 + 5`
- Final and bronze match
- Knockout matches cannot end undecided:
  - `16:16` is allowed
  - a winner must still be selected

## Stack

- `Bun`
- `TypeScript`
- `TanStack Start`
- `TanStack Router`
- `Convex`
- `Clerk`
- `Tailwind CSS`
- `Vercel`

## Local Development

### Prerequisites

- `Bun`
- `Node.js`
- Convex and Clerk project access

### Environment

Create `.env.local` with the app and Convex values used by the local dev setup, for example:

```env
CONVEX_DEPLOYMENT=dev:your-deployment
VITE_CONVEX_URL=https://your-deployment.convex.cloud
VITE_CONVEX_SITE_URL=https://your-deployment.convex.site
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```

Convex deployment env also needs:

```env
CLERK_JWT_ISSUER_DOMAIN=https://your-clerk-domain
CLERK_WEBHOOK_SECRET=whsec_...
SUPERADMIN_CLERK_IDS=user_...
```

### Install

```bash
bun install
```

### Run

```bash
bun run dev
```

Useful commands:

```bash
bun run lint
bunx tsc --noEmit
bun test
bun run build
```

## Deployment Notes

- Frontend is deployed on Vercel
- Backend is deployed on Convex
- Clerk production webhooks must point to:

```text
https://<your-convex-site>.convex.site/clerk-users-webhook
```

- `SUPERADMIN_CLERK_IDS` is only used as bootstrap/emergency access
- regular super-admin management happens in the app backoffice

## Repository Notes

- This repository is intentionally private
- generated output and local browser automation artifacts are ignored
