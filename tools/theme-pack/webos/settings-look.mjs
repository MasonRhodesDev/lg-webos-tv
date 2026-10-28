#!/usr/bin/env node
// Adds a "Look" category to the stock webOS Settings app (com.palm.app.settings, webOS 4.5).
// Works on your own copy of the app: --app is the stock app directory, --out receives a patched copy.
// Every edit is an anchored replacement that must match exactly once, so a different firmware fails loudly.
import { copyFileSync, cpSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

function arg(name) {
  const i = process.argv.indexOf('--' + name);
  return i > 0 ? process.argv[i + 1] : undefined;
}
const app = arg('app'), out = arg('out');
if (!app || !out) {
  console.error('usage: settings-look.mjs --app STOCK_APP_DIR --out PATCHED_APP_DIR');
  process.exit(2);
}

function packs(kind) {
  const dir = join(here, '..', 'packs', kind);
  return readdirSync(dir).map((f) => require(join(dir, f))).map((p) => ({ id: p.id, name: p.name, description: p.description || '' }));
}
const look = { styles: packs('styles'), themes: packs('themes') };

function replaceOnce(src, anchor, replacement, what) {
  const n = src.split(anchor).length - 1;
  if (n !== 1) throw new Error(`${what}: expected the anchor once, found ${n}`);
  return src.replace(anchor, replacement);
}

// The Look panel, built from the app's own components: n(0) React, n(5) settings Panel, n(8) Scroller,
// n(3) $L, n(11) rows (e: RadioItem, f: SwitchItem). The choice is kept in this app's localStorage.
// Handlers hold only an id and read state when called: the row wrappers can keep an old handler, so a
// handler that closed over the state of an earlier render would write back a stale theme list.
const panel = `function __themepackLook(n){var r=n(0),s=n.n(r),p=n(5),h=n(8),c=n(3),v=n(11);var LOOK=${JSON.stringify(look)};var KEY="themepack.look";` +
  `var TP=window.__themepack;` +
  `function read(){var m=TP&&TP.current();if(m)return{style:m.look.style,themes:m.look.themes.slice()};try{var x=JSON.parse(window.localStorage.getItem(KEY));if(x&&x.style)return x}catch(e){}return{style:LOOK.styles[0].id,themes:[]}}` +
  `class LookPanel extends s.a.Component{constructor(e){super(e),this.state=read()}` +
  `componentDidMount(){var self=this;if(TP)this.stop=TP.onChange(function(m){self.setState({style:m.look.style,themes:m.look.themes.slice()})})}` +
  `componentWillUnmount(){if(this.stop)this.stop()}` +
  `update(f){this.setState(function(prev){var next=Object.assign({},prev,f(prev));try{window.localStorage.setItem(KEY,JSON.stringify(next))}catch(e){}if(TP)TP.setLook({style:next.style,themes:next.themes});return next})}` +
  `pickStyle(id){this.update(function(){return{style:id}})}` +
  `toggleTheme(id){this.update(function(prev){var t=prev.themes.slice(),i=t.indexOf(id);i>=0?t.splice(i,1):t.push(id);return{themes:t}})}` +
  `render(){var self=this,st=this.state,rows=[];` +
  `LOOK.styles.forEach(function(x){rows.push(s.a.createElement(v.e,{key:"s-"+x.id,selected:st.style===x.id,onToggle:function(){self.pickStyle(x.id)},"data-component-id":"look-style-"+x.id},Object(c.a)(x.name)))});` +
  `LOOK.themes.forEach(function(x){rows.push(s.a.createElement(v.f,{key:"t-"+x.id,selected:st.themes.indexOf(x.id)>=0,helpTitle:x.name,helpString:x.description,` +
  `onToggle:function(){self.toggleTheme(x.id)},"data-component-id":"look-theme-"+x.id},Object(c.a)(x.name)))});` +
  `return s.a.createElement(p.a,Object.assign({},this.props,{autoFocus:"last-focused",title:Object(c.a)("Look"),spotlightId:"lookPanel"}),s.a.createElement(h.a,{},rows))}}` +
  `return LookPanel}`;

cpSync(app, out, { recursive: true });
// Record which stock main.js this was built from, so the TV can refuse a patch made for other firmware.
writeFileSync(join(out, '.stock-main.md5'), createHash('md5').update(readFileSync(join(app, 'main.js'))).digest('hex') + '\n');
const mainPath = join(out, 'main.js');
let js = readFileSync(mainPath, 'utf8');

js = replaceOnce(js, 'const M=Object(u.a)({modal:!0,onCancel:"closeOsd"},v.a)', panel + 'const M=Object(u.a)({modal:!0,onCancel:"closeOsd"},v.a)', 'panel definition');
js = replaceOnce(js, 'Safety:m.a,Accessibility:y.a};', 'Safety:m.a,Look:__themepackLook(n),Accessibility:y.a};', 'category to panel map');
js = replaceOnce(js, 'const I=["Picture","Sound","Channels","Network","General","Safety","Accessibility"]',
  'const I=["Picture","Sound","Channels","Network","General","Safety","Look","Accessibility"]', 'category order');
js = replaceOnce(js, ',C(M,{icon:"\\ua5a8",target:"Accessibility",',
  ',C(M,{icon:"\\ua5a1",target:"Look",onSelect:this.props.setPath,selected:"Look"===this.props.category,"data-component-id":"look",' +
  'onFocus:this.handleFocus,onBlur:this.handleBlur,hideDivider:this.handleDivider("Look",I),opaque:this.props.opaque},void 0,Object(u.a)("Look"))' +
  ',C(M,{icon:"\\ua5a8",target:"Accessibility",', 'nav entry');
writeFileSync(mainPath, js);

// Colours: the focus fill and the text on it become variables whose defaults are the stock values, so a
// missing Look service leaves the stock look. Text colour is only remapped inside rules that paint the focus fill.
const cssPath = join(out, 'main.css');
const css = readFileSync(cssPath, 'utf8').replace(/[^{}]*\{[^{}]*\}/g, (rule) => {
  if (!/#cf0652/i.test(rule)) return rule;
  if (/background(-color)?:\s*#cf0652/i.test(rule)) rule = rule.replace(/(^|[;{])color:\s*#fff(fff)?\b/gi, '$1color:var(--tp-focus-ink)');
  return rule.replace(/#cf0652/gi, 'var(--tp-focus)');
});
writeFileSync(cssPath, ':root{--tp-focus:#cf0652;--tp-focus-ink:#fff}' + css);
copyFileSync(join(here, 'look-bridge.js'), join(out, 'look-bridge.js'));

// Each page carries a prerendered nav that shows until the app has loaded. Copy its Safety entry into a Look
// entry before Accessibility, so Look is there from the first frame. Labels are localised, so this works from
// attributes; a page whose markup differs is left alone and gets Look once the app renders.
const NAV_ITEM = '<div class="_2iOITikgMzAvlEq-AUTT9h"><div class="_14RWAOjvtowMsc2Wcmvh3q"><div data-component-id="';
let prerendered = 0;
function prerenderLook(page, f) {
  const safety = page.indexOf(NAV_ITEM + 'safety"');
  const access = page.indexOf(NAV_ITEM + 'accessibility"');
  if (safety < 0 || access < safety || page.indexOf(NAV_ITEM + 'look"') >= 0) {
    console.warn(f + ': prerendered nav not recognised, Look appears after load');
    return page;
  }
  const look = page.slice(safety, access)
    .replace('data-component-id="safety"', 'data-component-id="look"')
    .replace(/data-webos-voice-label="[^"]*"/, 'data-webos-voice-label="Look"')
    .replace('data-target-id="Safety"', 'data-target-id="Look"')
    .replace('data-spotlight-id="Safety"', 'data-spotlight-id="Look"')
    .replace('\ua5a6', '\ua5a1')
    .replace(/(<div class="_2CJCOEVTp8ddl02f4GdNDV[^"]*">)[^<]*(<\/div>)/, '$1Look$2');
  prerendered++;
  return page.slice(0, access) + look + page.slice(access);
}

// The app normally runs from a V8 snapshot of the stock main.js. Make every page load main.js instead.
let pages = 0;
for (const f of readdirSync(out).filter((f) => /^index(\..+)?\.html$/.test(f))) {
  const p = join(out, f);
  let page = replaceOnce(readFileSync(p, 'utf8'), '"undefined"==typeof App', '!0', f);
  page = replaceOnce(page, '</head>', '<script src="look-bridge.js"></script></head>', f + ' head');
  page = prerenderLook(page, f);
  writeFileSync(p, page);
  pages++;
}
console.log(`patched main.js, main.css and ${pages} pages (${prerendered} with Look prerendered); Look lists ${look.styles.length} styles and ${look.themes.length} themes`);
