export async function telegram(method,payload){
 const response=await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(8000)});
 const data=await response.json();if(!data.ok)throw Object.assign(new Error('Telegram request failed'),{code:data.error_code,retry:data.parameters?.retry_after});return data.result;
}
