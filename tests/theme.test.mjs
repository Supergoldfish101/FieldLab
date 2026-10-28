import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync('dist/index.html','utf8').match(/<script>(try\{document\.documentElement\.dataset\.theme[\s\S]*?)<\/script>/)[1];
function theme(values={},blocked=false){const document={documentElement:{dataset:{}}};vm.runInNewContext(source,{document,localStorage:{getItem:key=>{if(blocked)throw Error();return values[key]??null;}}});return document.documentElement.dataset.theme;}
test('new and inherited light defaults migrate to dark before paint',()=>{assert.equal(theme(),'dark');assert.equal(theme({'fieldlab.theme':'light'}),'dark');assert.equal(theme({},true),'dark');});
test('explicit light and dark choices remain persistent',()=>{assert.equal(theme({'fieldlab.theme':'light','fieldlab.theme.choice':'explicit'}),'light');assert.equal(theme({'fieldlab.theme':'dark','fieldlab.theme.choice':'explicit'}),'dark');});
