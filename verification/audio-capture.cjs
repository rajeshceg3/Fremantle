const fs=require('fs'), assert=require('node:assert'), pp=require('puppeteer-core'),{spawn}=require('child_process');
(async()=>{let server,b;try{
 if(!process.env.URL){server=spawn('python3',['-m','http.server','8832'],{cwd:'dist',stdio:'ignore'});await new Promise(r=>setTimeout(r,350))}
 b=await pp.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const p=await b.newPage(), errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:390,height:844});
 await p.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
 await p.evaluateOnNewDocument(()=>{const connect=AudioNode.prototype.connect;AudioNode.prototype.connect=function(d,...a){const r=connect.call(this,d,...a);if(d instanceof AudioDestinationNode){if(!this.context.__tee)this.context.__tee=this.context.createMediaStreamDestination();window.__tee=this.context.__tee;connect.call(this,this.context.__tee)}return r}});
 await p.goto(process.env.URL||'http://127.0.0.1:8832',{waitUntil:'networkidle0'});await p.waitForFunction(()=>window.__world);
 assert.equal(await p.evaluate(()=>window.__world.state.audio),'not-created');
 await p.evaluate(()=>window.__world.owner.setPaused(false));await p.click('#sound');await p.waitForFunction(()=>window.__world.state.audio==='running');
 fs.mkdirSync('/downloads/fremantle-audio',{recursive:true});
 for(let i=0;i<4;i++){
  await p.select('#view',String(i));await new Promise(r=>setTimeout(r,2800));
  // Each voice is exercised explicitly, in addition to the live scheduler.
  await p.evaluate(()=>{const a=window.__world.owner.audio;const old=a.rng;for(const value of [.01,.5,.99]){a.rng=()=>value;a.playVoice(a.realm)}a.rng=old});
  const bytes=await p.evaluate(async()=>{const chunks=[],r=new MediaRecorder(window.__tee.stream);r.ondataavailable=e=>chunks.push(e.data);const done=new Promise(ok=>r.onstop=ok);r.start();await new Promise(ok=>setTimeout(ok,4000));r.stop();await done;return [...new Uint8Array(await new Blob(chunks,{type:r.mimeType}).arrayBuffer())]});
  fs.writeFileSync('/downloads/fremantle-audio/fremantle-app-'+i+'.webm',Buffer.from(bytes));
 }
 await p.click('#sound');await p.waitForFunction(()=>window.__world.state.audio==='suspended');await p.click('#sound');await p.waitForFunction(()=>window.__world.state.audio==='running');await p.click('#sound');await p.waitForFunction(()=>window.__world.state.audio==='suspended');assert.deepEqual(errors,[]);
 await p.screenshot({path:'/downloads/fremantle-audio/controls-390.png'});console.log('PASS all four places and voices, silent start, opt-in, suspend/replay, no errors');
}finally{await b?.close();server?.kill()}})().catch(e=>{console.error(e);process.exit(1)});
