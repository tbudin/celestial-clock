import { describe, expect, it } from 'vitest'
import { boxesOverlap, boxHitsDisc, boxHitsSeg, layoutLabels, radialCandidate, type LabelRequest } from './labelLayout'

const bounds = { x0: 0, y0: 0, x1: 400, y1: 400 }

describe('label layout', () => {
  it('never lets two visible labels overlap', () => {
    // 60 labels fighting for the same small area
    const reqs: LabelRequest[] = Array.from({ length: 60 }, (_, i) => ({
      id: `l${i}`,
      w: 30,
      h: 12,
      priority: i % 3,
      candidates: [
        { x: 200 + (i % 7) * 4, y: 200 + (i % 5) * 3 },
        { x: 200 - (i % 7) * 9, y: 180 + (i % 4) * 10 },
        { x: 100 + i * 4, y: 100 },
      ],
    }))
    const res = layoutLabels(reqs, { discs: [], segs: [] }, bounds)
    const vis = res.filter((r) => r.visible)
    expect(vis.length).toBeGreaterThan(5)
    for (let a = 0; a < vis.length; a++)
      for (let b = a + 1; b < vis.length; b++) expect(boxesOverlap(vis[a], vis[b])).toBe(false)
  })

  it('keeps labels off discs and lines, and inside bounds', () => {
    const reqs: LabelRequest[] = [
      { id: 'onDisc', w: 30, h: 12, priority: 1, candidates: [{ x: 100, y: 100 }, { x: 160, y: 100 }] },
      { id: 'onLine', w: 30, h: 12, priority: 1, candidates: [{ x: 300, y: 300 }] },
      { id: 'outside', w: 30, h: 12, priority: 1, candidates: [{ x: 398, y: 10 }] },
    ]
    const res = layoutLabels(reqs, { discs: [{ x: 100, y: 100, r: 20 }], segs: [{ x0: 250, y0: 250, x1: 350, y1: 350, half: 2 }] }, bounds)
    expect(res[0]).toMatchObject({ visible: true, candidate: 1 })
    expect(res[1].visible).toBe(false)
    expect(res[2].visible).toBe(false)
  })

  it('always shows pinned labels, and higher priority wins', () => {
    const reqs: LabelRequest[] = [
      { id: 'scale', w: 40, h: 14, priority: 2, candidates: [{ x: 395, y: 200 }] },
      { id: 'pill', w: 50, h: 18, priority: 0, pinned: true, candidates: [{ x: 395, y: 200 }] },
    ]
    const res = layoutLabels(reqs, { discs: [{ x: 380, y: 200, r: 30 }], segs: [] }, bounds)
    expect(res[1].visible).toBe(true)
    expect(res[1].cx + res[1].w / 2).toBeLessThanOrEqual(400)
    expect(res[0].visible).toBe(false)
  })

  it('prefers the previous candidate to avoid flicker', () => {
    const reqs: LabelRequest[] = [{ id: 'a', w: 20, h: 10, priority: 0, candidates: [{ x: 50, y: 50 }, { x: 150, y: 50 }] }]
    const res = layoutLabels(reqs, { discs: [], segs: [] }, bounds, new Map([['a', 1]]))
    expect(res[0].candidate).toBe(1)
  })

  it('geometry helpers', () => {
    expect(boxHitsDisc({ cx: 0, cy: 0, w: 10, h: 10 }, { x: 8, y: 0, r: 3.5 })).toBe(true)
    expect(boxHitsDisc({ cx: 0, cy: 0, w: 10, h: 10 }, { x: 8, y: 8, r: 4 })).toBe(false)
    expect(boxHitsSeg({ cx: 0, cy: 0, w: 10, h: 10 }, { x0: -20, y0: 6, x1: 20, y1: 6, half: 1.5 })).toBe(true)
    expect(boxHitsSeg({ cx: 0, cy: 0, w: 10, h: 10 }, { x0: -20, y0: 7, x1: 20, y1: 7, half: 1.5 })).toBe(false)
    const c = radialCandidate({ x: 0, y: 0 }, { x: 1, y: 0 }, 4, 30, 10)
    expect(c).toEqual({ x: 19, y: 0 })
  })
})
