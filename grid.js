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