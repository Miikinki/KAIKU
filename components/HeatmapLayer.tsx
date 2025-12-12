import React, { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import * as L from 'leaflet';

// --- SIMPLEHEAT IMPLEMENTATION (Inlined for reliability) ---
// Adapted from: https://github.com/mourner/simpleheat
class SimpleHeat {
    ctx: CanvasRenderingContext2D;
    canvas: HTMLCanvasElement;
    _circle: HTMLCanvasElement;
    _width: number;
    _height: number;
    _max: number;
    _data: number[][];
    _r: number;
    _grad: Uint8ClampedArray | null;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d')!;
        this._width = canvas.width;
        this._height = canvas.height;
        this._max = 1;
        this._data = [];
        this._r = 25;
        this._grad = null;
        this._circle = this._createCircle(this._r, 15); // Default blur
    }

    data(data: number[][]) {
        this._data = data;
        return this;
    }

    max(max: number) {
        this._max = max;
        return this;
    }

    add(point: number[]) {
        this._data.push(point);
        return this;
    }

    clear() {
        this._data = [];
        return this;
    }

    radius(r: number, blur?: number) {
        blur = blur === undefined ? 15 : blur;
        this._createCircle(r, blur);
        this._r = r;
        return this;
    }

    resize() {
        this._width = this.canvas.width;
        this._height = this.canvas.height;
    }

    gradient(grad: Record<number, string>) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        const gradient = ctx.createLinearGradient(0, 0, 0, 256);

        canvas.width = 1;
        canvas.height = 256;

        for (const i in grad) {
            gradient.addColorStop(parseFloat(i), grad[i]);
        }

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 1, 256);

        this._grad = ctx.getImageData(0, 0, 1, 256).data;
        return this;
    }

    draw(minOpacity: number = 0.05) {
        if (!this._circle) return this;

        const ctx = this.ctx;
        ctx.clearRect(0, 0, this._width, this._height);

        // Draw circles
        for (let i = 0, len = this._data.length, p; i < len; i++) {
            p = this._data[i];
            ctx.globalAlpha = Math.min(Math.max(p[2] / this._max, minOpacity), 1);
            ctx.drawImage(this._circle, p[0] - this._r, p[1] - this._r);
        }

        // Colorize
        const colored = ctx.getImageData(0, 0, this._width, this._height);
        this._colorize(colored.data, this._grad);
        ctx.putImageData(colored, 0, 0);

        return this;
    }

    _colorize(pixels: Uint8ClampedArray, gradient: Uint8ClampedArray | null) {
        if (!gradient) return;
        for (let i = 0, len = pixels.length, j; i < len; i += 4) {
            j = pixels[i + 3] * 4; // Get opacity -> gradient index
            if (j) {
                pixels[i] = gradient[j];
                pixels[i + 1] = gradient[j + 1];
                pixels[i + 2] = gradient[j + 2];
            }
        }
    }

    _createCircle(r: number, blur: number) {
        const circle = document.createElement('canvas');
        const ctx = circle.getContext('2d')!;
        const r2 = r + blur;

        circle.width = circle.height = r2 * 2;
        ctx.shadowOffsetX = ctx.shadowOffsetY = r2 * 2;
        ctx.shadowBlur = blur;
        ctx.shadowColor = 'black';

        ctx.beginPath();
        ctx.arc(-r2, -r2, r, 0, Math.PI * 2, true);
        ctx.closePath();
        ctx.fill();

        this._circle = circle;
        return circle;
    }
}

// --- LEAFLET LAYER IMPLEMENTATION ---

