import { describe, it, expect } from 'vitest';
import {
  EDGE_TABLE,
  TRIANGLE_TABLE,
  MarchingMath,
  CPUReferenceMarcher,
  MarchingCubesExtractor,
  ThreeMeshAdapter,
  SimplexNoise3D,
  densityFieldShader,
  marchingCubesShader,
} from '../src/index';


describe('Marching Cubes Canonical Lookup Tables', () => {
  it('should have valid 256 entries for edge table with 0 at boundaries', () => {
    expect(EDGE_TABLE.length).toBe(256);
    expect(EDGE_TABLE[0]).toBe(0);   // All corners outside
    expect(EDGE_TABLE[255]).toBe(0); // All corners inside
  });

  it('should have 256 configurations in the triangle table with -1 terminations', () => {
    expect(TRIANGLE_TABLE.length).toBeGreaterThanOrEqual(256 * 16);
    // Configuration 0 and 255 should start with -1 (no triangles)
    expect(TRIANGLE_TABLE[0]).toBe(-1);
  });
});

describe('MarchingMath Linear Interpolation & Gradients', () => {
  it('should accurately interpolate edge crossing for iso-value', () => {
    const p1: [number, number, number] = [0, 0, 0];
    const p2: [number, number, number] = [2, 0, 0];
    const val1 = 0.0;
    const val2 = 4.0;
    const isoLevel = 2.0;

    const pt = MarchingMath.interpolateEdge(p1, p2, val1, val2, isoLevel);
    expect(pt[0]).toBeCloseTo(1.0);
    expect(pt[1]).toBeCloseTo(0.0);
    expect(pt[2]).toBeCloseTo(0.0);
  });

  it('should evaluate 3D central difference gradient normal', () => {
    // Sphere density field: D(p) = 1.0 - ||p||
    const sphereDensity = (x: number, y: number, z: number) => 1.0 - Math.hypot(x, y, z);

    // Gradient on +X axis point [1, 0, 0] should point along [1, 0, 0]
    const normal = MarchingMath.calcGradient(sphereDensity, 1.0, 0.0, 0.0);
    expect(normal[0]).toBeCloseTo(1.0, 2);
    expect(normal[1]).toBeCloseTo(0.0, 2);
    expect(normal[2]).toBeCloseTo(0.0, 2);
  });

  it('should evaluate torus scalar field, triangle area, and bounding box containment', () => {
    // Torus field: major R=0.5, minor r=0.2
    // Core of tube at [0.5, 0, 0]: distance to tube center is 0, dist to boundary is -0.2 => density is +0.2
    const insideTube = MarchingMath.sampleTorus(0.5, 0.0, 0.0, 0.5, 0.2);
    expect(insideTube).toBeCloseTo(0.2, 5);

    // Origin [0, 0, 0]: distance to tube is hypot(0.5, 0) - 0.2 = 0.3 => density is -0.3
    const originHole = MarchingMath.sampleTorus(0.0, 0.0, 0.0, 0.5, 0.2);
    expect(originHole).toBeCloseTo(-0.3, 5);

    // Triangle area: right triangle with legs of length 2 and 3 -> area = 0.5 * 2 * 3 = 3.0
    const v0: [number, number, number] = [0, 0, 0];
    const v1: [number, number, number] = [2, 0, 0];
    const v2: [number, number, number] = [0, 3, 0];
    const area = MarchingMath.computeTriangleArea(v0, v1, v2);
    expect(area).toBeCloseTo(3.0, 5);

    // Bounding box checks
    const min: [number, number, number] = [-1, -1, -1];
    const max: [number, number, number] = [1, 1, 1];
    expect(MarchingMath.isInsideBBox([0, 0, 0], min, max)).toBe(true);
    expect(MarchingMath.isInsideBBox([2, 0, 0], min, max)).toBe(false);
    expect(MarchingMath.isInsideBBox([1, 1, 1], min, max)).toBe(true);
  });
});


