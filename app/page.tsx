"use client"

import * as React from "react"
import { RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"

type Orientation = "vertical" | "horizontal" | "diagonal"
type CurveType = "sine" | "cosine" | "linear" | "vShape" | "custom"
type Stop = { offset: number; color: string; fallback: string }
type BarGradientKind = "linear" | "radial"

// Inverted stop order (as requested): stop4 -> stop1
const DEFAULT_GRADIENT_COLORS = ["#C7DFFF", "#3B6DF7", "#020052", "#0731AB"] as const
const DEFAULT_BORDER_COLORS = ["#0731AB", "#020052", "#3B6DF7", "#C7DFFF"] as const
// Long Stop3->Stop4 fade requires a *smaller* Stop 3 offset (fade length = 1 - offset3).
const DEFAULT_STOP_OFFSETS = [0, 0.18, 0.7, 1] as const

/** Main gradient “stop spacing” slider and all bar/diamond spacing math use this range. */
const STOP_SPACING_MIN = 0.7
const STOP_SPACING_MAX = 1.4

function clampStopSpacing(s: number) {
  return Math.max(STOP_SPACING_MIN, Math.min(STOP_SPACING_MAX, s))
}

const PRESET_1_ANIMATION_DEFAULTS: Readonly<{
  enabled: boolean
  loopDurationSec: number
  staggerSec: number
}> = {
  enabled: true,
  loopDurationSec: 1.5,
  staggerSec: 0.35,
}

/** Bar presets 3 / 4 unchanged; New design (Preset 1 reference) uses these when that preset is applied. */
const PRESET_1_NEW_DESIGN_ANIMATION_TIMING = {
  loopDurationSec: 1.0,
  staggerSec: 0.16,
} as const

/** Factory defaults for Preset 1 “reference” / diamond (Gradient Parameters panel). */
const PRESET_1_REFERENCE_GRADIENT_DEFAULTS = {
  stopSpacing: 0.9,
  numBars: 10,
  diamondCornerRadius: 0.65,
  diamondStagger: 10,
  diamondSpacing: 1.5,
  diamondGradientScale: 2.0,
  invertStopColors: true,
} as const

/** Factory defaults for Preset 2 diamond (Gradient Parameters when toolbar “2” is applied). */
const PRESET_2_REFERENCE_GRADIENT_DEFAULTS = {
  stopSpacing: 0.9,
  numBars: 15,
  diamondCornerRadius: 0.65,
  diamondStagger: 21,
  diamondSpacing: 1.5,
  diamondGradientScale: 2.0,
  invertStopColors: true,
} as const

/**
 * Preset 2 matches `assets/Preset 2.svg`: chevrons rotated 150° on fills, stack stepped up-left
 * (gradient centers move ~(-124, -215) per row in the 1138×1487 reference art).
 */
const PRESET_2_SHAPE_ROTATION_DEG = 150
/** Unit vector along the reference stack step (up-left in screen space). */
const PRESET_2_LR_UNIT = (() => {
  const dx = -124
  const dy = -215
  const len = Math.hypot(dx, dy) || 1
  return { lx: dx / len, ly: dy / len }
})()

/**
 * Preset 2 parade: inner translate `v` so `rotate(deg, cx, cy) ∘ translate(v)` equals `rotate(deg, dupCx, dupCy)`
 * on all points (same θ, pivots c and d). With M the CCW rotation matrix matching SVG `rotate(deg)`:
 * `v = (M^T − I)(d − c)` where `c = (cx,cy)`, `d = (dupCx,dupCy)`.
 */
function preset2ParadeDupInnerTranslateExact(
  cx: number,
  cy: number,
  dupCx: number,
  dupCy: number,
  deg: number
): { tx: number; ty: number } {
  const rad = (deg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const dx = dupCx - cx
  const dy = dupCy - cy
  const tx = (cos - 1) * dx + sin * dy
  const ty = -sin * dx + (cos - 1) * dy
  return { tx, ty }
}

// Matches the left-to-right bar stop offsets in `assets/01.svg` (using stopSpacing=1.0)
// offset0 sequence: 0.221154, 0.139423, 0.0961538, 0.0961538, 0, 0.0961538, 0.0961538, 0.139423, 0.221154
const DEFAULT_CUSTOM_POSITIONS_01SVG = [-22.1154, -13.9423, -9.6154, -9.6154, 0, -9.6154, -9.6154, -13.9423, -22.1154] as const

// Exact per-bar stop offsets from `assets/01.svg` (paint0..paint8).
// These are already "shifted" per bar, so they should NOT be further remapped by stopSpacing/position.
const DEFAULT_PER_BAR_STOP_OFFSETS_01SVG: ReadonlyArray<ReadonlyArray<number>> = [
  [0, 0.298077, 0.817308, 1],
  [0.0961538, 0.389423, 0.85, 1],
  [0.0961538, 0.475962, 0.88, 1],
  [0.139423, 0.548077, 0.89, 1],
  [0.221154, 0.644231, 0.91, 1],
  [0.0961538, 0.389423, 0.85, 1],
  [0.0961538, 0.475962, 0.88, 1],
  [0.139423, 0.548077, 0.89, 1],
  [0.221154, 0.644231, 0.91, 1],
]

// Exact per-bar stop offsets from `assets/02.svg` (paint0..paint8).
const DEFAULT_PER_BAR_STOP_OFFSETS_02SVG: ReadonlyArray<ReadonlyArray<number>> = [
  [0, 0.298077, 0.725962, 1],
  [0.0961538, 0.389423, 0.745192, 1],
  [0.0961538, 0.475962, 0.774038, 1],
  [0.139423, 0.548077, 0.826923, 1],
  [0.221154, 0.644231, 0.870192, 1],
  [0.0961538, 0.389423, 0.745192, 1],
  [0.0961538, 0.475962, 0.774038, 1],
  [0.139423, 0.548077, 0.826923, 1],
  [0.221154, 0.644231, 0.870192, 1],
]

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x))
}

/** Shared tail after the last bar returns; eases read as a soft breath before the next wave. */
function linearFlowTailPadSec(loopSec: number): number {
  const T = Math.max(0.01, loopSec)
  return Math.max(0.45, T * 0.32)
}

/**
 * One global cycle: same dur R and begin 0s for every bar (SMIL stays in sync).
 * Bar i holds Preset 1 (translate 0) until i*stagger, sweeps over loopSec, returns to 0 for the shared tail.
 * Every bar uses the same 4-point keyTimes shape so engines don’t treat bar 0 differently.
 */
function buildLinearFlowSyncAnimation(
  barIndex: number,
  numBars: number,
  loopSec: number,
  staggerSec: number,
  vx: number,
  vy: number
): { dur: string; keyTimes: string; values: string; keySplines?: string } {
  const n = Math.max(1, numBars)
  const T = Math.max(0.01, loopSec)
  const d = Math.max(0, staggerSec)
  const tailPad = linearFlowTailPadSec(T)
  const R = (n - 1) * d + T + tailPad

  const si = barIndex * d
  const aRaw = si / R
  const b = (si + T) / R
  // Tiny positive start fraction so bar 0 matches the 4-keyframe path (hold → sweep → return).
  const aHoldEnd = Math.max(1e-5, aRaw)

  const kt = (t: number) => clamp01(t).toFixed(5)

  if (b >= aHoldEnd + 1e-5 && b < 1 - 1e-5) {
    // Hold: linear (flat). Sweep: mild ease-in (avoids lingering near rest so colors don’t read “compressed”).
    // Return: stronger ease-out so velocity → 0 softly at loop boundary (sweep eased in/out as well).
    return {
      dur: `${R}s`,
      keyTimes: `0;${kt(aHoldEnd)};${kt(b)};1`,
      values: `0 0;0 0;${vx} ${vy};0 0`,
      keySplines: "0 0 1 1; 0.4 0 0.65 1; 0.2 0 0.4 1",
    }
  }
  return { dur: `${R}s`, keyTimes: `0;1`, values: `0 0;0 0` }
}

type DiamondReferenceLayout = "preset1" | "preset2"

/** Collect reference shape center Y values (same layout as `getPreset1DiamondGeometry`). */
function preset1ReferenceCyList(args: {
  numBars: number
  svgWidth: number
  svgHeight: number
  diamondStagger: number
  diamondSpacing: number
  positions: number[]
  diamondCornerRadius: number
  diamondLayout: DiamondReferenceLayout
}): number[] {
  const cys: number[] = []
  for (let i = 0; i < args.numBars; i++) {
    cys.push(getPreset1DiamondGeometry(i, args).cy)
  }
  return cys
}

/** Vertical tile pitch for Preset 1 ripple conveyor: tight vs stack spacing so one copy replaces another quickly. */
function computeDiamondRipplePitch(args: {
  numBars: number
  svgWidth: number
  svgHeight: number
  diamondStagger: number
  diamondSpacing: number
  positions: number[]
  diamondLayout: DiamondReferenceLayout
}): number {
  const { numBars, svgWidth, svgHeight, diamondStagger, diamondSpacing, positions } = args
  const half = (494 / 343) * svgWidth * 0.5
  const halfDiag = half * Math.sqrt(2)
  const cys: number[] = []
  for (let i = 0; i < numBars; i++) {
    const t = numBars > 1 ? i / (numBars - 1) : 0
    const staggerExp = 1 + (diamondStagger / 5) * (6 / Math.max(1, numBars - 1))
    const eased = 1 - Math.pow(1 - t, staggerExp)
    const yShift = args.diamondLayout === "preset2" ? -svgHeight * 0.72 : 0
    const baseCy = halfDiag - 240 + eased * svgHeight * diamondSpacing + yShift
    cys.push(baseCy + (positions[i] ?? 0))
  }
  if (cys.length < 2) {
    return Math.max(56, Math.min(svgHeight * 0.5, svgHeight / Math.max(1, numBars)))
  }
  let sum = 0
  for (let i = 1; i < cys.length; i++) sum += Math.abs(cys[i]! - cys[i - 1]!)
  const avgGap = sum / (cys.length - 1)
  return Math.max(52, Math.min(svgHeight * 0.5, avgGap * 0.62))
}

/** Parade-only: Y centers from the static stack (stagger + spacing). Conveyor step/duplicate Y are derived per row. */
function computePreset1ParadeEqualStack(args: {
  numBars: number
  svgWidth: number
  svgHeight: number
  diamondStagger: number
  diamondSpacing: number
  positions: number[]
  diamondCornerRadius: number
  diamondLayout: DiamondReferenceLayout
}): { paradeCys: number[] } {
  const staticCys = preset1ReferenceCyList(args)
  const n = staticCys.length
  if (n < 2) {
    const solo = staticCys[0] ?? args.svgHeight * 0.45
    return { paradeCys: [solo] }
  }
  return { paradeCys: staticCys.slice() }
}

function getPreset1DiamondGeometry(
  i: number,
  args: {
    numBars: number
    svgWidth: number
    svgHeight: number
    diamondStagger: number
    diamondSpacing: number
    positions: number[]
    diamondCornerRadius: number
    diamondLayout?: DiamondReferenceLayout
  }
) {
  const layout = args.diamondLayout ?? "preset1"
  const half = (494 / 343) * args.svgWidth * 0.5
  const halfDiag = half * Math.sqrt(2)
  const t = args.numBars > 1 ? i / (args.numBars - 1) : 0
  const staggerExp = 1 + (args.diamondStagger / 5) * (6 / Math.max(1, args.numBars - 1))
  const eased = 1 - Math.pow(1 - t, staggerExp)
  const yShift = layout === "preset2" ? -args.svgHeight * 0.72 : 0
  const baseCy = halfDiag - 240 + eased * args.svgHeight * args.diamondSpacing + yShift
  const cy = baseCy + (args.positions[i] ?? 0)
  /** Preset 2: diagonal stack; preset 1 stays centered. */
  const cx = layout === "preset2" ? args.svgWidth * (0.28 + 0.27 * eased) : args.svgWidth / 2
  const rLinear = half * args.diamondCornerRadius * (1 - t * 0.85)
  const r =
    layout === "preset2"
      ? Math.min(half * 0.52, rLinear * 1.22 + half * (0.06 + (1 - t) * 0.04))
      : rLinear
  const size = half * 2
  return { half, halfDiag, cy, cx, r, size }
}

/**
 * Preset 2 parade: duplicate sits on the “next” stack position. Interior rows use real `i+1` geometry;
 * the last row extrapolates in **eased** space so the step matches the stagger curve (linear (cx,cy)
 * extrapolation does not, and reads as a small vertical hitch on loop).
 */
