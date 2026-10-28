import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve('dist');
http.createServer((req,res)=>{let p=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!p.startsWith(root+path.sep)&&p!==root){res.writeHead(403).end();return;}if(p===root||fs.existsSync(p)&&fs.statSync(p).isDirectory())p=path.join(p,'index.html');fs.readFile(p,(err,data)=>{if(err){res.writeHead(404).end('Not found');return;}res.setHeader('Content-Type',({'wasm':'application/wasm','zip':'application/zip','gz':'application/gzip','mjs':'text/javascript','md':'text/plain','html':'text/html','js':'text/javascript','css':'text/css','json':'application/json','svg':'image/svg+xml','png':'image/png','webmanifest':'application/manifest+json'})[p.split('.').pop()]||'application/octet-stream');res.end(data);});}).listen(4186,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4186'));
