import { getAnonymousID } from './storageService';

export const NotificationService = {
    requestPermission: async (): Promise<boolean> => {
        if (!('Notification' in window)) {
            console.warn("This browser does not support desktop notification");
            return false;
        }

        if (Notification.permission === "granted") {
            return true;
        }

        if (Notification.permission !== "denied") {
            const permission = await Notification.requestPermission();
            return permission === "granted";
        }

        return false;
    },

    sendNotification: (title: string, body: string, icon?: string) => {
        if (Notification.permission === "granted") {
            try {
                // On mobile, notifications might be limited if app is not installed/PWA
                new Notification(title, {
                    body,
                    icon: icon || '/kaiku-icon.svg',
                    vibrate: [200, 100, 200],
                    tag: 'kaiku-alert'
                } as any);
            } catch (e) {
                console.error("Notification failed", e);
            }
        }
    },

    // Simulated check for "High Activity"
    checkActivitySpike: (messageCount: number): boolean => {
        // Logic: If > 10 messages in last few mins (handled by caller), trigger
        return messageCount > 10;
    }
};