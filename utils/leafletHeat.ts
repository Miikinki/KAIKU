import * as L from 'leaflet';

// PERFORMANCE TUNING
// Keep High Res (1) to prevent aliasing/shifting dots.
const RES = 1; 

/*
 (c) 2014, Vladimir Agafonkin
 simpleheat, a tiny JavaScript library for drawing heatmaps with Canvas
 https://github.com/mourner/simpleheat
*/
class SimpleHeat {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    width: number;
    height: number;
    _max: number;
    _data: number[][];
    _circle: HTMLCanvasElement;
    _r: number;
    _grad: Uint8ClampedArray | undefined;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas = typeof canvas === 'string' ? document.getElementById(canvas) as HTMLCanvasElement : canvas;
        this.ctx = canvas.getContext('2d', { alpha: true }) as CanvasRenderingContext2D; 
        this.width = canvas.width;
        this.height = canvas.height;
        this._max = 1;
        this._data = [];
        this._r = 25;
        this._circle = document.createElement('canvas'); // Pre-rendered brush
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

    radius(r: number, blur: number) {
        blur = blur === undefined ? 15 : blur;

        // create a blurred circle image that we'll use for drawing points
        const circle = this._circle;
        const ctx = circle.getContext('2d')!;
        const r2 = this._r = r + blur;

        circle.width = circle.height = r2 * 2;

        ctx.shadowOffsetX = ctx.shadowOffsetY = r2 * 2;
        ctx.shadowBlur = blur;
        
        // KAIKU FIX: Use CYAN as the base shadow color instead of BLACK.
        // This prevents "black spots" appearing at the edges of the gradient.
        // Even if colorization misses a pixel, it will be a faint cyan glow.
        ctx.shadowColor = '#22d3ee'; 

        ctx.beginPath();
        ctx.arc(-r2, -r2, r, 0, Math.PI * 2, true);
        ctx.closePath();
        ctx.fill();

        return this;
    }

    resize() {
        this.width = this.canvas.width;
        this.height = this.canvas.height;
    }

    gradient(grad: Record<number, string>) {
        // create a 256x1 gradient that we'll use to turn a grayscale heatmap into a colored one
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        const gradient = ctx.createLinearGradient(0, 0, 0, 256);

        canvas.width = 1;
        canvas.height = 256;

        for (const i in grad) {
            gradient.addColorStop(+i, grad[i]);
        }

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 1, 256);

        this._grad = ctx.getImageData(0, 0, 1, 256).data;

        return this;
    }

    draw(minOpacity: number) {
        const ctx = this.ctx;

        ctx.clearRect(0, 0, this.width, this.height);

        // draw a heatmap by putting a blurred circle at each data point
        for (let i = 0, len = this._data.length, p; i < len; i++) {
            p = this._data[i];
            ctx.globalAlpha = Math.max(p[2] / this._max, minOpacity === undefined ? 0.05 : minOpacity);
            ctx.drawImage(this._circle, p[0] - this._r, p[1] - this._r);
        }

        // colorize the heatmap, using opacity value of each pixel to get the right color from our gradient
        const colored = ctx.getImageData(0, 0, this.width, this.height);
        this._colorize(colored.data, this._grad!);
        ctx.putImageData(colored, 0, 0);

        return this;
    }

    _colorize(pixels: Uint8ClampedArray, gradient: Uint8ClampedArray) {
        for (let i = 0, len = pixels.length, j; i < len; i += 4) {
            j = pixels[i + 3] * 4; // get gradient color from opacity value

            if (j) {
                pixels[i] = gradient[j];
                pixels[i + 1] = gradient[j + 1];
                pixels[i + 2] = gradient[j + 2];
                // Map the Alpha channel too
                pixels[i + 3] = gradient[j + 3]; 
            }
        }
    }
}

/*
 Leaflet.heat
 */
