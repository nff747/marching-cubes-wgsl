/**
 * WGSL Real-Time Parallel Marching Cubes Isosurface Extraction Compute Shader.
 * Evaluates 3D voxel cells in parallel, interpolates intersected edge vertices,
 * and writes triangle geometry directly to VRAM vertex buffers using atomic counters.
 */

export const marchingCubesShader = /* wgsl */ `
struct VertexOutput {
  position: vec4<f32>, // xyz = pos, w = 1.0
  normal: vec4<f32>,   // xyz = normal, w = 0.0
};

@group(0) @binding(0) var<uniform> params: GridParams;
@group(0) @binding(1) var<storage, read> edgeTable: array<u32, 256>;
@group(0) @binding(2) var<storage, read> triTable: array<i32, 4096>;
@group(0) @binding(3) var<storage, read_write> atomicCounter: atomic<u32>;
@group(0) @binding(4) var<storage, read_write> outVertices: array<VertexOutput>;

// Corner offset coordinates
const cornerOffsets: array<vec3<f32>, 8> = array<vec3<f32>, 8>(
  vec3<f32>(0.0, 0.0, 0.0),
  vec3<f32>(1.0, 0.0, 0.0),
  vec3<f32>(1.0, 1.0, 0.0),
  vec3<f32>(0.0, 1.0, 0.0),
  vec3<f32>(0.0, 0.0, 1.0),
  vec3<f32>(1.0, 0.0, 1.0),
  vec3<f32>(1.0, 1.0, 1.0),
  vec3<f32>(0.0, 1.0, 1.0)
);

// Edge connection table (which two corners form each edge)
const edgeCorners1: array<u32, 12> = array<u32, 12>(0u, 1u, 2u, 3u, 4u, 5u, 6u, 7u, 0u, 1u, 2u, 3u);
const edgeCorners2: array<u32, 12> = array<u32, 12>(1u, 2u, 3u, 0u, 5u, 6u, 7u, 4u, 4u, 5u, 6u, 7u);

// Linear interpolation between two corner positions based on iso-value
fn interpVertex(p1: vec3<f32>, p2: vec3<f32>, val1: f32, val2: f32, iso: f32) -> vec3<f32> {
  if (abs(val1 - val2) < 1e-6) {
    return p1;
  }
  let mu = clamp((iso - val1) / (val2 - val1), 0.0, 1.0);
  return p1 + mu * (p2 - p1);
}

@compute @workgroup_size(8, 8, 8)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  // Boundary check: grid cells are (gridSize - 1)
  if (id.x >= params.gridSize.x - 1u || id.y >= params.gridSize.y - 1u || id.z >= params.gridSize.z - 1u) {
    return;
  }

  let cellPos = params.worldMin + vec3<f32>(id) * params.voxelSize;

  // 1. Evaluate densities at all 8 corners
  var cornerValues: array<f32, 8>;
  var cornerPositions: array<vec3<f32>, 8>;
  var cubeIndex = 0u;

  for (var i = 0u; i < 8u; i = i + 1u) {
    let cp = cellPos + cornerOffsets[i] * params.voxelSize;
    cornerPositions[i] = cp;
    let val = sampleDensity(cp, params);
    cornerValues[i] = val;
    if (val < params.isoLevel) {
      cubeIndex = cubeIndex | (1u << i);
    }
  }

  // 2. Early exit if cell is fully inside or outside the isosurface
  if (cubeIndex == 0u || cubeIndex == 255u) {
    return;
  }

  // 3. Compute edge intersection vertices
  let edges = edgeTable[cubeIndex];
  var edgeVertices: array<vec3<f32>, 12>;

  for (var e = 0u; e < 12u; e = e + 1u) {
    if ((edges & (1u << e)) != 0u) {
      let c1 = edgeCorners1[e];
      let c2 = edgeCorners2[e];
      edgeVertices[e] = interpVertex(
        cornerPositions[c1],
        cornerPositions[c2],
        cornerValues[c1],
        cornerValues[c2],
        params.isoLevel
      );
    }
  }

  // 4. Generate triangles from triangle connection table (up to 5 triangles per cell)
  let triOffset = cubeIndex * 16u;
  for (var i = 0u; i < 15u; i = i + 3u) {
    let e0 = triTable[triOffset + i];
    if (e0 < 0) {
      break;
    }
    let e1 = triTable[triOffset + i + 1u];
    let e2 = triTable[triOffset + i + 2u];

    let p0 = edgeVertices[u32(e0)];
    let p1 = edgeVertices[u32(e1)];
    let p2 = edgeVertices[u32(e2)];

    // Atomically allocate 3 vertex slots
    let baseIdx = atomicAdd(&atomicCounter, 3u);
    if (baseIdx + 3u <= params.maxVertices) {
      let eps = params.voxelSize * 0.5;
      let n0 = calcDensityGradient(p0, eps, params);
      let n1 = calcDensityGradient(p1, eps, params);
      let n2 = calcDensityGradient(p2, eps, params);

      outVertices[baseIdx + 0u].position = vec4<f32>(p0, 1.0);
      outVertices[baseIdx + 0u].normal = vec4<f32>(n0, 0.0);

      outVertices[baseIdx + 1u].position = vec4<f32>(p1, 1.0);
      outVertices[baseIdx + 1u].normal = vec4<f32>(n1, 0.0);

      outVertices[baseIdx + 2u].position = vec4<f32>(p2, 1.0);
      outVertices[baseIdx + 2u].normal = vec4<f32>(n2, 0.0);
    }
  }
}
`;
