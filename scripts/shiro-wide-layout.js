'use strict';

function assetUrl(path) {
  const root = (hexo.config.root || '/').replace(/\/+$/, '');
  return `${root}/${path.replace(/^\/+/, '')}`;
}

const wideLayoutCss = `<link rel="stylesheet" href="${assetUrl('css/shiro-wide.css')}">`;

hexo.extend.injector.register('head_end', wideLayoutCss);
