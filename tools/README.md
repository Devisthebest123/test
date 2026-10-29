# tools

Brand renderers built on a Python port of the site's scanline shader.

- `scanline.py`: the shader port; `scan(image, lines)` turns any greyscale image into page-and-ink rules.
- `render-logo.py`: the hero cat at any square size, paper or transparent.
- `render-banner.py`: 1500x500 banner, wordmark and cat through the same shader.

Needs Pillow. The banner needs the fonts as TTF files in a directory named by `WHISPER_FONTS` (default `fonts/`): Silkscreen-Bold.ttf and Silkscreen-Regular.ttf (OFL, from the Google Fonts repository) and GeistMono-Regular.ttf saved as GeistMono.ttf (OFL, from Vercel's geist-font repository).
