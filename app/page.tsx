"use client"

import * as React from "react"
import { RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
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

const PRESET_1_ANIMATION_DEFAULTS: Readonly<{
  enabled: boolean
  loopDurationSec: number
  staggerSec: number
}> = {
  enabled: true,
  loopDurationSec: 1.5,
  staggerSec: 0.35,
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
    // Return: ease-out so velocity → 0 at loop boundary.
    return {
      dur: `${R}s`,
      keyTimes: `0;${kt(aHoldEnd)};${kt(b)};1`,
      values: `0 0;0 0;${vx} ${vy};0 0`,
      keySplines: "0 0 1 1; 0.28 0 0.72 1; 0 0 0.58 1",
    }
  }
  return { dur: `${R}s`, keyTimes: `0;1`, values: `0 0;0 0` }
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
  // Staggered start, then a "page flip" motion:
  // accelerate through the middle, then ease-out right before the loop boundary so the repeat feels blended.
  if (aHoldEnd < 1 - 1e-5) {
    const span = 1 - aHoldEnd
    // Bias the "fastest" point later so it feels like flipping a few pages and slowing before the next loop.
    const mid = aHoldEnd + span * 0.72
    return {
      dur: `${R}s`,
      keyTimes: `0;${kt(aHoldEnd)};${kt(mid)};1`,
      values: `0 0;0 0;${(vx * 0.92).toFixed(5)} ${(vy * 0.92).toFixed(5)};${vx} ${vy}`,
      // Hold segment: linear (flat). Flip segment: ease-in (accelerate). Settle segment: ease-out (decelerate).
      keySplines: "0 0 1 1; 0.22 0 0.78 1; 0 0 0.58 1",
    }
  }
  return { dur: `${R}s`, keyTimes: `0;1`, values: `0 0;0 0` }
}

