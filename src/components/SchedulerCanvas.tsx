import {
    ReactElement,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState
} from "react";
import { ScheduleBlock } from "./types";

// ─── Layout ──────────────────────────────────────────────────────────────────
const BAY_LABEL_W = 100;
const HEADER_H = 40;
const SCROLLBAR_W = 10;
const RESIZE_HIT = 6;   // px grab zone on block edges
const MIN_BLOCK_MIN = 1;
const MINUTES = 1440;   // minutes in a day

// ─── Colors ───────────────────────────────────────────────────────────────────
const C = {
    headerBg: "#f5f5f5",
    headerText: "#555",
    headerBorder: "#ccc",
    gridMajor: "#cccccc",
    gridMinor: "#eeeeee",
    dwellShade: "rgba(74,144,217,0.06)",
    rowEven: "#ffffff",
    rowOdd: "#fafafa",
    rowBorder: "#ebebeb",
    labelText: "#444",
    blockScheduled: "#4a90d9",
    blockInProgress: "#f57c00",
    blockCompleted: "#43a047",
    blockConflict: "#e53935",
    blockText: "#ffffff",
    blockEdge: "rgba(0,0,0,0.25)",
    scrollTrack: "#f0f0f0",
    scrollThumb: "#bbb",
    scrollThumbHover: "#888",
};

// ─── Types ────────────────────────────────────────────────────────────────────

type DragMode = "move" | "resize-left" | "resize-right";

interface DragState {
    mode: DragMode;
    block: ScheduleBlock;
    startX: number;        // canvas X at mousedown
    startY: number;        // canvas Y at mousedown
    origStart: number;
    origEnd: number;
    origBayIdx: number;
    pxPerMin: number;
    currentStart: number;
    currentEnd: number;
    currentBayIdx: number;
    moved: boolean;        // true once mouse moves beyond click threshold
}

interface CanvasRenderParams {
    blocks: ScheduleBlock[];
    bays: string[];
    bayIndexMap: Map<string, number>;
    scrollY: number;
    canvasW: number;
    canvasH: number;       // viewport height (canvas element height)
    rowH: number;
    showDwell: boolean;
    drag: DragState | null;
}

export interface SchedulerCanvasProps {
    blocks: ScheduleBlock[];
    bays: string[];
    rowHeight: number;
    showDwellMarkers: boolean;
    onTruckClick: (block: ScheduleBlock) => void;
    onScheduleChange: (block: ScheduleBlock, newStartMin: number, newEndMin: number) => void;
    onEmptySlotClick: (bayId: string, startMin: number, endMin: number, defaultDwell: number) => void;
    defaultDwellMinutes: number;
}

