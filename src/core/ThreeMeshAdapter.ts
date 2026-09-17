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
}
