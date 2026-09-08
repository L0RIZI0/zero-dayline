export function wheelNotches(e: WheelEvent): number | null {
	if (e.deltaMode === 1) {
		const v = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
		return Math.sign(v) * Math.max(1, Math.min(2, Math.round(Math.abs(v)) || 1));
	}
	if (e.deltaMode === 2) return Math.sign(e.deltaY || 1);
	const v = Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.2 ? e.deltaX : e.deltaY;
	const abs = Math.abs(v);
	if (abs < 36) return null;
	const ortho = Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.2 ? Math.abs(e.deltaY) : Math.abs(e.deltaX);
	const near = (step: number) => Math.abs(abs - Math.round(abs / step) * step) < 1.5;
	const discrete = ortho < 0.6 && (near(40) || near(100) || near(120) || (abs % 1 === 0 && abs >= 40));
	if (!discrete) return null;
	return Math.sign(v) * Math.max(1, Math.min(2, Math.round(abs / 100) || 1));
}
export function drawHorizonSun(
	ctx: CanvasRenderingContext2D,
	x: number,
	cy: number,
	s: number,
	kind: "rise" | "set",
	color: string,
) {
	const cx = x + s * 0.5;
	const hz = cy + (kind === "rise" ? s * 0.12 : s * 0.08);
	ctx.save();
	ctx.strokeStyle = color;
	ctx.lineWidth = 1.15;
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	ctx.beginPath();
	ctx.moveTo(x + 0.5, hz);
	ctx.lineTo(x + s - 0.5, hz);
	ctx.stroke();
	ctx.beginPath();
	ctx.arc(cx, hz, s * 0.28, Math.PI, 0, false);
	ctx.stroke();
	if (kind === "rise") {
		for (const a of [-2.5, -Math.PI / 2, -0.64]) {
			ctx.beginPath();
			ctx.moveTo(cx + Math.cos(a) * s * 0.38, hz + Math.sin(a) * s * 0.38);
			ctx.lineTo(cx + Math.cos(a) * s * 0.52, hz + Math.sin(a) * s * 0.52);
			ctx.stroke();
		}
	} else {
		ctx.beginPath();
		ctx.moveTo(cx - 2.2, hz + s * 0.34);
		ctx.lineTo(cx, hz + s * 0.5);
		ctx.lineTo(cx + 2.2, hz + s * 0.34);
		ctx.stroke();
	}
	ctx.restore();
}
/** Spherical moon. `phase` 0 new, 0.5 full, waxing is right-lit.
 *  Opaque on a scratch canvas, then blitted — globalAlpha on terminator
 *  fills otherwise reads as a quarter-moon. */
let _moonOff: HTMLCanvasElement | null = null;

export function drawMoonPhase(
	ctx: CanvasRenderingContext2D,
	cx: number,
	cy: number,
	r: number,
	phase: number,
	lit = "rgb(214,224,242)",
	shade = "rgb(36,42,58)",
	alpha = 1,
) {
	const pad = 2;
	const size = Math.ceil((r + pad) * 2);
	if (!_moonOff || _moonOff.width < size) {
		_moonOff = document.createElement("canvas");
		_moonOff.width = size;
		_moonOff.height = size;
	}
	const sctx = _moonOff.getContext("2d");
	if (!sctx) return;
	sctx.setTransform(1, 0, 0, 1, 0, 0);
	sctx.clearRect(0, 0, _moonOff.width, _moonOff.height);
	sctx.save();
	sctx.translate(size / 2, size / 2);
	const u = ((phase % 1) + 1) % 1;
	const s = Math.cos(u * Math.PI * 2);
	sctx.beginPath();
	sctx.arc(0, 0, r, 0, Math.PI * 2);
	sctx.fillStyle = shade;
	sctx.fill();
	sctx.save();
	sctx.beginPath();
	sctx.arc(0, 0, r, 0, Math.PI * 2);
	sctx.clip();
	sctx.fillStyle = lit;
	if (u <= 0.5) {
		sctx.beginPath();
		sctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
		sctx.closePath();
		sctx.fill();
		sctx.beginPath();
		sctx.ellipse(0, 0, Math.abs(s) * r, r, 0, 0, Math.PI * 2);
		sctx.fillStyle = s > 0 ? shade : lit;
		sctx.fill();
	} else {
		sctx.beginPath();
		sctx.arc(0, 0, r, Math.PI / 2, -Math.PI / 2, false);
		sctx.closePath();
		sctx.fill();
		sctx.beginPath();
		sctx.ellipse(0, 0, Math.abs(s) * r, r, 0, 0, Math.PI * 2);
		sctx.fillStyle = s < 0 ? lit : shade;
		sctx.fill();
	}
	sctx.restore();
	sctx.beginPath();
	sctx.arc(0, 0, r - 0.4, 0, Math.PI * 2);
	sctx.strokeStyle = "rgba(210,224,245,0.85)";
	sctx.lineWidth = 1.15;
	sctx.stroke();
	sctx.restore();
	ctx.save();
	ctx.globalAlpha = alpha;
	ctx.drawImage(_moonOff, 0, 0, size, size, cx - size / 2, cy - size / 2, size, size);
	ctx.restore();
}
export function drawCrescent(
	ctx: CanvasRenderingContext2D,
	cx: number,
	cy: number,
	r: number,
	color: string,
	rot = -0.4,
) {
	ctx.save();
	ctx.translate(cx, cy);
	ctx.rotate(rot);
	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.arc(0, 0, r, Math.PI * 0.5, Math.PI * 1.5, false);
	ctx.arc(r * 0.42, 0, r * 0.68, Math.PI * 1.5, Math.PI * 0.5, true);
	ctx.closePath();
	ctx.fill();
	ctx.restore();
}
export function drawHorizonMoon(
	ctx: CanvasRenderingContext2D,
	x: number,
	cy: number,
	s: number,
	kind: "rise" | "set",
	color: string,
) {
	const cx = x + s * 0.5;
	const hz = cy + s * 0.1;
	ctx.save();
	ctx.strokeStyle = color;
	ctx.lineWidth = 1.15;
	ctx.lineCap = "round";
	ctx.beginPath();
	ctx.moveTo(x + 0.5, hz);
	ctx.lineTo(x + s - 0.5, hz);
	ctx.stroke();
	ctx.beginPath();
	ctx.rect(x - 1, cy - s, s + 2, hz - (cy - s));
	ctx.clip();
	drawCrescent(ctx, cx, hz - (kind === "rise" ? s * 0.08 : s * 0.02), s * 0.32, color, -0.4);
	ctx.restore();
}
export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
	const rr = Math.min(r, w / 2, h / 2);
	ctx.beginPath();
	ctx.moveTo(x + rr, y);
	ctx.arcTo(x + w, y, x + w, y + h, rr);
	ctx.arcTo(x + w, y + h, x, y + h, rr);
	ctx.arcTo(x, y + h, x, y, rr);
	ctx.arcTo(x, y, x + w, y, rr);
	ctx.closePath();
}
