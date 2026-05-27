import { ReactElement, useRef, useState, useCallback } from "react";
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
            const ext = file.name.split(".").pop()?.toLowerCase();
            if (ext === "xlsx" || ext === "xls") {
                onError(
                    "Please save the file as CSV from Excel first:\n" +
                    "File → Save As → CSV (Comma delimited) — then re-upload the .csv file."
                );
                return;
            }
            setIsParsing(true);
            const reader = new FileReader();
            reader.onload = e => {
                try {
                    const text = e.target?.result as string;
                    const rows = parseCsv(text);
                    allRowsRef.current = rows;
                    setTotalRows(rows.length);
                    setPreview(rows.slice(0, 10));
                } catch (err) {
                    onError(`CSV parse error: ${(err as Error).message}`);
                } finally {
                    setIsParsing(false);
                }
            };
            reader.onerror = () => {
                onError("Failed to read file");
                setIsParsing(false);
            };
            reader.readAsText(file, "utf-8");
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
                aria-label="Upload schedule CSV file — click or drag and drop"
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    style={{ display: "none" }}
                    onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) parseFile(f);
                        e.target.value = "";
                    }}
                />
                {isParsing ? "Parsing…" : "⬆ Upload CSV / Excel"}
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

// ─── CSV Parser (RFC 4180 + auto-detect delimiter) ──────────────────────────

function parseCsv(text: string): PreviewRow[] {
    const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    const nonEmpty = lines.filter(l => l.trim());
    if (nonEmpty.length < 2) throw new Error("File has no data rows");

    // Auto-detect delimiter from header line
    const header = nonEmpty[0];
    const delim = header.includes("\t") ? "\t" : header.includes(";") ? ";" : ",";

    const headers = splitCsvLine(header, delim).map(normalizeKey);
    const rows: PreviewRow[] = [];

    for (let i = 1; i < nonEmpty.length; i++) {
        const vals = splitCsvLine(nonEmpty[i], delim);
        const raw: Record<string, string> = {};
        headers.forEach((h, idx) => { raw[h] = (vals[idx] ?? "").trim(); });

        const truckId = (raw["truckid"] ?? raw["truck"] ?? raw["truckno"] ?? "").trim();
        const bayId = (raw["bayid"] ?? raw["bay"] ?? raw["bayno"] ?? raw["baynumber"] ?? "").trim();
        const rawStart = raw["starttime"] ?? raw["start"] ?? raw["arrival"] ?? "";
        const rawEnd = raw["endtime"] ?? raw["end"] ?? raw["departure"] ?? "";
        const status = (raw["status"] ?? "Scheduled").trim() || "Scheduled";

        const startTime = parseTimeValue(rawStart);
        const endTime = parseTimeValue(rawEnd);

        let _error: string | undefined;
        if (!truckId) _error = "Missing TruckId";
        else if (!bayId) _error = "Missing BayId";
        else if (!startTime) _error = "Invalid StartTime";
        else if (!endTime) _error = "Invalid EndTime";
        else if (startTime >= endTime) _error = "StartTime >= EndTime";

        rows.push({
            truckId,
            bayId,
            startTime: startTime ?? "",
            endTime: endTime ?? "",
            status,
            _rowNum: i + 1,
            _error
        });
    }
    return rows;
}

function splitCsvLine(line: string, delim: string): string[] {
    const fields: string[] = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuote) {
            if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
            else if (ch === '"') { inQuote = false; }
            else { cur += ch; }
        } else {
            if (ch === '"') { inQuote = true; }
            else if (ch === delim) { fields.push(cur); cur = ""; }
            else { cur += ch; }
        }
    }
    fields.push(cur);
    return fields;
}

function normalizeKey(k: string): string {
    return k.toLowerCase().replace(/[\s_\-.]/g, "");
}

function parseTimeValue(val: string): string | null {
    const s = val.trim();
    if (!s) return null;
    // HH:MM or HH:MM:SS — treat as today
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) {
        const parts = s.split(":").map(Number);
        const d = new Date();
        d.setHours(parts[0], parts[1], parts[2] ?? 0, 0);
        return isNaN(d.getTime()) ? null : d.toISOString();
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString();
}

function formatPreviewTime(iso: string): string {
    if (!iso) return "—";
    try {
        return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    } catch {
        return iso;
    }
}
