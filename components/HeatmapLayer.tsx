import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { useMap } from 'react-leaflet';
import { ChatMessage } from '../types';
import L from 'leaflet';
import { MESSAGE_LIFESPAN_MS } from '../constants';

interface HeatmapLayerProps {
  messages: ChatMessage[];
}

export interface HeatmapLayerRef {
    ping: (lat: number, lng: number) => void;
}

// --- VISUAL CONSTANTS ---
const SPEED_PX_PER_MS = 0.5; // Speed of the sonar wave
const WAVE_WIDTH_PX = 50; // Width of the "active" wave band

// @ts-ignore
const GlowLayer = L.Layer.extend({
    initialize: function (data: ChatMessage[]) {
        this._data = data;
        this._pings = []; // Stores active sonar waves
        this._animating = false;
        this._rafId = null;
    },

    setData: function (data: ChatMessage[]) {
        this._data = data;
    },

    addPing: function(lat: number, lng: number) {
        // Add a new expanding wave origin
        this._pings.push({
            lat,
            lng,
            startTime: Date.now(),
            id: Math.random()
        });
        
        // Cleanup old pings after 3 seconds
        if (this._pings.length > 5) this._pings.shift();
    },

    onAdd: function (map: L.Map) {
        this._map = map;

        if (!this._canvas) {
            this._initCanvas();
        }

        map.getContainer().appendChild(this._canvas);

        this._resizeBound = this._resize.bind(this);
        map.on('resize', this._resizeBound);
        
        this._resize();
        this._startAnimation();
    },

    onRemove: function (map: L.Map) {
        this._stopAnimation();

        if (this._canvas) {
             const container = map.getContainer();
             if (container.contains(this._canvas)) {
                 container.removeChild(this._canvas);
             }
        }

        map.off('resize', this._resizeBound);
    },

    addTo: function (map: L.Map) {
        map.addLayer(this);
        return this;
    },

    _initCanvas: function () {
        const canvas = this._canvas = L.DomUtil.create('canvas', 'leaflet-glow-layer-hud') as HTMLCanvasElement;
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '400';
    },

    _resize: function () {
        if (!this._map) return;
        const size = this._map.getSize();
        const dpr = window.devicePixelRatio || 1;
        this._canvas.width = size.x * dpr;
        this._canvas.height = size.y * dpr;
        this._canvas.style.width = size.x + 'px';
        this._canvas.style.height = size.y + 'px';
    },

    _startAnimation: function() {
        if (!this._animating) {
            this._animating = true;
            this._animate();
        }
    },

    _stopAnimation: function() {
        this._animating = false;
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
    },

    _animate: function () {
        if (!this._animating) return;
        this._redraw();
        this._rafId = requestAnimationFrame(this._animate.bind(this));
    },

    _redraw: function () {
        if (!this._map || !this._canvas) return;

        const ctx = this._canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const width = this._canvas.width;
        const height = this._canvas.height;

        ctx.clearRect(0, 0, width, height);

        const zoom = this._map.getZoom();
        const bounds = this._map.getBounds();
        const now = Date.now();

        // 1. Process Pings (Calculate current radius in pixels for this frame)
        // We project the ping origin to container point to measure pixel distance
        const activePings = this._pings.map((ping: any) => {
             const elapsed = now - ping.startTime;
             // Remove old pings from calculation to save perf
             if (elapsed > 2000) return null;
             
             const p = this._map.latLngToContainerPoint([ping.lat, ping.lng]);
             return {
                 x: p.x * dpr,
                 y: p.y * dpr,
                 radius: elapsed * SPEED_PX_PER_MS * dpr, // Expand rate
                 id: ping.id
             };
        }).filter(Boolean);
        
        // Clean up raw array
        this._pings = this._pings.filter((p: any) => (now - p.startTime) < 2000);


        // 2. Base Size Logic
        let baseRadius = 15 * dpr;
        let baseIntensity = 0.4;

        if (zoom < 5) { baseRadius = 6 * dpr; baseIntensity = 0.6; }
        else if (zoom < 8) { baseRadius = 13 * dpr; baseIntensity = 0.5; }
        else if (zoom < 10) { baseRadius = 25 * dpr; baseIntensity = 0.35; }
        else { baseRadius = 55 * dpr; baseIntensity = 0.25; } 

        // 3. Draw Loop
        this._data.forEach((msg: ChatMessage) => {
            if (!bounds.contains([msg.location.lat, msg.location.lng])) return;

            const p = this._map.latLngToContainerPoint([msg.location.lat, msg.location.lng]);
            const x = p.x * dpr;
            const y = p.y * dpr;

            // --- A. DECAY COLOR LOGIC ---
            // Calculate Remaining Life
            const expiry = msg.expiresAt || (msg.timestamp + MESSAGE_LIFESPAN_MS);
            const msLeft = expiry - now;
            const hoursLeft = msLeft / (1000 * 60 * 60);
            const totalAgeHours = (now - msg.timestamp) / (1000 * 60 * 60);

            let r=34, g=211, b=238; // Default Cyan (Tailwind Cyan-400)

            if (totalAgeHours < 1) {
                // NEW (Fresh): White/Blue hot
                r=200; g=245; b=255; 
                baseIntensity += 0.2; // Brighter
            } else if (hoursLeft < 4) {
                // DYING: Red/Orange fade
                // Transition from Cyan to Red based on remaining time
                r=239; g=68; b=68; // Red-500
            }

            // --- B. SONAR INTERACTION ---
            let sonarBoost = 0;
            
            activePings.forEach((ping: any) => {
                const dx = x - ping.x;
                const dy = y - ping.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                
                // If point is within the "wave band"
                const distDiff = Math.abs(dist - ping.radius);
                
                if (distDiff < (WAVE_WIDTH_PX * dpr)) {
                    // Calculate intensity based on how close to center of wave
                    // 1.0 = dead center of wave, 0.0 = edge
                    const waveIntensity = 1 - (distDiff / (WAVE_WIDTH_PX * dpr));
                    sonarBoost = Math.max(sonarBoost, waveIntensity);
                }
            });


            // --- C. PULSE ANIMATION ---
            const phase = (msg.timestamp % 5000) / 5000 * (Math.PI * 2);
            // If dying, pulse faster (heartbeat)
            const pulseSpeed = hoursLeft < 4 ? 0.008 : 0.002;
            const breathing = 1.0 + Math.sin(now * pulseSpeed + phase) * 0.2;

            let radius = baseRadius * breathing;
            let intensity = baseIntensity * breathing;
            
            // Apply Sonar Boost
            if (sonarBoost > 0) {
                // Flash White when hit
                const boostAmount = sonarBoost * 0.8; 
                intensity += boostAmount;
                radius *= (1 + (sonarBoost * 0.5));
                
                // Shift color towards white on hit
                r = Math.min(255, r + (255-r)*sonarBoost);
                g = Math.min(255, g + (255-g)*sonarBoost);
                b = Math.min(255, b + (255-b)*sonarBoost);
            }

            if (msg.score > 5) { radius *= 1.25; intensity += 0.1; }
            if (msg.score > 20) { radius *= 1.5; intensity = 0.8; }

            intensity = Math.min(intensity, 1.0);

            // --- D. DRAW ---
            const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
            grad.addColorStop(0, `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${intensity})`);
            grad.addColorStop(0.4, `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${intensity * 0.4})`);
            grad.addColorStop(1, `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, 0)`);

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        });
    }
});

const HeatmapLayer = forwardRef<HeatmapLayerRef, HeatmapLayerProps>(({ messages }, ref) => {
  const map = useMap();
  const layerRef = useRef<any>(null);

  useImperativeHandle(ref, () => ({
      ping: (lat: number, lng: number) => {
          if (layerRef.current) {
              layerRef.current.addPing(lat, lng);
          }
      }
  }));

  useEffect(() => {
    if (!map) return;

    if (!layerRef.current) {
        // @ts-ignore
        layerRef.current = new GlowLayer(messages);
        map.addLayer(layerRef.current);
    } else {
        layerRef.current.setData(messages);
    }
  }, [map, messages]);

  // Clean up
  useEffect(() => {
      return () => {
          if (layerRef.current && map) {
              map.removeLayer(layerRef.current);
              layerRef.current = null;
          }
      }
  }, [map]);

  return null;
});

export default HeatmapLayer;