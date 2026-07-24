/** Shared 37apps brand kit tokens — see brand/brand-kit-v2.html. */
export const baseTheme = {
  bg: "#F7F5F2",
  text: "#18171D",
  textMuted: "#726F7C",
  panelBg: "#FFFFFF",
  border: "#E3DED3",
};

export const fontUI = "'Avenir Next', Avenir, 'Century Gothic', system-ui, sans-serif";
export const fontDisplay = "ui-rounded, 'SF Pro Rounded', 'Segoe UI Rounded', 'Avenir Next', system-ui, sans-serif";

/** Full 8-color accent palette — one per game, or several within one game. */
export const ACCENTS = ["#FF4529", "#FFA31A", "#C0E637", "#17D39B", "#1DC0ED", "#3D64FF", "#7B42FF", "#FF297E"];

/** Universal signal color for positive feedback (new best, success badges) —
    fixed across every game, independent of that game's own accent, so it reads
    as "the app telling you something good happened" rather than game identity. */
export const SUCCESS = "#17D39B";
