// worker/src/auth.ts
import { generateUUID, hashPassword, comparePassword, jsonResponse, errorResponse, type UserAuthData, type UserDB } from './utils';
import { queryD1 } from './db';
import jwt from '@tsndr/cloudflare-worker-jwt';
import { type JwtPayload } from '@tsndr/cloudflare-worker-jwt'; // Đã sửa tên kiểu

interface Env {
    DB: D1Database;
    JWT_SECRET: string;
}

// Xử lý đăng nhập người dùng
export async function handleLogin(request: Request, env: Env): Promise<Response> {
    try {
        const { email, password } = await (request.json() as Promise<UserAuthData>); // Type assertion

        if (!email || !password) {
            return errorResponse('Email và mật khẩu là bắt buộc', 400);
        }

        const userResult = await queryD1(env, 'SELECT id, email, hashed_password, role FROM users WHERE email = ?', [email]);
        const user: UserDB | undefined = userResult.results[0] as UserDB | undefined; // Type assertion

        if (!user) {
            return errorResponse('Thông tin đăng nhập không hợp lệ', 401);
        }

        // So sánh mật khẩu
        const isPasswordValid = await comparePassword(password, user.hashed_password);

        if (!isPasswordValid) {
            return errorResponse('Thông tin đăng nhập không hợp lệ', 401);
        }

        // Tạo JWT
        const payload: JwtPayload = { userId: user.id, email: user.email, role: user.role };
        // Đã sửa: expiresIn được truyền trực tiếp trong đối tượng tùy chọn thứ ba của jwt.sign
        const token = await jwt.sign(payload, env.JWT_SECRET, { expiresIn: '8h' });

        // Trả về token và vai trò
        return jsonResponse({ message: 'Đăng nhập thành công', token, role: user.role }, 200);

    } catch (error: any) {
        return errorResponse(`Đăng nhập thất bại: ${error.message}`, 500);
    }
}

// Xử lý đăng ký người dùng admin ban đầu (chỉ dùng một lần hoặc trong môi trường dev)
export async function handleRegisterAdmin(request: Request, env: Env): Promise<Response> {
    try {
        const { email, password } = await (request.json() as Promise<UserAuthData>); // Type assertion

        if (!email || !password) {
            return errorResponse('Email và mật khẩu là bắt buộc', 400);
        }

        const existingUser = await queryD1(env, 'SELECT id FROM users WHERE email = ?', [email]);
        if (existingUser.results.length > 0) {
            return errorResponse('Người dùng với email này đã tồn tại', 409);
        }

        const hashedPassword = await hashPassword(password);
        const userId = generateUUID();
        await queryD1(env, 'INSERT INTO users (id, email, hashed_password, role) VALUES (?, ?, ?, ?)', [userId, email, hashedPassword, 'admin']);

        return jsonResponse({ message: 'Người dùng admin đã được đăng ký thành công', userId }, 201);
    } catch (error: any) {
        return errorResponse(`Đăng ký admin thất bại: ${error.message}`, 500);
    }
}