function getPreset2ParadeDuplicateCenter(
  rowIndex: number,
  args: {
    numBars: number
    svgWidth: number
    svgHeight: number
    diamondStagger: number
    diamondSpacing: number
    positions: number[]
    diamondCornerRadius: number
    diamondLayout: DiamondReferenceLayout
  }
): { cx: number; cy: number } {
  const n = args.numBars
  if (rowIndex + 1 < n) {
    const g = getPreset1DiamondGeometry(rowIndex + 1, args)
    return { cx: g.cx, cy: g.cy }
  }
  if (n === 2) {
    const g0 = getPreset1DiamondGeometry(0, args)
    const g1 = getPreset1DiamondGeometry(1, args)
    return { cx: 2 * g1.cx - g0.cx, cy: 2 * g1.cy - g0.cy }
  }
  const staggerExp = 1 + (args.diamondStagger / 5) * (6 / Math.max(1, n - 1))
  const tPrev = (n - 2) / (n - 1)
  const easedPrev = 1 - Math.pow(1 - tPrev, staggerExp)
  const easedSucc = 1 + (1 - easedPrev)
  const yShift = -args.svgHeight * 0.72
  const half = (494 / 343) * args.svgWidth * 0.5
  const halfDiag = half * Math.sqrt(2)
  const baseCySucc = halfDiag - 240 + easedSucc * args.svgHeight * args.diamondSpacing + yShift
  const i = rowIndex
  const posLast = args.positions[i] ?? 0
  const posPrev = args.positions[i - 1] ?? 0
  const posSucc = posLast + (posLast - posPrev)
  const cy = baseCySucc + posSucc
  const cx = args.svgWidth * (0.28 + 0.27 * easedSucc)
  return { cx, cy }
}

/**
 * Closed triangle only (apex / optional apex rounding unchanged); straight base L–R.
 */
function preset1TriangleUpperPathRoundedTop(cx: number, cy: number, halfDiag: number, apexRoundPx: number): string {
  const Tx = cx
  const Ty = cy - halfDiag
  const Rx = cx + halfDiag
  const Ry = cy
  const Lx = cx - halfDiag
  const Ly = cy

  const lenTL = Math.hypot(Lx - Tx, Ly - Ty)
  const lenTR = Math.hypot(Rx - Tx, Ry - Ty)
  const maxR = Math.min(lenTL, lenTR) * 0.48
  const r = Math.min(Math.max(0, apexRoundPx), maxR)

  const f = (n: number) => n.toFixed(6)

  if (r < 0.5) {
    return `M ${f(Lx)} ${f(Ly)} L ${f(Tx)} ${f(Ty)} L ${f(Rx)} ${f(Ry)} Z`
  }

  const uLx = (Lx - Tx) / lenTL
  const uLy = (Ly - Ty) / lenTL
  const uRx = (Rx - Tx) / lenTR
  const uRy = (Ry - Ty) / lenTR

  const Ltx = Tx + uLx * r
  const Lty = Ty + uLy * r
  const Rtx = Tx + uRx * r
  const Rty = Ty + uRy * r

  return `M ${f(Lx)} ${f(Ly)} L ${f(Ltx)} ${f(Lty)} Q ${f(Tx)} ${f(Ty)} ${f(Rtx)} ${f(Rty)} L ${f(Rx)} ${f(Ry)} Z`
}

/**
 * Single closed path: rounded triangle plus strip under L–R (vertical at x=Lx/Rx, bottom edge at y=cy+h).
 */
function preset1DiamondMergedPath(
  cx: number,
  cy: number,
  halfDiag: number,
  apexRoundPx: number,
  baseExtendDownPx: number
): string {
  const h = Math.max(0, baseExtendDownPx)
  const Rx = cx + halfDiag
  const Ry = cy
  const Lx = cx - halfDiag
  const Ly = cy

  const upper = preset1TriangleUpperPathRoundedTop(cx, cy, halfDiag, apexRoundPx)
  if (h <= 1e-6) return upper

  const f = (n: number) => n.toFixed(6)
  const open = upper.replace(/\sZ\s*$/i, "")
  return `${open} L ${f(Rx)} ${f(Ry + h)} L ${f(Lx)} ${f(Ly + h)} Z`
}

/**
 * Preset 2: same rounded apex as Preset 1, but the skirt uses a curved bottom edge so the silhouette
 * reads as soft arcs instead of sharp bottom corners (especially when the stack is rotated).
 */
function preset2DiamondMergedPath(
  cx: number,
  cy: number,
  halfDiag: number,
  apexRoundPx: number,
  baseExtendDownPx: number
): string {
  const h = Math.max(0, baseExtendDownPx)
  const upper = preset1TriangleUpperPathRoundedTop(cx, cy, halfDiag, apexRoundPx)
  if (h <= 1e-6) return upper

  const Rx = cx + halfDiag
  const Ry = cy
  const Lx = cx - halfDiag
  const Ly = cy
  const f = (n: number) => n.toFixed(6)
  const open = upper.replace(/\sZ\s*$/i, "").trim()
  const bottomBow = Math.min(h * 0.34, 56, halfDiag * 0.22)
  return `${open} L ${f(Rx)} ${f(Ry + h)} Q ${f(cx)} ${f(Ly + h + bottomBow)} ${f(Lx)} ${f(Ly + h)} Z`
}

function diamondMergedPathForLayout(
  cx: number,
  cy: number,
  halfDiag: number,
  apexRoundPx: number,
  baseExtendDownPx: number,
  layout: DiamondReferenceLayout
): string {
  return layout === "preset2"
    ? preset2DiamondMergedPath(cx, cy, halfDiag, apexRoundPx, baseExtendDownPx)
    : preset1DiamondMergedPath(cx, cy, halfDiag, apexRoundPx, baseExtendDownPx)
}

/**
 * Preset 1 parade conveyor: shared period `R = (n-1)*d + T` so every row ends at `translate(0,-stepU)` together
 * when the loop repeats. `stepU` is the per-row vertical pitch (duplicate sits one step below the primary).
 * Hold segments are linear; the move uses spline easing so starts/stops don’t snap.
 */
/** Vertical strip depth under base L–R; scales with `halfDiag`. */
const PRESET1_TRIANGLE_BASE_EXTEND_RATIO = 0.48
/** Normalize spacing stagger (slider 0–30) when scaling skirt depth. Keep aligned with Spacing stagger `max`. */
const PRESET1_DIAMOND_STAGGER_SLIDER_MAX = 30
/** Extra skirt depth at max stagger: multiplier is `1 + staggerNorm * this` (at 0 → 1×, at max → ~1.85×). */
const PRESET1_SKIRT_DEPTH_STAGGER_GAIN = 0.85

/** Ease-in-out between holds so velocity eases to ~0 at the start and end of each row’s move segment. */
const DIAMOND_CONVEYOR_MOVE_SPLINE = "0.65 0 0.35 1"

function buildDiamondConveyorRowMotion(
  rowIndex: number,
  numRows: number,
  loopSec: number,
  staggerSec: number,
  stepU: number
): {
  dur: string
  begin: string
  keyTimes: string
  values: string
  keySplines: string
} {
  const n = Math.max(1, numRows)
  const T = Math.max(0.1, loopSec)
  const d = Math.max(0, staggerSec)
  const u = Math.max(0.01, stepU)
  const ty = (-u).toFixed(6)
  const R = (n - 1) * d + T

  const si = rowIndex * d
  const aRaw = si / R
  const aHoldEnd = Math.max(1e-5, aRaw)
  const b = (si + T) / R
  const kt = (t: number) => clamp01(t).toFixed(5)

  if (b >= 1 - 1e-5) {
    return {
      dur: `${R}s`,
      begin: "0s",
      keyTimes: `0;${kt(aHoldEnd)};1`,
      values: `0 0;0 0;0 ${ty}`,
      keySplines: `0 0 1 1;${DIAMOND_CONVEYOR_MOVE_SPLINE}`,
    }
  }
  return {
    dur: `${R}s`,
    begin: "0s",
    keyTimes: `0;${kt(aHoldEnd)};${kt(b)};1`,
    values: `0 0;0 0;0 ${ty};0 ${ty}`,
    keySplines: `0 0 1 1;${DIAMOND_CONVEYOR_MOVE_SPLINE};0 0 1 1`,
  }
}

/** Same timing contract as `buildDiamondConveyorRowMotion`, but translate ends at `(tx, ty)` (screen axes). */
function buildDiamondConveyorRowMotionVector(
  rowIndex: number,
  numRows: number,
  loopSec: number,
  staggerSec: number,
  tx: number,
  ty: number,
  /** Preset 2: linear move segment so loop endpoints land exactly (spline easing can ease short of the final keyframe in some engines). */
  linearMove = false
): {
  dur: string
  begin: string
  keyTimes: string
  values: string
  keySplines: string
  calcMode: "linear" | "spline"
} {
  const n = Math.max(1, numRows)
  const T = Math.max(0.1, loopSec)
  const d = Math.max(0, staggerSec)
  const R = (n - 1) * d + T

  const si = rowIndex * d
  const aRaw = si / R
  const aHoldEnd = Math.max(1e-5, aRaw)
  const b = (si + T) / R
  const kt = (t: number) => clamp01(t).toFixed(8)
  const f = (n: number) => n.toFixed(14)
  const txf = f(tx)
  const tyf = f(ty)
  const moveSpline = linearMove ? "0 0 1 1" : DIAMOND_CONVEYOR_MOVE_SPLINE
  const calcMode = linearMove ? ("linear" as const) : ("spline" as const)

  if (b >= 1 - 1e-5) {
    return {
      dur: `${R}s`,
      begin: "0s",
      keyTimes: `0;${kt(aHoldEnd)};1`,
      values: `0 0;0 0;${txf} ${tyf}`,
      keySplines: `0 0 1 1;${moveSpline}`,
      calcMode,
    }
  }
  return {
    dur: `${R}s`,
    begin: "0s",
    keyTimes: `0;${kt(aHoldEnd)};${kt(b)};1`,
    values: `0 0;0 0;${txf} ${tyf};${txf} ${tyf}`,
    keySplines: `0 0 1 1;${moveSpline};0 0 1 1`,
    calcMode,
  }
}

type Preset1DiamondRowModel = {
  i: number
  /** Center Y (user space); used for paint-order sort and exit distance. */
  cy: number
  /** Center X (user space). */
  cx: number
  /** Per-row conveyor pitch: translate magnitude for one loop; duplicate is one step below the primary. */
  exitU: number
  /** Duplicate triangle center Y (conveyor radial gradient cy when parading). */
  dupCy: number
  /** Duplicate triangle center X (conveyor gradient cx when parading). */
  dupCx: number
  /** Triangle + base skirt as one `<path d>`. */
  trianglePath: string
  dupTrianglePath: string
  /** Preset 2 parade: translate inside shared `rotate(deg, cx, cy)` so dup matches the old dup-pivot pose. */
  preset2ParadeDupAlignTx?: number
  preset2ParadeDupAlignTy?: number
  conveyor: {
    dur: string
    begin: string
    keyTimes: string
    values: string
    keySplines: string
    /** Preset 2 diagonal vector conveyor: linear segment for exact endpoint. */
    calcMode?: "linear" | "spline"
    /** Primary i≥1: apex rounds up toward the predecessor’s `r` during the step, then holds there. */
    primaryPathMorphValues?: string
  } | null
}

