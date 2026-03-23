let allCameras = [];
const scanConfig = {
    fps: 15, // Smooth decoding
    aspectRatio: 1.0, // Compatible aspect ratio
    formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
    disableFlip: false
    // Removed qrbox to eliminate the library's default box. 
    // We only use our custom CSS frame (laser + corners).
};

// ── Permanently suppress html5-qrcode's injected UI ──────────
// The library re-injects its dashboard, scan-region box, and
// "Scanner paused" overlay every time a camera starts or switches.
// A MutationObserver kills those elements the instant they appear,
// so our custom laser / corners are never hidden or displaced.
function startLibrarySuppressor() {
    const reader = document.getElementById('qr-reader');
    if (!reader) return;

    const HIDE_SELECTORS = [
        '#qr-reader__dashboard',
        '#qr-reader__status_span',
        '#qr-reader__dashboard_section',
        '#qr-reader header',
        '#qr-reader br',
        '#qr-reader__scan_region > div',      // library's shaded box overlay
        '#qr-reader__scan_region img',         // library's QR icon
        '#qr-reader__scan_region canvas',      // library's canvas QR-box drawing
    ];

    function suppress() {
        HIDE_SELECTORS.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => {
                if (el.style.display !== 'none') el.style.display = 'none';
            });
        });
        // Also hunt for any div containing "Scanner paused" text
        reader.querySelectorAll('div').forEach(d => {
            if (d.children.length === 0 && d.textContent.trim() &&
                /scanner paused|paused/i.test(d.textContent)) {
                d.style.display = 'none';
            }
        });
    }

    // Run once immediately
    suppress();

    // Then watch for any future injections
    const observer = new MutationObserver(suppress);
    observer.observe(reader, { childList: true, subtree: true, attributes: true });

    return observer;
}


function startScanner() {
    scanner = new Html5Qrcode('qr-reader');

    // Start the MutationObserver NOW — before any camera/DOM injection happens
    startLibrarySuppressor();

    navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: { exact: "environment" } } 
    })
    .catch(() => navigator.mediaDevices.getUserMedia({ video: true })) // Fallback if exact fail
    .then(stream => {
        stream.getTracks().forEach(track => track.stop());
        return navigator.mediaDevices.enumerateDevices();
    })
        .then(devices => {
            const videoDevices = devices.filter(device => device.kind === 'videoinput');

            if (videoDevices.length === 0) {
                setStatus('warn', 'No camera detected');
                return;
            }

            allCameras = videoDevices.map((d, idx) => ({
                id: d.deviceId,
                label: d.label || `Camera ${idx + 1}`
            }));

            populateCameraSelect(allCameras);

            const preferred = allCameras.find(c => /droidcam|obs|virtual/i.test(c.label))
                || allCameras.find(c => /back|rear|environment/i.test(c.label))
                || allCameras[0];

            document.getElementById('cam-select').value = preferred.id;
            launchCamera(preferred.id);

        }).catch(() => {
            scanner.start({ facingMode: 'environment' }, scanConfig, onScanSuccess, () => { })
                .then(() => setStatus('idle', 'Ready — waiting for QR code…'))
                .catch(err => {
                    setStatus('warn', 'Could not access camera.');
                    console.error(err);
                });
        });
}

function populateCameraSelect(cameras) {
    const sel = document.getElementById('cam-select');
    sel.innerHTML = '';
    cameras.forEach(cam => {
        const opt = document.createElement('option');
        opt.value = cam.id;
        // Highlight DroidCam / OBS in label
        const isDroid = /droidcam/i.test(cam.label);
        const isOBS = /obs|virtual/i.test(cam.label);
        const badge = isDroid ? ' 📱' : isOBS ? ' 🎥' : '';
        opt.textContent = (cam.label || `Camera ${cam.id}`) + badge;
        sel.appendChild(opt);
    });
}

