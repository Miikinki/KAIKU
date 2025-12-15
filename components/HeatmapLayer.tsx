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
        // const centerX = width / 2;
        // const centerY = height / 2;

        ctx.clearRect(0, 0, width, height);

        const zoom = this._map.getZoom();
        const bounds = this._map.getBounds();
        const now = Date.now();

        // 1. Base Scale Logic
        let baseRadius = 20 * dpr; 
        let baseIntensity = 0.15; 

        if (zoom < 5) { baseRadius = 10 * dpr; baseIntensity = 0.3; } 
        else if (zoom < 8) { baseRadius = 25 * dpr; baseIntensity = 0.15; }
        else if (zoom < 10) { baseRadius = 50 * dpr; baseIntensity = 0.12; }
        else { baseRadius = 100 * dpr; baseIntensity = 0.08; }

        ctx.globalCompositeOperation = 'screen'; 

        // 2. Draw Loop
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

            // --- B. PULSE ANIMATION (Breathing Only) ---
            // No radar sweep math here anymore.
            
            const uniqueOffset = (msg.id.charCodeAt(0) * 100) + (msg.id.charCodeAt(msg.id.length-1) * 50);
            const pulseSpeed = hoursLeft < 4 ? 0.01 : 0.003;
            const breathing = 1.0 + Math.sin((now * pulseSpeed) + uniqueOffset) * 0.3;

            let radius = baseRadius * breathing;
            let intensity = baseIntensity * breathing;
            
            if (msg.score > 5) { radius *= 1.2; intensity *= 1.2; }
            if (msg.score > 20) { radius *= 1.4; intensity *= 1.3; }

            intensity = Math.min(intensity, 0.9);

            // --- C. DRAW ---
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