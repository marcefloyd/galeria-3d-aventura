// --- NÚCLEO PRINCIPAL (MAIN) ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);
scene.fog = new THREE.FogExp2(0x1a1a1a, 0.02);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 3, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

let currentMode = 'avatar'; 

function switchMode(mode) {
    currentMode = mode;
    document.getElementById('btn-ghost').classList.remove('active-btn');
    document.getElementById('btn-avatar').classList.remove('active-btn');
    if (mode === 'ghost') {
        document.getElementById('btn-ghost').classList.add('active-btn');
        document.getElementById('mode-text').innerText = 'Modo actual: Cámara Libre (Fantasma)';
        camera.position.set(0, 3, 5);
        camera.rotation.set(0, 0, 0);
    } else {
        document.getElementById('btn-avatar').classList.add('active-btn');
        document.getElementById('mode-text').innerText = 'Modo actual: Avatar';
    }
}

// Iluminación
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const mainLight = new THREE.DirectionalLight(0xfffaed, 0.8);
mainLight.position.set(5, 10, 5);
mainLight.castShadow = true;
scene.add(mainLight);

// Inicializar componentes
construirEscena(scene);
cargarAvatar(scene);

const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (currentMode === 'ghost') {
        actualizarCamaraLibre(delta, keys, camera);
    } else {
        actualizarAvatar(delta, keys, camera, currentMode);
    }

    actualizarVideo();
    if (typeof avatarMixer !== 'undefined' && avatarMixer) {
        avatarMixer.update(delta);
    }

    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});