
class Arcade {
    constructor(offset, width, height, textureArray, solidArray, luminosityArray, structureIdArray) {       
        // User defined
        this.worldName = "default-world-name";
        this.offset = offset;
        this.width = width;
        this.height = height;
        this.textureArray = textureArray;
        this.solidArray = solidArray;
        this.luminosityArray = luminosityArray;
        this.structureIdArray = structureIdArray;

        // Preset values
        this.maxLight = 16;
        this.sunLuminosity = 4;
        this.sunSelfLuminosity = 4;
        this.sunAxis = "z";
        this.sunDirection = -1;
        this.attenuation = 2;
        this.fogScale = 200;
        this.chunkSize = 4; //root of actual size
        this.diagnostics = false;
        this.direction = {x: 1, y: 1, z: 1}
        this.renderDistance = 7;
        this.worldHeight = 64;
        this.minLight = 3
        this.taskPerSecond = 5;
        this.voxelsPlacedPerSecond = 10;
        this.CameraSpeed = 4;
        this.chunksPerTask = 1;

        // WebGPU
        this.adapter = null;
        this.device = null;
        this.context = null;
        this.format = null;
        this.maxSprites = 0;
        this.spriteCount = 0;
        this.spriteData = null;

        // Calculated
        this.voxelPlaceTime = 1 / this.voxelsPlacedPerSecond;
        this.taskTime = (1 / this.taskPerSecond)

        // Data storage
        this.spriteCount = 0;
        this.dt = 0;
        this.dtVoxelPlaced = 0;
        this.voxelsMap = new Map();
        this.lightMap = new Map();
        this.lightSourceMap = new Map();
        this.chunkLoadState = new Map(); //0: unloaded, 1: begun loading, 2: loaded, 3: begun lighting, 4: lit, 5: changed
        this.camera = {x: 0, y: 0};
        this.cameraDestination = {x: 0, y: 0};
        this.voxelsArray = [];
        this.enqueuedVoxel= [];
        this.isSaving = false;
        this.structures = new Map();
    }

