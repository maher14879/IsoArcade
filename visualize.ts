class Block {
    id: string;
    x: number;
    y: number;
    z: number;

    constructor(id: string, x: number, y: number, z: number) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.z = z;
    }
}

class Grid {
    offset: number[];
    scale: number;
    blocks: Set<Block>;
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    spritesheet: HTMLImageElement;
    spritemapping: Record<string, [number, number, number, number]>;

    constructor(
        offset: number[],
        scale: number,
        blocks: Set<Block>,
        spritesheet: HTMLImageElement,
        spritemapping: Record<string, [number, number, number, number]>
    ) {
        this.offset = offset;
        this.scale = scale;
        this.blocks = blocks;
        this.canvas = document.getElementById('game') as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d')!;
        this.ctx.imageSmoothingEnabled = false;
        this.spritesheet = spritesheet;
        this.spritemapping = spritemapping;
    }

    add(block: Block) {
        this.blocks.add(block);
    }

    remove(block: Block) {
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