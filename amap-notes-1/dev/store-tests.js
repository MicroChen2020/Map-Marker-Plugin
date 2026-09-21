(async()=>{
 const C=NoteCore,S=NoteStore,results=document.querySelector('#results'),lines=[],ids=[];
 const check=(v,text)=>{if(!v)throw Error(text);lines.push('PASS '+text);results.textContent=lines.join('\n');};
 const reject=async(fn,text)=>{let failed=false;try{await fn();}catch{failed=true;}check(failed,text);};
 try{
 const p=C.project('独立存储测试 '+crypto.randomUUID());ids.push(p.id);const f=C.feature('point',[[120,30]],p.categories[0].id);f.photos=[{id:'photo',name:'fixture.png',data:'data:image/png;base64,YQ=='}];p.features.push(f);
 const first=await S.save(p,0);check(first.revision===1,'新项目首次保存产生版本号');
 await reject(()=>S.save({...first,name:'旧窗口'},0),'过期版本不能覆盖');
 const concurrent=await Promise.allSettled([S.save({...first,name:'窗口A'},1),S.save({...first,name:'窗口B'},1)]);check(concurrent.filter(x=>x.status==='fulfilled').length===1,'同时保存只有一个成功');
 const latest=(await S.list()).find(x=>x.id===p.id),trashed=await S.trash(p.id,latest.revision);check(!(await S.list()).some(x=>x.id===p.id),'删除后正常列表隐藏项目');check((await S.list(true)).find(x=>x.id===p.id).features[0].photos[0].data===f.photos[0].data,'回收站保留照片字节');
 await reject(()=>S.save(latest,latest.revision),'删除后旧窗口不能复活项目');
 const restored=await S.restore(p.id,trashed.revision);check((await S.list()).some(x=>x.id===p.id),'恢复保留项目编号');check(restored.features[0].id===f.id&&restored.features[0].photos[0].data===f.photos[0].data,'恢复保留标注编号和照片');
 await reject(()=>S.purge(p.id,restored.revision),'正常项目不能直接永久删除');
 const removed=await S.trash(p.id,restored.revision);await S.purge(p.id,removed.revision);check(!(await S.list(true)).some(x=>x.id===p.id),'永久删除从回收站移除');await reject(()=>S.save(p,0),'永久删除后旧副本不能重新创建同编号项目');
 lines.push('全部 11 项真实 IndexedDB 检查通过。');results.textContent=lines.join('\n');
 }catch(e){results.textContent=lines.join('\n')+'\nFAIL '+e.message;}finally{for(const id of ids){try{const active=(await S.list()).find(x=>x.id===id);if(active)await S.trash(id,active.revision);const trash=(await S.list(true)).find(x=>x.id===id);if(trash)await S.purge(id,trash.revision);}catch{}}}
})();
