const {EventEmitter}=require('node:events');

module.exports=function hookBridgeChild(){
 const child=new EventEmitter();
 child.stdin={write(){},end(){
  child.exitCode=0;
  child.emit('exit',0,null);
 }};
 return child;
};
