import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import strip from "strip-comments";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "src");
const exts = new Set([".ts", ".js"]);

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (exts.has(path.extname(name))) out.push(p);
  }
  return out;
}

for (const file of walk(root)) {
  let src = fs.readFileSync(file, "utf8");
  src = src.replace(/^\s*console\.(log|debug|info|warn|error)\([\s\S]*?\);\s*\n/gm, "");
  src = strip(src, { language: "javascript", preserveProtected: true });
  fs.writeFileSync(file, src);
}
