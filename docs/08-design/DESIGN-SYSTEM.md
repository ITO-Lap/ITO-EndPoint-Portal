# EndPoint+ Design System — Apple Glass + Verma Brand

> **Theme:** Apple Glass / Glassmorphism  
> **Brand:** Verma Technologies  
> **CSS file:** `src/index.css`  
> **Logo component:** `src/components/ui/AkvermaLogo.tsx`

---

## Brand Tokens

All brand colors are defined as CSS custom properties in `src/index.css`:

```css
:root {
  --brand-primary:   #4F46E5;   /* Verma primary */
  --brand-secondary:    #06B6D4;   /* Verma secondary */
  --brand-accent:     #22D3EE;   /* Verma accent */
  --z-gradient: linear-gradient(135deg, #22D3EE 0%, #4F46E5 50%, #06B6D4 100%);
}
```

---

## Color Palette

### Verma Brand
| Token | Hex | Usage |
|---|---|---|
| `--brand-primary` | `#4F46E5` | Primary buttons, active states, accents |
| `--brand-secondary` | `#06B6D4` | Gradient end, hover states |
| `--brand-accent` | `#22D3EE` | Gradient start, warm accents |

### Water Glow (Interaction)
| Token | Value | Usage |
|---|---|---|
| `--water-base` | `#0EA5E9` | Hover ring color |
| `--water-glow-sm` | multi-shadow | Small element hover |
| `--water-glow-md` | multi-shadow | Standard hover |
| `--water-glow-lg` | multi-shadow | Active/pressed state |

### Semantic
| Color | Hex | Usage |
|---|---|---|
| Compliant / Healthy | `#10B981` | Green — positive status |
| Warning | `#818CF8` | Amber — attention needed |
| Non-Compliant | `#EF4444` | Red — action required |
| Informational | `#0EA5E9` | Blue — neutral info |
| Purple accent | `#7C5CFC` | AI features, analytics |

---

## Glass Surface Utilities

```css
.glass        /* rgba(255,255,255,0.60) + blur(24px) */
.glass-light  /* rgba(255,255,255,0.75) + blur(32px) — sidebar, header */
.glass-strong /* rgba(255,255,255,0.85) + blur(40px) — modals, toasts */
```

Use `.glass` for cards, `.glass-light` for navigation, `.glass-strong` for overlays.

---

## Water Glow Interaction System

Applied to all interactive elements for consistent hover/active feedback:

```css
.water-glow       /* standard — for buttons, inputs, nav items */
.water-glow-sm    /* small — for badges, small chips */
.water-glow-card  /* cards — gentler spring animation for card grids */
```

**Behavior:**
- **Hover:** Blue ring `rgba(14,165,233,0.45)` + lift `translateY(-1px)`
- **Active/Click:** Deeper ring + inner wash + `scale(0.985)` press

---

## Button Variants

```tsx
// Primary — Verma orange gradient
<Button variant="solid" />        // bg: linear-gradient(135deg, #4F46E5, #06B6D4)

// Water/Blue — for informational actions  
<Button variant="water" />        // bg: linear-gradient(135deg, #0EA5E9, #6366F1)

// Outline — transparent with orange border
<Button variant="outline" />

// Ghost — transparent with subtle bg
<Button variant="ghost" />
```

All buttons are `rounded-full` (pill shape). Sizes: `sm` (h-7), `md` (h-8), `lg` (h-9).

---

## Badge Variants

```tsx
<Badge label="Compliant" variant="green" showDot={true} />
<Badge label="Non-Compliant" variant="red" />
<Badge label="Warning" variant="yellow" />
<Badge label="Info" variant="blue" />
<Badge label="Note" variant="gray" />
<Badge label="Action" variant="orange" />
```

All badges are `rounded-full` pills with translucent glass backgrounds.

---

## Card Pattern

```tsx
<DashboardCard
  title="Card Title"
  icon={SomeIcon}
  accent={true}           // shows Verma gradient top bar
  accentColor="#0EA5E9"  // override color (optional)
  action={<button>...</button>}
>
  {/* content */}
</DashboardCard>
```

Cards use `.glass` surface, `rounded-2xl` (16px), and a `2.5px` gradient top accent bar.

---

## Background

```css
.glass-bg  /* pearl-drift animated gradient — used for main content area */
```

The `glass-bg` class applies a slow 20s animated gradient (`pearl-drift` keyframe):
```
#EFF6FF → #F5F3FF → #F0F9FF → #F5F3FF → #F0FAFB → #EFF6FF
```

---

## Typography

- **Font:** `-apple-system, BlinkMacSystemFont, "SF Pro Display", Inter, sans-serif`
- **Font feature settings:** `cv02, cv03, cv04, cv11` (Inter ligatures)
- **Monospace numbers:** `.mono-num` class — uses `font-variant-numeric: tabular-nums`

