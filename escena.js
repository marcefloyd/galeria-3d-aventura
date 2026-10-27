// --- CONSTRUCCIÓN DEL ENTORNO Y CUADRO 2D ---
let videoScreen, video, videoTexture;
let isFullscreenArt = false;
let fullscreenOverlay;

function construirEscena(scene) {
    // Suelo
    const floorGeo = new THREE.PlaneGeometry(40, 40);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.8 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Pared trasera
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x3d3d3d, roughness: 0.9 });
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(40, 15), wallMat);
    backWall.position.set(0, 7.5, -20);
    scene.add(backWall);

    // Marco del cuadro 9:16
    const frameGeo = new THREE.BoxGeometry(3.4, 5.8, 0.1);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.set(0, 5.0, -19.9);
    scene.add(frame);

    // Video
    video = document.createElement('video');
    video.src = 'pers/videomuseoweb.mp4';
    video.crossOrigin = 'anonymous'; video.loop = true; video.muted = true; video.playsInline = true; video.play();

    videoTexture = new THREE.VideoTexture(video);
    videoTexture.minFilter = THREE.LinearFilter;
    videoTexture.magFilter = THREE.LinearFilter;
    videoTexture.generateMipmaps = false;

    const videoCanvasGeo = new THREE.PlaneGeometry(3.2, 5.6);
    const videoCanvasMat = new THREE.MeshBasicMaterial({ map: videoTexture });
    videoScreen = new THREE.Mesh(videoCanvasGeo, videoCanvasMat);
    videoScreen.position.set(0, 5.0, -19.85);
    scene.add(videoScreen);

    // Crear overlay de pantalla completa para cuando apretes la E
    fullscreenOverlay = document.createElement('div');
    fullscreenOverlay.style.position = 'fixed'; fullscreenOverlay.style.top = '0'; fullscreenOverlay.style.left = '0';
    fullscreenOverlay.style.width = '100vw'; fullscreenOverlay.style.height = '100vh';
    fullscreenOverlay.style.backgroundColor = 'rgba(0,0,0,0.95)'; fullscreenOverlay.style.display = 'flex';
    fullscreenOverlay.style.justifyContent = 'center'; fullscreenOverlay.style.alignItems = 'center';
    fullscreenOverlay.style.zIndex = '1000'; fullscreenOverlay.style.opacity = '0'; fullscreenOverlay.style.pointerEvents = 'none';
    fullscreenOverlay.style.transition = 'opacity 0.3s ease';

    const fsVideo = document.createElement('video');
    fsVideo.src = 'pers/videomuseoweb.mp4';
    fsVideo.id = 'fs-video';
    fsVideo.loop = true; fsVideo.muted = false; fsVideo.controls = true;
    fsVideo.style.maxWidth = '90vw'; fsVideo.style.maxHeight = '90vh';
    fullscreenOverlay.appendChild(fsVideo);
    document.body.appendChild(fullscreenOverlay);
}

// Tecla E para interactuar (Abrir el cuadro en grande si estás cerca)
function triggerInteract() {
    if (avatar) {
        const distanciaAlCuadro = avatar.position.distanceTo(new THREE.Vector3(0, avatar.position.y, -19.85));
        if (distanciaAlCuadro < 6.0) { // Si estás cerca del cuadro
            toggleFullscreenArt();
        }
    }
}

function toggleFullscreenArt() {
    isFullscreenArt = !isFullscreenArt;
    const fsVideo = document.getElementById('fs-video');
    if (isFullscreenArt) {
        fullscreenOverlay.style.opacity = '1';
        fullscreenOverlay.style.pointerEvents = 'auto';
        fsVideo.currentTime = video.currentTime;
        fsVideo.play();
        if (document.exitPointerLock) document.exitPointerLock();
    } else {
        fullscreenOverlay.style.opacity = '0';
        fullscreenOverlay.style.pointerEvents = 'none';
        fsVideo.pause();
    }
}

// Cerrar con Escape
window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && isFullscreenArt) {
        toggleFullscreenArt();
    }
});

let lastVideoTime = -1;
function actualizarVideo() {
    if (video && video.readyState >= video.HAVE_CURRENT_DATA) {
        if (video.currentTime !== lastVideoTime) {
            videoTexture.needsUpdate = true;
            lastVideoTime = video.currentTime;
        }
    }
}