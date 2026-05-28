// Custom rollup config following Mendix Studio Pro 11.7+ requirements:
//
// 1. ES/mjs build is FULLY BUNDLED (no external imports):
//    - external: [] overrides the default webExternal list so react, react-dom,
//      and react/jsx-runtime are bundled directly into the .mjs.
//    - Studio Pro requires "fully bundled into a single JS file" — the .mjs
//      cannot have unresolved import paths at validation time.
//
// 2. Babel OUTPUT plugin removed (AMD + ES):
//    Adding Babel helpers before define()/import causes both formats to be
//    invalid module files. The Babel INPUT plugin still runs for JSX/TS.
//
// 3. Terser removed from ES build:
//    Minified single-line output can trip Studio Pro's ES module validator.
//    AMD stays minified for production.
//
// 4. Output path flattened for AMD + ES:
//    pluggable-widgets-tools emits to com/prithvi/schedulewidget/ScheduleWidget.{js,mjs}
//    but Mendix 11.7 derives the AMD module path directly from the widget id
//    (com.prithvi.ScheduleWidget → widgets/com/prithvi/ScheduleWidget.js).
//    Removing the lowercase widget subdirectory makes the paths align.
export default async function (args) {
    const defaults = args.configDefaultConfig;
    if (!defaults) return {};

    return defaults.map(config => {
        const format = config.output?.format;
        if (format !== "amd" && format !== "es") return config;

        const withoutBabelOutput = (config.plugins || []).filter(p => p?.name !== "babel");

        // Flatten: remove the auto-generated lowercase widget subdirectory so
        // the output file sits directly under the package path directory.
        const flatFile = config.output?.file?.replace(
            /[/\\]schedulewidget[/\\]ScheduleWidget\./,
            "/ScheduleWidget."
        );
        const flatOutput = flatFile ? { ...config.output, file: flatFile } : config.output;

        if (format === "es") {
            return {
                ...config,
                output: flatOutput,
                // Bundle everything — no external imports in the .mjs
                external: [],
                plugins: withoutBabelOutput.filter(p => p?.name !== "terser")
            };
        }

        return { ...config, output: flatOutput, plugins: withoutBabelOutput };
    });
}
