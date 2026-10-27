import { handleRequest } from "@/server/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = handleRequest;
export const POST = handleRequest;
