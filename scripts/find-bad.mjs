import { readFileSync } from "node:fs";
function parseCSV(text){text=text.replace(/^﻿/,"");const rows=[];let row=[],cell="",q=false;for(let i=0;i<text.length;i++){const c=text[i];if(q){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++}else q=false}else cell+=c}else{if(c==='"')q=true;else if(c===","){row.push(cell);cell=""}else if(c==="\n"){row.push(cell);rows.push(row);row=[];cell=""}else if(c==="\r"){}else cell+=c}}if(cell.length||row.length){row.push(cell);rows.push(row)}return rows.filter(r=>r.some(x=>x!==""));}
const rows=parseCSV(readFileSync(new URL("../songs.csv",import.meta.url),"utf-8"));
const h=rows.shift().map(x=>x.trim());
const iId=h.indexOf("id"),iSong=h.indexOf("song"),iCat=h.indexOf("category"),iChoir=h.indexOf("choir");
const valid=new Set(["찬양대","찬양팀","중창단","특별찬양"]);
console.log("유효하지 않은 구분값 행:");
rows.forEach(r=>{ if(!valid.has(r[iCat])){ console.log("  id="+r[iId]+" | song="+r[iSong]+" | choir="+r[iChoir]+" | category="+JSON.stringify(r[iCat])+" (len "+r[iCat].length+")"); } });
