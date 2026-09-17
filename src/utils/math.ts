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
}
