import { useId } from "react";
import { LIME, CORAL, AMBER, CYAN, withAlpha } from "./palette.js";

/* ── Chomp's cast, drawn once here so Chomp.jsx stays about rules ─────────
   Every sprite is a 100×100 viewBox and every character is drawn in the same
   two passes as Pounce's pieces: a fat-stroked rim pass whose union forms the
   outline (internal seams and all), then the real fills on top, which cover
   those seams. At a 13×13 board the cell is ~26px on a phone, so the
   silhouette is doing almost all of the work — the rim keeps it one readable
   shape instead of a pile of overlapping blobs, and every character faces
   RIGHT so the board code can flip with a single scaleX(-1).               */

const DINO_RIM = "#1F4A11";
const REX_RIM = "#59110A";

/* ── the herbivore ────────────────────────────────────────────────────────
   Long neck + back plates + a fat tail: three cues that all say "not the
   predator", so even at thumbnail size nobody confuses the two dinos. The
   `run` phase (0 or 1) swaps which leg is forward — the board alternates it
   on every step, so the dino's gait is driven by the game clock rather than
   a CSS animation that would drift out of sync as the game speeds up.     */
export function DinoSprite({ run = 0, alarmed = false }) {
  const uid = useId().replace(/:/g, "");
  const legA = run ? "M34,72 L34,86" : "M38,72 L34,86";
  const legB = run ? "M56,72 L60,86" : "M56,72 L56,86";

  const body = (
    <>
      {/* tail — thick at the hip, whipping up behind */}
      <path d="M27,62 C14,64 6,56 3,44 C10,48 16,50 24,49 Z" />
      {/* body */}
      <ellipse cx="45" cy="59" rx="26" ry="18" />
      {/* neck */}
      <path d="M58,50 C62,36 70,27 79,25 L86,36 C78,39 72,47 69,58 Z" />
      {/* head + snout */}
      <ellipse cx="82" cy="27" rx="14" ry="11" />
      <path d="M88,20 C95,20 98,24 97,29 C96,33 92,35 88,34 Z" />
    </>
  );

  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={`chDino${uid}`} x1="0" y1="0" x2="0.2" y2="1">
          <stop offset="0%" stopColor="#E4F878" />
          <stop offset="52%" stopColor={LIME} />
          <stop offset="100%" stopColor="#8DBB16" />
        </linearGradient>
      </defs>

      {/* legs sit under the rim pass so they read as behind the body */}
      <g stroke={DINO_RIM} strokeWidth="13" strokeLinecap="round" fill="none">
        <path d={legA} />
        <path d={legB} />
      </g>

      {/* rim / outline pass */}
      <g fill={DINO_RIM} stroke={DINO_RIM} strokeWidth="8" strokeLinejoin="round" strokeLinecap="round">
        {body}
      </g>

      <g stroke={DINO_RIM} strokeWidth="9" strokeLinecap="round" fill="none">
        <path d={legA} />
        <path d={legB} />
      </g>
      <g stroke="#A8D42A" strokeWidth="5" strokeLinecap="round" fill="none">
        <path d={legA} />
        <path d={legB} />
      </g>

      {/* fills */}
      <g fill={`url(#chDino${uid})`}>{body}</g>

      {/* belly + back plates: the plates are the herbivore tell */}
      <path d="M25,66 C34,76 58,76 66,64 C57,72 34,73 25,66 Z" fill={withAlpha("#FFFFFF", 0.45)} />
      <g fill="#7FAE12" stroke={DINO_RIM} strokeWidth="2.5" strokeLinejoin="round">
        <path d="M30,45 L37,32 L43,44 Z" />
        <path d="M43,42 L50,28 L56,41 Z" />
        <path d="M56,44 L62,33 L66,45 Z" />
      </g>

      {/* face — wide awake, and genuinely scared when the Rex is on top of you */}
      <circle cx="84" cy="24" r={alarmed ? 6.2 : 5.4} fill="#FFFFFF" />
      <circle cx={alarmed ? 85.6 : 85.2} cy="24.6" r={alarmed ? 2.6 : 3} fill="#1B2A05" />
      <circle cx="83" cy="22" r="1.5" fill="#FFFFFF" />
      {alarmed && <path d="M77,15 L88,13" stroke={DINO_RIM} strokeWidth="3" strokeLinecap="round" />}
      {/* nostril + mouth line, kept tiny so they never muddy the head shape */}
      <circle cx="94" cy="25" r="1.6" fill={DINO_RIM} />
      <path d="M89,31 L96,30" stroke={DINO_RIM} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/* ── the predator ─────────────────────────────────────────────────────────
   Everything the herbivore isn't: head-forward silhouette, open jaw with
   teeth, angular tail, tiny arms. `run` alternates the stride the same way,
   `roaring` opens the jaw wider for the rampage beat.                      */
export function RexSprite({ run = 0, roaring = false }) {
  const uid = useId().replace(/:/g, "");
  const legA = run ? "M36,68 L32,88" : "M32,68 L36,88";
  const legB = run ? "M54,68 L60,88" : "M58,68 L54,88";
  const jaw = roaring
    ? "M62,30 C74,22 90,24 97,32 L92,40 L96,47 C86,53 70,50 63,42 Z"
    : "M62,32 C74,26 90,27 97,33 L93,39 L96,44 C86,47 70,45 63,42 Z";

  const body = (
    <>
      {/* tail — a straight counterweight, unlike the dino's curled one */}
      <path d="M32,58 C18,58 8,50 2,38 C12,44 22,46 32,45 Z" />
      <ellipse cx="46" cy="55" rx="24" ry="17" />
      {/* neck into a big forward head */}
      <path d="M56,44 C60,34 68,28 76,27 L82,38 C74,41 68,47 66,54 Z" />
      <ellipse cx="76" cy="32" rx="15" ry="12" />
    </>
  );

  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={`chRex${uid}`} x1="0" y1="0" x2="0.2" y2="1">
          <stop offset="0%" stopColor="#FF8A6B" />
          <stop offset="48%" stopColor={CORAL} />
          <stop offset="100%" stopColor="#C41F08" />
        </linearGradient>
      </defs>

      <g stroke={REX_RIM} strokeWidth="15" strokeLinecap="round" fill="none">
        <path d={legA} />
        <path d={legB} />
      </g>

      <g fill={REX_RIM} stroke={REX_RIM} strokeWidth="8" strokeLinejoin="round" strokeLinecap="round">
        {body}
        <path d={jaw} />
      </g>

      <g stroke={REX_RIM} strokeWidth="11" strokeLinecap="round" fill="none">
        <path d={legA} />
        <path d={legB} />
      </g>
      <g stroke="#E8442A" strokeWidth="6" strokeLinecap="round" fill="none">
        <path d={legA} />
        <path d={legB} />
      </g>

      <g fill={`url(#chRex${uid})`}>{body}</g>
      <path d={jaw} fill={`url(#chRex${uid})`} />

      {/* jaw interior + teeth — the single loudest read on the sprite */}
      <path
        d={roaring ? "M67,38 C77,34 88,35 94,39 C87,45 74,45 67,41 Z" : "M68,39 C78,36 88,37 93,40 C86,43 75,43 68,41 Z"}
        fill="#3A0A05"
      />
      <g fill="#FFFFFF">
        <path d="M70,36 L73,41 L76,36 Z" />
        <path d="M78,35 L81,40 L84,35 Z" />
        <path d="M86,36 L89,40 L91,36 Z" />
        {roaring && (
          <>
            <path d="M72,45 L75,41 L78,45 Z" />
            <path d="M82,45 L85,41 L88,45 Z" />
          </>
        )}
      </g>

      {/* tiny arm — the joke everyone recognises, and a second silhouette cue */}
      <path d="M58,52 L66,56 L63,62" fill="none" stroke={REX_RIM} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M58,52 L66,56 L63,62" fill="none" stroke="#E8442A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

      {/* eye — amber slit under a heavy brow, so it reads angry at 26px */}
      <ellipse cx="76" cy="27" rx="5.6" ry="4.6" fill="#FFD84D" />
      <ellipse cx="77" cy="27" rx="2" ry="4.2" fill="#2A0703" />
      <path d="M69,21 L83,24" stroke={REX_RIM} strokeWidth="4.5" strokeLinecap="round" />
    </svg>
  );
}

