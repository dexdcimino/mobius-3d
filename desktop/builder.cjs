// electron-builder configuration for all three desktop platforms.
//
//   npm run dist          this machine's platform, into release/
//   (CI)                  .github/workflows/release.yml builds Windows, Linux
//                         and macOS on GitHub's own machines and publishes
//                         them to the repo's Releases, which is also where the
//                         installed app looks for its updates.
const brand = require('./brand.json');
const { extensions, description } = require('./formats.json');

// "Open with" on macOS and Linux comes from these. Role Viewer and rank
// Alternate: Mobius offers itself for these types and never claims to be the
// default for any of them -- the same promise the Windows shell verbs make.
const fileAssociations = extensions.map(ext => ({ ext, name: `${ext.toUpperCase()} model`, description, role: 'Viewer', rank: 'Alternate' }));
const mime = { glb: 'model/gltf-binary', gltf: 'model/gltf+json', obj: 'model/obj', stl: 'model/stl', ply: 'application/x-ply',
               fbx: 'application/x-fbx', dae: 'model/vnd.collada+xml', '3mf': 'model/3mf', '3ds': 'application/x-3ds',
               usdz: 'model/vnd.usdz+zip', usd: 'model/vnd.usd', usda: 'model/vnd.usda', usdc: 'model/vnd.usdc' };

module.exports = {
  appId: brand.appId,
  productName: brand.name,
  directories: { output: 'release', buildResources: 'build' },
  files: ['dist/**', 'desktop/*.cjs', 'desktop/*.json', 'desktop/icon.png', 'README.md', 'FORMATS.md', 'THIRD-PARTY-LICENSE.txt'],
  asar: true,
  publish: [{ provider: 'github', owner: 'dexdcimino', repo: 'mobius-3d' }],

  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    signAndEditExecutable: true,   // needed to set the icon; still unsigned
    executableName: brand.executable,
    icon: 'build/icon.ico',
  },
  // Windows "Open with" is NOT fileAssociations: that would register ProgIDs
  // and can become the default for a type nothing else claims. shell.nsh adds
  // a per-user verb and nothing else (see desktop/prepare.cjs).
  nsis: {
    oneClick: false, perMachine: false, allowElevation: false, allowToChangeInstallationDirectory: true,
    runAfterFinish: true, include: 'desktop/shell.nsh', artifactName: 'Mobius-3D-Setup-${version}-${arch}.${ext}',
    createDesktopShortcut: true, createStartMenuShortcut: true, shortcutName: brand.name,
  },

  mac: {
    target: [{ target: 'dmg', arch: ['universal'] }, { target: 'zip', arch: ['universal'] }],
    category: 'public.app-category.graphics-design',
    icon: 'build/icon.png',
    fileAssociations,
    // Unsigned: there is no Apple Developer ID behind this build. It opens
    // with right-click > Open the first time, and cannot update itself.
    identity: null,
  },
  dmg: { artifactName: 'Mobius-3D-${version}-mac.${ext}' },

  linux: {
    target: ['AppImage', 'deb'],
    category: 'Graphics',
    icon: 'build/icon.png',
    executableName: 'mobius3d',
    maintainer: 'Dex Cimino',
    synopsis: 'A local 3D model viewer',
    fileAssociations: fileAssociations.map(a => ({ ...a, mimeType: mime[a.ext] })),
  },
  appImage: { artifactName: 'Mobius-3D-${version}-${arch}.${ext}' },
  deb: { artifactName: 'mobius-3d_${version}_${arch}.${ext}' },
};
