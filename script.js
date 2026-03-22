
// Sidebar active link scroll sync
(function() {
  const navLinks = document.querySelectorAll('nav a[href^="#"]');
  const sections = [];

  navLinks.forEach(link => {
    const id = link.getAttribute('href').slice(1);
    const el = document.getElementById(id);
    if (el) sections.push({ id, el, link });
  });

  function setActive(id) {
    navLinks.forEach(link => link.classList.remove('active'));
    const match = sections.find(s => s.id === id);
    if (match) {
      match.link.classList.add('active');
      // Scroll nav to keep active link visible
      const nav = document.querySelector('nav');
      const linkTop = match.link.offsetTop;
      const navH = nav.offsetHeight;
      if (linkTop < nav.scrollTop + 40 || linkTop > nav.scrollTop + navH - 40) {
        nav.scrollTo({ top: linkTop - navH / 2, behavior: 'smooth' });
      }
    }
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) setActive(entry.target.id);
    });
  }, { rootMargin: '-20% 0px -70% 0px', threshold: 0 });

  sections.forEach(s => observer.observe(s.el));
})();
(function() {
  const overlay = document.getElementById('lightbox');
  const img = document.getElementById('lightbox-img');
  const caption = document.getElementById('lightbox-caption');
  const closeBtn = document.getElementById('lightbox-close');

  function openLightbox(src, cap) {
    img.src = src;
    caption.textContent = cap || '';
    overlay.classList.add('open');
  }

  function closeLightbox() {
    overlay.classList.remove('open');
    setTimeout(() => { img.src = ''; }, 200);
  }

  closeBtn.addEventListener('click', closeLightbox);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeLightbox(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLightbox(); });

  // Wire up all img-slot elements
  function initSlots() {
    // Inline slots with data-img
    document.querySelectorAll('.img-slot[data-img]').forEach(slot => {
      const src = slot.dataset.img;
      const cap = slot.dataset.caption || '';
      const placeholder = slot.querySelector('.img-slot-placeholder');

      // Try to load image
      const testImg = new Image();
      testImg.onload = () => {
        // Image exists — replace placeholder with real img
        if (placeholder) {
          const realImg = document.createElement('img');
          realImg.src = src;
          realImg.alt = cap;
          slot.replaceChild(realImg, placeholder);
          realImg.addEventListener('click', () => openLightbox(src, cap));
        }
      };
      testImg.onerror = () => {
        // Keep placeholder, but make it clickable if somehow loaded later
      };
      testImg.src = src;
    });

    // Gallery items
    document.querySelectorAll('.gallery-item[data-img]').forEach(item => {
      const src = item.dataset.img;
      const cap = item.dataset.caption || '';
      const placeholder = item.querySelector('.gallery-placeholder');

      const testImg = new Image();
      testImg.onload = () => {
        if (placeholder) {
          const realImg = document.createElement('img');
          realImg.src = src;
          realImg.alt = cap;
          item.replaceChild(realImg, placeholder);
        }
        item.addEventListener('click', () => openLightbox(src, cap));
      };
      testImg.onerror = () => {
        // Placeholder stays, still add click just in case
      };
      testImg.src = src;
    });
  }

  document.addEventListener('DOMContentLoaded', initSlots);
})();