export function SchedulerCanvas({
    blocks,
    bays,
    rowHeight,
    showDwellMarkers,
    onTruckClick,
    onScheduleChange,
    onEmptySlotClick,
    defaultDwellMinutes
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

    // Keep scrollY synced to ref for use in RAF callbacks
    const updateScrollY = useCallback((y: number) => {
        const maxScroll = Math.max(0, bays.length * rowHeight - (canvasH - HEADER_H));
        const clamped = Math.max(0, Math.min(maxScroll, y));
        scrollYRef.current = clamped;
        setScrollY(clamped);
    }, [bays.length, rowHeight, canvasH]);

    // ─── Bay index map (O(1) lookup during draw) ──────────────────────────────
    const bayIndexMap = useMemo(() => new Map(bays.map((b, i) => [b, i])), [bays]);

    // ─── Responsive resize ────────────────────────────────────────────────────
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

    // ─── Draw ─────────────────────────────────────────────────────────────────
    const drawCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        render(ctx, {
            blocks,
            bays,
            bayIndexMap,
            scrollY: scrollYRef.current,
            canvasW,
            canvasH,
            rowH: rowHeight,
            showDwell: showDwellMarkers,
            drag: dragRef.current
        });
    }, [blocks, bays, bayIndexMap, canvasW, canvasH, rowHeight, showDwellMarkers]);

    useEffect(() => { drawCanvas(); }, [drawCanvas]);

    // ─── Scroll clamp when bays/rowHeight/canvasH change ─────────────────────
    useEffect(() => {
        updateScrollY(scrollYRef.current);
    }, [bays.length, rowHeight, canvasH, updateScrollY]);

    // ─── Hit testing ──────────────────────────────────────────────────────────
    const hitTest = useCallback(
        (canvasX: number, canvasY: number): { block: ScheduleBlock; mode: DragMode } | null => {
            if (canvasY < HEADER_H) return null;
            const gridW = canvasW - BAY_LABEL_W - SCROLLBAR_W;
            const pxPerMin = gridW / MINUTES;
            const worldY = canvasY - HEADER_H + scrollYRef.current;
            const bayIdx = Math.floor(worldY / rowHeight);
            if (bayIdx < 0 || bayIdx >= bays.length) return null;
            const bayId = bays[bayIdx];

            // Check blocks in reverse (last drawn = top)
            for (let i = blocks.length - 1; i >= 0; i--) {
                const b = blocks[i];
                if (b.bayId !== bayId) continue;
                const bx = BAY_LABEL_W + b.startMin * pxPerMin;
                const bw = Math.max(2, (b.endMin - b.startMin) * pxPerMin);
                const by = bayIdx * rowHeight - scrollYRef.current + HEADER_H + 2;
                const bh = rowHeight - 4;

                if (canvasX >= bx && canvasX <= bx + bw && canvasY >= by && canvasY <= by + bh) {
                    if (canvasX <= bx + RESIZE_HIT) return { block: b, mode: "resize-left" };
                    if (canvasX >= bx + bw - RESIZE_HIT) return { block: b, mode: "resize-right" };
                    return { block: b, mode: "move" };
                }
            }
            return null;
        },
        [blocks, bays, canvasW, rowHeight]
    );

    const canvasCoords = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        const rect = canvasRef.current!.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }, []);

    // ─── Mouse events ─────────────────────────────────────────────────────────

    const handleMouseDown = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            if (e.button !== 0) return;
            const { x, y } = canvasCoords(e);
            const hit = hitTest(x, y);
            const gridW = canvasW - BAY_LABEL_W - SCROLLBAR_W;
            const pxPerMin = gridW / MINUTES;

            if (hit) {
                dragRef.current = {
                    mode: hit.mode,
                    block: hit.block,
                    startX: x,
                    startY: y,
                    origStart: hit.block.startMin,
                    origEnd: hit.block.endMin,
                    origBayIdx: bayIndexMap.get(hit.block.bayId) ?? 0,
                    pxPerMin,
                    currentStart: hit.block.startMin,
                    currentEnd: hit.block.endMin,
                    currentBayIdx: bayIndexMap.get(hit.block.bayId) ?? 0,
                    moved: false
                };
            }
        },
        [hitTest, canvasCoords, canvasW, bayIndexMap]
    );

    const handleMouseMove = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            const { x, y } = canvasCoords(e);
            const drag = dragRef.current;

            if (!drag) {
                // Update cursor
                const hit = hitTest(x, y);
                const canvas = canvasRef.current;
                if (canvas) {
                    canvas.style.cursor =
                        hit?.mode === "resize-left" || hit?.mode === "resize-right"
                            ? "ew-resize"
                            : hit?.mode === "move"
                            ? "grab"
                            : "default";
                }
                return;
            }

            const dx = x - drag.startX;
            if (Math.abs(dx) > 3 || Math.abs(y - drag.startY) > 3) drag.moved = true;
            if (!drag.moved) return;

            const deltaMin = dx / drag.pxPerMin;

            if (drag.mode === "move") {
                const dur = drag.origEnd - drag.origStart;
                const ns = Math.max(0, Math.min(MINUTES - dur, drag.origStart + deltaMin));
                drag.currentStart = ns;
                drag.currentEnd = ns + dur;
                // Vertical bay change
                const worldY = y - HEADER_H + scrollYRef.current;
                const newBayIdx = Math.max(0, Math.min(bays.length - 1, Math.floor(worldY / rowHeight)));
                drag.currentBayIdx = newBayIdx;
            } else if (drag.mode === "resize-left") {
                drag.currentStart = Math.max(0, Math.min(drag.origEnd - MIN_BLOCK_MIN, drag.origStart + deltaMin));
            } else {
                drag.currentEnd = Math.min(MINUTES, Math.max(drag.origStart + MIN_BLOCK_MIN, drag.origEnd + deltaMin));
            }

            // Schedule redraw
            cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(drawCanvas);
        },
        [canvasCoords, hitTest, canvasW, bays.length, rowHeight, drawCanvas]
    );

    const handleMouseUp = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            const { x, y } = canvasCoords(e);
            const drag = dragRef.current;
            dragRef.current = null;

            if (!drag) {
                // Click on empty slot — create new block
                if (y > HEADER_H && x > BAY_LABEL_W) {
                    const gridW = canvasW - BAY_LABEL_W - SCROLLBAR_W;
                    const pxPerMin = gridW / MINUTES;
                    const worldY = y - HEADER_H + scrollYRef.current;
                    const bayIdx = Math.floor(worldY / rowHeight);
                    if (bayIdx >= 0 && bayIdx < bays.length) {
                        const startMin = Math.max(0, Math.min(MINUTES - defaultDwellMinutes, (x - BAY_LABEL_W) / pxPerMin));
                        onEmptySlotClick(bays[bayIdx], startMin, startMin + defaultDwellMinutes, defaultDwellMinutes);
                    }
                }
                drawCanvas();
                return;
            }

            if (!drag.moved) {
                // Simple click on a block
                onTruckClick(drag.block);
            } else {
                // Commit drag
                const finalBayId = bays[drag.currentBayIdx] ?? drag.block.bayId;
                onScheduleChange(
                    { ...drag.block, bayId: finalBayId },
                    Math.round(drag.currentStart),
                    Math.round(drag.currentEnd)
                );
            }
            drawCanvas();
        },
        [canvasCoords, canvasW, bays, rowHeight, onTruckClick, onScheduleChange, onEmptySlotClick, defaultDwellMinutes, drawCanvas]
    );

    const handleMouseLeave = useCallback(() => {
        if (dragRef.current?.moved) {
            // Cancel drag — revert
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
    const totalH = bays.length * rowHeight;
    const viewportH = canvasH - HEADER_H;
    const thumbH = Math.max(24, viewportH > 0 ? Math.floor((viewportH / totalH) * viewportH) : 0);
    const thumbTop = totalH > viewportH
        ? Math.floor((scrollY / (totalH - viewportH)) * (viewportH - thumbH))
        : 0;

    const handleScrollbarClick = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            const clickY = e.clientY - rect.top - HEADER_H;
            const ratio = clickY / viewportH;
            updateScrollY(ratio * (totalH - viewportH));
        },
        [viewportH, totalH, updateScrollY]
    );

    const handleThumbMouseDown = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            scrollThumbDragRef.current = { startY: e.clientY, startScrollY: scrollYRef.current };
            const onMove = (mv: MouseEvent) => {
                const td = scrollThumbDragRef.current;
                if (!td) return;
                const dy = mv.clientY - td.startY;
                const scale = (totalH - viewportH) / (viewportH - thumbH);
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
        <div ref={containerRef} className="truck-scheduler__canvas-container" style={{ display: "flex", flexDirection: "row" }}>
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

// ─────────────────────────────────────────────────────────────────────────────
//  Pure render function — reads no React state, only params
// ─────────────────────────────────────────────────────────────────────────────

function render(ctx: CanvasRenderingContext2D, p: CanvasRenderParams): void {
    const { blocks, bays, bayIndexMap, scrollY, canvasW, canvasH, rowH, showDwell, drag } = p;
    const gridW = canvasW - BAY_LABEL_W;
    const pxPerMin = gridW / MINUTES;
    const viewH = canvasH - HEADER_H;
    const firstBay = Math.max(0, Math.floor(scrollY / rowH));
    const lastBay = Math.min(bays.length - 1, Math.ceil((scrollY + viewH) / rowH));

    ctx.clearRect(0, 0, canvasW, canvasH);

    // ── Header ──────────────────────────────────────────────────────────────
    drawHeader(ctx, canvasW, pxPerMin, showDwell);

    // ── Clip scrollable region ───────────────────────────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, HEADER_H, canvasW, viewH);
    ctx.clip();
    ctx.translate(0, HEADER_H - scrollY);

    // ── Rows ─────────────────────────────────────────────────────────────────
    for (let i = firstBay; i <= lastBay; i++) {
        drawRow(ctx, bays[i], i, canvasW, gridW, rowH, pxPerMin, showDwell);
    }

    // ── Blocks ───────────────────────────────────────────────────────────────
    // Build effective blocks (apply live drag offset)
    for (const block of blocks) {
        const bayIdx = bayIndexMap.get(block.bayId);
        if (bayIdx === undefined || bayIdx < firstBay || bayIdx > lastBay) continue;

        let startMin = block.startMin;
        let endMin = block.endMin;
        let bayIdx2 = bayIdx;

        if (drag && drag.block.item === block.item) {
            startMin = drag.currentStart;
            endMin = drag.currentEnd;
            bayIdx2 = drag.currentBayIdx;
            if (bayIdx2 < firstBay || bayIdx2 > lastBay) continue;
        }

        drawBlock(ctx, block, bayIdx2, startMin, endMin, rowH, pxPerMin, drag?.block.item === block.item);
    }

    ctx.restore();
}

function drawHeader(ctx: CanvasRenderingContext2D, canvasW: number, pxPerMin: number, showDwell: boolean): void {
    ctx.fillStyle = C.headerBg;
    ctx.fillRect(0, 0, canvasW, HEADER_H);

    // Bay label column header
    ctx.fillStyle = C.headerText;
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Bay", BAY_LABEL_W / 2, HEADER_H / 2);

    ctx.strokeStyle = C.headerBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, HEADER_H - 0.5);
    ctx.lineTo(canvasW, HEADER_H - 0.5);
    ctx.stroke();

    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";

    for (let h = 0; h <= 24; h++) {
        const x = BAY_LABEL_W + h * 60 * pxPerMin;
        ctx.strokeStyle = C.gridMajor;
        ctx.lineWidth = h % 6 === 0 ? 1 : 0.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, HEADER_H - 1);
        ctx.stroke();
        if (h < 24) {
            ctx.fillStyle = C.headerText;
            ctx.fillText(`${String(h).padStart(2, "0")}:00`, x + 30 * pxPerMin, HEADER_H / 2);
        }
    }

    if (showDwell) {
        // 25-min minor ticks in header
        ctx.strokeStyle = C.gridMinor;
        ctx.lineWidth = 0.5;
        for (let m = 25; m < MINUTES; m += 25) {
            if (m % 60 === 0) continue;
            const x = BAY_LABEL_W + m * pxPerMin;
            ctx.beginPath();
            ctx.moveTo(x, HEADER_H - 8);
            ctx.lineTo(x, HEADER_H - 1);
            ctx.stroke();
        }
    }
}

