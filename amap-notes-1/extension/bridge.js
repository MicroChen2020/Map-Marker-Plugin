/* MAIN world adapter. Only geographic coordinates cross this bridge; no photos or storage. */
(()=>{
  'use strict';
  if(window.__regionNotesBridge)return;window.__regionNotesBridge=true;
  let map=null,pending=false;
  const labelKey='region-notes-labels-v1';
  let labelPrefs={full:false,poi:false},originalFeatures=null;
  try{const v=JSON.parse(sessionStorage.getItem(labelKey)||'null');if(v)labelPrefs={full:v.full===true,poi:v.poi===true};}catch{}
  function labelStatus(){send('label-status',{supported:!!map&&typeof map.getFeatures==='function'&&typeof map.setFeatures==='function',fullHidden:labelPrefs.full,poiHidden:labelPrefs.poi});}
  function applyPOI(hidden){if(typeof map?.getFeatures!=='function'||typeof map?.setFeatures!=='function')throw Error('当前地图版本不支持即时切换兴趣点标注。');const current=map.getFeatures();if(!Array.isArray(current))throw Error('无法读取底图显示设置。');if(hidden){if(!originalFeatures)originalFeatures=current.slice();map.setFeatures(current.filter(x=>x!=='point'));}else if(originalFeatures){const restored=current.filter(x=>x!=='point');if(originalFeatures.includes('point'))restored.push('point');map.setFeatures(restored);originalFeatures=null;}}
  function rememberLabels(next){sessionStorage.setItem(labelKey,JSON.stringify(next));labelPrefs=next;}
  const channel='region-notes-map-v1';
  const send=(type,data={})=>window.postMessage({channel,direction:'from-map',type,...data},location.origin);
  const valid=m=>m&&typeof m.getContainer==='function'&&typeof m.lngLatToContainer==='function'&&typeof m.containerToLngLat==='function';
  function notify(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;send('view');});}
  function adopt(m){
    if(!valid(m)||m===map)return;
    let el;try{el=m.getContainer();}catch{return;}if(!el)return;
    if(map && map.getContainer()?.isConnected && el.id!=='amap-global-container' && el.id!=='themap')return;
    if(map?.off)for(const e of ['mapmove','zoomchange','rotatechange','pitchchange','resize','complete'])map.off(e,notify);
    map=m;originalFeatures=null;try{if(labelPrefs.poi)applyPOI(true);}catch{}labelStatus();for(const e of ['mapmove','zoomchange','rotatechange','pitchchange','resize','complete'])m.on?.(e,notify);
    send('status',{ready:true});notify();
  }
  const wrapped=new WeakSet();
  function wrap(C){
    if(typeof C!=='function'||wrapped.has(C))return C;
    const proxy=new Proxy(C,{construct(target,args,newTarget){const options=args[1];const actual=labelPrefs.full?[args[0],{...(options||{}),showLabel:false},...args.slice(2)]:args;const m=Reflect.construct(target,actual,newTarget);adopt(m);return m;}});wrapped.add(C);wrapped.add(proxy);
    // Also discover instances created by code that retained the original constructor.
    for(const key of ['setCenter','setZoom','setZoomAndCenter']){
      const fn=C.prototype?.[key];if(typeof fn!=='function'||fn.__notesHook)continue;
      const hook=function(...args){const result=Reflect.apply(fn,this,args);adopt(this);return result;};hook.__notesHook=true;
      try{C.prototype[key]=hook;}catch{}
    }return proxy;
  }
  const namespaces=new WeakSet();
  function arm(ns){if(!ns||typeof ns!=='object'||namespaces.has(ns))return ns;namespaces.add(ns);
    const d=Object.getOwnPropertyDescriptor(ns,'Map');
    if(!d||d.configurable){let ctor=d?.value;try{Object.defineProperty(ns,'Map',{configurable:true,enumerable:true,get(){return ctor;},set(v){ctor=wrap(v);}});if(ctor)ns.Map=ctor;}catch{}}
    else try{ns.Map=wrap(ns.Map);}catch{}return ns;
  }
  const descriptor=Object.getOwnPropertyDescriptor(window,'AMap');
  if(!descriptor || (descriptor.configurable && !descriptor.get)){
    let namespace=arm(window.AMap);try{Object.defineProperty(window,'AMap',{configurable:true,enumerable:true,get(){return namespace;},set(v){namespace=arm(v);}});}catch{}
  }
  const poll=setInterval(()=>{try{arm(window.AMap);if(typeof window.AMap?.Map==='function'){const ctor=window.AMap.Map,proxy=wrap(ctor);if(proxy!==ctor)try{window.AMap.Map=proxy;}catch{}}if(valid(window.themap))adopt(window.themap);if(map&&!map.getContainer()?.isConnected){map=null;send('status',{ready:false});}}catch{map=null;send('status',{ready:false});}},1000);
  window.addEventListener('pagehide',()=>clearInterval(poll),{once:true});
  window.addEventListener('resize',notify);
  window.addEventListener('scroll',notify,true);
  const coord=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=85;
  window.addEventListener('message',e=>{
    const q=e.data;if(e.source!==window||e.origin!==location.origin||q?.channel!==channel||q.direction!=='to-map')return;
    try{
      if(q.type==='status'){send('status',{ready:!!map});return;}
      if(q.type==='label-status'){labelStatus();return;}
      if(q.type==='full-labels'){if(typeof q.hidden!=='boolean')return;rememberLabels({...labelPrefs,full:q.hidden});location.reload();return;}
      if(!map)throw Error('尚未连接高德地图。请刷新网页后重试。');
      if(q.type==='poi-labels'){if(typeof q.hidden!=='boolean')return;const previous={...labelPrefs};rememberLabels({...labelPrefs,poi:q.hidden});try{applyPOI(q.hidden);}catch(err){rememberLabels(previous);labelStatus();throw err;}labelStatus();return;}
      const el=map.getContainer(),r=el.getBoundingClientRect(),A=window.AMap;
      if(q.type==='pick'){
        if(!Number.isFinite(q.x)||!Number.isFinite(q.y)||q.x<r.left||q.y<r.top||q.x>r.right||q.y>r.bottom)return;
        const p=map.containerToLngLat(new A.Pixel(q.x-r.left,q.y-r.top));send('picked',{requestId:q.requestId,coordinate:[p.getLng(),p.getLat()]});
      }else if(q.type==='project'){
        if(!Array.isArray(q.items)||q.items.length>10000)return;
        let count=0;const items=q.items.map(f=>{if(typeof f.id!=='string'||!Array.isArray(f.coordinates)||f.coordinates.length>2000)throw Error('坐标数量超限');count+=f.coordinates.length;if(count>100000)throw Error('当前视图超过 100,000 个顶点，请隐藏部分分类。');return{id:f.id,points:f.coordinates.map(p=>{if(!coord(p))throw Error('坐标无效');const v=map.lngLatToContainer(new A.LngLat(...p));return[v.getX()+r.left,v.getY()+r.top];})};});
        send('projected',{requestId:q.requestId,items,rect:{x:r.x,y:r.y,width:r.width,height:r.height}});
      }else if(q.type==='focus'&&coord(q.coordinate))map.setCenter(q.coordinate);
    }catch(err){send('error',{message:String(err.message),requestId:q.requestId});}
  });
})();
