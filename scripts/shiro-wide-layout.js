'use strict';

function assetUrl(path) {
  const root = (hexo.config.root || '/').replace(/\/+$/, '');
  return `${root}/${path.replace(/^\/+/, '')}`;
}

const wideLayoutCss = [
  `<link rel="preload" href="${assetUrl('fonts/inter/inter-latin-wght-normal.woff2')}" as="font" type="font/woff2" crossorigin>`,
  `<link rel="stylesheet" href="${assetUrl('css/fonts.css')}">`,
  `<link rel="stylesheet" href="${assetUrl('css/shiro-wide.css')}">`
].join('\n');

hexo.extend.injector.register('head_end', wideLayoutCss);
