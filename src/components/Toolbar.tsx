import React, { ReactElement } from "react";

interface ToolbarProps {
    displayDay: Date;
    onDayChange: (d: Date) => void;
    colorScheduled: string;
    colorInProgress: string;
    colorDelayed: string;
    colorConflict: string;
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

export function Toolbar({ displayDay, onDayChange, colorScheduled, colorInProgress, colorDelayed, colorConflict }: ToolbarProps): ReactElement {
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
                <Legend scheduled={colorScheduled} inProgress={colorInProgress} delayed={colorDelayed} conflict={colorConflict} />
            </div>
        </div>
    );
}

function Legend({ scheduled, inProgress, delayed, conflict }: { scheduled: string; inProgress: string; delayed: string; conflict: string }): ReactElement {
    return (
        <div className="truck-scheduler__legend">
            <LegendItem color={scheduled} label="Scheduled" />
            <LegendItem color={inProgress} label="In Progress / Completed" />
            <LegendItem color={delayed} label="Delayed" />
            <LegendItem color={conflict} label="Conflict" />
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
