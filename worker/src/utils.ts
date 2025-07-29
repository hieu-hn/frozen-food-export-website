// worker/src/utils.ts
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcryptjs';

export function generateUUID(): string {
    return uuidv4();
}

// Hàm hash mật khẩu an toàn
export async function hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
}

// Hàm so sánh mật khẩu
export async function comparePassword(password: string, hashedPassword: string): Promise<boolean> {
    return await bcrypt.compare(password, hashedPassword);
}

// Hàm tạo phản hồi JSON
export function jsonResponse(data: any, status: number = 200, headers: HeadersInit = {}): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            // Cần cấu hình CORS chính xác cho frontend của bạn trong production
            // Ví dụ: 'Access-Control-Allow-Origin': 'https://your-frontend-domain.pages.dev',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            ...headers,
        },
    });
}

// Hàm tạo phản hồi lỗi JSON
export function errorResponse(message: string, status: number = 500): Response {
    return jsonResponse({ error: message }, status);
}

// Interface cho dữ liệu người dùng từ request.json()
export interface UserAuthData {
    email: string;
    password: string;
}

// Interface cho dữ liệu ngôn ngữ từ request.json()
export interface LanguageData {
    code: string;
    name: string;
    is_active?: boolean;
}

// Interface cho dữ liệu người dùng từ D1
export interface UserDB {
    id: string;
    email: string;
    hashed_password: string;
    role: string;
    created_at: string;
    updated_at: string;
}
