// 특정 id 곡만 CSV 값으로 재저장(saveSong)
// 실행: ADMIN_SECRET=xxx node scripts/fix-one.mjs 2ebwfAKqHgM
import { readFileSync } from "node:fs";
const FN = "https://gvmclmznpgitfurnocxo.supabase.co/functions/v1/api";
const KEY = "sb_publishable_o6EGw_M05ZdR5rsL7RdeBw_l6-0Rbf5";
const SECRET = process.env.ADMIN_SECRET || "";
const TARGET = process.argv[2];
if (!SECRET || !TARGET) { console.error("ADMIN_SECRET, id 인자 필요"); process.exit(1); }
function parseCSV(text){text=text.replace(/^﻿/,"");const rows=[];let row=[],cell="",q=false;for(let i=0;i<text.length;i++){const c=text[i];if(q){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++}else q=false}else cell+=c}else{if(c==='"')q=true;else if(c===","){row.push(cell);cell=""}else if(c==="\n"){row.push(cell);rows.push(row);row=[];cell=""}else if(c==="\r"){}else cell+=c}}if(cell.length||row.length){row.push(cell);rows.push(row)}return rows.filter(r=>r.some(x=>x!==""));}
const bool=(v)=>/^(true|1|y)$/i.test(String(v).trim());
const rows=parseCSV(readFileSync(new URL("../songs.csv",import.meta.url),"utf-8"));
const h=rows.shift().map(x=>x.trim());
const r=rows.find(x=>x[h.indexOf("id")].trim()===TARGET);
if(!r){console.error("id 못 찾음:",TARGET);process.exit(1);}
const o={};h.forEach((k,i)=>o[k]=r[i]);
const sec=parseInt(o.duration_sec||"0",10)||0;
const song={id:o.id.trim(),song:o.song.trim(),choir:o.choir.trim()||null,category:o.category.trim()||null,
  svc_date:(o.svc_date||"").slice(0,10)||null,duration_sec:sec,views:parseInt(o.views||"0",10)||0,
  is_full:bool(o.is_full),hidden:bool(o.hidden),
  category_ordering:o.category_ordering?parseInt(o.category_ordering,10):null,
  choir_ordering:o.choir_ordering?parseInt(o.choir_ordering,10):null};
console.log("저장할 category:",JSON.stringify(song.category),"코드:",[...song.category].map(c=>c.codePointAt(0).toString(16)).join(" "));
const res=await fetch(FN,{method:"POST",headers:{apikey:KEY,Authorization:"Bearer "+KEY,"Content-Type":"application/json; charset=utf-8"},body:JSON.stringify({action:"saveSong",secret:SECRET,song})});
const j=await res.json();
console.log(j.ok?"✅ 저장 완료":"❌ "+j.error);