    async init(initialCapacity = 10000) {
        this.canvas = document.getElementById("isoarcade");
        if (!this.canvas) throw new Error('Canvas not found');

        this.canvas.width = this.canvas.clientWidth;
        this.canvas.height = this.canvas.clientHeight;

        this.canvas.style.imageRendering = 'pixelated';

        if (!navigator.gpu) throw Error("WebGPU not supported.");
        
        this.adapter = await navigator.gpu.requestAdapter();
        if (!this.adapter) throw Error("Couldn't request WebGPU adapter.");
        
        this.device = await this.adapter.requestDevice();
        this.context = this.canvas.getContext('webgpu');
        this.format = navigator.gpu.getPreferredCanvasFormat();
        this.context.configure({
            device: this.device,
            format: this.format,
            alphaMode: 'premultiplied'
        });

        const quadVertices = new Float32Array([
            -0.5, -0.5,    0.0, 0.0,
             0.5, -0.5,    1.0, 0.0,
             0.5,  0.5,    1.0, 1.0,
            -0.5,  0.5,    0.0, 1.0
        ]);

        const quadIndices = new Uint16Array([0, 1, 2, 0, 2, 3]);

        this.vertexBuffer = this.device.createBuffer({
            size: quadVertices.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true
        });
        new Float32Array(this.vertexBuffer.getMappedRange()).set(quadVertices);
        this.vertexBuffer.unmap();

        this.indexBuffer = this.device.createBuffer({
            size: quadIndices.byteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true
        });
        new Uint16Array(this.indexBuffer.getMappedRange()).set(quadIndices);
        this.indexBuffer.unmap();

        this.uniformBuffer = this.device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this.setCapacity(initialCapacity);

        const shaderResponse = await fetch('https://cdn.jsdelivr.net/gh/maher14879/IsoArcade@main/shaders/vertex.wgsl');
        const shaderCode = await shaderResponse.text();

        const fragmentResponse = await fetch('https://cdn.jsdelivr.net/gh/maher14879/IsoArcade@main/shaders/fragment.wgsl');
        const fragmentCode = await fragmentResponse.text();

        this.pipeline = this.device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: this.device.createShaderModule({
                    code: shaderCode
                }),
                entryPoint: 'main',
                buffers: [
                    {
                        arrayStride: 4 * 4,
                        attributes: [
                            { format: 'float32x2', offset: 0, shaderLocation: 0 },
                            { format: 'float32x2', offset: 8, shaderLocation: 1 }
                        ]
                    },
                    {
                        arrayStride: 8 * 4,
                        stepMode: 'instance',
                        attributes: [
                            { format: 'float32x2', offset: 0,  shaderLocation: 2 },
                            { format: 'float32x2', offset: 8,  shaderLocation: 3 },
                            { format: 'float32x2', offset: 16, shaderLocation: 4 },
                            { format: 'float32',   offset: 24, shaderLocation: 5 },
                            { format: 'float32',   offset: 28, shaderLocation: 6 }
                        ]
                    }
                ]
            },
            fragment: {
                module: this.device.createShaderModule({
                    code: fragmentCode
                }),
                entryPoint: 'main',
                targets: [{
                    format: this.format,
                    blend: {
                        color: {
                            srcFactor: 'src-alpha',
                            dstFactor: 'one-minus-src-alpha',
                            operation: 'add'
                        },
                        alpha: {
                            srcFactor: 'one',
                            dstFactor: 'one-minus-src-alpha',
                            operation: 'add'
                        }
                    },
                    writeMask: GPUColorWrite.ALL
                }]
            },
            primitive: {
                topology: 'triangle-list',
                indexFormat: 'uint16'
            }
        });

        // Create sampler
        this.sampler = this.device.createSampler({
            magFilter: 'nearest',
            minFilter: 'nearest'
        });

        const promises = [];
        for (const id of this.structureIdArray) {promises.push(this.loadStructure(id))};
        await Promise.all(promises)
    }

    async loadStructure(id) {
        const filePath = `https://cdn.jsdelivr.net/gh/maher14879/IsoArcade@main/structures/${id}.bin`;
        const response = await fetch(filePath);
        const buffer = await response.arrayBuffer();
        const view = new DataView(buffer);
        this.structures.set(id, view);
    }

    placeStructure(id, x, y, z) {
        const view = this.structures.get(id)
        for (let i = 0; i < view.byteLength; i += 16) {
            const dx = view.getInt32(i);
            const dy = view.getInt32(i + 4);
            const dz = view.getInt32(i + 8);
            const voxel = view.getInt32(i + 12);
            this.setVoxel(x + dx - 16, y + dy - 16, z + dz, voxel);
            console.log(dx, dy, dz)
        }
    }

    async loadChunk(cx, cy) {
        const cache = await caches.open(this.worldName);
        const response = await cache.match(`${cx},${cy}.bin`);
        if (!response) {return false};
        const buffer = await response.arrayBuffer();
        const view = new DataView(buffer);

        for (let i = 0; i < view.byteLength; i += 16) {
            const x = view.getInt32(i);
            const y = view.getInt32(i + 4);
            const z = view.getInt32(i + 8);
            const voxel = view.getInt32(i + 12);
            this.setVoxel(x, y, z, voxel);
        }
        return true;
    }

    async saveChunk(cx, cy) {
        const voxels = [];
        const chunk = this.getChunk(cx, cy);
        if (!chunk) return;

        for (const [x, xMap] of chunk.entries()) {
            for (const [y, yMap] of xMap.entries()) {
                for (const [z, voxel] of yMap.entries()) {
                    voxels.push(x, y, z, voxel);
                }
            }
        }

        const buffer = new ArrayBuffer(voxels.length * 4);
        const view = new DataView(buffer);
        voxels.forEach((v, i) => view.setInt32(i * 4, v));

        await caches.open(this.worldName).then(cache => {
            const response = new Response(buffer, { headers: { "Content-Type": "application/octet-stream" } });
            return cache.put(new Request(`${cx},${cy}.bin`), response);
        });
    }

    async saveChunks() {
        this.isSaving = true;
        const promises = [];
        for (const [cx, cxMap] of this.voxelsMap.entries()) {
            for (const [cy] of cxMap.entries()) {
                if (this.getChunkLoadState(cx, cy) < 5) {continue};
                promises.push(this.saveChunk(cx, cy));
                this.SetChunkLoadState(cx, cy, 4);
            }
        }
        await Promise.all(promises)
        this.isSaving = false;
    }

    async exportChunks() {
        const dirHandle = await window.showDirectoryPicker();
        const size = this.chunkSize**2
        const halfSize = size / 2

        for (const [cx, cxMap] of Array.from(this.voxelsMap.entries()).reverse()) {
            for (const [cy] of Array.from(cxMap.entries()).reverse()) {
                const voxels = [];
                const chunk = this.getChunk(cx, cy);
                if (!chunk) continue;

                for (const [x, xMap] of chunk.entries()) {
                    for (const [y, yMap] of xMap.entries()) {
                        for (const [z, voxel] of yMap.entries()) {
                            voxels.push(x - size * cx - halfSize, y - size * cy - halfSize, z, voxel);
                        }
                    }
                }

                const buffer = new ArrayBuffer(voxels.length * 4);
                const view = new DataView(buffer);
                voxels.forEach((v, i) => view.setInt32(i * 4, v));

                const fileHandle = await dirHandle.getFileHandle(`${cx},${cy}.bin`, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(buffer);
                await writable.close();
            }
        }
    }

    setCapacity(newCapacity) {
        if (newCapacity <= this.maxSprites) return;

        this.maxSprites = newCapacity;
        this.spriteData = new Float32Array(newCapacity * 8);
        
        if (!this.instanceBuffer) {
            this.instanceBuffer = this.device.createBuffer({
                size: this.spriteData.byteLength,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
                mappedAtCreation: false
            });
        } else {
            const oldBuffer = this.instanceBuffer;
            this.instanceBuffer = this.device.createBuffer({
                size: this.spriteData.byteLength,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
            });
            oldBuffer.destroy();
        }
    }

    async setTexture(image) {
        await image.decode();
        const imageBitmap = await createImageBitmap(image);

        if (this.texture) {
            this.texture.destroy();
        }

        this.texture = this.device.createTexture({
            size: [imageBitmap.width, imageBitmap.height, 1],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
        });

        this.device.queue.copyExternalImageToTexture(
            { source: imageBitmap },
            { texture: this.texture },
            [imageBitmap.width, imageBitmap.height]
        );
        const uniformData = new Float32Array([
            this.canvas.width, this.canvas.height,
            imageBitmap.width, imageBitmap.height
        ]);
        this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);

        this.bindGroup = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: this.texture.createView() },
                { binding: 1, resource: this.sampler },
                { binding: 2, resource: { buffer: this.uniformBuffer } }
            ]
        });
    }

    drawImage(x, y, sx, sy, w, h, brightness, distance) {
        if (this.spriteCount >= this.maxSprites) {
            this.setCapacity(Math.floor(this.maxSprites * 1.5));
        }

        const offset = this.spriteCount * 8;
        this.spriteData[offset + 0] = x;
        this.spriteData[offset + 1] = y;
        this.spriteData[offset + 2] = sx;
        this.spriteData[offset + 3] = sy;
        this.spriteData[offset + 4] = w;
        this.spriteData[offset + 5] = h;
        this.spriteData[offset + 6] = brightness;
        this.spriteData[offset + 7] = distance;
        this.spriteCount++;
    }

    end() {
        if (this.spriteCount === 0) return;

        this.device.queue.writeBuffer(
            this.instanceBuffer,
            0,
            this.spriteData.buffer,
            0,
            this.spriteCount * 8 * 4
        );

        const encoder = this.device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(),
                clearValue: [0, 0, 0, 0],
                loadOp: 'clear',
                storeOp: 'store'
            }]
        });

        pass.setPipeline(this.pipeline);
        pass.setVertexBuffer(0, this.vertexBuffer);
        pass.setVertexBuffer(1, this.instanceBuffer);
        pass.setIndexBuffer(this.indexBuffer, 'uint16');
        pass.setBindGroup(0, this.bindGroup);
        pass.drawIndexed(6, this.spriteCount);

        pass.end();
        this.device.queue.submit([encoder.finish()]);
    }

    getChunkLoadState(cx, cy) {
        return this.chunkLoadState.get(cx)?.get(cy) ?? 0;
    }

    SetChunkLoadState(cx, cy, state) {
        if (!this.chunkLoadState.has(cx)) this.chunkLoadState.set(cx, new Map());
        this.chunkLoadState.get(cx).set(cy, state);
    }

    getChunk(cx, cy) {
        return this.voxelsMap.get(cx)?.get(cy);
    }

    hasChunk(cx, cy) {
        return this.getChunk(cx, cy) !== undefined;
    }

    roundChunk(x, y) {
        const cx = x >> this.chunkSize;
        const cy = y >> this.chunkSize;
        return [cx, cy]
    }

    getVoxel(x, y, z) {
        const [cx, cy] = this.roundChunk(x, y)
        return this.getChunk(cx, cy)?.get(x)?.get(y)?.get(z);
    }

    hasVoxel(x, y, z) {
        return this.getVoxel(x, y, z) !== undefined;
    }

    setVoxel(x, y, z, voxel) {
        if (voxel === null) {return};
        const [cx, cy] = this.roundChunk(x, y);
        if (!this.voxelsMap.has(cx)) this.voxelsMap.set(cx, new Map());
        const cyMap = this.voxelsMap.get(cx);
        if (!cyMap.has(cy)) cyMap.set(cy, new Map());
        const chunk = cyMap.get(cy);

        if (!chunk.has(x)) chunk.set(x, new Map());
        const yMap = chunk.get(x);
        if (!yMap.has(y)) yMap.set(y, new Map());
        yMap.get(y).set(z, voxel);
        const [luminosity, axis, direction, selfLuminosity] = this.luminosityArray[voxel];
        this.setLightSource(x, y, z, luminosity, axis, direction, selfLuminosity);
    }

    updateVoxel(x, y, z, voxel) {
        if (voxel === null) {return};
        const [cx, cy] = this.roundChunk(x, y);
        if (!this.voxelsMap.has(cx)) this.voxelsMap.set(cx, new Map());
        const cyMap = this.voxelsMap.get(cx);
        if (!cyMap.has(cy)) cyMap.set(cy, new Map());
        const chunk = cyMap.get(cy);

        if (!chunk.has(x)) chunk.set(x, new Map());
        const yMap = chunk.get(x);
        if (!yMap.has(y)) yMap.set(y, new Map());
        yMap.get(y).set(z, voxel);
    }

    deleteVoxel(x, y, z) {
        const [cx, cy] = this.roundChunk(x, y)
        this.getChunk(cx, cy)?.get(x)?.get(y)?.delete(z);
    }

    getSkyLight(x, y) {
        const [cx, cy] = this.roundChunk(x, y);
        const pillar = this.getChunk(cx, cy)?.get(x)?.get(y);
        if (!pillar) {return []};
        let luminosity = 10;
        const skyLights = [];
        const heights = Array.from(pillar.keys()).sort((a, b) => b - a);
        for (const z of heights) {
            const voxel = this.getVoxel(x, y, z);
            skyLights.push([z, luminosity / 10]);
            luminosity -= this.solidArray[voxel];
            if (luminosity <= 0) {return skyLights};
        }
        return skyLights;
    }

    addLight(x, y, z, luminosity, axis, direction) {
        const [cx, cy] = this.roundChunk(x, y);
        if (!this.lightMap.has(cx)) this.lightMap.set(cx, new Map());
        const cyMap = this.lightMap.get(cx);
        if (!cyMap.has(cy)) cyMap.set(cy, new Map());
        const chunk = cyMap.get(cy);

        if (!chunk.has(x)) chunk.set(x, new Map());
        const yMap = chunk.get(x);
        if (!yMap.has(y)) yMap.set(y, new Map());
        const zMap = yMap.get(y);
        if (!zMap.has(z)) {
            zMap.set(z, {
                x: { "1": 0.01, "-1": 0.01 },
                y: { "1": 0.01, "-1": 0.01 },
                z: { "1": 0.01, "-1": 0.01 },
            });
        }
        const light = zMap.get(z);
        light[axis][direction] += luminosity;
    }

    getLight(x, y, z) {
        const [cx, cy] = this.roundChunk(x, y);
        return this.lightMap.get(cx)?.get(cy)?.get(x)?.get(y)?.get(z);
    }

    setLightSource(x, y, z, luminosity, axis, direction, selfLuminosity) {
        const [cx, cy] = this.roundChunk(x, y);
        if (!this.lightSourceMap.has(cx)) this.lightSourceMap.set(cx, new Map());
        const cyMap = this.lightSourceMap.get(cx);
        if (!cyMap.has(cy)) cyMap.set(cy, []);
        const lightSourceArray = cyMap.get(cy);
        lightSourceArray.push([x, y, z, luminosity, axis, direction, selfLuminosity])
    }

    getLightSources(x, y) {
        const [cx, cy] = this.roundChunk(x, y);
        return this.lightSourceMap.get(cx)?.get(cy);
    }

    sortVoxels() {
        const camX = this.camera.x;
        const camY = this.camera.y;
        const cxOffset = this.roundChunk(camX, camY)[0]
        const cyOffset = this.roundChunk(camX, camY)[1]
        const textureArray = this.textureArray;
        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;
        const camHalfWidth = this.canvas.width / 2;
        const camHalfHeight = this.canvas.height / 2;
        const xAxis = this.direction.x;
        const yAxis = this.direction.y;
        const zAxis = this.direction.z;
        const xFactor = this.width / 2;
        const yFactorZ = this.height - 2 * this.offset;
        const yFactor = this.offset;

        const canvasBorderX = this.width * Math.ceil(xFactor * ((this.cameraDestination.x - camX) - (this.cameraDestination.y - camY)));
        const canvasBorderY = this.height * Math.ceil(((this.cameraDestination.x - camX) + (this.cameraDestination.y - camY)) * yFactor);

        const visibilityMap = new Map();
        const nonSolid = [];

        const encodeKey = (dy, dz) => ((dy + 1024) << 12) | (dz + 1024);

        for (let cx = cxOffset - this.renderDistance; cx <= cxOffset + this.renderDistance; cx++) {
            for (let cy = cyOffset - this.renderDistance; cy <= cyOffset + this.renderDistance; cy++) {
                const chunk = this.getChunk(cx, cy);
                if (!chunk) continue;
                for (const [x, yMap] of chunk) {
                    for (const [y, zMap] of yMap) {
                        for (const [z, voxel] of zMap) {
                            const worldX = (x - camX) * xAxis;
                            const worldY = (y - camY) * yAxis;
                            const worldZ = (z) * zAxis;
                            const isoX = Math.ceil(xFactor * (worldX - worldY) + camHalfWidth);
                            const isoY = Math.ceil(-worldZ * yFactorZ + (worldX + worldY) * yFactor + camHalfHeight);

                            if (canvasBorderX < 0) {
                                if (isoX + canvasBorderX > canvasWidth || isoX < canvasBorderX) {continue};
                            } else {
                                if (isoX - canvasBorderX > canvasWidth || isoX + canvasBorderX < 0) {continue};
                            }

                            if (canvasBorderY < 0) {
                                if (isoY + canvasBorderY > canvasHeight || isoY < canvasBorderY) {continue};
                            } else {
                                if (isoY - canvasBorderY > canvasHeight || isoY + canvasBorderY < 0) {continue};
                            }

                            const magnitude = worldX + worldY + worldZ;
                            const dy = worldY - worldX;
                            const dz = worldZ - worldX;
                            const key = encodeKey(dy, dz);

                            if (textureArray[voxel].length > 2) {
                                const existing = visibilityMap.get(key);
                                if (!existing || magnitude > existing[3]) {
                                    visibilityMap.set(key, [x, y, z, magnitude, isoX, isoY]);
                                }
                            } else {
                                nonSolid.push([x, y, z, magnitude, isoX, isoY, key]);
                            }
                        }
                    }
                }
            }
        }

        const filtered = [];
        for (const [x, y, z, magnitude, isoX, isoY, key] of nonSolid) {
            const existing = visibilityMap.get(key);
            if (!existing || magnitude > existing[3]) {
                filtered.push([x, y, z, magnitude, isoX, isoY]);
            }
        }

        const voxelsArray = [...visibilityMap.values(), ...filtered];
        voxelsArray.sort((a, b) => ((a[2] - b[2]) * zAxis) || ((a[0] * xAxis + a[1] * yAxis) - (b[0] * xAxis+ b[1] * yAxis)));
        this.voxelsArray = voxelsArray;
    }

    updateVoxels() {
        const camX = this.camera.x;
        const camY = this.camera.y;
        const camHalfWidth = this.canvas.width / 2;
        const camHalfHeight = this.canvas.height / 2;

        const xAxis = this.direction.x
        const yAxis = this.direction.y
        const zAxis = this.direction.z

        const xFactor = this.width / 2;
        const yFactorZ = this.height - 2 * this.offset;
        const yFactor = this.offset;

        for (let i = 0; i < this.voxelsArray.length; i++) {
            const [x, y, z, magnitude] = this.voxelsArray[i];
            const worldX = (x - camX) * xAxis;
            const worldY = (y - camY) * yAxis;
            const worldZ = (z) * zAxis;
            const isoX = Math.ceil(xFactor * (worldX - worldY) + camHalfWidth);
            const isoY = Math.ceil(-worldZ * yFactorZ + (worldX + worldY) * yFactor + camHalfHeight);
            this.voxelsArray[i][4] = isoX;
            this.voxelsArray[i][5] = isoY;
        }
    }

    begin() {
        const encoder = this.device.createCommandEncoder();
        const clearPass = encoder.beginRenderPass({
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(),
                clearValue: [0, 0, 0, 1],
                loadOp: 'clear',
                storeOp: 'store'
            }]
        });
        clearPass.end();
        this.device.queue.submit([encoder.finish()]);
        this.spriteCount = 0;

    }

    draw() {
        const drawStartTime = performance.now();

        this.begin()

        let drawCount = 0;
        const w = this.width;
        const h = this.height;
        const o = this.offset
        const camX = this.camera.x
        const camY = this.camera.y

        const sw = w / this.texture.width
        const sh = h / this.texture.height

        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;

        const baseLight = {
            x: { "1": 0.01, "-1": 0.01 },
            y: { "1": 0.01, "-1": 0.01 },
            z: { "1": 0.01, "-1": 0.01 },
        }

        const minLight = this.minLight
        const maxLight = this.maxLight

        for (const [x, y, z, magnitude, isoX, isoY] of this.voxelsArray) {
            if (isoX + w < 0 || isoY + h < 0 || isoX - w > canvasWidth || isoY - h > canvasHeight) continue;
            const voxel = this.getVoxel(x, y, z);
            const fog = Math.min(1, Math.abs(x - camX + y - camY) / this.fogScale)**2;
            const light = this.getLight(x, y, z) || baseLight;
            const texture = this.textureArray[voxel];
            if (texture.length > 2) {
                for (const [axis, index] of [['x', 0], ['y', 1], ['z', 2]]) {
                    const direction = this.direction[axis];
                    const [ix, iy] = texture[index];
                    const sx = ix * sw;
                    const sy = iy * sh;
                    const brightness = Math.min(1, Math.max(minLight, light[axis][direction]) / maxLight);
                    this.drawImage(isoX, isoY, sx, sy, w, h, brightness, fog)
                    drawCount++;
                }
            } else {
                const [ix, iy] = texture;
                const sx = ix * sw;
                const sy = iy * sh;
                const maxLuminosity = Math.max(
                    light.x["1"], light.x["-1"],
                    light.y["1"], light.y["-1"],
                    light.z["1"], light.z["-1"]
                );
                const brightness = Math.min(1, Math.max(minLight, maxLuminosity) / maxLight);
                this.drawImage(isoX, isoY, sx, sy, w, h, brightness, fog);
                drawCount++;
            }
        }

        this.end();

        if (this.diagnostics) {
            const drawTime = (performance.now() - drawStartTime).toFixed(2);
            console.log("drawTime:", drawTime);
            console.log("DrawCount:", drawCount);
        }
    }

    async initChunk(cx, cy) {
        const startTime = performance.now();
        const hasChunk = await this.loadChunk(cx, cy);
        if (!hasChunk) await this.createChunk(cx, cy);
        this.SetChunkLoadState(cx, cy, 2);
        if (this.diagnostics) {
            const chunkCreationTime = (performance.now() - startTime).toFixed(2);
            console.log("Creating chunk", cx, cy, "took:", chunkCreationTime);
        }
    }

    async updateChunks() {
        const startTime = performance.now();
        const [cxCam, cyCam] = this.roundChunk(this.cameraDestination.x, this.cameraDestination.y);
        for (let cx = -this.renderDistance + cxCam - 1; cx < this.renderDistance + cxCam + 1; cx++) {
            for (let cy = -this.renderDistance + cyCam - 1; cy < this.renderDistance + cyCam + 1; cy++) {
                if (this.getChunkLoadState(cx, cy) == 0) {
                    this.SetChunkLoadState(cx, cy, 1);
                    await this.initChunk(cx, cy);
                }
            }
        }
        let x = 0;
        let y = 0;
        let chunkCount = 0;
        for (let i = 0; i < 4 * (this.renderDistance - 1) + 3; i++) {
            if (chunkCount >= this.chunksPerTask) {break};
            const orientation = i % 4
            for (let j = 0; j < i >> 1; j++) {            
                const cx = x + cxCam
                const cy = y + cyCam
                if (this.getChunkLoadState(cx, cy) == 2) {
                    const neighborsLoaded = (
                        (this.getChunkLoadState(cx+1, cy) > 1) &&
                        (this.getChunkLoadState(cx-1, cy) > 1) &&
                        (this.getChunkLoadState(cx, cy+1) > 1) &&
                        (this.getChunkLoadState(cx, cy-1) > 1) &&
                        (this.getChunkLoadState(cx-1, cy-1) > 1) &&
                        (this.getChunkLoadState(cx+1, cy+1) > 1) &&
                        (this.getChunkLoadState(cx-1, cy+1) > 1) &&
                        (this.getChunkLoadState(cx+1, cy-1) > 1)
                    );

                    if (neighborsLoaded) {
                        if (chunkCount < this.chunksPerTask) {
                            this.chunkLight(cx, cy);
                            this.SetChunkLoadState(cx, cy, 3);
                            chunkCount++;
                        } else {break}
                    }
                }
                if (orientation == 0) {x++}
                else if (orientation == 1) {y++}
                else if (orientation == 2) {x--}
                else {y--}
            }
        }
        if (this.diagnostics) {
            const updateChunksTime = (performance.now() - startTime).toFixed(2);
            console.log("Update chunks took:", updateChunksTime);
        }
    }

    propagateLight(startX, startY, startZ, startLuminosity, startAxis, startDirection, selfLuminosity, shadow) {
        const attenuation =  this.attenuation

        const directions = [ //x, y, z, axis, direction
            [1, 0, 0, "x", 1],
            [0, 1, 0, "y", 1],
            [0, 0, 1, "z", 1],
            [-1, 0, 0, "x", -1],
            [0, -1, 0, "y", -1],
            [0, 0, -1, "z", -1]
        ];

        if (selfLuminosity) {
            for (const [dx, dy, dz, axis, direction] of directions) {
                const [nx, ny, nz] = [startX + dx, startY + dy, startZ + dz];
                const voxelExists = this.hasVoxel(nx, ny, nz);
                if (voxelExists) this.addLight(nx, ny, nz, shadow ? -selfLuminosity : selfLuminosity, axis, -direction);
            }
        }

        const queue = [{ x: startX, y: startY, z: startZ, luminosity: startLuminosity, axis: startAxis, direction: startDirection }];
        const visited = new Set();

        while (queue.length > 0) {
            const { x, y, z, luminosity, axis, direction } = queue.shift();
            const key = `${x},${y},${z}`;
            if (visited.has(key)) continue;
            visited.add(key);

            for (const [dx, dy, dz, newAxis, newDirection] of directions) {
                const [nx, ny, nz] = [x + dx, y + dy, z + dz];
                const voxelExists = this.hasVoxel(nx, ny, nz);
                if (voxelExists) this.addLight(nx, ny, nz, shadow ? -luminosity : luminosity, newAxis, -newDirection);

                const transparency = voxelExists ? 1 - (this.solidArray[this.getVoxel(nx, ny, nz)] / 10) : 1;
                const fallOff = (newAxis == axis) && (newDirection == direction) ? 1 : attenuation;
                const newLuminosity = (luminosity - fallOff) * transparency;

                if (newLuminosity > 0) {
                    queue.push({ x: nx, y: ny, z: nz, luminosity: newLuminosity, axis: axis, direction: newDirection });
                }
            }
        }
    }

    async chunkLight(cx, cy) {
        const promises = [];
        const lightSources = this.lightSourceMap.get(cx)?.get(cy) ?? [];
        for (const [x, y, z, luminosity, axis, direction, selfLuminosity] of lightSources) {
            promises.push(this.propagateLight(x, y, z, luminosity, axis, direction, selfLuminosity));
        }
        const size = this.chunkSize ** 2;
        for (let dx = 0; dx < size; dx++) {
            for (let dy = 0; dy < size; dy++) {
                for (const [z, luminosity] of this.getSkyLight(dx + cx * size, dy + cy * size)) {
                    promises.push(this.propagateLight(dx + cx * size, dy + cy * size, z + 1, this.sunLuminosity * luminosity, this.sunAxis, this.sunDirection, this.sunSelfLuminosity * luminosity, false));
                }
            }
        }
        await Promise.all(promises)
        this.SetChunkLoadState(cx, cy, 4);
    }

    getAffectedSources(x, y, z) {
        const [centerX, centerY] = this.roundChunk(x, y);
        const lightSourceArray = [];
        const attenuation = this.attenuation
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const cx = dx + centerX
                const cy = dy + centerY
                const cyMap = this.lightSourceMap.get(cx)?.get(cy);
                if (!cyMap) continue;

                for (let i = cyMap.length - 1; i >= 0; i--) {
                    const [lx, ly, lz, luminosity, axis, direction, selfLuminosity] = cyMap[i];
                    const dx = lx - x;
                    const dy = ly - y;
                    const dz = lz - z;
                    const dist = dx + dy + dz;
                    const turns = (dx > 0) + (dy > 0) + (dz > 0) - 1;
                    const effectiveLight = luminosity - (dist + attenuation * turns);
                    if (effectiveLight >= 0) {
                        lightSourceArray.push([lx, ly, lz, luminosity, axis, direction, selfLuminosity]);
                    }
                }
            }
        }
        return lightSourceArray;
    }

    async placeVoxel() {
        if (this.dtVoxelPlaced < this.voxelPlaceTime) {return};
        this.dtVoxelPlaced -= this.voxelPlaceTime
        if (this.enqueuedVoxel.length == 0) {return};

        const [px, py, pz, voxel] = this.enqueuedVoxel;
        const [cx, cy] = this.roundChunk(px, py);
        if (this.getChunkLoadState(cx, cy) < 4) {return};
        this.enqueuedVoxel = [];

        const promises = [];
        const lightSourceArray = this.getAffectedSources(px, py, pz);
        for (const [x, y, z, luminosity, axis, direction, selfLuminosity] of lightSourceArray) {
            if (luminosity == 0) {continue};
            promises.push(this.propagateLight(x, y, z, luminosity, axis, direction, selfLuminosity, true));
        }
        for (let dx = -this.sunLuminosity; dx <= this.sunLuminosity; dx++) {
            for (let dy = -this.sunLuminosity; dy <= this.sunLuminosity; dy++) {
                for (const [z, luminosity] of this.getSkyLight(px + dx, py + dy)) {
                    promises.push(this.propagateLight(px + dx, py + dy, z + 1, this.sunLuminosity * luminosity, this.sunAxis, this.sunDirection, this.sunSelfLuminosity * luminosity, true));
                }
            }
        }

        await Promise.all(promises);
        promises.length = 0;
        if (voxel) {
            await this.setVoxel(px, py, pz, voxel);
            const [luminosity, axis, direction, selfLuminosity] = this.luminosityArray[voxel];
            if (luminosity != 0) {
                promises.push(this.propagateLight(px, py, pz, luminosity, axis, direction, selfLuminosity, false));
            }
        } else {
            const deletedVoxel = this.getVoxel(px, py, pz)
            await this.deleteVoxel(px, py, pz);
            const [luminosity, axis, direction, selfLuminosity] = this.luminosityArray[deletedVoxel];
            if (luminosity != 0) {
                promises.push(this.propagateLight(px, py, pz, luminosity, axis, direction, selfLuminosity, true));
            }
        }
        await Promise.all(promises);
        this.SetChunkLoadState(cx, cy, 5);
        this.sortVoxels();
        promises.length = 0;
        for (const [x, y, z, luminosity, axis, direction, selfLuminosity] of lightSourceArray) {
            if (luminosity == 0) {continue};
            this.propagateLight(x, y, z, luminosity, axis, direction, selfLuminosity, false);
        };

        for (let dx = -this.sunLuminosity; dx <= this.sunLuminosity; dx++) {
            for (let dy = -this.sunLuminosity; dy <= this.sunLuminosity; dy++) {
                for (const [z, luminosity] of this.getSkyLight(px + dx, py + dy)) {
                    this.propagateLight(px + dx, py + dy, z + 1, this.sunLuminosity * luminosity, this.sunAxis, this.sunDirection, this.sunSelfLuminosity * luminosity, false);
                }
            }
        }
    }

    createChunk(cx, cy) {
        const size = this.chunkSize**2;
        for (let dx = 0; dx < size; dx++) {
            for (let dy = 0; dy < size; dy++) {
                const x = dx + cx * size;
                const y = dy + cy * size;
                const [pillar, structures] = this.generateTerrain(x, y)
                for (const [z, voxel] of pillar) {this.setVoxel(x, y, z, voxel)};
                for (const [z, id] of structures) {this.placeStructure(id, x, y, z)};
            }
        }
    }

    getHoveredVoxel(mx, my) {
        const o = this.offset
        const w = this.width
        const h = this.height

        for (let i = this.voxelsArray.length - 1; i >= 0; i--) {
            const [x, y, z, _, isoX, isoY] = this.voxelsArray[i];
            if (
                (mx >= isoX) &&
                (mx <= isoX + w) &&
                (my >= isoY) &&
                (my <= isoY + h)
            ) {
                const dx = mx - isoX
                const dy = my - isoY
                if ((dy >= o) && (dx >= (w / 2))) { //x area
                    if (this.triangle(dx, dy, [w / 2, 2 * o], [w / 2, o], [w, o])) { //top x-triangle
                        return [x, y, z, 2];
                    } else if (this.triangle(dx, dy, [w / 2, h], [w, h - o], [w, h])) { //bottom x-triangle
                        continue;
                    } else { //x face
                        return [x, y, z, 0];
                    }
                } else if ((dy >= o) && (dx <= (w / 2))) { //y area
                    if (this.triangle(dx, dy, [0, o], [w / 2, o], [w / 2, 2 * o])) { //top y-triangle
                        return [x, y, z, 2];
                    } else if (this.triangle(dx, dy, [0, h], [0, h - o], [w / 2, h])) { //bottom y-triangle
                        continue;
                    } else { //y face
                        return [x, y, z, 1];
                    }
                } else { //z area
                    if (this.triangle(dx, dy, [0, 0], [w / 2, 0], [0, o])) { //left z-triangle
                        continue;
                    } else if (this.triangle(dx, dy, [w / 2, 0], [w, 0], [w, o])) { //right z-triangle
                        continue;
                    } else { //z face
                        return [x, y, z, 2];
                    }              
                }
            }
        }
        return null;
    }

    sign(p1, p2, p3) {
        return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
    }
    
    triangle(dx, dy, a, b, c) {
        //clockwise
        const p = [dx, dy];
        const d1 = this.sign(p, a, b);
        const d2 = this.sign(p, b, c);
        const d3 = this.sign(p, c, a);

        const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
        const hasPos = d1 > 0 || d2 > 0 || d3 > 0;

        return !(hasNeg && hasPos);
    }

    async task() {
        if (this.dt < this.taskTime) {return};
        this.dt -= this.taskTime;
        this.placeVoxel();
        await this.updateChunks();
    }

    update(dt) {
        this.dt += dt;
        this.dtVoxelPlaced += dt;

        this.camera.x += (this.cameraDestination.x - this.camera.x) * this.CameraSpeed * dt;
        this.camera.y += (this.cameraDestination.y - this.camera.y) * this.CameraSpeed * dt;

        this.updateVoxels();
        this.draw();
    }
}

