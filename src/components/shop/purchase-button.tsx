"use client";

import { NeonButton } from "@/components/ui/neon-button";
import { purchaseItem } from "@/lib/actions/shop";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

interface PurchaseButtonProps {
    itemId: string;
    price: number;
    userCoins: number;
}

import { useSession } from "next-auth/react";

export function PurchaseButton({ itemId, price, userCoins }: PurchaseButtonProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();
    const { update } = useSession();

    const handlePurchase = async () => {
        if (userCoins < price) return;

        setLoading(true);
        setError(null);
        try {
            const result = await purchaseItem(itemId);
            if (result.error) {
                setError(result.error);
            } else {
                // Success
                await update();
                router.refresh();
            }
        } catch (_err) {
            setError("Purchase failed");
        } finally {
            setLoading(false);
        }
    };

    const canAfford = userCoins >= price;

    return (
        <div className="flex flex-col items-end gap-2">
            <NeonButton
                onClick={handlePurchase}
                disabled={loading || !canAfford}
                className={!canAfford ? "opacity-50 grayscale cursor-not-allowed" : ""}
                variant="primary"
            >
                {loading ? <Loader2 className="animate-spin" /> : "BUY NOW"}
            </NeonButton>
            {!canAfford && <span className="text-[10px] text-red-400 uppercase font-bold">Insufficient Funds</span>}
            {error && <span className="text-[10px] text-red-500 uppercase font-bold">{error}</span>}
        </div>
    );
}
