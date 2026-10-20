/** 内联 SVG 图标，避免额外请求。统一 24×24 视图框，尺寸由 CSS 控制 */
export const icons = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  chevron:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
  crown:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 8l4 3 5-6 5 6 4-3-2 10H5L3 8z"/></svg>',
  lock:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a5 5 0 00-5 5v3H6a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2v-8a2 2 0 00-2-2h-1V7a5 5 0 00-5-5zm-3 5a3 3 0 116 0v3H9V7z"/></svg>',
  star:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l2.9 5.9 6.6.9-4.8 4.6 1.2 6.5L12 17.3l-5.9 3.1 1.2-6.5L2.5 9.3l6.6-.9L12 2.5z"/></svg>',
  starOutline:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3.2l2.7 5.5 6.1.9-4.4 4.3 1.1 6-5.5-2.9-5.5 2.9 1.1-6L3.2 9.6l6.1-.9L12 3.2z"/></svg>',
  refresh:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 11-3.2-6.9"/><path d="M21 4v5h-5"/></svg>',
  arrowDown:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/></svg>',
  inbox:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M4.5 5.5h15l1.5 7.5v5a2 2 0 01-2 2h-15a2 2 0 01-2-2v-5l1.5-7.5z"/></svg>',
  check:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  user:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6"/></svg>',
  edit:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19.5 8.5a2.1 2.1 0 00-3-3L5 17l-1 3z"/></svg>',
  /** 底部导航：题库（两本叠放的书） */
  books:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 016.5 3H19v14.5H6.5A2.5 2.5 0 004 20V5.5z"/><path d="M19 17.5H6.8A2.8 2.8 0 004 20.2"/><path d="M8.5 7.5h6"/></svg>',
  /** 会员（实心皇冠，导航里更醒目） */
  crownSolid:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.6 7.3a1 1 0 011.5-1.1l3.6 2.5 3.5-4.5a1 1 0 011.6 0l3.5 4.5 3.6-2.5a1 1 0 011.5 1.1l-2.2 9.4a1 1 0 01-1 .8H5.8a1 1 0 01-1-.8L2.6 7.3z"/><path d="M5.5 19.5h13a1 1 0 010 2h-13a1 1 0 010-2z"/></svg>',
  /** 我的（实心人像） */
  userSolid:
    '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4.2"/><path d="M3.8 20.2c0-3.6 3.7-6.3 8.2-6.3s8.2 2.7 8.2 6.3a1 1 0 01-1 1H4.8a1 1 0 01-1-1z"/></svg>',
  key:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="M11 12l8-8"/><path d="M18 3l3 3-3 3"/></svg>',
  clock:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 1.8"/></svg>',
  shield:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 2.8v5.4c0 4.3-2.9 7.6-7 9.8-4.1-2.2-7-5.5-7-9.8V5.8L12 3z"/><path d="M9 12l2.2 2.2L15.5 10"/></svg>',
  logout:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h9"/></svg>'
};
