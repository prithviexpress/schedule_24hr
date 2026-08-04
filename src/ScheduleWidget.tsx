import React, { ReactElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ObjectItem } from "mendix";
import { ScheduleWidgetContainerProps } from "../typings/ScheduleWidgetProps";
import { SchedulerCanvas } from "./components/SchedulerCanvas";
import { Toolbar } from "./components/Toolbar";
import { ScheduleBlock, BayStatus, PendingEdit, NewSlot } from "./components/types";
import "./ui/ScheduleWidget.css";

export function ScheduleWidget(props: ScheduleWidgetContainerProps): ReactElement {
    const {
        scheduleData,
        truckIdAttr,
        bayIdAttr,
        startTimeAttr,
        endTimeAttr,
        statusAttr,
        colorAttr,
        tooltipAttr,
        tooltipAttr2,
        planActualAttr,
        displayDate,
        bayData,
        bayIdForStatusAttr,
        bayColorAttr,
        bayOccupancyAttr,
        baySortAttr: _baySortAttr,
        actualData,
        actualTruckIdAttr,
        actualBayIdAttr,
        actualStartTimeAttr,
        actualEndTimeAttr,
        actualStatusAttr,
        actualColorAttr,
        actualTooltipAttr,
        actualTooltipAttr2,
        onActualTruckClick,
        onTruckClick,
        onScheduleChange,
        onEmptySlotClick,
        rowHeight,
        resourceLabel,
        rowsPerPage,
        showActualRows,
        showActualRowsVar,
        sortByTime,
        showDwellMarkers,
        defaultDwellMinutes,
        timeRangeStart,
        timeRangeEnd,
        timeRangeStartVar,
        timeRangeEndVar,
        colorScheduled,
        colorInProgress,
        colorDelayed,
        colorConflict,
        name,
        class: cssClass,
        style
    } = props;

    const [localDisplayDay, setLocalDisplayDay] = useState<Date>(() => new Date());

    // Reload all data every 60 s — same cadence as the current-time line
    const bayDataRef = useRef(bayData);
    const scheduleDataRef = useRef(scheduleData);
    const actualDataRef = useRef(actualData);
    useEffect(() => { bayDataRef.current = bayData; });
    useEffect(() => { scheduleDataRef.current = scheduleData; });
    useEffect(() => { actualDataRef.current = actualData; });
    useEffect(() => {
        const id = setInterval(() => {
            bayDataRef.current?.reload();
            scheduleDataRef.current?.reload();
            actualDataRef.current?.reload();
        }, 60000);
        return () => clearInterval(id);
    }, []);

    const hasActualDs = !!actualData;

    // Pagination
    const [pageIndex, setPageIndex] = useState(0);
    const [bayFilter, setBayFilter] = useState("");

    // Resolve which day to display
    const displayDay: Date = useMemo(() => {
        if (displayDate?.value) {
            const v = displayDate.value as Date | string;
            return typeof v === "string" ? new Date(v) : v;
        }
        return localDisplayDay;
    }, [displayDate?.value, localDisplayDay]);

    // ── Transform Mendix list → ScheduleBlock[] ───────────────────────────────
    const rawBlocks: ScheduleBlock[] = useMemo(() => {
        if (scheduleData.status !== "available" || !scheduleData.items) return [];

        const dayStart = startOfDay(displayDay);

        return scheduleData.items.flatMap((item: ObjectItem) => {
            const truckId = (truckIdAttr.get(item).value as string) ?? "";
            const bayId = (bayIdAttr.get(item).value as string) ?? "";
            const startDate = startTimeAttr.get(item).value as Date | undefined;
            const endDate = endTimeAttr.get(item).value as Date | undefined;
            const status = (statusAttr?.get(item).value as string) ?? "Scheduled";
            const color = (colorAttr?.get(item).value as string) ?? "";
            const tooltipText = tooltipAttr ? (tooltipAttr.get(item).displayValue ?? "") : "";
            const tooltipText2 = tooltipAttr2 ? (tooltipAttr2.get(item).displayValue ?? "") : "";
            const planActualRaw = planActualAttr ? (planActualAttr.get(item).displayValue ?? "").toLowerCase().trim() : "";
            // When actualData datasource is configured all main blocks become plan
            const subRow: "plan" | "actual" | undefined = hasActualDs
                ? "plan"
                : planActualAttr
                    ? (planActualRaw.includes("actual") ? "actual" : "plan")
                    : undefined;

            if (!startDate || !endDate || !bayId) return [];

            // Only include entries that overlap with the displayed day
            const dayEnd = dayStart + 24 * 60 * 60 * 1000;
            if (endDate.getTime() <= dayStart || startDate.getTime() >= dayEnd) return [];

            const startMin = Math.max(0, (startDate.getTime() - dayStart) / 60000);
            const endMin = Math.min(1440, (endDate.getTime() - dayStart) / 60000);

            return [{ item, truckId, bayId, groupId: "__default__", startMin, endMin, status, color, isConflict: false, tooltipText, tooltipText2, subRow }];
        });
    }, [scheduleData.status, scheduleData.items, displayDay, truckIdAttr, bayIdAttr, startTimeAttr, endTimeAttr, statusAttr, colorAttr, tooltipAttr, tooltipAttr2, planActualAttr, hasActualDs]);

    // ── Actual blocks from separate datasource ────────────────────────────────
    const actualBlocks: ScheduleBlock[] = useMemo(() => {
        if (!actualData || actualData.status !== "available" || !actualData.items) return [];
        if (!actualTruckIdAttr || !actualBayIdAttr || !actualStartTimeAttr || !actualEndTimeAttr) return [];
        const dayStart = startOfDay(displayDay);
        return actualData.items.flatMap((item: ObjectItem) => {
            const truckId = (actualTruckIdAttr.get(item).value as string) ?? "";
            const bayId = (actualBayIdAttr.get(item).value as string) ?? "";
            const startDate = actualStartTimeAttr.get(item).value as Date | undefined;
            const endDate = actualEndTimeAttr.get(item).value as Date | undefined;
            const status = (actualStatusAttr?.get(item).value as string) ?? "Scheduled";
            const color = (actualColorAttr?.get(item).value as string) ?? "";
            const tooltipText = actualTooltipAttr ? (actualTooltipAttr.get(item).displayValue ?? "") : "";
            const tooltipText2 = actualTooltipAttr2 ? (actualTooltipAttr2.get(item).displayValue ?? "") : "";
            if (!startDate || !endDate || !bayId) return [];
            const dayEnd = dayStart + 24 * 60 * 60 * 1000;
            if (endDate.getTime() <= dayStart || startDate.getTime() >= dayEnd) return [];
            const startMin = Math.max(0, (startDate.getTime() - dayStart) / 60000);
            const endMin = Math.min(1440, (endDate.getTime() - dayStart) / 60000);
            return [{ item, truckId, bayId, groupId: "__default__", startMin, endMin, status, color, isConflict: false, tooltipText, tooltipText2, subRow: "actual" as const, isReadOnly: true }];
        });
    }, [actualData?.status, actualData?.items, displayDay, actualTruckIdAttr, actualBayIdAttr, actualStartTimeAttr, actualEndTimeAttr, actualStatusAttr, actualColorAttr, actualTooltipAttr, actualTooltipAttr2]);

    // ── Conflict detection ────────────────────────────────────────────────────
    const blocks: ScheduleBlock[] = useMemo(
        () => detectConflicts([...rawBlocks, ...actualBlocks]),
        [rawBlocks, actualBlocks]
    );

    // ── Bay status map from dedicated bayData datasource ──────────────────────
    const bayStatusMap = useMemo(() => {
        const m = new Map<string, BayStatus>();
        if (bayData?.status !== "available" || !bayData.items || !bayIdForStatusAttr) return m;
        for (const item of bayData.items) {
            const bayId = bayIdForStatusAttr.get(item).displayValue ?? "";
            if (!bayId) continue;
            const color = bayColorAttr ? (bayColorAttr.get(item).displayValue ?? "") : "";
            const occStr = bayOccupancyAttr ? (bayOccupancyAttr.get(item).displayValue ?? "").toLowerCase().trim() : "";
            const occupied: boolean | null = occStr
                ? (occStr === "yes" || occStr === "true" || occStr === "1" || occStr === "occupied" || occStr === "busy" || occStr === "docked"
                    ? true : false)
                : null;
            m.set(bayId, { color, occupied });
        }
        return m;
    }, [bayData?.status, bayData?.items, bayIdForStatusAttr, bayColorAttr, bayOccupancyAttr]);



    // ── Derive sorted + filtered bay list ────────────────────────────────────
    const bays = useMemo(() => {
        const set = new Set<string>();
        for (const b of blocks) set.add(b.bayId);
        const arr = [...set];
        if (sortByTime) {
            const earliest = new Map<string, number>();
            for (const b of blocks) {
                const cur = earliest.get(b.bayId) ?? Infinity;
                if (b.startMin < cur) earliest.set(b.bayId, b.startMin);
            }
            arr.sort((a, b) => (earliest.get(a) ?? Infinity) - (earliest.get(b) ?? Infinity));
        } else {
            arr.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
        }
        if (!bayFilter.trim()) return arr;
        const q = bayFilter.trim().toLowerCase();
        return arr.filter(id => id.toLowerCase().includes(q));
    }, [blocks, sortByTime, bayFilter]);

    // Keep current page on data refresh; only update when stable (not loading)
    const prevBaysKeyRef = useRef<string>("");
    const isAnyLoading = scheduleData.status === "loading" || (!!actualData && actualData.status === "loading");
    useEffect(() => {
        if (isAnyLoading) return; // ignore transient loading state
        const key = bays.join("|");
        if (prevBaysKeyRef.current === key) return;
        prevBaysKeyRef.current = key;
        const eBPP = rowsPerPage > 0 ? rowsPerPage : bays.length || 1;
        const newTotalPages = Math.max(1, Math.ceil(bays.length / eBPP));
        setPageIndex(prev => Math.min(prev, newTotalPages - 1));
    }, [bays, rowsPerPage, isAnyLoading]);

    // ── Pagination ────────────────────────────────────────────────────────────
    const effectiveRowsPerPage = rowsPerPage > 0 ? rowsPerPage : bays.length || 1;
    const totalPages = Math.max(1, Math.ceil(bays.length / effectiveRowsPerPage));
    const pagedBays = bays.slice(pageIndex * effectiveRowsPerPage, (pageIndex + 1) * effectiveRowsPerPage);

    // ── Day navigation ────────────────────────────────────────────────────────
    const handleDayChange = useCallback(
        (newDay: Date) => {
            if (displayDate && !displayDate.readOnly) {
                (displayDate as any).setValue(newDay);
            } else {
                setLocalDisplayDay(newDay);
            }
        },
        [displayDate]
    );

    // ── Truck click ───────────────────────────────────────────────────────────
    const handleTruckClick = useCallback(
        (block: ScheduleBlock) => {
            const action = onTruckClick?.get(block.item);
            if (action?.canExecute) action.execute();
        },
        [onTruckClick]
    );

    // ── Actual truck click (read-only blocks from actualData) ─────────────────
    const handleActualTruckClick = useCallback(
        (block: ScheduleBlock) => {
            const action = onActualTruckClick?.get(block.item);
            if (action?.canExecute) action.execute();
        },
        [onActualTruckClick]
    );

    // ── Schedule change (drag / resize) ───────────────────────────────────────
    const handleScheduleChange = useCallback(
        (block: ScheduleBlock, newStartMin: number, newEndMin: number) => {
            const dayStart = startOfDay(displayDay);
            const newStart = new Date(dayStart + newStartMin * 60000);
            const newEnd = new Date(dayStart + newEndMin * 60000);

            // Expose via window bridge for JavaScript Action in nanoflow
            window.__TruckSchedulerPendingEdit = {
                newStartISO: newStart.toISOString(),
                newEndISO: newEnd.toISOString()
            } as PendingEdit;

            const action = onScheduleChange?.get(block.item);
            if (action?.canExecute) action.execute();
        },
        [onScheduleChange, displayDay]
    );

    // ── Empty slot click (create new truck) ───────────────────────────────────
    const handleEmptySlotClick = useCallback(
        (bayId: string, startMin: number, endMin: number, _defaultDwell: number) => {
            const dayStart = startOfDay(displayDay);
            window.__TruckSchedulerNewSlot = {
                bayId,
                startISO: new Date(dayStart + startMin * 60000).toISOString(),
                endISO: new Date(dayStart + endMin * 60000).toISOString()
            } as NewSlot;
            if (onEmptySlotClick?.canExecute) onEmptySlotClick.execute();
        },
        [onEmptySlotClick, displayDay]
    );

    // ── Render ────────────────────────────────────────────────────────────────
    const isLoading = scheduleData.status === "loading";
    const isEmpty = scheduleData.status === "available" && bays.length === 0;

    // Time range: external variable wins over static setting
    const resolveHour = (varProp: any, staticVal: number, min: number, max: number) => {
        if (varProp?.value != null) {
            const v = Number(varProp.value);
            if (!isNaN(v)) return Math.max(min, Math.min(max, v));
        }
        return typeof staticVal === "number" ? Math.max(min, Math.min(max, staticVal)) : min;
    };
    const rangeStart = resolveHour(timeRangeStartVar, timeRangeStart, 0, 23);
    const rangeEnd   = resolveHour(timeRangeEndVar,   timeRangeEnd,   rangeStart + 1, 24);

    // showActualRowsVar (boolean attribute) wins over the static showActualRows setting
    const effectiveShowActual = showActualRowsVar?.value != null
        ? Boolean(showActualRowsVar.value)
        : (showActualRows ?? true);

    return (
        <div id={name} className={`truck-scheduler${cssClass ? ` ${cssClass}` : ""}`} style={style}>
            <Toolbar
                displayDay={displayDay}
                onDayChange={handleDayChange}
                colorScheduled={colorScheduled || "#1565C0"}
                colorInProgress={colorInProgress || "#2E7D32"}
                colorDelayed={colorDelayed || "#D84315"}
                colorConflict={colorConflict || "#4527A0"}
                pageIndex={pageIndex}
                totalPages={totalPages}
                totalBays={bays.length}
                rowsPerPage={effectiveRowsPerPage}
                resourceLabel={resourceLabel || "Bay"}
                onPageChange={setPageIndex}
                bayFilter={bayFilter}
                onBayFilterChange={v => { setBayFilter(v); setPageIndex(0); }}
            />

            <div className="truck-scheduler__canvas-wrapper">
                {isLoading && <div className="truck-scheduler__loading">Loading schedule…</div>}
                {isEmpty && !isLoading && (
                    <div className="truck-scheduler__empty">
                        No schedule entries for this day. Click a bay slot to add a truck.
                    </div>
                )}
                <SchedulerCanvas
                    blocks={blocks}
                    bays={pagedBays}
                    bayStatusMap={bayStatusMap}
                    displayDay={displayDay}
                    resourceLabel={resourceLabel || "Resource"}
                    hasPlanActual={!!planActualAttr || hasActualDs}
                    showActualRows={effectiveShowActual}
                    rowHeight={rowHeight ?? 30}
                    showDwellMarkers={showDwellMarkers ?? true}
                    defaultDwellMinutes={defaultDwellMinutes ?? 25}
                    timeRangeStart={rangeStart}
                    timeRangeEnd={rangeEnd}
                    colorScheduled={colorScheduled || "#1565C0"}
                    colorInProgress={colorInProgress || "#2E7D32"}
                    colorDelayed={colorDelayed || "#D84315"}
                    colorConflict={colorConflict || "#4527A0"}
                    onTruckClick={handleTruckClick}
                    onActualTruckClick={handleActualTruckClick}
                    onScheduleChange={handleScheduleChange}
                    onEmptySlotClick={handleEmptySlotClick}
                />
            </div>
        </div>
    );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function startOfDay(d: Date): number {
    const c = new Date(d);
    c.setHours(0, 0, 0, 0);
    return c.getTime();
}

function detectConflicts(blocks: ScheduleBlock[]): ScheduleBlock[] {
    const byBay = new Map<string, ScheduleBlock[]>();
    for (const b of blocks) {
        const key = b.subRow ? `${b.bayId}::${b.subRow}` : b.bayId;
        const arr = byBay.get(key);
        if (arr) arr.push({ ...b });
        else byBay.set(key, [{ ...b }]);
    }

    const result: ScheduleBlock[] = [];
    byBay.forEach(bayBlocks => {
        bayBlocks.sort((a, b) => a.startMin - b.startMin);
        let maxEnd = -Infinity;
        let prevIdx = -1;
        for (let i = 0; i < bayBlocks.length; i++) {
            const b = bayBlocks[i];
            if (b.startMin < maxEnd) {
                // Overlap — flag current and the block that set maxEnd
                bayBlocks[i] = { ...b, isConflict: true };
                if (prevIdx >= 0) bayBlocks[prevIdx] = { ...bayBlocks[prevIdx], isConflict: true };
            }
            if (b.endMin > maxEnd) {
                maxEnd = b.endMin;
                prevIdx = i;
            }
        }
        result.push(...bayBlocks);
    });
    return result;
}

