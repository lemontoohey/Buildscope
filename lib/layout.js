const { escapeHtml } = require('./render');
const { COLORS } = require('./theme');

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard' },
  { href: '/budget', label: 'Budget' },
  { href: '/estimator', label: 'Job Estimator' },
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

// Alternate ghost floor-plan silhouettes for the ambient background --
// still abstract, generic massing (never a real, specific building), just
// a different one depending on what job you're looking at. Picked on the
// Job Estimator's job detail page from the job's construction_type, so
// the backdrop loosely echoes the job without ever being literal enough
// to consciously notice.
const PLAN_VARIANTS = {
  default: `
      <path d="M150,200 L750,200 L750,550 L950,550 L950,750 L150,750 Z" />
      <path d="M450,200 L450,750" />
      <path d="M150,383 L450,383" />
      <path d="M150,567 L450,567" />
      <path d="M550,600 L650,600 L650,700 L550,700 Z" />
      <path d="M400,750 L500,750 L500,800 L400,800 Z" />
      <path d="M950,700 C1010,700 1050,720 1050,770" stroke-width="9" opacity="0.6" />`,
  // Steel frame: bigger, more rectilinear volumes and an open cantilever --
  // steel spans read as larger open-plan rooms and an extended bump-out.
  'steel-frame': `
      <path d="M120,220 L780,220 L780,500 L1000,500 L1000,760 L120,760 Z" />
      <path d="M500,220 L500,760" />
      <path d="M120,400 L500,400" />
      <path d="M120,580 L500,580" />
      <path d="M780,360 L1000,360" />
      <path d="M1000,500 L1080,500 L1080,600 L1000,600" />
      <path d="M780,220 L780,760" stroke-dasharray="6 6" opacity="0.5" />`,
  // Rammed earth: a doubled outline for thick monolithic walls, fewer
  // internal divisions -- rammed earth reads as mass, not framing.
  'rammed-earth': `
      <path d="M170,230 L820,230 L820,730 L170,730 Z" />
      <path d="M190,250 L800,250 L800,710 L190,710 Z" opacity="0.6" />
      <path d="M170,470 L820,470" />
      <path d="M495,230 L495,730" />
      <path d="M600,600 L720,600 L720,700 L600,700 Z" />`,
  // Timber frame: a simple gabled roofline over the plan.
  'timber-frame': `
      <path d="M180,300 L500,120 L820,300 L820,760 L180,760 Z" />
      <path d="M180,300 L820,300" />
      <path d="M500,120 L500,760" />
      <path d="M280,300 L280,760" />
      <path d="M720,300 L720,760" />
      <path d="M420,610 L580,610 L580,760 L420,760 Z" />`,
  // Brick veneer: a smaller, plainer suburban footprint with a porch bump.
  'brick-veneer': `
      <path d="M220,280 L760,280 L760,720 L220,720 Z" />
      <path d="M220,480 L760,480" />
      <path d="M490,280 L490,720" />
      <path d="M300,720 L300,800 L440,800 L440,720" />
      <path d="M600,340 L700,340 L700,420 L600,420 Z" />`,
};

function planVariantFor(constructionType) {
  const key = String(constructionType || '').trim().toLowerCase();
  if (key === 'steel frame') return 'steel-frame';
  if (key === 'rammed earth') return 'rammed-earth';
  if (key === 'timber frame') return 'timber-frame';
  if (key === 'brick veneer') return 'brick-veneer';
  return 'default';
}

