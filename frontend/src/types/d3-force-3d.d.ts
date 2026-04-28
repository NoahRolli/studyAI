// d3-force-3d Type-Shim — minimal, nur was wir verwenden
// Vollständige Types existieren nicht im DefinitelyTyped-Repo (Stand 2026-04)
// Bei Bedarf erweitern

declare module 'd3-force-3d' {
  export interface SimulationNode {
    x?: number
    y?: number
    z?: number
    vx?: number
    vy?: number
    vz?: number
    fx?: number | null
    fy?: number | null
    fz?: number | null
    index?: number
    [key: string]: any
  }

  export interface SimulationLink {
    source: number | SimulationNode
    target: number | SimulationNode
    [key: string]: any
  }

  export interface Simulation<N extends SimulationNode = SimulationNode> {
    nodes(nodes?: N[]): this
    alpha(alpha?: number): this | number
    alphaMin(min?: number): this | number
    alphaDecay(decay?: number): this | number
    alphaTarget(target?: number): this | number
    velocityDecay(decay?: number): this | number
    numDimensions(n?: number): this | number
    force(name: string, force?: any): this | any
    tick(iterations?: number): this
    stop(): this
    restart(): this
    on(event: string, listener?: (...args: any[]) => void): this
  }

  export function forceSimulation<N extends SimulationNode = SimulationNode>(
    nodes?: N[],
    numDimensions?: number,
  ): Simulation<N>

  export function forceLink<L extends SimulationLink = SimulationLink>(
    links?: L[],
  ): {
    id(accessor: (n: any) => any): any
    distance(d: number | ((l: L) => number)): any
    strength(s: number | ((l: L) => number)): any
    links(links?: L[]): any
    [key: string]: any
  }

  export function forceManyBody(): {
    strength(s: number | ((n: any) => number)): any
    distanceMin(d: number): any
    distanceMax(d: number): any
    theta(t: number): any
    [key: string]: any
  }

  export function forceCenter(x?: number, y?: number, z?: number): any

  export function forceRadial(
    radius: number | ((n: any) => number),
    x?: number,
    y?: number,
    z?: number,
  ): {
    strength(s: number | ((n: any) => number)): any
    [key: string]: any
  }

  export function forceX(x?: number | ((n: any) => number)): any
  export function forceY(y?: number | ((n: any) => number)): any
  export function forceZ(z?: number | ((n: any) => number)): any
  export function forceCollide(radius?: number | ((n: any) => number)): any
}
