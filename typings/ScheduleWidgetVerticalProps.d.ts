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
    bayTypeAttr?: ListAttributeValue<string>;
    actualData?: ListValue;
    actualTruckIdAttr?: ListAttributeValue<string>;
    actualBayIdAttr?: ListAttributeValue<string>;
    actualStartTimeAttr?: ListAttributeValue<Date>;
    actualEndTimeAttr?: ListAttributeValue<Date>;
    actualStatusAttr?: ListAttributeValue<string>;
    actualColorAttr?: ListAttributeValue<string>;
    actualTooltipAttr?: ListAttributeValue<string>;
    actualTooltipAttr2?: ListAttributeValue<string>;
    onActualTruckClick?: ListActionValue;
    onTruckClick?: ListActionValue;
    onScheduleChange?: ListActionValue;
    onEmptySlotClick?: ActionValue;
    emptySlotBayVar?: EditableValue<string>;
    emptySlotStartVar?: EditableValue<Date>;
    emptySlotEndVar?: EditableValue<Date>;
    onBayClick?: ListActionValue;
    rowHeight: number;
    columnWidth: number;
    resourceLabel: string;
    rowsPerPage: number;
    timeRangeStart: number;
    timeRangeEnd: number;
    timeRangeStartVar?: EditableValue<Big>;
    timeRangeEndVar?: EditableValue<Big>;
    sortByTime: boolean;
    showDwellMarkers: boolean;
    defaultDwellMinutes: number;
    showActualRows: boolean;
    showActualRowsVar?: EditableValue<boolean>;
    colorScheduled: string;
    colorInProgress: string;
    colorDelayed: string;
    colorConflict: string;
    gridAlpha: number;
    timeWindowsAlpha: number;
    timeWindows: string;
    defaultGroup: string;
    defaultGroupVar?: EditableValue<string>;
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
    bayTypeAttr: string;
    actualData: {} | { caption: string } | { type: string } | null;
    actualTruckIdAttr: string;
    actualBayIdAttr: string;
    actualStartTimeAttr: string;
    actualEndTimeAttr: string;
    actualStatusAttr: string;
    actualColorAttr: string;
    actualTooltipAttr: string;
    actualTooltipAttr2: string;
    onActualTruckClick: {} | null;
    onTruckClick: {} | null;
    onScheduleChange: {} | null;
    onEmptySlotClick: {} | null;
    emptySlotBayVar: string;
    emptySlotStartVar: string;
    emptySlotEndVar: string;
    onBayClick: {} | null;
    rowHeight: number | null;
    columnWidth: number;
    resourceLabel: string;
    rowsPerPage: number | null;
    timeRangeStart: number | null;
    timeRangeEnd: number | null;
    timeRangeStartVar: string;
    timeRangeEndVar: string;
    sortByTime: boolean;
    showDwellMarkers: boolean;
    defaultDwellMinutes: number | null;
    showActualRows: boolean;
    showActualRowsVar: string;
    colorScheduled: string;
    colorInProgress: string;
    colorDelayed: string;
    colorConflict: string;
    gridAlpha: number | null;
    timeWindowsAlpha: number | null;
    timeWindows: string;
    defaultGroup: string;
    defaultGroupVar: string;
}
