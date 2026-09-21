/* Transient drawing/edit session. Geometry is persisted only on explicit completion. */
(()=>{
  const C=NoteCore,NS='http://www.w3.org/2000/svg';
  const node=(name,attrs={},text)=>{const e=document.createElementNS(NS,name);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);if(text)e.textContent=text;return e;};
  class MapEditor{
    constructor({root,rpc,done,cancel,error}){
      Object.assign(this,{root,rpc,done,cancel,error});this.epoch=0;this.mode='select';this.coordinates=[];this.screens=[];this.handles=[];this.serial=Promise.resolve();this.hoverVersion=0;
      const style=document.createElement('style');style.textContent=`.dock{z-index:10}.edit-surface{z-index:2;pointer-events:none!important}.edit-input{position:fixed;inset:0;z-index:3;pointer-events:auto;touch-action:none;cursor:crosshair}.edit-input[hidden]{display:none!important}.edit-tools{position:fixed;z-index:12;left:50%;bottom:24px;transform:translateX(-50%);display:flex;align-items:center;gap:7px;flex-wrap:wrap;justify-content:center;max-width:calc(100vw - 30px);width:max-content;padding:10px;background:#fffef9;border:1px solid #cbd8cb;border-radius:13px;box-shadow:0 4px 24px #18382b22;pointer-events:auto;font:12px system-ui;color:#254c3e}.edit-tools button,.edit-tools input{font:12px system-ui;border:1px solid #d1ddd0;border-radius:7px;padding:8px;background:#fff;color:#254c3e}.edit-tools button{cursor:pointer}.edit-tools button:disabled{opacity:.4;cursor:not-allowed}.edit-tools .primary,.edit-tools .chosen{background:#19664f;color:#fff}.edit-tools input{width:130px}.edit-tools small{width:100%;text-align:center;color:#758272;font-size:11px}.edit-hint{position:fixed;z-index:15;max-width:270px;pointer-events:none;background:#173f33ed;color:white;border-radius:7px;padding:7px 10px;font:12px system-ui;box-shadow:0 2px 10px #173f3330}.edit-error{color:#b14d47!important}.edit-tools[hidden],.edit-surface[hidden],.edit-hint[hidden]{display:none!important}`;root.append(style);
      this.svg=node('svg',{'class':'edit-surface','aria-label':'绘制编辑图层'});this.svg.setAttribute('hidden','');root.append(this.svg);this.capture=document.createElement('div');this.capture.className='edit-input';this.capture.setAttribute('role','application');this.capture.setAttribute('aria-label','地图绘制区');this.capture.hidden=true;root.append(this.capture);
      this.tools=document.createElement('div');this.tools.className='edit-tools';this.tools.hidden=true;
      this.tools.innerHTML='<strong class="edit-title"></strong><button data-action="finish" class="primary">完成绘制</button><button data-action="back">退回一点</button><button data-action="move">整体移动</button><button data-action="remove">删除节点</button><input class="radius" aria-label="绘制半径" placeholder="半径：500米 / 1公里"><button data-action="cancel">取消</button><small class="edit-help"></small>';
      root.append(this.tools);this.hint=document.createElement('div');this.hint.className='edit-hint';this.hint.hidden=true;root.append(this.hint);
      this.buttons=Object.fromEntries([...this.tools.querySelectorAll('[data-action]')].map(b=>[b.dataset.action,b]));this.radiusInput=this.tools.querySelector('.radius');
      for(const[k,b]of Object.entries(this.buttons))b.onclick=()=>this.command(k);
      this.radiusInput.oninput=()=>{try{this.fixedRadius=this.radiusInput.value.trim()?C.parseRadius(this.radiusInput.value):null;this.radius=this.fixedRadius||this.radius;this.message='';this.redraw();}catch(e){this.message=e.message;this.updateTools();}};
      this.radiusInput.onkeydown=e=>{if(e.key==='Enter'){e.stopPropagation();this.command('finish');}};
      this.capture.addEventListener('pointerdown',e=>this.pointerDown(e));
      this.capture.addEventListener('pointermove',e=>this.pointerMove(e));
      this.capture.addEventListener('pointerup',e=>this.pointerUp(e));
      this.capture.addEventListener('pointercancel',()=>{if(this.drag){this.coordinates=this.drag.before;this.radius=this.drag.radius;}this.drag=null;this.redraw();});
      this.capture.addEventListener('dblclick',e=>{e.preventDefault();e.stopPropagation();if(['line','polygon'].includes(this.type)&&!this.edit)this.command('finish');});
      document.addEventListener('keydown',e=>{if(this.mode==='select'||this.isTyping(e))return;if(e.code==='Space'){e.preventDefault();this.space=true;this.capture.style.pointerEvents='none';this.help('松开空格继续绘制');return;}if(['Enter','Escape','Backspace','Delete'].includes(e.key)){e.preventDefault();this.key(e.key);}});
      document.addEventListener('keyup',e=>{if(e.code==='Space'){this.space=false;if(this.mode!=='select')this.capture.style.pointerEvents='auto';}});
      window.addEventListener('blur',()=>{this.space=false;this.capture.style.pointerEvents=this.mode==='select'?'none':'auto';if(this.drag){this.coordinates=this.drag.before;this.radius=this.drag.radius;this.drag=null;this.redraw();}});
    }
    isTyping(e){return e.composedPath().some(n=>n?.matches?.('input,textarea,select,[contenteditable="true"]'));}
    start({mode,target,color='#147d6b',move=false}){
      this.epoch++;this.hoverVersion++;this.latestHover=null;this.mode=mode;this.committing=false;this.edit=mode==='edit';this.type=this.edit?target.type:mode;this.target=target?C.clone(target):null;this.coordinates=this.edit?C.clone(target.coordinates):[];this.radius=target?.radius||0;this.fixedRadius=null;this.radiusInput.value='';this.selectedVertex=-1;this.move=move;this.drag=null;this.hover=null;this.screens=[];this.handles=[];this.message='';this.color=color;this.space=false;this.serial=Promise.resolve();this.lastClick=null;
      this.svg.toggleAttribute('hidden',mode==='select');this.capture.hidden=mode==='select';this.capture.style.pointerEvents=mode==='select'?'none':'auto';this.tools.hidden=mode==='select';this.hint.hidden=true;this.svg.replaceChildren();if(mode!=='select'){this.updateTools();this.redraw();}
    }
    queue(task){const epoch=this.epoch;this.serial=this.serial.then(async()=>{if(epoch===this.epoch)await task(epoch);}).catch(e=>{if(epoch===this.epoch){this.message=e.message;this.updateTools();this.error(e.message);}});return this.serial;}
    async pick(x,y){return (await this.rpc('pick',{x,y})).coordinate;}
    help(text){this.tools.querySelector('.edit-help').textContent=this.message||text;this.tools.querySelector('.edit-help').classList.toggle('edit-error',!!this.message);}
    updateTools(){
      if(this.mode==='select')return;const min=this.type==='polygon'?3:this.type==='line'?2:1;
      this.tools.querySelector('.edit-title').textContent=(this.edit?'编辑':'绘制')+(C.kinds[this.type]||'');
      this.buttons.finish.textContent=this.edit?'完成编辑':'完成绘制';this.buttons.finish.disabled=this.coordinates.length<min||(this.type==='circle'&&this.radius<1)||!!this.message;
      this.buttons.back.hidden=this.edit||!['line','polygon','circle'].includes(this.type);this.buttons.back.disabled=!this.coordinates.length;
      this.buttons.move.hidden=!this.edit;this.buttons.move.classList.toggle('chosen',this.move);this.buttons.move.textContent=this.move?'整体移动中':'整体移动';
      this.buttons.remove.hidden=!this.edit||!['line','polygon'].includes(this.type);this.buttons.remove.disabled=this.selectedVertex<0||this.coordinates.length<=min;
      this.radiusInput.hidden=this.type!=='circle';
      this.help(this.edit?(this.move?'拖动图形区域移动整体；完成后保存，取消不修改原图形。':'拖动白色节点；点击金色中点插入节点；选中节点后可删除。'):'Enter 完成 · Esc 取消 · Backspace 退回 · 按住空格拖动地图');
    }
    command(action){
      if(action==='cancel'){this.start({mode:'select'});this.cancel();return;}
      this.queue(async()=>{this.message='';if(action==='finish'){if(this.committing)return;if(this.type==='circle'&&this.radiusInput.value.trim())this.radius=C.parseRadius(this.radiusInput.value);C.shapeOK(this.type,this.coordinates,this.radius);const result={id:this.target?.id,geometryType:this.type,coordinates:C.clone(this.coordinates),radius:this.radius};this.committing=true;this.done(result);return;}
        if(action==='back'){this.coordinates.pop();this.radius=0;this.hover=null;}
        if(action==='move'){this.move=!this.move;this.selectedVertex=-1;}
        if(action==='remove'){this.coordinates=C.removeVertex(this.type,this.coordinates,this.selectedVertex);this.selectedVertex=-1;}
        this.redraw();});
    }
    key(key){if(this.mode==='select')return;if(key==='Escape')this.command('cancel');if(key==='Enter')this.command('finish');if(key==='Backspace'||key==='Delete')this.command(this.edit?'remove':'back');}
    pointerDown(e){
      if(e.button!==0||this.space)return;e.preventDefault();e.stopPropagation();this.capture.setPointerCapture(e.pointerId);
      const start={x:e.clientX,y:e.clientY,detail:e.detail};this.down=start;
      if(this.edit){const h=this.handles.find(h=>Math.hypot(h.x-e.clientX,h.y-e.clientY)<11);this.queue(async epoch=>{const coord=await this.pick(start.x,start.y);if(epoch!==this.epoch)return;this.message='';
        if(!this.move&&h?.kind==='mid'){if(this.coordinates.length>=2000)throw Error('每个图形最多 2,000 个节点。');this.coordinates.splice(h.index+1,0,coord);this.selectedVertex=h.index+1;}
        else if(!this.move&&h?.kind==='vertex')this.selectedVertex=h.index;
        else if(!this.move&&h?.kind!=='radius'){this.selectedVertex=-1;this.redraw();return;}
        this.drag={start:coord,before:C.clone(this.coordinates),radius:this.radius,kind:this.move?'move':h?.kind==='radius'?'radius':'vertex',index:this.selectedVertex};this.redraw();});}
    }
    pointerMove(e){
      if(this.mode==='select'||this.space)return;this.cursor={x:e.clientX,y:e.clientY};this.hint.hidden=false;this.hint.style.left=Math.min(e.clientX+17,Math.max(8,innerWidth-280))+'px';this.hint.style.top=Math.max(8,Math.min(e.clientY+20,innerHeight-70))+'px';
      const seq=++this.hoverVersion,epoch=this.epoch;
      // At most one hover conversion in flight; latest cursor will be processed next.
      this.latestHover={x:e.clientX,y:e.clientY,seq,epoch};this.pumpHover();
    }
    async pumpHover(){if(this.hoverBusy||!this.latestHover)return;this.hoverBusy=true;const v=this.latestHover;this.latestHover=null;
      try{const coord=await this.pick(v.x,v.y);if(v.epoch!==this.epoch||this.mode==='select'||v.seq!==this.hoverVersion)return;this.hover=coord;
        if(this.edit&&this.drag){const d=this.drag;if(d.kind==='move')this.coordinates=C.translateShape(d.before,d.start,coord);else if(d.kind==='radius')this.radius=Math.max(1,C.distance(this.coordinates[0],coord));else this.coordinates[d.index]=coord;}
        else if(this.type==='circle'&&this.coordinates.length&&!this.edit)this.radius=this.fixedRadius||C.distance(this.coordinates[0],coord);
        this.redraw();
      }catch(e){if(v.epoch===this.epoch){this.message=e.message;this.updateTools();}}finally{this.hoverBusy=false;this.pumpHover();}}
    pointerUp(e){
      if(!this.down)return;e.preventDefault();e.stopPropagation();const d=this.down;this.down=null;const end={x:e.clientX,y:e.clientY};
      this.hoverVersion++;this.latestHover=null;
      this.queue(async epoch=>{
        if(this.edit){if(!this.drag)return;const coord=await this.pick(end.x,end.y);if(epoch!==this.epoch)return;const drag=this.drag;if(!drag)return;if(drag.kind==='move')this.coordinates=C.translateShape(drag.before,drag.start,coord);else if(drag.kind==='radius')this.radius=Math.max(1,C.distance(this.coordinates[0],coord));else this.coordinates[drag.index]=coord;this.drag=null;this.message='';this.redraw();return;}
        if(Math.hypot(end.x-d.x,end.y-d.y)>6||d.detail>1)return;const now=performance.now();if(this.lastClick&&now-this.lastClick.time<400&&Math.hypot(this.lastClick.x-end.x,this.lastClick.y-end.y)<5)return;this.lastClick={...end,time:now};
        if(this.type==='polygon'&&this.coordinates.length>=3&&this.screens[0]&&Math.hypot(this.screens[0][0]-end.x,this.screens[0][1]-end.y)<12){this.command('finish');return;}
        const coord=await this.pick(end.x,end.y);if(epoch!==this.epoch)return;this.message='';
        if(this.type==='circle'&&this.coordinates.length){this.radius=this.fixedRadius||C.distance(this.coordinates[0],coord);this.command('finish');return;}
        if(this.coordinates.length&&C.distance(this.coordinates.at(-1),coord)<.01)return;
        this.coordinates.push(coord);this.hover=coord;
        if(['point','text'].includes(this.type))this.command('finish');else this.redraw();
      });
    }
    redraw(){
      this.updateTools();if(this.mode==='select')return;if(this.renderQueued)return;this.renderQueued=true;
      requestAnimationFrame(async()=>{this.renderQueued=false;const epoch=this.epoch,version=(this.renderVersion||0)+1;this.renderVersion=version;
        const coords=C.clone(this.coordinates),hover=this.hover?.slice(),type=this.type,radius=this.radius;
        const path=type==='circle'&&coords.length&&radius>=1?C.ring(coords[0],Math.min(radius,1000000)):coords;
        const mids=this.edit&&['line','polygon'].includes(type)?coords.slice(0,type==='polygon'?coords.length:-1).map((a,i)=>{const b=coords[(i+1)%coords.length];return[(a[0]+b[0])/2,(a[1]+b[1])/2];}):[];
        const all=[...path,...coords,...mids,...(hover?[hover]:[])];
        try{const data=await this.rpc('project',{items:Array.from({length:Math.ceil(all.length/2000)},(_,i)=>({id:'editor-'+i,coordinates:all.slice(i*2000,(i+1)*2000)}))});if(epoch!==this.epoch||version!==this.renderVersion||this.mode==='select')return;
          const points=data.items.flatMap(item=>item.points),shape=points.slice(0,path.length);this.screens=points.slice(path.length,path.length+coords.length);const middle=points.slice(path.length+coords.length,path.length+coords.length+mids.length),mouse=hover?points.at(-1):null;this.svg.replaceChildren();this.handles=[];Object.assign(this.capture.style,{inset:'auto',left:data.rect.x+'px',top:data.rect.y+'px',width:data.rect.width+'px',height:data.rect.height+'px'});
          const defs=node('defs'),clip=node('clipPath',{id:'edit-map-clip'});clip.append(node('rect',data.rect));defs.append(clip);this.svg.append(defs);const group=node('g',{'clip-path':'url(#edit-map-clip)'});this.svg.append(group);
          group.append(node('rect',{...data.rect,fill:'transparent','pointer-events':'all'}));
          const drawPath=(name,p,attrs)=>{if(p.length)group.append(node(name,{points:p.map(p=>p.join(',')).join(' '),stroke:this.color,'stroke-width':2.5,'stroke-linejoin':'round',fill:'none',...attrs}));};
          if(type==='circle'&&shape.length>1)drawPath('polygon',shape,{fill:this.color,'fill-opacity':.12,'stroke-dasharray':this.edit?'':'7 5'});
          if(type==='polygon'&&coords.length){const fillPath=!this.edit&&mouse?[...this.screens,mouse]:this.screens;drawPath('polygon',fillPath,{fill:this.color,'fill-opacity':.14,stroke:'none'});drawPath(this.edit?'polygon':'polyline',this.screens,{});}
          if(type==='line')drawPath('polyline',this.screens,{});
          if(!this.edit&&mouse&&this.screens.length&&['line','polygon'].includes(type)){const rubber=[this.screens.at(-1),mouse];if(type==='polygon')rubber.push(this.screens[0]);drawPath('polyline',rubber,{'stroke-dasharray':'7 5'});}
          const handle=(p,kind,index,fill,r=6)=>{group.append(node('circle',{cx:p[0],cy:p[1],r,fill,stroke:this.color,'stroke-width':2}));this.handles.push({x:p[0],y:p[1],kind,index});};
          this.screens.forEach((p,i)=>handle(p,'vertex',i,i===this.selectedVertex?'#e9a64c':'#fff',!this.edit&&i===0&&type==='polygon'?8:6));
          middle.forEach((p,i)=>handle(p,'mid',i,'#e9c06f',4));
          if(this.edit&&type==='circle'&&shape.length>16)handle(shape[16],'radius',0,'#e9c06f',7);
          if(mouse&&!this.edit){group.append(node('circle',{cx:mouse[0],cy:mouse[1],r:4,fill:this.color,stroke:'#fff','stroke-width':2}));}
          let hint=this.edit?(this.move?'拖动以移动整个图形':'白点可拖动 · 金色中点可添加节点'):coords.length?'点击添加节点':'点击放置起点';
          if(type==='polygon'&&coords.length>=3)hint='点击起点闭合，或 Enter 完成';
          if(type==='circle')hint=!coords.length?'点击确定圆心':`${Math.round(radius)} 米 · 再点击确定，或输入半径`;
          if(['point','text'].includes(type))hint='点击地图放置'+C.kinds[type];this.hint.textContent=hint;
        }catch(e){if(epoch===this.epoch){this.message=e.message;this.updateTools();}}
      });
    }
  }
  window.NoteMapEditor=MapEditor;
})();
