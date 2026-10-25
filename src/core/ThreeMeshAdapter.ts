/**
 * ThreeMeshAdapter.ts
 * Adapter for Three.js BufferGeometry rendering.
 * Wraps extracted Marching Cubes vertex and normal buffers into Three.js renderable geometries.
 */

import { MarchingMesh } from '../types';

export class ThreeMeshAdapter {
  /**
   * Constructs a Three.js-compatible BufferGeometry descriptor from an extracted MarchingMesh.
   */
  public static createGeometryDescriptor(mesh: MarchingMesh) {
    return {
      positions: mesh.positions,
      normals: mesh.normals,
      vertexCount: mesh.vertexCount,
      triangleCount: mesh.triangleCount,
      updateThreeGeometry: (threeGeometry: any) => {
        if (!threeGeometry.attributes.position) {
          // Geometry requires initial attribute allocation
          return;
        }
        const posAttr = threeGeometry.attributes.position;
        posAttr.array.set(mesh.positions);
        posAttr.needsUpdate = true;

        const normAttr = threeGeometry.attributes.normal;
        if (normAttr) {
          normAttr.array.set(mesh.normals);
          normAttr.needsUpdate = true;
        }
      },
    };
  }

  /**
   * Validates whether a target buffer has sufficient byte length to hold the extracted mesh.
   */
  public static validateBufferCapacity(mesh: MarchingMesh, capacityVertices: number): boolean {
    return mesh.vertexCount <= capacityVertices;
  }

  /**
   * Returns a sliced view of MarchingMesh clamped to the maximum allowed vertex capacity.
   */
  public static clampMeshToCapacity(mesh: MarchingMesh, maxVertices: number): MarchingMesh {
    if (mesh.vertexCount <= maxVertices) {
      return mesh;
    }
    const clampedTriangles = Math.floor(maxVertices / 3);
    const clampedVertices = clampedTriangles * 3;
    const clampedFloats = clampedVertices * 3;

    return {
      positions: mesh.positions.subarray(0, clampedFloats),
      normals: mesh.normals.subarray(0, clampedFloats),
      vertexCount: clampedVertices,
      triangleCount: clampedTriangles,
    };
  }
}

