import { CPUReferenceMarcher } from '../src/core/CPUReferenceMarcher.js';

interface BenchResult {
  resolution: string;
  totalVoxelCells: number;
  extractedTriangles: number;
  elapsedMs: number;
  cellsPerSec: number;
  trianglesPerSec: number;
}

function runBenchmark(dim: number, iterations: number = 3): BenchResult {
  const densityFn = (x: number, y: number, z: number) => {
    // 3 dynamic metaballs
    const r1 = Math.sqrt((x - 0.2) ** 2 + (y - 0.2) ** 2 + z ** 2);
    const r2 = Math.sqrt((x + 0.3) ** 2 + (y - 0.1) ** 2 + (z - 0.2) ** 2);
    const r3 = Math.sqrt(x ** 2 + (y + 0.3) ** 2 + (z + 0.1) ** 2);
    return 0.15 / (r1 + 0.001) + 0.18 / (r2 + 0.001) + 0.12 / (r3 + 0.001);
  };

  const gridSize: [number, number, number] = [dim, dim, dim];
  const worldMin: [number, number, number] = [-1.0, -1.0, -1.0];
  const worldMax: [number, number, number] = [1.0, 1.0, 1.0];
  const isoLevel = 1.0;

  // Warmup
  CPUReferenceMarcher.extractMesh(densityFn, gridSize, worldMin, worldMax, isoLevel);

  const start = performance.now();
  let triangles = 0;
  for (let i = 0; i < iterations; i++) {
    const mesh = CPUReferenceMarcher.extractMesh(densityFn, gridSize, worldMin, worldMax, isoLevel);
    triangles = mesh.triangleCount;
  }
  const totalElapsed = performance.now() - start;
  const avgElapsed = totalElapsed / iterations;
  const totalCells = (dim - 1) ** 3;

  return {
    resolution: `${dim}x${dim}x${dim}`,
    totalVoxelCells: totalCells,
    extractedTriangles: triangles,
    elapsedMs: Number(avgElapsed.toFixed(2)),
    cellsPerSec: Math.round((totalCells / (avgElapsed / 1000))),
    trianglesPerSec: Math.round((triangles / (avgElapsed / 1000))),
  };
}

console.log('⚡ MARCHING CUBES ISOSURFACE EXTRACTION BENCHMARK');
console.log('========================================================================');
console.log('| Grid Res  | Voxel Cells | Triangles | Time (ms) | Cells/sec   | Tris/sec   |');
console.log('------------------------------------------------------------------------');

const resolutions = [24, 32, 48, 64];
for (const res of resolutions) {
  const bench = runBenchmark(res, 3);
  console.log(
    `| ${bench.resolution.padEnd(9)} | ${bench.totalVoxelCells.toLocaleString().padStart(11)} | ${bench.extractedTriangles.toLocaleString().padStart(9)} | ${bench.elapsedMs.toFixed(2).padStart(9)} | ${bench.cellsPerSec.toLocaleString().padStart(11)} | ${bench.trianglesPerSec.toLocaleString().padStart(10)} |`
  );
}
console.log('========================================================================');
console.log('✔ Benchmark completed successfully.');
