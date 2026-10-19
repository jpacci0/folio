import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const root = path.resolve('.');
const target = path.resolve('release', process.argv[2] || 'JFolio-Windows');
if (!target.startsWith(path.join(root, 'release') + path.sep)) throw new Error('Il pacchetto deve essere creato nella cartella release.');
if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) throw new Error('Esegui prima la build.');
const electronRoot = path.dirname(require.resolve('electron/package.json'));
const electronDist = path.join(electronRoot, 'dist');
if (!fs.existsSync(path.join(electronDist, 'electron.exe'))) throw new Error('Il runtime Electron Windows non è installato.');
fs.mkdirSync(target, { recursive: true });
fs.cpSync(electronDist, target, { recursive: true, filter: source => path.basename(source) !== 'electron.exe' });
fs.copyFileSync(path.join(electronDist, 'electron.exe'), path.join(target, 'JFolio.exe'));
// Prepackaged builds skip resource editing: apply the actual Windows icon here.
const builderRequire = createRequire(require.resolve('electron-builder/package.json'));
const { editWindowsResources } = builderRequire('app-builder-lib/out/util/resEdit');
const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
await editWindowsResources({
  file: path.join(target, 'JFolio.exe'), iconPath: path.join(root, 'build/icon.ico'),
  fileVersion: version, productVersion: version, requestedExecutionLevel: 'asInvoker',
  versionStrings: { ProductName: 'JFolio', FileDescription: 'JFolio', CompanyName: 'Jacopo', InternalName: 'JFolio', OriginalFilename: 'JFolio.exe' },
});
const app = path.join(target, 'resources', 'app');
fs.mkdirSync(app, { recursive: true });
fs.cpSync(path.join(root, 'dist'), path.join(app, 'dist'), { recursive: true });
fs.cpSync(path.join(root, 'electron'), path.join(app, 'electron'), { recursive: true });
const metadata = JSON.parse(fs.readFileSync('package.json', 'utf8'));
fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify({ name: metadata.name, productName: 'JFolio', version: metadata.version, description: metadata.description, author: metadata.author, main: 'electron/main.cjs', type: 'module' }, null, 2));
fs.copyFileSync('README.md', path.join(target, 'LEGGIMI.md'));
const licenseFolder = path.join(target, 'Licenze'); fs.mkdirSync(licenseFolder, { recursive: true });
for (const dependency of Object.keys(metadata.dependencies)) {
  const location = path.dirname(require.resolve(dependency + '/package.json'));
  for (const name of fs.readdirSync(location).filter(n => /^(licen[cs]e|ofl|notice)(\.|$)/i.test(n))) {
    if (fs.statSync(path.join(location, name)).isFile()) fs.copyFileSync(path.join(location, name), path.join(licenseFolder, dependency.replace(/[@/]/g, '_') + '-' + name));
  }
}
console.log(`App Windows pronta: ${path.join(target, 'JFolio.exe')}`);
