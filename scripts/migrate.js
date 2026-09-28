import {readFile} from 'node:fs/promises';
import {getPool} from '../lib/db.js';
try{await getPool().query(await readFile(new URL('../lib/schema.sql',import.meta.url),'utf8'));console.log('Baza tayyor.');}catch(e){console.error('Migration failed:',e.code||e.name);process.exitCode=1;}finally{await getPool().end();}
