/* =====================================================================
   GALERÍA 3D + AVENTURA / PARKOUR / SHOOTER  (Three.js r128 + FBXLoader)
   Todo el contenido de Mixamo vive en la carpeta  pers/
   ===================================================================== */

// ---------------------------------------------------------------------
// 0. CONFIGURACIÓN (todo lo "tuneable" está aquí)
// ---------------------------------------------------------------------
const CFG = {
    // Velocidades (unidades/seg) y escala de tiempo de la animación.
    // Regla anti-patinaje:  timeScale ≈ speed / velocidad_natural_del_clip.
    // Si los pies patinan, sube/baja el 'ts' del estado correspondiente.
    walk:     { speed: 2.6, ts: 1.2 },
    rifleWalk:{ speed: 2.4, ts: 1.1 },
    sprint:   { speed: 6.0, ts: 1.15 },
    crouch:   { speed: 1.6, ts: 1.0 },

    gravity: 20.0,
    jumpVelocity: 8.5,
    airControl: 0.8,

    fadeLoco: 0.22,          // crossfade entre locomoción
    fadeAction: 0.12,        // crossfade al entrar a salto/recarga/etc.

    landingStart: 0.40,      // fracción del clip 'Falling To Landing' desde donde arranca
    landingMaxLock: 0.8,     // seg máx. que dura el estado de aterrizaje

    ropeSpeed: 3.0,
    ropeMaxY: 8.2,           // altura máx. de los pies en la soga
    wallClimbSpeed: 2.0,
    avatarRadius: 0.4,

    mouseSens: 0.003,
    invertY: false,          // true = estilo "avión"
    camDist: 4.0,
    camShoulder: 0.6,

    bounds: { minX: -14, maxX: 14, minZ: -18, maxZ: 5 }
};

// Archivos de animación (dentro de pers/)
const ANIM_FILES = {
    Idle:      'Pointing.fbx',
    Walk:      'Walking.only.fbx',
    Sprint:    'Sprint.fbx',
    Crouch:    'Crouch Walking.fbx',
    Jumping:   'Jumping.fbx',
    Landing:   'Falling To Landing.fbx',
    Reloading: 'Reloading.fbx',
    Gunplay:   'Gunplayautomatico.fbx',
    RifleIdle: 'Rifle Idle.fbx',
    RifleWalk: 'Rifle Walk.fbx',
    RifleJump: 'Rifle Jump.fbx',
    ClimbRope: 'Climbing A Rope.fbx',
    ClimbWall: 'Climbing Up Wall.fbx'
};

// Dispositivo táctil (celu/tablet). Para probar en la compu abrí taller.html?touch=1
const isTouch = matchMedia('(pointer: coarse)').matches || /[?&]touch\b/.test(location.search);

// ---------------------------------------------------------------------
// 1. ESCENA BÁSICA
// ---------------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);
scene.fog = new THREE.FogExp2(0x1a1a1a, 0.02);

const BASE_FOV = 60;
const SCOPE_FOV = 25;
const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 3, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// ---------------------------------------------------------------------
// 2. ESTADO GLOBAL
// ---------------------------------------------------------------------
let currentMode = 'avatar'; // 'avatar' | 'ghost'

const keys = { W: false, S: false, A: false, D: false, Space: false, Shift: false };
let isCrouching = false;
let hasWeapon = false;
let isFiring = false;
let isAiming = false;

// Avatar / física
let avatar = null;
let mixer = null;
const avatarVelocity = new THREE.Vector3();
let grounded = true;
let airTime = 0;
let airAnim = false;
let targetYaw = 0;           // hacia dónde debe mirar el avatar
let climb = null;            // null | { type: 'rope' | 'wall' }
let climbCooldown = 0;

// Animación
const clips = {};            // nombre -> AnimationClip ya procesado
let current = null;          // AnimationAction actual
let currentName = '';
let actionLock = 0;          // segundos restantes de un one-shot (reload, landing…)
let lockMul = 1;             // multiplicador de velocidad mientras dura el lock

// Cámara
let camYaw = 0;
let camPitch = 0.15;         // + = mirar hacia arriba
let cameraSide = 1;
let ghostEuler = new THREE.Euler(0, 0, 0, 'YXZ');

// Pointer lock
let pointerLocked = false;
let lockFallback = false;    // si el navegador no permite pointer lock

// Controles táctiles
const touchMove = { x: 0, y: 0 };   // joystick analógico (-1..1), y>0 = hacia atrás
let touchSync = null;               // refresca el estado visual de los botones

// Video / pantalla completa
let video, videoTexture, videoScreen, fullscreenOverlay;
let isFullscreenArt = false;

// Objetos del escenario
let ropeMesh, wallObstacle;
const wallBox = new THREE.Box3();
const ROPE_POS = new THREE.Vector3(-4, 5, -8);

// ---------------------------------------------------------------------
// 3. UTILIDADES UI
// ---------------------------------------------------------------------
const toastEl = document.createElement('div');
Object.assign(toastEl.style, {
    position: 'fixed', bottom: '40px', left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.75)', color: '#fff', padding: '8px 18px',
    borderRadius: '8px', fontFamily: 'sans-serif', fontSize: '14px',
    pointerEvents: 'none', opacity: '0', transition: 'opacity 0.25s', zIndex: '50'
});
document.body.appendChild(toastEl);
let toastTimer = null;
function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.style.opacity = '0'; }, 1600);
}

function updateModeText() {
    const el = document.getElementById('mode-text');
    if (!el) return;
    if (!pointerLocked && !lockFallback) {
        el.innerText = 'Haz clic en la pantalla para jugar';
    } else {
        el.innerText = currentMode === 'ghost' ? 'Modo actual: Cámara Libre' : 'Modo actual: Avatar (3ª Persona)';
    }
}

