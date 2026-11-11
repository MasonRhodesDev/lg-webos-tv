.pragma library

// A library script has no QML context of its own, so a component made here is created in the engine's root context
// and its objects live on after the file that asked for them is unloaded. Made in Inject.qml itself, the layer's
// bindings would stop with Inject.qml's context when LG's container lets go of it.

// Compiles the layer. Returns { component } or { error }, so a layer that does not compile is known before the loaded
// one is given up.
function prepare(url, host) {
    var c = Qt.createComponent(url, 0 /* Component.PreferSynchronous */, host);
    return c.status === 1 /* Component.Ready */ ? { "component": c } : { "error": c.errorString() };
}
function create(component, host) {
    var layer = component.createObject(host, { "host": host });
    return layer ? { "layer": layer } : { "error": "the layer could not be created" };
}
