/**
 * Client-side PNG export.
 *
 * This lives in the app rather than in `@diagram-tool/domain` because it needs
 * `Image`, `canvas` and `URL.createObjectURL` — browser APIs that must never
 * leak into a package a Cloudflare Worker imports. The domain's job ends at the
 * SVG string; turning that string into a raster is the browser's.
 */

/** Renders at 2x so the PNG stays sharp on a high-DPI screen and when scaled. */
const PNG_SCALE = 2;

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", () => reject(new Error("The SVG could not be rasterised")));
    image.src = src;
  });

const triggerDownload = (href: string, filename: string): void => {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
};

/**
 * Rasterises an SVG string and hands the viewer a PNG.
 *
 * The SVG is inlined end to end — no remote `<image href>` — so drawing it does
 * not taint the canvas and `toDataURL` stays callable.
 */
export const downloadSvgAsPng = async (svg: string, filename: string): Promise<void> => {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = await loadImage(objectUrl);
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth * PNG_SCALE;
    canvas.height = image.naturalHeight * PNG_SCALE;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser did not provide a 2D canvas context");

    context.scale(PNG_SCALE, PNG_SCALE);
    context.drawImage(image, 0, 0);

    triggerDownload(canvas.toDataURL("image/png"), filename);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

/** Hands the viewer the SVG source itself, unrasterised. */
export const downloadSvg = (svg: string, filename: string): void => {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);

  try {
    triggerDownload(objectUrl, filename);
  } finally {
    // Revoking immediately can cancel the download in some browsers, so this
    // waits for the click to be dispatched first.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
};