// ---------------------------------------------------------------------
// 4. CAMBIO DE MODOS
// ---------------------------------------------------------------------
window.switchMode = function (mode) {
    currentMode = mode;
    const bg = document.getElementById('btn-ghost');
    const ba = document.getElementById('btn-avatar');
    if (bg) bg.classList.remove('active-btn');
    if (ba) ba.classList.remove('active-btn');

    isFiring = false;
    isAiming = false;
    setScope(false);

    if (mode === 'ghost') {
        if (bg) bg.classList.add('active-btn');
        camera.fov = BASE_FOV; camera.updateProjectionMatrix();
        ghostEuler.setFromQuaternion(camera.quaternion, 'YXZ');
    } else {
        if (ba) ba.classList.add('active-btn');
        if (avatar) {
            camera.position.set(avatar.position.x, avatar.position.y + 2.5, avatar.position.z + CFG.camDist);
        }
    }
    updateModeText();
};

function setScope(on) {
    const s = document.getElementById('sniper-scope');
    if (s) s.style.display = on ? 'block' : 'none';
}

// ---------------------------------------------------------------------
// 5. CONTROLES
// ---------------------------------------------------------------------
const GAME_CODES = new Set([
    'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight',
    'KeyC', 'KeyR', 'KeyE', 'KeyV', 'KeyG'
]);

function clearInput() {
    keys.W = keys.A = keys.S = keys.D = keys.Space = keys.Shift = false;
    touchMove.x = touchMove.y = 0;
    isFiring = false;
    isAiming = false;
    setScope(false);
}

window.addEventListener('keydown', (e) => {
    // Pantalla completa del cuadro: sólo E y Escape
    if (isFullscreenArt) {
        if (e.code === 'Escape' || e.code === 'KeyE') toggleFullscreenArt();
        return;
    }

    if (GAME_CODES.has(e.code)) e.preventDefault();

    switch (e.code) {
        case 'KeyW': keys.W = true; break;
        case 'KeyS': keys.S = true; break;
        case 'KeyA': keys.A = true; break;   // A = izquierda
        case 'KeyD': keys.D = true; break;   // D = derecha
        case 'ShiftLeft':
        case 'ShiftRight': keys.Shift = true; break;
        case 'Space':
            keys.Space = true;
            if (!e.repeat) tryJump();
            break;
    }

    if (e.repeat) return;   // las siguientes son acciones "de un toque"

    switch (e.code) {
        case 'KeyC':
            if (currentMode === 'avatar' && !climb) isCrouching = !isCrouching;
            break;
        case 'KeyR': tryReload(); break;
        case 'KeyE': triggerInteract(); break;
        case 'KeyV': cameraSide *= -1; break;
        case 'KeyG':
            hasWeapon = !hasWeapon;
            if (!hasWeapon) isFiring = false;
            showToast(hasWeapon ? '¡Rifle equipado!' : 'Arma guardada');
            break;
    }
});

window.addEventListener('keyup', (e) => {
    switch (e.code) {
        case 'KeyW': keys.W = false; break;
        case 'KeyS': keys.S = false; break;
        case 'KeyA': keys.A = false; break;
        case 'KeyD': keys.D = false; break;
        case 'ShiftLeft':
        case 'ShiftRight': keys.Shift = false; break;
        case 'Space': keys.Space = false; break;
    }
});

window.addEventListener('blur', clearInput);

// --- Pointer lock: un clic y el mouse queda libre, sin mantener botones ---
document.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON' || isFullscreenArt || isTouch) return;
    if (!pointerLocked && document.body.requestPointerLock) {
        document.body.requestPointerLock();
    }
});
document.addEventListener('pointerlockchange', () => {
    pointerLocked = document.pointerLockElement === document.body;
    if (!pointerLocked) clearInput();
    updateModeText();
});
document.addEventListener('pointerlockerror', () => {
    lockFallback = true;   // el mouse funcionará igual sin bloqueo
    updateModeText();
});

function applyLook(dx, dy) {
    if (isFullscreenArt) return;
    if (CFG.invertY) dy = -dy;

    if (currentMode === 'ghost') {
        ghostEuler.y -= dx * CFG.mouseSens;
        ghostEuler.x -= dy * CFG.mouseSens;
        ghostEuler.x = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, ghostEuler.x));
        camera.quaternion.setFromEuler(ghostEuler);
    } else {
        camYaw -= dx * CFG.mouseSens * 1.4;
        camPitch -= dy * CFG.mouseSens * 1.4;   // arriba = mirar arriba
        camPitch = Math.max(-1.0, Math.min(0.7, camPitch));
    }
}

window.addEventListener('mousemove', (e) => {
    if (isTouch) return;
    if (!pointerLocked && !lockFallback) return;
    // Algunos navegadores emiten saltos enormes puntuales: los limitamos.
    applyLook(Math.max(-100, Math.min(100, e.movementX || 0)),
              Math.max(-100, Math.min(100, e.movementY || 0)));
});

