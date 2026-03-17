/**
 * AeroSim Pro 4.0 Core Physics Engine
 */

const C = {
    add: (a, b) => ({ r: a.r + b.r, i: a.i + b.i }),
    sub: (a, b) => ({ r: a.r - b.r, i: a.i - b.i }),
    mul: (a, b) => ({ r: a.r * b.r - a.i * b.i, i: a.r * b.i + a.i * b.r }),
    div: (a, b) => { let d = b.r*b.r + b.i*b.i; return d===0 ? {r:0,i:0} : { r: (a.r*b.r + a.i*b.i)/d, i: (a.i*b.r - a.r*b.i)/d }; },
    scale: (a, s) => ({ r: a.r * s, i: a.i * s }),
    sqrt: (a) => { let r = Math.sqrt(a.r*a.r + a.i*a.i), ang = Math.atan2(a.i, a.r); return { r: Math.sqrt(r)*Math.cos(ang/2), i: Math.sqrt(r)*Math.sin(ang/2) }; },
    abs: (a) => Math.sqrt(a.r*a.r + a.i*a.i)
};

const config = { a: 110, cx: 600, cy: 400, numLines: 32 };
const state = { 
    pitch: 5, alt: 10000, thick: 0.12, camber: 0.04, speed: 250, 
    rho: 1.225, mach: 0, lift: 0, drag: 0, regime: 'LAMINAR'
};

const UI = {
    in: { alt: document.getElementById('in-alt'), speed: document.getElementById('in-speed'), pitch: document.getElementById('in-pitch'), thick: document.getElementById('in-thick'), camber: document.getElementById('in-camber') },
    val: { alt: document.getElementById('val-alt'), speed: document.getElementById('val-speed'), pitch: document.getElementById('val-pitch'), thick: document.getElementById('val-thick'), camber: document.getElementById('val-camber') },
    hud: { mach: document.getElementById('hud-mach'), speed: document.getElementById('hud-speed'), lift: document.getElementById('hud-lift'), drag: document.getElementById('hud-drag'), aoa: document.getElementById('hud-aoa') },
    status: document.getElementById('flight-status'),
    airfoil: document.getElementById('airfoil-path'),
    group: document.getElementById('airfoil-group'),
    flow: document.getElementById('flow-layer'),
    shock: document.getElementById('shockwave-layer'),
    dragMetric: document.getElementById('drag-metric')
};

let flowPaths = [];
let J = {};

function init() {
    for (let i = 0; i < config.numLines; i++) {
        let p = document.createElementNS("http://www.w3.org/2000/svg", "path");
        p.setAttribute('class', 'streamline');
        p.style.strokeDasharray = "100, 150";
        UI.flow.appendChild(p);
        flowPaths.push(p);
    }
    Object.values(UI.in).forEach(el => el.addEventListener('input', calculatePhysics));
    calculatePhysics();
    requestAnimationFrame(renderLoop);
}

function calculatePhysics() {
    state.alt = parseInt(UI.in.alt.value);
    state.speed = parseInt(UI.in.speed.value);
    state.pitch = parseFloat(UI.in.pitch.value);
    state.thick = parseInt(UI.in.thick.value) / 100;
    state.camber = parseInt(UI.in.camber.value) / 100;

    const h = state.alt * 0.3048;
    const temp = Math.max(288.15 - 0.0065 * h, 216.65);
    state.rho = (101325 * Math.pow(288.15 / temp, -5.25588)) / (287.05 * temp);
    
    const speed_ms = state.speed * 0.514444;
    state.mach = speed_ms / Math.sqrt(1.4 * 287.05 * temp);

    const alpha = state.pitch * Math.PI / 180;
    const mu_x = -config.a * state.thick * 0.8;
    const mu_y = config.a * state.camber * 0.5;
    J = { mu: { r: mu_x, i: mu_y }, R: Math.sqrt((config.a - mu_x)**2 + mu_y**2), alpha: alpha, V: 1.0 };
    J.beta = Math.asin(mu_y / J.R);
    J.Gamma = 4 * Math.PI * J.V * J.R * Math.sin(alpha + J.beta);

    let cl = 2 * Math.PI * Math.sin(alpha + J.beta) * (1 + 0.77 * state.thick);
    let cd = 0.015 + (state.thick * 0.12) + Math.pow(cl, 2) / (Math.PI * 6.5);

    const critAOA = 15 + (state.thick * 40);
    const isStalled = Math.abs(state.pitch) > critAOA;

    if (state.mach < 0.8) {
        cl /= Math.sqrt(1 - state.mach**2);
        state.regime = isStalled ? 'STALLED' : 'LAMINAR';
    } else if (state.mach < 1.2) {
        cd += 0.05 * Math.pow((state.mach - 0.8)/0.4, 2);
        state.regime = 'TRANSONIC';
    } else {
        cl = 4 * alpha / Math.sqrt(state.mach**2 - 1);
        cd = (4 * alpha**2 + 4 * state.thick**2) / Math.sqrt(state.mach**2 - 1) + 0.02;
        state.regime = 'SUPERSONIC';
        state.beta_shock = Math.asin(1/state.mach) + (state.thick + Math.abs(alpha))/2;
    }

    state.lift = 0.5 * state.rho * Math.pow(speed_ms, 2) * 40 * cl;
    state.drag = 0.5 * state.rho * Math.pow(speed_ms, 2) * 40 * cd;

    updateUI();
    drawAirfoil();
    drawShockwaves();
    calculateStreamlines();
}

