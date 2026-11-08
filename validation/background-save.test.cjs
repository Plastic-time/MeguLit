const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('a superseded background paint cannot report INVALID_IMAGE after persistence succeeded',async()=>{
 const file=fs.readFileSync(path.join(__dirname,'../web/app.js'),'utf8'),source=file.slice(file.indexOf('async function editHomeBackground('),file.indexOf("addEventListener('tome-open-home-crop'")),calls=[],toasts=[];let options,renders=0;
 const context={backgroundEditRequest:0,currentBackgroundSrc:'old',backgroundPreview:null,locale:'zh',model:{background:{blur:3},preferences:{}},text:{saved:'saved'},
  api:async(action,params)=>{calls.push({action,params});return action==='asset_preview'?'new':action==='asset_set'?{src:'new'}:action==='home'?{preferences:{},background:{}}:{};},
  openBackgroundCrop:value=>{options=value;},applyBackground:async()=>false,setAppearance(){},renderRoute(){renders++;},toast:value=>toasts.push(value),errorMessage:err=>err.message,localStorage:{setItem(){}},document:{querySelector:()=>null}};
 vm.createContext(context);vm.runInContext(source,context);await context.editHomeBackground('fixture.png');await options.onCommit({x:50,y:50,zoom:1.2});
 assert(calls.some(c=>c.action==='asset_set'));assert(calls.some(c=>c.action==='settings_save'));assert(calls.some(c=>c.action==='save_preferences'));assert.deepEqual(toasts,['saved']);assert.equal(renders,1);assert.equal(context.currentBackgroundSrc,'new');
});
