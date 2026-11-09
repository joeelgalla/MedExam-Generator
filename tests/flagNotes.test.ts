import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {cleanFlagNote,flagNoteKey,MAX_FLAG_NOTE} from '../services/flagNotes.ts';

test('flag notes are trimmed, capped and keyed by attempt and question',()=>{
  assert.equal(cleanFlagNote('  unsure B vs C  '),'unsure B vs C');
  assert.equal(cleanFlagNote('x'.repeat(5000)).length,MAX_FLAG_NOTE);
  assert.equal(cleanFlagNote('   '),'','a blank note deletes instead of saving');
  assert.equal(flagNoteKey('attempt-1',4),'attempt-1:4');
});

test('the note button appears only on flagged questions in signed-in projects',async()=>{
  const bundle=await build({stdin:{contents:`
    import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server';
    import QuestionCard from './components/QuestionCard';
    import {FlagNoteProvider} from './components/FlagNotes';
    import {importProject,emptyExam} from './services/projectWorkflow';
    import {fixture} from './tests/fixtures';
    const p=importProject({name:'Synthetic notes',blueprint:[],referenceTotalQuestions:40,learningObjectivesFiles:[]},'local','local');
    p.activeExam={...emptyExam(),questions:fixture().questions,userAnswers:{},status:'active',examId:'demo-01',attemptId:'a1'};
    const store={load:async()=>[],save:async(r)=>r,remove:async()=>{}};
    const props={question:fixture().questions[0],index:0,selectedOption:null,onSelectOption:()=>{},onToggleFlag:()=>{},onDeepDive:async()=>'',onChatSend:async()=>'',isSubmitted:false};
    export const flagged=renderToStaticMarkup(<FlagNoteProvider project={p} store={store}><QuestionCard {...props} isFlagged /></FlagNoteProvider>);
    export const unflagged=renderToStaticMarkup(<FlagNoteProvider project={p} store={store}><QuestionCard {...props} isFlagged={false} /></FlagNoteProvider>);
    export const standalone=renderToStaticMarkup(<QuestionCard {...props} isFlagged privatePractice />);
  `,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'node',format:'cjs',write:false,packages:'external'});
  const module={exports:{} as Record<string,string>};
  new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  assert.match(module.exports.flagged,/Add note/);
  assert.doesNotMatch(module.exports.flagged,/Why did you flag this/,'the note box stays closed until asked for');
  assert.doesNotMatch(module.exports.unflagged,/Add note/);
  assert.doesNotMatch(module.exports.standalone,/Add note/);
});