window.addEventListener('mousedown', (e) => {
    if (isTouch) return;
    if (!pointerLocked && !lockFallback) return;
    if (isFullscreenArt || currentMode !== 'avatar') {
        if (e.button === 2) setScope(false);
        return;
    }
    if (e.button === 2) {
        isAiming = true;
        setScope(true);
    } else if (e.button === 0) {
        if (!hasWeapon) { showToast('Equipa el rifle con G'); return; }
        if (climb) return;
        isFiring = true;
    }
});
window.addEventListener('mouseup', (e) => {
    if (isTouch) return;
    if (e.button === 2) { isAiming = false; setScope(false); }
    if (e.button === 0) isFiring = false;
});
window.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------------------------------------------------------------------
// 6. ESCENARIO
// ---------------------------------------------------------------------
function construirEscena() {
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    const mainLight = new THREE.DirectionalLight(0xfffaed, 0.8);
    mainLight.position.set(5, 10, 5);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
    const sc = mainLight.shadow.camera;
    sc.left = -22; sc.right = 22; sc.top = 22; sc.bottom = -22; sc.near = 1; sc.far = 40;
    scene.add(mainLight);

    // Suelo
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(40, 40),
        new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.8 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Pared trasera
    const backWall = new THREE.Mesh(
        new THREE.PlaneGeometry(40, 15),
        new THREE.MeshStandardMaterial({ color: 0x3d3d3d, roughness: 0.9 })
    );
    backWall.position.set(0, 7.5, -20);
    scene.add(backWall);

    // Cuadro 9:16
    const frame = new THREE.Mesh(
        new THREE.BoxGeometry(3.4, 5.8, 0.1),
        new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 })
    );
    frame.position.set(0, 5.0, -19.9);
    scene.add(frame);

    video = document.createElement('video');
    video.src = 'pers/videomuseoweb.mp4';
    video.crossOrigin = 'anonymous';
    video.loop = true; video.muted = true; video.playsInline = true;
    const p = video.play(); if (p && p.catch) p.catch(() => {});

    videoTexture = new THREE.VideoTexture(video);
    videoTexture.minFilter = THREE.LinearFilter;
    videoTexture.magFilter = THREE.LinearFilter;
    videoTexture.generateMipmaps = false;

    videoScreen = new THREE.Mesh(
        new THREE.PlaneGeometry(3.2, 5.6),
        new THREE.MeshBasicMaterial({ map: videoTexture })
    );
    videoScreen.position.set(0, 5.0, -19.85);
    scene.add(videoScreen);

    // Soga colgante
    ropeMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.9 })
    );
    ropeMesh.position.copy(ROPE_POS);
    scene.add(ropeMesh);

    // Muro de trepado
    wallObstacle = new THREE.Mesh(
        new THREE.BoxGeometry(3, 4, 0.8),
        new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.5 })
    );
    wallObstacle.position.set(5, 2, -10);
    wallObstacle.castShadow = true;
    wallObstacle.receiveShadow = true;
    scene.add(wallObstacle);
    wallObstacle.updateMatrixWorld(true);
    wallBox.setFromObject(wallObstacle);   // caja de colisión calculada del propio mesh

    // Overlay de pantalla completa (tecla E junto al cuadro)
    fullscreenOverlay = document.createElement('div');
    Object.assign(fullscreenOverlay.style, {
        position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
        backgroundColor: 'rgba(0,0,0,0.95)', display: 'flex',
        justifyContent: 'center', alignItems: 'center', zIndex: '1000',
        opacity: '0', pointerEvents: 'none', transition: 'opacity 0.3s ease'
    });
    const fsVideo = document.createElement('video');
    fsVideo.src = 'pers/videomuseoweb.mp4';
    fsVideo.id = 'fs-video';
    fsVideo.loop = true; fsVideo.muted = false; fsVideo.controls = true;
    fsVideo.style.maxWidth = '90vw'; fsVideo.style.maxHeight = '90vh';
    fullscreenOverlay.appendChild(fsVideo);
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', 'Cerrar');
    Object.assign(closeBtn.style, {
        position: 'absolute', top: '14px', right: '14px', width: '48px', height: '48px',
        borderRadius: '50%', border: '2px solid #00ff41', background: 'rgba(0,0,0,0.7)',
        color: '#00ff41', fontSize: '22px', cursor: 'pointer'
    });
    closeBtn.addEventListener('click', () => { if (isFullscreenArt) toggleFullscreenArt(); });
    fullscreenOverlay.appendChild(closeBtn);
    document.body.appendChild(fullscreenOverlay);
}

function horizDist(a, bx, bz) {
    return Math.hypot(a.x - bx, a.z - bz);
}

function triggerInteract() {
    if (!avatar || currentMode !== 'avatar') return;

    // Soltar la soga
    if (climb && climb.type === 'rope') { stopClimb(false); return; }
    if (climb) return;

    // Soga cercana
    if (horizDist(avatar.position, ROPE_POS.x, ROPE_POS.z) < 2.0 && avatar.position.y < CFG.ropeMaxY) {
        startClimb('rope');
        return;
    }

    // Cuadro cercano
    if (horizDist(avatar.position, 0, -19.85) < 6.0) {
        toggleFullscreenArt();
    }
}

function toggleFullscreenArt() {
    isFullscreenArt = !isFullscreenArt;
    const fsVideo = document.getElementById('fs-video');
    if (isFullscreenArt) {
        clearInput();
        fullscreenOverlay.style.opacity = '1';
        fullscreenOverlay.style.pointerEvents = 'auto';
        fsVideo.currentTime = video.currentTime;
        const p = fsVideo.play(); if (p && p.catch) p.catch(() => {});
        if (document.exitPointerLock) document.exitPointerLock();
    } else {
        fullscreenOverlay.style.opacity = '0';
        fullscreenOverlay.style.pointerEvents = 'none';
        fsVideo.pause();
    }
}

// ---------------------------------------------------------------------
// 7. CARGA DE AVATAR Y ANIMACIONES
// ---------------------------------------------------------------------
const fbxLoader = new THREE.FBXLoader();

function loadFBX(path) {
    return new Promise((resolve, reject) => {
        fbxLoader.load(encodeURI(path), resolve, undefined, reject);
    });
}

/**
 * Elimina el "root motion" de las animaciones de Mixamo (si no, el personaje
 * se desplaza solo y vuelve de golpe al reiniciar el clip).
 * Bloquea la posición de Hips al primer fotograma.
 * Para 'Landing' sólo se bloquean X/Z y se conserva la altura original.
 */
function prepararClip(name, clip) {
    clip.name = name;
    const keepY = (name === 'Landing');
    clip.tracks.forEach((track) => {
        if (!/Hips\.position$/.test(track.name)) return;
        const v = track.values;
        for (let i = 3; i < v.length; i += 3) {
            v[i]     = v[0];
            if (!keepY) v[i + 1] = v[1];
            v[i + 2] = v[2];
        }
    });
    return clip;
}

