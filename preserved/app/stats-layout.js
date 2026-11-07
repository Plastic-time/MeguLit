// SPDX-License-Identifier: GPL-3.0-or-later
// Layout-only adaptation for the statistics page. Preserve theme, type and icons.
(function installStatsLayout(){
 'use strict';if(window.__tomeStatsLayout)return;if(!document.documentElement){document.addEventListener('DOMContentLoaded',installStatsLayout,{once:true});return;}window.__tomeStatsLayout=true;
 const style=document.createElement('style');style.id='tome-statistics-layout';style.textContent=`
 .analytics-layout{container-type:inline-size;container-name:tome-analytics;box-sizing:border-box!important;width:100%!important;max-width:none!important;min-width:0!important;padding:clamp(12px,2.2vw,30px)!important;max-height:100dvh;overflow-y:auto!important;overflow-x:clip;scrollbar-gutter:stable;scrollbar-width:thin!important}
 .analytics-layout :is(.layout-grid,.sidebar,.main-charts,.chart-grid,.stat-grid,.panel,.chart-panel,.heatmap-panel,.line-chart-wrapper,.bar-chart-wrapper,.donut-chart,.heatmap-wrapper,.heatmap-outer){min-width:0!important;box-sizing:border-box;max-width:100%}
 .analytics-layout .layout-grid{display:grid;grid-template-columns:minmax(220px,.7fr) minmax(0,2fr)!important;gap:clamp(12px,2vw,24px)!important;align-items:start}
 .analytics-layout .sidebar{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;align-items:start}
 .analytics-layout .sidebar>.panel{margin-bottom:0!important}
 .analytics-layout .stat-grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,170px),1fr))!important;gap:clamp(10px,1.5vw,16px)!important}
 .analytics-layout .stat-tile{min-width:0;padding:clamp(12px,1.6vw,20px)!important}
 .analytics-layout :is(.stat-value,.stat-label,.profile-stat .meta-label,.profile-stat .meta-value,.pace-value,.mb-value,.mb-sub){white-space:normal!important;overflow-wrap:anywhere;text-overflow:clip!important;overflow:visible!important}
 .analytics-layout .panel{padding:clamp(12px,1.7vw,24px)!important}
 .analytics-layout .panel-head{min-width:0;flex-wrap:wrap;row-gap:8px}
 .analytics-layout .panel-head h2{min-width:0;overflow-wrap:anywhere}
 .analytics-layout .layout-header{gap:12px}
 .analytics-layout :is(.title-group,.filter-group){min-width:0;max-width:100%;flex-wrap:wrap;gap:12px}
 .analytics-layout .filter-group{flex:1 1 320px;justify-content:flex-end}
 .analytics-layout .filter-group .select-input{min-width:0;max-width:100%;flex:1 1 140px}
 .analytics-layout .filter-group select{width:100%;min-width:0;max-width:100%}
 .analytics-layout .chart-grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,310px),1fr))!important;gap:clamp(12px,2vw,24px)!important}
 .analytics-layout :is(.line-chart-wrapper,.bar-chart-wrapper){height:auto!important;flex:initial!important}
 .analytics-layout .chart-svg{display:block;max-width:100%;width:100%!important;height:clamp(180px,29vh,300px)!important}
 .analytics-layout :is(.legend,.legend-item,.tt-row){flex-wrap:wrap;min-width:0;gap:8px}
 .analytics-layout .donut-chart{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:clamp(12px,2vw,24px)!important;height:auto!important}
 .analytics-layout .donut-wrap{flex:0 1 190px;width:min(190px,100%)!important;max-width:100%;min-width:0}
 .analytics-layout .donut-legend{flex:1 1 125px;min-width:0;max-width:100%}
 .analytics-layout .legend-row{min-width:0;flex-wrap:wrap;row-gap:3px}
 .analytics-layout .legend-label{min-width:0;overflow-wrap:anywhere}
 .analytics-layout .legend-value{margin-left:auto;overflow-wrap:anywhere}
 .analytics-layout .center-value{overflow-wrap:anywhere;white-space:normal;text-overflow:clip}
 .analytics-layout .profile-stats{grid-template-columns:repeat(auto-fit,minmax(min(100%,125px),1fr))!important}
 .analytics-layout :is(.profile-stat,.media-meta li,.meta-value-group){flex-wrap:wrap;min-width:0}
 .analytics-layout .heatmap-head .heatmap-year-select{max-width:100%;min-width:0;flex:0 1 130px}
 .analytics-layout .heatmap-clip{width:100%;max-width:100%;overflow-x:auto!important;overflow-y:hidden;scrollbar-width:thin!important;overscroll-behavior-x:contain}
 .analytics-layout .heatmap-clip>svg{display:block;width:100%!important;min-width:520px;height:auto!important;max-width:none}
 .analytics-layout .heatmap-outer{overflow:visible}
 .analytics-layout::-webkit-scrollbar{width:7px!important;display:block!important}
 .analytics-layout .heatmap-clip::-webkit-scrollbar{height:6px!important;display:block!important}
 .analytics-layout::-webkit-scrollbar-thumb,.analytics-layout .heatmap-clip::-webkit-scrollbar-thumb{background:var(--theme-border,#444);border-radius:6px}
 @container tome-analytics (max-width:1050px){
  .analytics-layout .layout-grid{grid-template-columns:minmax(0,1fr)!important}
  .analytics-layout .sidebar{grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));gap:16px}
 }
 @container tome-analytics (max-width:620px){
  .analytics-layout .layout-grid,.analytics-layout .chart-grid{grid-template-columns:minmax(0,1fr)!important}
  .analytics-layout .filter-group{flex-basis:100%}
  .analytics-layout .title-group{gap:8px}
 }
 @container tome-analytics (max-width:360px){
  .analytics-layout .stat-grid{grid-template-columns:minmax(0,1fr)!important}
  .analytics-layout .donut-legend{flex-basis:100%}
 }
 `;
 (document.head||document.documentElement).append(style);
 let queued=false;
 function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;syncHeatmaps();});}
 function syncHeatmaps(){
  for(const svg of document.querySelectorAll('.analytics-layout .heatmap-clip>svg')){
   const width=Number(svg.getAttribute('width')),height=Number(svg.getAttribute('height'));
   if(!(width>0&&height>0))continue;
   const view=`0 0 ${width} ${height}`;if(svg.getAttribute('viewBox')!==view)svg.setAttribute('viewBox',view);
  }
 }
 new MutationObserver(records=>{
  if(records.some(m=>m.type==='attributes'?m.target.matches?.('.analytics-layout .heatmap-clip>svg'):[...m.addedNodes].some(n=>n.nodeType===1&&(n.matches?.('.analytics-layout,.heatmap-clip,svg')||n.querySelector?.('.analytics-layout,.heatmap-clip')))))schedule();
 }).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['width','height']});
 addEventListener('resize',schedule);schedule();
})();
