/* ============================================================
   mAtlas 大众创业学 · 共享导航脚本
   用法：每张方法论卡页与所有站内页都引用此脚本
   功能：
     1) 高亮当前页在顶部导航中的位置
     2) 注入 SVG 视图缩放快捷键（可选）
   ============================================================ */

(function () {
  'use strict';

  // -------- 1) 高亮当前页 --------
  // 所有站内页的 .site-nav-links a 链接，根据当前 URL 自动加 .active
  function highlightActive() {
    var path = window.location.pathname.split('/').pop() || 'index.html';
    if (path === '') path = 'index.html';
    var links = document.querySelectorAll('.site-nav-links a, .card-nav a');
    links.forEach(function (a) {
      var href = (a.getAttribute('href') || '').split('?')[0].split('#')[0];
      if (!href) return;
      if (href === path) a.classList.add('active');
      // 卡片页的"首页"链接始终可用，不高亮
      if (a.classList.contains('card-nav-prev') || a.classList.contains('card-nav-next')) {
        a.classList.remove('active');
      }
    });
  }

  // -------- 2) 单卡 SVG 缩放快捷键 --------
  // 卡片主区域 <svg> 可按 +/- 缩放，按 0 复位
  function svgZoomShortcut() {
    var svg = document.querySelector('svg.card-canvas') || document.querySelector('main svg');
    if (!svg) return;
    var transform = { scale: 1, x: 0, y: 0 };

    function apply() {
      svg.style.transform = 'translate(' + transform.x + 'px,' + transform.y + 'px) scale(' + transform.scale + ')';
      svg.style.transformOrigin = 'center center';
      svg.style.transition = 'transform 0.15s ease';
    }

    document.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === '+' || e.key === '=') {
        transform.scale = Math.min(3, transform.scale + 0.15);
        apply();
      } else if (e.key === '-' || e.key === '_') {
        transform.scale = Math.max(0.5, transform.scale - 0.15);
        apply();
      } else if (e.key === '0') {
        transform.scale = 1; transform.x = 0; transform.y = 0;
        apply();
      }
    });
  }

  // -------- bootstrap --------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      highlightActive();
      svgZoomShortcut();
    });
  } else {
    highlightActive();
    svgZoomShortcut();
  }
})();