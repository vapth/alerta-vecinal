/* Service worker de Alerta Vecinal: guarda la app y el mapa para usarlos sin internet.
   Debe estar en la misma carpeta que index.html (y servirse por https). */
var SHELL='av-shell-v3',TILES='av-tiles-v1';
self.addEventListener('install',function(e){
  self.skipWaiting();
  e.waitUntil(caches.open(SHELL).then(function(c){return c.addAll(['./','index.html']).catch(function(){})}));
});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(ks){
    return Promise.all(ks.filter(function(k){return k.indexOf('av-shell-')===0&&k!==SHELL}).map(function(k){return caches.delete(k)}));
  }).then(function(){return self.clients.claim()}));
});
function isTile(u){
  return (/arcgisonline\.com$/.test(u.hostname)&&u.pathname.indexOf('/tile/')>-1)||/tile\.opentopomap\.org$/.test(u.hostname);
}
async function tile(req){
  var c=await caches.open(TILES),hit=await c.match(req.url);
  if(hit)return hit;
  try{
    var r=await fetch(req.url,{mode:'cors',credentials:'omit'});
    if(r&&r.ok)c.put(req.url,r.clone());
    return r;
  }catch(e){
    try{return await fetch(req)}catch(e2){return new Response('',{status:504})}
  }
}
async function page(req){
  var c=await caches.open(SHELL);
  try{
    var ctl=new AbortController(),to=setTimeout(function(){ctl.abort()},4500);
    var r=await fetch(req,{signal:ctl.signal});clearTimeout(to);
    if(r&&r.ok)c.put(req,r.clone());
    return r;
  }catch(e){
    var hit=await c.match(req,{ignoreSearch:true})||await c.match('index.html')||await c.match('./');
    return hit||new Response('Sin conexión',{status:503});
  }
}
self.addEventListener('fetch',function(e){
  var req=e.request;if(req.method!=='GET')return;
  var u=new URL(req.url);
  if(isTile(u)){e.respondWith(tile(req));return}
  if(u.origin===self.location.origin&&(req.mode==='navigate'||/\/$|\.html$/.test(u.pathname))){e.respondWith(page(req))}
});
self.addEventListener('message',function(e){
  var d=e.data||{};
  if(d.type!=='prefetch'||!d.urls)return;
  var urls=d.urls,total=urls.length,done=0,i=0,src=e.source;
  async function worker(){
    var c=await caches.open(TILES);
    while(i<urls.length){
      var u=urls[i++];
      try{
        if(!(await c.match(u))){var r=await fetch(u,{mode:'cors',credentials:'omit'});if(r&&r.ok)await c.put(u,r)}
      }catch(x){}
      done++;
      if(done%25===0||done===total){try{src.postMessage({type:'tiles',done:done,total:total,layer:d.layer})}catch(y){}}
    }
  }
  e.waitUntil(Promise.all([worker(),worker(),worker(),worker()]));
});
