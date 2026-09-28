import {randomBytes} from 'node:crypto';
for(const key of ['WEBHOOK_SECRET','CRON_SECRET'])console.log(key+'='+randomBytes(32).toString('hex'));
