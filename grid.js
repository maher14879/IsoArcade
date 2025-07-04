class Grid {
    /**
     * @param {string} id - The ID of the canvas element
     * @param {number} offset - Tile vertical offset
     * @param {number} scale - Scale factor for drawing
     * @param {number} width - Texture tile width
     * @param {number} height - Texture tile height
     * @param {HTMLImageElement} texturesheet - The image containing all textures
     * @param {Object<number, [number, number]>} textureMapping - Maps block ID to texture [sx, sy]
     * @param {Object<number, boolean>} solidMapping - Maps block ID to solidity
     * @param {Object<string, Object<number, [number, number]>>} shadowTextureMapping - Maps axis ('x', 'y', 'z') and light value to shadow texture coords
     */
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
        this.blocks = new Map(); // x → y → z → {id}
        this.lightMap = new Map(); // x → y → z → [x, y, z]
        this.camera = [0, 0, 0];

        //preset values
        this.background = 'black';
        this.lightFallOff = 3;
    }

    getChunk(cx, cy, cz) {
        return this.chunks.get(cx)?.get(cy)?.get(cz);
    }

    getBlock(x, y, z) {
        const cx = x >> this.chunkSize;
        const cy = y >> this.chunkSize;
        const cz = z >> this.chunkSize;
        return this.getChunk(cx, cy, cz)?.get(x)?.get(y)?.get(z);
    }

    setBlock(x, y, z, block) {
        const cx = x >> this.chunkSize;
        const cy = y >> this.chunkSize;
        const cz = z >> this.chunkSize;

        if (!this.chunks.has(cx)) this.chunks.set(cx, new Map());
        const cxMap = this.chunks.get(cx);
        if (!cxMap.has(cy)) cxMap.set(cy, new Map());
        const cyMap = cxMap.get(cy);
        if (!cyMap.has(cz)) cyMap.set(cz, new Map());
        const chunk = cyMap.get(cz);

        if (!chunk.has(x)) chunk.set(x, new Map());
        const yMap = chunk.get(x);
        if (!yMap.has(y)) yMap.set(y, new Map());
        yMap.get(y).set(z, block);

        // Also update main structure if needed
        if (!this.blocks.has(x)) this.blocks.set(x, new Map());
        const mainYMap = this.blocks.get(x);
        if (!mainYMap.has(y)) mainYMap.set(y, new Map());
        mainYMap.get(y).set(z, block);
    }

    deleteBlock(x, y, z) {
        const cx = x >> this.chunkSize;
        const cy = y >> this.chunkSize;
        const cz = z >> this.chunkSize;
        this.getChunk(cx, cy, cz)?.get(x)?.get(y)?.delete(z);
        this.blocks.get(x)?.get(y)?.delete(z);
    }

    hasBlock(x, y, z) {
        return !!this.getBlock(x, y, z);
    }


    addLight(x, y, z, value, axis) {
        if (!this.lightMap.has(x)) this.lightMap.set(x, new Map());
        const yMap = this.lightMap.get(x);
        if (!yMap.has(y)) yMap.set(y, new Map());
        const zMap = yMap.get(y);

        const prev = zMap.get(z) || [0, 0, 0];
        if (axis === 0) prev[0] += value;
        else if (axis === 1) prev[1] += value;
        else if (axis === 2) prev[2] += value;

        zMap.set(z, prev);
    }

    getLight(x, y, z) {
        return this.lightMap.get(x)?.get(y)?.get(z);
    }

    sortArry() {
        this.blocksArr = [];
        for (const [x, yMap] of this.blocks) {
            for (const [y, zMap] of yMap) {
                for (const [z, block] of zMap) {
                    this.blocksArr.push([x, y, z, block]);
                }
            }
        }

        this.blocksArr.sort((a, b) => (a[2] - b[2]) || ((a[0] + a[1]) - (b[0] + b[1])));
    }

    draw() {
        this.ctx.fillStyle = this.background;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const [sw, sh] = [this.width, this.height];
        const w = sw * this.scale;
        const h = sh * this.scale;
        const xFactor = (this.width / 2) * this.scale;
        const yFactorZ = (this.height - 2 * this.offset) * this.scale;
        const yFactor = this.offset * this.scale;

        for (const [originX, originY, originZ, block] of this.blocksArr) {
            const x = originX - this.camera[0]
            const y = originY - this.camera[1]
            const z = originZ - this.camera[2]
            const block_x = this.getBlock(x + 1, y, z);
            const block_y = this.getBlock(x, y + 1, z);
            const block_z = this.getBlock(x, y, z + 1);
            if (block_x && this.solidMapping[block_x] && block_y && this.solidMapping[block_y] && block_z && this.solidMapping[block_z]) {continue};

            const [sx, sy] = this.textureMapping[block];

            const isoX = xFactor * (x - y) + this.canvas.width / 2;
            const isoY = -z * yFactorZ + (x + y) * yFactor + this.canvas.height / 2;

            if (isoX + w < 0 || isoX > this.canvas.width || isoY + h < 0 || isoY > this.canvas.height) {continue};

            this.ctx.drawImage(this.texturesheet, sx, sy, sw, sh, isoX, isoY, w, h);

            if (!this.solidMapping[block]) {continue};

            const valuesXYZ = this.getLight(x, y, z) || [0, 0, 0];
            for (let axis = 0; axis < 3; axis++) {
                const lightMapSource = this.shadowTextureMapping[axis][Math.round(valuesXYZ[axis])];
                if (lightMapSource) {
                    const [lightMapX, lightMapY] = lightMapSource;
                    this.ctx.drawImage(this.texturesheet, lightMapX, lightMapY, sw, sh, isoX, isoY, w, h);
                };
            }
        }
    }

    lighten(startX, startY, startZ, lightStrength) {
        const directions = [
            [1, 0, 0, 0],  //x
            [-1, 0, 0, 1], //-x
            [0, 1, 0, 2],  //y
            [0, -1, 0, 3], //-y
            [0, 0, 1, 4],  //z
            [0, 0, -1, 5], //-z
        ];

        const reversedAxis = [
            [-1, 0, 0, 0],
            [0, -1, 0, 1],
            [0, 0, -1, 2]
        ];

        const queue = [{ x: startX, y: startY, z: startZ, level: lightStrength, direction: 6 }];
        const visited = new Set();

        while (queue.length > 0) {
            const { x, y, z, level, direction } = queue.shift();
            const key = `${x},${y},${z}`;
            if (visited.has(key) || level <= 0) {continue};
            visited.add(key);

            for (const [dx, dy, dz, axis] of reversedAxis) {
                const block = this.getBlock(x + dx, y + dy, z + dz);
                if (block !== undefined && this.solidMapping[block]) {
                    this.addLight(x + dx, y + dy, z + dz, level, axis)
                    //this.setBlock(x, y, z, 3)
                };
            }

            const block = this.getBlock(x, y, z);
            if (block !== undefined && this.solidMapping[block]) continue;

            for (const [dx, dy, dz, dir] of directions) {
                queue.push({
                    x: x + dx,
                    y: y + dy,
                    z: z + dz,
                    level:  level - (dir == direction ? 1 : this.lightFallOff),
                    direction: dir
                });
            }
        }
    }
}

class Block {
    constructor(teaxture, solid, lightlevel) {
        this.teaxture
        this.solid
        this.lightlevel
    }
}