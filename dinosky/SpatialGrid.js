export class SpatialGrid {
    constructor(cellSize = 16) {
        this.cellSize = Math.max(0.0001, Number.isFinite(cellSize) ? cellSize : 16);
        this.cells = new Map();
        this._queryStamp = 1;
    }

    clear() {
        this.cells.clear();
        this._queryStamp = 1;
    }

    getCellCoord(value) {
        return Math.floor(value / this.cellSize);
    }

    getCellKey(col, row) {
        return `${col}:${row}`;
    }

    insertAabb(item, minX, minY, maxX, maxY) {
        if (!item) {
            return;
        }

        const startCol = this.getCellCoord(Math.min(minX, maxX));
        const endCol = this.getCellCoord(Math.max(minX, maxX));
        const startRow = this.getCellCoord(Math.min(minY, maxY));
        const endRow = this.getCellCoord(Math.max(minY, maxY));

        for (let row = startRow; row <= endRow; row += 1) {
            for (let col = startCol; col <= endCol; col += 1) {
                const key = this.getCellKey(col, row);
                let bucket = this.cells.get(key);
                if (!bucket) {
                    bucket = [];
                    this.cells.set(key, bucket);
                }
                bucket.push(item);
            }
        }
    }

    queryAabb(minX, minY, maxX, maxY, out = []) {
        const stamp = this._queryStamp++;
        const startCol = this.getCellCoord(Math.min(minX, maxX));
        const endCol = this.getCellCoord(Math.max(minX, maxX));
        const startRow = this.getCellCoord(Math.min(minY, maxY));
        const endRow = this.getCellCoord(Math.max(minY, maxY));

        for (let row = startRow; row <= endRow; row += 1) {
            for (let col = startCol; col <= endCol; col += 1) {
                const bucket = this.cells.get(this.getCellKey(col, row));
                if (!bucket) {
                    continue;
                }

                for (const item of bucket) {
                    if (item.__spatialGridQueryStamp === stamp) {
                        continue;
                    }
                    item.__spatialGridQueryStamp = stamp;
                    out.push(item);
                }
            }
        }

        return out;
    }

    queryPoint(x, y, out = []) {
        return this.queryAabb(x, y, x, y, out);
    }
}
