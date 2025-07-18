class Grid {
    constructor(id, offset, scale, width, height, textureSheet, textureArray, solidArray) {
        this.offset = offset;
        this.scale = scale;
        this.width = width;
        this.height = height;
        this.canvas = document.getElementById(id);
        this.ctx = this.canvas.getContext('2d');
        this.ctx.imageSmoothingEnabled = false;

        this.textureSheet = textureSheet;
        this.textureArray = textureArray;

        this.solidArray = solidArray;

        this.blocksMap = new Map();
        this.lightMap = new Map();
        this.chunkLoadState = new Map();
        this.brightnessMap = new Map()
        this.camera = [0, 0];

        this.maxLight = 16;
        this.background = 'black';
        this.attenuation = 2;
        this.chunkSize = 4;
        this.diagnostics = false;
        this.axis = [0, 1, 2];
        this.renderDistance = 4;
        this.sunLight = 5;
        this.worldHeight = 10;
        this.heightBrightness = -0.02

        this.createBrightnessMap()
    }

    createBrightnessMap() {
        const canvas = document.createElement('canvas');
        canvas.width = this.textureSheet.width;
        canvas.height = this.textureSheet.height;
        const ctx = canvas.getContext('2d');
        
        ctx.drawImage(this.textureSheet, 0, 0);
        const originalData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        for (let i = 0; i <= this.maxLight; i++) {
            const brightness = i / this.maxLight;
            const imageData = new ImageData(
                new Uint8ClampedArray(originalData.data), 
                originalData.width, 
                originalData.height
            );
            
            this.applyBrightness(imageData, brightness);
            ctx.putImageData(imageData, 0, 0);
            
            const img = new Image();
            img.src = canvas.toDataURL();
            this.brightnessMap[i] = img;
        }
    }

    applyBrightness(imageData, brightness) {
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            data[i] *= brightness;
            data[i + 1] *= brightness;
            data[i + 2] *= brightness;
        }
    }

    getChunkLoadState(cx, cy) {
        return this.chunkLoadState.get(cx)?.get(cy) ?? 0;
    }

    SetChunkLoadState(cx, cy, state) {
        if (!this.chunkLoadState.has(cx)) this.chunkLoadState.set(cx, new Map());
        this.chunkLoadState.get(cx).set(cy, state);
    }

    lerp(a, b, dt) {
        return b + (a-b) * Math.exp(-this.decay * dt)
    }

    getBlock(x, y, z) {
        const [cx, cy] = this.roundChunk(x, y)
        return this.getChunk(cx, cy)?.get(x)?.get(y)?.get(z);
    }

    hasChunk(cx, cy) {
        return this.getChunk(cx, cy) !== undefined;
    }

    getChunk(cx, cy) {
        return this.blocksMap.get(cx)?.get(cy);
    }

    roundChunk(x, y) {
        const cx = x >> this.chunkSize;
        const cy = y >> this.chunkSize;
        return [cx, cy]
    }

    setBlock(x, y, z, block) {
        const [cx, cy] = this.roundChunk(x, y)
        if (!this.blocksMap.has(cx)) this.blocksMap.set(cx, new Map());
        const cyMap = this.blocksMap.get(cx);
        if (!cyMap.has(cy)) cyMap.set(cy, new Map());
        const chunk = cyMap.get(cy);

        if (!chunk.has(x)) chunk.set(x, new Map());
        const yMap = chunk.get(x);
        if (!yMap.has(y)) yMap.set(y, new Map());
        yMap.get(y).set(z, block);
    }

    deleteBlock(x, y, z) {
        const [cx, cy] = this.roundChunk(x, y)
        this.getChunk(cx, cy)?.get(x)?.get(y)?.delete(z);
    }

    hasBlock(x, y, z) {
        return this.getBlock(x, y, z) !== undefined;
    }

    getSkyLight(x, y) {
        const [cx, cy] = this.roundChunk(x, y);
        const pillar = this.getChunk(cx, cy)?.get(x)?.get(y);
        return Math.max(...pillar.keys());
    }

    addLight(x, y, z, value, axis) {
        const [cx, cy] = this.roundChunk(x, y);
        if (!this.lightMap.has(cx)) this.lightMap.set(cx, new Map());
        const cyMap = this.lightMap.get(cx);
        if (!cyMap.has(cy)) cyMap.set(cy, new Map());
        const chunk = cyMap.get(cy);

        if (!chunk.has(x)) chunk.set(x, new Map());
        const yMap = chunk.get(x);
        if (!yMap.has(y)) yMap.set(y, new Map());
        const zMap = yMap.get(y);
        if (!zMap.has(z)) zMap.set(z, [0, 0, 0, 0, 0, 0]);

        const prev = zMap.get(z);
        const updated = [...prev];
        updated[axis] += value;
        zMap.set(z, updated);
    }

    hasLight(x, y, z) {
        const [cx, cy] = this.roundChunk(x, y);
        return !!this.lightMap.get(cx)?.get(cy)?.get(x)?.get(y)?.get(z);
    }

    getLight(x, y, z) {
        const [cx, cy] = this.roundChunk(x, y);
        return this.lightMap.get(cx)?.get(cy)?.get(x)?.get(y)?.get(z);
    }

    getIsometricPosition(x, y, z) {
        const worldX = x - this.camera[0];
        const worldY = y - this.camera[1];
        const worldZ = z

        const xFactor = (this.width / 2) * this.scale;
        const yFactorZ = (this.height - 2 * this.offset) * this.scale;
        const yFactor = this.offset * this.scale;

        return [Math.ceil(xFactor * (worldX - worldY) + this.canvas.width / 2), Math.ceil(-worldZ * yFactorZ + (worldX + worldY) * yFactor + this.canvas.height / 2)];
    }

    sortBlocks() {
        const startTime = performance.now();

        const visibilityMap = Object.create(null);
        const nonSolid = [];

        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;
        const scaleW = this.width * this.scale;
        const scaleH = this.height * this.scale;

        const [cxCam, cyCam] = this.roundChunk(this.camera[0], this.camera[1])
        for (let cx = -this.renderDistance + cxCam; cx <= this.renderDistance + cxCam; cx++) {
            for (let cy = -this.renderDistance + cyCam; cy <= this.renderDistance + cyCam; cy++) {
                for (const [x, yMap] of this.getChunk(cx, cy)) {
                    for (const [y, zMap] of yMap) {
                        for (const [z, block] of zMap) {
                            const [isoX, isoY] = this.getIsometricPosition(x, y, z);
                            if (isoX + scaleW < 0 || isoY + scaleH < 0 || isoX > canvasWidth || isoY > canvasHeight) continue;
                            if (this.solidArray[block] > 0.9) {
                                const key = '${y - x},${z - x}';
                                const magnitude = x + y + z;
                                const existing = visibilityMap[key];
                                if (!existing || magnitude > existing[4]) {
                                    visibilityMap[key] = [x, y, z, block, magnitude, isoX, isoY];
                                }
                            } else {
                                nonSolid.push([x, y, z, block, 0, isoX, isoY]);
                                continue;
                            }
                        }
                    }
                }
            }
        }

        const sortStartTime = performance.now();

        const blocksArray = Object.values(visibilityMap).concat(nonSolid);
        blocksArray.sort((a, b) => (a[2] - b[2]) || ((a[0] + a[1]) - (b[0] + b[1])));

        if (this.diagnostics) {
            const filterTime = (sortStartTime - startTime).toFixed(2);
            console.log("filterTIme:", filterTime);
            const sortTime = (performance.now() - sortStartTime).toFixed(2);
            console.log("sortTime:", sortTime);
        }

        return blocksArray
    }

    draw() {
        const startTime = performance.now();
        const blocksArray = this.sortBlocks();
        const drawStartTime = performance.now();
        let drawCount = 0;

        this.ctx.fillStyle = this.background;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const w = this.width;
        const h = this.height;
        const wScaled = w * this.scale;
        const hScaled = h * this.scale;
        const heightBrightness = this.heightBrightness

        for (const [x, y, z, block, magnitude, isoX, isoY] of blocksArray) {
            const brightnessValues = this.getLight(x, y, z) ?? [0,0,0,0,0,0];
            if (this.solidArray[block] > 0.9) {
                const texture = this.textureArray[block];
                for (const axis of this.axis) {
                    const [ix, iy] = texture[axis]; //need to change when flip
                    const sx = ix * w;
                    const sy = iy * h; 
                    const brightness = Math.max(0, Math.min(brightnessValues[axis] + z * heightBrightness, this.maxLight)) / this.maxLight;
                    this.ctx.drawImage(this.brightnessMap[brightness], sx, sy, w, h, isoX, isoY, wScaled, hScaled);
                    drawCount++;
                }
            } else {
                const [ix, iy] = this.textureArray[block];
                const sx = ix * w;
                const sy = iy * h;
                const brightness = Math.max(0, Math.min(Math.max(...brightnessValues) + z * heightBrightness, this.maxLight)) / this.maxLight;
                this.ctx.drawImage(this.brightnessMap[brightness], sx, sy, w, h, isoX, isoY, wScaled, hScaled);
                drawCount++;
            }
        }

        if (this.diagnostics) {
            const drawTime = (performance.now() - drawStartTime).toFixed(2);
            const fps = (1000 / (performance.now() - startTime)).toFixed(2);
            console.log("fps:", fps);
            console.log("drawTime:", drawTime);
            console.log("DrawCount:", drawCount);
        }
    }

    setLight(startX, startY, startZ, lightStrength, axis) {
        const directions = [
            [-1, 0, 0, 0],
            [0, -1, 0, 1],
            [0, 0, -1, 2],
            [1, 0, 0,  3],
            [0, 1, 0,  4],
            [0, 0, 1,  5]
        ];

        const queue = [{ x: startX, y: startY, z: startZ, lightStrength: lightStrength, axis: axis}];
        const visited = new Set();

        while (queue.length > 0) {
            const { x, y, z, lightStrength, axis } = queue.shift();
            const key = '${x},${y},${z}';
            if (visited.has(key)) continue;
            visited.add(key);

            for (const [dx, dy, dz, dir] of directions) {
                const [nx, ny, nz] = [x + dx, y + dy, z + dz]
                if (this.hasBlock(nx, ny, nz)) {
                    this.addLight(nx, ny, nz, lightStrength, dir);
                    continue;
                }
                const newLightStrength = Math.round((lightStrength - ((dir == axis) ? 1 : this.attenuation )));
                if (newLightStrength > 0) {
                    queue.push({ x: nx, y: ny, z: nz, lightStrength: newLightStrength, axis: dir });
                }
            }
        }
    }

    chunkLight(cx, cy) {
        const size = this.chunkSize**2;
        for (let dx = 0; dx < size; dx++) {
            for (let dy = 0; dy < size; dy++) {
                const z = this.getSkyLight(dx + cx * size, dy + cy * size);
                this.setLight(dx + cx * size, dy + cy * size, z + 1, this.sunLight, -1);
            }
        }
        this.SetChunkLoadState(cx, cy, 2)
    }

    loadChunk(cx, cy) {
        const startTime = performance.now();
        this.createChunk(cx, cy);
        this.SetChunkLoadState(cx, cy, 1)
        const chunkCreationTime = (performance.now() - startTime).toFixed(2);
        console.log("Creating chunk", cx, cy, "took:", chunkCreationTime);
    }

    updateChunks() {
        const [cxCam, cyCam] = this.roundChunk(this.camera[0], this.camera[1]);
        for (let cx = -this.renderDistance + cxCam - 1; cx <= this.renderDistance + cxCam + 1; cx++) {
            for (let cy = -this.renderDistance + cyCam - 1; cy <= this.renderDistance + cyCam + 1; cy++) {
                if (this.getChunkLoadState(cx, cy) == 0) {
                    this.loadChunk(cx, cy)
                }
            }
        }

        for (let cx = -this.renderDistance + cxCam; cx <= this.renderDistance + cxCam; cx++) {
            for (let cy = -this.renderDistance + cyCam; cy <= this.renderDistance + cyCam; cy++) {
                if (this.getChunkLoadState(cx, cy) == 1) {
                    const neighborsLoaded = (
                        (this.getChunkLoadState(cx+1, cy) > 0) &&
                        (this.getChunkLoadState(cx-1, cy) > 0) &&
                        (this.getChunkLoadState(cx, cy+1) > 0) &&
                        (this.getChunkLoadState(cx, cy-1) > 0) &&
                        (this.getChunkLoadState(cx-1, cy-1) > 0) &&
                        (this.getChunkLoadState(cx+1, cy+1) > 0) &&
                        (this.getChunkLoadState(cx-1, cy+1) > 0) &&
                        (this.getChunkLoadState(cx+1, cy-1) > 0)
                    );

                    if (neighborsLoaded) {
                        this.chunkLight(cx, cy);

                        //tests
                        const size = this.chunkSize**2;
                        const z = this.getSkyLight(cx * size, cy * size);
                        if (this.getBlock(cx * size, cy * size, z) == 2) {
                        this.setBlock(cx * size, cy * size, z + 1, 6);
                        this.setLight(cx * size, cy * size, z + 1, 16, 6);
                        }
                    }
                };
                for (const [x, yMap] of this.getChunk(cx, cy)) {
                    for (const [y, zMap] of yMap) {
                        for (const [z, block] of zMap) {

                        }
                    }
                }
            }
        }
    }

    noise(x, y, amplitude) {
        let h = 0;
        const octaves = 9;
        const scale = 0.04;
        const persistence = 0.4;

        for (let i = 0; i < octaves; i++) {
            const freq = Math.pow(2, i);
            const amp = Math.pow(persistence, i);
            h += amp * (Math.sin(x * scale * freq) + Math.cos(y * scale * freq));
        }
        return Math.round(Math.exp(h) * amplitude);
    }

    createTree(x, y, z) {
        for (let dz = z; dz < z+4; dz++) {
            this.setBlock(x, y, dz, 4)
        }
        for (let dz = z+4; dz < z+6; dz++) {
            this.setBlock(x, y, dz, 4)
            //leaves
            this.setBlock(x+1, y, dz, 0)
            this.setBlock(x, y+1, dz, 0)
            this.setBlock(x+1, y+1, dz, 0)
            this.setBlock(x-1, y, dz, 0)
            this.setBlock(x, y-1, dz, 0)
            this.setBlock(x-1, y-1, dz, 0)
            this.setBlock(x+1, y-1, dz, 0)
            this.setBlock(x-1, y+1, dz, 0)
        }
        this.setBlock(x, y, z+6, 0)
        this.setBlock(x+1, y, z+6, 0)
        this.setBlock(x, y+1, z+6, 0)
        this.setBlock(x+1, y+1, z+6, 0)
        this.setBlock(x-1, y, z+6, 0)
        this.setBlock(x, y-1, z+6, 0)
        this.setBlock(x-1, y-1, z+6, 0)
        this.setBlock(x+1, y-1, z+6, 0)
        this.setBlock(x-1, y+1, z+6, 0)
    }

    createChunk(cx, cy) {
        const size = this.chunkSize**2;
        
        for (let dx = 0; dx < size; dx++) {
            for (let dy = 0; dy < size; dy++) {
                const x = dx + cx * size;
                const y = dy + cy * size;
                this.setBlock(x, y, 1, 3);// Dirt
                this.setBlock(x, y, 2, 1);// water
                
                let h = Math.max(this.noise(x, y, 1), 1);
                
                const mountainThreshold = this.worldHeight * 0.6;
                if (h > mountainThreshold) {
                    for (let z = 0; z < h + (h - mountainThreshold) * 2; z++) {
                        this.setBlock(x, y, z, 5);
                    }
                } 
                if ((1 < h) && (h < mountainThreshold)) {
                    for (let z = 0; z < h; z++) {
                        this.setBlock(x, y, z, 3); // Dirt
                    }
                    this.setBlock(x, y, h, 2); // Grass on top
                    if (Math.random() < 0.01) {this.createTree(x, y, h)}

                }
            }
        }
    }

    saveWorld() {

    }
}