### Scale
| Element | Size | Weight |
|---|---|---|
| Page title | `text-lg` (18px) | `font-black` |
| Section title | `text-sm` (14px) | `font-bold` |
| Card title | `text-sm` (14px) | `font-bold` |
| Table header | `text-[0.6rem]` | `font-bold uppercase tracking-widest` |
| Table data | `text-xs` (12px) | `font-medium` |
| Sub-labels | `text-[0.65rem]` | `font-semibold` |
| Micro labels | `text-[0.6rem]` | `font-black uppercase tracking-[0.15em]` |

---

## Layout Patterns

### Dashboard Grid (KPI cards)
```tsx
<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
```

### Two-column (chart + sidebar)
```tsx
<div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">
```

### Page wrapper
```tsx
<div className="flex flex-col gap-5 w-full page-enter">
```

`.page-enter` applies `animation: slide-up 0.25s cubic-bezier(0.34,1.56,0.64,1)` on mount.

---

## Verma Logo Components

All available in `src/components/ui/AkvermaLogo.tsx`:

```tsx
<EndpointPlusIcon className="h-10 w-auto" />           // petals only
<EndpointPlusWordmark size="md" />                       // "zinnia" text only
<EndpointPlusHorizontal iconSize="sm" wordmarkSize="sm" subtitle="IT Operations" />  // side-by-side
<EndpointPlusVertical iconSize="lg" wordmarkSize="xl" subtitle="IT Operations" />    // stacked
<EndpointPlusBadge />                                    // compact watermark
```

**Logo colors (official Verma brand):**
- Red petal: `#E8172D`
- Orange petal: `#4F46E5`
- Yellow petal: `#22D3EE`
- Wordmark: `#6D6E71` (warm gray), `font-bold`

---

## Sidebar Navigation Design

```
Group header:   text-[0.55rem] font-black uppercase tracking-[0.18em]
Active item:    linear-gradient(90deg, #4F46E5, #06B6D4) + box-shadow glow
Hover item:     water-glow or orange-tinted bg for Automation group
Icon size:      h-7 w-7 rounded-xl
```

**Automation group** uses an orange accent treatment (distinct from other groups).

**Detection & Response group** (when EDR is implemented) uses a red accent (`#EF4444`) to signal urgency.

---

## Toast Notifications

```tsx
notify('success', 'Title', 'Message')  // left accent: green
notify('error', 'Title', 'Message')    // left accent: red
notify('info', 'Title', 'Message')     // left accent: orange
```

Toast style: `.glass-strong` with colored left accent bar + icon. Rendered via `ToastProvider`.

---

## Animations

| Class | Keyframe | Usage |
|---|---|---|
| `.animate-slide-up` | 0.3s spring | Page mount, modal open |
| `.animate-fade-in` | 0.2s ease | Overlay fade |
| `.animate-float` | 3s ease-in-out infinite | Logo decoration |
| `.animate-pulse-water` | 2s ease-in-out infinite | Status pulse dots |
| `.animate-number-enter` | 0.4s spring | KPI counter reveal |

---

## Enterprise Table (`.z-table`)

```html
<table class="z-table">
  <thead><tr><th>Column</th></tr></thead>
  <tbody>
    <tr><td>Data</td></tr>
  </tbody>
</table>
```

Features:
- Sticky frosted header
- Orange hover row highlight (`#F5F3FF`)
- Sort button hover → `color: #4F46E5`
- Separator on sort header hover

Pagination: `.z-pagination` wrapper with prev/next buttons.

---

## AI Chip

```html
<div class="ai-chip">
  <icon />
  GPT-4o
  <dot class="animate-pulse" />
</div>
```

Style: `rounded-full`, blue-to-indigo gradient background, `0.6rem` uppercase text.

---

## Dark Theme (Entra Intelligence)

The Entra Intelligence Dashboard uses a self-contained dark theme. Do not apply dark styles outside this component.

```css
/* Only inside EntraIntelligenceDashboard */
background: #0d1117;
card: bg-slate-800/50 border-slate-700/60
text: text-slate-200 (primary), text-slate-400 (secondary)
status chips: translucent colored backgrounds (rgba)
```

---

## Responsive Breakpoints

| Breakpoint | px | Usage |
|---|---|---|
| `sm` | 640 | Show additional columns, 2-col grids |
| `lg` | 1024 | 3-col grids, sidebar layout |
| `xl` | 1280 | 5-col KPI grids, sidebar visible |
| `2xl` | 1536 | Maximum grid columns (7-col KPI) |

---

## Do / Don't

| Do | Don't |
|---|---|
| Use `rounded-full` for buttons and badges | Use `rounded-lg` for buttons |
| Use water-glow on ALL interactive elements | Skip hover effects on clickable items |
| Use Verma gradient for primary CTAs | Use flat orange (`bg-[#4F46E5]`) without gradient |
| Use `glass` class for card surfaces | Use plain `bg-white` without blur |
| Follow `text-slate-700` / `text-slate-400` hierarchy | Use `text-black` or `text-gray-500` |
| Import icons from `lucide-react` | Add icon libraries |
