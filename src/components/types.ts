import { ObjectItem } from "mendix";

export interface ScheduleBlock {
    item: ObjectItem;
    truckId: string;
    bayId: string;
    groupId: string;
    startMin: number;
    endMin: number;
    status: string;
    color: string;
    isConflict: boolean;
    tooltipText?: string;
    tooltipText2?: string;
}

export interface BayStatus {
    color: string;      // raw string passed to bayStatusColor()
    occupied: boolean | null;
}

export interface BayGroup {
    id: string;
    label: string;
    bays: string[];
}

export interface PendingEdit {
    newStartISO: string;
    newEndISO: string;
}

export interface NewSlot {
    bayId: string;
    startISO: string;
    endISO: string;
}

// Window globals used as bridge between widget and Mendix JavaScript Actions
declare global {
    interface Window {
        __TruckSchedulerPendingEdit?: PendingEdit;
        __TruckSchedulerNewSlot?: NewSlot;
    }
}
