import {timingSafeEqual} from 'node:crypto';
import {authenticate,validateEntry,fail} from '../core.js';
import {getPool,transaction,register,snapshot} from '../lib/db.js';
import {cron,drain,enqueue} from '../lib/jobs.js';
function secret(got,want){if(!want||typeof got!=='string')return false;const a=Buffer.from(got),b=Buffer.from(want);return a.length===b.length&&timingSafeEqual(a,b);}
async function body(req){if(req.body!==undefined){if(req.body===null||typeof req.body!=='object'&&typeof req.body!=='string')fail('Yaroqsiz JSON.');if(JSON.stringify(req.body).length>16384)fail('Ma’lumot juda katta.',413);return typeof req.body==='string'?JSON.parse(req.body):req.body;}let raw='';for await(const part of req){raw+=part;if(Buffer.byteLength(raw)>16384)fail('Ma’lumot juda katta.',413);}try{return JSON.parse(raw);}catch{fail('Yaroqsiz JSON.');}}
function allowed(id){const ids=(process.env.ALLOWED_USER_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);return !ids.length||ids.includes(String(id));}
export async function processWebhook(c,b){
 if(!Number.isSafeInteger(b.update_id))fail('Invalid update');
 if(!(await c.query('INSERT INTO webhook_updates(id) VALUES($1) ON CONFLICT DO NOTHING RETURNING id',[b.update_id])).rows.length)return;
 const m=b.message;if(!m?.from||m.from.is_bot||m.chat?.type!=='private'||!allowed(m.from.id))return;
 await register(c,m.from,m.chat.id);const cmd=(m.text||'').split(/[ @]/)[0];
 if(cmd==='/stop'){
  await c.query('UPDATE users SET reports=0,reminders=0 WHERE id=$1',[m.from.id]);await c.query('DELETE FROM outbox WHERE user_id=$1 AND sent=0',[m.from.id]);await enqueue(c,`update:${b.update_id}`,m.from.id,'reply','Xabarlar to‘xtatildi. /start orqali qayta yoqing.');
 }else if(cmd==='/start'||cmd==='/help'){
  if(cmd==='/start')await c.query('UPDATE users SET reports=1,reminders=1 WHERE id=$1',[m.from.id]);
  await enqueue(c,`update:${b.update_id}`,m.from.id,'welcome','Hisob-kitobga xush kelibsiz!\nQarz va xarajatlarni quyidagi tugma orqali yozing.\nHisobotlar: kun, oy va yil yakunida.\nQarz eslatmasi: 09:00 dan boshlab. Vaqt: Toshkent.\n/stop — avtomatik xabarlarni o‘chirish.');
 }
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
 const reply=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data));};
 try{
  const url=new URL(req.url,'http://localhost');const path=url.searchParams.has('route')?'/api/'+url.searchParams.get('route'):url.pathname;
  if(path==='/api/health'&&req.method==='GET'){await getPool().query('SELECT 1 FROM users LIMIT 1');return reply(200,{ok:true});}
  if(path==='/api/cron'){
   if(req.method!=='GET')fail('Method not allowed',405);
   if(!secret(req.headers.authorization,process.env.CRON_SECRET?'Bearer '+process.env.CRON_SECRET:null))fail('Unauthorized',401);
   return reply(200,await cron());
  }
  if(path==='/api/webhook'){
   if(req.method!=='POST')fail('Method not allowed',405);
   if(!secret(req.headers['x-telegram-bot-api-secret-token'],process.env.WEBHOOK_SECRET))fail('Unauthorized',401);
   const b=await body(req);await transaction(c=>processWebhook(c,b));await drain(Date.now()+10000);return reply(200,{ok:true});
  }
  const u=authenticate(req.headers['x-telegram-init-data'],process.env.BOT_TOKEN);if(!allowed(u.id))fail('Ruxsat yo‘q.',403);
  const c=getPool();await register(c,u);
  const rate=(await c.query(`INSERT INTO rate_limits(user_id,bucket,count) VALUES($1,$2,1) ON CONFLICT(user_id) DO UPDATE SET bucket=excluded.bucket,count=CASE WHEN rate_limits.bucket=excluded.bucket THEN rate_limits.count+1 ELSE 1 END RETURNING count`,[u.id,Math.floor(Date.now()/60000)])).rows[0];if(rate.count>120)fail('Biroz kuting.',429);
  if(path==='/api/state'&&req.method==='GET')return reply(200,await snapshot(c,u.id));
  if(path==='/api/settings'&&req.method==='PATCH'){const b=await body(req);if(typeof b.reports!=='boolean'||typeof b.reminders!=='boolean')fail('Sozlama xato.');await transaction(async c=>{await c.query('UPDATE users SET reports=$1,reminders=$2 WHERE id=$3',[+b.reports,+b.reminders,u.id]);if(!b.reports)await c.query("DELETE FROM outbox WHERE user_id=$1 AND kind='report' AND sent=0",[u.id]);if(!b.reminders)await c.query("DELETE FROM outbox WHERE user_id=$1 AND kind='debt' AND sent=0",[u.id]);});return reply(200,{ok:true});}
  const match=path.match(/^\/api\/(debts|expenses)(?:\/(\d+))?$/);if(!match)fail('Topilmadi.',404);const [,kind,rawId]=match,id=Number(rawId);
  if(req.method==='POST'&&!rawId){const v=validateEntry(await body(req),kind);const r=kind==='debts'?await c.query('INSERT INTO debts(user_id,title,person,amount,date,due_date,direction) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[u.id,v.title,v.person,v.amount,v.date,v.dueDate,v.direction]):await c.query('INSERT INTO expenses(user_id,title,amount,date,category) VALUES($1,$2,$3,$4,$5) RETURNING id',[u.id,v.title,v.amount,v.date,v.category]);return reply(201,r.rows[0]);}
  if(!Number.isSafeInteger(id)||id<=0)fail('Topilmadi.',404);
  if(!(await c.query(`SELECT id FROM ${kind} WHERE id=$1 AND user_id=$2`,[id,u.id])).rows.length)fail('Topilmadi.',404);
  const b=['PUT','PATCH'].includes(req.method)?await body(req):null;
  await transaction(async c=>{
   if(req.method==='DELETE')await c.query(`DELETE FROM ${kind} WHERE id=$1 AND user_id=$2`,[id,u.id]);
   else if(req.method==='PATCH'&&kind==='debts'){if(typeof b.paid!=='boolean')fail('Holat xato.');await c.query('UPDATE debts SET paid=$1 WHERE id=$2 AND user_id=$3',[+b.paid,id,u.id]);}
   else if(req.method==='PUT'){const v=validateEntry(b,kind);if(kind==='debts')await c.query('UPDATE debts SET title=$1,person=$2,amount=$3,date=$4,due_date=$5,direction=$6 WHERE id=$7 AND user_id=$8',[v.title,v.person,v.amount,v.date,v.dueDate,v.direction,id,u.id]);else await c.query('UPDATE expenses SET title=$1,amount=$2,date=$3,category=$4 WHERE id=$5 AND user_id=$6',[v.title,v.amount,v.date,v.category,id,u.id]);}
   else fail('Amal mavjud emas.',405);
   if(kind==='debts')await c.query("DELETE FROM outbox WHERE user_id=$1 AND ref_id=$2 AND kind='debt' AND sent=0",[u.id,id]);
  });return reply(200,{ok:true});
 }catch(e){if(!e.status)console.error('Request failed',e.name,e.code||'');return reply(e.status||500,{error:e.status?e.message:'Server xatosi. Sozlamalar va bazani tekshiring.'});}
}
