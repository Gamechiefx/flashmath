"use client";

import { NeonButton } from "@/components/ui/neon-button";
import { equipItem } from "@/lib/actions/shop";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface EquipButtonProps {
    type: string;
    itemId: string;
    isEquipped?: boolean;
}

export function EquipButton({ type, itemId, isEquipped }: EquipButtonProps) {
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleEquip = async () => {
        setLoading(true);
        try {
            const result = await equipItem(type, itemId);
            if (result.success) {
                router.refresh();
            }
        } catch (err) {
            console.error("Equip failed", err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <NeonButton
            onClick={handleEquip}
            disabled={loading}
            variant={isEquipped ? "secondary" : "ghost"}
            size="sm"
            className={cn("w-full text-xs", isEquipped && "bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 border-red-500/20")}
        >
            {loading ? <Loader2 className="animate-spin w-4 h-4" /> : (isEquipped ? "UNEQUIP" : "EQUIP")}
        </NeonButton>
    );
}
