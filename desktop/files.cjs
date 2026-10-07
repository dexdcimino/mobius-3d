const fs = require('node:fs/promises');
const path = require('node:path');
const { extensions } = require('./formats.json');
const supported = new Set(extensions.map(x => '.' + x));
const assets = /\.(png|jpe?g|webp|bmp|gif|tga|dds|mtl|bin)$/i;
function modelArgument(argv, cwd = process.cwd()) {
  const files = argv.filter(x => !x.startsWith('-') && supported.has(path.extname(x).toLowerCase()));
  return files.length ? path.resolve(cwd, files[0]) : null;
}
async function collectFiles(input) {
  const model = await fs.realpath(input);
  if (!supported.has(path.extname(model).toLowerCase())) throw new Error('Unsupported model format.');
  const base = path.dirname(model), selected = await fs.stat(model);
  if (!selected.isFile() || selected.size > 512 * 1024 * 1024) throw new Error('Choose a model smaller than 512 MiB.');
  const files = [], seen = new Set(), warnings = [];
  let total = 0;
  const inside = p => { const relative = path.relative(base, p); return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative); };
  async function add(p, primary = false) {
    let real;
    try { real = await fs.realpath(p); } catch { return; }
    if (!inside(real) || seen.has(real.toLowerCase())) return;
    const stat = await fs.stat(real);
    if (!stat.isFile()) return;
    if (!primary && (!assets.test(real) || total + stat.size > 256 * 1024 * 1024 || files.length >= 512)) return;
    seen.add(real.toLowerCase());
    if (!primary) total += stat.size;
    files.push({ name:path.basename(real), relativePath:path.relative(base,real).split(path.sep).join('/'), bytes:new Uint8Array(await fs.readFile(real)) });
  }
  async function scan(dir, depth) {
    if (depth > 3 || !inside(await fs.realpath(dir))) return;
    for (const item of await fs.readdir(dir,{withFileTypes:true})) {
      if (item.isSymbolicLink()) continue;
      const p = path.join(dir,item.name);
      if (item.isFile()) await add(p);
      else if (item.isDirectory() && (depth > 0 || /^(textures?|maps|materials|images)$/i.test(item.name) || /\.fbm$/i.test(item.name))) await scan(p,depth+1);
    }
  }
  await add(model,true);
  await scan(base,0);
  // glTF may name arbitrary relative subdirectories. Never follow references
  // outside the selected model folder or fetch remote URLs.
  if (path.extname(model).toLowerCase() === '.gltf') {
    const gltf = JSON.parse(Buffer.from(files[0].bytes).toString('utf8'));
    for (const item of [...(gltf.buffers || []),...(gltf.images || [])]) {
      if (typeof item.uri === 'string' && !/^[a-z]+:/i.test(item.uri)) await add(path.resolve(base,decodeURIComponent(item.uri)));
    }
  }
  if (files.length >= 512 || total >= 256 * 1024 * 1024) warnings.push('Companion asset limit reached. Select required assets manually if any are missing.');
  return { files, warnings };
}
module.exports = { modelArgument, collectFiles };
