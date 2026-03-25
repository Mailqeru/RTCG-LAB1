// Global variables
let originalImageData = null;
let featureData = null;
let markerGenerated = false;

// Upload Image Button
function uploadImage() {
    // Reset tracking data if exists
    if (typeof resetTrackingData === 'function') {
        resetTrackingData();
    }
    document.getElementById('fileInput').click();
}

// Handle file selection
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Check if file is an image
    if (!file.type.match('image.*')) {
        updateStatus("❌ Please select a valid image file!");
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = document.getElementById('originalImage');
        img.src = e.target.result;
        originalImageData = e.target.result;
        
        // Enable Generate button
        document.getElementById('generateBtn').disabled = false;
        markerGenerated = false;
        document.getElementById('saveBtn').disabled = true;
        document.getElementById('arBtn').disabled = true;
        
        updateStatus("✅ Image uploaded! Click 'Generate Features'");
    };
    reader.readAsDataURL(file);
}

// Generate Features Button
function generateFeatures() {
    if (!window.cvReady) {
        updateStatus("❌ OpenCV.js not loaded yet. Please wait...");
        return;
    }
    
    if (!originalImageData) {
        updateStatus("❌ No image uploaded!");
        return;
    }
    
    updateStatus("⚙️ Processing image - Extracting features...");
    
    // Call feature extraction function
    extractFeatures(originalImageData, function(success, canvas) {
        if (success) {
            featureData = canvas;
            markerGenerated = true;
            
            // Enable Save and AR buttons
            document.getElementById('saveBtn').disabled = false;
            document.getElementById('arBtn').disabled = false;
            
            updateStatus("✅ Features extracted! You can Save or Start AR");
        } else {
            updateStatus("❌ Feature extraction failed!");
        }
    });
}

// Save Marker Button
function saveMarker() {
    if (!featureData) {
        updateStatus("❌ No features generated to save!");
        return;
    }
    
    // Create download link
    const link = document.createElement('a');
    link.download = 'ar-marker-' + Date.now() + '.png';
    link.href = featureData.toDataURL('image/png');
    link.click();
    
    updateStatus("💾 Marker saved! Print this on A4 colored paper");
}

// Start AR Scene Button
function startAR() {
    if (!markerGenerated) {
        updateStatus("❌ Generate features first!");
        return;
    }
    
    // Show AR section
    document.getElementById('arSection').style.display = 'block';
    updateStatus("🎬 AR Scene starting... Please allow camera access");
    
    // Small delay to ensure DOM is ready
    setTimeout(() => {
        initializeARScene();
    }, 100);
}

// Update status display
function updateStatus(message) {
    document.getElementById('statusText').innerText = message;
    console.log(message);
}

// Check OpenCV status periodically
setInterval(function() {
    if (!window.cvReady && typeof cv !== 'undefined' && cv.Mat) {
        window.cvReady = true;
        updateStatus("✅ OpenCV.js loaded ready!");
    }
}, 500);