import { ReactElement, useEffect, useRef, useState } from "react";
import { BayGroup } from "./types";

interface ToolbarProps {
    displayDay: Date;
    onDayChange: (d: Date) => void;
    groups: BayGroup[];
    hiddenGroupIds: Set<string>;
    onHiddenChange: (ids: Set<string>) => void;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDay(d: Date): string {
    return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

function shiftDay(d: Date, delta: number): Date {
    const n = new Date(d);
    n.setDate(n.getDate() + delta);
    return n;
}

export function Toolbar({ displayDay, onDayChange, groups, hiddenGroupIds, onHiddenChange }: ToolbarProps): ReactElement {
    return (
        <div className="truck-scheduler__toolbar">
            <div className="truck-scheduler__date-nav">
                <button className="truck-scheduler__nav-btn" onClick={() => onDayChange(shiftDay(displayDay, -1))} title="Previous day">
                    ‹
                </button>
                <span className="truck-scheduler__date-label">{formatDay(displayDay)}</span>
                <button className="truck-scheduler__nav-btn" onClick={() => onDayChange(shiftDay(displayDay, 1))} title="Next day">
                    ›
                </button>
            </div>

            <div className="truck-scheduler__toolbar-right">
                <GroupFilter groups={groups} hiddenGroupIds={hiddenGroupIds} onHiddenChange={onHiddenChange} />
                <Legend />
            </div>
        </div>
    );
}

// ─── Group filter ─────────────────────────────────────────────────────────────

interface GroupFilterProps {
    groups: BayGroup[];
    hiddenGroupIds: Set<string>;
    onHiddenChange: (ids: Set<string>) => void;
}

function GroupFilter({ groups, hiddenGroupIds, onHiddenChange }: GroupFilterProps): ReactElement | null {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);

    const namedGroups = groups.filter(g => g.id !== "__default__");
    if (namedGroups.length < 2) return null;

    const allVisible = hiddenGroupIds.size === 0;
    const visibleCount = namedGroups.length - [...hiddenGroupIds].filter(id => namedGroups.some(g => g.id === id)).length;
    const btnLabel = allVisible ? "All Groups ▾" : `${visibleCount} / ${namedGroups.length} Groups ▾`;

    const toggleGroup = (id: string) => {
        const next = new Set(hiddenGroupIds);
        if (next.has(id)) next.delete(id); else next.add(id);
        onHiddenChange(next);
    };

    // Close dropdown when clicking outside
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    return (
        <div ref={wrapRef} className="truck-scheduler__group-filter">
            <button
                className={`truck-scheduler__filter-btn${!allVisible ? " truck-scheduler__filter-btn--active" : ""}`}
                onClick={() => setOpen(o => !o)}
                title="Filter groups"
            >
                {btnLabel}
            </button>
            {open && (
                <div className="truck-scheduler__filter-dropdown">
                    <label className="truck-scheduler__filter-option">
                        <input
                            type="checkbox"
                            checked={allVisible}
                            onChange={() => onHiddenChange(new Set())}
                        />
                        <span>All Groups</span>
                    </label>
                    <div className="truck-scheduler__filter-divider" />
                    {namedGroups.map(g => (
                        <label key={g.id} className="truck-scheduler__filter-option">
                            <input
                                type="checkbox"
                                checked={!hiddenGroupIds.has(g.id)}
                                onChange={() => toggleGroup(g.id)}
                            />
                            <span>{g.label || g.id}</span>
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend(): ReactElement {
    return (
        <div className="truck-scheduler__legend">
            <LegendItem color="#f5c518" label="Scheduled" />
            <LegendItem color="#7ec87e" label="In Progress" />
            <LegendItem color="#404040" label="Completed" />
            <LegendItem color="#e53935" label="Conflict" />
        </div>
    );
}

function LegendItem({ color, label }: { color: string; label: string }): ReactElement {
    return (
        <span className="truck-scheduler__legend-item">
            <span className="truck-scheduler__legend-dot" style={{ background: color }} />
            {label}
        </span>
    );
}
