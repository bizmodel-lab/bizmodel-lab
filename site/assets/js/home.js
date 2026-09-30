/* ============================================================
   mAtlas 大众创业学 · 站点交互
   功能：章节目录页（cards.html）的章组折叠交互
   （首页章节目入口已改为静态渲染，不再需要 fetch）
   ============================================================ */

(function () {
  'use strict';

  // -------- 章组折叠（cards.html 用） --------
  function bindChapterGroups() {
    document.querySelectorAll('.ch-group-head').forEach(function (head) {
      head.addEventListener('click', function () {
        var group = head.closest('.ch-group');
        if (!group) return;
        if (group.hasAttribute('data-collapsed')) {
          group.removeAttribute('data-collapsed');
        } else {
          group.setAttribute('data-collapsed', '');
        }
      });
    });
  }

  // -------- 首页图片轮播 --------
  // 自动 5 秒切换；点圆点/箭头可随意点播（打乱节奏），点播后重新计时；悬停暂停自动播放
  function bindCarousel() {
    var box = document.getElementById('home-carousel');
    if (!box) return;

    var items = Array.prototype.slice.call(box.querySelectorAll('.carousel-item'));
    if (items.length === 0) return;

    var interval = parseInt(box.getAttribute('data-interval'), 10) || 5000;
    var dotsWrap = box.querySelector('.carousel-dots');
    var current = 0;
    var timer = null;
    var hover = false;

    // 生成圆点指示器
    items.forEach(function (_, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', '第 ' + (i + 1) + ' 张');
      b.addEventListener('click', function () { go(i); });
      dotsWrap.appendChild(b);
    });
    var dots = Array.prototype.slice.call(dotsWrap.children);

    function render() {
      items.forEach(function (img, i) { img.classList.toggle('active', i === current); });
      dots.forEach(function (d, i) { d.classList.toggle('active', i === current); });
    }

    function go(i) {
      current = (i + items.length) % items.length;
      render();
      restart(); // 点播后重置自动节奏
    }

    function next() { go(current + 1); }
    function prev() { go(current - 1); }

    function restart() {
      if (timer) clearInterval(timer);
      if (hover) return; // 悬停中不恢复自动播放
      timer = setInterval(next, interval);
    }

    var nextBtn = box.querySelector('.carousel-next');
    var prevBtn = box.querySelector('.carousel-prev');
    if (nextBtn) nextBtn.addEventListener('click', next);
    if (prevBtn) prevBtn.addEventListener('click', prev);

    box.addEventListener('mouseenter', function () {
      hover = true;
      if (timer) { clearInterval(timer); timer = null; }
    });
    box.addEventListener('mouseleave', function () {
      hover = false;
      restart();
    });

    render();
    restart();
  }

  // -------- bootstrap --------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      bindChapterGroups();
      bindCarousel();
    });
  } else {
    bindChapterGroups();
    bindCarousel();
  }
})();
