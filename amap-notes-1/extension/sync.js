/* Extension ports bridge the iframe and manager; dev pages use the same-origin channel. */
(()=>{
 const id=crypto.randomUUID(),listeners=new Set();let port,channel;
 const receive=q=>{if(q?.sender===id)return;for(const fn of listeners)fn(q);};
 function connect(){port=chrome.runtime.connect({name:'notes-sync'});port.onMessage.addListener(receive);port.onDisconnect.addListener(()=>{port=null;setTimeout(connect,1000);});}
 if(globalThis.chrome?.runtime?.id)connect();else{channel=new BroadcastChannel('notes-sync-v013');channel.onmessage=e=>receive(e.data);}
 window.NoteSync={id,on:fn=>listeners.add(fn),send:q=>{const msg={...q,sender:id};if(channel)channel.postMessage(msg);else try{port?.postMessage(msg);}catch{};}};
})();
