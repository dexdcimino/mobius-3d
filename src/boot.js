// Loaded before the viewer, as its own file so the page needs no inline script.
// If the viewer cannot start at all -- no WebGL, a browser too old for the
// bundle -- this says so on the page instead of leaving a dark rectangle.
window.addEventListener('error', function (event) {
  if (window.viewerReady) return;
  var box = document.getElementById('crash');
  if (!box) return;
  box.hidden = false;
  box.textContent = 'The viewer could not start. Try Chrome or Edge with graphics acceleration turned on. — ' + (event.message || '');
});
