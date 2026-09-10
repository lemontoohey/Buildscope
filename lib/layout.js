const { escapeHtml } = require('./render');
const { COLORS } = require('./theme');

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard' },
  { href: '/budget', label: 'Budget' },
  { href: '/plan-measure', label: 'Plan Measure' },
  { href: '/formulate', label: 'Formulate' },
  { href: '/price-book', label: 'Price Book' },
  { href: '/materials', label: 'Materials' },
  { href: '/purchase-orders', label: 'Purchase orders' },
  { href: '/selections', label: 'Selections' },
  { href: '/calculators', label: 'Calculators' },
  { href: '/schedule', label: 'Schedule' },
  { href: '/trades', label: 'Trades' },
  { href: '/compliance', label: 'Compliance' },
  { href: '/documents', label: 'Documents' },
  { href: '/photos', label: 'Photos' },
  { href: '/diary', label: 'Site diary' },
  { href: '/settings', label: 'Settings' },
];

function layout({ title, activePath, body, flash, wide }) {
  const shellWidth = wide ? 'max-w-7xl' : 'max-w-5xl';
  const navHtml = NAV_ITEMS.map((item) => {
    const isActive = item.href === activePath;
    const cls = isActive
      ? `text-white bg-[${COLORS.brandBlue}]`
      : `text-slate-600 hover:bg-[${COLORS.brandBlue}] hover:text-white`;
    return `<a href="${item.href}" class="px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${cls}">${escapeHtml(
      item.label
    )}</a>`;
  }).join('\n');

  const flashHtml = flash
    ? `<div class="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 text-sm">${escapeHtml(
        flash
      )}</div>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} — Build Tracker</title>
  <link rel="manifest" href="/manifest.webmanifest" />
  <meta name="theme-color" content="${COLORS.brandBlue}" />
  <link rel="apple-touch-icon" href="/public/icon-192.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&family=Roboto+Slab:wght@700;900&display=swap" rel="stylesheet" />
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { font-family: 'Lato', ui-sans-serif, system-ui, sans-serif; }
    /* Slab-serif brand mark, paired with a plainer sans for body copy. */
    .brand-mark { font-family: 'Roboto Slab', serif; }
    @media (prefers-reduced-motion: reduce) {
      #bg-particles, #bg-planoutline { display: none; }
    }
  </style>
</head>
<body class="bg-[#f9f9f9] text-[${COLORS.bodyText}] min-h-screen">
  <canvas id="bg-particles" aria-hidden="true" class="fixed inset-0 -z-10 pointer-events-none"></canvas>
  <!--
    A very faint line-art trace of a generic house floor plan — a simple
    rectangular layout (bedroom wing, living wing, garage bump-out) with no
    resemblance to any specific real building, purely ambient background
    texture. Drifts on its own, drifts a bit faster for a moment after you
    scroll (see the script below), and gives a quick natural-feeling spin
    whenever you click anywhere on the page.
  -->
  <svg id="bg-planoutline" aria-hidden="true" viewBox="0 0 1000 863" preserveAspectRatio="xMidYMid slice"
    class="fixed -z-10 pointer-events-none"
    style="left:50%;top:50%;width:160vmax;height:160vmax;margin-left:-80vmax;margin-top:-80vmax;transform-origin:50% 50%;">
    <g fill="none" stroke="#5a6873" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" opacity="0.055">
      <path d="M150,200 L750,200 L750,550 L950,550 L950,750 L150,750 Z" />
      <path d="M450,200 L450,750" />
      <path d="M150,383 L450,383" />
      <path d="M150,567 L450,567" />
      <path d="M550,600 L650,600 L650,700 L550,700 Z" />
      <path d="M400,750 L500,750 L500,800 L400,800 Z" />
      <path d="M950,700 C1010,700 1050,720 1050,770" stroke-width="9" opacity="0.6" />
    </g>
  </svg>
  <nav class="bg-white border-b border-slate-200">
    <div class="${shellWidth} mx-auto px-4">
      <div class="flex items-center justify-between h-20 gap-4">
        <div class="flex items-center">
          <span class="brand-mark font-black text-2xl uppercase tracking-wide text-[${COLORS.brandBlue}]">Build Tracker</span>
        </div>
        <div class="flex items-center gap-5">
          <div class="flex gap-1 flex-wrap justify-end">
            ${navHtml}
          </div>
        </div>
      </div>
    </div>
  </nav>
  <main class="${shellWidth} mx-auto px-4 py-8">
    ${flashHtml}
    ${body}
  </main>
  <footer class="${shellWidth} mx-auto px-4 pb-10 text-xs text-slate-400">
    Phase 1 build tracker — not a substitute for your quantity surveyor, structural engineer, accountant, or certifier.
  </footer>
  <script>
    (function () {
      // Ambient background texture: three depth layers of soft grey dots,
      // drifting slowly, with each layer shifting a different amount as you
      // scroll (a small parallax). Modelled on the 3-tier violet particle
      // shader in Liam's Camille_website project, just done in plain
      // canvas 2D with greys instead of a WebGL shader, since this app
      // stays zero-dependency. Purely decorative — sits behind the white
      // content cards, never over them.
      var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var canvas = document.getElementById('bg-particles');
      if (!canvas || reduceMotion) return;
      var ctx = canvas.getContext('2d');
      var dpr = Math.min(window.devicePixelRatio || 1, 2);

      function resize() {
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
      }
      resize();
      window.addEventListener('resize', resize);

      // Far -> near: smaller/slower/fainter to larger/faster/slightly stronger.
      var LAYERS = [
        { count: 14, minR: 1,   maxR: 2,   drift: 0.010, parallax: 0.02, color: 'rgba(148,155,163,0.10)' },
        { count: 10, minR: 2,   maxR: 3.5, drift: 0.018, parallax: 0.05, color: 'rgba(126,134,143,0.10)' },
        { count: 6,  minR: 3,   maxR: 5,   drift: 0.028, parallax: 0.09, color: 'rgba(105,114,124,0.09)' },
      ];
      var layers = LAYERS.map(function (def) {
        var points = [];
        for (var i = 0; i < def.count; i++) {
          points.push({ x: Math.random(), y: Math.random(), wobble: Math.random() * Math.PI * 2 });
        }
        return { def: def, points: points };
      });

      var scrollY = window.scrollY || 0;
      window.addEventListener(
        'scroll',
        function () {
          scrollY = window.scrollY || 0;
        },
        { passive: true }
      );

      var start = null;
      function frame(ts) {
        if (!start) start = ts;
        var t = (ts - start) * 0.001;
        var w = canvas.width;
        var h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        layers.forEach(function (layer) {
          ctx.fillStyle = layer.def.color;
          layer.points.forEach(function (p) {
            var yDrift = (p.y - t * layer.def.drift - (scrollY * layer.def.parallax) / h) % 1;
            if (yDrift < 0) yDrift += 1;
            var xDrift = p.x + Math.sin(t * 0.15 + p.wobble) * 0.01;
            var r = (layer.def.minR + (layer.def.maxR - layer.def.minR) * p.wobble / (Math.PI * 2)) * dpr;
            ctx.beginPath();
            ctx.arc(xDrift * w, yDrift * h, r, 0, Math.PI * 2);
            ctx.fill();
          });
        });
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    })();
  </script>
  <script>
    (function () {
      // The faint plan outline: a slow ambient wander, a temporary speed-up
      // whenever you scroll (plus its own scroll parallax, at a different
      // rate to the particle layers behind it), and a quick decaying spin
      // triggered by any click on the page.
      var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var el = document.getElementById('bg-planoutline');
      if (!el || reduceMotion) return;

      var scrollY = window.scrollY || 0;
      var lastScrollY = scrollY;
      var driftBoost = 1; // >1 right after a scroll, eases back to 1
      var angle = 0; // current rotation, degrees
      var angularVelocity = 0; // degrees/sec, decays after each click

      window.addEventListener(
        'scroll',
        function () {
          var y = window.scrollY || 0;
          driftBoost = Math.min(driftBoost + Math.abs(y - lastScrollY) * 0.02, 6);
          lastScrollY = y;
          scrollY = y;
        },
        { passive: true }
      );

      document.addEventListener('click', function () {
        angularVelocity += (Math.random() < 0.5 ? -1 : 1) * 220;
      });

      var start = null;
      var prevT = 0;
      function frame(ts) {
        if (start === null) start = ts;
        var t = (ts - start) * 0.001;
        var dt = Math.min(t - prevT, 0.1);
        prevT = t;

        driftBoost += (1 - driftBoost) * Math.min(dt * 0.8, 1);
        var speed = 0.05 * driftBoost;
        var x = Math.sin(t * speed) * 34 + Math.sin(t * speed * 0.53) * 14;
        var y = Math.cos(t * speed * 0.7) * 26 - scrollY * 0.035;

        angle += angularVelocity * dt;
        angularVelocity *= Math.pow(0.006, dt);

        el.style.transform = 'translate(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px) rotate(' + angle.toFixed(2) + 'deg)';
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    })();
  </script>
  <script src="/public/offline-queue.js"></script>
</body>
</html>`;
}

module.exports = { layout };
