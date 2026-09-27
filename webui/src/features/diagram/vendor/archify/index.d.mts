// Hand-written types for the vendored Archify entry point (index.mjs).
// Inputs are typed loosely on purpose: dim0 validates specs with zod
// (features/diagram/schema.ts) before calling into these renderers.

export type ArchifyDocument = Record<string, unknown>

export interface ArchifyGrid {
  mode: "grid"
  origin: [number, number]
  cols: number
  gapX: number
  gapY: number
  cellW: number
  cellH: number
}

export interface ArchifyDiagnostic {
  code: string
  severity: "error" | "warning"
  message: string
}

export interface ArchifyWorkflowResult {
  ok: boolean
  svg?: string
  error?: string
  diagnostics?: ArchifyDiagnostic[]
}

export declare const DEFAULT_GRID: ArchifyGrid

export declare function renderArchitecture(arch: ArchifyDocument): string

export declare function gridLayout(arch: { layout?: Partial<ArchifyGrid> }): ArchifyGrid | null

export declare function resolveComponentPos(
  component: { pos?: [number, number]; row?: number; col?: number },
  grid: ArchifyGrid | null,
): [number, number]

export declare function renderSequence(sequence: ArchifyDocument): string

export declare function compileWorkflow(input: { workflow: ArchifyDocument; qualityProfile?: string }): ArchifyWorkflowResult

export declare function textUnits(text: string): number

export declare function availableNodeTextWidth(width: number): number

export declare function minimumNodeTextWidth(text: string, minimum: number): number
