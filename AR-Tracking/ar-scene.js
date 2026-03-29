let arScene = null;
let arCamera = null;
let arRenderer = null;
let videoElement = null;
let videoTexture = null;
let trackingActive = false;
let currentObjectType = 1;
let markerDetected = false;

// One arObject per marker (up to 3)
let arObjects = [null, null, null];

// Smoothing variables per marker
let smoothedPositions = [
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 }
];
let isPositionInitialized = [false, false, false];

const SMOOTHING_FACTOR = 0.1;
const MIN_MOVEMENT_THRESHOLD = 0.05;

// Model cache
let loadedModels = {};

const objectColors = [0xff0000, 0x00ff00, 0x0000ff];
const MARKER_MATCH_THRESHOLD = 50;

// Model paths — index 0 = marker 1, index 1 = marker 2, index 2 = marker 3
const modelPaths = {
    0: 'models/model1/scene.gltf',
    1: 'models/model2/scene.gltf',
    2: 'models/model3/scene.gltf'
};

function initializeARScene() {
    try {
        updateStatus(" Initializing AR scene...");
        
        const container = document.getElementById('arContainer');
        container.innerHTML = '';
        
        videoElement = document.createElement('video');
        videoElement.width = 640;
        videoElement.height = 480;
        videoElement.autoplay = true;
        videoElement.playsInline = true;
        videoElement.style.display = 'none';
        document.body.appendChild(videoElement);
        
        setupWebcam().then(async () => {
            arScene = new THREE.Scene();
            
            arCamera = new THREE.PerspectiveCamera(75, 640 / 480, 0.1, 1000);
            arCamera.position.z = 5;
            
            arRenderer = new THREE.WebGLRenderer({ alpha: false, antialias: true });
            arRenderer.setSize(640, 480);
            arRenderer.setPixelRatio(window.devicePixelRatio);
            container.appendChild(arRenderer.domElement);
            
            createVideoBackground();
            addLights();
            
            // Pre-load all 3 models and hide them initially
            for (let i = 0; i < 3; i++) {
                await create3DObject(i);
            }
            
            trackingActive = true;
            animateAR();
            
            updateStatus(" AR active! Show your PRINTED marker to webcam");
            
        }).catch(error => {
            console.error(" Webcam setup failed:", error);
            updateStatus(" Cannot access webcam. Allow camera permissions!");
        });
        
    } catch (error) {
        console.error(" AR initialization error:", error);
        updateStatus(" AR failed: " + error.message);
    }
}

function createVideoBackground() {
    videoTexture = new THREE.VideoTexture(videoElement);
    videoTexture.minFilter = THREE.LinearFilter;
    videoTexture.magFilter = THREE.LinearFilter;
    videoTexture.format = THREE.RGBFormat;
    
    const videoGeometry = new THREE.PlaneGeometry(16, 12);
    const videoMaterial = new THREE.MeshBasicMaterial({ 
        map: videoTexture,
        side: THREE.DoubleSide
    });
    
    const videoPlane = new THREE.Mesh(videoGeometry, videoMaterial);
    videoPlane.position.z = -5;
    videoPlane.name = 'videoBackground';
    
    arScene.add(videoPlane);
}

async function setupWebcam() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: 'user'
            },
            audio: false
        });
        
        videoElement.srcObject = stream;
        
        await new Promise((resolve) => {
            videoElement.onloadedmetadata = () => {
                videoElement.play();
                console.log(" Webcam ready");
                resolve();
            };
        });
        
    } catch (error) {
        console.error(" Webcam error:", error);
        throw error;
    }
}

function addLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    arScene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(5, 10, 7);
    arScene.add(directionalLight);
    
    const light2 = new THREE.DirectionalLight(0xffffff, 0.5);
    light2.position.set(-5, 5, -5);
    arScene.add(light2);
    
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    arScene.add(hemiLight);
}

/**
 * Creates and registers the 3D object for a given marker index (0-based).
 * Stores the result in arObjects[markerIndex].
 */
