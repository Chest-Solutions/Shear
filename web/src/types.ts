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

export interface CssFilters {
  invert: number
  grayscale: number
  sepia: number
  blur: number
  brightness: number
  contrast: number
  saturate: number
  hueRotate: number
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
  filters?: CssFilters
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

export const NODE_TYPE_LABEL: Record<NodeType, string> = {
  frame: 'Frame',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  line: 'Line',
  text: 'Text',
}
