// Unit-Tests fuer die reinen Editor-Funktionen. Lauft unter dem CRA-Test-Runner
// (react-scripts test). Alternativ als Node-Skript: ops/test-engine.cjs.

import {
    newDoc,
    normalizeDoc,
    fieldAt,
    edgeAt,
    edgeKey,
    floodFill,
    brushCells,
    UndoStack,
    objectAt,
    clone,
    setFloor,
    getFloor,
} from './engine';

describe('engine.fieldAt', () => {
    const doc = newDoc(10, 8);
    test('Innen -> {col,row}', () => {
        expect(fieldAt(doc, 3.4, 2.1)).toEqual({ col: 3, row: 2 });
    });
    test('Rand (links/oben) -> {0,0}', () => {
        expect(fieldAt(doc, 0, 0)).toEqual({ col: 0, row: 0 });
    });
    test('Ausserhalb -> null', () => {
        expect(fieldAt(doc, -0.1, 2)).toBeNull();
        expect(fieldAt(doc, 10, 2)).toBeNull();
        expect(fieldAt(doc, 2, 8)).toBeNull();
    });
});

describe('engine.edgeAt', () => {
    const doc = newDoc(10, 8);
    test('Nahe horizontaler Kante', () => {
        const e = edgeAt(doc, 3.5, 2.03);
        expect(e).not.toBeNull();
        expect(e!.a).toEqual([3, 2]);
        expect(e!.b).toEqual([4, 2]);
    });
    test('Nahe vertikaler Kante', () => {
        const e = edgeAt(doc, 3.01, 2.5);
        expect(e).not.toBeNull();
        expect(e!.a).toEqual([3, 2]);
        expect(e!.b).toEqual([3, 3]);
    });
    test('Mittendrin -> null (zu weit weg)', () => {
        expect(edgeAt(doc, 3.5, 2.5)).toBeNull();
    });
    test('edgeKey ist richtungsunabhaengig', () => {
        expect(edgeKey([3, 2], [4, 2])).toBe(edgeKey([4, 2], [3, 2]));
    });
});

describe('engine.floodFill', () => {
    test('Fuellt zusammenhaengendes Gebiet, stoppt an anderem Material', () => {
        const doc = newDoc(5, 4);
        // 5x4 Grid, Material 1 als "Wand" setzen
        setFloor(doc, 2, 0, 1);
        setFloor(doc, 2, 1, 1);
        setFloor(doc, 2, 2, 1);
        setFloor(doc, 2, 3, 1);
        // Fuelle links von der Wand mit 2
        const next = floodFill(doc, 0, 0, 2);
        doc.floor = next;
        // links: alle Zellen x<2 -> 2
        for (let y = 0; y < 4; y++) {
            for (let x = 0; x < 2; x++) {
                expect(getFloor(doc, x, y)).toBe(2);
            }
        }
        // Wand unveraendert
        for (let y = 0; y < 4; y++) expect(getFloor(doc, 2, y)).toBe(1);
        // Rechts unveraendert (alle 0)
        for (let y = 0; y < 4; y++) {
            for (let x = 3; x < 5; x++) {
                expect(getFloor(doc, x, y)).toBe(0);
            }
        }
    });
    test('Start-Material == Ziel-Material -> no-op', () => {
        const doc = newDoc(3, 3);
        const next = floodFill(doc, 0, 0, 0);
        expect(next).toEqual(doc.floor);
    });
});

describe('engine.brushCells', () => {
    const doc = newDoc(10, 10);
    test('radius=0 -> genau 1 Zelle', () => {
        const cells = brushCells(doc, 3, 3, 0);
        expect(cells).toEqual([[3, 3]]);
    });
    test('radius=1 -> grob kreuzfoermig (5 Zellen innen)', () => {
        const cells = brushCells(doc, 3, 3, 1);
        // Plus-Form: center + 4 Nachbarn
        expect(cells.length).toBeGreaterThanOrEqual(5);
        expect(cells).toContainEqual([3, 3]);
        expect(cells).toContainEqual([2, 3]);
        expect(cells).toContainEqual([4, 3]);
        expect(cells).toContainEqual([3, 2]);
        expect(cells).toContainEqual([3, 4]);
    });
    test('clippt am Rand', () => {
        const cells = brushCells(doc, 0, 0, 1);
        expect(cells).not.toContainEqual([-1, 0]);
        expect(cells).not.toContainEqual([0, -1]);
    });
});

describe('UndoStack', () => {
    test('push + undo + redo zyklus', () => {
        const stack = new UndoStack(10);
        const d0 = newDoc(4, 4);
        d0.floor[0] = 0;
        stack.push(d0);
        const d1 = clone(d0);
        d1.floor[0] = 1;
        stack.push(d1);
        const d2 = clone(d1);
        d2.floor[0] = 2;
        // d2 ist current. Undo -> d1
        const undone = stack.doUndo(d2);
        expect(undone).not.toBeNull();
        expect(undone!.floor[0]).toBe(1);
        // Redo -> d2 wiederherstellen
        const redone = stack.doRedo(undone!);
        expect(redone).not.toBeNull();
        expect(redone!.floor[0]).toBe(2);
    });

    test('push loescht redo', () => {
        const stack = new UndoStack(10);
        const d0 = newDoc(2, 2);
        stack.push(d0);
        const d1 = clone(d0);
        d1.floor[0] = 1;
        stack.doUndo(d1);
        expect(stack.canRedo()).toBe(true);
        const d2 = clone(d1);
        d2.floor[0] = 2;
        stack.push(d2);
        expect(stack.canRedo()).toBe(false);
    });

    test('Limit greift (aelteste rausgedraengt)', () => {
        const stack = new UndoStack(3);
        for (let i = 0; i < 10; i++) {
            const d = newDoc(2, 2);
            d.floor[0] = i;
            stack.push(d);
        }
        expect(stack.undo.length).toBe(3);
    });
});

describe('objectAt', () => {
    test('findet nahestes Objekt in Trefferradius', () => {
        const doc = newDoc(10, 10);
        doc.objects.push({ id: 'a', type: 'tree', x: 3, y: 3, rot: 0 });
        doc.objects.push({ id: 'b', type: 'rock', x: 7, y: 7, rot: 0 });
        expect(objectAt(doc, 3.1, 3.1)?.id).toBe('a');
        expect(objectAt(doc, 7.0, 7.0)?.id).toBe('b');
        expect(objectAt(doc, 5, 5)).toBeNull();
    });
});

describe('normalizeDoc', () => {
    test('kaputtes Input -> Default-Doc', () => {
        const n = normalizeDoc(null);
        expect(n.width).toBe(30);
        expect(n.height).toBe(20);
        expect(n.floor.length).toBe(600);
    });
    test('alte floor-Groesse falsch -> wird resetted', () => {
        const n = normalizeDoc({ width: 4, height: 4, floor: [1, 2, 3] });
        expect(n.floor.length).toBe(16);
    });
});