function layout({ title, activePath, body, flash, wide, planVariant }) {
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
  <title>${escapeHtml(title)} — Buildscope</title>
  <link rel="manifest" href="/manifest.webmanifest" />
  <meta name="theme-color" content="${COLORS.brandBlue}" />
  <link rel="apple-touch-icon" href="/public/icon-192.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&family=Roboto+Slab:wght@300;700;900&display=swap" rel="stylesheet" />
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { font-family: 'Lato', ui-sans-serif, system-ui, sans-serif; }
    /* Slab-serif brand mark, paired with a plainer sans for body copy. */
    .brand-mark { font-family: 'Roboto Slab', serif; }
    @media (prefers-reduced-motion: reduce) {
      #bg-particles, #bg-planoutline, #bg-shader { display: none; }
    }
    /* Mobile hamburger nav: force the dropdown panel closed once the
       viewport reaches the desktop breakpoint, regardless of the JS
       toggle state -- a defensive backstop for resizing mid-interaction. */
    @media (min-width: 768px) {
      #mobile-nav-panel { display: none !important; }
    }

    /*
      Colour DNA borrowed from Liam's Camille_website project (its
      react-three-fiber shader background and "benzi" Benzimidazolone
      brown): a 3-tier violet stack for the ambient particles/plan
      outline, that same brown used both as an imperceptibly faint,
      macOS-style soft drop shadow AND as a slow raking "light" that
      sweeps across the plan outline (see #bg-shader below), and an
      old-master-style violet-white for the card surfaces themselves --
      the pale, warm, violet-cast white of a primed canvas, rather than
      a neutral grey-green.
    */
    :root {
      --violet-1: #5a4a6e;  /* Camille_website uColorViolet1 -- far/light layer */
      --violet-2: #4a3658;  /* Camille_website uColorViolet2 -- mid layer */
      --violet-3: #362548;  /* Camille_website uColorViolet3 -- near/dark layer */
      --violet-glow: #8b5cf6; /* Camille_website uColorGlow -- the brightest accent, used sparingly */
      --header-dark: #0c0614; /* Liam's usual dark blue/violet (Camille_website's uColorPaper) -- lives on the header, and now doubles as card body text */
      --parchment: #fdf5e6; /* Camille_website's --color-parchment -- Liam's usual text-on-dark, used on the header */
      --canvas: #e5e3e8; /* the page background: --header-dark, pushed light and grey, with a whisper of that same violet still in it */
      --card-bg: rgba(248, 246, 252, 0.96); /* near-white with just a whisper of violet -- reads the same clean white as the app's own bg-slate-50 boxes (e.g. Schedule's cascade panel), just barely tinted */
      --card-border: #a4a5a2; /* unchanged -- near-neutral grey, barely tinted */
      --brown-halo: 150, 40, 20; /* Camille_website "benzi" Benzimidazolone brown, as an r,g,b triplet for rgba() -- shadows, action-button halo, and the plan-outline raking light all share this one brown */
    }

    /* Card / box surfaces (and the nav header, which uses the same
       bg-white) -- pale pistachio with the violet folded in, translucent
       enough to let #bg-particles/#bg-planoutline read faintly through,
       plus a soft brown halo standing in for the drop shadow. */
    .bg-white {
      background-color: var(--card-bg) !important;
      color: var(--header-dark) !important; /* cards are violet-white now, so their text takes the same dark violet as the header -- strong, on-theme contrast; see the <main>/nav rules below for why this needs restating */
      box-shadow:
        0 18px 42px -16px rgba(var(--brown-halo), 0.16),
        0 4px 10px -4px rgba(var(--brown-halo), 0.10) !important;
    }
    .border-slate-200, .border-slate-300 {
      border-color: var(--card-border) !important;
    }
    /* Card body copy (headings, labels, values) mostly sits on Tailwind's
       neutral slate-text scale -- pull it to the same dark violet as the
       header too, for the same contrast reason as .bg-white's own color
       rule above. Left alone: nav's own text-slate-600 (overridden
       separately and more specifically, further down), the muted footer
       caption (text-slate-400), and any semantic red/green/amber status
       text, which should keep reading as red/green/amber. */
    .text-slate-900, .text-slate-800, .text-slate-700, .text-slate-600, .text-slate-500 {
      color: var(--header-dark) !important;
    }

    /*
      The header bar shares the exact same bg-white/border-slate-200
      classes as every card (see lib/layout.js's <nav> tag) -- so it can't
      be told apart from a card by class name alone. The trick is
      specificity: "nav.bg-white" (an element AND a class) outranks the
      plain ".bg-white" class rule above, so this wins without touching a
      single line of markup -- the header just becomes the one bg-white
      element that stays Liam's usual dark blue/violet while every card
      stays the light near-neutral grey.
    */
    nav.bg-white {
      background-color: var(--header-dark) !important;
      color: var(--parchment) !important;
    }
    nav.border-b.border-slate-200 {
      border-color: rgba(90, 74, 110, 0.4) !important;
    }
    nav .text-slate-600 {
      color: #cabfd6 !important; /* the inactive nav links' own grey was too dark to read on --paper-dark */
    }
    /* Hover states that already ask for a stronger shadow (shadow-md)
       get the same brown halo, just turned up rather than swapped for
       Tailwind's default black one. */
    .shadow-md, .hover\:shadow-md:hover {
      box-shadow:
        0 22px 50px -14px rgba(var(--brown-halo), 0.22),
        0 6px 14px -4px rgba(var(--brown-halo), 0.14) !important;
    }
    /* Every action button shares the accent red #9b1b15 as a Tailwind
       arbitrary-value class -- one selector catches all of them
       app-wide, including ones that don't go through BUTTON_CLASSES. */
    [class*="bg-[#9b1b15]"] {
      box-shadow:
        0 12px 28px -10px rgba(var(--brown-halo), 0.24),
        0 3px 8px -2px rgba(var(--brown-halo), 0.15) !important;
    }

    /* A near-zero-opacity paper-grain texture under every card surface --
       the same feTurbulence noise trick as Camille_website's .bg-noise,
       just turned down from "visible dither" to "you'd need a colour
       picker to prove it's there." Gives the translucent pistachio the
       same handled-material quality as the rest of the paint/pigment
       world this app sits next to, without reading as texture at a glance. */
    .bg-white {
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 128 128' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E") !important;
      background-blend-mode: soft-light !important;
    }

    /* Cards opt into this when the data behind them needs attention --
       schedule stages running late, insurance lapsing, a budget category
       over, a job estimated on thin data. Same brown halo, just turned up,
       so the card itself carries a bit of the "look here" weight instead
       of relying on the reader to spot a badge. */
    .card-alert {
      box-shadow:
        0 28px 62px -14px rgba(var(--brown-halo), 0.4),
        0 8px 18px -4px rgba(var(--brown-halo), 0.26) !important;
    }
  </style>
</head>
<body class="bg-[#e5e3e8] text-[${COLORS.bodyText}] min-h-screen">
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
    <g fill="none" stroke="#5a4a6e" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" opacity="0.08">
      ${PLAN_VARIANTS[planVariant] || PLAN_VARIANTS.default}
    </g>
  </svg>
  <!--
    A raking "light" over the plan outline above -- one soft brown wedge,
    same size/position as the plan so it sweeps across its lines. Tracks
    the plan's own rotation but lags behind it, and the lag itself grows
    and shrinks over time (see the script below), so the wedge is
    sometimes catching up to the plan's spin and sometimes falling
    further behind -- it grazes a different set of lines each time round
    rather than tracing the same sweep on every rotation. Kept to the
    same near-invisible register as the paper-grain card texture:
    technically there, not something you'd consciously notice.
  -->
  <div id="bg-shader" aria-hidden="true" class="fixed -z-10 pointer-events-none"
    style="left:50%;top:50%;width:160vmax;height:160vmax;margin-left:-80vmax;margin-top:-80vmax;transform-origin:50% 50%;opacity:0.55;mix-blend-mode:soft-light;background:conic-gradient(from 0deg, rgba(var(--brown-halo),0) 0deg, rgba(var(--brown-halo),0.14) 26deg, rgba(var(--brown-halo),0) 62deg, rgba(var(--brown-halo),0) 360deg);"></div>
  <nav class="bg-white border-b border-slate-200">
    <div class="${shellWidth} mx-auto px-4">
      <div class="flex items-center justify-between gap-4 py-4">
        <div class="flex items-center">
          <span class="brand-mark font-light text-3xl uppercase tracking-wide text-[${COLORS.brandBlue}]">Buildscope</span>
        </div>
        <div class="flex items-center gap-5">
          <div class="hidden md:flex gap-1 flex-wrap justify-end">
            ${navHtml}
          </div>
          <button
            type="button"
            id="mobile-nav-toggle"
            class="md:hidden inline-flex items-center justify-center rounded-md p-2"
            style="color: var(--parchment);"
            aria-label="Toggle navigation menu"
            aria-expanded="false"
            aria-controls="mobile-nav-panel"
          >
            <svg id="mobile-nav-icon-open" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
            </svg>
            <svg id="mobile-nav-icon-close" class="hidden h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      <div id="mobile-nav-panel" class="flex-col gap-1 pb-4 pt-3 border-t" style="border-color: rgba(90,74,110,0.4); display: none;">
        ${navHtml}
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
      // Ambient background texture: three depth layers of soft violet
      // dots, drifting slowly, with each layer shifting a different amount
      // as you scroll (a small parallax). Modelled directly on the 3-tier
      // violet particle shader in Liam's Camille_website project (its
      // uColorViolet1/2/3 stack), just done in plain canvas 2D instead of
      // a WebGL shader, since this app stays zero-dependency. Purely
      // decorative — sits behind the card surfaces, which are translucent
      // enough to let it read faintly through them, never fully hidden.
      var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var canvas = document.getElementById('bg-particles');
      if (!canvas || reduceMotion) return;
      var ctx = canvas.getContext('2d');
      var dpr = Math.min(window.devicePixelRatio || 1, 2);

      // The dot sizes/blur below were tuned by eye against a desktop-width
      // canvas. On a narrower phone viewport, those same pixel values cover
      // proportionally far more of the screen -- each one stops reading as
      // ambient haze and starts reading as a distinct visible bubble.
      // viewportScale shrinks radius and blur together (so the softness
      // ratio between them, and each dot's size relative to the screen,
      // stays the same as it is on desktop) whenever the viewport is
      // narrower than the desktop width this was tuned on.
      var viewportScale = 1;
      function computeViewportScale() {
        var tunedForDimension = 1440;
        var minDimension = Math.min(window.innerWidth, window.innerHeight);
        return Math.max(0.4, Math.min(1, minDimension / tunedForDimension));
      }

      function resize() {
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
        viewportScale = computeViewportScale();
      }
      resize();
      window.addEventListener('resize', resize);

      // Far -> near: smaller/slower/fainter to larger/faster/slightly
      // stronger. Colours are Camille_website's own violet stack
      // (uColorViolet1 / uColorViolet2 / uColorViolet3), carried over
      // verbatim so the two projects share the same background DNA.
      // Deliberately soft and low-alpha enough that no single dot should
      // be consciously visible -- the blur turns each one into a diffuse
      // glow rather than a speck, and it's the differential drift/parallax
      // *between* the three layers, not the dots themselves, that reads
      // as depth.
      var LAYERS = [
        { count: 14, minR: 3,  maxR: 6,  blur: 5,  drift: 0.010, parallax: 0.02, color: 'rgba(90,74,110,0.045)' },
        { count: 10, minR: 5,  maxR: 9,  blur: 8,  drift: 0.018, parallax: 0.05, color: 'rgba(74,54,88,0.045)' },
        { count: 6,  minR: 8,  maxR: 13, blur: 12, drift: 0.028, parallax: 0.09, color: 'rgba(54,37,72,0.04)' },
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
          var blurPx = Math.max(layer.def.blur * dpr * viewportScale, 2 * dpr);
          ctx.filter = 'blur(' + blurPx + 'px)';
          ctx.fillStyle = layer.def.color;
          layer.points.forEach(function (p) {
            var yDrift = (p.y - t * layer.def.drift - (scrollY * layer.def.parallax) / h) % 1;
            if (yDrift < 0) yDrift += 1;
            var xDrift = p.x + Math.sin(t * 0.15 + p.wobble) * 0.01;
            var r = (layer.def.minR + (layer.def.maxR - layer.def.minR) * p.wobble / (Math.PI * 2)) * dpr * viewportScale;
            ctx.beginPath();
            ctx.arc(xDrift * w, yDrift * h, r, 0, Math.PI * 2);
            ctx.fill();
          });
        });
        ctx.filter = 'none';
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    })();
  </script>
  <script>
    (function () {
      // The faint plan outline: a slow, continuous ambient rotation (it
      // never stops, just eases back to a slow baseline), sped up
      // temporarily whenever you scroll, plus a quick decaying spin burst
      // triggered by any click. Because the plan is already turning at
      // all times, a click just accelerates the same motion rather than
      // introducing a different kind of movement -- it reads as the next
      // stage of the build coming together, not a jolt.
      //
      // #bg-shader (the soft brown wedge in the markup above) rides along
      // at the same base angle, trailing it by an offset that grows and
      // shrinks over time and every so often reverses which way it's
      // changing -- so the wedge is sometimes catching up to the plan's
      // spin and sometimes falling further behind, meaning it grazes a
      // different set of lines each time round rather than the same sweep.
      var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var el = document.getElementById('bg-planoutline');
      var shaderEl = document.getElementById('bg-shader');
      if (!el || reduceMotion) return;

      var scrollY = window.scrollY || 0;
      var lastScrollY = scrollY;
      var driftBoost = 1; // >1 right after a scroll, eases back to 1
      var angle = 0; // plan's current rotation, degrees
      var baseAngularSpeed = 1.4; // deg/sec -- the slow ambient turn
      var angularVelocity = baseAngularSpeed; // decays back to the (boosted) baseline, not to zero

      var lagOffset = 0; // degrees #bg-shader trails behind the plan, oscillates
      var lagDir = 1; // flips every so often
      var lagFlipTimer = 0;
      var nextLagFlip = 4 + Math.random() * 6;

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
        var targetSpeed = baseAngularSpeed * driftBoost;

        angle += angularVelocity * dt;
        angularVelocity += (targetSpeed - angularVelocity) * Math.min(dt * 0.5, 1);
        el.style.transform = 'rotate(' + angle.toFixed(2) + 'deg)';

        if (shaderEl) {
          lagFlipTimer += dt;
          if (lagFlipTimer > nextLagFlip) {
            lagDir *= -1;
            lagFlipTimer = 0;
            nextLagFlip = 4 + Math.random() * 6;
          }
          lagOffset += lagDir * 6 * dt;
          lagOffset = Math.max(-45, Math.min(45, lagOffset));
          shaderEl.style.transform = 'rotate(' + (angle - lagOffset).toFixed(2) + 'deg)';
        }

        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    })();
  </script>
  <script>
    (function () {
      // Mobile hamburger nav: toggles the collapsed nav panel for phone
      // widths. The panel's own visibility is driven by an inline
      // display style (not a Tailwind class) so the defensive CSS media
      // query above can force it closed at the desktop breakpoint
      // without fighting Tailwind's own class specificity.
      var toggle = document.getElementById('mobile-nav-toggle');
      var panel = document.getElementById('mobile-nav-panel');
      var iconOpen = document.getElementById('mobile-nav-icon-open');
      var iconClose = document.getElementById('mobile-nav-icon-close');
      if (!toggle || !panel) return;

      function setOpen(isOpen) {
        panel.style.display = isOpen ? 'flex' : 'none';
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        if (iconOpen) iconOpen.classList.toggle('hidden', isOpen);
        if (iconClose) iconClose.classList.toggle('hidden', !isOpen);
      }

      toggle.addEventListener('click', function () {
        setOpen(panel.style.display !== 'flex');
      });

      // Close automatically once a link is chosen, and if the viewport
      // widens past the mobile breakpoint while the menu is still open.
      panel.addEventListener('click', function (e) {
        if (e.target.closest('a')) setOpen(false);
      });
      window.addEventListener('resize', function () {
        if (window.innerWidth >= 768) setOpen(false);
      });
    })();
  </script>
  <script src="/public/offline-queue.js"></script>
</body>
</html>`;
}

module.exports = { layout, planVariantFor };