function remapStopSpacing(offset: number, stopSpacing: number) {
  const spacing = Math.max(0.001, Math.min(1, stopSpacing))
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

function rgbToHex(r: number, g: number, b: number) {
  const to = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")
  return `#${to(r)}${to(g)}${to(b)}`
}

function srgbToLinear(c: number) {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

function relativeLuminance(hex: string) {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0
  const r = srgbToLinear(rgb.r)
  const g = srgbToLinear(rgb.g)
  const b = srgbToLinear(rgb.b)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
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

function samplePixels(imageData: ImageData, maxSamples: number) {
  const { data, width, height } = imageData
  const total = width * height
  const stride = Math.max(1, Math.floor(total / maxSamples))
  const points: Array<[number, number, number]> = []
  for (let i = 0; i < total; i += stride) {
    const idx = i * 4
    const a = data[idx + 3]
    if (a < 16) continue
    points.push([data[idx], data[idx + 1], data[idx + 2]])
  }
  return points
}

function kmeans(points: Array<[number, number, number]>, k: number, iterations = 10) {
  if (points.length === 0) return []
  const centroids: Array<[number, number, number]> = []
  for (let i = 0; i < k; i++) {
    const p = points[Math.floor((i / k) * (points.length - 1))]
    centroids.push([p[0], p[1], p[2]])
  }

  for (let it = 0; it < iterations; it++) {
    const sums = Array.from({ length: k }, () => ({ r: 0, g: 0, b: 0, n: 0 }))
    for (const p of points) {
      let best = 0
      let bestD = Infinity
      for (let c = 0; c < k; c++) {
        const dx = p[0] - centroids[c][0]
        const dy = p[1] - centroids[c][1]
        const dz = p[2] - centroids[c][2]
        const d = dx * dx + dy * dy + dz * dz
        if (d < bestD) {
          bestD = d
          best = c
        }
      }
      sums[best].r += p[0]
      sums[best].g += p[1]
      sums[best].b += p[2]
      sums[best].n += 1
    }
    for (let c = 0; c < k; c++) {
      if (sums[c].n === 0) continue
      centroids[c] = [sums[c].r / sums[c].n, sums[c].g / sums[c].n, sums[c].b / sums[c].n]
    }
  }

  return centroids
}

async function extractDominantColors(file: File, k = 4): Promise<string[]> {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement("canvas")
  const maxDim = 256
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) return []
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const points = samplePixels(imageData, 20000)
  const centroids = kmeans(points, k, 12)
  const colors = centroids.map((c) => rgbToHex(c[0], c[1], c[2]))
  colors.sort((a, b) => relativeLuminance(a) - relativeLuminance(b))
  return colors
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
  const spacing = Math.max(0.001, Math.min(1, stopSpacing))

  // Offsets may be < 0 or > 1: gradient continues past the bar (objectBoundingBox); only the in-frame slice is visible.
  return colors.map((color, i) => {
    const base = DEFAULT_STOP_OFFSETS[i] ?? i / Math.max(1, colors.length - 1)
    const offset = center + (base - 0.5) * spacing
    return { offset, color: toDisplayP3ColorString(color), fallback: color }
  })
}

function buildStopsForBarWithOffsets(colors: string[], offsets: readonly number[], stopSpacing: number, position: number): Stop[] {
  const center = 0.5 - position / 100 // position is -50..50
  const spacing = Math.max(0.001, Math.min(1, stopSpacing))

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
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)

  // Preview size (export uses these).
  const svgWidth = 343
  const svgHeight = 448

  const [barOrientation, setBarOrientation] = React.useState<Orientation>("vertical")
  const [numBars, setNumBars] = React.useState(12)
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
  const [stopSpacing, setStopSpacing] = React.useState(1.0) // 0.2x -> 3x
  const [barThickness, setBarThickness] = React.useState(1.0) // relative to computed bar width/height
  const [barGradientKind, setBarGradientKind] = React.useState<BarGradientKind>("linear")
  const [invertStopColors, setInvertStopColors] = React.useState(false)
  const [diamondCornerRadius, setDiamondCornerRadius] = React.useState(0.15)
  const [diamondStagger, setDiamondStagger] = React.useState(5)
  const [diamondSpacing, setDiamondSpacing] = React.useState(1.5)
  const [diamondGradientScale, setDiamondGradientScale] = React.useState(1.0)
  const [radialPerBarCenter, setRadialPerBarCenter] = React.useState(false)
  const [stopOffsetsOverride, setStopOffsetsOverride] = React.useState<ReadonlyArray<number> | null>(null)
  const [useRawStopOffsets, setUseRawStopOffsets] = React.useState(false)

  // Colors + borders
  const [gradientColors, setGradientColors] = React.useState<string[]>([...DEFAULT_GRADIENT_COLORS])
  const [rightBorderEnabled, setRightBorderEnabled] = React.useState(false)
  const [rightBorderWidth, setRightBorderWidth] = React.useState(0.5)
  const [rightBorderColors, setRightBorderColors] = React.useState<string[]>([...DEFAULT_BORDER_COLORS])
  const [borderStopSpacing, setBorderStopSpacing] = React.useState(1.0)

  const [paletteLoading, setPaletteLoading] = React.useState(false)
  const [paletteFileName, setPaletteFileName] = React.useState<string>("")

  const [perBarStopOffsetsOverride, setPerBarStopOffsetsOverride] = React.useState<
    ReadonlyArray<ReadonlyArray<number>> | null
  >(null)
  const [presetBarsTransform, setPresetBarsTransform] = React.useState<string>("")
  const [presetBackground, setPresetBackground] = React.useState<"none" | "preset1" | "preset3">("none")
  const [activePreset, setActivePreset] = React.useState<number | null>(null)

  // Global preference: only *applies* to Preset 1, but we keep the toggle state persistent.
  const [linearGradientStaggerFlow, setLinearGradientStaggerFlow] = React.useState(PRESET_1_ANIMATION_DEFAULTS.enabled)
  const [linearGradientFlowDurationSec, setLinearGradientFlowDurationSec] = React.useState(
    PRESET_1_ANIMATION_DEFAULTS.loopDurationSec
  )
  const [linearGradientStaggerSec, setLinearGradientStaggerSec] = React.useState(PRESET_1_ANIMATION_DEFAULTS.staggerSec)

  const presetHasEncodedAnimation = activePreset === 1 || activePreset === 2
  const preset1IsReferenceMode = activePreset === 1 && presetBackground === "preset1"
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
    setPaletteFileName("")
    setPerBarStopOffsetsOverride(null)
    setPresetBarsTransform("")
    setPresetBackground("none")
    // When switching/resetting, keep animation OFF by default.
    setLinearGradientStaggerFlow(false)
    setLinearGradientFlowDurationSec(PRESET_1_ANIMATION_DEFAULTS.loopDurationSec)
    setLinearGradientStaggerSec(PRESET_1_ANIMATION_DEFAULTS.staggerSec)
  }, [])

  const applyNewDesign = React.useCallback(() => {
    resetAll()
    setActivePreset(1)
    setPresetBackground("preset1")
    setStopSpacing(1.0)
    setNumBars(10)
    setDiamondCornerRadius(0.35)
    setDiamondStagger(10)
    setDiamondSpacing(1.5)
    setDiamondGradientScale(1.0)
    setInvertStopColors(true)
  }, [resetAll])

  const applyPreset1 = React.useCallback(() => {
    resetAll()
    setActivePreset(1)
    // Preset selection should not auto-enable animation.
    setLinearGradientStaggerFlow(false)
    setLinearGradientFlowDurationSec(PRESET_1_ANIMATION_DEFAULTS.loopDurationSec)
    setLinearGradientStaggerSec(PRESET_1_ANIMATION_DEFAULTS.staggerSec)
  }, [resetAll])

  const applyPreset2 = React.useCallback(() => {
    resetAll()
    setActivePreset(2)
    // Preset selection should not auto-enable animation.
    setLinearGradientStaggerFlow(false)
    setBarOrientation("diagonal")
    setStopSpacing(0.73)
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
    setStopSpacing(0.35)
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


  // Start in Preset 1 so the animation toggle can be effective immediately.
  const didInitPresetRef = React.useRef(false)
  React.useEffect(() => {
    if (didInitPresetRef.current) return
    didInitPresetRef.current = true
    applyNewDesign()
  }, [applyNewDesign])

  const applyPaletteFromFile = React.useCallback(async (file: File | null) => {
    if (!file) return
    setPaletteLoading(true)
    try {
      const colors = await extractDominantColors(file, 4)
      if (colors.length === 4) {
        setGradientColors(colors)
        setRightBorderColors([...colors].reverse())
      }
      setPaletteFileName(file.name)
    } finally {
      setPaletteLoading(false)
    }
  }, [])

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

  const presetLinearFlowEnabled = (activePreset === 1 || activePreset === 2) && linearGradientStaggerFlow && barGradientKind === "linear"

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
            <p className="text-muted-foreground mt-1 text-sm">Warp + curve controls, palette extraction, borders, exports.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" onClick={downloadSvg}>
                Download SVG
              </Button>
              <Button type="button" onClick={downloadPng}>
                Download PNG (4×)
              </Button>
              <Button type="button" variant="outline" onClick={resetAll}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent className="px-6 pb-6">
          <SidebarGroup className="px-0">
            <SidebarGroupLabel className="px-0 text-muted-foreground">Controls</SidebarGroupLabel>
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
                    <Button type="button" variant="outline" disabled className="w-full justify-center">
                      2
                    </Button>
                    <Button type="button" variant="outline" onClick={applyPreset1} className="w-full justify-center">
                      3
                    </Button>
                    <Button type="button" variant="outline" onClick={applyPreset2} className="w-full justify-center">
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
                      Staggered linear gradient flow
                    </Label>
                    <Switch
                      id="linear-stagger-flow"
                      checked={linearGradientStaggerFlow}
                      onCheckedChange={setLinearGradientStaggerFlow}
                      disabled={!presetHasEncodedAnimation}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Linear gradients only. Stops and spread mode stay the same as Preset 1 when off—no layout jump on
                    toggle. Each bar waits, sweeps in order, returns to rest, then all hold before the next cycle. Preset
                    1 turns this on.
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Loop duration</Label>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {linearGradientFlowDurationSec.toFixed(1)}s
                      </span>
                    </div>
                    <Slider
                      value={[linearGradientFlowDurationSec]}
                      onValueChange={([v]) => setLinearGradientFlowDurationSec(v)}
                      min={0.8}
                      max={14}
                      step={0.1}
                      disabled={!presetHasEncodedAnimation || !linearGradientStaggerFlow}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Stagger between bars</Label>
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
                  {linearGradientStaggerFlow ? (
                    <p className="text-xs tabular-nums text-muted-foreground">
                      Full cycle ≈{" "}
                      {(
                        (Math.max(1, numBars) - 1) * linearGradientStaggerSec +
                        linearGradientFlowDurationSec +
                        linearFlowTailPadSec(linearGradientFlowDurationSec)
                      ).toFixed(1)}
                      s
                    </p>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Gradient Parameters</CardTitle>
                </CardHeader>
                <CardContent className={`space-y-6 ${preset3EditorLocked ? "opacity-50 grayscale pointer-events-none" : ""}`}>
                  {preset1IsReferenceMode ? (
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
                      onValueChange={([v]) => setStopSpacing(v)}
                      min={0.001}
                      max={1}
                      step={0.001}
                      disabled={preset3EditorLocked}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>{preset1IsReferenceMode ? "Number of shapes" : "Number of bars"}</Label>
                      <span className="text-xs tabular-nums text-muted-foreground">{numBars}</span>
                    </div>
                    <Slider
                      value={[numBars]}
                      onValueChange={([v]) => setNumBars(Math.max(preset1IsReferenceMode ? 4 : 1, Math.min(preset1IsReferenceMode ? 15 : 150, v)))}
                      min={preset1IsReferenceMode ? 4 : 1}
                      max={preset1IsReferenceMode ? 15 : 150}
                      step={1}
                      disabled={preset3EditorLocked}
                    />
                  </div>

                  {preset1IsReferenceMode && (
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
                        <span className="text-xs tabular-nums text-muted-foreground">{diamondStagger.toFixed(1)}</span>
                      </div>
                      <Slider
                        value={[diamondStagger]}
                        onValueChange={([v]) => setDiamondStagger(v)}
                        min={0}
                        max={50}
                        step={0.1}
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

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Positioning</CardTitle>
                </CardHeader>
                <CardContent className={`space-y-6 ${preset3EditorLocked ? "opacity-50 grayscale pointer-events-none" : ""}`}>
                  {!preset1IsReferenceMode && (
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

                  {!preset1IsReferenceMode && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Amplitude</Label>
                      <span className="text-xs tabular-nums text-muted-foreground">{amplitude.toFixed(0)}</span>
                    </div>
                    <Slider value={[amplitude]} onValueChange={([v]) => setAmplitude(v)} min={0} max={50} step={1} disabled={preset3EditorLocked} />
                  </div>
                  )}

                  {!preset1IsReferenceMode && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Phase shift</Label>
                      <span className="text-xs tabular-nums text-muted-foreground">{phaseShift.toFixed(2)}</span>
                    </div>
                    <Slider value={[phaseShift]} onValueChange={([v]) => setPhaseShift(v)} min={0} max={1} step={0.01} disabled={preset3EditorLocked} />
                  </div>
                  )}

                  {!preset1IsReferenceMode && (
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

                  {!preset1IsReferenceMode && (
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

                  {(preset1IsReferenceMode || curveType === "custom") ? (
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
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Gradient Colors</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => applyPaletteFromFile(e.target.files?.[0] ?? null)}
                  />

                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={paletteLoading}>
                      Choose file
                    </Button>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-muted-foreground">{paletteFileName || "No file selected"}</div>
                    </div>
                  </div>

                  {gradientColors.map((c, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3"
                    >
                      <div
                        className="h-6 w-6 rounded border border-border"
                        style={{ backgroundColor: c }}
                        aria-hidden="true"
                      />
                      <div className="text-sm text-muted-foreground w-14 shrink-0">
                        Stop {i + 1}
                      </div>
                      <Input
                        type="color"
                        value={c}
                        onChange={(e) => {
                          const v = e.target.value
                          setGradientColors((prev) => {
                            const next = [...prev]
                            next[i] = v
                            return next
                          })
                        }}
                        className="h-10 w-12 p-1 shrink-0"
                      />
                      <Input
                        value={c}
                        onChange={(e) => {
                          const v = e.target.value
                          setGradientColors((prev) => {
                            const next = [...prev]
                            next[i] = v
                            return next
                          })
                        }}
                        className="min-w-0 flex-1"
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Borders</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between gap-4">
                    <Label>Edge border</Label>
                    <Switch checked={rightBorderEnabled} onCheckedChange={setRightBorderEnabled} />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Thickness</Label>
                      <span className="text-xs tabular-nums text-muted-foreground">{rightBorderWidth.toFixed(1)}px</span>
                    </div>
                    <Slider
                      value={[rightBorderWidth]}
                      onValueChange={([v]) => setRightBorderWidth(v)}
                      min={0.1}
                      max={100}
                      step={0.1}
                      disabled={!rightBorderEnabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Stop spacing</Label>
                      <span className="text-xs tabular-nums text-muted-foreground">{borderStopSpacing.toFixed(2)}×</span>
                    </div>
                    <Slider
                      value={[borderStopSpacing]}
                      onValueChange={([v]) => setBorderStopSpacing(v)}
                      min={0.01}
                      max={2.0}
                      step={0.01}
                      disabled={!rightBorderEnabled}
                    />
                  </div>

                  <div className="space-y-4">
                    {rightBorderColors.map((c, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3"
                      >
                        <div
                          className="h-6 w-6 rounded border border-border"
                          style={{ backgroundColor: c }}
                          aria-hidden="true"
                        />
                        <div className="text-sm text-muted-foreground w-14 shrink-0">
                          Stop {i + 1}
                        </div>
                        <Input
                          type="color"
                          value={c}
                          onChange={(e) => {
                            const v = e.target.value
                            setRightBorderColors((prev) => {
                              const next = [...prev]
                              next[i] = v
                              return next
                            })
                          }}
                          className="h-10 w-12 p-1 shrink-0"
                          disabled={!rightBorderEnabled}
                        />
                        <Input
                          value={c}
                          onChange={(e) => {
                            const v = e.target.value
                            setRightBorderColors((prev) => {
                              const next = [...prev]
                              next[i] = v
                              return next
                            })
                          }}
                          className="min-w-0 flex-1"
                          disabled={!rightBorderEnabled}
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      <SidebarInset className="flex items-center justify-center p-6 overflow-hidden">
        <div className="w-full h-full max-w-[1000px] max-h-[1000px] overflow-hidden flex items-center justify-center">
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

              {preset1IsReferenceMode ? (
                // Stacked rotated-square (diamond) shapes from Reference-for-preset-1.svg.
                // numBars controls how many diamonds are visible.
                // positions[i] (from curveType/phaseShift/verticalOffset) offsets each diamond's Y center.
                // Two passes: fills first, then borders on top so borders aren't hidden by subsequent shapes.
                <g>
                  {Array.from({ length: numBars }, (_, i) => {
                    const half = (494 / 343) * svgWidth * 0.5
                    const halfDiag = half * Math.sqrt(2)
                    const t = numBars > 1 ? i / (numBars - 1) : 0
                    const staggerExp = 1 + (diamondStagger / 5) * (6 / Math.max(1, numBars - 1))
                    const eased = 1 - Math.pow(1 - t, staggerExp)
                    const baseCy = halfDiag - 240 + eased * svgHeight * diamondSpacing
                    const cy = baseCy + (positions[i] ?? 0)
                    const cx = svgWidth / 2
                    const r = half * diamondCornerRadius * (1 - t * 0.85)
                    const size = half * 2
                    return (
                      <rect
                        key={i}
                        x={cx - half}
                        y={cy - half}
                        width={size}
                        height={size}
                        rx={r}
                        ry={r}
                        fill={`url(#preset1-diamond-grad-${i})`}
                        stroke={rightBorderEnabled ? `url(#preset1-diamond-border-${i})` : "none"}
                        strokeWidth={rightBorderEnabled ? rightBorderWidth : 0}
                        paintOrder="stroke fill"
                        transform={`rotate(45 ${cx} ${cy})`}
                      />
                    )
                  })}
                </g>
              ) : null}

              {!preset1IsReferenceMode && <g transform={barsTransform}>
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

                      // Preset 1 & 2 animation: move the bar geometry itself with stacked tiles:
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
              {preset1IsReferenceMode
                ? Array.from({ length: numBars }, (_, i) => {
                    const half = (494 / 343) * svgWidth * 0.5
                    const halfDiag = half * Math.sqrt(2)
                    const t = numBars > 1 ? i / (numBars - 1) : 0
                    const staggerExp = 1 + (diamondStagger / 5) * (6 / Math.max(1, numBars - 1))
                    const eased = 1 - Math.pow(1 - t, staggerExp)
                    const baseCy = halfDiag - 240 + eased * svgHeight * diamondSpacing
                    const cy = baseCy + (positions[i] ?? 0)
                    const cx = svgWidth / 2
                    // Gradient size: radius so scale=1 puts stop 4 at the shape corner (halfDiag from center).
                    // Stop spacing: compresses stops 1–3 toward stop 4 (the edge).
                    const r = halfDiag * diamondGradientScale
                    const s = stopSpacing
                    const off1 = Math.max(0, 1 - s)
                    const off2 = Math.max(0, 1 - s * (2 / 3))
                    const off3 = Math.max(0, 1 - s * (1 / 3))
                    const gradCx = cx
                    const gradCy = cy
                    // Border: linear gradient using the border stop colors from the Borders card.
                    return (
                      <React.Fragment key={i}>
                        <radialGradient
                          id={`preset1-diamond-grad-${i}`}
                          cx={gradCx}
                          cy={gradCy}
                          r={r}
                          gradientUnits="userSpaceOnUse"
                        >
                          <stop offset={off1} stopColor={invertStopColors ? gradientColors[3] : gradientColors[0]} />
                          <stop offset={off2} stopColor={invertStopColors ? gradientColors[2] : gradientColors[1]} />
                          <stop offset={off3} stopColor={invertStopColors ? gradientColors[1] : gradientColors[2]} />
                          <stop offset="1" stopColor={invertStopColors ? gradientColors[0] : gradientColors[3]} />
                        </radialGradient>
                        <linearGradient
                          id={`preset1-diamond-border-${i}`}
                          x1={cx}
                          y1={0}
                          x2={cx}
                          y2={svgHeight}
                          gradientUnits="userSpaceOnUse"
                        >
                          <stop offset={clamp01(0.5 + (0    - 0.5) * borderStopSpacing)} stopColor={rightBorderColors[0]} />
                          <stop offset={clamp01(0.5 + (0.33 - 0.5) * borderStopSpacing)} stopColor={rightBorderColors[1]} />
                          <stop offset={clamp01(0.5 + (0.66 - 0.5) * borderStopSpacing)} stopColor={rightBorderColors[2]} />
                          <stop offset={clamp01(0.5 + (1    - 0.5) * borderStopSpacing)} stopColor={rightBorderColors[3]} />
                        </linearGradient>
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

