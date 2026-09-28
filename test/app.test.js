import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {authenticate,validateEntry,localDate} from '../core.js';
import {register,snapshot} from '../lib/db.js';
import {schedule} from '../lib/jobs.js';
import handler,{processWebhook} from '../api/index.js';
const token='123:test';
function signed(time=Date.now()){const p=new URLSearchParams({auth_date:String(Math.floor(time/1000)),user:JSON.stringify({id:1,first_name:'Yusuf'})});const check=[...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');p.set('hash',createHmac('sha256',createHmac('sha256','WebAppData').update(token).digest()).update(check).digest('hex'));return p.toString();}
test('HMAC accepts real signature, rejects edited and expired data',()=>{assert.equal(authenticate(signed(),token).id,1);assert.throws(()=>authenticate(signed().replace('Yusuf','Ali'),token));assert.throws(()=>authenticate(signed(Date.now()-7200000),token));assert.throws(()=>authenticate(signed()+'&user=x',token));});
test('Money and calendar validation',()=>{assert.equal(validateEntry({title:'Non',amount:'100.01',date:'2026-01-01'},'expenses').amount,10001);for(const amount of ['0','-1','1e9','0.001'])assert.throws(()=>validateEntry({title:'Non',amount,date:'2026-01-01'},'expenses'));assert.throws(()=>validateEntry({title:'Non',amount:'1',date:'2026-02-30'},'expenses'));});
test('Tashkent midnight',()=>{assert.equal(localDate(new Date('2026-12-31T19:00:00Z')),'2027-01-01');});
test('Unauthenticated API, webhook and cron are rejected before DB access',async()=>{process.env.BOT_TOKEN=token;process.env.WEBHOOK_SECRET='test-secret';process.env.CRON_SECRET='cron-secret';for(const [url,method] of [['/api/state','GET'],['/api/webhook','POST'],['/api/cron','GET'],['/api?route=cron','GET']]){let status,body;const res={setHeader(){},set statusCode(v){status=v;},end(v){body=JSON.parse(v);}};await handler({url,method,headers:{}},res);assert.equal(status,401);assert.ok(body.error);}});
test('PostgreSQL schema, webhook deduplication, CRUD isolation, reports and debt reminders',async()=>{
 const db=new PGlite();await db.exec(await readFile(new URL('../lib/schema.sql',import.meta.url),'utf8'));
 try{
 const update={update_id:10,message:{text:'/start',from:{id:1,first_name:'Yusuf'},chat:{id:1,type:'private'}}};
 await processWebhook(db,update);await processWebhook(db,update);assert.equal((await db.query('SELECT * FROM outbox')).rows.length,1);
 await register(db,{id:2,first_name:'Ali'},2);await db.query("UPDATE users SET created='2026-12-31'");
 await db.query("INSERT INTO expenses(user_id,title,amount,date,category) VALUES(1,'Non',10001,'2026-12-31','Oziq-ovqat')");
 await db.query("INSERT INTO expenses(user_id,title,amount,date,category) VALUES(2,'Bus',20000,'2026-12-31','Transport')");
 assert.equal((await snapshot(db,1)).expenses.length,1);assert.equal((await snapshot(db,1)).user.botStarted,true);
 assert.equal((await db.query('DELETE FROM expenses WHERE id=1 AND user_id=2 RETURNING id')).rows.length,0);
 await schedule(db,new Date('2026-12-31T19:00:00Z'));await schedule(db,new Date('2026-12-31T19:00:10Z'));
 assert.equal((await db.query("SELECT * FROM outbox WHERE kind='report'")).rows.length,6);
 assert.match((await db.query("SELECT text FROM outbox WHERE key='day:1:2026-12-31'")).rows[0].text,/100/);
 await db.query("INSERT INTO debts(user_id,title,person,amount,date,due_date,direction) VALUES(1,'Telefon','Vali',100000,'2026-12-31','2027-01-01','borrowed')");
 await schedule(db,new Date('2027-01-01T03:59:00Z'));assert.equal((await db.query("SELECT * FROM outbox WHERE kind='debt'")).rows.length,0);
 await schedule(db,new Date('2027-01-01T04:00:00Z'));await schedule(db,new Date('2027-01-01T04:01:00Z'));assert.equal((await db.query("SELECT * FROM outbox WHERE kind='debt'")).rows.length,1);
 await db.query('UPDATE debts SET paid=1');await schedule(db,new Date('2027-01-02T04:00:00Z'));assert.equal((await db.query("SELECT * FROM outbox WHERE kind='debt'")).rows.length,1);
 await processWebhook(db,{...update,update_id:11,message:{...update.message,text:'/stop'}});assert.equal((await snapshot(db,1)).user.reports,0);assert.equal((await db.query("SELECT * FROM outbox WHERE user_id=1 AND kind='report' AND sent=0")).rows.length,0);
 }finally{await db.close();}
});
