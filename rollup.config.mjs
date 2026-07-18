import { join } from "node:path";
const sourcePath = process.cwd();
const V_NAME = "ScheduleWidgetVertical";
const V_PKG = "com.prithvi";
const outDir = join(sourcePath, "dist/tmp/widgets/");
const vDir = join(V_PKG.replace(/\./g, "/"), V_NAME.toLowerCase());

function secondaryPlugins(plugins) {
    let commandsSeen = 0;
    return (plugins ?? []).flatMap(p => {
        if (!p) return [];
        const name = p.name ?? "";
        if (name === "clear") return [];
        if (name === "widget-typing") return [];
        if (name === "command") {
            commandsSeen++;
            if (commandsSeen === 1) return [];
        }
        if (name === "livereload") return [];
        return [p];
    });
}

export default async function(args) {
    const defaultConfigs = args.configDefaultConfig ?? [];
    const [amdCfg, esmCfg, ...rest] = defaultConfigs;
    const previewCfg = rest.find(c => c.output?.file?.includes("editorPreview"));
    const verticalAmd = {
        ...amdCfg,
        input: join(sourcePath, `src/${V_NAME}.tsx`),
        output: { ...amdCfg.output, file: join(outDir, vDir, `${V_NAME}.js`) },
        plugins: secondaryPlugins(amdCfg.plugins)
    };
    const verticalEsm = {
        ...esmCfg,
        input: join(sourcePath, `src/${V_NAME}.tsx`),
        output: { ...esmCfg.output, file: join(outDir, vDir, `${V_NAME}.mjs`) },
        plugins: secondaryPlugins(esmCfg.plugins)
    };
    const extras = [verticalAmd, verticalEsm];
    if (previewCfg) {
        extras.push({
            ...previewCfg,
            input: join(sourcePath, `src/${V_NAME}.editorPreview.tsx`),
            output: { ...previewCfg.output, file: join(outDir, `${V_NAME}.editorPreview.js`) },
            plugins: secondaryPlugins(previewCfg.plugins)
        });
    }
    return [...defaultConfigs, ...extras];
}
