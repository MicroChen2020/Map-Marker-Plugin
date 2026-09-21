(()=>{
  if(document.getElementById('region-notes-root'))return;
  const C=NoteCore,channel='region-notes-map-v1';
  const host=document.createElement('div');host.id='region-notes-root';
  host.style.cssText='position:fixed;inset:0;z-index:2147483000;pointer-events:none';
  const shadow=host.attachShadow({mode:'open'});document.body.append(host);
  const style=document.createElement('style');style.textContent=`:host{all:initial}svg{position:fixed;inset:0;width:100vw;height:100vh;overflow:hidden;pointer-events:none}.dock{box-sizing:border-box;position:fixed;display:flex;flex-direction:column;pointer-events:auto;width:356px;height:620px;background:#fafbf8;border:1px solid #d3ded9;border-radius:15px;box-shadow:0 12px 50px #142f3430;overflow:hidden}.dock.collapsed{width:210px!important;height:38px!important}.bar{display:flex;align-items:center;gap:3px;height:38px;min-height:38px;padding:0 7px;background:#e7eee2;border-bottom:1px solid #d3ded9}.bar button{position:static;border:0;background:transparent;color:#294e40;border-radius:6px;padding:6px;font:13px system-ui;cursor:pointer}.bar button:hover{background:#d9e5d3}.bar .drag{flex:1;text-align:left;cursor:grab;touch-action:none;user-select:none;font-weight:600}.bar .drag:active{cursor:grabbing}.dock iframe{position:static;width:100%;flex:1;min-height:0;border:0;pointer-events:auto;background:#fafbf8}.caption{position:fixed;left:50%;top:16px;transform:translateX(-50%);background:#fffef5ee;border:1px solid #e0e4da;color:#34574d;border-radius:12px;padding:10px 18px;font:13px system-ui;max-width:40vw;pointer-events:none}.legend{position:fixed;left:20px;bottom:42px;background:#fffef9ed;padding:12px 16px;border-radius:10px;color:#213f36;font:12px system-ui;max-width:280px;pointer-events:none}.legend b{display:block;font-size:15px;margin-bottom:7px}.legend span{display:inline-block;margin:3px 10px 3px 0}.legend i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px}.hidden{display:none!important}`;
  shadow.append(style);
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('aria-label','区位标注图层');shadow.append(svg);
  const dock=document.createElement('div');dock.className='dock';shadow.append(dock);
  const bar=document.createElement('div');bar.className='bar';dock.append(bar);
  const dragHandle=document.createElement('button');dragHandle.className='drag';dragHandle.textContent='⠿ 区位笔记';dragHandle.title='拖动工作台，也可用方向键移动';dragHandle.setAttribute('aria-label','移动工作台');bar.append(dragHandle);
  const reset=document.createElement('button');reset.textContent='↺';reset.title='重置面板位置';bar.append(reset);
  const panel=document.createElement('iframe');panel.title='区位笔记工作台';
  const dev=!globalThis.chrome?.runtime?.id;
  panel.src=dev?'../extension/panel.html?dev=1':chrome.runtime.getURL('panel.html')+'?parentOrigin='+encodeURIComponent(location.origin);dock.append(panel);
  const frameURL=new URL(panel.src),frameOrigin=dev?frameURL.origin:frameURL.protocol+'//'+frameURL.host;
  const toggle=document.createElement('button');toggle.textContent='−';toggle.title='收起工作台';bar.append(toggle);
  const caption=document.createElement('div');caption.className='caption hidden';shadow.append(caption);
  const legend=document.createElement('div');legend.className='legend hidden';shadow.append(legend);
  let ready=false,features=[],categories=[],projectName='',selected='',mode='select',projectSeq=0,frameQueued=false,pickSeq=0,activePick=null,shown=true,autoCollapsed=false;
  const sendPanel=(type,data={})=>panel.contentWindow?.postMessage({channel:'region-notes-panel',type,...data},frameOrigin);
  const sendMap=(type,data={})=>window.postMessage({channel,direction:'to-map',type,...data},location.origin);
  function cancelPick(){activePick=null;}
  function requestProject(){if(frameQueued)return;frameQueued=true;requestAnimationFrame(()=>{frameQueued=false;if(ready)sendMap('project',{requestId:++projectSeq,items:features.map(f=>({id:f.id,coordinates:f.type==='circle'?C.ring(f.coordinates[0],f.radius):f.coordinates}))});});}
  function setShown(value,cancel=true){shown=value;panel.classList.toggle('hidden',!value);if(!value&&cancel){mode='select';cancelPick();caption.classList.add('hidden');sendPanel('cancel');}dock.classList.toggle('collapsed',!value);toggle.textContent=value?'−':'＋';toggle.title=value?'收起工作台':'展开工作台';place();}
  let position={x:Math.max(12,innerWidth-470),y:110},positionTouched=false;
  function place(){const width=shown?Math.min(356,Math.max(160,innerWidth-24)):Math.min(210,innerWidth-24),height=shown?Math.min(600,Math.max(80,innerHeight-200)):38;dock.style.width=width+'px';dock.style.height=height+'px';position.x=Math.max(12,Math.min(position.x,Math.max(12,innerWidth-width-12)));position.y=Math.max(12,Math.min(position.y,Math.max(12,innerHeight-height-12)));dock.style.left=position.x+'px';dock.style.top=position.y+'px';}
  async function remember(){positionTouched=true;try{const value={...position,shown};if(dev)localStorage.setItem('region-notes-layout-v1',JSON.stringify(value));else await chrome.storage.local.set({'region-notes-layout-v1':value});}catch{sendPanel('error',{message:'面板位置暂时无法保存，但项目数据不受影响。'});}}
  async function restoreLayout(){try{const value=dev?JSON.parse(localStorage.getItem('region-notes-layout-v1')||'null'):(await chrome.storage.local.get('region-notes-layout-v1'))['region-notes-layout-v1'];if(!positionTouched&&value&&Number.isFinite(value.x)&&Number.isFinite(value.y)){position={x:value.x,y:value.y};setShown(value.shown!==false);}}catch{}place();}
  let dragging=null;
  dragHandle.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();positionTouched=true;dragging={x:e.clientX,y:e.clientY,px:position.x,py:position.y};dragHandle.setPointerCapture(e.pointerId);panel.style.pointerEvents='none';});
  dragHandle.addEventListener('pointermove',e=>{if(!dragging)return;position={x:dragging.px+e.clientX-dragging.x,y:dragging.py+e.clientY-dragging.y};place();});
  function endDrag(){if(!dragging)return;dragging=null;panel.style.pointerEvents='';remember();}
  for(const event of ['pointerup','pointercancel','lostpointercapture'])dragHandle.addEventListener(event,endDrag);
  dragHandle.addEventListener('keydown',e=>{const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!delta)return;e.preventDefault();const step=e.shiftKey?40:10;position.x+=delta[0]*step;position.y+=delta[1]*step;place();remember();});
  reset.onclick=()=>{position={x:Math.max(12,innerWidth-470),y:110};place();remember();};
  toggle.onclick=()=>{setShown(!shown);remember();};
  window.addEventListener('resize',place);place();restoreLayout();
  let rpcCounter=0;const pendingRPC=new Map();
  function rpc(type,data){return new Promise((resolve,reject)=>{const requestId='editor-'+(++rpcCounter);const timer=setTimeout(()=>{pendingRPC.delete(requestId);reject(Error('地图响应超时，请稍后重试。'));},3000);pendingRPC.set(requestId,{resolve,reject,timer});sendMap(type,{...data,requestId});});}
  const editor=new NoteMapEditor({root:shadow,rpc,done:data=>sendPanel('editor-commit',data),cancel:()=>sendPanel('cancel'),error:message=>sendPanel('error',{message})});
  function element(name,attrs,text){const el=document.createElementNS(ns,name);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,String(v));if(text)el.textContent=text;return el;}
  function draw(items,rect){
    svg.replaceChildren();if(rect){const defs=element('defs',{}),clip=element('clipPath',{id:'notes-map-clip'});clip.append(element('rect',rect));defs.append(clip);svg.append(defs);}
    const group=element('g',{'clip-path':'url(#notes-map-clip)'});svg.append(group);
    const byId=new Map(features.map(f=>[f.id,f]));
    for(const item of items){const f=byId.get(item.id);if(!f||(mode==='edit'&&f.id===selected)||!item.points.every(p=>p.every(Number.isFinite)))continue;
      const color=categories.find(c=>c.id===f.categoryId)?.color||'#147d6b',g=element('g',{'data-id':f.id});g.style.cursor='pointer';
      const points=item.points.map(p=>p.join(',')).join(' '),[x,y]=item.points[0],width=f.id===selected?4:2.5;
      if(f.type==='point'){g.append(element('circle',{cx:x,cy:y,r:f.id===selected?13:10,fill:color,stroke:'#fff','stroke-width':3}));g.append(element('circle',{cx:x,cy:y,r:3,fill:'#fff'}));}
      if(f.type==='line')g.append(element('polyline',{points,fill:'none',stroke:color,'stroke-width':width,'stroke-linecap':'round','stroke-linejoin':'round'}));
      if(['polygon','circle'].includes(f.type))g.append(element('polygon',{points,fill:color,'fill-opacity':.15,stroke:color,'stroke-width':width,'stroke-linejoin':'round'}));
      const label=element('text',{x:x+15,y:y-12,fill:color,'font-family':'system-ui, sans-serif','font-size':f.type==='text'?18:13,'font-weight':650,stroke:'#fff','stroke-width':4,'paint-order':'stroke'},f.name);g.append(label);
      g.style.pointerEvents=mode==='select'?'auto':'none';g.addEventListener('click',e=>{e.stopPropagation();if(f.id!=='__draft')sendPanel('select',{id:f.id});});group.append(g);
    }
  }
  function updateLegend(){legend.replaceChildren();const title=document.createElement('b');title.textContent=projectName;legend.append(title);for(const c of categories.filter(c=>c.visible)){const span=document.createElement('span'),dot=document.createElement('i');dot.style.background=c.color;span.append(dot,document.createTextNode(c.name));legend.append(span);}legend.classList.toggle('hidden',!features.length);}
  window.addEventListener('message',e=>{
    const q=e.data;
    if(e.source===panel.contentWindow&&e.origin===frameOrigin&&q?.channel==='region-notes-panel'){
      if(q.type==='hello'){sendPanel('status',{ready});sendMap('label-status');}
      if(q.type==='scene'){features=q.features||[];categories=q.categories||[];projectName=q.name||'';selected=q.selected||'';updateLegend();requestProject();}
      if(q.type==='mode'){mode=q.mode;cancelPick();caption.classList.add('hidden');editor.start(q);if(mode!=='select'){autoCollapsed=true;setShown(false,false);}else if(autoCollapsed){autoCollapsed=false;setShown(true,false);}requestProject();}
      if(q.type==='editor-key')editor.key(q.key);
      if(q.type==='editor-reject'){editor.committing=false;editor.message=q.message;editor.updateTools();}
      if(q.type==='poi-labels')sendMap('poi-labels',{hidden:q.hidden===true});
      if(q.type==='full-labels')sendMap('full-labels',{hidden:q.hidden===true});
      if(q.type==='focus')sendMap('focus',{coordinate:q.coordinate});
      return;
    }
    if(e.source!==window||e.origin!==location.origin||q?.channel!==channel||q.direction!=='from-map')return;
    if(pendingRPC.has(q.requestId)){const pending=pendingRPC.get(q.requestId);clearTimeout(pending.timer);pendingRPC.delete(q.requestId);if(q.type==='error')pending.reject(Error(q.message));else pending.resolve(q);return;}
    if(q.type==='status'){ready=q.ready;sendPanel('status',{ready});if(ready)requestProject();else{svg.replaceChildren();cancelPick();if(mode!=='select')sendPanel('cancel');}}
    if(q.type==='label-status')sendPanel('label-status',{supported:q.supported,poiHidden:q.poiHidden,fullHidden:q.fullHidden});
    if(q.type==='view'){requestProject();editor.redraw();}
    if(q.type==='projected'&&q.requestId===projectSeq)draw(q.items,q.rect);
    if(q.type==='picked'&&q.requestId===activePick&&mode!=='select'){activePick=null;sendPanel('picked',{coordinate:q.coordinate});}
    if(q.type==='error')sendPanel('error',{message:q.message});
  });
  if(!dev)chrome.runtime.onMessage.addListener((q,_sender,respond)=>{
    if(q.type==='notes-toggle'){setShown(!shown);remember();respond({ok:true});}
    if(q.type==='notes-capture-start'){if(mode!=='select'){respond({ok:false,error:'请先完成或取消绘制 / 编辑，再导出图片。'});return;}dock.classList.add('hidden');caption.classList.add('hidden');respond({ok:true});}
    if(q.type==='notes-capture-end'){dock.classList.remove('hidden');caption.classList.toggle('hidden',mode==='select');respond({ok:true});}
  });
  sendMap('status');
  // Retry handshake while page SDK loads; do not invent coordinates if connection fails.
  const heartbeat=setInterval(()=>sendMap('status'),2000);
  window.addEventListener('pagehide',()=>clearInterval(heartbeat),{once:true});
})();
