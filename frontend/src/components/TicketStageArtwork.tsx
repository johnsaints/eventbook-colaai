import { useId } from 'react'

/** Full-bleed ColaAi stage backdrop vector SVG (waves, spotlights, neon glow, cheering crowd). */
export default function TicketStageArtwork() {
  const rawId = useId()
  const id = rawId.replace(/[^a-zA-Z0-9_-]/g, '')

  const ids = {
    base: `${id}-base`,
    rightGlow: `${id}-rightGlow`,
    wave1: `${id}-wave1`,
    wave2: `${id}-wave2`,
    pinkFloor: `${id}-pinkFloor`,
    violetFloor: `${id}-violetFloor`,
    cyanGlow: `${id}-cyanGlow`,
    beamCyan: `${id}-beamCyan`,
    beamPink: `${id}-beamPink`,
    flareWhite: `${id}-flareWhite`,
    beamSoft: `${id}-beamSoft`,
  }

  return (
    <svg
      className="colaai-ticket-backdrop"
      viewBox="0 0 960 280"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={ids.base} x1="0%" y1="15%" x2="100%" y2="85%">
          <stop offset="0%" stopColor="#005de8" />
          <stop offset="26%" stopColor="#09215e" />
          <stop offset="48%" stopColor="#1d1878" />
          <stop offset="72%" stopColor="#7035f5" />
          <stop offset="100%" stopColor="#ff2e9e" />
        </linearGradient>

        <linearGradient id={ids.rightGlow} x1="28%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0b7bff" stopOpacity="0" />
          <stop offset="30%" stopColor="#6536f5" stopOpacity="0.65" />
          <stop offset="68%" stopColor="#9f33ff" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#ff2e9e" stopOpacity="0.95" />
        </linearGradient>

        <linearGradient id={ids.wave1} x1="0%" y1="0%" x2="90%" y2="90%">
          <stop offset="0%" stopColor="#00f6ff" />
          <stop offset="52%" stopColor="#00bbff" />
          <stop offset="100%" stopColor="#0b67ff" stopOpacity="0" />
        </linearGradient>

        <linearGradient id={ids.wave2} x1="10%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#68ffff" stopOpacity="0.95" />
          <stop offset="48%" stopColor="#00c3ff" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#0b4eff" stopOpacity="0" />
        </linearGradient>

        <radialGradient id={ids.pinkFloor} cx="16%" cy="92%" r="48%">
          <stop offset="0%" stopColor="#ff2e9e" stopOpacity="0.96" />
          <stop offset="42%" stopColor="#b032ff" stopOpacity="0.68" />
          <stop offset="100%" stopColor="#0c1a4d" stopOpacity="0" />
        </radialGradient>

        <radialGradient id={ids.violetFloor} cx="38%" cy="88%" r="42%">
          <stop offset="0%" stopColor="#a338ff" stopOpacity="0.72" />
          <stop offset="55%" stopColor="#4c2bc2" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#091540" stopOpacity="0" />
        </radialGradient>

        <radialGradient id={ids.cyanGlow} cx="10%" cy="20%" r="55%">
          <stop offset="0%" stopColor="#00f2ff" stopOpacity="0.92" />
          <stop offset="55%" stopColor="#0b7bff" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#07163b" stopOpacity="0" />
        </radialGradient>

        <linearGradient id={ids.beamCyan} x1="95%" y1="0%" x2="10%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="18%" stopColor="#26f3ff" stopOpacity="0.72" />
          <stop offset="62%" stopColor="#0b7bff" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#0b7bff" stopOpacity="0" />
        </linearGradient>

        <linearGradient id={ids.beamPink} x1="95%" y1="0%" x2="18%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="22%" stopColor="#ff4bbd" stopOpacity="0.7" />
          <stop offset="65%" stopColor="#7a3dff" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#7a3dff" stopOpacity="0" />
        </linearGradient>

        <radialGradient id={ids.flareWhite} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="35%" stopColor="#c9f8ff" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#00d4ff" stopOpacity="0" />
        </radialGradient>

        <filter id={ids.beamSoft} x="-15%" y="-15%" width="130%" height="130%">
          <feGaussianBlur stdDeviation="4.5" />
        </filter>
      </defs>

      {/* Deep gradient sky + stage base across entire ticket */}
      <rect width="960" height="280" fill={`url(#${ids.base})`} />

      {/* Seamless horizontal neon glow transitioning smoothly into top/bottom bands */}
      <rect width="960" height="280" fill={`url(#${ids.rightGlow})`} />

      {/* Sweeping cyan & electric-blue wave ribbons on the left */}
      <path d="M0,0 H348 C248,48 168,145 126,280 H0 Z" fill={`url(#${ids.cyanGlow})`} />
      <path d="M0,0 H258 C182,42 110,126 62,248 L0,210 Z" fill={`url(#${ids.wave1})`} opacity="0.82" />
      <path d="M0,0 H188 C126,38 72,96 22,188 L0,165 Z" fill={`url(#${ids.wave2})`} />
      <path d="M98,0 C60,44 26,95 0,152 V98 C24,56 48,26 70,0 Z" fill="#9cfcff" opacity="0.4" />

      {/* Vibrant magenta/purple stage backlighting behind cheering crowd */}
      <rect width="960" height="280" fill={`url(#${ids.pinkFloor})`} />
      <rect width="960" height="280" fill={`url(#${ids.violetFloor})`} />

      {/* Soft-blurred volumetric stage light cones */}
      <g filter={`url(#${ids.beamSoft})`}>
        <polygon points="338,14 140,250 226,258" fill={`url(#${ids.beamCyan})`} />
        <polygon points="366,22 222,258 312,262" fill={`url(#${ids.beamCyan})`} opacity="0.85" />
        <polygon points="392,28 292,260 398,262" fill={`url(#${ids.beamPink})`} />
        <polygon points="324,8 96,210 156,222" fill={`url(#${ids.beamCyan})`} opacity="0.5" />
      </g>

      {/* Crisp spotlight lens flares */}
      <circle cx="338" cy="14" r="20" fill={`url(#${ids.flareWhite})`} />
      <circle cx="366" cy="22" r="15" fill={`url(#${ids.flareWhite})`} />
      <circle cx="392" cy="28" r="22" fill={`url(#${ids.flareWhite})`} />

      {/* Raised hands & cheering concert crowd tucked neatly behind the sheet */}
      <g fill="#060e29" opacity="0.94">
        <path d="M0,280 L0,248 C18,242 28,248 40,254 C52,240 66,242 78,252 C92,238 112,244 126,256 C140,242 158,240 174,250 C188,236 208,238 224,252 C240,238 260,240 278,254 C295,238 316,238 334,250 C352,238 372,242 390,254 C402,258 414,268 424,280 Z" />

        <circle cx="24" cy="242" r="11" />
        <circle cx="60" cy="238" r="12" />
        <circle cx="98" cy="244" r="11" />
        <circle cx="144" cy="240" r="12" />
        <circle cx="188" cy="236" r="11" />
        <circle cx="232" cy="242" r="12" />
        <circle cx="276" cy="238" r="11" />
        <circle cx="322" cy="236" r="12" />
        <circle cx="366" cy="240" r="12" />
        <circle cx="398" cy="244" r="10" />

        <path d="M12,256 L22,202 L18,191 L21,189 L25,197 L27,187 L30,188 L29,198 L33,191 L35,193 L29,207 L20,256 Z" />
        <path d="M44,252 L50,210 L46,198 L49,197 L53,205 L56,196 L59,197 L57,208 L61,201 L63,203 L56,214 L51,252 Z" />
        <path d="M76,258 L69,205 L63,191 L66,189 L71,198 L72,184 L75,184 L76,198 L81,189 L84,191 L78,207 L85,258 Z" />
        <path d="M92,256 L104,200 L102,186 L106,186 L108,195 L112,185 L115,187 L112,198 L117,192 L119,194 L111,208 L100,256 Z" />
        <path d="M132,254 L137,220 L134,210 L137,209 L140,216 L143,208 L146,209 L144,219 L141,254 Z" />
        <path d="M168,256 L176,216 L173,206 L176,205 L179,213 L182,204 L185,206 L183,217 L176,256 Z" />
        <path d="M214,258 L207,222 L203,212 L206,210 L210,218 L213,209 L216,211 L214,221 L222,258 Z" />
        <path d="M254,256 L262,218 L259,208 L262,207 L265,215 L268,206 L271,208 L269,219 L262,256 Z" />
        <path d="M298,258 L308,202 L305,190 L308,189 L312,198 L315,187 L318,189 L316,201 L321,194 L323,196 L315,209 L306,258 Z" />
        <path d="M342,256 L331,204 L325,193 L328,191 L333,200 L335,188 L338,189 L338,200 L343,193 L346,195 L339,208 L350,256 Z" />
        <path d="M362,256 L378,200 L376,188 L379,187 L382,196 L387,187 L390,189 L386,200 L392,194 L394,196 L385,209 L370,256 Z" />
      </g>
    </svg>
  )
}