async function cargarAvatar() {
    try {
        const obj = await loadFBX('pers/James.fbx');
        avatar = obj;
        avatar.scale.set(0.01, 0.01, 0.01);
        avatar.position.set(0, 0, -5);
        avatar.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.frustumCulled = false;   // evita que desaparezca al animarse
            }
        });
        scene.add(avatar);
        mixer = new THREE.AnimationMixer(avatar);
    } catch (err) {
        console.error('Error al cargar el avatar:', err);
        return;
    }

    const entries = Object.entries(ANIM_FILES);
    const results = await Promise.allSettled(entries.map(([, f]) => loadFBX('pers/' + f)));

    results.forEach((res, i) => {
        const [name, file] = entries[i];
        if (res.status === 'fulfilled' && res.value.animations && res.value.animations.length) {
            clips[name] = prepararClip(name, res.value.animations[0]);
        } else {
            console.warn('No se pudo cargar la animación:', 'pers/' + file);
        }
    });

    play('Idle', { fade: 0 });
}

// ---------------------------------------------------------------------
// 8. MÁQUINA DE ESTADOS DE ANIMACIÓN
// ---------------------------------------------------------------------
/**
 * Reproduce 'name' con crossfade limpio desde la acción actual.
 * Si ya es la acción actual (y no se pide restart) sólo actualiza timeScale,
 * así se puede llamar cada frame sin reiniciar el clip.
 */
function play(name, opts = {}) {
    const { loop = true, timeScale = 1, fade = CFG.fadeLoco, restart = false, startAt = 0 } = opts;
    if (!mixer || !clips[name]) return null;

    const next = mixer.clipAction(clips[name]);

    if (next === current && !restart) {
        next.setEffectiveTimeScale(timeScale);
        return next;
    }

    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.setEffectiveTimeScale(timeScale);
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop;
    if (startAt > 0) next.time = startAt;

    if (current && current !== next) {
        next.crossFadeFrom(current, fade, false);
    } else if (!current) {
        next.fadeIn(fade || 0.0001);
    }

    next.play();
    current = next;
    currentName = name;
    return next;
}

// Primer clip disponible de una lista de alternativas
function pick(...names) {
    for (const n of names) if (clips[n]) return n;
    return null;
}

/** Devuelve el estado de locomoción deseado según input y equipo. */
function getLoco(moving) {
    if (isFiring && hasWeapon && clips.Gunplay) {
        return { name: 'Gunplay', speed: CFG.walk.speed * 0.4, ts: 1, loop: true };
    }
    if (!moving) {
        return { name: pick(hasWeapon ? 'RifleIdle' : 'Idle', 'Idle'), speed: 0, ts: 1, loop: true };
    }
    if (isCrouching) return { name: pick('Crouch', 'Walk'), speed: CFG.crouch.speed, ts: CFG.crouch.ts, loop: true };
    if (keys.Shift)  return { name: pick('Sprint', 'Walk'), speed: CFG.sprint.speed, ts: CFG.sprint.ts, loop: true };
    if (hasWeapon)   return { name: pick('RifleWalk', 'Walk'), speed: CFG.rifleWalk.speed, ts: CFG.rifleWalk.ts, loop: true };
    return { name: pick('Walk'), speed: CFG.walk.speed, ts: CFG.walk.ts, loop: true };
}

// ---------------------------------------------------------------------
// 9. ACCIONES: SALTO, RECARGA, SOGA, MURO
// ---------------------------------------------------------------------
function tryJump() {
    if (!avatar || currentMode !== 'avatar') return;

    if (climb) { stopClimb(true); return; }   // saltar suelta soga/muro

    if (grounded) {
        isCrouching = false;
        actionLock = 0;
        avatarVelocity.y = CFG.jumpVelocity;
        grounded = false;
        airTime = 0;
        airAnim = false;     // la animación arranca en el bucle (ver updateAvatar)
    }
}

function tryReload() {
    if (!avatar || currentMode !== 'avatar' || climb) return;
    if (!hasWeapon) { showToast('Equipa el rifle con G'); return; }
    if (!grounded || !clips.Reloading) return;
    play('Reloading', { loop: false, restart: true, fade: CFG.fadeAction });
    actionLock = Math.max(0.3, clips.Reloading.duration - 0.2);
    lockMul = 0.4;
}

function startClimb(type) {
    climb = { type };
    isCrouching = false;
    isFiring = false;
    avatarVelocity.set(0, 0, 0);
    grounded = false;
    airTime = 0;
    airAnim = true;     // evita que se dispare la animación de caída
    actionLock = 0;

    if (type === 'rope') {
        avatar.position.x = ROPE_POS.x;
        avatar.position.z = ROPE_POS.z + 0.35;
    } else {
        avatar.position.z = wallBox.max.z + 0.3;
        avatar.position.x = Math.max(wallBox.min.x + 0.3, Math.min(wallBox.max.x - 0.3, avatar.position.x));
    }
    avatar.rotation.y = Math.PI;     // mirando hacia -Z (hacia la soga / el muro)
    targetYaw = Math.PI;

    play(type === 'rope' ? 'ClimbRope' : 'ClimbWall', { timeScale: 0, fade: CFG.fadeAction });
}

function stopClimb(jump) {
    if (!climb) return;
    climb = null;
    climbCooldown = 0.6;
    airAnim = false;
    airTime = 0;
    if (jump) {
        avatarVelocity.y = 5.0;
        avatar.position.z += 0.5;    // pequeño empujón hacia atrás
        grounded = false;
    }
}

function mantleWall() {
    climb = null;
    climbCooldown = 0.6;
    avatar.position.y = wallBox.max.y;
    avatar.position.z = (wallBox.min.z + wallBox.max.z) / 2;
    avatarVelocity.set(0, 0, 0);
    grounded = true;
    airAnim = false;
    airTime = 0;
    showToast('¡Arriba!');
}

/** Altura del suelo bajo (x,z): 0, o la cima del muro si estás sobre él. */
function groundHeightAt(x, z) {
    if (x > wallBox.min.x && x < wallBox.max.x && z > wallBox.min.z && z < wallBox.max.z) {
        return wallBox.max.y;
    }
    return 0;
}

