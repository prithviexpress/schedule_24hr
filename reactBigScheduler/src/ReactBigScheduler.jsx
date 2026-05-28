import React, { Component, createElement } from "react";
import Scheduler, { SchedulerData, ViewTypes, CellUnits, DATE_FORMAT } from "./scheduler";
import "./ui/ReactBigScheduler.css";
import moment from "moment";
import DragDropContext from "./withDnDContext";

let events = [];
let resources = [];

class ReactBigScheduler extends Component {
    constructor(props) {
        super(props);
        let schedulerData = new SchedulerData(moment(new Date()), ViewTypes.Day, {
            customCellWidth: 150,
            nonAgendaDayCellHeaderFormat: "M/D|HH:mm",
            views: [
                { viewName: "Week", viewType: ViewTypes.Custom, showAgenda: false, isEventPerspective: false },
                { viewName: "Month", viewType: ViewTypes.Custom1, showAgenda: false, isEventPerspective: false },
                { viewName: "Year", viewType: ViewTypes.Custom2, showAgenda: false, isEventPerspective: false }
            ]
        });
        schedulerData.localeMoment.locale("de");
        schedulerData.config.calendarPopoverEnabled = false;
        schedulerData.config.headerEnabled = false;

        this.getWeekend(schedulerData);
        this.state = {
            viewModel: schedulerData
        };
    }

    getSchedData(schedulerData) {
        this.getWeekend(schedulerData);
        let cUnit;
        if (this.props.cellUnits.status === "available") {
            let cellUnits = this.props.cellUnits;
            if (cellUnits.value == "Hour") {
                cUnit = 60;
            } else if (cellUnits.value == "Day") {
                cUnit = 90;
            } else if (cellUnits.value == "Weeks") {
                cUnit = 300;
            } else if (cellUnits.value == "Months") {
                cUnit = 200;
            }
        } else if (this.props.cellUnits.status === "loading") {
            return <p>Loading... Please, wait...</p>;
        } else if (this.props.cellUnits.status === "unavailable") {
            return <p>There are no available items to show.</p>;
        }
        schedulerData = new SchedulerData(
            moment(new Date()),
            ViewTypes.Custom,
            false,
            false,
            {
                nonAgendaDayCellHeaderFormat: "HH:mm",
                nonAgendaOtherCellHeaderFormat: "M/D|HH:mm",
                customCellWidth: cUnit,
                views: []
            },
            {
                getCustomDateFunc: this.getCustomDate
            }
        );
        schedulerData.localeMoment.locale("en");
        schedulerData.config.calendarPopoverEnabled = false;
        this.state = {
            viewModel: schedulerData
        };
    }

    getData(schedulerData) {
        let schedulerResources = this.props.resources;
        let schedulerEvents = this.props.events;
        events = [];
        resources = [];
        for (let i = 0; i < schedulerResources.items.length; i++) {
            let resourceLabel = this.props.resourceLabel.get(schedulerResources.items[i]);
            let resourceGroup = this.props.groupOnly.get(schedulerResources.items[i]);
            let resourceId = this.props.resourceId.get(schedulerResources.items[i]);
            let resourceParent = this.props.parentID.get(schedulerResources.items[i]);
            if (resourceGroup.value == false && resourceParent.value.toString() != "0") {
                resources.push({
                    id: resourceId.value.toString(),
                    name: resourceLabel.value,
                    parentId: resourceParent.value.toString()
                });
            } else if (resourceGroup.value == false && resourceParent.value.toString() == "0") {
                resources.push({
                    id: resourceId.value.toString(),
                    name: resourceLabel.value,
                    groupOnly: resourceGroup.value
                });
            } else {
                resources.push({
                    id: resourceId.value.toString(),
                    name: resourceLabel.value,
                    groupOnly: resourceGroup.value
                });
            }
        }
        for (let i = 0; i < schedulerEvents.items.length; i++) {
            let eventResource = this.props.eventResource.get(schedulerEvents.items[i]);
            let eventValue = this.props.eventLabel.get(schedulerEvents.items[i]);
            let eventStart = this.props.eventStart.get(schedulerEvents.items[i]);
            let eventEnd = this.props.eventEnd.get(schedulerEvents.items[i]);
            let eventId = this.props.eventsId.get(schedulerEvents.items[i]);
            let showPopover = this.props.showPopover.get(schedulerEvents.items[i]);
            let resizeable = this.props.resizable.get(schedulerEvents.items[i]);
            let startResizeable = this.props.startResizeable.get(schedulerEvents.items[i]);
            let endResizeable = this.props.endResizeable.get(schedulerEvents.items[i]);
            let moveable = this.props.moveable.get(schedulerEvents.items[i]);
            let eventColor = this.props.eventColor.get(schedulerEvents.items[i]);
            events.push({
                id: eventId.value.toString(),
                start: eventStart.value.toString(),
                end: eventEnd.value.toString(),
                resourceId: eventResource.value.toString(),
                title: eventValue.value,
                startResizable: startResizeable.value,
                endResizable: endResizeable.value,
                movable: moveable.value,
                showPopover: showPopover.value,
                resizable: resizeable.value,
                bgColor: eventColor.value.toString()
            });
        }
        schedulerData.setResources(resources);
        schedulerData.setEvents(events);
    }

