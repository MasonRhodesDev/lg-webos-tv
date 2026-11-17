export const KEYS = {
  QMENU: { from: 'proven', what: 'the gear: Quick Settings (ours through Hook A)' },
  UP: { from: 'proven' }, DOWN: { from: 'proven' }, LEFT: { from: 'proven' }, RIGHT: { from: 'proven' },
  ENTER: { from: 'proven', what: 'OK' },
  BACK: { from: 'proven' },
  VOLUMEUP: { from: 'table' }, VOLUMEDOWN: { from: 'table' }, MUTE: { from: 'table' },
  HOME: { from: 'proven', never: 'opens Home over the app underneath', unless: 'home' },
  EXIT: { from: 'proven', never: 'closes the app underneath', unless: 'exit' },
  INPUT_HUB: { from: 'table', never: 'a second Input press switches the input after 5 s' },
  CHANNELUP: { from: 'table', never: 'changes the channel' },
  CHANNELDOWN: { from: 'table', never: 'changes the channel' },
  POWER: { from: 'unverified', never: 'turns the TV off' },
  '0': { from: 'unverified', never: 'digit names are not in the service table; the PIN pad is driven with the D-pad' }
};

const MOVES = new Set(['UP', 'DOWN', 'LEFT', 'RIGHT']);
const STILL = new Set(['nav', 'value', 'choice', 'toggle', 'action', 'category', 'info']);

const sameRef = (a, b) => !!a && !!b && (a === b || a.split('/').pop() === b);
function writeOk(f, allow) {
  return !!(allow.write && sameRef(f.ref, allow.write.ref) &&
    ((f.kind === 'item' && f.variant === 'toggle') || f.kind === 'choose'));
}
export const LAUNCHES = new Set(['deviceConnector', 'pictureTest', 'soundTest']);
const launchOk = (f, allow) => !!(allow.launch && f.kind === 'action' && LAUNCHES.has(f.ref) && sameRef(f.ref, allow.launch.ref));

function enterSafe(f, allow) {
  if (!f) return 'no row has focus';
  if (f.locked) return 'a locked row asks for the PIN and then acts';
  if (writeOk(f, allow)) return null;
  if (launchOk(f, allow)) return null;
  if (f.variant === 'category') return null;
  if (f.kind === 'page' || f.kind === 'settings') return null;
  if (f.kind === 'item' && f.variant === 'value') return null;
  if (f.kind === 'text' && allow.text) return null;
  if ((f.kind === 'style' || f.kind === 'theme') && allow.look) return null;
  return 'OK on a ' + (f.kind || '?') + '/' + (f.variant || '?') + ' row ("' + f.label + '") would change something';
}

export function guard(key, state, allow = {}) {
  const k = KEYS[key];
  if (!k) return 'unknown key ' + key;
  if (k.never && !(k.unless && allow[k.unless])) return key + ' is never pressed: ' + k.never;
  if (state.fresh === false) return 'stale state, nothing is pressed: ' + state.stale;
  if (state.systemUi === 'unknown') return "an LG overlay we do not know is open, or systemUIManager's answer is unreadable: nothing is pressed";
  const s = state.settings || {};
  const own = s.menu && s.menu.open ? 'menu' : s.quick && s.quick.open ? 'quick' : null;
  const picker = !!(state.picker && state.picker.shown) || state.systemUi === 'com.webos.app.quickinputpicker';
  if (state.systemUi === 'com.webos.app.quicksettings') {
    return allow.lgQuick && ['UP', 'DOWN', 'ENTER', 'BACK'].includes(key) ? null : "LG's Quick Settings is open: no key (it closes with closeByAppId)";
  }
  if (picker) return allow.picker && ['LEFT', 'RIGHT', 'BACK'].includes(key) ? null : 'the input picker is open: ' + (allow.picker ? 'only Left, Right and Back' : 'no key');
  if (['VOLUMEUP', 'VOLUMEDOWN', 'MUTE'].includes(key)) return allow.volume ? null : key + ' only in the volume scenarios';
  if (key === 'QMENU') return null;
  if (k.never) return null;
  if (!own) {
    if (key === 'BACK' && allow.over && (state.front || []).includes(allow.over)) return null;
    return 'nothing of ours is confirmed open: ' + key + ' would reach the app underneath';
  }
  const v = s[own];
  if (key === 'BACK') return null;
  if (v.dialog) return 'a dialog is up: only BACK';
  if (v.editing) {
    if (!allow.type) return 'the keyboard is up: only BACK (nothing is typed)';
    if (/^Password/.test(v.editing.label)) return 'never type into a password';
    return MOVES.has(key) || key === 'ENTER' ? null : 'no rule for ' + key + ' on the keyboard';
  }
  if (v.pin) {
    if (v.pin.mode !== 'page') return 'the PIN prompt is ' + v.pin.mode + ': only BACK';
    if (MOVES.has(key)) return null;
    return key === 'ENTER' && allow.pin ? null : 'the PIN prompt is up: ' + key + ' only in the PIN scenario';
  }
  const f = v.focus;
  if (key === 'UP' || key === 'DOWN') return null;
  if (key === 'LEFT' || key === 'RIGHT') {
    if (f && f.variant === 'slider' && allow.write && sameRef(f.ref, allow.write.ref)) return null;
    if (own === 'quick') return 'Left/Right in the quick sheet change the volume';
    if (v.area === 'categories') return key === 'RIGHT' ? null : 'Left in the categories does nothing we test';
    if (key === 'RIGHT') return 'Right in a page steps a slider';
    return f && STILL.has(f.variant) ? null : 'Left on a ' + (f ? f.variant : 'missing') + ' row could step it';
  }
  if (key === 'ENTER') return enterSafe(f, allow);
  return 'no rule for ' + key;
}
