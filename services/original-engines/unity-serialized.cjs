// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E700 Unity SerializedFile reader (the format of resources.assets / sharedassets*.assets / level* and of the CAB-* node
   inside an AssetBundle), after AssetStudio / AssetRipper / UnityPy: header, type table with its optional type tree,
   object table. parse(buf) → { version, unity, typeTree, objects:[{id, type, offset, size}] } with type = Unity class id
   (49 TextAsset, 114 MonoBehaviour, 115 MonoScript, ...). textAsset(buf,obj) → {name, text:Buffer} and
   strings(buf,obj) → the readable strings of an object, from its type tree when the file keeps one and from a
   length-prefixed string scan when it does not (release players usually strip the tree). */
const COMMON=['AABB','AnimationClip','AnimationCurve','AnimationState','Array','Base','BitField','bitset','bool','char','ColorRGBA','Component','data','deque','double','dynamic_array','FastPropertyName','first','float','Font','GameObject','Generic Mono','GradientNEW','GUID','GUIStyle','int','list','long long','map','Matrix4x4f','MdFour','MonoBehaviour','MonoScript','m_ByteSize','m_Curve','m_EditorClassIdentifier','m_EditorHideFlags','m_Enabled','m_ExtensionPtr','m_GameObject','m_Index','m_IsArray','m_IsStatic','m_MetaFlag','m_Name','m_ObjectHideFlags','m_PrefabInternal','m_PrefabParentObject','m_Script','m_StaticEditorFlags','m_Type','m_Version','Object','pair','PPtr<Component>','PPtr<GameObject>','PPtr<Material>','PPtr<MonoBehaviour>','PPtr<MonoScript>','PPtr<Object>','PPtr<Prefab>','PPtr<Sprite>','PPtr<TextAsset>','PPtr<Texture>','PPtr<Texture2D>','PPtr<Transform>','Prefab','Quaternionf','Rectf','RectInt','RectOffset','second','set','short','size','SInt16','SInt32','SInt64','SInt8','staticvector','string','TextAsset','TextMesh','Texture','Texture2D','Transform','TypelessData','UInt16','UInt32','UInt64','UInt8','unsigned int','unsigned long long','unsigned short','vector','Vector2f','Vector3f','Vector4f','m_ScriptingClassIdentifier','Gradient','Type*','int2_storage','int3_storage','BoundsInt','m_CorrespondingSourceObject','m_PrefabInstance','m_PrefabAsset','FileSize','Hash128'];
const COMMON_AT=(()=>{const m=new Map();let o=0;for(const s of COMMON){m.set(o,s);o+=s.length+1;}return m;})();

