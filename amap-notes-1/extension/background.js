chrome.runtime.onMessage.addListener((q,sender,respond)=>{
  if(q?.type!=='capture'||sender.id!==chrome.runtime.id||sender.url!==chrome.runtime.getURL('popup.html'))return;
  (async()=>{
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if(!tab?.id||!/^https:\/\/(www\.)?amap\.com\//.test(tab.url||''))throw Error('请先打开高德地图网页。');
    try{
      const prepared=await chrome.tabs.sendMessage(tab.id,{type:'notes-capture-start'});if(!prepared?.ok)throw Error(prepared?.error||'工作台未准备好');
      await new Promise(r=>setTimeout(r,250));
      const [active]=await chrome.tabs.query({active:true,windowId:tab.windowId});if(active?.id!==tab.id)throw Error('当前标签页已变化，请重新导出。');
      const data=await chrome.tabs.captureVisibleTab(tab.windowId,{format:'png'});respond({data});
    }finally{await chrome.tabs.sendMessage(tab.id,{type:'notes-capture-end'}).catch(()=>{});}
  })().catch(e=>respond({error:e.message}));return true;
});

const peers=new Set();
chrome.runtime.onConnect.addListener(port=>{
 if(port.name!=='notes-sync'||port.sender?.id!==chrome.runtime.id||!port.sender.url?.startsWith(chrome.runtime.getURL('panel.html')))return;
 peers.add(port);port.onDisconnect.addListener(()=>peers.delete(port));
 port.onMessage.addListener(q=>{if(!q||!['changed','presence','choose','map-select'].includes(q.type))return;for(const other of peers)if(other!==port)try{other.postMessage(q);}catch{}});
});
let openingManager;
chrome.runtime.onMessage.addListener((q,sender,respond)=>{
 if(q?.type!=='open-manager'||sender.id!==chrome.runtime.id||(!sender.url?.startsWith(chrome.runtime.getURL('panel.html'))&&sender.url!==chrome.runtime.getURL('popup.html')))return;
 openingManager ||= (async()=>{
  const url=chrome.runtime.getURL('panel.html')+'?manager=1';
  const windows=await chrome.windows.getAll({populate:true});
  for(const w of windows){const tab=w.tabs?.find(t=>t.url?.startsWith(url));if(tab){await chrome.windows.update(w.id,{focused:true});await chrome.tabs.update(tab.id,{active:true});return;}}
  await chrome.windows.create({url:url+'&project='+encodeURIComponent(typeof q.projectId==='string'?q.projectId.slice(0,100):''),type:'popup',width:1280,height:820});
 })().finally(()=>{openingManager=null;});
 openingManager.then(()=>respond({ok:true}),e=>respond({error:e.message}));return true;
});
