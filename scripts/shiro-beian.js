'use strict';

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function assetUrl(path) {
  const root = (hexo.config.root || '/').replace(/\/+$/, '');
  return `${root}/${String(path || '').replace(/^\/+/, '')}`;
}

function getBeianConfig() {
  const themeConfig = (hexo.theme && hexo.theme.config) || hexo.config.theme_config || {};
  return themeConfig.beian || {};
}

function linkHtml(href, className, content) {
  if (!href) {
    return `<span class="${className}">${content}</span>`;
  }

  return `<a class="${className}" href="${escapeHtml(href)}" target="_blank" rel="nofollow noopener noreferrer">${content}</a>`;
}

function buildBeianHtml(config) {
  const icpText = escapeHtml(config.icp_text);
  const policeText = escapeHtml(config.police_text);
  const policeCode = String(config.police_code || '').trim();
  const policeIcon = String(config.police_icon || '').trim();
  const parts = [];

  if (icpText) {
    parts.push(linkHtml('https://beian.miit.gov.cn/', 'shiro-beian-link', icpText));
  }

  if (policeText) {
    const iconHtml = policeIcon
      ? `<img class="shiro-beian-police-icon" src="${escapeHtml(assetUrl(policeIcon))}" alt="" loading="lazy" decoding="async">`
      : '';
    const policeHref = policeCode
      ? `http://www.beian.gov.cn/portal/registerSystemInfo?recordcode=${encodeURIComponent(policeCode)}`
      : '';

    parts.push(linkHtml(policeHref, 'shiro-beian-link shiro-beian-police', `${iconHtml}<span>${policeText}</span>`));
  }

  if (!parts.length) return '';

  return `<div class="shiro-beian" data-pagefind-ignore>${parts.join('<span class="shiro-beian-separator" aria-hidden="true">&middot;</span>')}</div>`;
}

hexo.extend.filter.register('after_render:html', function injectShiroBeian(html) {
  const config = getBeianConfig();
  const enabled = config.enable === true || config.enabled === true;
  const footerEndIndex = html.lastIndexOf('</footer>');

  if (!enabled || footerEndIndex === -1) {
    return html;
  }

  const beianHtml = buildBeianHtml(config);
  if (!beianHtml) return html;

  return `${html.slice(0, footerEndIndex)}    ${beianHtml}\n${html.slice(footerEndIndex)}`;
});
