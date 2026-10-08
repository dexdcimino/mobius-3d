// The Microsoft Store package (MSIX/AppX) -- a second electron-builder run on
// top of builder.cjs, so the GitHub installer and its updates are untouched.
//
//   npm run dist:store    on Windows, into release/Mobius-3D-Store.appx
//
// The Store signs what it publishes, which is the whole point: an install
// from the Store never shows SmartScreen's "Windows protected your PC". The
// package itself goes up unsigned. Its identity must be the three values
// Partner Center shows on the app's Product identity page, copied into
// store.json; MOBIUS_STORE_* overrides them (CI checks the build that way).
const base = require('./builder.cjs');
const brand = require('./brand.json');
const { extensions, description } = require('./formats.json');
const stored = require('./store.json');

const identity = {
  identityName: process.env.MOBIUS_STORE_IDENTITY || stored.identityName,
  publisher: process.env.MOBIUS_STORE_PUBLISHER || stored.publisher,
  publisherDisplayName: process.env.MOBIUS_STORE_PUBLISHER_NAME || stored.publisherDisplayName,
};
for (const [key, value] of Object.entries(identity)) {
  if (!value) throw Error(`desktop/store.json: ${key} is empty -- copy it from Partner Center > Product identity`);
}
if (!/^CN=/.test(identity.publisher)) throw Error(`desktop/store.json: publisher must start with CN= (got ${identity.publisher})`);

module.exports = {
  ...base,
  // The Store updates a Store install. Nothing here is published to GitHub,
  // and main.cjs keeps electron-updater away from a Store build.
  publish: null,
  win: {
    ...base.win,
    target: [{ target: 'appx', arch: ['x64'] }],
    // Unlike the NSIS installer's registry verbs (shell.nsh), a packaged app
    // can only offer itself for a type through its manifest. A package's
    // association never takes the default: Windows asks the user first.
    fileAssociations: extensions.map(ext => ({ ext, name: `${ext.toUpperCase()} model`, description })),
  },
  appx: {
    ...identity,
    applicationId: brand.executable,
    displayName: brand.name,
    backgroundColor: '#0a1821',
    languages: ['en-US'],
    showNameOnTiles: false,
    artifactName: 'Mobius-3D-Store.${ext}',
  },
};
