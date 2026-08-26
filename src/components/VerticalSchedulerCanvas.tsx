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
const TIME_LABEL_W = 65;
const HEADER_H = 62;
let COL_W = 90;
const SCROLLBAR_W = 16;
const H_SCROLLBAR_H = 14;
const RESIZE_HIT = 6;
const MIN_BLOCK_MIN = 5;
const SLOT_MINS = 5;

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
    gridHour: "#a8a49e",
    gridSlot: "#c8c4bc",
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
    return `${h}:${String(min).padStart(2, "0")}`;
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

// ─── Time window type ─────────────────────────────────────────────────────────

export interface TimeWindow {
    start: number;
    end: number;
    color: string;
}

// ─── Coordinate conversions ───────────────────────────────────────────────────

function minToContentY(min: number, rangeStartMin: number, pxPerMin: number): number {
    return (min - rangeStartMin) * pxPerMin;
}

function contentYToMin(contentY: number, rangeStartMin: number, pxPerMin: number): number {
    return rangeStartMin + contentY / pxPerMin;
}

// colX returns the content-space X of bay column i (includes TIME_LABEL_W offset)
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
    readOnly: boolean;
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
    bayTypeMap?: Map<string, string>;
    displayDay: Date;
    resourceLabel: string;
    hasPlanActual: boolean;
    showActualRows: boolean;
    rowHeight: number;
    showDwellMarkers: boolean;
    defaultDwellMinutes: number;
    timeRangeStart: number;
    timeRangeEnd: number;
    columnWidth?: number;
    timeWindows?: TimeWindow[];
    timeWindowsAlpha?: number;
    gridAlpha?: number;
    colorScheduled: string;
    colorInProgress: string;
    colorDelayed: string;
    colorConflict: string;
    onTruckClick: (block: ScheduleBlock) => void;
    onActualTruckClick?: (block: ScheduleBlock) => void;
    onScheduleChange: (block: ScheduleBlock, newStartMin: number, newEndMin: number) => void;
    onEmptySlotClick: (bayId: string, startMin: number, endMin: number, defaultDwell: number) => void;
    onBayClick?: (bayId: string) => void;
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

function lightenColor(hex: string, factor: number = 0.55): string {
    if (!hex || hex.length < 7 || !hex.startsWith("#")) return hex;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return "#" + [r, g, b]
        .map(c => Math.round(c + (255 - c) * factor).toString(16).padStart(2, "0"))
        .join("");
}

function blockColors(block: ScheduleBlock, palette: StatusColors): { fill: string; text: string } {
    if (block.color) return { fill: block.color, text: isLightColor(block.color) ? "#333" : "#ffffff" };
    const s = (block.status ?? "").toLowerCase().replace(/\s+/g, "");
    if (s === "inprogress" || s === "completed" || s === "done" || s === "arrived" || s === "docked")
        return { fill: palette.inProgress, text: "#ffffff" };
    if (s === "delayed" || s === "late" || s === "overdue")
        return { fill: palette.delayed, text: "#ffffff" };
    return { fill: palette.scheduled, text: isLightColor(palette.scheduled) ? "#333" : "#ffffff" };
}

// ─── Drawing passes ───────────────────────────────────────────────────────────

