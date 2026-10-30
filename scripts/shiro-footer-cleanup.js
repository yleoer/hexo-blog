'use strict';

const shiroCreditPattern = /\s*<p class="font-eng text-footnote tracking-wide opacity-90">Elegant theme by[\s\S]*?<\/p>/g;
const shiroDecorativeAsidePattern = /\s*<!-- Note Text[\s\S]*?<\/aside>/g;
const shiroPreloaderPattern = /\s*<!-- Font-load preloader:[\s\S]*?-->\s*<div id="shiroPreloader"[^>]*>[\s\S]*?<\/div>\s*<\/div>/g;

hexo.extend.filter.register('after_render:html', function cleanShiroFooter(html) {
  return html
    .replace(shiroCreditPattern, '')
    .replace(shiroDecorativeAsidePattern, '')
    .replace(shiroPreloaderPattern, '');
});
