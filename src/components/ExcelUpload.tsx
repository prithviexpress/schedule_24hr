import { ReactElement, useRef, useState, useCallback } from "react";
import { read, utils } from "xlsx";
import { ExcelRow } from "./types";

interface ExcelUploadProps {
    onConfirmed: (rows: ExcelRow[]) => void;
    onError: (msg: string) => void;
}

interface PreviewRow extends ExcelRow {
    _rowNum: number;
    _error?: string;
}

export function ExcelUpload({ onConfirmed, onError }: ExcelUploadProps): ReactElement {
    const inputRef = useRef<HTMLInputElement>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [isParsing, setIsParsing] = useState(false);
    const [preview, setPreview] = useState<PreviewRow[] | null>(null);
    const [totalRows, setTotalRows] = useState(0);
    const allRowsRef = useRef<PreviewRow[]>([]);

    const parseFile = useCallback(
        (file: File) => {
            setIsParsing(true);
            const reader = new FileReader();
            reader.onload = e => {
                try {
                    const wb = read(e.target?.result as ArrayBuffer, { type: "array", cellDates: true });
                    const ws = wb.Sheets[wb.SheetNames[0]];
                    const raw = utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
                    const rows = normalizeRows(raw);
                    allRowsRef.current = rows;
                    setTotalRows(rows.length);
                    setPreview(rows.slice(0, 10));
                } catch (err) {
                    onError(`Excel parse error: ${(err as Error).message}`);
                } finally {
                    setIsParsing(false);
                }
            };
            reader.onerror = () => {
                onError("Failed to read file");
                setIsParsing(false);
            };
            reader.readAsArrayBuffer(file);
        },
        [onError]
    );

    const handleConfirm = useCallback(() => {
        const validRows = allRowsRef.current.filter(r => !r._error);
        onConfirmed(validRows);
        setPreview(null);
        allRowsRef.current = [];
    }, [onConfirmed]);

    const handleCancel = useCallback(() => {
        setPreview(null);
        allRowsRef.current = [];
    }, []);

    return (
        <>
            <div
                className={`excel-upload${isDragOver ? " excel-upload--drag-over" : ""}${isParsing ? " excel-upload--parsing" : ""}`}
                onDragOver={e => {
                    e.preventDefault();
                    setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={e => {
                    e.preventDefault();
                    setIsDragOver(false);
                    const file = e.dataTransfer.files[0];
                    if (file) parseFile(file);
                }}
                onClick={() => inputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === "Enter" && inputRef.current?.click()}
                aria-label="Upload schedule Excel file — click or drag and drop"
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    style={{ display: "none" }}
                    onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) parseFile(f);
                        e.target.value = "";
                    }}
                />
                {isParsing ? "Parsing…" : "⬆ Upload Excel / CSV"}
            </div>

            {preview && (
                <div className="truck-scheduler__overlay" onClick={e => e.target === e.currentTarget && handleCancel()}>
                    <div className="truck-scheduler__preview-modal">
                        <h3>Import Preview</h3>
                        <p className="truck-scheduler__import-count">
                            Showing first {preview.length} of {totalRows} rows.{" "}
                            {allRowsRef.current.filter(r => r._error).length > 0 && (
                                <span style={{ color: "#c62828" }}>
                                    {allRowsRef.current.filter(r => r._error).length} rows have errors and will be skipped.
                                </span>
                            )}
                        </p>
                        <div className="truck-scheduler__preview-table-wrap">
                            <table className="truck-scheduler__preview-table">
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>Truck ID</th>
                                        <th>Bay ID</th>
                                        <th>Start Time</th>
                                        <th>End Time</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {preview.map(row => (
                                        <tr key={row._rowNum} className={row._error ? "row--error" : ""}>
                                            <td>{row._rowNum}</td>
                                            <td>{row.truckId || <em style={{ color: "#c62828" }}>missing</em>}</td>
                                            <td>{row.bayId || <em style={{ color: "#c62828" }}>missing</em>}</td>
                                            <td>{formatPreviewTime(row.startTime)}</td>
                                            <td>{formatPreviewTime(row.endTime)}</td>
                                            <td>{row.status}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="truck-scheduler__preview-actions">
                            <button className="truck-scheduler__btn truck-scheduler__btn--secondary" onClick={handleCancel}>
                                Cancel
                            </button>
                            <button
                                className="truck-scheduler__btn truck-scheduler__btn--primary"
                                onClick={handleConfirm}
                                disabled={allRowsRef.current.filter(r => !r._error).length === 0}
                            >
                                Import {allRowsRef.current.filter(r => !r._error).length} rows
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

// ─── Utilities ─────────────────────────────────────────────────────────────────

function normalizeKey(k: string): string {
    return k.toLowerCase().replace(/[\s_\-.]/g, "");
}

function normalizeRows(raw: Record<string, unknown>[]): PreviewRow[] {
    return raw.map((row, i) => {
        const norm: Record<string, unknown> = {};
        for (const k of Object.keys(row)) {
            norm[normalizeKey(k)] = row[k];
        }

        const truckId = String(norm["truckid"] ?? norm["truck"] ?? norm["truckno"] ?? "").trim();
        const bayId = String(norm["bayid"] ?? norm["bay"] ?? norm["bayno"] ?? norm["baynumber"] ?? "").trim();
        const rawStart = norm["starttime"] ?? norm["start"] ?? norm["arrival"] ?? "";
        const rawEnd = norm["endtime"] ?? norm["end"] ?? norm["departure"] ?? "";
        const status = String(norm["status"] ?? "Scheduled").trim();

        const startTime = parseTimeValue(rawStart);
        const endTime = parseTimeValue(rawEnd);

        let _error: string | undefined;
        if (!truckId) _error = "Missing TruckId";
        else if (!bayId) _error = "Missing BayId";
        else if (!startTime) _error = "Invalid StartTime";
        else if (!endTime) _error = "Invalid EndTime";
        else if (startTime >= endTime) _error = "StartTime >= EndTime";

        return {
            truckId,
            bayId,
            startTime: startTime ?? "",
            endTime: endTime ?? "",
            status,
            _rowNum: i + 2,
            _error
        };
    });
}

function parseTimeValue(val: unknown): string | null {
    if (val === null || val === undefined || val === "") return null;
    if (val instanceof Date) return val.toISOString();
    if (typeof val === "number") {
        // Excel serial date (days since 1899-12-30)
        const d = new Date(Math.round((val - 25569) * 86400 * 1000));
        return isNaN(d.getTime()) ? null : d.toISOString();
    }
    if (typeof val === "string") {
        const s = val.trim();
        if (!s) return null;
        // HH:MM or HH:MM:SS — treat as today
        if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) {
            const parts = s.split(":").map(Number);
            const d = new Date();
            d.setHours(parts[0], parts[1], parts[2] ?? 0, 0);
            return d.toISOString();
        }
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d.toISOString();
    }
    return null;
}

function formatPreviewTime(iso: string): string {
    if (!iso) return "—";
    try {
        return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    } catch {
        return iso;
    }
}
