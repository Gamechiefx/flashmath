"use server";

import { execute, queryOne, initSchema } from "@/lib/db";
import bcrypt from "bcryptjs";
import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { v4 as uuidv4 } from "uuid";

// Ensure schema exists on first action call
initSchema();

export async function registerUser(formData: FormData) {
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    if (!name || !email || !password) {
        return { error: "Missing required fields" };
    }

    try {
        // Check if user exists
        const existing = queryOne("SELECT id FROM users WHERE email = ?", [email]);
        if (existing) {
            return { error: "Email already registered" };
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const id = uuidv4();

        execute(
            "INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)",
            [id, name, email, hashedPassword]
        );

        // After success, sign them in
        await signIn("credentials", {
            email,
            password,
            redirectTo: "/dashboard",
        });

    } catch (error) {
        if (error instanceof AuthError) {
            return { error: "Registration successful, but login failed." };
        }
        // Rethrow Next.js redirect errors (success)
        throw error;
    }
}

export async function loginUser(formData: FormData) {
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    console.log("[ACTION] loginUser called for:", email);

    try {
        await signIn("credentials", {
            email,
            password,
            redirectTo: "/dashboard",
        });
        console.log("[ACTION] signIn successful for:", email);
    } catch (error) {
        if (error instanceof AuthError) {
            // Check if it's our custom ban error (nested in cause usually)
            const cause = error.cause?.err?.message || (error.cause as any)?.message;
            if (cause && cause.includes("Account suspended")) {
                return { error: cause };
            }

            switch (error.type) {
                case "CredentialsSignin":
                    return { error: "Invalid credentials" };
                case "CallbackRouteError":
                    // Sometimes the ban error comes through here if thrown in authorize
                    if (error.message.includes("Account suspended")) {
                        return { error: error.message };
                    }
                    // Fallback to trying to read the cause again just in case
                    const deepCause = (error.cause?.err as Error)?.message;
                    if (deepCause && deepCause.includes("Account suspended")) {
                        return { error: deepCause };
                    }
                    return { error: "Authentication failed" };
                default:
                    return { error: "Authentication failed" };
            }
        }
        throw error;
    }
}
