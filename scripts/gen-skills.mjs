// 把 shields.io 的 for-the-badge 徽章拼成一张两行、两端对齐、724 宽的 SVG。
// README 里没法用 CSS 做两端对齐,所以拼成一张图;技能很少变,改了列表手动跑一次。
// 用法: node scripts/gen-skills.mjs [输出目录,默认 assets]
import { writeFileSync, mkdirSync } from "node:fs";
const out = process.argv[2] || "assets";

// [显示名, simple-icons slug, 底色]
const SKILLS = [
  ["TypeScript", "typescript", "3178C6"],
  ["Python", "python", "3776AB"],
  ["Swift", "swift", "F05138"],
  ["Go", "go", "00ADD8"],
  ["React", "react", "61DAFB"],
  ["Vite", "vite", "646CFF"],
  ["Tailwind", "tailwindcss", "06B6D4"],
  ["Node.js", "nodedotjs", "5FA04E"],
  ["CF Workers", "cloudflareworkers", "F38020"],
  ["Docker", "docker", "2496ED"],
  ["GitHub Actions", "githubactions", "2088FF"],
  ["Linux", "linux", "FCC624"],
];
const W = 724, GAP = 8, ROW_GAP = 10;

const badges = await Promise.all(SKILLS.map(async ([name, slug, color]) => {
  const url = `https://img.shields.io/badge/${encodeURIComponent(name)}-${color}?style=for-the-badge&logo=${slug}&logoColor=white`;
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  const svg = await r.text();
  const [, w, h] = svg.match(/<svg[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"/);
  // 徽章自带 <svg ...> 外壳和 <title>,只取内部图形,外层由我们定位缩放
  const body = svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").replace(/<title>.*?<\/title>/, "");
  return { name, w: +w, h: +h, body };
}));

// 排法:两行各一半个数,两端对齐。上下两行的间隙要么明显错开(砖墙),不能"差一点对齐"。
// 搜索分行与行内顺序,让第二行每个间隙离第一行所有间隙尽量远;其次两行间距尽量接近。
const n = badges.length, half = Math.ceil(n / 2);
const perms = arr => arr.length <= 1 ? [arr] : arr.flatMap((v, i) => perms([...arr.slice(0, i), ...arr.slice(i + 1)]).map(p => [v, ...p]));
const layoutOf = (rowsW, scale) => rowsW.map(ws => {
  const gap = (W - ws.reduce((s, w) => s + w, 0) * scale) / (ws.length - 1);
  const mids = []; let x = 0;
  for (let i = 0; i < ws.length - 1; i++) { x += ws[i] * scale; mids.push(x + gap / 2); x += gap; }
  return { gap, mids };
});
const parts2 = [];
for (let mask = 0; mask < 1 << n; mask++) {
  const a = [], b = [];
  for (let i = 0; i < n; i++) (mask >> i & 1 ? a : b).push(i);
  if (a.length !== half || !a.includes(0)) continue; // 第一个徽章固定在第一行,去掉上下对调的重复
  const sa = a.reduce((s, i) => s + badges[i].w, 0), sb = b.reduce((s, i) => s + badges[i].w, 0);
  parts2.push({ a, b, diff: Math.abs(sa - sb), sa, sb });
}
parts2.sort((p, q) => p.diff - q.diff);
let best = null;
for (const { a, b, sa, sb } of parts2.slice(0, 40)) {
  const scale = Math.min((W - GAP * (a.length - 1)) / sa, (W - GAP * (b.length - 1)) / sb);
  const pa = perms(a), pb = perms(b);
  const midsA = pa.map(p => layoutOf([p.map(i => badges[i].w)], scale)[0]);
  const midsB = pb.map(p => layoutOf([p.map(i => badges[i].w)], scale)[0]);
  for (let i = 0; i < pa.length; i++) for (let j = 0; j < pb.length; j++) {
    let minD = Infinity;
    for (const m of midsB[j].mids) for (const k of midsA[i].mids) minD = Math.min(minD, Math.abs(m - k));
    const score = minD - Math.abs(midsA[i].gap - midsB[j].gap) * 0.5;
    if (!best || score > best.score) best = { score, minD, scale, rows: [pa[i], pb[j]] };
  }
}
const rows = best.rows.map(r => r.map(i => badges[i]));
const sumW = rows.map(r => r.reduce((s, b) => s + b.w, 0));
const scale = best.scale;
const H0 = badges[0].h * scale;
let parts = "", y = 0;
rows.forEach((r, k) => {
  const gap = (W - sumW[k] * scale) / (r.length - 1);
  let x = 28;
  for (const b of r) {
    parts += `<svg x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${(b.w * scale).toFixed(2)}" height="${H0.toFixed(2)}" viewBox="0 0 ${b.w} ${b.h}" role="img" aria-label="${b.name}">${b.body}</svg>`;
    x += b.w * scale + gap;
  }
  y += H0 + ROW_GAP;
});
const H = y - ROW_GAP;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H.toFixed(2)}" viewBox="28 0 ${W} ${H.toFixed(2)}" role="img" aria-label="Skills: ${SKILLS.map(s => s[0]).join(", ")}">${parts}</svg>\n`;
mkdirSync(out, { recursive: true });
writeFileSync(`${out}/skills.svg`, svg);
console.error(`rows: ${rows.map(r => r.map(b => b.name).join(" · ")).join("  |  ")}  scale ${scale.toFixed(3)}  min gap offset ${best.minD.toFixed(1)}px`);
