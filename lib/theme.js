// Shared design tokens for the whole app.
//
// BRAND_BLUE is a pale slate-blue used for the brand mark and site
// navigation — wayfinding, not actions. BODY_TEXT is a near-black grey
// for ordinary body copy.
//
// ACCENT is "vermillion" (rgb(155,27,21), labelled "classical deep cadmium
// red" in Liam's Camille_website project) — used only for actionable
// buttons, so red always means "you can click this."
//
// BUTTON_CLASSES is the one place every action button's look comes from:
// a soft lift + shadow on hover and a brief press-down on click, in plain
// CSS transitions. Deliberately does NOT copy that project's sliding
// colour-wipe fill effect — kept simple on purpose.
const COLORS = {
  brandBlue: '#4f6070',
  bodyText: '#484848',
  accent: '#9b1b15',
  accentHover: '#7a1611',
};

const BUTTON_CLASSES =
  'bg-[#9b1b15] hover:bg-[#7a1611] text-white transition-all duration-200 ease-out ' +
  'hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97]';

module.exports = { COLORS, BUTTON_CLASSES };
