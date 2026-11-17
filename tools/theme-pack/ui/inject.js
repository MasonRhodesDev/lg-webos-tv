.pragma library

function prepare(url, host) {
    var c = Qt.createComponent(url, 0, host);
    return c.status === 1 ? { "component": c } : { "error": c.errorString() };
}
function create(component, host) {
    var layer = component.createObject(host, { "host": host });
    return layer ? { "layer": layer } : { "error": "the layer could not be created" };
}