(function() {
  // Shared AudioContext
  let sharedCtx = null;
  function getCtx() {
    if (!sharedCtx) sharedCtx = new (window.AudioContext || window.webkitAudioContext)();
    return sharedCtx;
  }

  // Currently playing player reference (for stopping others)
  let currentPlayer = null;

  function formatTime(s) {
    if (!isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return m + ':' + String(sec).padStart(2, '0');
  }

  function initPlayer(wrapper) {
    const src = wrapper.dataset.src;
    const circleBtn = wrapper.querySelector('.bm-circle-btn');
    const circleCanvas = circleBtn.querySelector('canvas');
    const waveCanvas = wrapper.querySelector('.bm-waveform');
    const freqCanvas = wrapper.querySelector('.bm-freq');
    const timeEl = wrapper.querySelector('.bm-time');

    const cCtx = circleCanvas.getContext('2d');
    const wCtx = waveCanvas.getContext('2d');
    const fCtx = freqCanvas.getContext('2d');

    // Scale canvases for sharpness
    const dpr = window.devicePixelRatio || 1;

    let audio = null;
    let analyser = null;
    let freqData = null;
    let timeData = null;
    let sourceNode = null;
    let isPlaying = false;
    let rafId = null;
    let audioReady = false;
    let loadFailed = false;

    function setupAudio() {
      if (audio) return;
      audio = new Audio();
      audio.crossOrigin = 'anonymous';
      audio.src = src;
      audio.preload = 'metadata';

      audio.addEventListener('error', () => {
        loadFailed = true;
        drawIdle(true);
      });

      audio.addEventListener('loadedmetadata', () => {
        audioReady = true;
        timeEl.textContent = formatTime(audio.duration);
      });

      audio.addEventListener('timeupdate', () => {
        if (audio.duration) {
          timeEl.textContent = formatTime(audio.currentTime);
        }
      });

      audio.addEventListener('ended', () => {
        isPlaying = false;
        timeEl.textContent = formatTime(audio.duration);
        cancelAnimationFrame(rafId);
        drawIdle(false);
      });
    }

    function connectAnalyser() {
      if (analyser) return;
      const ctx = getCtx();
      sourceNode = ctx.createMediaElementSource(audio);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.75;
      analyser.minDecibels = -100;
      analyser.maxDecibels = -10;
      sourceNode.connect(analyser);
      analyser.connect(ctx.destination);
      freqData = new Uint8Array(analyser.frequencyBinCount);
      timeData = new Uint8Array(analyser.fftSize);
    }

    // Draw idle state — play button
    function drawIdle(failed) {
      const size = circleCanvas.width / dpr;
      cCtx.clearRect(0, 0, circleCanvas.width, circleCanvas.height);
      const cx = size / 2, cy = size / 2, r = size / 2 - 3;

      // Outer ring
      cCtx.beginPath();
      cCtx.arc(cx, cy, r, 0, Math.PI * 2);
      cCtx.strokeStyle = failed ? '#c44a4a' : '#7b5ea8';
      cCtx.lineWidth = 3;
      cCtx.stroke();

      // Inner fill
      cCtx.beginPath();
      cCtx.arc(cx, cy, r - 4, 0, Math.PI * 2);
      cCtx.fillStyle = failed ? 'rgba(196,74,74,0.1)' : 'rgba(123,94,168,0.12)';
      cCtx.fill();

      if (failed) {
        // X mark
        cCtx.strokeStyle = '#c44a4a';
        cCtx.lineWidth = 2.5;
        const o = size * 0.28;
        cCtx.beginPath();
        cCtx.moveTo(cx - o, cy - o); cCtx.lineTo(cx + o, cy + o);
        cCtx.moveTo(cx + o, cy - o); cCtx.lineTo(cx - o, cy + o);
        cCtx.stroke();
      } else {
        // Play triangle
        cCtx.fillStyle = '#a07ad4';
        const ts = size * 0.22;
        cCtx.beginPath();
        cCtx.moveTo(cx - ts * 0.6 + size * 0.03, cy - ts);
        cCtx.lineTo(cx - ts * 0.6 + size * 0.03, cy + ts);
        cCtx.lineTo(cx + ts * 1.0 + size * 0.03, cy);
        cCtx.closePath();
        cCtx.fill();
      }

      // Clear waveform canvas — idle state
      const ww = waveCanvas.width / dpr, wh = waveCanvas.height / dpr;
      wCtx.clearRect(0, 0, waveCanvas.width, waveCanvas.height);
      const midY = wh / 2;
      // Grey baseline visible at rest
      wCtx.beginPath();
      wCtx.moveTo(0, midY);
      wCtx.lineTo(ww, midY);
      wCtx.strokeStyle = 'rgba(180,180,200,0.5)';
      wCtx.lineWidth = 3;
      wCtx.stroke();
      // Static dot at start when idle
      wCtx.beginPath();
      wCtx.arc(5, midY, 5, 0, Math.PI * 2);
      wCtx.fillStyle = 'rgba(200,160,248,0.5)';
      wCtx.fill();

      const fw = freqCanvas.width / dpr, fh = freqCanvas.height / dpr;
      fCtx.clearRect(0, 0, freqCanvas.width, freqCanvas.height);
      const barCount = 12;
      const barW = Math.floor(fw / barCount) - 1;
      for (let i = 0; i < barCount; i++) {
        const x = i * (barW + 1);
        const h = fh * 0.08;
        fCtx.fillStyle = 'rgba(74,143,212,0.15)';
        fCtx.fillRect(x, fh - h, barW, h);
      }
    }

    // Draw pause button overlay on circle
    function drawPause() {
      const size = circleCanvas.width / dpr;
      cCtx.clearRect(0, 0, circleCanvas.width, circleCanvas.height);
      const cx = size / 2, cy = size / 2, r = size / 2 - 3;
      cCtx.beginPath();
      cCtx.arc(cx, cy, r, 0, Math.PI * 2);
      cCtx.strokeStyle = '#a07ad4';
      cCtx.lineWidth = 3;
      cCtx.stroke();
      cCtx.beginPath();
      cCtx.arc(cx, cy, r - 4, 0, Math.PI * 2);
      cCtx.fillStyle = 'rgba(123,94,168,0.15)';
      cCtx.fill();
      // Pause bars
      cCtx.fillStyle = '#c8a0f8';
      const bw = size * 0.12, bh = size * 0.38;
      cCtx.fillRect(cx - size * 0.18 - bw / 2, cy - bh / 2, bw, bh);
      cCtx.fillRect(cx + size * 0.06, cy - bh / 2, bw, bh);
    }

    function drawFrame() {
      if (!analyser) return;
      analyser.getByteFrequencyData(freqData);
      analyser.getByteTimeDomainData(timeData);

      // --- Circular visualiser (replaces play button while playing) ---
      const size = circleCanvas.width / dpr;
      const cx = size / 2, cy = size / 2;
      cCtx.clearRect(0, 0, circleCanvas.width, circleCanvas.height);

      const barCount = 32;
      const innerR = size * 0.28;
      const outerMax = size * 0.44;
      const step = Math.floor(freqData.length / barCount);

      for (let i = 0; i < barCount; i++) {
        const val = Math.min(1, (freqData[i * step] / 255) * 2.0);
        const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
        const barLen = innerR + val * (outerMax - innerR);
        const x1 = cx + Math.cos(angle) * innerR;
        const y1 = cy + Math.sin(angle) * innerR;
        const x2 = cx + Math.cos(angle) * barLen;
        const y2 = cy + Math.sin(angle) * barLen;

        const hue = 260 + val * 60; // purple to blue
        cCtx.strokeStyle = `hsla(${hue}, 70%, ${50 + val * 30}%, ${0.6 + val * 0.4})`;
        cCtx.lineWidth = 2.5;
        cCtx.beginPath();
        cCtx.moveTo(x1, y1);
        cCtx.lineTo(x2, y2);
        cCtx.stroke();
      }

      // Inner circle
      cCtx.beginPath();
      cCtx.arc(cx, cy, innerR - 2, 0, Math.PI * 2);
      cCtx.fillStyle = 'rgba(10,11,15,0.85)';
      cCtx.fill();

      // Pause icon inside
      cCtx.fillStyle = 'rgba(200,160,248,0.7)';
      const bw = size * 0.09, bh = size * 0.28;
      cCtx.fillRect(cx - size * 0.14 - bw / 2, cy - bh / 2, bw, bh);
      cCtx.fillRect(cx + size * 0.05, cy - bh / 2, bw, bh);

      // --- Combined progress + waveform canvas ---
      const ww = waveCanvas.width / dpr, wh = waveCanvas.height / dpr;
      wCtx.clearRect(0, 0, waveCanvas.width, waveCanvas.height);
      const pct = audio.duration ? audio.currentTime / audio.duration : 0;
      const progressX = pct * ww;
      const midY = wh / 2;

      // Full grey baseline — clearly visible
      wCtx.beginPath();
      wCtx.moveTo(0, midY);
      wCtx.lineTo(ww, midY);
      wCtx.strokeStyle = 'rgba(180,180,200,0.3)';
      wCtx.lineWidth = 3;
      wCtx.stroke();

      // Accent progress line
      if (progressX > 0) {
        wCtx.beginPath();
        wCtx.moveTo(0, midY);
        wCtx.lineTo(progressX, midY);
        wCtx.strokeStyle = '#4a8fd4';
        wCtx.lineWidth = 3;
        wCtx.stroke();
      }

      // Playhead dot — static
      const dotX = Math.max(6, progressX);
      wCtx.beginPath();
      wCtx.arc(dotX, midY, 6, 0, Math.PI * 2);
      wCtx.fillStyle = 'rgba(123,94,168,0.3)';
      wCtx.fill();
      wCtx.beginPath();
      wCtx.arc(dotX, midY, 5, 0, Math.PI * 2);
      wCtx.fillStyle = '#c8a0f8';
      wCtx.fill();

      // Purple waveform overlay — smooth sine-like line
      const waveStep = Math.max(1, Math.floor(timeData.length / 128));
      const pts = [];
      for (let i = 0; i < timeData.length; i += waveStep) {
        const v = (timeData[i] / 128.0) - 1.0;
        pts.push({ x: (i / timeData.length) * ww, y: midY + v * (wh * 0.44) });
      }
      wCtx.beginPath();
      wCtx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i + 1].x) / 2;
        const my = (pts[i].y + pts[i + 1].y) / 2;
        wCtx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      wCtx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      // Played = bright purple, unplayed = dim purple
      const wGrad = wCtx.createLinearGradient(0, 0, ww, 0);
      wGrad.addColorStop(0, 'rgba(180, 120, 255, 0.85)');
      wGrad.addColorStop(Math.min(pct, 0.999), 'rgba(200, 140, 255, 0.95)');
      wGrad.addColorStop(Math.min(pct + 0.001, 1), 'rgba(100, 80, 160, 0.35)');
      wGrad.addColorStop(1, 'rgba(80, 60, 140, 0.25)');
      wCtx.strokeStyle = wGrad;
      wCtx.lineWidth = 2.5;
      wCtx.lineJoin = 'round';
      wCtx.lineCap = 'round';
      wCtx.stroke();

      // --- Frequency bars (right canvas) ---
      const fw = freqCanvas.width / dpr, fh = freqCanvas.height / dpr;
      fCtx.clearRect(0, 0, freqCanvas.width, freqCanvas.height);
      const numBars = 12;
      const bw2 = Math.floor(fw / numBars) - 1;
      const barStep = Math.floor(freqData.length / numBars);
      for (let i = 0; i < numBars; i++) {
        // Average a small range of bins for smoother bars
        let sum = 0;
        const range = 3;
        for (let j = 0; j < range; j++) sum += freqData[i * barStep + j] || 0;
        const raw = sum / (range * 255);
        // Boost: scale up so even quiet audio fills decent height
        const val2 = Math.min(1, raw * 2.2);
        const bh2 = Math.max(4, val2 * fh * 0.96);
        const x2 = i * (bw2 + 1);
        const hue2 = 200 + (i / numBars) * 80;
        fCtx.fillStyle = `hsla(${hue2}, 70%, ${35 + val2 * 40}%, ${0.55 + val2 * 0.45})`;
        fCtx.fillRect(x2, fh - bh2, bw2, bh2);
        // Top cap
        fCtx.fillStyle = `hsla(${hue2}, 90%, 78%, ${0.7 + val2 * 0.3})`;
        fCtx.fillRect(x2, fh - bh2 - 2, bw2, 2);
      }

      rafId = requestAnimationFrame(drawFrame);
    }

    function resizeCanvases() {
      const cw = circleBtn.offsetWidth;
      const ch = circleBtn.offsetHeight;
      if (cw > 0) {
        circleCanvas.width = cw * dpr;
        circleCanvas.height = ch * dpr;
        cCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      const ww = waveCanvas.parentElement.offsetWidth;
      const wh = waveCanvas.parentElement.offsetHeight;
      if (ww > 0) {
        waveCanvas.width = ww * dpr;
        waveCanvas.height = (wh > 0 ? wh : 44) * dpr;
        wCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      const fw = freqCanvas.offsetWidth;
      const fh = freqCanvas.offsetHeight;
      if (fw > 0) {
        freqCanvas.width = fw * dpr;
        freqCanvas.height = fh * dpr;
        fCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      if (!isPlaying) drawIdle(loadFailed);
    }

    // ResizeObserver fires once element actually has size — no timing guesses
    const ro = new ResizeObserver(() => resizeCanvases());
    ro.observe(circleBtn);
    ro.observe(waveCanvas.parentElement);
    window.addEventListener('resize', resizeCanvases);

    // Scrub helper
    function scrubTo(clientX) {
      if (!audio || !audio.duration) return;
      const rect = waveCanvas.parentElement.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      audio.currentTime = pct * audio.duration;
    }

    // Mouse scrubbing
    let scrubbing = false;
    waveCanvas.parentElement.addEventListener('mousedown', (e) => { scrubbing = true; scrubTo(e.clientX); });
    window.addEventListener('mousemove', (e) => { if (scrubbing) scrubTo(e.clientX); });
    window.addEventListener('mouseup', () => { scrubbing = false; });

    // Touch scrubbing
    waveCanvas.parentElement.addEventListener('touchstart', (e) => { e.preventDefault(); scrubTo(e.touches[0].clientX); }, { passive: false });
    waveCanvas.parentElement.addEventListener('touchmove', (e) => { e.preventDefault(); scrubTo(e.touches[0].clientX); }, { passive: false });

    // Play/pause
    circleBtn.addEventListener('click', async () => {
      if (loadFailed) return;
      setupAudio();

      const ctx = getCtx();
      if (ctx.state === 'suspended') await ctx.resume();

      if (isPlaying) {
        audio.pause();
        isPlaying = false;
        cancelAnimationFrame(rafId);
        drawPause();
        return;
      }

      // Stop any other playing player
      if (currentPlayer && currentPlayer !== wrapper) {
        currentPlayer.dispatchEvent(new CustomEvent('bm-stop'));
      }
      currentPlayer = wrapper;

      connectAnalyser();

      try {
        await audio.play();
        isPlaying = true;
        rafId = requestAnimationFrame(drawFrame);
      } catch (e) {
        loadFailed = true;
        drawIdle(true);
      }
    });

    wrapper.addEventListener('bm-stop', () => {
      if (audio && isPlaying) {
        audio.pause();
        isPlaying = false;
        cancelAnimationFrame(rafId);
        drawIdle(false);
      }
    });

    drawIdle(false);
  }

  // Lazy init — only initialise a player when its button is first clicked
  document.addEventListener('DOMContentLoaded', () => {

    // Suppress ResizeObserver loop warnings — harmless but noisy
    const origError = window.onerror;
    window.onerror = (msg) => {
      if (typeof msg === 'string' && msg.includes('ResizeObserver loop')) return true;
      return origError ? origError.apply(this, arguments) : false;
    };

    document.querySelectorAll('.bm-player').forEach(wrapper => {
      const btn = wrapper.querySelector('.bm-circle-btn');
      let initialised = false;
      btn.addEventListener('click', () => {
        if (!initialised) {
          initialised = true;
          initPlayer(wrapper);
          btn.click();
        }
      }, { once: false });

      // Draw static idle play button — debounced to avoid resize loop
      const canvas = btn.querySelector('canvas');
      const ctx = canvas.getContext('2d');
      let drawPending = false;
      const ro = new ResizeObserver(() => {
        if (drawPending) return;
        drawPending = true;
        requestAnimationFrame(() => {
          drawPending = false;
          const dpr = window.devicePixelRatio || 1;
          const w = btn.offsetWidth, h = btn.offsetHeight;
          if (w > 0) {
            canvas.width = w * dpr; canvas.height = h * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const cx = w/2, cy = h/2, r = w/2 - 3;
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2);
            ctx.strokeStyle = '#7b5ea8'; ctx.lineWidth = 3; ctx.stroke();
            ctx.beginPath(); ctx.arc(cx, cy, r-4, 0, Math.PI*2);
            ctx.fillStyle = 'rgba(123,94,168,0.12)'; ctx.fill();
            ctx.fillStyle = '#a07ad4';
            const ts = w * 0.22;
            ctx.beginPath();
            ctx.moveTo(cx - ts*0.6 + w*0.03, cy - ts);
            ctx.lineTo(cx - ts*0.6 + w*0.03, cy + ts);
            ctx.lineTo(cx + ts*1.0 + w*0.03, cy);
            ctx.closePath(); ctx.fill();
          }
        });
      });
      ro.observe(btn);
    });
  });

})();

