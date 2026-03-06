# PadelRunde Sport-Editorial Frontend Redesign

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform PadelRunde from a generic shadcn starter into a distinctive sport-editorial interface — bold typography, energetic colors, scoreboard-inspired data, and premium feel.

**Architecture:** CSS-first approach using Tailwind + Google Fonts loaded via `<link>` in root head. No new JS animation library — use CSS transitions/animations and Tailwind's built-in animation utilities. All existing shadcn/ui components kept but restyled via CSS variables and Tailwind classes.

**Tech Stack:** Tailwind CSS 4.1, Google Fonts (Archivo Black + DM Sans), existing shadcn/ui components

---

## Design Tokens

**Fonts:**
- Display: `Archivo Black` (headings, scores, rank numbers)
- Body: `DM Sans` (everything else)

**Colors:**
- `--brand-red: #E63946` (primary accent — CTAs, live indicators, active states)
- `--brand-navy: #1D3557` (secondary — headers, dark sections, authority)
- `--brand-teal: #2A9D8F` (success/positive — wins, completed)
- `--bg: #FAFAF9` / dark `#0C0C0C`
- `--surface: #FFFFFF` / dark `#141414`
- `--text: #1A1A1A` / dark `#F5F5F4`
- `--text-muted: #6B7280` / dark `#9CA3AF`

**Tier colors (standings):**
- Rank 1-2: `#D4AF37` gold left-border + subtle gold bg
- Rank 3-4: `#A8A8A8` silver left-border
- Rank 5-6: `#CD7F32` bronze left-border
- Rank 7-8: `#6B7280` neutral left-border

---

### Task 1: Design System Foundation — Fonts & Colors

**Files:**
- Modify: `src/routes/__root.tsx` (add font links to head)
- Modify: `src/styles/app.css` (add CSS variables, font-family, base styles)

**Step 1: Add Google Fonts to root head**

In `src/routes/__root.tsx`, add to the `head()` function's `links` array:
```tsx
{ rel: "preconnect", href: "https://fonts.googleapis.com" },
{ rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
{ rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Archivo+Black&family=DM+Sans:wght@400;500;600;700&display=swap" },
```

**Step 2: Set up CSS variables and base typography in `app.css`**

Replace entire file with:
```css
@import 'tailwindcss';

@theme {
  --font-display: 'Archivo Black', sans-serif;
  --font-body: 'DM Sans', sans-serif;
  --color-brand-red: #E63946;
  --color-brand-navy: #1D3557;
  --color-brand-teal: #2A9D8F;
  --color-gold: #D4AF37;
  --color-silver: #A8A8A8;
  --color-bronze: #CD7F32;
}

@layer base {
  html, body {
    font-family: var(--font-body);
    @apply text-[#1A1A1A] bg-[#FAFAF9] antialiased;
  }

  h1, h2, h3 {
    font-family: var(--font-display);
  }

  .using-mouse * {
    outline: none !important;
  }
}
```

**Step 3: Verify fonts load**

Run: `bun run dev:web` and check the browser — headings should render in Archivo Black, body in DM Sans.

**Step 4: Commit**

```bash
git add src/routes/__root.tsx src/styles/app.css
git commit -m "feat: add sport-editorial design system foundation"
```

---

### Task 2: Redesign Home Page & Header

**Files:**
- Modify: `src/routes/index.tsx`

**Step 1: Redesign the header and hero**

Replace the Home component with a sport-editorial version:
- Header: navy background (`bg-brand-navy`), white text, bold uppercase "PADELRUNDE" title
- Hero (signed-out): Large uppercase headline, red CTA button, tagline with brand personality
- Group list (signed-in): Cards with subtle left border accent, hover lift animation, group name in display font

Key changes:
- Header: `bg-brand-navy text-white` instead of `bg-white border-b`
- h1 logo: `font-display text-xl uppercase tracking-wider`
- Hero h2: `font-display text-4xl uppercase leading-tight`
- CTA button: `bg-brand-red hover:bg-brand-red/90 text-white`
- Group cards: `border-l-4 border-brand-red hover:-translate-y-0.5 transition-all duration-200`

**Step 2: Verify in browser**

Check both signed-in and signed-out states.

**Step 3: Commit**

```bash
git add src/routes/index.tsx
git commit -m "feat: redesign home page with sport-editorial aesthetic"
```

