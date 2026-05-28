import React, {
    ReactElement,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState
} from "react";
import { ScheduleBlock, BayGroup } from "./types";

// ─── Layout constants ─────────────────────────────────────────────────────────
const GROUP_H = 36;
const BAY_LABEL_W = 120;
const HEADER_H = 36;
const SCROLLBAR_W = 10;
const RESIZE_HIT = 6;
const MIN_BLOCK_MIN = 1;

// ─── Color palette ────────────────────────────────────────────────────────────
const C = {
    outerBg: "#f0ede8",
    headerBg: "#f5f2ed",
    headerText: "#777",
    headerBorder: "#dddbd5",

    groupBg: "#eeebe5",
    groupText: "#222",
    groupBorder: "#d8d5cf",
    groupAccent: "#c8c0b0",

    rowEven: "#ffffff",
    rowOdd: "#faf9f7",
    rowBorder: "#eeecea",
    labelBg: "#f7f5f2",
    labelText: "#555",
    labelBorder: "#dddbd5",

    gridMajor: "#dddbd5",
    gridMinor: "#f0ede8",
    dwellShade: "rgba(180,170,150,0.07)",

    blockScheduled: "#f5c518",
    blockScheduledText: "#6b4f00",
    blockInProgress: "#7ec87e",
    blockInProgressText: "#1a5218",
    blockCompleted: "#404040",
    blockCompletedText: "#ffffff",
    blockConflict: "#e53935",
    blockConflictText: "#ffffff",
    blockEdge: "rgba(0,0,0,0.18)",

    scrollTrack: "#e8e4de",
    scrollThumb: "#bbb8b2",
    scrollThumbHover: "#888",
};

// ─── Internal types ───────────────────────────────────────────────────────────

type DragMode = "move" | "resize-left" | "resize-right";

interface DragState {
    mode: DragMode;
    block: ScheduleBlock;
    startX: number;
    startY: number;
    origStart: number;
    origEnd: number;
    origRowIdx: number;
    pxPerMin: number;
    currentStart: number;
    currentEnd: number;
    currentRowIdx: number;
    moved: boolean;
}

interface CanvasRow {
    type: "group" | "bay";
    groupId: string;
    label: string;
    y: number;
    h: number;
    bayId?: string;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SchedulerCanvasProps {
    blocks: ScheduleBlock[];
    groups: BayGroup[];
    collapsedGroups: Set<string>;
    onGroupToggle: (groupId: string) => void;
    rowHeight: number;
    showDwellMarkers: boolean;
    defaultDwellMinutes: number;
    timeRangeStart: number;
    timeRangeEnd: number;
    onTruckClick: (block: ScheduleBlock) => void;
    onScheduleChange: (block: ScheduleBlock, newStartMin: number, newEndMin: number) => void;
    onEmptySlotClick: (bayId: string, startMin: number, endMin: number, defaultDwell: number) => void;
}

// ─── Helper: compute row layout ───────────────────────────────────────────────

function computeRows(
    groups: BayGroup[],
    collapsedGroups: Set<string>,
    hasMultipleGroups: boolean,
    rowH: number
): CanvasRow[] {
    const rows: CanvasRow[] = [];
    let y = 0;
    for (const g of groups) {
        if (hasMultipleGroups || g.id !== "__default__") {
            rows.push({ type: "group", groupId: g.id, label: g.label || g.id, y, h: GROUP_H });
            y += GROUP_H;
        }
        if (!collapsedGroups.has(g.id)) {
            for (const bayId of g.bays) {
                rows.push({ type: "bay", groupId: g.id, label: bayId, bayId, y, h: rowH });
                y += rowH;
            }
        }
    }
    return rows;
}

// ─── Time coordinate helpers ──────────────────────────────────────────────────

function minToX(min: number, rangeStart: number, rangeEnd: number, gridW: number): number {
    const rangeMins = (rangeEnd - rangeStart) * 60;
    return BAY_LABEL_W + ((min - rangeStart * 60) / rangeMins) * gridW;
}

function xToMin(x: number, rangeStart: number, rangeEnd: number, gridW: number): number {
    const rangeMins = (rangeEnd - rangeStart) * 60;
    return rangeStart * 60 + ((x - BAY_LABEL_W) / gridW) * rangeMins;
}

// ─── Draw helpers ─────────────────────────────────────────────────────────────

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
}