class Voxel {
    constructor(
        id, 
        texture, 
        ticksPerFrame = 0,
        solidness = 10,
        luminosityData = [0, 0, 0, 0], //[luminosity, axis, direction, selfLuminosity]
    ) {
        this.id = id;
        this.texture = texture;
        this.ticksPerFrame = ticksPerFrame;
        this.solidness = solidness;
        this.luminosityData = luminosityData;

        //calculated
        this.frames = texture.length;
    }
}

class Biome {
    constructor(temperature, humidity, noise, terrain) {
        this.temperature = temperature
        this.humidity = humidity
        this.noise = noise
        this.terrain = terrain

        //data
        this.naturalGeneration = [];
        this.structureGeneration = [];
    }

    addVoxel(voxel, probability = 1, replace = false, startHeight = 0, endHeight = 0, ignoreLayer = false, startLayer = -1, endLayer = -1, layerOffset = 0) {
        this.naturalGeneration.push([voxel.id, probability, replace, startHeight, endHeight, ignoreLayer, startLayer, endLayer, layerOffset])
    }
    addStructure(id, probability, startHeight, endHeight, groundVoxel)  {
        this.structureGeneration.push([id, probability, startHeight, endHeight, groundVoxel.id])
    }
}

class Game {
    constructor(voxels, biomes, climate, offset, width, height, textureSource, structureIdArray) {
        this.voxels = new Map(voxels.map(v => [v.id, v]));
        this.voxelCount = voxels.length;
        this.taskTestInterval = 100;
        this.src = textureSource;
        this.ticksPerSecond = 10;
        this.threshold = 0.3;
        this.biomeBlending = 10;

        //data
        this.position = {x: 0, y: 0};
        this.frameIndex = 0;
        this.timeSinceTick = 0;
        this.tickCount = 0;

        //calculated
        this.tickTime = 1 / this.ticksPerSecond;

        const textureArray = [];
        const solidArray = [];
        const luminosityArray = [];
        this.nameIndexArray = [];
        let index = 0;
        for (const voxel of voxels) {
            voxel.index = index
            for (const texture of voxel.texture) {
                textureArray.push(texture);
                solidArray.push(voxel.solidness);
                luminosityArray.push(voxel.luminosityData);
                this.nameIndexArray.push(voxel.id);
                index++;
            }
        }

        this.arcade = new Arcade(offset, width, height, textureArray, solidArray, luminosityArray, structureIdArray);
        this.arcade.generateTerrain = this.createGenerationFunction(biomes, climate);
    }

