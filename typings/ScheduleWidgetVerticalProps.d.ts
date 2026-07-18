/**
 * This file was generated from ScheduleWidgetVertical.xml
 * WARNING: All changes made to this file will be overwritten
 * @author Mendix Widgets Framework Team
 */
import { CSSProperties } from "react";
import { ActionValue, EditableValue, ListValue, ListActionValue, ListAttributeValue } from "mendix";
import { Big } from "big.js";

export interface ScheduleWidgetVerticalContainerProps {
    name: string;
    class: string;
    style?: CSSProperties;
    tabIndex?: number;
    scheduleData: ListValue;
    truckIdAttr: ListAttributeValue<string>;
    bayIdAttr: ListAttributeValue<string>;
    startTimeAttr: ListAttributeValue<Date>;
    endTimeAttr: ListAttributeValue<Date>;
    statusAttr?: ListAttributeValue<string>;
    colorAttr?: ListAttributeValue<string>;
    tooltipAttr?: ListAttributeValue<string>;
    tooltipAttr2?: ListAttributeValue<string>;
    planActualAttr?: ListAttributeValue<string>;
    displayDate?: EditableValue<Date | string>;
    bayData?: ListValue;
    bayIdForStatusAttr?: ListAttributeValue<string>;
    bayColorAttr?: ListAttributeValue<string>;
    bayOccupancyAttr?: ListAttributeValue<string | boolean>;
    baySortAttr?: ListAttributeValue<Big>;
    onTruckClick?: ListActionValue;
    onScheduleChange?: ListActionValue;
    onEmptySlotClick?: ActionValue;
    rowHeight: number;
    resourceLabel: string;
    rowsPerPage: number;
    timeRangeStart: number;
    timeRangeEnd: number;
    timeRangeStartVar?: EditableValue<Big>;
    timeRangeEndVar?: EditableValue<Big>;
    showDwellMarkers: boolean;
    defaultDwellMinutes: number;
    showActualRows: boolean;
    showActualRowsVar?: EditableValue<boolean>;
    colorScheduled: string;
    colorInProgress: string;
    colorDelayed: string;
    colorConflict: string;
}

export interface ScheduleWidgetVerticalPreviewProps {
    /**
     * @deprecated Deprecated since version 9.18.0. Please use class property instead.
     */
    className: string;
    class: string;
    style: string;
    styleObject?: CSSProperties;
    readOnly: boolean;
    renderMode: "design" | "xray" | "structure";
    translate: (text: string) => string;
    scheduleData: {} | { caption: string } | { type: string } | null;
    truckIdAttr: string;
    bayIdAttr: string;
    startTimeAttr: string;
    endTimeAttr: string;
    statusAttr: string;
    colorAttr: string;
    tooltipAttr: string;
    tooltipAttr2: string;
    planActualAttr: string;
    displayDate: string;
    bayData: {} | { caption: string } | { type: string } | null;
    bayIdForStatusAttr: string;
    bayColorAttr: string;
    bayOccupancyAttr: string;
    baySortAttr: string;
    onTruckClick: {} | null;
    onScheduleChange: {} | null;
    onEmptySlotClick: {} | null;
    rowHeight: number | null;
    resourceLabel: string;
    rowsPerPage: number | null;
    timeRangeStart: number | null;
    timeRangeEnd: number | null;
    timeRangeStartVar: string;
    timeRangeEndVar: string;
    showDwellMarkers: boolean;
    defaultDwellMinutes: number | null;
    showActualRows: boolean;
    showActualRowsVar: string;
    colorScheduled: string;
    colorInProgress: string;
    colorDelayed: string;
    colorConflict: string;
}
