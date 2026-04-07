// Mindmap Styles — Farben und Knoten-/Kanten-Styles
//
// Gemeinsame Style-Definitionen für Tree-Layout
// Jeder Hauptast (depth 1) bekommt eine eigene Farbe aus BRANCH_COLORS
// Kinder erben die Farbe ihres Astes über branchIndex

// --- Typen ---

export interface MindmapTreeNode {
  id: number
  label: string
  detail: string
  depth_level: number
  position_x: number
  position_y: number
  children: MindmapTreeNode[]
}

// --- Farbpalette für Äste ---

const BRANCH_COLORS = [
  { r: 0, g: 212, b: 255 },   // Cyan (Original)
  { r: 168, g: 85, b: 247 },  // Violett
  { r: 52, g: 211, b: 153 },  // Smaragd
  { r: 251, g: 146, b: 60 },  // Orange
  { r: 244, g: 114, b: 182 }, // Pink
  { r: 250, g: 204, b: 21 },  // Gelb
  { r: 56, g: 189, b: 248 },  // Himmelblau
  { r: 163, g: 230, b: 53 },  // Lime
]

function getBranchColor(branchIndex: number) {
  return BRANCH_COLORS[branchIndex % BRANCH_COLORS.length]
}

function rgba(c: { r: number; g: number; b: number }, a: number) {
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${a})`
}

// --- Tree-Layout Knoten-Style ---

export function getNodeStyle(
  depth: number,
  hasChildren: boolean,
  branchIndex: number = 0,
): React.CSSProperties {
  const color = depth === 0 ? BRANCH_COLORS[0] : getBranchColor(branchIndex)
  const opacity = Math.max(0.6, 1 - depth * 0.15)
  const glowSize = Math.max(8, 20 - depth * 4)
  const fontSize = depth === 0 ? '13px' : depth === 1 ? '11px' : '10px'

  return {
    background: rgba(color, 0.08 + depth * 0.02),
    border: `1px solid ${rgba(color, 0.3 * opacity)}`,
    borderRadius: depth === 0 ? '50%' : '12px',
    padding: depth === 0 ? '20px' : '10px 16px',
    color: rgba(color, opacity),
    fontSize,
    fontFamily: depth === 0 ? "var(--font-heading)" : "var(--font-body)",
    fontWeight: depth === 0 ? '600' : depth === 1 ? '500' : '400',
    letterSpacing: depth === 0 ? '0.08em' : '0',
    textTransform: depth === 0 ? 'uppercase' as const : 'none' as const,
    maxWidth: depth === 0 ? '160px' : '180px',
    textAlign: 'center' as const,
    cursor: hasChildren ? 'default' : 'pointer',
    boxShadow: `0 0 ${glowSize}px ${rgba(color, 0.15 * opacity)}`,
    backdropFilter: 'blur(8px)',
    transition: 'all 0.3s ease',
  }
}

// --- Tree-Kanten-Style ---

export function getEdgeStyle(
  sourceDepth: number,
  branchIndex: number = 0,
): React.CSSProperties {
  const color = sourceDepth === 0 ? BRANCH_COLORS[0] : getBranchColor(branchIndex)
  const opacity = Math.max(0.2, 0.5 - sourceDepth * 0.1)
  return {
    stroke: rgba(color, opacity),
    strokeWidth: Math.max(1, 2.5 - sourceDepth * 0.5),
    filter: `drop-shadow(0 0 4px ${rgba(color, opacity * 0.6)})`,
  }
}