function buildPreset1DiamondRowModel(
  i: number,
  args: {
    numBars: number
    svgWidth: number
    svgHeight: number
    diamondStagger: number
    diamondSpacing: number
    positions: number[]
    diamondCornerRadius: number
    diamondRipplePitch: number
    paradeEnabled: boolean
    diamondLayout: DiamondReferenceLayout
    /** Parade: full center-Y list (same length as `numBars`). */
    paradeCys?: number[]
    /** Parade: override center Y for this row index (must match `paradeCys[i]` when list is passed). */
    paradeCy?: number
    linearGradientFlowDurationSec: number
    linearGradientStaggerSec: number
  }
): Preset1DiamondRowModel {
  const geom = getPreset1DiamondGeometry(i, args)
  const cy = args.paradeEnabled && args.paradeCy !== undefined ? args.paradeCy : geom.cy
  const { halfDiag, cx, r: apexRoundPx } = geom
  const n = Math.max(1, args.numBars)
  const pc = args.paradeCys
  const conveyorIsLowerRight = args.diamondLayout === "preset2"

  let exitU = 0
  let cyDup = cy
  let cxDup = cx
  /** Preset 2 parade: one-loop translate must equal primary center minus duplicate center (cx differs per row). */
  let preset2MotionTx = 0
  let preset2MotionTy = 0
  let preset2ParadeDupAlignTx: number | undefined
  let preset2ParadeDupAlignTy: number | undefined

  if (args.paradeEnabled) {
    if (conveyorIsLowerRight && pc && pc.length === n && n >= 2) {
      const succ = getPreset2ParadeDuplicateCenter(i, args)
      cxDup = succ.cx
      cyDup = succ.cy
      preset2MotionTx = cx - cxDup
      preset2MotionTy = cy - cyDup
      exitU = Math.max(0.01, Math.hypot(preset2MotionTx, preset2MotionTy))
      const a = preset2ParadeDupInnerTranslateExact(cx, cy, cxDup, cyDup, PRESET_2_SHAPE_ROTATION_DEG)
      preset2ParadeDupAlignTx = a.tx
      preset2ParadeDupAlignTy = a.ty
    } else if (pc && pc.length === n && n >= 2) {
      // Preset 1: one loop = move up by gap to row above; duplicate one vertical step below primary.
      if (i === 0) {
        exitU = Math.max(0.01, pc[1]! - pc[0]!)
        cyDup = pc[0]! + exitU
      } else {
        exitU = Math.max(0.01, pc[i]! - pc[i - 1]!)
        cyDup = pc[i]! + exitU
      }
    } else {
      exitU = Math.max(0.01, args.diamondRipplePitch)
      if (conveyorIsLowerRight) {
        const u = Math.max(exitU, (args.svgWidth + args.svgHeight) * 0.044)
        cyDup = cy - PRESET_2_LR_UNIT.ly * u
        cxDup = cx - PRESET_2_LR_UNIT.lx * u
        preset2MotionTx = PRESET_2_LR_UNIT.lx * u
        preset2MotionTy = PRESET_2_LR_UNIT.ly * u
        exitU = Math.max(0.01, Math.hypot(preset2MotionTx, preset2MotionTy))
      } else {
        cyDup = cy + exitU
      }
    }
  } else {
    exitU = 0
    cyDup = cy
    cxDup = cx
  }

  const staggerNorm = Math.max(0, args.diamondStagger) / PRESET1_DIAMOND_STAGGER_SLIDER_MAX
  const skirtDepthMultiplier = 1 + staggerNorm * PRESET1_SKIRT_DEPTH_STAGGER_GAIN
  let baseExtendDownPx =
    Math.max(176, halfDiag * PRESET1_TRIANGLE_BASE_EXTEND_RATIO) * skirtDepthMultiplier
  if (args.diamondLayout === "preset2") {
    baseExtendDownPx *= 0.78
  }

  const trianglePath = diamondMergedPathForLayout(cx, cy, halfDiag, apexRoundPx, baseExtendDownPx, args.diamondLayout)
  const dupTrianglePath = diamondMergedPathForLayout(
    cxDup,
    cyDup,
    halfDiag,
    apexRoundPx,
    baseExtendDownPx,
    args.diamondLayout
  )

  const rPrev = i > 0 ? getPreset1DiamondGeometry(i - 1, args).r : apexRoundPx
  const primaryPathTo = diamondMergedPathForLayout(cx, cy, halfDiag, rPrev, baseExtendDownPx, args.diamondLayout)

  const motion = args.paradeEnabled
    ? conveyorIsLowerRight
      ? buildDiamondConveyorRowMotionVector(
          i,
          args.numBars,
          args.linearGradientFlowDurationSec,
          args.linearGradientStaggerSec,
          preset2MotionTx,
          preset2MotionTy,
          true
        )
      : buildDiamondConveyorRowMotion(
          i,
          args.numBars,
          args.linearGradientFlowDurationSec,
          args.linearGradientStaggerSec,
          exitU
        )
    : null

  let primaryPathMorphValues: string | undefined
  // Preset 2: skip apex morph — it shifts the path’s bounds between loop endpoints and reads as a ~y jump.
  if (
    args.paradeEnabled &&
    i > 0 &&
    motion &&
    Math.abs(apexRoundPx - rPrev) > 0.02 &&
    args.diamondLayout !== "preset2"
  ) {
    const nk = motion.keyTimes.split(";").length
    primaryPathMorphValues =
      nk >= 4
        ? `${trianglePath};${trianglePath};${primaryPathTo};${primaryPathTo}`
        : `${trianglePath};${trianglePath};${primaryPathTo}`
  }

  const conveyor = motion ? { ...motion, ...(primaryPathMorphValues ? { primaryPathMorphValues } : {}) } : null

  return {
    i,
    cy,
    cx,
    exitU,
    dupCy: cyDup,
    dupCx: cxDup,
    trianglePath,
    dupTrianglePath,
    ...(preset2ParadeDupAlignTx !== undefined && preset2ParadeDupAlignTy !== undefined
      ? { preset2ParadeDupAlignTx, preset2ParadeDupAlignTy }
      : {}),
    conveyor,
  }
}

/**
 * Like `buildLinearFlowSyncAnimation`, but ends the cycle at the translated position.
 * This is useful for "tiled" geometry motion (duplicate content and snap back on repeat).
 */
function buildTiledTranslateSyncAnimation(
  barIndex: number,
  numBars: number,
  loopSec: number,
  staggerSec: number,
  vx: number,
  vy: number
): { dur: string; keyTimes: string; values: string; keySplines?: string } {
  const n = Math.max(1, numBars)
  const T = Math.max(0.01, loopSec)
  const d = Math.max(0, staggerSec)
  // Continuous feel: no shared tail pause at the end.
  const R = (n - 1) * d + T

  const si = barIndex * d
  const aRaw = si / R
  const aHoldEnd = Math.max(1e-5, aRaw)

  const kt = (t: number) => clamp01(t).toFixed(5)
  // Staggered hold, then one smooth ease-in-out to the tiled endpoint so velocity eases to ~0 at the repeat
  // (matches zero velocity at the start of the next loop) without a separate “crawl to land” segment.
  if (aHoldEnd < 1 - 1e-5) {
    return {
      dur: `${R}s`,
      keyTimes: `0;${kt(aHoldEnd)};1`,
      values: `0 0;0 0;${vx.toFixed(5)} ${vy.toFixed(5)}`,
      keySplines: "0 0 1 1; 0.58 0 0.42 1",
    }
  }
  return { dur: `${R}s`, keyTimes: `0;1`, values: `0 0;0 0` }
}

function remapStopSpacing(offset: number, stopSpacing: number) {
  const spacing = clampStopSpacing(stopSpacing)
  return clamp01(0.5 + (offset - 0.5) * spacing)
}

/**
 * Browsers clamp `<stop offset>` to [0,1], which squashes logical positions outside that range.
 * Extend (x1,y1)→(x2,y2) along the same axis to cover [tLo,tHi] and reparameterize stops so colors
 * match an unclamped ramp; the bar still only “sees” the [0,1] bbox slice of the shape.
 */
function linearGradientBBoxWithExtendedStops(
  stops: Stop[],
  x1: number,
  y1: number,
  x2: number,
  y2: number
): { x1: number; y1: number; x2: number; y2: number; stops: Stop[]; span: number } {
  const logical = stops.map((s) => s.offset)
  const tLo = Math.min(0, ...logical)
  const tHi = Math.max(1, ...logical)
  const span = Math.max(tHi - tLo, 1e-9)
  const dx = x2 - x1
  const dy = y2 - y1
  return {
    x1: x1 + tLo * dx,
    y1: y1 + tLo * dy,
    x2: x1 + tHi * dx,
    y2: y1 + tHi * dy,
    stops: stops.map((s, i) => ({
      ...s,
      offset: (logical[i]! - tLo) / span,
    })),
    span,
  }
}

/** Odd count so the middle tile matches the idle gradient; extra tiles pad translation so pad/repeat never bites the visible slice. */
const LINEAR_FLOW_STRIP_TILES = 5

function tileGradientStopsAlongAxis(stops: Stop[], tiles: number): Stop[] {
  const k = Math.max(1, Math.floor(tiles))
  if (k <= 1) return stops
  const out: Stop[] = []
  for (let c = 0; c < k; c++) {
    for (const s of stops) {
      out.push({ ...s, offset: (c + s.offset) / k })
    }
  }
  return out
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.trim().replace(/^#/, "")
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null
  const n = Number.parseInt(full, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function toDisplayP3ColorString(hex: string) {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  return `color(display-p3 ${rgb.r / 255} ${rgb.g / 255} ${rgb.b / 255})`
}

function downloadText(filename: string, text: string, mime = "text/plain") {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

async function downloadSvgElement(svg: SVGSVGElement, filename: string) {
  const cloned = svg.cloneNode(true) as SVGSVGElement
  cloned.setAttribute("xmlns", "http://www.w3.org/2000/svg")
  const content = new XMLSerializer().serializeToString(cloned)
  downloadText(filename, content, "image/svg+xml")
}

async function downloadPngFromSvg(svg: SVGSVGElement, filename: string, scale = 4) {
  const content = new XMLSerializer().serializeToString(svg)
  const svgBlob = new Blob([content], { type: "image/svg+xml;charset=utf-8" })
  const url = URL.createObjectURL(svgBlob)

  const img = new Image()
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error("Failed to load SVG image"))
  })
  img.src = url
  await loaded

  const width = Number(svg.getAttribute("width")) || svg.viewBox.baseVal.width || 1200
  const height = Number(svg.getAttribute("height")) || svg.viewBox.baseVal.height || 800

  const canvas = document.createElement("canvas")
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  URL.revokeObjectURL(url)

  const pngUrl = canvas.toDataURL("image/png")
  const a = document.createElement("a")
  a.href = pngUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

function generateCurvePositions(args: {
  curveType: CurveType
  numBars: number
  amplitude: number
  phaseShift: number
  verticalOffset: number
  customPositions: number[]
}): number[] {
  const { curveType, numBars, amplitude, phaseShift, verticalOffset, customPositions } = args

  if (curveType === "custom") {
    const out = customPositions.slice(0, numBars)
    while (out.length < numBars) out.push(0)
    return out
  }

  if (numBars <= 1) return [verticalOffset]

  const positions: number[] = []
  for (let i = 0; i < numBars; i++) {
    const t = i / (numBars - 1) // 0..1 across bars
    let v = 0
    switch (curveType) {
      case "sine":
        v = Math.sin((t + phaseShift) * Math.PI * 2) * amplitude
        break
      case "cosine":
        v = Math.cos((t + phaseShift) * Math.PI * 2) * amplitude
        break
      case "linear":
        v = (t - 0.5) * 2 * amplitude
        break
      case "vShape":
        v = (Math.abs(t - 0.5) * 2 - 1) * amplitude
        break
      default:
        v = 0
    }
    positions.push(Math.max(-50, Math.min(50, v + verticalOffset)))
  }
  return positions
}

function buildStopsForBar(colors: string[], stopSpacing: number, position: number): Stop[] {
  const center = 0.5 - position / 100 // position is -50..50
  const spacing = clampStopSpacing(stopSpacing)

  // Offsets may be < 0 or > 1: gradient continues past the bar (objectBoundingBox); only the in-frame slice is visible.
  return colors.map((color, i) => {
    const base = DEFAULT_STOP_OFFSETS[i] ?? i / Math.max(1, colors.length - 1)
    const offset = center + (base - 0.5) * spacing
    return { offset, color: toDisplayP3ColorString(color), fallback: color }
  })
}

function buildStopsForBarWithOffsets(colors: string[], offsets: readonly number[], stopSpacing: number, position: number): Stop[] {
  const center = 0.5 - position / 100 // position is -50..50
  const spacing = clampStopSpacing(stopSpacing)

  return colors.map((color, i) => {
    const base = offsets[i] ?? i / Math.max(1, colors.length - 1)
    const offset = center + (base - 0.5) * spacing
    return { offset, color: toDisplayP3ColorString(color), fallback: color }
  })
}

function computeWeightedBreaks(total: number, weights: number[]) {
  const safe = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 1))
  const sum = safe.reduce((a, b) => a + b, 0) || 1
  const breaks: number[] = [0]
  let acc = 0
  for (const w of safe) {
    acc += (w / sum) * total
    breaks.push(acc)
  }
  breaks[breaks.length - 1] = total
  return breaks
}

