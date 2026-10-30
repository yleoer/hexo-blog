'use strict';

function normalizedPath(url) {
  return url.pathname.replace(/\/index\.html$/, '/').replace(/\/+$/, '') || '/';
}

const externalIcon = '<svg class="site-nav-external" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12 12 4M4 4h8v8" /></svg>';

// Nunjucks includes read the installed theme files directly. Refine the final
// navigation HTML so updates stay in the site, without changing node_modules.
function refineNavigation(html) {
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/);
  if (!canonical) return html;

  const currentUrl = new URL(canonical[1], hexo.config.url);
  const currentPath = normalizedPath(currentUrl);

  return html.replace(/<nav class="mt-8 md:mt-10"[\s\S]*?<\/nav>/, (navigation) => {
    return navigation
      .replace('<nav class="', '<nav class="site-nav ')
      .replace('class="flex flex-wrap items-center justify-center', 'class="site-nav-list flex flex-wrap items-center justify-center')
      .replace(/\s*<li class="text-slate-400 select-none" role="separator" aria-hidden="true">\/<\/li>/g, '')
      .replace(/<a\b([^>]*href="([^"]+)"[^>]*)>([\s\S]*?)<\/a>/g, (anchor, attributes, href, label) => {
        const targetUrl = new URL(href, hexo.config.url);
        const targetPath = normalizedPath(targetUrl);
        let current = '';

        if (targetUrl.origin === currentUrl.origin) {
          if (targetPath === currentPath) {
            current = ' aria-current="page"';
          } else if (targetPath !== '/' && currentPath.startsWith(targetPath + '/')) {
            current = ' aria-current="location"';
          }
        }

        const icon = /target="_blank"/.test(attributes) ? externalIcon : '';
        return `<a${attributes}${current}>${label}${icon}</a>`;
      });
  });
}

hexo.extend.injector.register('body_begin', '<a class="skip-link" href="#main-content">跳至正文</a>');

hexo.extend.filter.register('after_render:html', function refineShiroShell(html) {
  return refineNavigation(html)
    .replace('<main class="section-divider">', '<main id="main-content" class="section-divider" tabindex="-1">')
    .replace(/<div class="mt-3 sm:mt-4 flex justify-center gap-2">\s*<\/div>/g, '')
    // The site supplies its own local reading fonts, so the theme's remote
    // serif font requests and font-load preloader have no work to do here.
    .replace(/<link\b[^>]*href="https:\/\/fonts\.(?:googleapis|gstatic)\.com[^"]*"[^>]*\/?>/g, '')
    .replace(/<script\b[^>]*src="[^"]*\/js\/preloader\.min\.js(?:\?[^"]*)?"[^>]*><\/script>/g, '');
});
