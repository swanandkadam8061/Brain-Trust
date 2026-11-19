import http from 'node:http';
import {readFile} from 'node:fs/promises';
import handler from './api/workspace.mjs';
const files=new Map([['/','index.html'],['/index.html','index.html'],['/studio.js','studio.js']]);
const port=Number(process.env.PORT||8766);
http.createServer(async(req,res)=>{
  try{
    const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/api/workspace')return await handler(req,res);
    if(!files.has(path)){res.writeHead(404);return res.end()}
    const content=await readFile(new URL(files.get(path),import.meta.url));
    res.writeHead(200,{'Content-Type':path.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-cache'});res.end(content);
  }catch{res.writeHead(500);res.end('Workspace unavailable.')}
}).listen(port,'127.0.0.1',()=>console.log('Brain Trust: http://127.0.0.1:'+port));
