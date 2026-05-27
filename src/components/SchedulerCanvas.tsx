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
    origRowIdx: number;   // index in rows[] of the bay row where drag started
    pxPerMin: number;
    currentStart: number;
    currentEnd: number;
    currentRowIdx: number; // index in rows[] of the bay row currently under cursor
    moved: boolean;
}

interface CanvasRow {
    type: "group" | "bay";
    groupId: string;
    label: string;
    y: number;
    h: number;
    bayId?: string; // only for type === "bay"
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
    timeRangeStart: number;   // 0-23
    timeRangeEnd: number;     // 1-24
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

function minToX(
    min: number,
    rangeStart: number,
    rangeEnd: number,
    gridW: number
): number {
    const rangeMins = (rangeEnd - rangeStart) * 60;
    return BAY_LABEL_W + ((min - rangeStart * 60) / rangeMins) * gridW;
}

function xToMin(
    x: number,
    rangeStart: number,
    rangeEnd: number,
    gridW: number
): number {
    const rangeMins = (rangeEnd - rangeStart) * 60;
    return rangeStart * 60 + ((x - BAY_LABEL_W) / gridW) * rangeMins;
}

// ─── Draw helpers ─────────────────────────────────────────────────────────────

function drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
): void {
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
    // Background
    ctx.fillStyle = C.headerBg;
    ctx.fillRect(0, 0, canvasW, HEADER_H);

    // "Resource" label in label column
    ctx.fillStyle = C.headerText;
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Resource", BAY_LABEL_W / 2, HEADER_H / 2);

    // Bottom border
    ctx.strokeStyle = C.headerBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, HEADER_H - 0.5);
    ctx.lineTo(canvasW, HEADER_H - 0.5);
    ctx.stroke();

    // Right border of label column
    ctx.strokeStyle = C.labelBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(BAY_LABEL_W - 0.5, 0);
    ctx.lineTo(BAY_LABEL_W - 0.5, HEADER_H);
    ctx.stroke();

    // Hour labels and gridlines
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

    // 25-min dwell ticks in header
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

function drawGroupRow(
    ctx: CanvasRenderingContext2D,
    row: CanvasRow,
    canvasW: number,
    collapsed: boolean
): void {
    // Background
    ctx.fillStyle = C.groupBg;
    ctx.fillRect(0, row.y, canvasW, row.h);

    // Left accent border (4px)
    ctx.fillStyle = C.groupAccent;
    ctx.fillRect(0, row.y, 4, row.h);

    // Bottom border
    ctx.strokeStyle = C.groupBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, row.y + row.h - 0.5);
    ctx.lineTo(canvasW, row.y + row.h - 0.5);
    ctx.stroke();

    // Label text
    ctx.fillStyle = C.groupText;
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(row.label, 12, row.y + row.h / 2);

    // Chevron
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

    // Row background (alternating)
    ctx.fillStyle = rowIdx % 2 === 0 ? C.rowEven : C.rowOdd;
    ctx.fillRect(BAY_LABEL_W, y, canvasW - BAY_LABEL_W - SCROLLBAR_W, h);

    // Label column background
    ctx.fillStyle = C.labelBg;
    ctx.fillRect(0, y, BAY_LABEL_W, h);

    const pxPerMin = gridW / ((rangeEnd - rangeStart) * 60);

    // 25-min dwell shading
    if (showDwell) {
        ctx.fillStyle = C.dwellShade;
        for (let m = rangeStart * 60; m < rangeEnd * 60; m += 50) {
            const x = minToX(m, rangeStart, rangeEnd, gridW);
            ctx.fillRect(x, y, 25 * pxPerMin, h);
        }
    }

    // Major hour gridlines
    ctx.strokeStyle = C.gridMajor;
    ctx.lineWidth = 0.5;
    for (let hh = rangeStart; hh <= rangeEnd; hh++) {
        const x = minToX(hh * 60, rangeStart, rangeEnd, gridW);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + h);
        ctx.stroke();
    }

    // Row bottom border
    ctx.strokeStyle = C.rowBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y + h - 0.5);
    ctx.lineTo(canvasW - SCROLLBAR_W, y + h - 0.5);
    ctx.stroke();

    // Label column right border
    ctx.strokeStyle = C.labelBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(BAY_LABEL_W - 0.5, y);
    ctx.lineTo(BAY_LABEL_W - 0.5, y + h);
    ctx.stroke();

    // Bay label
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

