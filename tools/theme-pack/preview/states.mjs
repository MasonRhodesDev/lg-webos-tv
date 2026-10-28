// Which states of a scene the preview renders: its base state, then each state it declares. A scene leaves its base
// out only by saying so (`property bool baseShot: false`), so adding a state never drops the base shots.
// `info` is Shot.qml's SHOT-INFO: { states: [names], base: bool }. '' is the base state.
export function shotStates(info) {
  const named = info.states || [];
  return info.base === false && named.length ? named.slice() : [''].concat(named);
}
