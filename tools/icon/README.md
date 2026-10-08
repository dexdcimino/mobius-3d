# The app icon

Since 0.5.8 the icon is a piece of artwork, not a render: the green knot in
`art.png`, cropped tight and set on a rounded plate by `art.py`.

    python3 tools/icon/art.py      # build/icon.png, build/icon.ico, desktop/icon.png
    python3 tools/icon/store.py    # build/appx/, cut from build/icon.png

`build/icon.png` is 1024, `desktop/icon.png` and the site's copy are 512, and
`build/icon.ico` carries 16 to 256. The portfolio's copy is
`assets/icons/apps/mobius.png` there, the 512 from here.

## The old rendered icon (before 0.5.8)


The icon is a render of the sample knot in the viewer itself, not a painting:
green, Ridges at 25%, paused on the Wave clip, seen three-quarters from above
so all three openings show.

    npm run build                  # set CHROME as for verification/ if Chrome is not found
    node tools/icon/render.cjs knot.png '{"dx":300,"dy":-80,"exp":1.6,"light":"studio","size":2048}'
    python3 tools/icon/tile.py one knot.png icon-1024.png 1024

`render.cjs` hides the grid, orbits by a mouse drag of `dx`, `dy` pixels,
pauses, and saves through the app's own Save screenshot twice, on black and on
white, so the difference gives a true transparent cut-out. `tile.py` drops the
floor shadow (from above it rings the knot in black), sets the knot on a
rounded tile in the viewer's own background colour (#0a1821 at its middle,
lighter above and darker below, the same hue throughout) with a soft shadow
of its own, and writes the size asked for.
`build/icon.png` is 1024, `desktop/icon.png` and the site's copy are 512, and
`build/icon.ico` carries 16 to 256. The animation frame it pauses on depends on
how fast the machine renders, so a rerun is close but not identical.
