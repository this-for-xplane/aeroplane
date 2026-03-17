/**
 * AeroVortex Engine - Pure Vanilla JS
 * Joukowski Conformal Mapping & Compressibility Physics
 */

const Complex = {
    add: (a, b) => ({ r: a.r + b.r, i: a.i + b.i }),
    sub: (a, b) => ({ r: a.r - b.r, i: a.i - b.i }),
    mul: (a, b) => ({ r: a.r * b.r - a.i * b.i, i: a.r * b.i + a.i * b.r }),
    div: (a, b) => {
        const d = b.r * b.r + b.i * b.i;
        return { r: (a.r * b.r + a.i * b.i) / d, i: (a.i * b.r - a.r * b.i) / d };
    }
};

const canvas = document.getElementById('simCanvas');
const ctx = canvas.getContext('2d');
const stallWarning = document.getElementById('stall-warning');

// 시뮬레이션 상태
let state = {
    mach: 0.3,
    aoa: 5,
    thickness: 1.15,
    camber: 0.1,
    time: 0
};

// UI 업데이트 및 동기화
function syncInputs() {
    state.mach = parseFloat(document.getElementById('input-mach').value);
    state.aoa = parseFloat(document.getElementById('input-aoa').value);
    state.thickness = parseFloat(document.getElementById('input-thick').value);
    state.camber = parseFloat(document.getElementById('input-camber').value);

    document.getElementById('val-mach').innerText = state.mach.toFixed(2);
    document.getElementById('val-aoa-hud').innerText = state.aoa;
}

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// Joukowski 변환 로직
function transform(z) {
    const invZ = Complex.div({ r: 1, i: 0 }, z);
    return Complex.add(z, invZ);
}

function drawAirfoil() {
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    
    // 에어포일 렌더링
    ctx.beginPath();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2.5;
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#00f2ff';

    const center = { r: -0.15, i: state.camber };
    const radius = state.thickness;

    for (let i = 0; i <= 100; i++) {
        const theta = (i / 100) * Math.PI * 2;
        const z = {
            r: center.r + radius * Math.cos(theta),
            i: center.i + radius * Math.sin(theta)
        };
        const mapped = transform(z);
        
        // 회전 행렬 적용 (AOA)
        const angle = -state.aoa * (Math.PI / 180);
        const rx = mapped.r * Math.cos(angle) - mapped.i * Math.sin(angle);
        const ry = mapped.r * Math.sin(angle) + mapped.i * Math.cos(angle);

        const px = rx * 100;
        const py = -ry * 100;

        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
}

function drawFlowField() {
    const isStalled = Math.abs(state.aoa) > 15;
    const isSupersonic = state.mach >= 1.0;
    stallWarning.style.display = isStalled ? 'block' : 'none';

    const alphaRad = (state.aoa * Math.PI) / 180;
    
    // 양력/항력 물리 계산
    let Cl = 0;
    if (isSupersonic) {
        // Ackeret Theory (Linearized Supersonic Flow)
        Cl = (4 * alphaRad) / Math.sqrt(state.mach ** 2 - 1);
    } else {
        // Prandtl-Glauert Correction
        const Cl0 = 2 * Math.PI * alphaRad;
        Cl = Cl0 / Math.sqrt(Math.max(0.01, 1 - state.mach ** 2));
    }

    document.getElementById('val-lift').innerText = Math.abs(Cl * 80).toFixed(1);
    document.getElementById('val-drag').innerText = (isSupersonic ? Cl * 0.45 : 0.03).toFixed(3);
    document.getElementById('val-speed').innerText = Math.round(state.mach * 661);

    // 유선 그리기
    const rows = 30;
    const gap = canvas.height / rows;
    const flowSpeed = state.mach * 25;

    for (let i = 0; i < rows; i++) {
        ctx.beginPath();
        ctx.strokeStyle = isSupersonic ? 'rgba(255, 183, 0, 0.3)' : 'rgba(0, 242, 255, 0.25)';
        
        let offsetX = (state.time * flowSpeed) % 80;
        let yBase = i * gap;

        for (let x = -80; x < canvas.width + 80; x += 40) {
            let curX = x + offsetX;
            let curY = yBase;

            const dx = curX - canvas.width / 2;
            const dy = curY - canvas.height / 2;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // 유동 편향 로직
            if (dist < 300) {
                const influence = Math.exp(-dist / 150);
                
                // 초음속 정적 상류 (Mach Cone 외부)
                if (isSupersonic && dx < -80) {
                    // No deflection
                } else {
                    curY += Math.sin(alphaRad) * influence * 80;
                    if (isStalled && dx > 20) {
                        curY += Math.sin(state.time * 12 + i) * 20 * influence;
                    }
                }
            }

            if (x === -80) ctx.moveTo(curX, curY);
            else ctx.lineTo(curX, curY);
        }
        ctx.stroke();
    }

    // Mach Wave 시각화
    if (isSupersonic) {
        const mu = Math.asin(1 / state.mach);
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.setLineDash([10, 10]);
        const originX = canvas.width / 2 - 110;
        const originY = canvas.height / 2;
        
        ctx.moveTo(originX, originY);
        ctx.lineTo(originX + 600, originY - 600 * Math.tan(mu));
        ctx.moveTo(originX, originY);
        ctx.lineTo(originX + 600, originY + 600 * Math.tan(mu));
        ctx.stroke();
        ctx.setLineDash([]);
    }
}

function loop() {
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    syncInputs();
    drawFlowField();
    drawAirfoil();
    
    state.time += 0.04;
    requestAnimationFrame(loop);
}

loop();
