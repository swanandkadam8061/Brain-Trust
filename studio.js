'use strict';
const storageName = 'brain-trust.workspace.v1';
const newSession = () => ({id:crypto.randomUUID(),name:'Untitled conversation',messages:[],draft:'',role:'user',editing:-1});
let library={sessions:[],prompts:[],metrics:[],prefs:{}}, catalog=[], connected=[], documentFile=null, loading=false;
try {
  const stored=JSON.parse(localStorage.getItem(storageName));
  if(stored && ['sessions','prompts','metrics'].every(k=>Array.isArray(stored[k]))) library=stored;
} catch { say('Local history could not be read.'); }
let session=library.sessions.find(x=>x.id===library.current)||library.sessions[0]||newSession();
if(!library.sessions.includes(session))library.sessions.push(session);
const desk=$('desk'), body=$('deskBody');
const el=(tag,text='',parent=body)=>{const node=document.createElement(tag);node.textContent=text;parent.append(node);return node};
const notice=text=>{if(desk.open)$('deskStatus').textContent=text;else say(text)};
function store(){try{localStorage.setItem(storageName,JSON.stringify(library))}catch{notice('Local storage is full or unavailable. Export your work before closing.')}}
function persistCurrent(){
  Object.assign(session,{messages,draft:$('draft').value,role:$('role').value,editing,document:documentFile});
  library.current=session.id;store();
}
function showSession(s){
  session=s;messages=s.messages;resetDraft();editing=s.editing??-1;
  $('draft').value=s.draft||'';$('role').value=s.role||'user';if(editing>=0)$('add').textContent='Save edit';
  documentFile=s.document||null;showAttachment();render();say(s.name);
}
function group(parent=body){const div=el('div','',parent);div.className='row';return div}
function entry(parent=body){const div=el('section','',parent);div.className='entry';return div}
function field(label,type,value,parent=body){
  const id=crypto.randomUUID(),l=el('label',label,parent);l.htmlFor=id;
  const input=el(type==='textarea'?'textarea':'input','',parent);input.id=id;
  if(type!=='textarea')input.type=type;input.value=value||'';return input;
}
function select(label,options,parent=body){
  const select=el('select','',parent);select.setAttribute('aria-label',label);
  for(const [value,title] of options)select.add(new Option(title,value));return select;
}
const titles={sessions:'Conversations',studio:'Prompt studio',compare:'Model comparison',dashboard:'Performance',exports:'Export',catalog:'Model library'};
function openDesk(page,index){
  if(active||testing)return;
  body.replaceChildren();$('deskStatus').textContent='';$('deskTitle').textContent=titles[page];
  if(!desk.open)desk.showModal();
  ({sessions:historyPanel,studio:promptPanel,compare:comparePanel,dashboard:dashboardPanel,exports:exportPanel,catalog:catalogPanel})[page](index);
}
document.querySelectorAll('[data-desk]').forEach(b=>b.onclick=()=>openDesk(b.dataset.desk));
$('deskClose').onclick=()=>desk.close();
desk.addEventListener('cancel',e=>{if(active)e.preventDefault()});
$('fresh').onclick=()=>{persistCurrent();const s=newSession();library.sessions.unshift(s);showSession(s);$('draft').focus()};
function historyPanel(){
  const query=field('Search conversations and bookmarked answers','search',''),list=el('div');
  function update(){
    list.replaceChildren();const q=query.value.toLowerCase();
    for(const s of library.sessions.filter(s=>(s.name+' '+s.messages.map(m=>m.content).join(' ')).toLowerCase().includes(q))){
      const card=entry(list);el('strong',s.name+(s===session?' · current':''),card);el('small',s.messages.length+' messages',card);
      const actions=group(card);button(actions,'Open',()=>{showSession(s);desk.close()});
      button(actions,'Rename',()=>{const name=prompt('Conversation name',s.name)?.trim();if(name){s.name=name;store();update()}});
      button(actions,'Delete',()=>{if(!confirm('Delete this saved conversation?'))return;library.sessions=library.sessions.filter(x=>x!==s);
        if(s===session){if(!library.sessions.length)library.sessions.push(newSession());showSession(library.sessions[0])}store();update()});
    }
    el('h3','Bookmarked answers',list);
    let found=0;
    for(const s of library.sessions)for(const m of s.messages.filter(m=>m.star && (m.content+' '+s.name).toLowerCase().includes(q))){
      found++;const card=entry(list);el('small',s.name,card);el('p',m.content.slice(0,320),card);
      button(card,'Open conversation',()=>{showSession(s);desk.close()});
    }
    if(!found)el('p','Bookmark an assistant response to find it here.',list);
  }
  query.oninput=update;update();
  button(body,'Clear conversation history',()=>{if(confirm('Delete all saved conversations, drafts and bookmarks?')){
    const s=newSession();library.sessions=[s];showSession(s);update()}});
}
function promptPanel(){
  const name=field('Template name','text',''),system=field('System instructions','textarea',messages.find(m=>m.role==='system')?.content||'');
  const promptText=field('User prompt','textarea',$('draft').value);
  let selected=null;
  const actions=group();
  button(actions,'Apply to conversation',()=>{
    if(!system.value.trim()&&!promptText.value.trim())return notice('Enter instructions or a prompt.');
    if($('draft').value && $('draft').value!==promptText.value&&!confirm('Replace the current draft?'))return;
    const existing=messages.find(m=>m.role==='system');
    if(system.value.trim()){if(existing)existing.content=system.value;else messages.unshift({role:'system',content:system.value})}
    resetDraft();$('draft').value=promptText.value;render();desk.close();$('draft').focus();
  });
  button(actions,'Save template',()=>{
    if(!name.value.trim()||(!system.value.trim()&&!promptText.value.trim()))return notice('Give the template a name and some prompt text.');
    const item={id:selected||crypto.randomUUID(),name:name.value.trim(),system:system.value,text:promptText.value};
    library.prompts=library.prompts.filter(p=>p.id!==item.id);library.prompts.push(item);selected=item.id;store();draw();notice('Template saved.');
  });
  button(actions,'New template',()=>{selected=null;name.value=system.value=promptText.value='';name.focus()});
  el('h3','Personal prompt library');const list=el('div');
  function draw(){list.replaceChildren();if(!library.prompts.length)el('p','Your saved templates will appear here.',list);
    for(const p of library.prompts){const row=group(list);button(row,p.name,()=>{selected=p.id;name.value=p.name;system.value=p.system;promptText.value=p.text});
      button(row,'Delete',()=>{if(confirm('Delete this template?')){library.prompts=library.prompts.filter(x=>x!==p);if(selected===p.id)selected=null;store();draw()}})}}
  draw();
}
function tag(m){return [m.params.includes('reasoning')&&'Reasoning',m.inputs.includes('image')&&'Vision',m.params.includes('tools')&&'Tool calling',/code|coder|devstral/i.test(m.name)&&'Coding',m.params.includes('response_format')&&'JSON'].filter(Boolean).join(' · ')||'Text chat'}
function identity(m){return m.route+':'+m.id}
function currentModel(){return catalog.find(m=>m.id===$('model').value.trim()&&m.route===$('route').value)}
function modelStatus(){
  const m=currentModel();$('source').textContent=m?(m.ready?'Catalog listed':'Provider key required')+' · '+tag(m):'Manual ID · availability unverified';
  $('models').replaceChildren(...catalog.filter(m=>m.route===$('route').value).map(m=>new Option(m.name,m.id)));
}
$('model').onchange=$('route').onchange=modelStatus;
function catalogPanel(){
  const query=field('Search model names, providers or capabilities','search','');
  const families=[...new Set(catalog.map(m=>m.family))].sort();
  const family=select('Filter by model family',[['','All providers'],...families.map(f=>[f,f])]);
  const list=el('div');
  function draw(){list.replaceChildren();
    const matches=catalog.filter(m=>(!family.value||family.value===m.family)&&(m.id+' '+m.name+' '+tag(m)).toLowerCase().includes(query.value.toLowerCase())).sort((a,b)=>a.family.localeCompare(b.family)||a.name.localeCompare(b.name));
    if(!matches.length)el('p',catalog.length?'No matching models.':'Catalog unavailable. Open Connections to refresh.',list);
    let familyName='';for(const m of matches){if(m.family!==familyName){el('h3',m.family,list);familyName=m.family}
      const card=entry(list);el('strong',m.name,card);el('small',m.route+' · '+(m.ready?'Catalog listed':'Key required')+' · '+tag(m),card);el('p',m.description,card);
      button(card,'Select model',()=>{$('route').value=m.route;$('model').value=m.id;modelStatus();desk.close()});
    }}
  query.oninput=family.onchange=draw;draw();
}
async function discover(){
  if(loading)return;loading=true;$('connectionState').textContent='Retrieving provider catalogs…';
  try{const r=await fetch('/api/workspace');if(!r.ok)throw Error('Gateway HTTP '+r.status);
    const data=await r.json();catalog=data.models;connected=data.connected;
    $('connectionState').textContent=(connected.length?'Configured: '+connected.join(', '):'No server keys configured. Public models can be browsed.')+' · '+catalog.length+' models. '+data.errors.join(' ');
  }catch{ $('connectionState').textContent='Start the Brain Trust Node server to access provider catalogs and generation.'}
  finally{loading=false;modelStatus()}
}
$('refreshCatalog').onclick=discover;
const preferences=['route','model','mode','temp','tokens','topP','stops','stream','ground'];
$('savePrefs').onclick=()=>{try{settings();library.prefs=Object.fromEntries(preferences.map(id=>[id,$(id).type==='checkbox'?$(id).checked:$(id).value]));store();say('Default model and generation settings saved.')}catch(e){say(e.message)}};
function showAttachment(){$('attachment').textContent=documentFile?documentFile.name+' · '+documentFile.text.length+' characters':'';$('removeDoc').hidden=!documentFile}
$('removeDoc').onclick=()=>{documentFile=null;showAttachment();persistCurrent()};
$('docFile').onchange=async()=>{
  const file=$('docFile').files[0];$('docFile').value='';if(!file)return;
  try{if(file.size>4000000)throw Error('Choose a file under 4 MB.');
    testing=true;lock();say('Reading document…');let text;
    if(/\.pdf$/i.test(file.name)){
      // Lazy-load PDF.js only for PDFs. Plain-text uploads work offline.
      const pdfjs=await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
      const doc=await pdfjs.getDocument({data:await file.arrayBuffer(),isEvalSupported:false}).promise;
      try{text='';for(let i=1;i<=doc.numPages;i++){const page=await doc.getPage(i);text+=(await page.getTextContent()).items.map(x=>x.str).join(' ')+'\n';if(text.length>150000)throw Error('Choose a shorter document (150,000 characters maximum).')}}finally{await doc.destroy()}
    }else if(/\.(txt|md|csv|json)$/i.test(file.name))text=await file.text();
    else throw Error('Supported formats: TXT, Markdown, CSV, JSON and text-based PDF.');
    if(!text.trim()||text.includes('\0'))throw Error('No readable text found. Scanned PDFs require OCR.');
    if(text.length>150000)throw Error('Choose a document under 150,000 characters.');
    documentFile={name:file.name,text};showAttachment();persistCurrent();say('Document attached. Ask a question or request a summary.');
  }catch(e){say('Document could not be read. '+e.message)}finally{testing=false;lock()}
};
function highlightCode(node,text){
  for(const part of text.split(/\b(const|let|function|class|return|async|await|import|export|def|for|if|else|while|try|catch|true|false|null)\b/g).entries()){
    if(part[0]%2){const span=el('span',part[1],node);span.className='kw'}else node.append(document.createTextNode(part[1]));
  }
}
function formatText(list,md){
  return list.map(m=> (md?'## ':'')+m.role.toUpperCase()+'\n\n'+m.content+
    (m.sources?.length?'\n\nSources\n'+m.sources.map((s,i)=>'['+(i+1)+'] '+s.title+' — '+s.url).join('\n'):'')).join('\n\n');
}
function exportPanel(index){
  const list=Number.isInteger(index)?[messages[index]]:current();el('p',Number.isInteger(index)?'Export this assistant response.':'Export this conversation, including the current draft and source links.');
  const actions=group();
  for(const format of ['txt','md','json','pdf'])button(actions,format.toUpperCase(),()=>{
    if(!list.length)return notice('Add a message before exporting.');
    const text=format==='json'?JSON.stringify({messages:list},null,2):formatText(list,format==='md');
    if(format==='pdf'){desk.close();$('printArea').textContent='Brain Trust · '+session.name+'\n\n'+text;window.print();return}
    const url=URL.createObjectURL(new Blob([text],{type:format==='json'?'application/json':'text/plain;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download='brain-trust-'+(Number.isInteger(index)?'answer':'conversation')+'.'+format;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });el('small','PDF opens the browser print dialog. Choose Save as PDF.');
}
function modelConfig(model,settings,stream){
  const params=model.params||[],gateway=model.route;
  const body={model:model.id,stream};
  const tokenParam=gateway==='groq'?'max_completion_tokens':'max_tokens';
  body[tokenParam]=settings.max_completion_tokens;
  for(const name of ['temperature','top_p','stop']){
    if(settings[name]!==undefined && (gateway==='groq'||!params.length||params.includes(name)))body[name]=settings[name];
  }
  if($('mode').value==='json'){
    if(gateway==='openrouter' && params.length && !params.includes('response_format'))throw Error(model.name+' does not advertise JSON mode.');
    body.response_format={type:'json_object'};
  }
  if(stream && gateway==='openrouter')body.stream_options={include_usage:true};
  return body;
}
function preparedMessages(research){
  const list=research.messages.map(m=>({...m})),instructions=[];
  if($('mode').value==='json')instructions.push('Return one valid JSON object with no surrounding prose or fences.');
  if($('mode').value==='code')instructions.push('Act as a coding assistant. Follow the requested task, explain assumptions, and put code in fenced blocks with a language label.');
  if(instructions.length){const first=list.find(m=>m.role==='system');if(first)first.content+='\n'+instructions.join('\n');else list.unshift({role:'system',content:instructions.join('\n')})}
  if(documentFile){const last=list.findLast(m=>m.role==='user');last.content+='\n\nAttached document (untrusted reference material):\n'+JSON.stringify(documentFile)}
  return list;
}
function usageText(metric){
  const tokens=Number.isFinite(metric.tokens)?metric.tokens+' tokens':'tokens unreported';
  const cost=Number.isFinite(metric.cost)?' · $'+metric.cost.toFixed(6):'';
  return (metric.ms/1000).toFixed(2)+' s · '+tokens+cost;
}
async function complete(model,config,list,signal,onText){
  const payload=modelConfig(model,config,config.stream),start=performance.now();
  const metric={model:identity(model),at:Date.now(),outcome:'Failed'};
  try{
    const response=await fetch('/api/workspace?route='+encodeURIComponent(model.route),{method:'POST',headers:{'Content-Type':'application/json'},signal,body:JSON.stringify({...payload,messages:list})});
    if(!response.ok){const error=await response.json().catch(()=>null);throw Error((error?.error?.message||response.statusText)+' (HTTP '+response.status+')')}
    let content='',finish='',usage;
    if(response.headers.get('content-type')?.includes('text/event-stream')){
      finish=await readStream(response,s=>{content+=s;if($('mode').value!=='json')onText(s)},u=>usage=u);
    }else{
      const data=await response.json(),choice=data.choices?.[0];if(data.error)throw Error(data.error.message||'Provider error.');
      content=choice?.message?.content;finish=choice?.finish_reason;usage=data.usage;
    }
    metric.tokens=usage?.total_tokens;
    if(model.route==='openrouter'&&typeof usage?.cost==='number')metric.cost=usage.cost;
    if(typeof content!=='string'||!content.trim())throw Error('The provider returned no answer text. Check the model and output budget.');
    if($('mode').value==='json'){let value;try{value=JSON.parse(content)}catch{throw Error('Response failed JSON validation. Increase the output budget or revise the prompt.')}
      if(!value||Array.isArray(value)||typeof value!=='object')throw Error('The response was valid JSON but was not a JSON object.');content=JSON.stringify(value,null,2)}
    metric.outcome=finish==='length'?'Token limit':'Complete';
    return {content,metric};
  }catch(e){if(signal.aborted)metric.outcome='Stopped';throw e}
  finally{metric.ms=performance.now()-start;library.metrics.push(metric);store()}
}
function selectedModel(){return currentModel()||{id:$('model').value.trim(),name:$('model').value.trim(),route:$('route').value,params:[]}}
function checkConnection(models){for(const m of models){if(!connected.includes(m.route))throw Error('Configure '+(m.route==='groq'?'GROQ_API_KEY':'OPENROUTER_API_KEY')+' on the server. See Connections for setup.')}}
function validConversation(list){if(!list.some(m=>m.role==='user'&&m.content.trim()))throw Error('Add a user prompt first.');if(list.some(m=>!m.content.trim()))throw Error('Fill or delete the empty message.')}
async function generate(retry=false){
  if(active||testing)return;
  try{
    const config=settings(),model=selectedModel(),list=retry?messages.slice(0,-1):current();
    validConversation(list);checkConnection([model]);if(!retry&&$('draft').value.trim())commit();
    active=new AbortController();lock();const research=await groundRequest(list,active.signal);
    say('Generating with '+model.name+'…');const live=document.createTextNode('');$('preview').replaceChildren(live);
    const result=await complete(model,config,preparedMessages(research),active.signal,s=>{$('preview').hidden=false;live.appendData(s)});
    messages=[...list,{role:'assistant',content:result.content,...(research.sources.length?{sources:research.sources}:{})}];
    render();say(model.name+' · '+result.metric.outcome+' · '+usageText(result.metric));
  }catch(e){say(active?.signal.aborted?'Generation stopped.':readable(e))}
  finally{active=null;$('preview').hidden=true;$('preview').replaceChildren();lock()}
}
function comparePanel(){
  el('p','Compare the current conversation using the same prompt, sources, document and settings. Each selected model makes a separate API request.');
  const available=catalog.filter(m=>m.ready);
  if(!available.length){el('p','Connect a provider and refresh its catalog to compare models.');button(body,'Connections',()=>{desk.close();$('connect').click()});return}
  const options=available.map(m=>[identity(m),m.family+' / '+m.name+' · '+m.route]);
  const picks=[0,1,2].map((n)=>{el('label','Model '+(n+1));return select('Comparison model '+(n+1),[['','Choose a model'],...options])});
  picks[0].value=identity(selectedModel());if(!picks[0].value)picks[0].selectedIndex=1;
  const controls=group(),run=button(controls,'Compare',start),cancel=button(controls,'Stop',()=>active?.abort());
  cancel.hidden=true;const grid=el('div');grid.className='compareGrid';
  async function start(){
    if(active)return;
    try{
      const chosen=picks.filter(p=>p.value).map(p=>available.find(m=>identity(m)===p.value));
      if(!chosen.length||new Set(chosen).size!==chosen.length)throw Error('Select one to three distinct models.');
      const list=current(),config=settings();validConversation(list);checkConnection(chosen);
      grid.replaceChildren();active=new AbortController();lock();cancel.disabled=false;cancel.hidden=false;
      const research=await groundRequest(list,active.signal),input=preparedMessages(research),signal=active.signal;
      notice('Comparing responses…');
      const winners=[];
      await Promise.all(chosen.map(async model=>{
        const col=el('section','',grid);el('h3',model.name,col);const details=el('small','Generating…',col),output=el('pre','',col);
        try{const {content,metric}=await complete(model,config,input,signal,s=>output.append(document.createTextNode(s)));
          output.textContent=content;details.textContent=metric.outcome+' · '+usageText(metric);renderSources(col,research.sources);
          const choose=button(col,'Keep this answer',()=>{messages=[...list,{role:'assistant',content,sources:research.sources}];resetDraft();render();desk.close();say('Kept '+model.name+' response.')});choose.disabled=true;winners.push(choose);
        }catch(e){output.textContent='';details.textContent=signal.aborted?'Stopped.':readable(e)}
      }));notice(winners.length?'Choose an answer to add it to your conversation.':'No completed answers.');
    }catch(e){notice(active?.signal.aborted?'Comparison stopped.':readable(e))}
    finally{active=null;lock();cancel.hidden=true;run.disabled=false}
  }
}
function dashboardPanel(){
  const metrics=library.metrics;
  if(!metrics.length){el('p','Run a generation or comparison to record timing, usage and provider-reported costs here.');return}
  const average=items=>(items.reduce((sum,m)=>sum+m.ms,0)/items.length/1000).toFixed(2)+' s';
  el('h3',metrics.length+' requests · '+average(metrics)+' average');
  const byModel=new Map();for(const m of metrics){if(!byModel.has(m.model))byModel.set(m.model,[]);byModel.get(m.model).push(m)}
  for(const [name,items] of byModel){const card=entry();el('strong',name,card);el('p',items.length+' requests · '+average(items)+' average · '+items.filter(m=>['Complete','Token limit'].includes(m.outcome)).length+' answers',card)}
  el('h3','Recent requests');for(const m of metrics.slice(-30).reverse()){const row=entry();el('strong',m.model,row);el('small',new Date(m.at).toLocaleString()+' · '+m.outcome+' · '+usageText(m),row)}
}
for(const id of preferences){const value=library.prefs?.[id];if(value===undefined)continue;if($(id).type==='checkbox')$(id).checked=value;else $(id).value=value}
showSession(session);searchMode();discover();
