(function(root){
'use strict';
const defaults=()=>({schemaVersion:1,completedLessons:[],homework:{},attempts:[],wrongQuestionIds:[],firstStudied:{},reviewSchedule:[],activeSession:null,furigana:true,plan:'6'});
function today(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
function addDays(day,n){const d=new Date(day+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function grade(questions,answers,audio,mode){
 const answered=questions.filter(q=>Number.isInteger(answers[q.id])&&answers[q.id]>=0&&answers[q.id]<q.options.length);
 const scored=questions.filter(q=>q.skill!=='listening'||audio[q.id]==='played');
 const correct=scored.filter(q=>answers[q.id]===q.answerIndex),listening=questions.filter(q=>q.skill==='listening');
 const lc=correct.filter(q=>q.skill==='listening').length,complete=answered.length===questions.length&&listening.every(q=>audio[q.id]==='played');
 return {total:questions.length,answered:answered.length,correct:correct.length,accuracy:questions.length?correct.length/questions.length:0,
  listeningTotal:listening.length,listeningCorrect:lc,listeningAccuracy:listening.length?lc/listening.length:null,complete,
  passed:mode!=='review'&&complete&&correct.length/questions.length>=.8&&(!listening.length||lc/listening.length>=.6),
  correctIds:correct.map(q=>q.id),wrongIds:scored.filter(q=>Number.isInteger(answers[q.id])&&answers[q.id]!==q.answerIndex).map(q=>q.id),
  unavailableIds:listening.filter(q=>audio[q.id]!=='played').map(q=>q.id)};
}
function gradeMock(questions,answers,audio,mode,submittedSections=[]){
 const r=grade(questions,answers,audio,mode),knowledge=questions.filter(q=>q.skill!=='listening');
 const kc=knowledge.filter(q=>answers[q.id]===q.answerIndex).length;
 const knowledgeEstimate=knowledge.length?120*kc/knowledge.length:0,listeningEstimate=r.listeningTotal?60*r.listeningCorrect/r.listeningTotal:0;
 const totalEstimate=knowledgeEstimate+listeningEstimate;
 const allSections=['vocabulary','grammar-reading','listening'].every(id=>submittedSections.includes(id));
 const complete=r.complete&&allSections&&knowledge.length>0&&r.listeningTotal>0;
 return {...r,complete,knowledgeCorrect:kc,knowledgeTotal:knowledge.length,knowledgeEstimate,listeningEstimate,totalEstimate,
  passed:mode!=='review'&&complete&&knowledgeEstimate>=38&&listeningEstimate>=19&&totalEstimate>=80,label:'模考估分，非官方尺度分數'};
}
function mockReady(ex){
 const listening=Array.isArray(ex?.questions)?ex.questions.filter(q=>q.skill==='listening'):[];
 const browserTts=ex?.audioStatus==='browser-tts'&&listening.every(q=>q.audio?.delivery==='tts'&&typeof q.audio.scriptJa==='string'&&q.audio.scriptJa.length>0);
 const fixedFiles=ex?.audioStatus==='ready'&&listening.every(q=>q.audio?.delivery==='file'&&typeof q.audio.src==='string'&&q.audio.src.length>0);
 return /^final-[AB]$/.test(ex?.id)&&ex.available===true&&ex.status==='reviewed'&&Array.isArray(ex.questions)&&ex.questions.length===67&&ex.sections?.map(s=>s.id).join(',')==='vocabulary,grammar-reading,listening'&&listening.length===24&&(browserTts||fixedFiles);
}
function validateState(value,registry,lessonIds,knowledgeIds){
 const fail=()=>{throw Error('備份格式或資料版本不相容。');};
 if(!value||value.schemaVersion!==1)fail();
 const ids=(list,allowed)=>Array.isArray(list)&&list.every(x=>typeof x==='string'&&allowed.has(x))&&new Set(list).size===list.length;
 const lids=new Set(lessonIds),kids=new Set(knowledgeIds),qids=new Set(Object.keys(registry));
 if(!ids(value.completedLessons,lids)||!ids(value.wrongQuestionIds,qids)||!Array.isArray(value.attempts)||!Array.isArray(value.reviewSchedule))fail();
 if(!value.homework||typeof value.homework!=='object'||!value.firstStudied||typeof value.firstStudied!=='object')fail();
 const validDate=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!isNaN(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
 const answerMap=x=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.entries(x).every(([id,a])=>qids.has(id)&&Number.isInteger(a)&&a>=0&&a<registry[id].options.length);
 const audioMap=x=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.entries(x).every(([id,a])=>qids.has(id)&&registry[id].skill==='listening'&&['played','unavailable'].includes(a));
 const groupValid=s=>{
  if(s.key==='wrong')return s.mode==='practice'&&s.questionIds.length>0;
  const isExam=/^(M[1-6]|final-[AB])$/.test(s.key)&&Object.keys(registry).some(id=>id.startsWith(s.key+'-Q-'));
  if(isExam&&!['exam','review'].includes(s.mode))return false;
  if(!isExam&&(!lids.has(s.key)||!['practice','exit'].includes(s.mode)))return false;
  const prefix=isExam?s.key+'-Q-':s.key+(s.mode==='exit'?'-EXIT-':'-Q-');
  const expected=Object.keys(registry).filter(id=>id.startsWith(prefix));
  if(/^final-/.test(s.key)){
   const sections=['vocabulary','grammar-reading','listening'];
   if(!Array.isArray(s.submittedSections)||s.submittedSections.some((x,i)=>x!==sections[i])||s.submittedSections.length>3)return false;
   if(s===value.activeSession){if(!Number.isInteger(s.section)||s.section<0||s.section>2||s.submittedSections.length!==s.section)return false;}
   else if(s.mode==='exam'&&s.submittedSections.length!==3)return false;
   if(s.mode==='review'&&s.submittedSections.length)return false;
  }
  return s.questionIds.length===expected.length&&expected.every(id=>s.questionIds.includes(id));
 };
 if(!Object.entries(value.firstStudied).every(([id,d])=>lids.has(id)&&validDate(d)))fail();
 if(!Object.entries(value.homework).every(([id,checks])=>lids.has(id)&&Array.isArray(checks)&&checks.every(x=>Number.isInteger(x)&&x>=0&&x<30)))fail();
 const reviewKeys=[];
 for(const r of value.reviewSchedule){if(!r||!kids.has(r.knowledgeId)||!validDate(r.due)||typeof r.done!=='boolean')fail();reviewKeys.push(r.knowledgeId+':'+r.due);}
 if(new Set(reviewKeys).size!==reviewKeys.length)fail();
 for(const a of value.attempts){if(!a||!['practice','exit','exam','review'].includes(a.mode)||typeof a.key!=='string'||!ids(a.questionIds,qids)||!answerMap(a.answers)||!audioMap(a.audio)||!Number.isFinite(a.timestamp)||a.timestamp<=0||!groupValid(a)||!Object.keys(a.answers).every(id=>a.questionIds.includes(id))||!Object.keys(a.audio).every(id=>a.questionIds.includes(id)))fail();}
 if(value.activeSession){const s=value.activeSession;
  if(!['practice','exit','exam','review'].includes(s.mode)||typeof s.key!=='string'||!ids(s.questionIds,qids)||!s.questionIds.length||!answerMap(s.answers)||!audioMap(s.audio)||!(String(s.key).startsWith('final-')?[0,1,2]:[0,1]).includes(s.section)||!(s.deadline===null||(Number.isFinite(s.deadline)&&s.deadline>0)))fail();
  if(!groupValid(s)||!Object.keys(s.answers).every(id=>s.questionIds.includes(id))||!Object.keys(s.audio).every(id=>s.questionIds.includes(id)))fail();
 }
 return {...defaults(),...value,furigana:value.furigana!==false,plan:value.plan==='4'?'4':'6'};
}
const api={defaults,today,addDays,grade,gradeMock,mockReady,validateState};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.N5Core=api;
})(typeof globalThis!=='undefined'?globalThis:this);
