export type NodeType = 'frame' | 'rect' | 'ellipse' | 'line' | 'text'
export type TextAlign = 'left' | 'center' | 'right'
export type Tool = 'select' | 'rect' | 'ellipse' | 'line' | 'text'

export interface Stroke {
  color: string
  width: number
}

export interface TextData {
  content: string
  fontSize: number
  fontWeight: number
  color: string
  align: TextAlign
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

/**
 * Image adjustments. Every value is an offset from normal, so 0 always
 * means "untouched" — that is what makes the sliders centre correctly
 * and reset predictably.
 */
export interface Adjust {
  brightness: number // -100..100
  contrast: number   // -100..100
  saturation: number // -100..100
  temperature: number // -100 (cool) .. 100 (warm)
  hue: number        // -180..180
  blur: number       // 0..50 px
  grayscale: number  // 0..100
  invert: number     // 0..100
}

export type Trigger = 'view' | 'hover' | 'click' | 'loop'

/** Anything that can be keyframed. */
export type AnimProp =
  | 'x'
  | 'y'
  | 'width'
  | 'height'
  | 'rotation'
  | 'opacity'
  | 'scale'
  | 'fill'
  | 'blur'
  | 'brightness'
  | 'contrast'
  | 'saturation'
  | 'hue'
  | 'radius'

export type KeyValue = number | string

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
  stroke: Stroke | null
  cornerRadius?: number
  cornerRadii?: CornerRadii
  effects?: Effect[]
  adjust?: Adjust
  timeline?: Timeline
  flip?: boolean // line only; true draws the opposite diagonal (/ instead of \)
  text?: TextData // text only
  children?: Node[] // frame only
}

export interface Scene {
  id: string
  name: string
  width: number
  height: number
  background: string
  nodes: Node[]
}

export interface Document {
  version: number
  app: string
  id: string
  name: string
  updatedAt: string
  selectedSceneId: string
  scenes: Scene[]
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

export const ANIM_PROP_LABEL: Record<AnimProp, string> = {
  x: 'X',
  y: 'Y',
  width: 'Width',
  height: 'Height',
  rotation: 'Rotation',
  opacity: 'Opacity',
  scale: 'Scale',
  fill: 'Fill',
  blur: 'Blur',
  brightness: 'Brightness',
  contrast: 'Contrast',
  saturation: 'Saturation',
  hue: 'Hue',
  radius: 'Corner radius',
}

/** Properties offered in the "add track" menu, in a sensible order. */
export const ANIM_PROPS: AnimProp[] = [
  'x', 'y', 'width', 'height', 'rotation', 'scale', 'opacity',
  'fill', 'radius', 'blur', 'brightness', 'contrast', 'saturation', 'hue',
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
  text: 'Text',
}
