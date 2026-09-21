/* Existing database and schema remain compatible. Deletion is revision-checked. */
(function(){
 let dbPromise;
 function db(){return dbPromise ||= new Promise((resolve,reject)=>{const r=indexedDB.open('amap-notes-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('projects',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
 async function list(trash=false){const d=await db();return new Promise((res,rej)=>{const t=d.transaction('projects'),r=t.objectStore('projects').getAll();r.onsuccess=()=>res(r.result.filter(p=>!p.purged&&(trash?!!p.deletedAt:!p.deletedAt)));r.onerror=()=>rej(r.error);});}
 async function mutate(id,revision,fn){const d=await db();return new Promise((resolve,reject)=>{const t=d.transaction('projects','readwrite'),s=t.objectStore('projects'),r=s.get(id);let reason,output;
 r.onsuccess=()=>{try{const old=r.result;if((old?.revision||0)!==revision)throw Error('另一个窗口已修改此项目。请导出当前备份，再点击“载入最新数据”。');output=fn(old);output.revision=revision+1;output.updatedAt=new Date().toISOString();s.put(output);}catch(e){reason=e;t.abort();}};
 t.oncomplete=()=>{window.NoteSync?.send({type:'changed',projectId:id});resolve(output);};t.onabort=()=>reject(reason||t.error||Error('本地保存失败'));t.onerror=()=>{reason=t.error;};});}
 const save=(p,r)=>mutate(p.id,r,old=>{if(old?.deletedAt||old?.purged)throw Error('此项目已移入回收站，不能覆盖。请先备份当前内容。');const out=NoteCore.validate(p);delete out.deletedAt;delete out.purged;return out;});
 const trash=(id,r)=>mutate(id,r,old=>{if(!old||old.deletedAt||old.purged)throw Error('项目已不存在或已删除。');return {...old,deletedAt:new Date().toISOString()};});
 const restore=(id,r)=>mutate(id,r,old=>{if(!old?.deletedAt||old.purged)throw Error('回收站项目不存在。');const out={...old};delete out.deletedAt;return out;});
 const purge=(id,r)=>mutate(id,r,old=>{if(!old?.deletedAt||old.purged)throw Error('只能永久删除回收站中的项目。');return {id,purged:true,deletedAt:old.deletedAt};});
 async function hasAny(){const d=await db();return new Promise((resolve,reject)=>{const r=d.transaction('projects').objectStore('projects').count();r.onsuccess=()=>resolve(r.result>0);r.onerror=()=>reject(r.error);});}
 window.NoteStore={list,save,trash,restore,purge,hasAny};
})();
