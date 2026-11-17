// Copies src/lib/*.js to tests/js/.build/*.mjs so Node can import them without a bundler (src uses ES module syntax, package.json does not set "type").
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, "../../src/lib"), out = path.join(here, ".build");
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(src).filter((x) => x.endsWith(".js"))) {
  const code = fs.readFileSync(path.join(src, f), "utf8").replace(/from\s+"(\.\/[^"]+?)(\.js)?"/g, 'from "$1.mjs"');
  fs.writeFileSync(path.join(out, f.replace(/\.js$/, ".mjs")), code);
}
