/**
 * Headless CPU Reference Marching Cubes Algorithm.
 * Validates canonical edge tables, triangle index mappings, and isosurface extraction.
 */

import { EDGE_TABLE, TRIANGLE_TABLE, CORNER_OFFSETS, EDGE_CONNECTIONS } from '../tables/marchingTables';
import { MarchingMath } from '../utils/math';
import { MarchingMesh } from '../types';

export class CPUReferenceMarcher {
  public static extractMesh(
    densityFn: (x: number, y: number, z: number) => number,
    gridSize: [number, number, number] = [32, 32, 32],
    worldMin: [number, number, number] = [-1.0, -1.0, -1.0],
    worldMax: [number, number, number] = [1.0, 1.0, 1.0],
    isoLevel: number = 1.0
  ): MarchingMesh {
    const [gx, gy, gz] = gridSize;
    const dx = (worldMax[0] - worldMin[0]) / (gx - 1);
    const dy = (worldMax[1] - worldMin[1]) / (gy - 1);
    const dz = (worldMax[2] - worldMin[2]) / (gz - 1);

    const outPositions: number[] = [];
    const outNormals: number[] = [];

    // Pre-evaluate density grid
    const gridDensities = new Float32Array(gx * gy * gz);
    for (let iz = 0; iz < gz; iz++) {
      for (let iy = 0; iy < gy; iy++) {
        for (let ix = 0; ix < gx; ix++) {
          const px = worldMin[0] + ix * dx;
          const py = worldMin[1] + iy * dy;
          const pz = worldMin[2] + iz * dz;
          const idx = iz * (gx * gy) + iy * gx + ix;
          gridDensities[idx] = densityFn(px, py, pz);
        }
      }
    }

    const getDensity = (ix: number, iy: number, iz: number) => {
      return gridDensities[iz * (gx * gy) + iy * gx + ix];
    };

    // Iterate all voxel cells
    for (let iz = 0; iz < gz - 1; iz++) {
      for (let iy = 0; iy < gy - 1; iy++) {
        for (let ix = 0; ix < gx - 1; ix++) {
          const cellX = worldMin[0] + ix * dx;
          const cellY = worldMin[1] + iy * dy;
          const cellZ = worldMin[2] + iz * dz;

          // 1. Determine cubeIndex
          let cubeIndex = 0;
          const cornerValues: number[] = [];
          const cornerPositions: [number, number, number][] = [];

          for (let i = 0; i < 8; i++) {
            const [ox, oy, oz] = CORNER_OFFSETS[i];
            const val = getDensity(ix + ox, iy + oy, iz + oz);
            cornerValues.push(val);
            cornerPositions.push([cellX + ox * dx, cellY + oy * dy, cellZ + oz * dz]);
            if (val < isoLevel) {
              cubeIndex |= (1 << i);
            }
          }

          // 2. Early exit
          if (cubeIndex === 0 || cubeIndex === 255) continue;

          // 3. Edge vertices
          const edges = EDGE_TABLE[cubeIndex];
          const edgeVertices: [number, number, number][] = new Array(12);

          for (let e = 0; e < 12; e++) {
            if ((edges & (1 << e)) !== 0) {
              const [c1, c2] = EDGE_CONNECTIONS[e];
              edgeVertices[e] = MarchingMath.interpolateEdge(
                cornerPositions[c1],
                cornerPositions[c2],
                cornerValues[c1],
                cornerValues[c2],
                isoLevel
              );
            }
          }

          // 4. Triangles
          const triOffset = cubeIndex * 16;
          for (let i = 0; i < 15; i += 3) {
            const e0 = TRIANGLE_TABLE[triOffset + i];
            if (e0 < 0) break;
            const e1 = TRIANGLE_TABLE[triOffset + i + 1];
            const e2 = TRIANGLE_TABLE[triOffset + i + 2];

            const p0 = edgeVertices[e0];
            const p1 = edgeVertices[e1];
            const p2 = edgeVertices[e2];

            const eps = Math.min(dx, Math.min(dy, dz)) * 0.5;
            const n0 = MarchingMath.calcGradient(densityFn, p0[0], p0[1], p0[2], eps);
            const n1 = MarchingMath.calcGradient(densityFn, p1[0], p1[1], p1[2], eps);
            const n2 = MarchingMath.calcGradient(densityFn, p2[0], p2[1], p2[2], eps);

            outPositions.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
            outNormals.push(n0[0], n0[1], n0[2], n1[0], n1[1], n1[2], n2[0], n2[1], n2[2]);
          }
        }
      }
    }

    const vertexCount = outPositions.length / 3;
    return {
      positions: new Float32Array(outPositions),
      normals: new Float32Array(outNormals),
      vertexCount,
      triangleCount: vertexCount / 3,
    };
  }
}
