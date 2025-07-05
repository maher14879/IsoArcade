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
        this.camera = [0, 0, 0];
        this.maxLight = 0;
        for (const [key, map] in shadowTextureMapping) {this.maxLight = Math.max(this.maxLight, key)};

        this.background = 'black';
        this.lightFallOff = 3;
        this.maxSize = 1000;
        this.diagnostics = false;
        this.axis = [0, 1, 2]
    }

    getBlock(x, y, z) {
        return this.blocks.get(x)?.get(y)?.get(z)
    }

    setBlock(x, y, z, block) {
        if (!this.blocks.has(x)) this.blocks.set(x, new Map());
        const yMap = this.blocks.get(x);
        if (!yMap.has(y)) yMap.set(y, new Map());
        yMap.get(y).set(z, block);
    }

    deleteBlock(x, y, z) {this.blocks.get(x)?.get(y)?.delete(z)}

    hasBlock(x, y, z) {
        return !!this.getBlock(x, y, z)
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
        const worldZ = z - this.camera[2];

        const xFactor = (this.width / 2) * this.scale;
        const yFactorZ = (this.height - 2 * this.offset) * this.scale;
        const yFactor = this.offset * this.scale;

        return [Math.ceil(xFactor * (worldX - worldY) + this.canvas.width / 2), Math.ceil(-worldZ * yFactorZ + (worldX + worldY) * yFactor + this.canvas.height / 2)];
    }

    sortBlocks() {
        const blockPlane = new Map();
        const nonSolid = [];
        for (const [x, yMap] of this.blocks) {
            for (const [y, zMap] of yMap) {
                for (const [z, block] of zMap) {
                    if (!this.solidMapping[block]) {
                        nonSolid.push([x, y, z, block, 0]); 
                        continue;}
                    const key = (y - x) + (z - x) * this.maxSize;
                    const magnitude = x + y + z;
                    if (!blockPlane.has(key) || magnitude > blockPlane.get(key)[4]) {
                        blockPlane.set(key, [x, y, z, block, magnitude]);
                    }
                }
            }
        }

        this.blocksArray = Array.from(blockPlane.values()).concat(nonSolid);
        this.blocksArray.sort((a, b) => (a[2] - b[2]) || ((a[0] + a[1]) - (b[0] + b[1])));
    }


    draw() {
        const t0 = performance.now();
        let drawCount = 0;

        this.ctx.fillStyle = this.background;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.sortBlocks();
        const dtSort = (performance.now() - t0) / 1000;

        const w = this.width * this.scale;
        const h = this.height * this.scale;

        for (const [x, y, z, block, magnitude] of this.blocksArray) {
            const [sx, sy] = this.textureMapping[block];
            const [isoX, isoY] = this.getIsometricPosition(x, y, z)

            if (isoX + this.width * this.scale < 0 || isoY + this.height * this.scale < 0 || isoX > this.canvas.width || isoY > this.canvas.height) {continue};

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
                if (brightness >= 1) {
                    this.ctx.filter = `brightness(${brightness})`;
                    this.ctx.drawImage(this.texturesheet, sx, sy, this.width, this.height, isoX, isoY, w, h);
                    this.ctx.filter = 'none';
                    if (this.diagnostics) drawCount++;
                }
            }
        }

        if (this.diagnostics) {
            const dt = (performance.now() - t0) / 1000;
            const fps = (1 / dt).toFixed(2);
            const sps = (1 / dtSort).toFixed(2);
            console.log("FPS:", fps);
            console.log("DrawCount:", drawCount);
            console.log("SPS:", sps)
        }
    }

    setLight(startX, startY, startZ, lightStrength) {
        const directions = [
            [-1, 0, 0, 0],
            [0, -1, 0, 1],
            [0, 0, -1, 2],
            [1, 0, 0, 3],
            [0, 1, 0, 4],
            [0, 0, 1, 5]
        ];

        const queue = [{ x: startX, y: startY, z: startZ, level: lightStrength, direction: 6 }];
        const visited = new Set();

        while (queue.length > 0) {
            const { x, y, z, level, direction } = queue.shift();
            if (level <= 0) continue;

            const key = x + y * this.maxSize + z * this.maxSize * this.maxSize;
            if (visited.has(key)) continue;
            visited.add(key);

            for (const [dx, dy, dz, axis] of directions) {
                const nx = x + dx, ny = y + dy, nz = z + dz;
                if (!this.hasBlock(nx, ny, nz) || !this.solidMapping[this.getBlock(nx, ny, nz)]) {
                    this.addLight(nx, ny, nz, level, axis);
                }
            }

            for (const [dx, dy, dz, dir] of directions) {
                const nx = x + dx, ny = y + dy, nz = z + dz;
                const newLevel = level - (dir === direction ? 1 : this.lightFallOff);
                if (newLevel > 0) {
                    queue.push({ x: nx, y: ny, z: nz, level: newLevel, direction: dir });
                }
            }
        }
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

    for (let x = -400; x <= 400; x++) {
        for (let y = -400; y <= 400; y++) {
            const z = Math.round(Math.sin((x + y) * 0.1) * 8);
            grid.setBlock(x, y, z, 0);
            if (x % 16 == 0 && y % 16 == 0) {
                grid.setBlock(x, y, z+1, 1);
                grid.setLight(x, y, z+1, 16);
            }
        }
    }

    function moveCamera(e) {
        const speed = 0.1;
        switch (e.key) {
            case 'w': grid.camera[1] -= speed; break;
            case 's': grid.camera[1] += speed; break;
            case 'a': grid.camera[0] -= speed; break;
            case 'd': grid.camera[0] += speed; break;
            case 'q': grid.camera[2] -= speed; break;
            case 'e': grid.camera[2] += speed; break;
        }
        scheduleDraw();
    }

    let needsRedraw = false;
    function scheduleDraw() {
        if (!needsRedraw) {
            needsRedraw = true;
            requestAnimationFrame(() => {
                grid.draw();
                needsRedraw = false;
            });
        }
    }

    window.addEventListener("keydown", moveCamera);
    grid.draw();
};