    async init(worldName) {
        this.arcade.worldName = worldName;
        await this.arcade.init();

        this.textureSheet = new Image();
        this.textureSheet.crossOrigin = 'anonymous';
        this.textureSheet.src = this.src;
        await this.arcade.setTexture(this.textureSheet);

        this.gameLoop = this.gameLoop.bind(this);
    }

    async taskLoop() {
        const taskTestInterval = this.taskTestInterval
        let lastTask = performance.now();
        while (true) {
            const now = performance.now();
            if (now - lastTask >= taskTestInterval) {
                lastTask = now;
                await this.arcade.task();
                if (this.arcade.voxelsArray.length == 0) {this.arcade.sortVoxels()};
            }
            await new Promise(r => setTimeout(r, 0));
        }
    }

    gameLoop(timestamp) {
        const dt = (timestamp - (this.lastTime || timestamp)) / 1000;
        this.arcade.update(dt);
        this.timeSinceTick += dt;
        if (this.timeSinceTick >= this.tickTime) {
            this.tick()
            this.timeSinceTick -= this.tickTime
        }
        this.lastTime = timestamp;
        if (this.arcade.diagnostics && dt !== 0) {
            const fps = 1 / dt;
            console.log("fps:", fps.toFixed(2));
        }
        requestAnimationFrame(this.gameLoop);
    }