async function create3DObject(markerIndex) {
    // Remove existing object for this marker slot
    if (arObjects[markerIndex]) {
        arScene.remove(arObjects[markerIndex]);
        arObjects[markerIndex].traverse((child) => {
            if (child.isMesh) {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => mat.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            }
        });
        arObjects[markerIndex] = null;
    }
    
    try {
        updateStatus(` Loading model for marker ${markerIndex + 1}...`);
        
        const modelPath = modelPaths[markerIndex];
        
        // Return from cache if available
        if (loadedModels[markerIndex]) {
            arObjects[markerIndex] = loadedModels[markerIndex].clone();
            setupModel(arObjects[markerIndex], markerIndex);
            updateStatus(` Model ${markerIndex + 1} loaded (from cache)`);
            return;
        }
        
        const loader = new THREE.GLTFLoader();
        
        const gltf = await new Promise((resolve, reject) => {
            loader.load(
                modelPath,
                resolve,
                (progress) => {
                    const percent = (progress.loaded / progress.total * 100).toFixed(0);
                    updateStatus(` Loading model ${markerIndex + 1}: ${percent}%`);
                },
                reject
            );
        });
        
        arObjects[markerIndex] = gltf.scene;
        loadedModels[markerIndex] = arObjects[markerIndex].clone();
        
        setupModel(arObjects[markerIndex], markerIndex);
        updateStatus(` Model ${markerIndex + 1} loaded successfully!`);
        
    } catch (error) {
        console.error(`Model ${markerIndex + 1} loading error:`, error);
        updateStatus(` Failed to load model ${markerIndex + 1}: ${error.message}`);
        
        // Fallback cube with unique color per marker
        const geometry = new THREE.BoxGeometry(1.5, 1.5, 1.5);
        const material = new THREE.MeshPhongMaterial({ color: objectColors[markerIndex] });
        arObjects[markerIndex] = new THREE.Mesh(geometry, material);
        arObjects[markerIndex].position.y = 0.5;
        arObjects[markerIndex].visible = false;
        arScene.add(arObjects[markerIndex]);
    }
}

function setupModel(model, markerIndex) {
    model.name = `arObject_${markerIndex}`;
    model.visible = false; // Hidden until its marker is detected
    
    model.scale.set(100, 100, 100);
    
    // Center the model
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.x = -center.x;
    model.position.y = -center.y + 0.5;
    model.position.z = -center.z;
    
    model.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            
            if (child.material) {
                child.material.side = THREE.DoubleSide;
                child.material.needsUpdate = true;
                
                if (child.material.map) {
                    child.material.map.needsUpdate = true;
                }
                
                if (!child.material.isMeshStandardMaterial) {
                    child.material = new THREE.MeshStandardMaterial({
                        color: child.material.color || 0xffffff,
                        map: child.material.map || null,
                        roughness: 0.5,
                        metalness: 0.3,
                        side: THREE.DoubleSide
                    });
                }
            }
        }
    });
    
    arScene.add(model);
    console.log(` Model ${markerIndex + 1} setup complete`);
}

function animateAR() {
    if (!trackingActive) return;
    
    requestAnimationFrame(animateAR);
    
    detectMarker();
    
    if (videoTexture) {
        videoTexture.needsUpdate = true;
    }
    
    arRenderer.render(arScene, arCamera);
}

/**
 * Detects all registered markers each frame.
 * Each marker[i] controls arObjects[i] independently.
 */
