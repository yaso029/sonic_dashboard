# Tailwind Migration & Theme Guide

The frontend uses **Tailwind CSS v4** (CSS-first config, no `tailwind.config.js`).
The brand was rebranded **navy/gold → dark green** at the token level, and a
light/dark mode architecture was added. The remaining inline-styled screens are
being converted onto the shared tokens + primitives below.

## Setup (done)

- `tailwindcss` + `@tailwindcss/vite` plugin in `vite.config.js`.
- `src/index.css` holds `@import "tailwindcss"`, `@custom-variant dark`, the brand
  `@theme` tokens, themeable surface variables, base styles, and the component
  primitives.
- Inter font loaded in `index.html`; a pre-paint script applies the saved theme.

## Brand tokens (`@theme` in `index.css`)

Dark-green finance palette. Generates utilities like `bg-primary`, `text-accent`,
`border-secondary`, `shadow-card`, `rounded-card`.

| Token | Value | Notes |
|-------|-------|-------|
| `--color-primary` | `#0B3D2E` | deep green — sidebar, primary buttons |
| `--color-primary-dark` | `#082B21` | hover/pressed |
| `--color-secondary` | `#14532D` | gradients, headers |
| `--color-accent` | `#1F7A59` | links, active, highlights |
| `--color-accent-light` | `#2E9B72` | accent **on dark surfaces** (sidebar active) |
| `--color-accent-soft` | `#E6F2EC` | pale tint — hover/selected on light |
| `--color-surface-dark` | `#071E16` | dark-mode app background |
| `--color-page` | `#F5F7F6` | light app background |
| `--color-ink` / `--color-muted` | `#102A20` / `#5C6B64` | text |
| `--color-success/warning/error` | `#15803D` / `#D97706` / `#DC2626` | semantic |

Legacy aliases (`navy`, `navy-light`, `gold`, `brand-green`) are **repointed to
green** so pre-rebrand screens recolor with no edits. Prefer the new names in new
code. Opacity modifiers work: `bg-primary/10`, `text-accent/40`.

## Light/dark surfaces (use for theme-able colours)

CSS variables that flip under `.dark` (set by `ThemeContext`). Reference them in
markup with arbitrary values so a screen adapts to both themes automatically:

| Variable | Use | In markup |
|----------|-----|-----------|
| `--surface` | cards/inputs/modals bg | `bg-[var(--surface)]` |
| `--surface-2` | table headers, hover rows, wells | `bg-[var(--surface-2)]` |
| `--border` | hairlines | `border-[var(--border)]` |
| `--text` | primary text | `text-[var(--text)]` |
| `--text-muted` | secondary text | `text-[var(--text-muted)]` |

Dark mode toggle: `import { useTheme, ThemeToggle } from '../ThemeContext'`.

## Shared primitives (compose these instead of re-styling)

| Class | Purpose |
|-------|---------|
| `btn` + `btn-primary` / `btn-secondary` / `btn-accent` / `btn-outline` / `btn-ghost` / `btn-danger` (+ `btn-sm`) | Buttons — `className="btn btn-primary"`. Legacy `btn-gold`/`btn-green` map to accent. |
| `input`, `label`, `field-section` | Form controls (theme-aware). |
| `card` (+ `card-hover`) | Panel — surface bg, border, soft shadow. |
| `stat-card` + `stat-label` + `stat-value` | KPI/metric card. |
| `page-title` + `page-subtitle` | Screen headings. |
| `badge` + `badge-success`/`-warning`/`-error`/`-accent`/`-neutral` | Pills. |
| `modal-overlay` + `modal` | Centered modal scaffold (blurred backdrop). |
| `data-table` + `th` + `td` | Tables — header row, hover, cells. |
| `nav-link` (+ `nav-link-active`) | Sidebar links (on dark sidebar). |
| `notif-item` (+ `notif-item-unread`) | Notification rows. |

> **v4 gotcha:** `@apply` cannot reference another custom component class.
> Button variants only set colour and are combined in markup (`btn btn-primary`).
> Theme-able colours in primitives use raw `var(--…)`, not `@apply`.

## How to convert a screen

1. Delete inline `style` constant objects (`const inp = {...}`, `NAVY`, `GOLD`, …)
   and the `style={{...}}` props.
2. Map: text inputs/selects/textareas → `className="input"`; labels → `label`;
   modal wrapper → `modal-overlay` + `modal w-[…] …`; buttons → `btn btn-*`;
   cards → `card`; tables → `data-table`/`th`/`td`; headings → `page-title`.
3. Theme-able colours (text/bg/border that should differ light vs dark) → the
   `var(--surface|surface-2|border|text|text-muted)` utilities above.
4. **Data-driven** colours (per-row status hue, chart series, a gradient from a
   data field) — keep an inline `style={{ background: x }}` for *that property
   only*, or map the value to Tailwind classes. The drag library's
   `provided.draggableProps.style` must stay inline.
5. `npx vite build` to confirm it compiles (build verifies syntax, not pixels —
   eyeball in `npm run dev`, and test the dark-mode toggle).

## Status

**Migrated to Tailwind + dark-green theme:**
- Foundation: `index.css`, `ThemeContext.jsx`, `index.html`
- Layouts: `Layout`, `ModuleShell` (+ Agents/HR/Calendar/Partnerships wrappers)
- `pages/LoginPage`, `pages/Landing`
- `pages/DashboardPage`, `pages/KanbanPage`, `pages/LeadsPage`
- `pages/billing/InvoicesPage`, `pages/billing/InvoiceDetailPage`
- `pages/clients/*`, `pages/portal/*`, `pages/security/AuditLogPage`

**Still inline-styled (work fine, convert next):**
- CRM: `LeadDetailPage`, `components/ConvertLeadModal`, `components/ImportModal`
- Billing: `InvoiceFormModal`, `PaymentModal`
- HR: `hr/Employees`, `hr/ECards`; Calendar: `calendar/CalendarPage`
- Partnerships: `partnerships/*` (Dashboard, Partners, Outreach, Templates, Replies, Commissions, ReferralApplications)
- Agents: `agents/Dashboard`, `agents/ReferralPartners`; `services/ServicesPage`
- `SettingsPage`, `UsersPage`, `CustomersPage`, `ECardsPage`
- `components/ReferralForm`, `PublicReferralPage`, `PublicCardPage`
