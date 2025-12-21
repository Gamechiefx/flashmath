import { handlers } from "@/auth";
import { type NextRequest } from "next/server";

export const GET = (req: NextRequest) => handlers.GET(req);
export const POST = (req: NextRequest) => handlers.POST(req);
