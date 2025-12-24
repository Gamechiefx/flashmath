"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

import { useRouter } from "next/navigation";

export function ShopTimer() {
    const [timeLeft, setTimeLeft] = useState("");
    const router = useRouter();

    useEffect(() => {
        const calculateTimeLeft = () => {
            const now = new Date();
            const minutes = now.getUTCMinutes();
            const seconds = now.getUTCSeconds();

            // We rotate every 5 minutes (0, 5, 10...)
            const currentBlock = Math.floor(minutes / 5);
            const nextBlock = currentBlock + 1;
            const nextRotationMinutes = nextBlock * 5;

            let diffMinutes = nextRotationMinutes - minutes - 1;
            let diffSeconds = 60 - seconds;

            if (diffSeconds === 60) {
                diffSeconds = 0;
                diffMinutes += 1;
            }

            return { str: `${diffMinutes}:${diffSeconds.toString().padStart(2, '0')}`, totalSeconds: diffMinutes * 60 + diffSeconds };
        };

        const timer = setInterval(() => {
            const result = calculateTimeLeft();
            setTimeLeft(result.str);

            // If we just entered a new 5-minute block (minutes % 5 === 0 and seconds are low)
            // Trigger refresh once.
            const now = new Date();
            if (now.getUTCMinutes() % 5 === 0 && now.getUTCSeconds() < 2) {
                // Debounce? The interval is 1s, so this might fire twice.
                // We can rely on Next.js routher.refresh() being cheap or add a ref.
                console.log("Refreshing shop...");
                router.refresh();
            }
        }, 1000);

        setTimeLeft(calculateTimeLeft().str);

        return () => clearInterval(timer);
    }, [router]);

    return (
        <span className="text-white flex items-center gap-2">
            {timeLeft}
        </span>
    );
}
