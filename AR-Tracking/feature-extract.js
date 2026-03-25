// Feature Extraction Module using OpenCV.js

let src = null;
let dst = null;
let gray = null;
let keypoints = null;
let descriptors = null;

function extractFeatures(imageDataUrl, callback) {
    try {
        // Wait for OpenCV to be fully ready
        if (typeof cv === 'undefined' || !cv.Mat) {
            console.error("❌ OpenCV.js not loaded yet!");
            callback(false, null);
            return;
        }
        
        // Load image from the img element
        const img = document.getElementById('originalImage');
        
        if (!img || !img.src || img.naturalWidth === 0) {
            console.error("❌ No valid image loaded!");
            callback(false, null);
            return;
        }
        
        // Create Mat from image
        src = cv.imread(img);
        dst = new cv.Mat();
        gray = new cv.Mat();
        
        // Step 1: Convert RGB to Grayscale
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
        
        // Step 2: Create ORB detector
        const orb = new cv.ORB();
        
        // Create output containers
        keypoints = new cv.KeyPointVector();
        descriptors = new cv.Mat();
        
        // Step 3: Detect and compute features
        const mask = new cv.Mat(); // empty mask
        orb.detectAndCompute(gray, mask, keypoints, descriptors);
        mask.delete(); // Clean up mask
        
        // Step 4: Draw keypoints on the grayscale image
        cv.cvtColor(gray, dst, cv.COLOR_GRAY2RGBA, 0);
        
        // Draw keypoints (4 params only for OpenCV.js)
        const color = new cv.Scalar(0, 255, 0, 255); // Green [B, G, R, A]
        cv.drawKeypoints(gray, keypoints, dst, color);
        
        // Step 5: Display on canvas
        const canvas = document.getElementById('featureCanvas');
        cv.imshow(canvas, dst);
        
        // Log feature information
        console.log("✅ Features extracted successfully!");
        console.log("🔑 Number of keypoints:", keypoints.size());
        console.log("📊 Descriptor shape:", descriptors.rows + "x" + descriptors.cols);
        
        // Clean up OpenCV memory (keep keypoints/descriptors for tracking)
        src.delete();
        gray.delete();
        orb.delete();
        // color.delete(); // Scalar doesn't need delete
        
        // Store feature data globally for AR tracking
        // Ensure tracking list exists
if (!window.trackingDataList) {
    window.trackingDataList = [];
}

// Limit to 3 markers
if (window.trackingDataList.length >= 3) {
    updateStatus("⚠️ Max 3 markers only!");
    return callback(true, canvas);
}

const type = window.trackingDataList.length + 1;

// Save marker properly
const marker = {
    keypoints: keypoints,
    descriptors: descriptors.clone(),
    type: type,
    image: canvas.toDataURL(),
    imageWidth: canvas.width,
    imageHeight: canvas.height
};

window.trackingDataList.push(marker);

// Update marker UI
renderMarkerList();

// Enable AR button
document.getElementById('arBtn').disabled = false;

updateStatus(`✅ Marker ${type} saved`);
callback(true, canvas);
        
    } catch (error) {
        console.error("❌ Feature extraction error:", error.name, error.message);
        
        // Safe cleanup on error
        safeCleanup();
        callback(false, null);
    }
}

// Safe cleanup function
function safeCleanup() {
    const objects = [src, dst, gray, keypoints, descriptors];
    objects.forEach(obj => {
        if (obj && typeof obj.delete === 'function') {
            try {
                obj.delete();
            } catch (e) {
                // Ignore if already deleted
            }
        }
    });
    console.log("🧹 Memory cleanup complete");
}

// Helper: Reset tracking data when uploading new image
function resetTrackingData() {
    safeCleanup();
    window.trackingDataList = [];
    renderMarkerList();
    console.log("🔄 Tracking data reset");
}