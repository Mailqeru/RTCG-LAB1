// AR Scene Module with REAL Marker Detection

let arScene = null;
let arCamera = null;
let arRenderer = null;
let videoElement = null;
let videoTexture = null;
let trackingActive = false;
let currentObjectType = 1;
let markerDetected = false;
let arObject = null;

const objectColors = [0xff0000, 0x00ff00, 0x0000ff]; // Red, Green, Blue
const MARKER_MATCH_THRESHOLD = 50; // Minimum good matches to detect marker

function initializeARScene() {
    try {
        updateStatus("🎥 Initializing AR scene...");
        
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
            
            updateStatus("✅ AR active! Show your PRINTED marker to webcam");
            
        }).catch(error => {
            console.error("❌ Webcam setup failed:", error);
            updateStatus("❌ Cannot access webcam. Allow camera permissions!");
        });
        
    } catch (error) {
        console.error("❌ AR initialization error:", error);
        updateStatus("❌ AR failed: " + error.message);
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
                console.log("✅ Webcam ready");
                resolve();
            };
        });
        
    } catch (error) {
        console.error("❌ Webcam error:", error);
        throw error;
    }
}

function addLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    arScene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    arScene.add(directionalLight);
}

function create3DObject(type) {
    // Remove existing
    if (arObject) {
        arScene.remove(arObject);
        if (arObject.geometry) arObject.geometry.dispose();
        if (arObject.material) arObject.material.dispose();
    }
    
    let geometry;
    const color = objectColors[(type - 1) % objectColors.length];
    
    switch(type) {
        case 1: // Cube
            geometry = new THREE.BoxGeometry(1.5, 1.5, 1.5);
            break;
        case 2: // Sphere
            geometry = new THREE.SphereGeometry(0.9, 32, 32);
            break;
        case 3: // Pyramid
            geometry = new THREE.ConeGeometry(0.9, 1.5, 4);
            break;
        default:
            geometry = new THREE.BoxGeometry(1.5, 1.5, 1.5);
    }
    
    const material = new THREE.MeshPhongMaterial({ color: color, shininess: 80 });
    arObject = new THREE.Mesh(geometry, material);
    arObject.name = 'arObject';
    arObject.position.y = 0.5;
    arObject.position.z = 0;
    arObject.visible = false; // Start hidden
    
    arScene.add(arObject);
    console.log(`✅ 3D Object ${type} created`);
}

// Main AR animation loop
function animateAR() {
    if (!trackingActive) return;
    
    requestAnimationFrame(animateAR);
    
    // Check if marker is visible
    detectMarker();
    
    // Only rotate if marker is detected
    if (arObject && markerDetected) {
        arObject.rotation.y += 0.02;
        arObject.rotation.x += 0.01;
    }
    
    if (videoTexture) {
        videoTexture.needsUpdate = true;
    }
    
    arRenderer.render(arScene, arCamera);
}

// REAL MARKER DETECTION using OpenCV.js
function detectMarker() {
    if (!videoElement || videoElement.readyState !== videoElement.HAVE_ENOUGH_DATA) {
        return;
    }
    
    // Check if we have saved marker features
    if (!window.trackingData || !window.trackingData.descriptors) {
        return;
    }
    
    try {
        // Capture current video frame
        const canvas = document.createElement('canvas');
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoElement, 0, 0);
        
        // Convert to OpenCV Mat
        const frame = cv.imread(canvas);
        const frameGray = new cv.Mat();
        cv.cvtColor(frame, frameGray, cv.COLOR_RGBA2GRAY, 0);
        
        // Extract features from current frame
        const orb = new cv.ORB();
        const frameKeypoints = new cv.KeyPointVector();
        const frameDescriptors = new cv.Mat();
        
        const mask = new cv.Mat();
        orb.detectAndCompute(frameGray, mask, frameKeypoints, frameDescriptors);
        mask.delete();
        
        const savedDescriptors = window.trackingData.descriptors;
        
        if (savedDescriptors && savedDescriptors.rows > 0 && frameDescriptors.rows > 0) {
            // Use KNN matcher for better quality
            const matcher = new cv.BFMatcher(cv.NORM_HAMMING, false);
            const matches = new cv.DMatchVectorVector();
            
            // KNN match with k=2
            matcher.knnMatch(savedDescriptors, frameDescriptors, matches, 2);
            
            // Apply Lowe's ratio test for quality filtering
            let goodMatches = 0;
            const ratioThreshold = 0.75;
            
            for (let i = 0; i < matches.size(); i++) {
                const matchVec = matches.get(i);
                if (matchVec.size() >= 2) {
                    const m1 = matchVec.get(0);
                    const m2 = matchVec.get(1);
                    
                    // Lowe's ratio test
                    if (m1.distance < ratioThreshold * m2.distance) {
                        goodMatches++;
                    }
                }
            }
            
            console.log("🔍 Good matches:", goodMatches);
            
            // Check if enough GOOD matches
            if (goodMatches >= MARKER_MATCH_THRESHOLD) {
                if (!markerDetected) {
                    console.log("✅ MARKER DETECTED! Matches:", goodMatches);
                    updateStatus("🎯 Marker detected! 3D object visible");
                }
                markerDetected = true;
                if (arObject) arObject.visible = true;
            } else {
                if (markerDetected) {
                    console.log("❌ Marker lost. Matches:", goodMatches);
                    updateStatus("⏳ Searching for marker...");
                }
                markerDetected = false;
                if (arObject) arObject.visible = false;
            }
            
            matcher.delete();
            matches.delete();
        }
        
        // Cleanup
        orb.delete();
        frameKeypoints.delete();
        frameDescriptors.delete();
        frameGray.delete();
        frame.delete();
        canvas.remove();
        
    } catch (error) {
        // Silent fail - don't break animation loop
    }
}

function switch3DObject(index) {
    currentObjectType = index;
    create3DObject(index);
    const names = ['Cube', 'Sphere', 'Pyramid'];
    updateStatus(`🎯 Switched to: ${names[index-1]}`);
}

function stopARScene() {
    trackingActive = false;
    
    if (videoElement && videoElement.srcObject) {
        const tracks = videoElement.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        videoElement.remove();
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
    
    console.log("🛑 AR stopped");
    updateStatus("⏹️ AR stopped");
}