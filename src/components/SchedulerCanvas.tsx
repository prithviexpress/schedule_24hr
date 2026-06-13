import React, {
    CSSProperties,
    ReactElement,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState
} from "react";
import { ScheduleBlock, BayStatus } from "./types";

// ─── Layout constants ─────────────────────────────────────────────────────────
const BAY_LABEL_W = 130;
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

    rowEven: "#ffffff",
    rowOdd: "#faf9f7",
    rowBorder: "#eeecea",
    labelBg: "#f7f5f2",
    labelText: "#555",
    labelBorder: "#dddbd5",

    gridMajor: "#dddbd5",
    gridMinor: "#f0ede8",
    dwellShade: "rgba(180,170,150,0.07)",

    blockScheduled: "#1565C0",
    blockScheduledText: "#ffffff",
    blockInProgress: "#2E7D32",
    blockInProgressText: "#ffffff",
    blockDelayed: "#D84315",
    blockDelayedText: "#ffffff",
    blockConflict: "#4527A0",
    blockConflictText: "#ffffff",
    blockEdge: "rgba(255,255,255,0.15)",

    nowLine: "rgba(229,57,53,0.7)",
    nowPill: "#e53935",

    scrollTrack: "#e8e4de",
    scrollThumb: "#bbb8b2",
    scrollThumbHover: "#888",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMinutes(m: number): string {
    const h = Math.floor(m / 60) % 24;
    const min = Math.floor(m % 60);
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function bayStatusColor(status: string): string {
    if (!status) return "";
    const s = status.toLowerCase().trim();
    if (s === "available" || s === "open" || s === "free" || s === "operational" || s === "green") return "#43a047";
    if (s === "occupied" || s === "busy" || s === "inuse" || s === "in use" || s === "active" || s === "docked" || s === "blue") return "#1e88e5";
    if (s === "maintenance" || s === "closed" || s === "error" || s === "offline" || s === "outofservice" || s === "red") return "#e53935";
    if (s === "warning" || s === "caution" || s === "orange" || s === "amber") return "#fb8c00";
    if (s.startsWith("#") || s.startsWith("rgb")) return status;
    return "#9e9e9e";
}

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
    bays: string[];
    bayStatusMap: Map<string, BayStatus>;
    displayDay: Date;
    resourceLabel: string;
    rowHeight: number;
    showDwellMarkers: boolean;
    defaultDwellMinutes: number;
    timeRangeStart: number;
    timeRangeEnd: number;
    colorScheduled: string;
    colorInProgress: string;
    colorDelayed: string;
    colorConflict: string;
    onTruckClick: (block: ScheduleBlock) => void;
    onScheduleChange: (block: ScheduleBlock, newStartMin: number, newEndMin: number) => void;
    onEmptySlotClick: (bayId: string, startMin: number, endMin: number, defaultDwell: number) => void;
}

// ─── Helper: compute row layout ───────────────────────────────────────────────

