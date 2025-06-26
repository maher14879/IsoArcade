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



            const iso_x = (block.x - block.y) * sw * this.scale + this.offset;
            const iso_y = (block.x + block.y) * sh * this.scale + this.offset;

            const w = sw * this.scale;
            const h = sh * this.scale;

            this.ctx.drawImage(this.spritesheet, sx, sy, sw, sh, iso_x, iso_y, w, h);
        }
    }
}
