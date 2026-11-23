// SPDX-License-Identifier: GPL-3.0-or-later
export async function openPlayReader({api,invoke,wait}){
 if((await api('reader_status')).libraryOnly)return false;
 await invoke('reader_open',{background:true});
 if((await api('reader_status')).libraryOnly)return false;
 if(wait)await wait();
 return true;
}