export default function Page() {
  const svgRef = React.useRef<SVGSVGElement | null>(null)

  // Preview size (export uses these).
  const svgWidth = 343
  const svgHeight = 448

  const [barOrientation, setBarOrientation] = React.useState<Orientation>("vertical")
  const [numBars, setNumBars] = React.useState<number>(PRESET_1_REFERENCE_GRADIENT_DEFAULTS.numBars)
  const [barBandWeights, setBarBandWeights] = React.useState<number[] | null>(null)

  // Curve controls (these drive per-bar gradient position)
  const [curveType, setCurveType] = React.useState<CurveType>("vShape")
  const [amplitude, setAmplitude] = React.useState(30)
  const [phaseShift, setPhaseShift] = React.useState(0)
  const [verticalOffset, setVerticalOffset] = React.useState(30)
  const [customPositions, setCustomPositions] = React.useState<number[]>([...DEFAULT_CUSTOM_POSITIONS_01SVG])

  // Warp controls (these bend the bar shapes)
  const [warpAmount, setWarpAmount] = React.useState(0) // max 200
  const [warpFrequency, setWarpFrequency] = React.useState(0) // max 0.5
  const [warpPhase, setWarpPhase] = React.useState(0.0)

  // Gradient controls
  const [barGradientAngle, setBarGradientAngle] = React.useState(270)
  const [stopSpacing, setStopSpacing] = React.useState<number>(
    clampStopSpacing(PRESET_1_REFERENCE_GRADIENT_DEFAULTS.stopSpacing)
  )
  const [barThickness, setBarThickness] = React.useState(1.0) // relative to computed bar width/height
  const [barGradientKind, setBarGradientKind] = React.useState<BarGradientKind>("linear")
  const [invertStopColors, setInvertStopColors] = React.useState<boolean>(
    PRESET_1_REFERENCE_GRADIENT_DEFAULTS.invertStopColors
  )
  const [diamondCornerRadius, setDiamondCornerRadius] = React.useState<number>(
    PRESET_1_REFERENCE_GRADIENT_DEFAULTS.diamondCornerRadius
  )
  const [diamondStagger, setDiamondStagger] = React.useState<number>(PRESET_1_REFERENCE_GRADIENT_DEFAULTS.diamondStagger)
  React.useEffect(() => {
    setDiamondStagger((s) => {
      const c = Math.min(30, Math.max(0, Math.round(s)))
      return c === s ? s : c
    })
  }, [])
  const [diamondSpacing, setDiamondSpacing] = React.useState(1.5)
  const [diamondGradientScale, setDiamondGradientScale] = React.useState<number>(
    PRESET_1_REFERENCE_GRADIENT_DEFAULTS.diamondGradientScale
  )
  const [radialPerBarCenter, setRadialPerBarCenter] = React.useState(false)
  const [stopOffsetsOverride, setStopOffsetsOverride] = React.useState<ReadonlyArray<number> | null>(null)
  const [useRawStopOffsets, setUseRawStopOffsets] = React.useState(false)

  // Colors + borders
  const [gradientColors, setGradientColors] = React.useState<string[]>([...DEFAULT_GRADIENT_COLORS])
  const [rightBorderEnabled, setRightBorderEnabled] = React.useState(false)
  const [rightBorderWidth, setRightBorderWidth] = React.useState(0.5)
  const [rightBorderColors, setRightBorderColors] = React.useState<string[]>([...DEFAULT_BORDER_COLORS])
  const [borderStopSpacing, setBorderStopSpacing] = React.useState(1.0)
  const [shadowEnabled, setShadowEnabled] = React.useState(true)
  const [shadowBlur, setShadowBlur] = React.useState(29)
  const [shadowDx, setShadowDx] = React.useState(0)
  const [shadowDy, setShadowDy] = React.useState(2)
  const [shadowColor, setShadowColor] = React.useState("#253FC5")
  const [shadowOpacity, setShadowOpacity] = React.useState(1.0)

  const [perBarStopOffsetsOverride, setPerBarStopOffsetsOverride] = React.useState<
    ReadonlyArray<ReadonlyArray<number>> | null
  >(null)
  const [presetBarsTransform, setPresetBarsTransform] = React.useState<string>("")
  const [presetBackground, setPresetBackground] = React.useState<"none" | "preset1" | "preset2" | "preset3">("preset1")
  const [activePreset, setActivePreset] = React.useState<number | null>(1)

  // Global preference: only *applies* to Preset 1, but we keep the toggle state persistent.
  const [linearGradientStaggerFlow, setLinearGradientStaggerFlow] = React.useState(false)
  const [linearGradientFlowDurationSec, setLinearGradientFlowDurationSec] = React.useState<number>(
    PRESET_1_NEW_DESIGN_ANIMATION_TIMING.loopDurationSec
  )
  const [linearGradientStaggerSec, setLinearGradientStaggerSec] = React.useState<number>(
    PRESET_1_NEW_DESIGN_ANIMATION_TIMING.staggerSec
  )

  const presetHasEncodedAnimation = activePreset === 1 || activePreset === 2 || activePreset === 5
  const preset1DiamondRef = activePreset === 1 && presetBackground === "preset1"
  const preset2DiamondRef = activePreset === 2 && presetBackground === "preset2"
  const diamondReferenceMode = preset1DiamondRef || preset2DiamondRef
  const preset3Overscan = activePreset === 3 ? 1.45 : 1
  const preset3ShapeOverscanPx = activePreset === 3 ? 420 : 0
  const preset3IsReferenceMode = activePreset === 3 && presetBackground === "preset3"
  const preset3EditorLocked = preset3IsReferenceMode

  const numBarsAnimRef = React.useRef<{ from: number; to: number; startMs: number; durationMs: number } | null>(null)
  const [numBarsAnimT, setNumBarsAnimT] = React.useState(1)

  React.useEffect(() => {
    const prevTo = numBarsAnimRef.current?.to ?? numBars
    if (prevTo === numBars) return

    const startMs = performance.now()
    numBarsAnimRef.current = { from: prevTo, to: numBars, startMs, durationMs: 560 }
    setNumBarsAnimT(0)

    let raf = 0
    const tick = (now: number) => {
      const cur = numBarsAnimRef.current
      if (!cur) return
      const t = Math.max(0, Math.min(1, (now - cur.startMs) / cur.durationMs))
      setNumBarsAnimT(t)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [numBars])

  const easedNumBarsAnimT = React.useMemo(() => {
    const t = numBarsAnimT
    return 1 - Math.pow(1 - t, 3)
  }, [numBarsAnimT])

  React.useEffect(() => {
    setCustomPositions((prev) => {
      const next = prev.slice(0, numBars)
      while (next.length < numBars) next.push(0)
      return next
    })
  }, [numBars])

  const positions = React.useMemo(
    () =>
      generateCurvePositions({
        curveType,
        numBars,
        amplitude,
        phaseShift,
        verticalOffset,
        customPositions,
      }),
    [amplitude, curveType, customPositions, numBars, phaseShift, verticalOffset]
  )

  const switchToCurve = React.useCallback(
    (nextType: CurveType) => {
      if (nextType === "custom" && curveType !== "custom") {
        setCustomPositions(positions)
      }
      setCurveType(nextType)
    },
    [curveType, positions]
  )

  const updateCustomPosition = React.useCallback((index: number, value: number) => {
    setCustomPositions((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }, [])

  const resetAll = React.useCallback(() => {
    setActivePreset(null)
    setBarOrientation("vertical")
    setNumBars(12)
    setBarBandWeights(null)
    setCurveType("vShape")
    setAmplitude(30)
    setPhaseShift(0)
    setVerticalOffset(30)
    setCustomPositions([...DEFAULT_CUSTOM_POSITIONS_01SVG])
    setWarpAmount(0)
    setWarpFrequency(0)
    setWarpPhase(0.0)
    setBarGradientAngle(270)
    setStopSpacing(1.0)
    setBarThickness(1.0)
    setBarGradientKind("linear")
    setInvertStopColors(false)
    setDiamondCornerRadius(0.15)
    setDiamondStagger(5)
    setDiamondSpacing(1.5)
    setDiamondGradientScale(1.0)
    setRadialPerBarCenter(false)
    setStopOffsetsOverride(null)
    setUseRawStopOffsets(false)
    setGradientColors([...DEFAULT_GRADIENT_COLORS])
    setRightBorderEnabled(false)
    setRightBorderWidth(0.5)
    setRightBorderColors([...DEFAULT_BORDER_COLORS])
    setBorderStopSpacing(1.0)
    setShadowEnabled(true)
    setShadowBlur(29)
    setShadowDx(0)
    setShadowDy(2)
    setShadowColor("#253FC5")
    setShadowOpacity(1.0)
    setPerBarStopOffsetsOverride(null)
    setPresetBarsTransform("")
    setPresetBackground("none")
    // When switching/resetting, keep animation OFF by default.
    setLinearGradientStaggerFlow(false)
    setLinearGradientFlowDurationSec(PRESET_1_ANIMATION_DEFAULTS.loopDurationSec)
    setLinearGradientStaggerSec(PRESET_1_ANIMATION_DEFAULTS.staggerSec)
  }, [])

  /** Preset 1 “new design” / reference triangles. `enableStream` on from the “1” control; off after Reset so the static layout is visible. */
  const applyPreset1Reference = React.useCallback(
    (enableStream: boolean) => {
      resetAll()
      setActivePreset(1)
      setPresetBackground("preset1")
      const g = PRESET_1_REFERENCE_GRADIENT_DEFAULTS
      setStopSpacing(clampStopSpacing(g.stopSpacing))
      setNumBars(g.numBars)
      setDiamondCornerRadius(g.diamondCornerRadius)
      setDiamondStagger(g.diamondStagger)
      setDiamondSpacing(g.diamondSpacing)
      setDiamondGradientScale(g.diamondGradientScale)
      setInvertStopColors(g.invertStopColors)
      setLinearGradientFlowDurationSec(PRESET_1_NEW_DESIGN_ANIMATION_TIMING.loopDurationSec)
      setLinearGradientStaggerSec(PRESET_1_NEW_DESIGN_ANIMATION_TIMING.staggerSec)
      setLinearGradientStaggerFlow(enableStream)
    },
    [resetAll]
  )

  const applyNewDesign = React.useCallback(() => {
    applyPreset1Reference(true)
  }, [applyPreset1Reference])

  const applyPreset1 = React.useCallback(() => {
    resetAll()
    setActivePreset(1)
    setNumBars(11)
    setStopSpacing(clampStopSpacing(PRESET_1_REFERENCE_GRADIENT_DEFAULTS.stopSpacing))
    // Preset selection should not auto-enable animation.
    setLinearGradientStaggerFlow(false)
    setLinearGradientFlowDurationSec(PRESET_1_ANIMATION_DEFAULTS.loopDurationSec)
    setLinearGradientStaggerSec(PRESET_1_ANIMATION_DEFAULTS.staggerSec)
  }, [resetAll])

  /** Preset 2 (toolbar “2”): diamond reference variation — rotated stack, off-centre, conveyor toward lower-right. */
  const applyPreset2Diamond = React.useCallback(
    (enableStream: boolean) => {
      resetAll()
      setActivePreset(2)
      setPresetBackground("preset2")
      const g = PRESET_2_REFERENCE_GRADIENT_DEFAULTS
      setStopSpacing(clampStopSpacing(g.stopSpacing))
      setNumBars(g.numBars)
      setDiamondCornerRadius(g.diamondCornerRadius)
      setDiamondStagger(g.diamondStagger)
      setDiamondSpacing(g.diamondSpacing)
      setDiamondGradientScale(g.diamondGradientScale)
      setInvertStopColors(g.invertStopColors)
      setLinearGradientFlowDurationSec(PRESET_1_NEW_DESIGN_ANIMATION_TIMING.loopDurationSec)
      setLinearGradientStaggerSec(PRESET_1_NEW_DESIGN_ANIMATION_TIMING.staggerSec)
      setLinearGradientStaggerFlow(enableStream)
    },
    [resetAll]
  )

  /** Toolbar “4”: diagonal bar field (formerly `activePreset === 2`). */
  const applyPresetDiagonalBars = React.useCallback(() => {
    resetAll()
    setActivePreset(5)
    setNumBars(11)
    // Preset selection should not auto-enable animation.
    setLinearGradientStaggerFlow(false)
    setBarOrientation("diagonal")
    setStopSpacing(clampStopSpacing(0.73))
  }, [resetAll])

  const applyPreset4 = React.useCallback(() => {
    resetAll()
    setActivePreset(4)
    setNumBars(30)
    setCurveType("sine")
    setAmplitude(48)
    setPhaseShift(0)
    setVerticalOffset(0)
    setWarpAmount(80)
    setWarpFrequency(0.18)
    setWarpPhase(0.0)
    setBarGradientAngle(74)
    setStopSpacing(1.0)
    setBarThickness(1.0)
    setGradientColors(["#EEC7FF", "#000B8F", "#02005A", "#C8C7FF"])
    setRightBorderColors(["#C8C7FF", "#02005A", "#000B8F", "#EEC7FF"])
    setPerBarStopOffsetsOverride(null)
    setPresetBarsTransform("")
    setPresetBackground("none")
  }, [resetAll])

  const applyPreset3 = React.useCallback(() => {
    resetAll()
    setActivePreset(3)
    setBarOrientation("horizontal")
    // Match the non-uniform band heights seen in `assets/3.svg` (clip paths).
    setNumBars(4)
    setBarBandWeights([147, 146.577, 96.3281, 58.5171])
    setCurveType("linear")
    setAmplitude(0)
    setVerticalOffset(0)
    setWarpAmount(0)
    setWarpFrequency(0)
    setBarGradientAngle(270)
    setStopSpacing(clampStopSpacing(0.35))
    setBarThickness(1.0)
    setBarGradientKind("radial")
    setInvertStopColors(false)
    setRadialPerBarCenter(true)
    // Spread stop ranges so Stops 1–2 remain visible in the static preset.
    // Use raw offsets (no spacing remap) so changes are very visible.
    setUseRawStopOffsets(true)
    // Keep Stops 1–3 relatively tight, and give Stop 3 → Stop 4 a long run.
    // (A smaller Stop 3 offset means a longer 3→4 fade.)
    setStopOffsetsOverride([0, 0.18, 0.28, 1])
    setGradientColors(["#EEC7FF", "#648AFA", "#255AF6", "#000B8F"])
    setRightBorderColors(["#000B8F", "#255AF6", "#648AFA", "#EEC7FF"])
    setPerBarStopOffsetsOverride(null)
    setPresetBarsTransform("")
    setPresetBackground("preset3")
  }, [resetAll])

  /** Toolbar reset: restore the active preset’s factory defaults instead of clearing to generic 12 bars / no preset. */
  const resetToActivePresetDefaults = React.useCallback(() => {
    if (activePreset === 1 && presetBackground === "preset1") {
      applyPreset1Reference(false)
      return
    }
    if (activePreset === 2 && presetBackground === "preset2") {
      applyPreset2Diamond(false)
      return
    }
    if (activePreset === 1) {
      applyPreset1()
      return
    }
    if (activePreset === 5) {
      applyPresetDiagonalBars()
      return
    }
    if (activePreset === 3) {
      applyPreset3()
      return
    }
    if (activePreset === 4) {
      applyPreset4()
      return
    }
    resetAll()
  }, [
    activePreset,
    presetBackground,
    applyPreset1Reference,
    applyPreset1,
    applyPreset2Diamond,
    applyPresetDiagonalBars,
    applyPreset3,
    applyPreset4,
    resetAll,
  ])

  // Start in Preset 1 reference (static diamonds). Button “1” enables the upward stream animation.
  const didInitPresetRef = React.useRef(false)
  React.useEffect(() => {
    if (didInitPresetRef.current) return
    didInitPresetRef.current = true
    applyPreset1Reference(false)
  }, [applyPreset1Reference])

  const downloadSvg = React.useCallback(async () => {
    if (!svgRef.current) return
    await downloadSvgElement(svgRef.current, "gradient-bar-preview.svg")
  }, [])

  const downloadPng = React.useCallback(async () => {
    if (!svgRef.current) return
    await downloadPngFromSvg(svgRef.current, "gradient-bar-preview@4x.png", 4)
  }, [])

  const warpDeltaAtY = React.useCallback(
    (y01: number) => {
      const omega = 2 * Math.PI * warpFrequency
      return warpAmount * Math.sin(omega * y01 + 2 * Math.PI * warpPhase)
    },
    [warpAmount, warpFrequency, warpPhase]
  )

  const warpDeltaAtX = React.useCallback(
    (x01: number) => {
      const omega = 2 * Math.PI * warpFrequency
      return warpAmount * Math.sin(omega * x01 + 2 * Math.PI * warpPhase)
    },
    [warpAmount, warpFrequency, warpPhase]
  )

  const diagonalMetrics = React.useMemo(() => {
    if (barOrientation !== "diagonal") return null

    const theta = Math.PI / 4
    const c = Math.abs(Math.cos(theta))
    const s = Math.abs(Math.sin(theta))

    // Axis-aligned bounding box of a rotated rectangle.
    const rotatedBoundsWidth = svgWidth * c + svgHeight * s
    const rotatedBoundsHeight = svgWidth * s + svgHeight * c

    // Minimum scale so rotated content fully covers the clip-frame,
    // plus a small buffer to avoid any subpixel seams.
    const fillScale = Math.max(rotatedBoundsWidth / svgWidth, rotatedBoundsHeight / svgHeight) * 1.03

    return { fillScale, rotatedBoundsWidth }
  }, [barOrientation, svgHeight, svgWidth])

  const computeLayerLayout = React.useCallback(
    (layerNumBars: number) => {
      const barWidth = (svgWidth / Math.max(1, layerNumBars)) * barThickness
      const barHeight = (svgHeight / Math.max(1, layerNumBars)) * barThickness
      const effectiveRenderCount = layerNumBars

      const xs =
        barBandWeights && barOrientation === "vertical"
          ? computeWeightedBreaks(svgWidth, barBandWeights)
          : Array.from({ length: effectiveRenderCount + 1 }, (_, i) => {
              return svgWidth / 2 + (i - layerNumBars / 2) * barWidth
            })

      const ys =
        barBandWeights && barOrientation === "horizontal"
          ? computeWeightedBreaks(svgHeight, barBandWeights)
          : Array.from({ length: effectiveRenderCount + 1 }, (_, i) => {
              return svgHeight / 2 + (i - layerNumBars / 2) * barHeight
            })

      return { xs, ys, effectiveRenderCount }
    },
    [barBandWeights, barOrientation, barThickness, svgHeight, svgWidth]
  )

  const fromNumBars = numBarsAnimRef.current?.from ?? numBars
  const toNumBars = numBarsAnimRef.current?.to ?? numBars

  const layoutFrom = React.useMemo(() => computeLayerLayout(fromNumBars), [computeLayerLayout, fromNumBars])
  const layoutTo = React.useMemo(() => computeLayerLayout(toNumBars), [computeLayerLayout, toNumBars])

  const { xs, ys, effectiveRenderCount } = React.useMemo(() => {
    const padEnds = (arr: number[], targetLen: number) => {
      if (arr.length >= targetLen) return arr.slice(0, targetLen)
      const out = arr.slice()
      const last = out[out.length - 1] ?? 0
      while (out.length < targetLen) out.push(last)
      return out
    }

    const maxCount = Math.max(layoutFrom.effectiveRenderCount, layoutTo.effectiveRenderCount)
    const breaksLen = maxCount + 1

    const xf = padEnds(layoutFrom.xs, breaksLen)
    const xt = padEnds(layoutTo.xs, breaksLen)
    const yf = padEnds(layoutFrom.ys, breaksLen)
    const yt = padEnds(layoutTo.ys, breaksLen)

    const t = easedNumBarsAnimT
    const lerp = (a: number, b: number) => a + (b - a) * t

    const xs = xf.map((v, i) => lerp(v, xt[i] ?? v))
    const ys = yf.map((v, i) => lerp(v, yt[i] ?? v))

    return {
      xs,
      ys,
      effectiveRenderCount: maxCount,
    }
  }, [easedNumBarsAnimT, layoutFrom.effectiveRenderCount, layoutFrom.xs, layoutFrom.ys, layoutTo.effectiveRenderCount, layoutTo.xs, layoutTo.ys])

  const warpSegments = React.useMemo(() => {
    return Math.max(14, Math.min(260, Math.ceil(14 + warpFrequency * 40 + warpAmount / 3)))
  }, [warpFrequency, warpAmount])

  const angleRad = (barGradientAngle * Math.PI) / 180
  const barGradX1 = 0.5 - 0.5 * Math.cos(angleRad)
  const barGradY1 = 0.5 - 0.5 * Math.sin(angleRad)
  const barGradX2 = 0.5 + 0.5 * Math.cos(angleRad)
  const barGradY2 = 0.5 + 0.5 * Math.sin(angleRad)

  const linearFlowPeriod = React.useMemo(() => {
    const vx = barGradX2 - barGradX1
    const vy = barGradY2 - barGradY1
    if (Math.hypot(vx, vy) < 1e-6) return null
    return { vx, vy }
  }, [barGradX1, barGradY1, barGradX2, barGradY2])

  const diamondReferenceLayout: DiamondReferenceLayout = preset2DiamondRef ? "preset2" : "preset1"

  const presetLinearFlowEnabled =
    (activePreset === 1 || activePreset === 5) &&
    !diamondReferenceMode &&
    linearGradientStaggerFlow &&
    barGradientKind === "linear"
  /** Diamond reference presets: parade uses the same toggle/sliders but does not depend on linear bar gradients. */
  const preset1DiamondParadeEnabled = diamondReferenceMode && linearGradientStaggerFlow

  const diamondRipplePitch = React.useMemo(() => {
    if (!diamondReferenceMode) return Math.max(56, svgHeight * 0.36)
    return computeDiamondRipplePitch({
      numBars,
      svgWidth,
      svgHeight,
      diamondStagger,
      diamondSpacing,
      positions,
      diamondLayout: diamondReferenceLayout,
    })
  }, [diamondReferenceLayout, diamondReferenceMode, diamondSpacing, diamondStagger, numBars, positions, svgHeight, svgWidth])

  const preset1DiamondRows = React.useMemo((): Preset1DiamondRowModel[] | null => {
    if (!diamondReferenceMode) return null
    const rowArgs = {
      numBars,
      svgWidth,
      svgHeight,
      diamondStagger,
      diamondSpacing,
      positions,
      diamondCornerRadius,
      diamondRipplePitch,
      linearGradientFlowDurationSec,
      linearGradientStaggerSec,
      diamondLayout: diamondReferenceLayout,
    }

    if (!preset1DiamondParadeEnabled) {
      return Array.from({ length: numBars }, (_, i) =>
        buildPreset1DiamondRowModel(i, {
          ...rowArgs,
          paradeEnabled: false,
        })
      )
    }

    const { paradeCys } = computePreset1ParadeEqualStack(rowArgs)

    return Array.from({ length: numBars }, (_, i) =>
      buildPreset1DiamondRowModel(i, {
        ...rowArgs,
        paradeEnabled: true,
        paradeCys,
        paradeCy: paradeCys[i]!,
      })
    )
  }, [
    diamondReferenceLayout,
    diamondReferenceMode,
    numBars,
    svgWidth,
    svgHeight,
    diamondStagger,
    diamondSpacing,
    positions,
    diamondCornerRadius,
    diamondRipplePitch,
    preset1DiamondParadeEnabled,
    linearGradientFlowDurationSec,
    linearGradientStaggerSec,
  ])

  /**
   * Preset 1: ascending cy so lower shapes paint last.
   * Preset 2: descending cy so upper/later shapes paint on top and soften visible edge stacks when rotated.
   */
  const preset1DiamondParadePaintRows = React.useMemo(() => {
    if (!preset1DiamondParadeEnabled || !preset1DiamondRows) return null
    return preset2DiamondRef
      ? preset1DiamondRows.slice().sort((a, b) => b.cy - a.cy || a.i - b.i)
      : preset1DiamondRows.slice().sort((a, b) => a.cy - b.cy || a.i - b.i)
  }, [preset1DiamondParadeEnabled, preset1DiamondRows, preset2DiamondRef])

  const barsTransform = React.useMemo(() => {
    const parts: string[] = []
    if (presetBarsTransform) parts.push(presetBarsTransform)
    if (barOrientation === "diagonal") {
      const cx = svgWidth / 2
      const cy = svgHeight / 2
      const scale = diagonalMetrics?.fillScale ?? 1.2
      parts.push(`translate(${cx} ${cy}) rotate(45) scale(${scale}) translate(${-cx} ${-cy})`)
    }
    const out = parts.join(" ").trim()
    return out.length ? out : undefined
  }, [barOrientation, diagonalMetrics, presetBarsTransform, svgHeight, svgWidth])

  const gradientsForSvg = React.useMemo(() => {
    const getStopColors = (i: number) => {
      const idx = invertStopColors ? gradientColors.length - 1 - i : i
      const fallback = gradientColors[idx] ?? gradientColors[gradientColors.length - 1] ?? "#000000"
      return { fallback, p3: toDisplayP3ColorString(fallback) }
    }

    if (perBarStopOffsetsOverride && perBarStopOffsetsOverride.length === numBars) {
      return perBarStopOffsetsOverride.map((offsets) =>
        offsets.map((offset, i) => ({
          offset: remapStopSpacing(offset, stopSpacing),
          color: getStopColors(i).p3,
          fallback: getStopColors(i).fallback,
        }))
      )
    }

    const colors = invertStopColors ? [...gradientColors].reverse() : gradientColors
    const offsets = stopOffsetsOverride ?? DEFAULT_STOP_OFFSETS
    if (useRawStopOffsets) {
      return positions.map(() =>
        colors.map((color, i) => {
          const base = offsets[i] ?? i / Math.max(1, colors.length - 1)
          const o = clamp01(base)
          return { offset: o, color: toDisplayP3ColorString(color), fallback: color }
        })
      )
    }
    return positions.map((p) => buildStopsForBarWithOffsets(colors, offsets, stopSpacing, p))
  }, [gradientColors, invertStopColors, numBars, perBarStopOffsetsOverride, positions, stopOffsetsOverride, stopSpacing, useRawStopOffsets])

  return (
    <SidebarProvider
      defaultOpen
      className="h-screen bg-background text-foreground"
      style={{ "--sidebar-width": "420px" } as React.CSSProperties}
    >
      <Sidebar collapsible="none" className="border-r border-border">
        <SidebarHeader className="p-6">
          <div>
            <h1 className="text-2xl font-bold">Gradient Bar Editor</h1>
            <p className="text-muted-foreground mt-1 text-sm">Create animated or static patterns. Download as SVG or MP4.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" onClick={downloadSvg}>
                Download SVG
              </Button>

              <Button type="button" variant="outline" onClick={resetToActivePresetDefaults}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent className="px-6 pb-6">
          <SidebarGroup className="px-0">
            <SidebarGroupContent className="px-0 space-y-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Presets</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-2">
                    <Button type="button" variant="outline" onClick={applyNewDesign} className="w-full justify-center">
                      1
                    </Button>
                    <Button type="button" variant="outline" onClick={() => applyPreset2Diamond(true)} className="w-full justify-center">
                      2
                    </Button>
                    <Button type="button" variant="outline" onClick={applyPreset1} className="w-full justify-center">
                      3
                    </Button>
                    <Button type="button" variant="outline" onClick={applyPresetDiagonalBars} className="w-full justify-center">
                      4
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Animation</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between gap-3">
                    <Label
                      htmlFor="linear-stagger-flow"
                      className={presetHasEncodedAnimation ? "cursor-pointer" : "cursor-not-allowed opacity-60"}
                    >
                      {preset1DiamondRef
                        ? "Upward stream"
                        : preset2DiamondRef
                          ? "Drift along stack"
                          : "Staggered linear gradient flow"}
                    </Label>
                    <Switch
                      id="linear-stagger-flow"
                      checked={linearGradientStaggerFlow}
                      onCheckedChange={setLinearGradientStaggerFlow}
                      disabled={!presetHasEncodedAnimation}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Loop duration</Label>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {linearGradientFlowDurationSec.toFixed(2)}s
                      </span>
                    </div>
                    <Slider
                      value={[linearGradientFlowDurationSec]}
                      onValueChange={([v]) => setLinearGradientFlowDurationSec(v)}
                      min={0.1}
                      max={2}
                      step={0.01}
                      disabled={!presetHasEncodedAnimation || !linearGradientStaggerFlow}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>
                        {diamondReferenceMode ? "Stagger between shapes" : "Stagger between bars"}
                      </Label>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {linearGradientStaggerSec.toFixed(2)}s
                      </span>
                    </div>
                    <Slider
                      value={[linearGradientStaggerSec]}
                      onValueChange={([v]) => setLinearGradientStaggerSec(v)}
                      min={0}
                      max={0.55}
                      step={0.01}
                      disabled={!presetHasEncodedAnimation || !linearGradientStaggerFlow}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Gradient Parameters</CardTitle>
                </CardHeader>
                <CardContent className={`space-y-6 ${preset3EditorLocked ? "opacity-50 grayscale pointer-events-none" : ""}`}>
                  {diamondReferenceMode ? (
                    <div className="flex items-center justify-between">
                      <Label>Invert gradient</Label>
                      <Switch checked={invertStopColors} onCheckedChange={setInvertStopColors} />
                    </div>
                  ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Gradient direction</Label>
                      <span className="text-xs tabular-nums text-muted-foreground">{Math.round(barGradientAngle)}°</span>
                    </div>
                    <Slider
                      value={[barGradientAngle]}
                      onValueChange={([v]) => setBarGradientAngle(v)}
                      min={0}
                      max={360}
                      step={1}
                      disabled={preset3EditorLocked}
                    />
                  </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Stop spacing</Label>
                      <span className="text-xs tabular-nums text-muted-foreground">{stopSpacing.toFixed(3)}×</span>
                    </div>
                    <Slider
                      value={[stopSpacing]}
                      onValueChange={([v]) => setStopSpacing(clampStopSpacing(v))}
                      min={STOP_SPACING_MIN}
                      max={STOP_SPACING_MAX}
                      step={0.005}
                      disabled={preset3EditorLocked}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>{diamondReferenceMode ? "Number of shapes" : "Number of bars"}</Label>
                      <span className="text-xs tabular-nums text-muted-foreground">{numBars}</span>
                    </div>
                    <Slider
                      value={[numBars]}
                      onValueChange={([v]) => setNumBars(Math.max(diamondReferenceMode ? 4 : 1, Math.min(diamondReferenceMode ? 15 : 150, v)))}
                      min={diamondReferenceMode ? 4 : 1}
                      max={diamondReferenceMode ? 15 : 150}
                      step={1}
                      disabled={preset3EditorLocked}
                    />
                  </div>

                  {diamondReferenceMode && (
                    <>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Corner roundness</Label>
                        <span className="text-xs tabular-nums text-muted-foreground">{Math.round(diamondCornerRadius * 100)}%</span>
                      </div>
                      <Slider
                        value={[diamondCornerRadius]}
                        onValueChange={([v]) => setDiamondCornerRadius(v)}
                        min={0}
                        max={1.0}
                        step={0.005}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Spacing stagger</Label>
                        <span className="text-xs tabular-nums text-muted-foreground">{diamondStagger}</span>
                      </div>
                      <Slider
                        value={[diamondStagger]}
                        onValueChange={([v]) =>
                          setDiamondStagger(Math.min(30, Math.max(0, Math.round(Number(v)))))
                        }
                        min={0}
                        max={30}
                        step={1}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Shape spacing</Label>
                        <span className="text-xs tabular-nums text-muted-foreground">{diamondSpacing.toFixed(2)}×</span>
                      </div>
                      <Slider
                        value={[diamondSpacing]}
                        onValueChange={([v]) => setDiamondSpacing(v)}
                        min={1.5}
                        max={2.5}
                        step={0.01}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Gradient size</Label>
                        <span className="text-xs tabular-nums text-muted-foreground">{diamondGradientScale.toFixed(2)}×</span>
                      </div>
                      <Slider
                        value={[diamondGradientScale]}
                        onValueChange={([v]) => setDiamondGradientScale(v)}
                        min={0.1}
                        max={2.0}
                        step={0.01}
                      />
                    </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {!diamondReferenceMode && <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Positioning</CardTitle>
                </CardHeader>
                <CardContent className={`space-y-6 ${preset3EditorLocked ? "opacity-50 grayscale pointer-events-none" : ""}`}>
                  {!diamondReferenceMode && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Bar orientation</Label>
                    </div>
                    <ToggleGroup
                      type="single"
                      value={barOrientation}
                      onValueChange={(v) => (preset3EditorLocked ? null : v ? setBarOrientation(v as Orientation) : null)}
                      variant="outline"
                      size="sm"
                      className="justify-start"
                    >
                      <ToggleGroupItem value="vertical" className="px-6">
                        Vertical
                      </ToggleGroupItem>
                      <ToggleGroupItem value="horizontal" className="px-6">
                        Horizontal
                      </ToggleGroupItem>
                      <ToggleGroupItem value="diagonal" className="px-6">
                        Diagonal
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                  )}

                  {!diamondReferenceMode && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Amplitude</Label>
                      <span className="text-xs tabular-nums text-muted-foreground">{amplitude.toFixed(0)}</span>
                    </div>
                    <Slider value={[amplitude]} onValueChange={([v]) => setAmplitude(v)} min={0} max={50} step={1} disabled={preset3EditorLocked} />
                  </div>
                  )}

                  {!diamondReferenceMode && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Phase shift</Label>
                      <span className="text-xs tabular-nums text-muted-foreground">{phaseShift.toFixed(2)}</span>
                    </div>
                    <Slider value={[phaseShift]} onValueChange={([v]) => setPhaseShift(v)} min={0} max={1} step={0.01} disabled={preset3EditorLocked} />
                  </div>
                  )}

                  {!diamondReferenceMode && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Vertical offset</Label>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {verticalOffset > 0 ? "+" : ""}
                        {verticalOffset.toFixed(0)}
                      </span>
                    </div>
                    <Slider
                      value={[verticalOffset]}
                      onValueChange={([v]) => setVerticalOffset(v)}
                      min={-30}
                      max={30}
                      step={1}
                      disabled={preset3EditorLocked}
                    />
                  </div>
                  )}

                  {!diamondReferenceMode && (
                  <div className="space-y-2">
                    <Label>Curve</Label>
                    <ToggleGroup
                      type="single"
                      value={curveType}
                      onValueChange={(v) => (preset3EditorLocked ? null : v ? switchToCurve(v as CurveType) : null)}
                      variant="outline"
                      size="sm"
                      className="justify-start flex-wrap"
                    >
                      <ToggleGroupItem value="sine" className="px-6">
                        Sine
                      </ToggleGroupItem>
                      <ToggleGroupItem value="cosine" className="px-6">
                        Cosine
                      </ToggleGroupItem>
                      <ToggleGroupItem value="linear" className="px-6">
                        Linear
                      </ToggleGroupItem>
                      <ToggleGroupItem value="vShape" className="px-8">
                        V-Shape
                      </ToggleGroupItem>
                      <ToggleGroupItem value="custom" className="px-8">
                        Custom
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                  )}

                  {(diamondReferenceMode || curveType === "custom") ? (
                    <div className="space-y-3 pt-2">
                      <Label>Custom positions</Label>
                      <div className="space-y-2">
                        {positions.map((pos, i) => (
                          <div key={i} className="flex items-center gap-3">
                            <div
                              className="h-6 w-3 rounded-sm border border-border shrink-0"
                              style={{
                                background: `linear-gradient(to bottom, ${DEFAULT_GRADIENT_COLORS.map(
                                  (c, j) => `${c} ${(DEFAULT_STOP_OFFSETS[j] ?? 0) * 100}%`
                                ).join(", ")})`,
                              }}
                            />
                            <span className="text-xs tabular-nums text-muted-foreground w-10 text-right">{pos.toFixed(0)}</span>
                            <Slider
                              value={[pos]}
                              onValueChange={([v]) => updateCustomPosition(i, v)}
                              min={-50}
                              max={50}
                              step={1}
                              className="flex-1"
                              disabled={preset3EditorLocked}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>}

            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      <SidebarInset className="relative z-0 flex min-w-0 items-center justify-center overflow-hidden p-6">
        <div className="isolate flex h-full w-full max-h-[1000px] max-w-[1000px] items-center justify-center overflow-hidden">
          <svg
            ref={svgRef}
            width={svgWidth}
            height={svgHeight}
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-full"
            preserveAspectRatio="xMidYMid meet"
            shapeRendering="geometricPrecision"
            colorInterpolation="linearRGB"
          >
            <g clipPath="url(#frame-clip)">
              {diamondReferenceMode ? (
                <rect
                  x={0}
                  y={0}
                  width={svgWidth}
                  height={svgHeight}
                  fill={gradientColors[Math.min(gradientColors.length - 1, invertStopColors ? 2 : 1)] ?? "#1a1a2e"}
                  fillOpacity={0.22}
                />
              ) : null}
              {presetBackground === "preset3" ? (
                <>
                  <rect
                    x={-preset3ShapeOverscanPx}
                    y={-preset3ShapeOverscanPx}
                    width={svgWidth + preset3ShapeOverscanPx * 2}
                    height={svgHeight + preset3ShapeOverscanPx * 2}
                    fill="url(#preset3-bg0)"
                  />
                  <rect
                    x={-preset3ShapeOverscanPx}
                    y={-preset3ShapeOverscanPx}
                    width={svgWidth + preset3ShapeOverscanPx * 2}
                    height={svgHeight + preset3ShapeOverscanPx * 2}
                    fill="url(#preset3-bg1)"
                    opacity={0.9}
                  />
                </>
              ) : null}

              {diamondReferenceMode && preset1DiamondRows ? (
                <g>
                  {!preset1DiamondParadeEnabled ? (
                    (preset2DiamondRef ? preset1DiamondRows.slice().reverse() : preset1DiamondRows).map((row) =>
                      preset2DiamondRef ? (
                        <g key={row.i} transform={`rotate(${PRESET_2_SHAPE_ROTATION_DEG} ${row.cx} ${row.cy})`}>
                          <path d={row.trianglePath} fill={`url(#preset1-diamond-grad-${row.i})`} />
                        </g>
                      ) : (
                        <path
                          key={row.i}
                          d={row.trianglePath}
                          fill={`url(#preset1-diamond-grad-${row.i})`}
                        />
                      )
                    )
                  ) : (
                    <>
                      {/* Duplicates under primaries; sorted by cy so overlaps stack predictably. */}
                      <g>
                        {preset1DiamondParadePaintRows!.map((row) => {
                          const c = row.conveyor!
                          return (
                            <g key={`d-${row.i}`}>
                              <animateTransform
                                attributeName="transform"
                                type="translate"
                                additive="replace"
                                dur={c.dur}
                                begin={c.begin}
                                calcMode={c.calcMode ?? "spline"}
                                keyTimes={c.keyTimes}
                                values={c.values}
                                keySplines={c.keySplines}
                                repeatCount="indefinite"
                              />
                              {preset2DiamondRef ? (
                                row.preset2ParadeDupAlignTx != null && row.preset2ParadeDupAlignTy != null ? (
                                  <g transform={`rotate(${PRESET_2_SHAPE_ROTATION_DEG} ${row.cx} ${row.cy})`}>
                                    <g
                                      transform={`translate(${row.preset2ParadeDupAlignTx.toFixed(14)} ${row.preset2ParadeDupAlignTy.toFixed(14)})`}
                                    >
                                      <path d={row.dupTrianglePath} fill={`url(#preset1-diamond-grad-${row.i}-conveyor)`} />
                                    </g>
                                  </g>
                                ) : (
                                  <g transform={`rotate(${PRESET_2_SHAPE_ROTATION_DEG} ${row.dupCx} ${row.dupCy})`}>
                                    <path d={row.dupTrianglePath} fill={`url(#preset1-diamond-grad-${row.i}-conveyor)`} />
                                  </g>
                                )
                              ) : (
                                <path d={row.dupTrianglePath} fill={`url(#preset1-diamond-grad-${row.i}-conveyor)`} />
                              )}
                            </g>
                          )
                        })}
                      </g>
                      <g>
                        {preset1DiamondParadePaintRows!.map((row) => {
                          const c = row.conveyor!
                          const primaryPath = (
                            <path d={row.trianglePath} fill={`url(#preset1-diamond-grad-${row.i})`}>
                              {c.primaryPathMorphValues ? (
                                <animate
                                  attributeName="d"
                                  attributeType="XML"
                                  dur={c.dur}
                                  begin={c.begin}
                                  values={c.primaryPathMorphValues}
                                  keyTimes={c.keyTimes}
                                  calcMode="spline"
                                  keySplines={c.keySplines}
                                  repeatCount="indefinite"
                                />
                              ) : null}
                            </path>
                          )
                          return (
                            <g key={`p-${row.i}`}>
                              <animateTransform
                                attributeName="transform"
                                type="translate"
                                additive="replace"
                                dur={c.dur}
                                begin={c.begin}
                                calcMode={c.calcMode ?? "spline"}
                                keyTimes={c.keyTimes}
                                values={c.values}
                                keySplines={c.keySplines}
                                repeatCount="indefinite"
                              />
                              {preset2DiamondRef ? (
                                <g transform={`rotate(${PRESET_2_SHAPE_ROTATION_DEG} ${row.cx} ${row.cy})`}>{primaryPath}</g>
                              ) : (
                                primaryPath
                              )}
                            </g>
                          )
                        })}
                      </g>
                    </>
                  )}
                </g>
              ) : null}

              {!diamondReferenceMode && <g transform={barsTransform}>
                {barOrientation === "vertical" || barOrientation === "diagonal"
                  ? Array.from({ length: effectiveRenderCount }, (_, idx) => {
                      const x0 = xs[idx]
                      const x1 = xs[idx + 1]

                      const edge = Array.from({ length: warpSegments + 1 }, (_, s) => {
                        const t = s / warpSegments
                        const y = t * svgHeight
                        const y01 = y / svgHeight
                        const dx = warpDeltaAtY(y01)
                        return { left: `${x0 + dx},${y}`, right: `${x1 + dx},${y}` }
                      })

                      const polygonPoints = [...edge.map((p) => p.left), ...edge.slice().reverse().map((p) => p.right)].join(" ")
                      const gradIdx = (idx % numBars + numBars) % numBars
                      const shouldAnimateIn = false
                      const shouldTileMoveBars =
                        presetLinearFlowEnabled &&
                        (barOrientation === "vertical" || barOrientation === "diagonal") &&
                        linearGradientStaggerSec > 0

                      // Preset 1 / diagonal-bar preset: move the bar geometry itself with stacked tiles:
                      // row 0 = normal, row 1 = stop colors flipped (1↔4), row 2 = normal again.
                      // Animate 0 → -2H so the loop lands on the same (normal) row.
                      const barFlow = shouldTileMoveBars
                        ? buildTiledTranslateSyncAnimation(
                            gradIdx,
                            numBars,
                            linearGradientFlowDurationSec,
                            linearGradientStaggerSec,
                            0,
                            -svgHeight * 2
                          )
                        : null
                      const barFill =
                        barGradientKind === "linear" ? `url(#gradient-bar-lin-${idx})` : `url(#gradient-bar${gradIdx})`
                      return (
                        <g key={idx}>
                          <g>
                            <polygon
                              points={polygonPoints}
                              fill={barFill}
                              style={
                                shouldAnimateIn
                                  ? {
                                      transformBox: "fill-box",
                                      transformOrigin: "center",
                                      willChange: "transform, opacity",
                                      animation: "bar-enter-x 420ms cubic-bezier(0.22, 1, 0.36, 1) both",
                                    }
                                  : undefined
                              }
                            />
                            {barFlow ? (
                              <polygon
                                points={polygonPoints}
                                // Middle tile: flip the bar geometry vertically (no gradient changes).
                                // This mirrors the bar within a 1×H tile, then positions it in the H..2H band.
                                transform={`translate(0 ${svgHeight * 2}) scale(1 -1)`}
                                fill={barFill}
                              />
                            ) : null}
                            {barFlow ? (
                              <polygon
                                points={polygonPoints}
                                transform={`translate(0 ${svgHeight * 2})`}
                                fill={barFill}
                              />
                            ) : null}
                            {barFlow ? (
                              <animateTransform
                                attributeName="transform"
                                type="translate"
                                additive="replace"
                                dur={barFlow.dur}
                                keyTimes={barFlow.keyTimes}
                                values={barFlow.values}
                                calcMode={barFlow.keySplines ? "spline" : "linear"}
                                keySplines={barFlow.keySplines}
                                repeatCount="indefinite"
                                begin="0s"
                              />
                            ) : null}
                          </g>
                          {rightBorderEnabled ? (
                            <polyline
                              points={edge.map((p) => p.right).join(" ")}
                              fill="none"
                              stroke="url(#edge-border-gradient)"
                              strokeWidth={rightBorderWidth}
                              vectorEffect="non-scaling-stroke"
                              strokeLinejoin="round"
                              strokeLinecap="round"
                              strokeMiterlimit={2}
                              style={
                                shouldAnimateIn
                                  ? {
                                      transformBox: "fill-box",
                                      transformOrigin: "center",
                                      willChange: "transform, opacity",
                                      animation: "bar-enter-x 420ms cubic-bezier(0.22, 1, 0.36, 1) both",
                                    }
                                  : undefined
                              }
                            />
                          ) : null}
                        </g>
                      )
                    })
                  : null}

                {barOrientation === "horizontal"
                  ? preset3IsReferenceMode
                    ? [
                        // Reference composition: 4 clipped bands, each with 2 stacked radial-gradient rects.
                        {
                          key: "p3-band-0",
                          clipId: "preset3-band-clip-0",
                          rects: [
                            { x: -226.081, y: -333.789, w: 807.239, h: 542.059, fill: "url(#preset3-paint0)" },
                            { x: -9.08133, y: -150.577, w: 352, h: 298, fill: "url(#preset3-paint1)" },
                          ],
                        },
                        {
                          key: "p3-band-1",
                          clipId: "preset3-band-clip-1",
                          rects: [
                            { x: -61.0813, y: -13.3664, w: 470.842, h: 363.89, fill: "url(#preset3-paint2)" },
                            { x: -1.08133, y: -91.5774, w: 344, h: 385, fill: "url(#preset3-paint3)" },
                          ],
                        },
                        {
                          key: "p3-band-2",
                          clipId: "preset3-band-clip-2",
                          rects: [
                            { x: -143.081, y: -13.9438, w: 646.189, h: 499.408, fill: "url(#preset3-paint4)" },
                            { x: -1.08133, y: 63.0562, w: 344, h: 422, fill: "url(#preset3-paint5)" },
                          ],
                        },
                        {
                          key: "p3-band-3",
                          clipId: "preset3-band-clip-3",
                          rects: [
                            {
                              x: -14.1692,
                              y: 91.5557,
                              w: 517.634,
                              h: 400.053,
                              fill: "url(#preset3-paint6)",
                              transform: "rotate(15.7846 -14.1692 91.5557)",
                            },
                            { x: -1.08133, y: 157.728, w: 344, h: 422, fill: "url(#preset3-paint7)" },
                          ],
                        },
                      ].map((band) => (
                        <g key={band.key} clipPath={`url(#${band.clipId})`}>
                          {band.rects.map((r, i) => (
                            <rect
                              key={i}
                              x={r.x}
                              y={r.y}
                              width={r.w}
                              height={r.h}
                              fill={r.fill}
                              transform={"transform" in r ? (r.transform as string) : undefined}
                            />
                          ))}
                        </g>
                      ))
                    : Array.from({ length: effectiveRenderCount }, (_, idx) => {
                      const y0 = ys[idx]
                      const y1 = ys[idx + 1]

                      const xStart = -preset3ShapeOverscanPx
                      const xEnd = svgWidth + preset3ShapeOverscanPx

                      const edge = Array.from({ length: warpSegments + 1 }, (_, s) => {
                        const t = s / warpSegments
                        const x = xStart + t * (xEnd - xStart)
                        const x01 = x / svgWidth
                        const dy = warpDeltaAtX(x01)
                        return { top: `${x},${y0 + dy}`, bottom: `${x},${y1 + dy}` }
                      })

                      const polygonPoints = [...edge.map((p) => p.top), ...edge.slice().reverse().map((p) => p.bottom)].join(" ")
                      const gradIdx = (idx % numBars + numBars) % numBars
                      const shouldAnimateIn = false
                      return (
                        <g key={idx}>
                          <polygon
                            points={polygonPoints}
                            fill={barGradientKind === "linear" ? `url(#gradient-bar-lin-${idx})` : `url(#gradient-bar${gradIdx})`}
                            style={
                              shouldAnimateIn
                                ? {
                                    transformBox: "fill-box",
                                    transformOrigin: "center",
                                    willChange: "transform, opacity",
                                    animation: "bar-enter-y 420ms cubic-bezier(0.22, 1, 0.36, 1) both",
                                  }
                                : undefined
                            }
                          />
                          {rightBorderEnabled ? (
                            <polyline
                              points={edge.map((p) => p.bottom).join(" ")}
                              fill="none"
                              stroke="url(#edge-border-gradient)"
                              strokeWidth={rightBorderWidth}
                              vectorEffect="non-scaling-stroke"
                              strokeLinejoin="round"
                              strokeLinecap="round"
                              strokeMiterlimit={2}
                              style={
                                shouldAnimateIn
                                  ? {
                                      transformBox: "fill-box",
                                      transformOrigin: "center",
                                      willChange: "transform, opacity",
                                      animation: "bar-enter-y 420ms cubic-bezier(0.22, 1, 0.36, 1) both",
                                    }
                                  : undefined
                              }
                            />
                          ) : null}
                        </g>
                      )
                    })
                  : null}
              </g>}
            </g>

            <defs>
              <clipPath id="frame-clip">
                <rect x="0" y="0" width={svgWidth} height={svgHeight} />
              </clipPath>
              {preset3IsReferenceMode ? (
                <>
                  {/* Band clip paths (match the reference SVG band bounds). */}
                  <clipPath id="preset3-band-clip-0">
                    <rect x={-39.9993} y={0.211197} width={383} height={147} />
                  </clipPath>
                  <clipPath id="preset3-band-clip-1">
                    <rect x={-39.9993} y={147.211} width={471} height={147} />
                  </clipPath>
                  <clipPath id="preset3-band-clip-2">
                    <rect x={-39.9993} y={293.211} width={471} height={97} />
                  </clipPath>
                  <clipPath id="preset3-band-clip-3">
                    <rect x={-39.9993} y={390.211} width={471} height={58} />
                  </clipPath>

                  {/* Preset 3 reference gradients (mirrors `assets/Reference-for-preset-3.svg`). */}
                  <radialGradient
                    id="preset3-paint0"
                    cx="0"
                    cy="0"
                    r="1"
                    gradientUnits="userSpaceOnUse"
                    gradientTransform="translate(177.538 -62.7592) rotate(90) scale(271.03 403.619)"
                  >
                    <stop offset="0.0240385" stopColor={toDisplayP3ColorString("#CCD0EE")} />
                    <stop offset="0.389423" stopColor={toDisplayP3ColorString("#A773F9")} />
                    <stop offset="0.576923" stopColor={toDisplayP3ColorString("#6A66FB")} />
                    <stop offset="0.701923" stopColor={toDisplayP3ColorString("#255AF6")} />
                    <stop offset="1" stopColor={toDisplayP3ColorString("#0340E1")} />
                  </radialGradient>
                  <radialGradient
                    id="preset3-paint1"
                    cx="0"
                    cy="0"
                    r="1"
                    gradientUnits="userSpaceOnUse"
                    gradientTransform="translate(166.919 -1.57738) rotate(90) scale(149 176)"
                  >
                    <stop offset="0.0240385" stopColor={toDisplayP3ColorString("#EEC7FF")} />
                    <stop offset="0.389423" stopColor={toDisplayP3ColorString("#648AFA")} />
                    <stop offset="0.576923" stopColor={toDisplayP3ColorString("#255AF6")} />
                    <stop offset="1" stopColor={toDisplayP3ColorString("#000B8F")} />
                  </radialGradient>
                  <radialGradient
                    id="preset3-paint2"
                    cx="0"
                    cy="0"
                    r="1"
                    gradientUnits="userSpaceOnUse"
                    gradientTransform="translate(174.339 168.579) rotate(90) scale(181.945 235.421)"
                  >
                    <stop offset="0.0240385" stopColor={toDisplayP3ColorString("#CCD0EE")} />
                    <stop offset="0.389423" stopColor={toDisplayP3ColorString("#A773F9")} />
                    <stop offset="0.576923" stopColor={toDisplayP3ColorString("#6A66FB")} />
                    <stop offset="0.701923" stopColor={toDisplayP3ColorString("#255AF6")} />
                    <stop offset="1" stopColor={toDisplayP3ColorString("#0340E1")} />
                  </radialGradient>
                  <radialGradient
                    id="preset3-paint3"
                    cx="0"
                    cy="0"
                    r="1"
                    gradientUnits="userSpaceOnUse"
                    gradientTransform="translate(170.919 100.923) rotate(90) scale(192.5 172)"
                  >
                    <stop offset="0.0240385" stopColor={toDisplayP3ColorString("#EEC7FF")} />
                    <stop offset="0.389423" stopColor={toDisplayP3ColorString("#648AFA")} />
                    <stop offset="0.576923" stopColor={toDisplayP3ColorString("#255AF6")} />
                    <stop offset="1" stopColor={toDisplayP3ColorString("#000B8F")} />
                  </radialGradient>
                  <radialGradient
                    id="preset3-paint4"
                    cx="0"
                    cy="0"
                    r="1"
                    gradientUnits="userSpaceOnUse"
                    gradientTransform="translate(180.013 235.76) rotate(90) scale(249.704 323.095)"
                  >
                    <stop offset="0.0240385" stopColor={toDisplayP3ColorString("#CCD0EE")} />
                    <stop offset="0.389423" stopColor={toDisplayP3ColorString("#A773F9")} />
                    <stop offset="0.576923" stopColor={toDisplayP3ColorString("#6A66FB")} />
                    <stop offset="0.701923" stopColor={toDisplayP3ColorString("#255AF6")} />
                    <stop offset="1" stopColor={toDisplayP3ColorString("#0340E1")} />
                  </radialGradient>
                  <radialGradient
                    id="preset3-paint5"
                    cx="0"
                    cy="0"
                    r="1"
                    gradientUnits="userSpaceOnUse"
                    gradientTransform="translate(170.919 274.056) rotate(90) scale(211 172)"
                  >
                    <stop offset="0.0240385" stopColor={toDisplayP3ColorString("#EEC7FF")} />
                    <stop offset="0.389423" stopColor={toDisplayP3ColorString("#648AFA")} />
                    <stop offset="0.576923" stopColor={toDisplayP3ColorString("#255AF6")} />
                    <stop offset="1" stopColor={toDisplayP3ColorString("#000B8F")} />
                  </radialGradient>
                  <radialGradient
                    id="preset3-paint6"
                    cx="0"
                    cy="0"
                    r="1"
                    gradientUnits="userSpaceOnUse"
                    gradientTransform="translate(244.648 291.582) rotate(90) scale(200.027 258.817)"
                  >
                    <stop offset="0.0240385" stopColor={toDisplayP3ColorString("#CCD0EE")} />
                    <stop offset="0.389423" stopColor={toDisplayP3ColorString("#A773F9")} />
                    <stop offset="0.576923" stopColor={toDisplayP3ColorString("#6A66FB")} />
                    <stop offset="0.701923" stopColor={toDisplayP3ColorString("#255AF6")} />
                    <stop offset="1" stopColor={toDisplayP3ColorString("#0340E1")} />
                  </radialGradient>
                  <radialGradient
                    id="preset3-paint7"
                    cx="0"
                    cy="0"
                    r="1"
                    gradientUnits="userSpaceOnUse"
                    gradientTransform="translate(170.919 368.728) rotate(90) scale(211 172)"
                  >
                    <stop offset="0.0240385" stopColor={toDisplayP3ColorString("#EEC7FF")} />
                    <stop offset="0.389423" stopColor={toDisplayP3ColorString("#648AFA")} />
                    <stop offset="0.576923" stopColor={toDisplayP3ColorString("#255AF6")} />
                    <stop offset="1" stopColor={toDisplayP3ColorString("#000B8F")} />
                  </radialGradient>
                </>
              ) : null}

              <linearGradient id="edge-border-gradient" x1="0" y1="0" x2="0" y2={svgHeight} gradientUnits="userSpaceOnUse">
                {rightBorderColors.map((color, i) => (
                  <stop
                    key={i}
                    offset={i / Math.max(1, rightBorderColors.length - 1)}
                    stopColor={color}
                    style={{ stopColor: toDisplayP3ColorString(color) }}
                  />
                ))}
              </linearGradient>

              <radialGradient id="preset3-bg0" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform={`translate(${svgWidth * 0.52} ${svgHeight * 0.12}) rotate(90) scale(${svgHeight * 0.62} ${svgWidth * 0.92})`}>
                <stop offset="0.02" stopColor={toDisplayP3ColorString("#CCD0EE")} />
                <stop offset="0.39" stopColor={toDisplayP3ColorString("#A773F9")} />
                <stop offset="0.58" stopColor={toDisplayP3ColorString("#6A66FB")} />
                <stop offset="0.70" stopColor={toDisplayP3ColorString("#255AF6")} />
                <stop offset="1" stopColor={toDisplayP3ColorString("#0340E1")} />
              </radialGradient>

              <radialGradient
                id="preset3-bg1"
                cx="0"
                cy="0"
                r="1"
                gradientUnits="userSpaceOnUse"
                gradientTransform={`translate(${svgWidth * 0.49} ${svgHeight * 0.44}) rotate(90) scale(${svgHeight * 0.36 * preset3Overscan} ${svgWidth * 0.52 * preset3Overscan})`}
              >
                <stop offset="0.02" stopColor={toDisplayP3ColorString("#EEC7FF")} />
                <stop offset="0.39" stopColor={toDisplayP3ColorString("#648AFA")} />
                <stop offset="0.58" stopColor={toDisplayP3ColorString("#255AF6")} />
                <stop offset="1" stopColor={toDisplayP3ColorString("#000B8F")} />
              </radialGradient>

              {barGradientKind === "radial"
                ? gradientsForSvg.map((stops, index) => (
                    <radialGradient
                      key={`bar${index}`}
                      id={`gradient-bar${index}`}
                      cx={
                        radialPerBarCenter
                          ? barOrientation === "horizontal"
                            ? svgWidth * 0.5
                            : (xs[index] + xs[index + 1]) / 2
                          : svgWidth * 0.5
                      }
                      cy={
                        radialPerBarCenter
                          ? barOrientation === "horizontal"
                            ? ys[index] - (ys[index + 1] - ys[index]) * 0.15
                            : svgHeight * 0.5
                          : svgHeight * 0.5
                      }
                      r={
                        radialPerBarCenter && barOrientation === "horizontal"
                          ? Math.max(12, (ys[index + 1] - ys[index]) * 0.72) * preset3Overscan
                          : Math.max(svgWidth, svgHeight) * 0.75 * preset3Overscan
                      }
                      fx={
                        radialPerBarCenter
                          ? barOrientation === "horizontal"
                            ? svgWidth * 0.5
                            : (xs[index] + xs[index + 1]) / 2
                          : svgWidth * 0.5
                      }
                      fy={
                        radialPerBarCenter
                          ? barOrientation === "horizontal"
                            ? ys[index] - (ys[index + 1] - ys[index]) * 0.15
                            : svgHeight * 0.44
                          : svgHeight * 0.5
                      }
                      gradientUnits="userSpaceOnUse"
                    >
                      {stops.map((stop, i) => (
                        <stop key={i} offset={stop.offset} stopColor={stop.fallback} style={{ stopColor: stop.color }} />
                      ))}
                    </radialGradient>
                  ))
                : null}

              {barGradientKind === "linear"
                ? Array.from({ length: effectiveRenderCount }, (_, stripIdx) => {
                    const gradIdx = (stripIdx % numBars + numBars) % numBars
                    const stops = gradientsForSvg[gradIdx]!
                    const ext = linearGradientBBoxWithExtendedStops(
                      stops,
                      barGradX1,
                      barGradY1,
                      barGradX2,
                      barGradY2
                    )
                    const diagonal = barOrientation === "diagonal"
                    let lx1: number
                    let ly1: number
                    let lx2: number
                    let ly2: number
                    let gradientUnits: "objectBoundingBox" | "userSpaceOnUse"

                    if (diagonal) {
                      lx1 = ext.x1
                      ly1 = ext.y1
                      lx2 = ext.x2
                      ly2 = ext.y2
                      gradientUnits = "objectBoundingBox"
                    } else {
                      const pad = Math.max(0, Math.abs(warpAmount))
                      const bbox =
                        barOrientation === "vertical"
                          ? {
                              x0: (xs[stripIdx] ?? 0) - pad,
                              y0: 0,
                              x1: (xs[stripIdx + 1] ?? svgWidth) + pad,
                              y1: svgHeight,
                            }
                          : {
                              x0: 0,
                              y0: (ys[stripIdx] ?? 0) - pad,
                              x1: svgWidth,
                              y1: (ys[stripIdx + 1] ?? svgHeight) + pad,
                            }
                      const bw = Math.max(1e-6, bbox.x1 - bbox.x0)
                      const bh = Math.max(1e-6, bbox.y1 - bbox.y0)
                      lx1 = bbox.x0 + ext.x1 * bw
                      ly1 = bbox.y0 + ext.y1 * bh
                      lx2 = bbox.x0 + ext.x2 * bw
                      ly2 = bbox.y0 + ext.y2 * bh
                      gradientUnits = "userSpaceOnUse"
                    }

                    // When Preset 1 animation is enabled we move the bar geometry (not the gradients),
                    // so keep the gradients in their natural, unsquished state.
                    const paintStops = ext.stops
                    const gradientTransformBase = undefined

                    return (
                      <linearGradient
                        key={`lin-strip-${stripIdx}-${linearGradientStaggerFlow ? "flow" : "idle"}`}
                        id={`gradient-bar-lin-${stripIdx}`}
                        x1={lx1}
                        y1={ly1}
                        x2={lx2}
                        y2={ly2}
                        gradientUnits={gradientUnits}
                        spreadMethod="pad"
                        gradientTransform={gradientTransformBase}
                      >
                        {paintStops.map((stop, i) => (
                          <stop
                            key={i}
                            offset={stop.offset}
                            stopColor={stop.fallback}
                            style={{ stopColor: stop.color }}
                          />
                        ))}
                      </linearGradient>
                    )
                  })
                : null}
              {diamondReferenceMode && preset1DiamondRows
                ? Array.from({ length: numBars }, (_, i) => {
                    const half = (494 / 343) * svgWidth * 0.5
                    const halfDiag = half * Math.sqrt(2)
                    const row = preset1DiamondRows[i]!
                    const gradCx = row.cx
                    const gradCy = row.cy
                    const dupGradCy = row.dupCy
                    const dupGradCx = row.dupCx
                    const gradAngle = preset2DiamondRef ? 0 : 45
                    // Gradient size: radius so scale=1 puts stop 4 at the shape corner (halfDiag from center).
                    // Stop spacing: compresses stops 1–3 toward stop 4 (the edge).
                    const r = halfDiag * diamondGradientScale
                    const s = clampStopSpacing(stopSpacing)
                    const off1 = Math.max(0, 1 - s)
                    const off2 = Math.max(0, 1 - s * (2 / 3))
                    const off3 = Math.max(0, 1 - s * (1 / 3))
                    return (
                      <React.Fragment key={i}>
                        <linearGradient
                          id={`preset1-diamond-grad-${i}`}
                          x1={gradCx}
                          y1={gradCy - r}
                          x2={gradCx}
                          y2={gradCy + r}
                          gradientUnits="userSpaceOnUse"
                          gradientTransform={`rotate(${gradAngle} ${gradCx} ${gradCy})`}
                        >
                          <stop offset={off1} stopColor={invertStopColors ? gradientColors[3] : gradientColors[0]} />
                          <stop offset={off2} stopColor={invertStopColors ? gradientColors[2] : gradientColors[1]} />
                          <stop offset={off3} stopColor={invertStopColors ? gradientColors[1] : gradientColors[2]} />
                          <stop offset="1" stopColor={invertStopColors ? gradientColors[0] : gradientColors[3]} />
                        </linearGradient>
                        {preset1DiamondParadeEnabled ? (
                          <linearGradient
                            id={`preset1-diamond-grad-${i}-conveyor`}
                            x1={dupGradCx}
                            y1={dupGradCy - r}
                            x2={dupGradCx}
                            y2={dupGradCy + r}
                            gradientUnits="userSpaceOnUse"
                            gradientTransform={`rotate(${gradAngle} ${dupGradCx} ${dupGradCy})`}
                          >
                            <stop offset={off1} stopColor={invertStopColors ? gradientColors[3] : gradientColors[0]} />
                            <stop offset={off2} stopColor={invertStopColors ? gradientColors[2] : gradientColors[1]} />
                            <stop offset={off3} stopColor={invertStopColors ? gradientColors[1] : gradientColors[2]} />
                            <stop offset="1" stopColor={invertStopColors ? gradientColors[0] : gradientColors[3]} />
                          </linearGradient>
                        ) : null}
                      </React.Fragment>
                    )
                  })
                : null}
            </defs>
          </svg>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

