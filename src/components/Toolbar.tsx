import React, { ReactElement } from "react";

interface ToolbarProps {
    displayDay: Date;
    onDayChange: (d: Date) => void;
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

export function Toolbar({ displayDay, onDayChange }: ToolbarProps): ReactElement {
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
                <Legend />
            </div>
        </div>
    );
}

function Legend(): ReactElement {
    return (
        <div className="truck-scheduler__legend">
            <LegendItem color="#1a1a1a" label="Scheduled" />
            <LegendItem color="#388e3c" label="In Progress / Completed" />
            <LegendItem color="#e53935" label="Delayed" />
            <LegendItem color="#6d4c41" label="Conflict" />
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
