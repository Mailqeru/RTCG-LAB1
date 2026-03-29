

let arScene = null;
let arCamera = null;
let arRenderer = null;
let videoElement = null;
let videoTexture = null;
let trackingActive = false;
let currentObjectType = 1;
let markerDetected = false;
let arObject = null;

// Smoothing variables for stable tracking
let smoothedPosition = { x: 0, y: 0, z: 0 };
let isPositionInitialized = false;
const SMOOTHING_FACTOR = 0.1; // Lower = smoother 
const MIN_MOVEMENT_THRESHOLD = 0.05; // Minimum movement to update

// Model cache
let loadedModels = {};

const objectColors = [0xff0000, 0x00ff00, 0x0000ff];
const MARKER_MATCH_THRESHOLD = 90;

function initializeARScene() {
    try {
        updateStatus(" Initializing AR scene...");
        
        const container = document.getElementById('arContainer');
        container.innerHTML = '';
        
        // Create webcam video element
        videoElement = document.createElement('video');
        videoElement.width = 640;
        videoElement.height = 480;
        videoElement.autoplay = true;
        videoElement.playsInline = true;
        videoElement.style.display = 'none';
        document.body.appendChild(videoElement);
        
        setupWebcam().then(() => {
            
            // Create Three.js scene
            arScene = new THREE.Scene();
            
            // Create camera
            arCamera = new THREE.PerspectiveCamera(75, 640 / 480, 0.1, 1000);
            arCamera.position.z = 5;
            
            // Create renderer
            arRenderer = new THREE.WebGLRenderer({ alpha: false, antialias: true });
            arRenderer.setSize(640, 480);
            arRenderer.setPixelRatio(window.devicePixelRatio);
            container.appendChild(arRenderer.domElement);
            
            // Create video background
            createVideoBackground();
            
            // Add lights
            addLights();
            
            // Create 3D object but HIDE it initially
            create3DObject(currentObjectType);
            if (arObject) {
                arObject.visible = false;
            }
            
            // Start tracking loop
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
    // Ambient light (general illumination)
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    arScene.add(ambientLight);
    
    // Directional light (sun-like)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(5, 10, 7);
    arScene.add(directionalLight);
    
    // Second light from opposite side
    const light2 = new THREE.DirectionalLight(0xffffff, 0.5);
    light2.position.set(-5, 5, -5);
    arScene.add(light2);
    
    // Hemisphere light for better color
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    arScene.add(hemiLight);
}

async function create3DObject(type) {
    // Remove existing object
    if (arObject) {
        arScene.remove(arObject);
        arObject.traverse((child) => {
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
        arObject = null;
    }
    
    try {
        updateStatus(` Loading model ${type}...`);
        
        // Define model paths
        const modelPaths = {
            1: 'models/model1/scene.gltf',
            2: 'models/model2/scene.gltf',
            3: 'models/model3/scene.gltf'
        };
        
        const modelPath = modelPaths[type];
        
        // Check if model is already loaded (cache)
        if (loadedModels[type]) {
            arObject = loadedModels[type].clone();
            setupModel(arObject);
            updateStatus(` Model ${type} loaded (from cache)`);
            return;
        }
        
        // Load the model
        const loader = new THREE.GLTFLoader();
        
        const gltf = await new Promise((resolve, reject) => {
            loader.load(
                modelPath,
                resolve,
                (progress) => {
                    const percent = (progress.loaded / progress.total * 100).toFixed(0);
                    updateStatus(` Loading: ${percent}%`);
                },
                reject
            );
        });
        
        arObject = gltf.scene;
        
        // Cache the loaded model
        loadedModels[type] = arObject.clone();
        
        setupModel(arObject);
        updateStatus(` Model ${type} loaded successfully!`);
        
    } catch (error) {
        console.error("Model loading error:", error);
        updateStatus(" Failed to load model: " + error.message);
        
        // Fallback to colored cube if model fails
        const geometry = new THREE.BoxGeometry(1.5, 1.5, 1.5);
        const material = new THREE.MeshPhongMaterial({ color: 0xff0000 });
        arObject = new THREE.Mesh(geometry, material);
        arObject.position.y = 0.5;
        arScene.add(arObject);
    }
}

function setupModel(model) {
    model.name = 'arObject';
    model.visible = false; // Start hidden
    
    // Make model BIGGER (change 3 to your desired size)
    model.position.set(0, 0.5, 0);
    model.scale.set(100, 100, 100); // 
    
    // Center the model
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.x = -center.x;
    model.position.y = -center.y + 0.5;
    model.position.z = -center.z;
    
    // Fix materials and ensure colors/textures show
    model.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            
            if (child.material) {
                // Ensure material is visible from both sides
                child.material.side = THREE.DoubleSide;
                child.material.needsUpdate = true;
                
                // Enable texture if exists
                if (child.material.map) {
                    child.material.map.needsUpdate = true;
                }
                
                // Convert to StandardMaterial for better lighting
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
    console.log(" Model setup complete");
}

// Main AR animation loop
function animateAR() {
    if (!trackingActive) return;
    
    requestAnimationFrame(animateAR);
    
    // Check if marker is visible
    detectMarker();
    
    
    
    if (videoTexture) {
        videoTexture.needsUpdate = true;
    }
    
    arRenderer.render(arScene, arCamera);
}

// REAL MARKER DETECTION using OpenCV.js - WITH SMOOTHING
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

        let detected = false;
        for (let marker of window.trackingDataList) {
            if (marker.descriptors.empty() || frameDescriptors.empty()) {
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

            if (goodMatches.length > MARKER_MATCH_THRESHOLD) {
                detected = true;

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

                        // Map video coords to Three.js coords
                        const x = (centerX / videoElement.videoWidth - 0.5) * 16;
                        const y = -(centerY / videoElement.videoHeight - 0.5) * 12;

                        if (arObject) {
                            
                            if (!isPositionInitialized) {
                                smoothedPosition.x = x;
                                smoothedPosition.y = y;
                                smoothedPosition.z = 0;
                                isPositionInitialized = true;
                            } else {
                                // Only update if moved enough
                                const deltaX = x - smoothedPosition.x;
                                const deltaY = y - smoothedPosition.y;
                                const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
                                
                                if (distance > MIN_MOVEMENT_THRESHOLD) {
                                    smoothedPosition.x += (x - smoothedPosition.x) * SMOOTHING_FACTOR;
                                    smoothedPosition.y += (y - smoothedPosition.y) * SMOOTHING_FACTOR;
                                    smoothedPosition.z += (0 - smoothedPosition.z) * SMOOTHING_FACTOR;
                                }
                            }
                            
                            arObject.position.set(smoothedPosition.x, smoothedPosition.y, smoothedPosition.z);
                            arObject.visible = true;
                        }

                        transformedCorners.delete();
                        corners.delete();
                        H.delete();
                    }

                    srcMat.delete();
                    dstMat.delete();
                }
            }

            matcher.delete();
            matches.delete();
        }

        // Hide object if no marker detected
        if (!detected && arObject) {
            arObject.visible = false;
            isPositionInitialized = false; // Reset smoothing
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
            arObjectExists: !!arObject
        });
        if (arObject) arObject.visible = false;
    }
}

async function switch3DObject(index) {
    currentObjectType = index;
    await create3DObject(index);
    const names = ['Model 1', 'Model 2', 'Model 3'];
    updateStatus(` Switched to: ${names[index-1]}`);
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
    arObject = null;
    loadedModels = {};
    isPositionInitialized = false;
    
    console.log(" AR stopped");
    updateStatus(" AR stopped");
}