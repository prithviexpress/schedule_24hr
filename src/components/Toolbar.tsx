import React, { ReactElement } from "react";

export interface SortOption {
    value: string;
    label: string;
}

interface ToolbarProps {
    displayDay: Date;
    onDayChange: (d: Date) => void;
    colorScheduled: string;
    colorInProgress: string;
    colorDelayed: string;
    colorConflict: string;
    pageIndex: number;
    totalPages: number;
    totalBays: number;
    rowsPerPage: number;
    resourceLabel: string;
    onPageChange: (p: number) => void;
    sortMode: string;
    sortOptions: SortOption[];
    onSortChange: (mode: string) => void;
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

export function Toolbar({
    displayDay, onDayChange,
    colorScheduled, colorInProgress, colorDelayed, colorConflict,
    pageIndex, totalPages, totalBays, rowsPerPage, resourceLabel, onPageChange,
    sortMode, sortOptions, onSortChange
}: ToolbarProps): ReactElement {
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

            {totalPages > 1 && (
                <Pagination
                    pageIndex={pageIndex}
                    totalPages={totalPages}
                    totalBays={totalBays}
                    rowsPerPage={rowsPerPage}
                    resourceLabel={resourceLabel}
                    onPageChange={onPageChange}
                />
            )}

            <div className="truck-scheduler__toolbar-right">
                {sortOptions.length > 1 && (
                    <div className="truck-scheduler__sort-control">
                        <span className="truck-scheduler__sort-label">Sort</span>
                        <select
                            className="truck-scheduler__sort-select"
                            value={sortMode}
                            onChange={e => onSortChange(e.target.value)}
                        >
                            {sortOptions.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    </div>
                )}
                <Legend
                    scheduled={colorScheduled}
                    inProgress={colorInProgress}
                    delayed={colorDelayed}
                    conflict={colorConflict}
                />
            </div>
        </div>
    );
}

function Pagination({ pageIndex, totalPages, totalBays, rowsPerPage, resourceLabel, onPageChange }: {
    pageIndex: number;
    totalPages: number;
    totalBays: number;
    rowsPerPage: number;
    resourceLabel: string;
    onPageChange: (p: number) => void;
}): ReactElement {
    const startRow = pageIndex * rowsPerPage + 1;
    const endRow = Math.min((pageIndex + 1) * rowsPerPage, totalBays);
    return (
        <div className="truck-scheduler__pagination">
            <button
                className="truck-scheduler__nav-btn"
                onClick={() => onPageChange(pageIndex - 1)}
                disabled={pageIndex === 0}
                title="Previous bays"
            >‹</button>
            <span className="truck-scheduler__page-label">
                {resourceLabel} {startRow}–{endRow} / {totalBays}
            </span>
            <button
                className="truck-scheduler__nav-btn"
                onClick={() => onPageChange(pageIndex + 1)}
                disabled={pageIndex >= totalPages - 1}
                title="Next bays"
            >›</button>
        </div>
    );
}

function Legend({ scheduled, inProgress, delayed, conflict }: {
    scheduled: string; inProgress: string; delayed: string; conflict: string;
}): ReactElement {
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
