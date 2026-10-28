#!/bin/sh
# Runs on the TV as root, from install-tv.sh and the boot hook. Safe to run again. Takes effect after
# `ls-control scan-services`, and for a client that is already connected, once it reconnects.
# A sideloaded service is callable only by its own package. Its methods are made public, which is how Homebrew
# Channel exposes its own service, so the Settings stub (it calls as com.palm.app.settings) can reach them. The
# compositor's QML calls as com.webos.surfacemanager.systemui, a name in no group at all, so it is granted the
# service's own group, and the groups LG's services put the methods our Settings calls in (SETTINGS-PLAN.md, bus
# identity). Those groups are read from the TV's own api-permissions files, so nothing here guesses their names.
# UNVERIFIED on the TV: whether ls-hubd grants system groups from the dev directory (TV-CHECKS.md, Settings core).
set -e
SVC=dev.themepack.look.service
PKG=dev.themepack.look
DEV=/var/luna-service2-dev
API=$DEV/api-permissions.d/$SVC.api.public.json
CLIENT=$DEV/client-permissions.d/$SVC.compositor.json

printf '{"public":["%s/*"]}' $SVC > $API
# The methods ui/Look/settings/Store.qml and parts/Settings.qml call.
METHODS='com.webos.settingsservice/getSystemSettings com.webos.settingsservice/getSystemSettingDesc
com.webos.settingsservice/getSystemSettingValues com.webos.settingsservice/setSystemSettings
com.webos.settingsservice/resetSystemSettings com.webos.settingsservice/batch
com.webos.service.tv.time/getSleepTimeInfo com.webos.service.tv.time/setSleepTimeInfo
com.webos.service.tv.display/setPSMChangedByUser com.webos.service.connectionmanager/getstatus
com.webos.audio/getVolume com.webos.audio/setVolume com.webos.service.tvpower/power/turnOffScreen
com.webos.notification/createToast com.webos.applicationManager/launch
com.webos.service.tv.display/getHDMIInfo com.webos.service.tv.systemproperty/getSystemInfo
com.palm.systemservice/osInfo/query com.palm.systemservice/getPreferences com.palm.systemservice/setPreferences
com.webos.service.tv.systemproperty/doUserDefault'
node -e '
var fs = require("fs"), path = require("path"), out = [process.argv[1] + ".group"], methods = process.argv[2].split(/\s+/);
function covers(pattern, m) { return pattern === m || (/\*$/.test(pattern) && m.indexOf(pattern.slice(0, -1)) === 0); }
["/usr/share/luna-service2/api-permissions.d"].forEach(function (dir) {
  var files = [];
  try { files = fs.readdirSync(dir); } catch (e) { return; }
  files.forEach(function (f) {
    var groups;
    try { groups = JSON.parse(fs.readFileSync(path.join(dir, f))); } catch (e) { return; }
    Object.keys(groups).forEach(function (g) {
      if (g === "public" || out.indexOf(g) >= 0 || !(groups[g] instanceof Array)) return;
      if (methods.some(function (m) { return groups[g].some(function (p) { return covers(p, m); }); })) out.push(g);
    });
  });
});
fs.writeFileSync(process.argv[3], JSON.stringify({ "com.webos.surfacemanager.systemui": out }));
console.log("compositor groups: " + out.join(" "));
' $SVC "$METHODS" $CLIENT
# The bus only reads permission files listed in the package's manifest.
node -e '
var fs = require("fs"), f = process.argv[1], m = JSON.parse(fs.readFileSync(f));
function add(key, p) { m[key] = m[key] || []; if (m[key].indexOf(p) < 0) m[key].push(p); }
add("apiPermissionFiles", process.argv[2]);
add("clientPermissionFiles", process.argv[3]);
fs.writeFileSync(f, JSON.stringify(m));
' $DEV/manifests.d/$PKG.json $API $CLIENT