const LeafletHeatLayer = L.Layer.extend({
    options: {
        minOpacity: 0.05,
        maxZoom: 18,
        radius: 25,
        blur: 15,
        max: 1.0,
        gradient: {
            0.4: 'blue',
            0.6: 'cyan',
            0.7: 'lime',
            0.8: 'yellow',
            1.0: 'red'
        }
    },

    initialize: function (latlngs: any[], options: any) {
        L.setOptions(this, options);
        this._latlngs = latlngs;
    },

    onAdd: function (map: L.Map) {
        this._map = map;

        if (!this._canvas) {
            this._initCanvas();
        }

        if (this.options.pane) {
            this.getPane().appendChild(this._canvas);
        } else {
            map.getPanes().overlayPane.appendChild(this._canvas);
        }

        map.on('moveend', this._reset, this);

        if (map.options.zoomAnimation && L.Browser.any3d) {
            map.on('zoomanim', this._animateZoom, this);
        }

        this._reset();
    },

    onRemove: function (map: L.Map) {
        if (this.options.pane) {
            this.getPane().removeChild(this._canvas);
        } else {
            map.getPanes().overlayPane.removeChild(this._canvas);
        }

        map.off('moveend', this._reset, this);

        if (map.options.zoomAnimation) {
            map.off('zoomanim', this._animateZoom, this);
        }
    },

    addTo: function (map: L.Map) {
        map.addLayer(this);
        return this;
    },

    _initCanvas: function () {
        const canvas = this._canvas = L.DomUtil.create('canvas', 'leaflet-heatmap-layer leaflet-layer');
        const originProp = L.DomUtil.testProp(['transformOrigin', 'WebkitTransformOrigin', 'msTransformOrigin']);
        
        // @ts-ignore
        canvas.style[originProp] = '50% 50%';

        const size = this._map.getSize();
        canvas.width = size.x;
        canvas.height = size.y;

        const animated = this._map.options.zoomAnimation && L.Browser.any3d;
        L.DomUtil.addClass(canvas, 'leaflet-zoom-' + (animated ? 'animated' : 'hide'));

        this._heat = new SimpleHeat(canvas);
        this._updateOptions();
    },

    _updateOptions: function () {
        this._heat.radius(this.options.radius || this._heat.defaultRadius, this.options.blur);
        if (this.options.gradient) {
            this._heat.gradient(this.options.gradient);
        }
        if (this.options.max) {
            this._heat.max(this.options.max);
        }
    },

    _reset: function () {
        const topLeft = this._map.containerPointToLayerPoint([0, 0]);
        L.DomUtil.setPosition(this._canvas, topLeft);

        const size = this._map.getSize();

        if (this._heat._width !== size.x) {
            this._canvas.width = this._heat._width = size.x;
        }
        if (this._heat._height !== size.y) {
            this._canvas.height = this._heat._height = size.y;
        }

        this._redraw();
    },

    _redraw: function () {
        if (!this._map) {
            return;
        }
        const data = [];
        const r = this._heat._r;
        const size = this._map.getSize();
        const bounds = new L.Bounds(L.point([-r, -r]), size.add([r, r]));

        // Check if max is automated or manual
        const max = this.options.max === undefined ? 1 : this.options.max;
        const maxZoom = this.options.maxZoom === undefined ? this._map.getMaxZoom() : this.options.maxZoom;
        const v = 1 / Math.pow(2, Math.max(0, Math.min(maxZoom - this._map.getZoom(), 12)));
        const cellSize = r / 2;
        const grid: any[] = [];
        const panePos = this._map.getPanes().overlayPane.getBoundingClientRect(); // not used, handled by layer point
        const offsetX = this._map.getPixelOrigin().x;
        const offsetY = this._map.getPixelOrigin().y;

        // Optimization: iterate points
        for (let i = 0, len = this._latlngs.length, p; i < len; i++) {
            p = this._map.latLngToContainerPoint(this._latlngs[i]);
            if (bounds.contains(p)) {
                 // Use the intensity passed in data [lat, lng, intensity] or default to 1
                const intensity = this._latlngs[i].alt !== undefined ? this._latlngs[i].alt : (this._latlngs[i][2] || 1);
                
                // Aggregate via Grid for performance if needed, or just push
                // For simplicity in this adaptation, we push directly but scale by zoom
                data.push([
                    Math.round(p.x),
                    Math.round(p.y),
                    Math.min(intensity * v, max)
                ]);
            }
        }

        this._heat.data(data).draw(this.options.minOpacity);
    },

    _animateZoom: function (e: any) {
        const scale = this._map.getZoomScale(e.zoom);
        const offset = this._map._latLngToNewLayerPoint(this._map.getCenter(), e.zoom, e.center).subtract(this._map._getNewPixelOrigin(e.center, e.zoom));

        L.DomUtil.setTransform(this._canvas, offset, scale);
    }
});


interface HeatmapLayerProps {
    points: [number, number, number][]; // lat, lng, intensity
    options: {
        radius: number;
        blur: number;
        max?: number;
        minOpacity?: number;
        gradient?: Record<number, string>;
    }
}

const HeatmapLayer: React.FC<HeatmapLayerProps> = ({ points, options }) => {
    const map = useMap();

    useEffect(() => {
        // @ts-ignore
        const layer = new LeafletHeatLayer(points, options);
        layer.addTo(map);

        return () => {
            map.removeLayer(layer);
        };
    }, [map, points, options.radius, options.blur, options.gradient]); // Re-create if options change

    return null;
};

export default HeatmapLayer;