function drawHeader(
    ctx: CanvasRenderingContext2D,
    canvasW: number,
    rangeStart: number,
    rangeEnd: number,
    gridW: number,
    showDwell: boolean
): void {
    ctx.fillStyle = C.headerBg;
    ctx.fillRect(0, 0, canvasW, HEADER_H);

    ctx.fillStyle = C.headerText;
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Resource", BAY_LABEL_W / 2, HEADER_H / 2);

    ctx.strokeStyle = C.headerBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, HEADER_H - 0.5);
    ctx.lineTo(canvasW, HEADER_H - 0.5);
    ctx.stroke();

    ctx.strokeStyle = C.labelBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(BAY_LABEL_W - 0.5, 0);
    ctx.lineTo(BAY_LABEL_W - 0.5, HEADER_H);
    ctx.stroke();

    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";

    const pxPerMin = gridW / ((rangeEnd - rangeStart) * 60);

    for (let h = rangeStart; h <= rangeEnd; h++) {
        const x = minToX(h * 60, rangeStart, rangeEnd, gridW);
        ctx.strokeStyle = C.gridMajor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 4);
        ctx.lineTo(x, HEADER_H - 1);
        ctx.stroke();

        if (h < rangeEnd) {
            ctx.fillStyle = C.headerText;
            const labelX = x + 30 * pxPerMin;
            ctx.fillText(`${String(h).padStart(2, "0")}:00`, labelX, HEADER_H / 2);
        }
    }

    if (showDwell) {
        ctx.strokeStyle = C.gridMinor;
        ctx.lineWidth = 0.5;
        for (let m = rangeStart * 60 + 25; m < rangeEnd * 60; m += 25) {
            if (m % 60 === 0) continue;
            const x = minToX(m, rangeStart, rangeEnd, gridW);
            ctx.beginPath();
            ctx.moveTo(x, HEADER_H - 10);
            ctx.lineTo(x, HEADER_H - 1);
            ctx.stroke();
        }
    }
}

function drawGroupRow(ctx: CanvasRenderingContext2D, row: CanvasRow, canvasW: number, collapsed: boolean): void {
    ctx.fillStyle = C.groupBg;
    ctx.fillRect(0, row.y, canvasW, row.h);

    ctx.fillStyle = C.groupAccent;
    ctx.fillRect(0, row.y, 4, row.h);

    ctx.strokeStyle = C.groupBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, row.y + row.h - 0.5);
    ctx.lineTo(canvasW, row.y + row.h - 0.5);
    ctx.stroke();

    ctx.fillStyle = C.groupText;
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(row.label, 12, row.y + row.h / 2);

    ctx.fillStyle = C.groupText;
    ctx.font = "12px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(collapsed ? "▼" : "▲", canvasW - SCROLLBAR_W - 8, row.y + row.h / 2);
}

