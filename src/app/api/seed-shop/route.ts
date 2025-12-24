import { forceSeedShop } from "@/lib/actions/seed";
import { NextResponse } from "next/server";

export async function GET() {
    const result = await forceSeedShop();
    return NextResponse.json(result);
}
