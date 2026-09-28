import {createHmac, timingSafeEqual} from 'node:crypto';
export const TZ='Asia/Tashkent';
export function localDate(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function shiftDay(day,n){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
export function validDate(s){return typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10)===s && s>='2000-01-01' && s<='2100-12-31';}
export function fail(message,status=400){throw Object.assign(new Error(message),{status});}
export function authenticate(raw,token,now=Date.now()){
 if(!token || typeof raw!=='string' || raw.length>12000) fail('Telegram orqali qayta oching.',401);
 const p=new URLSearchParams(raw),pairs=[...p];
 if(new Set(pairs.map(x=>x[0])).size!==pairs.length) fail('Yaroqsiz kirish.',401);
 const hash=p.get('hash')||'';p.delete('hash');
 const check=[...p].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${k}=${v}`).join('\n');
 const secret=createHmac('sha256','WebAppData').update(token).digest();
 const expected=createHmac('sha256',secret).update(check).digest();
 if(!/^[a-f0-9]{64}$/.test(hash)||!timingSafeEqual(Buffer.from(hash,'hex'),expected)) fail('Kirish tasdiqlanmadi.',401);
 const timestamp=Number(p.get('auth_date'))*1000;
 if(!Number.isFinite(timestamp)||timestamp>now+30000||now-timestamp>3600000) fail('Sessiya tugadi. Mini App’ni qayta oching.',401);
 let user;try{user=JSON.parse(p.get('user'));}catch{fail('Yaroqsiz foydalanuvchi.',401);}
 if(!user||!Number.isSafeInteger(user.id)||user.id<=0) fail('Yaroqsiz foydalanuvchi.',401);
 return user;
}
export function validateEntry(input,kind){
 const text=(k,max)=>{const s=String(input[k]??'').trim();if(!s||s.length>max)fail(`${k}: maydonni to‘g‘ri to‘ldiring.`);return s;};
 const amount=String(input.amount??'');
 if(!/^\d{1,12}(\.\d{1,2})?$/.test(amount))fail('Summani to‘g‘ri kiriting (ko‘pi bilan 2 kasr).');
 const [whole,decimal='']=amount.split('.'),minor=Number(whole)*100+Number(decimal.padEnd(2,'0'));
 if(!Number.isSafeInteger(minor)||minor<=0)fail('Summa noldan katta bo‘lsin.');
 if(!validDate(input.date)||input.date>localDate())fail('Olingan sana bugundan keyin bo‘lmasin.');
 const row={title:text('title',160),amount:minor,date:input.date,category:String(input.category||'Boshqa').slice(0,50)};
 if(kind==='debts'){
  if(!validDate(input.dueDate)||input.dueDate<input.date)fail('Qaytarish sanasini tekshiring.');
  row.person=text('person',100);row.dueDate=input.dueDate;
  row.direction=input.direction==='lent'?'lent':'borrowed';
 }
 return row;
}

export function money(minor){return new Intl.NumberFormat("uz-UZ",{maximumFractionDigits:2}).format(minor/100)+" so‘m";}
