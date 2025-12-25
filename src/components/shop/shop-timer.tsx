"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function ShopTimer() {
    const [timeLeft, setTimeLeft] = useState("");
    const router = useRouter();

    useEffect(() => {
        const calculateTimeUntilMidnightET = () => {
            const now = new Date();

            // Get current time in Eastern timezone
            const easternNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));

            // Calculate midnight Eastern (tomorrow)
            const midnightET = new Date(easternNow);
            midnightET.setDate(midnightET.getDate() + 1);
            midnightET.setHours(0, 0, 0, 0);

            // Get the difference in milliseconds
            const diffMs = midnightET.getTime() - easternNow.getTime();

            const hours = Math.floor(diffMs / (1000 * 60 * 60));
            const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

            return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        };

        const timer = setInterval(() => {
            setTimeLeft(calculateTimeUntilMidnightET());

            // Refresh at midnight Eastern
            const now = new Date();
            const easternNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
            if (easternNow.getHours() === 0 && easternNow.getMinutes() === 0 && easternNow.getSeconds() < 2) {
                console.log("Refreshing shop at midnight...");
                router.refresh();
            }
        }, 1000);

        setTimeLeft(calculateTimeUntilMidnightET());

        return () => clearInterval(timer);
    }, [router]);

    return (
        <span className="text-white flex items-center gap-2">
            {timeLeft}
        </span>
    );
}