class Block {
    constructor(texture, solid, lightlevel) {
        this.texture = texture;
        this.solid = solid;
        this.lightlevel = lightlevel;
    }
}

const canvas = document.createElement('canvas');
canvas.id = 'game';
document.body.appendChild(canvas);

const textureSheet = new Image();
textureSheet.crossOrigin = 'anonymous';
textureSheet.src = 'assets/texture_sheet.png';
textureSheet.onload = () => {
    const textureArray = [
        [0, 0], //leaves 0
        [0, 1], //water 1
        [[1, 2], [1,1], [1,0]], //grass 2
        [[1, 5], [1,4], [1,3]], //dirt 3
        [[2, 2], [2,1], [2,0]], //wood 4
        [[2, 5], [2,4], [2,3]], //stone 5
        [0, 2], //torch 6
    ];

    const solidArray = [
        0.6,
        0.8,
        1.,
        1.,
        1.,
        1.,
        0.,
    ];

    const grid = new Grid('game', 4, 3, 16, 16, textureSheet, textureArray, solidArray);
    grid.diagnostics = true;

    function moveCamera(e) {
        const speed = 1;
        if (e.key == 'w') {
            grid.camera[0] -= speed;
            grid.camera[1] -= speed;
        }
        if (e.key == 's') {
            grid.camera[0] += speed;
            grid.camera[1] += speed;
        }
        if (e.key == 'a') {
            grid.camera[0] -= speed;
            grid.camera[1] += speed;
        }
        if (e.key == 'd') {
            grid.camera[0] += speed;
            grid.camera[1] -= speed;
        }
        scheduleDraw();
    }

    let needsRedraw = false;
    function scheduleDraw() {
        if (!needsRedraw) {
            needsRedraw = true;
            requestAnimationFrame(() => {
                console.clear()
                grid.updateChunks();
                grid.draw()
                needsRedraw = false;
            });
        }
    }

    window.addEventListener("keydown", moveCamera);
};