import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { useMap } from 'react-leaflet';
import { ChatMessage } from '../types';
import L from 'leaflet';
import { MESSAGE_LIFESPAN_MS } from '../constants';

interface HeatmapLayerProps {
  messages: ChatMessage[];
}

export interface HeatmapLayerRef {
    // Ping removed, no longer needed
}

// --- VISUAL CONSTANTS ---
// Matches the CSS scan animation speed (4 seconds per rotation)
const RADAR_CYCLE_MS = 4000; 

// @ts-ignore
const GlowLayer = L.Layer.extend({
    initialize: function (data: ChatMessage[]) {
        this._data = data;
        this._animating = false;
        this._rafId = null;
    },

    setData: function (data: ChatMessage[]) {
        this._data = data;
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
        const centerX = width / 2;
        const centerY = height / 2;

        ctx.clearRect(0, 0, width, height);

        const zoom = this._map.getZoom();
        const bounds = this._map.getBounds();
        const now = Date.now();

        // --- AUTOMATIC RADAR SWEEP LOGIC ---
        // Calculate current beam angle (0 to 2PI)
        const cycleProgress = (now % RADAR_CYCLE_MS) / RADAR_CYCLE_MS;
        const sweepAngle = (cycleProgress * Math.PI * 2) - (Math.PI / 2);
        
        // Define beam width in radians
        const beamWidth = 0.6; // ~35 degrees
        
        // STRICT SIZE LIMIT: Reduced to 124px (from 128px) to safely stay inside the border
        const visualRadarRadius = 124 * dpr; 

        // 2. Base Scale Logic
        let baseRadius = 20 * dpr; 
        let baseIntensity = 0.15; 

        if (zoom < 5) { baseRadius = 10 * dpr; baseIntensity = 0.3; } 
        else if (zoom < 8) { baseRadius = 25 * dpr; baseIntensity = 0.15; }
        else if (zoom < 10) { baseRadius = 50 * dpr; baseIntensity = 0.12; }
        else { baseRadius = 100 * dpr; baseIntensity = 0.08; }

        ctx.globalCompositeOperation = 'screen'; 

        // 3. Draw Loop
        this._data.forEach((msg: ChatMessage) => {
            // Margin check for performance
            const margin = 0.5;
            if (msg.location.lat > bounds.getNorth() + margin || 
                msg.location.lat < bounds.getSouth() - margin ||
                msg.location.lng > bounds.getEast() + margin || 
                msg.location.lng < bounds.getWest() - margin) return;

            const p = this._map.latLngToContainerPoint([msg.location.lat, msg.location.lng]);
            const x = p.x * dpr;
            const y = p.y * dpr;

            // --- A. DECAY COLOR LOGIC ---
            const expiry = msg.expiresAt || (msg.timestamp + MESSAGE_LIFESPAN_MS);
            const msLeft = expiry - now;
            const hoursLeft = msLeft / (1000 * 60 * 60);
            const totalAgeHours = (now - msg.timestamp) / (1000 * 60 * 60);

            let r=34, g=211, b=238; // Default Cyan

            if (totalAgeHours < 1) {
                r=150; g=230; b=255; 
            } else if (hoursLeft < 4) {
                r=239; g=68; b=68; 
            }

            // --- B. RADAR BEAM INTERACTION ---
            // Calculate angle AND distance of this point relative to screen center
            const dx = x - centerX;
            const dy = y - centerY;
            const distFromCenter = Math.sqrt(dx*dx + dy*dy);
            
            let radarBoost = 0;

            // CRITICAL FIX: Only apply sweep effect if inside the visual radar ring
            if (distFromCenter <= visualRadarRadius) {
                const pointAngle = Math.atan2(dy, dx); 
                
                // Calculate angular difference clockwise
                let angleDiff = sweepAngle - pointAngle;
                
                // Normalize to -PI to +PI
                while (angleDiff <= -Math.PI) angleDiff += Math.PI * 2;
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

                // Check if point is "inside" the beam
                if (angleDiff >= 0 && angleDiff < beamWidth) {
                    radarBoost = 1 - (angleDiff / beamWidth);
                }
            }

            // --- C. PULSE ANIMATION ---
            const uniqueOffset = (msg.id.charCodeAt(0) * 100) + (msg.id.charCodeAt(msg.id.length-1) * 50);
            const pulseSpeed = hoursLeft < 4 ? 0.01 : 0.003;
            const breathing = 1.0 + Math.sin((now * pulseSpeed) + uniqueOffset) * 0.3;

            let radius = baseRadius * breathing;
            let intensity = baseIntensity * breathing;
            
            // Apply Radar Boost
            if (radarBoost > 0) {
                // Increase intensity and radius significantly when hit
                intensity += (radarBoost * 0.6); // Flash bright
                radius *= (1 + (radarBoost * 0.2)); // Slight swell

                // Turn White
                r = Math.min(255, r + (255-r) * radarBoost);
                g = Math.min(255, g + (255-g) * radarBoost);
                b = Math.min(255, b + (255-b) * radarBoost);
            }

            if (msg.score > 5) { radius *= 1.2; intensity *= 1.2; }
            if (msg.score > 20) { radius *= 1.4; intensity *= 1.3; }

            intensity = Math.min(intensity, 0.9);

            // --- D. DRAW ---
            const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
            grad.addColorStop(0, `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${intensity})`);
            grad.addColorStop(0.4, `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${intensity * 0.3})`);
            grad.addColorStop(1, `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, 0)`);

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        });

        ctx.globalCompositeOperation = 'source-over';
    }
});

const HeatmapLayer = forwardRef<HeatmapLayerRef, HeatmapLayerProps>(({ messages }, ref) => {
  const map = useMap();
  const layerRef = useRef<any>(null);

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