function blockColors(block: ScheduleBlock): { fill: string; text: string } {
    if (block.color) {
        // For custom colors, use white text (caller's responsibility)
        return { fill: block.color, text: "#ffffff" };
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
    // Default: Scheduled / Arriving / anything else
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

    // Clip to visible time range
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

    // Rounded rect (4px radius)
    drawRoundedRect(ctx, bx, by, bw, bh, 4);
    ctx.fillStyle = fill;
    ctx.fill();

    // Conflict border
    if (block.isConflict) {
        ctx.strokeStyle = "#b71c1c";
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    // Resize handles
    if (bw > RESIZE_HIT * 2 + 4) {
        ctx.fillStyle = C.blockEdge;
        ctx.fillRect(bx, by, RESIZE_HIT, bh);
        ctx.fillRect(bx + bw - RESIZE_HIT, by, RESIZE_HIT, bh);
    }

    // Label text
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

    // Background
    ctx.fillStyle = C.outerBg;
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Draw header (fixed, not scrolled)
    drawHeader(ctx, canvasW, rangeStart, rangeEnd, gridW, showDwell);

    // Clip to scrollable viewport
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, HEADER_H, canvasW, viewH);
    ctx.clip();
    ctx.translate(0, HEADER_H - scrollY);

    // Determine visible row range
    const viewTop = scrollY;
    const viewBot = scrollY + viewH;

    let bayRowIdx = 0; // counter for alternating row color
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

    // Draw blocks
    const rangeStartMin = rangeStart * 60;
    const rangeEndMin = rangeEnd * 60;

    for (const block of blocks) {
        let startMin = block.startMin;
        let endMin = block.endMin;
        let row = bayRowMap.get(block.bayId);

        if (!row) continue;

        // Apply drag state
        if (drag && drag.block.item === block.item) {
            startMin = drag.currentStart;
            endMin = drag.currentEnd;
            // Row may have changed (vertical move to different bay)
            const dragRow = rows[drag.currentRowIdx];
            if (dragRow && dragRow.type === "bay") {
                row = dragRow;
            }
        }

        // Skip if outside visible time range
        if (endMin <= rangeStartMin || startMin >= rangeEndMin) continue;

        // Skip if row not visible vertically
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

    const hasMultipleGroups = groups.length > 1 || (groups.length === 1 && groups[0]?.id !== "__default__");

    // Compute rows from groups
    const rows = useMemo(
        () => computeRows(groups, collapsedGroups, hasMultipleGroups, rowHeight),
        [groups, collapsedGroups, hasMultipleGroups, rowHeight]
    );

    // Total virtual height
    const totalH = useMemo(() => {
        if (rows.length === 0) return 0;
        const last = rows[rows.length - 1];
        return last.y + last.h;
    }, [rows]);

    // Bay row map: bayId -> CanvasRow (for fast block placement)
    const bayRowMap = useMemo(() => {
        const m = new Map<string, CanvasRow>();
        for (const r of rows) {
            if (r.type === "bay" && r.bayId) m.set(r.bayId, r);
        }
        return m;
    }, [rows]);

    // Scroll clamping
    const updateScrollY = useCallback(
        (y: number) => {
            const maxScroll = Math.max(0, totalH - (canvasH - HEADER_H));
            const clamped = Math.max(0, Math.min(maxScroll, y));
            scrollYRef.current = clamped;
            setScrollY(clamped);
        },
        [totalH, canvasH]
    );

    // Responsive resize observer
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

    // Draw
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

    // Re-clamp scroll when layout changes
    useEffect(() => {
        updateScrollY(scrollYRef.current);
    }, [totalH, canvasH, updateScrollY]);

    // ─── Hit testing ──────────────────────────────────────────────────────────

    const hitTestRow = useCallback(
        (canvasY: number): CanvasRow | null => {
            const worldY = canvasY - HEADER_H + scrollYRef.current;
            // Binary-search friendly: rows are sorted by y
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

    const canvasCoords = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        const rect = canvasRef.current!.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }, []);

    // ─── Mouse events ──────────────────────────────────────────────────────────

    const handleMouseDown = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            if (e.button !== 0) return;
            const { x, y } = canvasCoords(e);

            // Check group header click
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
                // Find row index for vertical drag
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
            }
        },
        [hitTestRow, hitTestBlock, canvasCoords, canvasW, timeRangeStart, timeRangeEnd, rows, onGroupToggle]
    );

    const handleMouseMove = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            const { x, y } = canvasCoords(e);
            const drag = dragRef.current;

            if (!drag) {
                // Update cursor
                const row = hitTestRow(y);
                const canvas = canvasRef.current;
                if (canvas) {
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
                }
                return;
            }

            const dx = x - drag.startX;
            if (Math.abs(dx) > 3 || Math.abs(y - drag.startY) > 3) drag.moved = true;
            if (!drag.moved) return;

            const deltaMin = dx / drag.pxPerMin;
            const rangeStartMin = timeRangeStart * 60;
            const rangeEndMin = timeRangeEnd * 60;

            if (drag.mode === "move") {
                const dur = drag.origEnd - drag.origStart;
                const ns = Math.max(rangeStartMin, Math.min(rangeEndMin - dur, drag.origStart + deltaMin));
                drag.currentStart = ns;
                drag.currentEnd = ns + dur;

                // Vertical bay change — only snap to bay rows
                const worldY = y - HEADER_H + scrollYRef.current;
                const bayRows = rows.filter(r => r.type === "bay");
                let newRowIdx = drag.origRowIdx;
                for (let i = 0; i < bayRows.length; i++) {
                    if (worldY >= bayRows[i].y && worldY < bayRows[i].y + bayRows[i].h) {
                        // Find this bay's index in rows[]
                        const globalIdx = rows.findIndex(r => r === bayRows[i]);
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
            rafRef.current = requestAnimationFrame(drawCanvas);
        },
        [canvasCoords, hitTestRow, hitTestBlock, rows, timeRangeStart, timeRangeEnd, drawCanvas]
    );

    const handleMouseUp = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            const { x, y } = canvasCoords(e);
            const drag = dragRef.current;
            dragRef.current = null;

            if (!drag) {
                // Click on empty slot
                if (y > HEADER_H && x > BAY_LABEL_W) {
                    const row = hitTestRow(y);
                    if (row?.type === "bay" && row.bayId) {
                        const gridW = canvasW - BAY_LABEL_W - SCROLLBAR_W;
                        const startMin = Math.round(xToMin(x, timeRangeStart, timeRangeEnd, gridW));
                        const clampedStart = Math.max(timeRangeStart * 60, Math.min(timeRangeEnd * 60 - defaultDwellMinutes, startMin));
                        onEmptySlotClick(row.bayId, clampedStart, clampedStart + defaultDwellMinutes, defaultDwellMinutes);
                    }
                }
                drawCanvas();
                return;
            }

            if (!drag.moved) {
                onTruckClick(drag.block);
            } else {
                const targetRow = rows[drag.currentRowIdx];
                const finalBayId = (targetRow?.type === "bay" && targetRow.bayId) ? targetRow.bayId : drag.block.bayId;
                onScheduleChange(
                    { ...drag.block, bayId: finalBayId },
                    Math.round(drag.currentStart),
                    Math.round(drag.currentEnd)
                );
            }
            drawCanvas();
        },
        [canvasCoords, hitTestRow, canvasW, timeRangeStart, timeRangeEnd, defaultDwellMinutes, rows, onTruckClick, onScheduleChange, onEmptySlotClick, drawCanvas]
    );

    const handleMouseLeave = useCallback(() => {
        if (dragRef.current?.moved) {
            dragRef.current = null;
            drawCanvas();
        } else {
            dragRef.current = null;
        }
        if (canvasRef.current) canvasRef.current.style.cursor = "default";
    }, [drawCanvas]);

    const handleWheel = useCallback(
        (e: React.WheelEvent<HTMLCanvasElement>) => {
            e.preventDefault();
            updateScrollY(scrollYRef.current + e.deltaY);
        },
        [updateScrollY]
    );

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
                onWheel={handleWheel}
                style={{ display: "block", userSelect: "none" }}
            />
            {/* Custom scrollbar */}
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
