import { readFileSync } from "node:fs";
function parseCSV(text) {
  text = text.replace(/^﻿/, "");
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else { if (c === '"') q = true; else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (c === "\r") {} else cell += c; }
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x !== ""));
}
const rows = parseCSV(readFileSync(new URL("../songs.csv", import.meta.url), "utf-8"));
const h = rows.shift().map((x) => x.trim());
console.log("헤더:", h.join(" | "));
console.log("행 수:", rows.length);
const idx = (n) => h.indexOf(n);
const iCat = idx("category"), iCatO = idx("category_ordering"), iChoir = idx("choir"), iChoirO = idx("choir_ordering");
console.log("\n== 구분(category) 순번 매핑 ==");
const catMap = new Map();
rows.forEach((r) => { if (!catMap.has(r[iCat])) catMap.set(r[iCat], r[iCatO]); });
[...catMap.entries()].sort((a, b) => (+a[1]) - (+b[1])).forEach(([c, o]) => console.log(`  ${o}\t${c}`));
console.log("\n== 찬양대(choir) 순번 매핑 ==");
const choirMap = new Map();
rows.forEach((r) => { if (!choirMap.has(r[iChoir])) choirMap.set(r[iChoir], { o: r[iChoirO], cat: r[iCat] }); });
[...choirMap.entries()].sort((a, b) => (+a[1].o) - (+b[1].o)).forEach(([c, v]) => console.log(`  ${v.o}\t[${v.cat}]\t${c}`));
