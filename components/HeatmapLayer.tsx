import React, { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import * as L from 'leaflet';

interface HeatmapLayerProps {
    polygons: { coords: [number, number][], count: number }[]; // Array of polygon coordinates
}

/**
 * H3 HEXAGON GRID RENDERER
 * 
 * Draws hexagonal cells.
 */
const HeatmapLayer: React.FC<HeatmapLayerProps> = ({ polygons }) => {
    const map = useMap();
    const layerGroupRef = useRef<L.LayerGroup | null>(null);

    useEffect(() => {
        // 1. Clean up previous layer
        if (layerGroupRef.current) {
            map.removeLayer(layerGroupRef.current);
        }

        // 2. Create Canvas Renderer
        const canvasRenderer = L.canvas({ padding: 0.5 });

        // 3. Create Polygons
        const shapes = polygons.map(poly => {
            return L.polygon(poly.coords, {
                renderer: canvasRenderer,
                stroke: true,
                color: '#22d3ee', // Brighter Cyan outline
                weight: 1.5,      // Slightly thicker line for better visibility
                fillColor: '#06b6d4',
                // Base opacity 0.4 ensures single messages are clearly visible. 
                // Increases with density up to 0.8.
                fillOpacity: 0.4 + (Math.min(poly.count, 20) * 0.02), 
                interactive: false
            });
        });

        // 4. Add to Map
        const layerGroup = L.layerGroup(shapes).addTo(map);
        layerGroupRef.current = layerGroup;

        return () => {
            if (map.hasLayer(layerGroup)) {
                map.removeLayer(layerGroup);
            }
        };
    }, [map, polygons]); 

    return null;
};

export default HeatmapLayer;