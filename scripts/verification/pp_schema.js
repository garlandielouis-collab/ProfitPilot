require('dotenv').config({path:'.env.local',quiet:true});
const u=process.env.NEXT_PUBLIC_SUPABASE_URL, k=process.env.SUPABASE_SERVICE_ROLE_KEY;
(async()=>{
 const r=await fetch(`${u}/rest/v1/`,{headers:{apikey:k,Authorization:'Bearer '+k,Accept:'application/openapi+json'}});
 const spec=await r.json();
 const out={};
 for(const [name,def] of Object.entries(spec.definitions||{})){
  out[name]=Object.keys(def.properties||{});
 }
 require('fs').writeFileSync('pp_schema.json',JSON.stringify(out,null,0));
 console.log('tables/vues exportées :',Object.keys(out).length);
})();
