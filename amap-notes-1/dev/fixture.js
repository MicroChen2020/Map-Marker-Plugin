/* Deliberately fake AMap API, for isolated UI and adapter contract tests only. */
(()=>{
  const mercator=([lng,lat])=>[(lng+180)/360,(1-Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))/Math.PI)/2];
  const inverse=([x,y])=>[x*360-180,Math.atan(Math.sinh(Math.PI*(1-2*y)))*180/Math.PI];
  window.AMap={};
  AMap.Pixel=class{constructor(x,y){this.x=x;this.y=y;}getX(){return this.x;}getY(){return this.y;}};
  AMap.LngLat=class{constructor(lng,lat){this.lng=lng;this.lat=lat;}getLng(){return this.lng;}getLat(){return this.lat;}};
  AMap.Map=class{
    constructor(id,options={}){this.features=["bg","point","road","building"];this.showLabel=options.showLabel!==false;for(const label of document.querySelectorAll(".label"))label.style.visibility=this.showLabel?"visible":"hidden";this.container=document.getElementById(id);this.center=[120.15,30.25];this.zoom=14;this.events={};}
    getFeatures(){return this.features.slice();}
    setFeatures(v){this.features=v.slice();for(const label of document.querySelectorAll(".label"))label.style.visibility=this.showLabel&&v.includes("point")?"visible":"hidden";}
    getContainer(){return this.container;}
    on(name,fn){(this.events[name]??=[]).push(fn);}
    off(name,fn){this.events[name]=(this.events[name]||[]).filter(v=>v!==fn);}
    emit(name){for(const f of this.events[name]||[])f();}
    lngLatToContainer(p){const [x,y]=mercator([p.lng,p.lat]),[cx,cy]=mercator(this.center),s=256*2**this.zoom;return new AMap.Pixel((x-cx)*s+innerWidth/2,(y-cy)*s+innerHeight/2);}
    containerToLngLat(p){const[cx,cy]=mercator(this.center),s=256*2**this.zoom;return new AMap.LngLat(...inverse([cx+(p.x-innerWidth/2)/s,cy+(p.y-innerHeight/2)/s]));}
    setCenter(p){this.center=Array.isArray(p)?p:[p.lng,p.lat];this.emit('mapmove');update();}
    setZoom(z){this.zoom=z;this.emit('zoomchange');update();}
  };
  const map=new AMap.Map('amap-global-container');
  function update(){document.getElementById('fixture-status').textContent=`GCJ-02 测试坐标 · ${map.center.map(v=>v.toFixed(5)).join(', ')} · 层级 ${map.zoom}`;}
  document.getElementById('zoom-in').onclick=()=>map.setZoom(Math.min(19,map.zoom+1));document.getElementById('zoom-out').onclick=()=>map.setZoom(Math.max(3,map.zoom-1));document.getElementById('reset').onclick=()=>{map.setZoom(14);map.setCenter([120.15,30.25]);};
  let start;const surface=document.querySelector('.amap-maps');surface.addEventListener('pointerdown',e=>{start={x:e.clientX,y:e.clientY,center:mercator(map.center)};surface.setPointerCapture(e.pointerId);});surface.addEventListener('pointermove',e=>{if(!start)return;const s=256*2**map.zoom;map.setCenter(inverse([start.center[0]-(e.clientX-start.x)/s,start.center[1]-(e.clientY-start.y)/s]));});surface.addEventListener('pointerup',()=>start=null);update();
})();