function drawBayRow(
    ctx: CanvasRenderingContext2D,
    row: CanvasRow,
    rowIdx: number,
    canvasW: number,
    rangeStart: number,
    rangeEnd: number,
    gridW: number,
    showDwell: boolean
): void {
    const y = row.y;
    const h = row.h;

    ctx.fillStyle = rowIdx % 2 === 0 ? C.rowEven : C.rowOdd;
    ctx.fillRect(BAY_LABEL_W, y, canvasW - BAY_LABEL_W - SCROLLBAR_W, h);

    ctx.fillStyle = C.labelBg;
    ctx.fillRect(0, y, BAY_LABEL_W, h);

    const pxPerMin = gridW / ((rangeEnd - rangeStart) * 60);

    if (showDwell) {
        ctx.fillStyle = C.dwellShade;
        for (let m = rangeStart * 60; m < rangeEnd * 60; m += 50) {
            const x = minToX(m, rangeStart, rangeEnd, gridW);
            ctx.fillRect(x, y, 25 * pxPerMin, h);
        }
    }

    ctx.strokeStyle = C.gridMajor;
    ctx.lineWidth = 0.5;
    for (let hh = rangeStart; hh <= rangeEnd; hh++) {
        const x = minToX(hh * 60, rangeStart, rangeEnd, gridW);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + h);
        ctx.stroke();
    }

    ctx.strokeStyle = C.rowBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y + h - 0.5);
    ctx.lineTo(canvasW - SCROLLBAR_W, y + h - 0.5);
    ctx.stroke();

    ctx.strokeStyle = C.labelBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(BAY_LABEL_W - 0.5, y);
    ctx.lineTo(BAY_LABEL_W - 0.5, y + h);
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y, BAY_LABEL_W - 2, h);
    ctx.clip();
    ctx.fillStyle = C.labelText;
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(row.label, BAY_LABEL_W / 2, y + h / 2);
    ctx.restore();
}

// ─── Luminance check for custom block colors ──────────────────────────────────

