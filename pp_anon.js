require('dotenv').config({path:'.env.local',quiet:true});
const u=process.env.NEXT_PUBLIC_SUPABASE_URL, anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
(async()=>{
 const r=await fetch(`${u}/rest/v1/store_settings?select=*`,{headers:{apikey:anon,Authorization:'Bearer '+anon}});
 console.log('statut',r.status);
 console.log((await r.text()).slice(0,400));
 console.log('--- clé anon (préfixe) :', anon.slice(0,12), '| longueur', anon.length);
})();
