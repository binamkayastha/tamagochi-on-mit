// Ported verbatim from the `mascots` branch (tamagochi-mascots-python/tamagotchi/mascots.py
// + schools.py) so the race uses the same identities and tower colors as the rest of the
// project. Only the 4 racing schools are kept here.

export const SCHOOLS = ["mit", "harvard", "bu", "neu"];

export const SCHOOL_INFO = {
  mit: { name: "MIT", mascot: "Tim the Beaver", color: [163, 31, 52] },
  // Harvard crimson reads identically to MIT crimson on a lit building, so the tower
  // display overrides it to purple (see DISPLAY_OVERRIDES in schools.py).
  harvard: { name: "Harvard", mascot: "John Harvard", color: [120, 0, 200] },
  bu: { name: "BU", mascot: "Rhett the Terrier", color: [204, 0, 0] },
  // Same override reasoning as Harvard: Northeastern red is too close to BU red, so the
  // tower shows Northeastern in white instead.
  neu: { name: "Northeastern", mascot: "Paws the Husky", color: [255, 255, 255] },
};

export function isSchool(id) {
  return SCHOOLS.includes(id);
}
