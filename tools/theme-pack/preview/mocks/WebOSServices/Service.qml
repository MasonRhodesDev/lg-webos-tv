import QtQuick 2.4
import Preview 1.0

// Stands in for LG's bus client. The Look service is answered from the preview's fixture, the settings services from
// the settings fixture (TvSettings); reports are printed.
QtObject {
    property string appId
    signal response(string method, string payload)

    function cancel() { TvSettings.cancel(this); }

    function call(uri, method, params) {
        if (method === "/signal/registerServerStatus") {
            var name = JSON.parse(params).serviceName;
            response(method, JSON.stringify({ "serviceName": name, "connected": true }));
        } else if (uri === "luna://dev.themepack.look.service" && method === "/getLook") {
            if (JSON.parse(params).subscribe) Fixture.subscribe(this);
            response(method, JSON.stringify(Fixture.payload));
        } else if (uri === "luna://dev.themepack.look.service") {
            Fixture.command(method, params);
            if (method === "/report") console.log("report: " + params);
        } else {
            TvSettings.handle(this, uri, method, params);
        }
    }
}
