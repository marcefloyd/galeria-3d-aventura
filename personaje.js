// --- AVATAR Y CÁMARA LIBRE CORREGIDOS ---
let avatar = null;
let avatarMixer = null;
let avatarVelocity = new THREE.Vector3(0, 0, 0);
let cameraAngleY = 0;
let cameraAngleX = 0; // Para el movimiento vertical de la cámara en modo avatar
let cameraSide = 1; 

let ghostEuler = new THREE.Euler(0, 0, 0, 'YXZ');

const fbxLoader = new THREE.FBXLoader();

function cargarAvatar(scene) {
    fbxLoader.load('pers/James.fbx', function (charObject) {
        avatar = charObject;
        avatar.scale.set(0.01, 0.01, 0.01);
        avatar.position.set(0, 0, -5);

        avatar.traverse(function (child) {
            if (child.isMesh) { 
                child.castShadow = true; 
                child.receiveShadow = true; 
            }
        });

        scene.add(avatar);

        fbxLoader.load('pers/Pointing.fbx', function (animObject) {
            avatarMixer = new THREE.AnimationMixer(avatar);
            if (animObject.animations && animObject.animations.length > 0) {
                avatarMixer.clipAction(animObject.animations[0]).play();
            }
        });
    }, undefined, (error) => {
        console.error('Error al cargar el avatar:', error);
    });
}

function triggerJump() {
    if (avatar && avatarVelocity.y === 0) {
        avatarVelocity.y = 8.0; 
    }
}

function toggleCameraShoulder() {
    cameraSide = cameraSide === 1 ? -1 : 1;
}

function actualizarCamaraLibre(delta, keys, camera) {
    const speed = 15.0 * delta;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir); 
    dir.y = 0; 
    dir.normalize();
    
    // CORREGIDO: Invertimos el orden del vector lateral para que A sea izquierda y D derecha de verdad
    const sideDir = new THREE.Vector3(dir.z, 0, -dir.x);

    if (keys.W) camera.position.addScaledVector(dir, speed);
    if (keys.S) camera.position.addScaledVector(dir, -speed);
    if (keys.A) camera.position.addScaledVector(sideDir, speed);
    if (keys.D) camera.position.addScaledVector(sideDir, -speed);
    if (keys.Space) camera.position.y += speed;
    if (keys.Shift) camera.position.y -= speed;

    if (typeof window.mouseDeltaX !== 'undefined' && (window.mouseDeltaX !== 0 || window.mouseDeltaY !== 0)) {
        ghostEuler.y -= window.mouseDeltaX * 0.003;
        ghostEuler.x -= window.mouseDeltaY * 0.003;
        ghostEuler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, ghostEuler.x));
        camera.quaternion.setFromEuler(ghostEuler);
        
        window.mouseDeltaX = 0;
        window.mouseDeltaY = 0;
    }
}

function actualizarAvatar(delta, keys, camera, currentMode) {
    if (!avatar) return;

    if (currentMode === 'avatar') {
        const baseSpeed = keys.Shift ? 8.0 : 4.0;
        const speed = baseSpeed * delta;
        const moveDir = new THREE.Vector3(0, 0, 0);

        if (keys.W) moveDir.z -= 1;
        if (keys.S) moveDir.z += 1;
        if (keys.A) moveDir.x -= 1;
        if (keys.D) moveDir.x += 1;

        if (moveDir.length() > 0) {
            moveDir.normalize();
            moveDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraAngleY);
            avatar.position.addScaledVector(moveDir, speed);
            avatar.rotation.y = Math.atan2(moveDir.x, moveDir.z);
        }

        // Límites del mapa
        const limiteX = 14;
        const limiteZMin = -18;
        const limiteZMax = 5;

        avatar.position.x = Math.max(-limiteX, Math.min(limiteX, avatar.position.x));
        avatar.position.z = Math.max(limiteZMin, Math.min(limiteZMax, avatar.position.z));

        // Gravedad y suelo
        avatarVelocity.y -= 20.0 * delta;
        avatar.position.y += avatarVelocity.y * delta;
        if (avatar.position.y <= 0) {
            avatar.position.y = 0;
            avatarVelocity.y = 0;
        }

        // CORREGIDO: Movimiento de cámara horizontal Y vertical habilitado en modo aventura
        if (typeof window.mouseDeltaX !== 'undefined' && (window.mouseDeltaX !== 0 || window.mouseDeltaY !== 0)) {
            cameraAngleY -= window.mouseDeltaX * 0.005;
            cameraAngleX -= window.mouseDeltaY * 0.005;
            // Limitar la inclinación vertical para que no se dé vuelta la cámara
            cameraAngleX = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, cameraAngleX));
            
            window.mouseDeltaX = 0;
            window.mouseDeltaY = 0;
        }

        // Posición de la cámara en 3ª persona considerando la altura vertical (cameraAngleX)
        const camDist = 4;
        const targetX = avatar.position.x + Math.sin(cameraAngleY) * camDist * cameraSide;
        const targetZ = avatar.position.z + Math.cos(cameraAngleY) * camDist * cameraSide;
        const targetY = avatar.position.y + 2.5 + Math.sin(cameraAngleX) * camDist;

        camera.position.x += (targetX - camera.position.x) * 0.2;
        camera.position.z += (targetZ - camera.position.z) * 0.2;
        camera.position.y += (targetY - camera.position.y) * 0.2;

        camera.lookAt(avatar.position.x, avatar.position.y + 1.5, avatar.position.z);
    }
}