    rotateLeft() {
        const x = this.arcade.direction.x;
        const y = this.arcade.direction.y;
        this.arcade.direction.x = y;
        this.arcade.direction.y = -x;
        this.arcade.sortVoxels();
    }

    rotateRight() {
        const x = this.arcade.direction.x;
        const y = this.arcade.direction.y;
        this.arcade.direction.x = -y;
        this.arcade.direction.y = x;
        this.arcade.sortVoxels();
    }

    rotateFlip() {
        this.arcade.direction.z = -this.arcade.direction.z;
        this.arcade.sortVoxels();
    }

    destroy() {
        const hoverVoxel = this.arcade.getHoveredVoxel(this.position.x, this.position.y);
        if (!hoverVoxel) {return};
        const [x, y, z, axis] = hoverVoxel;
        this.arcade.enqueuedVoxel = [x, y, z, false];
        console.log(x, y, z)
    }

    async move() {
        const hoverVoxel = this.arcade.getHoveredVoxel(this.position.x, this.position.y);
        if (!hoverVoxel) {return};
        const [x, y, z, axis] = hoverVoxel;
        this.arcade.cameraDestination.x = x;
        this.arcade.cameraDestination.y = y;
        this.arcade.sortVoxels();
        await this.arcade.updateChunks();
        this.arcade.sortVoxels();
    }

