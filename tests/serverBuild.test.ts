import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,symlinkSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('emitted production generation handler loads without TypeScript source files',()=>{
  const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
  const temp=mkdtempSync(join(tmpdir(),'medexam-server-build-'));
  const out=join(temp,'compiled');
  const config=join(temp,'tsconfig.json');
  writeFileSync(config,JSON.stringify({extends:join(root,'tsconfig.json'),compilerOptions:{noEmit:false,rootDir:root,outDir:out,types:[],jsx:'react-jsx'},include:[join(root,'api/generate.ts')],exclude:[]}));
  execFileSync(process.execPath,[join(root,'node_modules/typescript/bin/tsc'),'--project',config],{cwd:root,stdio:'pipe'});
  writeFileSync(join(out,'package.json'),JSON.stringify({type:'module'}));
  symlinkSync(join(root,'node_modules'),join(out,'node_modules'),'dir');
  assert.match(readFileSync(join(out,'lib/server/generationVerifier.js'),'utf8'),/generationEvidence\.js/);
  const script="const {default:handler}=await import('./api/generate.js');let status;let body;await handler({method:'GET'},{status(n){status=n;return this},json(v){body=v;return this}});if(status!==503||!body.error.includes('preview'))throw new Error('Preview route did not load safely');console.log('compiled handler loaded');";
  const result=execFileSync(process.execPath,['--input-type=module','-e',script],{cwd:out,encoding:'utf8',env:{...process.env,VERCEL_ENV:'preview'}});
  assert.match(result,/compiled handler loaded/);
});
