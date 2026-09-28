import pg from 'pg';
import {localDate} from '../core.js';
pg.types.setTypeParser(20,value=>{const n=Number(value);if(!Number.isSafeInteger(n))throw Error('Integer exceeds safe limit');return n;});
let pool;
export function getPool(){if(!process.env.DATABASE_URL)throw Error('DATABASE_URL missing');return pool??=new pg.Pool({connectionString:process.env.DATABASE_URL,max:3,idleTimeoutMillis:10000,connectionTimeoutMillis:8000,statement_timeout:15000});}
export const q=(sql,args=[])=>getPool().query(sql,args);
export async function transaction(fn){const c=await getPool().connect();try{await c.query('BEGIN');const v=await fn(c);await c.query('COMMIT');return v;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
export async function register(c,u,chat=null){await c.query(`INSERT INTO users(id,name,chat_id,created) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET name=excluded.name,chat_id=COALESCE(excluded.chat_id,users.chat_id)`,[u.id,String(u.first_name||'Do‘st').slice(0,100),chat,localDate()]);}
export async function snapshot(c,id){const user=(await c.query('SELECT name,reports,reminders,chat_id IS NOT NULL AS "botStarted" FROM users WHERE id=$1',[id])).rows[0];const debts=(await c.query('SELECT * FROM debts WHERE user_id=$1 ORDER BY paid,due_date,id DESC',[id])).rows;const expenses=(await c.query('SELECT * FROM expenses WHERE user_id=$1 ORDER BY date DESC,id DESC',[id])).rows;return {user,today:localDate(),debts,expenses};}
