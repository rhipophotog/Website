# Brand & UI Spec — Focus Rings

> Logo and visual design for the CRM. Applies on top of `SPEC.md`. The product name is **not final**: use `APP_NAME` from `lib/brand.ts` everywhere (default `"RHIPO Studio"`), never hard-code it, so a rename is a one-line change.

## 1. Logo: "Focus rings"

Three open rings tightening toward a center point: a camera lens focusing, and leads narrowing down to a booking. Outer ring green, middle ring white, inner ring yellow, white center dot, on a bright blue rounded tile.

### Files (`brand/`)

| File | Use | Put at |
| --- | --- | --- |
| `logo-mark.svg` | Master app icon (rounded tile) | `public/brand/`; inline in `components/Logo.tsx` |
| `logo-mark-square.svg` | Square tile (platforms round corners themselves) | `public/brand/` |
| `logo-mark-maskable.svg` | Android maskable source | `public/brand/` |
| `logo-symbol-color.svg` | Rings only, for white backgrounds (green / blue / orange, blue dot) | `public/brand/` |
| `logo-symbol-white.svg` | Rings only, all white, for blue or dark backgrounds | `public/brand/` |
| `favicon.ico` (16/32/48) | Browser tab | `app/favicon.ico` |
| `icon-512.png` | App icon | `app/icon.png` |
| `apple-touch-icon.png` (180) | iPhone home screen | `app/apple-icon.png` |
| `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | PWA manifest | `public/brand/` |
| `social-profile-1080.png` | Social profile picture (owner use) | not in app |

A wordmark/lockup and link-preview image will be added once the name is final.

### `components/Logo.tsx`
- Props: `size` (default 32), `variant` `'mark' | 'full'`, `tone` `'light' | 'dark'`.
- Mark: inline `logo-mark.svg`. Wordmark: HTML text `{APP_NAME}` in **Manrope 800**, letter-spacing −0.4px. Light tone: `gray-900`; dark tone: white.
- Gap between mark and text ≈ 0.35 × mark size.

## 2. Color tokens (Tailwind)

Bright, clean SaaS look: white surfaces, light gray page, blue primary, yellow and green as accents.

| Token | Hex | Use |
| --- | --- | --- |
| `primary-600` | `#1570EF` | Primary buttons, links, active nav, logo tile |
| `primary-700` | `#175CD3` | Hover / pressed |
| `primary-50` | `#EFF8FF` | Selected rows, active nav background |
| `accent-yellow` | `#FDB022` | Logo inner ring; highlights, "needs reply" badges (with dark text) |
| `accent-green` | `#32D583` | Logo outer ring |
| `success-600` | `#12B76A` → text `#027A48` | "Booked", success toasts |
| `warning-500` | `#F79009` → text `#B54708` | "Follow-up due", overdue |
| `error-600` | `#D92D20` | Errors, "Lost" |
| `gray-900` | `#101828` | Headings, body text |
| `gray-600` | `#475467` | Secondary text |
| `gray-200` | `#E4E7EC` | Borders, dividers |
| `gray-50` | `#F9FAFB` | Page background |
| `white` | `#FFFFFF` | Cards, sidebar, inputs |
| `sidebar-dark` (optional) | `#0C111D` | If a dark sidebar is preferred |

Rules: body text ≥ 4.5:1 contrast. Yellow and green are **never** used for text on white. Use the darker text shades listed. Status is never shown by color alone (always a label).

### Pipeline stage colors (column header dots + chips)
New inquiry `#1570EF` · Contacted `#7A5AF8` · Consult scheduled `#06AED4` · Consult done `#0BA5EC` · Proposal sent `#F79009` · Booked `#12B76A` · Pre-event `#16B364` · Event done `#2E90FA` · Delivered `#667085` · Lost `#D92D20` · Cold `#98A2B3`.

## 3. Typography
- Headings & wordmark: **Manrope** 700/800.
- UI & body: **Inter** 400/500/600.
- Sizes: page title 24/32, section 18/28, body 14/20 (desktop) and 15/22 (phone), small 12/18. Numbers in dashboards use tabular figures.

## 4. Components & layout
- Desktop: left sidebar (white, 240px) with logo at top, nav items with icons (Dashboard, Inbox, Pipeline, Contacts, Calendar, Workflows, Settings); active item `primary-50` background + `primary-600` text.
- Phone: bottom tab bar (Dashboard, Inbox, Pipeline, Contacts, Calendar), same active style.
- Cards: white, 1px `gray-200` border, 12px radius, subtle shadow `0 1px 2px rgba(16,24,40,.05)`.
- Buttons: primary (blue fill, white text), secondary (white, gray border), destructive (red). Height 40 desktop / 44 phone, radius 8.
- Pipeline board: columns on `gray-50`, cards white with couple names, event date, value, source chip, and days-in-stage.
- Icons: `lucide-react`, 20px, 1.75 stroke.

## 5. Manifest
`name` / `short_name`: `APP_NAME` · `theme_color: '#1570EF'` · `background_color: '#F9FAFB'` · icons 192, 512, maskable 512.
