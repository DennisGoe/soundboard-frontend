// ToastService.ts
interface ToastMessage {
    translationKey: string;
    bgColor?: string;
    iconName?: string;
    textColor?: string;
}

class ToastService {
    private static instance: ToastService;
    private subscriber: ((message: ToastMessage | null) => void) | null = null;

    private constructor() {}

    public static getInstance(): ToastService {
        if (!ToastService.instance) {
            ToastService.instance = new ToastService();
        }
        return ToastService.instance;
    }

    public subscribe(subscriber: (message: ToastMessage | null) => void): void {
        this.subscriber = subscriber;
    }

    public show(message: ToastMessage): void {
        if (this.subscriber) {
            this.subscriber(message);
            setTimeout(() => this.clear(), 3000); // Disappear after 3 seconds
        }
    }

    private clear(): void {
        if (this.subscriber) {
            this.subscriber(null);
        }
    }
}

export const ToastManager = ToastService.getInstance();
