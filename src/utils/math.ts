/**
 * Zero-allocation math utilities for Marching Cubes edge interpolation,
 * scalar density evaluation, and normal gradient calculation.
 */

export class MarchingMath {
  /**
   * Linearly interpolates vertex position along an edge where the isosurface cuts through.
   */
  public static interpolateEdge(
    p1: [number, number, number],
    p2: [number, number, number],
    val1: number,
    val2: number,
    isoLevel: number
  ): [number, number, number] {
    if (Math.abs(val1 - val2) < 1e-7) {
      return [p1[0], p1[1], p1[2]];
    }
    const mu = Math.max(0.0, Math.min(1.0, (isoLevel - val1) / (val2 - val1)));
    return [
      p1[0] + mu * (p2[0] - p1[0]),
      p1[1] + mu * (p2[1] - p1[1]),
      p1[2] + mu * (p2[2] - p1[2]),
    ];
  }

  /**
   * Evaluates 3-orb dynamic metaball field at point (x, y, z).
   */
  public static sampleMetaballs(x: number, y: number, z: number, time: number = 0): number {
    let density = 0.0;
    // Orb 1
    const c1x = Math.sin(time * 1.5) * 0.4;
    const c1y = Math.cos(time * 1.2) * 0.3;
    const c1z = Math.sin(time * 0.8) * 0.4;
    const d1sq = (x - c1x) ** 2 + (y - c1y) ** 2 + (z - c1z) ** 2;
    density += 0.16 / (d1sq + 0.001);

    // Orb 2
    const c2x = Math.cos(time * 1.1) * 0.5;
    const c2y = Math.sin(time * 2.0) * 0.3;
    const c2z = Math.cos(time * 0.9) * 0.3;
    const d2sq = (x - c2x) ** 2 + (y - c2y) ** 2 + (z - c2z) ** 2;
    density += 0.14 / (d2sq + 0.001);

    // Orb 3
    const c3x = Math.sin(time * 0.9 + 2.0) * 0.35;
    const c3y = -0.2;
    const c3z = Math.cos(time * 1.4) * 0.45;
    const d3sq = (x - c3x) ** 2 + (y - c3y) ** 2 + (z - c3z) ** 2;
    density += 0.12 / (d3sq + 0.001);

    return density;
  }

  /**
   * Evaluates TPMS Gyroid surface density at point (x, y, z).
   */
  public static sampleGyroid(x: number, y: number, z: number, scale: number = 4.5): number {
    const sx = x * scale;
    const sy = y * scale;
    const sz = z * scale;
    return Math.sin(sx) * Math.cos(sy) + Math.sin(sy) * Math.cos(sz) + Math.sin(sz) * Math.cos(sx);
  }

  /**
   * Computes central difference gradient vector for smooth normal calculation.
   */
  public static calcGradient(
    densityFn: (x: number, y: number, z: number) => number,
    x: number,
    y: number,
    z: number,
    eps: number = 0.01
  ): [number, number, number] {
    const dx = densityFn(x + eps, y, z) - densityFn(x - eps, y, z);
    const dy = densityFn(x, y + eps, z) - densityFn(x, y - eps, z);
    const dz = densityFn(x, y, z + eps) - densityFn(x, y, z - eps);

    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-7) return [0, 1, 0];
    return [-dx / len, -dy / len, -dz / len];
  }

  /**
   * Evaluates signed distance / density for a 3D torus centered at origin.
   * R is major radius (distance from center of tube to center of torus),
   * r is minor radius (radius of the tube).
   */
  public static sampleTorus(
    x: number,
    y: number,
    z: number,
    majorRadius: number = 0.5,
    minorRadius: number = 0.2
  ): number {
    const qx = Math.hypot(x, z) - majorRadius;
    const dist = Math.hypot(qx, y) - minorRadius;
    return -dist; // Positive inside, negative outside
  }

  /**
   * Computes the 3D surface area of a triangle formed by three vertices [v0, v1, v2].
   * Uses half the cross product magnitude: 0.5 * ||(v1 - v0) x (v2 - v0)||.
   */
  public static computeTriangleArea(
    v0: [number, number, number],
    v1: [number, number, number],
    v2: [number, number, number]
  ): number {
    const e1x = v1[0] - v0[0];
    const e1y = v1[1] - v0[1];
    const e1z = v1[2] - v0[2];

    const e2x = v2[0] - v0[0];
    const e2y = v2[1] - v0[1];
    const e2z = v2[2] - v0[2];

    const cx = e1y * e2z - e1z * e2y;
    const cy = e1z * e2x - e1x * e2z;
    const cz = e1x * e2y - e1y * e2x;

    return 0.5 * Math.hypot(cx, cy, cz);
  }

  /**
   * Checks whether a point (x, y, z) lies within an axis-aligned bounding box [min, max].
   */
  public static isInsideBBox(
    point: [number, number, number],
    min: [number, number, number],
    max: [number, number, number]
  ): boolean {
    return (
      point[0] >= min[0] && point[0] <= max[0] &&
      point[1] >= min[1] && point[1] <= max[1] &&
      point[2] >= min[2] && point[2] <= max[2]
    );
  }
}

