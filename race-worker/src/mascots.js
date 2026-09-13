// The 4 racing schools: names and lane colors. Mascot pixel art lives in sprites.js.

export const SCHOOLS = ["mit", "harvard", "bu", "neu"];

// Lane colours are the tower's, not the schools' official hexes: four lit columns seen from
// across the river only read as four teams if the hues are far apart. MIT and BU crimson are
// indistinguishable at that distance, so MIT takes the beaver's own brown-orange; Harvard goes
// purple for the same reason; and Northeastern, whose red is closer still, takes husky blue
// rather than the white that blooms into a blob on a lit facade. Matches the Python prototype's
// scenes.SCHOOL_COLORS (branch `ananya`) so both renderers paint the same race.
export const SCHOOL_INFO = {
  mit: { name: "MIT", mascot: "Tim the Beaver", color: [220, 140, 50] },
  harvard: { name: "Harvard", mascot: "John Harvard", color: [138, 43, 226] },
  bu: { name: "BU", mascot: "Rhett the Terrier", color: [220, 30, 30] },
  neu: { name: "Northeastern", mascot: "Paws the Husky", color: [90, 190, 255] },
};

export function isSchool(id) {
  return SCHOOLS.includes(id);
}
