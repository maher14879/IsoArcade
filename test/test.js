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
        for (const block of this.blocks) {
            const [sx, sy, sw, sh] = this.spritemapping[block.id];
            const x = this.scale * block.x;
            const y = this.scale * block.y;
            const w = this.scale;
            const h = this.scale;
            this.ctx.drawImage(this.spritesheet, sx, sy, sw, sh, x, y, w, h);
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

    const grid = new Grid([0, 0], 32, spritesheet, mapping);

    grid.add(new Block('cube', 1, 1, 0));
    grid.add(new Block('cube', 2, 1, 0));
    grid.add(new Block('cube', 1, 2, 0));

    grid.draw();
};