function computeRows(bays: string[], rowH: number): CanvasRow[] {
    const rows: CanvasRow[] = [];
    let y = 0;
    for (const bayId of bays) {
        rows.push({ type: "bay", groupId: "__default__", label: bayId, bayId, y, h: rowH });
        y += rowH;
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

// Box-truck side-view icon, 25 w × 18 h, centred at (cx, cy)
function drawTruckIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, occupied: boolean, color: string): void {
    const bw = 17, bh = 11; // cargo body w × h
    const cw = 8,  ch = 9;  // cab w × h  (sits flush at body bottom)
    const wr = 3;            // wheel radius
    const gap = 1.5;         // gap between body bottom and wheel tops

    const totalH = bh + gap + wr * 2;
    const ox = cx - (bw + cw) / 2;
    const oy = cy - totalH / 2;

    const cabX   = ox + bw;
    const cabTopY = oy + (bh - ch);         // cab top 2px below body top
    const wheelCY = oy + bh + gap + wr;
    const w1x = ox + bw * 0.25;            // rear wheel
    const w2x = cabX + cw * 0.6;           // front wheel

    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.lineCap  = "round";

    if (occupied) {
        ctx.fillStyle = color;

        // Cargo body
        ctx.fillRect(ox, oy, bw, bh);

        // Cab — windshield angled on RIGHT side (truck faces right)
        ctx.beginPath();
        ctx.moveTo(cabX,             cabTopY);
        ctx.lineTo(cabX + cw * 0.5,  cabTopY);
        ctx.lineTo(cabX + cw,        cabTopY + ch * 0.32);
        ctx.lineTo(cabX + cw,        oy + bh);
        ctx.lineTo(cabX,             oy + bh);
        ctx.closePath();
        ctx.fill();

        // Wheels
        ctx.beginPath(); ctx.arc(w1x, wheelCY, wr, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(w2x, wheelCY, wr, 0, Math.PI * 2); ctx.fill();

    } else {
        ctx.strokeStyle = color;

        // Cargo body
        ctx.strokeRect(ox + 0.75, oy + 0.75, bw - 1.5, bh - 1.5);

        // Cab — windshield angled on RIGHT side (truck faces right)
        ctx.beginPath();
        ctx.moveTo(cabX + 0.75,              cabTopY + 0.75);
        ctx.lineTo(cabX + cw * 0.5,          cabTopY + 0.75);
        ctx.lineTo(cabX + cw - 0.75,         cabTopY + ch * 0.32);
        ctx.lineTo(cabX + cw - 0.75,         oy + bh - 0.75);
        ctx.lineTo(cabX + 0.75,              oy + bh - 0.75);
        ctx.closePath();
        ctx.stroke();

        // Wheels
        ctx.beginPath(); ctx.arc(w1x, wheelCY, wr - 0.5, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(w2x, wheelCY, wr - 0.5, 0, Math.PI * 2); ctx.stroke();
    }

    ctx.restore();
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
    showDwell: boolean,
    resourceLabel: string
): void {
    ctx.fillStyle = C.headerBg;
    ctx.fillRect(0, 0, canvasW, HEADER_H);

    ctx.fillStyle = C.headerText;
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(resourceLabel || "Resource", BAY_LABEL_W / 2, HEADER_H / 2);

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
            ctx.fillText(`${String(h).padStart(2, "0")}:00`, x + 30 * pxPerMin, HEADER_H / 2);
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

// Draws the current-time pill label in the header area
function drawNowHeaderMarker(
    ctx: CanvasRenderingContext2D,
    nowMin: number,
    rangeStart: number,
    rangeEnd: number,
    gridW: number
): void {
    const x = minToX(nowMin, rangeStart, rangeEnd, gridW);
    const label = formatMinutes(nowMin);

    ctx.save();
    ctx.font = "bold 9px sans-serif";
    const lw = ctx.measureText(label).width;
    const pw = lw + 8;
    const ph = 14;
    const px = x - pw / 2;
    const py = 2;

    // Red pill
    drawRoundedRect(ctx, px, py, pw, ph, 3);
    ctx.fillStyle = C.nowPill;
    ctx.fill();

    // White time label
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x, py + ph / 2);

    // Tick line from pill bottom to header bottom
    ctx.strokeStyle = C.nowPill;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, py + ph);
    ctx.lineTo(x, HEADER_H);
    ctx.stroke();
    ctx.restore();
}

// Draws the dashed vertical line in the scrollable content area (called inside save/restore)
function drawNowContentLine(
    ctx: CanvasRenderingContext2D,
    nowMin: number,
    rangeStart: number,
    rangeEnd: number,
    gridW: number
): void {
    const x = minToX(nowMin, rangeStart, rangeEnd, gridW);
    ctx.save();
    ctx.strokeStyle = C.nowLine;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 50000); // clipping handles the end
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
}


function drawBayRow(
    ctx: CanvasRenderingContext2D,
    row: CanvasRow,
    rowIdx: number,
    canvasW: number,
    rangeStart: number,
    rangeEnd: number,
    gridW: number,
    showDwell: boolean,
    bayInfo: BayStatus | undefined
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

    // Bay label + truck icon
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y, BAY_LABEL_W - 2, h);
    ctx.clip();

    const statusColor = bayInfo ? bayStatusColor(bayInfo.color) : "";
    const occupied = bayInfo?.occupied ?? null;
    const hasTruck = bayInfo !== undefined;
    // Color from bay data; if not set, use occupancy-aware defaults so icon
    // is always meaningful without requiring bayColorAttr to be wired up
    const truckColor = statusColor || (occupied === false ? "#90A4AE" : "#1565C0");

    if (hasTruck) {
        drawTruckIcon(ctx, 17, y + h / 2, occupied ?? false, truckColor);
    }

    ctx.fillStyle = C.labelText;
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const labelStartX = hasTruck ? 34 : 4;
    const labelCx = (labelStartX + BAY_LABEL_W - 4) / 2;
    ctx.fillText(row.label, labelCx, y + h / 2);

    ctx.restore();
}

interface StatusColors {
    scheduled: string;
    inProgress: string;
    delayed: string;
    conflict: string;
}