function parse(buf,{externals=false,layout=false}={}){
 let p=0;const be=()=>{const v=buf.readUInt32BE(p);p+=4;return v;};
 let metaSize=be(),fileSize=be();const version=be();let dataOffset=be();let little=true;
 if(version<9||version>40)return null;
 if(version>=9){little=buf[p]===0;p+=4;}
 if(version>=22){metaSize=be();fileSize=Number(buf.readBigUInt64BE(p));p+=8;dataOffset=Number(buf.readBigUInt64BE(p));p+=8;p+=8;}
 const i32=()=>{const v=little?buf.readInt32LE(p):buf.readInt32BE(p);p+=4;return v;};
 const u32=()=>{const v=little?buf.readUInt32LE(p):buf.readUInt32BE(p);p+=4;return v;};
 const i16=()=>{const v=little?buf.readInt16LE(p):buf.readInt16BE(p);p+=2;return v;};
 const u16=()=>{const v=little?buf.readUInt16LE(p):buf.readUInt16BE(p);p+=2;return v;};
 const i64=()=>{const v=little?buf.readBigInt64LE(p):buf.readBigInt64BE(p);p+=8;return Number(v);};
 let unity='';if(version>=7){const e=buf.indexOf(0,p);unity=buf.toString('latin1',p,e);p=e+1;}
 if(version>=8)p+=4;
 let typeTree=true;if(version>=13)typeTree=buf[p++]!==0;
 const nTypes=i32();if(nTypes<0||nTypes>10000)return null;const types=[];
 for(let i=0;i<nTypes;i++){const t={classId:i32(),tree:null};
  if(version>=16)p++;if(version>=17)t.scriptIndex=i16();
  if(version>=13){if(version<16&&t.classId<0||version>=16&&t.classId===114||version>=17&&t.scriptIndex>=0)p+=16;p+=16;}
  if(typeTree)t.tree=readTree(buf,p,version,little,r=>{p=r;});types.push(t);}
 if(version>=7&&version<14)p+=4;
 const n=i32();if(n<0||n>5000000)return null;const objects=[];
 for(let i=0;i<n;i++){if(version>=14)p=(p+3)&~3;const o={};o.id=version>=14?i64():version>=7?(i32()):0;
  const offsetAt=p;o.offset=(version>=22?i64():u32())+dataOffset;const sizeAt=p;o.size=u32();
  if(layout){o.offsetAt=offsetAt;o.sizeAt=sizeAt;}
  if(version>=16){const ti=i32();o.type=types[ti]?.classId??-1;o.tree=types[ti]?.tree||null;o.scriptIndex=types[ti]?.scriptIndex;}else{const tid=i32();const t=types.find(x=>x.classId===tid);o.type=t?t.classId:tid;o.tree=t?.tree||null;i16();if(version>=11)i16();if(version>=15)p++;}
  objects.push(o);}
 const result={version,unity,typeTree,little,objects};
 if(layout)Object.assign(result,{dataOffset,fileSize});
 if(externals&&version>=17){
  const limit=Math.min(dataOffset,buf.length),scripts=i32();
  if(scripts<0||scripts>(limit-p)/12)return null;
  for(let i=0;i<scripts;i++){p+=4;p=(p+3)&~3;p+=8;}
  if(p+4>limit)return null;
  const count=i32();if(count<0||count>(limit-p)/22)return null;
  const names=[];
  for(let i=0;i<count;i++){
   const end=buf.indexOf(0,p);if(end<0||end+21>=limit)return null;
   p=end+21;const last=buf.indexOf(0,p);if(last<0||last>=limit)return null;
   names.push(buf.toString('utf8',p,last));p=last+1;
  }
  result.externals=names;
 }
 return result;}

/* type tree, "blob" format (version 12+ and 10): count, string buffer size, 24-byte nodes (32 with the ref-type hash from 19) */
function readTree(buf,p,version,little,setP){
 const i32=()=>{const v=little?buf.readInt32LE(p):buf.readInt32BE(p);p+=4;return v;};
 if(!(version>=12||version===10)){throw Error('UNITY_OLD_TYPETREE');}
 const count=i32(),sbSize=i32();const nodeSize=version>=19?32:24;if(count<0||count>200000||sbSize<0)throw Error('UNITY_TREE');
 const nodes=[];const base=p;const strAt=base+count*nodeSize;
 const str=off=>{if(off&0x80000000)return COMMON_AT.get(off&0x7fffffff)||'?'+(off&0x7fffffff);const s=strAt+off;return buf.toString('utf8',s,buf.indexOf(0,s));};
 for(let i=0;i<count;i++){const q=base+i*nodeSize;const rd32=o=>little?buf.readUInt32LE(q+o):buf.readUInt32BE(q+o);
  nodes.push({level:buf[q+2],isArray:buf[q+3]&1,type:str(rd32(4)),name:str(rd32(8)),byteSize:little?buf.readInt32LE(q+12):buf.readInt32BE(q+12),meta:rd32(20)});}
 p=strAt+sbSize;if(version>=21)p+=4+0;/* type dependencies: count then ints */
 if(version>=21){const dn=little?buf.readInt32LE(p-4):buf.readInt32BE(p-4);p+=dn*4;}
 setP(p);return nodes;}

