const paths={
 layers:'m3 7 9-4 9 4-9 4-9-4Zm0 5 9 4 9-4M3 17l9 4 9-4',
 flame:'M12 3c1 4-4 5-4 9a4 4 0 0 0 8 0c0-2-1-3-2-4 0 3-3 3-2 6-4-1-1-6 0-11Z',
 home:'m3 10 9-7 9 7M5 9v11h14V9M9 20v-7h6v7',
 library:'M4 4h4v16H4zM10 4h4v16h-4zM16 5l4-1 4 15-4 1z',
 history:'M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2',
 learning:'M12 6C9 4 5 4 2 5v14c3-1 7-1 10 1 3-2 7-2 10-1V5c-3-1-7-1-10 1Zm0 0v14',
 settings:"M9.78 4.73L10.33 2.55L13.67 2.55L14.22 4.73L15.57 5.29L17.51 4.14L19.86 6.49L18.71 8.43L19.27 9.78L21.45 10.33L21.45 13.67L19.27 14.22L18.71 15.57L19.86 17.51L17.51 19.86L15.57 18.71L14.22 19.27L13.67 21.45L10.33 21.45L9.78 19.27L8.43 18.71L6.49 19.86L4.14 17.51L5.29 15.57L4.73 14.22L2.55 13.67L2.55 10.33L4.73 9.78L5.29 8.43L4.14 6.49L6.49 4.14L8.43 5.29ZM15 12a3 3 0 1 0-6 0 3 3 0 0 0 6 0",
 clock:'M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
 arrow:'M4 12h15m-5-5 5 5-5 5',play:'m9 6 9 6-9 6Z',
 stats:'M5 20v-6m7 6V5m7 15V10',word:'M5 3h14v18H5zM8 7h8M8 11h6',
 lookup:'m3 4 5 2m-2-4v4m-3 5 4-6 4 6m-6-2h5m3 10 4-9 4 9m-6-3h4',
 search:'m16 16 5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
 close:'m6 6 12 12M18 6 6 18',minus:'M5 12h14',maximize:'M5 5h14v14H5z',
 refresh:'M20 7a9 9 0 1 0 1 9M20 3v5h-5',plus:'M12 4v16M4 12h16',
 trash:'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
 restore:'M3 11a9 9 0 1 1 2 7M3 4v7h7',chevron:'m9 5 7 7-7 7',
 edit:'m4 16 12-12 4 4L8 20H4Zm9-9 4 4',check:'m5 12 4 4L19 6',multiselect:'M8 3h12a1 1 0 0 1 1 1v12M4 7h12a1 1 0 0 1 1 1v12H5a1 1 0 0 1-1-1V7Zm3.5 7 2.5 2.5L14 12',
 copy:'M8 8h13v13H8zM16 8V3H3v13h5',globe:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M3 12h18M12 3c-5 5-5 13 0 18 5-5 5-13 0-18',
 game:'M7 7h10c4 0 5 12 2 12l-4-3H9l-4 3C2 19 3 7 7 7Zm0 3v5m-2-2h4m6-2h.01m3 3h.01'
};
export function icon(name,cls=''){return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.game}"/></svg>`}
