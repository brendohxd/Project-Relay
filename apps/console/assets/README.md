# Project Relay — Visual Assets Pack (v2)

Complete icon, badge, and logo set matching the live design system.

**Location:** this folder is the single design pack under `Assets/project-relay-assets/`.  
The multipage site loads the same files from `apps/console/assets/` (synced here, published to `docs/assets/` via `npm run pages:build`). See `Assets/README.md` for sync rules. Do not nest another `project-relay-assets` directory inside this pack.

**Design tokens**
- Background: `#0b0d0e`
- Text: `#f3f1eb` / muted `#a7a49a`
- Accents: orange `#ff6b35` · lime `#b9f77c` · blue `#79a8ff`

**Brand mark**: three vertical bars skewed −14° (orange → lime → blue)

---

## Inventory

### Brand / Chrome
| Path | Purpose |
|------|---------|
| `logo/logo-icon.svg` | App / favicon style |
| `logo/logo-full.svg` | Wordmark + mark |
| `logo/logo-horizontal.svg` | Compact header |
| `logo/logo-icon-mono.svg` | Single-color (`currentColor`) |
| `favicons/` | 16 / 32 / 64 / 192 / 512 + `favicon.svg` |
| `social/og-image.svg` | 1200×630 Open Graph card |

### Status Badges (Roadmap + Status)
| Badge | Meaning |
|-------|---------|
| `badges/badge-completed` | Shipped / verified (solid lime + full bars + check) |
| `badges/badge-in-progress` | Active gate (solid orange + progressive bars) |
| `badges/badge-planned` | Roadmapped (blue outline) |
| `badges/badge-deferred` | Explicitly postponed (muted dashed) |
| `badges/status-icons.svg` | Compact circular set of the four states |

### Feature Icons (Home “What works today”)
`icons/feature-*.svg` — accountable-record, evidence, disagreement, human-authority, console, tools

---

### High-value additions (this pack)

#### Record Types (How it works)
| Icon | Meaning |
|------|---------|
| `icons/records/record-task` | Bounded question / ticket |
| `icons/records/record-event` | Chain + sequence + hash |
| `icons/records/record-evidence` | Evidence bundle + hash seal |
| `icons/records/record-review` | Independent eye + checklist |
| `icons/records/record-decision` | Human gate / stamp |

#### Flow Steps (Q → E → R → D)
| Icon | Step |
|------|------|
| `icons/flow/flow-question` | Bounded question |
| `icons/flow/flow-evidence` | Submit / hash |
| `icons/flow/flow-review` | Independent review |
| `icons/flow/flow-decision` | Human decision gate |

Letter forms inside coloured rings — ideal for the hero orbit map and scenario steps.

#### Control Rooms
| Icon | Room |
|------|------|
| `icons/rooms/room-local` | CLI / offline |
| `icons/rooms/room-notion` | Page / database projection (abstract) |
| `icons/rooms/room-slack` | Thread / chat (abstract) |
| `icons/rooms/room-github` | Branch / PR / commit |
| `icons/rooms/room-projection` | Rebuildable view, not authority |

#### Explore / Nav Cards (Home)
| Icon | Destination |
|------|-------------|
| `icons/nav/nav-status` | Live status / pulse |
| `icons/nav/nav-protocol` | How it works / gate |
| `icons/nav/nav-control-rooms` | Multiple surfaces |
| `icons/nav/nav-roadmap` | Path / stages |
| `icons/nav/nav-start` | Run locally |

#### Trust & Boundary
| Icon | Meaning |
|------|---------|
| `icons/trust/trust-can` | Structure + hash + process (lime check) |
| `icons/trust/trust-cannot` | Not scientific truth / consensus (orange ×) |
| `icons/trust/boundary-public` | Safe to publish |
| `icons/trust/boundary-private` | Secrets / ITSM boundary |
| `icons/trust/trust-r01` | R/01 evidence-gate mark |

---

### Overseer / ADR-003 (Roadmap + future R4)
These are deliberately **visually distinct** from the main status badges so “auto-pass” never reads as “done truth”.

| Badge | Meaning | Visual |
|-------|---------|--------|
| `badges/overseer/badge-auto-pass` | Standing policy pass | Blue outline + bolt |
| `badges/overseer/badge-questionable` | Grey zone / needs human | Muted + “?” |
| `badges/overseer/badge-escalated` | Hard escalate | Solid orange + up arrow |
| `badges/overseer/badge-human-queue` | Waiting on named human | Outline + person |

Supporting icons:
- `icons/overseer/icon-overseer` — multi-intake comparison
- `icons/overseer/icon-policy` — standing policy document
- `icons/overseer/icon-packet` — decision / comparison packet
- `icons/overseer/icon-notify` — notification / inbox

---

## Usage notes

- All icons ship as **SVG (source of truth)** + **96×96 PNG**.
- Badges ship as SVG + ~2× retina PNG.
- Prefer the SVG in the site; use PNG only where required (README, some social surfaces).
- The three-bar motif is reserved for the main status badges and logo so the Overseer set stays distinct.

---

## Suggested next (still open)

- Start-page step icons (clone / install / check / mcp)
- Profile icons for the six How-it-works profiles (research, ITSM, education…)
- Extra OG variants (status, roadmap, start) and a wider README banner
- Light-mode inversions (only if needed)

Generated 2026-08-07 · Project Relay visual system
