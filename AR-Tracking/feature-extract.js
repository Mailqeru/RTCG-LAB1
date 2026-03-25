// Feature Extraction Module using OpenCV.js
// ✅ Fully fixed: Scalar cleanup + memory management + OpenCV.js API

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
        mask.delete(); // ✅ Clean up mask (it's a Mat)
        
        // Step 4: Draw keypoints on the grayscale image
        // Convert gray to RGBA for display
        cv.cvtColor(gray, dst, cv.COLOR_GRAY2RGBA, 0);
        
        // ✅ FIXED: drawKeypoints with 4 params only (OpenCV.js compatible)
        // ❌ DO NOT call .delete() on cv.Scalar - it doesn't need cleanup!
        const color = new cv.Scalar(0, 255, 0, 255); // Green [B, G, R, A]
        cv.drawKeypoints(gray, keypoints, dst, color);
        // ✅ No color.delete() - Scalar is auto-managed in JS
        
        // Step 5: Display on canvas (do this BEFORE cleanup!)
        const canvas = document.getElementById('featureCanvas');
        cv.imshow(canvas, dst);
        
        // Log feature information
        console.log("✅ Features extracted successfully!");
        console.log("🔑 Number of keypoints:", keypoints.size());
        console.log("📊 Descriptor shape:", descriptors.rows + "x" + descriptors.cols);
        
        // ✅ FIXED: Clean up ONLY objects that need manual deletion
        // Keep dst, keypoints, descriptors for potential AR tracking later
        src.delete();      // ✅ Mat - needs delete
        gray.delete();     // ✅ Mat - needs delete
        orb.delete();      // ✅ ORB detector - needs delete
        // color.delete(); // ❌ REMOVE THIS - Scalar doesn't have delete()
        
        // Optional: Store feature data globally for AR tracking
        window.trackingData = {
            keypoints: keypoints,      // Keep for matching
            descriptors: descriptors,  // Keep for matching
            markerImage: dst           // Keep for reference
        };
        
        callback(true, canvas);
        
    } catch (error) {
        console.error("❌ Feature extraction error:", error.name, error.message);
        
        // Safe cleanup on error
        safeCleanup();
        callback(false, null);
    }
}

// ✅ Safe cleanup function - only delete objects that support .delete()
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

// ✅ Alternative: Simple detect-only version (more stable)
function extractFeaturesSimple(imageDataUrl, callback) {
    try {
        if (typeof cv === 'undefined' || !cv.Mat) {
            callback(false, null);
            return;
        }
        
        const img = document.getElementById('originalImage');
        src = cv.imread(img);
        gray = new cv.Mat();
        
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
        
        const orb = new cv.ORB();
        keypoints = new cv.KeyPointVector();
        
        // Detect only (simpler, more compatible)
        orb.detect(gray, keypoints);
        
        dst = new cv.Mat();
        cv.cvtColor(gray, dst, cv.COLOR_GRAY2RGBA, 0);
        const color = new cv.Scalar(0, 255, 0, 255); // Green
        cv.drawKeypoints(gray, keypoints, dst, color); // 4 params only
        
        const canvas = document.getElementById('featureCanvas');
        cv.imshow(canvas, dst);
        
        console.log("Simple detection - Keypoints:", keypoints.size());
        
        // Cleanup (no Scalar.delete!)
        src.delete();
        gray.delete();
        orb.delete();
        // Keep dst, keypoints for display/tracking
        
        callback(true, canvas);
        
    } catch (error) {
        console.error("Simple extraction error:", error);
        safeCleanup();
        callback(false, null);
    }
}

// Feature Matching Function (for AR tracking)
function matchFeatures(descriptors1, descriptors2) {
    try {
        const matcher = new cv.BFMatcher(cv.NORM_HAMMING, true);
        const matches = new cv.DMatchVector();
        
        matcher.match(descriptors1, descriptors2, matches);
        
        console.log("🎯 Matches found:", matches.size());
        
        matcher.delete(); // ✅ BFMatcher needs delete
        // matches.delete(); // Optional: keep if you need match data
        
        return matches;
        
    } catch (error) {
        console.error("Matching error:", error);
        return null;
    }
}

// ✅ Helper: Reset tracking data when uploading new image
function resetTrackingData() {
    safeCleanup();
    window.trackingData = null;
    console.log("🔄 Tracking data reset");
}