import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Sparkles, Command, Moon, Volume2, VolumeX } from "lucide-react";

// Import the generated woodcut asset directly in ES style
import zhuangziWoodcut from "./assets/images/zhuangzi_woodcut_1782160600928.jpg";

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const threeCanvasRef = useRef<HTMLCanvasElement>(null);
  const asciiCanvasRef = useRef<HTMLCanvasElement>(null);

  // Scroll / transition progress (0 to 1)
  const [progress, setProgress] = useState<number>(0);
  const progressRef = useRef<number>(0);

  // States for interactive custom features
  const [autoBreathe, setAutoBreathe] = useState<boolean>(false);
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);
  const [sampledColor, setSampledColor] = useState<string>("rgb(248, 246, 240)"); // Default beautiful light cream tone
  const [dismissedIntro, setDismissedIntro] = useState<boolean>(false);

  const originalPositionsRef = useRef<Float32Array | null>(null);

  // States & Refs for the interactive Zen-Digital Procedural Synthesizer
  const [soundOn, setSoundOn] = useState<boolean>(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const zenDroneRef = useRef<OscillatorNode | null>(null);
  const digitalDroneRef = useRef<OscillatorNode | null>(null);
  const zenDroneGainRef = useRef<GainNode | null>(null);
  const digitalDroneGainRef = useRef<GainNode | null>(null);
  const masterFilterRef = useRef<BiquadFilterNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const tickIntervalRef = useRef<number | null>(null);
  const activeOscillatorsRef = useRef<OscillatorNode[]>([]);

  // Smooth easing for transition progress (cubic-bezier approximation)
  const getSmoothProgress = () => {
    return progress * progress * (3 - 2 * progress);
  };

  // Sync state to Ref for zero-lag access inside Three.js render loop
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  // Interpolator for background color
  const getContainerBg = () => {
    const match = sampledColor.match(/\d+/g);
    const r = match ? parseInt(match[0], 10) : 239;
    const g = match ? parseInt(match[1], 10) : 236;
    const b = match ? parseInt(match[2], 10) : 227;

    const smoothP = getSmoothProgress();
    const currR = Math.round(r * (1 - smoothP));
    const currG = Math.round(g * (1 - smoothP));
    const currB = Math.round(b * (1 - smoothP));

    return `rgb(${currR}, ${currG}, ${currB})`;
  };

  // Interpolate between light and dark colors for text
  const getTextColor = (baseDark: string, baseLight: string) => {
    const dMatch = baseDark.match(/\d+/g);
    const dr = dMatch ? parseInt(dMatch[0], 10) : 24;
    const dg = dMatch ? parseInt(dMatch[1], 10) : 24;
    const db = dMatch ? parseInt(dMatch[2], 10) : 27;

    const lMatch = baseLight.match(/\d+/g);
    const lr = lMatch ? parseInt(lMatch[0], 10) : 255;
    const lg = lMatch ? parseInt(lMatch[1], 10) : 255;
    const lb = lMatch ? parseInt(lMatch[2], 10) : 255;

    const smoothP = getSmoothProgress();
    const currR = Math.round(dr + (lr - dr) * smoothP);
    const currG = Math.round(dg + (lg - dg) * smoothP);
    const currB = Math.round(db + (lb - db) * smoothP);

    return `rgb(${currR}, ${currG}, ${currB})`;
  };

  // Handle Wheel scroll events to accumulate progress
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (autoBreathe) return; // Ignore input when Auto Breathe is active
      
      const speed = 0.001; // Controlled scroll speed
      setProgress((prev) => {
        const next = Math.max(0, Math.min(1, prev + e.deltaY * speed));
        return next;
      });
    };

    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      window.removeEventListener("wheel", handleWheel);
    };
  }, [autoBreathe]);

  // Touch controls for mobile support
  const touchStartY = useRef<number>(0);
  const handleTouchStart = (e: React.TouchEvent) => {
    if (autoBreathe) return;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (autoBreathe) return;
    const currentY = e.touches[0].clientY;
    const deltaY = touchStartY.current - currentY;
    touchStartY.current = currentY;

    setProgress((prev) => {
      const next = Math.max(0, Math.min(1, prev + deltaY * 0.003));
      return next;
    });
  };

  // Auto Breathing animation effect
  useEffect(() => {
    if (!autoBreathe) return;

    let animFrame: number;
    let time = 0;

    const tick = () => {
      time += 0.008; // smooth breathing speed
      const value = (Math.sin(time - Math.PI / 2) + 1) / 2;
      setProgress(value);

      animFrame = requestAnimationFrame(tick);
    };

    animFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrame);
  }, [autoBreathe]);

  // ---------------------------------------------------------
  // INTERACTIVE PROCEDURAL SYNTHESIZER (Zen Sound <-> Digital Sound)
  // ---------------------------------------------------------

  const initAudio = () => {
    try {
      const AudioCtxConstructor = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxConstructor) {
        console.warn("AudioContext is not supported in this browser.");
        return;
      }

      const ctx = new AudioCtxConstructor();
      audioCtxRef.current = ctx;

      // Master gain node to prevent high pitch spikes and respect user ears
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.35, ctx.currentTime);
      masterGain.connect(ctx.destination);
      masterGainRef.current = masterGain;

      // Master lowpass/highpass control filter that adjusts based on state
      const masterFilter = ctx.createBiquadFilter();
      masterFilter.type = "lowpass";
      masterFilter.frequency.setValueAtTime(400 + progressRef.current * 4200, ctx.currentTime);
      masterFilter.Q.setValueAtTime(1.5, ctx.currentTime);
      masterFilter.connect(masterGain);
      masterFilterRef.current = masterFilter;

      // 1. Zen Drone (Soft, deep sinusoidal wave)
      const zenDrone = ctx.createOscillator();
      zenDrone.type = "sine";
      zenDrone.frequency.setValueAtTime(110.00, ctx.currentTime); // A2 Grounding note

      const zenGain = ctx.createGain();
      const currentZenVol = (1 - progressRef.current) * 0.18;
      zenGain.gain.setValueAtTime(currentZenVol, ctx.currentTime);

      zenDrone.connect(zenGain);
      zenGain.connect(masterFilter);
      zenDrone.start();
      zenDroneRef.current = zenDrone;
      zenDroneGainRef.current = zenGain;
      activeOscillatorsRef.current.push(zenDrone);

      // Warm harmonic (Triangle wave at 220Hz - A3)
      const zenHarmonic = ctx.createOscillator();
      zenHarmonic.type = "triangle";
      zenHarmonic.frequency.setValueAtTime(220.00, ctx.currentTime);
      const zenHarmonicGain = ctx.createGain();
      zenHarmonicGain.gain.setValueAtTime(currentZenVol * 0.4, ctx.currentTime);

      zenHarmonic.connect(zenHarmonicGain);
      zenHarmonicGain.connect(masterFilter);
      zenHarmonic.start();
      activeOscillatorsRef.current.push(zenHarmonic);

      // 2. Digital Drone (Slightly detuned dual Triangle waves with highpass/bandpass filtering)
      // This mimics warm digital electronic circuits without any annoying sawtooth or square buzz!
      const digitalDrone = ctx.createOscillator();
      digitalDrone.type = "triangle";
      digitalDrone.frequency.setValueAtTime(220.00, ctx.currentTime); // A3

      const digitalDroneDetuned = ctx.createOscillator();
      digitalDroneDetuned.type = "triangle";
      digitalDroneDetuned.frequency.setValueAtTime(220.60, ctx.currentTime); // Soft chorus effect

      const digitalGain = ctx.createGain();
      const currentDigVol = progressRef.current * 0.12; // Slightly higher output since triangle is softer than sawtooth
      digitalGain.gain.setValueAtTime(currentDigVol, ctx.currentTime);

      const digFilter = ctx.createBiquadFilter();
      digFilter.type = "bandpass";
      digFilter.frequency.setValueAtTime(1200, ctx.currentTime); // frequency lowered from 2200 to 1200 for a warm retro tone
      digFilter.Q.setValueAtTime(2.5, ctx.currentTime);

      digitalDrone.connect(digFilter);
      digitalDroneDetuned.connect(digFilter);
      digFilter.connect(digitalGain);
      digitalGain.connect(masterGain); 
      digitalDrone.start();
      digitalDroneDetuned.start();

      digitalDroneRef.current = digitalDrone;
      digitalDroneGainRef.current = digitalGain;
      activeOscillatorsRef.current.push(digitalDrone);
      activeOscillatorsRef.current.push(digitalDroneDetuned);

      // Start the dynamic sequencer thread
      startSeqLoop(ctx, masterFilter, masterGain);
    } catch (err) {
      console.error("Failed to boot synthesis system:", err);
    }
  };

  const startSeqLoop = (ctx: AudioContext, zenFilter: BiquadFilterNode, dGain: GainNode) => {
    // Elegant Pentatonic scale in D (D, E, F#, A, B, D) for meditative wind chime vibes
    const scale = [146.83, 164.81, 185.00, 220.00, 246.94, 293.66, 329.63, 370.00, 440.00, 493.88, 587.33, 659.25, 740.00];

    const triggerArpeggio = () => {
      if (!audioCtxRef.current || audioCtxRef.current.state === "suspended") return;

      const p = progressRef.current;
      const now = audioCtxRef.current.currentTime;

      // Select frequency from scale based on scroll progress
      let index = Math.floor(Math.random() * scale.length);
      if (p < 0.35) {
        // Soft bass & low-mid registers for cozy zen feel
        index = Math.floor(Math.random() * 5);
      } else if (p > 0.65) {
        // High registers for digital computing sparks
        index = Math.floor(Math.random() * 6) + 7;
      }
      const pitch = scale[index];

      const noteOsc = audioCtxRef.current.createOscillator();
      const noteGain = audioCtxRef.current.createGain();

      if (p < 0.5) {
        // ------------------------------------
        // Zen Sound: Pure Soft Sine Woodwind Bell
        // ------------------------------------
        noteOsc.type = "sine";
        noteOsc.frequency.setValueAtTime(pitch, now);

        const duration = 2.5 + Math.random() * 1.5;
        noteGain.gain.setValueAtTime(0, now);
        // Soft envelope (wind chime feeling)
        noteGain.gain.linearRampToValueAtTime((1 - p) * 0.16, now + 0.4);
        noteGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        noteOsc.connect(noteGain);
        noteGain.connect(zenFilter);
        noteOsc.start(now);
        noteOsc.stop(now + duration + 0.1);
      } else {
        // ------------------------------------
        // Digital Sound: Meditative Digital Liquid Bubbles & Drops
        // ------------------------------------
        noteOsc.type = "triangle";
        noteOsc.frequency.setValueAtTime(pitch * 1.5, now); // Sweet harmonic register

        const duration = 0.12 + Math.random() * 0.10; // Slightly longer for a beautiful resonant bell tail
        noteGain.gain.setValueAtTime(0, now);
        // Smoother, comforting click attack envelope
        noteGain.gain.linearRampToValueAtTime(p * 0.08, now + 0.008);
        noteGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        // Gentle, soft dynamic frequency sweep for beautiful liquid tone
        const direction = Math.random() > 0.5;
        noteOsc.frequency.exponentialRampToValueAtTime(direction ? pitch * 2.8 : pitch * 1.1, now + duration);

        noteOsc.connect(noteGain);
        noteGain.connect(dGain); 
        noteOsc.start(now);
        noteOsc.stop(now + duration + 0.02);

        // Ambient echo echoes/raindrops
        if (Math.random() > 0.45) {
          const shiftOsc = audioCtxRef.current.createOscillator();
          const shiftGain = audioCtxRef.current.createGain();
          shiftOsc.type = "sine"; // Pure serene sine wave echo
          shiftOsc.frequency.setValueAtTime(pitch * 2, now + 0.08);

          shiftGain.gain.setValueAtTime(0, now + 0.08);
          shiftGain.gain.linearRampToValueAtTime(p * 0.04, now + 0.085);
          shiftGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

          shiftOsc.connect(shiftGain);
          shiftGain.connect(dGain);
          shiftOsc.start(now + 0.08);
          shiftOsc.stop(now + 0.24);
        }
      }
    };

    let lastNoteTime = Date.now();
    const intervalTick = () => {
      const p = progressRef.current;
      const currentMs = Date.now();
      
      // Morph control: 
      // In Zen mode, space trigger out note every 2.0 - 3.5 seconds
      // In digital mode, quick machine arpeggiator clock tick every 180 - 350ms
      const speedDelay = p < 0.5 ? (1800 + Math.random() * 1200) : (180 + Math.random() * 200);

      if (currentMs - lastNoteTime >= speedDelay) {
        triggerArpeggio();
        lastNoteTime = currentMs;
      }
    };

    tickIntervalRef.current = window.setInterval(intervalTick, 50) as any;
  };

  const stopAudio = () => {
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
    activeOscillatorsRef.current.forEach((osc) => {
      try {
        osc.stop();
      } catch (err) {}
    });
    activeOscillatorsRef.current = [];

    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch (err) {}
      audioCtxRef.current = null;
    }

    zenDroneRef.current = null;
    digitalDroneRef.current = null;
    zenDroneGainRef.current = null;
    digitalDroneGainRef.current = null;
    masterFilterRef.current = null;
    masterGainRef.current = null;
  };

  const toggleSound = () => {
    if (!soundOn) {
      initAudio();
      setSoundOn(true);
    } else {
      stopAudio();
      setSoundOn(false);
    }
  };

  // Real-time morph parameters on scroll
  useEffect(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || ctx.state === "suspended") return;

    const t = ctx.currentTime;
    const p = progress;

    if (zenDroneGainRef.current) {
      // Fade out Zen sound as scroll increases (p -> 1)
      zenDroneGainRef.current.gain.setTargetAtTime((1 - p) * 0.18, t, 0.1);
    }

    if (digitalDroneGainRef.current) {
      // Fade in digital buzzing synthesis as scroll increases (p -> 1)
      digitalDroneGainRef.current.gain.setTargetAtTime(p * 0.08, t, 0.1);
    }

    if (masterFilterRef.current) {
      // Morph master lowpass cutoff (lower/muffled for Cozy Zen, crystal bright for Digital)
      masterFilterRef.current.frequency.setTargetAtTime(400 + p * 4200, t, 0.15);
    }
  }, [progress]);

  // Teardown synthesizer completely on route unmount
  useEffect(() => {
    return () => {
      if (tickIntervalRef.current) {
        clearInterval(tickIntervalRef.current);
      }
      activeOscillatorsRef.current.forEach((osc) => {
        try {
          osc.stop();
        } catch (err) {}
      });
      if (audioCtxRef.current) {
        try {
          audioCtxRef.current.close();
        } catch (err) {}
      }
    };
  }, []);

  // Core Three.js and ASCII algorithm
  useEffect(() => {
    if (!threeCanvasRef.current || !asciiCanvasRef.current) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    // 1. Create Scene & Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.z = 5;

    // Set preserveDrawingBuffer to true so we can downsample WebGL buffer into ASCII 2D canvas
    const renderer = new THREE.WebGLRenderer({
      canvas: threeCanvasRef.current,
      antialias: true,
      preserveDrawingBuffer: true,
      alpha: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    scene.add(ambientLight);

    // Load original woodcut
    const img = new Image();
    img.src = zhuangziWoodcut;
    img.crossOrigin = "anonymous";

    let bgMesh: THREE.Mesh | null = null;
    let butterflyMesh: THREE.Mesh | null = null;
    let textureBg: THREE.CanvasTexture | null = null;
    let textureBf: THREE.CanvasTexture | null = null;

    // Custom offscreen canvas for ASCII extraction
    const asciiOffscreenCanvas = document.createElement("canvas");
    const asciiOffscreenCtx = asciiOffscreenCanvas.getContext("2d", { willReadFrequently: true });

    img.onload = () => {
      // 1. Create Temporary Canvas to inspect pixels & crop parts
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = img.width;
      tempCanvas.height = img.height;
      const tempCtx = tempCanvas.getContext("2d");
      if (!tempCtx) return;

      tempCtx.drawImage(img, 0, 0);

      // 2. Sample Cream Background of Chinese ink painting (subtle off-white)
      // Sample slightly deeper into the paper to avoid corner vignette shadows, then boost slightly for a pristine light cream.
      const sampledData = tempCtx.getImageData(Math.round(img.width * 0.1), Math.round(img.height * 0.1), 1, 1).data;
      const bgR = Math.min(255, Math.round(sampledData[0] * 1.05 + 6));
      const bgG = Math.min(255, Math.round(sampledData[1] * 1.05 + 6));
      const bgB = Math.min(255, Math.round(sampledData[2] * 1.05 + 6));
      const creamRGB = `rgb(${bgR}, ${bgG}, ${bgB})`;
      setSampledColor(creamRGB);
      renderer.setClearColor(new THREE.Color(`rgb(${bgR}, ${bgG}, ${bgB})`), 1);

      // 3. Create CLEAN BACKGROUND Canvas (erasing the original printed butterfly)
      const bgCanvas = document.createElement("canvas");
      bgCanvas.width = img.width;
      bgCanvas.height = img.height;
      const bgCtx = bgCanvas.getContext("2d");
      if (bgCtx) {
        bgCtx.drawImage(img, 0, 0);

        const bfLeft = img.width * 0.76;
        const bfTop = img.height * 0.04;
        const bfWidth = img.width * 0.20;
        const bfHeight = img.height * 0.26;

        // Erase static butterfly on background canvas using a custom cream-colored patch with soft edges
        const eraseGrad = bgCtx.createRadialGradient(
          bfLeft + bfWidth / 2,
          bfTop + bfHeight / 2,
          bfWidth * 0.2,
          bfLeft + bfWidth / 2,
          bfTop + bfHeight / 2,
          bfWidth * 0.8
        );
        eraseGrad.addColorStop(0, creamRGB);
        eraseGrad.addColorStop(0.7, creamRGB);
        eraseGrad.addColorStop(1, "rgba(239, 236, 227, 0)");

        bgCtx.fillStyle = eraseGrad;
        bgCtx.beginPath();
        bgCtx.arc(bfLeft + bfWidth / 2, bfTop + bfHeight / 2, bfWidth * 0.7, 0, Math.PI * 2);
        bgCtx.fill();

        // Soften and feather the margins of the drawing so it integrates perfectly with the background color
        const creamRGBA1 = `rgba(${bgR}, ${bgG}, ${bgB}, 1)`;
        const creamRGBA0 = `rgba(${bgR}, ${bgG}, ${bgB}, 0)`;
        const feather = Math.min(img.width, img.height) * 0.12;

        // Top edge feather (solid cream at y=0, transparent at y=feather)
        const gradTop = bgCtx.createLinearGradient(0, 0, 0, feather);
        gradTop.addColorStop(0, creamRGBA1);
        gradTop.addColorStop(1, creamRGBA0);
        bgCtx.fillStyle = gradTop;
        bgCtx.fillRect(0, 0, img.width, feather);

        // Bottom edge feather (solid cream at y=height, transparent at y=height-feather)
        const gradBottom = bgCtx.createLinearGradient(0, img.height, 0, img.height - feather);
        gradBottom.addColorStop(0, creamRGBA1);
        gradBottom.addColorStop(1, creamRGBA0);
        bgCtx.fillStyle = gradBottom;
        bgCtx.fillRect(0, img.height - feather, img.width, feather);

        // Left edge feather (solid cream at x=0, transparent at x=feather)
        const gradLeft = bgCtx.createLinearGradient(0, 0, feather, 0);
        gradLeft.addColorStop(0, creamRGBA1);
        gradLeft.addColorStop(1, creamRGBA0);
        bgCtx.fillStyle = gradLeft;
        bgCtx.fillRect(0, 0, feather, img.height);

        // Right edge feather (solid cream at x=width, transparent at x=width-feather)
        const gradRight = bgCtx.createLinearGradient(img.width, 0, img.width - feather, 0);
        gradRight.addColorStop(0, creamRGBA1);
        gradRight.addColorStop(1, creamRGBA0);
        bgCtx.fillStyle = gradRight;
        bgCtx.fillRect(img.width - feather, 0, feather, img.height);
      }

      // 4. Create TRANSPARENT BUTTERFLY Canvas (isolating ink lines from the cream paper)
      const bfCanvas = document.createElement("canvas");
      const bfCropX = Math.floor(img.width * 0.76);
      const bfCropY = Math.floor(img.height * 0.04);
      const bfCropW = Math.floor(img.width * 0.20);
      const bfCropH = Math.floor(img.height * 0.26);

      bfCanvas.width = bfCropW;
      bfCanvas.height = bfCropH;
      const bfCtx = bfCanvas.getContext("2d");
      if (bfCtx) {
        bfCtx.drawImage(img, bfCropX, bfCropY, bfCropW, bfCropH, 0, 0, bfCropW, bfCropH);

        const bfImgData = bfCtx.getImageData(0, 0, bfCropW, bfCropH);
        const bfPixels = bfImgData.data;

        const colorTolerance = 60;
        for (let i = 0; i < bfPixels.length; i += 4) {
          const r = bfPixels[i];
          const g = bfPixels[i + 1];
          const b = bfPixels[i + 2];

          const dist = Math.sqrt((r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2);

          if (dist < colorTolerance) {
            bfPixels[i + 3] = 0;
          } else {
            const scaleFactor = Math.min(1, (dist - colorTolerance) / 30);
            bfPixels[i + 3] = Math.floor(bfPixels[i + 3] * scaleFactor);
          }
        }
        bfCtx.putImageData(bfImgData, 0, 0);
      }

      // 5. Convert canvasses into WebGL textures
      textureBg = new THREE.CanvasTexture(bgCanvas);
      textureBf = new THREE.CanvasTexture(bfCanvas);

      // Create main woodcut Board geometry maintaining proportions
      const aspect = img.width / img.height;
      const meshHeight = 4.2;
      const meshWidth = meshHeight * aspect;

      // High-resolution grid of vertices to support beautifully localized and fluid breathing curves
      const bgGeo = new THREE.PlaneGeometry(meshWidth, meshHeight, 90, 90);
      const bgMat = new THREE.MeshBasicMaterial({ map: textureBg, side: THREE.DoubleSide });
      bgMesh = new THREE.Mesh(bgGeo, bgMat);
      // Shift board slightly upwards in the camera frustum so the poetic caption fits perfectly below
      bgMesh.position.y = 0.4;
      scene.add(bgMesh);

      // Save initial vertex positions reference
      originalPositionsRef.current = bgGeo.attributes.position.array.slice() as Float32Array;

      // Calculate butterfly's exact original landing coordinate in the 3D space
      const relX = (bfCropX + bfCropW / 2) / img.width - 0.5;
      const relY = 0.5 - (bfCropY + bfCropH / 2) / img.height;

      const initX = relX * meshWidth;
      // Adjust standard coordinate relative to the shifted background board center
      const initY = relY * meshHeight + 0.4;

      const bfHeight = meshHeight * (bfCropH / img.height);
      const bfWidth = meshWidth * (bfCropW / img.width);

      const bfGeo = new THREE.PlaneGeometry(bfWidth, bfHeight);
      const bfMat = new THREE.MeshBasicMaterial({
        map: textureBf,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      butterflyMesh = new THREE.Mesh(bfGeo, bfMat);
      butterflyMesh.position.set(initX, initY, 0.015);
      scene.add(butterflyMesh);

      setImageLoaded(true);
      triggerResize();
    };

    const triggerResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;

      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();

      if (bgMesh) {
        const bbox = new THREE.Box3().setFromObject(bgMesh);
        const size = new THREE.Vector3();
        bbox.getSize(size);

        const screenAspect = w / h;
        const boardAspect = size.x / size.y;

        if (screenAspect > boardAspect) {
          camera.position.z = (size.y / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) + 0.8;
        } else {
          const visibleHeight = size.x / screenAspect;
          camera.position.z = (visibleHeight / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) + 0.8;
        }
      }

      if (asciiCanvasRef.current) {
        asciiCanvasRef.current.width = w;
        asciiCanvasRef.current.height = h;
      }
    };

    window.addEventListener("resize", triggerResize);

    // ASCII characters table as specified by the user gradient matching ink thickness
    const ASCII_CHARS = ["##", "MM", "mm", "@@", "++", "::", "--", "..", "  "];

    const getAsciiPair = (r: number, g: number, b: number): string => {
      const L = 0.299 * r + 0.587 * g + 0.114 * b;
      const index = Math.floor((L / 255.1) * ASCII_CHARS.length);
      return ASCII_CHARS[index] || "  ";
    };

    const clock = new THREE.Clock();
    let animationId: number;

    const animate = () => {
      const time = clock.getElapsedTime();
      const progress = progressRef.current;

      let breatheY = 0;
      let breatheX = 0;
      let breatheZ = 0;

      // 1. Gently animate breathing (shoulder/back rising and falling, with subtle head sync) on bgMesh
      if (bgMesh && originalPositionsRef.current) {
        const bgGeo = bgMesh.geometry as THREE.BufferGeometry;
        const positionAttr = bgGeo.attributes.position;
        const arr = positionAttr.array as Float32Array;
        const orig = originalPositionsRef.current;
        const breathPhase = Math.sin(time * 1.5); // Slower, deeper and more serene breath cycle

        // Coordinates for the localized anatomy of Zhuangzi's sleeping frame:
        // Back: arched and upper portion
        const cxBack = -0.12;
        const cyBack = -0.38;
        const rBackX = 1.3;
        const rBackY = 0.8;

        // Head/Face: slightly upper-left
        const cxHead = -0.72;
        const cyHead = -0.32;
        const rHead = 0.45;

        for (let i = 0; i < arr.length; i += 3) {
          const x = orig[i];
          const y = orig[i + 1];

          // Compute Back (costas) breathing influence
          const dxB = (x - cxBack) / rBackX;
          const dyB = (y - cyBack) / rBackY;
          const distB = Math.sqrt(dxB * dxB + dyB * dyB);
          let weightBack = 0;
          if (distB < 1.0) {
            const f = 1.0 - distB;
            weightBack = f * f * (3 - 2 * f); // smoothstep curve
          }

          // Compute Head/Face (rosto) breathing influence
          const dxH = (x - cxHead) / rHead;
          const dyH = (y - cyHead) / rHead;
          const distH = Math.sqrt(dxH * dxH + dyH * dyH);
          let weightHead = 0;
          if (distH < 1.0) {
            const f = 1.0 - distH;
            weightHead = f * f * (3 - 2 * f);
          }

          // Hands and arms (located more forwards/down on the front plane) are excluded by being out of these bounds.
          
          // Back rises and falls with a soft, natural amplitude
          const backLiftY = weightBack * 0.011 * breathPhase;
          const backLiftZ = weightBack * 0.022 * (breathPhase + 1.0);

          // Head/Face has an extremely subtle, almost imperceptible organic rhythm
          const headLiftY = weightHead * 0.0025 * breathPhase;
          const headLiftZ = weightHead * 0.004 * (breathPhase + 1.0);

          arr[i + 1] = y + backLiftY + headLiftY;
          arr[i + 2] = backLiftZ + headLiftZ;
        }
        positionAttr.needsUpdate = true;

        // Scale factor of breathing displacement for a landed butterfly (affected mostly by back movement)
        const weightLanded = 0.4;
        breatheY = 0.009 * breathPhase * weightLanded;
        breatheX = 0.0015 * breathPhase * weightLanded;
        breatheZ = 0.018 * (breathPhase + 1.0) * weightLanded;
      }

      // 2. Animate butterfly 3D position and wing flaps
      if (butterflyMesh && imageLoaded) {
        const initBfX = (bfCropX + bfCropW / 2) / img.width - 0.5;
        const initBfY = 0.5 - (bfCropY + bfCropH / 2) / img.height;
        const meshHeight = 4.2;
        const meshWidth = meshHeight * (img.width / img.height);

        const baseWorldX = initBfX * meshWidth;
        const baseWorldY = initBfY * meshHeight + 0.4; // offset taking background board height shift into account

        const amplitude = progress;
        
        const loopX = Math.sin(time * 1.5) * 1.2;
        const loopY = 0.3 + Math.cos(time * 1.0) * 0.7;
        const loopZ = 0.2 + Math.sin(time * 2.8) * 0.2;

        const breatheInfluence = 1.0 - progress;
        butterflyMesh.position.x = THREE.MathUtils.lerp(baseWorldX + breatheX * breatheInfluence, loopX, progress);
        butterflyMesh.position.y = THREE.MathUtils.lerp(baseWorldY + breatheY * breatheInfluence, loopY, progress);
        butterflyMesh.position.z = THREE.MathUtils.lerp(0.015 + breatheZ * breatheInfluence, loopZ, progress);

        butterflyMesh.scale.x = 1.0 + Math.sin(time * 32) * 0.6 * amplitude;
        butterflyMesh.rotation.z = Math.sin(time * 4.8) * 0.2 * amplitude;
        butterflyMesh.rotation.y = Math.sin(time * 2.5) * 0.35 * amplitude;
      }

      renderer.render(scene, camera);

      if (asciiCanvasRef.current && asciiOffscreenCtx) {
        const asciiCanvas = asciiCanvasRef.current;
        const asciiCtx = asciiCanvas.getContext("2d");

        if (asciiCtx) {
          const w = window.innerWidth;
          const h = window.innerHeight;

          const charFontWidth = 10;
          const charFontHeight = 10;
          const cols = Math.floor(w / charFontWidth);
          const rows = Math.floor(h / charFontHeight);

          if (cols > 0 && rows > 0) {
            asciiOffscreenCanvas.width = cols;
            asciiOffscreenCanvas.height = rows;

            asciiOffscreenCtx.drawImage(threeCanvasRef.current, 0, 0, cols, rows);

            try {
              const imgData = asciiOffscreenCtx.getImageData(0, 0, cols, rows);
              const pixels = imgData.data;

              // Compute average luminance to detect skipped/blank WebGL frames.
              // This completely prevents glaring white flashes on empty double-buffered webgl frames!
              const totalPixels = cols * rows;
              let totalLuminance = 0;
              let nonZeroAlphaCount = 0;
              for (let i = 0; i < totalPixels; i++) {
                const idx = i * 4;
                totalLuminance += 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
                if (pixels[idx + 3] > 0) {
                  nonZeroAlphaCount++;
                }
              }
              const avgLuminance = totalLuminance / totalPixels;

              // Only clear and redraw the ASCII canvas if the WebGL buffer contains a valid painted frame
              // (avgLuminance > 40 and has actual non-transparent pixels rendered to avoid blank frames)
              if (avgLuminance > 40 && nonZeroAlphaCount > totalPixels * 0.1) {
                asciiCtx.fillStyle = "#000000";
                asciiCtx.fillRect(0, 0, w, h);

                asciiCtx.font = "bold 8px 'JetBrains Mono', Courier, monospace";
                asciiCtx.textBaseline = "top";
                asciiCtx.textAlign = "left";
                asciiCtx.fillStyle = "#ffffff";

                const startX = (w - cols * charFontWidth) / 2;
                const startY = (h - rows * charFontHeight) / 2;

                for (let r = 0; r < rows; r++) {
                  for (let c = 0; c < cols; c++) {
                    const idx = (r * cols + c) * 4;
                    const red = pixels[idx];
                    const green = pixels[idx + 1];
                    const blue = pixels[idx + 2];
                    const alpha = pixels[idx + 3];

                    // If the pixel is fully transparent, or if it's completely black (0,0,0) (which indicates an empty/blank buffer frame), 
                    // we MUST map it to empty space "  ".
                    if (alpha < 50 || (red === 0 && green === 0 && blue === 0)) {
                      continue;
                    }

                    const pair = getAsciiPair(red, green, blue);

                    if (pair !== "  ") {
                      asciiCtx.fillText(pair, startX + c * charFontWidth, startY + r * charFontHeight);
                    }
                  }
                }
              }
            } catch (err) {
              // Fail-safe
            }
          }
        }
      }

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", triggerResize);
      renderer.dispose();
      if (textureBg) textureBg.dispose();
      if (textureBf) textureBf.dispose();
    };
  }, [imageLoaded]);

  const bfCropX = 1000 * 0.76;
  const bfCropW = 1000 * 0.20;
  const bfCropY = 800 * 0.04;
  const bfCropH = 800 * 0.26;

  return (
    <div
      ref={containerRef}
      className="relative w-screen h-screen overflow-hidden select-none font-sans transition-colors duration-150"
      style={{
        backgroundColor: getContainerBg(),
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      id="main-app-container"
    >
      {/* 1. Underlying WebGL scene (Fades out as scroll increases) */}
      <canvas
        ref={threeCanvasRef}
        id="webgl-canvas"
        className="absolute inset-0 w-full h-full pointer-events-none transition-all duration-300"
        style={{
          opacity: Math.max(0.01, 1 - progress),
          zIndex: 10,
        }}
      />

      {/* 2. Overlay ASCII art canvas (Fades in as scroll increases) */}
      <canvas
        ref={asciiCanvasRef}
        id="ascii-canvas"
        className="absolute inset-0 w-full h-full pointer-events-none transition-all duration-300"
        style={{
          opacity: progress,
          zIndex: 20,
        }}
      />

      {/* 3. Subtle background vignette enhancing depth */}
      <div 
        className="absolute inset-0 pointer-events-none transition-all duration-1000"
        style={{
          boxShadow: `inset 0 0 ${200 + progress * 300}px rgba(0, 0, 0, ${0.4 + progress * 0.6})`,
          zIndex: 30,
        }}
      />

      {/* 4. Interactive Navigation & Control Panel (Header & States) */}
      <header className="absolute top-0 left-0 right-0 p-4 sm:p-6 flex flex-wrap sm:flex-nowrap justify-between items-center gap-3 sm:gap-0 pointer-events-auto z-45" id="header-hub">
        <div className="flex flex-col gap-1 md:hidden">
          <h1 
            className="font-sans text-[11px] sm:text-sm uppercase tracking-[0.2em] flex items-center gap-1.5 font-extrabold transition-colors duration-300"
            style={{ color: getTextColor("rgb(24, 24, 27)", "rgb(255, 255, 255)") }}
          >
            <Moon className="w-3.5 h-3.5 opacity-80" style={{ color: getTextColor("rgb(113, 113, 122)", "rgb(228, 228, 231)") }} />
            <span>O Sonho da Borboleta</span>
          </h1>
        </div>
        <div className="hidden md:flex p-2">
          <Moon className="w-4.5 h-4.5 opacity-80 transition-colors duration-300" style={{ color: getTextColor("rgb(113, 113, 122)", "rgb(228, 228, 231)") }} />
        </div>

        <div className="flex items-center gap-2">
          {/* Sintonizar Som Zen-Digital */}
          <button
            onClick={toggleSound}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg font-mono text-[11px] uppercase tracking-wider font-semibold border transition-all duration-300 cursor-pointer shadow-md"
            style={
              soundOn 
                ? {
                    backgroundColor: progress > 0.5 ? "rgb(244, 244, 245)" : "rgb(24, 24, 27)",
                    color: progress > 0.5 ? "rgb(9, 9, 11)" : "rgb(255, 255, 255)",
                    borderColor: progress > 0.5 ? "rgb(244, 244, 245)" : "rgb(24, 24, 27)",
                  }
                : {
                    backgroundColor: progress > 0.5 ? "rgb(24, 24, 27)" : "rgb(255, 255, 255)",
                    color: progress > 0.5 ? "rgb(244, 244, 245)" : "rgb(24, 24, 27)",
                    borderColor: progress > 0.5 ? "rgb(39, 39, 42)" : "rgb(228, 228, 231)",
                  }
            }
            title={soundOn ? "Silenciar Som Zen-Digital" : "Ativar Som Zen-Digital"}
            id="btn-toggle-sound"
          >
            {soundOn ? (
              <>
                <Volume2 className="w-3.5 h-3.5 animate-pulse" />
                <span>Som Ativo</span>
              </>
            ) : (
              <>
                <VolumeX className="w-3.5 h-3.5 opacity-70" />
                <span>Ativar Som</span>
              </>
            )}
          </button>

          <button
            onClick={() => setAutoBreathe(!autoBreathe)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg font-mono text-[11px] uppercase tracking-wider font-semibold border transition-all duration-300 cursor-pointer shadow-md"
            style={
              autoBreathe 
                ? {
                    backgroundColor: progress > 0.5 ? "rgb(244, 244, 245)" : "rgb(24, 24, 27)",
                    color: progress > 0.5 ? "rgb(9, 9, 11)" : "rgb(255, 255, 255)",
                    borderColor: progress > 0.5 ? "rgb(244, 244, 245)" : "rgb(24, 24, 27)",
                  }
                : {
                    backgroundColor: progress > 0.5 ? "rgb(24, 24, 27)" : "rgb(255, 255, 255)",
                    color: progress > 0.5 ? "rgb(244, 244, 245)" : "rgb(24, 24, 27)",
                    borderColor: progress > 0.5 ? "rgb(39, 39, 42)" : "rgb(228, 228, 231)",
                  }
            }
            title="Sopro da Vida - Ciclo automático de respiração contemplativa"
            id="btn-auto-breathe"
          >
            <Sparkles className={`w-3.5 h-3.5 ${autoBreathe ? "animate-spin" : ""}`} />
            {autoBreathe ? "Sopro Ativo" : "Sopro da Vida"}
          </button>
        </div>
      </header>

      {/* 5. Elegant left lateral title in vertical mode, and minimalist vertical scroll indicator in the right margin */}
      <div 
        className="absolute left-6 md:left-10 top-1/2 -translate-y-1/2 flex flex-col items-center gap-4 z-45 pointer-events-none select-none hidden md:flex"
        id="vertical-title-bar"
      >
        <span 
          className="text-xs sm:text-sm uppercase tracking-[0.35em] font-extrabold transition-colors duration-300"
          style={{ 
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
            color: getTextColor("rgb(24, 24, 27)", "rgb(255, 255, 255)") 
          }}
        >
          O Sonho da Borboleta de Zhuangzi
        </span>
      </div>

      <div 
        className="absolute right-6 md:right-10 top-1/2 -translate-y-1/2 flex flex-col items-center gap-3 z-45 pointer-events-none select-none hidden md:flex"
        id="vertical-scroll-bar"
      >
        <span 
          className="text-[9px] font-mono font-bold tracking-widest leading-none transition-colors duration-300"
          style={{ color: getTextColor("rgb(113, 113, 122)", "rgb(161, 161, 170)") }}
        >
          {Math.round(progress * 100)}%
        </span>
        <div 
          className="w-[1.5px] h-32 relative rounded-full overflow-hidden transition-colors duration-300"
          style={{
            backgroundColor: progress > 0.5 ? "rgba(63, 63, 70, 0.4)" : "rgba(228, 228, 231, 1)"
          }}
        >
          <div 
            className="absolute top-0 left-0 w-full rounded-full transition-all duration-150"
            style={{
              height: `${progress * 100}%`,
              backgroundColor: progress > 0.5 ? "#ffffff" : "#18181b"
            }}
          />
        </div>
      </div>

      {/* 6. Poetic Text (Zhuangzi quote) Centered on mobile, right-aligned on desktop */}
      <footer 
        className="absolute bottom-8 sm:bottom-6 left-6 right-6 sm:left-auto sm:right-12 max-w-none sm:max-w-xl md:max-w-2xl px-2 sm:px-4 flex flex-col items-center text-center sm:items-end sm:text-right gap-3 pointer-events-none transition-all duration-300 z-40"
        style={{
          opacity: Math.max(0, 1 - (progress * progress * (3 - 2 * progress))),
          transform: `translateY(${progress * 15}px)`,
        }}
        id="poem-footer"
      >
        <p 
          className="font-serif italic text-[13.5px] sm:text-base md:text-lg lg:text-xl leading-[1.75] sm:leading-relaxed tracking-wide transition-colors duration-300 font-medium max-w-[340px] sm:max-w-xl md:max-w-2xl mx-auto sm:mx-0"
          style={{ color: getTextColor("rgb(24, 24, 27)", "rgb(255, 255, 255)") }}
        >
          &ldquo;Agora não sei se eu era então um homem sonhando que era uma borboleta,<br className="hidden sm:inline" /> ou se sou agora uma borboleta sonhando que sou um homem.&rdquo;
        </p>
        <div className="flex flex-col items-center sm:items-end gap-1 mt-0.5 w-full">
          <div className="flex items-center gap-2 justify-center sm:justify-end">
            <span className="hidden sm:inline-block h-[1px] w-5 bg-current opacity-30" style={{ backgroundColor: getTextColor("rgb(113, 113, 122)", "rgb(161, 161, 170)") }} />
            <p 
              className="font-mono text-[8.5px] sm:text-[9px] uppercase tracking-[0.16em] sm:tracking-widest font-semibold transition-colors duration-300 text-center sm:text-right"
              style={{ color: getTextColor("rgb(113, 113, 122)", "rgb(161, 161, 170)") }}
            >
              Zhuangzi, O Sonho da Borboleta (séc. IV a.C.)
            </p>
          </div>
        </div>
      </footer>

      {/* Dynamic injection of keyframes for smooth scrollwheel micro-animation */}
      <style>{`
        @keyframes scrollWheel {
          0% { transform: translateY(0); opacity: 1; }
          50% { transform: translateY(5px); opacity: 0.2; }
          100% { transform: translateY(0); opacity: 1; }
        }
        .animate-scroll-wheel {
          animation: scrollWheel 1.5s infinite ease-in-out;
        }
      `}</style>

      {/* 7. Centered high-visibility interactive tutorial pop-up (dismissible) */}
      {!dismissedIntro && progress < 0.02 && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/20 dark:bg-black/40 backdrop-blur-[6px] cursor-pointer transition-all duration-500 ease-out"
          onClick={() => setDismissedIntro(true)}
          id="scroll-instruction-overlay"
        >
          <div 
            className="flex flex-col items-center gap-6 px-8 py-8 rounded-3xl backdrop-blur-xl border shadow-2xl max-w-sm sm:max-w-md w-full text-center scale-100 hover:scale-[1.01] active:scale-[0.99] transition-all duration-300"
            style={{
              backgroundColor: getTextColor("rgba(255, 255, 255, 0.95)", "rgba(15, 23, 42, 0.95)"),
              borderColor: getTextColor("rgba(161, 161, 170, 0.4)", "rgba(63, 63, 70, 0.8)"),
              boxShadow: getTextColor("0 25px 50px -12px rgba(0, 0, 0, 0.15)", "0 25px 50px -12px rgba(0, 0, 0, 0.6)"),
            }}
            onClick={(e) => {
              e.stopPropagation(); // Avoid click-through
              setDismissedIntro(true);
            }}
          >
            {/* Visual Icon Header with Glow */}
            <div className="flex items-center gap-6 justify-center">
              {/* Elegant scrolling mouse outline */}
              <div 
                className="relative w-7 h-11 border-2 rounded-full flex justify-center pt-2 transition-colors duration-300"
                style={{ borderColor: getTextColor("rgb(9, 9, 11)", "rgb(212, 212, 216)") }}
              >
                <div 
                  className="w-1.5 h-2.5 rounded-full animate-scroll-wheel"
                  style={{ backgroundColor: getTextColor("rgb(9, 9, 11)", "rgb(255, 255, 255)") }}
                />
              </div>
              
              <div className="h-8 w-[1px]" style={{ backgroundColor: getTextColor("rgba(9, 9, 11, 0.2)", "rgba(255, 255, 255, 0.2)") }} />

              {/* Touch gesture icon */}
              <div className="relative w-8 h-8 flex items-center justify-center">
                <span className="absolute inline-flex h-full w-full rounded-full bg-amber-500/25 dark:bg-cyan-500/25 animate-ping duration-1000" />
                <svg viewBox="0 0 24 24" className="w-6 h-6 fill-none stroke-current stroke-2 animate-bounce" style={{ color: getTextColor("rgb(9, 9, 11)", "rgb(255, 255, 255)") }}>
                  <path d="M12 3v18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>

            {/* Typography Content */}
            <div className="flex flex-col gap-2.5">
              <h3 
                className="font-mono text-xs sm:text-sm uppercase tracking-[0.25em] font-bold"
                style={{ color: getTextColor("rgb(180, 83, 9)", "rgb(34, 211, 238)") }}
              >
                Como Interagir
              </h3>
              <p 
                className="font-serif text-base sm:text-lg leading-relaxed font-semibold transition-colors duration-300"
                style={{ color: getTextColor("rgb(24, 24, 27)", "rgb(255, 255, 255)") }}
              >
                Deslize com o scroll do mouse ou arraste o dedo pela tela.
              </p>
            </div>

            {/* Dismiss CTA Button */}
            <button
              onClick={() => setDismissedIntro(true)}
              className="mt-2 w-full py-3.5 px-6 rounded-2xl font-mono text-xs uppercase tracking-[0.2em] font-bold transition-all duration-300 shadow-md flex items-center justify-center gap-2 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
              style={{
                backgroundColor: getTextColor("rgb(24, 24, 27)", "rgb(255, 255, 255)"),
                color: getTextColor("rgb(255, 255, 255)", "rgb(9, 9, 11)"),
                boxShadow: getTextColor("0 4px 14px rgba(0, 0, 0, 0.12)", "0 4px 20px rgba(255, 255, 255, 0.15)"),
              }}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Entrar no Sonho
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
