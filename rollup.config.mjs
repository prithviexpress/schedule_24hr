import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

// Custom rollup config following Mendix Studio Pro 11.7+ requirements:
//
// 1. ES/mjs build is FULLY BUNDLED (no external imports).
// 2. Babel OUTPUT plugin removed (AMD + ES) — adding Babel helpers before
//    define()/import makes both formats invalid module files.
// 3. Terser removed from ES build — minified single-line output can trip
//    Studio Pro's ES module validator. AMD stays minified.
// 4. Legacy-path copy: build tool outputs to com/prithvi/schedulewidget/
//    but the widget ID com.prithvi.ScheduleWidget maps to com/prithvi/.
//    After each bundle is written we copy it to the ID-derived path so
//    Mendix can find it without requiring the widget to be re-added to pages.

function legacyPathCopyPlugin() {
    return {
        name: "legacy-path-copy",
        writeBundle({ file }) {
            if (!file) return;
            const legacyFile = file.replace(
                /(com\/prithvi\/)schedulewidget\/(ScheduleWidget\.(?:js|mjs))$/,
                "$1$2"
            );
            if (legacyFile !== file && existsSync(file)) {
                mkdirSync(dirname(legacyFile), { recursive: true });
                copyFileSync(file, legacyFile);
            }
        }
    };
}

export default async function (args) {
    const defaults = args.configDefaultConfig;
    if (!defaults) return {};

    return defaults.map(config => {
        const format = config.output?.format;
        if (format !== "amd" && format !== "es") return config;

        const withoutBabelOutput = (config.plugins || []).filter(p => p?.name !== "babel");

        if (format === "es") {
            return {
                ...config,
                external: [],
                plugins: [...withoutBabelOutput.filter(p => p?.name !== "terser"), legacyPathCopyPlugin()]
            };
        }

        return { ...config, plugins: [...withoutBabelOutput, legacyPathCopyPlugin()] };
    });
}
