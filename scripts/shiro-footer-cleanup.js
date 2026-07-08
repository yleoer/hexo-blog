'use strict';

const shiroCreditPattern = /\s*<p class="font-eng text-footnote tracking-wide opacity-90">Elegant theme by[\s\S]*?<\/p>/g;
const shiroDecorativeAsidePattern = /\s*<!-- Note Text[\s\S]*?<\/aside>/g;
const shiroPreloaderNotePattern = /(data-shiro-font-text="[^"]*?)\u767d\u306f\u3001\u4f59\u767d\u306e\u540d\u3002("[^>]*>)/g;

hexo.extend.filter.register('after_render:html', function cleanShiroFooter(html) {
  return html
    .replace(shiroCreditPattern, '')
    .replace(shiroDecorativeAsidePattern, '')
    .replace(shiroPreloaderNotePattern, '$1$2');
});