/* ── scenery ──────────────────────────────────────────────────────────────
   Trees and ponds are deliberately NOT accent-coloured: the four accents on
   this board each mean one thing (you / him / food / death-by-water), so the
   trees stay a neutral forest green and never compete for attention.
   `seed` breaks up the grid — a board of 18 identical trees looks tiled.   */
export function TreeSprite({ seed = 0 }) {
  const uid = useId().replace(/:/g, "");
  const lean = ((seed % 3) - 1) * 5;
  const scale = 0.92 + ((seed % 4) * 0.05);
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={`chTree${uid}`} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#4C8630" />
          <stop offset="100%" stopColor="#23511A" />
        </linearGradient>
      </defs>
      <g transform={`rotate(${lean} 50 88) translate(50 88) scale(${scale}) translate(-50 -88)`}>
        <path d="M45,90 L45,64 L55,64 L55,90 Z" fill="#6B4A2A" stroke="#3E2A16" strokeWidth="4" strokeLinejoin="round" />
        <g fill="#1C4415">
          <circle cx="34" cy="52" r="19" />
          <circle cx="66" cy="52" r="18" />
          <circle cx="50" cy="34" r="21" />
        </g>
        <g fill={`url(#chTree${uid})`}>
          <circle cx="34" cy="52" r="15.5" />
          <circle cx="66" cy="52" r="14.5" />
          <circle cx="50" cy="34" r="17.5" />
        </g>
        {/* one highlight blob keeps the canopy from reading as a flat sticker */}
        <circle cx="44" cy="28" r="6" fill={withAlpha("#FFFFFF", 0.16)} />
      </g>
    </svg>
  );
}

