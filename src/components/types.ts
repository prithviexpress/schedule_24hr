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
    subRow?: "plan" | "actual";
    isReadOnly?: boolean;   // true for blocks from the separate actualData datasource
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
    newBayId?: string;   // set by vertical widget when a block is dragged to a different bay
}

export interface NewSlot {
    bayId: string;
    startISO: string;
    endISO: string;
}

export interface BayClick {
    bayId: string;
}

// Window globals used as bridge between widget and Mendix JavaScript Actions
declare global {
    interface Window {
        __TruckSchedulerPendingEdit?: PendingEdit;
        __TruckSchedulerNewSlot?: NewSlot;
        __TruckSchedulerBayClick?: BayClick;
    }
}