// Pass 1 inner: bay column backgrounds + time windows + dwell + grid lines
// Called inside translate(-scrollX, HEADER_H - scrollY), clipped to bay area
function drawBayContentPass(
    ctx: CanvasRenderingContext2D,
    bays: string[],
    rangeStart: number,
    rangeEnd: number,
    pxPerMin: number,
    scrollY: number,
    viewH: number,
    showDwell: boolean,
    hasPlanActual: boolean,
    showActualRows: boolean,
    timeWindows: TimeWindow[] | undefined,
    timeWindowsAlpha: number,
    gridAlpha: number,
    contentW: number
): void {
    const split = hasPlanActual && showActualRows;
    const rangeStartMin = rangeStart * 60;
    const rangeEndMin = rangeEnd * 60;
    const contentH = (rangeEndMin - rangeStartMin) * pxPerMin;

    // Column backgrounds
    bays.forEach((_id, idx) => {
        const bx = colX(idx);
        ctx.fillStyle = idx % 2 === 0 ? C.colEven : C.colOdd;
        ctx.fillRect(bx, 0, COL_W, contentH);
        if (split) {
            ctx.fillStyle = "rgba(255,243,205,0.35)";
            ctx.fillRect(bx + COL_W / 2, 0, COL_W / 2, contentH);
        }
    });

    // Time window bands — globalAlpha from the widget field, per-band alpha from the color itself
    if (timeWindows && timeWindows.length > 0) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, timeWindowsAlpha));
        for (const tw of timeWindows) {
            const y1 = minToContentY(Math.max(tw.start, rangeStartMin), rangeStartMin, pxPerMin);
            const y2 = minToContentY(Math.min(tw.end, rangeEndMin), rangeStartMin, pxPerMin);
            if (y2 <= y1) continue;
            ctx.fillStyle = tw.color;
            ctx.fillRect(TIME_LABEL_W, y1, contentW, y2 - y1);
        }
        ctx.restore();
    }

    // Dwell shade
    if (showDwell) {
        ctx.fillStyle = C.dwellShade;
        for (let m = rangeStartMin; m < rangeEndMin; m += 50) {
            const yTop = minToContentY(m, rangeStartMin, pxPerMin);
            ctx.fillRect(TIME_LABEL_W, yTop, contentW, 25 * pxPerMin);
        }
    }

    // Visible slot range
    const visMinute = Math.max(rangeStartMin, Math.floor(contentYToMin(scrollY, rangeStartMin, pxPerMin) / SLOT_MINS) * SLOT_MINS - SLOT_MINS);
    const visMaxMinute = Math.min(rangeEndMin, Math.ceil(contentYToMin(scrollY + viewH, rangeStartMin, pxPerMin) / SLOT_MINS) * SLOT_MINS + SLOT_MINS);

    // Horizontal grid lines — opacity controlled by gridAlpha field
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, gridAlpha));
    for (let m = visMinute; m <= visMaxMinute; m += SLOT_MINS) {
        if (m < rangeStartMin || m > rangeEndMin) continue;
        const gy = minToContentY(m, rangeStartMin, pxPerMin);
        const isHour = m % 60 === 0;
        const isHalfHour = !isHour && m % 30 === 0;
        ctx.strokeStyle = isHour ? C.gridHour : C.gridSlot;
        ctx.lineWidth = isHour ? 1.2 : isHalfHour ? 0.8 : 0.5;
        ctx.beginPath();
        ctx.moveTo(TIME_LABEL_W, gy);
        ctx.lineTo(TIME_LABEL_W + contentW, gy);
        ctx.stroke();
    }
    ctx.restore();

    // Vertical column dividers
    bays.forEach((_id, idx) => {
        const bx = colX(idx);
        ctx.strokeStyle = C.labelBorder;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bx + COL_W - 0.5, 0);
        ctx.lineTo(bx + COL_W - 0.5, contentH);
        ctx.stroke();
        if (split) {
            ctx.strokeStyle = "rgba(251,140,0,0.2)";
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(bx + COL_W / 2, 0);
            ctx.lineTo(bx + COL_W / 2, contentH);
            ctx.stroke();
        }
    });
}

// Pass 2: frozen time-label column — redraws over whatever pass 1 put there
// Called inside translate(0, HEADER_H - scrollY), clipped to (0, HEADER_H, TIME_LABEL_W, viewH)
function drawTimeLabelPass(
    ctx: CanvasRenderingContext2D,
    rangeStart: number,
    rangeEnd: number,
    pxPerMin: number,
    scrollY: number,
    viewH: number,
    nowMin: number | null
): void {
    const rangeStartMin = rangeStart * 60;
    const rangeEndMin = rangeEnd * 60;
    const contentH = (rangeEndMin - rangeStartMin) * pxPerMin;

    // Background
    ctx.fillStyle = C.labelBg;
    ctx.fillRect(0, 0, TIME_LABEL_W, contentH);

    // Right border
    ctx.strokeStyle = C.labelBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(TIME_LABEL_W - 0.5, 0);
    ctx.lineTo(TIME_LABEL_W - 0.5, contentH);
    ctx.stroke();

    const visMinute = Math.max(rangeStartMin, Math.floor(contentYToMin(scrollY, rangeStartMin, pxPerMin) / SLOT_MINS) * SLOT_MINS - SLOT_MINS);
    const visMaxMinute = Math.min(rangeEndMin, Math.ceil(contentYToMin(scrollY + viewH, rangeStartMin, pxPerMin) / SLOT_MINS) * SLOT_MINS + SLOT_MINS);

    for (let m = visMinute; m <= visMaxMinute; m += SLOT_MINS) {
        if (m < rangeStartMin || m > rangeEndMin) continue;
        const gy = minToContentY(m, rangeStartMin, pxPerMin);
        const isHour = m % 60 === 0;
        const isHalfHour = m % 30 === 0;
        const isFirst = m === rangeStartMin;

        ctx.textAlign = "right";
        ctx.textBaseline = isFirst ? "top" : "bottom";
        if (isHour) {
            ctx.fillStyle = "#333";
            ctx.font = "bold 10px sans-serif";
            ctx.fillText(formatMinutes(m), TIME_LABEL_W - 4, isFirst ? gy + 1 : gy - 1);
        } else if (isHalfHour) {
            ctx.fillStyle = "#555";
            ctx.font = "10px sans-serif";
            ctx.fillText(formatMinutes(m), TIME_LABEL_W - 4, isFirst ? gy + 1 : gy - 1);
        } else {
            ctx.fillStyle = C.headerText;
            ctx.font = "9px sans-serif";
            ctx.fillText(formatMinutes(m), TIME_LABEL_W - 4, isFirst ? gy + 1 : gy - 1);
        }
    }

    // Now pill (drawn in time-label area)
    if (nowMin !== null && nowMin > rangeStartMin && nowMin < rangeEndMin) {
        const gy = minToContentY(nowMin, rangeStartMin, pxPerMin);
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
    }
}

