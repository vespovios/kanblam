/** Random demo-account names, Vikunja-demo style ("insomnious-wildebeest").
 *  Two small word lists beat a dependency: ~3,000 combinations plus a
 *  2-digit suffix keeps collisions rare, and the /api/demo route retries on
 *  the (unique-email) off chance anyway. */

const ADJECTIVES = [
  "brisk", "lofty", "stellar", "plucky", "zesty", "mellow", "daring",
  "breezy", "cosmic", "nimble", "jolly", "rugged", "spry", "vivid",
  "gallant", "peppy", "quirky", "radiant", "sturdy", "swift", "tranquil",
  "upbeat", "valiant", "whimsical", "zippy", "bold", "chipper", "dapper",
  "eager", "feisty", "gutsy", "hearty", "intrepid", "keen", "lively",
  "merry", "noble", "orbital", "perky", "snazzy",
] as const;

const ANIMALS = [
  "otter", "falcon", "badger", "heron", "lynx", "marmot", "osprey",
  "puffin", "stoat", "wombat", "gecko", "ibex", "jackdaw", "kestrel",
  "lemur", "magpie", "narwhal", "ocelot", "pangolin", "quokka",
  "raccoon", "seal", "tapir", "urchin", "vole", "walrus", "axolotl",
  "bison", "chamois", "dormouse", "ermine", "fennec", "gannet",
  "hedgehog", "iguana", "jerboa", "kiwi", "loris", "meerkat", "newt",
] as const;

const pick = <T>(arr: readonly T[]): T =>
  arr[Math.floor(Math.random() * arr.length)];

export interface Petname {
  /** e.g. "brisk-otter-42" — used for the email local part */
  slug: string;
  /** e.g. "Brisk Otter" — used as the user's display name */
  display: string;
}

export function generatePetname(): Petname {
  const adj = pick(ADJECTIVES);
  const animal = pick(ANIMALS);
  const suffix = Math.floor(Math.random() * 90) + 10; // 10–99
  const cap = (w: string) => w[0].toUpperCase() + w.slice(1);
  return {
    slug: `${adj}-${animal}-${suffix}`,
    display: `${cap(adj)} ${cap(animal)}`,
  };
}