function drawRow(
    ctx: CanvasRenderingContext2D,
    bayId: string,
    bayIdx: number,
    canvasW: number,
    _gridW: number,
    rowH: number,
    pxPerMin: number,
    showDwell: boolean
): void {
    const y = bayIdx * rowH;

    // Row background
    ctx.fillStyle = bayIdx % 2 === 0 ? C.rowEven : C.rowOdd;
    ctx.fillRect(0, y, canvasW, rowH);

    // 25-min dwell shading
    if (showDwell) {
        ctx.fillStyle = C.dwellShade;
        for (let m = 0; m < MINUTES; m += 50) {
            ctx.fillRect(BAY_LABEL_W + m * pxPerMin, y, 25 * pxPerMin, rowH);
        }
    }

    // Major hour gridlines
    ctx.strokeStyle = C.gridMajor;
    ctx.lineWidth = 0.5;
    for (let h = 0; h <= 24; h++) {
        const x = BAY_LABEL_W + h * 60 * pxPerMin;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + rowH);
        ctx.stroke();
    }

    // Row bottom border
    ctx.strokeStyle = C.rowBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y + rowH - 0.5);
    ctx.lineTo(canvasW, y + rowH - 0.5);
    ctx.stroke();

    // Bay label
    ctx.fillStyle = C.labelText;
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Clip label to bay label column
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y, BAY_LABEL_W - 2, rowH);
    ctx.clip();
    ctx.fillText(bayId, BAY_LABEL_W / 2, y + rowH / 2);
    ctx.restore();
}