/** Colisión lateral con el muro (sólo si tus pies están por debajo de la cima). */
function collideWall() {
    const p = avatar.position;
    if (p.y >= wallBox.max.y - 0.2) return;
    const r = CFG.avatarRadius;
    const minX = wallBox.min.x - r, maxX = wallBox.max.x + r;
    const minZ = wallBox.min.z - r, maxZ = wallBox.max.z + r;
    if (p.x <= minX || p.x >= maxX || p.z <= minZ || p.z >= maxZ) return;

    const dL = p.x - minX, dR = maxX - p.x, dB = p.z - minZ, dF = maxZ - p.z;
    const m = Math.min(dL, dR, dB, dF);
    if (m === dL) p.x = minX;
    else if (m === dR) p.x = maxX;
    else if (m === dB) p.z = minZ;
    else p.z = maxZ;
}

/** ¿Estás caminando hacia la cara frontal del muro? */
function wantsToClimbWall(moveDir) {
    if (climbCooldown > 0 || !(keys.W || touchMove.y < -0.5) || moveDir.lengthSq() === 0) return false;
    const p = avatar.position;
    const r = CFG.avatarRadius;
    if (p.y > wallBox.max.y - 1.0) return false;
    if (p.x < wallBox.min.x - 0.1 || p.x > wallBox.max.x + 0.1) return false;
    if (p.z < wallBox.max.z || p.z > wallBox.max.z + r + 0.45) return false;   // sólo cara frontal (+Z)
    return moveDir.z < -0.4;                                                    // yendo hacia el muro
}

// ---------------------------------------------------------------------
// 10. ACTUALIZACIÓN DEL AVATAR
// ---------------------------------------------------------------------
const UP = new THREE.Vector3(0, 1, 0);
const _moveDir = new THREE.Vector3();

function lerpAngle(a, b, t) {
    let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    return a + d * t;
}

function updateAvatar(delta) {
    const pos = avatar.position;
    if (climbCooldown > 0) climbCooldown -= delta;
    if (actionLock > 0) actionLock -= delta;

    // ------------------ TREPANDO (soga o muro) ------------------
    if (climb) {
        const up = keys.W || touchMove.y < -0.4, down = keys.S || touchMove.y > 0.4;
        const dir = (up ? 1 : 0) - (down ? 1 : 0);
        const speed = climb.type === 'rope' ? CFG.ropeSpeed : CFG.wallClimbSpeed;
        pos.y += dir * speed * delta;

        // timeScale: 1 subiendo, -1 bajando (animación al revés), 0 quieto
        if (current) current.setEffectiveTimeScale(dir);

        if (climb.type === 'rope') {
            pos.y = Math.min(pos.y, CFG.ropeMaxY);
            if (pos.y <= 0 && dir < 0) { pos.y = 0; stopClimb(false); }
        } else {
            if (pos.y <= 0 && dir < 0) { pos.y = 0; stopClimb(false); }
            else if (pos.y >= wallBox.max.y - 0.3) mantleWall();
        }
        avatar.rotation.y = Math.PI;
        return;
    }

    // ------------------ MOVIMIENTO HORIZONTAL ------------------
    _moveDir.set(0, 0, 0);
    if (keys.W) _moveDir.z -= 1;
    if (keys.S) _moveDir.z += 1;
    if (keys.A) _moveDir.x -= 1;   // izquierda
    if (keys.D) _moveDir.x += 1;   // derecha
    _moveDir.x += touchMove.x;
    _moveDir.z += touchMove.y;
    const len = _moveDir.length();
    const moving = len > 0.15;
    if (moving) {
        if (len > 1) _moveDir.divideScalar(len);                          // diagonal / joystick al tope
        else if (len < 0.999) _moveDir.setLength(Math.max(0.4, len));     // joystick suave = más lento
        _moveDir.applyAxisAngle(UP, camYaw);                              // relativo a la cámara
    } else {
        _moveDir.set(0, 0, 0);
    }

    // ¿Empieza a trepar el muro automáticamente?
    if (wantsToClimbWall(_moveDir)) {
        startClimb('wall');
        return;
    }

    const loco = getLoco(moving);

    let speed = loco.speed;
    if (!grounded) speed = (keys.Shift ? CFG.sprint.speed : CFG.walk.speed) * CFG.airControl;
    else if (actionLock > 0) speed *= lockMul;
    if (!moving) speed = 0;
    // Al disparar, el avatar se mueve más lento aunque la animación sea Gunplay
    if (isFiring && hasWeapon && moving && grounded) speed = CFG.walk.speed * 0.4;

    if (moving) pos.addScaledVector(_moveDir, speed * delta);

    // Orientación
    if (isFiring || isAiming) {
        targetYaw = camYaw + Math.PI;                 // mira hacia donde apunta la cámara
    } else if (moving) {
        targetYaw = Math.atan2(_moveDir.x, _moveDir.z);
    }
    avatar.rotation.y = lerpAngle(avatar.rotation.y, targetYaw, 1 - Math.exp(-14 * delta));

    // ------------------ FÍSICA VERTICAL ------------------
    const wasGrounded = grounded;
    avatarVelocity.y -= CFG.gravity * delta;
    pos.y += avatarVelocity.y * delta;

    collideWall();

    const gh = groundHeightAt(pos.x, pos.z);
    let impact = 0;
    if (pos.y <= gh) {
        impact = avatarVelocity.y;
        pos.y = gh;
        avatarVelocity.y = 0;
        grounded = true;
    } else {
        grounded = false;
    }

    // Seguridad: si algo sale mal, volver al suelo
    if (pos.y < -5) { pos.set(0, 0, -5); avatarVelocity.set(0, 0, 0); grounded = true; }

    // ------------------ ANIMACIÓN ------------------
    if (!grounded) {
        airTime += delta;
        if (!airAnim && airTime > 0.08) {
            airAnim = true;
            const jn = pick(hasWeapon ? 'RifleJump' : 'Jumping', 'Jumping');
            if (jn) {
                const dur = clips[jn].duration;
                const ts = Math.max(0.6, Math.min(2.0, dur / ((2 * CFG.jumpVelocity) / CFG.gravity)));
                play(jn, { loop: false, timeScale: ts, fade: CFG.fadeAction, restart: true });
            }
        }
    } else {
        if (!wasGrounded) {
            // Acaba de aterrizar
            airAnim = false;
            airTime = 0;
            if (impact < -3 && clips.Landing) {
                const c = clips.Landing;
                const start = c.duration * CFG.landingStart;
                play('Landing', { loop: false, restart: true, fade: 0.08, startAt: start });
                actionLock = Math.min(CFG.landingMaxLock, c.duration - start);
                lockMul = 0.6;
            }
        }

        if (actionLock <= 0 && loco.name) {
            play(loco.name, { loop: true, timeScale: loco.ts, fade: CFG.fadeLoco });
        }
    }

    // ------------------ LÍMITES DEL MAPA ------------------
    const b = CFG.bounds;
    pos.x = Math.max(b.minX, Math.min(b.maxX, pos.x));
    pos.z = Math.max(b.minZ, Math.min(b.maxZ, pos.z));
}

