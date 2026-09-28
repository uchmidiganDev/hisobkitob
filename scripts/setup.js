import {telegram} from '../lib/telegram.js';
const url=process.env.APP_URL?.replace(/\/$/,'');
try{
 if(!url?.startsWith('https://')||!process.env.BOT_TOKEN||!/^[-_a-zA-Z0-9]{32,256}$/.test(process.env.WEBHOOK_SECRET||''))throw Error('APP_URL, BOT_TOKEN, WEBHOOK_SECRET qiymatlarini tekshiring.');
 const health=await fetch(url+'/api/health');if(!health.ok)throw Error('Avval deploy va baza migratsiyasini tugating. /api/health ishlamayapti.');
 await telegram('setWebhook',{url:url+'/api/webhook',secret_token:process.env.WEBHOOK_SECRET,allowed_updates:['message'],drop_pending_updates:false,max_connections:5});
 await telegram('setChatMenuButton',{menu_button:{type:'web_app',text:'Hisob-kitob',web_app:{url}}});
 await telegram('setMyCommands',{commands:[{command:'start',description:'Mini App’ni ochish'},{command:'help',description:'Yordam'},{command:'stop',description:'Xabarlarni to‘xtatish'}]});
 const info=await telegram('getWebhookInfo',{});console.log('Webhook tayyor:',info.url);console.log('Telegram’da /start yuboring.');
}catch(e){console.error('Setup failed:',e.code||e.message);process.exitCode=1;}