function drawBlock(
    ctx: CanvasRenderingContext2D,
    block: ScheduleBlock,
    bayIdx: number,
    startMin: number,
    endMin: number,
    rowH: number,
    pxPerMin: number,
    isDragging: boolean
): void {
    const bx = BAY_LABEL_W + startMin * pxPerMin;
    const bw = Math.max(2, (endMin - startMin) * pxPerMin);
    const by = bayIdx * rowH + 2;
    const bh = rowH - 4;

    if (bw < 1 || bh < 1) return;

    // Pick fill color
    let fill: string;
    if (block.color) {
        fill = block.color;
    } else if (block.isConflict) {
        fill = C.blockConflict;
    } else {
        const s = (block.status ?? "").toLowerCase();
        if (s === "inprogress" || s === "in progress") fill = C.blockInProgress;
        else if (s === "completed" || s === "done") fill = C.blockCompleted;
        else fill = C.blockScheduled;
    }

    ctx.globalAlpha = isDragging ? 0.75 : 1;

    // Rounded rect
    const r = Math.min(3, bh / 2, bw / 2);
    ctx.beginPath();
    ctx.moveTo(bx + r, by);
    ctx.lineTo(bx + bw - r, by);
    ctx.arcTo(bx + bw, by, bx + bw, by + r, r);
    ctx.lineTo(bx + bw, by + bh - r);
    ctx.arcTo(bx + bw, by + bh, bx + bw - r, by + bh, r);
    ctx.lineTo(bx + r, by + bh);
    ctx.arcTo(bx, by + bh, bx, by + bh - r, r);
    ctx.lineTo(bx, by + r);
    ctx.arcTo(bx, by, bx + r, by, r);
    ctx.closePath();

    ctx.fillStyle = fill;
    ctx.fill();

    // Conflict: extra red border overlay
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

    // Label text (only if block is wide enough)
    if (bw > 22 && bh > 8) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(bx + RESIZE_HIT, by, bw - RESIZE_HIT * 2, bh);
        ctx.clip();
        ctx.fillStyle = C.blockText;
        ctx.font = `${Math.min(11, bh - 4)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(block.truckId, bx + bw / 2, by + bh / 2);
        ctx.restore();
    }

    ctx.globalAlpha = 1;
}