// Pass 3: bay column headers — scrolled by scrollX, frozen at Y=0
// Called inside translate(-scrollX, 0), clipped to bay area header
function drawBayHeaderPass(
    ctx: CanvasRenderingContext2D,
    bays: string[],
    bayStatusMap: Map<string, BayStatus>,
    bayTypeMap: Map<string, string>,
    hasPlanActual: boolean,
    showActualRows: boolean
): void {
    const split = hasPlanActual && showActualRows;
    const stripeH = split ? 5 : 0;

    ctx.fillStyle = C.headerBg;
    // Fill a wide area to cover scrolled range
    ctx.fillRect(TIME_LABEL_W, 0, bays.length * COL_W, HEADER_H);

    bays.forEach((bayId, idx) => {
        const bx = colX(idx);
        const bayInfo = bayStatusMap.get(bayId);
        const bayType = bayTypeMap.get(bayId) ?? "";

        ctx.fillStyle = idx % 2 === 0 ? C.colEven : C.colOdd;
        ctx.fillRect(bx, 0, COL_W, HEADER_H);

        if (split) {
            ctx.fillStyle = "#1565C0";
            ctx.fillRect(bx, HEADER_H - stripeH, COL_W / 2, stripeH);
            ctx.fillStyle = "#FB8C00";
            ctx.fillRect(bx + COL_W / 2, HEADER_H - stripeH, COL_W / 2, stripeH);
        }

        const statusColor = bayInfo ? bayStatusColor(bayInfo.color) : "";
        const occupied = bayInfo?.occupied ?? null;
        const truckColor = statusColor || (occupied === false ? "#90A4AE" : "#1565C0");
        if (bayInfo !== undefined) {
            drawTruckIconH(ctx, bx + COL_W / 2, 13, occupied ?? false, truckColor);
        }

        ctx.save();
        ctx.beginPath();
        ctx.rect(bx + 2, 0, COL_W - 4, HEADER_H);
        ctx.clip();
        ctx.textAlign = "center";
        const cx = bx + COL_W / 2;
        const bottomY = HEADER_H - stripeH - 2;

        if (bayType) {
            ctx.fillStyle = C.labelText;
            ctx.font = "bold 11px sans-serif";
            ctx.textBaseline = "bottom";
            ctx.fillText(bayId, cx, bottomY - 13);
            ctx.fillStyle = C.headerText;
            ctx.font = "10px sans-serif";
            ctx.fillText(bayType, cx, bottomY);
        } else {
            ctx.fillStyle = C.labelText;
            ctx.font = "bold 11px sans-serif";
            ctx.textBaseline = "bottom";
            ctx.fillText(bayId, cx, bottomY);
        }
        ctx.restore();

        ctx.strokeStyle = C.labelBorder;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bx + COL_W - 0.5, 0);
        ctx.lineTo(bx + COL_W - 0.5, HEADER_H);
        ctx.stroke();

        if (split) {
            ctx.strokeStyle = C.gridSlot;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(bx + COL_W / 2, 0);
            ctx.lineTo(bx + COL_W / 2, HEADER_H - 4);
            ctx.stroke();
        }
    });
}

