/* ALEH DRIVE — animated splash logo (v3, elite spec).
   Six-phase choreography (~5s):
     P1 0.0–0.6   outer ring + dashboard frame fade in
     P2 0.4–1.6   main 270° arc draws in CW from upper-left to upper-right
     P3 1.0–2.2   tick marks materialize, staggered, with major/minor weights
     P4 1.5–2.2   red zone illuminates at the high end
     P5 1.7–3.1   red needle sweeps aggressively across the FULL 270° arc
                  (over the top), with two delayed afterimages = motion blur
     P6 2.6–3.4   ALEH mark reveals INSIDE the dial face (above the hub),
                  fading in with a precision-line scan from above
     P7 3.0–4.0   ALEH DRIVE wordmark resolves, letter-spacing collapses
     P8 3.6–4.4   tagline + login chrome appear; idle motion begins */

// Inlined as data URL via aleh-logo-data.js — guarantees the leaf renders
// regardless of how the SVG <image> resolves relative paths.
const ALEH_SRC = (typeof window !== 'undefined' && window.ALEH_LOGO_DATA_URL)
  || "assets/aleh-logo-white.png";

// Casual / modern sans options — less formal than the engraved-serif set.
const FONT_STACKS = {
  outfit: `'Outfit', 'Manrope', 'Helvetica Neue', sans-serif`,
  sora: `'Sora', 'Outfit', 'Helvetica Neue', sans-serif`,
  jakarta: `'Plus Jakarta Sans', 'Manrope', sans-serif`,
  spaceg: `'Space Grotesk', 'Manrope', sans-serif`,
  dm: `'DM Sans', 'Manrope', sans-serif`,
  manrope: `'Manrope', 'Outfit', 'Helvetica Neue', sans-serif`,
  saira: `'Saira', 'Manrope', 'Helvetica Neue', sans-serif`,
  bebas: `'Bebas Neue', 'Saira Condensed', 'Helvetica Neue', sans-serif`,
  marcellus: `'Marcellus', 'Cormorant Garamond', serif`
};
const HEB_FONT = `'Noto Sans Hebrew', 'Heebo', 'Assistant', sans-serif`;

// 270° dial open at bottom, hub at center, mark INSIDE the dial face above
// the hub. viewBox 600×720.
const VB_W = 600;
const VB_H = 760;
const SPEEDO = { cx: 300, cy: 360, r: 200 };
//   Mark sits inside the dial face, above the hub. Distance from hub
//   center 90px → max corner distance from hub ~110px, well inside r=200.
const MARK = { cx: 300, cy: 268, w: 116, h: 116 };
const NEEDLE_LEN = 175;
const ARC_START = -135; // svg angle from up CW
const ARC_END = 135;
const RED_START = 95; // last ~30°

