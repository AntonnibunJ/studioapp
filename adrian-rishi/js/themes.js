// ══════════════════════════════════════════
//  DYNAMIC FUNCTION-CATEGORY THEME ENGINE
// ══════════════════════════════════════════
// Data-driven theming: each Function Category maps to a lightweight visual
// identity — an accent color pair, a glow color, an icon, and a tagline.
// This is applied ONLY to the client-facing gallery experience (scoped to
// #panel-client via CSS custom properties + the cover banner), never to
// the Platform Admin or Studio Owner panels.
//
// Categories not yet defined here below — and any project with no
// category set at all (older projects created before this feature) —
// fall through to 'default', whose colors exactly match the app's
// existing gold/champagne look. So nothing changes visually for any
// existing project until a themed category is actually assigned to it.
//
// To add a new themed category later: add one entry below. No other
// file needs to change — every themed surface reads from this table.
const FUNCTION_THEMES = {
  'Wedding': {
    icon: 'ri-heart-3-line',
    tagline: 'Your Wedding Story',
    accent: '#C9A96E', accentSoft: '#E3D9A8',
    glow: 'rgba(201,169,110,0.28)',
    pattern: { size: 64, shapes: '<circle cx="20" cy="24" r="9"/><circle cx="34" cy="24" r="9"/>' }
  },
  'Engagement': {
    icon: 'ri-heart-2-line',
    tagline: 'The Beginning of Forever',
    accent: '#E0A199', accentSoft: '#F0C9C2',
    glow: 'rgba(224,161,153,0.26)',
    pattern: { size: 56, shapes: '<path d="M28 40 C28 32 14 30 14 20 C14 13 20 10 28 17 C36 10 42 13 42 20 C42 30 28 32 28 40Z"/>' }
  },
  'Holy Communion': {
    icon: 'ri-sun-line',
    tagline: 'A Sacred Celebration',
    accent: '#E3D9A8', accentSoft: '#F5EFD8',
    glow: 'rgba(227,217,168,0.30)',
    pattern: { size: 60, shapes: buildRayBurst(30, 30, 10, 20, 8) }
  },
  'Baptism': {
    icon: 'ri-drop-line',
    tagline: 'A Blessed New Beginning',
    accent: '#8AB4E0', accentSoft: '#C3DCF0',
    glow: 'rgba(138,180,224,0.26)',
    pattern: { size: 64, shapes: '<path d="M0 24 Q16 14 32 24 T64 24"/><path d="M0 38 Q16 28 32 38 T64 38"/>' }
  },
  'Birthday': {
    icon: 'ri-cake-2-line',
    tagline: 'Another Year to Celebrate',
    accent: '#F0A93B', accentSoft: '#F7CC85',
    glow: 'rgba(240,169,59,0.28)',
    pattern: { size: 56, shapes: '<circle cx="10" cy="12" r="2.2"/><circle cx="42" cy="26" r="1.6"/><circle cx="24" cy="46" r="2.2"/><path d="M46 6 L48 11 L53 12 L48 13 L46 18 L44 13 L39 12 L44 11 Z"/>' }
  },
  'Baby Shower': {
    icon: 'ri-moon-clear-line',
    tagline: 'Welcoming a Little One',
    accent: '#B8A9E0', accentSoft: '#D9CFF0',
    glow: 'rgba(184,169,224,0.26)',
    pattern: { size: 60, shapes: '<path d="M22 8 A12 12 0 1 0 22 32 A9.5 9.5 0 1 1 22 8 Z"/><circle cx="44" cy="14" r="1.6"/><circle cx="48" cy="34" r="1.1"/>' }
  },
  'Corporate Event': {
    icon: 'ri-building-4-line',
    tagline: 'A Professional Milestone',
    accent: '#5D93C7', accentSoft: '#8AB4E0',
    glow: 'rgba(93,147,199,0.22)',
    pattern: { size: 40, shapes: '<circle cx="10" cy="10" r="1.4"/><circle cx="30" cy="10" r="1.4"/><circle cx="10" cy="30" r="1.4"/><circle cx="30" cy="30" r="1.4"/>' }
  },
  // Fallback used for every category not explicitly listed above
  // (Maternity, Newborn, Pre-Wedding, Post-Wedding, Reception,
  // Housewarming, Graduation, Fashion Shoot, Portfolio Shoot, Family
  // Shoot, Festival, Anniversary, Other/custom) and for projects with
  // no category set — matches the app's current default look exactly.
  'default': {
    icon: 'ri-camera-3-line',
    tagline: 'Your Memories, Beautifully Kept',
    accent: '#C9B980', accentSoft: '#E3D9A8',
    glow: 'rgba(201,185,128,0.25)',
    pattern: { size: 60, shapes: buildRayBurst(30, 30, 12, 17, 6) }
  }
};

