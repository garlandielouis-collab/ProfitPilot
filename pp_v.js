require('dotenv').config({path:'.env.local',quiet:true});
const u=process.env.NEXT_PUBLIC_SUPABASE_URL,k=process.env.SUPABASE_SERVICE_ROLE_KEY;
(async()=>{
 for(const q of ['purchases?select=payment_status','sales?select=payment_status','expenses?select=payment_status']){
  const r=await fetch(`${u}/rest/v1/${q}`,{headers:{apikey:k,Authorization:'Bearer '+k}});
  const j=await r.json();
  const c={};for(const row of j){const v=row.payment_status;c[v]=(c[v]||0)+1;}
  console.log(q.split('?')[0].padEnd(12), JSON.stringify(c));
 }
})();
