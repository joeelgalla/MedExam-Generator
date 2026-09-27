import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
test('device file import blocks OCR and transcription before reading or sending media',async()=>{
 const bundle=await build({entryPoints:['services/fileService.ts'],bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'no-model',setup(b){b.onResolve({filter:/geminiService/},args=>({path:args.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const extractTextFromImage=()=>{throw new Error("MODEL CALLED")};export const transcribeMedia=extractTextFromImage;',loader:'ts'}));}}]});
 const module={exports:{} as any};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 for(const ext of ['png','jpg','heic','mp3','mp4']) await assert.rejects(module.exports.readFileContent(new File(['synthetic'],`fixture.${ext}`),false),/Nothing was sent/);
 assert.equal((await module.exports.readFileContent(new File(['Local text'], 'fixture.txt'),false)).content,'Local text');
});
