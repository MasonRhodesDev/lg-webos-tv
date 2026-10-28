// Checks QML and JS for what the TV's compositor (Qt 5.6.2, an ES5 engine) cannot run. The harness runs Qt 5.15,
// where all of this works, and the TV fails on it silently.
const fs = require('node:fs');
const path = require('node:path');

const inventory = require('../fixtures/tv-qml.json');

// The Qt modules our layer may use (the house rule; the TV has more, such as Controls 1, but they don't belong here).
const QT_ALLOWED = { 'QtQuick': true, 'QtQuick.Window': true, 'QtQml': true, 'QtGraphicalEffects': true };

// Types and properties that arrived after Qt 5.6.
const NEWER_TYPES = ['Shape', 'ShapePath', 'TableView', 'TreeView', 'PathAngleArc', 'PathPolyline', 'PathMultiline',
  'PathText', 'BoundaryRule', 'DragHandler', 'TapHandler', 'PointHandler', 'PinchHandler', 'WheelHandler',
  'HoverHandler', 'BorderImageMesh', 'DelegateChooser', 'DelegateChoice', 'ItemSelectionModel', 'FrameAnimation'];
const NEWER_PROPS = ['containmentMask', 'fontInfo', 'sourceClipRect', 'reuseItems', 'hintingPreference',
  'preferShaping', 'kerning', 'pixelAligned', 'renderTypeQuality', 'retainWhileLoading'];
const NEWER_CALLS = [
  [/\bQt\.callLater\s*\(/, 'Qt.callLater (Qt 5.8)'],
  [/\.(includes|startsWith|endsWith|padStart|padEnd|findIndex|find|flat|flatMap|codePointAt|normalize|trimStart|trimEnd)\s*\(/, 'ES2015+ method'],
  [/\bObject\.(assign|entries|values|is|setPrototypeOf|getOwnPropertySymbols|fromEntries)\b/, 'ES2015+ Object method'],
  [/\bArray\.(from|of)\b/, 'ES2015+ Array method'],
  [/\bNumber\.(isInteger|isNaN|isFinite|isSafeInteger|parseFloat|parseInt|EPSILON)\b/, 'ES2015+ Number member'],
  [/\bMath\.(trunc|sign|log2|log10|hypot|cbrt|fround|clz32|imul|expm1|log1p)\b/, 'ES2015+ Math method'],
  [/\b(Map|Set|WeakMap|WeakSet|Promise|Symbol|Proxy|Reflect)\b\s*[.(]/, 'ES2015+ global'],
  [/\bnew\s+(Map|Set|WeakMap|WeakSet|Promise|Proxy)\b/, 'ES2015+ global']
];
const KEYWORDS = { 'let': 'let', 'const': 'const', 'class': 'class', 'async': 'async', 'await': 'await', 'yield': 'yield' };

// Splits source into code, comment, string and regex tokens. Regex literals are told from division by what precedes
// them, as a JS parser would. Code tokens keep their line number.
function tokenize(src) {
  const out = [];
  let i = 0, line = 1, code = '', codeLine = 1, prev = '';
  const flush = () => { if (code) out.push({ kind: 'code', text: code, line: codeLine }); code = ''; codeLine = line; };
  const take = (kind, end) => {
    flush();
    const start = i, startLine = line;
    i = end;
    const text = src.slice(start, end);
    line += (text.match(/\n/g) || []).length;
    out.push({ kind, text, line: startLine });
    codeLine = line;
    prev = kind === 'regex' || kind === 'string' || kind === 'template' ? 'value' : prev;
  };
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { let e = src.indexOf('\n', i); take('comment', e < 0 ? src.length : e); continue; }
    if (c === '/' && n === '*') { let e = src.indexOf('*/', i + 2); take('comment', e < 0 ? src.length : e + 2); continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== c && (c === '`' || src[j] !== '\n')) j += src[j] === '\\' ? 2 : 1;
      take(c === '`' ? 'template' : 'string', j + 1);
      continue;
    }
    if (c === '/' && prev !== 'value') {
      let j = i + 1, inClass = false;
      while (j < src.length && src[j] !== '\n' && (inClass || src[j] !== '/')) {
        if (src[j] === '\\') j++;
        else if (src[j] === '[') inClass = true;
        else if (src[j] === ']') inClass = false;
        j++;
      }
      j++;
      while (/[a-z]/i.test(src[j] || '')) j++;
      take('regex', j);
      continue;
    }
    code += c;
    if (c === '\n') line++;
    if (/[\w$)\]]/.test(c)) {
      // A word that ends in a keyword that takes an expression (return x / y is rare; return /re/ is not).
      const w = /([\w$]+)$/.exec(code);
      prev = w && /^(return|typeof|case|do|else|in|of|new|delete|void|throw|instanceof)$/.test(w[1]) ? 'op' : 'value';
    } else if (!/\s/.test(c)) prev = c === '}' ? 'value' : 'op';
    i++;
  }
  flush();
  return out;
}

function lineOf(tok, text, at) { return tok.line + (text.slice(0, at).match(/\n/g) || []).length; }