    interact() {
        const hoverVoxel = this.arcade.getHoveredVoxel(this.position.x, this.position.y);
        if (!hoverVoxel) {return};
        const [x, y, z, axis] = hoverVoxel;
        if (axis == 0) {this.arcade.enqueuedVoxel = [x + this.arcade.direction.x, y, z, this.inHand.index]}
        else if (axis == 1) {this.arcade.enqueuedVoxel = [x, y + this.arcade.direction.y, z, this.inHand.index]}
        else if (axis == 2) {this.arcade.enqueuedVoxel = [x, y, z + this.arcade.direction.z, this.inHand.index]};
    }

    fastHash64(x, y) {
        return (x + y * 31) & 63;
    }

    fastHash01(x, y) {
        const h0 = Math.imul(x, 0x85ebca6b) ^ Math.imul(y, 0xc2b2ae35);
        const h1 = Math.imul(((h0 ^ (h0 >>> 13)) >>> 0), 0x27d4eb2d);
        return ((h1 ^ (h1 >>> 15)) >>> 0) / 4294967296;
    }

    hashRandom(random, x) {
        random += ((x * 1103515245) >>> 0) / 0xFFFFFFFF;
        return random % 1;
    }

    tick() {
        game.arcade.saveChunks()
        this.tickCount++
        //go through all voxels and map to voxel and then run tick on block
        for (const [x, y, z, magnitude, isoX, isoY] of this.arcade.voxelsArray) {
            const voxelIndex = this.arcade.getVoxel(x, y, z)
            const voxel = this.voxels.get(this.nameIndexArray[voxelIndex]);
            const ticksPerFrame = voxel.ticksPerFrame;
            if (!ticksPerFrame) {continue};
            if (((this.tickCount + this.fastHash64(x, y)) % ticksPerFrame) == 0) {
                const nextFrame = ((voxelIndex - voxel.index) + 1) % voxel.frames;
                const index = voxel.index + nextFrame;
                this.arcade.updateVoxel(x, y, z, index);
            }
        }
    }

