import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

afterEach(cleanup)
import type { Node, Scene } from '../types'
import { ColorField } from '../components/ColorField'
import { RightPanel } from '../components/RightPanel'
import { TimelineBar } from '../components/TimelineBar'
import { syncKeyframes } from '../anim'
import { sceneToReact } from '../exporters'

const scene: Scene = { id: 's1', name: 'Scene 1', width: 800, height: 600, background: '#333333', nodes: [] }

function rect(partial: Partial<Node> = {}): Node {
  return {
    id: 'n1', name: 'Rectangle', type: 'rect', x: 10, y: 10, width: 100, height: 60,
    rotation: 0, opacity: 1, visible: true, locked: false, fill: null, stroke: null,
    ...partial,
  }
}

describe('ColorField', () => {
  it('opens the custom picker on swatch click (portalled to body)', () => {
    render(<ColorField value="#D3D3D3" variables={[]} onChange={() => {}} onCreateVariable={() => {}} />)
    const swatch = screen.getByTitle('#D3D3D3')
    fireEvent.click(swatch)
    expect(screen.getByText('Hex')).toBeTruthy()
    expect(screen.getByText('Create Color Variable')).toBeTruthy()
  })
})

describe('RightPanel', () => {
  const base = (node: Node | null) => ({
    tab: 'design' as const,
    onTab: () => {},
    node,
    multiCount: node ? 1 : 0,
    scene,
    variables: [],
    onCreateVariable: () => {},
    onVariables: () => {},
    variableUsage: () => 0,
    onUpdateNode: vi.fn(),
    onUpdateText: vi.fn(),
    onUpdateScene: vi.fn(),
    onFlipH: () => {},
    onFlipV: () => {},
    onAlign: () => {},
    onDistribute: () => {},
    lockAspect: false,
    onLockAspect: () => {},
    onExportScene: () => {},
    onExportShear: () => {},
    onExportProject: () => {},
  })

  it('FILLS + adds a Lunacy-default fill', () => {
    const props = base(rect())
    render(<RightPanel {...props} />)
    fireEvent.click(screen.getByTitle('Add fill'))
    expect(props.onUpdateNode).toHaveBeenCalledWith('n1', expect.objectContaining({ fill: '#D3D3D3' }))
  })

  it('BORDERS + adds a border', () => {
    const props = base(rect())
    render(<RightPanel {...props} />)
    fireEvent.click(screen.getByTitle('Add border'))
    expect(props.onUpdateNode).toHaveBeenCalledWith('n1', expect.objectContaining({ stroke: { color: '#ffffff', width: 1 } }))
  })

  it('fill swatch opens the picker and edits call back', () => {
    const props = base(rect({ fill: '#D3D3D3' }))
    render(<RightPanel {...props} />)
    fireEvent.click(screen.getByTitle('#D3D3D3'))
    const hex = screen.getByDisplayValue('#D3D3D3')
    fireEvent.change(hex, { target: { value: '#ff0000' } })
    expect(props.onUpdateNode).toHaveBeenCalled()
  })
})

describe('TimelineBar', () => {
  const setup = (node: Node | null) => {
    const onTimeline = vi.fn()
    render(
      <TimelineBar left={0} right={0} node={node} time={0} playing={false} onTime={() => {}} onPlaying={() => {}} onTimeline={onTimeline} onClose={() => {}} />,
    )
    return onTimeline
  }

  it('lists every property with a stopwatch', () => {
    setup(rect())
    expect(screen.getByText('Position')).toBeTruthy()
    expect(screen.getByText('Scale')).toBeTruthy()
    expect(screen.getByText('Shadow')).toBeTruthy()
    expect(screen.getAllByTitle(/Arm .* stopwatch/).length).toBe(7)
  })

  it('clicking a stopwatch creates an armed track', () => {
    const onTimeline = setup(rect())
    fireEvent.click(screen.getByTitle('Arm Scale stopwatch'))
    expect(onTimeline).toHaveBeenCalled()
    const tl = onTimeline.mock.calls[0][1]
    expect(tl.tracks[0].property).toBe('scale')
    expect(tl.tracks[0].armed).toBe(true)
  })
})

describe('animation model', () => {
  it('armed scale records the key and holds the base value', () => {
    const before = rect({ timeline: { duration: 2, trigger: 'view', loop: false, tracks: [{ id: 't', property: 'scale', armed: true, keys: [{ id: 'k', time: 0, value: 1, easing: [0, 0, 1, 1] }] }] } })
    const after = { ...before, width: 200 }
    const out = syncKeyframes(before, after, 1)
    expect(out.width).toBe(100) // base holds
    const track = out.timeline!.tracks[0]
    expect(track.keys.some((k) => k.time === 1 && k.value === 2)).toBe(true)
  })

  it('unarmed tracks do not record', () => {
    const before = rect({ timeline: { duration: 2, trigger: 'view', loop: false, tracks: [{ id: 't', property: 'scale', armed: false, keys: [] }] } })
    const out = syncKeyframes(before, { ...before, width: 200 }, 1)
    expect(out.width).toBe(200)
    expect(out.timeline!.tracks[0].keys.length).toBe(0)
  })
})

describe('react export', () => {
  it('emits framer-motion when animated', () => {
    const doc: Scene = {
      ...scene,
      nodes: [rect({ timeline: { duration: 1, trigger: 'view', loop: false, tracks: [{ id: 't', property: 'position', armed: true, keys: [{ id: 'a', time: 0, value: [0, 0], easing: [0, 0, 1, 1] }, { id: 'b', time: 1, value: [50, 0], easing: [0, 0, 1, 1] }] }] } })],
    }
    const code = sceneToReact(doc)
    expect(code).toContain("from 'framer-motion'")
    expect(code).toContain('motion.div')
  })
})
