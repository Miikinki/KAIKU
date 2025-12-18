import React, { useEffect, useRef, forwardRef } from 'react';
import { useMap } from 'react-leaflet';
import { ChatMessage } from '../types';
import L from 'leaflet';
import { HIGH_SIGNAL_THRESHOLD } from '../constants';

interface HeatmapLayerProps {
  messages: ChatMessage[];
}

export interface HeatmapLayerRef {}

// @ts-ignore
const GlowLayer = L.Layer.extend({
    initialize: function (data: ChatMessage[]) {
        this._data = data;
        this._buffer = 50; 
        this._hidden = false;
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

        this.getPane().appendChild(this._canvas);

        map.on('moveend', this._reset, this);
        map.on('zoomanim', this._animateZoom, this);
        map.on('movestart', this._hide, this);
        map.on('zoomstart', this._hide, this);
        
        this._reset();
    },

    onRemove: function (map: L.Map) {
        if (this._canvas) {
             L.DomUtil.remove(this._canvas);
        }
        map.off('moveend', this._reset, this);
        map.off('zoomanim', this._animateZoom, this);
        map.off('movestart', this._hide, this);
        map.off('zoomstart', this._hide, this);
    },

    addTo: function (map: L.Map) {
        map.addLayer(this);
        return this;
    },

    _initCanvas: function () {
        const canvas = this._canvas = L.DomUtil.create('canvas', 'leaflet-glow-layer-hud leaflet-zoom-animated');
        canvas.style.position = 'absolute';
        canvas.style.transformOrigin = '0 0'; 
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '350'; // Below clusters/markers (400+)
        canvas.style.transition = 'opacity 0.2s linear';
        canvas.style.opacity = '1';
    },

    _hide: function() {
        if (this._canvas) {
            this._canvas.style.opacity = '0';
            this._hidden = true;
        }
    },

    _reset: function () {
        const map = this._map;
        const size = map.getSize();
        const dpr = window.devicePixelRatio || 1;
        const buffer = this._buffer;

        this._topLeftLatLng = map.containerPointToLatLng([-buffer, -buffer]);
        
        const topLeft = map.containerPointToLayerPoint([-buffer, -buffer]);
        L.DomUtil.setPosition(this._canvas, topLeft);

        const width = size.x + (buffer * 2);
        const height = size.y + (buffer * 2);

        if (this._canvas.width !== width * dpr || this._canvas.height !== height * dpr) {
            this._canvas.width = width * dpr;
            this._canvas.height = height * dpr;
            this._canvas.style.width = width + 'px';
            this._canvas.style.height = height + 'px';
        }

        this._redraw();
        
        if (this._canvas) {
            this._canvas.style.opacity = '1';
            this._hidden = false;
        }
    },

    _redraw: function () {
        if (!this._map || !this._canvas) return;

        const ctx = this._canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const width = this._canvas.width;
        const height = this._canvas.height;
        const buffer = this._buffer;

        ctx.clearRect(0, 0, width, height);

        const zoom = this._map.getZoom();
        const bounds = this._map.getBounds();

        // SIGNAL FOG STYLE CONFIGURATION
        // Monochromatic Cyan/Teal
        
        let baseRadius = 40 * dpr; // Increased radius for "Fog" effect
        let baseIntensity = 0.1;   // Lower intensity per point for smoother blend

        // Adjust based on zoom to keep density consistent
        if (zoom < 13) {
            // Should be handled by clusters, but fallback just in case
            baseRadius = 20 * dpr; 
            baseIntensity = 0.05;
        } 
        else if (zoom < 15) { baseRadius = 60 * dpr; baseIntensity = 0.15; }
        else if (zoom < 17) { baseRadius = 100 * dpr; baseIntensity = 0.12; }
        else { baseRadius = 150 * dpr; baseIntensity = 0.1; }

        ctx.globalCompositeOperation = 'screen'; 

        this._data.forEach((msg: ChatMessage) => {
            // FILTER: Only show signals with positive score
            if (msg.score <= 0) return;

            const margin = 0.5; 
            if (msg.location.lat > bounds.getNorth() + margin || 
                msg.location.lat < bounds.getSouth() - margin ||
                msg.location.lng > bounds.getEast() + margin || 
                msg.location.lng < bounds.getWest() - margin) return;

            const p = this._map.latLngToContainerPoint([msg.location.lat, msg.location.lng]);
            
            const x = (p.x + buffer) * dpr;
            const y = (p.y + buffer) * dpr;

            if (x < -baseRadius || x > width + baseRadius || y < -baseRadius || y > height + baseRadius) return;

            // MONOCHROMATIC CYAN FOG
            // Cyan-400: 34, 211, 238
            const r=34, g=211, b=238; 

            let radius = baseRadius;
            let intensity = baseIntensity;
            
            // COLD START TUNING:
            // Boost significantly at HIGH_SIGNAL_THRESHOLD (+5) so the map feels alive quickly.
            if (msg.score >= HIGH_SIGNAL_THRESHOLD) { // +5
                radius *= 1.5; 
                intensity *= 1.5; 
            } else if (msg.score >= 2) {
                // Mild boost for just getting started
                radius *= 1.2;
                intensity *= 1.2;
            }

            // Cap intensity
            intensity = Math.min(intensity, 0.6);

            const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
            grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${intensity})`);
            grad.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, ${intensity * 0.4})`);
            grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        });

        ctx.globalCompositeOperation = 'source-over';
    },
    
    _animateZoom: function (e: any) {
        if (!this._hidden && this._canvas) {
             this._canvas.style.opacity = '0';
             this._hidden = true;
        }

        if (!this._topLeftLatLng) return;

        const scale = this._map.getZoomScale(e.zoom);
        const offset = this._map._latLngToNewLayerPoint(this._topLeftLatLng, e.zoom, e.center);

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