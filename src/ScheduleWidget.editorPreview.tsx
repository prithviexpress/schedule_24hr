import React, { ReactElement } from "react";
import { ScheduleWidgetPreviewProps } from "../typings/ScheduleWidgetProps";

export function preview(_props: ScheduleWidgetPreviewProps): ReactElement {
    return (
        <div
            style={{
                width: "100%",
                height: 200,
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
                <strong style={{ flex: 1, textAlign: "center" }}>Truck Scheduler 24Hr</strong>
                <span>›</span>
            </div>

            {/* Mini grid preview */}
            <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
                {/* Bay labels */}
                <div
                    style={{
                        width: 60,
                        borderRight: "1px solid #ddd",
                        background: "#fafafa",
                        flexShrink: 0,
                        paddingTop: 20
                    }}
                >
                    {["Bay A1", "Bay A2", "Bay B1", "Bay B2"].map(b => (
                        <div
                            key={b}
                            style={{
                                height: 28,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 9,
                                color: "#666",
                                borderBottom: "1px solid #eee"
                            }}
                        >
                            {b}
                        </div>
                    ))}
                </div>

                {/* Grid with sample blocks */}
                <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
                    {/* Hour markers */}
                    <div style={{ height: 20, display: "flex", borderBottom: "1px solid #ccc", background: "#f5f5f5" }}>
                        {[0, 6, 12, 18].map(h => (
                            <div
                                key={h}
                                style={{
                                    flex: 6,
                                    borderLeft: h > 0 ? "1px solid #ccc" : undefined,
                                    fontSize: 9,
                                    color: "#888",
                                    display: "flex",
                                    alignItems: "center",
                                    paddingLeft: 2
                                }}
                            >
                                {String(h).padStart(2, "0")}:00
                            </div>
                        ))}
                    </div>

                    {/* Sample truck blocks */}
                    {[
                        { bay: 0, start: 0.1, width: 0.06, color: "#4a90d9", label: "TRK-001" },
                        { bay: 0, start: 0.3, width: 0.05, color: "#43a047", label: "TRK-002" },
                        { bay: 1, start: 0.2, width: 0.07, color: "#4a90d9", label: "TRK-003" },
                        { bay: 1, start: 0.28, width: 0.05, color: "#e53935", label: "TRK-004" },
                        { bay: 2, start: 0.05, width: 0.06, color: "#f57c00", label: "TRK-005" },
                        { bay: 3, start: 0.6, width: 0.08, color: "#4a90d9", label: "TRK-006" }
                    ].map((b, i) => (
                        <div
                            key={i}
                            style={{
                                position: "absolute",
                                top: 20 + b.bay * 28 + 2,
                                left: `calc(${b.start * 100}%)`,
                                width: `calc(${b.width * 100}%)`,
                                height: 24,
                                background: b.color,
                                borderRadius: 3,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 8,
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
