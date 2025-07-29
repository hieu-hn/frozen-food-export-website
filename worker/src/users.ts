// worker/src/users.ts
import { generateUUID, hashPassword, jsonResponse, errorResponse } from './utils';
import { queryD1 } from './db';

interface Env {
    DB: D1Database;
}

// Lấy tất cả người dùng (chỉ admin mới có quyền)
export async function getUsers(request: Request, env: Env): Promise<Response> {
    try {
        const usersResult = await queryD1(env, 'SELECT id, email, role, created_at, updated_at FROM users');
        return jsonResponse(usersResult.results);
    } catch (error: any) {
        return errorResponse(`Không thể lấy người dùng: ${error.message}`, 500);
    }
}

// Tạo người dùng mới (chỉ admin)
export async function createUser(request: Request, env: Env): Promise<Response> {
    try {
        const { email, password, role } = await request.json();
        if (!email || !password || !role) {
            return errorResponse('Email, mật khẩu và vai trò là bắt buộc', 400);
        }

        const existingUser = await queryD1(env, 'SELECT id FROM users WHERE email = ?', [email]);
        if (existingUser.results.length > 0) {
            return errorResponse('Người dùng với email này đã tồn tại', 409);
        }

        const hashedPassword = await hashPassword(password);
        const userId = generateUUID();
        await queryD1(env, 'INSERT INTO users (id, email, hashed_password, role) VALUES (?, ?, ?, ?)', [userId, email, hashedPassword, role]);

        return jsonResponse({ message: 'Người dùng đã được tạo thành công', userId }, 201);
    } catch (error: any) {
        return errorResponse(`Không thể tạo người dùng: ${error.message}`, 500);
    }
}

// Cập nhật người dùng (chỉ admin)
export async function updateUser(request: Request, env: Env, userId: string): Promise<Response> {
    try {
        const { email, password, role } = await request.json();
        if (!email && !password && !role) {
            return errorResponse('Không có dữ liệu cập nhật được cung cấp', 400);
        }

        const updates: string[] = [];
        const params: any[] = [];

        if (email !== undefined) { updates.push('email = ?'); params.push(email); }
        if (password !== undefined) {
            const hashedPassword = await hashPassword(password);
            updates.push('hashed_password = ?'); params.push(hashedPassword);
        }
        if (role !== undefined) { updates.push('role = ?'); params.push(role); }

        if (updates.length === 0) {
            return errorResponse('Không có trường hợp lệ để cập nhật', 400);
        }

        params.push(userId);
        await queryD1(env, `UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, params);
        return jsonResponse({ message: 'Người dùng đã được cập nhật thành công' }, 200);
    } catch (error: any) {
        return errorResponse(`Không thể cập nhật người dùng: ${error.message}`, 500);
    }
}

// Xóa người dùng (chỉ admin)
export async function deleteUser(request: Request, env: Env, userId: string): Promise<Response> {
    try {
        await queryD1(env, 'DELETE FROM users WHERE id = ?', [userId]);
        return jsonResponse({ message: 'Người dùng đã được xóa thành công' }, 200);
    } catch (error: any) {
        return errorResponse(`Không thể xóa người dùng: ${error.message}`, 500);
    }
}