// @ts-ignore
export const HeatLayer = L.Layer.extend({

    options: {
        minOpacity: 0.05,
        maxZoom: 18,
        radius: 25,
        blur: 15,
        max: 1.0
    },

    initialize: function (latlngs: any[], options: any) {
        this._latlngs = latlngs;
        L.setOptions(this, options);
    },

    setLatLngs: function (latlngs: any[]) {
        this._latlngs = latlngs;
        return this.redraw();
    },

    addLatLng: function (latlng: any) {
        this._latlngs.push(latlng);
        return this.redraw();
    },

    setOptions: function (options: any) {
        L.setOptions(this, options);
        if (this._heat) {
            this._updateOptions();
        }
        return this.redraw();
    },

    redraw: function () {
        if (this._heat && !this._frame && this._map && !this._map._animating) {
            this._frame = L.Util.requestAnimFrame(this._redraw, this);
        }
        return this;
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
        const canvas = this._canvas = L.DomUtil.create('canvas', 'leaflet-heatmap-layer leaflet-layer') as HTMLCanvasElement;
        
        const originProp = L.DomUtil.testProp(['transformOrigin', 'WebkitTransformOrigin', 'msTransformOrigin']);
        if (originProp) {
            (canvas.style as any)[originProp] = '0 0';
        }

        // REMOVED mix-blend-mode: screen. 
        // We rely on the base brush being cyan and proper alpha mapping to blend.
        // This fixes mobile compositing artifacts ("moving dots").

        const size = this._map.getSize();
        
        // Full resolution
        canvas.width = size.x / RES;
        canvas.height = size.y / RES;
        
        canvas.style.width = size.x + 'px';
        canvas.style.height = size.y + 'px';

        const animated = this._map.options.zoomAnimation && L.Browser.any3d;
        L.DomUtil.addClass(canvas, 'leaflet-zoom-' + (animated ? 'animated' : 'hide'));

        this._heat = new SimpleHeat(canvas);
        this._updateOptions();
    },

    _updateOptions: function () {
        this._heat.radius(
            (this.options.radius || this._heat.defaultRadius) / RES, 
            this.options.blur / RES
        );

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

        if (this._heat._width !== size.x / RES) {
            this._canvas.width = this._heat._width = size.x / RES;
            this._canvas.style.width = size.x + 'px';
        }
        if (this._heat._height !== size.y / RES) {
            this._canvas.height = this._heat._height = size.y / RES;
            this._canvas.style.height = size.y + 'px';
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
        
        const bounds = new L.Bounds(
            L.point([-r * RES, -r * RES]),
            size.add([r * RES, r * RES])
        );

        const max = this.options.max === undefined ? 1 : this.options.max;
        
        // Grid aggregation logic
        const cellSize = r / 2; 
        const grid: any[] = [];
        const panePos = this._map._getMapPanePos();
        const offsetX = (panePos.x % (cellSize * RES)) / RES;
        const offsetY = (panePos.y % (cellSize * RES)) / RES;
        
        let i, len, p, cell, x, y, j, len2, k;

        for (i = 0, len = this._latlngs.length; i < len; i++) {
            p = this._map.latLngToContainerPoint(this._latlngs[i]);
            
            if (bounds.contains(p)) {
                const sX = p.x / RES;
                const sY = p.y / RES;

                x = Math.floor((sX - offsetX) / cellSize) + 2;
                y = Math.floor((sY - offsetY) / cellSize) + 2;

                const alt = this._latlngs[i].alt !== undefined ? this._latlngs[i].alt :
                    this._latlngs[i][2] !== undefined ? +this._latlngs[i][2] : 1;
                
                k = alt;

                grid[y] = grid[y] || [];
                cell = grid[y][x];

                if (!cell) {
                    grid[y][x] = [sX, sY, k];
                } else {
                    cell[0] = (cell[0] * cell[2] + sX * k) / (cell[2] + k); 
                    cell[1] = (cell[1] * cell[2] + sY * k) / (cell[2] + k); 
                    cell[2] += k; 
                }
            }
        }

        for (i = 0, len = grid.length; i < len; i++) {
            if (grid[i]) {
                for (j = 0, len2 = grid[i].length; j < len2; j++) {
                    cell = grid[i][j];
                    if (cell) {
                        data.push([
                            Math.round(cell[0]),
                            Math.round(cell[1]),
                            Math.min(cell[2], max)
                        ]);
                    }
                }
            }
        }

        this._heat.data(data).draw(this.options.minOpacity);
        this._frame = null;
    },

    _animateZoom: function (e: any) {
        const scale = this._map.getZoomScale(e.zoom);
        const offset = this._map._latLngToNewLayerPoint(this._map.getBounds().getNorthWest(), e.zoom, e.center);

        L.DomUtil.setTransform(this._canvas, offset, scale);
    }
});