---

### Task 3: Redesign Tournament View Page

**Files:**
- Modify: `src/routes/gruppe/$groupSlug/turnier/$tournamentId/index.tsx`

**Step 1: Redesign tournament header**

- Tournament name: `font-display text-3xl uppercase`
- Status badges: pill-shaped with brand colors (active=red, knockout=navy, finished=teal)
- Mode badge: outline style with uppercase text
- "Verwaltung" button: ghost style with navy color
- Back link: muted text with arrow prefix `<-`

**Step 2: Redesign round section headers**

- Round title: `font-display uppercase text-base tracking-wide` with a subtle bottom border
- Knockout phase titles get the red accent: `text-brand-red`

**Step 3: Verify layout**

Navigate to a tournament and check the header, badges, round sections.

**Step 4: Commit**

```bash
git add src/routes/gruppe/\$groupSlug/turnier/\$tournamentId/index.tsx
git commit -m "feat: redesign tournament view header and rounds"
```

---

### Task 4: Redesign Live Standings Table (LiveTabelle)

**Files:**
- Modify: `src/components/LiveTabelle.tsx`

This is the most important visual component — it should feel like a live sports scoreboard.

**Step 1: Redesign the table**

Key changes:
- Remove card wrapper — table stands on its own with `font-body`
- Title: `font-display uppercase tracking-wide text-lg` with a red underline accent
- Rank column: `font-display text-lg` (large bold numbers)
- Points column: `font-display text-lg text-brand-red` (hero stat)
- Tier indicator: 4px left border stripe instead of full background color
  - top → `border-l-4 border-gold`
  - high → `border-l-4 border-silver`
  - mid → `border-l-4 border-bronze`
  - low → `border-l-4 border-gray-300`
- Diff column: green for positive (`text-brand-teal`), red for negative (`text-brand-red`)
- Header row: uppercase, small text, muted color, letter-spacing
- Row hover: subtle background shift

**Step 2: Verify table renders correctly**

Check with tournament data — tiers, colors, rank display.

**Step 3: Commit**

```bash
git add src/components/LiveTabelle.tsx
git commit -m "feat: redesign standings table with scoreboard aesthetic"
```

---

### Task 5: Redesign Match Cards (SpielKarte)

**Files:**
- Modify: `src/components/SpielKarte.tsx`

**Step 1: Redesign match card to feel like a live score ticker**

Key changes:
- Score display (completed): `font-display text-2xl` — large, bold, centered scoreboard style
- Team names: `font-body font-semibold text-sm`
- Court label: small uppercase muted text at top
- Status badge (Fertig): `bg-brand-teal text-white` instead of secondary
- Score inputs: larger, centered, with `font-display` for the numbers
- Submit button: `bg-brand-red text-white`
- Card: subtle border, no shadow, clean lines
- Knockout tiebreaker: styled radio group with brand colors (not native radio buttons)

**Step 2: Verify with both completed and pending matches**

**Step 3: Commit**

```bash
git add src/components/SpielKarte.tsx
git commit -m "feat: redesign match cards with sport ticker aesthetic"
```

---

### Task 6: Redesign Knockout Bracket

**Files:**
- Modify: `src/components/KnockoutBracket.tsx`

**Step 1: Redesign bracket display**

Key changes:
- Section title: `font-display uppercase tracking-wide`
- Match cards: consistent with SpielKarte style
- Winner name: bold with brand-teal color
- Medal display: larger emojis, name alongside medal
- Labels (Halbfinale 1, Finale, etc.): `font-display uppercase text-xs tracking-widest text-brand-navy`
- Bracket connector lines: optional CSS `::before`/`::after` pseudo-elements connecting SF to Final

**Step 2: Verify bracket renders with knockout data**

**Step 3: Commit**

```bash
git add src/components/KnockoutBracket.tsx
git commit -m "feat: redesign knockout bracket display"
```

---

### Task 7: Redesign Partner Stats

**Files:**
- Modify: `src/components/PartnerStats.tsx`

**Step 1: Redesign expandable stats cards**

Key changes:
- Section title: `font-display uppercase tracking-wide`
- Player cards: clean, minimal, name in `font-semibold`
- Expand/collapse: smooth height transition (`transition-all duration-200`)
- Stats text: use compact inline badges for counts instead of plain text
- Partner counts: teal badges, Opponent counts: navy badges

