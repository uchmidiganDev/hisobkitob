import {localDate,shiftDay,TZ,money} from '../core.js';
import {transaction} from './db.js';
import {telegram} from './telegram.js';
export async function enqueue(c,key,userId,kind,text,ref=null){await c.query('INSERT INTO outbox(key,user_id,kind,text,ref_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[key,userId,kind,text,ref]);}
export async function schedule(c,now=new Date()){
 const today=localDate(now),hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:TZ,hour:'2-digit',hourCycle:'h23'}).format(now));
 const users=(await c.query('SELECT * FROM users WHERE chat_id IS NOT NULL')).rows;
 for(const u of users){
  if(u.reminders&&hour>=9){for(const d of (await c.query('SELECT * FROM debts WHERE user_id=$1 AND paid=0 AND due_date<=$2',[u.id,today])).rows){await enqueue(c,`debt:${d.id}:${d.due_date}:${today}`,u.id,'debt',`⏰ Qarz eslatmasi\n${d.person}: ${money(d.amount)}\n${d.title}\nMuddat: ${d.due_date}\n${d.direction==='lent'?'Siz bergan qarz':'Siz olgan qarz'}`,d.id);}}
  if(!u.reports)continue;
  const key=`report_cursor:${u.id}`,prior=(await c.query('SELECT value FROM state WHERE key=$1',[key])).rows[0]?.value||shiftDay(u.created,-1);
  let day=shiftDay(prior,1),count=0;
  while(day<today&&count++<31){
   const next=shiftDay(day,1),periods=[['day',day,day,'Kunlik']];
   if(next.slice(8)==='01')periods.push(['month',day.slice(0,7)+'-01',day,'Oylik']);
   if(next.slice(5)==='01-01')periods.push(['year',day.slice(0,4)+'-01-01',day,'Yillik']);
   for(const [type,start,end,label] of periods){const sum=(await c.query('SELECT COALESCE(SUM(amount),0) AS total,COUNT(*) AS count FROM expenses WHERE user_id=$1 AND date BETWEEN $2 AND $3',[u.id,start,end])).rows[0];await enqueue(c,`${type}:${u.id}:${day}`,u.id,'report',`📊 ${label} xarajat hisoboti\n${start===end?start:start+' → '+end}\nJami: ${money(Number(sum.total))}\nXaridlar: ${sum.count} ta`);}
   await c.query('INSERT INTO state(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value',[key,day]);day=next;
  }
 }
}
export async function drain(deadline=Date.now()+20000,send=telegram){let sent=0;
 while(Date.now()<deadline){
  const worked=await transaction(async c=>{
   const item=(await c.query(`SELECT o.*,u.chat_id,u.reports,u.reminders FROM outbox o JOIN users u ON u.id=o.user_id WHERE o.sent=0 AND o.next_at<=$1 ORDER BY o.created_at FOR UPDATE OF o SKIP LOCKED LIMIT 1`,[Date.now()])).rows[0];
   if(!item)return false;
   const debtOK=item.kind!=='debt'||(await c.query('SELECT id FROM debts WHERE id=$1 AND paid=0',[item.ref_id])).rows.length;
   if(!item.chat_id||!debtOK||(item.kind==='report'&&!item.reports)||(item.kind==='debt'&&!item.reminders)){await c.query('UPDATE outbox SET sent=1 WHERE key=$1',[item.key]);return true;}
   try{await send('sendMessage',{chat_id:item.chat_id,text:item.text,...(item.kind==='welcome'?{reply_markup:{inline_keyboard:[[{text:'💚 Hisob-kitobni ochish',web_app:{url:process.env.APP_URL}}]]}}:{})});await c.query('UPDATE outbox SET sent=1 WHERE key=$1',[item.key]);sent++;}
   catch(e){if(e.code===403)await c.query('UPDATE users SET chat_id=NULL WHERE id=$1',[item.user_id]);await c.query('UPDATE outbox SET attempts=attempts+1,next_at=$1 WHERE key=$2',[Date.now()+(e.retry||Math.min(3600,30*2**Math.min(item.attempts,7)))*1000,item.key]);}
   return true;
  });if(!worked)break;
 }return sent;
}
export async function cron(){const scheduled=await transaction(async c=>{const lock=(await c.query('SELECT pg_try_advisory_xact_lock(984127) AS locked')).rows[0].locked;if(!lock)return false;await schedule(c);return true;});return {scheduled,sent:await drain()};}
