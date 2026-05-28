import { Component, createElement } from "react";

export class preview extends Component {
    render() {
        return <div>ReactBigScheduler Preview</div>;
    }
}

export function getPreviewCss() {
    return require("./ui/ReactBigScheduler.css");
}
