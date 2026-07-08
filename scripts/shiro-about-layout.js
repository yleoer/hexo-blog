'use strict';

const aboutLayout = `
{% extends "_layout.njk" %}
{% from "_macro/ui.njk" import divider with context %}

{% block content %}
<section class="mx-auto max-w-3xl">
    <header class="mb-10 text-center">
        <h1 class="section-title" data-pagefind-body data-pagefind-meta="title">
            {{ page.title }}
        </h1>
        {{ divider() }}
    </header>

    <div class="max-w-2xl mx-auto">
        <div class="prose-shiro" data-pagefind-body>
            {{ page.content | safe }}
        </div>
    </div>
</section>
{% endblock %}
`;

hexo.theme.setView('about.njk', aboutLayout);