/* value reader driven by the type tree: plain JS values, arrays and objects (enough to collect every string) */
function readValue(buf,obj,fromOff=obj.offset,little=true){
 const nodes=obj.tree;let p=fromOff;const end=obj.offset+obj.size;
 const u32=()=>{const v=little?buf.readUInt32LE(p):buf.readUInt32BE(p);p+=4;return v;};
 const align=()=>{p=(p+3)&~3;};
 function node(i){const n=nodes[i];let next=i+1;while(next<nodes.length&&nodes[next].level>n.level)next++;
  let v;const children=[];for(let c=i+1;c<next;c++){children.push(c);let d=nodes[c].level;while(c+1<next&&nodes[c+1].level>d)c++;}
  const t=n.type;
  if(t==='string'){const len=u32();if(len>end-p||len<0)throw Error('UNITY_STRING');v=buf.toString('utf8',p,p+len);p+=len;align();return [v,next];}
  if(n.isArray||t==='Array'){}
  if(t==='vector'||t==='Array'||(children.length===1&&nodes[children[0]].type==='Array')){const arr=nodes[t==='Array'?i:children[0]],arrI=t==='Array'?i:children[0];
   const sizeIdx=arrI+1,dataIdx=arrI+2;const len=u32();const out=[];if(len<0||len>5e6)throw Error('UNITY_ARRAY');
   const sz=nodes[dataIdx].byteSize;
   if(sz>0&&['char','UInt8','SInt8','bool'].includes(nodes[dataIdx].type)||sz===1){const b=buf.subarray(p,p+len);p+=len;if(arr.meta&0x4000||n.meta&0x4000)align();return [b,next];}
   let start=p;for(let k=0;k<len;k++){const [x]=node(dataIdx);out.push(x);}
   if(arr.meta&0x4000||n.meta&0x4000)align();return [out,next];}
  if(!children.length){const sz=n.byteSize;switch(t){case'bool':case'UInt8':case'SInt8':case'char':v=buf[p];p+=1;break;case'SInt16':case'short':v=little?buf.readInt16LE(p):buf.readInt16BE(p);p+=2;break;case'UInt16':case'unsigned short':v=little?buf.readUInt16LE(p):buf.readUInt16BE(p);p+=2;break;
   case'SInt32':case'int':v=little?buf.readInt32LE(p):buf.readInt32BE(p);p+=4;break;case'UInt32':case'unsigned int':v=u32();break;case'float':v=little?buf.readFloatLE(p):buf.readFloatBE(p);p+=4;break;case'double':v=buf.readDoubleLE(p);p+=8;break;
   case'SInt64':case'UInt64':case'long long':case'unsigned long long':v=Number(little?buf.readBigInt64LE(p):buf.readBigInt64BE(p));p+=8;break;default:p+=Math.max(sz,0);v=null;}
   if(n.meta&0x4000)align();return [v,next];}
  const o={};for(const c of children){const [x,after]=node(c);o[nodes[c].name]=x;}
  if(n.meta&0x4000)align();return [o,next];}
 return node(0)[0];}

/* TextAsset (class 49): m_Name, m_Script (length-prefixed, 4-aligned) — fixed layout, no type tree needed */
function textAsset(buf,obj){let p=obj.offset;const end=obj.offset+obj.size;if(obj.size<8)return null;
 const nl=buf.readUInt32LE(p);if(nl>4096||p+4+nl>end)return null;const name=buf.toString('utf8',p+4,p+4+nl);p=(p+4+nl+3)&~3;
 if(p+4>end)return null;const sl=buf.readUInt32LE(p);if(sl>end-p-4)return null;return {name,text:buf.subarray(p+4,p+4+sl)};}
/* length-prefixed strings in the raw bytes of an object that hold a CJK / kana character */
const CJK=/[぀-ヿ㐀-鿿]/;
function scanStrings(buf,obj){const out=[];const end=obj.offset+obj.size;
 for(let i=obj.offset;i+4<end;i+=4){const n=buf.readUInt32LE(i);if(n<2||n>20000||i+4+n>end)continue;const raw=buf.subarray(i+4,i+4+n);let bad=false;for(const c of raw)if(c<9||c>13&&c<32){bad=true;break;}if(bad)continue;
  const s=raw.toString('utf8');if(s.includes('�')||!CJK.test(s))continue;out.push(s);i=((i+4+n+3)&~3)-4;}
 return out;}
function collect(v,out){if(typeof v==='string'){out.push(v);}else if(Array.isArray(v)){for(const x of v)collect(x,out);}else if(v&&typeof v==='object'&&!Buffer.isBuffer(v)){for(const k of Object.keys(v))collect(v[k],out);}}
function strings(buf,obj){
 if(obj.tree){try{const v=readValue(buf,obj);const out=[];collect(v,out);return out.filter(s=>CJK.test(s));}catch{}}
 return scanStrings(buf,obj);}
module.exports={parse,textAsset,strings,readValue,scanStrings};
