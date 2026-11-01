// The G1 point cloud in the hero: points only, coloured by height, a scan line that lifts what it touches,
// the grasping hand in the accent. Turns once in seventy seconds; still under reduced motion and off screen.
(function () {
    const fig = document.querySelector('[data-cloud]');
    if (!fig || !window.G1_CLOUD) return;
    const cv = fig.querySelector('canvas');
    const ctx = cv.getContext('2d');
    const calls = { head: fig.querySelector('[data-anchor="head"]'), hand: fig.querySelector('[data-anchor="hand"]') };

    // decode: int16 millimetres (x, y, z per point), then one tag per point (0 body, 1 hand, 2 ground)
    const bin = atob(window.G1_CLOUD.data);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const all = new Int16Array(bytes.buffer);
    const n = window.G1_CLOUD.n;
    const X = new Float32Array(n), Y = new Float32Array(n), Z = new Float32Array(n), T = new Uint8Array(n);
    let zmax = 0;
    for (let i = 0; i < n; i++) {
        X[i] = all[3 * i] / 1000; Y[i] = all[3 * i + 1] / 1000; Z[i] = all[3 * i + 2] / 1000; T[i] = all[3 * n + i];
        if (Z[i] > zmax) zmax = Z[i];
    }
    // anchors: the top of the head, and the centre of the grasping hand
    let hx = 0, hy = 0, hz = 0, hc = 0, top = 0;
    for (let i = 0; i < n; i++) {
        if (T[i] === 1) { hx += X[i]; hy += Y[i]; hz += Z[i]; hc++; }
        if (T[i] === 0 && Z[i] > Z[top]) top = i;
    }
    const anchors = { head: [X[top], Y[top], Z[top]], hand: [hx / hc, hy / hc, hz / hc] };

    // colours come from the tokens
    const probe = document.createElement('span');
    probe.style.display = 'none';
    fig.appendChild(probe);
    const resolve = (v) => { probe.style.color = v; return getComputedStyle(probe).color; };
    const LEVELS = 10;
    const ramp = [];
    for (let k = 0; k < LEVELS; k++) ramp.push(resolve(`color-mix(in oklch, var(--point-hi) ${Math.round((k / (LEVELS - 1)) * 100)}%, var(--point-lo))`));
    const lit = resolve('var(--point-hi)');
    const accent = resolve('var(--color-accent)');
    const leader = resolve('var(--color-rule-2)');
    const ground = resolve('var(--point-lo)');

    let W = 0, H = 0, dpr = 1, cx = 0, cy = 0, scale = 1;
    function size() {
        const r = fig.getBoundingClientRect();
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = r.width; H = r.height;
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
        const wide = W > 960;
        cx = wide ? W * 0.7 : W * 0.5;
        scale = (wide ? H * 0.74 : H * 0.8) / zmax;
        cy = wide ? H * 0.12 + zmax * scale : H * 0.08 + zmax * scale;
    }

    const PX = new Float32Array(n), PY = new Float32Array(n), PD = new Float32Array(n);
    const DEPTHS = 3;
    const buckets = Array.from({ length: LEVELS * DEPTHS }, () => []);
    const alphas = [1, 0.7, 0.42];
    const tilt = 0.2, ct = Math.cos(tilt), st = Math.sin(tilt), camDist = 4.2;

    function project(x, y, z, ca, sa) {
        const rx = x * ca - y * sa, ry = x * sa + y * ca;
        const zc = z - zmax * 0.5;
        const depth = rx * ct + zc * st;
        const vz = zc * ct - rx * st;
        const p = camDist / (camDist - depth);
        return [cx + ry * scale * p, cy - (vz + zmax * 0.5) * scale * p - zmax * 0.5 * scale * (1 - p), depth];
    }

    function draw(t) {
        const a = (t / 70000) * Math.PI * 2 + 0.6;
        const ca = Math.cos(a), sa = Math.sin(a);
        const phase = (t % 7000) / 7000;
        const e = phase < 0.5 ? 4 * phase ** 3 : 1 - (-2 * phase + 2) ** 3 / 2;
        const sweep = -0.05 + e * (zmax + 0.1);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        for (const b of buckets) b.length = 0;
        const litIdx = [], handIdx = [], groundIdx = [];
        for (let i = 0; i < n; i++) {
            const pr = project(X[i], Y[i], Z[i], ca, sa);
            PX[i] = pr[0]; PY[i] = pr[1]; PD[i] = pr[2];
            if (T[i] === 2) { groundIdx.push(i); continue; }
            if (T[i] === 1) { handIdx.push(i); continue; }
            if (Math.abs(Z[i] - sweep) < 0.022) { litIdx.push(i); continue; }
            const lv = Math.min(LEVELS - 1, Math.floor((Z[i] / zmax) * LEVELS));
            const dv = PD[i] > 0.05 ? 0 : PD[i] > -0.08 ? 1 : 2;
            buckets[dv * LEVELS + lv].push(i);
        }
        const r = W > 960 ? 1.5 : 1.2;
        ctx.globalAlpha = 0.5; ctx.fillStyle = ground;
        for (const i of groundIdx) ctx.fillRect(PX[i], PY[i], r, r);
        for (let dv = DEPTHS - 1; dv >= 0; dv--) {
            ctx.globalAlpha = alphas[dv];
            for (let lv = 0; lv < LEVELS; lv++) {
                const b = buckets[dv * LEVELS + lv];
                if (!b.length) continue;
                ctx.fillStyle = ramp[lv];
                for (const i of b) ctx.fillRect(PX[i], PY[i], r, r);
            }
        }
        ctx.globalAlpha = 1; ctx.fillStyle = lit;
        for (const i of litIdx) ctx.fillRect(PX[i], PY[i], r + 0.3, r + 0.3);
        ctx.fillStyle = accent;
        for (const i of handIdx) ctx.fillRect(PX[i], PY[i], r + 0.3, r + 0.3);

        // two callouts, each a hairline leader from a 3px dot at the point to its figure
        if (W > 640) {
            const place = (key, dx, dy) => {
                const el = calls[key];
                const p = project(anchors[key][0], anchors[key][1], anchors[key][2], ca, sa);
                const lx = p[0] + dx, ly = p[1] + dy;
                ctx.strokeStyle = leader; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(lx, ly); ctx.stroke();
                ctx.fillStyle = key === 'hand' ? accent : lit;
                ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, Math.PI * 2); ctx.fill();
                const bw = el.offsetWidth, pad = 24;
                const left = Math.max(pad, Math.min(W - bw - pad, dx > 0 ? lx : lx - bw));
                el.style.transform = `translate(${Math.round(left)}px, ${Math.round(ly - el.offsetHeight / 2)}px)`;
            };
            place('head', W > 960 ? -150 : -110, -10);
            place('hand', W > 960 ? 110 : 90, 40);
        }
    }

    const still = 26000;
    let running = false, raf = 0, elapsed = still, t0 = 0;
    function loop(now) { elapsed = now - t0; draw(elapsed); if (running) raf = requestAnimationFrame(loop); }
    fig.addEventListener('loopstate', (e) => {
        if (e.detail && !running) { running = true; t0 = performance.now() - elapsed; raf = requestAnimationFrame(loop); }
        if (!e.detail) {
            if (running) { running = false; cancelAnimationFrame(raf); }
            draw(elapsed); // a paused cloud always shows its last frame, never an empty canvas
        }
    });
    function redraw() { size(); draw(elapsed); }
    new ResizeObserver(redraw).observe(fig);
    // the browser may drop a canvas it is not showing (a background tab, memory pressure); paint it again
    cv.addEventListener('contextrestored', redraw);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) redraw(); });
    window.addEventListener('pageshow', redraw);
    redraw();
})();
