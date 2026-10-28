#!/bin/sh
# Runs on the TV as root, from install-tv.sh and the boot hook. Safe to run again. Takes effect after
# `ls-control scan-services`, and for a client that is already connected, once it reconnects.
# A sideloaded service is callable only by its own package. Its methods are made public, which is how Homebrew
# Channel exposes its own service, so the Settings stub (it calls as com.palm.app.settings) can reach them. The
# compositor's QML calls as com.webos.surfacemanager.systemui, a name in no group at all, so it is granted the
# service's own group.
set -e
SVC=dev.themepack.look.service
PKG=dev.themepack.look
DEV=/var/luna-service2-dev
API=$DEV/api-permissions.d/$SVC.api.public.json
CLIENT=$DEV/client-permissions.d/$SVC.compositor.json

printf '{"public":["%s/*"]}' $SVC > $API
printf '{"com.webos.surfacemanager.systemui":["%s.group"]}' $SVC > $CLIENT
# The bus only reads permission files listed in the package's manifest.
node -e '
var fs = require("fs"), f = process.argv[1], m = JSON.parse(fs.readFileSync(f));
function add(key, p) { m[key] = m[key] || []; if (m[key].indexOf(p) < 0) m[key].push(p); }
add("apiPermissionFiles", process.argv[2]);
add("clientPermissionFiles", process.argv[3]);
fs.writeFileSync(f, JSON.stringify(m));
' $DEV/manifests.d/$PKG.json $API $CLIENT
