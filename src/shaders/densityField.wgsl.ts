/**
 * WGSL 3D Scalar Density Field Evaluator.
 * Computes dynamic procedural scalar fields (metaballs, gyroid lattice, tori)
 * and central-difference gradient vectors.
 */

export const densityFieldShader = /* wgsl */ `
struct GridParams {
  gridSize: vec3<u32>,
  isoLevel: f32,
  worldMin: vec3<f32>,
  voxelSize: f32,
  time: f32,
  fieldMode: u32, // 0 = metaballs, 1 = gyroid, 2 = torus
  maxVertices: u32,
  pad: u32,
};

// 1. Dynamic Morphing Metaballs
fn sampleMetaballs(p: vec3<f32>, time: f32) -> f32 {
  var density = 0.0;
  
  // Orb 1: central orbit
  let c1 = vec3<f32>(sin(time * 1.5) * 0.4, cos(time * 1.2) * 0.3, sin(time * 0.8) * 0.4);
  let d1 = length(p - c1);
  density = density + (0.16 / (d1 * d1 + 0.001));

  // Orb 2: vertical figure-8
  let c2 = vec3<f32>(cos(time * 1.1) * 0.5, sin(time * 2.0) * 0.3, cos(time * 0.9) * 0.3);
  let d2 = length(p - c2);
  density = density + (0.14 / (d2 * d2 + 0.001));

  // Orb 3: pulsating satellite
  let c3 = vec3<f32>(sin(time * 0.9 + 2.0) * 0.35, -0.2, cos(time * 1.4) * 0.45);
  let d3 = length(p - c3);
  density = density + (0.12 / (d3 * d3 + 0.001));

  return density;
}

// 2. TPMS Gyroid Lattice
fn sampleGyroid(p: vec3<f32>, scale: f32) -> f32 {
  let sp = p * scale;
  let g = sin(sp.x) * cos(sp.y) + sin(sp.y) * cos(sp.z) + sin(sp.z) * cos(sp.x);
  return g;
}

// 3. 3D Torus
fn sampleTorus(p: vec3<f32>, rMajor: f32, rMinor: f32) -> f32 {
  let q = vec2<f32>(length(p.xz) - rMajor, p.y);
  return rMinor - length(q);
}

// Main density sampler dispatch
fn sampleDensity(p: vec3<f32>, params: GridParams) -> f32 {
  if (params.fieldMode == 0u) {
    return sampleMetaballs(p, params.time);
  } else if (params.fieldMode == 1u) {
    return sampleGyroid(p, 4.5);
  } else {
    return sampleTorus(p, 0.55, 0.22);
  }
}

// Computes 3D gradient vector via central differences for smooth vertex normal
fn calcDensityGradient(p: vec3<f32>, eps: f32, params: GridParams) -> vec3<f32> {
  let dx = sampleDensity(p + vec3<f32>(eps, 0.0, 0.0), params) - sampleDensity(p - vec3<f32>(eps, 0.0, 0.0), params);
  let dy = sampleDensity(p + vec3<f32>(0.0, eps, 0.0), params) - sampleDensity(p - vec3<f32>(0.0, eps, 0.0), params);
  let dz = sampleDensity(p + vec3<f32>(0.0, 0.0, eps), params) - sampleDensity(p - vec3<f32>(0.0, 0.0, eps), params);
  
  let grad = vec3<f32>(dx, dy, dz);
  let len = length(grad);
  if (len > 1e-6) {
    return normalize(-grad); // Negative gradient points outward from isosurface
  }
  return vec3<f32>(0.0, 1.0, 0.0);
}
`;
