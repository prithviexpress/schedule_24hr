import React, { ReactElement } from "react";
import { ScheduleWidgetVerticalPreviewProps } from "../typings/ScheduleWidgetVerticalProps";

export function preview(_props: ScheduleWidgetVerticalPreviewProps): ReactElement {
    const BAYS = ["AR-F9", "AR-G1", "AR-G2", "AR-G3", "AR-G4"];
    const TIMES = ["06:30", "06:35", "06:40", "06:45", "06:50", "06:55", "07:00", "07:05", "07:10", "07:15"];

    const blocks = [
        { bay: 0, rowStart: 1, rowEnd: 4, color: "#1565C0", label: "TRK-042" },
        { bay: 2, rowStart: 0, rowEnd: 3, color: "#2E7D32", label: "TRK-011" },
        { bay: 3, rowStart: 2, rowEnd: 6, color: "#D84315", label: "TRK-055" },
        { bay: 4, rowStart: 4, rowEnd: 8, color: "#1565C0", label: "TRK-078" }
    ];

    const colW = 64;
    const rowH = 18;
    const timeLabelW = 44;
    const headerH = 36;

    return (
        <div
            style={{
                width: "100%",
                height: 220,
                background: "#fafafa",
                border: "1px dashed #ccc",
                borderRadius: 4,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                fontFamily: "sans-serif",
                fontSize: 12
            }}
        >
            {/* Mini toolbar */}
            <div
                style={{
                    background: "#f0f0f0",
                    borderBottom: "1px solid #ddd",
                    padding: "4px 8px",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexShrink: 0,
                    fontSize: 11,
                    color: "#555"
                }}
            >
                <span>‹</span>
                <strong style={{ flex: 1, textAlign: "center" }}>Truck Scheduler Vertical</strong>
                <span>›</span>
            </div>

            {/* Grid */}
            <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
                {/* Time labels */}
                <div
                    style={{
                        width: timeLabelW,
                        borderRight: "1px solid #ddd",
                        background: "#f7f5f2",
                        flexShrink: 0,
                        paddingTop: headerH
                    }}
                >
                    {TIMES.map((t, i) => (
                        <div
                            key={i}
                            style={{
                                height: rowH,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "flex-end",
                                paddingRight: 4,
                                fontSize: 8,
                                color: "#777",
                                borderTop: i === 0 ? undefined : "1px solid #eee"
                            }}
                        >
                            {t}
                        </div>
                    ))}
                </div>

                {/* Bay columns */}
                <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
                    {/* Bay header */}
                    <div
                        style={{
                            height: headerH,
                            display: "flex",
                            borderBottom: "1px solid #ccc",
                            background: "#f5f2ed",
                            position: "absolute",
                            top: 0,
                            left: 0,
                            right: 0,
                            zIndex: 1
                        }}
                    >
                        {BAYS.map((bay, i) => (
                            <div
                                key={i}
                                style={{
                                    width: colW,
                                    flexShrink: 0,
                                    borderRight: "1px solid #ddd",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: 9,
                                    fontWeight: "bold",
                                    color: "#555",
                                    background: i % 2 === 0 ? "#fff" : "#faf9f7"
                                }}
                            >
                                {bay}
                            </div>
                        ))}
                    </div>

                    {/* Grid rows */}
                    <div style={{ paddingTop: headerH }}>
                        {TIMES.map((_, i) => (
                            <div
                                key={i}
                                style={{
                                    height: rowH,
                                    display: "flex",
                                    borderTop: "1px solid #eee"
                                }}
                            >
                                {BAYS.map((_, j) => (
                                    <div
                                        key={j}
                                        style={{
                                            width: colW,
                                            flexShrink: 0,
                                            borderRight: "1px solid #eee",
                                            background: j % 2 === 0 ? "#fff" : "#faf9f7"
                                        }}
                                    />
                                ))}
                            </div>
                        ))}
                    </div>

                    {/* Sample blocks */}
                    {blocks.map((b, i) => (
                        <div
                            key={i}
                            style={{
                                position: "absolute",
                                top: headerH + b.rowStart * rowH + 2,
                                left: b.bay * colW + 2,
                                width: colW - 4,
                                height: (b.rowEnd - b.rowStart) * rowH - 4,
                                background: b.color,
                                borderRadius: 3,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 7,
                                color: "#fff",
                                overflow: "hidden",
                                whiteSpace: "nowrap"
                            }}
                        >
                            {b.label}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export function getPreviewCss(): string {
    return "";
}
