self.onmessage = function (e) {
    const task = e.data;
    switch (task.type) {
        case "sortVoxels":
            self.postMessage({ type: "sortVoxelsDone", voxelsArray: sortVoxelsTask(task) });
            break;
        case "rotateDirection":
            self.postMessage({ type: "rotateDirectionDone", message: "None" });
            break;
        default:
            self.postMessage({ type: "error", message: "Unknown task" });
    }
};

function sortVoxelsTask(task) {
    const {
        solidArray,
        canvasWidth,
        canvasHeight,
        camX,
        camY,
        camHalfWidth,
        camHalfHeight,
        canvasBorderX,
        canvasBorderY,
        xAxis,
        yAxis,
        zAxis,
        xFactor,
        yFactorZ,
        yFactor,
        chunks
    } = task;

    const visibilityMap = new Map();
    const nonSolid = [];

    const encodeKey = (dy, dz) => ((dy + 1024) << 12) | (dz + 1024);

    for (const chunk of chunks) {
        for (const [x, yMap] of chunk) {
            for (const [y, zMap] of yMap) {
                for (const [z, voxel] of zMap) {
                    const worldX = (x - camX) * xAxis;
                    const worldY = (y - camY) * yAxis;
                    const worldZ = (z) * zAxis;
                    const isoX = Math.ceil(xFactor * (worldX - worldY) + camHalfWidth);
                    const isoY = Math.ceil(-worldZ * yFactorZ + (worldX + worldY) * yFactor + camHalfHeight);

                    if (isoX + canvasBorderX < 0 || isoY + canvasBorderY < 0 || isoX - canvasBorderX > canvasWidth || isoY - canvasBorderY > canvasHeight) continue;

                    const magnitude = worldX + worldY + worldZ;
                    const dy = worldY - worldX;
                    const dz = worldZ - worldX;
                    const key = encodeKey(dy, dz);

                    if (solidArray[voxel] === 10) {
                        const existing = visibilityMap.get(key);
                        if (!existing || magnitude > existing[4]) {
                            visibilityMap.set(key, [x, y, z, voxel, magnitude, isoX, isoY]);
                        }
                    } else {
                        nonSolid.push([x, y, z, voxel, magnitude, isoX, isoY, key]);
                    }
                }
            }
        }
    }

    const filtered = [];

    for (const [x, y, z, voxel, magnitude, isoX, isoY, key] of nonSolid) {
        const existing = visibilityMap.get(key);
        if (!existing || magnitude > existing[4]) {
            filtered.push([x, y, z, voxel, magnitude, isoX, isoY]);
        }
    }

    const voxelsArray = [...visibilityMap.values(), ...filtered];
    voxelsArray.sort((a, b) => ((a[2] - b[2]) * zAxis) || ((a[0] * xAxis + a[1] * yAxis) - (b[0] * xAxis+ b[1] * yAxis)));
    return voxelsArray;
}