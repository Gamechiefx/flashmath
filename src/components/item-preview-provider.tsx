"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { Item } from "@/lib/items";

interface ItemPreviewContextType {
    previewItem: Item | null;
    previewRect: DOMRect | null;
    setPreviewItem: (item: Item | null, rect?: DOMRect | null) => void;
}

const ItemPreviewContext = createContext<ItemPreviewContextType | undefined>(undefined);

export function ItemPreviewProvider({ children }: { children: ReactNode }) {
    const [previewItem, setPreviewItemState] = useState<Item | null>(null);
    const [previewRect, setPreviewRect] = useState<DOMRect | null>(null);

    const setPreviewItem = (item: Item | null, rect?: DOMRect | null) => {
        setPreviewItemState(item);
        setPreviewRect(rect || null);
    };

    return (
        <ItemPreviewContext.Provider value={{ previewItem, previewRect, setPreviewItem }}>
            {children}
        </ItemPreviewContext.Provider>
    );
}

export function useItemPreview() {
    const context = useContext(ItemPreviewContext);
    if (!context) {
        throw new Error("useItemPreview must be used within an ItemPreviewProvider");
    }
    return context;
}