function SplashLogo({
  accent = '#FF2D2D',
  font = 'outfit',
  replay = 0,
  scale = 1,
  // taglineLines: array of strings rendered below the divider. Hebrew
  // strings are auto-detected and rendered RTL in Noto Sans Hebrew.
  taglineLines = ['FLEET · ROUTES · CARE']
}) {
  const fontStack = FONT_STACKS[font] || FONT_STACKS.outfit;
  const isHebrew = (s) => /[\u0590-\u05FF]/.test(s);

  // Tick positions, in speedo-local coords.
  const ticks = [];
  const TICK_COUNT = 28;
  for (let i = 0; i < TICK_COUNT; i++) {
    const t = i / (TICK_COUNT - 1);
    const ang = ARC_START + t * (ARC_END - ARC_START);
    const isMajor = i % 3 === 0 || i === TICK_COUNT - 1;
    const r1 = SPEEDO.r + 10;
    const r2 = isMajor ? SPEEDO.r - 18 : SPEEDO.r - 4;
    const a = (ang - 90) * Math.PI / 180;
    const x1 = Math.cos(a) * r1,y1 = Math.sin(a) * r1;
    const x2 = Math.cos(a) * r2,y2 = Math.sin(a) * r2;
    ticks.push({ key: i, x1, y1, x2, y2, isMajor, delay: 1.0 + i * 0.03 });
  }

  return (
    <div className="splash-logo" key={replay} style={{ '--logo-scale': scale }}>
      <svg
        className="logo-svg"
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid meet"
        style={{ '--accent': accent }}>
        
        <defs>
          <radialGradient id="halo" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.10" />
            <stop offset="60%" stopColor="#fff" stopOpacity="0.025" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="metallic" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="50%" stopColor="#cfd6df" stopOpacity="1" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.92" />
          </linearGradient>
          <linearGradient id="arc-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.35" />
            <stop offset="50%" stopColor="#fff" stopOpacity="1" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0.85" />
          </linearGradient>
          <filter id="needle-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="soft-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <clipPath id="markScan">
            <rect className="scan-rect" x="0" y="0" width={VB_W} height={VB_H} />
          </clipPath>
        </defs>

        {/* Ambient halo */}
        <circle className="halo" cx={SPEEDO.cx} cy={SPEEDO.cy} r="280" fill="url(#halo)" />

        {/* ── DIAL ──────────────────────────────────────────── */}
        <g className="speedo" transform={`translate(${SPEEDO.cx} ${SPEEDO.cy})`}>
          {/* Outermost faint guide ring (full circle for depth) */}
          <circle className="ring-outer" r={SPEEDO.r + 22} fill="none"
          stroke="#fff" strokeOpacity="0.06" strokeWidth="1" />
          {/* Inner faint guide ring */}
          <circle className="ring-inner" r={SPEEDO.r - 22} fill="none"
          stroke="#fff" strokeOpacity="0.08" strokeWidth="1" />

          {/* Outer faint arc (background of main arc) */}
          <path
            className="arc-bg"
            d={describeArc(0, 0, SPEEDO.r, ARC_START, ARC_END)}
            fill="none"
            stroke="#fff" strokeOpacity="0.10"
            strokeWidth="2.5" />
          

          {/* Main arc — primary draw-in animation */}
          <path
            className="arc-main"
            d={describeArc(0, 0, SPEEDO.r, ARC_START, ARC_END)}
            fill="none"
            stroke="url(#arc-gradient)"
            strokeWidth="2.5"
            strokeLinecap="round"
            filter="url(#soft-glow)" />
          

          {/* Tick marks */}
          <g className="ticks">
            {ticks.map((tk) =>
            <line
              key={tk.key}
              className="tick"
              x1={tk.x1} y1={tk.y1} x2={tk.x2} y2={tk.y2}
              stroke="#fff"
              strokeOpacity={tk.isMajor ? 0.95 : 0.55}
              strokeWidth={tk.isMajor ? 2.4 : 1}
              strokeLinecap="round"
              style={{ animationDelay: `${tk.delay}s` }} />

            )}
          </g>

          {/* Numerical scale labels (subtle) at major ticks */}
          {ticks.filter((tk) => tk.isMajor).map((tk, idx) => {
            const ang = ARC_START + tk.key / (TICK_COUNT - 1) * (ARC_END - ARC_START);
            const a = (ang - 90) * Math.PI / 180;
            const lr = SPEEDO.r - 38;
            const lx = Math.cos(a) * lr,ly = Math.sin(a) * lr;
            const val = idx * 20; // 0, 20, 40, ...
            return (
              <text
                key={`lbl-${tk.key}`}
                className="scale-label"
                x={lx} y={ly + 4}
                textAnchor="middle"
                fill="#fff"
                fillOpacity="0.55"
                style={{
                  fontFamily: fontStack,
                  fontWeight: 400,
                  fontSize: 11,
                  letterSpacing: '0.08em',
                  animationDelay: `${1.4 + idx * 0.05}s`
                }}>
                
                {val}
              </text>);

          })}

          {/* Red zone */}
          <path
            className="redzone"
            d={describeArc(0, 0, SPEEDO.r, RED_START, ARC_END)}
            fill="none"
            stroke="var(--accent)"
            strokeOpacity="0.9"
            strokeWidth="4"
            strokeLinecap="round" />
          
          {/* Red zone outer glow accent */}
          <path
            className="redzone-glow"
            d={describeArc(0, 0, SPEEDO.r + 14, RED_START, ARC_END)}
            fill="none"
            stroke="var(--accent)"
            strokeOpacity="0.18"
            strokeWidth="6"
            strokeLinecap="round" />
          

          {/* ── ALEH MARK INSIDE THE DIAL FACE ───────────────── */}
          {/* We place the mark inside the speedo group so it sits on the
               dial face. Z-order: above the arc/ticks but below the needle
               (so the needle visually sweeps over it for a brief moment). */}
          <g className="mark-group">
            {/* Solid plate behind the mark — sits ON TOP of the dial face
                 so the leaf is unambiguously legible. */}
            <circle cx={MARK.cx - SPEEDO.cx} cy={MARK.cy - SPEEDO.cy}
            r="80" fill="#000" fillOpacity="0.85" />
            <circle cx={MARK.cx - SPEEDO.cx} cy={MARK.cy - SPEEDO.cy}
            r="80" fill="none" stroke="#fff" strokeOpacity="0.30" strokeWidth="1" />
            <circle cx={MARK.cx - SPEEDO.cx} cy={MARK.cy - SPEEDO.cy}
            r="74" fill="none" stroke="#fff" strokeOpacity="0.10" strokeWidth="0.5" />
            <image
              href={ALEH_SRC}
              xlinkHref={ALEH_SRC}
              x={MARK.cx - SPEEDO.cx - MARK.w / 2}
              y={MARK.cy - SPEEDO.cy - MARK.h / 2}
              width={MARK.w}
              height={MARK.h}
              preserveAspectRatio="xMidYMid meet" />
            
            {/* Holographic scan-line that wipes from above to reveal the mark */}
            <rect
              className="scan-line"
              x={MARK.cx - SPEEDO.cx - 60}
              y={MARK.cy - SPEEDO.cy - 70}
              width="120" height="1.5"
              fill="#fff" fillOpacity="0.85" />
            
          </g>

          {/* ── NEEDLE — single blade, pivots at local (0,0) = hub ── */}
          <g className="needle-group" filter="url(#needle-glow)">
            <path
              className="needle-blade"
              d={`M 0 -4.5 L ${NEEDLE_LEN} 0 L 0 4.5 Z`}
              fill="var(--accent)" />
            
            <circle cx={NEEDLE_LEN - 6} cy="0" r="2.6" fill="#fff" />
          </g>

          {/* HUB — premium recessed boss */}
          <circle className="hub-ring" r="22" fill="none"
          stroke="#fff" strokeOpacity="0.30" strokeWidth="1" />
          <circle className="hub-outer" r="16" fill="#0a0a0a"
          stroke="url(#metallic)" strokeWidth="1.5" />
          <circle className="hub-inner" r="6" fill="var(--accent)" />
          <circle className="hub-pulse" r="6" fill="var(--accent)" opacity="0" />
        </g>

        {/* ── WORDMARK ───────────────────────────────────────── */}
        <g className="wordmark-group">
          <text
            x={VB_W / 2} y={636}
            textAnchor="middle"
            fill="url(#metallic)"
            style={{
              fontFamily: fontStack,
              fontWeight: 600,
              fontSize: 56,
              letterSpacing: '0.32em',
              textTransform: 'uppercase'
            }}>
            
            <tspan>ALEH</tspan>
            <tspan dx="22" fontWeight="200" fillOpacity="0.95">DRIVE</tspan>
          </text>

          {/* Decorative divider — short rule with two end caps and a
               centered diamond, gives a more crafted feel than a plain line. */}
          <g className="rule-group">
            <line className="rule"
            x1={VB_W / 2 - 110} y1="660" x2={VB_W / 2 - 10} y2="660"
            stroke="#fff" strokeOpacity="0.50" strokeWidth="0.75" />
            <line className="rule"
            x1={VB_W / 2 + 10} y1="660" x2={VB_W / 2 + 110} y2="660"
            stroke="#fff" strokeOpacity="0.50" strokeWidth="0.75" />
            <path className="rule-diamond"
            d={`M ${VB_W / 2} 656 L ${VB_W / 2 + 4} 660 L ${VB_W / 2} 664 L ${VB_W / 2 - 4} 660 Z`}
            fill="#fff" fillOpacity="0.70" />
          </g>

          {/* Tagline lines — Hebrew auto-detected. */}
          {taglineLines.map((line, i) => {
            const heb = isHebrew(line);
            const baseY = 690;
            const lineGap = 30;
            const y = baseY + i * lineGap;
            const isLast = i === taglineLines.length - 1;
            return (
              <text
                key={i}
                x={VB_W / 2} y={y}
                textAnchor="middle"
                fill="#fff"
                fillOpacity={heb ? isLast ? 0.95 : 0.75 : 0.55}
                direction={heb ? 'rtl' : 'ltr'}
                style={{
                  fontFamily: heb ? HEB_FONT : fontStack,
                  fontWeight: heb ? isLast ? 500 : 400 : 400,
                  fontSize: heb ? isLast ? 20 : 15 : 11,
                  letterSpacing: heb ? '0.10em' : '0.6em',
                  textTransform: heb ? 'none' : 'uppercase'
                }}>
                
                {heb ? line : line}
              </text>);

          })}
        </g>
      </svg>
    </div>);

}

function describeArc(cx, cy, r, startDeg, endDeg) {
  const toRad = (d) => (d - 90) * Math.PI / 180;
  const x1 = cx + r * Math.cos(toRad(startDeg));
  const y1 = cy + r * Math.sin(toRad(startDeg));
  const x2 = cx + r * Math.cos(toRad(endDeg));
  const y2 = cy + r * Math.sin(toRad(endDeg));
  const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  const sweep = endDeg > startDeg ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} ${sweep} ${x2} ${y2}`;
}

window.SplashLogo = SplashLogo;