function refreshCameras() {
    const btn = document.getElementById('refresh-cam-btn');
    if (btn) {
        btn.classList.add('spinning');
        btn.disabled = true;
    }

    navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
            stream.getTracks().forEach(t => t.stop());
            return navigator.mediaDevices.enumerateDevices();
        })
        .then(devices => {
            const videoDevices = devices.filter(d => d.kind === 'videoinput');
            if (videoDevices.length === 0) {
                showToast('⚠️ No cameras detected.', 'error');
                return;
            }

            const previous = allCameras.map(c => c.id);
            allCameras = videoDevices.map((d, idx) => ({
                id: d.deviceId,
                label: d.label || `Camera ${idx + 1}`
            }));

            populateCameraSelect(allCameras);

            const currentId = document.getElementById('cam-select').value;
            const stillExists = allCameras.find(c => c.id === currentId);
            const newCam = allCameras.find(c => !previous.includes(c.id));

            if (newCam) {
                document.getElementById('cam-select').value = newCam.id;
                switchCamera(newCam.id);
                showToast(`📷 New camera detected: ${newCam.label}`, 'success');
            } else if (stillExists) {
                document.getElementById('cam-select').value = currentId;
                showToast(`✅ ${allCameras.length} camera(s) found — no changes.`, '');
            } else {
                document.getElementById('cam-select').value = allCameras[0].id;
                switchCamera(allCameras[0].id);
            }
        })
        .catch(() => showToast('❌ Camera permission denied.', 'error'))
        .finally(() => {
            if (btn) {
                btn.classList.remove('spinning');
                btn.disabled = false;
            }
        });
}



function launchCamera(cameraId) {
    scanner.start(cameraId, scanConfig, onScanSuccess, () => { })
        .then(() => setStatus('idle', 'Ready — waiting for QR code…'))
        .catch(err => setStatus('warn', 'Camera error: ' + err));
}

function switchCamera(newCameraId) {
    if (!newCameraId || !scanner) return;
    const wasActive = scannerActive;

    // Stop existing stream then restart with new camera
    const stop = scanner.isScanning ? scanner.stop() : Promise.resolve();
    stop.then(() => {
        scannerActive = true;
        document.getElementById('toggle-btn').textContent = 'Pause';
        launchCamera(newCameraId);
        if (!wasActive) {
            // User had it paused — re-pause after start
            setTimeout(() => {
                scanner.pause(true);
                scannerActive = false;
                document.getElementById('toggle-btn').textContent = 'Resume';
                setStatus('warn', 'Scanner paused');
            }, 800);
        }
    }).catch(err => console.error('switchCamera error:', err));
}

function onScanSuccess(decodedText) {
    const now = Date.now();
    if (decodedText === lastScanned && (now - lastScanTime) < COOLDOWN_MS) return;
    lastScanned = decodedText;
    lastScanTime = now;

    // Check if it's a known guest
    let guest = guests.find(g => g.id === decodedText);
    let tNo = '';
    let isGuest = !!guest;

    if (isGuest) {
        // Already registered?
        if (registrations.find(r => r.guestId === guest.id)) {
            playBeep('error');
            showDuplicateModal(guest.Name);
            return;
        }
        tNo = guest['Table Number'] || guest['Table'] || 'N/A';

        // ── Known guest: register immediately ──
        const entry = {
            id: Date.now(),
            tableNo: tNo,
            scanData: guest.Name,
            guestId: guest.id,
            department: guest.Department || '',
            jobTitle: guest['Job Title'] || guest['Job'] || '',
            timestamp: new Date().toLocaleString('en-PH', {
                year: 'numeric', month: 'short', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
            })
        };
        registrations.unshift(entry);
        saveData();
        renderTable(true);
        updateStats();
        // Lock on with Green corners & status
        const overlay = document.querySelector('.scanner-overlay');
        if (overlay) overlay.classList.add('success');
        playBeep('success');
        setStatus('ok', `Checked in ✓`);

        // Give the user a brief moment (300ms) to see the Green "Snap"
        setTimeout(() => {
            if (scannerActive && scanner) {
                scanner.pause(true);
                scannerActive = false;
                document.getElementById('toggle-btn').textContent = 'Resume';
                hideLibPauseOverlay();
            }
            showScanModal(true, guest, decodedText, tNo);
            if (typeof autoSwitchToLog === 'function') autoSwitchToLog();
        }, 350);

    } else {
        // ── Unknown QR: show walk-in form ──
        if (scannerActive && scanner) {
            scanner.pause(true);
            scannerActive = false;
            document.getElementById('toggle-btn').textContent = 'Resume';
            hideLibPauseOverlay();
        }
        showWalkInModal(decodedText);
        return;
    }
}

