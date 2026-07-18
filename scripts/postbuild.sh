#!/usr/bin/env bash
set -e
MPK=$(find dist -name "*.mpk" | head -1)
[ -z "$MPK" ] && echo "No MPK found" && exit 1

python3 - "$MPK" << 'PYEOF'
import sys, zipfile, os

mpk_path = sys.argv[1]

new_pkg = b"""<?xml version="1.0" encoding="utf-8" ?>
<package xmlns="http://www.mendix.com/package/1.0/">
    <clientModule name="ScheduleWidget" version="1.0.0" xmlns="http://www.mendix.com/clientModule/1.0/">
        <widgetFiles>
            <widgetFile path="ScheduleWidget.xml"/>
            <widgetFile path="ScheduleWidgetVertical.xml"/>
        </widgetFiles>
    </clientModule>
</package>"""

with open("dist/tmp/widgets/ScheduleWidgetVertical.editorPreview.js", 'rb') as f:
    vertical_preview = f.read()

tmp = mpk_path + ".tmp"
with zipfile.ZipFile(mpk_path, 'r') as zin, zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as zout:
    has_vertical_preview = False
    for item in zin.infolist():
        if item.filename == 'package.xml':
            zout.writestr(item, new_pkg)
        elif item.filename == 'ScheduleWidgetVertical.editorPreview.js':
            zout.writestr(item, vertical_preview)
            has_vertical_preview = True
        else:
            zout.writestr(item, zin.read(item.filename))
    if not has_vertical_preview:
        zout.writestr('ScheduleWidgetVertical.editorPreview.js', vertical_preview)

os.replace(tmp, mpk_path)
print(f"MPK updated: {mpk_path}")
PYEOF
