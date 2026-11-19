import { Readable } from 'node:stream';
import { timingSafeEqual } from 'node:crypto';

const gateways = {
  groq: {base:'https://api.groq.com/openai/v1', env:'GROQ_API_KEY'},
  openrouter: {base:'https://openrouter.ai/api/v1', env:'OPENROUTER_API_KEY'}
};
function json(res, status, value) {
  res.writeHead(status, {'Content-Type':'application/json','Cache-Control':'no-store'});
  res.end(JSON.stringify(value));
}
async function catalog(route, signal) {
  const {base,env} = gateways[route], token = process.env[env];
  if (!token && route === 'groq') return [];
  const r = await fetch(base+'/models',{signal,headers:token?{Authorization:'Bearer '+token}:{}});
  if (!r.ok) throw Error(route+' catalog HTTP '+r.status);
  const {data} = await r.json();
  return data.filter(m=>typeof m.id==='string' && m.active!==false && (route==='groq'
    ? !/whisper|tts|guard|safeguard|orpheus|embed|moderation/i.test(m.id)
    : m.architecture?.output_modalities?.includes('text') && m.architecture?.input_modalities?.includes('text')))
    .map(m=>({id:m.id,route,ready:!!token,name:m.name||m.id,family:m.id.includes('/')?m.id.split('/')[0]:m.owned_by||'Groq',
      description:(m.description||'Chat completion model served by Groq.').slice(0,320),
      params:m.supported_parameters||[],inputs:m.architecture?.input_modalities||[],context:m.context_length||m.context_window}));
}
export default async function handler(req,res) {
  const host = (req.headers.host||'').split(':')[0];
  const local = !process.env.VERCEL && ['localhost','127.0.0.1'].includes(host) && ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  if (!local) {
    const password=process.env.BRAIN_TRUST_PASSWORD;
    const expected=Buffer.from('Basic '+Buffer.from('studio:'+password).toString('base64'));
    const actual=Buffer.from(req.headers.authorization||'');
    if (!password || actual.length!==expected.length || !timingSafeEqual(actual,expected)) {
      res.setHeader('WWW-Authenticate','Basic realm="Brain Trust"');
      return json(res,401,{error:{message:'Workspace authentication required.'}});
    }
  }
  const url=new URL(req.url,'http://localhost');
  if(req.headers.origin && new URL(req.headers.origin).host!==req.headers.host) return json(res,403,{error:{message:'Cross-origin request rejected.'}});
  const controller=new AbortController();
  res.on('close',()=>controller.abort());
  try {
    if(req.method==='GET') {
      const routes=Object.keys(gateways), results=await Promise.allSettled(routes.map(r=>catalog(r,AbortSignal.timeout(12000))));
      return json(res,200,{models:results.flatMap(r=>r.status==='fulfilled'?r.value:[]),errors:results.filter(r=>r.status==='rejected').map(r=>r.reason.message),connected:routes.filter(r=>process.env[gateways[r].env])});
    }
    if(req.method!=='POST'||!req.headers['content-type']?.startsWith('application/json'))return json(res,405,{error:{message:'JSON POST required.'}});
    const route=url.searchParams.get('route');
    if(!Object.hasOwn(gateways,route))return json(res,400,{error:{message:'Unknown gateway.'}});
    const {env,base}=gateways[route],token=process.env[env];
    if(!token)return json(res,503,{error:{message:'Set '+env+' on the server, then restart it.'}});
    let body=req.body;
    if(!body){const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>4000000)return json(res,413,{error:{message:'Request exceeds 4 MB.'}});chunks.push(c)}body=JSON.parse(Buffer.concat(chunks).toString())}
    if(typeof body==='string')body=JSON.parse(body);
    if(!Array.isArray(body.messages)||typeof body.model!=='string')return json(res,400,{error:{message:'Model and messages required.'}});
    const allowed=['model','messages','temperature','top_p','stop','stream','max_completion_tokens','max_tokens','response_format','stream_options'];
    const payload=Object.fromEntries(allowed.filter(k=>body[k]!==undefined).map(k=>[k,body[k]]));
    const upstream=await fetch(base+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
    res.writeHead(upstream.status,{'Content-Type':upstream.headers.get('content-type')||'application/json','Cache-Control':'no-store'});
    if(upstream.body)for await(const chunk of Readable.fromWeb(upstream.body))res.write(chunk);
    res.end();
  }catch(e){if(res.destroyed)return;if(res.headersSent)return res.destroy();json(res,502,{error:{message:e instanceof SyntaxError?'Invalid JSON request.':'Provider connection failed. Check the server network and retry.'}})}
}
