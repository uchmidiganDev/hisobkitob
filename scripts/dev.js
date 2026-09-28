import http from 'node:http';
import {readFile} from 'node:fs/promises';
import handler from '../api/index.js';
const files={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/style.css':['style.css','text/css']};
http.createServer(async(req,res)=>{if(req.url.startsWith('/api/'))return handler(req,res);const f=files[new URL(req.url,'http://localhost').pathname];if(!f){res.statusCode=404;return res.end();}res.setHeader('Content-Type',f[1]+'; charset=utf-8');res.end(await readFile(new URL('../public/'+f[0],import.meta.url)));}).listen(Number(process.env.PORT||3000),()=>console.log('http://localhost:'+(process.env.PORT||3000)));