function updateUI() {
    UI.val.alt.innerText = state.alt.toLocaleString() + ' ft';
    UI.val.speed.innerText = state.speed + ' kts';
    UI.val.pitch.innerText = state.pitch.toFixed(1) + '°';
    UI.val.thick.innerText = (state.thick * 100).toFixed(0) + '%';
    UI.val.camber.innerText = (state.camber * 100).toFixed(0) + '%';
    UI.hud.mach.innerText = state.mach.toFixed(2);
    UI.hud.speed.innerText = state.speed + ' KTS';
    UI.hud.lift.innerText = Math.abs(Math.round(state.lift)).toLocaleString() + ' N';
    UI.hud.drag.innerText = Math.round(state.drag).toLocaleString() + ' N';
    UI.hud.aoa.innerText = state.pitch.toFixed(1) + '°';

    UI.status.className = 'status-badge ' + (state.regime === 'STALLED' ? 'status-stall' : state.regime === 'SUPERSONIC' ? 'status-supersonic' : 'status-laminar');
    UI.status.innerText = state.regime === 'STALLED' ? '⚠️ STALL' : state.regime === 'SUPERSONIC' ? '🚀 SUPERSONIC' : 'LAMINAR FLOW';
    UI.airfoil.className.baseVal = state.regime === 'STALLED' ? 'stalled' : '';
}

function drawAirfoil() {
    let pts = [];
    for(let t=0; t<=Math.PI*2; t+=0.1) {
        let zeta = { r: J.mu.r + J.R * Math.cos(t), i: J.mu.i + J.R * Math.sin(t) };
        let z = C.add(zeta, C.div({ r: config.a * config.a, i: 0 }, zeta));
        pts.push(`${z.r},${-z.i}`);
    }
    UI.airfoil.setAttribute('d', `M ${pts.join(' L ')} Z`);
    UI.group.setAttribute('transform', `translate(${config.cx}, ${config.cy}) rotate(${-state.pitch})`);
}

function drawShockwaves() {
    UI.shock.innerHTML = '';
    if (state.regime !== 'SUPERSONIC') return;
    const le = { x: config.cx - config.a * 1.9, y: config.cy }; // Simplify LE
    const drawShock = (angle) => {
        const l = document.createElementNS("http://www.w3.org/2000/svg", "line");
        l.setAttribute('x1', le.x); l.setAttribute('y1', le.y);
        l.setAttribute('x2', le.x + 600 * Math.cos(angle));
        l.setAttribute('y2', le.y + 600 * Math.sin(angle));
        l.setAttribute('class', 'shockwave');
        UI.shock.appendChild(l);
    };
    drawShock(-state.beta_shock); drawShock(state.beta_shock);
}

function calculateStreamlines() {
    const dt = state.regime === 'SUPERSONIC' ? 4.0 : 6.0;
    for(let i=0; i<config.numLines; i++) {
        let y = (i - config.numLines/2) * 28;
        let lp = { r: -700, i: y };
        let path = "";
        for(let s=0; s<150; s++) {
            let v = { r: J.V, i: 0 };
            if (!(state.regime === 'SUPERSONIC' && lp.r < -200)) {
                let z2 = C.mul(lp, lp), a2 = { r: config.a**2, i: 0 };
                let zeta = C.scale(C.add(lp, C.sqrt(C.sub(z2, C.scale(a2, 4)))), 0.5);
                let zp = C.sub(zeta, J.mu);
                if (C.abs(zp) < J.R) break;
                let dW = C.add(C.sub({r:J.V,i:0}, C.div({r:J.V*J.R**2,i:0}, C.mul(zp,zp))), C.div({r:0,i:J.Gamma/(2*Math.PI)}, zp));
                let dz = C.sub({r:1,i:0}, C.div(a2, C.mul(zeta,zeta)));
                let res = C.div(dW, dz);
                v = { r: res.r, i: -res.i };
            }
            lp = C.add(lp, C.scale(v, dt));
            let gx = lp.r + config.cx, gy = lp.i + config.cy;
            path += (s === 0 ? "M " : " L ") + `${gx},${gy}`;
            if (gx > 1200) break;
        }
        flowPaths[i].setAttribute('d', path);
        flowPaths[i].style.stroke = state.regime === 'SUPERSONIC' ? 'url(#flowSuper)' : (state.regime === 'STALLED' && i > 15 ? 'url(#flowStall)' : 'url(#flowSub)');
    }
}

function renderLoop() {
    if (state.regime === 'STALLED' || state.regime === 'SUPERSONIC') calculateStreamlines();
    requestAnimationFrame(renderLoop);
}

window.onload = init;
