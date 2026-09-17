/**
 * WebGPU Marching Cubes Isosurface Extraction Orchestrator.
 * Coordinates 3D voxel workgroups, storage buffers, atomic counters,
 * and zero-copy vertex output.
 */

import { GridConfig } from '../types';
import { EDGE_TABLE, TRIANGLE_TABLE } from '../tables/marchingTables';
import { densityFieldShader } from '../shaders/densityField.wgsl';
import { marchingCubesShader } from '../shaders/marchingCubes.wgsl';

export class MarchingCubesExtractor {
  private device: GPUDevice | null = null;
  public config: Required<GridConfig>;

  // WebGPU Handles
  private pipeline: GPUComputePipeline | null = null;
  private paramsUniformBuffer: GPUBuffer | null = null;
  private edgeTableBuffer: GPUBuffer | null = null;
  private triTableBuffer: GPUBuffer | null = null;
  private atomicCounterBuffer: GPUBuffer | null = null;
  private outVerticesBuffer: GPUBuffer | null = null;
  private bindGroup: GPUBindGroup | null = null;

  constructor(config: GridConfig = {}) {
    this.config = {
      gridSize: config.gridSize ?? [48, 48, 48],
      worldMin: config.worldMin ?? [-1.2, -1.2, -1.2],
      worldMax: config.worldMax ?? [1.2, 1.2, 1.2],
      isoLevel: config.isoLevel ?? 1.0,
      fieldMode: config.fieldMode ?? 'metaballs',
      maxVertices: config.maxVertices ?? 1_000_000,
    };
  }

  public async init(device: GPUDevice): Promise<void> {
    this.device = device;

    // Concatenate WGSL shader sources
    const fullShaderCode = [densityFieldShader, marchingCubesShader].join('\n');
    const shaderModule = device.createShaderModule({
      label: 'Marching Cubes Compute Module',
      code: fullShaderCode,
    });

    this.pipeline = device.createComputePipeline({
      label: 'Marching Cubes Pipeline',
      layout: 'auto',
      compute: { module: shaderModule, entryPoint: 'main' },
    });

    // 1. GridParams Uniform Buffer (48 bytes aligned)
    this.paramsUniformBuffer = device.createBuffer({
      label: 'Grid Params Uniform',
      size: 48,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // 2. Edge Table Buffer: 256 * 4 = 1024 bytes
    this.edgeTableBuffer = device.createBuffer({
      label: 'Edge Table Buffer',
      size: EDGE_TABLE.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.edgeTableBuffer, 0, EDGE_TABLE);

    // 3. Triangle Table Buffer: 4096 * 4 = 16384 bytes
    // Expand TRIANGLE_TABLE to 256 * 16 entries
    const fullTriTable = new Int32Array(4096);
    fullTriTable.set(TRIANGLE_TABLE.slice(0, 4096));
    this.triTableBuffer = device.createBuffer({
      label: 'Triangle Table Buffer',
      size: fullTriTable.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.triTableBuffer, 0, fullTriTable);

    // 4. Atomic Counter Buffer: 4 bytes
    this.atomicCounterBuffer = device.createBuffer({
      label: 'Atomic Vertex Counter',
      size: 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });

    // 5. Output Vertices Buffer (Storage + Vertex for direct draw): 32 bytes per vertex * maxVertices
    const vertexBufferSize = this.config.maxVertices * 32;
    this.outVerticesBuffer = device.createBuffer({
      label: 'Extracted Vertices Buffer',
      size: vertexBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_SRC,
    });

    // BindGroup
    this.bindGroup = device.createBindGroup({
      label: 'Marching Cubes BindGroup',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.paramsUniformBuffer } },
        { binding: 1, resource: { buffer: this.edgeTableBuffer } },
        { binding: 2, resource: { buffer: this.triTableBuffer } },
        { binding: 3, resource: { buffer: this.atomicCounterBuffer } },
        { binding: 4, resource: { buffer: this.outVerticesBuffer } },
      ],
    });
  }

  public updateUniforms(time: number = 0): void {
    if (!this.device || !this.paramsUniformBuffer) return;

    const data = new ArrayBuffer(48);
    const uView = new Uint32Array(data);
    const fView = new Float32Array(data);

    // gridSize: vec3<u32>
    uView[0] = this.config.gridSize[0];
    uView[1] = this.config.gridSize[1];
    uView[2] = this.config.gridSize[2];
    // isoLevel: f32
    fView[3] = this.config.isoLevel;

    // worldMin: vec3<f32>
    fView[4] = this.config.worldMin[0];
    fView[5] = this.config.worldMin[1];
    fView[6] = this.config.worldMin[2];
    // voxelSize: f32
    const voxelSize = (this.config.worldMax[0] - this.config.worldMin[0]) / (this.config.gridSize[0] - 1);
    fView[7] = voxelSize;

    // time, fieldMode, maxVertices, pad
    fView[8] = time;
    const modeIdx = this.config.fieldMode === 'metaballs' ? 0 : this.config.fieldMode === 'gyroid' ? 1 : 2;
    uView[9] = modeIdx;
    uView[10] = this.config.maxVertices;
    uView[11] = 0;

    this.device.queue.writeBuffer(this.paramsUniformBuffer, 0, data);

    // Reset atomic counter to 0
    const zero = new Uint32Array([0]);
    this.device.queue.writeBuffer(this.atomicCounterBuffer!, 0, zero);
  }

  public extract(time: number = 0): void {
    if (!this.device || !this.pipeline || !this.bindGroup) return;

    this.updateUniforms(time);

    const commandEncoder = this.device.createCommandEncoder({ label: 'Marching Cubes Encoder' });
    const computePass = commandEncoder.beginComputePass({ label: 'Marching Cubes Compute Pass' });

    computePass.setPipeline(this.pipeline);
    computePass.setBindGroup(0, this.bindGroup);

    // Dispatch 3D workgroups: 8x8x8 invocations per workgroup
    const wgX = Math.ceil((this.config.gridSize[0] - 1) / 8);
    const wgY = Math.ceil((this.config.gridSize[1] - 1) / 8);
    const wgZ = Math.ceil((this.config.gridSize[2] - 1) / 8);
    computePass.dispatchWorkgroups(wgX, wgY, wgZ);

    computePass.end();
    this.device.queue.submit([commandEncoder.finish()]);
  }

  public getVertexBuffer(): GPUBuffer | null {
    return this.outVerticesBuffer;
  }
}
