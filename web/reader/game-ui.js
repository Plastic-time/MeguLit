// SPDX-License-Identifier: GPL-3.0-or-later
export function installGameUiScan(bridge){
 if(!bridge)return;
 const copy={
  zh:['扫描游戏界面文字','打开游戏里的设置或选项界面，再点扫描。可以查看识别结果和原位置框。','扫描','扫描中…','在原位置显示识别框','识别到 {n} 处文本','请先绑定游戏窗口','暂时无法读取这部游戏的画面','请在 Windows 中安装日语 OCR 语言包','当前画面没有识别到文字'],
  en:['Scan game UI text','Open the game’s settings or choices, then scan. Inspect the text and its location.','Scan','Scanning…','Show boxes in the game','Found {n} text regions','Bind the game window first','The game frame could not be read','Install the Windows Japanese OCR language pack','No text was recognised in this frame'],
  ja:['ゲーム画面の文字を読み取る','設定や選択肢を開いてから読み取ります。認識結果と元の位置を確認できます。','読み取る','読み取り中…','ゲーム上で位置を確認','{n} 個のテキストを認識','先にゲームウィンドウを連携してください','このゲーム画面を取得できませんでした','Windows の日本語 OCR 言語パックをインストールしてください','この画面で文字を認識できませんでした']
 };
 const words=()=>copy[document.documentElement.lang.slice(0,2)]||copy.en;
 const send=(type)=>window.__tomoyoTranslateRequest(JSON.stringify({type}));
 const element=(tag,text)=>{const node=document.createElement(tag);if(text)node.textContent=text;return node;};
 let current=null;
 function mount(){
  const host=document.querySelector('.tomoyo-cn-dialog[open] [data-menu-category=mask]');
  if(!host||host.querySelector('[data-megulit-ui-scan]'))return;
  const w=words(),details=element('details'),summary=element('summary',w[0]),hint=element('small',w[1]),scan=element('button',w[2]),preview=element('button',w[4]),status=element('small'),results=element('ol');
  details.dataset.megulitUiScan='';details.dataset.noI18n='';
  status.setAttribute('role','status');scan.type=preview.type='button';preview.hidden=true;
  scan.onclick=()=>{current={scan,preview,status,results};scan.disabled=true;preview.hidden=true;status.textContent=w[3];results.replaceChildren();send('gameUiScan');};
  preview.onclick=()=>{const dialog=host.closest('dialog');dialog?.dispatchEvent(new Event('cancel',{cancelable:true}));send('gameUiPreview');};
  details.append(summary,hint,scan,preview,status,results);host.append(details);
 }
 bridge.gameUiScanResult=(rows,error)=>{
  if(!current?.scan.isConnected)return;
  const {scan,preview,status,results}=current,w=words();scan.disabled=false;
  if(error){const index={GAME_UI_NOT_BOUND:6,GAME_UI_OCR_MISSING:8,GAME_UI_NO_TEXT:9}[error]??7;status.textContent=w[index];return;}
  status.textContent=w[5].replace('{n}',rows.length);preview.hidden=false;
  results.replaceChildren(...rows.map(row=>element('li',row.text+' · '+Math.round(row.x*100)+'%, '+Math.round(row.y*100)+'%')));
 };
 new MutationObserver(mount).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open']});mount();
}
