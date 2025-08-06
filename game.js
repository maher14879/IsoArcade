const { Arcade, Voxel, Biome, Game } = await import('https://cdn.jsdelivr.net/gh/maher14879/IsoArcade@main/isoarcade.js');

const dirt = new Voxel("dirt", [[[1,4], [1, 5], [1,3]]], undefined, undefined, undefined);
const grassDirt = new Voxel("grass_dirt", [[[1,1], [1, 2], [1,0]]], undefined, undefined, undefined);
const stone = new Voxel("stone", [[[2,4], [2, 5], [2,3]]], undefined, undefined, undefined);
const mossyStone = new Voxel("mossy_stone", [[[3,4], [3, 5], [3,3]]], undefined, undefined, undefined);
const sand = new Voxel("sand", [[[3,1], [3, 2], [3,0]]], undefined, undefined, undefined);
const wood = new Voxel("wood", [[[2,1], [2, 2], [2,0]]], undefined, undefined, undefined);
const water = new Voxel("water", [[0, 1]], undefined, 2, undefined);
const leaf = new Voxel("leaf", [[0, 0]], undefined, 1, undefined);
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

    return h * 6;
}

function noise(x, y) {
    return 0.5 + 0.5 * Math.sin(x * 0.327 + Math.cos(y * 0.339) * 3.55);
}

const plains = new Biome(10, 20, noise, plainsNoise)

plains.addVoxel(sand, 1, true, 0, 0, true, -1, -1)
plains.addVoxel(sand, 1, true, 0, 3, false, 0, 1)
plains.addVoxel(lilly, 0.01, true, 3, 3, true, 1, 1, 2)
plains.addVoxel(smallLilly, 0.04, true, 3, 3, true, 1, 1, 1)
plains.addVoxel(dirt, 1, false, 0, 50, false, -1, -1)
plains.addVoxel(grassDirt, 0.8, true, 3, 50, true, 0, 0)
plains.addVoxel(grass, 0.3, true, 5, 50, true, 1, 1)
plains.addVoxel(cornFlower, 0.01, true, 5, 50, true, 1, 1)
plains.addVoxel(daisy, 0.01, true, 5, 50, true, 1, 1)
plains.addVoxel(water, 1, false, 0, 2, true, -1, -1)
plains.addStructure("small_tree", 0.0005, 0, 7, grassDirt)
plains.addStructure("tree", 0.0002, 7, 50, grassDirt)

function desertNoise(x, y) {
    let h = 0;
    const octaves = 3;
    const scale = 0.01;
    const persistence = 0.05;

    for (let i = 0; i < octaves; i++) {
        const freq = Math.pow(2, i);
        const amp = Math.pow(persistence, i);
        h += amp * (Math.sin(x * scale * freq) * Math.cos(y * scale * freq));
    }

    return h * 20 + 7;
}

const desert = new Biome(20, 5, noise, desertNoise)
desert.addVoxel(sand, 1, false, 0, 30, false, -1, -1)
desert.addVoxel(sand, 1, false, 0, 2, true, -1, -1)
desert.addVoxel(root, 0.005, true, 5, 50, true, 1, 1)
desert.addVoxel(plant, 0.01, true, 5, 50, true, 1, 1)

function mountainNoise(x, y) {
    let h = 0;
    const octaves = 4;
    const scale = 0.05;
    const persistence = 0.4;

    for (let i = 0; i < octaves; i++) {
        const freq = Math.pow(2, i);
        const amp = Math.pow(persistence, i);
        h += amp * (Math.sin(x * scale * freq) * Math.cos(y * scale * freq));
    }

    return h * 35;
}

const rockyShore = new Biome(3, 15, noise, mountainNoise)
rockyShore.addVoxel(stone, 1, false, 0, 50, false, -1, -1)
rockyShore.addVoxel(mossyStone, 0.3, true, 10, 30, false, -1, -1)
rockyShore.addVoxel(grassDirt, 0.7, true, 0, 20, false, 0, 0)
rockyShore.addVoxel(grass, 0.3, true, 3, 15, true, 1, 1)
rockyShore.addVoxel(poppy, 0.01, true, 3, 15, true, 1, 1)
rockyShore.addVoxel(stone, 1, false, 0, 0, true, -1, -1)
rockyShore.addVoxel(mossyStone, 0.5, true, 0, 0, false, -1, -1)
rockyShore.addVoxel(water, 1, false, 0, 2, true, -1, -1)

const superFlat = new Biome(0, 0, noise, noise)
superFlat.addVoxel(stone, 0.01, false, 0, 0, true, -1, -1)

const biomes = [
    rockyShore, 
    desert, 
    plains
]

function climate(x, y) {
    // Helper functions for noise generation
    function intNoise(x, y) {
        // Convert to 32-bit integers
        x = x | 0;
        y = y | 0;
        // Simple hash using bit operations
        let h = (x * 374761393) + (y * 668265263);
        h = (h ^ (h >> 15)) * 2246822519;
        h = (h ^ (h >> 13)) * 3266489917;
        return (h ^ (h >> 16)) >>> 0;
    }

    function lerp(a, b, t) {
        return a + t * (b - a); // Linear interpolation
    }

    function smoothNoise(x, y) {
        const x0 = Math.floor(x), y0 = Math.floor(y);
        const x1 = x0 + 1, y1 = y0 + 1;
        const fx = x - x0, fy = y - y0;
        
        // Get noise values at integer coordinates
        const n00 = intNoise(x0, y0);
        const n10 = intNoise(x1, y0);
        const n01 = intNoise(x0, y1);
        const n11 = intNoise(x1, y1);
        
        // Normalize values to [-1, 1] range
        const g00 = (n00 / 2147483647) - 1;
        const g10 = (n10 / 2147483647) - 1;
        const g01 = (n01 / 2147483647) - 1;
        const g11 = (n11 / 2147483647) - 1;
        
        // Bilinear interpolation
        const nx0 = lerp(g00, g10, fx);
        const nx1 = lerp(g01, g11, fx);
        return lerp(nx0, nx1, fy);
    }

    // Climate parameters
    const tempRange = [-10, 40];
    const humidRange = [0, 100];
    const tempAverage = (tempRange[0] + tempRange[1]) / 2;
    const humidAverage = (humidRange[0] + humidRange[1]) / 2;
    const freq = 0.02;
    
    // Generate noise values with spatial offsets
    const tempNoise = smoothNoise(x * freq, y * freq);
    const humidNoise = smoothNoise((x + 1000) * freq, (y + 1000) * freq);
    
    // Calculate final values (same amplitude logic as original)
    const temp = tempAverage + tempNoise * tempAverage;
    const humid = humidAverage + humidNoise * humidAverage;
    
    return [temp, humid];
}

const textureSource = 'https://cdn.jsdelivr.net/gh/maher14879/IsoArcade@main/assets/texture_sheet.png';
const structureIdArray = [
    "small_tree",
    "tree"
];

const game = new Game(voxels, biomes, climate, 4, 16, 16, textureSource, structureIdArray);

await game.init("test_world");
game.taskLoop();
requestAnimationFrame(game.gameLoop);

window.addEventListener("keyup", (e) => {
    if (e.key === 'q') game.rotateLeft();
    if (e.key === 'e') game.rotateRight();
    if (e.key === 'z') game.rotateFlip();

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

    if (e.key === "m") {
        game.move()
        console.log("move")
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