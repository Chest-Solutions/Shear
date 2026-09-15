export type NodeType = 'frame' | 'rect' | 'ellipse' | 'line' | 'poly' | 'text' | 'icon'
export type TextAlign = 'left' | 'center' | 'right'
export type Tool = 'select' | 'hand' | 'rect' | 'ellipse' | 'line' | 'text' | 'icon'
/** Lunacy shape variants offered by the cycle-shortcut tools (R / L / O). */
export type RectVariant = 'rect' | 'rounded'
export type LineVariant = 'line' | 'arrow'
export type OvalVariant = 'ellipse' | 'triangle' | 'polygon' | 'star'

export interface Stroke {
  color: string
  width: number
}

export interface GradientStop {
  pos: number // 0..1
  color: string
}

/** Linear gradient fill. Angle in degrees, 0 = left→right, 90 = top→bottom. */
export interface GradientFill {
  angle: number
  stops: GradientStop[]
}

export interface TextData {
  content: string
  fontSize: number
  fontWeight: number
  color: string
  align: TextAlign
}


/** An icon from the built-in library (Lucide / Heroicons). */
export interface IconData {
  /** standalone `<svg>` markup using currentColor */
  svg: string
  /** tint applied in place of currentColor */
  color: string
}

export interface CornerRadii {
  tl: number
  tr: number
  br: number
  bl: number
  linked: boolean
}

export interface ShadowEffect {
  id: string
  type: 'drop-shadow' | 'inner-shadow'
  visible: boolean
  color: string
  x: number
  y: number
  blur: number
  spread: number
}

export interface BlurEffect {
  id: string
  type: 'layer-blur' | 'background-blur'
  visible: boolean
  blur: number
}

export type Effect = ShadowEffect | BlurEffect

export type Trigger = 'view' | 'hover' | 'click' | 'loop'

/** Anything that can be keyframed. */
export type AnimProp =
  | 'position'
  | 'scale'
  | 'rotation'
  | 'opacity'
  | 'fill'
  | 'blur'
  | 'shadow'
  // legacy tracks from older documents
  | 'x'
  | 'y'
  | 'width'
  | 'height'
  | 'brightness'
  | 'contrast'
  | 'saturation'
  | 'hue'
  | 'radius'

export type KeyValue = number | string | number[]

/**
 * Legacy image adjustments. The editing UI for these CSS filters was
 * removed — old documents may still carry the data, and it keeps
 * playing/exporting.
 */
export interface Adjust {
  brightness: number
  contrast: number
  saturation: number
  temperature: number
  hue: number
  blur: number
  grayscale: number
  invert: number
}

/** One keyframe: a value at a time, plus the curve leading out of it. */
export interface Keyframe {
  id: string
  time: number // seconds
  value: KeyValue
  easing: [number, number, number, number]
}

/** All the keyframes for a single property. */
export interface Track {
  id: string
  property: AnimProp
  keys: Keyframe[]
  /** stopwatch on — edits to this property write keyframes (After Effects style) */
  armed?: boolean
}

/** A node's animation: tracks on a shared clock, started by a trigger. */
export interface Timeline {
  duration: number
  trigger: Trigger
  loop: boolean
  tracks: Track[]
}

export interface Node {
  id: string
  name: string
  type: NodeType
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
  visible: boolean
  locked: boolean
  fill: string | null
  /** linear gradient that overrides the solid fill (also tints text) */
  gradient?: GradientFill | null
  /** ids of the color variable each color tracks (Figma-style variables) */
  fillVar?: string
  strokeVar?: string
  textVar?: string
  stroke: Stroke | null
  cornerRadius?: number
  cornerRadii?: CornerRadii
  effects?: Effect[]
  /** legacy CSS-filter adjustments (no longer editable, still honoured) */
  adjust?: Adjust
  timeline?: Timeline
  flip?: boolean // line only; true draws the opposite diagonal (/ instead of \)
  arrow?: boolean // line only; draws an arrow head at the end point
  poly?: { kind: 'triangle' | 'polygon' | 'star'; sides?: number } // poly only
  text?: TextData // text only
  icon?: IconData // icon only
  children?: Node[] // frame only
}

export interface Scene {
  id: string
  name: string
  width: number
  height: number
  background: string
  backgroundVar?: string
  nodes: Node[]
}

/** A named, reusable color on the document. */
export interface ColorVariable {
  id: string
  name: string
  color: string
}

export interface Document {
  version: number
  app: string
  id: string
  name: string
  updatedAt: string
  createdAt?: string
  selectedSceneId: string
  scenes: Scene[]
  variables?: ColorVariable[]
}

export interface Peer {
  id: string
  name: string
  color: string
  x: number
  y: number
  sceneId: string
  selection: string
  active: boolean
}

export const ANIM_PROP_LABEL: Record<string, string> = {
  position: 'Position',
  scale: 'Scale',
  rotation: 'Rotation',
  opacity: 'Opacity',
  fill: 'Fill',
  blur: 'Blur',
  shadow: 'Shadow',
  x: 'X',
  y: 'Y',
  width: 'Width',
  height: 'Height',
  brightness: 'Brightness',
  contrast: 'Contrast',
  saturation: 'Saturation',
  hue: 'Hue',
  radius: 'Corner radius',
}

/** Properties offered in the timeline's add-track menu. */
export const ANIM_PROPS: AnimProp[] = [
  'position', 'scale', 'rotation', 'opacity', 'fill', 'blur', 'shadow',
]

export const TRIGGER_LABEL: Record<Trigger, string> = {
  view: 'On view',
  hover: 'On hover',
  click: 'On click',
  loop: 'Loop',
}

export const NODE_TYPE_LABEL: Record<NodeType, string> = {
  frame: 'Frame',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  line: 'Line',
  poly: 'Shape',
  text: 'Text',
  icon: 'Icon',
}

/** Export formats offered by the right-panel Export tab. */
export type SceneFormat = 'png' | 'svg' | 'html' | 'react' | 'shear'
