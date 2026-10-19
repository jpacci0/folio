const fs = require('node:fs/promises');
const path = require('node:path');
function validate(value) {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || !Number.isFinite(value.aspectRatio) || value.aspectRatio < .02 || value.aspectRatio > 50) throw new Error('Firma non valida.');
  const { kind, aspectRatio } = value;
  if (kind === 'image' && typeof value.dataUrl === 'string' && value.dataUrl.length <= 2_000_000 && /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(value.dataUrl)) return { kind, aspectRatio, dataUrl: value.dataUrl };
  if (kind === 'draw' && Array.isArray(value.paths) && value.paths.length > 0 && value.paths.length <= 128 && value.paths.every(p => Array.isArray(p) && p.length >= 2) && value.paths.flat().length <= 10000 && value.paths.flat().every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)) return { kind, aspectRatio, paths: value.paths.map(p => p.map(({ x, y }) => ({ x, y }))) };
  throw new Error('Firma non valida.');
}
function signatureStore(directory) {
  const filename = path.join(directory, 'signature-v1.json');
  let pending = Promise.resolve();
  return {
    async load() {
      await pending;
      try {
        if ((await fs.stat(filename)).size > 2_500_000) throw new Error('Firma salvata troppo grande.');
        return validate(JSON.parse(await fs.readFile(filename, 'utf8')));
      } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    },
    save(value) {
      const signature = validate(value);
      const operation = pending.then(async () => {
        if (signature === null) { await fs.rm(filename, { force: true }); return; }
        await fs.mkdir(directory, { recursive: true });
        const temporary = filename + '.tmp';
        try { await fs.writeFile(temporary, JSON.stringify(signature), { mode: 0o600 }); await fs.rename(temporary, filename); }
        finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
      });
      pending = operation.catch(() => {}); return operation;
    },
  };
}
module.exports = { signatureStore, validate };