function showScanModal(isGuest, guest, rawText, tbl) {
    const modalStyles = document.querySelector('.scan-success-modal').style;
    if (isGuest) {
        document.getElementById('sm-table').textContent = `Table ${tbl}`;
        document.getElementById('sm-name').textContent = guest.Name;
        document.getElementById('sm-dept').textContent = guest.Department || '';
        document.getElementById('sm-dept').style.display = guest.Department ? 'block' : 'none';
        document.getElementById('sm-job').textContent = guest['Job Title'] || guest['Job'] || '';
        document.getElementById('sm-job').style.display = guest['Job Title'] || guest['Job'] ? 'block' : 'none';
        document.getElementById('sm-raw').style.display = 'none';

        modalStyles.background = 'linear-gradient(145deg, var(--surface) 0%, rgba(34, 211, 165, 0.05) 100%)';
        modalStyles.borderColor = 'rgba(34, 211, 165, 0.4)';
        document.querySelector('.scan-icon').style.color = 'var(--success)';
        // Do NOT overwrite innerHTML — the REGISTERED badge lives inside .scan-icon
        document.getElementById('sm-table').style.color = 'var(--success)';
    } else {
        document.getElementById('sm-table').textContent = `Table ${tbl}`;
        document.getElementById('sm-name').textContent = 'New Delegate';
        document.getElementById('sm-dept').style.display = 'none';
        document.getElementById('sm-job').style.display = 'none';
        document.getElementById('sm-raw').textContent = rawText;
        document.getElementById('sm-raw').style.display = 'block';

        modalStyles.background = 'linear-gradient(145deg, var(--surface) 0%, rgba(108, 99, 255, 0.05) 100%)';
        modalStyles.borderColor = 'rgba(108, 99, 255, 0.4)';
        document.querySelector('.scan-icon').style.color = 'var(--accent2)';
        document.querySelector('.scan-icon').textContent = '🆔';
        document.getElementById('sm-table').style.color = 'var(--accent2)';
    }
    document.getElementById('scan-modal').classList.add('show');
    const okBtn = document.querySelector('#scan-modal .btn-primary');
    okBtn.focus();
}

function closeScanModal() {
    document.getElementById('scan-modal').classList.remove('show');
    if (!scannerActive && scanner) {
        try {
            scanner.resume();
            scannerActive = true;
            document.getElementById('toggle-btn').textContent = 'Pause';
            setStatus('idle', 'Ready — waiting for QR code…');
            
            // Turn the scanner frame back to NORMAL (White/Red)
            const overlay = document.querySelector('.scanner-overlay');
            if (overlay) overlay.classList.remove('success');

            // Mobile: switch back to scanner tab
            if (typeof switchTab === 'function' && window.innerWidth <= 991) switchTab('scanner');
        } catch (e) { }
    }
}

function toggleScanner() {
    const btn = document.getElementById('toggle-btn');
    if (scannerActive) {
        scanner.pause(true);
        scannerActive = false;
        btn.textContent = 'Resume';
        setStatus('warn', 'Scanner paused');
        hideLibPauseOverlay();
    } else {
        scanner.resume();
        scannerActive = true;
        btn.textContent = 'Pause';
        setStatus('idle', 'Ready — waiting for QR code…');
    }
}

function hideLibPauseOverlay() {
    // html5-qrcode dynamically creates the pause overlay shortly after pausing
    // We check twice to catch it once it enters the DOM
    [10, 100, 300].forEach(delay => {
        setTimeout(() => {
            const reader = document.getElementById('qr-reader');
            if (reader) {
                const divs = reader.querySelectorAll('div');
                divs.forEach(d => {
                    if (d.textContent && d.textContent.includes('Scanner paused')) {
                        d.style.display = 'none';
                    }
                });
            }
        }, delay);
    });
}

function showDuplicateModal(guestName) {
    document.getElementById('dup-name').textContent = guestName;
    // Re-trigger the shake animation by removing and re-adding the element
    const icon = document.querySelector('.dup-icon');
    icon.style.animation = 'none';
    void icon.offsetWidth; // reflow
    icon.style.animation = '';
    document.getElementById('duplicate-modal').classList.add('show');
}

function closeDuplicateModal() {
    document.getElementById('duplicate-modal').classList.remove('show');
    // Resume scanner if it was paused by a previous successful scan
    if (!scannerActive && scanner) {
        try {
            scanner.resume();
            scannerActive = true;
            document.getElementById('toggle-btn').textContent = 'Pause';
            setStatus('idle', 'Ready — waiting for QR code…');
            
            // Turn the scanner frame back to NORMAL
            const overlay = document.querySelector('.scanner-overlay');
            if (overlay) overlay.classList.remove('success');
        } catch (e) { }
    }
}
