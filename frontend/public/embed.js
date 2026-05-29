(function () {
  var script = document.currentScript;
  var slug = script.getAttribute('data-slug');
  var brandColor = script.getAttribute('data-brand-color');
  var base = script.getAttribute('data-base') || window.location.origin;

  if (!slug) {
    console.error('Calendae embed: missing data-slug attribute');
    return;
  }

  var url = new URL('/' + slug, base);
  url.searchParams.set('embed', '1');
  if (brandColor) {
    url.searchParams.set('brand_color', brandColor.replace('#', ''));
  }

  var iframe = document.createElement('iframe');
  iframe.src = url.toString();
  iframe.style.border = 'none';
  iframe.style.width = '100%';
  iframe.style.height = '720px';
  iframe.style.overflow = 'hidden';

  window.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'calendae-resize' && e.data.height) {
      iframe.style.height = e.data.height + 'px';
    }
  });

  script.parentNode.insertBefore(iframe, script);
})();
