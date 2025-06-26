// code
class Block {
    constructor(id, x, y, z) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.z = z;
    }
}

class Grid {
    constructor(offset, scale, spritesheet, spritemapping) {
        this.offset = offset;
        this.scale = scale;
        this.blocks = new Set();
        this.canvas = document.getElementById('game');
        this.ctx = this.canvas.getContext('2d');
        this.ctx.imageSmoothingEnabled = false;
        this.spritesheet = spritesheet;
        this.spritemapping = spritemapping;
    }

    add(block) {
        this.blocks.add(block);
    }

    remove(block) {
        this.blocks.delete(block);
    }

    draw() {
        const blocksArr = Array.from(this.blocks);
        blocksArr.sort((a, b) => (a.x + a.y) - (b.x + b.y));
        blocksArr.sort((a, b) => (a.z) - (b.z));

        for (const block of blocksArr) {
            const [sx, sy, sw, sh] = this.spritemapping[block.id];

            const iso_x = ((sw / 2) * (block.x - block.y))  * this.scale;
            const iso_y =  (block.z * (sh - 2 * this.offset) + block.x * this.offset + block.y * this.offset) * this.scale

            const w = sw * this.scale;
            const h = sh * this.scale;

            this.ctx.drawImage(this.spritesheet, sx, sy, sw, sh, iso_x, iso_y, w, h);

            console.log({
                blockId: block.id,
                sx, sy, sw, sh,
                iso_x,
                iso_y,
                w,
                h
                });
        }
    }
}
























//actual test

const canvas = document.createElement('canvas');
canvas.id = 'game';
document.body.appendChild(canvas);

const spritesheet = new Image();
spritesheet.src = 'test/block_test.png';
spritesheet.onload = () => {
    const mapping = {
        'cube': [0, 0, 16, 16]
    };

    const grid = new Grid(4, 1, spritesheet, mapping);

    const sizeX = 100;
    const sizeY = 100;
    const amplitude = 3;
    const frequency = 0.3;

    for (let x = 0; x < sizeX; x++) {
    for (let y = 0; y < sizeY; y++) {
        const z = Math.round(amplitude * Math.sin(frequency * (x + y)));
        grid.add(new Block('cube', x + 50, y - 50, z));
    }
    }
    grid.draw();
};