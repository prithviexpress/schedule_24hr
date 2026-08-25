import React, { ReactElement } from "react";

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
    bayFilter: string;
    onBayFilterChange: (v: string) => void;
    bayGroups?: string[];
    selectedGroup?: string;
    onGroupChange?: (g: string) => void;
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
    bayFilter, onBayFilterChange,
    bayGroups = [], selectedGroup = "", onGroupChange
}: ToolbarProps): ReactElement {
    const showGroupSelect = bayGroups.length > 1 && !!onGroupChange;
    const showPagination = !selectedGroup && totalPages > 1;

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

            <div className="truck-scheduler__toolbar-center">
                {showGroupSelect && (
                    <select
                        className="truck-scheduler__group-select"
                        value={selectedGroup}
                        onChange={e => onGroupChange!(e.target.value)}
                        title="Filter by bay group"
                    >
                        <option value="">All groups</option>
                        {bayGroups.map(g => (
                            <option key={g} value={g}>{g}</option>
                        ))}
                    </select>
                )}

                <div className="truck-scheduler__bay-search">
                    <input
                        className="truck-scheduler__bay-search-input"
                        type="text"
                        placeholder={`Search ${resourceLabel}…`}
                        value={bayFilter}
                        onChange={e => onBayFilterChange(e.target.value)}
                    />
                    {bayFilter && (
                        <button
                            className="truck-scheduler__bay-search-clear"
                            onClick={() => onBayFilterChange("")}
                            title="Clear filter"
                        >×</button>
                    )}
                </div>
            </div>

            {showPagination && (
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
