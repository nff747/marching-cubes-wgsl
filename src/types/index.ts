/**
 * Core TypeScript definitions for the Marching Cubes WebGPU engine.
 */

export type DensityFieldMode = 'metaballs' | 'gyroid' | 'torus';

export interface GridConfig {
  gridSize?: [number, number, number]; // Default [48, 48, 48]
  worldMin?: [number, number, number]; // Default [-1.2, -1.2, -1.2]
  worldMax?: [number, number, number]; // Default [1.2, 1.2, 1.2]
  isoLevel?: number;                  // Default 1.0
  fieldMode?: DensityFieldMode;
  maxVertices?: number;
}

export interface MarchingMesh {
  positions: Float32Array; // xyz * vertexCount
  normals: Float32Array;   // xyz * vertexCount
  vertexCount: number;
  triangleCount: number;
}

export interface MarchingTelemetry {
  frameTimeMs: number;
  extractionLatencyMs: number;
  triangleCount: number;
  vertexCount: number;
  gridCells: number;
  fps: number;
}
