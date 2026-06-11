import { ObjectItem } from "mendix";

export interface ScheduleBlock {
    item: ObjectItem;
    truckId: string;
    bayId: string;
    groupId: string;
    startMin: number;  // minutes from midnight, 0–1440
    endMin: number;    // minutes from midnight, 0–1440
    status: string;
    color: string;
    isConflict: boolean;
    bayStatus?: string;   // operational status of the bay (e.g. "available", "occupied", "maintenance")
    tooltipText?: string;
    tooltipText2?: string;
    tooltipText3?: string;
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