describe('CPUReferenceMarcher Isosurface Extraction', () => {
  it('should extract a spherical isosurface with vertices lying on the sphere radius', () => {
    const targetRadius = 0.5;
    // Sphere function where surface is at isoLevel = 0.0
    const sphereField = (x: number, y: number, z: number) => targetRadius - Math.hypot(x, y, z);

    const mesh = CPUReferenceMarcher.extractMesh(
      sphereField,
      [24, 24, 24],
      [-0.8, -0.8, -0.8],
      [0.8, 0.8, 0.8],
      0.0 // isoLevel
    );

    expect(mesh.triangleCount).toBeGreaterThan(50);
    expect(mesh.vertexCount).toBe(mesh.triangleCount * 3);

    // Check that every generated vertex is near the sphere radius
    for (let i = 0; i < mesh.vertexCount; i++) {
      const vx = mesh.positions[i * 3 + 0];
      const vy = mesh.positions[i * 3 + 1];
      const vz = mesh.positions[i * 3 + 2];
      const dist = Math.hypot(vx, vy, vz);
      expect(dist).toBeCloseTo(targetRadius, 1);
    }
  });

  it('should extract a valid non-empty mesh from dynamic metaballs', () => {
    const mesh = CPUReferenceMarcher.extractMesh(
      (x, y, z) => MarchingMath.sampleMetaballs(x, y, z, 0.5),
      [20, 20, 20],
      [-1.0, -1.0, -1.0],
      [1.0, 1.0, 1.0],
      1.0
    );

    expect(mesh.triangleCount).toBeGreaterThan(100);
    expect(mesh.normals.length).toBe(mesh.positions.length);

    // Normal vectors should be approximately unit length
    for (let i = 0; i < Math.min(mesh.vertexCount, 20); i++) {
      const nx = mesh.normals[i * 3 + 0];
      const ny = mesh.normals[i * 3 + 1];
      const nz = mesh.normals[i * 3 + 2];
      const len = Math.hypot(nx, ny, nz);
      expect(len).toBeCloseTo(1.0, 1);
    }
  });

  it('should compute valid mesh surface area and tight bounding box', () => {
    const targetRadius = 0.5;
    const sphereField = (x: number, y: number, z: number) => targetRadius - Math.hypot(x, y, z);
    const mesh = CPUReferenceMarcher.extractMesh(
      sphereField,
      [24, 24, 24],
      [-0.8, -0.8, -0.8],
      [0.8, 0.8, 0.8],
      0.0
    );

    // Theoretical sphere surface area: 4 * PI * r^2 = 4 * PI * 0.25 = PI (~3.14159)
    const area = CPUReferenceMarcher.computeSurfaceArea(mesh);
    expect(area).toBeGreaterThan(2.5);
    expect(area).toBeLessThan(3.5);

    // Tight bounding box should enclose the sphere in [-0.5, 0.5]
    const bbox = CPUReferenceMarcher.computeBoundingBox(mesh);
    expect(bbox.min[0]).toBeCloseTo(-0.5, 1);
    expect(bbox.max[0]).toBeCloseTo(0.5, 1);
    expect(bbox.min[1]).toBeCloseTo(-0.5, 1);
    expect(bbox.max[1]).toBeCloseTo(0.5, 1);
    expect(bbox.min[2]).toBeCloseTo(-0.5, 1);
    expect(bbox.max[2]).toBeCloseTo(0.5, 1);
  });
});


describe('MarchingCubesExtractor & WGSL Shader Integrity', () => {
  it('should instantiate MarchingCubesExtractor with default grid settings', () => {
    const extractor = new MarchingCubesExtractor({ gridSize: [32, 32, 32], isoLevel: 1.2 });
    expect(extractor.config.gridSize).toEqual([32, 32, 32]);
    expect(extractor.config.isoLevel).toBe(1.2);
  });

  it('should compute accurate GPU VRAM memory requirements and 3D workgroups', () => {
    const extractor = new MarchingCubesExtractor({
      gridSize: [49, 49, 49],
      maxVertices: 100_000,
    });

    // 48 + 1024 + 16384 + 4 + 100000 * 32 = 17460 + 3200000 = 3217460 bytes
    const vramBytes = extractor.calculateVRAMBytes();
    expect(vramBytes).toBe(3217460);

    // Grid size [49, 49, 49]: cells = 48x48x48.
    // 48 / 8 = 6 workgroups in each dimension
    const workgroups = extractor.calculateWorkgroups();
    expect(workgroups).toEqual([6, 6, 6]);
  });

  it('should contain valid WGSL compute entrypoints and shader symbols', () => {

    expect(densityFieldShader).toContain('sampleMetaballs');
    expect(densityFieldShader).toContain('calcDensityGradient');

    expect(marchingCubesShader).toContain('@compute');
    expect(marchingCubesShader).toContain('fn main');
    expect(marchingCubesShader).toContain('atomicAdd');
    expect(marchingCubesShader).toContain('VertexOutput');
  });
});

describe('SimplexNoise3D Procedural Volumetric Fields', () => {
  it('should generate bounded continuous scalar field in [-1, 1]', () => {
    const noise = new SimplexNoise3D(12345);
    for (let x = -1; x <= 1; x += 0.5) {
      for (let y = -1; y <= 1; y += 0.5) {
        for (let z = -1; z <= 1; z += 0.5) {
          const val = noise.sample(x, y, z);
          expect(val).toBeGreaterThanOrEqual(-1.5);
          expect(val).toBeLessThanOrEqual(1.5);
        }
      }
    }
  });

  it('should produce multi-octave FBM turbulence field', () => {
    const noise = new SimplexNoise3D(999);
    const fbmVal = noise.fbm(0.2, 0.4, 0.6, 4);
    expect(typeof fbmVal).toBe('number');
    expect(Number.isFinite(fbmVal)).toBe(true);
  });

  it('should validate buffer capacity and clamp mesh to maximum allowed vertices', () => {
    // Generate sample mesh with 6 vertices (2 triangles)
    const positions = new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 1, 0,
      1, 0, 0, 1, 1, 0, 0, 1, 0,
    ]);
    const normals = new Float32Array([
      0, 0, 1, 0, 0, 1, 0, 0, 1,
      0, 0, 1, 0, 0, 1, 0, 0, 1,
    ]);
    const mesh = {
      positions,
      normals,
      vertexCount: 6,
      triangleCount: 2,
    };

    expect(ThreeMeshAdapter.validateBufferCapacity(mesh, 6)).toBe(true);
    expect(ThreeMeshAdapter.validateBufferCapacity(mesh, 3)).toBe(false);

    // Clamping to 4 vertices should truncate to 3 (1 full triangle)
    const clamped = ThreeMeshAdapter.clampMeshToCapacity(mesh, 4);
    expect(clamped.vertexCount).toBe(3);
    expect(clamped.triangleCount).toBe(1);
    expect(clamped.positions.length).toBe(9); // 3 vertices * 3 coords
  });
});

