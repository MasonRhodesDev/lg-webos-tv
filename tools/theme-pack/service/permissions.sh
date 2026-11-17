#!/bin/sh
set -e
SVC=dev.themepack.look.service
PKG=dev.themepack.look
DEV=/var/luna-service2-dev
API=$DEV/api-permissions.d/$SVC.api.public.json
CLIENT=$DEV/client-permissions.d/$SVC.compositor.json

printf '{"public":["%s/*"]}' $SVC > $API
METHODS='com.webos.settingsservice/getSystemSettings com.webos.settingsservice/getSystemSettingDesc
com.webos.settingsservice/getSystemSettingValues com.webos.settingsservice/setSystemSettings
com.webos.settingsservice/resetSystemSettings com.webos.settingsservice/batch
com.webos.service.tv.time/getSleepTimeInfo com.webos.service.tv.time/setSleepTimeInfo
com.webos.service.tv.display/setPSMChangedByUser com.webos.service.connectionmanager/getstatus
com.webos.audio/getVolume com.webos.audio/setVolume com.webos.service.tvpower/power/turnOffScreen
com.webos.notification/createToast com.webos.applicationManager/launch
com.webos.service.tv.display/getHDMIInfo com.webos.service.tv.systemproperty/getSystemInfo
com.palm.systemservice/osInfo/query com.palm.systemservice/getPreferences com.palm.systemservice/setPreferences
com.palm.systemservice/getPreferenceValues com.palm.systemservice/time/getSystemTime
com.palm.systemservice/time/setSystemTime
com.webos.service.systemservice/getPreferences com.webos.service.systemservice/setPreferences
com.webos.service.systemservice/getPreferenceValues com.webos.service.systemservice/time/getSystemTime
com.webos.service.systemservice/time/setSystemTime
com.webos.service.tv.systemproperty/doUserDefault
com.webos.service.wifi/getstatus com.webos.service.wifi/setstate com.webos.service.wifi/findnetworks
com.webos.service.wifi/connect com.webos.service.wifi/deleteprofile
com.webos.service.bluetooth2/device/getStatus
com.webos.service.btaudiosrc/startDiscovery com.webos.service.btaudiosrc/connect com.webos.service.btaudiosrc/disconnect
com.webos.service.btaudiosrc/removePairedDevice
com.webos.service.eim/getAllInputStatus com.webos.applicationManager/listLaunchPoints
com.webos.applicationManager/getForegroundAppInfo com.webos.service.attachedstoragemanager/listDevices'
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
fs.writeFileSync(process.argv[3], JSON.stringify({ "com.webos.surfacemanager.wedge": out }));
console.log("compositor groups: " + out.join(" "));
' $SVC "$METHODS" $CLIENT
node -e '
var fs = require("fs"), f = process.argv[1], m = JSON.parse(fs.readFileSync(f));
function add(key, p) { m[key] = m[key] || []; if (m[key].indexOf(p) < 0) m[key].push(p); }
add("apiPermissionFiles", process.argv[2]);
add("clientPermissionFiles", process.argv[3]);
fs.writeFileSync(f, JSON.stringify(m));
' $DEV/manifests.d/$PKG.json $API $CLIENT
