// Custom rollup config: removes the Babel output plugin from AMD/ES bundles.
// The output plugin's only job is downcompiling to Safari 12, which Mendix 11
// does not support — and which causes Babel helpers to land before define() in
// AMD and before import statements in ESM, making both formats invalid.
// The Babel INPUT plugin still runs (TypeScript → JS, JSX transform), so all
// source transformations happen correctly; we just skip the output downcompile.
export default async function (args) {
    const defaults = args.configDefaultConfig;
    if (!defaults) return {};

    return defaults.map(config => {
        const format = config.output?.format;
        // Leave editorPreview (commonjs) and editorConfig builds unchanged
        if (format !== "amd" && format !== "es") return config;

        return {
            ...config,
            plugins: (config.plugins || []).filter(p => p?.name !== "babel")
        };
    });
}