**Step 2: Verify expand/collapse works smoothly**

**Step 3: Commit**

```bash
git add src/components/PartnerStats.tsx
git commit -m "feat: redesign partner stats with sport aesthetic"
```

---

### Task 8: Redesign Admin Page

**Files:**
- Modify: `src/routes/gruppe/$groupSlug/turnier/$tournamentId/admin.tsx`

**Step 1: Apply sport-editorial styling**

Key changes:
- Page title: `font-display uppercase`
- Status card: navy background with white text, action buttons in red/teal
- "Zur K.O.-Phase" button: prominent, `bg-brand-red text-white`
- "Turnier beenden" button: stays destructive but with sport styling
- Round sections: consistent with tournament view
- Admin match rows: cleaner layout, brand-colored inputs
- Tiebreaker radio: styled like SpielKarte's tiebreaker

**Step 2: Verify admin buttons and score editing**

**Step 3: Commit**

```bash
git add src/routes/gruppe/\$groupSlug/turnier/\$tournamentId/admin.tsx
git commit -m "feat: redesign admin page with sport-editorial styling"
```

---

### Task 9: Redesign Group Pages

**Files:**
- Modify: `src/routes/gruppe/$groupSlug/index.tsx`
- Modify: `src/routes/gruppe/$groupSlug/einstellungen.tsx`
- Modify: `src/routes/gruppe/$groupSlug/turnier/neu.tsx`
- Modify: `src/routes/gruppe/neu.tsx`

**Step 1: Apply consistent sport-editorial styling to all group pages**

Group dashboard:
- Group name: `font-display text-3xl uppercase`
- Tournament list: cards with left-border accent, status-colored
- Member section: clean, muted
- CTAs: brand-red

Create group / Create tournament forms:
- Form titles: `font-display uppercase`
- Labels: `font-body font-medium uppercase text-xs tracking-wider`
- Inputs: clean with subtle focus ring in brand-red
- Player selection grid: toggle buttons with selected state in brand-red
- Submit: `bg-brand-red text-white`

Settings page:
- Same form styling, consistent header

**Step 2: Navigate through all group flows to verify**

**Step 3: Commit**

```bash
git add src/routes/gruppe/
git commit -m "feat: redesign group pages with sport-editorial styling"
```

---

### Task 10: Redesign Developer Dashboard

**Files:**
- Modify: `src/routes/dev/index.tsx`

**Step 1: Apply sport-editorial styling**

- Title: `font-display uppercase`
- User cards with clean layout
- Toggle buttons in brand colors
- Consistent with overall design system

**Step 2: Verify dev dashboard functionality**

**Step 3: Commit**

```bash
git add src/routes/dev/index.tsx
git commit -m "feat: redesign developer dashboard"
```

---

### Task 11: Add Page Transitions & Micro-interactions

**Files:**
- Modify: `src/styles/app.css`
- Potentially modify components that benefit from entrance animations

**Step 1: Add CSS keyframes and utility classes**

In `app.css`, add:
```css
@keyframes fade-in-up {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@layer utilities {
  .animate-fade-in-up {
    animation: fade-in-up 0.3s ease-out both;
  }
}
```

**Step 2: Apply entrance animations to key components**

- Page content containers: staggered `animate-fade-in-up` with `animation-delay`
- Match cards in a grid: staggered delays for each card
- Standings table rows: subtle stagger

**Step 3: Verify animations feel smooth, not distracting**

**Step 4: Commit**

```bash
git add src/styles/app.css
git commit -m "feat: add page transitions and micro-interactions"
```

---

### Task 12: Final Polish & QA

**Files:** All modified files

**Step 1: Visual QA pass on every page**

Navigate through the entire app flow:
1. Home page (signed out) → sign in
2. Home page (signed in) → group list
3. Create group → group dashboard
4. Create tournament → tournament view
5. Score entry → live standings update
6. Admin page → knockout advancement
7. Dev dashboard

**Step 2: Check responsive behavior**

Verify at 375px (mobile), 768px (tablet), 1024px (desktop).

**Step 3: Run type-check**

```bash
bunx convex dev --once && npx tsc --noEmit
```

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete sport-editorial redesign polish"
```