function detectMarker() {
    if (!videoElement || videoElement.readyState !== videoElement.HAVE_ENOUGH_DATA) return;
    if (!window.trackingDataList || window.trackingDataList.length === 0) return;

    try {
        const canvas = document.createElement('canvas');
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoElement, 0, 0);

        const frame = cv.imread(canvas);
        const frameGray = new cv.Mat();
        cv.cvtColor(frame, frameGray, cv.COLOR_RGBA2GRAY, 0);

        const orb = new cv.ORB();
        const frameKeypoints = new cv.KeyPointVector();
        const frameDescriptors = new cv.Mat();
        const mask = new cv.Mat();
        orb.detectAndCompute(frameGray, mask, frameKeypoints, frameDescriptors);
        mask.delete();

        // Process each registered marker independently
        for (let markerIndex = 0; markerIndex < window.trackingDataList.length; markerIndex++) {
            const marker = window.trackingDataList[markerIndex];
            const arObject = arObjects[markerIndex];

            // Skip if model not loaded yet for this slot
            if (!arObject) continue;

            if (marker.descriptors.empty() || frameDescriptors.empty()) {
                arObject.visible = false;
                isPositionInitialized[markerIndex] = false;
                continue;
            }

            const matcher = new cv.BFMatcher(cv.NORM_HAMMING, false);
            const matches = new cv.DMatchVectorVector();
            matcher.knnMatch(marker.descriptors, frameDescriptors, matches, 2);

            let goodMatches = [];
            for (let i = 0; i < matches.size(); i++) {
                try {
                    const matchVec = matches.get(i);
                    if (!matchVec || matchVec.size() < 2) continue;
                    
                    const m = matchVec.get(0);
                    const n = matchVec.get(1);
                    
                    if (m && n && typeof m.distance === 'number' && typeof n.distance === 'number') {
                        if (m.distance < 0.75 * n.distance) {
                            goodMatches.push(m);
                        }
                    }
                } catch (e) {
                    continue;
                }
            }

            let detectedThisMarker = false;

            if (goodMatches.length > MARKER_MATCH_THRESHOLD) {
                let srcPts = [];
                let dstPts = [];
                for (let m of goodMatches) {
                    const kp = marker.keypoints.get(m.queryIdx).pt;
                    srcPts.push(kp.x, kp.y);

                    const fp = frameKeypoints.get(m.trainIdx).pt;
                    dstPts.push(fp.x, fp.y);
                }

                if (srcPts.length >= 4) {
                    const srcMat = cv.matFromArray(srcPts.length / 2, 1, cv.CV_32FC2, srcPts);
                    const dstMat = cv.matFromArray(dstPts.length / 2, 1, cv.CV_32FC2, dstPts);
                    const H = cv.findHomography(srcMat, dstMat, cv.RANSAC, 5.0);

                    if (H && !H.empty()) {
                        let corners = cv.matFromArray(4, 1, cv.CV_32FC2, [
                            0, 0,
                            marker.imageWidth, 0,
                            marker.imageWidth, marker.imageHeight,
                            0, marker.imageHeight
                        ]);
                        let transformedCorners = new cv.Mat();
                        cv.perspectiveTransform(corners, transformedCorners, H);

                        const data = transformedCorners.data32F;
                        const centerX = (data[0] + data[2] + data[4] + data[6]) / 4;
                        const centerY = (data[1] + data[3] + data[5] + data[7]) / 4;

                        const x = (centerX / videoElement.videoWidth - 0.5) * 16;
                        const y = -(centerY / videoElement.videoHeight - 0.5) * 12;

                        // Apply per-marker smoothing
                        if (!isPositionInitialized[markerIndex]) {
                            smoothedPositions[markerIndex].x = x;
                            smoothedPositions[markerIndex].y = y;
                            smoothedPositions[markerIndex].z = 0;
                            isPositionInitialized[markerIndex] = true;
                        } else {
                            const deltaX = x - smoothedPositions[markerIndex].x;
                            const deltaY = y - smoothedPositions[markerIndex].y;
                            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
                            
                            if (distance > MIN_MOVEMENT_THRESHOLD) {
                                smoothedPositions[markerIndex].x += (x - smoothedPositions[markerIndex].x) * SMOOTHING_FACTOR;
                                smoothedPositions[markerIndex].y += (y - smoothedPositions[markerIndex].y) * SMOOTHING_FACTOR;
                                smoothedPositions[markerIndex].z += (0 - smoothedPositions[markerIndex].z) * SMOOTHING_FACTOR;
                            }
                        }
                        
                        arObject.position.set(
                            smoothedPositions[markerIndex].x,
                            smoothedPositions[markerIndex].y,
                            smoothedPositions[markerIndex].z
                        );
                        arObject.visible = true;
                        detectedThisMarker = true;

                        transformedCorners.delete();
                        corners.delete();
                        H.delete();
                    }

                    srcMat.delete();
                    dstMat.delete();
                }
            }

            // Hide this marker's model if not detected this frame
            if (!detectedThisMarker) {
                arObject.visible = false;
                isPositionInitialized[markerIndex] = false;
            }

            matcher.delete();
            matches.delete();
        }

        orb.delete();
        frameKeypoints.delete();
        frameDescriptors.delete();
        frameGray.delete();
        frame.delete();
        
        if (canvas.parentNode) {
            canvas.parentNode.removeChild(canvas);
        }

    } catch (error) {
        console.error(" Marker detection error:", {
            message: error.message,
            stack: error.stack,
            videoReady: videoElement?.readyState,
            trackingDataCount: window.trackingDataList?.length,
        });
        arObjects.forEach(obj => { if (obj) obj.visible = false; });
    }
}

async function switch3DObject(index) {
    // index is 1-based from UI; convert to 0-based
    currentObjectType = index;
    const markerIndex = index - 1;
    await create3DObject(markerIndex);
    const names = ['Model 1', 'Model 2', 'Model 3'];
    updateStatus(` Reloaded: ${names[markerIndex]}`);
}

function stopARScene() {
    trackingActive = false;
    
    if (videoElement && videoElement.srcObject) {
        const tracks = videoElement.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        if (videoElement.parentNode) {
            videoElement.parentNode.removeChild(videoElement);
        }
    }
    
    if (videoTexture) {
        videoTexture.dispose();
    }
    
    if (arRenderer) {
        arRenderer.dispose();
        const canvas = arRenderer.domElement;
        if (canvas && canvas.parentNode) {
            canvas.parentNode.removeChild(canvas);
        }
    }
    
    if (arScene) {
        arScene.traverse(object => {
            if (object.geometry) object.geometry.dispose();
            if (object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach(mat => mat.dispose());
                } else {
                    object.material.dispose();
                }
            }
        });
    }
    
    arScene = null;
    arCamera = null;
    arRenderer = null;
    videoElement = null;
    videoTexture = null;
    arObjects = [null, null, null];
    loadedModels = {};
    isPositionInitialized = [false, false, false];
    
    console.log(" AR stopped");
    updateStatus(" AR stopped");
}