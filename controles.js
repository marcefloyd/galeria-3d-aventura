// --- CONTROLES CON MOVIMIENTO DIRECTO DE MOUSE ---
if (typeof keys === 'undefined') {
    window.keys = { W: false, S: false, A: false, D: false, Space: false, Shift: false, C: false };
}

window.mouseDeltaX = 0;
window.mouseDeltaY = 0;

// Al hacer clic en la pantalla, activamos el control de visión libre
document.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    if (document.body.requestPointerLock) {
        document.body.requestPointerLock();
    }
});

// El mouse se mueve libremente sin necesidad de mantener ningún botón apretado
window.addEventListener('mousemove', (e) => {
    window.mouseDeltaX = e.movementX || 0;
    window.mouseDeltaY = e.movementY || 0;
});

window.addEventListener('keydown', (e) => {
    switch (e.code) {
        case 'KeyW': keys.W = true; break;
        case 'KeyS': keys.S = true; break;
        case 'KeyA': keys.A = true; break;
        case 'KeyD': keys.D = true; break;
        case 'Space': keys.Space = true; if(typeof triggerJump === 'function') triggerJump(); break;
        case 'ShiftLeft': keys.Shift = true; break;
        case 'KeyC': keys.C = true; break;
        case 'KeyE': if(typeof triggerInteract === 'function') triggerInteract(); break;
        case 'KeyV': if(typeof toggleCameraShoulder === 'function') toggleCameraShoulder(); break;
        case 'KeyG': if(typeof dropWeapon === 'function') dropWeapon(); break;
    }
});

window.addEventListener('keyup', (e) => {
    switch (e.code) {
        case 'KeyW': keys.W = false; break;
        case 'KeyS': keys.S = false; break;
        case 'KeyA': keys.A = false; break;
        case 'KeyD': keys.D = false; break;
        case 'ShiftLeft': keys.Shift = false; break;
        case 'KeyC': keys.C = false; break;
    }
});

// Shooter: Clic derecho (Sniper) y Clic izquierdo (Disparar)
window.addEventListener('mousedown', (e) => {
    if (e.button === 2) {
        const scope = document.getElementById('sniper-scope');
        if(scope) scope.style.display = 'block';
    } else if (e.button === 0) {
        if(typeof fireWeapon === 'function') fireWeapon();
    }
});

window.addEventListener('mouseup', (e) => {
    if (e.button === 2) {
        const scope = document.getElementById('sniper-scope');
        if(scope) scope.style.display = 'none';
    }
});

window.addEventListener('contextmenu', e => e.preventDefault());