/** Water. Lethal, so it gets a hard cyan rim — "hole in the board", not decor. */
export function PondSprite({ seed = 0 }) {
  const uid = useId().replace(/:/g, "");
  const rot = (seed % 4) * 90;
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: "block" }}>
      <defs>
        <radialGradient id={`chPond${uid}`} cx="0.4" cy="0.3" r="0.8">
          <stop offset="0%" stopColor="#8FE6FF" />
          <stop offset="55%" stopColor={CYAN} />
          <stop offset="100%" stopColor="#0A7BA3" />
        </radialGradient>
      </defs>
      <g transform={`rotate(${rot} 50 50)`}>
        <path
          d="M50,6 C74,6 94,24 94,50 C94,76 74,94 50,94 C26,94 6,76 6,50 C6,24 26,6 50,6 Z"
          fill={`url(#chPond${uid})`}
          stroke="#0A6E93"
          strokeWidth="5"
        />
        <g fill="none" stroke={withAlpha("#FFFFFF", 0.7)} strokeWidth="4.5" strokeLinecap="round">
          <path d="M24,38 C32,32 42,32 50,36" />
          <path d="M52,60 C60,55 68,55 76,59" />
        </g>
      </g>
    </svg>
  );
}

/** Food: an amber fern frond. Amber because it's the one colour on the board
    no plant/tree/dino wears, so "where do I go next" is a zero-thought read. */
export function FoodSprite() {
  const uid = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={`chFood${uid}`} x1="0" y1="1" x2="0.3" y2="0">
          <stop offset="0%" stopColor="#F07A00" />
          <stop offset="55%" stopColor={AMBER} />
          <stop offset="100%" stopColor="#FFDA5C" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="52" r="34" fill={withAlpha(AMBER, 0.22)} />
      <g stroke="#8A4A00" strokeWidth="9" strokeLinejoin="round" strokeLinecap="round" fill="#8A4A00">
        <path d="M50,90 L50,60" />
        <path d="M50,64 C28,60 18,44 20,24 C40,26 50,40 50,64 Z" />
        <path d="M50,64 C72,60 82,44 80,24 C60,26 50,40 50,64 Z" />
      </g>
      <path d="M50,90 L50,58" stroke="#C87000" strokeWidth="5" strokeLinecap="round" />
      <path d="M50,64 C28,60 18,44 20,24 C40,26 50,40 50,64 Z" fill={`url(#chFood${uid})`} />
      <path d="M50,64 C72,60 82,44 80,24 C60,26 50,40 50,64 Z" fill={`url(#chFood${uid})`} />
      <g stroke={withAlpha("#8A4A00", 0.5)} strokeWidth="3" strokeLinecap="round">
        <path d="M46,58 L30,44" />
        <path d="M47,48 L33,32" />
        <path d="M54,58 L70,44" />
        <path d="M53,48 L67,32" />
      </g>
    </svg>
  );
}

/** The signature motif — footprints. Dropped behind both dinos as they run,
    and used again to telegraph where the Rex is about to come back in. */
export function FootprintSprite({ color }) {
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: "block" }}>
      <g fill={color}>
        <ellipse cx="50" cy="58" rx="17" ry="21" />
        <ellipse cx="31" cy="34" rx="7.5" ry="11" transform="rotate(-22 31 34)" />
        <ellipse cx="50" cy="27" rx="7.5" ry="11" />
        <ellipse cx="69" cy="34" rx="7.5" ry="11" transform="rotate(22 69 34)" />
      </g>
    </svg>
  );
}