// ---------------------------------------------------------------------
// 11. CÁMARAS
// ---------------------------------------------------------------------
const _back = new THREE.Vector3();
const _right = new THREE.Vector3();
const _pivot = new THREE.Vector3();
const _camTarget = new THREE.Vector3();

function updateGhost(delta) {
    const speed = 15.0 * delta;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.y = 0; dir.normalize();
    const left = new THREE.Vector3(dir.z, 0, -dir.x);   // vector hacia la izquierda

    if (keys.W) camera.position.addScaledVector(dir, speed);
    if (keys.S) camera.position.addScaledVector(dir, -speed);
    if (keys.A) camera.position.addScaledVector(left, speed);
    if (keys.D) camera.position.addScaledVector(left, -speed);
    if (touchMove.x || touchMove.y) {
        camera.position.addScaledVector(dir, -touchMove.y * speed);
        camera.position.addScaledVector(left, -touchMove.x * speed);
    }
    if (keys.Space) camera.position.y += speed;
    if (keys.Shift) camera.position.y -= speed;
}

function updateThirdPersonCamera(delta) {
    const aimZoom = isAiming;
    const dist = aimZoom ? CFG.camDist * 0.6 : CFG.camDist;
    const cosP = Math.cos(camPitch), sinP = Math.sin(camPitch);

    // dirección desde el punto de mira hacia la cámara
    _back.set(Math.sin(camYaw) * cosP, -sinP, Math.cos(camYaw) * cosP);
    _right.set(Math.cos(camYaw), 0, -Math.sin(camYaw));

    _pivot.set(avatar.position.x, avatar.position.y + 1.6, avatar.position.z)
          .addScaledVector(_right, CFG.camShoulder * cameraSide);

    _camTarget.copy(_pivot).addScaledVector(_back, dist);
    _camTarget.y = Math.max(0.4, _camTarget.y);
    _camTarget.x = Math.max(-19, Math.min(19, _camTarget.x));
    _camTarget.z = Math.max(-19.5, Math.min(19, _camTarget.z));

    const k = 1 - Math.exp(-14 * delta);   // suavizado independiente del framerate
    camera.position.lerp(_camTarget, k);
    camera.lookAt(_pivot);

    // Zoom de francotirador
    const targetFov = aimZoom ? SCOPE_FOV : BASE_FOV;
    if (Math.abs(camera.fov - targetFov) > 0.05) {
        camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-12 * delta));
        camera.updateProjectionMatrix();
    }
}

// ---------------------------------------------------------------------
// 12. BUCLE PRINCIPAL
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
// 11c. MIRA: retícula dinámica y visor de francotirador
//   - Se abre cuando hay arma; se separa al moverte, saltar o disparar.
//   - Sin arma: sólo un punto. Con MIRA/clic derecho: visor con zoom.
// ---------------------------------------------------------------------
let reticleUpdate = null;

function initReticle() {
    const ch = document.getElementById('crosshair');
    const sc = document.getElementById('sniper-scope');
    if (!ch || !sc) return;

    const css = document.createElement('style');
    css.textContent = `
    #crosshair{width:0;height:0;border:0;border-radius:0;transform:none;z-index:6;--gap:10px;--c:#00ff41;transition:opacity .15s}
    #crosshair i{position:absolute;background:var(--c);box-shadow:0 0 6px var(--c);opacity:.9}
    #crosshair .h{width:9px;height:2px;top:-1px}
    #crosshair .v{width:2px;height:9px;left:-1px}
    #crosshair .l{left:calc(-1 * var(--gap) - 9px)}
    #crosshair .r{left:var(--gap)}
    #crosshair .t{top:calc(-1 * var(--gap) - 9px)}
    #crosshair .b{top:var(--gap)}
    #crosshair .dot{width:3px;height:3px;left:-1.5px;top:-1.5px;border-radius:50%}
    #crosshair.mini i:not(.dot){opacity:0}
    #sniper-scope{border:0;z-index:15;
      background:radial-gradient(circle at 50% 50%,transparent 0,transparent 30vmin,rgba(0,8,3,.55) 42vmin,rgba(0,0,0,.92) 80vmin)}
    #sniper-scope::before{content:'';position:absolute;top:50%;left:50%;width:62vmin;height:62vmin;transform:translate(-50%,-50%);
      border-radius:50%;border:1.5px solid rgba(0,255,65,.6);box-shadow:inset 0 0 40px rgba(0,255,65,.1);
      background:linear-gradient(rgba(0,255,65,.7),rgba(0,255,65,.7)) center/100% 1px no-repeat,
                 linear-gradient(rgba(0,255,65,.7),rgba(0,255,65,.7)) center/1px 100% no-repeat}
    #sniper-scope::after{content:'';position:absolute;top:50%;left:50%;width:6px;height:6px;transform:translate(-50%,-50%);
      border-radius:50%;background:#ff2a6d;box-shadow:0 0 10px #ff2a6d}`;
    document.head.appendChild(css);

    ch.innerHTML = '<i class="h l"></i><i class="h r"></i><i class="v t"></i><i class="v b"></i><i class="dot"></i>';

    let gap = 10, lastColor = '', lastShow = null;
    reticleUpdate = () => {
        const avatarMode = currentMode === 'avatar' && !isFullscreenArt;
        const scopeOn = isAiming && avatarMode;

        const disp = scopeOn ? 'block' : 'none';
        if (sc.style.display !== disp) sc.style.display = disp;

        const show = avatarMode && !scopeOn && !climb;
        if (show !== lastShow) { ch.style.opacity = show ? '1' : '0'; lastShow = show; }
        ch.classList.toggle('mini', !hasWeapon);

        const firing = isFiring && hasWeapon;
        const moving = Math.abs(touchMove.x) + Math.abs(touchMove.y) > 0.15 || keys.W || keys.A || keys.S || keys.D;
        let target = 8;
        if (moving) target += keys.Shift ? 14 : 6;
        if (!grounded) target += 10;
        if (firing) target += 10;
        if (isCrouching) target -= 3;
        gap += (target - gap) * 0.25;
        ch.style.setProperty('--gap', gap.toFixed(1) + 'px');

        const color = firing ? '#ff2a6d' : '#00ff41';
        if (color !== lastColor) { ch.style.setProperty('--c', color); lastColor = color; }
    };
}

