// The remote's buttons as LG's network input service names them, and the guard every key the suite presses goes
// through. Provenance: "proven" were pressed on the TV through the socket; "table" are names in the service binary's
// key table (network-input-service), not yet pressed; "unverified" were not found in that table.
export const KEYS = {
  QMENU: { from: 'proven', what: 'the gear: Quick Settings (ours through Hook A)' },
  UP: { from: 'proven' }, DOWN: { from: 'proven' }, LEFT: { from: 'proven' }, RIGHT: { from: 'proven' },
  ENTER: { from: 'proven', what: 'OK' },
  BACK: { from: 'proven' },
  VOLUMEUP: { from: 'table' }, VOLUMEDOWN: { from: 'table' }, MUTE: { from: 'table' },
  // Never pressed by the suite: they leave the app underneath (Home, Exit), switch input (Input), change channel or
  // turn the TV off. The checks that need them are manual.
  HOME: { from: 'table', never: 'opens Home over the app underneath' },
  EXIT: { from: 'table', never: 'closes the app underneath' },
  INPUT_HUB: { from: 'table', never: 'a second Input press switches the input after 5 s' },
  CHANNELUP: { from: 'table', never: 'changes the channel' },
  CHANNELDOWN: { from: 'table', never: 'changes the channel' },
  POWER: { from: 'unverified', never: 'turns the TV off' },
  '0': { from: 'unverified', never: 'digit names are not in the service table; the PIN pad is driven with the D-pad' }
};

const MOVES = new Set(['UP', 'DOWN', 'LEFT', 'RIGHT']);
// Row variants Left/Right do not change (RowList steps only sliders and steppers).
const STILL = new Set(['nav', 'value', 'choice', 'toggle', 'action', 'category', 'info']);

// What OK on a row does, from its kind and variant (pages.js, PageView.run): only these open something without
// changing anything. `allow` widens it for one press: text (open the keyboard), look (a Look page style or theme row,
// restored by the run), pin (a digit on a locked page's PIN pad).
// A write the scenario will undo (allow.write = { ref }): OK on that setting's toggle, or on a choice in its picker.
// Actions (reset, screen off), networks, devices, the PIN and locked rows never pass, whatever is allowed.
const sameRef = (a, b) => !!a && !!b && (a === b || a.split('/').pop() === b);
function writeOk(f, allow) {
  return !!(allow.write && sameRef(f.ref, allow.write.ref) &&
    ((f.kind === 'item' && f.variant === 'toggle') || f.kind === 'choose'));
}

function enterSafe(f, allow) {
  if (!f) return 'no row has focus';
  if (f.locked) return 'a locked row asks for the PIN and then acts';
  if (writeOk(f, allow)) return null;
  if (f.variant === 'category') return null;
  if (f.kind === 'page' || f.kind === 'settings') return null;
  if (f.kind === 'item' && f.variant === 'value') return null;
  if (f.kind === 'text' && allow.text) return null;
  if ((f.kind === 'style' || f.kind === 'theme') && allow.look) return null;
  return 'OK on a ' + (f.kind || '?') + '/' + (f.variant || '?') + ' row ("' + f.label + '") would change something';
}

// Whether `key` may be pressed now. `state` is { settings (the Settings part's probe), picker (the input picker's),
// systemUi (the system UI app in front, or '') }. Returns null, or why not. The suite never presses a key the
// guard refuses; the scenario fails there instead.
export function guard(key, state, allow = {}) {
  const k = KEYS[key];
  if (!k) return 'unknown key ' + key;
  if (k.never) return key + ' is never pressed: ' + k.never;
  if (['VOLUMEUP', 'VOLUMEDOWN', 'MUTE'].includes(key)) return allow.volume ? null : key + ' only in the volume scenarios';
  // Nothing is pressed on a state that cannot be trusted: a stale probe (the layer may be gone, and the key would
  // land on LG's UI or the app), or an LG overlay we do not know.
  if (state.fresh === false) return 'stale state, nothing is pressed: ' + state.stale;
  if (state.systemUi === 'unknown') return "an LG overlay we do not know is open, or systemUIManager's answer is unreadable: nothing is pressed";
  const s = state.settings || {};
  const own = s.menu && s.menu.open ? 'menu' : s.quick && s.quick.open ? 'quick' : null;
  const picker = !!(state.picker && state.picker.shown) || state.systemUi === 'com.webos.app.quickinputpicker';
  if (state.systemUi === 'com.webos.app.quicksettings') return "LG's Quick Settings is open: no key (it closes with closeByAppId)";
  if (picker) return 'the input picker is open: no key (it closes with closeByAppId)';
  if (key === 'QMENU') return null;
  if (!own) return 'nothing of ours is confirmed open: ' + key + ' would reach the app underneath';
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
