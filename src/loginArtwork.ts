import { randomInt } from "node:crypto";

const repeat = (count: number, draw: (i: number) => string) => Array.from({ length: count }, (_, i) => draw(i)).join("");
const artworks = [
  // Radial rosette.
  repeat(36, i => `<ellipse cx="240" cy="240" rx="190" ry="66" transform="rotate(${i * 5} 240 240)"/>`) +
    '<circle cx="240" cy="240" r="29" fill="#eeede5"/><circle cx="240" cy="240" r="10" fill="#1725dc"/>',
  // Orbital globe: perpendicular meridians form a spherical lattice.
  repeat(15, i => `<ellipse cx="240" cy="240" rx="${12 + i * 13}" ry="195"/><ellipse cx="240" cy="240" rx="195" ry="${12 + i * 13}"/>`),
  // Square vortex: nested rotated frames converge at the center.
  repeat(30, i => { const size = 275 * Math.pow(.938, i); return `<rect x="${240 - size / 2}" y="${240 - size / 2}" width="${size}" height="${size}" transform="rotate(${i * 9} 240 240)"/>`; }),
  // Interlocking loops: a six-lobed interference pattern.
  repeat(6, i => `<g transform="rotate(${i * 60} 240 240)">${repeat(12, j => `<ellipse cx="240" cy="160" rx="${32 + j * 5}" ry="${80 + j * 3}"/>`)}</g>`),
];

/** Select once per page response; no scripts or animation asset requests needed. */
export function renderLoginArtwork(index = randomInt(artworks.length)) {
  const selected = artworks[index];
  if (selected === undefined) throw new RangeError("Unknown login artwork");
  return `<svg viewBox="0 0 480 480" fill="none" xmlns="http://www.w3.org/2000/svg" data-artwork="${index}"><g stroke="#eeede5" stroke-width=".8" opacity=".8">${selected}<circle cx="240" cy="240" r="210" stroke-dasharray="1 8"/></g></svg>`;
}