function blockColors(block: ScheduleBlock, palette: StatusColors): { fill: string; text: string } {
    if (block.color) return { fill: block.color, text: "#ffffff" };
    if (block.isConflict) return { fill: palette.conflict, text: "#ffffff" };
    const s = (block.status ?? "").toLowerCase().replace(/\s+/g, "");
    if (s === "inprogress" || s === "completed" || s === "done" || s === "arrived" || s === "docked") return { fill: palette.inProgress, text: "#ffffff" };
    if (s === "delayed" || s === "late" || s === "overdue") return { fill: palette.delayed, text: "#ffffff" };
    // scheduled — use light text only if color is dark enough
    const fill = palette.scheduled;
    return { fill, text: isLightColor(fill) ? C.blockScheduledText : "#ffffff" };
}

function isLightColor(hex: string): boolean {
    const c = hex.replace("#", "");
    if (c.length < 6) return true;
    const r = parseInt(c.slice(0, 2), 16);
    const g = parseInt(c.slice(2, 4), 16);
    const b = parseInt(c.slice(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 140;
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
    isDragging: boolean,
    palette: StatusColors
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

    const { fill, text } = blockColors(block, palette);
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
    bayStatusMap: Map<string, BayStatus>;
    scrollY: number;
    canvasW: number;
    canvasH: number;
    rowH: number;
    showDwell: boolean;
    drag: DragState | null;
    rangeStart: number;
    rangeEnd: number;
    nowMin: number | null;
    palette: StatusColors;
    resourceLabel: string;
}

function renderCanvas(ctx: CanvasRenderingContext2D, p: RenderParams): void {
    const { blocks, rows, bayRowMap, bayStatusMap, scrollY, canvasW, canvasH, showDwell, drag, rangeStart, rangeEnd, nowMin, palette, resourceLabel } = p;
    const gridW = canvasW - BAY_LABEL_W - SCROLLBAR_W;
    const viewH = canvasH - HEADER_H;

    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.fillStyle = C.outerBg;
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Fixed header
    drawHeader(ctx, canvasW, rangeStart, rangeEnd, gridW, showDwell, resourceLabel);

    // Current-time pill in header (drawn on top of header, before clip)
    const inRange = nowMin !== null && nowMin > rangeStart * 60 && nowMin < rangeEnd * 60;
    if (inRange) {
        drawNowHeaderMarker(ctx, nowMin!, rangeStart, rangeEnd, gridW);
    }

    // Clip + translate for scrollable content
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, HEADER_H, canvasW, viewH);
    ctx.clip();
    ctx.translate(0, HEADER_H - scrollY);

    const viewTop = scrollY;
    const viewBot = scrollY + viewH;

    let bayRowIdx = 0;
    for (const row of rows) {
        if (row.y + row.h <= viewTop) { bayRowIdx++; continue; }
        if (row.y >= viewBot) break;
        drawBayRow(ctx, row, bayRowIdx, canvasW, rangeStart, rangeEnd, gridW, showDwell, bayStatusMap.get(row.bayId ?? ""));
        bayRowIdx++;
    }

    // Draw blocks
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
            if (dragRow && dragRow.type === "bay") row = dragRow;
        }
        if (endMin <= rangeStartMin || startMin >= rangeEndMin) continue;
        if (row.y + row.h <= viewTop || row.y >= viewBot) continue;
        drawBlock(ctx, block, row, startMin, endMin, rangeStart, rangeEnd, gridW, drag?.block.item === block.item, palette);
    }

    // Current-time dashed line in content area (drawn on top of blocks)
    if (inRange) {
        drawNowContentLine(ctx, nowMin!, rangeStart, rangeEnd, gridW);
    }

    ctx.restore();
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SchedulerCanvas({
    blocks,
    bays,
    bayStatusMap,
    displayDay,
    resourceLabel,
    rowHeight,
    showDwellMarkers,
    defaultDwellMinutes,
    timeRangeStart,
    timeRangeEnd,
    colorScheduled,
    colorInProgress,
    colorDelayed,
    colorConflict,
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
    const [hoverInfo, setHoverInfo] = useState<{ block: ScheduleBlock; clientX: number; clientY: number } | null>(null);

    const rows = useMemo(
        () => computeRows(bays, rowHeight),
        [bays, rowHeight]
    );

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

    // Compute current-time position (only when displaying today)
    const computeNowMin = useCallback((): number | null => {
        const now = new Date();
        if (
            now.getFullYear() === displayDay.getFullYear() &&
            now.getMonth() === displayDay.getMonth() &&
            now.getDate() === displayDay.getDate()
        ) {
            return now.getHours() * 60 + now.getMinutes();
        }
        return null;
    }, [displayDay]);

    const drawCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const palette: StatusColors = {
            scheduled: colorScheduled || C.blockScheduled,
            inProgress: colorInProgress || C.blockInProgress,
            delayed: colorDelayed || C.blockDelayed,
            conflict: colorConflict || C.blockConflict
        };
        renderCanvas(ctx, {
            blocks,
            rows,
            bayRowMap,
            bayStatusMap,
            scrollY: scrollYRef.current,
            canvasW,
            canvasH,
            rowH: rowHeight,
            showDwell: showDwellMarkers,
            drag: dragRef.current,
            rangeStart: timeRangeStart,
            rangeEnd: timeRangeEnd,
            nowMin: computeNowMin(),
            palette,
            resourceLabel: resourceLabel || "Resource"
        });
    }, [blocks, rows, bayRowMap, bayStatusMap, canvasW, canvasH, rowHeight, showDwellMarkers, timeRangeStart, timeRangeEnd, colorScheduled, colorInProgress, colorDelayed, colorConflict, resourceLabel, computeNowMin]);

    useEffect(() => { drawCanvas(); }, [drawCanvas]);

    // Re-clamp scroll when layout changes
    useEffect(() => { updateScrollY(scrollYRef.current); }, [totalH, canvasH, updateScrollY]);

    // 1-minute ticker for the current-time line (uses ref to avoid stale closure)
    const drawCanvasRef = useRef(drawCanvas);
    useEffect(() => { drawCanvasRef.current = drawCanvas; });
    useEffect(() => {
        const id = setInterval(() => drawCanvasRef.current(), 60000);
        return () => clearInterval(id);
    }, []);

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

    const canvasCoords = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        const rect = canvasRef.current!.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }, []);

    // ─── Mouse events ──────────────────────────────────────────────────────────

    const handleMouseDown = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            if (e.button !== 0) return;
            setHoverInfo(null);
            const { x, y } = canvasCoords(e);

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
            }
        },
        [hitTestRow, hitTestBlock, canvasCoords, canvasW, timeRangeStart, timeRangeEnd, rows]
    );

    const handleMouseMove = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            const { x, y } = canvasCoords(e);
            const drag = dragRef.current;

            if (!drag) {
                const canvas = canvasRef.current;
                const hit = hitTestBlock(x, y);

                if (canvas) {
                    canvas.style.cursor =
                        hit?.mode === "resize-left" || hit?.mode === "resize-right"
                            ? "ew-resize"
                            : hit?.mode === "move"
                            ? "grab"
                            : "default";
                }

                if (hit) {
                    setHoverInfo({ block: hit.block, clientX: e.clientX, clientY: e.clientY });
                } else {
                    setHoverInfo(null);
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

                const worldY = y - HEADER_H + scrollYRef.current;
                const bayRows = rows.filter(r => r.type === "bay");
                let newRowIdx = drag.origRowIdx;
                for (let i = 0; i < bayRows.length; i++) {
                    if (worldY >= bayRows[i].y && worldY < bayRows[i].y + bayRows[i].h) {
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
        setHoverInfo(null);
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

    // Tooltip position — flips left of cursor near right viewport edge
    const tooltipStyle: CSSProperties | undefined = hoverInfo
        ? {
              position: "fixed",
              left:
                  hoverInfo.clientX + 16 + 260 > (typeof window !== "undefined" ? window.innerWidth : 9999)
                      ? hoverInfo.clientX - 268
                      : hoverInfo.clientX + 16,
              top: Math.max(4, hoverInfo.clientY - 10),
              zIndex: 9999,
              pointerEvents: "none"
          }
        : undefined;

    const block = hoverInfo?.block;

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

            {/* Hover tooltip */}
            {block && tooltipStyle && (
                <div className="truck-scheduler__tooltip" style={tooltipStyle}>
                    <div className="truck-scheduler__tooltip-title">{block.truckId}</div>
                    <div className="truck-scheduler__tooltip-row">
                        {block.bayId}&nbsp;&nbsp;|&nbsp;&nbsp;{formatMinutes(block.startMin)} – {formatMinutes(block.endMin)}
                    </div>
                    {block.tooltipText && <div className="truck-scheduler__tooltip-extra">{block.tooltipText}</div>}
                    {block.tooltipText2 && <div className="truck-scheduler__tooltip-extra">{block.tooltipText2}</div>}
                </div>
            )}
        </div>
    );
}
