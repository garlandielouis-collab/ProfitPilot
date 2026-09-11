require('dotenv').config({path:'.env.local',quiet:true});
const u=process.env.NEXT_PUBLIC_SUPABASE_URL, k=process.env.SUPABASE_SERVICE_ROLE_KEY;
const H={apikey:k,Authorization:'Bearer '+k};
async function cnt(p){const r=await fetch(`${u}/rest/v1/${p}`,{headers:{...H,Prefer:'count=exact',Range:'0-0'}});
 return r.ok?(r.headers.get('content-range')||'').split('/')[1]:'ABSENTE('+r.status+')';}
(async()=>{
 console.log('table backups            :', await cnt('backups?select=id'));
 console.log('table login_sessions     :', await cnt('login_sessions?select=id'));
 console.log('produits sans entreprise :', await cnt('products?select=id&business_id=is.null'));
 console.log('produits rattachés       :', await cnt('products?select=id&business_id=not.is.null'));
 console.log('entreprises vivantes     :', await cnt('businesses?select=id&deleted_at=is.null'));
 console.log('warehouses               :', await cnt('warehouses?select=id'));
})();
