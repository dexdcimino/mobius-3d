// The error card. One place for "this did not work", drawn in the viewer's own
// panel colours and accent rather than as a red line of text in a corner --
// and every message says what to DO, because a stack trace is not an answer.

const $ = id => document.getElementById(id);

export function showError({ title, body, detail, action = 'Open another model' }) {
  $('error-title').textContent = title;
  $('error-body').textContent = body || '';
  $('error-detail').textContent = detail || '';
  $('error-detail').hidden = !detail;
  $('error-action').textContent = action;
  $('error-card').hidden = false;
  $('error-action').focus({ preventScroll: true });
}

export function hideError() { $('error-card').hidden = true; }

// An exception from somewhere inside a loader, turned into a sentence. The
// original message is kept as the small print -- it is what a bug report needs
// -- but it is never the headline.
export function describeFailure(error, { ext, name }) {
  const message = String(error?.message || error || '');
  const lower = message.toLowerCase();
  if (error?.name === 'RangeError' || /allocation|out of memory|array buffer/i.test(message)) {
    return { title: 'Not enough memory for this model',
             body: 'The browser ran out of memory while reading it. Close other tabs, try the desktop app, or decimate the model before export.',
             detail: message };
  }
  if (/draco/i.test(message)) {
    return { title: 'Draco compression could not be decoded',
             body: 'The Draco decoder failed on this file. Re-export it without mesh compression, or with Meshopt instead.', detail: message };
  }
  if (/ktx2|basis/i.test(message)) {
    return { title: 'KTX2 textures could not be decoded',
             body: 'The texture transcoder failed. Re-export with PNG or JPEG textures.', detail: message };
  }
  if (ext === 'fbx' && /version|unsupported|not supported/.test(lower)) {
    return { title: 'This FBX is too old to read',
             body: 'FBX files from before 2011 (version 7.0) are not supported. Re-save it as FBX 2014 or newer.', detail: message };
  }
  if (/no triangle meshes/i.test(message)) {
    return { title: 'Nothing to show in this file',
             body: 'It opened, but it contains no meshes — only empty nodes, cameras, lights or curves.', detail: '' };
  }
  if (/empty or invalid geometry/i.test(message)) {
    return { title: 'The geometry in this file is empty',
             body: 'Every mesh has zero size. Check the export scale and that the objects were selected.', detail: '' };
  }
  return { title: `Could not open ${name}`,
           body: 'The file may be damaged, or use a feature this viewer does not read. Exporting a fresh GLB is the most reliable route.',
           detail: message };
}
