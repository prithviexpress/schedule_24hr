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
const TIME_LABEL_W = 65;   // left column width for HH:MM labels
const HEADER_H = 52;       // top header height for bay names
const COL_W = 90;          // width of each bay column
const SCROLLBAR_W = 16;    // right vertical scrollbar
const RESIZE_HIT = 6;      // px from top/bottom block edge to trigger resize
const MIN_BLOCK_MIN = 5;   // minimum block duration (minutes)
const SLOT_MINS = 5;       // minutes per time-slot row

// ─── Color palette ────────────────────────────────────────────────────────────
const C = {
    outerBg: "#f0ede8",
    headerBg: "#f5f2ed",
    headerText: "#777",
    headerBorder: "#dddbd5",

    colEven: "#ffffff",
    colOdd: "#faf9f7",
    colBorder: "#eeecea",
    labelBg: "#f7f5f2",
    labelText: "#555",
    labelBorder: "#dddbd5",

    gridHour: "#dddbd5",
    gridSlot: "#f0ede8",
    dwellShade: "rgba(180,170,150,0.07)",

    blockEdge: "rgba(255,255,255,0.15)",

    nowLine: "rgba(229,57,53,0.7)",
    nowPill: "#e53935",

    scrollTrack: "#e8e4de",
    scrollThumb: "#bbb8b2",
    scrollThumbHover: "#888"
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

function isLightColor(hex: string): boolean {
    const c = hex.replace("#", "");
    if (c.length < 6) return true;
    const r = parseInt(c.slice(0, 2), 16);
    const g = parseInt(c.slice(2, 4), 16);
    const b = parseInt(c.slice(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 140;
}

// ─── Coordinate conversions ───────────────────────────────────────────────────

// minute → content-space Y (0 = start of time range)
function minToContentY(min: number, rangeStartMin: number, pxPerMin: number): number {
    return (min - rangeStartMin) * pxPerMin;
}

// content-space Y → minute
function contentYToMin(contentY: number, rangeStartMin: number, pxPerMin: number): number {
    return rangeStartMin + contentY / pxPerMin;
}

// bay column left edge (canvas-space X)
function colX(bayIdx: number): number {
    return TIME_LABEL_W + bayIdx * COL_W;
}

// ─── Internal types ───────────────────────────────────────────────────────────

type DragMode = "move" | "resize-top" | "resize-bottom";

interface DragState {
    mode: DragMode;
    block: ScheduleBlock;
    startX: number;
    startY: number;
    origStart: number;
    origEnd: number;
    origBayIdx: number;
    pxPerMin: number;
    currentStart: number;
    currentEnd: number;
    currentBayIdx: number;
    moved: boolean;
}

interface StatusColors {
    scheduled: string;
    inProgress: string;
    delayed: string;
    conflict: string;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface VerticalSchedulerCanvasProps {
    blocks: ScheduleBlock[];
    bays: string[];
    bayStatusMap: Map<string, BayStatus>;
    displayDay: Date;
    resourceLabel: string;
    hasPlanActual: boolean;
    showActualRows: boolean;
    rowHeight: number;        // = slot height in pixels (per 5-min interval)
    showDwellMarkers: boolean;
    defaultDwellMinutes: number;
    timeRangeStart: number;   // hour 0-23
    timeRangeEnd: number;     // hour 1-24
    colorScheduled: string;
    colorInProgress: string;
    colorDelayed: string;
    colorConflict: string;
    onTruckClick: (block: ScheduleBlock) => void;
    onScheduleChange: (block: ScheduleBlock, newStartMin: number, newEndMin: number) => void;
    onEmptySlotClick: (bayId: string, startMin: number, endMin: number, defaultDwell: number) => void;
}

// ─── Draw helpers ─────────────────────────────────────────────────────────────

function drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number, r: number
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

function drawTruckIconH(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number,
    occupied: boolean, color: string
): void {
    const bw = 14, bh = 9, cw = 6, ch = 7, wr = 2, gap = 1;
    const totalH = bh + gap + wr * 2;
    const ox = cx - (bw + cw) / 2;
    const oy = cy - totalH / 2;
    const cabX = ox + bw;
    const cabTopY = oy + (bh - ch);
    const wheelCY = oy + bh + gap + wr;
    const w1x = ox + bw * 0.25;
    const w2x = cabX + cw * 0.6;

    ctx.save();
    ctx.lineWidth = 1.2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    if (occupied) {
        ctx.fillStyle = color;
        ctx.fillRect(ox, oy, bw, bh);
        ctx.beginPath();
        ctx.moveTo(cabX, cabTopY);
        ctx.lineTo(cabX + cw * 0.5, cabTopY);
        ctx.lineTo(cabX + cw, cabTopY + ch * 0.32);
        ctx.lineTo(cabX + cw, oy + bh);
        ctx.lineTo(cabX, oy + bh);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath(); ctx.arc(w1x, wheelCY, wr, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(w2x, wheelCY, wr, 0, Math.PI * 2); ctx.fill();
    } else {
        ctx.strokeStyle = color;
        ctx.strokeRect(ox + 0.75, oy + 0.75, bw - 1.5, bh - 1.5);
        ctx.beginPath();
        ctx.moveTo(cabX + 0.75, cabTopY + 0.75);
        ctx.lineTo(cabX + cw * 0.5, cabTopY + 0.75);
        ctx.lineTo(cabX + cw - 0.75, cabTopY + ch * 0.32);
        ctx.lineTo(cabX + cw - 0.75, oy + bh - 0.75);
        ctx.lineTo(cabX + 0.75, oy + bh - 0.75);
        ctx.closePath();
        ctx.stroke();
        ctx.beginPath(); ctx.arc(w1x, wheelCY, wr - 0.5, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(w2x, wheelCY, wr - 0.5, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
}

function blockColors(
    block: ScheduleBlock,
    palette: StatusColors
): { fill: string; text: string } {
    if (block.color) return { fill: block.color, text: "#ffffff" };
    if (block.isConflict) return { fill: palette.conflict, text: "#ffffff" };
    const s = (block.status ?? "").toLowerCase().replace(/\s+/g, "");
    if (s === "inprogress" || s === "completed" || s === "done" || s === "arrived" || s === "docked")
        return { fill: palette.inProgress, text: "#ffffff" };
    if (s === "delayed" || s === "late" || s === "overdue")
        return { fill: palette.delayed, text: "#ffffff" };
    return { fill: palette.scheduled, text: isLightColor(palette.scheduled) ? "#333" : "#ffffff" };
}

// ─── Canvas drawing ───────────────────────────────────────────────────────────

function drawBayHeader(
    ctx: CanvasRenderingContext2D,
    bays: string[],
    bayStatusMap: Map<string, BayStatus>,
    canvasW: number,
    hasPlanActual: boolean,
    showActualRows: boolean,
    resourceLabel: string
): void {
    const split = hasPlanActual && showActualRows;

    // Outer background
    ctx.fillStyle = C.headerBg;
    ctx.fillRect(0, 0, canvasW, HEADER_H);

    bays.forEach((bayId, idx) => {
        const bx = colX(idx);
        const bayInfo = bayStatusMap.get(bayId);

        // Column background
        ctx.fillStyle = idx % 2 === 0 ? C.colEven : C.colOdd;
        ctx.fillRect(bx, 0, COL_W, HEADER_H);

        // Plan/actual bottom stripe
        if (split) {
            ctx.fillStyle = "#1565C0";
            ctx.fillRect(bx, HEADER_H - 4, COL_W / 2, 4);
            ctx.fillStyle = "#FB8C00";
            ctx.fillRect(bx + COL_W / 2, HEADER_H - 4, COL_W / 2, 4);
        }

        // Truck icon
        const statusColor = bayInfo ? bayStatusColor(bayInfo.color) : "";
        const occupied = bayInfo?.occupied ?? null;
        const truckColor = statusColor || (occupied === false ? "#90A4AE" : "#1565C0");
        if (bayInfo !== undefined) {
            drawTruckIconH(ctx, bx + COL_W / 2, HEADER_H / 2 - 8, occupied ?? false, truckColor);
        }

        // Bay label
        ctx.save();
        ctx.beginPath();
        ctx.rect(bx + 2, 0, COL_W - 4, HEADER_H);
        ctx.clip();
        ctx.fillStyle = C.labelText;
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(bayId, bx + COL_W / 2, HEADER_H - (split ? 7 : 4));
        ctx.restore();

        // Column right divider
        ctx.strokeStyle = C.labelBorder;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bx + COL_W - 0.5, 0);
        ctx.lineTo(bx + COL_W - 0.5, HEADER_H);
        ctx.stroke();

        // Plan/actual sub-divider in header
        if (split) {
            ctx.strokeStyle = C.gridSlot;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(bx + COL_W / 2, 0);
            ctx.lineTo(bx + COL_W / 2, HEADER_H - 4);
            ctx.stroke();
        }
    });

    // Time label corner
    ctx.fillStyle = C.labelBg;
    ctx.fillRect(0, 0, TIME_LABEL_W, HEADER_H);
    ctx.fillStyle = C.headerText;
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(resourceLabel || "Time", TIME_LABEL_W / 2, HEADER_H / 2);

    // Header bottom border
    ctx.strokeStyle = C.headerBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, HEADER_H - 0.5);
    ctx.lineTo(canvasW, HEADER_H - 0.5);
    ctx.stroke();

    // Time-label right border
    ctx.strokeStyle = C.labelBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(TIME_LABEL_W - 0.5, 0);
    ctx.lineTo(TIME_LABEL_W - 0.5, HEADER_H);
    ctx.stroke();
}

// Draws grid + time labels in content-space coordinates (after clip + translate)
function drawGrid(
    ctx: CanvasRenderingContext2D,
    bays: string[],
    canvasW: number,
    rangeStart: number,
    rangeEnd: number,
    pxPerMin: number,
    scrollY: number,
    viewH: number,
    showDwell: boolean,
    hasPlanActual: boolean,
    showActualRows: boolean
): void {
    const split = hasPlanActual && showActualRows;
    const rangeStartMin = rangeStart * 60;
    const rangeEndMin = rangeEnd * 60;
    const contentH = (rangeEndMin - rangeStartMin) * pxPerMin;
    const gridW = canvasW - TIME_LABEL_W - SCROLLBAR_W;

    // Column backgrounds
    bays.forEach((_id, idx) => {
        const bx = colX(idx);
        ctx.fillStyle = idx % 2 === 0 ? C.colEven : C.colOdd;
        ctx.fillRect(bx, 0, COL_W, contentH);
        if (split) {
            // Actual right-half: subtle amber tint
            ctx.fillStyle = "rgba(255,243,205,0.35)";
            ctx.fillRect(bx + COL_W / 2, 0, COL_W / 2, contentH);
        }
    });

    // Dwell shade (25-minute bands in the content area)
    if (showDwell) {
        ctx.fillStyle = C.dwellShade;
        for (let m = rangeStartMin; m < rangeEndMin; m += 50) {
            const yTop = minToContentY(m, rangeStartMin, pxPerMin);
            const h = 25 * pxPerMin;
            ctx.fillRect(TIME_LABEL_W, yTop, gridW, h);
        }
    }

    // Determine visible slot range to avoid drawing 1000s of lines
    const visMinute = Math.max(rangeStartMin, Math.floor(contentYToMin(scrollY, rangeStartMin, pxPerMin) / SLOT_MINS) * SLOT_MINS - SLOT_MINS);
    const visMaxMinute = Math.min(rangeEndMin, Math.ceil(contentYToMin(scrollY + viewH, rangeStartMin, pxPerMin) / SLOT_MINS) * SLOT_MINS + SLOT_MINS);

    // Horizontal grid lines + time labels
    for (let m = visMinute; m <= visMaxMinute; m += SLOT_MINS) {
        if (m < rangeStartMin || m > rangeEndMin) continue;
        const gy = minToContentY(m, rangeStartMin, pxPerMin);
        const isHour = m % 60 === 0;
        const isHalfHour = m % 30 === 0;

        // Grid line
        ctx.strokeStyle = isHour ? C.gridHour : C.gridSlot;
        ctx.lineWidth = isHour ? 1 : 0.5;
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(canvasW - SCROLLBAR_W, gy);
        ctx.stroke();

        // Time label
        if (isHour || isHalfHour) {
            ctx.fillStyle = isHour ? "#444" : C.headerText;
            ctx.font = isHour ? "bold 10px sans-serif" : "10px sans-serif";
            ctx.textAlign = "right";
            ctx.textBaseline = "top";
            ctx.fillText(formatMinutes(m), TIME_LABEL_W - 4, gy + 1);
        } else {
            // Minor tick mark on the right edge of the time label column
            ctx.strokeStyle = C.gridHour;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(TIME_LABEL_W - 8, gy);
            ctx.lineTo(TIME_LABEL_W - 1, gy);
            ctx.stroke();
        }
    }

    // Vertical column dividers (drawn over everything)
    bays.forEach((_id, idx) => {
        const bx = colX(idx);

        // Right column border
        ctx.strokeStyle = C.labelBorder;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bx + COL_W - 0.5, 0);
        ctx.lineTo(bx + COL_W - 0.5, contentH);
        ctx.stroke();

        // Plan/actual sub-column divider
        if (split) {
            ctx.strokeStyle = "rgba(251,140,0,0.2)";
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(bx + COL_W / 2, 0);
            ctx.lineTo(bx + COL_W / 2, contentH);
            ctx.stroke();
        }
    });

    // Time-label area right border
    ctx.strokeStyle = C.labelBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(TIME_LABEL_W - 0.5, 0);
    ctx.lineTo(TIME_LABEL_W - 0.5, contentH);
    ctx.stroke();
}

function drawVerticalBlock(
    ctx: CanvasRenderingContext2D,
    block: ScheduleBlock,
    bayIdx: number,
    startMin: number,
    endMin: number,
    rangeStart: number,
    rangeEnd: number,
    pxPerMin: number,
    isDragging: boolean,
    palette: StatusColors,
    hasPlanActual: boolean,
    showActualRows: boolean
): void {
    const rangeStartMin = rangeStart * 60;
    const rangeEndMin = rangeEnd * 60;
    const visStart = Math.max(startMin, rangeStartMin);
    const visEnd = Math.min(endMin, rangeEndMin);
    if (visStart >= visEnd) return;

    const split = hasPlanActual && showActualRows;

    // Column X
    const leftX = colX(bayIdx);
    let bx: number, bw: number;
    if (split) {
        bw = COL_W / 2 - 4;
        bx = block.subRow === "actual"
            ? leftX + COL_W / 2 + 2
            : leftX + 2;
    } else {
        bx = leftX + 2;
        bw = COL_W - 4;
    }
    if (bw < 2) return;

    // Y in content-space
    const byTop = minToContentY(visStart, rangeStartMin, pxPerMin) + 2;
    const byBot = minToContentY(visEnd, rangeStartMin, pxPerMin) - 2;
    const bh = byBot - byTop;
    if (bh < 2) return;

    const { fill, text } = blockColors(block, palette);
    ctx.globalAlpha = isDragging ? 0.72 : 1;

    drawRoundedRect(ctx, bx, byTop, bw, bh, 4);
    ctx.fillStyle = fill;
    ctx.fill();

    if (block.isConflict) {
        ctx.strokeStyle = "#b71c1c";
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    // Top/bottom resize handle bands
    if (bh > RESIZE_HIT * 2 + 4) {
        ctx.fillStyle = C.blockEdge;
        ctx.fillRect(bx, byTop, bw, RESIZE_HIT);
        ctx.fillRect(bx, byBot - RESIZE_HIT, bw, RESIZE_HIT);
    }

    // Text — two lines if tall enough
    if (bh > 16 && bw > 12) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(bx + 2, byTop + RESIZE_HIT, bw - 4, bh - RESIZE_HIT * 2);
        ctx.clip();
        ctx.fillStyle = text;
        ctx.textAlign = "center";
        const cx = bx + bw / 2;
        const innerH = bh - RESIZE_HIT * 2;
        const innerTop = byTop + RESIZE_HIT;

        if (block.tooltipText && bh > 38) {
            ctx.font = `${Math.min(10, bw - 6)}px sans-serif`;
            ctx.textBaseline = "top";
            ctx.fillText(block.tooltipText, cx, innerTop + 2);
            ctx.font = `bold ${Math.min(11, bw - 4)}px sans-serif`;
            ctx.textBaseline = "middle";
            ctx.fillText(block.truckId, cx, innerTop + innerH * 0.62);
        } else {
            ctx.font = `${Math.min(11, bw - 4)}px sans-serif`;
            ctx.textBaseline = "middle";
            ctx.fillText(block.truckId, cx, innerTop + innerH / 2);
        }
        ctx.restore();
    }

    ctx.globalAlpha = 1;
}

// Horizontal "now" line + left pill in content-space
function drawNowContentLine(
    ctx: CanvasRenderingContext2D,
    nowMin: number,
    rangeStart: number,
    pxPerMin: number,
    canvasW: number
): void {
    const gy = minToContentY(nowMin, rangeStart * 60, pxPerMin);

    ctx.save();
    ctx.strokeStyle = C.nowLine;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(TIME_LABEL_W, gy);
    ctx.lineTo(canvasW - SCROLLBAR_W, gy);
    ctx.stroke();
    ctx.setLineDash([]);

    // Pill label on left edge
    const label = formatMinutes(nowMin);
    ctx.font = "bold 9px sans-serif";
    const lw = ctx.measureText(label).width;
    const pw = lw + 8;
    const ph = 13;
    const px = TIME_LABEL_W - pw - 2;
    const py = gy - ph / 2;

    drawRoundedRect(ctx, px, py, pw, ph, 3);
    ctx.fillStyle = C.nowPill;
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, px + pw / 2, py + ph / 2);
    ctx.restore();
}

// ─── Main render function ─────────────────────────────────────────────────────

interface RenderParams {
    blocks: ScheduleBlock[];
    bays: string[];
    bayIdxMap: Map<string, number>;
    bayStatusMap: Map<string, BayStatus>;
    scrollY: number;
    canvasW: number;
    canvasH: number;
    pxPerMin: number;
    showDwell: boolean;
    drag: DragState | null;
    rangeStart: number;
    rangeEnd: number;
    nowMin: number | null;
    palette: StatusColors;
    resourceLabel: string;
    hasPlanActual: boolean;
    showActualRows: boolean;
}

function renderCanvas(ctx: CanvasRenderingContext2D, p: RenderParams): void {
    const {
        blocks, bays, bayIdxMap, bayStatusMap, scrollY, canvasW, canvasH,
        pxPerMin, showDwell, drag, rangeStart, rangeEnd, nowMin, palette,
        resourceLabel, hasPlanActual, showActualRows
    } = p;

    const rangeStartMin = rangeStart * 60;
    const rangeEndMin = rangeEnd * 60;
    const viewH = canvasH - HEADER_H;

    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.fillStyle = C.outerBg;
    ctx.fillRect(0, 0, canvasW, canvasH);

    // ── Scrollable content (grid + blocks) ──────────────────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, HEADER_H, canvasW - SCROLLBAR_W, viewH);
    ctx.clip();
    ctx.translate(0, HEADER_H - scrollY);

    drawGrid(ctx, bays, canvasW, rangeStart, rangeEnd, pxPerMin, scrollY, viewH, showDwell, hasPlanActual, showActualRows);

    // Now line (in content coords)
    const inRange = nowMin !== null && nowMin > rangeStartMin && nowMin < rangeEndMin;
    if (inRange) {
        drawNowContentLine(ctx, nowMin!, rangeStart, pxPerMin, canvasW);
    }

    // Blocks
    for (const block of blocks) {
        if (!showActualRows && block.subRow === "actual") continue;

        let bayIdx = bayIdxMap.get(block.bayId) ?? -1;
        let startMin = block.startMin;
        let endMin = block.endMin;
        let renderBayIdx = bayIdx;

        if (drag && drag.block.item === block.item) {
            startMin = drag.currentStart;
            endMin = drag.currentEnd;
            renderBayIdx = drag.currentBayIdx;
        }
        if (renderBayIdx < 0 || renderBayIdx >= bays.length) continue;
        if (endMin <= rangeStartMin || startMin >= rangeEndMin) continue;

        // Viewport culling
        const byTop = minToContentY(startMin, rangeStartMin, pxPerMin);
        const byBot = minToContentY(endMin, rangeStartMin, pxPerMin);
        if (byBot < scrollY || byTop > scrollY + viewH) continue;

        drawVerticalBlock(
            ctx, block, renderBayIdx, startMin, endMin,
            rangeStart, rangeEnd, pxPerMin,
            drag?.block.item === block.item, palette,
            hasPlanActual, showActualRows
        );
    }

    ctx.restore();

    // ── Fixed bay header (drawn on top) ─────────────────────────────────────────
    drawBayHeader(ctx, bays, bayStatusMap, canvasW, hasPlanActual, showActualRows, resourceLabel);

    // ── Custom scrollbar (drawn directly on canvas, not translated) ─────────────
    const contentH = (rangeEndMin - rangeStartMin) * pxPerMin;
    const trackH = viewH;
    const thumbH = Math.max(24, contentH > 0 ? Math.floor((viewH / contentH) * trackH) : trackH);
    const thumbTop = contentH > viewH
        ? Math.floor((scrollY / (contentH - viewH)) * (trackH - thumbH))
        : 0;

    ctx.fillStyle = C.scrollTrack;
    ctx.fillRect(canvasW - SCROLLBAR_W, HEADER_H, SCROLLBAR_W, viewH);
    ctx.fillStyle = C.scrollThumb;
    drawRoundedRect(ctx, canvasW - SCROLLBAR_W + 2, HEADER_H + thumbTop, SCROLLBAR_W - 4, thumbH, 3);
    ctx.fill();
}

// ─── Component ────────────────────────────────────────────────────────────────

export function VerticalSchedulerCanvas({
    blocks,
    bays,
    bayStatusMap,
    displayDay,
    resourceLabel,
    hasPlanActual,
    showActualRows,
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
}: VerticalSchedulerCanvasProps): ReactElement {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [canvasW, setCanvasW] = useState(800);
    const [canvasH, setCanvasH] = useState(560);
    const [scrollY, setScrollY] = useState(0);
    const scrollYRef = useRef(0);
    const dragRef = useRef<DragState | null>(null);
    const rafRef = useRef<number>(0);
    const scrollThumbDragRef = useRef<{ startY: number; startScrollY: number } | null>(null);
    const [hoverInfo, setHoverInfo] = useState<{ block: ScheduleBlock; clientX: number; clientY: number } | null>(null);

    // pixels per minute (slotH is px per 5-min slot)
    const pxPerMin = Math.max(0.5, (rowHeight || 20) / SLOT_MINS);

    const rangeStartMin = timeRangeStart * 60;
    const rangeEndMin = timeRangeEnd * 60;
    const contentH = (rangeEndMin - rangeStartMin) * pxPerMin;

    const bayIdxMap = useMemo(() => {
        const m = new Map<string, number>();
        bays.forEach((b, i) => m.set(b, i));
        return m;
    }, [bays]);

    const updateScrollY = useCallback(
        (y: number) => {
            const maxScroll = Math.max(0, contentH - (canvasH - HEADER_H));
            const clamped = Math.max(0, Math.min(maxScroll, y));
            scrollYRef.current = clamped;
            setScrollY(clamped);
        },
        [contentH, canvasH]
    );

    useLayoutEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const obs = new ResizeObserver(entries => {
            const { width, height } = entries[0].contentRect;
            setCanvasW(Math.max(TIME_LABEL_W + COL_W + SCROLLBAR_W, Math.floor(width)));
            setCanvasH(Math.max(120, Math.floor(height)));
        });
        obs.observe(el);
        return () => obs.disconnect();
    }, []);

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

    const palette = useMemo<StatusColors>(() => ({
        scheduled:  colorScheduled  || "#1565C0",
        inProgress: colorInProgress || "#2E7D32",
        delayed:    colorDelayed    || "#D84315",
        conflict:   colorConflict   || "#4527A0"
    }), [colorScheduled, colorInProgress, colorDelayed, colorConflict]);

    const drawCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        renderCanvas(ctx, {
            blocks,
            bays,
            bayIdxMap,
            bayStatusMap,
            scrollY: scrollYRef.current,
            canvasW,
            canvasH,
            pxPerMin,
            showDwell: showDwellMarkers,
            drag: dragRef.current,
            rangeStart: timeRangeStart,
            rangeEnd: timeRangeEnd,
            nowMin: computeNowMin(),
            palette,
            resourceLabel: resourceLabel || "Time",
            hasPlanActual,
            showActualRows
        });
    }, [
        blocks, bays, bayIdxMap, bayStatusMap, canvasW, canvasH,
        pxPerMin, showDwellMarkers, timeRangeStart, timeRangeEnd,
        palette, resourceLabel, hasPlanActual, showActualRows, computeNowMin
    ]);

    useEffect(() => { drawCanvas(); }, [drawCanvas]);
    useEffect(() => { updateScrollY(scrollYRef.current); }, [contentH, canvasH, updateScrollY]);

    const drawCanvasRef = useRef(drawCanvas);
    useEffect(() => { drawCanvasRef.current = drawCanvas; });
    useEffect(() => {
        const id = setInterval(() => drawCanvasRef.current(), 60000);
        return () => clearInterval(id);
    }, []);

    // Non-passive wheel listener so e.preventDefault() actually stops page scroll
    const updateScrollYRef = useRef(updateScrollY);
    useEffect(() => { updateScrollYRef.current = updateScrollY; });
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            updateScrollYRef.current(scrollYRef.current + e.deltaY);
        };
        canvas.addEventListener("wheel", onWheel, { passive: false });
        return () => canvas.removeEventListener("wheel", onWheel);
    }, []);

    // ─── Hit testing ──────────────────────────────────────────────────────────

    // Returns bay column index (or -1) from a canvas-X position
    const hitTestCol = useCallback(
        (canvasX: number): number => {
            if (canvasX < TIME_LABEL_W) return -1;
            const idx = Math.floor((canvasX - TIME_LABEL_W) / COL_W);
            if (idx < 0 || idx >= bays.length) return -1;
            return idx;
        },
        [bays.length]
    );

    const hitTestBlock = useCallback(
        (canvasX: number, canvasY: number): { block: ScheduleBlock; mode: DragMode } | null => {
            if (canvasY < HEADER_H) return null;
            const colIdx = hitTestCol(canvasX);
            if (colIdx < 0) return null;

            const bayId = bays[colIdx];
            const split = hasPlanActual && showActualRows;

            // Determine sub-column (plan/actual)
            const xWithinCol = canvasX - colX(colIdx);
            const isActualSubCol = split && xWithinCol >= COL_W / 2;

            // Content-space Y
            const contentY = canvasY - HEADER_H + scrollYRef.current;

            for (let i = blocks.length - 1; i >= 0; i--) {
                const b = blocks[i];
                if (b.bayId !== bayId) continue;
                if (!showActualRows && b.subRow === "actual") continue;
                if (split) {
                    if (isActualSubCol && b.subRow !== "actual") continue;
                    if (!isActualSubCol && b.subRow === "actual") continue;
                }

                const visStart = Math.max(b.startMin, rangeStartMin);
                const visEnd = Math.min(b.endMin, rangeEndMin);
                if (visStart >= visEnd) continue;

                const byTop = minToContentY(visStart, rangeStartMin, pxPerMin) + 2;
                const byBot = minToContentY(visEnd, rangeStartMin, pxPerMin) - 2;
                if (byBot - byTop < 2) continue;

                if (contentY >= byTop && contentY <= byBot) {
                    if (contentY <= byTop + RESIZE_HIT) return { block: b, mode: "resize-top" };
                    if (contentY >= byBot - RESIZE_HIT) return { block: b, mode: "resize-bottom" };
                    return { block: b, mode: "move" };
                }
            }
            return null;
        },
        [blocks, bays, hitTestCol, hasPlanActual, showActualRows, pxPerMin, rangeStartMin, rangeEndMin]
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
            if (hit) {
                const bayIdx = bayIdxMap.get(hit.block.bayId) ?? 0;
                dragRef.current = {
                    mode: hit.mode,
                    block: hit.block,
                    startX: x,
                    startY: y,
                    origStart: hit.block.startMin,
                    origEnd: hit.block.endMin,
                    origBayIdx: bayIdx,
                    pxPerMin,
                    currentStart: hit.block.startMin,
                    currentEnd: hit.block.endMin,
                    currentBayIdx: bayIdx,
                    moved: false
                };
            }
        },
        [hitTestBlock, bayIdxMap, pxPerMin, canvasCoords]
    );

    const handleMouseMove = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            const { x, y } = canvasCoords(e);
            const drag = dragRef.current;

            if (!drag) {
                const hit = hitTestBlock(x, y);
                const canvas = canvasRef.current;
                if (canvas) {
                    canvas.style.cursor =
                        hit?.mode === "resize-top" || hit?.mode === "resize-bottom"
                            ? "ns-resize"
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

            const dy = y - drag.startY;
            const dx = x - drag.startX;
            if (Math.abs(dy) > 3 || Math.abs(dx) > 3) drag.moved = true;
            if (!drag.moved) return;

            const deltaMin = dy / drag.pxPerMin;

            if (drag.mode === "move") {
                const dur = drag.origEnd - drag.origStart;
                const ns = Math.max(rangeStartMin, Math.min(rangeEndMin - dur, drag.origStart + deltaMin));
                drag.currentStart = ns;
                drag.currentEnd = ns + dur;

                // Update bay column based on X
                const newColIdx = hitTestCol(x);
                if (newColIdx >= 0) drag.currentBayIdx = newColIdx;

            } else if (drag.mode === "resize-top") {
                drag.currentStart = Math.max(rangeStartMin, Math.min(drag.origEnd - MIN_BLOCK_MIN, drag.origStart + deltaMin));

            } else {
                drag.currentEnd = Math.min(rangeEndMin, Math.max(drag.origStart + MIN_BLOCK_MIN, drag.origEnd + deltaMin));
            }

            cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(drawCanvas);
        },
        [canvasCoords, hitTestBlock, hitTestCol, rangeStartMin, rangeEndMin, drawCanvas]
    );

    const handleMouseUp = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            const { x, y } = canvasCoords(e);
            const drag = dragRef.current;
            dragRef.current = null;

            if (!drag) {
                // Empty slot click
                if (y > HEADER_H && x > TIME_LABEL_W) {
                    const colIdx = hitTestCol(x);
                    if (colIdx >= 0) {
                        const contentY = y - HEADER_H + scrollYRef.current;
                        const clickMin = Math.round(contentYToMin(contentY, rangeStartMin, pxPerMin) / SLOT_MINS) * SLOT_MINS;
                        const clampedStart = Math.max(rangeStartMin, Math.min(rangeEndMin - defaultDwellMinutes, clickMin));
                        onEmptySlotClick(bays[colIdx], clampedStart, clampedStart + defaultDwellMinutes, defaultDwellMinutes);
                    }
                }
                drawCanvas();
                return;
            }

            if (!drag.moved) {
                onTruckClick(drag.block);
            } else {
                const finalBayId = bays[drag.currentBayIdx] ?? drag.block.bayId;
                onScheduleChange(
                    { ...drag.block, bayId: finalBayId },
                    Math.round(drag.currentStart / SLOT_MINS) * SLOT_MINS,
                    Math.round(drag.currentEnd / SLOT_MINS) * SLOT_MINS
                );
            }
            drawCanvas();
        },
        [
            canvasCoords, hitTestCol, bays, rangeStartMin, rangeEndMin,
            pxPerMin, defaultDwellMinutes, onTruckClick, onScheduleChange,
            onEmptySlotClick, drawCanvas
        ]
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


    // ─── Custom scrollbar ──────────────────────────────────────────────────────

    const viewportH = canvasH - HEADER_H;
    const thumbH = Math.max(24, contentH > 0 ? Math.floor((viewportH / contentH) * viewportH) : viewportH);
    const thumbTop = contentH > viewportH
        ? Math.floor((scrollY / (contentH - viewportH)) * (viewportH - thumbH))
        : 0;

    const handleScrollbarClick = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            const clickY = e.clientY - rect.top;
            const ratio = Math.max(0, Math.min(1, clickY / (viewportH - thumbH)));
            updateScrollY(ratio * (contentH - viewportH));
        },
        [viewportH, contentH, thumbH, updateScrollY]
    );

    const handleThumbMouseDown = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            scrollThumbDragRef.current = { startY: e.clientY, startScrollY: scrollYRef.current };
            const onMove = (mv: MouseEvent) => {
                const td = scrollThumbDragRef.current;
                if (!td) return;
                const dy = mv.clientY - td.startY;
                const scale = contentH > viewportH ? (contentH - viewportH) / (viewportH - thumbH) : 1;
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
        [contentH, viewportH, thumbH, updateScrollY]
    );

    // ─── Tooltip ───────────────────────────────────────────────────────────────

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

    const hBlock = hoverInfo?.block;

    return (
        <div
            ref={containerRef}
            className="truck-scheduler__canvas-container"
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
            {/* Custom scrollbar — absolutely positioned over the canvas right edge */}
            <div
                className="truck-scheduler__scrollbar"
                onClick={handleScrollbarClick}
            >
                <div
                    className="truck-scheduler__scrollbar-thumb"
                    style={{ top: HEADER_H + thumbTop, height: thumbH }}
                    onMouseDown={handleThumbMouseDown}
                />
            </div>

            {/* Hover tooltip */}
            {hBlock && tooltipStyle && (
                <div className="truck-scheduler__tooltip" style={tooltipStyle}>
                    <div className="truck-scheduler__tooltip-truck">{hBlock.truckId}</div>
                    <div className="truck-scheduler__tooltip-row">
                        <span className="truck-scheduler__tooltip-label">Bay</span>
                        <span>{hBlock.bayId}</span>
                    </div>
                    <div className="truck-scheduler__tooltip-row">
                        <span className="truck-scheduler__tooltip-label">Time</span>
                        <span>{formatMinutes(hBlock.startMin)} – {formatMinutes(hBlock.endMin)}</span>
                    </div>
                    {hBlock.subRow && (
                        <div className="truck-scheduler__tooltip-row">
                            <span className="truck-scheduler__tooltip-label">Type</span>
                            <span style={{ textTransform: "capitalize" }}>{hBlock.subRow}</span>
                        </div>
                    )}
                    {hBlock.tooltipText && (
                        <div className="truck-scheduler__tooltip-extra">{hBlock.tooltipText}</div>
                    )}
                    {hBlock.tooltipText2 && (
                        <div className="truck-scheduler__tooltip-extra">{hBlock.tooltipText2}</div>
                    )}
                </div>
            )}
        </div>
    );
}