    createGenerationFunction(biomes, climate) {
        const biomeData = [];
        const getClimate = climate;
        const fastHash01 = this.fastHash01;
        const hashRandom = this.hashRandom;
        const threshold = this.threshold;
        const biomeBlending = this.biomeBlending;
        for (const biome of biomes) {
            const naturalGeneration = biome.naturalGeneration.map(
                ([id, probability, replace, startHeight, endHeight, ignoreLayer, startLayer, endLayer, layerOffset]) => 
                [this.voxels.get(id).index, this.voxels.get(id).frames, probability, replace, startHeight, endHeight, ignoreLayer, startLayer, endLayer, layerOffset]);
            const structureGeneration = biome.structureGeneration.map(
                ([id, probability, startHeight, endHeight, voxelId]) =>
                [id, probability, startHeight, endHeight, voxelId ? this.voxels.get(voxelId).index : -1]
            )
            const biomeTemperature = biome.temperature
            const biomeHumidity = biome.humidity
            const noise = biome.noise
            const terrain = biome.terrain 
            biomeData.push([naturalGeneration, structureGeneration, biomeTemperature, biomeHumidity, noise, terrain])
        }
        return (x, y) => {
            const pillar = [];
            const structures = [];
            const [temperature, humidity] = getClimate(x, y);
            const mainRandom = fastHash01(x, y);
            const weightedHeights = [];

            for (const [naturalGeneration, structureGeneration, biomeTemperature, biomeHumidity, noise, terrain] of biomeData) {
                const tempDiff = Math.abs(biomeTemperature - temperature);
                const humidityDiff = Math.abs(biomeHumidity - humidity);
                const climateMatch = Math.exp(-(tempDiff + humidityDiff) * threshold);
                weightedHeights.push([terrain(x, y), climateMatch]);
            }

            const totalWeight = weightedHeights.reduce((sum, [_, w]) => sum + w, 0);
            const normalized = weightedHeights.map(([h, w]) => [h, w / totalWeight]);
            const h = Math.round(weightedHeights.reduce((sum, [h, w]) => sum + h * w, 0) / totalWeight);
            
            let i = 0;
            let probabilitySum = 0;
            for (const [naturalGeneration, structureGeneration, biomeTemperature, biomeHumidity, noise, terrain] of biomeData) {
                const probabilityClimate = normalized[i][1]
                probabilitySum += probabilityClimate;
                if (probabilitySum < 0.5 + (mainRandom / biomeBlending)) {
                    i++
                    continue;
                };
                const random = noise(x, y);
                for (let z = 0; z <= this.arcade.worldHeight; z++) {
                    let voxelIndex = -1
                    for (const [index, frames, probability, replace, startHeight, endHeight, ignoreLayer, startLayer, endLayer, layerOffset] of naturalGeneration) {
                        if (z > (h + layerOffset) && !ignoreLayer) {continue};
                        if (probability < hashRandom(random, index)) {continue};
                        if (voxelIndex >= 0 && !replace) {continue};
                        if (startHeight >= 0 && startHeight > z) {continue};
                        if (endHeight >= 0 && endHeight < z) {continue};
                        if (startLayer >= 0 && z < startLayer + (h + layerOffset)) continue;
                        if (endLayer >= 0 && z > endLayer + (h + layerOffset)) continue;
                        voxelIndex = index + ((frames > 0) ? Math.floor(mainRandom * frames) : 0);
                    };
                    if (voxelIndex >= 0) {pillar.push([z, voxelIndex])};
                    for (const [id, probability, startHeight, endHeight, index] of structureGeneration) {
                        if (voxelIndex != index) {continue};
                        if (probability * probabilityClimate < hashRandom(random, id)) {continue};
                        if (startHeight >= 0 && startHeight > z) {continue};
                        if (endHeight >= 0 && endHeight < z) {continue};
                        structures.push([z, id]);
                        break;
                    };
                }
                break;
            }
            return [pillar, structures];
        };
    }
}

export { Arcade, Voxel, Biome, Game };