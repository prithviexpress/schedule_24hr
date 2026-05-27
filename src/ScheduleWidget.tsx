import { ReactElement, useCallback, useMemo, useState } from "react";
import { ObjectItem } from "mendix";
import { ScheduleWidgetContainerProps } from "../typings/ScheduleWidgetProps";
import { SchedulerCanvas } from "./components/SchedulerCanvas";
import { Toolbar } from "./components/Toolbar";
import { ScheduleBlock, BayGroup, PendingEdit, NewSlot } from "./components/types";
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
        groupIdAttr,
        displayDate,
        onTruckClick,
        onScheduleChange,
        onEmptySlotClick,
        rowHeight,
        showDwellMarkers,
        defaultDwellMinutes,
        timeRangeStart,
        timeRangeEnd,
        name,
        class: cssClass,
        style
    } = props;

    const [localDisplayDay, setLocalDisplayDay] = useState<Date>(() => new Date());
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

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

        return scheduleData.items.flatMap((item: ObjectItem): ScheduleBlock[] => {
            const truckId = (truckIdAttr.get(item).value as string) ?? "";
            const bayId = (bayIdAttr.get(item).value as string) ?? "";
            const startDate = startTimeAttr.get(item).value as Date | undefined;
            const endDate = endTimeAttr.get(item).value as Date | undefined;
            const status = (statusAttr?.get(item).value as string) ?? "Scheduled";
            const color = (colorAttr?.get(item).value as string) ?? "";
            const groupId = (groupIdAttr?.get(item).value as string) ?? "__default__";

            if (!startDate || !endDate || !bayId) return [];

            // Only include entries that overlap with the displayed day
            const dayEnd = dayStart + 24 * 60 * 60 * 1000;
            if (endDate.getTime() <= dayStart || startDate.getTime() >= dayEnd) return [];

            const startMin = Math.max(0, (startDate.getTime() - dayStart) / 60000);
            const endMin = Math.min(1440, (endDate.getTime() - dayStart) / 60000);

            return [{ item, truckId, bayId, groupId, startMin, endMin, status, color, isConflict: false }];
        });
    }, [scheduleData.status, scheduleData.items, displayDay, truckIdAttr, bayIdAttr, startTimeAttr, endTimeAttr, statusAttr, colorAttr, groupIdAttr]);

    // ── Conflict detection ────────────────────────────────────────────────────
    const blocks: ScheduleBlock[] = useMemo(() => detectConflicts(rawBlocks), [rawBlocks]);

    // ── Derive groups from blocks ─────────────────────────────────────────────
    const groups: BayGroup[] = useMemo(() => {
        const map = new Map<string, { label: string; bays: Set<string> }>();
        for (const b of blocks) {
            if (!map.has(b.groupId)) {
                map.set(b.groupId, {
                    label: b.groupId === "__default__" ? "" : b.groupId,
                    bays: new Set()
                });
            }
            map.get(b.groupId)!.bays.add(b.bayId);
        }
        return [...map.entries()].map(([id, v]) => ({
            id,
            label: v.label,
            bays: [...v.bays].sort((a, b) => naturalCompare(a, b))
        }));
    }, [blocks]);

    // ── Group toggle ──────────────────────────────────────────────────────────
    const handleGroupToggle = useCallback((groupId: string) => {
        setCollapsedGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupId)) next.delete(groupId);
            else next.add(groupId);
            return next;
        });
    }, []);

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
    const isEmpty = scheduleData.status === "available" && blocks.length === 0;

    // Resolve time range with safe defaults
    const rangeStart = typeof timeRangeStart === "number" ? Math.max(0, Math.min(23, timeRangeStart)) : 0;
    const rangeEnd = typeof timeRangeEnd === "number" ? Math.max(rangeStart + 1, Math.min(24, timeRangeEnd)) : 24;

    return (
        <div id={name} className={`truck-scheduler${cssClass ? ` ${cssClass}` : ""}`} style={style}>
            <Toolbar
                displayDay={displayDay}
                onDayChange={handleDayChange}
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
                    groups={groups}
                    collapsedGroups={collapsedGroups}
                    onGroupToggle={handleGroupToggle}
                    rowHeight={rowHeight ?? 30}
                    showDwellMarkers={showDwellMarkers ?? true}
                    defaultDwellMinutes={defaultDwellMinutes ?? 25}
                    timeRangeStart={rangeStart}
                    timeRangeEnd={rangeEnd}
                    onTruckClick={handleTruckClick}
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

export function detectConflicts(blocks: ScheduleBlock[]): ScheduleBlock[] {
    const byBay = new Map<string, ScheduleBlock[]>();
    for (const b of blocks) {
        const arr = byBay.get(b.bayId);
        if (arr) arr.push({ ...b });
        else byBay.set(b.bayId, [{ ...b }]);
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

// Natural sort: "Bay-2" < "Bay-10" < "Bay-20"
export function naturalCompare(a: string, b: string): number {
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