function relativeLuminance(hex: string): number {
    const clean = hex.replace("#", "");
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    const lin = (v: number) => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function blockColors(block: ScheduleBlock): { fill: string; text: string } {
    if (block.color) {
        // Pick white or dark text based on actual luminance — caller's hex color
        const lum = relativeLuminance(block.color);
        const text = lum > 0.179 ? "#333333" : "#ffffff";
        return { fill: block.color, text };
    }
    if (block.isConflict) {
        return { fill: C.blockConflict, text: C.blockConflictText };
    }
    const s = (block.status ?? "").toLowerCase().replace(/\s+/g, "");
    if (s === "inprogress" || s === "docked" || s === "arriving") {
        return { fill: C.blockInProgress, text: C.blockInProgressText };
    }
    if (s === "completed" || s === "done" || s === "departed") {
        return { fill: C.blockCompleted, text: C.blockCompletedText };
    }
    return { fill: C.blockScheduled, text: C.blockScheduledText };
}

function drawBlock(
    ctx: CanvasRenderingContext2D,
    block: ScheduleBlock,
    row: CanvasRow,
    startMin: number,
    endMin: number,
    rangeStart: number,
    rangeEnd: number,
    gridW: number,
    isDragging: boolean
): void {
    const rangeStartMin = rangeStart * 60;
    const rangeEndMin = rangeEnd * 60;

    const visStart = Math.max(startMin, rangeStartMin);
    const visEnd = Math.min(endMin, rangeEndMin);
    if (visStart >= visEnd) return;

    const bx = minToX(visStart, rangeStart, rangeEnd, gridW);
    const bxEnd = minToX(visEnd, rangeStart, rangeEnd, gridW);
    const bw = Math.max(2, bxEnd - bx);
    const by = row.y + 2;
    const bh = row.h - 4;

    if (bw < 1 || bh < 1) return;

    const { fill, text } = blockColors(block);

    ctx.globalAlpha = isDragging ? 0.75 : 1;

    drawRoundedRect(ctx, bx, by, bw, bh, 4);
    ctx.fillStyle = fill;
    ctx.fill();

    if (block.isConflict) {
        ctx.strokeStyle = "#b71c1c";
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    if (bw > RESIZE_HIT * 2 + 4) {
        ctx.fillStyle = C.blockEdge;
        ctx.fillRect(bx, by, RESIZE_HIT, bh);
        ctx.fillRect(bx + bw - RESIZE_HIT, by, RESIZE_HIT, bh);
    }

    if (bw > 22 && bh > 8) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(bx + RESIZE_HIT, by, bw - RESIZE_HIT * 2, bh);
        ctx.clip();
        ctx.fillStyle = text;
        ctx.font = `${Math.min(11, bh - 4)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(block.truckId, bx + bw / 2, by + bh / 2);
        ctx.restore();
    }

    ctx.globalAlpha = 1;
}

// ─── Main render function ─────────────────────────────────────────────────────

interface RenderParams {
    blocks: ScheduleBlock[];
    rows: CanvasRow[];
    bayRowMap: Map<string, CanvasRow>;
    collapsedGroups: Set<string>;
    scrollY: number;
    canvasW: number;
    canvasH: number;
    rowH: number;
    showDwell: boolean;
    drag: DragState | null;
    rangeStart: number;
    rangeEnd: number;
}

function renderCanvas(ctx: CanvasRenderingContext2D, p: RenderParams): void {
    const { blocks, rows, bayRowMap, collapsedGroups, scrollY, canvasW, canvasH, showDwell, drag, rangeStart, rangeEnd } = p;
    const gridW = canvasW - BAY_LABEL_W - SCROLLBAR_W;
    const viewH = canvasH - HEADER_H;

    ctx.clearRect(0, 0, canvasW, canvasH);

    ctx.fillStyle = C.outerBg;
    ctx.fillRect(0, 0, canvasW, canvasH);

    drawHeader(ctx, canvasW, rangeStart, rangeEnd, gridW, showDwell);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, HEADER_H, canvasW, viewH);
    ctx.clip();
    ctx.translate(0, HEADER_H - scrollY);

    const viewTop = scrollY;
    const viewBot = scrollY + viewH;

    let bayRowIdx = 0;
    for (const row of rows) {
        if (row.y + row.h <= viewTop) {
            if (row.type === "bay") bayRowIdx++;
            continue;
        }
        if (row.y >= viewBot) break;

        if (row.type === "group") {
            drawGroupRow(ctx, row, canvasW, collapsedGroups.has(row.groupId));
        } else {
            drawBayRow(ctx, row, bayRowIdx, canvasW, rangeStart, rangeEnd, gridW, showDwell);
            bayRowIdx++;
        }
    }

    const rangeStartMin = rangeStart * 60;
    const rangeEndMin = rangeEnd * 60;

    for (const block of blocks) {
        let startMin = block.startMin;
        let endMin = block.endMin;
        let row = bayRowMap.get(block.bayId);

        if (!row) continue;

        if (drag && drag.block.item === block.item) {
            startMin = drag.currentStart;
            endMin = drag.currentEnd;
            const dragRow = rows[drag.currentRowIdx];
            if (dragRow && dragRow.type === "bay") {
                row = dragRow;
            }
        }

        if (endMin <= rangeStartMin || startMin >= rangeEndMin) continue;
        if (row.y + row.h <= viewTop || row.y >= viewBot) continue;

        drawBlock(ctx, block, row, startMin, endMin, rangeStart, rangeEnd, gridW, drag?.block.item === block.item);
    }

    ctx.restore();
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SchedulerCanvas({
    blocks,
    groups,
    collapsedGroups,
    onGroupToggle,
    rowHeight,
    showDwellMarkers,
    defaultDwellMinutes,
    timeRangeStart,
    timeRangeEnd,
    onTruckClick,
    onScheduleChange,
    onEmptySlotClick
}: SchedulerCanvasProps): ReactElement {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [canvasW, setCanvasW] = useState(1200);
    const [canvasH, setCanvasH] = useState(560);
    const [scrollY, setScrollY] = useState(0);
    const scrollYRef = useRef(0);
    const dragRef = useRef<DragState | null>(null);
    const rafRef = useRef<number>(0);
    const scrollThumbDragRef = useRef<{ startY: number; startScrollY: number } | null>(null);

    // Stable refs for callbacks used inside global event handlers
    const rowsRef = useRef<CanvasRow[]>([]);
    const timeRangeRef = useRef({ start: timeRangeStart, end: timeRangeEnd });
    const canvasWRef = useRef(canvasW);
    const onTruckClickRef = useRef(onTruckClick);
    const onScheduleChangeRef = useRef(onScheduleChange);
    const onEmptySlotClickRef = useRef(onEmptySlotClick);
    const defaultDwellRef = useRef(defaultDwellMinutes);

    // Keep stable refs in sync
    useEffect(() => { timeRangeRef.current = { start: timeRangeStart, end: timeRangeEnd }; }, [timeRangeStart, timeRangeEnd]);
    useEffect(() => { canvasWRef.current = canvasW; }, [canvasW]);
    useEffect(() => { onTruckClickRef.current = onTruckClick; }, [onTruckClick]);
    useEffect(() => { onScheduleChangeRef.current = onScheduleChange; }, [onScheduleChange]);
    useEffect(() => { onEmptySlotClickRef.current = onEmptySlotClick; }, [onEmptySlotClick]);
    useEffect(() => { defaultDwellRef.current = defaultDwellMinutes; }, [defaultDwellMinutes]);

    const hasMultipleGroups = groups.length > 1 || (groups.length === 1 && groups[0]?.id !== "__default__");

    const rows = useMemo(
        () => computeRows(groups, collapsedGroups, hasMultipleGroups, rowHeight),
        [groups, collapsedGroups, hasMultipleGroups, rowHeight]
    );

    // Keep rowsRef in sync for use in global event handlers
    useEffect(() => { rowsRef.current = rows; }, [rows]);

    const totalH = useMemo(() => {
        if (rows.length === 0) return 0;
        const last = rows[rows.length - 1];
        return last.y + last.h;
    }, [rows]);

    const bayRowMap = useMemo(() => {
        const m = new Map<string, CanvasRow>();
        for (const r of rows) {
            if (r.type === "bay" && r.bayId) m.set(r.bayId, r);
        }
        return m;
    }, [rows]);

    const updateScrollY = useCallback(
        (y: number) => {
            const maxScroll = Math.max(0, totalH - (canvasH - HEADER_H));
            const clamped = Math.max(0, Math.min(maxScroll, y));
            scrollYRef.current = clamped;
            setScrollY(clamped);
        },
        [totalH, canvasH]
    );

    useLayoutEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const obs = new ResizeObserver(entries => {
            const { width, height } = entries[0].contentRect;
            setCanvasW(Math.floor(width) - SCROLLBAR_W);
            setCanvasH(Math.max(100, Math.floor(height)));
        });
        obs.observe(el);
        return () => obs.disconnect();
    }, []);

    const drawCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        renderCanvas(ctx, {
            blocks,
            rows,
            bayRowMap,
            collapsedGroups,
            scrollY: scrollYRef.current,
            canvasW,
            canvasH,
            rowH: rowHeight,
            showDwell: showDwellMarkers,
            drag: dragRef.current,
            rangeStart: timeRangeStart,
            rangeEnd: timeRangeEnd
        });
    }, [blocks, rows, bayRowMap, collapsedGroups, canvasW, canvasH, rowHeight, showDwellMarkers, timeRangeStart, timeRangeEnd]);

    useEffect(() => { drawCanvas(); }, [drawCanvas]);

    useEffect(() => {
        updateScrollY(scrollYRef.current);
    }, [totalH, canvasH, updateScrollY]);

    // Non-passive wheel handler — React 17+ synthetic onWheel cannot prevent
    // the default page scroll. Must attach directly with passive:false.
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const handler = (e: WheelEvent) => {
            e.preventDefault();
            const maxScroll = Math.max(0, totalH - (canvasH - HEADER_H));
            const clamped = Math.max(0, Math.min(maxScroll, scrollYRef.current + e.deltaY));
            scrollYRef.current = clamped;
            setScrollY(clamped);
        };
        canvas.addEventListener("wheel", handler, { passive: false });
        return () => canvas.removeEventListener("wheel", handler);
    }, [totalH, canvasH]);

    // ─── Hit testing ──────────────────────────────────────────────────────────

    const hitTestRow = useCallback(
        (canvasY: number): CanvasRow | null => {
            const worldY = canvasY - HEADER_H + scrollYRef.current;
            for (const row of rows) {
                if (worldY >= row.y && worldY < row.y + row.h) return row;
                if (row.y > worldY) break;
            }
            return null;
        },
        [rows]
    );

    const hitTestBlock = useCallback(
        (canvasX: number, canvasY: number): { block: ScheduleBlock; mode: DragMode } | null => {
            if (canvasY < HEADER_H) return null;
            const row = hitTestRow(canvasY);
            if (!row || row.type !== "bay" || !row.bayId) return null;

            const gridW = canvasW - BAY_LABEL_W - SCROLLBAR_W;
            const rangeStartMin = timeRangeStart * 60;
            const rangeEndMin = timeRangeEnd * 60;

            for (let i = blocks.length - 1; i >= 0; i--) {
                const b = blocks[i];
                if (b.bayId !== row.bayId) continue;

                const visStart = Math.max(b.startMin, rangeStartMin);
                const visEnd = Math.min(b.endMin, rangeEndMin);
                if (visStart >= visEnd) continue;

                const bx = minToX(visStart, timeRangeStart, timeRangeEnd, gridW);
                const bxEnd = minToX(visEnd, timeRangeStart, timeRangeEnd, gridW);
                const bw = Math.max(2, bxEnd - bx);
                const by = row.y - scrollYRef.current + HEADER_H + 2;
                const bh = row.h - 4;

                if (canvasX >= bx && canvasX <= bx + bw && canvasY >= by && canvasY <= by + bh) {
                    if (canvasX <= bx + RESIZE_HIT) return { block: b, mode: "resize-left" };
                    if (canvasX >= bx + bw - RESIZE_HIT) return { block: b, mode: "resize-right" };
                    return { block: b, mode: "move" };
                }
            }
            return null;
        },
        [blocks, canvasW, timeRangeStart, timeRangeEnd, hitTestRow]
    );

    const canvasCoords = useCallback((e: MouseEvent | React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }, []);

    // ─── Global drag handlers (attached on drag start, removed on drag end) ───
    // Using stable refs so we can remove the exact same function references.
    const globalMoveRef = useRef<((e: MouseEvent) => void) | null>(null);
    const globalUpRef = useRef<((e: MouseEvent) => void) | null>(null);

    const detachGlobalDragListeners = useCallback(() => {
        if (globalMoveRef.current) {
            window.removeEventListener("mousemove", globalMoveRef.current);
            globalMoveRef.current = null;
        }
        if (globalUpRef.current) {
            window.removeEventListener("mouseup", globalUpRef.current);
            globalUpRef.current = null;
        }
    }, []);

    // Draw ref is needed inside global handlers that are defined once
    const drawCanvasRef = useRef(drawCanvas);
    useEffect(() => { drawCanvasRef.current = drawCanvas; }, [drawCanvas]);

    const attachGlobalDragListeners = useCallback(() => {
        const onGlobalMove = (e: MouseEvent) => {
            const drag = dragRef.current;
            if (!drag) return;

            const { x, y } = canvasCoords(e);
            const dx = x - drag.startX;

            if (Math.abs(dx) > 3 || Math.abs(y - drag.startY) > 3) drag.moved = true;
            if (!drag.moved) return;

            const { start: rsStart, end: rsEnd } = timeRangeRef.current;
            const deltaMin = dx / drag.pxPerMin;
            const rangeStartMin = rsStart * 60;
            const rangeEndMin = rsEnd * 60;

            if (drag.mode === "move") {
                const dur = drag.origEnd - drag.origStart;
                const ns = Math.max(rangeStartMin, Math.min(rangeEndMin - dur, drag.origStart + deltaMin));
                drag.currentStart = ns;
                drag.currentEnd = ns + dur;

                const worldY = y - HEADER_H + scrollYRef.current;
                const currentRows = rowsRef.current;
                const bayRows = currentRows.filter(r => r.type === "bay");
                let newRowIdx = drag.origRowIdx;
                for (let i = 0; i < bayRows.length; i++) {
                    if (worldY >= bayRows[i].y && worldY < bayRows[i].y + bayRows[i].h) {
                        const globalIdx = currentRows.findIndex(r => r === bayRows[i]);
                        if (globalIdx >= 0) newRowIdx = globalIdx;
                        break;
                    }
                }
                drag.currentRowIdx = newRowIdx;
            } else if (drag.mode === "resize-left") {
                drag.currentStart = Math.max(rangeStartMin, Math.min(drag.origEnd - MIN_BLOCK_MIN, drag.origStart + deltaMin));
            } else {
                drag.currentEnd = Math.min(rangeEndMin, Math.max(drag.origStart + MIN_BLOCK_MIN, drag.origEnd + deltaMin));
            }

            cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(() => drawCanvasRef.current());
        };

        const onGlobalUp = (_e: MouseEvent) => {
            detachGlobalDragListeners();
            const drag = dragRef.current;
            dragRef.current = null;

            if (!drag) {
                drawCanvasRef.current();
                return;
            }

            if (!drag.moved) {
                onTruckClickRef.current(drag.block);
            } else {
                const currentRows = rowsRef.current;
                const targetRow = currentRows[drag.currentRowIdx];
                const finalBayId =
                    targetRow?.type === "bay" && targetRow.bayId ? targetRow.bayId : drag.block.bayId;
                onScheduleChangeRef.current(
                    { ...drag.block, bayId: finalBayId },
                    Math.round(drag.currentStart),
                    Math.round(drag.currentEnd)
                );
            }

            // Reset cursor
            const canvas = canvasRef.current;
            if (canvas) canvas.style.cursor = "default";

            drawCanvasRef.current();
        };

        globalMoveRef.current = onGlobalMove;
        globalUpRef.current = onGlobalUp;
        window.addEventListener("mousemove", onGlobalMove);
        window.addEventListener("mouseup", onGlobalUp);
    }, [canvasCoords, detachGlobalDragListeners]);

    // Remove global listeners on unmount
    useEffect(() => () => detachGlobalDragListeners(), [detachGlobalDragListeners]);

    // ─── Canvas mouse events ──────────────────────────────────────────────────

    const handleMouseDown = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            if (e.button !== 0) return;
            const { x, y } = canvasCoords(e);

            if (y >= HEADER_H) {
                const row = hitTestRow(y);
                if (row?.type === "group") {
                    onGroupToggle(row.groupId);
                    return;
                }
            }

            const hit = hitTestBlock(x, y);
            const gridW = canvasW - BAY_LABEL_W - SCROLLBAR_W;
            const pxPerMin = gridW / ((timeRangeEnd - timeRangeStart) * 60);

            if (hit) {
                const rowIdx = rows.findIndex(r => r.type === "bay" && r.bayId === hit.block.bayId);
                dragRef.current = {
                    mode: hit.mode,
                    block: hit.block,
                    startX: x,
                    startY: y,
                    origStart: hit.block.startMin,
                    origEnd: hit.block.endMin,
                    origRowIdx: rowIdx,
                    pxPerMin,
                    currentStart: hit.block.startMin,
                    currentEnd: hit.block.endMin,
                    currentRowIdx: rowIdx,
                    moved: false
                };
                // Attach global handlers so drag survives leaving the canvas
                attachGlobalDragListeners();
            }
        },
        [hitTestRow, hitTestBlock, canvasCoords, canvasW, timeRangeStart, timeRangeEnd, rows, onGroupToggle, attachGlobalDragListeners]
    );

    // Canvas-level mousemove only updates cursor; actual drag is handled globally
    const handleMouseMove = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            if (dragRef.current) return; // global handler owns this
            const { x, y } = canvasCoords(e);
            const canvas = canvasRef.current;
            if (!canvas) return;

            const row = hitTestRow(y);
            if (row?.type === "group") {
                canvas.style.cursor = "pointer";
            } else {
                const hit = hitTestBlock(x, y);
                canvas.style.cursor =
                    hit?.mode === "resize-left" || hit?.mode === "resize-right"
                        ? "ew-resize"
                        : hit?.mode === "move"
                        ? "grab"
                        : "default";
            }
        },
        [canvasCoords, hitTestRow, hitTestBlock]
    );

    // Click on empty slot — fires only on left-click, only when no drag started
    const handleMouseUp = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            // Only process left-click; right/middle click must not create slots
            if (e.button !== 0) return;
            // If a drag was active, global handler already committed it
            if (dragRef.current) return;

            const { x, y } = canvasCoords(e);

            if (y > HEADER_H && x > BAY_LABEL_W) {
                const row = hitTestRow(y);
                if (row?.type === "bay" && row.bayId) {
                    const gridW = canvasW - BAY_LABEL_W - SCROLLBAR_W;
                    const startMin = Math.round(xToMin(x, timeRangeStart, timeRangeEnd, gridW));
                    const clampedStart = Math.max(
                        timeRangeStart * 60,
                        Math.min(timeRangeEnd * 60 - defaultDwellMinutes, startMin)
                    );
                    onEmptySlotClick(row.bayId, clampedStart, clampedStart + defaultDwellMinutes, defaultDwellMinutes);
                }
            }
            drawCanvas();
        },
        [canvasCoords, hitTestRow, canvasW, timeRangeStart, timeRangeEnd, defaultDwellMinutes, onEmptySlotClick, drawCanvas]
    );

    const handleMouseLeave = useCallback(() => {
        // Drag is managed globally — do NOT cancel it here.
        // Only reset cursor when not dragging.
        if (!dragRef.current) {
            const canvas = canvasRef.current;
            if (canvas) canvas.style.cursor = "default";
        }
    }, []);

    // ─── Custom scrollbar ──────────────────────────────────────────────────────

    const viewportH = canvasH - HEADER_H;
    const thumbH = Math.max(24, totalH > 0 ? Math.floor((viewportH / totalH) * viewportH) : viewportH);
    const thumbTop = totalH > viewportH
        ? Math.floor((scrollY / (totalH - viewportH)) * (viewportH - thumbH))
        : 0;

    const handleScrollbarClick = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            const clickY = e.clientY - rect.top - HEADER_H;
            const ratio = Math.max(0, Math.min(1, clickY / (viewportH - thumbH)));
            updateScrollY(ratio * (totalH - viewportH));
        },
        [viewportH, totalH, thumbH, updateScrollY]
    );

    const handleThumbMouseDown = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            scrollThumbDragRef.current = { startY: e.clientY, startScrollY: scrollYRef.current };
            const onMove = (mv: MouseEvent) => {
                const td = scrollThumbDragRef.current;
                if (!td) return;
                const dy = mv.clientY - td.startY;
                const scale = totalH > viewportH ? (totalH - viewportH) / (viewportH - thumbH) : 1;
                updateScrollY(td.startScrollY + dy * scale);
            };
            const onUp = () => {
                scrollThumbDragRef.current = null;
                window.removeEventListener("mousemove", onMove);
                window.removeEventListener("mouseup", onUp);
            };
            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
        },
        [totalH, viewportH, thumbH, updateScrollY]
    );

    return (
        <div
            ref={containerRef}
            className="truck-scheduler__canvas-container"
            style={{ display: "flex", flexDirection: "row" }}
        >
            <canvas
                ref={canvasRef}
                width={canvasW}
                height={canvasH}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
                style={{ display: "block", userSelect: "none" }}
            />
            <div
                className="truck-scheduler__scrollbar"
                style={{ height: canvasH, position: "relative" }}
                onClick={handleScrollbarClick}
            >
                <div
                    className="truck-scheduler__scrollbar-thumb"
                    style={{ top: HEADER_H + thumbTop, height: thumbH }}
                    onMouseDown={handleThumbMouseDown}
                />
            </div>
        </div>
    );
}
