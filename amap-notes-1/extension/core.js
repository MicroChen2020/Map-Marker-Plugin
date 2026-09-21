/* Pure data model. No dependency on AMap, browser storage or UI. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NoteCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const uid = () => crypto.randomUUID();
  const clone = x => JSON.parse(JSON.stringify(x));
  const colors = ['#147d6b', '#d18a39', '#6576b8', '#cc6572', '#67904f'];
  const kinds = { point: '点位', line: '线段', polygon: '区域', circle: '半径圈', text: '文字' };
  function project(name = '我的区位图', template = '综合') {
    const names = { 综合: ['重点点位', '酒店', '公共设施', '交通', '其他'], 地产: ['项目地块', '住宅', '商业', '交通', '公共设施'], 旅游: ['景点', '酒店', '餐饮', '交通', '游览路线'], 城市规划: ['规划范围', '公共设施', '绿地', '交通', '现状用地'] }[template];
    return { id: uid(), name, schemaVersion: 1, crs: 'GCJ-02', revision: 0, updatedAt: new Date().toISOString(), categories: (names || ['其他']).map((name,i)=>({id:uid(),name,color:colors[i%5],visible:true})), features: [] };
  }
  function feature(type, coordinates, categoryId) {
    return { id:uid(), type, coordinates, categoryId, name:`未命名${kinds[type]}`, notes:'', tags:[], fields:{}, photos:[], radius:1000, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() };
  }
  const coordOK = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 85;
  const text = (s,max=5000) => typeof s === 'string' && s.length <= max;
  function validate(p) {
    if (!p || p.schemaVersion !== 1 || p.crs !== 'GCJ-02') throw Error('仅支持版本 1、GCJ-02 坐标的项目文件。');
    if (!text(p.id,100) || !p.id || !text(p.name,200) || !p.name.trim()) throw Error('项目编号或名称无效。');
    if (!Array.isArray(p.categories) || !p.categories.length || p.categories.length > 100) throw Error('分类数量应为 1–100。');
    const ids = new Set();
    for (const c of p.categories) {
      if (!text(c.id,100) || !c.id || ids.has(c.id) || !text(c.name,100) || !c.name.trim() || !/^#[0-9a-f]{6}$/i.test(c.color) || typeof c.visible !== 'boolean') throw Error('分类数据无效或编号重复。');
      ids.add(c.id);
    }
    if (!Array.isArray(p.features) || p.features.length > 10000) throw Error('每个项目最多 10,000 个标注。');
    const fids = new Set();
    for (const f of p.features) {
      if (!text(f.id,100) || !f.id || fids.has(f.id) || !Object.hasOwn(kinds,f.type) || !ids.has(f.categoryId) || !text(f.name,200) || !f.name.trim()) throw Error('标注编号、分类、类型或名称无效。');
      fids.add(f.id);
      const min = f.type==='polygon'?3:f.type==='line'?2:1;
      if (!Array.isArray(f.coordinates) || f.coordinates.length<min || f.coordinates.length>2000 || !f.coordinates.every(coordOK) || (min===1 && f.coordinates.length!==1)) throw Error(`“${f.name}”坐标无效。`);
      if (f.type==='circle' && (!Number.isFinite(f.radius) || f.radius<1 || f.radius>1000000)) throw Error('半径必须在 1–1,000,000 米之间。');
      if (!text(f.notes,20000) || !Array.isArray(f.tags) || f.tags.length>100 || !f.tags.every(t=>text(t,100))) throw Error('备注或标签格式无效。');
      if (!f.fields || Array.isArray(f.fields) || typeof f.fields!=='object' || Object.keys(f.fields).length>100 || Object.entries(f.fields).some(([k,v])=> !text(k,100) || !k || ['__proto__','constructor','prototype'].includes(k) || !['string','number','boolean'].includes(typeof v) || (typeof v==='number'&&!Number.isFinite(v)) || String(v).length>10000)) throw Error('自定义字段无效。');
      if (!Array.isArray(f.photos) || f.photos.length>20 || f.photos.some(a=>!text(a.id,100)||!text(a.name,200)||!text(a.data,4000000)||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(a.data))) throw Error('照片无效；每个标注最多 20 张 JPEG / PNG / WebP。');
    }
    const serialized=JSON.stringify(p);if(new TextEncoder().encode(serialized).byteLength>90*1024*1024)throw Error('项目已超过 90 MB，请拆分为多个项目。');
    return JSON.parse(serialized);
  }
  function ring(center, radius) {
    const [lng,lat] = center, r = radius / 6371008.8, phi = lat*Math.PI/180, lambda=lng*Math.PI/180;
    return Array.from({length:65},(_,i)=>{ const b=i/64*Math.PI*2; const p=Math.asin(Math.sin(phi)*Math.cos(r)+Math.cos(phi)*Math.sin(r)*Math.cos(b)); const l=lambda+Math.atan2(Math.sin(b)*Math.sin(r)*Math.cos(phi),Math.cos(r)-Math.sin(phi)*Math.sin(p)); return [((l*180/Math.PI+540)%360)-180,p*180/Math.PI]; });
  }
  function visible(p,query='') {
    const cats = new Set(p.categories.filter(c=>c.visible).map(c=>c.id));
    const q=query.trim().toLocaleLowerCase();
    return p.features.filter(f=>cats.has(f.categoryId) && (!q || [f.name,f.notes,...f.tags,...Object.values(f.fields)].join(' ').toLocaleLowerCase().includes(q)));
  }
  function parseCSV(input) {
    input=input.replace(/^\uFEFF/,''); const rows=[]; let row=[],value='',quoted=false,closed=false;
    for (let i=0;i<input.length;i++) {
      const c=input[i];
      if (quoted) { if(c==='"') {if(input[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}else value+=c; }
      else if(c==='"'){if(value||closed)throw Error('CSV 引号格式错误。');quoted=true;}
      else if(c===',' || c==='\n' || c==='\r') {row.push(value);value='';closed=false;if(c!==','){if(c==='\r'&&input[i+1]==='\n')i++;if(row.some(v=>v!==''))rows.push(row);row=[];}}
      else {if(closed)throw Error('CSV 引号后存在多余字符。');value+=c;}
    }
    if(quoted)throw Error('CSV 存在未闭合引号。');
    row.push(value);if(row.some(v=>v!==''))rows.push(row);
    if(rows.length<2)throw Error('CSV 至少包含表头和一行数据。');
    if(new Set(rows[0]).size!==rows[0].length)throw Error('CSV 表头不能重复。');
    return rows;
  }
  const headers=['id','name','longitude','latitude','crs','category','tags','notes','fields'];
  // Prevent spreadsheet formula execution. Reimport removes exactly our escape prefix.
  const safeCell = v => {let s=String(v??'');if(/^[\s]*[=+\-@]/.test(s)||s.startsWith("'"))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  const decodeCell = s => s.startsWith("'") && (/^[\s]*[=+\-@]/.test(s.slice(1))||s[1]==="'") ? s.slice(1):s;
  function toCSV(p,features=p.features) {
    return '\uFEFF'+[headers.join(','),...features.filter(f=>f.type==='point').map(f=>[f.id,f.name,...f.coordinates[0],p.crs,p.categories.find(c=>c.id===f.categoryId)?.name,JSON.stringify(f.tags),f.notes,JSON.stringify(f.fields)].map(safeCell).join(','))].join('\r\n');
  }
  function planCSV(p,input,mapping) {
    const rows=parseCSV(input), head=rows.shift();
    const map=mapping || Object.fromEntries(headers.map(h=>[h,head.indexOf(h)]));
    if(['name','longitude','latitude','crs'].some(h=>!Number.isInteger(map[h])||map[h]<0))throw Error('必须映射名称、经度、纬度、坐标系。');
    const next=clone(p), errors=[], seen=new Set();let added=0,updated=0;
    rows.forEach((r,i)=>{
      try {
        if(r.length!==head.length)throw Error('列数与表头不一致');
        const get=k=>decodeCell(r[map[k]]??'');
        if(get('crs').trim().toUpperCase()!=='GCJ-02')throw Error('坐标系必须为 GCJ-02，不自动转换其他坐标');
        const name=get('name').trim(), lng=get('longitude').trim(),lat=get('latitude').trim();
        if(!name||!lng||!lat||!coordOK([Number(lng),Number(lat)]))throw Error('名称或经纬度无效');
        const id=get('id').trim()||uid();if(seen.has(id))throw Error('文件内编号重复');seen.add(id);
        const existing=next.features.find(f=>f.id===id);if(existing&&existing.type!=='point')throw Error('编号与非点位标注冲突');
        const cname=get('category').trim();let cat=next.categories.find(c=>c.name===cname);
        if(!cat && cname){cat={id:uid(),name:cname,color:colors[next.categories.length%5],visible:true};next.categories.push(cat);}
        const f=existing || feature('point',[[Number(lng),Number(lat)]],(cat||next.categories[0]).id);
        f.id=id;f.name=name;f.coordinates=[[Number(lng),Number(lat)]];if(cat)f.categoryId=cat.id;
        // Empty optional cells preserve existing values. Explicit [] / {} clear structured values.
        if(get('notes'))f.notes=get('notes');if(get('tags'))f.tags=JSON.parse(get('tags'));if(get('fields'))f.fields=JSON.parse(get('fields'));
        f.updatedAt=new Date().toISOString();if(existing)updated++;else{next.features.push(f);added++;}
      }catch(e){errors.push(`第 ${i+2} 行：${e.message}`);}
    });
    if(!errors.length){try{validate(next);}catch(e){errors.push(e.message);}}
    return {project:next,added,updated,errors};
  }
  function backup(p){return JSON.stringify({format:'amap-notes',version:1,exportedAt:new Date().toISOString(),project:validate(p)});}
  function restore(s){const b=JSON.parse(s);if(b.format!=='amap-notes'||b.version!==1)throw Error('不是区位笔记备份文件。');const p=validate(b.project);p.id=uid();p.name=`${p.name.slice(0,190)} · 恢复`;p.revision=0;return p;}
  function distance(a,b){const r=Math.PI/180,p1=a[1]*r,p2=b[1]*r,dp=(b[1]-a[1])*r,dl=(b[0]-a[0])*r;const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 12742017.6*Math.asin(Math.sqrt(Math.min(1,h)));}
  function parseRadius(value){const m=String(value).trim().match(/^(\d+(?:\.\d+)?)\s*(km|公里|千米|m|米)?$/i);if(!m)throw Error('请输入半径，例如 500 米或 1 公里。');const n=Number(m[1])*(/^(km|公里|千米)$/i.test(m[2]||'')?1000:1);if(n<1||n>1000000)throw Error('半径应为 1–1,000,000 米。');return n;}
  function shapeOK(type,coordinates,radius){
    const min=type==='polygon'?3:type==='line'?2:1;
    if(!Object.hasOwn(kinds,type)||!Array.isArray(coordinates)||coordinates.length<min||coordinates.length>2000||!coordinates.every(coordOK)||(min===1&&coordinates.length!==1))throw Error('图形顶点数量或坐标无效。');
    if(type==='circle'&&(!Number.isFinite(radius)||radius<1||radius>1000000))throw Error('请设置至少 1 米的半径。');
    if(min>1){for(let i=1;i<coordinates.length;i++)if(distance(coordinates[i-1],coordinates[i])<.01)throw Error('相邻节点不能重合。');}
    if(type==='polygon'){const o=coordinates[0];let area=0;coordinates.forEach((p,i)=>{const q=coordinates[(i+1)%coordinates.length];area+=(p[0]-o[0])*(q[1]-o[1])-(q[0]-o[0])*(p[1]-o[1]);});if(Math.abs(area)<1e-14)throw Error('区域至少需要三个不共线的节点。');}
    return true;
  }
  function translateShape(coords,from,to){const dx=to[0]-from[0],dy=to[1]-from[1];const out=coords.map(p=>[p[0]+dx,p[1]+dy]);if(!out.every(coordOK))throw Error('移动超出支持的经纬度范围。');return out;}
  function removeVertex(type,coords,index){const min=type==='polygon'?3:type==='line'?2:1;if(!['line','polygon'].includes(type)||coords.length<=min)throw Error(type==='polygon'?'区域至少保留 3 个节点。':'线段至少保留 2 个节点。');if(!Number.isInteger(index)||index<0||index>=coords.length)throw Error('请先选中节点。');return coords.filter((_,i)=>i!==index);}
  function removeCategory(p,id,targetId=null,deleteObjects=false){
    if(p.categories.length<=1)throw Error('最后一个分类需要保留，可以重命名。');
    if(!p.categories.some(c=>c.id===id))throw Error('分类不存在。');
    const affected=p.features.filter(f=>f.categoryId===id);
    if(affected.length&&!deleteObjects&&(targetId===id||!p.categories.some(c=>c.id===targetId)))throw Error('请选择接收标注的目标分类。');
    const next=clone(p);next.categories=next.categories.filter(c=>c.id!==id);
    if(deleteObjects)next.features=next.features.filter(f=>f.categoryId!==id);else for(const f of next.features)if(f.categoryId===id)f.categoryId=targetId;
    return validate(next);
  }
  return {distance,parseRadius,shapeOK,translateShape,removeVertex,removeCategory,uid,clone,project,feature,validate,coordOK,ring,visible,kinds,parseCSV,toCSV,planCSV,backup,restore,headers};
});
