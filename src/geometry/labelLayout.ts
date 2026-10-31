/**
 * Screen-space label layout. Pure functions, no DOM.
 *
 * Each label offers candidate positions in order of preference. Labels are
 * placed by priority; a candidate is accepted only if its box stays inside the
 * bounds and clears every placed label, every disc (planets, Sun) and every
 * line (clock hands). A label with no valid candidate is hidden, unless it is
 * pinned (the hand-tip readings), in which case it is clamped into bounds.
 * So two visible labels can never overlap.
 */

export interface Pt {
  x: number
  y: number
}

export interface Box {
  cx: number
  cy: number
  w: number
  h: number
}

export interface Disc {
  x: number
  y: number
  r: number
}

export interface Seg {
  x0: number
  y0: number
  x1: number
  y1: number
  /** Half the clearance band around the line, px */
  half: number
}

export interface LabelRequest {
  id: string
  w: number
  h: number
  /** Candidate centres, most preferred first */
  candidates: Pt[]
  /** Lower is placed first */
  priority: number
  /** Always shown: if nothing fits, clamp the first candidate into bounds */
  pinned?: boolean
}

export interface Obstacles {
  discs: Disc[]
  segs: Seg[]
}

export interface Bounds {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface Placement {
  id: string
  cx: number
  cy: number
  w: number
  h: number
  visible: boolean
  candidate: number
}

/** Gap kept between two labels, px */
export const LABEL_GAP = 3

export function boxesOverlap(a: Box, b: Box, gap = 0): boolean {
  return Math.abs(a.cx - b.cx) * 2 < a.w + b.w + 2 * gap && Math.abs(a.cy - b.cy) * 2 < a.h + b.h + 2 * gap
}

export function boxHitsDisc(b: Box, d: Disc): boolean {
  const nx = Math.max(b.cx - b.w / 2, Math.min(d.x, b.cx + b.w / 2))
  const ny = Math.max(b.cy - b.h / 2, Math.min(d.y, b.cy + b.h / 2))
  return (nx - d.x) ** 2 + (ny - d.y) ** 2 < d.r * d.r
}

/** Segment against the box grown by the segment's half-width (Liang-Barsky clip). */
export function boxHitsSeg(b: Box, s: Seg): boolean {
  const x0 = b.cx - b.w / 2 - s.half
  const x1 = b.cx + b.w / 2 + s.half
  const y0 = b.cy - b.h / 2 - s.half
  const y1 = b.cy + b.h / 2 + s.half
  const dx = s.x1 - s.x0
  const dy = s.y1 - s.y0
  let t0 = 0
  let t1 = 1
  const p = [-dx, dx, -dy, dy]
  const q = [s.x0 - x0, x1 - s.x0, s.y0 - y0, y1 - s.y0]
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false
    } else {
      const r = q[i] / p[i]
      if (p[i] < 0) t0 = Math.max(t0, r)
      else t1 = Math.min(t1, r)
      if (t0 > t1) return false
    }
  }
  return true
}

function inside(b: Box, bounds: Bounds) {
  return b.cx - b.w / 2 >= bounds.x0 && b.cx + b.w / 2 <= bounds.x1 && b.cy - b.h / 2 >= bounds.y0 && b.cy + b.h / 2 <= bounds.y1
}

function clamp(b: Box, bounds: Bounds): Box {
  return {
    ...b,
    cx: Math.min(bounds.x1 - b.w / 2, Math.max(bounds.x0 + b.w / 2, b.cx)),
    cy: Math.min(bounds.y1 - b.h / 2, Math.max(bounds.y0 + b.h / 2, b.cy)),
  }
}

/**
 * Lay out labels. `previous` maps label id to the candidate it used last
 * time; that candidate is tried first, so labels do not flicker between
 * positions as planets move.
 */
export function layoutLabels(
  requests: LabelRequest[],
  obstacles: Obstacles,
  bounds: Bounds,
  previous?: Map<string, number>,
): Placement[] {
  const order = requests.map((r, i) => ({ r, i })).sort((a, b) => a.r.priority - b.r.priority || a.i - b.i)
  const placed: Box[] = []
  const out: Placement[] = new Array(requests.length)

  const free = (b: Box) =>
    inside(b, bounds) &&
    !placed.some((p) => boxesOverlap(p, b, LABEL_GAP)) &&
    !obstacles.discs.some((d) => boxHitsDisc(b, d)) &&
    !obstacles.segs.some((s) => boxHitsSeg(b, s))

  for (const { r, i } of order) {
    const prev = previous?.get(r.id)
    const idx = r.candidates.map((_, k) => k)
    if (prev !== undefined && prev < idx.length) idx.sort((a, b) => (a === prev ? -1 : b === prev ? 1 : a - b))
    let chosen: Placement | null = null
    for (const k of idx) {
      const c = r.candidates[k]
      const b = { cx: c.x, cy: c.y, w: r.w, h: r.h }
      if (free(b)) {
        chosen = { id: r.id, ...b, visible: true, candidate: k }
        break
      }
    }
    if (!chosen && r.pinned && r.candidates.length > 0) {
      // Pinned: try each candidate clamped into bounds against labels only, then force the first
      for (const k of idx) {
        const b = clamp({ cx: r.candidates[k].x, cy: r.candidates[k].y, w: r.w, h: r.h }, bounds)
        if (!placed.some((p) => boxesOverlap(p, b, LABEL_GAP))) {
          chosen = { id: r.id, ...b, visible: true, candidate: k }
          break
        }
      }
      if (!chosen) {
        const b = clamp({ cx: r.candidates[0].x, cy: r.candidates[0].y, w: r.w, h: r.h }, bounds)
        chosen = { id: r.id, ...b, visible: true, candidate: 0 }
      }
    }
    if (chosen) placed.push(chosen)
    out[i] = chosen ?? { id: r.id, cx: 0, cy: 0, w: r.w, h: r.h, visible: false, candidate: -1 }
  }
  return out
}

/**
 * Centre of a w x h box that sits just beyond `anchor` along unit direction
 * `u`, with `gap` px of clearance between the anchor and the box edge.
 */
export function radialCandidate(anchor: Pt, u: Pt, gap: number, w: number, h: number): Pt {
  const reach = gap + Math.abs(u.x) * (w / 2) + Math.abs(u.y) * (h / 2)
  return { x: anchor.x + u.x * reach, y: anchor.y + u.y * reach }
}

/** Candidates along a radial direction plus small tangential slides either side. */
export function radialCandidates(anchor: Pt, u: Pt, gaps: number[], w: number, h: number, slides: number[] = [0]): Pt[] {
  const t = { x: -u.y, y: u.x }
  const out: Pt[] = []
  for (const g of gaps) {
    const c = radialCandidate(anchor, u, g, w, h)
    for (const s of slides) out.push({ x: c.x + t.x * s, y: c.y + t.y * s })
  }
  return out
}
