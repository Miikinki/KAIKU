export type HapticType = 'light' | 'heavy' | 'success' | 'error';

export const triggerHaptic = (type: HapticType) => {
    if (typeof navigator === 'undefined' || !navigator.vibrate) return;

    try {
        switch (type) {
            case 'light':
                // Subtle tick for UI interactions (tab switch, refresh)
                navigator.vibrate(15); 
                break;
            case 'heavy':
                // Strong feedback for impactful actions (Boost)
                navigator.vibrate(60);
                break;
            case 'success':
                // Rhythmic pulse for completion
                navigator.vibrate([50, 50, 50]);
                break;
            case 'error':
                // Long buzz for warnings/errors/deletions
                navigator.vibrate(200);
                break;
        }
    } catch (e) {
        // Fail silently on devices that block or don't support vibration
    }
};