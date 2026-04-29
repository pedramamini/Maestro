/**
 * compositeAnnotatedImage — Bake annotation strokes onto the source image.
 *
 * Renders the original image and a snapshot of the live SVG overlay onto an
 * offscreen canvas at the image's intrinsic dimensions, then returns a PNG
 * data URL. The SVG is serialized as-is (its viewBox already matches the
 * image's native pixel size), wrapped as a data URL, loaded as an `<img>`,
 * and drawn over the image — so stroke geometry survives untouched.
 */

const loadImage = (src: string): Promise<HTMLImageElement> =>
	new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error('Failed to load image'));
		img.src = src;
	});

export default async function compositeAnnotatedImage(
	imageDataUrl: string,
	svgElement: SVGSVGElement
): Promise<string> {
	const baseImg = await loadImage(imageDataUrl);
	const width = baseImg.naturalWidth;
	const height = baseImg.naturalHeight;

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Failed to acquire 2D canvas context');

	ctx.drawImage(baseImg, 0, 0);

	const svgString = new XMLSerializer().serializeToString(svgElement);
	const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
	const overlayImg = await loadImage(svgDataUrl);
	ctx.drawImage(overlayImg, 0, 0, width, height);

	return canvas.toDataURL('image/png');
}