    getWeekend(schedulerData) {
        if (this.props.weekend.status === "available") {
            let weekend = this.props.weekend;
            if (weekend.value == "Thursday, Friday") {
                schedulerData.nonWorkingTime = 4;
            } else if (weekend.value == "Friday, Saturday") {
                schedulerData.nonWorkingTime = 5;
            } else if (weekend.value == "Saturday, Sunday") {
                schedulerData.nonWorkingTime = 6;
            }
        } else if (this.props.weekend.status === "loading") {
            return <p>Loading... Please, wait...</p>;
        } else if (this.props.weekend.status === "unavailable") {
            return <p>There are no available items to show.</p>;
        }
    }

    render() {
        let { viewModel } = this.state;
        this.getSchedData(viewModel);
        if (this.props.resources.status === "available") {
            if (this.props.events.status === "available") {
                this.getData(viewModel);
                viewModel.setResources(resources);
                viewModel.setEvents(events);
                viewModel._createHeaders();
                return (
                    <p>
                        <div>
                            <div>
                                <Scheduler
                                    schedulerData={viewModel}
                                    onSelectDate={this.onSelectDate}
                                    onViewChange={this.onViewChange}
                                    viewEventClick={this.ops1}
                                    viewEvent2Click={this.ops2}
                                    newEvent={this.newEvent}
                                    updateEventStart={this.updateEventStart}
                                    updateEventEnd={this.updateEventEnd}
                                    moveEvent={this.moveEvent}
                                    onScrollLeft={this.onScrollLeft}
                                    onScrollRight={this.onScrollRight}
                                    onScrollTop={this.onScrollTop}
                                    onScrollBottom={this.onScrollBottom}
                                    toggleExpandFunc={this.toggleExpandFunc}
                                    handleChange={this.handleChange}
                                />
                            </div>
                        </div>
                    </p>
                );
            } else if (this.props.events.status === "loading") {
                return <p>Loading... Please, wait...</p>;
            } else if (this.props.events.status === "unavailable") {
                return <p>There are no available items to show.</p>;
            }
        } else if (this.props.resources.status === "loading") {
            return <p>Loading... Please, wait...</p>;
        } else if (this.props.resources.status === "unavailable") {
            return <p>There are no available items to show.</p>;
        }
    }
    prevClick = schedulerData => {
        schedulerData.prev();
        schedulerData.setEvents(events);
        this.setState({
            viewModel: schedulerData
        });
    };

    nextClick = schedulerData => {
        schedulerData.next();
        schedulerData.setEvents(events);
        this.setState({
            viewModel: schedulerData
        });
    };

    onViewChange = (schedulerData, view) => {
        schedulerData.setViewType(view.viewType, view.showAgenda, view.isEventPerspective);
        schedulerData.config.customCellWidth = view.viewType === ViewTypes.Custom ? 30 : 80;
        schedulerData.setEvents(events);
        this.setState({
            viewModel: schedulerData
        });
    };

    onSelectDate = (schedulerData, date) => {
        schedulerData.setDate(date);
        schedulerData.setEvents(events);
        this.setState({
            viewModel: schedulerData
        });
    };

    eventClicked = (schedulerData, event) => {
        alert(`You just clicked an event: {id: ${event.id}, title: ${event.title}}`);
    };

    newEvent = (schedulerData, slotId, slotName, start, end, type, item) => {
        if (this.props.events.status === "available") {
            let newFreshId = 0;
            for (let i = 0; i < events.length; i++) {
                if (events[i].id >= newFreshId) {
                    newFreshId = parseInt(events[i].id) + 1;
                }
            }
            let newStart;
            if (this.props.cellUnits.status === "available") {
                let cellUnits = this.props.cellUnits;
                if (cellUnits.value == "Hour") {
                    // Hour mode: start already includes HH:mm:ss — preserve as-is
                    newStart = start.toString();
                } else if (cellUnits.value == "Day") {
                    newStart = start.toString();
                } else if (cellUnits.value == "Weeks") {
                    newStart = start.toString() + " 00:00:00";
                } else if (cellUnits.value == "Months") {
                    newStart = start.toString() + " 00:00:00";
                }
            } else if (this.props.cellUnits.status === "loading") {
                return <p>Loading... Please, wait...</p>;
            } else if (this.props.cellUnits.status === "unavailable") {
                return <p>There are no available items to show.</p>;
            }
            let widgetActions = this.props.widgetActions;
            let changeJSON = {};
            changeJSON = {
                action: "NEW",
                eventID: newFreshId.toString(),
                resourceID: slotId.toString(),
                start: newStart.toString(),
                end: end.toString()
            };
            events.push({
                id: newFreshId.toString(),
                start: start.toString(),
                end: end.toString(),
                resourceId: slotId.toString(),
                title: "New Title",
                startResizable: true,
                endResizable: true,
                movable: true,
                showPopover: true,
                resizable: true,
                bgColor: ""
            });
            widgetActions.setValue(JSON.stringify(changeJSON));
            this.setState({
                viewModel: schedulerData
            });
        } else if (this.props.events.status === "loading") {
            return <p>Loading... Please, wait...</p>;
        } else if (this.props.events.status === "unavailable") {
            return <p>There are no available items to show.</p>;
        }
    };

