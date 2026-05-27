// Custom rollup config:
//
// 1. Removes the Babel OUTPUT plugin from AMD/ES bundles.
//    The output plugin's only job is downcompiling to Safari 12, which causes
//    Babel helpers to land before define() in AMD and before import statements
//    in ESM, making both formats invalid as module files.
//
// 2. Removes terser from the ES/mjs bundle so the file is not single-line
//    minified — Studio Pro's static ES module validator can reject minified code.
//
// 3. Removes the Babel INPUT JSX transform override for ES format so that
//    TypeScript's classic React.createElement output is preserved, eliminating
//    the react/jsx-runtime import from the mjs (only "react" is imported).
export default async function (args) {
    const defaults = args.configDefaultConfig;
    if (!defaults) return {};

    return defaults.map(config => {
        const format = config.output?.format;
        // Leave editorPreview (commonjs) and editorConfig builds unchanged
        if (format !== "amd" && format !== "es") return config;

        const withoutBabelOutput = (config.plugins || []).filter(p => p?.name !== "babel");

        if (format === "es") {
            return {
                ...config,
                plugins: withoutBabelOutput.filter(p => p?.name !== "terser")
            };
        }

        return { ...config, plugins: withoutBabelOutput };
    });
}
