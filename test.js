class Grid {
    constructor(id, offset, scale, width, height, texturesheet, textureMapping, solidMapping, shadowTextureMapping) {
        this.offset = offset;
        this.scale = scale;
        this.width = width;
        this.height = height;
        this.canvas = document.getElementById(id);
        this.ctx = this.canvas.getContext('2d');
        this.ctx.imageSmoothingEnabled = false;

        this.texturesheet = texturesheet;
        this.textureMapping = textureMapping;
        this.solidMapping = solidMapping;
        this.shadowTextureMapping = shadowTextureMapping;

        this.blocks = new Map();
        this.blocksArray = [];
        this.lightMap = new Map();
        this.camera = [0, 0];
        this.maxLight = 0;

        for (const [key, map] of Object.entries(shadowTextureMapping)) {
            this.maxLight = Math.max(this.maxLight, Number(key));
        }

        this.background = 'black';
        this.lightFallOff = 2;
        this.maxSize = 1000;
        this.chunkSize = 4;
        this.diagnostics = false;
        this.axis = [0, 1, 2];
        this.renderDistance = 3;
        this.sunLight = 3;
        this.worldHeight = 10
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
        return this.blocks.get(cx)?.get(cy);
    }

    roundChunk(x, y) {
        const cx = x >> this.chunkSize;
        const cy = y >> this.chunkSize;
        return [cx, cy]
    }

    setBlock(x, y, z, block) {
        const [cx, cy] = this.roundChunk(x, y)
        if (!this.blocks.has(cx)) this.blocks.set(cx, new Map());
        const cyMap = this.blocks.get(cx);
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
        if (!this.lightMap.has(x)) this.lightMap.set(x, new Map());
        const yMap = this.lightMap.get(x);
        if (!yMap.has(y)) yMap.set(y, new Map());
        const zMap = yMap.get(y);
        if (!zMap) {
            yMap.set(y, new Map());
        }
        const zMapFinal = yMap.get(y);
        const prev = zMapFinal.get(z) || [0, 0, 0, 0, 0, 0];
        const updated = [...prev];
        updated[axis] += value;
        zMapFinal.set(z, updated);
    }

    getLight(x, y, z) {
        return this.lightMap.get(x)?.get(y)?.get(z) || [0, 0, 0, 0, 0, 0];
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
        const size = this.chunkSize**2

        const [cxCam, cyCam] = this.roundChunk(this.camera[0], this.camera[1])
        for (let cx = -this.renderDistance + cxCam; cx <= this.renderDistance + cxCam; cx++) {
            for (let cy = -this.renderDistance + cyCam; cy <= this.renderDistance + cyCam; cy++) {
                for (const [x, yMap] of this.getChunk(cx, cy)) {
                    for (const [y, zMap] of yMap) {
                        for (const [z, block] of zMap) {
                            const [isoX, isoY] = this.getIsometricPosition(x, y, z);
                            if (isoX + scaleW < 0 || isoY + scaleH < 0 || isoX > canvasWidth || isoY > canvasHeight) continue;

                            const solid = this.solidMapping[block];
                            if (!solid) {
                                nonSolid.push([x, y, z, block, 0, isoX, isoY]);
                                continue;
                            }

                            const key = (y - x) + (z - x) * this.maxSize;
                            const magnitude = x + y + z;
                            const existing = visibilityMap[key];
                            if (!existing || magnitude > existing[4]) {
                                visibilityMap[key] = [x, y, z, block, magnitude, isoX, isoY];
                            }
                        }
                    }
                }
            }
        }

        const sortStartTime = performance.now();

        this.blocksArray = Object.values(visibilityMap).concat(nonSolid);
        this.blocksArray.sort((a, b) => (a[2] - b[2]) || ((a[0] + a[1]) - (b[0] + b[1])));

        if (this.diagnostics) {
            const filterTime = (sortStartTime - startTime).toFixed(2);
            console.log("filterTIme:", filterTime);
            const sortTime = (performance.now() - sortStartTime).toFixed(2);
            console.log("sortTime:", sortTime);
        }
    }

    draw() {
        const startTime = performance.now();
        this.sortBlocks();
        const drawStartTime = performance.now();
        let drawCount = 0;
        this.ctx.fillStyle = this.background;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const w = this.width * this.scale;
        const h = this.height * this.scale;

        for (const [x, y, z, block, magnitude, isoX, isoY] of this.blocksArray) {
            const [sx, sy] = this.textureMapping[block];

            if (this.solidMapping[block]) {
                this.ctx.drawImage(this.texturesheet, sx, sy, this.width, this.height, isoX, isoY, w, h);
                if (this.diagnostics) drawCount++;

                const valuesXYZ = this.getLight(x, y, z);
                for (const axis of this.axis) {
                    const tex = this.shadowTextureMapping[axis][Math.round(valuesXYZ[axis])];
                    if (tex) {
                        const [sx, sy] = tex;
                        this.ctx.drawImage(this.texturesheet, sx, sy, this.width, this.height, isoX, isoY, w, h);
                        if (this.diagnostics) drawCount++;
                    }
                }
            } else {
                this.ctx.drawImage(this.texturesheet, sx, sy, this.width, this.height, isoX, isoY, w, h);
                if (this.diagnostics) drawCount++;

                const values = this.getLight(x, y, z);
                const brightness = Math.min(Math.max(...values) / this.maxLight, 1);
                if (brightness <= 1) {
                    this.ctx.filter = `brightness(${brightness})`;
                    this.ctx.drawImage(this.texturesheet, sx, sy, this.width, this.height, isoX, isoY, w, h);
                    this.ctx.filter = 'none';
                    if (this.diagnostics) drawCount++;
                }
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

    setLight(startX, startY, startZ, lightStrength, direction) {
        const directions = [
            [-1, 0, 0, 0],
            [0, -1, 0, 1],
            [0, 0, -1, 2],
            [1, 0, 0, 3],
            [0, 1, 0, 4],
            [0, 0, 1, 5]
        ];

        const queue = [{ x: startX, y: startY, z: startZ, level: lightStrength, direction: direction || 6 }];
        const visited = new Set();

        while (queue.length > 0) {
            const { x, y, z, level, direction } = queue.shift();
            const key = x + y * this.maxSize + z * this.maxSize * this.maxSize;
            if (visited.has(key)) continue;
            visited.add(key);

            for (const [dx, dy, dz, axis] of directions) {
                if (this.hasBlock(x + dx, y + dy, z + dz)) {
                    this.addLight(x + dx, y + dy, z + dz, level, axis);
                }
            }

            for (const [dx, dy, dz, dir] of directions) {
                const nx = x + dx, ny = y + dy, nz = z + dz;
                const newLevel = level - (dir === direction ? 1 : this.lightFallOff);
                if ((newLevel > 0) && (!this.hasBlock(nx, ny, nz) || !this.solidMapping[this.getBlock(nx, ny, nz)])) {
                    queue.push({ x: nx, y: ny, z: nz, level: newLevel, direction: dir });
                }
            }
        }
    }

    chunkLight(cx, cy) {
        const size = this.chunkSize**2;
        for (let dx = 0; dx < size; dx++) {
            for (let dy = 0; dy < size; dy++) {
                const z = this.getSkyLight(dx + cx * size, dy + cy * size);
                this.setLight(dx + cx * size, dy + cy * size, z + 1, this.sunLight, -2);
            }
        }
    }

    updateChunks() {
        const size = this.chunkSize**2;
        const [cxCam, cyCam] = this.roundChunk(this.camera[0], this.camera[1]);
        for (let cx = -this.renderDistance + cxCam; cx <= this.renderDistance + cxCam; cx++) {
            for (let cy = -this.renderDistance + cyCam; cy <= this.renderDistance + cyCam; cy++) {
                if (!this.hasChunk(cx, cy)) {
                    const startTime = performance.now();
                    this.createChunk(cx, cy);
                    this.chunkLight(cx, cy);
                    const chunkCreationTime = (performance.now() - startTime).toFixed(2);
                    console.log("Creating chunk", cx, cy, "took:", chunkCreationTime);
                }
                const z = this.getSkyLight(cx * size, cy * size)
                if (!(this.getBlock(cx * size, cy * size, z) == 1) && false) {
                    this.setBlock(cx * size, cy * size, z + 1, 1)
                    this.setLight(cx * size, cy * size, z + 1, 16)
                }

                for (const [x, yMap] of this.getChunk(cx, cy)) {
                    for (const [y, zMap] of yMap) {
                        for (const [z, block] of zMap) {
                        }
                    }
                }
            }
        }
    }

    noise(x, y) {
        let h = 0;
        for (let i = this.worldHeight; i >= this.worldHeight; i--) {
            h += Math.abs(i * (Math.sin(x * (1/i)) + Math.cos(y * (1/i))));
            };
        return Math.round(Math.min(h, this.worldHeight))
    }

    createChunk(cx, cy) {
        const size = this.chunkSize**2;
        for (let dx = 0; dx < size; dx++) {
            for (let dy = 0; dy < size; dy++) {
                const h = Math.max(this.noise(dx + cx * size, dy + cy * size), 1);
                for (let z = 0; z < h; z++) {
                    this.setBlock(dx + cx * size, dy + cy * size, z, 4);
                }
                if (h == this.worldHeight) {this.setBlock(dx + cx * size, dy + cy * size, h, 6)};     
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

const texturesheet = new Image();
texturesheet.src = 'assets/texturesheet.png';
texturesheet.onload = () => {
    const textureMapping = {
        0: [0, 48], 1: [0, 32], 2: [16, 32], 3: [0, 16],
        4: [0, 64], 5: [0, 80], 6: [0, 96], 7: [0, 112],
    };

    const shadowTextureMapping = {
        0: { 0: [48, 48], 1: [48, 32], 2: [48, 16], 3: [48, 0] },
        1: { 0: [32, 48], 1: [32, 32], 2: [32, 16], 3: [32, 0] },
        2: { 0: [16, 48], 1: [16, 32], 2: [16, 16], 3: [16, 0] }
    };

    const solidMapping = {
        0: true, 1: false, 2: false, 3: false,
        4: true, 5: true, 6: true, 7: true,
    };

    const grid = new Grid('game', 4, 4, 16, 16, texturesheet, textureMapping, solidMapping, shadowTextureMapping);
    grid.diagnostics = true;

    function moveCamera(e) {
        const speed = 0.1;
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