    ops1 = (schedulerData, event) => {
        alert(`You just executed ops1 to event: {id: ${event.id}, title: ${event.title}}`);
    };

    ops2 = (schedulerData, event) => {
        alert(`You just executed ops2 to event: {id: ${event.id}, title: ${event.title}}`);
    };

    updateEventStart = (schedulerData, event, newStart) => {
        if (this.props.events.status === "available") {
            let widgetActions = this.props.widgetActions;
            let changeJSON = {};
            for (let i = 0; i < events.length; i++) {
                if (events[i].id == event.id) {
                    let dateEnd = new Date(events[i].end.toString());
                    let dayEnd = dateEnd.getDate().toString();
                    let monthEnd = (dateEnd.getMonth() + 1).toString();
                    let yearEnd = dateEnd.getFullYear().toString();
                    let secondsEnd = dateEnd.getSeconds().toString();
                    let minutesEnd = dateEnd.getMinutes().toString();
                    let hoursEnd = dateEnd.getHours().toString();
                    let endDate =
                        yearEnd + "-" + monthEnd + "-" + dayEnd + " " + hoursEnd + ":" + minutesEnd + ":" + secondsEnd;
                    changeJSON = {
                        action: "EDIT",
                        eventID: event.id,
                        resourceID: events[i].resourceId,
                        start: newStart.toString(),
                        end: endDate
                    };
                }
            }
            widgetActions.setValue(JSON.stringify(changeJSON));
            this.setState({
                viewModel: schedulerData
            });
        } else if (this.props.events.status === "loading") {
            return <p>Loading... Please, wait...</p>;
        } else if (this.props.events.status === "unavailable") {
            return <p>There are no available items to show.</p>;
        }
    };

    updateEventEnd = (schedulerData, event, newEnd) => {
        if (this.props.events.status === "available") {
            let widgetActions = this.props.widgetActions;
            let changeJSON = {};
            for (let i = 0; i < events.length; i++) {
                if (events[i].id == event.id) {
                    let date = new Date(events[i].start.toString());
                    let day = date.getDate().toString();
                    let month = (date.getMonth() + 1).toString();
                    let year = date.getFullYear().toString();
                    let seconds = date.getSeconds().toString();
                    let minutes = date.getMinutes().toString();
                    let hours = date.getHours().toString();
                    let startDate = year + "-" + month + "-" + day + " " + hours + ":" + minutes + ":" + seconds;
                    changeJSON = {
                        action: "EDIT",
                        eventID: event.id,
                        resourceID: events[i].resourceId,
                        start: startDate,
                        end: newEnd
                    };
                }
            }
            widgetActions.setValue(JSON.stringify(changeJSON));
            this.setState({
                viewModel: schedulerData
            });
        } else if (this.props.events.status === "loading") {
            return <p>Loading... Please, wait...</p>;
        } else if (this.props.events.status === "unavailable") {
            return <p>There are no available items to show.</p>;
        }
    };

    moveEvent = (schedulerData, event, slotId, slotName, start, end) => {
        if (this.props.events.status === "available") {
            let widgetActions = this.props.widgetActions;
            let changeJSON = {};
            for (let i = 0; i < events.length; i++) {
                if (events[i].id == event.id) {
                    changeJSON = {
                        action: "EDIT",
                        eventID: event.id,
                        resourceID: slotId,
                        start: start,
                        end: end
                    };
                }
                widgetActions.setValue(JSON.stringify(changeJSON));
            }
            this.setState({
                viewModel: schedulerData
            });
        } else if (this.props.events.status === "loading") {
            return <p>Loading... Please, wait...</p>;
        } else if (this.props.events.status === "unavailable") {
            return <p>There are no available items to show.</p>;
        }
    };

    onScrollRight = (schedulerData, schedulerContent, maxScrollLeft) => {
        if (schedulerData.ViewTypes === ViewTypes.Day) {
            schedulerData.next();
            schedulerData.setEvents(events);
            this.setState({
                viewModel: schedulerData
            });

            schedulerContent.scrollLeft = maxScrollLeft - 10;
        }
    };

