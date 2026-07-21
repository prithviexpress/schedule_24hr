import React, { ReactElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ObjectItem } from "mendix";
import { ScheduleWidgetVerticalContainerProps } from "../typings/ScheduleWidgetVerticalProps";
import { VerticalSchedulerCanvas } from "./components/VerticalSchedulerCanvas";
import { Toolbar } from "./components/Toolbar";
import { ScheduleBlock, BayStatus, PendingEdit, NewSlot } from "./components/types";
import "./ui/ScheduleWidget.css";

export function ScheduleWidgetVertical(props: ScheduleWidgetVerticalContainerProps): ReactElement {
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
        bayData,
        bayIdForStatusAttr,
        bayColorAttr,
        bayOccupancyAttr,
        baySortAttr,
        bayTypeAttr,
        onTruckClick,
        onScheduleChange,
        onEmptySlotClick,
        rowHeight,
        resourceLabel,
        rowsPerPage,
        showActualRows,
        showActualRowsVar,
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

    // Auto-reload every 60 s
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

    // Pagination (bays per page, not rows per page — same prop key reused)
    const [pageIndex, setPageIndex] = useState(0);

    // Resolve display day
    const displayDay: Date = useMemo(() => {
        if (displayDate?.value) {
            const v = displayDate.value as Date | string;
            return typeof v === "string" ? new Date(v) : v;
        }
        return localDisplayDay;
    }, [displayDate?.value, localDisplayDay]);

    // Whether the separate actualData datasource is active
    const hasActualDs = !!actualData;

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

            // When actualData datasource is configured, all main blocks are "plan"
            const subRow: "plan" | "actual" | undefined = hasActualDs
                ? "plan"
                : planActualAttr
                    ? ((planActualAttr.get(item).displayValue ?? "").toLowerCase().trim().includes("actual") ? "actual" : "plan")
                    : undefined;

            if (!startDate || !endDate || !bayId) return [];

            const dayEnd = dayStart + 24 * 60 * 60 * 1000;
            if (endDate.getTime() <= dayStart || startDate.getTime() >= dayEnd) return [];

            const startMin = Math.max(0, (startDate.getTime() - dayStart) / 60000);
            const endMin = Math.min(1440, (endDate.getTime() - dayStart) / 60000);

            return [{ item, truckId, bayId, groupId: "__default__", startMin, endMin, status, color, isConflict: false, tooltipText, tooltipText2, subRow }];
        });
    }, [scheduleData.status, scheduleData.items, displayDay, truckIdAttr, bayIdAttr, startTimeAttr, endTimeAttr, statusAttr, colorAttr, tooltipAttr, tooltipAttr2, planActualAttr, hasActualDs]);

    // ── Transform actualData datasource → ScheduleBlock[] (isReadOnly) ───────
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

            return [{ item, truckId, bayId, groupId: "__default__", startMin, endMin, status, color, isConflict: false, tooltipText, tooltipText2, subRow: "actual", isReadOnly: true }];
        });
    }, [actualData?.status, actualData?.items, displayDay, actualTruckIdAttr, actualBayIdAttr, actualStartTimeAttr, actualEndTimeAttr, actualStatusAttr, actualColorAttr, actualTooltipAttr, actualTooltipAttr2]);

    // Conflict detection — runs on merged plan + actual blocks
    const blocks: ScheduleBlock[] = useMemo(
        () => detectConflicts([...rawBlocks, ...actualBlocks]),
        [rawBlocks, actualBlocks]
    );

    // Bay status map
    const bayStatusMap = useMemo(() => {
        const m = new Map<string, BayStatus>();
        if (bayData?.status !== "available" || !bayData.items || !bayIdForStatusAttr) return m;
        for (const item of bayData.items) {
            const bayId = bayIdForStatusAttr.get(item).displayValue ?? "";
            if (!bayId) continue;
            const color = bayColorAttr ? (bayColorAttr.get(item).displayValue ?? "") : "";
            const occStr = bayOccupancyAttr
                ? (bayOccupancyAttr.get(item).displayValue ?? "").toLowerCase().trim()
                : "";
            const occupied: boolean | null = occStr
                ? (occStr === "yes" || occStr === "true" || occStr === "1" || occStr === "occupied" || occStr === "busy" || occStr === "docked"
                    ? true : false)
                : null;
            m.set(bayId, { color, occupied });
        }
        return m;
    }, [bayData?.status, bayData?.items, bayIdForStatusAttr, bayColorAttr, bayOccupancyAttr]);

    // Bay sort map
    const baySortMap = useMemo(() => {
        const m = new Map<string, number>();
        if (bayData?.status !== "available" || !bayData.items || !bayIdForStatusAttr || !baySortAttr) return m;
        for (const item of bayData.items) {
            const bayId = bayIdForStatusAttr.get(item).displayValue ?? "";
            if (!bayId) continue;
            const v = baySortAttr.get(item).value;
            if (v != null) m.set(bayId, Number(v));
        }
        return m;
    }, [bayData?.status, bayData?.items, bayIdForStatusAttr, baySortAttr]);

    // Bay type map (bayId → type label)
    const bayTypeMap = useMemo(() => {
        const m = new Map<string, string>();
        if (bayData?.status !== "available" || !bayData.items || !bayIdForStatusAttr || !bayTypeAttr) return m;
        for (const item of bayData.items) {
            const bayId = bayIdForStatusAttr.get(item).displayValue ?? "";
            if (!bayId) continue;
            const v = bayTypeAttr.get(item).displayValue ?? "";
            if (v) m.set(bayId, v);
        }
        return m;
    }, [bayData?.status, bayData?.items, bayIdForStatusAttr, bayTypeAttr]);

    // Sorted flat bay list (include bays from actual blocks too)
    const bays = useMemo(() => {
        const set = new Set<string>();
        for (const b of blocks) set.add(b.bayId);
        return [...set].sort((a, b) => {
            if (baySortMap.size > 0) {
                const sa = baySortMap.get(a);
                const sb = baySortMap.get(b);
                if (sa != null && sb != null) return sa - sb;
                if (sa != null) return -1;
                if (sb != null) return 1;
            }
            return naturalCompare(a, b);
        });
    }, [blocks, baySortMap]);

    // Reset page on bay list change
    const prevBaysRef = useRef(bays);
    useEffect(() => {
        if (prevBaysRef.current !== bays) {
            prevBaysRef.current = bays;
            setPageIndex(0);
        }
    }, [bays]);

    // Pagination
    const effectiveBaysPerPage = rowsPerPage > 0 ? rowsPerPage : bays.length || 1;
    const totalPages = Math.max(1, Math.ceil(bays.length / effectiveBaysPerPage));
    const pagedBays = bays.slice(pageIndex * effectiveBaysPerPage, (pageIndex + 1) * effectiveBaysPerPage);

    // Day navigation
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

    // Truck click (plan blocks from scheduleData)
    const handleTruckClick = useCallback(
        (block: ScheduleBlock) => {
            const action = onTruckClick?.get(block.item);
            if (action?.canExecute) action.execute();
        },
        [onTruckClick]
    );

    // Truck click (actual blocks from actualData — read-only, separate action)
    const handleActualTruckClick = useCallback(
        (block: ScheduleBlock) => {
            const action = onActualTruckClick?.get(block.item);
            if (action?.canExecute) action.execute();
        },
        [onActualTruckClick]
    );

    // Schedule change (drag / resize) — includes newBayId when bay changed
    const handleScheduleChange = useCallback(
        (block: ScheduleBlock, newStartMin: number, newEndMin: number) => {
            const dayStart = startOfDay(displayDay);
            const newStart = new Date(dayStart + newStartMin * 60000);
            const newEnd = new Date(dayStart + newEndMin * 60000);

            window.__TruckSchedulerPendingEdit = {
                newStartISO: newStart.toISOString(),
                newEndISO: newEnd.toISOString(),
                newBayId: block.bayId
            } as PendingEdit;

            const action = onScheduleChange?.get(block.item);
            if (action?.canExecute) action.execute();
        },
        [onScheduleChange, displayDay]
    );

    // Empty slot click
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

    // Time range resolution
    const resolveHour = (varProp: any, staticVal: number, min: number, max: number) => {
        if (varProp?.value != null) {
            const v = Number(varProp.value);
            if (!isNaN(v)) return Math.max(min, Math.min(max, v));
        }
        return typeof staticVal === "number" ? Math.max(min, Math.min(max, staticVal)) : min;
    };
    const rangeStart = resolveHour(timeRangeStartVar, timeRangeStart, 0, 23);
    const rangeEnd   = resolveHour(timeRangeEndVar, timeRangeEnd, rangeStart + 1, 24);

    // showActualRowsVar wins over static
    const effectiveShowActual = showActualRowsVar?.value != null
        ? Boolean(showActualRowsVar.value)
        : (showActualRows ?? true);

    const isLoading = scheduleData.status === "loading";
    const isEmpty = scheduleData.status === "available" && bays.length === 0;

    return (
        <div id={name} className={`truck-scheduler truck-scheduler--vertical${cssClass ? ` ${cssClass}` : ""}`} style={style}>
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
                rowsPerPage={effectiveBaysPerPage}
                onPageChange={setPageIndex}
            />

            <div className="truck-scheduler__canvas-wrapper">
                {isLoading && <div className="truck-scheduler__loading">Loading schedule…</div>}
                {isEmpty && !isLoading && (
                    <div className="truck-scheduler__empty">
                        No schedule entries for this day. Click a bay slot to add a truck.
                    </div>
                )}
                <VerticalSchedulerCanvas
                    blocks={blocks}
                    bays={pagedBays}
                    bayStatusMap={bayStatusMap}
                    bayTypeMap={bayTypeMap}
                    displayDay={displayDay}
                    resourceLabel={resourceLabel || "Time"}
                    hasPlanActual={!!planActualAttr || hasActualDs}
                    showActualRows={effectiveShowActual}
                    rowHeight={rowHeight ?? 20}
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

// ── Helpers ────────────────────────────────────────────────────────────────────

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

function naturalCompare(a: string, b: string): number {
    const re = /(\d+)/g;
    const pa = a.split(re);
    const pb = b.split(re);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const sa = pa[i] ?? "";
        const sb = pb[i] ?? "";
        const na = Number(sa);
        const nb = Number(sb);
        if (!isNaN(na) && !isNaN(nb)) {
            if (na !== nb) return na - nb;
        } else {
            if (sa !== sb) return sa < sb ? -1 : 1;
        }
    }
    return 0;
}
