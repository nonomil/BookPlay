const t = 'waterfall';
const re = new RegExp(String.raw`\b(${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})\b`, 'gi');
console.log('regex test:', 'Monkey splashed through the waterfall'.replace(re, '[$1]'));
