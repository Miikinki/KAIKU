import React from 'react';
import { CircleMarker } from 'react-leaflet';

interface HeatmapLayerProps {
    points: [number, number, number][]; // lat, lng, intensity
    options: {
        radius: number; // This comes in as a pixel size from ChatMap
        blur: number;
        max?: number;
        minOpacity?: number;
        gradient?: Record<number, string>;
        maxZoom?: number;
    }
}

/**
 * STABLE HEATMAP IMPLEMENTATION
 * 
 * Instead of using a custom Canvas layer (which causes drift/projection errors),
 * we render individual CircleMarkers. 
 * 
 * - ACCURACY: 100% (Leaflet handles the projection).
 * - AESTHETIC: We use CSS classes (.heatmap-marker) defined in index.html to apply a blur filter,
 *   making them look like glowing orbs.
 */
const HeatmapLayer: React.FC<HeatmapLayerProps> = ({ points, options }) => {
    
    // We determine the CSS class based on the radius (zoom level proxy).
    // Larger radius = more blur (atmospheric). Smaller radius = sharper (precise).
    const className = options.radius > 20 ? 'heatmap-marker' : 'heatmap-marker-sharp';

    return (
        <>
            {points.map((p, index) => {
                const [lat, lng, intensity] = p;
                
                // Calculate opacity based on intensity
                // Base opacity 0.3 + intensity bonus, capped at 0.8
                const opacity = Math.min(0.3 + (intensity * 0.2), 0.8);

                // If zoom is very far out (radius is small), we make dots brighter/solid
                const isFarOut = options.radius < 10;
                
                return (
                    <CircleMarker
                        key={`${lat}-${lng}-${index}`}
                        center={[lat, lng]}
                        radius={options.radius}
                        pathOptions={{
                            stroke: false,
                            fillColor: '#06b6d4', // Cyan-500
                            fillOpacity: isFarOut ? 0.8 : opacity,
                            className: isFarOut ? '' : className // Don't blur when dots are tiny
                        }}
                        eventHandlers={{
                            click: () => {
                                // Optional: Handle click on a heat spot
                            }
                        }}
                    />
                );
            })}
        </>
    );
};

export default HeatmapLayer;