// Pass 4: corner cell — no scroll, drawn last to cover everything else in that area
function drawCornerPass(
    ctx: CanvasRenderingContext2D,
    resourceLabel: string
): void {
    ctx.fillStyle = C.labelBg;
    ctx.fillRect(0, 0, TIME_LABEL_W, HEADER_H);
    ctx.fillStyle = C.headerText;
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(resourceLabel || "Time", TIME_LABEL_W / 2, HEADER_H / 2);

    ctx.strokeStyle = C.labelBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(TIME_LABEL_W - 0.5, 0);
    ctx.lineTo(TIME_LABEL_W - 0.5, HEADER_H);
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
    const leftX = colX(bayIdx);
    let bx: number, bw: number;
    if (split) {
        bw = COL_W / 2 - 4;
        bx = block.subRow === "actual" ? leftX + COL_W / 2 + 2 : leftX + 2;
    } else {
        bx = leftX + 2;
        bw = COL_W - 4;
    }
    if (bw < 2) return;

    const byTop = minToContentY(visStart, rangeStartMin, pxPerMin) + 2;
    const byBot = minToContentY(visEnd, rangeStartMin, pxPerMin) - 2;
    const bh = byBot - byTop;
    if (bh < 2) return;

    const { fill: rawFill } = blockColors(block, palette);
    const isPlan = block.subRow === "plan";
    const fill = isPlan ? lightenColor(rawFill, 0.28) : rawFill;
    const textColor = isPlan || isLightColor(fill) ? "#333" : "#fff";

    ctx.globalAlpha = isDragging ? 0.72 : 1;
    drawRoundedRect(ctx, bx, byTop, bw, bh, 4);
    ctx.fillStyle = fill;
    ctx.fill();

    if (isPlan) {
        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = rawFill;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
    }

    if (bh > RESIZE_HIT * 2 + 4) {
        ctx.fillStyle = C.blockEdge;
        ctx.fillRect(bx, byTop, bw, RESIZE_HIT);
        ctx.fillRect(bx, byBot - RESIZE_HIT, bw, RESIZE_HIT);
    }

    if (bh > 16 && bw > 12) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(bx + 2, byTop + RESIZE_HIT, bw - 4, bh - RESIZE_HIT * 2);
        ctx.clip();
        ctx.fillStyle = textColor;
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

// Now line — drawn in content space (pass 1 context)
function drawNowLine(
    ctx: CanvasRenderingContext2D,
    nowMin: number,
    rangeStart: number,
    pxPerMin: number,
    contentW: number
): void {
    const gy = minToContentY(nowMin, rangeStart * 60, pxPerMin);
    ctx.save();
    ctx.strokeStyle = C.nowLine;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(TIME_LABEL_W, gy);
    ctx.lineTo(TIME_LABEL_W + contentW, gy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
}

function drawConflictHatching(
    ctx: CanvasRenderingContext2D,
    blocks: ScheduleBlock[],
    bayIdxMap: Map<string, number>,
    bays: string[],
    rangeStartMin: number,
    rangeEndMin: number,
    pxPerMin: number,
    hasPlanActual: boolean,
    showActualRows: boolean
): void {
    const byKey = new Map<string, ScheduleBlock[]>();
    for (const b of blocks) {
        if (!b.isConflict) continue;
        const key = b.subRow ? `${b.bayId}::${b.subRow}` : b.bayId;
        const list = byKey.get(key);
        if (list) list.push(b); else byKey.set(key, [b]);
    }
    if (byKey.size === 0) return;

    const split = hasPlanActual && showActualRows;

    byKey.forEach((grp, key) => {
        const [bayId, subRow] = key.split("::") as [string, ("plan" | "actual") | undefined];
        const bayIdx = bayIdxMap.get(bayId) ?? -1;
        if (bayIdx < 0 || bayIdx >= bays.length) return;

        let bx: number, bw: number;
        if (split) {
            bw = COL_W / 2;
            bx = subRow === "actual" ? colX(bayIdx) + bw : colX(bayIdx);
        } else {
            bx = colX(bayIdx);
            bw = COL_W;
        }

        grp.sort((a, b) => a.startMin - b.startMin);
        const intervals: Array<[number, number]> = [];
        for (let i = 0; i < grp.length; i++) {
            for (let j = i + 1; j < grp.length; j++) {
                if (grp[j].startMin >= grp[i].endMin) break;
                const os = Math.max(grp[i].startMin, grp[j].startMin);
                const oe = Math.min(grp[i].endMin, grp[j].endMin);
                if (oe > os) intervals.push([os, oe]);
            }
        }
        if (intervals.length === 0) return;

        intervals.sort((a, b) => a[0] - b[0]);
        const merged: Array<[number, number]> = [intervals[0]];
        for (let i = 1; i < intervals.length; i++) {
            const last = merged[merged.length - 1];
            if (intervals[i][0] <= last[1]) last[1] = Math.max(last[1], intervals[i][1]);
            else merged.push(intervals[i]);
        }

        for (const [os, oe] of merged) {
            const y1 = minToContentY(Math.max(os, rangeStartMin), rangeStartMin, pxPerMin);
            const y2 = minToContentY(Math.min(oe, rangeEndMin), rangeStartMin, pxPerMin);
            if (y2 <= y1) continue;
            const h = y2 - y1;

            ctx.save();
            ctx.beginPath();
            ctx.rect(bx, y1, bw, h);
            ctx.clip();
            ctx.fillStyle = "rgba(220, 40, 40, 0.12)";
            ctx.fillRect(bx, y1, bw, h);
            ctx.strokeStyle = "rgba(200, 30, 30, 0.5)";
            ctx.lineWidth = 1.2;
            const spacing = 6;
            for (let d = -h; d < bw + h; d += spacing) {
                ctx.beginPath();
                ctx.moveTo(bx + d, y1);
                ctx.lineTo(bx + d + h, y2);
                ctx.stroke();
            }
            ctx.restore();
        }
    });
}

// ─── Main render function ─────────────────────────────────────────────────────

interface RenderParams {
    blocks: ScheduleBlock[];
    bays: string[];
    bayIdxMap: Map<string, number>;
    bayStatusMap: Map<string, BayStatus>;
    scrollY: number;
    scrollX: number;
    maxScrollX: number;
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
    bayTypeMap: Map<string, string>;
    colW: number;
    timeWindows?: TimeWindow[];
    timeWindowsAlpha: number;
    gridAlpha: number;
}

function renderCanvas(ctx: CanvasRenderingContext2D, p: RenderParams): void {
    const {
        blocks, bays, bayIdxMap, bayStatusMap, scrollY, scrollX, maxScrollX,
        canvasW, canvasH, pxPerMin, showDwell, drag, rangeStart, rangeEnd,
        nowMin, palette, resourceLabel, hasPlanActual, showActualRows,
        bayTypeMap, colW, timeWindows, timeWindowsAlpha, gridAlpha
    } = p;

    COL_W = colW;

    const rangeStartMin = rangeStart * 60;
    const rangeEndMin = rangeEnd * 60;
    const hScrollH = maxScrollX > 0 ? H_SCROLLBAR_H : 0;
    const viewH = canvasH - HEADER_H - hScrollH;
    const viewW = canvasW - TIME_LABEL_W - SCROLLBAR_W;
    const contentW = bays.length * COL_W;
    const contentH = (rangeEndMin - rangeStartMin) * pxPerMin;

    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.fillStyle = C.outerBg;
    ctx.fillRect(0, 0, canvasW, canvasH);

    // ── PASS 1: Bay content — clipped to bay area, scrolled both X and Y ───────
    ctx.save();
    ctx.beginPath();
    ctx.rect(TIME_LABEL_W, HEADER_H, viewW, viewH);
    ctx.clip();
    // colX(i) = TIME_LABEL_W + i*COL_W → screen X = TIME_LABEL_W + i*COL_W - scrollX ✓
    ctx.translate(-scrollX, HEADER_H - scrollY);

    drawBayContentPass(ctx, bays, rangeStart, rangeEnd, pxPerMin, scrollY, viewH,
        showDwell, hasPlanActual, showActualRows, timeWindows, timeWindowsAlpha, gridAlpha, contentW);

    const inRange = nowMin !== null && nowMin > rangeStartMin && nowMin < rangeEndMin;
    if (inRange) {
        drawNowLine(ctx, nowMin!, rangeStart, pxPerMin, contentW);
    }

    for (const block of blocks) {
        if (!showActualRows && block.subRow === "actual") continue;

        let startMin = block.startMin;
        let endMin = block.endMin;
        let renderBayIdx = bayIdxMap.get(block.bayId) ?? -1;

        if (drag && drag.block.item === block.item) {
            startMin = drag.currentStart;
            endMin = drag.currentEnd;
            renderBayIdx = drag.currentBayIdx;
        }
        if (renderBayIdx < 0 || renderBayIdx >= bays.length) continue;
        if (endMin <= rangeStartMin || startMin >= rangeEndMin) continue;

        const byTop = minToContentY(startMin, rangeStartMin, pxPerMin);
        const byBot = minToContentY(endMin, rangeStartMin, pxPerMin);
        if (byBot < scrollY || byTop > scrollY + viewH) continue;

        drawVerticalBlock(ctx, block, renderBayIdx, startMin, endMin,
            rangeStart, rangeEnd, pxPerMin,
            drag?.block.item === block.item, palette, hasPlanActual, showActualRows);
    }

    drawConflictHatching(ctx, blocks, bayIdxMap, bays,
        rangeStartMin, rangeEndMin, pxPerMin, hasPlanActual, showActualRows);

    ctx.restore();

    // ── PASS 2: Time-label column — frozen X, scrolled Y ────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, HEADER_H, TIME_LABEL_W, viewH);
    ctx.clip();
    ctx.translate(0, HEADER_H - scrollY);
    drawTimeLabelPass(ctx, rangeStart, rangeEnd, pxPerMin, scrollY, viewH, nowMin);
    ctx.restore();

    // ── PASS 3: Bay column headers — scrolled X, frozen Y ────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.rect(TIME_LABEL_W, 0, viewW, HEADER_H);
    ctx.clip();
    ctx.translate(-scrollX, 0);
    drawBayHeaderPass(ctx, bays, bayStatusMap, bayTypeMap, hasPlanActual, showActualRows);
    ctx.restore();

    // ── PASS 4: Corner cell — no scroll ──────────────────────────────────────────
    drawCornerPass(ctx, resourceLabel);

    // ── Header bottom border ──────────────────────────────────────────────────────
    ctx.strokeStyle = C.headerBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, HEADER_H - 0.5);
    ctx.lineTo(canvasW, HEADER_H - 0.5);
    ctx.stroke();

    // ── Vertical scrollbar ────────────────────────────────────────────────────────
    const vThumbH = Math.max(24, contentH > 0 ? Math.floor((viewH / contentH) * viewH) : viewH);
    const vThumbTop = contentH > viewH
        ? Math.floor((scrollY / (contentH - viewH)) * (viewH - vThumbH))
        : 0;
    ctx.fillStyle = C.scrollTrack;
    ctx.fillRect(canvasW - SCROLLBAR_W, HEADER_H, SCROLLBAR_W, viewH);
    ctx.fillStyle = C.scrollThumb;
    drawRoundedRect(ctx, canvasW - SCROLLBAR_W + 2, HEADER_H + vThumbTop, SCROLLBAR_W - 4, vThumbH, 3);
    ctx.fill();

    // ── Horizontal scrollbar (when content wider than view) ───────────────────────
    if (maxScrollX > 0 && contentW > 0) {
        const hTrackW = viewW;
        const hThumbW = Math.max(20, Math.floor((viewW / (viewW + maxScrollX)) * hTrackW));
        const hThumbLeft = Math.floor((scrollX / maxScrollX) * (hTrackW - hThumbW));
        ctx.fillStyle = C.scrollTrack;
        ctx.fillRect(TIME_LABEL_W, canvasH - hScrollH, hTrackW, hScrollH);
        ctx.fillStyle = C.scrollThumb;
        drawRoundedRect(ctx, TIME_LABEL_W + hThumbLeft + 2, canvasH - hScrollH + 2,
            hThumbW - 4, hScrollH - 4, 3);
        ctx.fill();
    }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function VerticalSchedulerCanvas({
    blocks,
    bays,
    bayStatusMap,
    bayTypeMap = new Map(),
    columnWidth = 0,
    timeWindows,
    timeWindowsAlpha = 0.55,
    gridAlpha = 0.5,
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
    onActualTruckClick,
    onScheduleChange,
    onEmptySlotClick,
    onBayClick
}: VerticalSchedulerCanvasProps): ReactElement {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerW, setContainerW] = useState(800);
    const [canvasH, setCanvasH] = useState(560);
    const canvasW = containerW;

    const [scrollY, setScrollY] = useState(0);
    const scrollYRef = useRef(0);
    const [scrollX, setScrollX] = useState(0);
    const scrollXRef = useRef(0);

    const dragRef = useRef<DragState | null>(null);
    const rafRef = useRef<number>(0);
    const scrollThumbDragRef = useRef<{ startY: number; startScrollY: number } | null>(null);
    const hScrollThumbDragRef = useRef<{ startX: number; startScrollX: number } | null>(null);
    const panRef = useRef<{ startX: number; startY: number; startScrollX: number; startScrollY: number } | null>(null);
    const [hoverInfo, setHoverInfo] = useState<{ block: ScheduleBlock; clientX: number; clientY: number } | null>(null);

    const pxPerMin = Math.max(0.5, (rowHeight || 20) / SLOT_MINS);
    const rangeStartMin = timeRangeStart * 60;
    const rangeEndMin = timeRangeEnd * 60;
    const contentH = (rangeEndMin - rangeStartMin) * pxPerMin;

    // Compute colW and maxScrollX as derived values
    const colW = useMemo(() => {
        if (columnWidth > 0) return columnWidth;
        const available = containerW - TIME_LABEL_W - SCROLLBAR_W;
        return bays.length > 0 ? Math.max(50, Math.floor(available / bays.length)) : 90;
    }, [columnWidth, containerW, bays.length]);

    const maxScrollX = useMemo(() => {
        if (columnWidth <= 0) return 0; // auto-fit: no H scroll
        const viewW = containerW - TIME_LABEL_W - SCROLLBAR_W;
        return Math.max(0, bays.length * colW - viewW);
    }, [columnWidth, containerW, bays.length, colW]);

    const bayIdxMap = useMemo(() => {
        const m = new Map<string, number>();
        bays.forEach((b, i) => m.set(b, i));
        return m;
    }, [bays]);

    const updateScrollY = useCallback(
        (y: number) => {
            const hScrollH = maxScrollX > 0 ? H_SCROLLBAR_H : 0;
            const maxScroll = Math.max(0, contentH - (canvasH - HEADER_H - hScrollH));
            const clamped = Math.max(0, Math.min(maxScroll, y));
            scrollYRef.current = clamped;
            setScrollY(clamped);
        },
        [contentH, canvasH, maxScrollX]
    );

    const updateScrollX = useCallback(
        (x: number) => {
            const clamped = Math.max(0, Math.min(maxScrollX, x));
            scrollXRef.current = clamped;
            setScrollX(clamped);
        },
        [maxScrollX]
    );

    useLayoutEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const obs = new ResizeObserver(entries => {
            const { width, height } = entries[0].contentRect;
            setContainerW(Math.max(TIME_LABEL_W + COL_W + SCROLLBAR_W, Math.floor(width)));
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
            scrollX: scrollXRef.current,
            maxScrollX,
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
            showActualRows,
            bayTypeMap,
            colW,
            timeWindows,
            timeWindowsAlpha,
            gridAlpha
        });
    }, [
        blocks, bays, bayIdxMap, bayStatusMap, bayTypeMap, colW, maxScrollX, canvasW, canvasH,
        pxPerMin, showDwellMarkers, timeRangeStart, timeRangeEnd,
        palette, resourceLabel, hasPlanActual, showActualRows, computeNowMin, timeWindows, timeWindowsAlpha, gridAlpha
    ]);

    useEffect(() => { drawCanvas(); }, [drawCanvas, scrollY, scrollX]);
    useEffect(() => { updateScrollY(scrollYRef.current); }, [contentH, canvasH, updateScrollY]);
    useEffect(() => { updateScrollX(scrollXRef.current); }, [maxScrollX, updateScrollX]);

    const drawCanvasRef = useRef(drawCanvas);
    useEffect(() => { drawCanvasRef.current = drawCanvas; });
    useEffect(() => {
        const id = setInterval(() => drawCanvasRef.current(), 60000);
        return () => clearInterval(id);
    }, []);

    // Non-passive wheel: handle both vertical (deltaY) and horizontal (deltaX/shift+wheel)
    const updateScrollYRef = useRef(updateScrollY);
    const updateScrollXRef = useRef(updateScrollX);
    useEffect(() => { updateScrollYRef.current = updateScrollY; });
    useEffect(() => { updateScrollXRef.current = updateScrollX; });
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const onWheel = (e: WheelEvent) => {
            const absX = Math.abs(e.deltaX);
            const absY = Math.abs(e.deltaY);
            if (e.shiftKey && maxScrollX > 0) {
                // Shift+wheel → horizontal scroll (desktop mouse without trackpad)
                e.preventDefault();
                updateScrollXRef.current(scrollXRef.current + (absY > 0 ? e.deltaY : e.deltaX));
            } else if (absX > absY && maxScrollX > 0) {
                // Trackpad horizontal swipe → horizontal scroll
                e.preventDefault();
                updateScrollXRef.current(scrollXRef.current + e.deltaX);
            } else if (absY > 0) {
                // Vertical scroll
                e.preventDefault();
                updateScrollYRef.current(scrollYRef.current + e.deltaY);
            }
        };
        canvas.addEventListener("wheel", onWheel, { passive: false });
        return () => canvas.removeEventListener("wheel", onWheel);
    }, [maxScrollX]);

    // ─── Hit testing ──────────────────────────────────────────────────────────

    const hitTestCol = useCallback(
        (canvasX: number): number => {
            if (canvasX < TIME_LABEL_W) return -1;
            // Add scrollX to get content-space X
            const contentX = canvasX + scrollXRef.current;
            const idx = Math.floor((contentX - TIME_LABEL_W) / COL_W);
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

            // Content-space X within column (accounting for H scroll)
            const contentX = canvasX + scrollXRef.current;
            const xWithinCol = contentX - colX(colIdx);
            const isActualSubCol = split && xWithinCol >= COL_W / 2;

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
            // Middle button: enter pan mode (scroll both axes by dragging)
            if (e.button === 1) {
                e.preventDefault();
                panRef.current = {
                    startX: e.clientX,
                    startY: e.clientY,
                    startScrollX: scrollXRef.current,
                    startScrollY: scrollYRef.current
                };
                if (canvasRef.current) canvasRef.current.style.cursor = "grab";
                return;
            }
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
                    moved: false,
                    readOnly: hit.block.isReadOnly ?? false
                };
            }
        },
        [hitTestBlock, bayIdxMap, pxPerMin, canvasCoords]
    );

    const handleMouseMove = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            // Pan mode (middle button drag)
            if (panRef.current) {
                const pan = panRef.current;
                updateScrollXRef.current(pan.startScrollX - (e.clientX - pan.startX));
                updateScrollYRef.current(pan.startScrollY - (e.clientY - pan.startY));
                return;
            }

            const { x, y } = canvasCoords(e);
            const drag = dragRef.current;

            if (!drag) {
                const hit = hitTestBlock(x, y);
                const canvas = canvasRef.current;
                if (canvas) {
                    const inHeader = y < HEADER_H && x >= TIME_LABEL_W;
                    canvas.style.cursor =
                        inHeader && onBayClick
                            ? "pointer"
                            : hit?.mode === "resize-top" || hit?.mode === "resize-bottom"
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
            if (drag.readOnly) return;

            const deltaMin = dy / drag.pxPerMin;

            if (drag.mode === "move") {
                const dur = drag.origEnd - drag.origStart;
                const ns = Math.max(rangeStartMin, Math.min(rangeEndMin - dur, drag.origStart + deltaMin));
                drag.currentStart = ns;
                drag.currentEnd = ns + dur;
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
        [canvasCoords, hitTestBlock, hitTestCol, rangeStartMin, rangeEndMin, drawCanvas, onBayClick]
    );

    const handleMouseUp = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            // End pan mode (middle button)
            if (panRef.current) {
                panRef.current = null;
                if (canvasRef.current) canvasRef.current.style.cursor = "default";
                return;
            }

            const { x, y } = canvasCoords(e);
            const drag = dragRef.current;
            dragRef.current = null;

            if (!drag) {
                if (y <= HEADER_H && x >= TIME_LABEL_W && onBayClick) {
                    // Bay header click — use scrollX to find content column
                    const contentX = x + scrollXRef.current;
                    const colIdx = Math.floor((contentX - TIME_LABEL_W) / COL_W);
                    if (colIdx >= 0 && colIdx < bays.length) {
                        onBayClick(bays[colIdx]);
                    }
                } else if (y > HEADER_H && x > TIME_LABEL_W) {
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
                if (drag.readOnly) {
                    onActualTruckClick?.(drag.block);
                } else {
                    onTruckClick(drag.block);
                }
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
            onEmptySlotClick, drawCanvas, onBayClick
        ]
    );

    const handleMouseLeave = useCallback(() => {
        panRef.current = null;
        if (dragRef.current?.moved) {
            dragRef.current = null;
            drawCanvas();
        } else {
            dragRef.current = null;
        }
        if (canvasRef.current) canvasRef.current.style.cursor = "default";
        setHoverInfo(null);
    }, [drawCanvas]);

    // ─── Custom vertical scrollbar (DOM overlay) ───────────────────────────────

    const hScrollH = maxScrollX > 0 ? H_SCROLLBAR_H : 0;
    const viewportH = canvasH - HEADER_H - hScrollH;
    const viewW = containerW - TIME_LABEL_W - SCROLLBAR_W;
    const thumbH = Math.max(24, contentH > 0 ? Math.floor((viewportH / contentH) * viewportH) : viewportH);
    const thumbTop = contentH > viewportH
        ? Math.floor((scrollY / (contentH - viewportH)) * (viewportH - thumbH))
        : 0;

    // H scrollbar geometry
    const hThumbW = maxScrollX > 0 ? Math.max(20, Math.floor((viewW / (viewW + maxScrollX)) * viewW)) : viewW;
    const hThumbLeft = maxScrollX > 0 ? Math.floor((scrollX / maxScrollX) * (viewW - hThumbW)) : 0;

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

    // ─── Custom horizontal scrollbar (DOM overlay) ────────────────────────────

    const handleHScrollbarClick = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            e.stopPropagation();
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const ratio = Math.max(0, Math.min(1, clickX / (viewW - hThumbW)));
            updateScrollX(ratio * maxScrollX);
        },
        [viewW, hThumbW, maxScrollX, updateScrollX]
    );

    const handleHThumbMouseDown = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            hScrollThumbDragRef.current = { startX: e.clientX, startScrollX: scrollXRef.current };
            const onMove = (mv: MouseEvent) => {
                const td = hScrollThumbDragRef.current;
                if (!td) return;
                const dx = mv.clientX - td.startX;
                const scale = viewW > hThumbW ? maxScrollX / (viewW - hThumbW) : 1;
                updateScrollXRef.current(td.startScrollX + dx * scale);
            };
            const onUp = () => {
                hScrollThumbDragRef.current = null;
                window.removeEventListener("mousemove", onMove);
                window.removeEventListener("mouseup", onUp);
            };
            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
        },
        [viewW, hThumbW, maxScrollX]
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
            {/* DOM vertical scrollbar */}
            <div
                className="truck-scheduler__scrollbar"
                style={{ height: viewportH, top: HEADER_H }}
                onClick={handleScrollbarClick}
            >
                <div
                    className="truck-scheduler__scrollbar-thumb"
                    style={{ top: thumbTop, height: thumbH }}
                    onMouseDown={handleThumbMouseDown}
                />
            </div>

            {/* DOM horizontal scrollbar */}
            {maxScrollX > 0 && (
                <div
                    className="truck-scheduler__h-scrollbar"
                    style={{ left: TIME_LABEL_W, width: viewW, height: H_SCROLLBAR_H }}
                    onClick={handleHScrollbarClick}
                >
                    <div
                        className="truck-scheduler__h-scrollbar-thumb"
                        style={{ left: hThumbLeft, width: hThumbW }}
                        onMouseDown={handleHThumbMouseDown}
                    />
                </div>
            )}

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
                            <span>{hBlock.subRow === "plan" ? "Plan" : "Actual"}</span>
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
