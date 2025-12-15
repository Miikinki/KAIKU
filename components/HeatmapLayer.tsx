import React, { useEffect, useRef, forwardRef } from 'react';
import { useMap } from 'react-leaflet';
import { ChatMessage } from '../types';
import L from 'leaflet';
import { MESSAGE_LIFESPAN_MS } from '../constants';

interface HeatmapLayerProps {
  messages: ChatMessage[];
}

export interface HeatmapLayerRef {}

// @ts-ignore
const GlowLayer = L.Layer.extend({
    initialize: function (data: ChatMessage[]) {
        this._data = data;
    },

    setData: function (data: ChatMessage[]) {
        this._data = data;
        this._redraw();
    },

    onAdd: function (map: L.Map) {
        this._map = map;

        if (!this._canvas) {
            this._initCanvas();
        }

        // CRITICAL FIX: Attach to the 'overlayPane' so it moves with the map during drag.
        // Previously it was attached to getContainer() which made it static on screen.
        this.getPane().appendChild(this._canvas);

        // We only redraw on 'moveend' (after drag finishes).
        // During drag, the overlayPane CSS transform handles the visual movement perfectly.
        map.on('moveend', this._reset, this);
        map.on('zoomanim', this._animateZoom, this);
        
        this._reset();
    },

    onRemove: function (map: L.Map) {
        if (this._canvas) {
             L.DomUtil.remove(this._canvas);
        }
        map.off('moveend', this._reset, this);
        map.off('zoomanim', this._animateZoom, this);
    },

    addTo: function (map: L.Map) {
        map.addLayer(this);
        return this;
    },

    _initCanvas: function () {
        const canvas = this._canvas = L.DomUtil.create('canvas', 'leaflet-glow-layer-hud leaflet-zoom-animated');
        canvas.style.position = 'absolute';
        // 'transform-origin' is handled by Leaflet's L.DomUtil.setPosition usually, but strictly 0 0 helps for overlay
        canvas.style.transformOrigin = '50% 50%'; 
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '400';
    },

    _reset: function () {
        const map = this._map;
        const bounds = map.getBounds();
        const topLeft = map.containerPointToLayerPoint([0, 0]);
        
        // Position the canvas at the top-left of the current view, in layer coordinates
        L.DomUtil.setPosition(this._canvas, topLeft);

        const size = map.getSize();
        const dpr = window.devicePixelRatio || 1;

        // Resize canvas to cover the viewport
        if (this._canvas.width !== size.x * dpr || this._canvas.height !== size.y * dpr) {
            this._canvas.width = size.x * dpr;
            this._canvas.height = size.y * dpr;
            this._canvas.style.width = size.x + 'px';
            this._canvas.style.height = size.y + 'px';
        }

        this._redraw();
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

        // 1. Base Scale Logic
        let baseRadius = 20 * dpr; 
        let baseIntensity = 0.15; 

        if (zoom < 5) { baseRadius = 10 * dpr; baseIntensity = 0.3; } 
        else if (zoom < 8) { baseRadius = 25 * dpr; baseIntensity = 0.15; }
        else if (zoom < 10) { baseRadius = 50 * dpr; baseIntensity = 0.12; }
        else { baseRadius = 100 * dpr; baseIntensity = 0.08; }

        ctx.globalCompositeOperation = 'screen'; 

        // 2. Draw Loop
        // Note: latLngToContainerPoint returns coords relative to the top-left of the viewport.
        // Since we positioned our canvas at the top-left of the viewport (in _reset),
        // these coordinates map 1:1 to our canvas pixels.
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
                r=150; g=230; b=255; // White-ish for new
            } else if (hoursLeft < 4) {
                r=239; g=68; b=68; // Red for dying
            }

            let radius = baseRadius;
            let intensity = baseIntensity;
            
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
    },
    
    // Hook into Leaflet's zoom animation to scale the canvas smoothly
    _animateZoom: function (e: any) {
        const scale = this._map.getZoomScale(e.zoom);
        const offset = this._map._latLngToNewLayerPoint(this._map.getBounds().getNorthWest(), e.zoom, e.center);

        L.DomUtil.setTransform(this._canvas, offset, scale);
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