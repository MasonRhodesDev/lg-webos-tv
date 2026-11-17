export function shotStates(info) {
  const named = info.states || [];
  return info.base === false && named.length ? named.slice() : [''].concat(named);
}
