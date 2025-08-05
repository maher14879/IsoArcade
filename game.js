import 'https://cdn.jsdelivr.net/gh/maher14879/IsoArcade@main/isoarcade.js'


const dirt = new Voxel("dirt", [[[1,4], [1, 5], [1,3]]], undefined, undefined, undefined);
const grassDirt = new Voxel("grass_dirt", [[[1,1], [1, 2], [1,0]]], undefined, undefined, undefined);
const stone = new Voxel("stone", [[[2,4], [2, 5], [2,3]]], undefined, undefined, undefined);
const mossyStone = new Voxel("mossy_stone", [[[3,4], [3, 5], [3,3]]], undefined, undefined, undefined);
const sand = new Voxel("sand", [[[3,1], [3, 2], [3,0]]], undefined, undefined, undefined);
const wood = new Voxel("wood", [[[2,1], [2, 2], [2,0]]], undefined, undefined, undefined);
const water = new Voxel("water", [[0, 1]], undefined, 2, undefined);
const leaf = new Voxel("leaf", [[0, 0]], undefined, 3, undefined);
const lamp = new Voxel("lamp", [[0, 2]], undefined, 6, [16, 4, 0, 0]);
const root = new Voxel("root", [[0, 3]], undefined, 0, undefined);
const grass = new Voxel("grass", [[0, 4]], undefined, 0, undefined);
const plant = new Voxel("plant", [[0, 5], [0, 6], [0, 7]], 4, 0, undefined);
const smallLilly = new Voxel("small_lilly", [[1, 6]], undefined, 0, undefined);
const lilly = new Voxel("lilly", [[1, 7]], undefined, 0, undefined);
const cornFlower = new Voxel("corn_flower", [[2, 6]], undefined, 0, undefined);
const poppy = new Voxel("poppy", [[2, 7]], undefined, 0, undefined);
const daisy = new Voxel("daisy", [[3, 7]], undefined, 0, undefined);
const voxels = [dirt, grassDirt, stone, mossyStone, sand, wood, water, leaf, lamp, root, grass, plant, smallLilly, lilly, cornFlower, poppy, daisy];

function plainsNoise(x, y) {
    let h = 0;
    const octaves = 6;
    const scale = 0.03;
    const persistence = 0.5;

    for (let i = 0; i < octaves; i++) {
        const freq = Math.pow(2, i);
        const amp = Math.pow(persistence, i);
        h += amp * (Math.sin(x * scale * freq) * Math.cos(y * scale * freq));
    }

    return h * 10;
}

function noise(x, y) {
    return 0.5 + 0.5 * Math.sin(x * 0.327 + Math.cos(y * 0.339) * 3.55);
}

function climate(x, y) {
    function hash(n) {
        n = Math.sin(n) * 43758.5453;
        return n - Math.floor(n);
    }

    const scale = 0.01; // controls frequency
    const nx = x * scale;
    const ny = y * scale;

    const temp = hash(nx * 12.9898 + ny * 78.233);
    const humidity = hash(nx * 26.651 + ny * 41.31);
    return [temp, humidity];
}

const plains = new Biome(20, 1, noise, plainsNoise)

plains.addVoxel(sand, 1, true, 0, 0, true, -1, -1)
plains.addVoxel(sand, 1, true, 0, 3, false, 0, 1)
plains.addVoxel(lilly, 0.01, true, 3, 3, true, 1, 1, 2)
plains.addVoxel(smallLilly, 0.04, true, 3, 3, true, 1, 1, 1)
plains.addVoxel(stone, 0.2, false, 0, 10, false, -1, -1)
plains.addVoxel(dirt, 1, false, 0, 10, false, -1, -1)
plains.addVoxel(grassDirt, 1, true, 3, 50, true, 0, 0)
plains.addVoxel(mossyStone, 0.2, true, 3, 50, true, 0, 0)
plains.addVoxel(grass, 0.3, true, 5, 50, true, 1, 1)
plains.addVoxel(cornFlower, 0.005, true, 5, 50, true, 1, 1)
plains.addVoxel(poppy, 0.005, true, 5, 50, true, 1, 1)
plains.addVoxel(daisy, 0.005, true, 5, 50, true, 1, 1)
plains.addVoxel(plant, 0.005, true, 5, 50, true, 1, 1)
plains.addVoxel(root, 0.005, true, 5, 50, true, 1, 1)
plains.addVoxel(plant, 0.01, true, 5, 50, true, 1, 1)
plains.addVoxel(water, 1, false, 0, 2, true, -1, -1)
plains.addStructure(0, 0.0001, -1, -1, grassDirt)

const biomes = [
    plains,
]

const textureSource = 'https://cdn.jsdelivr.net/gh/maher14879/IsoArcade@main/assets/texture_sheet.png';
const structureIdArray = [
    0
];

const game = new Game(voxels, biomes, climate, 4, 16, 16, textureSource, structureIdArray);

await game.init("test_world");
game.taskLoop();
requestAnimationFrame(game.gameLoop);

window.addEventListener("keyup", (e) => {
    if (e.key === 'q') game.rotateLeft();
    if (e.key === 'e') game.rotateRight();

    //testing
    if (e.key === '1') game.inHand = lamp;
    if (e.key === '2') game.inHand = leaf;
    if (e.key === '3') game.inHand = wood;
    
    //debug
    if (e.key === 'p') {
        game.arcade.exportChunks()
        console.log("exportChunks")
    };
    if (e.key === 's') {
        game.arcade.saveChunks()
        console.log("saveChunks")
    }
    if (e.key === 'c') {
        caches.delete(game.arcade.worldName)
        console.log("delete cache")
    }
});

document.addEventListener('mousemove', function (e) {
    game.position.x = e.clientX;
    game.position.y = e.clientY;
});

window.addEventListener("mousedown", (e) => {
    if (e.button == 0) {game.destroy()};
    if (e.button == 1) {game.move()};
    if (e.button == 2) {game.interact()};
});

window.addEventListener("beforeunload", (e) => {
    if (game.arcade.isSaving) {e.preventDefault()};
});