    onScrollLeft = (schedulerData, schedulerContent, maxScrollLeft) => {
        if (schedulerData.ViewTypes === ViewTypes.Day) {
            schedulerData.prev();
            schedulerData.setEvents(events);
            this.setState({
                viewModel: schedulerData
            });

            schedulerContent.scrollLeft = 10;
        }
    };

    onScrollTop = (schedulerData, schedulerContent, maxScrollTop) => {
        console.log("onScrollTop");
    };

    onScrollBottom = (schedulerData, schedulerContent, maxScrollTop) => {
        console.log("onScrollBottom");
    };

    toggleExpandFunc = (schedulerData, slotId) => {
        if (schedulerData.config.defaultExpanded == false) {
            schedulerData.config.defaultExpanded = true;
        } else {
            schedulerData.config.defaultExpanded = false;
        }
        this.setState({
            viewModel: schedulerData
        });
    };

    getCustomDate = (schedulerData, num, date = undefined) => {
        const { viewType } = schedulerData;
        let selectDate = schedulerData.startDate;
        if (date != undefined) selectDate = date;
        let startDate =
                num === 0
                    ? selectDate
                    : schedulerData
                          .localeMoment(selectDate)
                          .add(2 * num, "days")
                          .format(DATE_FORMAT),
            endDate = schedulerData.localeMoment(startDate).add(24, "hours").format(DATE_FORMAT),
            cellUnit = CellUnits.Hour;
        if (viewType === ViewTypes.Custom) {
            if (this.props.startDate.status === "available") {
                let date = new Date(this.props.startDate.value);
                let day = date.getDate().toString();
                let month = (date.getMonth() + 1).toString();
                let year = date.getFullYear().toString();
                let stDate = year + "-" + month + "-" + day;
                if (isNaN(date.getDate())) {
                    let date = new Date();
                    let day = date.getDate().toString();
                    let month = (date.getMonth() + 1).toString();
                    let year = date.getFullYear().toString();
                    let stDate = year + "-" + month + "-" + day;
                    startDate = num === 0 ? stDate : schedulerData.localeMoment(stDate).format(DATE_FORMAT);
                } else {
                    startDate = num === 0 ? stDate : schedulerData.localeMoment(stDate).format(DATE_FORMAT);
                }
            } else if (this.props.startDate.status === "loading") {
                return <p>Loading... Please, wait...</p>;
            } else if (this.props.startDate.status === "unavailable") {
                return <p>There are no available items to show.</p>;
            }
            if (this.props.endDate.status === "available") {
                let date = new Date(this.props.endDate.value);
                let day = date.getDate().toString();
                let month = (date.getMonth() + 1).toString();
                let year = date.getFullYear().toString();
                let eDate = year + "-" + month + "-" + day;
                if (isNaN(date.getDate())) {
                    let date = new Date();
                    let day = date.getDate().toString();
                    let month = (date.getMonth() + 3).toString();
                    let year = date.getFullYear().toString();
                    let eDate = year + "-" + month + "-" + day;
                    endDate = schedulerData.localeMoment(eDate).format(DATE_FORMAT);
                } else {
                    endDate = schedulerData.localeMoment(eDate).format(DATE_FORMAT);
                }
            } else if (this.props.endDate.status === "loading") {
                return <p>Loading... Please, wait...</p>;
            } else if (this.props.endDate.status === "unavailable") {
                return <p>There are no available items to show.</p>;
            }
            if (this.props.cellUnits.status === "available") {
                let cellUnits = this.props.cellUnits;
                if (cellUnits.value == "Hour") {
                    cellUnit = CellUnits.Hour;
                    // When displaying hours, constrain end to startDate + 1 day if
                    // the configured range spans more than 24 hours, to keep the
                    // hourly grid readable.
                    const start = schedulerData.localeMoment(startDate);
                    const end = schedulerData.localeMoment(endDate);
                    if (end.diff(start, "hours") > 24) {
                        endDate = start.clone().add(24, "hours").format(DATE_FORMAT);
                    }
                } else if (cellUnits.value == "Day") {
                    cellUnit = CellUnits.Day;
                } else if (cellUnits.value == "Weeks") {
                    cellUnit = CellUnits.Week;
                } else if (cellUnits.value == "Months") {
                    cellUnit = CellUnits.Month;
                }
            } else if (this.props.cellUnits.status === "loading") {
                return <p>Loading... Please, wait...</p>;
            } else if (this.props.cellUnits.status === "unavailable") {
                cellUnit = CellUnits.Month;
            }
        }
        return {
            startDate,
            endDate,
            cellUnit
        };
    };
}

export default DragDropContext(ReactBigScheduler);