// ---------------------------------------------------------------------
// 11b. CONTROLES TÁCTILES (estilo Free Fire)
//   Izquierda: joystick analógico · Derecha: arrastrar para mirar
//   Botones: FUEGO (arrastrá sobre él para apuntar), SALTO, AGACHAR, MIRA
//   Fila superior: CORRER, ARMA, RECARGA, USAR, pantalla completa
// ---------------------------------------------------------------------
function initTouchControls() {
    lockFallback = true;          // en el celu no hay pointer lock
    updateModeText();
    ['joystick-container', 'mobile-buttons'].forEach((id) => {
        const n = document.getElementById(id); if (n) n.remove();   // los viejos, sin lógica
    });

    const css = document.createElement('style');
    css.textContent = `
    /* --op = opacidad general de los controles (0.3 muy transparente · 1 sólido) */
    #touch-ui{--op:.55;--sr:env(safe-area-inset-right,0px);--sl:env(safe-area-inset-left,0px);--sb:env(safe-area-inset-bottom,0px);
      position:fixed;inset:0;pointer-events:none;z-index:20;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
    #touch-ui>*{pointer-events:auto;touch-action:none;opacity:var(--op);transition:opacity .12s}
    #touch-ui>*.on{opacity:1}
    #t-joy{position:absolute;left:calc(26px + var(--sl));bottom:calc(26px + var(--sb));width:130px;height:130px;border-radius:50%;
      background:rgba(0,255,65,.04);border:1.5px solid rgba(0,255,65,.45)}
    #t-knob{position:absolute;left:42px;top:42px;width:46px;height:46px;border-radius:50%;background:rgba(0,255,65,.35);
      border:1.5px solid rgba(0,255,65,.8);pointer-events:none}
    .tb{position:absolute;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;
      width:var(--s,50px);height:var(--s,50px);padding:0;border-radius:50%;border:1.5px solid rgba(0,240,255,.6);
      background:rgba(0,0,0,.12);color:#fff;font-family:sans-serif;-webkit-tap-highlight-color:transparent}
    .tb i{font-style:normal;font-size:calc(var(--s,50px)*.36);line-height:1}
    .tb b{font-size:8px;letter-spacing:.04em;line-height:1;font-weight:600;opacity:.8}
    .tb.on{background:rgba(0,240,255,.45);transform:scale(.93)}
    .tb.latched{background:rgba(0,255,65,.35);border-color:rgba(0,255,65,.95)}
    #t-fire{--s:80px;right:calc(30px + var(--sr));bottom:calc(30px + var(--sb));border-color:rgba(255,42,109,.75);background:rgba(255,42,109,.14)}
    #t-fire.on{background:rgba(255,42,109,.6)}
    #t-jump{--s:56px;right:calc(36px + var(--sr));bottom:calc(124px + var(--sb))}
    #t-crouch{--s:50px;right:calc(122px + var(--sr));bottom:calc(36px + var(--sb))}
    #t-scope{--s:50px;right:calc(116px + var(--sr));bottom:calc(104px + var(--sb))}
    .tb.sm{--s:42px;top:70px}
    #t-run{right:calc(12px + var(--sr))} #t-gun{right:calc(62px + var(--sr))} #t-rel{right:calc(112px + var(--sr))}
    #t-use{right:calc(162px + var(--sr))} #t-fs{right:calc(212px + var(--sr))}`;
    document.head.appendChild(css);

    const ui = document.createElement('div');
    ui.id = 'touch-ui';
    ui.innerHTML = `
      <div id="t-joy"><div id="t-knob"></div></div>
      <button class="tb" id="t-fire" aria-label="Disparar"><i>💥</i><b>FUEGO</b></button>
      <button class="tb" id="t-jump" aria-label="Saltar"><i>⬆️</i><b>SALTO</b></button>
      <button class="tb" id="t-crouch" aria-label="Agacharse"><i>⬇️</i><b>AGACHAR</b></button>
      <button class="tb" id="t-scope" aria-label="Mira"><i>🎯</i><b>MIRA</b></button>
      <button class="tb sm" id="t-run" aria-label="Correr"><i>⚡</i><b>CORRER</b></button>
      <button class="tb sm" id="t-gun" aria-label="Arma"><i>🔫</i><b>ARMA</b></button>
      <button class="tb sm" id="t-rel" aria-label="Recargar"><i>🔄</i><b>RECARGA</b></button>
      <button class="tb sm" id="t-use" aria-label="Usar"><i>✋</i><b>USAR</b></button>
      <button class="tb sm" id="t-fs" aria-label="Pantalla completa"><i>⛶</i><b>PANT.</b></button>`;
    document.body.appendChild(ui);
    const $ = (id) => document.getElementById(id);

    // --- Teclas virtuales: reutilizan toda la lógica del teclado ---
    const key = (code, type) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true }));
    const tapKey = (code) => { key(code, 'keydown'); key(code, 'keyup'); };

    // --- Helper de botón con "mantener" y arrastre opcional ---
    function hold(el, down, up, move) {
        let id = null, lx = 0, ly = 0;
        el.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            id = e.pointerId; lx = e.clientX; ly = e.clientY;
            try { el.setPointerCapture(id); } catch (_) {}
            el.classList.add('on');
            if (navigator.vibrate) navigator.vibrate(8);
            if (down) down();
        });
        el.addEventListener('pointermove', (e) => {
            if (e.pointerId !== id || !move) return;
            move(e.clientX - lx, e.clientY - ly);
            lx = e.clientX; ly = e.clientY;
        });
        const end = (e) => {
            if (e.pointerId !== id) return;
            id = null; el.classList.remove('on');
            if (up) up();
        };
        el.addEventListener('pointerup', end);
        el.addEventListener('pointercancel', end);
    }

    // --- Joystick analógico ---
    const joy = $('t-joy'), knob = $('t-knob');
    const JR = 46;
    let jid = null, jcx = 0, jcy = 0;
    function joyUpdate(e) {
        let dx = e.clientX - jcx, dy = e.clientY - jcy;
        const d = Math.hypot(dx, dy);
        if (d > JR) { dx = dx / d * JR; dy = dy / d * JR; }
        knob.style.transform = `translate(${dx}px,${dy}px)`;
        touchMove.x = dx / JR;
        touchMove.y = dy / JR;
    }
    joy.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        jid = e.pointerId;
        joy.classList.add('on');
        try { joy.setPointerCapture(jid); } catch (_) {}
        const r = joy.getBoundingClientRect();
        jcx = r.left + r.width / 2; jcy = r.top + r.height / 2;
        joyUpdate(e);
    });
    joy.addEventListener('pointermove', (e) => { if (e.pointerId === jid) joyUpdate(e); });
    const joyEnd = (e) => {
        if (e.pointerId !== jid) return;
        jid = null; knob.style.transform = ''; joy.classList.remove('on');
        touchMove.x = touchMove.y = 0;
    };
    joy.addEventListener('pointerup', joyEnd);
    joy.addEventListener('pointercancel', joyEnd);

    // --- Mirar: arrastrar el dedo por cualquier parte libre de la pantalla ---
    const LOOK_MUL = 1.3;
    const cv = renderer.domElement;
    cv.style.touchAction = 'none';
    const looks = new Map();
    cv.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse') return;
        e.preventDefault();
        try { cv.setPointerCapture(e.pointerId); } catch (_) {}
        looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    cv.addEventListener('pointermove', (e) => {
        const l = looks.get(e.pointerId);
        if (!l) return;
        applyLook((e.clientX - l.x) * LOOK_MUL, (e.clientY - l.y) * LOOK_MUL);
        l.x = e.clientX; l.y = e.clientY;
    });
    const lookEnd = (e) => looks.delete(e.pointerId);
    cv.addEventListener('pointerup', lookEnd);
    cv.addEventListener('pointercancel', lookEnd);

    // --- Botones ---
    hold($('t-fire'), () => {
        if (isFullscreenArt || currentMode !== 'avatar' || climb) return;
        if (!hasWeapon) { showToast('Equipa el rifle con el botón ARMA'); return; }
        isFiring = true;
    }, () => { isFiring = false; },
    (dx, dy) => applyLook(dx * LOOK_MUL, dy * LOOK_MUL));           // arrastrar sobre FUEGO = apuntar

    hold($('t-jump'), () => key('Space', 'keydown'), () => key('Space', 'keyup'));
    hold($('t-crouch'), () => tapKey('KeyC'));
    hold($('t-scope'), () => { if (currentMode === 'avatar' && !isFullscreenArt) isAiming = !isAiming; });
    hold($('t-run'), () => key('ShiftLeft', keys.Shift ? 'keyup' : 'keydown'));
    hold($('t-gun'), () => tapKey('KeyG'));
    hold($('t-rel'), () => tapKey('KeyR'));
    hold($('t-use'), () => tapKey('KeyE'));
    hold($('t-fs'), () => {
        const el = document.documentElement;
        if (!document.fullscreenElement && el.requestFullscreen) {
            el.requestFullscreen().then(() => {
                if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
            }).catch(() => showToast('Tu navegador no permite pantalla completa'));
        } else if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    });

    // Estado visual de los botones tipo interruptor
    touchSync = () => {
        $('t-crouch').classList.toggle('latched', isCrouching);
        $('t-gun').classList.toggle('latched', hasWeapon);
        $('t-run').classList.toggle('latched', keys.Shift);
        $('t-scope').classList.toggle('latched', isAiming);
    };

    // Aviso si está en vertical
    const orientHint = () => {
        if (matchMedia('(orientation: portrait)').matches) showToast('Girá el celular en horizontal para jugar mejor');
    };
    orientHint();
    window.addEventListener('orientationchange', orientHint);
}

initReticle();
if (isTouch) initTouchControls();
construirEscena();
cargarAvatar();

const clock = new THREE.Clock();
let lastVideoTime = -1;

function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.05);   // evita saltos si la pestaña estuvo en segundo plano

    if (currentMode === 'ghost') {
        updateGhost(delta);
    } else if (avatar && mixer) {
        updateAvatar(delta);
        updateThirdPersonCamera(delta);
    }

    if (video && video.readyState >= video.HAVE_CURRENT_DATA && video.currentTime !== lastVideoTime) {
        videoTexture.needsUpdate = true;
        lastVideoTime = video.currentTime;
    }

    if (mixer) mixer.update(delta);
    if (touchSync) touchSync();
    if (reticleUpdate) reticleUpdate();

    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});