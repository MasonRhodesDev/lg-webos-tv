#!/usr/bin/env node
// Adds a "Look" category to the stock webOS Settings app (com.palm.app.settings, webOS 4.5).
// Works on your own copy of the app: --app is the stock app directory, --out receives a patched copy.
// Every edit is an anchored replacement that must match exactly once, so a different firmware fails loudly.
import { cpSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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
const panel = `function __themepackLook(n){var r=n(0),s=n.n(r),p=n(5),h=n(8),c=n(3),v=n(11);var LOOK=${JSON.stringify(look)};var KEY="themepack.look";` +
  `function read(){try{var x=JSON.parse(window.localStorage.getItem(KEY));if(x&&x.style)return x}catch(e){}return{style:LOOK.styles[0].id,themes:[]}}` +
  `class LookPanel extends s.a.Component{constructor(e){super(e),this.state=read()}` +
  `save(e){var t=Object.assign({},this.state,e);this.setState(t);try{window.localStorage.setItem(KEY,JSON.stringify(t))}catch(e){}}` +
  `render(){var self=this,st=this.state,rows=[];` +
  `LOOK.styles.forEach(function(x){rows.push(s.a.createElement(v.e,{key:"s-"+x.id,selected:st.style===x.id,onToggle:function(){self.save({style:x.id})},"data-component-id":"look-style-"+x.id},Object(c.a)(x.name)))});` +
  `LOOK.themes.forEach(function(x){rows.push(s.a.createElement(v.f,{key:"t-"+x.id,selected:st.themes.indexOf(x.id)>=0,helpTitle:x.name,helpString:x.description,` +
  `onToggle:function(){var t=st.themes.slice(),i=t.indexOf(x.id);i>=0?t.splice(i,1):t.push(x.id);self.save({themes:t})},"data-component-id":"look-theme-"+x.id},Object(c.a)(x.name)))});` +
  `return s.a.createElement(p.a,Object.assign({},this.props,{autoFocus:"last-focused",title:Object(c.a)("Look"),spotlightId:"lookPanel"}),s.a.createElement(h.a,{},rows))}}` +
  `return LookPanel}`;

cpSync(app, out, { recursive: true });
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

// The app normally runs from a V8 snapshot of the stock main.js. Make every page load main.js instead.
let pages = 0;
for (const f of readdirSync(out).filter((f) => /^index(\..+)?\.html$/.test(f))) {
  const p = join(out, f);
  writeFileSync(p, replaceOnce(readFileSync(p, 'utf8'), '"undefined"==typeof App', '!0', f));
  pages++;
}
console.log(`patched main.js and ${pages} pages; Look lists ${look.styles.length} styles and ${look.themes.length} themes`);