// Problems in one file's source, as [{line, message}].
function checkSource(src, file, resolveLocal) {
  const problems = [];
  const report = (line, message) => problems.push({ line, message });
  const toks = tokenize(src);
  const code = toks.map((t) => t.kind === 'code' ? t.text : t.kind === 'comment' ? t.text.replace(/[^\n]/g, ' ')
                                                 : t.text.replace(/[^\n]/g, ' ').replace(/^ /, '"').replace(/ $/, '"')).join('');
  const lineAt = (at) => (code.slice(0, at).match(/\n/g) || []).length + 1;

  toks.forEach((t) => { if (t.kind === 'template') report(t.line, 'template literal (ES2015)'); });

  const scan = (re, message) => { let m; re.lastIndex = 0; while ((m = re.exec(code))) report(lineAt(m.index), typeof message === 'function' ? message(m) : message); };
  scan(/\b(let|const|class|async|await|yield)\b(?=\s*[\w$[{(])/g, (m) => '`' + KEYWORDS[m[1]] + '` (ES2015+)');
  scan(/=>/g, 'arrow function (ES2015)');
  scan(/\.\.\.(?=[\w$[({])/g, 'spread or rest (ES2015)');
  scan(/\?\.(?!\d)|\?\?/g, 'optional chaining or nullish coalescing (ES2020)');
  scan(/\*\*/g, 'exponent operator (ES2016)');
  scan(/\bfor\s*\(\s*(?:var\s+)?[\w$]+\s+of\b/g, 'for...of (ES2015)');
  scan(/\bvar\s*[[{]/g, 'destructuring (ES2015)');
  scan(/\bfunction\b\s*[\w$]*\s*\(([^)]*)\)/g, (m) => /=/.test(m[1]) ? 'default parameter (ES2015)' : null);
  NEWER_CALLS.forEach((c) => scan(new RegExp(c[0].source, 'g'), (m) => c[1] + ': ' + m[0].replace(/\s*\($/, '')));

  if (/\.qml$/.test(file)) {
    NEWER_TYPES.forEach((t) => scan(new RegExp('(^|[\\s;{}.])' + t + '\\s*\\{', 'g'), t + ' (Qt 5.7+)'));
    NEWER_PROPS.forEach((p) => scan(new RegExp('(^|[\\s;{.])' + p + '\\s*:', 'g'), p + ' (Qt 5.7+)'));
    scan(/^\s*required\s+property\b/gm, 'required property (Qt 5.15)');
    scan(/^\s*component\s+[A-Z]\w*\s*:/gm, 'inline component (Qt 5.15)');
    scan(/^\s*pragma\s+(?!Singleton\b)\w+/gm, 'pragma other than Singleton (Qt 5.15+)');
  }

  // Imports: QML `import`, and `.import` in a JS file.
  const importRe = /^\s*\.?import\s+(.*)$/gm;
  let m;
  while ((m = importRe.exec(src))) {
    const line = (src.slice(0, m.index + m[0].search(/\S/)).match(/\n/g) || []).length + 1;
    const spec = m[1].replace(/\s+\/\/.*$/, '').trim();
    const quoted = /^["']([^"']+)["']/.exec(spec);
    if (quoted) {
      const target = quoted[1];
      if (/^file:\/\//.test(target)) {
        const p = target.replace(/^file:\/\//, '').replace(/\/$/, '');
        const dir = path.posix.dirname(p), base = path.posix.basename(p);
        if (!(inventory.dirs[p] || inventory.modules[pathToModule(p)]) && !(inventory.dirs[dir] && inventory.dirs[dir].indexOf(base) >= 0))
          report(line, 'import "' + target + '": not on the TV');
      } else if (/^[a-z]+:/.test(target)) {
        report(line, 'import "' + target + '": only file:// imports of the TV\'s own files');
      } else if (!resolveLocal(target)) {
        report(line, 'import "' + target + '": not in the repo');
      }
      continue;
    }
    const mod = /^([\w.]+)\s+(\d+)\.(\d+)/.exec(spec);
    if (!mod) { report(line, 'import ' + spec + ': unreadable'); continue; }
    const name = mod[1], major = mod[2], minor = Number(mod[3]);
    if (resolveLocal(name.replace(/\./g, '/'), true)) continue;
    if (/^Qt/.test(name) && !QT_ALLOWED[name]) { report(line, 'import ' + name + ': not one of the Qt modules our layer uses (' + Object.keys(QT_ALLOWED).join(', ') + ')'); continue; }
    const known = inventory.modules[name];
    if (!known) { report(line, 'import ' + name + ': no such module on the TV'); continue; }
    if (known.versions && !(major in known.versions && minor <= known.versions[major]))
      report(line, 'import ' + name + ' ' + major + '.' + minor + ': the TV has ' +
        Object.keys(known.versions).map((k) => k + '.' + known.versions[k]).join(', ') + ' at most');
  }
  return problems.filter((p) => p.message).sort((a, b) => a.line - b.line);
}

function pathToModule(p) {
  return p.slice(inventory.root.length + 1).split('/').map((s) => s.replace(/\.\d+$/, '')).join('.');
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : /\.(qml|js)$/.test(e.name) ? [p] : [];
  });
}

// Every problem under a ui/ tree. Our modules (any directory under ui/ with a qmldir) resolve from the repo.
function checkTree(uiDir) {
  const out = [];
  for (const file of walk(uiDir)) {
    const resolveLocal = (target, isModule) => isModule
      ? fs.existsSync(path.join(uiDir, target, 'qmldir'))
      : fs.existsSync(path.resolve(path.dirname(file), target));
    for (const p of checkSource(fs.readFileSync(file, 'utf8'), file, resolveLocal))
      out.push(path.relative(uiDir, file) + ':' + p.line + ': ' + p.message);
  }
  return out;
}

module.exports = { tokenize, checkSource, checkTree };