// Generates a small radiating-lines motif (used for the Holy Communion
// "sunburst" pattern and the default "aperture" pattern) without having
// to hand-write each rotated line.
function buildRayBurst(cx, cy, rInner, rOuter, count) {
  let lines = '';
  for (let i = 0; i < count; i++) {
    const angle = (360 / count) * i;
    lines += `<line x1="${cx}" y1="${cy - rInner}" x2="${cx}" y2="${cy - rOuter}" transform="rotate(${angle} ${cx} ${cy})"/>`;
  }
  return lines;
}

// Builds a lightweight, tileable SVG background pattern for a theme —
// just thin outlined shapes at low opacity, so it reads as a subtle
// premium texture rather than a busy illustration. Pure vector, no
// network request, negligible weight (a few hundred bytes as a data URI).
function buildThemePatternUri(theme) {
  if (!theme.pattern) return 'none';
  const { size, shapes } = theme.pattern;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
    `<g fill="none" stroke="${theme.accent}" stroke-width="1.1" opacity="0.16">${shapes}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function getFunctionTheme(category) {
  return FUNCTION_THEMES[category] || FUNCTION_THEMES['default'];
}

// ══════════════════════════════════════════
//  STUDIO OWNER DASHBOARD — PREMIUM BANNER
// ══════════════════════════════════════════
// Unlike FUNCTION_THEMES above (which is per-project, client-facing, and
// changes with the event category), this is a single fixed premium
// identity for the Studio Owner's own dashboard — a photography/lighting
// themed accent + decorative motif (aperture rays, lens-flare sparkle,
// soft bokeh dots), using the app's existing emerald accent color for
// visual cohesion with the rest of the Studio Owner chrome.
const STUDIO_DASHBOARD_THEME = {
  accent: '#2F6E56',
  glow: 'rgba(47,110,86,0.25)',
  pattern: {
    size: 84,
    shapes: buildRayBurst(42, 42, 16, 30, 10) +
      '<circle cx="70" cy="14" r="1.6"/><circle cx="12" cy="66" r="1.3"/>' +
      '<path d="M66 66 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2Z"/>'
  }
};

// Applies the fixed Studio Owner dashboard banner: sets the CSS variables
// css/themes.css reads for .studio-banner, and (optionally) personalizes
// the label with the studio's own name if it's available yet.
function applyStudioDashboardTheme(studioName) {
  const panel = document.getElementById('panel-studio');
  if (!panel) return;
  panel.style.setProperty('--studio-accent', STUDIO_DASHBOARD_THEME.accent);
  panel.style.setProperty('--studio-glow', STUDIO_DASHBOARD_THEME.glow);
  panel.style.setProperty('--studio-pattern', buildThemePatternUri(STUDIO_DASHBOARD_THEME));
  const label = document.getElementById('studio-dashboard-banner-label');
  if (label && studioName) label.textContent = studioName;
}

// Applies the theme for the given Function Category to the client panel:
// sets scoped CSS variables (read by css/themes.css), a data-theme
// attribute for any future per-category CSS hooks, and populates the
// cover banner (icon, category label, tagline) if it's present.
function applyProjectTheme(category) {
  const theme = getFunctionTheme(category);
  const panel = document.getElementById('panel-client');
  if (!panel) return;

  panel.dataset.theme = (category && FUNCTION_THEMES[category])
    ? category.replace(/\s+/g, '-').toLowerCase()
    : 'default';
  panel.style.setProperty('--theme-accent', theme.accent);
  panel.style.setProperty('--theme-accent-soft', theme.accentSoft);
  panel.style.setProperty('--theme-glow', theme.glow);
  panel.style.setProperty('--theme-pattern', buildThemePatternUri(theme));

  const bannerIcon    = document.getElementById('client-theme-banner-icon');
  const bannerLabel   = document.getElementById('client-theme-banner-label');
  const bannerTagline = document.getElementById('client-theme-banner-tagline');
  if (bannerIcon)    bannerIcon.innerHTML = `<i class="${theme.icon}"></i>`;
  if (bannerLabel)   bannerLabel.textContent = category || 'Your Gallery';
  if (bannerTagline) bannerTagline.textContent = theme.tagline;
}
